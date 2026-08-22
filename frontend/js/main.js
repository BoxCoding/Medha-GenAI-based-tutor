/* Application entry point: wires every feature module and boots the app. */
"use strict";

import { api } from "./api.js";
import { $ } from "./dom.js";
import { initTheme } from "./theme.js";
import { initAuth, restoreSession } from "./auth.js";
import { initOnboarding } from "./onboarding.js";
import { initDashboard } from "./dashboard.js";
import { initLesson } from "./lesson.js";
import { initQuiz } from "./quiz.js";
import { initTutor } from "./tutor.js";
import { initSpeech } from "./speech.js";
import { initBehavior } from "./behavior.js";
import { initMindmap } from "./mindmap.js";

async function checkHealth() {
  const badge = $("#llm-badge");
  try {
    const health = await api("/health");
    if (health.llm_enabled) {
      badge.textContent = `Gemini · ${health.model}`;
      badge.className = "badge ok";
    } else {
      badge.textContent = "offline fallback mode";
      badge.className = "badge warn";
      badge.title = "Add GEMINI_API_KEY to .env for personalized content";
    }
  } catch {
    badge.textContent = "API unreachable";
    badge.className = "badge warn";
  }
}

initTheme();
initAuth();
initOnboarding();
initDashboard();
initLesson();
initQuiz();
initTutor();
initSpeech();
initBehavior();
initMindmap();

checkHealth();
restoreSession();
