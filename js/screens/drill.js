// Drill tab: pick a domain (→ #domain/N for subdomains) or drill it whole.
import { h, bar, masteryClass, go, icon } from '../ui.js';
import { getAll } from '../db.js';
import { getTaxonomy, allQuestions } from '../content.js';
import { domainMastery } from '../engine.js';
import { activeSession } from '../session.js';

export async function renderDrill(root) {
  const tax = getTaxonomy();
  const session = await activeSession();
  const mastery = Object.fromEntries((await getAll('mastery')).map((m) => [m.subdomain, m]));
  const dm = domainMastery(mastery, allQuestions(), tax);
  const counts = {};
  for (const q of allQuestions()) counts[q.domain] = (counts[q.domain] || 0) + 1;

  root.append(h('header', { class: 'tab-head' }, h('h1', { text: 'Drill' })));
  const body = h('div', { class: 'pad' });
  if (session && session.mode === 'drill') {
    body.append(h('div', { class: 'card hero' },
      h('p', { class: 'muted', text: `Drill in progress · ${session.count} answered` }),
      h('button', { class: 'btn primary wide', text: 'Resume drill', onclick: () => go('#play') })));
  }
  body.append(h('p', { class: 'muted', text: 'Pick a domain. Inside, drill the whole domain or a single subdomain.' }));
  body.append(h('div', { class: 'card list' }, tax.domains.map((d) => {
    const m = dm[d.id];
    return h('button', { class: 'row', onclick: () => go(`#domain/${d.id}`) },
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title', text: `${d.id}. ${d.name}` }),
        h('div', { class: 'row-sub muted', text: `${Math.round(d.weight * 100)}% of exam · ${counts[d.id] || 0} questions` }),
        bar(m.score, { cls: masteryClass(m.score, m.testedSubdomains) })),
      icon('chev', 18));
  })));
  root.append(body);
}
