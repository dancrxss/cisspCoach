// IndexedDB layer. Tiny promise wrapper + repository functions. Record shapes:
//
//  attempts  {id, questionId, sessionId, mode:'coach'|'drill'|'mock', correct, chosen,
//             confidence:'sure'|'fairly'|'guessing'|null, timeMs, at(ISO), domain, subdomain, difficulty}
//  qstate    {questionId, seen, correct, wrong, lastAt(ms), lastCorrect, streak, dueAt(ms),
//             flagged, flagNote, flaggedAt}
//  cstate    {cardId, level:null|'noidea'|'shaky'|'know'|'solid', history:[{level, at}], fsrs:{s,d,due,lastAt,reps,lapses}}
//  mastery   {subdomain, score, attempts, lastAt}
//  history   {date:'YYYY-MM-DD', domains:{id:score}, subdomains:{id:score}}
//  sessions  {id, mode, filter:{domain?, subdomain?}|null, startedAt, endedAt, count, correct, questionIds:[]}
//  mocks     {id, startedAt, finishedAt, questionIds:[], answers:{qid:{chosen,timeMs}}, score, byDomain, bySub, durationMs}
//  packs     {id, ...pack}
//  meta      {key, value}

const DB_NAME = 'cisspcoach';
const DB_VERSION = 1;
let dbp = null;

export function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const mk = (name, key, idx = []) => {
        const s = db.createObjectStore(name, { keyPath: key });
        for (const [n, k] of idx) s.createIndex(n, k);
        return s;
      };
      mk('attempts', 'id', [['at', 'at'], ['questionId', 'questionId'], ['sessionId', 'sessionId']]);
      mk('qstate', 'questionId');
      mk('cstate', 'cardId');
      mk('mastery', 'subdomain');
      mk('history', 'date');
      mk('sessions', 'id');
      mk('mocks', 'id');
      mk('packs', 'id');
      mk('meta', 'key');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    try { out = fn(s); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out?.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const reqResult = (store, mode, fn) => open().then((db) => new Promise((resolve, reject) => {
  const t = db.transaction(store, mode);
  const r = fn(t.objectStore(store));
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
}));

export const get = (store, key) => reqResult(store, 'readonly', (s) => s.get(key));
export const getAll = (store) => reqResult(store, 'readonly', (s) => s.getAll());
export const put = (store, val) => tx(store, 'readwrite', (s) => s.put(val));
export const del = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));
export const clear = (store) => tx(store, 'readwrite', (s) => s.clear());
export const putMany = (store, vals) => tx(store, 'readwrite', (s) => { for (const v of vals) s.put(v); });

export async function getMeta(key, fallback = null) {
  const r = await get('meta', key);
  return r ? r.value : fallback;
}
export const setMeta = (key, value) => put('meta', { key, value });

export async function attemptsSince(iso) {
  const all = await getAll('attempts');
  return iso ? all.filter((a) => a.at > iso) : all;
}

export async function mapOf(store, key) {
  const all = await getAll(store);
  return new Map(all.map((r) => [r[key], r]));
}

export async function wipeAll() {
  for (const s of ['attempts', 'qstate', 'cstate', 'mastery', 'history', 'sessions', 'mocks', 'meta']) await clear(s);
}
