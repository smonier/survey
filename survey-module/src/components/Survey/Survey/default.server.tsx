import {
  AddResources,
  Island,
  buildModuleFileUrl,
  jahiaComponent,
  useGQLQuery,
  useServerContext,
} from "@jahia/javascript-modules-library";
import { useTranslation } from "react-i18next";
import SurveyForm from "./SurveyForm.client.jsx";
import { QUESTIONS_QUERY, RESULTS_QUERY } from "./queries.js";
import SurveyResultsChart from "./SurveyResults.client.jsx";
import styles from "./component.module.css";
import type { Props, Question, SurveyResults } from "./types.js";

type RawQuestion = {
  uuid: string;
  path: string;
  displayName: string | null;
  textProp: { value: string } | null;
  allowMultipleProp: { values: string[] } | null;
  children: {
    nodes: Array<{
      uuid: string;
      displayName: string | null;
      descProp: { value: string } | null;
    }>;
  };
};

type RawQuestionResponse = {
  questionId: { value: string } | null;
  chosenOptions: { values: string[] } | null;
};

type RawSurveyResponse = {
  children: { nodes: RawQuestionResponse[] };
};

jahiaComponent(
  {
    componentType: "view",
    nodeType: "svy:survey",
    displayName: "Survey",
  },
  ({
    "jcr:title": title = "",
    description = "",
    active,
    timerEnabled,
    startDate,
    endDate,
  }: Props) => {
    const { t } = useTranslation();
    const { currentNode, currentResource } = useServerContext();
    const lang = currentResource.getLocale().getLanguage();
    const surveyPath = currentNode.getPath();
    const responsesPath = `${surveyPath}/responses`;
    const now = Date.now();

    const isActive = active === true || active === "true";
    const hasTimer = timerEnabled === true || timerEnabled === "true";
    const start = startDate ? new Date(startDate).getTime() : null;
    const end = endDate ? new Date(endDate).getTime() : null;

    const isClosed =
      !isActive ||
      (hasTimer && start !== null && now < start) ||
      (hasTimer && end !== null && now > end);
    const isNotStarted = hasTimer && start !== null && now < start;

    // Both queries run unconditionally — hooks cannot be conditional
    const { data: questionsData } = useGQLQuery({
      query: QUESTIONS_QUERY,
      variables: { path: surveyPath, language: lang },
    });
    const { data: resultsData } = useGQLQuery({
      query: RESULTS_QUERY,
      variables: { responsesPath },
    });

    const rawQuestions: RawQuestion[] = questionsData?.jcr?.nodeByPath?.children?.nodes ?? [];

    // Use UUID (not path) as the stable question identifier.
    // q.path varies depending on whether the survey is accessed via a content reference
    // (render path: "/site/.../main/crm-day@/crm-day/question") or directly (content path:
    // "/site/.../contents/Survey/crm-day/question"). UUID is always the same JCR identifier
    // regardless of access method, so it is the correct stable key for results matching.
    const questions: Question[] = rawQuestions.map((q) => ({
      id: q.uuid,
      text: q.displayName ?? "",
      description: q.textProp?.value ?? "",
      allowMultiple: (q.allowMultipleProp?.values?.[0] ?? "") === "true",
      options: q.children.nodes.map((opt) => ({
        id: opt.uuid,
        text: opt.displayName ?? "",
        description: opt.descProp?.value ?? "",
      })),
    }));

    // Compute vote counts from stored responses
    const results: SurveyResults = {};

    const responseNodes: RawSurveyResponse[] = resultsData?.jcr?.nodeByPath?.children?.nodes ?? [];

    for (const resp of responseNodes) {
      for (const qResp of resp.children?.nodes ?? []) {
        const qId = qResp.questionId?.value ?? "";
        const chosen: string[] = qResp.chosenOptions?.values ?? [];
        if (!results[qId]) results[qId] = {};
        for (const opt of chosen) {
          results[qId][opt] = (results[qId][opt] ?? 0) + 1;
        }
      }
    }

    // Count only responses that actually contain at least one answer —
    // pageInfo.totalCount includes empty/broken nodes from before any data-fix
    // and inflates the denominator used in results display.
    const totalResponses = responseNodes.filter(
      (resp) =>
        resp.children?.nodes?.some(
          (qr) => (qr.chosenOptions?.values ?? []).length > 0
        ) ?? false
    ).length;

    return (
      <>
        <AddResources type="css" resources={buildModuleFileUrl("dist/assets/style.css")} key="survey-module-css" />
        <section className={styles.survey}>
          <h2 className={styles.title}>{title}</h2>
          {description && (
            <div className={styles.description} dangerouslySetInnerHTML={{ __html: description }} />
          )}

          {isNotStarted && startDate && (
            <p className={styles.notice}>
              {t("survey.timer-starts", { date: new Date(startDate).toLocaleDateString(lang) })}
            </p>
          )}

          {isClosed && !isNotStarted && (
            <Island
              component={SurveyResultsChart}
              props={{ questions, results, totalResponses, lang }}
              clientOnly
            >
              <p>{t("survey.loading-results")}</p>
            </Island>
          )}

          {!isClosed && questions.length > 0 && (
            <Island
              component={SurveyForm}
              props={{
                surveyPath,
                questions,
                endDate: end ? new Date(end).toISOString() : null,
              }}
            />
          )}
        </section>
      </>
    );
  },
);
