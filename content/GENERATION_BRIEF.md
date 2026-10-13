# Content generation brief (pinned)

You are writing CISSP exam-prep content for one domain. Output ONE file:
`content/gen/d<N>.json` with shape `{"questions":[...],"flashcards":[...]}`.
Validate with `node scripts/validate-content.mjs content/gen/d<N>.json --domain <N>`
and fix until it prints OK with no errors. Warnings should be addressed where sensible.

Read first: `content/schema/question.schema.json`, `content/schema/flashcard.schema.json`,
and your domain's entry in `content/domains.json` (subdomain ids and names).

## Quantities

- **50 questions**: difficulty 1 ×20, 2 ×20, 3 ×10. Spread across ALL subdomains of the
  domain (minimum 2 per subdomain; weight the rest toward the subdomains with the most
  exam-relevant material). Correct answer position must be roughly even across A/B/C/D.
- **38 flashcards**: at least 2 per subdomain.

## IDs

- Questions: `q-d<N>-sub<SS>-<seq>` where SS is the subdomain number zero-padded to 2
  digits and seq is 3 digits from 001 within that subdomain. Example: subdomain 1.9 →
  `q-d1-sub09-001`; subdomain 7.12 → `q-d7-sub12-003`.
- Flashcards: same with `f-` prefix: `f-d3-sub06-001`.

## Question style — this matters more than anything

CISSP tests *judgement*, not recall. Match the real exam:

1. **Think like a senior security manager / risk adviser**, not an engineer. When options
   include a technical fix and a governance/risk/business answer, the exam usually wants
   the one that addresses risk, policy, or business impact first. Tag these `manager-mindset`.
2. Most stems are **short scenarios** (2–4 sentences) ending in "What should the security
   manager do FIRST?", "Which is the BEST…", "MOST appropriate", "PRIMARY purpose",
   "GREATEST risk". Capitalise the qualifier. Tag `scenario` and/or `best-answer`.
3. Some stems are direct knowledge checks (tag `definition`), some are ordering/sequence
   (tag `ordering`), a few are calculations like ALE/SLE/ARO (tag `calculation`).
4. **Exactly one defensible answer.** Every distractor must be plausible to someone with
   partial knowledge, and wrong for a reason you can state. No jokes, no obviously silly
   options, no "all/none of the above", no "A and C".
5. Keep options parallel in length and grammar. The correct answer must NOT be the longest
   or most detailed option.
6. Avoid negative stems ("Which is NOT…") except sparingly at difficulty 1.
7. Difficulty: 1 = recognises a definition or principle; 2 = applies it in a scenario with
   one plausible distractor; 3 = subtle scenario where two options are nearly right and
   the manager-mindset or a precise distinction separates them.
8. Use ISC2 terminology (e.g. "data owner", "data custodian", "due care", "due diligence",
   "residual risk"). US spelling is fine; be consistent.
9. No real company names. No current-events dependence.

## Socratic ladder (`ladder`, 2–3 entries)

Guiding questions that lead the learner toward the answer WITHOUT stating it. Each step
narrows: step 1 reframes what the question is really asking (e.g. "Is this asking what is
technically possible, or what the organisation should prioritise?"); step 2 points at the
distinguishing concept; step 3 (optional) eliminates the strongest distractor. Every step
ends with a question mark. Never name the correct option letter or text in the ladder.

## Explanation

- `explanation.correct`: 2–4 sentences on WHY the correct option is right, including the
  principle the exam is testing.
- `explanation.distractors`: one entry per wrong option, 1–3 sentences each, stating the
  specific reason it is wrong or less appropriate. "Why someone would pick it, and why
  that is a mistake" is the ideal shape.

## Flashcards — "things I would not otherwise know"

Concrete, specific, examinable facts. Good: named models and what they enforce (Bell-LaPadula
rules), fixed numbers (key sizes, fire classes, ISO numbers), orderings (incident response
phases in ISC2 order), precise distinctions (due care vs due diligence, DRP vs BCP),
formulas, who-does-what (data owner vs custodian responsibilities). Bad: vague principles
("security is important"), anything a security professional already knows cold.

- `front`: a prompt, question, or term. Short.
- `back`: the fact. One idea. Under 300 characters.
- `whyItMatters`: one line on how the exam uses it ("Exam loves asking which model addresses
  integrity vs confidentiality").

## Output

Write valid JSON only. Set `"reviewed": false` on every question. Do not add fields the
schema does not allow. When the validator prints OK, you are done — report the counts.
