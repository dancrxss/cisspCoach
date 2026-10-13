import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { updateMastery, domainMastery, pickQuestion, mockCounts, buildMock, scoreMock, applyAttemptToQState, cardQueue } from '../js/engine.js';
import { rng } from '../js/util.js';
import { mergePacks } from '../js/content.js';

const taxonomy = JSON.parse(readFileSync(new URL('../content/domains.json', import.meta.url)));
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok', name); };

// Synthetic bank: 5 questions per subdomain, difficulty cycling.
const questions = [];
for (const d of taxonomy.domains) for (const s of d.subdomains) for (let i = 0; i < 5; i++)
  questions.push({ id: `q-d${d.id}-sub${s.id.split('.')[1].padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`, domain: d.id, subdomain: s.id, difficulty: (i % 3) + 1, correct: i % 4 });

t('mastery moves toward 1 on correct, more when sure', () => {
  const a = updateMastery(null, { correct: true, confidence: 'sure', difficulty: 2, at: 1 });
  const b = updateMastery(null, { correct: true, confidence: 'guessing', difficulty: 2, at: 1 });
  const c = updateMastery(null, { correct: true, confidence: null, difficulty: 2, at: 1 });
  assert.ok(a.score > c.score && c.score > b.score && b.score > 0.5);
  assert.equal(a.attempts, 1);
});
t('mastery drops hardest on confident wrong', () => {
  const a = updateMastery({ score: 0.7, attempts: 3 }, { correct: false, confidence: 'sure', difficulty: 2, at: 1 });
  const b = updateMastery({ score: 0.7, attempts: 3 }, { correct: false, confidence: 'guessing', difficulty: 2, at: 1 });
  const c = updateMastery({ score: 0.7, attempts: 3 }, { correct: false, confidence: null, difficulty: 2, at: 1 });
  assert.ok(a.score < c.score && c.score < b.score && b.score < 0.7);
});
t('difficulty scales the step', () => {
  const easy = updateMastery(null, { correct: true, confidence: null, difficulty: 1, at: 1 });
  const hard = updateMastery(null, { correct: true, confidence: null, difficulty: 3, at: 1 });
  assert.ok(hard.score > easy.score);
});
t('score stays within [0,1]', () => {
  let m = null;
  for (let i = 0; i < 50; i++) m = updateMastery(m, { correct: true, confidence: 'sure', difficulty: 3, at: i });
  assert.ok(m.score <= 1 && m.score > 0.99);
  for (let i = 0; i < 50; i++) m = updateMastery(m, { correct: false, confidence: 'sure', difficulty: 1, at: i });
  assert.ok(m.score >= 0 && m.score < 0.01);
});
t('domain mastery = unknown 0.5 with no data, weighted otherwise', () => {
  const dm = domainMastery({}, questions, taxonomy);
  assert.equal(dm[1].score, 0.5);
  assert.equal(dm[1].testedSubdomains, 0);
  const dm2 = domainMastery({ '4.1': { score: 1, attempts: 5 } }, questions, taxonomy);
  assert.ok(dm2[4].score > 0.5 && dm2[4].score < 1);
  assert.equal(dm2[4].testedSubdomains, 1);
});
t('qstate accumulates and spaces due dates', () => {
  const s1 = applyAttemptToQState(null, { questionId: 'x', correct: false, at: 0 });
  assert.equal(s1.wrong, 1); assert.equal(s1.streak, 0); assert.equal(s1.dueAt, 86_400_000);
  const s2 = applyAttemptToQState(s1, { questionId: 'x', correct: true, at: 0 });
  assert.equal(s2.streak, 1); assert.equal(s2.dueAt, 2 * 86_400_000);
  const s3 = applyAttemptToQState(s2, { questionId: 'x', correct: true, at: 0 });
  assert.equal(s3.dueAt, 4 * 86_400_000);
});
t('pickQuestion favours weak subdomains', () => {
  const rand = rng(7);
  const mastery = {};
  for (const d of taxonomy.domains) for (const s of d.subdomains) mastery[s.id] = { score: 0.95, attempts: 10 };
  mastery['3.2'] = { score: 0.05, attempts: 10 };
  const counts = {};
  for (let i = 0; i < 400; i++) {
    const q = pickQuestion({ questions, qstate: {}, mastery, rand, now: 1e12 });
    counts[q.subdomain] = (counts[q.subdomain] || 0) + 1;
  }
  const others = Object.entries(counts).filter(([k]) => k !== '3.2').map(([, v]) => v);
  assert.ok(counts['3.2'] > Math.max(...others) * 2, `3.2 got ${counts['3.2']}, max other ${Math.max(...others)}`);
});
t('pickQuestion respects exclude and flags, returns null when empty', () => {
  const small = questions.slice(0, 2);
  const qstate = { [small[1].id]: { flagged: true } };
  for (let i = 0; i < 20; i++) assert.equal(pickQuestion({ questions: small, qstate, mastery: {}, rand: rng(i) }).id, small[0].id);
  assert.equal(pickQuestion({ questions: small, qstate, mastery: {}, exclude: new Set([small[0].id]) }), null);
});
t('pickQuestion serves due-wrong questions', () => {
  const small = questions.slice(0, 8);
  const qstate = { [small[3].id]: { seen: 1, wrong: 1, lastAt: 0, dueAt: 10 } };
  let served = 0;
  for (let i = 0; i < 200; i++) if (pickQuestion({ questions: small, qstate, mastery: {}, rand: rng(i), now: 20 }).id === small[3].id) served++;
  assert.ok(served > 40, `due question served ${served}/200`);
});
t('mockCounts sums to total and matches official weights', () => {
  const c = mockCounts(taxonomy, 100);
  assert.equal(Object.values(c).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(c, { 1: 16, 2: 10, 3: 13, 4: 13, 5: 13, 6: 12, 7: 13, 8: 10 });
  assert.equal(Object.values(mockCounts(taxonomy, 25)).reduce((a, b) => a + b, 0), 25);
});
t('buildMock returns the right per-domain counts, unique ids, no flagged', () => {
  const qstate = { [questions[0].id]: { flagged: true } };
  const ids = buildMock({ questions, qstate, taxonomy, rand: rng(1), total: 100 });
  assert.equal(ids.length, 100);
  assert.equal(new Set(ids).size, 100);
  assert.ok(!ids.includes(questions[0].id));
  const byD = {};
  for (const id of ids) { const d = Number(id[3]); byD[d] = (byD[d] || 0) + 1; }
  assert.deepEqual(byD, { 1: 16, 2: 10, 3: 13, 4: 13, 5: 13, 6: 12, 7: 13, 8: 10 });
});
t('buildMock degrades gracefully with a thin bank', () => {
  const thin = questions.filter((q) => q.domain === 2).slice(0, 3);
  const ids = buildMock({ questions: thin, qstate: {}, taxonomy, rand: rng(2), total: 100 });
  assert.equal(ids.length, 3);
});
t('scoreMock tallies by domain and subdomain', () => {
  const qs = questions.slice(0, 5);
  const answers = { [qs[0].id]: { chosen: qs[0].correct, timeMs: 1 }, [qs[1].id]: { chosen: (qs[1].correct + 1) % 4, timeMs: 1 } };
  const r = scoreMock(qs, answers, taxonomy);
  assert.equal(r.correct, 1); assert.equal(r.answered, 2); assert.equal(r.total, 5);
  assert.equal(r.byDomain[1].correct, 1); assert.equal(r.byDomain[1].total, 5);
});
t('cardQueue orders due, then new (capped), then ahead by lowest level', () => {
  const cards = Array.from({ length: 30 }, (_, i) => ({ id: `f-${i}` }));
  const cstate = {
    'f-0': { level: 'solid', fsrs: { due: 5 } },
    'f-1': { level: 'noidea', fsrs: { due: 1 } },
    'f-2': { level: 'solid', fsrs: { due: 100 } },
    'f-3': { level: 'noidea', fsrs: { due: 200 } },
  };
  const q = cardQueue({ cards, cstate, now: 10, newLimit: 5, rand: rng(3) });
  assert.deepEqual(q.due.map((c) => c.id), ['f-1', 'f-0']);
  assert.equal(q.fresh.length, 5);
  assert.equal(q.counts.fresh, 26);
  assert.deepEqual(q.ahead.map((c) => c.id), ['f-3', 'f-2']);
});
t('mergePacks: later pack overrides, retire removes', () => {
  const a = { id: 'pack-000-base', questions: [{ id: 'q1', stem: 'old' }, { id: 'q2' }], flashcards: [{ id: 'f1' }] };
  const b = { id: 'pack-001-coach', questions: [{ id: 'q1', stem: 'new' }], flashcards: [], retire: ['q2', 'f1'] };
  const m = mergePacks([b, a]);
  assert.equal(m.questions.get('q1').stem, 'new');
  assert.equal(m.questions.get('q1').pack, 'pack-001-coach');
  assert.ok(!m.questions.has('q2')); assert.ok(!m.flashcards.has('f1'));
  assert.deepEqual(m.packIds, ['pack-000-base', 'pack-001-coach']);
});
console.log(`engine: ${n} passed`);
