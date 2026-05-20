import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { SurveyFormProps } from "./types.js";
import { SUBMIT_MUTATION } from "./queries.js";
import "./survey.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function storageKey(surveyPath: string) {
  return `svy_submitted_${surveyPath}`;
}

type WizardPage = "email" | "question";
type Status = "idle" | "submitting" | "done" | "duplicate" | "error";

export default function SurveyForm({ surveyPath, questions, endDate }: SurveyFormProps) {
  const { t } = useTranslation();

  // Wizard state
  const [page, setPage] = useState<WizardPage>("email");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const animKey = useRef(0);

  // Form state
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  useEffect(() => {
    setAlreadySubmitted(!!localStorage.getItem(storageKey(surveyPath)));
  }, [surveyPath]);

  useEffect(() => {
    if (!endDate) return;
    const update = () => {
      const diff = new Date(endDate).getTime() - Date.now();
      if (diff <= 0) { window.location.reload(); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setTimeLeft(`${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endDate]);

  // Progress calculation
  // total = 1 (email) + N (questions)
  const totalSteps = 1 + questions.length;
  const currentStep = page === "email" ? 1 : questionIndex + 2;
  const progressPct = Math.round((currentStep / totalSteps) * 100);

  function navigate(dir: "forward" | "back") {
    setDirection(dir);
    animKey.current += 1;
  }

  function goBack() {
    if (status === "submitting") return;
    if (page === "email") return;
    navigate("back");
    if (questionIndex === 0) {
      setPage("email");
    } else {
      setQuestionIndex((i) => i - 1);
    }
  }

  function goForward() {
    if (status === "submitting") return;

    if (page === "email") {
      if (!EMAIL_RE.test(email)) {
        setEmailError(t("survey.email-invalid"));
        return;
      }
      setEmailError("");
      navigate("forward");
      setPage("question");
      setQuestionIndex(0);
      return;
    }

    // question page — require at least one selection
    const currentId = questions[questionIndex]?.id ?? "";
    if ((selections[currentId] ?? []).length === 0) {
      setSelectionError(t("survey.selection-required"));
      return;
    }
    setSelectionError("");

    const isLast = questionIndex === questions.length - 1;
    if (!isLast) {
      navigate("forward");
      setQuestionIndex((i) => i + 1);
    } else {
      void handleSubmit();
    }
  }

  function toggleOption(questionId: string, optionId: string, allowMultiple: boolean) {
    setSelectionError("");
    setSelections((prev) => {
      const current = prev[questionId] ?? [];
      if (allowMultiple) {
        return {
          ...prev,
          [questionId]: current.includes(optionId)
            ? current.filter((o) => o !== optionId)
            : [...current, optionId],
        };
      }
      return { ...prev, [questionId]: [optionId] };
    });
  }

  async function handleSubmit() {
    setStatus("submitting");
    // Flat structure: one entry per selected option (graphql-java-annotations
    // cannot deserialize List<String> input fields due to type erasure — we use
    // only simple String fields and group server-side by questionPath).
    const answers = questions.flatMap((q) =>
      (selections[q.id] ?? []).map((optId) => ({
        questionPath: q.id,
        optionId: optId,
      }))
    );

    try {
      const res = await fetch("/modules/graphql", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          query: SUBMIT_MUTATION,
          variables: { surveyPath, email, answers },
        }),
      });

      const json = (await res.json()) as {
        data?: { survey?: { submitResponse?: { success: boolean; code: string } } };
        errors?: { message: string }[];
      };

      if (json.errors?.length) { setStatus("error"); return; }

      const payload = json.data?.survey?.submitResponse;
      if (!payload) { setStatus("error"); return; }
      if (payload.code === "DUPLICATE_EMAIL") { setStatus("duplicate"); return; }

      if (payload.success) {
        localStorage.setItem(storageKey(surveyPath), email);
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  // ── Terminal states ─────────────────────────────────────────────────────────

  if (alreadySubmitted && status === "idle") {
    return (
      <div className="survey-notice survey-notice--success">
        <div className="survey-notice__check" aria-hidden="true" />
        <p className="survey-notice__title">{t("survey.already-submitted")}</p>
        <p className="survey-notice__hint">{t("survey.results-hint")}</p>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="survey-notice survey-notice--success">
        <div className="survey-notice__check" aria-hidden="true" />
        <p className="survey-notice__title">{t("survey.thank-you")}</p>
        <p className="survey-notice__hint">{t("survey.results-hint")}</p>
      </div>
    );
  }

  if (status === "duplicate") {
    return (
      <div className="survey-notice survey-notice--warning">
        <p className="survey-notice__title">{t("survey.duplicate-email")}</p>
      </div>
    );
  }

  // ── Wizard ──────────────────────────────────────────────────────────────────

  const isLastQuestion = page === "question" && questionIndex === questions.length - 1;
  const isSubmitting = status === "submitting";
  const currentQuestion = page === "question" ? questions[questionIndex] : null;
  const canGoBack = page !== "email";

  return (
    <div className="survey-wizard">

      {/* Top progress bar */}
      <div className="survey-wizard__progress" role="progressbar"
        aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}
        aria-label={t("survey.step-of", { current: currentStep, total: totalSteps })}>
        <div className="survey-wizard__progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Step counter */}
      <div className="survey-wizard__meta">
        <span className="survey-wizard__step-label">
          {t("survey.step-of", { current: currentStep, total: totalSteps })}
        </span>
        {timeLeft && (
          <span className="survey-timer">
            <span className="survey-timer__label">{t("survey.timer-closes-in")}</span>
            <span className="survey-timer__value">{timeLeft}</span>
          </span>
        )}
      </div>

      {/* Animated step body */}
      <div
        className={`survey-wizard__body survey-wizard__body--${direction}`}
        key={animKey.current}
      >
        {/* ── Page 0: Email ── */}
        {page === "email" && (
          <div className="survey-step">
            <p className="survey-step__eyebrow">{t("survey.step-start")}</p>
            <h3 className="survey-step__question">{t("survey.email-label")}</h3>
            <p className="survey-step__hint">{t("survey.email-hint")}</p>

            <div className="survey-field">
              <input
                id="svy-email"
                type="email"
                autoComplete="email"
                autoFocus
                className={`survey-field__input${emailError ? " survey-field__input--error" : ""}`}
                placeholder={t("survey.email-placeholder")}
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") goForward(); }}
                aria-describedby={emailError ? "svy-email-error" : undefined}
              />
              {emailError && (
                <p id="svy-email-error" className="survey-field__error" role="alert">
                  {emailError}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Pages 1-N: Questions ── */}
        {page === "question" && currentQuestion && (
          <div className="survey-step">
            <p className="survey-step__eyebrow">
              {t("survey.question-of", {
                current: questionIndex + 1,
                total: questions.length,
              })}
            </p>
            <h3 className="survey-step__question">{currentQuestion.text}</h3>
            {currentQuestion.description && (
              <p className="survey-step__hint">{currentQuestion.description}</p>
            )}
            {currentQuestion.allowMultiple && (
              <p className="survey-step__multi-hint">{t("survey.select-all-hint")}</p>
            )}

            <div
              className={`survey-options${currentQuestion.allowMultiple ? " survey-options--multi" : ""}`}
              role="group"
              aria-label={currentQuestion.text}
            >
              {currentQuestion.options.map((opt) => {
                const checked = (selections[currentQuestion.id] ?? []).includes(opt.id);
                const inputType = currentQuestion.allowMultiple ? "checkbox" : "radio";
                const inputId = `svy-opt-${opt.id}`;
                return (
                  <label
                    key={opt.id}
                    htmlFor={inputId}
                    className={`survey-option${checked ? " survey-option--selected" : ""}`}
                  >
                    <input
                      id={inputId}
                      type={inputType}
                      name={`q-${currentQuestion.id}`}
                      value={opt.id}
                      checked={checked}
                      onChange={() => toggleOption(currentQuestion.id, opt.id, currentQuestion.allowMultiple)}
                      className="survey-option__input"
                    />
                    <span className="survey-option__indicator" aria-hidden="true" />
                    <span className="survey-option__body">
                      <span className="survey-option__text">{opt.text}</span>
                      {opt.description && (
                        <span className="survey-option__description">{opt.description}</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            {selectionError && (
              <p className="survey-field__error" role="alert">{selectionError}</p>
            )}
          </div>
        )}
      </div>

      {/* Navigation footer */}
      <div className="survey-wizard__nav">
        <button
          type="button"
          className="survey-btn survey-btn--ghost"
          onClick={goBack}
          disabled={!canGoBack || isSubmitting}
          aria-label={t("survey.back")}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {t("survey.back")}
        </button>

        <div className="survey-wizard__nav-right">
          {status === "error" && (
            <p className="survey-wizard__error" role="alert">{t("survey.error-submit")}</p>
          )}
          <button
            type="button"
            className="survey-btn survey-btn--primary"
            onClick={goForward}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? t("survey.loading")
              : isLastQuestion
                ? t("survey.submit")
                : t("survey.next")}
            {!isSubmitting && !isLastQuestion && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}
