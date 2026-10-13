// Question player — Coach and Drill share it. Route: #play (resumes the active
// session). PLAN.md "Question player": tap an option (only required tap) →
// reveal → ladder → explanation → optional confidence chips → next.

import { h, clear, icon, topbar, toast, go, confirm } from '../ui.js';
import { getContent, subdomainName, domainOf } from '../content.js';
import { get } from '../db.js';
import { activeSession, saveSession, endSession, nextQuestion, recordAttempt, setAttemptConfidence, toggleFlag, SESSION_TARGET } from '../session.js';
import { CONFIDENCE, CONF_LABEL } from '../engine.js';

const LETTERS = ['A', 'B', 'C', 'D'];

export async function renderPlay(root) {
  const session = await activeSession();
  if (!session) { go('#coach'); return; }
  const content = getContent();
  let question = session.currentId ? content.questions.get(session.currentId) : null;
  if (!question) {
    question = await nextQuestion(session);
    if (!question) { root.append(topbar('No questions'), h('p', { class: 'pad muted', text: 'Nothing available for this filter.' })); return; }
    session.currentId = question.id;
    await saveSession(session);
  }
  await showQuestion(root, session, question);
}

async function showQuestion(root, session, q) {
  clear(root);
  const startedAt = Date.now();
  let attempt = null;
  const title = session.mode === 'drill'
    ? (session.filter?.subdomain ? subdomainName(session.filter.subdomain) : session.filter?.domain ? domainOf(session.filter.domain).name : 'Drill')
    : 'Coach';
  const qstate = await get('qstate', q.id);
  const flagBtn = h('button', { class: `icon-btn ${qstate?.flagged ? 'flagged' : ''}`, 'aria-label': 'Flag question', onclick: () => onFlag() }, icon(qstate?.flagged ? 'flagFill' : 'flag'));

  root.append(topbar(title, {
    onBack: async () => {
      // Leaving mid-question keeps the session resumable from the tab.
      go(session.mode === 'drill' ? '#drill' : '#coach');
    },
    right: flagBtn,
  }));

  const counter = h('div', { class: 'play-meta' },
    h('span', { class: 'pill', text: `${session.count + 1}${session.count + 1 <= SESSION_TARGET ? ` / ${SESSION_TARGET}` : ''}` }),
    h('span', { class: 'pill dim', text: `D${q.domain} · ${q.subdomain}` }),
    h('span', { class: `pill diff-${q.difficulty}`, text: ['Easy', 'Medium', 'Hard'][q.difficulty - 1] }),
  );
  const stem = h('p', { class: 'stem', text: q.stem });
  const options = q.options.map((opt, i) => h('button', { class: 'opt', onclick: () => answer(i) },
    h('span', { class: 'opt-letter', text: LETTERS[i] }), h('span', { class: 'opt-text', text: opt })));
  const optWrap = h('div', { class: 'opts' }, options);
  const reveal = h('div', { class: 'reveal', hidden: true });
  root.append(h('div', { class: 'play' }, counter, stem, optWrap, reveal));

  async function onFlag() {
    const flagged = await toggleFlag(q.id);
    flagBtn.classList.toggle('flagged', flagged);
    clear(flagBtn); flagBtn.append(icon(flagged ? 'flagFill' : 'flag'));
    toast(flagged ? 'Flagged for review — removed from rotation' : 'Flag removed');
  }

  async function answer(i) {
    if (attempt) return;
    const timeMs = Date.now() - startedAt;
    options.forEach((b) => { b.disabled = true; });
    options[i].classList.add(i === q.correct ? 'right' : 'wrong');
    options[q.correct].classList.add('right');
    attempt = await recordAttempt({ question: q, chosen: i, timeMs, mode: session.mode, sessionId: session.id });
    session.count++; if (attempt.correct) session.correct++;
    session.questionIds.push(q.id); session.currentId = null;
    await saveSession(session);
    buildReveal(attempt.correct);
    reveal.hidden = false;
    reveal.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function buildReveal(correct) {
    clear(reveal);
    const verdict = h('div', { class: `verdict ${correct ? 'ok' : 'bad'}` },
      h('strong', { text: correct ? 'Correct' : 'Not quite' }),
      h('span', { class: 'muted', text: correct ? ' — here is why, in case it was a guess.' : ` — the answer is ${LETTERS[q.correct]}.` }));

    // Confidence chips: optional, never block Next.
    const chips = h('div', { class: 'chips' },
      h('span', { class: 'chips-label', text: 'How sure were you?' }),
      CONFIDENCE.map((c) => h('button', { class: 'chip', text: CONF_LABEL[c], onclick: async (e) => {
        const me = e.currentTarget;
        for (const b of chips.querySelectorAll('.chip')) b.classList.remove('on');
        me.classList.add('on');
        attempt = await setAttemptConfidence(attempt, c);
      } })));

    // Socratic ladder: one step at a time. Collapsed on correct answers.
    const ladder = h('div', { class: 'ladder' });
    let step = 0;
    const stepsEl = h('ol', { class: 'ladder-steps' });
    const more = h('button', { class: 'btn ghost small', text: 'Next hint', onclick: nextStep });
    const explainBtn = h('button', { class: 'btn ghost small', text: 'Show explanation', onclick: showExplanation, hidden: true });
    function nextStep() {
      if (step < q.ladder.length) stepsEl.append(h('li', { text: q.ladder[step++] }));
      if (step >= q.ladder.length) { more.hidden = true; explainBtn.hidden = false; }
    }
    const explanation = h('div', { class: 'explain', hidden: true },
      h('h4', { text: `Why ${LETTERS[q.correct]} is right` }),
      h('p', { text: q.explanation.correct }),
      h('h4', { text: 'Why the others are not' }),
      h('ul', {}, q.explanation.distractors.map((d) => h('li', {}, h('strong', { text: `${LETTERS[d.option]}. ` }), d.why))),
    );
    function showExplanation() { explanation.hidden = false; explainBtn.hidden = true; more.hidden = true; }
    ladder.append(h('div', { class: 'ladder-head' }, h('h4', { text: 'Think it through' }), more, explainBtn), stepsEl, explanation);

    let body;
    if (correct) {
      const toggle = h('button', { class: 'btn ghost small', text: 'Walk through it anyway', onclick: () => { ladder.hidden = false; toggle.hidden = true; nextStep(); } });
      ladder.hidden = true;
      body = [toggle, ladder];
    } else {
      body = [ladder];
      nextStep();
    }
    const nextBtn = h('button', { class: 'btn primary wide', text: session.count >= SESSION_TARGET ? 'Finish question' : 'Next question', onclick: next });
    reveal.append(verdict, chips, ...body, nextBtn);
  }

  async function next() {
    if (session.count >= SESSION_TARGET && (session.count - SESSION_TARGET) % 5 === 0) {
      return showSessionDone();
    }
    const nq = await nextQuestion(session);
    if (!nq) return showSessionDone(true);
    session.currentId = nq.id; await saveSession(session);
    await showQuestion(root, session, nq);
    window.scrollTo(0, 0);
  }

  function showSessionDone(exhausted = false) {
    clear(root);
    const acc = session.count ? Math.round((session.correct / session.count) * 100) : 0;
    root.append(
      topbar('Session', { onBack: () => go(session.mode === 'drill' ? '#drill' : '#coach') }),
      h('div', { class: 'pad' },
        h('div', { class: 'card center' },
          h('div', { class: 'big', text: `${session.correct} / ${session.count}` }),
          h('p', { class: 'muted', text: exhausted ? 'That is every question available for this filter.' : `${acc}% correct this session. Every answer is tracked.` }),
        ),
        !exhausted && h('button', { class: 'btn primary wide', text: 'Keep going', onclick: async () => {
          const nq = await nextQuestion(session);
          session.currentId = nq.id; await saveSession(session);
          await showQuestion(root, session, nq);
        } }),
        h('button', { class: 'btn ghost wide', text: 'Done', onclick: async () => { await endSession(session); go(session.mode === 'drill' ? '#drill' : '#coach'); } }),
      ),
    );
  }
}
