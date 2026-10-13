// Coach tab (default). Start/resume an adaptive session, glance at weakness.
import { h, bar, masteryClass, go, icon } from '../ui.js';
import { getAll, attemptsSince } from '../db.js';
import { getTaxonomy, allQuestions, getContent } from '../content.js';
import { domainMastery } from '../engine.js';
import { activeSession, startSession, endSession, SESSION_TARGET } from '../session.js';
import { DAY_MS } from '../util.js';

export async function renderCoach(root) {
  const tax = getTaxonomy();
  const session = await activeSession();
  const mastery = Object.fromEntries((await getAll('mastery')).map((m) => [m.subdomain, m]));
  const dm = domainMastery(mastery, allQuestions(), tax);
  const week = await attemptsSince(new Date(Date.now() - 7 * DAY_MS).toISOString());
  const today = week.filter((a) => a.at.slice(0, 10) === new Date().toISOString().slice(0, 10));
  const acc = week.length ? Math.round((week.filter((a) => a.correct).length / week.length) * 100) : null;

  root.append(h('header', { class: 'tab-head' },
    h('h1', { text: 'Coach' }),
    h('button', { class: 'icon-btn', 'aria-label': 'Settings', onclick: () => go('#settings') }, icon('gear'))));

  const resumeCoach = session && session.mode === 'coach';
  root.append(h('div', { class: 'pad' },
    h('div', { class: 'card hero' },
      h('p', { class: 'muted', text: resumeCoach ? `Session in progress · ${session.count} answered` : 'Adaptive feed. Weak areas come up more often.' }),
      h('button', { class: 'btn primary wide', text: resumeCoach ? 'Resume session' : `Start session (${SESSION_TARGET}+)`, onclick: async () => {
        if (session && session.mode !== 'coach') await endSession(session);
        if (!resumeCoach) await startSession('coach');
        go('#play');
      } }),
      resumeCoach && h('button', { class: 'btn ghost wide', text: 'Discard session', onclick: async () => { await endSession(session); go('#coach'); } }),
    ),
    h('div', { class: 'stats-row' },
      stat(today.length, 'today'),
      stat(week.length, 'this week'),
      stat(acc == null ? '—' : `${acc}%`, '7-day accuracy'),
    ),
    h('h2', { class: 'section', text: 'Where you stand' }),
    h('div', { class: 'card list' }, tax.domains.map((d) => {
      const m = dm[d.id];
      const attempts = m.testedSubdomains;
      return h('button', { class: 'row', onclick: () => go(`#domain/${d.id}`) },
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title', text: `${d.id}. ${d.name}` }),
          bar(m.score, { cls: masteryClass(m.score, attempts) })),
        h('span', { class: 'row-val muted', text: attempts ? `${Math.round(m.score * 100)}%` : '—' }),
        icon('chev', 18));
    })),
    h('p', { class: 'muted small center', text: `${getContent().questions.size} questions · ${getContent().flashcards.size} cards · content v${getContent().manifestVersion}` }),
  ));
}

function stat(v, label) { return h('div', { class: 'stat' }, h('div', { class: 'stat-v', text: String(v) }), h('div', { class: 'stat-l', text: label })); }
