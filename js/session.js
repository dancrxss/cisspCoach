// Session + attempt recording. Every answer in every mode goes through
// recordAttempt(), which writes the attempt, updates qstate, mastery and the
// daily mastery snapshot. Coach/Drill sessions are persisted in meta
// ('activeSession') so a tube journey can be resumed.

import { put, get, getMeta, setMeta, mapOf, getAll } from './db.js';
import { updateMastery, applyAttemptToQState, domainMastery, pickQuestion } from './engine.js';
import { allQuestions, getTaxonomy } from './content.js';
import { uid, nowISO, todayISO } from './util.js';

export const SESSION_TARGET = 10;

export async function recordAttempt({ question, chosen, confidence = null, timeMs, mode, sessionId }) {
  const at = nowISO();
  const atMs = Date.now();
  const correct = chosen === question.correct;
  const attempt = {
    id: uid(), questionId: question.id, sessionId, mode, correct, chosen, confidence, timeMs, at,
    domain: question.domain, subdomain: question.subdomain, difficulty: question.difficulty,
  };
  await put('attempts', attempt);
  const prevQ = await get('qstate', question.id);
  await put('qstate', applyAttemptToQState(prevQ, { questionId: question.id, correct, at: atMs }));
  const prevM = await get('mastery', question.subdomain);
  const next = updateMastery(prevM, { correct, confidence, difficulty: question.difficulty, at });
  await put('mastery', { subdomain: question.subdomain, ...next });
  await snapshotMastery();
  return attempt;
}

/** Re-apply a confidence rating after the fact (optional chip tapped post-reveal). */
export async function setAttemptConfidence(attempt, confidence) {
  if (attempt.confidence === confidence) return attempt;
  // Undo the neutral update and redo with the rating: cheaper to recompute from
  // the previous score, which we reconstruct by inverting the neutral step.
  const m = await get('mastery', attempt.subdomain);
  const q = { difficulty: attempt.difficulty };
  // Reconstruct prev score: score = prev + k*(target-prev) → prev = (score - k*target)/(1-k)
  const K = { correct: { sure: 0.30, fairly: 0.22, guessing: 0.10, none: 0.20 }, wrong: { sure: 0.40, fairly: 0.30, guessing: 0.15, none: 0.25 } };
  const DIFF = { correct: { 1: 0.8, 2: 1.0, 3: 1.2 }, wrong: { 1: 1.2, 2: 1.0, 3: 0.8 } };
  const outcome = attempt.correct ? 'correct' : 'wrong';
  const kOld = Math.min(0.6, K[outcome][attempt.confidence ?? 'none'] * DIFF[outcome][q.difficulty]);
  const target = attempt.correct ? 1 : 0;
  const prevScore = (m.score - kOld * target) / (1 - kOld);
  const redo = updateMastery({ score: prevScore, attempts: m.attempts - 1 }, { correct: attempt.correct, confidence, difficulty: q.difficulty, at: attempt.at });
  await put('mastery', { subdomain: attempt.subdomain, ...redo });
  const updated = { ...attempt, confidence };
  await put('attempts', updated);
  await snapshotMastery();
  return updated;
}

export async function snapshotMastery() {
  const mastery = Object.fromEntries((await getAll('mastery')).map((m) => [m.subdomain, m]));
  const dm = domainMastery(mastery, allQuestions(), getTaxonomy());
  await put('history', {
    date: todayISO(),
    domains: Object.fromEntries(Object.entries(dm).map(([k, v]) => [k, Number(v.score.toFixed(4))])),
    subdomains: Object.fromEntries(Object.entries(mastery).map(([k, v]) => [k, Number(v.score.toFixed(4))])),
  });
}

export async function toggleFlag(questionId, note = null) {
  const prev = (await get('qstate', questionId)) || { questionId, seen: 0, correct: 0, wrong: 0, lastAt: null, lastCorrect: null, streak: 0, dueAt: null };
  const flagged = !prev.flagged;
  const next = { ...prev, flagged, flagNote: flagged ? note : null, flaggedAt: flagged ? nowISO() : null };
  await put('qstate', next);
  return flagged;
}

// ---------------------------------------------------------------- sessions
export async function startSession(mode, filter = null) {
  const s = { id: uid(), mode, filter, startedAt: nowISO(), endedAt: null, count: 0, correct: 0, questionIds: [], currentId: null };
  await put('sessions', s);
  await setMeta('activeSession', s.id);
  return s;
}
export async function activeSession() {
  const id = await getMeta('activeSession');
  if (!id) return null;
  const s = await get('sessions', id);
  return s && !s.endedAt ? s : null;
}
export async function saveSession(s) { await put('sessions', s); }
export async function endSession(s) {
  s.endedAt = nowISO(); s.currentId = null;
  await put('sessions', s);
  await setMeta('activeSession', null);
}

/** Choose the next question for a coach/drill session. */
export async function nextQuestion(session) {
  let qs = allQuestions();
  const f = session.filter;
  if (f?.subdomain) qs = qs.filter((q) => q.subdomain === f.subdomain);
  else if (f?.domain) qs = qs.filter((q) => q.domain === f.domain);
  const qstate = await mapOf('qstate', 'questionId');
  const mastery = Object.fromEntries((await getAll('mastery')).map((m) => [m.subdomain, m]));
  let q = pickQuestion({ questions: qs, qstate, mastery, exclude: new Set(session.questionIds) });
  if (!q) q = pickQuestion({ questions: qs, qstate, mastery }); // bank exhausted this session: allow repeats
  return q;
}
