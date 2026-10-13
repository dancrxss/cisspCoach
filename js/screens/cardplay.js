// Flashcard player. Front → tap to flip → back + previous level + optional
// rating chips (4 levels) → next. Skip keeps the previous level.
import { h, clear, topbar, go, toast } from '../ui.js';
import { getAll, get, put, getMeta } from '../db.js';
import { allCards, subdomainName } from '../content.js';
import { cardQueue } from '../engine.js';
import { review, LEVELS, LEVEL_LABEL, levelToGrade } from '../fsrs.js';
import { nowISO, relDate } from '../util.js';

export async function renderCardPlay(root) {
  const filter = await getMeta('cardFilter', null);
  const cards = filter ? allCards().filter((c) => c.domain === filter) : allCards();
  const cstate = Object.fromEntries((await getAll('cstate')).map((c) => [c.cardId, c]));
  const q = cardQueue({ cards, cstate });
  const queue = [...q.due, ...q.fresh, ...q.ahead];
  let i = 0, done = 0, rated = 0;
  if (!queue.length) { root.append(topbar('Flashcards', { onBack: () => go('#cards') }), h('p', { class: 'pad muted', text: 'No cards for this filter.' })); return; }
  show();

  function show() {
    clear(root);
    if (i >= queue.length) return finish();
    const c = queue[i];
    const st = cstate[c.id];
    let flipped = false, chosen = null;
    root.append(topbar('Flashcards', { onBack: () => go('#cards'), right: h('span', { class: 'pill dim', text: `${done} done` }) }));
    const front = h('div', { class: 'fc front' }, h('div', { class: 'fc-text', text: c.front }), h('p', { class: 'muted small', text: 'Tap to flip' }));
    const back = h('div', { class: 'fc back', hidden: true },
      h('div', { class: 'fc-text', text: c.back }),
      h('p', { class: 'fc-why', text: c.whyItMatters }),
      h('p', { class: 'muted small', text: `D${c.domain} · ${c.subdomain} ${subdomainName(c.subdomain)}` }));
    const card = h('button', { class: 'fc-wrap', onclick: () => { if (flipped) return; flipped = true; front.hidden = true; back.hidden = false; controls.hidden = false; } }, front, back);

    const prev = st?.level ? h('p', { class: 'muted small center', text: `Last time: ${LEVEL_LABEL[st.level]} · ${relDate(new Date(st.fsrs.lastAt).toISOString())}` })
      : st ? h('p', { class: 'muted small center', text: `Seen before, not rated · ${relDate(new Date(st.fsrs.lastAt).toISOString())}` })
      : h('p', { class: 'muted small center', text: 'New card' });
    const chips = h('div', { class: 'chips lvl' }, LEVELS.map((l) => h('button', { class: `chip lvl-${l} ${st?.level === l ? 'prev' : ''}`, text: LEVEL_LABEL[l], onclick: (e) => {
      const me = e.currentTarget;
      chosen = l;
      for (const b of chips.querySelectorAll('.chip')) b.classList.remove('on');
      me.classList.add('on');
    } })));
    const controls = h('div', { class: 'fc-controls', hidden: true }, prev, chips,
      h('button', { class: 'btn primary wide', text: 'Next', onclick: () => advance(c, st, chosen) }));
    root.append(h('div', { class: 'pad' }, card, controls));
  }

  async function advance(c, st, level) {
    const now = Date.now();
    const grade = level ? levelToGrade(level) : null;
    const fsrs = review(st?.fsrs ?? null, grade, now);
    const next = {
      cardId: c.id,
      level: level ?? st?.level ?? null,
      history: [...(st?.history ?? []), { level: level ?? null, at: nowISO() }],
      fsrs,
    };
    await put('cstate', next);
    cstate[c.id] = next;
    done++; if (level) rated++;
    i++;
    show();
    window.scrollTo(0, 0);
  }

  function finish() {
    root.append(topbar('Flashcards', { onBack: () => go('#cards') }),
      h('div', { class: 'pad' }, h('div', { class: 'card center' },
        h('div', { class: 'big', text: String(done) }),
        h('p', { class: 'muted', text: `cards reviewed · ${rated} rated` })),
        h('button', { class: 'btn primary wide', text: 'Done', onclick: () => go('#cards') })));
  }
}
