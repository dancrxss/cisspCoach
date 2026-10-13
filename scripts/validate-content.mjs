#!/usr/bin/env node
// Validate a content file (a pack, or a per-domain generation file with
// {questions, flashcards}) against the contract in content/schema/*.json.
// Hand-rolled checks (no deps) — mirrors the schemas plus content-quality
// rules the schemas can't express. Exit 1 on any error.
//
// usage: node scripts/validate-content.mjs <file.json> [--domain N]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const taxonomy = JSON.parse(readFileSync(join(here, '..', 'content', 'domains.json'), 'utf8'));
const SUBS = new Map();
for (const d of taxonomy.domains) for (const s of d.subdomains) SUBS.set(s.id, d.id);

const file = process.argv[2];
if (!file) { console.error('usage: validate-content.mjs <file.json> [--domain N]'); process.exit(2); }
const domArgIdx = process.argv.indexOf('--domain');
const onlyDomain = domArgIdx > -1 ? Number(process.argv[domArgIdx + 1]) : null;

const data = JSON.parse(readFileSync(file, 'utf8'));
const questions = data.questions ?? [];
const flashcards = data.flashcards ?? [];
const errors = [];
const warn = [];
const err = (m) => errors.push(m);

const BANNED = [/all of the above/i, /none of the above/i, /both a and b/i, /\ba and c\b/i];
const Q_ID = /^q-d[1-8]-[a-z0-9]+-\d{3,}$/;
const F_ID = /^f-d[1-8]-[a-z0-9]+-\d{3,}$/;
const SUB = /^[1-8]\.\d{1,2}$/;
const TAGS = new Set(['manager-mindset', 'definition', 'scenario', 'ordering', 'best-answer', 'calculation']);

const seenIds = new Set();
const seenStems = new Set();
const subCount = {};
const diffCount = { 1: 0, 2: 0, 3: 0 };
const correctPos = { 0: 0, 1: 0, 2: 0, 3: 0 };

questions.forEach((q, i) => {
  const at = `question[${i}] ${q?.id ?? '(no id)'}`;
  if (!q || typeof q !== 'object') return err(`${at}: not an object`);
  for (const k of ['id', 'domain', 'subdomain', 'difficulty', 'stem', 'options', 'correct', 'ladder', 'explanation'])
    if (!(k in q)) err(`${at}: missing ${k}`);
  const allowed = new Set(['id', 'domain', 'subdomain', 'difficulty', 'stem', 'options', 'correct', 'ladder', 'explanation', 'tags', 'reviewed']);
  for (const k of Object.keys(q)) if (!allowed.has(k)) err(`${at}: unknown field ${k}`);
  if (!Q_ID.test(q.id)) err(`${at}: bad id format`);
  if (seenIds.has(q.id)) err(`${at}: duplicate id`); seenIds.add(q.id);
  if (!Number.isInteger(q.domain) || q.domain < 1 || q.domain > 8) err(`${at}: bad domain`);
  if (onlyDomain && q.domain !== onlyDomain) err(`${at}: domain ${q.domain} but file is for domain ${onlyDomain}`);
  if (q.id && q.domain && !q.id.startsWith(`q-d${q.domain}-`)) err(`${at}: id domain prefix mismatch`);
  if (!SUB.test(q.subdomain) || !SUBS.has(q.subdomain)) err(`${at}: unknown subdomain ${q.subdomain}`);
  else if (SUBS.get(q.subdomain) !== q.domain) err(`${at}: subdomain ${q.subdomain} is not in domain ${q.domain}`);
  if (![1, 2, 3].includes(q.difficulty)) err(`${at}: difficulty must be 1-3`); else diffCount[q.difficulty]++;
  if (typeof q.stem !== 'string' || q.stem.trim().length < 20) err(`${at}: stem too short`);
  const stemKey = (q.stem || '').toLowerCase().replace(/\W+/g, ' ').trim();
  if (seenStems.has(stemKey)) err(`${at}: duplicate stem`); seenStems.add(stemKey);
  if (!Array.isArray(q.options) || q.options.length !== 4) err(`${at}: need exactly 4 options`);
  else {
    const norm = q.options.map((o) => String(o).trim().toLowerCase());
    if (new Set(norm).size !== 4) err(`${at}: options not distinct`);
    q.options.forEach((o, j) => {
      if (typeof o !== 'string' || !o.trim()) err(`${at}: option ${j} empty`);
      if (BANNED.some((re) => re.test(o))) err(`${at}: option ${j} uses a banned pattern ("all/none of the above")`);
    });
    const lens = q.options.map((o) => String(o).length);
    if (q.correct != null && lens[q.correct] > 1.8 * Math.max(...lens.filter((_, j) => j !== q.correct)))
      warn.push(`${at}: correct option is much longer than the others (giveaway)`);
  }
  if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) err(`${at}: bad correct index`); else correctPos[q.correct]++;
  if (!Array.isArray(q.ladder) || q.ladder.length < 2 || q.ladder.length > 3) err(`${at}: ladder must have 2-3 steps`);
  else q.ladder.forEach((s, j) => { if (typeof s !== 'string' || s.trim().length < 10) err(`${at}: ladder[${j}] too short`); if (!/\?\s*$/.test(s.trim())) warn.push(`${at}: ladder[${j}] should be a question`); });
  const ex = q.explanation;
  if (!ex || typeof ex !== 'object') err(`${at}: missing explanation`);
  else {
    if (typeof ex.correct !== 'string' || ex.correct.trim().length < 20) err(`${at}: explanation.correct too short`);
    if (!Array.isArray(ex.distractors) || ex.distractors.length !== 3) err(`${at}: need exactly 3 distractor explanations`);
    else {
      const idx = ex.distractors.map((d) => d.option).sort();
      const expected = [0, 1, 2, 3].filter((j) => j !== q.correct);
      if (JSON.stringify(idx) !== JSON.stringify(expected)) err(`${at}: distractors must cover options ${expected.join(',')} (got ${idx.join(',')})`);
      ex.distractors.forEach((d, j) => { if (typeof d.why !== 'string' || d.why.trim().length < 10) err(`${at}: distractor[${j}].why too short`); });
    }
  }
  if (q.tags) { if (!Array.isArray(q.tags)) err(`${at}: tags must be array`); else q.tags.forEach((t) => { if (!TAGS.has(t)) err(`${at}: unknown tag ${t}`); }); }
  subCount[q.subdomain] = (subCount[q.subdomain] || 0) + 1;
});

const fSub = {};
flashcards.forEach((f, i) => {
  const at = `flashcard[${i}] ${f?.id ?? '(no id)'}`;
  if (!f || typeof f !== 'object') return err(`${at}: not an object`);
  for (const k of ['id', 'domain', 'subdomain', 'front', 'back', 'whyItMatters']) if (!(k in f)) err(`${at}: missing ${k}`);
  const allowed = new Set(['id', 'domain', 'subdomain', 'front', 'back', 'whyItMatters', 'siblingOf', 'tags']);
  for (const k of Object.keys(f)) if (!allowed.has(k)) err(`${at}: unknown field ${k}`);
  if (!F_ID.test(f.id)) err(`${at}: bad id format`);
  if (seenIds.has(f.id)) err(`${at}: duplicate id`); seenIds.add(f.id);
  if (onlyDomain && f.domain !== onlyDomain) err(`${at}: domain mismatch`);
  if (f.id && f.domain && !f.id.startsWith(`f-d${f.domain}-`)) err(`${at}: id domain prefix mismatch`);
  if (!SUB.test(f.subdomain) || SUBS.get(f.subdomain) !== f.domain) err(`${at}: bad subdomain ${f.subdomain}`);
  if (typeof f.front !== 'string' || f.front.trim().length < 5) err(`${at}: front too short`);
  if (typeof f.back !== 'string' || f.back.trim().length < 5) err(`${at}: back too short`);
  if (typeof f.back === 'string' && f.back.length > 400) warn.push(`${at}: back is long (${f.back.length} chars) — cards should be one fact`);
  if (typeof f.whyItMatters !== 'string' || f.whyItMatters.trim().length < 10) err(`${at}: whyItMatters too short`);
  fSub[f.subdomain] = (fSub[f.subdomain] || 0) + 1;
});

// Coverage report
if (onlyDomain) {
  const d = taxonomy.domains.find((x) => x.id === onlyDomain);
  for (const s of d.subdomains) {
    if (!subCount[s.id]) warn.push(`subdomain ${s.id} (${s.name}) has no questions`);
    if (!fSub[s.id]) warn.push(`subdomain ${s.id} (${s.name}) has no flashcards`);
  }
}

console.log(`${file}: ${questions.length} questions, ${flashcards.length} flashcards`);
console.log(`  difficulty 1/2/3: ${diffCount[1]}/${diffCount[2]}/${diffCount[3]}   correct at A/B/C/D: ${correctPos[0]}/${correctPos[1]}/${correctPos[2]}/${correctPos[3]}`);
console.log(`  questions per subdomain: ${Object.entries(subCount).sort().map(([k, v]) => `${k}:${v}`).join(' ')}`);
console.log(`  flashcards per subdomain: ${Object.entries(fSub).sort().map(([k, v]) => `${k}:${v}`).join(' ')}`);
for (const w of warn) console.log(`  warn: ${w}`);
for (const e of errors) console.log(`  ERROR: ${e}`);
if (questions.length) {
  const maxPos = Math.max(...Object.values(correctPos));
  if (maxPos > questions.length * 0.4) console.log(`  warn: correct-answer position skew (${maxPos}/${questions.length} in one slot) — reshuffle`);
}
console.log(errors.length ? `FAIL (${errors.length} errors)` : 'OK');
process.exit(errors.length ? 1 : 0);
