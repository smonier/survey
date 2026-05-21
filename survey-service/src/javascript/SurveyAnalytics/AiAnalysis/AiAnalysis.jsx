import React, {useState, useEffect, useRef} from 'react';
import {useQuery, useApolloClient} from '@apollo/client';
import {Button, Typography} from '@jahia/moonstone';
import {PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend} from 'recharts';
import {SURVEY_DETAIL_QUERY, SURVEY_RESULTS_QUERY, SURVEY_ANALYSIS_QUERY} from '../../graphql/queries';
import {openPrintWindow} from './printUtils';
import {cssColor} from '../../utils/cssVars';
import styles from './AiAnalysis.module.css';

const NS = 'survey-service';

// ── Colour tokens ──────────────────────────────────────────────────────────────
const PRIORITY_CLASS = {high: styles.tagHigh, medium: styles.tagMedium, low: styles.tagLow};
const TIMELINE_CLASS = {
    immediate: styles.tagHigh,
    'this-week': styles.tagMedium,
    'this-month': styles.tagLow
};

// Resolve Moonstone tokens to actual colour strings for Recharts SVG props
const SEGMENT_COLORS = [
    cssColor('var(--color-accent)',      '#2c5ee8'),
    cssColor('var(--color-accent_dark)', '#4f46e5'),
    '#06b6d4', '#10b981', '#f59e0b', '#f43f5e'
];
const TOOLTIP_BORDER = cssColor('var(--color-accent20)', '#e1e7f5');

// ── Small reusable bits ────────────────────────────────────────────────────────
const Tag = ({label, className}) => (
    <span className={`${styles.tag} ${className || ''}`}>{label}</span>
);

const SectionHeader = ({title, subtitle}) => (
    <div className={styles.sectionHeader}>
        <Typography variant="subheading" className={styles.sectionTitle}>{title}</Typography>
        {subtitle && <span className={styles.sectionSubtitle}>{subtitle}</span>}
    </div>
);

// ── Progress steps during generation ──────────────────────────────────────────
const STEPS = ['loadingData', 'loadingResponses', 'callingAI'];

const ProgressCard = ({step, t}) => (
    <div className={styles.progressCard}>
        <div className={styles.spinner}/>
        <Typography variant="heading" className={styles.progressTitle}>
            {t(`${NS}:aiAnalysis.analyzing`)}
        </Typography>
        <div className={styles.stepList}>
            {STEPS.map((s, i) => {
                const idx = STEPS.indexOf(step);
                const done = i < idx;
                const active = i === idx;
                return (
                    <div
                        key={s}
                        className={`${styles.step} ${done ? styles.stepDone : ''} ${active ? styles.stepActive : ''}`}
                    >
                        <span className={styles.stepDot}/>
                        <span>{t(`${NS}:aiAnalysis.steps.${s}`)}</span>
                    </div>
                );
            })}
        </div>
        <p className={styles.progressNote}>{t(`${NS}:aiAnalysis.patience`)}</p>
    </div>
);

// ── Section: Executive Summary ─────────────────────────────────────────────────
const ExecutiveSummary = ({text, t}) => (
    <div className={styles.execSummary}>
        <SectionHeader title={t(`${NS}:aiAnalysis.sections.executiveSummary`)}/>
        <p className={styles.execText}>{text}</p>
    </div>
);

// ── Section: Key Findings ──────────────────────────────────────────────────────
const KeyFindings = ({findings, t}) => (
    <div className={styles.section}>
        <SectionHeader
            title={t(`${NS}:aiAnalysis.sections.keyFindings`)}
            subtitle={`${findings.length} ${t(`${NS}:aiAnalysis.findingsCount`)}`}
        />
        <div className={styles.findingsGrid}>
            {findings.map((f, i) => (
                <div key={i} className={styles.findingCard}>
                    <div className={styles.findingTop}>
                        <span className={styles.findingTitle}>{f.title}</span>
                        <Tag
                            label={t(`${NS}:aiAnalysis.significance.${f.significance}`)}
                            className={PRIORITY_CLASS[f.significance]}
                        />
                    </div>
                    <p className={styles.findingInsight}>{f.insight}</p>
                </div>
            ))}
        </div>
    </div>
);

// ── Section: Audience Segments ─────────────────────────────────────────────────
const AudienceSegments = ({segments, t}) => {
    const pieData = segments
        .filter(s => s.percentEstimate > 0)
        .map((s, i) => ({name: s.name, value: s.percentEstimate, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length]}));

    return (
        <div className={styles.section}>
            <SectionHeader
                title={t(`${NS}:aiAnalysis.sections.audienceSegments`)}
                subtitle={`${segments.length} ${t(`${NS}:aiAnalysis.segmentsCount`)}`}
            />
            <div className={styles.segmentsLayout}>
                {pieData.length > 1 && (
                    <div className={styles.pieWrapper}>
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={90}
                                    paddingAngle={3}
                                    dataKey="value"
                                >
                                    {pieData.map((entry, i) => (
                                        <Cell key={i} fill={entry.color}/>
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(v) => [`${v}%`, '']}
                                    contentStyle={{borderRadius: 8, border: `1px solid ${TOOLTIP_BORDER}`, fontSize: 12}}
                                />
                                <Legend
                                    formatter={(v) => <span style={{fontSize: 12}}>{v}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
                <div className={styles.segmentsList}>
                    {segments.map((s, i) => (
                        <div key={i} className={styles.segmentCard}>
                            <div className={styles.segmentHeader}>
                                <span
                                    className={styles.segmentDot}
                                    style={{background: SEGMENT_COLORS[i % SEGMENT_COLORS.length]}}
                                />
                                <span className={styles.segmentName}>{s.name}</span>
                                <span className={styles.segmentPct}>{s.percentEstimate}%</span>
                            </div>
                            <div
                                className={styles.segmentBar}
                                style={{width: `${Math.min(s.percentEstimate, 100)}%`, background: SEGMENT_COLORS[i % SEGMENT_COLORS.length]}}
                            />
                            <p className={styles.segmentDesc}>{s.description}</p>
                            {s.approach && (
                                <p className={styles.segmentApproach}>
                                    <strong>{t(`${NS}:aiAnalysis.approach`)}: </strong>{s.approach}
                                </p>
                            )}
                            {(s.characteristics || []).length > 0 && (
                                <div className={styles.tagRow}>
                                    {s.characteristics.map((c, j) => (
                                        <Tag key={j} label={c} className={styles.tagNeutral}/>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ── Section: Opportunities ─────────────────────────────────────────────────────
const Opportunities = ({items, t}) => (
    <div className={styles.section}>
        <SectionHeader title={t(`${NS}:aiAnalysis.sections.opportunities`)}/>
        <div className={styles.oppList}>
            {items.map((op, i) => (
                <div key={i} className={`${styles.oppCard} ${PRIORITY_CLASS[op.priority] ? styles[`oppBorder_${op.priority}`] : ''}`}>
                    <div className={styles.oppTop}>
                        <span className={styles.oppTitle}>{op.title}</span>
                        <Tag
                            label={t(`${NS}:aiAnalysis.priority.${op.priority}`)}
                            className={PRIORITY_CLASS[op.priority]}
                        />
                    </div>
                    <p className={styles.oppDesc}>{op.description}</p>
                    {op.action && (
                        <div className={styles.oppAction}>
                            <span className={styles.oppActionIcon}>→</span>
                            <span>{op.action}</span>
                        </div>
                    )}
                </div>
            ))}
        </div>
    </div>
);

// ── Section: Risk Flags ────────────────────────────────────────────────────────
const RiskFlags = ({flags, t}) => (
    <div className={styles.section}>
        <SectionHeader title={t(`${NS}:aiAnalysis.sections.riskFlags`)}/>
        <div className={styles.risksGrid}>
            {flags.map((r, i) => (
                <div key={i} className={styles.riskCard}>
                    <div className={styles.riskFlag}>⚠ {r.flag}</div>
                    <p className={styles.riskDesc}>{r.description}</p>
                    {r.mitigation && (
                        <div className={styles.riskMitigation}>
                            <strong>{t(`${NS}:aiAnalysis.mitigation`)}: </strong>{r.mitigation}
                        </div>
                    )}
                </div>
            ))}
        </div>
    </div>
);

// ── Section: Talking Points ────────────────────────────────────────────────────
const TalkingPoints = ({points, t}) => {
    const [open, setOpen] = useState(null);

    return (
        <div className={styles.section}>
            <SectionHeader title={t(`${NS}:aiAnalysis.sections.talkingPoints`)}/>
            <div className={styles.talkingList}>
                {points.map((tp, i) => (
                    <div key={i} className={styles.talkingCard}>
                        <button
                            type="button"
                            className={styles.talkingHeader}
                            onClick={() => setOpen(open === i ? null : i)}
                        >
                            <span className={styles.personaBadge}>
                                {tp.persona?.charAt(0)?.toUpperCase()}
                            </span>
                            <span className={styles.personaName}>{tp.persona}</span>
                            <span className={styles.talkingChevron}>{open === i ? '▲' : '▼'}</span>
                        </button>

                        {open === i && (
                            <div className={styles.talkingBody}>
                                {(tp.points || []).length > 0 && (
                                    <div className={styles.talkingPoints}>
                                        <p className={styles.talkingSubLabel}>{t(`${NS}:aiAnalysis.keyPoints`)}</p>
                                        <ul className={styles.pointsList}>
                                            {tp.points.map((pt, j) => <li key={j}>{pt}</li>)}
                                        </ul>
                                    </div>
                                )}
                                {(tp.objectionHandlers || []).length > 0 && (
                                    <div className={styles.objections}>
                                        <p className={styles.talkingSubLabel}>{t(`${NS}:aiAnalysis.objectionHandlers`)}</p>
                                        {tp.objectionHandlers.map((oh, j) => (
                                            <div key={j} className={styles.objection}>
                                                <div className={styles.objQ}>Q: {oh.objection}</div>
                                                <div className={styles.objA}>A: {oh.response}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── Section: Next Actions ──────────────────────────────────────────────────────
const NextActions = ({actions, t}) => (
    <div className={styles.section}>
        <SectionHeader title={t(`${NS}:aiAnalysis.sections.nextActions`)}/>
        <div className={styles.actionsList}>
            {actions.map((a, i) => (
                <div key={i} className={styles.actionRow}>
                    <div className={styles.actionNumber}>{i + 1}</div>
                    <div className={styles.actionContent}>
                        <div className={styles.actionTop}>
                            <span className={styles.actionText}>{a.action}</span>
                            <div className={styles.actionTags}>
                                <Tag
                                    label={t(`${NS}:aiAnalysis.timeline.${a.timeline?.replace('-', '_')}`)}
                                    className={TIMELINE_CLASS[a.timeline] || styles.tagNeutral}
                                />
                                {a.owner && (
                                    <Tag label={a.owner} className={styles.tagNeutral}/>
                                )}
                            </div>
                        </div>
                        {a.rationale && (
                            <p className={styles.actionRationale}>{a.rationale}</p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    </div>
);

// ── Main AiAnalysis component ──────────────────────────────────────────────────
const AiAnalysis = ({survey, lang, t}) => {
    // ── State ─────────────────────────────────────────────────────────────────
    // Currently displayed analysis (from JCR recall or fresh run)
    const [displayedAnalysis, setDisplayedAnalysis] = useState(null);
    const [displayedAt, setDisplayedAt]             = useState(null);
    const [displayedTitle, setDisplayedTitle]       = useState(null);

    // Fresh-run flow
    const [isRunning, setIsRunning]   = useState(false);
    const [runStep, setRunStep]       = useState('loadingData');
    const [runError, setRunError]     = useState('');

    // Auto-save indicator
    const [isSaving, setIsSaving] = useState(false);

    const client     = useApolloClient();
    const surveyPath = survey?.path;

    // Tracks which surveyPath's JCR result has been applied (prevents double-apply)
    const jcrLoadedForPathRef = useRef(null);

    // ── Load stored analysis from JCR EDIT workspace ──────────────────────────
    const {data: storedData, loading: storedLoading} = useQuery(SURVEY_ANALYSIS_QUERY, {
        variables:   {surveyPath: surveyPath || ''},
        skip:        !surveyPath,
        fetchPolicy: 'network-only'
    });

    // Reset displayed state whenever the selected survey changes
    useEffect(() => {
        setDisplayedAnalysis(null);
        setDisplayedAt(null);
        setDisplayedTitle(null);
        setIsRunning(false);
        setRunError('');
        // Also reset the JCR-load guard so switching back to this survey
        // re-applies the recall data (the ref tracks "last loaded path", not
        // "have we ever loaded this path").
        jcrLoadedForPathRef.current = null;
    }, [surveyPath]);

    // Populate from JCR once per survey path (after query completes)
    useEffect(() => {
        if (storedLoading) return;
        if (jcrLoadedForPathRef.current === surveyPath) return;
        jcrLoadedForPathRef.current = surveyPath;

        const node = storedData?.jcr?.nodeByPath?.aiAnalysis;
        if (node?.analysisJson?.value) {
            try {
                setDisplayedAnalysis(JSON.parse(node.analysisJson.value));
                setDisplayedAt(node.generatedAt?.value || null);
                setDisplayedTitle(node.surveyTitle?.value || survey?.displayName || survey?.name || '');
            } catch {
                // Malformed JSON stored — ignore, fall through to trigger card
            }
        }
    }, [storedData, storedLoading, surveyPath, survey]);

    // ── URL builder ───────────────────────────────────────────────────────────
    const buildActionUrl = actionName => {
        const ctx    = window?.contextJsParameters?.contextPath || '';
        const uiLang = lang || window?.contextJsParameters?.uilang || 'en';
        return `${ctx}/cms/render/default/${uiLang}${encodeURI(surveyPath || '')}.${actionName}.do`;
    };

    // ── Persist analysis to JCR (fire-and-forget) ─────────────────────────────
    const saveToJcr = async (analysisObj, title, ts) => {
        setIsSaving(true);
        try {
            await fetch(buildActionUrl('saveAnalysisAction'), {
                method: 'POST',
                headers: {
                    'Content-Type':     'application/json',
                    Accept:             'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    analysisJson: JSON.stringify(analysisObj),
                    surveyTitle:  title,
                    generatedAt:  ts
                })
            });
        } catch (e) {
            console.warn('AiAnalysis: JCR save failed', e);
        } finally {
            setIsSaving(false);
        }
    };

    // ── Run a fresh analysis ───────────────────────────────────────────────────
    const runAnalysis = async () => {
        setIsRunning(true);
        setRunStep('loadingData');
        setRunError('');

        try {
            // Step 1 — question structure
            const detailResult = await client.query({
                query:       SURVEY_DETAIL_QUERY,
                variables:   {surveyPath, lang},
                fetchPolicy: 'network-only'
            });

            // Step 2 — response votes (descendant returns null if no /responses yet)
            setRunStep('loadingResponses');
            const resultsResult = await client.query({
                query:       SURVEY_RESULTS_QUERY,
                variables:   {surveyPath},
                fetchPolicy: 'network-only'
            });

            const questions = detailResult.data?.jcr?.nodeByPath?.questions?.nodes || [];
            const responses = resultsResult.data?.jcr?.nodeByPath?.responsesNode?.children?.nodes || [];

            // Aggregate votes per question / option (same pattern as Results.jsx)
            const voteCounts = {};
            responses.forEach(resp => {
                (resp.children?.nodes || []).forEach(qr => {
                    const qId  = qr.questionId?.value;
                    const opts = qr.chosenOptions?.values || [];
                    if (!qId) return;
                    if (!voteCounts[qId]) voteCounts[qId] = {};
                    opts.forEach(opt => {
                        voteCounts[qId][opt] = (voteCounts[qId][opt] || 0) + 1;
                    });
                });
            });

            const totalResponses = responses.filter(
                r => (r.children?.nodes || []).some(qr => (qr.chosenOptions?.values || []).length > 0)
            ).length;

            if (totalResponses === 0) {
                setRunError(t(`${NS}:aiAnalysis.noData`));
                setIsRunning(false);
                return;
            }

            const payload = {
                surveyTitle:    survey.displayName || survey.name,
                totalResponses,
                // Pass the editor's UI language so DeepSeek generates the
                // report in the back-office user's language (fr, en, de…).
                lang: lang || window?.contextJsParameters?.uilang || 'en',
                questions: questions.map(q => ({
                    label:         q.displayName || q.name,
                    allowMultiple: q.allowMultiple?.value === 'true',
                    options: (q.options?.nodes || []).map(opt => ({
                        label: opt.displayName || opt.name,
                        votes: voteCounts[q.uuid]?.[opt.uuid] || 0
                    }))
                }))
            };

            // Step 3 — DeepSeek via Java action
            setRunStep('callingAI');
            const res     = await fetch(buildActionUrl('surveyAnalysisAction'), {
                method: 'POST',
                headers: {
                    'Content-Type':     'application/json',
                    Accept:             'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });

            const rawBody = await res.text();
            let data;
            try {
                data = JSON.parse(rawBody);
            } catch {
                const preview = (rawBody || '').trim().slice(0, 220).replace(/\s+/g, ' ');
                throw new Error(`Invalid JSON response (HTTP ${res.status}). ${preview}`);
            }

            if (!data.success) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }

            // Show result immediately, then persist in background
            const ts    = new Date().toISOString();
            const title = survey.displayName || survey.name;
            setDisplayedAnalysis(data.analysis);
            setDisplayedAt(ts);
            setDisplayedTitle(title);
            setIsRunning(false);
            saveToJcr(data.analysis, title, ts);

        } catch (e) {
            setRunError(e.message);
            setIsRunning(false);
        }
    };

    // Re-run: clear current display then run fresh
    const handleRerun = () => {
        setDisplayedAnalysis(null);
        setDisplayedAt(null);
        setDisplayedTitle(null);
        setRunError('');
        runAnalysis();
    };

    const formatDate = iso => {
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleString(lang || 'en', {dateStyle: 'medium', timeStyle: 'short'});
        } catch {
            return iso;
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────────

    // No survey selected
    if (!survey) {
        return (
            <div className={styles.empty}>
                <div className={styles.emptyIcon}>🧠</div>
                <Typography variant="heading" className={styles.emptyTitle}>
                    {t(`${NS}:aiAnalysis.emptyTitle`)}
                </Typography>
                <p className={styles.emptyDesc}>{t(`${NS}:aiAnalysis.emptyDesc`)}</p>
            </div>
        );
    }

    // Initial JCR check in progress
    if (storedLoading && !isRunning && !displayedAnalysis) {
        return (
            <div className={styles.checkingCard}>
                <div className={styles.spinner}/>
                <p className={styles.checkingText}>{t(`${NS}:aiAnalysis.checking`)}</p>
            </div>
        );
    }

    // Fresh analysis in progress
    if (isRunning) {
        return <ProgressCard step={runStep} t={t}/>;
    }

    // Error (no stored analysis to fall back on)
    if (runError && !displayedAnalysis) {
        return (
            <div className={styles.errorCard}>
                <p className={styles.errorMsg}>{runError}</p>
                <Button variant="default" label={t(`${NS}:aiAnalysis.retry`)} onClick={runAnalysis}/>
            </div>
        );
    }

    // Report — from JCR recall or fresh run
    if (displayedAnalysis) {
        const a = displayedAnalysis;
        return (
            <div className={styles.report}>
                {/* Report header */}
                <div className={styles.reportHeader}>
                    <div className={styles.reportTitleBlock}>
                        <Typography variant="heading" className={styles.reportTitle}>
                            {t(`${NS}:aiAnalysis.reportTitle`)}
                        </Typography>
                        <p className={styles.reportSurvey}>
                            {displayedTitle || survey.displayName || survey.name}
                        </p>
                    </div>
                    <div className={styles.reportActions}>
                        {displayedAt && (
                            <span className={styles.reportDateBadge}>
                                {t(`${NS}:aiAnalysis.storedAt`)} {formatDate(displayedAt)}
                            </span>
                        )}
                        {isSaving && (
                            <span className={styles.savingBadge}>{t(`${NS}:aiAnalysis.saving`)}</span>
                        )}
                        <Button
                            variant="default"
                            size="default"
                            label={t(`${NS}:aiAnalysis.downloadPdf`)}
                            onClick={() => openPrintWindow(
                                a,
                                displayedTitle || survey.displayName || survey.name,
                                displayedAt
                            )}
                        />
                        <Button
                            variant="outlined"
                            size="default"
                            label={t(`${NS}:aiAnalysis.rerun`)}
                            onClick={handleRerun}
                        />
                    </div>
                </div>

                {a.executiveSummary && <ExecutiveSummary text={a.executiveSummary} t={t}/>}
                {(a.keyFindings     || []).length > 0 && <KeyFindings findings={a.keyFindings} t={t}/>}
                {(a.audienceSegments|| []).length > 0 && <AudienceSegments segments={a.audienceSegments} t={t}/>}
                {(a.opportunities   || []).length > 0 && <Opportunities items={a.opportunities} t={t}/>}
                {(a.riskFlags       || []).length > 0 && <RiskFlags flags={a.riskFlags} t={t}/>}
                {(a.talkingPoints   || []).length > 0 && <TalkingPoints points={a.talkingPoints} t={t}/>}
                {(a.nextActions     || []).length > 0 && <NextActions actions={a.nextActions} t={t}/>}
            </div>
        );
    }

    // Trigger card — survey selected but no stored analysis and not running
    return (
        <div className={styles.triggerCard}>
            <div className={styles.triggerIcon}>✦</div>
            <Typography variant="heading" className={styles.triggerTitle}>
                {t(`${NS}:aiAnalysis.triggerTitle`)}
            </Typography>
            <p className={styles.triggerDesc}>{t(`${NS}:aiAnalysis.triggerDesc`)}</p>
            <div className={styles.surveyPill}>{survey.displayName || survey.name}</div>
            <Button variant="default" size="big" label={t(`${NS}:aiAnalysis.runBtn`)} onClick={runAnalysis}/>
        </div>
    );
};

export default AiAnalysis;
