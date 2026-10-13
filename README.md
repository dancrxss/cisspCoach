# CISSP Coach

Offline-first CISSP prep PWA with a Claude Code coaching loop. `PLAN.md` is the contract.

**Status (2026-10-13):** Phases 0–4 built. Coach, Drill, Flashcards, Mock Test and Progress
all work offline with 400 reviewed questions and 304 flashcards. Live at
https://dancrxss.github.io/cisspCoach/ (add to Home Screen on iPhone). Phase 5 (the `/cissp-coach`
skill + iCloud export path) is next.

## Run locally
```bash
npm run serve   # then open http://localhost:8765
npm test        # engine + FSRS unit tests
```

## Content pipeline
```bash
npm run validate     # every domain file against the schema + quality rules
npm run build:pack   # assemble content/packs/pack-000-base.json + manifest
```
Source of truth is `content/gen/d1..d8.json`. Generation and review briefs are in `content/`.
