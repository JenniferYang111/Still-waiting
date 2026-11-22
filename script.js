const WAIT_MS = 15000;
const BURST_MS = 720;
const FILL_MS = 4200;
const questions = [
  {
    prompt: 'What are your odds if you switch?',
    context: 'One of three doors hides a randomly placed prize. After you pick, the host always opens another door they know is empty and offers you a switch.',
    options: ['One in three', 'One in two', 'Two in three', 'Certain to win'],
    correct: 2,
    explanation: 'Switching wins two times out of three. Your first pick has a one-in-three chance, and switching wins whenever that first pick was wrong.'
  },
  {
    prompt: 'Would you trust the alert?',
    context: 'An alert flags 10 hacked accounts and 99 safe ones. What’s the chance a randomly chosen flagged account was hacked?',
    options: ['About 1%', 'About 9%', 'About 50%', 'About 90%'],
    correct: 1,
    explanation: 'Ten of the 109 flagged accounts are compromised. That puts the chance at about 9%.'
  },
  {
    prompt: 'Which coin did the witness pick?',
    context: 'A witness picks either a fair coin or a double-headed coin at random and flips three heads. What’s the chance they picked the double-headed coin?',
    options: ['One in eight', 'One in two', 'Three in four', 'Eight in nine'],
    correct: 3,
    explanation: 'Three heads always happens with the double-headed coin and happens one time in eight with the fair coin. Given those flips, the chance of the double-headed coin is eight in nine.'
  }
];

const byId = (id) => document.getElementById(id);
const stage = byId('stage');
const redField = byId('red-field');
const ink = redField.getContext('2d');
const screen = byId('screen');
const prompt = byId('prompt');
const context = byId('context');
const choices = byId('choices');
const waiting = byId('waiting');
const speed = byId('speed');
const response = byId('attempt-response');
const outcome = byId('outcome');
const title = byId('outcome-title');
const again = byId('again');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let questionIndex = 0;
let attempts = 0;
let heldMs = 0;
let holdStarted = null;
let submitted;
let deadline;
let escalation;
let animation = null;
let bubbles = [];
let burstStarted = -Infinity;
let width = 0;
let height = 0;

function fitBubbles() {
  width = redField.clientWidth;
  height = redField.clientHeight;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  redField.width = Math.round(width * scale);
  redField.height = Math.round(height * scale);
  ink.setTransform(scale, 0, 0, scale, 0, 0);
  const columns = Math.max(1, Math.ceil(width / 42));
  const rows = Math.max(1, Math.ceil(height / 42));
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const radius = Math.hypot(cellWidth, cellHeight) * .74;
  bubbles = Array.from({ length: rows * columns }, (_, index) => {
    const x = (index % columns + .5) * cellWidth;
    const y = (Math.floor(index / columns) + .5) * cellHeight;
    return {
      x, y, radius, entry: Math.random() ** .55 * .82,
      angle: Math.atan2(y - height / 2, x - width / 2) + (Math.random() - .5) * .9,
      force: (.45 + Math.random() * .7) * Math.hypot(width, height),
      color: ['#ad1234', '#d71d40', '#ee3151', '#f84a60'][index % 4]
    };
  });
  bubbles.sort((first, second) => first.entry - second.entry);
}

function paintBubble(x, y, radius, color) {
  ink.fillStyle = color;
  ink.beginPath();
  ink.arc(x, y, radius, 0, Math.PI * 2);
  ink.fill();
}

function drawBubbles(now) {
  animation = null;
  if (now >= deadline) return;
  const elapsed = holdStarted === null ? 0 : now - holdStarted;
  const progress = Math.min(1, Math.max(0, heldMs + elapsed) / FILL_MS);
  if (progress === 1 && burstStarted === -Infinity) {
    burstStarted = now;
    holdStarted = null;
    heldMs = FILL_MS;
    speed.classList.remove('holding');
    waiting.hidden = true;
  }
  const burst = Math.max(0, Math.min(1, (now - burstStarted) / BURST_MS));
  const scatter = reducedMotion.matches ? 0 : 1 - (1 - burst) ** 2;
  ink.clearRect(0, 0, width, height);
  if (burstStarted !== -Infinity && burst === 1) {
    redField.classList.add('blackout');
    return;
  }
  if (burst < 1) {
    ink.globalAlpha = 1 - burst;
    for (const bubble of bubbles) {
      const dx = Math.cos(bubble.angle);
      const dy = Math.sin(bubble.angle);
      const x = bubble.x + dx * bubble.force * scatter;
      const y = bubble.y + dy * bubble.force * scatter;
      const radius = bubble.radius * (1 - .78 * scatter);
      paintBubble(x, y, radius, bubble.color);
      if (scatter > 0) paintBubble(x - dx * 34, y - dy * 34, Math.max(1, radius * .24), '#ff9d9c');
    }
  }
  ink.globalAlpha = 1;
  if (burstStarted === -Infinity && progress > 0) {
    const tint = 'hsl(' + (343 + 11 * progress) + ' 71% ' + (12 + 28 * progress) + '%)';
    redField.style.setProperty('--press-tint', tint);
    const count = Math.ceil(bubbles.length * progress ** 2);
    const size = .25 + .75 * progress;
    for (let i = 0; i < count; i += 1) {
      const bubble = bubbles[i];
      paintBubble(bubble.x, bubble.y, bubble.radius * size, bubble.color);
    }
  }
  if (holdStarted !== null || burst < 1) animation = requestAnimationFrame(drawBubbles);
}

window.addEventListener('resize', () => {
  if (stage.dataset.phase !== 'waiting' || redField.classList.contains('blackout')) return;
  fitBubbles();
  if (animation === null) drawBubbles(performance.now());
});

function showQuestion() {
  const question = questions[questionIndex];
  stage.dataset.phase = 'ready';
  redField.classList.remove('waiting');
  redField.classList.remove('blackout');
  redField.style.removeProperty('--press-tint');
  attempts = 0;
  choices.hidden = false;
  screen.hidden = true;
  waiting.hidden = true;
  outcome.hidden = true;
  again.hidden = true;
  prompt.textContent = question.prompt;
  context.textContent = question.context;
  const buttons = question.options.map((option, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    const letter = document.createElement('strong');
    letter.textContent = 'ABCD'[index];
    button.append(letter, document.createTextNode(' ' + option));
    button.addEventListener('click', () => submit(index));
    return button;
  });
  choices.replaceChildren(...buttons);
}

function submit(index) {
  if (stage.dataset.phase !== 'ready') return;
  const question = questions[questionIndex];
  submitted = { correct: index === question.correct, explanation: question.explanation };
  deadline = performance.now() + WAIT_MS;
  heldMs = 0;
  holdStarted = null;
  burstStarted = -Infinity;
  stage.dataset.phase = 'waiting';
  redField.classList.add('waiting');
  fitBubbles();
  context.textContent = 'You chose ' + 'ABCD'[index] + ' · ' + question.options[index];
  response.textContent = '';
  byId('readout').textContent = 'Answer submitted';
  byId('signal').textContent = 'Pending';
  byId('reaction').textContent = 'Waiting for feedback.';
  screen.hidden = false;
  waiting.hidden = false;
  choices.hidden = true;
  speed.focus();
  escalation = setTimeout(() => {
    if (performance.now() >= deadline || burstStarted !== -Infinity) return;
    byId('reaction').textContent = 'The answer is still pending.';
  }, 4200);
  setTimeout(reveal, Math.ceil(deadline - performance.now()));
}

function reveal() {
  const remaining = deadline - performance.now();
  if (remaining > 0) {
    setTimeout(reveal, Math.ceil(remaining));
    return;
  }
  clearTimeout(escalation);
  cancelAnimationFrame(animation);
  animation = null;
  holdStarted = null;
  speed.classList.remove('holding');
  ink.clearRect(0, 0, width, height);
  const moveFocus = document.activeElement === speed || burstStarted !== -Infinity;
  stage.dataset.phase = 'result';
  redField.classList.remove('waiting');
  redField.classList.remove('blackout');
  byId('readout').textContent = 'Feedback ready';
  byId('signal').textContent = 'Done';
  byId('reaction').textContent = 'The wait is over.';
  waiting.hidden = true;
  title.textContent = submitted.correct ? 'Correct' : 'Incorrect';
  byId('explanation').textContent = submitted.explanation;
  byId('reflection').textContent = attempts === 0
    ? 'You waited without holding the Spacebar.'
    : 'You held the Spacebar ' + attempts + (attempts === 1 ? ' time.' : ' times.');
  outcome.hidden = false;
  again.hidden = false;
  if (moveFocus) title.focus();
}

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || stage.dataset.phase !== 'waiting') return;
  event.preventDefault();
  if (event.repeat || holdStarted !== null || burstStarted !== -Infinity || performance.now() >= deadline) return;
  attempts += 1;
  holdStarted = performance.now();
  speed.classList.add('holding');
  response.textContent = 'Bubbles building…';
  animation = requestAnimationFrame(drawBubbles);
});

function pauseBubbles() {
  if (holdStarted === null) return;
  const now = performance.now();
  heldMs = Math.min(FILL_MS, heldMs + now - holdStarted);
  holdStarted = null;
  speed.classList.remove('holding');
  response.textContent = 'Bubbles paused.';
  cancelAnimationFrame(animation);
  drawBubbles(now);
}

window.addEventListener('keyup', (event) => {
  if (event.code !== 'Space' || stage.dataset.phase !== 'waiting') return;
  event.preventDefault();
  pauseBubbles();
});
window.addEventListener('blur', pauseBubbles);

again.addEventListener('click', () => {
  questionIndex = (questionIndex + 1) % questions.length;
  showQuestion();
  prompt.focus();
});
showQuestion();
