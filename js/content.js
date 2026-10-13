// Content loading + pack merge. Packs are additive: later pack ids override
// earlier ones for the same question/card id; a pack's `retire` list removes
// ids. Packs are cached in IndexedDB so the app works offline even if the SW
// cache is evicted. The manifest is fetched network-first when online.

import { getAll, put, getMeta, setMeta } from './db.js';

const BASE = './content/';
let taxonomy = null;
let merged = { questions: new Map(), flashcards: new Map(), manifestVersion: 0, packIds: [] };

export function getTaxonomy() { return taxonomy; }
export function getContent() { return merged; }
export const allQuestions = () => [...merged.questions.values()];
export const allCards = () => [...merged.flashcards.values()];
export const subdomainName = (id) => {
  for (const d of taxonomy.domains) for (const s of d.subdomains) if (s.id === id) return s.name;
  return id;
};
export const domainOf = (id) => taxonomy.domains.find((d) => d.id === Number(id));

/** Pure merge — exported for tests. */
export function mergePacks(packs) {
  const questions = new Map(), flashcards = new Map();
  const sorted = packs.slice().sort((a, b) => a.id.localeCompare(b.id));
  for (const p of sorted) {
    for (const q of p.questions || []) questions.set(q.id, { ...q, pack: p.id });
    for (const f of p.flashcards || []) flashcards.set(f.id, { ...f, pack: p.id });
    for (const id of p.retire || []) { questions.delete(id); flashcards.delete(id); }
  }
  return { questions, flashcards, packIds: sorted.map((p) => p.id) };
}

async function fetchJSON(path, opts = {}) {
  const r = await fetch(BASE + path, opts);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

/** Load taxonomy + cached packs; on first run (no cache) pull from the bundled manifest. */
export async function loadContent() {
  taxonomy = await fetchJSON('domains.json');
  let packs = await getAll('packs');
  let version = await getMeta('manifestVersion', 0);
  if (!packs.length) {
    const m = await fetchJSON('packs/manifest.json');
    packs = await Promise.all(m.packs.map((f) => fetchJSON(`packs/${f}`)));
    for (const p of packs) await put('packs', p);
    version = m.version;
    await setMeta('manifestVersion', version);
  }
  merged = { ...mergePacks(packs), manifestVersion: version };
  return merged;
}

/** Network-first manifest check. Returns {updated:boolean, version}. Safe offline. */
export async function checkForUpdates() {
  if (!navigator.onLine) return { updated: false, version: merged.manifestVersion, offline: true };
  try {
    const m = await fetchJSON('packs/manifest.json', { cache: 'no-store' });
    const have = new Set((await getAll('packs')).map((p) => p.id));
    const current = await getMeta('manifestVersion', 0);
    if (m.version <= current) return { updated: false, version: current };
    for (const f of m.packs) {
      const p = await fetchJSON(`packs/${f}`, { cache: 'no-store' });
      if (!have.has(p.id) || p.version) await put('packs', p);
    }
    await setMeta('manifestVersion', m.version);
    merged = { ...mergePacks(await getAll('packs')), manifestVersion: m.version };
    return { updated: true, version: m.version };
  } catch (e) {
    return { updated: false, version: merged.manifestVersion, error: String(e) };
  }
}
