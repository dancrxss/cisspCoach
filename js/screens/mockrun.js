// Mock runner (#mockrun) and results (#mockresult/<id>).
import { h, clear, topbar, go, confirm, bar, masteryClass } from '../ui.js';
import { getAll, put, get } from '../db.js';
import { getContent, getTaxonomy, subdomainName } from '../content.js';
import { scoreMock } from '../engine.js';
import { recordAttempt } from '../session.js';
import { fmtDuration, nowISO } from '../util.js';

const LETTERS = ['A', 'B', 'C', 'D'];

export async function renderMockRun(root) {
  const mock = (await getAll('mocks')).find((m) => !m.finishedAt);
  if (!mock) { go('#mock'); return; }
  const content = getContent();
  let idx = mock.cursor ?? 0;
  let tick = null;
  const started = new Date(mock.startedAt).getTime();
  const clock = h('span', { class: 'pill dim mono' });
  const updateClock = () => { clock.textContent = fmtDuration(Date.now() - started); };
  updateClock(); tick = setInterval(updateClock, 1000);

  async function draw() {
    clear(root);
    const q = content.questions.get(mock.questionIds[idx]);
    const ans = mock.answers[q.id];
    const shownAt = Date.now();
    root.append(topbar(`${idx + 1} / ${mock.questionIds.length}`, { onBack: () => go('#mock'), right: clock }));
    const opts = q.options.map((o, i) => h('button', { class: `opt ${ans?.chosen === i ? 'picked' : ''}`, onclick: async () => {
      mock.answers[q.id] = { chosen: i, timeMs: (ans?.timeMs ?? 0) + (Date.now() - shownAt) };
      await put('mocks', mock);
      for (const [j, b] of opts.entries()) b.classList.toggle('picked', j === i);
    } }, h('span', { class: 'opt-letter', text: LETTERS[i] }), h('span', { class: 'opt-text', text: o })));
    root.append(h('div', { class: 'play' },
      h('p', { class: 'stem', text: q.stem }),
      h('div', { class: 'opts' }, opts),
      h('div', { class: 'mock-nav' },
        h('button', { class: 'btn ghost', text: 'Previous', disabled: idx === 0, onclick: () => move(-1) }),
        h('span', { class: 'muted small', text: `${Object.keys(mock.answers).length} answered` }),
        idx < mock.questionIds.length - 1
          ? h('button', { class: 'btn ghost', text: 'Next', onclick: () => move(1) })
          : h('button', { class: 'btn primary', text: 'Finish', onclick: finish })),
      h('button', { class: 'btn ghost wide small', text: 'Finish early', onclick: finish }),
    ));
  }
  async function move(d) { idx = Math.max(0, Math.min(mock.questionIds.length - 1, idx + d)); mock.cursor = idx; await put('mocks', mock); draw(); window.scrollTo(0, 0); }
  async function finish() {
    const unanswered = mock.questionIds.length - Object.keys(mock.answers).length;
    const ok = await confirm('Finish mock?', unanswered ? `${unanswered} unanswered questions will count as wrong.` : 'Submit and see your breakdown.', { label: 'Finish', kind: 'primary' });
    if (!ok) return;
    clearInterval(tick);
    const qs = mock.questionIds.map((id) => content.questions.get(id));
    const r = scoreMock(qs, mock.answers, getTaxonomy());
    mock.finishedAt = nowISO(); mock.durationMs = Date.now() - started;
    mock.score = r.score; mock.byDomain = r.byDomain; mock.bySub = r.bySub; mock.cursor = 0;
    await put('mocks', mock);
    // Every answer is tracked: write attempts now (unanswered = not attempted).
    for (const q of qs) {
      const a = mock.answers[q.id];
      if (!a) continue;
      await recordAttempt({ question: q, chosen: a.chosen, timeMs: a.timeMs, mode: 'mock', sessionId: mock.id });
    }
    go(`#mockresult/${mock.id}`);
  }
  await draw();
  return () => clearInterval(tick);
}

export async function renderMockResult(root, [id]) {
  const mock = await get('mocks', id);
  if (!mock?.finishedAt) { go('#mock'); return; }
  const tax = getTaxonomy();
  const content = getContent();
  root.append(topbar('Mock result', { onBack: () => go('#mock') }));
  const wrong = mock.questionIds.map((qid) => content.questions.get(qid)).filter((q) => q && mock.answers[q.id]?.chosen !== q.correct);
  root.append(h('div', { class: 'pad' },
    h('div', { class: 'card center' },
      h('div', { class: 'big', text: `${Math.round(mock.score * 100)}%` }),
      h('p', { class: 'muted', text: `${Object.values(mock.byDomain).reduce((s, d) => s + d.correct, 0)} of ${mock.questionIds.length} · ${fmtDuration(mock.durationMs)} · relative weakness, not a pass prediction` })),
    h('h2', { class: 'section', text: 'By domain' }),
    h('div', { class: 'card list' }, tax.domains.map((d) => {
      const r = mock.byDomain[d.id];
      const s = r.total ? r.correct / r.total : 0;
      const subs = d.subdomains.filter((sd) => mock.bySub[sd.id]);
      const det = h('div', { class: 'sub-list', hidden: true }, subs.map((sd) => {
        const x = mock.bySub[sd.id];
        return h('div', { class: 'sub-row' }, h('span', { class: 'muted small', text: `${sd.id} ${sd.name}` }), h('span', { class: 'small', text: `${x.correct}/${x.total}` }));
      }));
      return h('div', {}, h('button', { class: 'row', onclick: () => { det.hidden = !det.hidden; } },
        h('div', { class: 'row-main' }, h('div', { class: 'row-title', text: `${d.id}. ${d.name}` }), bar(s, { cls: masteryClass(s, r.total) })),
        h('span', { class: 'row-val muted', text: `${r.correct}/${r.total}` })), det);
    })),
    wrong.length ? h('h2', { class: 'section', text: `Review the ${wrong.length} you missed` }) : null,
    wrong.length ? h('div', { class: 'card list' }, wrong.map((q) => {
      const a = mock.answers[q.id];
      const det = h('div', { class: 'explain', hidden: true },
        h('p', { class: 'small' }, h('strong', { text: 'Your answer: ' }), a ? `${LETTERS[a.chosen]}. ${q.options[a.chosen]}` : 'unanswered'),
        h('p', { class: 'small' }, h('strong', { text: `Correct: ${LETTERS[q.correct]}. ` }), q.options[q.correct]),
        h('p', { class: 'small', text: q.explanation.correct }),
        h('ul', { class: 'small' }, q.explanation.distractors.map((d) => h('li', {}, h('strong', { text: `${LETTERS[d.option]}. ` }), d.why))));
      return h('div', {}, h('button', { class: 'row', onclick: () => { det.hidden = !det.hidden; } },
        h('div', { class: 'row-main' }, h('div', { class: 'row-sub muted', text: `D${q.domain} · ${q.subdomain}` }), h('div', { class: 'row-title wrap', text: q.stem }))), det);
    })) : null,
  ));
}
