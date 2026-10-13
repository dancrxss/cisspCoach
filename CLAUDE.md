# CISSP Coach — working notes for Claude

Read `PLAN.md` first. It is the contract; decisions there are settled unless it changes.

## Stack
No-build vanilla JS PWA (ES modules), IndexedDB, service worker. Same skeleton as
`~/Apps/healthHub`. No backend, no API key. Hosting: GitHub Pages (user decision; not yet set up).

## Layout
- `index.html`, `css/app.css`, `sw.js`, `manifest.webmanifest`, `icons/`
- `js/ui.js` entry: `h()` DOM builder (never innerHTML), hash router, sheets, toasts
- `js/db.js` IndexedDB stores (record shapes documented at top of file)
- `js/content.js` pack loading + merge; `js/engine.js` adaptive engine (pure); `js/fsrs.js` scheduler (pure)
- `js/session.js` attempt recording, mastery updates, sessions; `js/export.js` coaching export
- `js/screens/*` one module per route
- `content/domains.json` taxonomy (verified vs isc2.org 2026-10-13); `content/schema/*.json` contracts
- `content/gen/d1..d8.json` reviewed source files; `content/packs/` built packs + manifest
- `scripts/validate-content.mjs`, `scripts/build-pack.mjs`; `tests/*.test.mjs` (`npm test`)

## Rules
- Bump `CACHE_VERSION` in `sw.js` in the same commit as any change to cached assets.
- Content changes: edit `content/gen/d*.json`, run `npm run validate`, then `npm run build:pack`.
  New coaching packs are separate files `content/packs/pack-NNN-*.json` listed in the manifest; bump `manifest.version`.
- Confidence rating is optional everywhere. Never make it block.
- Every answer in every mode writes an attempt record via `session.recordAttempt`.
- Pure modules (`engine.js`, `fsrs.js`, `util.js`, `content.mergePacks`) must stay DOM-free and tested.
