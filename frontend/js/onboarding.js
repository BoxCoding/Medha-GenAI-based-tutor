/* Learner onboarding: create a learning path, or continue as a returning
 * learner. Also owns the "switch learner" control. */
"use strict";

import { api } from "./api.js";
import { $, loader, show, toast } from "./dom.js";
import { state } from "./state.js";
import { applyProgress } from "./dashboard.js";
import { startTracking, stopTracking } from "./behavior.js";
import { resetTutorThread } from "./tutor.js";

function enterLearnerView() {
  show("view-dashboard");
  $("#switch-learner").hidden = false;
  $("#tutor-open").hidden = false;
  resetTutorThread();
}

export async function loadReturningLearners() {
  try {
    const { learners } = await api("/learners");
    if (!learners.length) return;
    $("#returning").hidden = false;
    const listEl = $("#learner-list");
    listEl.textContent = "";
    for (const learner of learners.slice(0, 8)) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = `${learner.name} · ${learner.topic}`;
      chip.addEventListener("click", () => enterDashboard(learner.id));
      listEl.appendChild(chip);
    }
  } catch {
    /* onboarding still works without the returning list */
  }
}

export async function enterDashboard(learnerId) {
  loader(true, "Loading your knowledge state…");
  try {
    const data = await api(`/learners/${learnerId}/progress`);
    applyProgress(data);
    enterLearnerView();
    startTracking(learnerId);
  } catch (error) {
    toast(error.message);
  } finally {
    loader(false);
  }
}

async function submitOnboarding(event) {
  event.preventDefault();
  const payload = {
    name: $("#f-name").value.trim(),
    topic: $("#f-topic").value.trim(),
    level: $("#f-level").value,
    goal: $("#f-goal").value.trim() || null,
  };
  loader(true, `Mapping the concepts of “${payload.topic}”…`);
  $("#onboard-submit").disabled = true;
  try {
    const data = await api("/learners", { method: "POST", body: JSON.stringify(payload) });
    applyProgress(data);
    enterLearnerView();
    startTracking(data.learner.id);
  } catch (error) {
    toast(error.message);
  } finally {
    loader(false);
    $("#onboard-submit").disabled = false;
  }
}

export function initOnboarding() {
  $("#onboard-form").addEventListener("submit", submitOnboarding);
  $("#switch-learner").addEventListener("click", () => {
    state.learner = null;
    stopTracking();
    $("#switch-learner").hidden = true;
    $("#tutor-open").hidden = true;
    $("#tutor-panel").hidden = true;
    loadReturningLearners();
    show("view-onboard");
  });
}
