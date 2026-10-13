// Adaptive engine — pure functions over plain data. No DOM, no IndexedDB.
// This is the Phase 3 contract from PLAN.md ("Adaptive engine").
//
// Shapes:
//   question   = content Question (see content/schema/question.schema.json)
//   qstate     = {questionId, seen, correct, wrong, lastAt(ms), lastCorrect, streak, dueAt(ms), flagged}
//   mastery    = {subdomain, score:[0,1], attempts, lastAt}
//   taxonomy   = content/domains.json

import { clamp, weightedPick, shuffle, DAY_MS } from './util.js';

export const CONFIDENCE = ['sure', 'fairly', 'guessing'];
export const CONF_LABEL = { sure: 'Sure', fairly: 'Fairly sure', guessing: 'Guessing' };

// Learning-rate table: how far the subdomain score moves toward 1 (correct)
// or 0 (wrong) for each outcome × confidence. PLAN.md "Adaptive engine".
const K = {
  correct: { sure: 0.30, fairly: 0.22, guessing: 0.10, none: 0.20 },
  wrong:   { sure: 0.40, fairly: 0.30, guessing: 0.15, none: 0.25 },
};
// Hard questions right = strong evidence; easy questions wrong = strong evidence.
const DIFF = { correct: { 1: 0.8, 2: 1.0, 3: 1.2 }, wrong: { 1: 1.2, 2: 1.0, 3: 0.8 } };

export const UNKNOWN_SCORE = 0.5;

export function updateMastery(prev, { correct, confidence, difficulty, at }) {
  const score = prev?.score ?? UNKNOWN_SCORE;
  const attempts = prev?.attempts ?? 0;
  const outcome = correct ? 'correct' : 'wrong';
  const k = clamp(K[outcome][confidence ?? 'none'] * (DIFF[outcome][difficulty] ?? 1), 0, 0.6);
  const target = correct ? 1 : 0;
  return { score: clamp(score + k * (target - score), 0, 1), attempts: attempts + 1, lastAt: at };
}

/** Domain score = subdomain scores weighted by bank size; untested subdomains count as UNKNOWN. */
export function domainMastery(masteryBySub, questions, taxonomy) {
  const bank = {};
  for (const q of questions) bank[q.subdomain] = (bank[q.subdomain] || 0) + 1;
  const out = {};
  for (const d of taxonomy.domains) {
    let num = 0, den = 0, tested = 0;
    for (const s of d.subdomains) {
      const w = bank[s.id] || 1;
      const m = masteryBySub[s.id];
      num += w * (m?.score ?? UNKNOWN_SCORE);
      den += w;
      if (m?.attempts) tested++;
    }
    out[d.id] = { score: den ? num / den : UNKNOWN_SCORE, testedSubdomains: tested, subdomains: d.subdomains.length };
  }
  return out;
}

/** Spacing for wrong answers: come back sooner the more often it's missed. */
export function nextDue(prevState, correct, at) {
  const streak = correct ? (prevState?.streak ?? 0) + 1 : 0;
  const days = correct ? Math.min(30, 2 ** streak) : 1;
  return { streak, dueAt: at + days * DAY_MS };
}

export function applyAttemptToQState(prev, { questionId, correct, at }) {
  const { streak, dueAt } = nextDue(prev, correct, at);
  return {
    questionId,
    seen: (prev?.seen ?? 0) + 1,
    correct: (prev?.correct ?? 0) + (correct ? 1 : 0),
    wrong: (prev?.wrong ?? 0) + (correct ? 0 : 1),
    lastAt: at, lastCorrect: correct, streak, dueAt,
    flagged: prev?.flagged ?? false,
    flagNote: prev?.flagNote ?? null,
    flaggedAt: prev?.flaggedAt ?? null,
  };
}

function targetDifficulty(score, rand) {
  const base = score < 0.4 ? 1 : score < 0.7 ? 2 : 3;
  const r = rand();
  if (r < 0.2) return clamp(base - 1, 1, 3);
  if (r > 0.85) return clamp(base + 1, 1, 3);
  return base;
}

/**
 * Pick the next question for Coach or Drill.
 * @param {object} p
 * @param {Array} p.questions   eligible questions (already filtered for drill; unflagged)
 * @param {Map|object} p.qstate  questionId → qstate
 * @param {object} p.mastery     subdomain → mastery
 * @param {Set} p.exclude        ids to avoid (this session)
 * @param {Function} p.rand
 * @param {number} p.now
 */
export function pickQuestion({ questions, qstate, mastery, exclude = new Set(), rand = Math.random, now = Date.now() }) {
  const st = (id) => (qstate instanceof Map ? qstate.get(id) : qstate?.[id]) || null;
  const pool = questions.filter((q) => !exclude.has(q.id) && !st(q.id)?.flagged);
  if (!pool.length) return null;

  // 1. Due-for-review pool (previously missed, now due): 30% of the time.
  const due = pool.filter((q) => { const s = st(q.id); return s && s.dueAt && s.dueAt <= now && s.wrong > 0; });
  if (due.length && rand() < 0.3) {
    due.sort((a, b) => st(a.id).dueAt - st(b.id).dueAt);
    return due[Math.floor(rand() * Math.min(5, due.length))];
  }

  // 2. 10% pure random so nothing is starved.
  if (rand() < 0.1) return pool[Math.floor(rand() * pool.length)];

  // 3. Sample a subdomain weighted by weakness (+ exploration bonus for untested).
  const bySub = {};
  for (const q of pool) (bySub[q.subdomain] ||= []).push(q);
  const items = Object.keys(bySub).map((sub) => {
    const m = mastery?.[sub];
    const score = m?.score ?? UNKNOWN_SCORE;
    const untested = !m?.attempts;
    return { item: sub, w: (1 - score) + 0.15 + (untested ? 0.2 : 0) };
  });
  const sub = weightedPick(items, rand);
  const cands = bySub[sub];
  const score = mastery?.[sub]?.score ?? UNKNOWN_SCORE;
  const want = targetDifficulty(score, rand);

  // 4. Within the subdomain: never-seen first, then least recently seen; prefer target difficulty.
  const rank = (q) => {
    const s = st(q.id);
    const seenPenalty = s ? 1 + Math.max(0, 1 - (now - s.lastAt) / (7 * DAY_MS)) : 0;
    const diffPenalty = Math.abs(q.difficulty - want) * 0.6;
    return seenPenalty + diffPenalty + rand() * 0.3;
  };
  return cands.slice().sort((a, b) => rank(a) - rank(b))[0];
}

/** Weighted-count table for a mock of `total` questions. Always sums to total. */
export function mockCounts(taxonomy, total = 100) {
  const raw = taxonomy.domains.map((d) => ({ id: d.id, exact: d.weight * total }));
  const counts = Object.fromEntries(raw.map((r) => [r.id, Math.floor(r.exact)]));
  let left = total - Object.values(counts).reduce((a, b) => a + b, 0);
  raw.sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));
  for (const r of raw) { if (left <= 0) break; counts[r.id]++; left--; }
  return counts;
}

/** Build a mock paper: proportional by domain, ~30/50/20 difficulty, least-recently-seen first. */
export function buildMock({ questions, qstate, taxonomy, rand = Math.random, total = 100, now = Date.now() }) {
  const st = (id) => (qstate instanceof Map ? qstate.get(id) : qstate?.[id]) || null;
  const counts = mockCounts(taxonomy, total);
  const out = [];
  for (const d of taxonomy.domains) {
    const pool = shuffle(questions.filter((q) => q.domain === d.id && !st(q.id)?.flagged), rand);
    const n = counts[d.id];
    const target = { 1: Math.round(n * 0.3), 2: Math.round(n * 0.5), 3: 0 };
    target[3] = n - target[1] - target[2];
    const freshness = (q) => { const s = st(q.id); return s ? s.lastAt : -Infinity; };
    const picked = [];
    for (const diff of [3, 2, 1]) {
      const c = pool.filter((q) => q.difficulty === diff && !picked.includes(q)).sort((a, b) => freshness(a) - freshness(b));
      picked.push(...c.slice(0, target[diff]));
    }
    if (picked.length < n) {
      const rest = pool.filter((q) => !picked.includes(q)).sort((a, b) => freshness(a) - freshness(b));
      picked.push(...rest.slice(0, n - picked.length));
    }
    out.push(...picked);
  }
  return shuffle(out, rand).map((q) => q.id);
}

/** Score a finished mock. answers: {questionId: {chosen, timeMs}} */
export function scoreMock(questions, answers, taxonomy) {
  const byDomain = {}, bySub = {};
  for (const d of taxonomy.domains) byDomain[d.id] = { correct: 0, total: 0 };
  let correct = 0, answered = 0;
  for (const q of questions) {
    const a = answers[q.id];
    const ok = a != null && a.chosen === q.correct;
    byDomain[q.domain].total++;
    bySub[q.subdomain] ||= { correct: 0, total: 0 };
    bySub[q.subdomain].total++;
    if (a != null) answered++;
    if (ok) { correct++; byDomain[q.domain].correct++; bySub[q.subdomain].correct++; }
  }
  return { correct, answered, total: questions.length, score: questions.length ? correct / questions.length : 0, byDomain, bySub };
}

/** Flashcard queue: due first (oldest due), then new (never seen, capped), then lowest-level fillers. */
export function cardQueue({ cards, cstate, now = Date.now(), newLimit = 10, rand = Math.random }) {
  const st = (id) => (cstate instanceof Map ? cstate.get(id) : cstate?.[id]) || null;
  const due = [], fresh = [], rest = [];
  for (const c of cards) {
    const s = st(c.id);
    if (!s) fresh.push(c);
    else if (s.fsrs?.due <= now) due.push(c);
    else rest.push(c);
  }
  due.sort((a, b) => st(a.id).fsrs.due - st(b.id).fsrs.due);
  const lvl = (c) => { const l = st(c.id)?.level; return l ? ['noidea', 'shaky', 'know', 'solid'].indexOf(l) : 1.5; };
  rest.sort((a, b) => lvl(a) - lvl(b) || st(a.id).fsrs.due - st(b.id).fsrs.due);
  return { due, fresh: shuffle(fresh, rand).slice(0, newLimit), ahead: rest, counts: { due: due.length, fresh: fresh.length } };
}
