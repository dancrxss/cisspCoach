// ui.js — entry module: DOM builder, hash router, tab bar, sheets, toasts,
// shared state. Screens live in js/screens/*. No innerHTML anywhere; content
// text is only ever written via textContent.

import { loadContent, checkForUpdates } from './content.js';
import { getMeta, setMeta } from './db.js';
import { renderCoach } from './screens/coach.js';
import { renderDrill } from './screens/drill.js';
import { renderCards } from './screens/cards.js';
import { renderMock } from './screens/mock.js';
import { renderProgress } from './screens/progress.js';
import { renderPlay } from './screens/play.js';
import { renderCardPlay } from './screens/cardplay.js';
import { renderMockRun, renderMockResult } from './screens/mockrun.js';
import { renderSettings } from './screens/settings.js';
import { renderDomainDetail } from './screens/domain.js';

export const APP_VERSION = '0.1.0';

// ---------------------------------------------------------------- DOM builder
export function h(tag, props, ...children) {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svgEl(name, attrs = {}, children = []) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) el.appendChild(c);
  return el;
}
export function icon(name, size = 22) {
  const P = {
    back: ['M15 18l-6-6 6-6'],
    flag: ['M5 21V4', 'M5 4h12l-2 4 2 4H5'],
    flagFill: ['M5 21V4', 'M5 4h12l-2 4 2 4H5'],
    gear: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
    check: ['M20 6 9 17l-5-5'],
    x: ['M18 6 6 18', 'M6 6l12 12'],
    chev: ['M9 18l6-6-6-6'],
    coach: ['M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z'],
    drill: ['M4 6h16', 'M4 12h10', 'M4 18h7'],
    cards: ['M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M8 5V3', 'M16 5V3'],
    mock: ['M9 3h6l1 2h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3z', 'M9 12l2 2 4-4'],
    progress: ['M6 20V10', 'M12 20V4', 'M18 20v-7'],
  };
  const el = svgEl('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: name === 'flagFill' ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
  for (const d of P[name] || []) el.appendChild(svgEl('path', { d }));
  return el;
}

// ---------------------------------------------------------------- router
const TABS = ['coach', 'drill', 'cards', 'mock', 'progress'];
const screens = {};
for (const id of ['coach', 'drill', 'domain', 'cards', 'mock', 'progress', 'play', 'cardplay', 'mockrun', 'mockresult', 'settings'])
  screens[id] = document.getElementById(`s-${id}`);
const FULLSCREEN = new Set(['play', 'cardplay', 'mockrun', 'mockresult', 'settings', 'domain']);
let cleanup = null;

export function go(hash) { location.hash = hash; }
export function back(fallback = '#coach') { if (history.length > 1) history.back(); else go(fallback); }

async function route() {
  const parts = (location.hash.slice(1) || 'coach').split('/');
  const head = parts[0];
  const screen = screens[head] ? head : 'coach';
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  for (const [id, el] of Object.entries(screens)) el.hidden = id !== screen;
  document.body.classList.toggle('fullscreen', FULLSCREEN.has(screen));
  for (const b of document.querySelectorAll('#tabbar button')) b.classList.toggle('active', b.dataset.tab === screen);
  const el = screens[screen];
  clear(el);
  window.scrollTo(0, 0);
  const render = {
    coach: renderCoach, drill: renderDrill, domain: renderDomainDetail, cards: renderCards, mock: renderMock,
    progress: renderProgress, play: renderPlay, cardplay: renderCardPlay, mockrun: renderMockRun,
    mockresult: renderMockResult, settings: renderSettings,
  }[screen];
  try {
    cleanup = (await render(el, parts.slice(1))) || null;
  } catch (e) {
    console.error(e);
    el.append(h('div', { class: 'card' }, h('h2', { text: 'Something went wrong' }), h('p', { class: 'muted', text: String(e) })));
  }
}

// ---------------------------------------------------------------- sheet + toast
const sheetRoot = document.getElementById('sheet-root');
export function openSheet(title, body, { actions = [] } = {}) {
  closeSheet();
  const sheet = h('div', { class: 'sheet' },
    h('div', { class: 'sheet-head' }, h('h3', { text: title }), h('button', { class: 'sheet-x', 'aria-label': 'Close', onclick: closeSheet }, icon('x'))),
    h('div', { class: 'sheet-body' }, body),
    actions.length ? h('div', { class: 'sheet-actions' }, actions.map((a) => h('button', { class: `btn ${a.kind || ''}`, text: a.label, onclick: async () => { await a.onclick?.(); if (a.close !== false) closeSheet(); } }))) : null,
  );
  const back = h('div', { class: 'sheet-back', onclick: (e) => { if (e.target === back) closeSheet(); } }, sheet);
  sheetRoot.append(back);
  document.body.classList.add('scroll-locked');
  requestAnimationFrame(() => back.classList.add('open'));
}
export function closeSheet() { clear(sheetRoot); document.body.classList.remove('scroll-locked'); }

export function confirm(title, message, { label = 'Confirm', kind = 'danger' } = {}) {
  return new Promise((resolve) => {
    openSheet(title, h('p', { text: message }), {
      actions: [
        { label: 'Cancel', kind: 'ghost', onclick: () => resolve(false) },
        { label, kind, onclick: () => resolve(true) },
      ],
    });
  });
}

let toastTimer = null;
export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------------------------------------------------------------- shared widgets
export function bar(value, { cls = '' } = {}) {
  const v = Math.max(0, Math.min(1, value));
  return h('div', { class: `bar ${cls}` }, h('div', { class: 'bar-fill', style: { width: `${Math.round(v * 100)}%` } }));
}
export function masteryClass(score, attempts) {
  if (!attempts) return 'unknown';
  return score < 0.45 ? 'weak' : score < 0.7 ? 'mid' : 'strong';
}
export function topbar(title, { onBack = () => back(), right = null } = {}) {
  return h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: onBack }, icon('back')),
    h('h1', { text: title }),
    right || h('span', { class: 'icon-btn-spacer' }),
  );
}

// ---------------------------------------------------------------- boot
async function init() {
  for (const b of document.querySelectorAll('#tabbar button')) b.addEventListener('click', () => go(`#${b.dataset.tab}`));
  await loadContent();
  window.addEventListener('hashchange', route);
  await route();

  // Content update check, quietly, when online.
  checkForUpdates().then((r) => { if (r.updated) { toast('New content installed'); route(); } });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }
  const seen = await getMeta('firstRunAt');
  if (!seen) await setMeta('firstRunAt', new Date().toISOString());
}
init();
