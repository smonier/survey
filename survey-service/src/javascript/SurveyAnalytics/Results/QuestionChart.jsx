import React from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell, LabelList
} from 'recharts';
import {Typography} from '@jahia/moonstone';
import {cssColor} from '../../utils/cssVars';
import styles from './Results.module.css';

const NS = 'survey-service';

// Resolve Moonstone accent tokens to actual colour strings at load time.
// (Recharts SVG attributes cannot accept CSS variable references directly.)
const BAR_COLORS = [
    cssColor('var(--color-accent)',      '#2c5ee8'),
    cssColor('var(--color-accent_dark)', '#4f46e5'),
    '#8b5cf6', '#06b6d4', '#0ea5e9', '#3b82f6'
];
const GRID_STROKE = cssColor('var(--color-accent20)', '#e1e7f5');

const CustomTooltip = ({active, payload, total, t}) => {
    if (!active || !payload?.length) {
        return null;
    }

    const {name, value} = payload[0];
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    return (
        <div className={styles.tooltip}>
            <div className={styles.tooltipLabel}>{name}</div>
            <div className={styles.tooltipValue}>
                {value} {t(`${NS}:results.votes`)} — {pct}%
            </div>
        </div>
    );
};

/**
 * Renders one horizontal bar chart for a single survey question.
 *
 * @param {Object} question  - { uuid, displayName, allowMultiple, options: [{ uuid, displayName }] }
 * @param {Object} voteCounts - { [optionUuid]: count }
 * @param {number} totalResponses
 * @param {Function} t
 */
const QuestionChart = ({question, voteCounts, totalResponses, t}) => {
    const data = question.options.nodes.map((opt, idx) => ({
        name: opt.displayName || opt.uuid,
        votes: voteCounts[opt.uuid] || 0,
        color: BAR_COLORS[idx % BAR_COLORS.length]
    }));

    const totalVotes = data.reduce((sum, d) => sum + d.votes, 0);
    const isMultiple = question.allowMultiple?.value === 'true';

    // Dynamic bar height: 40px per bar + 16px padding, min 120px
    const chartHeight = Math.max(120, data.length * 48 + 16);

    return (
        <div className={styles.questionBlock}>
            <div className={styles.questionHeader}>
                <Typography variant="subheading" className={styles.questionTitle}>
                    {question.displayName}
                </Typography>
                {isMultiple && (
                    <span className={styles.multipleTag}>
                        {t(`${NS}:results.multipleChoice`)}
                    </span>
                )}
            </div>

            <div className={styles.chartWrap} style={{height: chartHeight}}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        layout="vertical"
                        margin={{top: 4, right: 80, left: 8, bottom: 4}}
                        barSize={20}
                    >
                        <CartesianGrid horizontal={false} stroke={GRID_STROKE}/>
                        <XAxis
                            type="number"
                            tick={{fontSize: 11, fill: '#7b8ab8'}}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                        />
                        <YAxis
                            type="category"
                            dataKey="name"
                            width={160}
                            tick={{fontSize: 12, fill: '#3a4a72', fontWeight: 500}}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            content={<CustomTooltip total={totalResponses} t={t}/>}
                            cursor={{fill: '#f0f2f7'}}
                        />
                        <Bar dataKey="votes" radius={[0, 4, 4, 0]}>
                            {data.map((entry, idx) => (
                                <Cell key={idx} fill={entry.color}/>
                            ))}
                            <LabelList
                                dataKey="votes"
                                position="right"
                                formatter={v => v > 0 ? v : ''}
                                style={{fontSize: 12, fontWeight: 700, fill: '#3a4a72'}}
                            />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className={styles.questionFooter}>
                {totalVotes} {t(`${NS}:results.votes`)}
            </div>
        </div>
    );
};

export default QuestionChart;
