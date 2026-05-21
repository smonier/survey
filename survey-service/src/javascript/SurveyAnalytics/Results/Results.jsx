import React, {useMemo} from 'react';
import {useQuery} from '@apollo/client';
import {Loader, Typography} from '@jahia/moonstone';
import {SURVEY_DETAIL_QUERY, SURVEY_RESULTS_QUERY} from '../../graphql/queries';
import QuestionChart from './QuestionChart';
import styles from './Results.module.css';

const NS = 'survey-service';

const Results = ({survey, lang, t}) => {
    const surveyPath = survey?.path;

    // Fetch question structure (labels + options) from LIVE
    const {data: detailData, loading: detailLoading, error: detailError} = useQuery(SURVEY_DETAIL_QUERY, {
        variables: {surveyPath: surveyPath || '', lang},
        skip: !surveyPath
    });

    // Fetch all response vote data from LIVE.
    // descendant(relPath:"responses") returns null when /responses doesn't exist yet
    // so no PathNotFoundException is thrown for surveys with zero submissions.
    const {data: resultsData, loading: resultsLoading, error: resultsError} = useQuery(SURVEY_RESULTS_QUERY, {
        variables: {surveyPath: surveyPath || ''},
        skip: !surveyPath
    });

    const questions = detailData?.jcr?.nodeByPath?.questions?.nodes || [];
    const responses = resultsData?.jcr?.nodeByPath?.responsesNode?.children?.nodes || [];
    const loading = detailLoading || resultsLoading;
    const error = detailError || resultsError;

    // Aggregate: { [questionUuid]: { [optionUuid]: count } }
    const voteCounts = useMemo(() => {
        const counts = {};
        responses.forEach(resp => {
            (resp.children?.nodes || []).forEach(qr => {
                const qId = qr.questionId?.value;
                const opts = qr.chosenOptions?.values || [];
                if (!qId) {
                    return;
                }

                if (!counts[qId]) {
                    counts[qId] = {};
                }

                opts.forEach(opt => {
                    counts[qId][opt] = (counts[qId][opt] || 0) + 1;
                });
            });
        });
        return counts;
    }, [responses]);

    // Total respondents who answered at least one question
    const totalResponses = responses.filter(
        r => (r.children?.nodes || []).some(qr => (qr.chosenOptions?.values || []).length > 0)
    ).length;

    if (!survey) {
        return (
            <div className={styles.empty}>
                <Typography>{t(`${NS}:results.selectSurvey`)}</Typography>
            </div>
        );
    }

    if (loading) {
        return <div className={styles.center}><Loader/></div>;
    }

    if (error) {
        return <div className={styles.error}>{error.message}</div>;
    }

    if (responses.length === 0) {
        return (
            <div className={styles.empty}>
                <Typography>{t(`${NS}:results.noData`)}</Typography>
            </div>
        );
    }

    return (
        <div className={styles.root}>
            <div className={styles.pageHeader}>
                <Typography variant="heading" className={styles.surveyName}>
                    {survey.displayName || survey.name}
                </Typography>
                <span className={styles.respCount}>
                    {totalResponses} {t(`${NS}:results.votes`)}
                </span>
            </div>

            <div className={styles.questionList}>
                {questions.map(q => (
                    <QuestionChart
                        key={q.uuid}
                        question={q}
                        voteCounts={voteCounts[q.uuid] || {}}
                        totalResponses={totalResponses}
                        t={t}
                    />
                ))}
            </div>
        </div>
    );
};

export default Results;
