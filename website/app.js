const languageButton = document.querySelector(".language-switch");
const languageLabel = document.querySelector("[data-language-label]");
const menuButton = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector(".mobile-nav");
const translations = document.querySelectorAll("[data-en][data-zh]");

const savedLanguage = localStorage.getItem("paperflow-site-language");
let language = savedLanguage === "zh" ? "zh" : "en";

function applyLanguage(nextLanguage) {
  language = nextLanguage;
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.title =
    language === "zh"
      ? "PaperFlow AI - 读懂每一篇论文"
      : "PaperFlow AI - Your papers, understood";

  translations.forEach((element) => {
    element.innerHTML = element.dataset[language];
  });

  if (languageLabel) {
    languageLabel.textContent = language === "zh" ? "EN" : "中文";
  }

  localStorage.setItem("paperflow-site-language", language);
}

function closeMenu() {
  menuButton?.setAttribute("aria-expanded", "false");
  mobileNav?.setAttribute("data-open", "false");
}

languageButton?.addEventListener("click", () => {
  applyLanguage(language === "en" ? "zh" : "en");
});

menuButton?.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!open));
  menuButton.setAttribute("aria-label", open ? "Open navigation" : "Close navigation");
  mobileNav?.setAttribute("data-open", String(!open));
});

mobileNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", closeMenu);
});

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealItems = document.querySelectorAll(".reveal");

if (reducedMotion || !("IntersectionObserver" in window)) {
  revealItems.forEach((item) => item.setAttribute("data-visible", "true"));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.setAttribute("data-visible", "true");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );

  revealItems.forEach((item) => observer.observe(item));
  window.setTimeout(() => {
    revealItems.forEach((item) => item.setAttribute("data-visible", "true"));
  }, 1200);
}

applyLanguage(language);
