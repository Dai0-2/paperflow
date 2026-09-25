const DURATION_MS = 28_000;
const QUESTION = 'Why is self-attention useful here?';
const ANSWER = 'Self-attention gives each token a direct path to every other token, so long-range dependencies do not require sequential recurrence. It also lets the model process positions in parallel, which makes training more efficient. Multiple heads can learn different relationships at the same time while keeping the result tied to the source passage.';
const SCENE_TIMES = [1_100, 4_900, 8_600, 13_500, 16_900, 19_800, 22_800, 25_900];

const params = new URLSearchParams(window.location.search);
const autoplay = params.get('autoplay') === '1';
const recording = params.get('recording') === '1';
const requestedScene = Number(params.get('scene'));
const hasScene = Number.isInteger(requestedScene) && requestedScene >= 1 && requestedScene <= 8;

const root = document.documentElement;
const body = document.body;
const showcase = document.querySelector('#showcase');
const openingScene = document.querySelector('.opening-scene');
const workspaceScene = document.querySelector('.workspace-scene');
const libraryScene = document.querySelector('.library-scene');
const endScene = document.querySelector('.end-scene');
const coverPage = document.querySelector('.cover-page');
const detailPage = document.querySelector('.detail-page');
const questionMessage = document.querySelector('.question-message');
const answerMessage = document.querySelector('.answer-message');
const typedQuestion = document.querySelector('[data-typed-question]');
const streamedAnswer = document.querySelector('[data-stream-answer]');
const pageNumber = document.querySelector('[data-page-number]');
const contextPage = document.querySelector('[data-context-page]');
const controls = document.querySelector('.debug-controls');
const slider = controls.querySelector('input');
const output = controls.querySelector('output');
const pauseButton = controls.querySelector('[data-control="pause"]');
const restartButton = controls.querySelector('[data-control="restart"]');
const citationButton = document.querySelector('.citation-button');
const askButton = document.querySelector('.selection-menu button');
const captions = Array.from(document.querySelectorAll('[data-caption]'));
const thumbnails = Array.from(document.querySelectorAll('[data-thumbnail]'));

body.dataset.autoplay = String(autoplay);
body.dataset.recording = String(recording);

let currentMs = hasScene ? SCENE_TIMES[requestedScene - 1] : 0;
let running = !hasScene || autoplay;
let done = false;
let frameId = 0;
let previousFrame = 0;

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function progress(time, start, end) {
  if (end <= start) return time >= end ? 1 : 0;
  return clamp((time - start) / (end - start));
}

function smooth(value) {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
}

function mix(start, end, amount) {
  return start + (end - start) * smooth(amount);
}

function envelope(time, start, end, fadeIn = 350, fadeOut = 350) {
  return Math.min(
    progress(time, start, start + fadeIn),
    1 - progress(time, end - fadeOut, end),
  );
}

function setVar(name, value) {
  root.style.setProperty(name, String(value));
}

function setOpacity(element, value) {
  element.style.opacity = String(clamp(value));
}

function setCaption(scene, time, start, end) {
  const caption = captions.find((item) => Number(item.dataset.caption) === scene);
  if (!caption) return;
  const opacity = envelope(time, start, end, 300, 300);
  caption.style.opacity = String(opacity);
  caption.style.transform = `translateY(${(1 - opacity) * 9}px)`;
}

function setCursor(time) {
  let opacity = 0;
  let x = 1450;
  let y = 820;

  if (time >= 6_900 && time < 9_250) {
    opacity = envelope(time, 6_900, 9_250, 250, 180);
    if (time < 7_500) {
      const p = progress(time, 6_900, 7_500);
      x = mix(1420, 670, p);
      y = mix(780, 317, p);
    } else if (time < 8_250) {
      const p = progress(time, 7_500, 8_250);
      x = mix(670, 1_080, p);
      y = mix(317, 347, p);
    } else if (time < 8_700) {
      const p = progress(time, 8_250, 8_700);
      x = mix(1_080, 790, p);
      y = mix(347, 482, p);
    } else {
      const p = progress(time, 8_700, 9_250);
      x = mix(790, 1_595, p);
      y = mix(482, 867, p);
    }
  } else if (time >= 12_100 && time < 15_100) {
    opacity = envelope(time, 12_100, 15_100, 220, 250);
    if (time < 13_000) {
      const p = progress(time, 12_100, 13_000);
      x = mix(1_700, 1_510, p);
      y = mix(760, 611, p);
    } else {
      const p = progress(time, 13_000, 14_200);
      x = mix(1_510, 878, p);
      y = mix(611, 357, p);
    }
  } else if (time >= 15_850 && time < 18_650) {
    opacity = envelope(time, 15_850, 18_650, 220, 220);
    if (time < 16_350) {
      const p = progress(time, 15_850, 16_350);
      x = mix(1_300, 326, p);
      y = mix(650, 169, p);
    } else if (time < 17_500) {
      const p = progress(time, 16_350, 17_500);
      x = mix(326, 1_045, p);
      y = mix(169, 704, p);
    } else {
      const p = progress(time, 17_500, 18_250);
      x = mix(1_045, 1_274, p);
      y = mix(704, 735, p);
    }
  } else if (time >= 18_750 && time < 19_650) {
    opacity = envelope(time, 18_750, 19_650, 160, 160);
    const p = progress(time, 18_750, 19_420);
    x = mix(1_650, 1_790, p);
    y = mix(600, 116, p);
  }

  setVar('--cursor-opacity', opacity.toFixed(4));
  setVar('--cursor-x', `${x.toFixed(2)}px`);
  setVar('--cursor-y', `${y.toFixed(2)}px`);
}

function render(time) {
  const t = clamp(time, 0, DURATION_MS);
  const scene = t < 3_000 ? 1
    : t < 7_000 ? 2
      : t < 12_000 ? 3
        : t < 16_000 ? 4
          : t < 19_000 ? 5
            : t < 22_000 ? 6
              : t < 25_000 ? 7
                : 8;

  body.dataset.scene = String(scene);

  const openingOpacity = 1 - progress(t, 2_650, 3_250);
  const workspaceOpacity = Math.min(
    progress(t, 2_750, 3_350),
    1 - progress(t, 21_800, 22_400),
  );
  const libraryOpacity = Math.min(
    progress(t, 21_850, 22_450),
    1 - progress(t, 24_700, 25_350),
  );
  const endOpacity = progress(t, 24_850, 25_450);

  setOpacity(openingScene, openingOpacity);
  setOpacity(workspaceScene, workspaceOpacity);
  setOpacity(libraryScene, libraryOpacity);
  setOpacity(endScene, endOpacity);

  setVar('--opening-brand-opacity', 1);
  setVar('--opening-title-opacity', progress(t, 430, 1_180).toFixed(4));
  setVar('--opening-rule-progress', progress(t, 820, 1_580).toFixed(4));
  setVar('--opening-copy-opacity', progress(t, 1_180, 1_760).toFixed(4));

  const readerEnter = progress(t, 2_900, 3_700);
  setVar('--reader-y', `${mix(28, 0, readerEnter).toFixed(2)}px`);
  setVar('--reader-scale', mix(.975, 1, readerEnter).toFixed(5));

  setCaption(2, t, 3_050, 6_850);
  setCaption(3, t, 6_750, 11_850);
  setCaption(4, t, 11_750, 15_850);
  setCaption(5, t, 15_750, 18_850);
  setCaption(6, t, 18_750, 22_150);

  const detailProgress = progress(t, 6_600, 7_180);
  coverPage.style.opacity = String(1 - detailProgress);
  detailPage.style.opacity = String(detailProgress);
  pageNumber.textContent = detailProgress > .5 ? '3' : '1';
  contextPage.textContent = detailProgress > .5 ? 'Current page 3' : 'Current page 1';
  thumbnails.forEach((thumbnail) => {
    thumbnail.classList.toggle('active', thumbnail.dataset.thumbnail === (detailProgress > .5 ? '3' : '1'));
  });

  const selectionProgress = progress(t, 7_450, 8_250);
  setVar('--selection-progress', selectionProgress.toFixed(4));
  setVar('--selection-menu-opacity', envelope(t, 8_050, 9_180, 230, 180).toFixed(4));

  const questionOpacity = progress(t, 8_780, 9_080);
  questionMessage.style.opacity = String(questionOpacity);
  questionMessage.style.transform = `translateY(${(1 - questionOpacity) * 8}px)`;
  typedQuestion.textContent = QUESTION.slice(0, Math.floor(QUESTION.length * progress(t, 8_900, 9_900)));

  const answerOpacity = progress(t, 10_000, 10_360);
  answerMessage.style.opacity = String(answerOpacity);
  answerMessage.style.transform = `translateY(${(1 - answerOpacity) * 8}px)`;
  streamedAnswer.textContent = ANSWER.slice(0, Math.floor(ANSWER.length * progress(t, 10_300, 11_820)));
  setVar('--stream-caret-opacity', t >= 10_300 && t < 11_860 ? 1 : 0);
  setVar('--citation-opacity', progress(t, 11_320, 11_760).toFixed(4));
  setVar('--answer-actions-opacity', progress(t, 11_520, 11_900).toFixed(4));

  const citationPulse = envelope(t, 12_950, 15_300, 240, 500);
  setVar('--citation-pulse-opacity', citationPulse.toFixed(4));
  setVar('--citation-pulse-size', progress(t, 13_020, 14_050).toFixed(4));

  setVar('--annotation-progress', progress(t, 16_500, 17_520).toFixed(4));
  setVar('--annotation-note-opacity', envelope(t, 17_350, 19_180, 300, 250).toFixed(4));

  const memoryProgress = progress(t, 19_050, 19_620);
  setVar('--chat-view-opacity', (1 - memoryProgress).toFixed(4));
  setVar('--memory-view-opacity', memoryProgress.toFixed(4));

  const libraryEnter = progress(t, 21_950, 22_700);
  setVar('--library-y', `${mix(24, 0, libraryEnter).toFixed(2)}px`);
  setVar('--library-scale', mix(.98, 1, libraryEnter).toFixed(5));

  setVar('--end-brand-opacity', progress(t, 25_050, 25_650).toFixed(4));
  setVar('--end-title-opacity', progress(t, 25_350, 26_150).toFixed(4));
  setVar('--end-cta-opacity', progress(t, 26_000, 26_550).toFixed(4));
  setVar('--end-meta-opacity', progress(t, 26_350, 26_900).toFixed(4));

  setCursor(t);

  slider.value = String(Math.round(t));
  output.value = `${(t / 1000).toFixed(1).padStart(4, '0')} / 28.0`;
  currentMs = t;
}

function tick(timestamp) {
  if (!previousFrame) previousFrame = timestamp;
  const delta = timestamp - previousFrame;
  previousFrame = timestamp;

  if (running && !done) {
    currentMs = Math.min(DURATION_MS, currentMs + delta);
    render(currentMs);
    if (currentMs >= DURATION_MS) {
      running = false;
      done = true;
      window.__paperflowPromo.done = true;
      window.dispatchEvent(new CustomEvent('paperflow:promo-complete'));
    }
  }

  frameId = requestAnimationFrame(tick);
}

function seek(milliseconds) {
  done = false;
  window.__paperflowPromo.done = false;
  currentMs = clamp(Number(milliseconds) || 0, 0, DURATION_MS);
  render(currentMs);
}

function play() {
  if (currentMs >= DURATION_MS) seek(0);
  previousFrame = performance.now();
  running = true;
  done = false;
  window.__paperflowPromo.done = false;
  pauseButton.textContent = 'Pause';
}

function pause() {
  running = false;
  pauseButton.textContent = 'Play';
}

function resizeStage() {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  setVar('--viewport-scale', scale.toFixed(6));
}

restartButton.addEventListener('click', () => {
  seek(0);
  play();
});

pauseButton.addEventListener('click', () => {
  if (running) pause();
  else play();
});

slider.addEventListener('input', () => {
  pause();
  seek(Number(slider.value));
});

citationButton.addEventListener('click', () => seek(13_350));
askButton.addEventListener('click', () => seek(8_850));
window.addEventListener('resize', resizeStage);

window.__paperflowPromo = {
  durationMs: DURATION_MS,
  ready: false,
  done: false,
  get currentMs() {
    return currentMs;
  },
  seek,
  play,
  pause,
};

async function initialize() {
  resizeStage();
  await document.fonts.ready;
  const images = Array.from(document.images);
  await Promise.all(images.map((image) => image.complete ? Promise.resolve() : image.decode().catch(() => undefined)));
  render(currentMs);
  window.__paperflowPromo.ready = true;
  window.dispatchEvent(new CustomEvent('paperflow:promo-ready'));
  frameId = requestAnimationFrame(tick);
}

window.addEventListener('beforeunload', () => cancelAnimationFrame(frameId));
void initialize();
