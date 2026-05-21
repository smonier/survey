/**
 * Generates a print-ready HTML document for the AI analysis report.
 * Opened in a popup and printed via the browser's native print dialog
 * (Print → Save as PDF) — zero extra dependencies.
 *
 * The Moonstone accent colour is read from the current document's CSS
 * custom properties so the PDF matches the active jcontent theme.
 */

const badge = (label, cls) =>
    `<span class="badge ${cls}">${label}</span>`;

const priorityClass = p =>
    p === 'high' ? 'high' : p === 'medium' ? 'medium' : 'low';

const timelineClass = t =>
    t === 'immediate' ? 'high' : t === 'this-week' ? 'medium' : 'low';

const escHtml = str =>
    String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Read a CSS custom property by temporarily applying it to a hidden element
 * so the browser resolves chained variables (e.g. --color-accent →
 * var(--moon-color-accent) → #2c5ee8).
 */
const resolveColor = (varRef, fallback) => {
    try {
        const el = Object.assign(document.createElement('div'), {
            style: 'position:fixed;top:-9999px;opacity:0;pointer-events:none'
        });
        el.style.color = varRef;
        document.documentElement.appendChild(el);
        const c = getComputedStyle(el).color;
        document.documentElement.removeChild(el);
        if (c && c !== 'rgba(0, 0, 0, 0)') {
            return c; // returns e.g. 'rgb(44, 94, 232)'
        }
    } catch { /* ignore */ }
    return fallback;
};

export const openPrintWindow = (analysis, surveyTitle, generatedAt) => {
    // Resolve theme accent at call time (button click) — CSS is guaranteed loaded
    const accent      = resolveColor('var(--color-accent)',   '#2c5ee8');
    const accentLight = resolveColor('var(--color-accent20)', '#eff3ff');
    const dateStr = generatedAt
        ? new Date(generatedAt).toLocaleString()
        : new Date().toLocaleString();

    const a = analysis || {};

    // ── Sections ──────────────────────────────────────────────────────────
    let body = `
        <div class="report-header">
            <h1>${escHtml(surveyTitle)}</h1>
            <p class="meta">AI Sales Intelligence Report &nbsp;·&nbsp; Generated ${escHtml(dateStr)}</p>
        </div>
    `;

    if (a.executiveSummary) {
        body += `
        <div class="section exec-summary">
            <h2>Executive Summary</h2>
            <p>${escHtml(a.executiveSummary)}</p>
        </div>`;
    }

    if ((a.keyFindings || []).length) {
        const cards = a.keyFindings.map(f => `
            <div class="card">
                <div class="card-header">
                    <strong>${escHtml(f.title)}</strong>
                    ${badge(f.significance, priorityClass(f.significance))}
                </div>
                <p>${escHtml(f.insight)}</p>
            </div>`).join('');
        body += `<div class="section"><h2>Key Findings</h2><div class="grid">${cards}</div></div>`;
    }

    if ((a.audienceSegments || []).length) {
        const cards = a.audienceSegments.map(s => `
            <div class="card">
                <div class="card-header">
                    <strong>${escHtml(s.name)}</strong>
                    <span class="pct">${s.percentEstimate || 0}%</span>
                </div>
                <p>${escHtml(s.description)}</p>
                ${s.approach ? `<p><em>Approach:</em> ${escHtml(s.approach)}</p>` : ''}
                ${(s.characteristics || []).length ? `<p>${s.characteristics.map(c => `<span class="tag">${escHtml(c)}</span>`).join(' ')}</p>` : ''}
            </div>`).join('');
        body += `<div class="section"><h2>Audience Segments</h2><div class="grid">${cards}</div></div>`;
    }

    if ((a.opportunities || []).length) {
        const cards = a.opportunities.map(op => `
            <div class="card border-${priorityClass(op.priority)}">
                <div class="card-header">
                    <strong>${escHtml(op.title)}</strong>
                    ${badge(op.priority, priorityClass(op.priority))}
                </div>
                <p>${escHtml(op.description)}</p>
                ${op.action ? `<p class="action-line">→ ${escHtml(op.action)}</p>` : ''}
            </div>`).join('');
        body += `<div class="section"><h2>Opportunities</h2>${cards}</div>`;
    }

    if ((a.riskFlags || []).length) {
        const cards = a.riskFlags.map(r => `
            <div class="card risk-card">
                <strong>⚠ ${escHtml(r.flag)}</strong>
                <p>${escHtml(r.description)}</p>
                ${r.mitigation ? `<p class="mitigation"><em>Mitigation:</em> ${escHtml(r.mitigation)}</p>` : ''}
            </div>`).join('');
        body += `<div class="section"><h2>Risk Flags</h2><div class="grid">${cards}</div></div>`;
    }

    if ((a.talkingPoints || []).length) {
        const cards = a.talkingPoints.map(tp => `
            <div class="card">
                <strong>${escHtml(tp.persona)}</strong>
                <ul>${(tp.points || []).map(p => `<li>${escHtml(p)}</li>`).join('')}</ul>
                ${(tp.objectionHandlers || []).length ? `
                    <p class="obj-label">Objection handlers:</p>
                    ${tp.objectionHandlers.map(oh => `
                        <p class="obj-q">Q: ${escHtml(oh.objection)}</p>
                        <p class="obj-a">A: ${escHtml(oh.response)}</p>
                    `).join('')}` : ''}
            </div>`).join('');
        body += `<div class="section"><h2>Sales Talking Points</h2>${cards}</div>`;
    }

    if ((a.nextActions || []).length) {
        const rows = a.nextActions.map((ac, i) => `
            <div class="action-row">
                <span class="num">${i + 1}</span>
                <div>
                    <strong>${escHtml(ac.action)}</strong>
                    ${badge((ac.timeline || '').replace(/-/g, ' '), timelineClass(ac.timeline))}
                    ${ac.owner ? badge(ac.owner, 'neutral') : ''}
                    ${ac.rationale ? `<p class="rationale">${escHtml(ac.rationale)}</p>` : ''}
                </div>
            </div>`).join('');
        body += `<div class="section"><h2>Recommended Next Actions</h2>${rows}</div>`;
    }

    // ── Full HTML document ─────────────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(surveyTitle)} – AI Analysis Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1e2a4a; margin: 0; padding: 24px 32px; }
  h1 { font-size: 20px; color: ${accent}; margin: 0 0 2px; }
  h2 { font-size: 13px; color: #1e2a4a; border-bottom: 2px solid ${accent}; padding-bottom: 3px; margin: 20px 0 8px; }
  p { margin: 4px 0; line-height: 1.5; }
  ul { margin: 4px 0 4px 16px; }
  li { margin-bottom: 3px; }
  .meta { color: #6b7280; font-size: 10px; margin: 0 0 16px; }
  .report-header { border-bottom: 3px solid ${accent}; padding-bottom: 12px; margin-bottom: 4px; }
  .section { margin-bottom: 16px; break-inside: avoid; }
  .exec-summary { background: ${accentLight}; border-radius: 6px; padding: 12px 16px; }
  .exec-summary p { font-size: 12px; line-height: 1.7; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .card { border: 1px solid #e8edf8; border-radius: 5px; padding: 8px 10px; break-inside: avoid; }
  .card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; margin-bottom: 4px; }
  .border-high   { border-left: 3px solid #dc2626; }
  .border-medium { border-left: 3px solid #d97706; }
  .border-low    { border-left: 3px solid #16a34a; }
  .risk-card { background: #fff7ed; border: 1px solid #fed7aa; }
  .mitigation { background: #fff; border: 1px solid #fed7aa; border-radius: 4px; padding: 4px 6px; font-size: 10px; }
  .action-row { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 8px; break-inside: avoid; }
  .num { background: ${accent}; color: #fff; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: bold; flex-shrink: 0; margin-top: 1px; }
  .action-line { color: ${accent}; font-weight: bold; }
  .rationale { color: #6b7280; font-size: 10px; }
  .pct { font-weight: bold; color: ${accent}; }
  .obj-label { font-weight: bold; font-size: 10px; color: #6b7280; margin-top: 6px; }
  .obj-q { color: #6b7280; font-size: 10px; }
  .obj-a { font-size: 10px; }
  .badge { display: inline-block; padding: 1px 5px; border-radius: 10px; font-size: 9px; font-weight: bold; margin-left: 4px; white-space: nowrap; }
  .high    { background: #fee2e2; color: #dc2626; }
  .medium  { background: #fef3c7; color: #b45309; }
  .low     { background: #dcfce7; color: #16a34a; }
  .neutral { background: #f3f4f6; color: #6b7280; }
  .tag { display: inline-block; background: #f3f4f6; color: #6b7280; padding: 1px 5px; border-radius: 8px; font-size: 9px; margin: 1px; }
  @media print {
    body { padding: 0; }
    .section { page-break-inside: avoid; }
  }
</style>
</head>
<body>${body}</body>
</html>`;

    const w = window.open('', '_blank', 'width=900,height=750,scrollbars=yes');
    if (!w) {
        alert('Please allow popups for this site to download the PDF.');
        return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    // Small delay so CSS renders before print dialog opens
    setTimeout(() => { w.print(); }, 400);
};
