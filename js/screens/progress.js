// Progress tab: domain mastery with subdomain breakdown, trend, flags, export.
import { h, bar, masteryClass, go, svgEl, toast, icon } from '../ui.js';
import { getAll, getMeta } from '../db.js';
import { getTaxonomy, allQuestions, getContent, subdomainName } from '../content.js';
import { domainMastery } from '../engine.js';
import { relDate, DAY_MS } from '../util.js';
import { buildExport, shareExport } from '../export.js';
import { APP_VERSION } from '../ui.js';
import { toggleFlag } from '../session.js';

export async function renderProgress(root) {
  const tax = getTaxonomy();
  const mastery = Object.fromEntries((await getAll('mastery')).map((m) => [m.subdomain, m]));
  const dm = domainMastery(mastery, allQuestions(), tax);
  const attempts = await getAll('attempts');
  const history = (await getAll('history')).sort((a, b) => a.date.localeCompare(b.date));
  const qstate = await getAll('qstate');
  const flagged = qstate.filter((q) => q.flagged);
  const lastExport = await getMeta('lastExportAt', null);
  const week = attempts.filter((a) => Date.now() - new Date(a.at).getTime() < 7 * DAY_MS);
  const confidentWrong = attempts.filter((a) => !a.correct && a.confidence === 'sure').length;

  root.append(h('header', { class: 'tab-head' }, h('h1', { text: 'Progress' }),
    h('button', { class: 'icon-btn', 'aria-label': 'Settings', onclick: () => go('#settings') }, icon('gear'))));
  root.append(h('div', { class: 'pad' },
    h('div', { class: 'stats-row' },
      stat(attempts.length, 'answered'),
      stat(attempts.length ? `${Math.round((attempts.filter((a) => a.correct).length / attempts.length) * 100)}%` : '—', 'accuracy'),
      stat(week.length ? `${Math.round((week.filter((a) => a.correct).length / week.length) * 100)}%` : '—', 'last 7 days')),
    h('h2', { class: 'section', text: 'Trend' }),
    h('div', { class: 'card' }, trend(history, tax)),
    h('h2', { class: 'section', text: 'Mastery by domain' }),
    h('div', { class: 'card list' }, tax.domains.map((d) => {
      const m = dm[d.id];
      const det = h('div', { class: 'sub-list', hidden: true }, d.subdomains.map((s) => {
        const sm = mastery[s.id];
        return h('div', { class: 'sub-row' },
          h('span', { class: 'muted small', text: `${s.id} ${s.name}` }),
          h('span', { class: `small ${masteryClass(sm?.score ?? 0.5, sm?.attempts)}-text`, text: sm?.attempts ? `${Math.round(sm.score * 100)}% · ${sm.attempts}` : '—' }));
      }));
      return h('div', {}, h('button', { class: 'row', onclick: () => { det.hidden = !det.hidden; } },
        h('div', { class: 'row-main' }, h('div', { class: 'row-title', text: `${d.id}. ${d.name}` }), bar(m.score, { cls: masteryClass(m.score, m.testedSubdomains) })),
        h('span', { class: 'row-val muted', text: m.testedSubdomains ? `${Math.round(m.score * 100)}%` : '—' })), det);
    })),
    confidentWrong ? h('p', { class: 'muted small', text: `${confidentWrong} confident-wrong answers so far. These are your misconceptions; the coach export lists them.` }) : null,
    h('h2', { class: 'section', text: `Flagged (${flagged.length})` }),
    flagged.length ? h('div', { class: 'card list' }, flagged.map((f) => {
      const q = getContent().questions.get(f.questionId);
      return h('div', { class: 'row static' },
        h('div', { class: 'row-main' }, h('div', { class: 'row-sub muted', text: `${f.questionId} · ${relDate(f.flaggedAt)}` }), h('div', { class: 'row-title wrap small', text: q?.stem ?? '(question no longer in bank)' })),
        h('button', { class: 'btn ghost small', text: 'Unflag', onclick: async () => { await toggleFlag(f.questionId); go('#progress'); location.reload(); } }));
    })) : h('p', { class: 'muted small', text: 'Flag a question from the player to park it here for the next coaching pass.' }),
    h('h2', { class: 'section', text: 'Coaching export' }),
    h('div', { class: 'card' },
      h('p', { class: 'muted small', text: lastExport ? `Last export ${relDate(lastExport)}. Save to Files → iCloud Drive → CISSP Coach, then run /cissp-coach on the Mac.` : 'Never exported. Save to Files → iCloud Drive → CISSP Coach, then run /cissp-coach on the Mac.' }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', text: 'Export since last', onclick: () => doExport(true) }),
        h('button', { class: 'btn ghost', text: 'Export everything', onclick: () => doExport(false) }))),
  ));

  async function doExport(sinceLast) {
    const data = await buildExport({ sinceLast, appVersion: APP_VERSION });
    const r = await shareExport(data);
    if (r !== 'cancelled') toast(`${data.attempts.length} attempts exported`);
  }
}

function stat(v, label) { return h('div', { class: 'stat' }, h('div', { class: 'stat-v', text: String(v) }), h('div', { class: 'stat-l', text: label })); }

/** SVG line chart of domain mastery over time (one line per domain + overall bold). */
function trend(history, tax) {
  if (history.length < 2) return h('p', { class: 'muted small', text: 'Trend appears after a couple of days of answering.' });
  const W = 320, H = 120, P = 6;
  const n = history.length;
  const x = (i) => P + (i / (n - 1)) * (W - 2 * P);
  const y = (v) => H - P - v * (H - 2 * P);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'trend', preserveAspectRatio: 'none' });
  for (const g of [0.25, 0.5, 0.75]) svg.append(svgEl('line', { x1: P, x2: W - P, y1: y(g), y2: y(g), class: 'grid' }));
  for (const d of tax.domains) {
    const pts = history.map((hh, i) => `${x(i)},${y(hh.domains[d.id] ?? 0.5)}`).join(' ');
    svg.append(svgEl('polyline', { points: pts, class: 'line dim' }));
  }
  const overall = history.map((hh, i) => {
    const v = tax.domains.reduce((s, d) => s + (hh.domains[d.id] ?? 0.5) * d.weight, 0);
    return `${x(i)},${y(v)}`;
  }).join(' ');
  svg.append(svgEl('polyline', { points: overall, class: 'line main' }));
  return h('div', {}, svg, h('p', { class: 'muted small', text: `${history[0].date} → ${history[n - 1].date} · bold = exam-weighted overall` }));
}
