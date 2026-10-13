// Flashcards tab: due/new counts, domain filter, start.
import { h, go, bar } from '../ui.js';
import { getAll, setMeta, getMeta } from '../db.js';
import { getTaxonomy, allCards } from '../content.js';
import { cardQueue } from '../engine.js';
import { LEVELS, LEVEL_LABEL } from '../fsrs.js';

export async function renderCards(root) {
  const tax = getTaxonomy();
  const cstate = Object.fromEntries((await getAll('cstate')).map((c) => [c.cardId, c]));
  let filter = await getMeta('cardFilter', null); // domain id or null
  const cards = allCards();

  root.append(h('header', { class: 'tab-head' }, h('h1', { text: 'Flashcards' })));
  const body = h('div', { class: 'pad' });
  root.append(body);

  function draw() {
    while (body.firstChild) body.removeChild(body.firstChild);
    const pool = filter ? cards.filter((c) => c.domain === filter) : cards;
    const q = cardQueue({ cards: pool, cstate });
    const levels = { noidea: 0, shaky: 0, know: 0, solid: 0, unrated: 0 };
    for (const c of pool) { const l = cstate[c.id]?.level; if (l) levels[l]++; else if (cstate[c.id]) levels.unrated++; }
    const seen = pool.filter((c) => cstate[c.id]).length;

    body.append(
      h('div', { class: 'chips wrap' },
        chip('All', filter == null, () => setFilter(null)),
        tax.domains.map((d) => chip(`D${d.id}`, filter === d.id, () => setFilter(d.id)))),
      h('div', { class: 'card hero' },
        h('div', { class: 'stats-row tight' },
          stat(q.counts.due, 'due'), stat(q.counts.fresh, 'new'), stat(pool.length, 'total')),
        h('button', { class: 'btn primary wide', text: q.counts.due + q.counts.fresh ? 'Start reviewing' : 'Review ahead', onclick: () => go('#cardplay') }),
        h('p', { class: 'muted small', text: 'Rating is optional. Your last level shows when a card comes back.' })),
      h('h2', { class: 'section', text: 'Confidence levels' }),
      h('div', { class: 'card' }, LEVELS.map((l) => h('div', { class: 'lvl-row' },
        h('span', { class: `lvl-dot ${l}` }), h('span', { class: 'lvl-name', text: LEVEL_LABEL[l] }),
        bar(seen ? levels[l] / seen : 0, { cls: `lvl-${l}` }), h('span', { class: 'row-val muted', text: String(levels[l]) }))),
        h('p', { class: 'muted small', text: `${seen} of ${pool.length} seen · ${levels.unrated} seen but unrated` })),
    );
  }
  async function setFilter(f) { filter = f; await setMeta('cardFilter', f); draw(); }
  draw();
}
function chip(label, on, onclick) { return h('button', { class: `chip ${on ? 'on' : ''}`, text: label, onclick }); }
function stat(v, label) { return h('div', { class: 'stat' }, h('div', { class: 'stat-v', text: String(v) }), h('div', { class: 'stat-l', text: label })); }
