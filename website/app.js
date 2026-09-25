const languageButton = document.querySelector(".language-switch");
const languageLabel = document.querySelector("[data-language-label]");
const menuButton = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector(".mobile-nav");
const translations = document.querySelectorAll("[data-en][data-zh]");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const desktopMotionQuery = window.matchMedia("(min-width: 861px)");
const observedItems = document.querySelectorAll("[data-observe]");
const storySections = document.querySelectorAll("[data-story]");
const phaseLabel = document.querySelector("[data-phase-label]");
const sequenceSteps = document.querySelectorAll("[data-step]");

const savedLanguage = localStorage.getItem("paperflow-site-language");
let language = savedLanguage === "zh" ? "zh" : "en";
let frameRequested = false;

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function progress(value, start, end) {
  return clamp((value - start) / (end - start));
}

function smooth(value) {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
}

function mix(start, end, amount) {
  return start + (end - start) * smooth(amount);
}

function setPhaseLabel(phase) {
  if (!phaseLabel) return;
  const labels = {
    fragmented: language === "zh" ? "割裂" : "FRAGMENTED",
    connecting: language === "zh" ? "正在连接" : "CONNECTING",
    connected: language === "zh" ? "已连接" : "CONNECTED",
  };
  phaseLabel.textContent = labels[phase];
}

function applyLanguage(nextLanguage) {
  language = nextLanguage;
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.title =
    language === "zh"
      ? "PaperFlow AI - 让 PDF 成为研究工作区"
      : "PaperFlow AI - Your PDF is the workspace";

  translations.forEach((element) => {
    element.innerHTML = element.dataset[language];
  });

  if (languageLabel) {
    languageLabel.textContent = language === "zh" ? "EN" : "中文";
  }

  const fragmentStory = document.querySelector('[data-story="fragments"]');
  const currentProgress = fragmentStory
    ? getStoryProgress(fragmentStory)
    : 0;
  setPhaseLabel(currentProgress > 0.68 ? "connected" : currentProgress > 0.24 ? "connecting" : "fragmented");
  localStorage.setItem("paperflow-site-language", language);
}

function closeMenu() {
  menuButton?.setAttribute("aria-expanded", "false");
  mobileNav?.setAttribute("data-open", "false");
  document.body.dataset.menuOpen = "false";
}

function getStoryProgress(section) {
  const rect = section.getBoundingClientRect();
  const distance = Math.max(1, rect.height - window.innerHeight);
  return clamp(-rect.top / distance);
}

function updateFragmentStory(section, storyProgress) {
  const stage = section.querySelector(".fragment-stage");
  if (!stage) return;

  const fragments = [
    { selector: ".fragment-pdf", x: 215, y: 118 },
    { selector: ".fragment-notes", x: -215, y: 160 },
    { selector: ".fragment-chat", x: -190, y: -18 },
    { selector: ".fragment-library", x: 120, y: -126 },
    { selector: ".fragment-tabs", x: -215, y: -124 },
  ];
  const merge = smooth(progress(storyProgress, 0.13, 0.72));

  section.style.setProperty("--fragment-progress", storyProgress.toFixed(4));
  fragments.forEach((config, index) => {
    const element = stage.querySelector(config.selector);
    if (!element) return;
    const local = smooth(progress(storyProgress, 0.13 + index * 0.035, 0.61 + index * 0.035));
    element.style.setProperty("--fragment-x", `${config.x * local}px`);
    element.style.setProperty("--fragment-y", `${config.y * local}px`);
    element.style.setProperty("--fragment-scale", (1 - local * 0.28).toFixed(4));
    element.style.setProperty("--fragment-opacity", (1 - progress(local, 0.55, 1)).toFixed(4));
  });

  stage.style.setProperty("--workspace-opacity", progress(merge, 0.52, 0.9).toFixed(4));
  stage.style.setProperty("--workspace-scale", mix(0.86, 1, progress(merge, 0.42, 1)).toFixed(4));

  setPhaseLabel(storyProgress > 0.68 ? "connected" : storyProgress > 0.24 ? "connecting" : "fragmented");
}

function updateLayerStory(section, storyProgress) {
  const system = section.querySelector(".layer-system");
  if (!system) return;

  const rows = [
    { selector: ".layer-reader", x: -95, y: -28 },
    { selector: ".layer-notes", x: 110, y: -16 },
    { selector: ".layer-ai", x: -125, y: 6 },
    { selector: ".layer-memory", x: 90, y: 22 },
    { selector: ".layer-state", x: -70, y: 35 },
  ];

  rows.forEach((config, index) => {
    const row = system.querySelector(config.selector);
    if (!row) return;
    const local = smooth(progress(storyProgress, 0.08 + index * 0.06, 0.52 + index * 0.06));
    row.style.setProperty("--layer-x", `${config.x * (1 - local)}px`);
    row.style.setProperty("--layer-y", `${config.y * (1 - local)}px`);
    row.style.opacity = String(mix(0.46, 1, local));
  });

  system.style.setProperty("--paper-scale", mix(0.92, 1, progress(storyProgress, 0.05, 0.68)).toFixed(4));
}

function updateSourceStory(section, storyProgress) {
  const demo = section.querySelector(".source-demo");
  if (!demo) return;

  const selection = smooth(progress(storyProgress, 0.08, 0.28));
  const askOpacity = Math.min(
    progress(storyProgress, 0.2, 0.3),
    1 - progress(storyProgress, 0.37, 0.45),
  );
  const questionOpacity = progress(storyProgress, 0.36, 0.48);
  const answerOpacity = progress(storyProgress, 0.47, 0.63);
  const citationOpacity = progress(storyProgress, 0.64, 0.78);
  const targetOpacity = progress(storyProgress, 0.77, 0.9);

  demo.style.setProperty("--source-scale", mix(0.965, 1, progress(storyProgress, 0.02, 0.22)).toFixed(4));
  demo.style.setProperty("--selection-width", selection.toFixed(4));
  demo.style.setProperty("--ask-opacity", askOpacity.toFixed(4));
  demo.style.setProperty("--question-opacity", questionOpacity.toFixed(4));
  demo.style.setProperty("--answer-opacity", answerOpacity.toFixed(4));
  demo.style.setProperty("--citation-opacity", citationOpacity.toFixed(4));
  demo.style.setProperty("--target-opacity", targetOpacity.toFixed(4));

  let cursorX = 77;
  let cursorY = 76;
  let cursorOpacity = 0;
  if (storyProgress >= 0.06 && storyProgress < 0.36) {
    const local = progress(storyProgress, 0.06, 0.36);
    cursorX = mix(30, 48, local);
    cursorY = mix(36, 42, local);
    cursorOpacity = Math.min(progress(local, 0, 0.18), 1 - progress(local, 0.88, 1));
  } else if (storyProgress >= 0.36 && storyProgress < 0.7) {
    const local = progress(storyProgress, 0.36, 0.7);
    cursorX = mix(50, 88, local);
    cursorY = mix(43, 58, local);
    cursorOpacity = Math.min(progress(local, 0, 0.12), 1 - progress(local, 0.88, 1));
  } else if (storyProgress >= 0.7) {
    const local = progress(storyProgress, 0.7, 0.93);
    cursorX = mix(86, 48, local);
    cursorY = mix(59, 35, local);
    cursorOpacity = Math.min(progress(local, 0, 0.14), 1 - progress(local, 0.9, 1));
  }

  demo.style.setProperty("--cursor-x", `${cursorX}%`);
  demo.style.setProperty("--cursor-y", `${cursorY}%`);
  demo.style.setProperty("--cursor-opacity", cursorOpacity.toFixed(4));

  const activeStep = storyProgress < 0.3 ? 1 : storyProgress < 0.52 ? 2 : storyProgress < 0.76 ? 3 : 4;
  sequenceSteps.forEach((step) => {
    step.dataset.active = String(Number(step.dataset.step) <= activeStep);
  });
}

function updateScrollStories() {
  frameRequested = false;
  if (reducedMotionQuery.matches || !desktopMotionQuery.matches) return;

  document.documentElement.style.setProperty(
    "--hero-media-progress",
    clamp(window.scrollY / 1150).toFixed(4),
  );

  storySections.forEach((section) => {
    const storyProgress = getStoryProgress(section);
    if (section.dataset.story === "fragments") updateFragmentStory(section, storyProgress);
    if (section.dataset.story === "layers") updateLayerStory(section, storyProgress);
    if (section.dataset.story === "source") updateSourceStory(section, storyProgress);
  });
}

function requestStoryFrame() {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(updateScrollStories);
}

languageButton?.addEventListener("click", () => {
  applyLanguage(language === "en" ? "zh" : "en");
});

menuButton?.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!open));
  menuButton.setAttribute("aria-label", open ? "Open navigation" : "Close navigation");
  mobileNav?.setAttribute("data-open", String(!open));
  document.body.dataset.menuOpen = String(!open);
});

mobileNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", closeMenu);
});

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.setAttribute("data-visible", "true");
        revealObserver.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.18 },
  );
  observedItems.forEach((item) => revealObserver.observe(item));

} else {
  observedItems.forEach((item) => item.setAttribute("data-visible", "true"));
}

window.addEventListener("scroll", requestStoryFrame, { passive: true });
window.addEventListener("resize", requestStoryFrame);
reducedMotionQuery.addEventListener("change", requestStoryFrame);
desktopMotionQuery.addEventListener("change", requestStoryFrame);

applyLanguage(language);
requestStoryFrame();
