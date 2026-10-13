# Review brief (pinned) — second-agent quality gate

You are reviewing one domain file `content/gen/d<N>.json` written by another agent. Edit it
in place. When done, `node scripts/validate-content.mjs content/gen/d<N>.json --domain <N>`
must print OK with zero errors. Read `content/GENERATION_BRIEF.md` first for the standard.

Go through EVERY question and EVERY flashcard. For each question decide:

1. **Factually correct?** The marked answer must be what ISC2 / the CISSP Official Study
   Guide would say. If you believe the marked answer is wrong, fix the `correct` index
   AND the explanation, and mention it in your report.
2. **Exactly one defensible answer?** If a distractor is also arguably correct, rewrite the
   distractor so it is clearly wrong, or tighten the stem.
3. **Manager-mindset consistent?** Where a governance/risk answer and a technical answer
   compete, the CISSP answer is the governance/risk one unless the stem clearly asks for
   a technical control. Fix stems/options that violate this.
4. **Length giveaway?** The correct option must not be the longest or the most detailed.
   Pad distractors to similar length and specificity, or trim the correct option.
   Rough rule: no option more than 1.4× the length of the shortest, unless all are short
   terms.
5. **Ladder leaks?** No ladder step may name or paraphrase the correct option. Steps must
   be questions. Steps should narrow: reframe → distinguishing concept → eliminate strongest
   distractor.
6. **Explanations earn their place?** `explanation.correct` names the principle being
   tested. Each distractor `why` says why someone might pick it and why that is wrong.
7. **Style:** no "NOT" stems above difficulty 1, no trick wording, consistent terminology,
   no real company names.

For each flashcard: is the fact correct and precise? Is `back` one fact under 300 chars?
Is `whyItMatters` specific to how the exam uses it? Fix in place.

When a question passes (after any fixes), set `"reviewed": true`. If a question is beyond
repair, delete it and write a replacement with the SAME id so coverage is unchanged.

Report: counts of questions fixed by category (answer changed / distractor rewritten /
length balanced / ladder fixed / explanation improved / replaced), and list the ids where
you changed the correct answer with one line of justification each.
