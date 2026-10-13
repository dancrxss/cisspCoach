// Compact FSRS-4.5 scheduler (default parameters). Pure functions, no DOM.
// Grades: 1 Again, 2 Hard, 3 Good, 4 Easy. Flashcard confidence levels map
// onto grades: noidea→1, shaky→2, know→3, solid→4. A skipped rating keeps the
// card's stability and difficulty untouched and just re-queues it at the
// current interval (PLAN.md "Flashcard player" step 5).

export const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const FACTOR = 19 / 81;
const DECAY = -0.5;
export const TARGET_R = 0.9;
const DAY = 86_400_000;

export const LEVELS = ['noidea', 'shaky', 'know', 'solid'];
export const LEVEL_LABEL = { noidea: 'No idea', shaky: 'Shaky', know: 'Know it', solid: 'Solid' };
export const levelToGrade = (lvl) => LEVELS.indexOf(lvl) + 1; // 1..4, 0 if unknown

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function retrievability(elapsedDays, stability) {
  if (stability <= 0) return 0;
  return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
}

export function intervalDays(stability, r = TARGET_R) {
  return Math.max(1, Math.round(stability / FACTOR * (Math.pow(r, 1 / DECAY) - 1)));
}

function initStability(g) { return Math.max(0.1, W[g - 1]); }
function initDifficulty(g) { return clamp(W[4] - (g - 3) * W[5], 1, 10); }

function nextDifficulty(d, g) {
  const dPrime = d - W[6] * (g - 3);
  return clamp(W[7] * initDifficulty(3) + (1 - W[7]) * dPrime, 1, 10);
}

function recallStability(d, s, r, g) {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  return s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy + 1);
}

function forgetStability(d, s, r) {
  return W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
}

/**
 * @param {null|{s:number,d:number,due:number,lastAt:number,reps:number,lapses:number}} state
 * @param {1|2|3|4|null} grade  null = skipped rating
 * @param {number} now ms
 */
export function review(state, grade, now = Date.now()) {
  if (grade == null) {
    // Skip: no learning signal. New card gets a Good-sized first interval;
    // seen card keeps s/d and is re-queued one current interval out.
    if (!state) {
      const s = initStability(3);
      return { s, d: initDifficulty(3), due: now + intervalDays(s) * DAY, lastAt: now, reps: 1, lapses: 0 };
    }
    return { ...state, due: now + intervalDays(state.s) * DAY, lastAt: now, reps: state.reps + 1 };
  }
  if (!state) {
    const s = initStability(grade);
    return { s, d: initDifficulty(grade), due: now + intervalDays(s) * DAY, lastAt: now, reps: 1, lapses: grade === 1 ? 1 : 0 };
  }
  const elapsed = Math.max(0, (now - state.lastAt) / DAY);
  const r = retrievability(elapsed, state.s);
  const d = nextDifficulty(state.d, grade);
  const s = grade === 1 ? forgetStability(state.d, state.s, r) : recallStability(state.d, state.s, r, grade);
  const sClamped = Math.max(0.1, s);
  return {
    s: sClamped, d,
    due: now + intervalDays(sClamped) * DAY,
    lastAt: now,
    reps: state.reps + 1,
    lapses: state.lapses + (grade === 1 ? 1 : 0),
  };
}
