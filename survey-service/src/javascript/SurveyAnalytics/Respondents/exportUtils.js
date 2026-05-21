/**
 * Client-side export utilities for survey respondent data.
 * Generates CSV and JSON Blobs and triggers a browser download.
 */

const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};

/**
 * Build a lookup of { [questionUuid]: questionDisplayName }
 * and { [optionUuid]: optionDisplayName } from the questions list.
 */
const buildLookups = questions => {
    const qNames = {};
    const optNames = {};
    questions.forEach(q => {
        qNames[q.uuid] = q.displayName || q.uuid;
        (q.options?.nodes || []).forEach(opt => {
            optNames[opt.uuid] = opt.displayName || opt.uuid;
        });
    });
    return {qNames, optNames};
};

/**
 * Export survey responses as CSV.
 *
 * Columns: Email, Submitted At, Completed, [Q1 title], [Q2 title], ...
 * For multiple-choice questions, option labels are joined with " | ".
 *
 * @param {string} surveyName
 * @param {Array}  questions   - from SURVEY_DETAIL_QUERY
 * @param {Array}  respondents - from SURVEY_RESPONDENTS_QUERY (all pages)
 */
export const exportCsv = (surveyName, questions, respondents) => {
    const {qNames, optNames} = buildLookups(questions);

    const headers = [
        'Email',
        'Submitted At',
        'Completed',
        ...questions.map(q => `"${(q.displayName || q.uuid).replace(/"/g, '""')}"`)
    ];

    const escape = val => {
        if (val == null) {
            return '';
        }

        const str = String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
    };

    const rows = respondents.map(r => {
        const email = r.emailProp?.value || '';
        const submittedAt = r.submittedAtProp?.value
            ? new Date(r.submittedAtProp.value).toISOString()
            : '';
        const completed = r.completedProp?.value === 'true' ? 'Yes' : 'No';

        // Build answer map: { [questionUuid]: [optionLabel, ...] }
        const answerMap = {};
        (r.answers?.nodes || []).forEach(a => {
            const qId = a.qId?.value;
            if (qId) {
                answerMap[qId] = (a.opts?.values || []).map(o => optNames[o] || o);
            }
        });

        const answerCols = questions.map(q => {
            const opts = answerMap[q.uuid] || [];
            return escape(opts.join(' | '));
        });

        return [escape(email), escape(submittedAt), completed, ...answerCols].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], {type: 'text/csv;charset=utf-8'}); // BOM for Excel
    const safeName = surveyName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
    triggerDownload(blob, `${safeName}-respondents.csv`);
};

/**
 * Export survey responses as JSON.
 *
 * Shape: [ { uuid, email, submittedAt, completed, answers: { "Question label": ["Opt A"] } } ]
 *
 * @param {string} surveyName
 * @param {Array}  questions
 * @param {Array}  respondents
 */
export const exportJson = (surveyName, questions, respondents) => {
    const {qNames, optNames} = buildLookups(questions);

    const data = respondents.map(r => {
        const answerMap = {};
        (r.answers?.nodes || []).forEach(a => {
            const qId = a.qId?.value;
            if (qId) {
                const qLabel = qNames[qId] || qId;
                answerMap[qLabel] = (a.opts?.values || []).map(o => optNames[o] || o);
            }
        });

        return {
            uuid: r.uuid,
            email: r.emailProp?.value || null,
            submittedAt: r.submittedAtProp?.value || null,
            completed: r.completedProp?.value === 'true',
            answers: answerMap
        };
    });

    const blob = new Blob(
        [JSON.stringify(data, null, 2)],
        {type: 'application/json;charset=utf-8'}
    );
    const safeName = surveyName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
    triggerDownload(blob, `${safeName}-respondents.json`);
};
