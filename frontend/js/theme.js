/* Light/dark theme toggle, persisted in localStorage (light by default). */
"use strict";

import { $ } from "./dom.js";

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const toggle = $("#theme-toggle");
  const dark = theme === "dark";
  toggle.textContent = dark ? "☀️" : "🌙";
  toggle.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  toggle.setAttribute("aria-pressed", String(dark));
  try {
    localStorage.setItem("medha-theme", theme);
  } catch {
    /* private browsing */
  }
}

export function initTheme() {
  $("#theme-toggle").addEventListener("click", () => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark");
  });
  let saved = "light";
  try {
    saved = localStorage.getItem("medha-theme") || "light";
  } catch {
    /* ignore */
  }
  applyTheme(saved === "dark" ? "dark" : "light");
}
