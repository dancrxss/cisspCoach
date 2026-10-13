import { h, topbar, go, toast, confirm } from '../ui.js';
import { APP_VERSION } from '../ui.js';
import { getContent, checkForUpdates } from '../content.js';
import { wipeAll, clear as clearStore } from '../db.js';

export async function renderSettings(root) {
  const c = getContent();
  root.append(topbar('Settings'));
  root.append(h('div', { class: 'pad' },
    h('div', { class: 'card' },
      h('h3', { text: 'Content' }),
      h('p', { class: 'muted small', text: `v${c.manifestVersion} · ${c.questions.size} questions · ${c.flashcards.size} flashcards · packs: ${c.packIds.join(', ')}` }),
      h('button', { class: 'btn ghost', text: 'Check for new content', onclick: async () => {
        const r = await checkForUpdates();
        toast(r.offline ? 'Offline — try later' : r.updated ? `Updated to v${r.version}` : r.error ? 'Could not check' : 'Already up to date');
      } })),
    h('div', { class: 'card' },
      h('h3', { text: 'How the coach works' }),
      h('p', { class: 'small muted', text: 'Every answer updates a mastery score for its subdomain. Weak subdomains come up more often; questions you miss come back after a day, then with growing gaps. Confidence ratings sharpen the signal but are never required. Flagged questions leave rotation until the next content pack.' })),
    h('div', { class: 'card' },
      h('h3', { text: 'Data' }),
      h('p', { class: 'small muted', text: 'Everything lives on this device. Export from the Progress tab before resetting.' }),
      h('button', { class: 'btn danger', text: 'Reset all progress', onclick: async () => {
        if (await confirm('Reset everything?', 'Attempts, mastery, flashcard levels, mocks and flags are deleted. Content stays.')) { await wipeAll(); toast('Reset'); go('#coach'); }
      } }),
      h('button', { class: 'btn ghost', text: 'Re-download content', onclick: async () => { await clearStore('packs'); location.reload(); } })),
    h('p', { class: 'muted small center', text: `CISSP Coach ${APP_VERSION}` }),
  ));
}
