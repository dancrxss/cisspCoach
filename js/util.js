// Shared helpers. No dependencies, no DOM.

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const nowISO = () => new Date().toISOString();

export function todayISO(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const DAY_MS = 86_400_000;

export function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

/** Deterministic PRNG (mulberry32) so the engine is testable. */
export function rng(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Weighted pick: items [{item, w}] → item. */
export function weightedPick(items, rand = Math.random) {
  const total = items.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return items.length ? items[Math.floor(rand() * items.length)].item : null;
  let r = rand() * total;
  for (const x of items) { r -= x.w; if (r <= 0) return x.item; }
  return items[items.length - 1].item;
}

export function pct(n) { return `${Math.round(n * 100)}%`; }

export function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function relDate(iso) {
  if (!iso) return 'never';
  const d = (Date.now() - new Date(iso).getTime()) / DAY_MS;
  if (d < 1 / 24) return 'just now';
  if (d < 1) return `${Math.round(d * 24)}h ago`;
  if (d < 30) return `${Math.round(d)}d ago`;
  return new Date(iso).toLocaleDateString();
}
