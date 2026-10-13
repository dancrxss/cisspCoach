#!/usr/bin/env node
// Assemble content/gen/d1..d8.json into content/packs/pack-000-base.json and
// write the manifest. Refuses if any domain file fails validation.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('..', import.meta.url).pathname;
const out = { id: 'pack-000-base', version: 1, createdAt: new Date().toISOString(), source: 'base', note: 'Batch one: 8 domain agents + 8 reviewer agents, 2026-10-13', questions: [], flashcards: [] };
let unreviewed = 0;
for (let n = 1; n <= 8; n++) {
  const f = `${root}content/gen/d${n}.json`;
  if (!existsSync(f)) { console.error(`missing ${f}`); process.exit(1); }
  execFileSync('node', [`${root}scripts/validate-content.mjs`, f, '--domain', String(n)], { stdio: 'inherit' });
  const d = JSON.parse(readFileSync(f, 'utf8'));
  for (const q of d.questions) { if (!q.reviewed) unreviewed++; const { reviewed, ...rest } = q; out.questions.push(rest); }
  out.flashcards.push(...d.flashcards);
}
writeFileSync(`${root}content/packs/pack-000-base.json`, JSON.stringify(out));
const manifestPath = `${root}content/packs/manifest.json`;
const prev = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { version: 0, packs: [] };
const manifest = { version: Math.max(1, prev.version), packs: [...new Set([...prev.packs, 'pack-000-base.json'])] };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`pack-000-base: ${out.questions.length} questions, ${out.flashcards.length} flashcards (${unreviewed} unreviewed). manifest v${manifest.version}`);
if (unreviewed) console.log('warning: unreviewed questions included');
