// Domain detail: subdomain breakdown + drill entry points. Route #domain/N
import { h, bar, masteryClass, go, topbar, confirm } from '../ui.js';
import { getAll } from '../db.js';
import { domainOf, allQuestions } from '../content.js';
import { activeSession, endSession, startSession } from '../session.js';
import { relDate } from '../util.js';

export async function renderDomainDetail(root, [id]) {
  const d = domainOf(id);
  if (!d) { go('#drill'); return; }
  const mastery = Object.fromEntries((await getAll('mastery')).map((m) => [m.subdomain, m]));
  const qs = allQuestions().filter((q) => q.domain === d.id);
  const bySub = {};
  for (const q of qs) bySub[q.subdomain] = (bySub[q.subdomain] || 0) + 1;

  async function start(filter) {
    const s = await activeSession();
    if (s) {
      const ok = s.count === 0 ? true : await confirm('Replace session?', `You have a ${s.mode} session in progress with ${s.count} answered. Start this drill instead?`, { label: 'Start drill', kind: 'primary' });
      if (!ok) return;
      await endSession(s);
    }
    await startSession('drill', filter);
    go('#play');
  }

  root.append(topbar(`Domain ${d.id}`, { onBack: () => go('#drill') }));
  root.append(h('div', { class: 'pad' },
    h('h2', { class: 'title', text: d.name }),
    h('p', { class: 'muted', text: `${Math.round(d.weight * 100)}% of the exam · ${qs.length} questions in the bank` }),
    h('button', { class: 'btn primary wide', text: 'Drill whole domain', onclick: () => start({ domain: d.id }) }),
    h('h2', { class: 'section', text: 'Subdomains' }),
    h('div', { class: 'card list' }, d.subdomains.map((s) => {
      const m = mastery[s.id];
      const n = bySub[s.id] || 0;
      return h('button', { class: 'row', disabled: !n, onclick: () => start({ domain: d.id, subdomain: s.id }) },
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title', text: `${s.id} ${s.name}` }),
          h('div', { class: 'row-sub muted', text: m?.attempts ? `${m.attempts} answered · last ${relDate(m.lastAt)}` : n ? `${n} questions · untested` : 'no questions yet' }),
          bar(m?.score ?? 0.5, { cls: masteryClass(m?.score ?? 0.5, m?.attempts) })),
        h('span', { class: 'row-val muted', text: m?.attempts ? `${Math.round(m.score * 100)}%` : '—' }));
    })),
  ));
}
