// Mock tab: start a 100-question weighted paper; list past mocks.
import { h, go, confirm } from '../ui.js';
import { getAll, put, setMeta, getMeta, mapOf } from '../db.js';
import { getTaxonomy, allQuestions } from '../content.js';
import { buildMock } from '../engine.js';
import { uid, nowISO, fmtDuration } from '../util.js';

export const MOCK_SIZE = 100;

export async function renderMock(root) {
  const mocks = (await getAll('mocks')).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const active = mocks.find((m) => !m.finishedAt);
  const bank = allQuestions().length;
  root.append(h('header', { class: 'tab-head' }, h('h1', { text: 'Mock test' })));
  root.append(h('div', { class: 'pad' },
    h('div', { class: 'card hero' },
      h('p', { class: 'muted', text: active ? `Mock in progress · ${Object.keys(active.answers).length} / ${active.questionIds.length} answered` : `${Math.min(MOCK_SIZE, bank)} questions in official domain proportions. No feedback until the end. Timer runs but does not stop you.` }),
      h('button', { class: 'btn primary wide', text: active ? 'Resume mock' : 'Start mock', onclick: async () => {
        if (active) return go('#mockrun');
        const qstate = await mapOf('qstate', 'questionId');
        const ids = buildMock({ questions: allQuestions(), qstate, taxonomy: getTaxonomy(), total: MOCK_SIZE });
        const mock = { id: uid(), startedAt: nowISO(), finishedAt: null, questionIds: ids, answers: {}, cursor: 0, score: null, byDomain: null, bySub: null, durationMs: 0 };
        await put('mocks', mock);
        go('#mockrun');
      } }),
      active && h('button', { class: 'btn ghost wide', text: 'Abandon mock', onclick: async () => {
        if (await confirm('Abandon mock?', 'Answers so far are discarded and not tracked.')) { const { del } = await import('../db.js'); await del('mocks', active.id); go('#mock'); }
      } })),
    mocks.filter((m) => m.finishedAt).length ? h('h2', { class: 'section', text: 'Past mocks' }) : null,
    mocks.filter((m) => m.finishedAt).length ? h('div', { class: 'card list' }, mocks.filter((m) => m.finishedAt).map((m) => h('button', { class: 'row', onclick: () => go(`#mockresult/${m.id}`) },
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title', text: `${Math.round(m.score * 100)}%` }),
        h('div', { class: 'row-sub muted', text: `${new Date(m.finishedAt).toLocaleDateString()} · ${m.questionIds.length} questions · ${fmtDuration(m.durationMs)}` })),
      h('span', { class: 'muted', text: '›' })))) : null,
  ));
}
