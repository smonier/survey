import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useQuery, useApolloClient} from '@apollo/client';
import {Button, Input, Loader, Typography} from '@jahia/moonstone';
import {SURVEY_DETAIL_QUERY, SURVEY_RESPONDENTS_QUERY} from '../../graphql/queries';
import {exportCsv, exportJson} from './exportUtils';
import styles from './Respondents.module.css';

const NS = 'survey-service';
const PAGE_SIZE = 20;

// ─── Format helpers ───────────────────────────────────────────────────────────
const formatDate = iso => {
    if (!iso) {
        return '—';
    }

    return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
};

// ─── Detail panel ─────────────────────────────────────────────────────────────
const DetailPanel = ({respondent, questions, optNames, t, onClose}) => {
    const answerMap = {};
    (respondent.answers?.nodes || []).forEach(a => {
        const qId = a.qId?.value;
        if (qId) {
            answerMap[qId] = a.opts?.values || [];
        }
    });

    return (
        <div className={styles.detailOverlay} onClick={onClose}>
            <div className={styles.detailPanel} onClick={e => e.stopPropagation()}>
                <div className={styles.detailHeader}>
                    <div>
                        <div className={styles.detailEmail}>{respondent.emailProp?.value}</div>
                        <div className={styles.detailDate}>{formatDate(respondent.submittedAtProp?.value)}</div>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose} type="button">✕</button>
                </div>

                <div className={styles.detailBody}>
                    {questions.map(q => {
                        const opts = (answerMap[q.uuid] || []).map(id => optNames[id] || id);
                        return (
                            <div key={q.uuid} className={styles.detailQuestion}>
                                <div className={styles.detailQLabel}>{q.displayName}</div>
                                {opts.length > 0 ? (
                                    <div className={styles.detailAnswers}>
                                        {opts.map((opt, idx) => (
                                            <span key={idx} className={styles.detailAnswer}>→ {opt}</span>
                                        ))}
                                    </div>
                                ) : (
                                    <div className={styles.detailNoAnswer}>
                                        {t(`${NS}:respondents.detail.noAnswer`)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// ─── Respondents ──────────────────────────────────────────────────────────────
const Respondents = ({survey, lang, t}) => {
    const [page, setPage] = useState(0);
    const [search, setSearch] = useState('');
    const [selectedRespondent, setSelectedRespondent] = useState(null);
    const [exporting, setExporting] = useState(false);

    // Apollo imperative client for one-shot export fetches
    const client = useApolloClient();

    const surveyPath = survey?.path;

    // Question structure — fetched once per survey selection
    const {data: detailData} = useQuery(SURVEY_DETAIL_QUERY, {
        variables: {surveyPath: surveyPath || '', lang},
        skip: !surveyPath
    });
    const questions = detailData?.jcr?.nodeByPath?.questions?.nodes || [];

    // Paginated respondents — Apollo re-fetches automatically when variables change.
    // descendant(relPath:"responses") returns null when /responses doesn't exist yet,
    // so no PathNotFoundException for surveys with zero submissions.
    const {data: respondentsData, loading} = useQuery(SURVEY_RESPONDENTS_QUERY, {
        variables: {surveyPath: surveyPath || '', limit: PAGE_SIZE, offset: page * PAGE_SIZE},
        skip: !surveyPath
    });
    const respondents = respondentsData?.jcr?.nodeByPath?.responsesNode?.children?.nodes || [];
    const totalCount = respondentsData?.jcr?.nodeByPath?.responsesNode?.children?.pageInfo?.totalCount || 0;

    // Reset state when survey changes
    useEffect(() => {
        setPage(0);
        setSearch('');
        setSelectedRespondent(null);
    }, [surveyPath]);

    // Build option UUID → display name lookup for the detail panel
    const optNames = useMemo(() => {
        const map = {};
        questions.forEach(q => {
            (q.options?.nodes || []).forEach(opt => {
                map[opt.uuid] = opt.displayName || opt.uuid;
            });
        });
        return map;
    }, [questions]);

    // Client-side email search filter (within the current page)
    const filtered = useMemo(() => {
        if (!search.trim()) {
            return respondents;
        }

        const q = search.toLowerCase();
        return respondents.filter(r => (r.emailProp?.value || '').toLowerCase().includes(q));
    }, [respondents, search]);

    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    // Export: one-shot imperative query bypassing Apollo cache
    const handleExportCsv = useCallback(async () => {
        if (!surveyPath || !questions.length) {
            return;
        }

        setExporting(true);
        try {
            const result = await client.query({
                query: SURVEY_RESPONDENTS_QUERY,
                variables: {surveyPath, limit: 9999, offset: 0},
                fetchPolicy: 'network-only'
            });
            const all = result.data?.jcr?.nodeByPath?.responsesNode?.children?.nodes || [];
            exportCsv(survey.displayName || survey.name, questions, all);
        } catch (err) {
            console.error('[survey-service] CSV export failed', err);
        } finally {
            setExporting(false);
        }
    }, [surveyPath, questions, survey, client]);

    const handleExportJson = useCallback(async () => {
        if (!surveyPath || !questions.length) {
            return;
        }

        setExporting(true);
        try {
            const result = await client.query({
                query: SURVEY_RESPONDENTS_QUERY,
                variables: {surveyPath, limit: 9999, offset: 0},
                fetchPolicy: 'network-only'
            });
            const all = result.data?.jcr?.nodeByPath?.responsesNode?.children?.nodes || [];
            exportJson(survey.displayName || survey.name, questions, all);
        } catch (err) {
            console.error('[survey-service] JSON export failed', err);
        } finally {
            setExporting(false);
        }
    }, [surveyPath, questions, survey, client]);

    if (!survey) {
        return (
            <div className={styles.empty}>
                <Typography>{t(`${NS}:respondents.selectSurvey`)}</Typography>
            </div>
        );
    }

    return (
        <div className={styles.root}>
            {/* ── Toolbar ── */}
            <div className={styles.toolbar}>
                <div className={styles.toolbarLeft}>
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={t(`${NS}:respondents.search`)}
                        className={styles.searchInput}
                    />
                    <span className={styles.countLabel}>{totalCount} respondents</span>
                </div>
                <div className={styles.toolbarRight}>
                    <Button
                        label={exporting ? '…' : t(`${NS}:respondents.exportCsv`)}
                        onClick={handleExportCsv}
                        variant="outlined"
                        size="default"
                        isDisabled={exporting || totalCount === 0}
                    />
                    <Button
                        label={exporting ? '…' : t(`${NS}:respondents.exportJson`)}
                        onClick={handleExportJson}
                        variant="outlined"
                        size="default"
                        isDisabled={exporting || totalCount === 0}
                    />
                </div>
            </div>

            {/* ── Table ── */}
            {loading ? (
                <div className={styles.center}><Loader/></div>
            ) : filtered.length === 0 ? (
                <div className={styles.empty}>
                    <Typography>
                        {totalCount === 0
                            ? t(`${NS}:overview.noResponses`)
                            : t(`${NS}:respondents.noResults`)}
                    </Typography>
                </div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th className={styles.th}>{t(`${NS}:respondents.email`)}</th>
                                <th className={styles.th}>{t(`${NS}:respondents.date`)}</th>
                                <th className={styles.th}>{t(`${NS}:respondents.status`)}</th>
                                <th className={styles.th}>{t(`${NS}:respondents.answers`)}</th>
                                <th className={styles.th}/>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(r => {
                                const ansCount = (r.answers?.nodes || []).filter(
                                    a => (a.opts?.values || []).length > 0
                                ).length;
                                const isComplete = r.completedProp?.value === 'true';
                                return (
                                    <tr
                                        key={r.uuid}
                                        className={styles.row}
                                        onClick={() => setSelectedRespondent(r)}
                                    >
                                        <td className={styles.td}>
                                            <span className={styles.email}>{r.emailProp?.value || '—'}</span>
                                        </td>
                                        <td className={styles.td}>
                                            <span className={styles.date}>
                                                {formatDate(r.submittedAtProp?.value)}
                                            </span>
                                        </td>
                                        <td className={styles.td}>
                                            <span className={`${styles.statusBadge} ${isComplete ? styles.statusDone : styles.statusPartial}`}>
                                                {isComplete ? '✓ ' : '◌ '}{t(`${NS}:respondents.complete`)}
                                            </span>
                                        </td>
                                        <td className={styles.td}>
                                            <span className={styles.ansCount}>
                                                {ansCount}/{questions.length} Qs
                                            </span>
                                        </td>
                                        <td className={styles.tdArrow}>›</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Pagination ── */}
            {totalPages > 1 && (
                <div className={styles.pagination}>
                    <button
                        className={styles.pageBtn}
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        type="button"
                    >
                        ‹
                    </button>
                    {Array.from({length: totalPages}, (_, i) => (
                        <button
                            key={i}
                            className={`${styles.pageBtn} ${i === page ? styles.pageBtnActive : ''}`}
                            onClick={() => setPage(i)}
                            type="button"
                        >
                            {i + 1}
                        </button>
                    ))}
                    <button
                        className={styles.pageBtn}
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page === totalPages - 1}
                        type="button"
                    >
                        ›
                    </button>
                </div>
            )}

            {/* ── Detail slide-in panel ── */}
            {selectedRespondent && (
                <DetailPanel
                    respondent={selectedRespondent}
                    questions={questions}
                    optNames={optNames}
                    t={t}
                    onClose={() => setSelectedRespondent(null)}
                />
            )}
        </div>
    );
};

export default Respondents;
