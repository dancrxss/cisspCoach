// Build the performance export (content/schema/export.schema.json) and hand it
// to the share sheet (→ Save to Files → iCloud Drive) or download it.
import { getAll, getMeta, setMeta } from './db.js';
import { getTaxonomy, allQuestions, getContent } from './content.js';
import { domainMastery } from './engine.js';
import { nowISO } from './util.js';

export async function buildExport({ sinceLast = true, appVersion }) {
  const since = sinceLast ? await getMeta('lastExportAt', null) : null;
  const attempts = (await getAll('attempts')).filter((a) => !since || a.at > since).sort((a, b) => a.at.localeCompare(b.at));
  const masteryRows = await getAll('mastery');
  const mastery = Object.fromEntries(masteryRows.map((m) => [m.subdomain, m]));
  const dm = domainMastery(mastery, allQuestions(), getTaxonomy());
  const qstate = await getAll('qstate');
  const cstate = await getAll('cstate');
  const history = (await getAll('history')).sort((a, b) => a.date.localeCompare(b.date));
  const mocks = (await getAll('mocks')).filter((m) => m.finishedAt);
  return {
    appVersion,
    manifestVersion: getContent().manifestVersion,
    exportedAt: nowISO(),
    sinceExportAt: since,
    attempts: attempts.map(({ questionId, mode, sessionId, correct, chosen, confidence, timeMs, at }) => ({ questionId, mode, sessionId, correct, chosen, confidence: confidence ?? null, timeMs, at })),
    mastery: {
      domains: Object.fromEntries(Object.entries(dm).map(([k, v]) => [k, Number(v.score.toFixed(4))])),
      subdomains: Object.fromEntries(masteryRows.map((m) => [m.subdomain, { score: Number(m.score.toFixed(4)), attempts: m.attempts, lastAt: m.lastAt }])),
    },
    masteryHistory: history.map((h) => ({ date: h.date, domains: h.domains })),
    flashcards: Object.fromEntries(cstate.map((c) => [c.cardId, { level: c.level, history: c.history, fsrs: c.fsrs }])),
    flags: qstate.filter((q) => q.flagged).map((q) => ({ id: q.questionId, note: q.flagNote || undefined, at: q.flaggedAt })),
    confidentWrong: [...new Set(attempts.filter((a) => !a.correct && a.confidence === 'sure').map((a) => a.questionId))],
    mocks: mocks.map((m) => ({ sessionId: m.id, at: m.finishedAt, score: m.score, byDomain: m.byDomain, durationMs: m.durationMs })),
  };
}

export async function shareExport(data) {
  const name = `cissp-export-${data.exportedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`;
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'CISSP Coach export' }); await setMeta('lastExportAt', data.exportedAt); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  await setMeta('lastExportAt', data.exportedAt);
  return 'downloaded';
}
