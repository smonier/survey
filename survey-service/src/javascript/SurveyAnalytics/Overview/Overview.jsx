import React, {useMemo} from 'react';
import {Typography, Button, Loader} from '@jahia/moonstone';
import styles from './Overview.module.css';

const NS = 'survey-service';

// ─── Stat card ────────────────────────────────────────────────────────────────
const StatCard = ({label, value, sub}) => (
    <div className={styles.statCard}>
        <div className={styles.statValue}>{value}</div>
        <div className={styles.statLabel}>{label}</div>
        {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = iso => {
    if (!iso) {
        return null;
    }

    return new Date(iso).toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'});
};

// ─── Survey card ──────────────────────────────────────────────────────────────
const SurveyCard = ({survey, t, onNavigate}) => {
    const isActive = survey.activeProp?.value === 'true' || survey.activeProp?.value === true;
    const responses = survey.responsesNode?.responseSummary?.nodes || [];
    const totalResponses = survey.responsesNode?.responseSummary?.pageInfo?.totalCount || 0;
    const completedCount = responses.filter(r => r.completedProp?.value === 'true').length;
    const questionCount = survey.questions?.pageInfo?.totalCount || 0;

    // Timing info
    const startRaw = survey.startDateProp?.value || null;
    const endRaw = survey.endDateProp?.value || null;
    const isTimed = !!(startRaw || endRaw);
    const now = Date.now();
    const startMs = startRaw ? new Date(startRaw).getTime() : null;
    const endMs = endRaw ? new Date(endRaw).getTime() : null;
    const timedStatus =
        startMs && startMs > now ? 'upcoming' :
            endMs && endMs < now ? 'expired' :
                isTimed ? 'live' : null;

    // Find most recent submission date
    const lastDate = responses.reduce((latest, r) => {
        const d = r.submittedAtProp?.value;
        if (!d) {
            return latest;
        }

        return !latest || d > latest ? d : latest;
    }, null);

    return (
        <div className={styles.surveyCard}>
            <div className={styles.surveyCardHeader}>
                <Typography variant="heading" className={styles.surveyTitle}>
                    {survey.displayName || survey.name}
                </Typography>
                <span className={`${styles.badge} ${isActive ? styles.badgeActive : styles.badgeInactive}`}>
                    {isActive ? t(`${NS}:overview.active`) : t(`${NS}:overview.inactive`)}
                </span>
            </div>

            {/* ── Timing row ── */}
            {isTimed && (
                <div className={styles.timedRow}>
                    <span className={`${styles.timedBadge} ${styles[`timedBadge_${timedStatus}`]}`}>
                        {t(`${NS}:overview.timed.${timedStatus}`)}
                    </span>
                    <span className={styles.timedDates}>
                        {startRaw && fmtDate(startRaw)}
                        {startRaw && endRaw && ' → '}
                        {endRaw && fmtDate(endRaw)}
                    </span>
                </div>
            )}

            <div className={styles.surveyMeta}>
                <div className={styles.metaItem}>
                    <span className={styles.metaNum}>{totalResponses}</span>
                    <span className={styles.metaText}>{t(`${NS}:overview.responses`)}</span>
                </div>
                <div className={styles.metaItem}>
                    <span className={styles.metaNum}>{questionCount}</span>
                    <span className={styles.metaText}>Qs</span>
                </div>
                {totalResponses > 0 && (
                    <div className={styles.metaItem}>
                        <span className={styles.metaNum}>{Math.round((completedCount / totalResponses) * 100)}%</span>
                        <span className={styles.metaText}>{t(`${NS}:overview.completionRate`)}</span>
                    </div>
                )}
            </div>

            {lastDate && (
                <div className={styles.lastDate}>
                    {t(`${NS}:overview.lastResponse`)}: {fmtDate(lastDate)}
                </div>
            )}

            {totalResponses === 0 && (
                <div className={styles.noResponses}>{t(`${NS}:overview.noResponses`)}</div>
            )}

            <div className={styles.surveyCardActions}>
                <Button
                    size="small"
                    label={t(`${NS}:overview.viewResults`)}
                    onClick={() => onNavigate(survey, 'results')}
                    variant="ghost"
                    isDisabled={totalResponses === 0}
                />
                <Button
                    size="small"
                    label={t(`${NS}:overview.viewRespondents`)}
                    onClick={() => onNavigate(survey, 'respondents')}
                    variant="ghost"
                    isDisabled={totalResponses === 0}
                />
            </div>
        </div>
    );
};

// ─── Overview ─────────────────────────────────────────────────────────────────
const Overview = ({surveys, loading, onNavigate, t}) => {
    const stats = useMemo(() => {
        if (!surveys.length) {
            return {total: 0, active: 0, totalResponses: 0, completionRate: 0};
        }

        let totalResponses = 0;
        let completedResponses = 0;
        let activeCount = 0;

        surveys.forEach(s => {
            const isActive = s.activeProp?.value === 'true' || s.activeProp?.value === true;
            if (isActive) {
                activeCount++;
            }

            const nodes = s.responsesNode?.responseSummary?.nodes || [];
            totalResponses += s.responsesNode?.responseSummary?.pageInfo?.totalCount || 0;
            completedResponses += nodes.filter(r => r.completedProp?.value === 'true').length;
        });

        const completionRate = totalResponses > 0
            ? Math.round((completedResponses / totalResponses) * 100)
            : 0;

        return {total: surveys.length, active: activeCount, totalResponses, completionRate};
    }, [surveys]);

    if (loading) {
        return <div className={styles.center}><Loader/></div>;
    }

    return (
        <div className={styles.root}>
            {/* ── Global stats ── */}
            <div className={styles.statsRow}>
                <StatCard
                    label={t(`${NS}:overview.totalSurveys`)}
                    value={stats.total}
                    sub={`${stats.active} ${t(`${NS}:overview.active`)}`}
                />
                <StatCard
                    label={t(`${NS}:overview.totalResponses`)}
                    value={stats.totalResponses}
                />
                <StatCard
                    label={t(`${NS}:overview.completionRate`)}
                    value={`${stats.completionRate}%`}
                />
            </div>

            {/* ── Survey cards ── */}
            <Typography variant="heading" className={styles.sectionTitle}>
                Surveys
            </Typography>

            {surveys.length === 0 ? (
                <div className={styles.empty}>
                    <Typography>{t(`${NS}:picker.noSurveys`)}</Typography>
                </div>
            ) : (
                <div className={styles.surveyGrid}>
                    {surveys.map(s => (
                        <SurveyCard key={s.uuid} survey={s} t={t} onNavigate={onNavigate}/>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Overview;
