import assert from 'node:assert/strict';
import { review, intervalDays, retrievability, levelToGrade } from '../js/fsrs.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok', name); };
const DAY = 86_400_000;

t('levels map to grades', () => { assert.equal(levelToGrade('noidea'), 1); assert.equal(levelToGrade('solid'), 4); assert.equal(levelToGrade(null), 0); });
t('retrievability at t=S is ~0.9', () => { assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 0.001); });
t('interval ≈ stability at 90% target', () => { assert.equal(intervalDays(10), 10); assert.equal(intervalDays(0.3), 1); });
t('first review: higher grade → longer interval', () => {
  const g1 = review(null, 1, 0), g3 = review(null, 3, 0), g4 = review(null, 4, 0);
  assert.ok(g1.due < g3.due && g3.due < g4.due);
  assert.equal(g1.lapses, 1); assert.equal(g3.reps, 1);
});
t('good reviews grow stability; again shrinks it', () => {
  let s = review(null, 3, 0);
  const s2 = review(s, 3, s.due);
  assert.ok(s2.s > s.s);
  const s3 = review(s2, 1, s2.due);
  assert.ok(s3.s < s2.s); assert.equal(s3.lapses, 1);
});
t('skip keeps stability/difficulty, requeues one interval out', () => {
  const s = review(null, 3, 0);
  const k = review(s, null, 5 * DAY);
  assert.equal(k.s, s.s); assert.equal(k.d, s.d);
  assert.equal(k.due, 5 * DAY + intervalDays(s.s) * DAY);
  assert.equal(k.reps, 2);
  const fresh = review(null, null, 0);
  assert.ok(fresh.s > 0 && fresh.due > 0);
});
t('difficulty stays within [1,10]', () => {
  let s = review(null, 1, 0);
  for (let i = 0; i < 30; i++) s = review(s, 1, s.due);
  assert.ok(s.d <= 10 && s.d >= 1);
  let e = review(null, 4, 0);
  for (let i = 0; i < 30; i++) e = review(e, 4, e.due);
  assert.ok(e.d >= 1);
});
console.log(`fsrs: ${n} passed`);
