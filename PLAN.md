# CISSP Coach — project contract

Offline-first phone app for CISSP prep. Questions, flashcards, adaptive feed,
domain drill, mock test, progress tracking, and a Claude Code coaching loop that
turns exported performance data into targeted content packs.

This file is the contract. Decisions below are settled unless this file changes.

## Settled decisions (from planning, 2026-10-13)

| Topic | Decision |
|---|---|
| Stack | No-build vanilla JS PWA, same skeleton as healthHub. IndexedDB for all local state. Hosted on GitHub Pages. Capacitor iOS shell optional later. |
| Backend | None. No API key, no server. All intelligence is in pre-generated content and the batch coaching loop. |
| Coaching loop | Batch, run in a Claude Code session. Weekly minimum, any time otherwise. |
| Socratic teaching | Scripted per-question ladder, works offline. Live chat deferred (not needed for the loop). |
| Confidence tap | Optional on both questions and flashcards. Never blocks finishing. Unrated = neutral signal. |
| Reasoning line | Not included. |
| Tracking granularity | Primary by domain (8). Subdomain tracked and shown as a secondary breakdown under each domain. |
| Flag question | One tap. Removes from rotation, lands in the next coaching export. |
| Session length | Target 10 questions. After 10, a "keep going" option with no cap. Resumable mid-session. |
| Flashcards | Separate section. Concrete, specific facts you would not otherwise know. Per-card confidence level persists and is shown when the card returns. |
| Interleaving | Coach mode mixes domains by default. Drill mode is single domain or subdomain. |

## Modes

1. **Coach** — adaptive feed. Weak subdomains weighted up, due-for-review next, small random slice.
2. **Drill** — pick a domain, or a subdomain within it. Same question player, same tracking.
3. **Mock Test** — 100 questions, official domain weights, timed (3h clock shown, not enforced), no feedback until the end, per-domain and per-subdomain breakdown after.
4. **Flashcards** — spaced repetition over fact cards. Filter by domain. Shows last confidence level on return.
5. **Progress** — mastery per domain over time, subdomain breakdown on tap, flagged items, export button.

Every answer in every mode writes the same attempt record. Nothing is untracked.

## Question player (Coach, Drill)

1. Stem + four options. Tap an option to answer. That is the only required tap.
2. Reveal: correct/incorrect, then the Socratic ladder (2–3 guiding questions, each
   tap reveals the next step), then the full explanation: why the right option is
   right, and why each distractor is wrong.
3. Optional confidence chips alongside the reveal: **Sure / Fairly sure / Guessing**.
   Tapping one updates the attempt; ignoring it is fine.
4. Flag button on every question.
5. Next. Session counter shows n/10, then "Session done — keep going?" with no cap.

The ladder shows on correct answers too, collapsed by default with one tap to open.

## Flashcard player

1. Front: prompt. Tap to flip.
2. Back: fact, plus a one-line "why it matters for the exam" and the subdomain tag.
3. If the card has been seen before, the previous confidence level is shown on the back
   ("Last time: Shaky") so you can see whether you are moving up.
4. Optional confidence chips, four levels: **No idea / Shaky / Know it / Solid**.
   Tap one to set the new level (up or down). Skipping keeps the previous level.
5. Levels map to FSRS grades (Again / Hard / Good / Easy). A skipped rating is scheduled
   as a neutral review that keeps the current stability.
6. Full rating history per card is kept, not just the latest level.

## Adaptive engine

- **Flashcards:** FSRS scheduling. Rating = grade. Skip = neutral review.
- **Questions:** per-subdomain mastery score in [0, 1]. Update on each attempt:
  - correct + Sure → strong positive
  - correct + Fairly sure → positive
  - correct + Guessing → weak positive
  - correct + unrated → positive (neutral weight)
  - wrong + Guessing → mild negative
  - wrong + unrated → negative
  - wrong + Sure → strong negative (misconception signal, also surfaced in export)
- Domain mastery = subdomain scores weighted by question count in that subdomain.
- Coach selection: sample subdomains with probability ∝ (1 − mastery) + floor, then
  prefer questions not seen recently, then questions never seen. ~10% pure random.
- Questions are never permanently retired except by flag. Difficulty rises as
  subdomain mastery rises.
- Time per question is recorded. Not used for scoring in v1, exported for the coach.

## Content model

See `content/schema/`. Summary:

- **Domains (8)** with official 2024 weights. **Subdomains** follow the 2024 ISC2 exam
  outline headings (e.g. "1.9 Risk management concepts").
- **Question**: stable id, domain, subdomain, difficulty 1–3, stem, 4 options, correct
  index, ladder[], explanation{correct, distractors[]}, tags (e.g. `manager-mindset`),
  pack id, version.
- **Flashcard**: stable id, domain, subdomain, front, back, whyItMatters, tags, pack id.
- **Pack**: a versioned JSON file of questions and cards. Packs are additive. Same id in a
  newer pack = replace. A pack can also list ids to retire.
- The app ships with `pack-000-base`. Later packs come from the coaching loop.
- Content manifest lists packs. When online the app fetches the manifest, pulls any new
  packs, caches them. Everything then works offline.

### Content quality gates (generation side)

1. Generated per domain by one agent against the schema.
2. Every question reviewed by a second agent for: factual accuracy, single defensible
   answer, no "all of the above", CISSP style (manager mindset where appropriate),
   distractors plausible not silly, explanation actually explains the distractors.
3. Schema validation before a pack is accepted.
4. Flagged questions from the loop are re-reviewed and fixed or retired.

Batch one target: ~400 questions (50/domain, difficulty spread 40/40/20), ~300 cards.

## Export format

One JSON file, see `content/schema/export.schema.json`. Contains:

- app version, content manifest version, export timestamp
- every attempt since the last export (and optionally all-time): question id, mode,
  result, confidence, time ms, timestamp
- current mastery per subdomain and per domain
- flashcard state per card: level, history, FSRS fields
- flagged question ids with optional note
- "confident-wrong" list (wrong + Sure) as a convenience

### Getting the export to the Mac

Export → iOS share sheet → **Save to Files** → iCloud Drive / CISSP Coach /.
The Mac sees it at `~/Library/Mobile Documents/com~apple~CloudDocs/CISSP Coach/`.
No backend. The coaching skill reads the newest file there.

## Coaching loop (Claude Code side)

A project skill, `/cissp-coach`, run whenever wanted, weekly at minimum:

1. Read the newest export. Diff against the last processed export.
2. Analyse: weakest subdomains, confident-wrong clusters, flagged questions, flashcards
   stuck at low levels, time outliers, domain trend since last run.
3. Write a short coaching note (what to read this week, what is improving).
4. Generate a new content pack targeted at the gaps: new questions for weak subdomains,
   sibling flashcards for low-level cards (same fact, different angle), new cards for
   facts that confident-wrong answers reveal are missing.
5. Run the quality gates. Fix or retire flagged items.
6. Bump the manifest, commit, deploy. The phone picks it up next time it is online.

## Phases

- **Phase 0 — Contract and schema.** DONE 2026-10-13. This file, `content/schema/*`, subdomain taxonomy.
- **Phase 1 — Shell.** DONE 2026-10-13. Clone healthHub skeleton. IndexedDB layer, attempt log, question
  player, flashcard player, Coach + Drill + Flashcards modes, service worker, manifest
  fetch + cache, export. Runs on phone with a tiny seed pack.
- **Phase 2 — Content batch one.** DONE 2026-10-13: 400 questions + 304 cards, 8 generator agents + 8 reviewer
  agents (0 answer changes; ~230 length-balance fixes, ~130 ladder-leak fixes). Shipped as pack-000-base.
- **Phase 3 — Adaptive engine.** DONE 2026-10-13. Mastery model, FSRS, Coach selection, confidence weighting.
- **Phase 4 — Mock Test + Progress.** DONE 2026-10-13. Weighted paper builder, results screen, mastery charts,
  subdomain breakdown.
- **Phase 5 — Coaching loop.** `/cissp-coach` skill, iCloud export path, pack pipeline.
- **Phase 6 — Ongoing.** Run the loop. Grow the bank toward ~1,200 questions aimed at gaps.

## Known limitations (accepted)

- No official ISC2 questions exist outside the exam. All content is generated and may
  contain errors. The reviewer pass and the flag button are the mitigation.
- Mock score measures relative weakness, not pass probability.
- Offline Socratic ladder is scripted, not responsive.
- Exam outline refreshed April 2024 (verified against isc2.org 2026-10-13; no CISSP refresh announced, the Aug 2026 change is CCSP). ISC2 runs a triennial job-task analysis, so a 2027 refresh is plausible. Check again near the exam date.
- Eligibility: 5 years relevant experience (4 with a degree) for full CISSP, otherwise
  Associate of ISC2 on passing.
