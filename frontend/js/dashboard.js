/* Dashboard: knowledge-state summary, pace profile, engagement panel,
 * recommendation card, concept map, and history. */
"use strict";

import { api } from "./api.js";
import { $, loader, show } from "./dom.js";
import { state } from "./state.js";
import { openLesson } from "./lesson.js";
import { openQuiz } from "./quiz.js";
import { openMindmap } from "./mindmap.js";

const PACE_DISPLAY = {
  sprinter: { value: "⚡ Sprinter", hint: "fast + accurate" },
  "deep-diver": { value: "🔍 Deep diver", hint: "accurate + thorough" },
  "warming-up": { value: "🌱 Warming up", hint: "scaffolding enabled" },
  steady: { value: "🎯 Steady", hint: "consistent progress" },
  new: { value: "✨ New", hint: "calibrating…" },
};

const EXPRESSION_EMOJI = {
  focused: "🎯",
  happy: "😊",
  neutral: "😐",
  confused: "🤔",
  bored: "🥱",
  tired: "😴",
};

export function applyProgress(data) {
  state.learner = data.learner;
  state.concepts = data.concepts;
  state.recommendation = data.recommendation;
  state.profile = data.profile || null;
  renderSummary(data.summary);
  renderRecommendation(data.recommendation);
  renderEngagement(data.engagement);
  renderConcepts(data.concepts);
  renderHistory(data.history || []);
}

export async function refreshDashboard() {
  const data = await api(`/learners/${state.learner.id}/progress`);
  applyProgress(data);
}

function renderTiles(container, tiles) {
  container.textContent = "";
  for (const tile of tiles) {
    const el = document.createElement("div");
    el.className = "tile";
    const value = document.createElement("div");
    value.className = "tile-value";
    value.textContent = tile.value;
    const label = document.createElement("div");
    label.className = "tile-label";
    label.textContent = tile.label;
    el.append(value, label);
    container.appendChild(el);
  }
}

function renderSummary(summary) {
  const pace = PACE_DISPLAY[state.profile?.pace] || PACE_DISPLAY.new;
  renderTiles($("#summary-tiles"), [
    { value: `${Math.round(summary.overall_mastery * 100)}%`, label: "Overall mastery" },
    {
      value: `${summary.concepts_mastered}/${summary.concepts_total}`,
      label: "Concepts mastered",
    },
    { value: `${summary.streak_days} 🔥`, label: "Day streak" },
    { value: pace.value, label: `Learning pace · ${pace.hint}` },
  ]);
  const note = $("#profile-note");
  if (note) note.textContent = state.profile?.description || "";
}

export function renderEngagement(engagement) {
  const tiles = [];
  if (engagement && engagement.focus_ratio !== null) {
    tiles.push({
      value: `${Math.round(engagement.focus_ratio * 100)}%`,
      label: "Screen focus (30 min)",
    });
  }
  if (engagement && engagement.avg_response_time !== null) {
    tiles.push({ value: `${engagement.avg_response_time}s`, label: "Avg answer time" });
  }
  if (engagement && engagement.expression) {
    tiles.push({
      value: `${EXPRESSION_EMOJI[engagement.expression] || ""} ${engagement.expression}`,
      label: "Camera read",
    });
  }
  if (engagement && engagement.score !== null) {
    tiles.push({ value: `${Math.round(engagement.score * 100)}%`, label: "Engagement score" });
  }
  const wrap = $("#engagement-tiles");
  if (!tiles.length) {
    wrap.textContent = "";
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "No signals yet — Medhā starts learning your rhythm as you study.";
    wrap.appendChild(note);
    return;
  }
  renderTiles(wrap, tiles);
}

function renderRecommendation(reco) {
  const card = $("#recommendation");
  card.textContent = "";
  if (!reco) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const action = document.createElement("div");
  action.className = "reco-action";
  action.textContent = `Recommended · ${reco.action}`;
  const title = document.createElement("h3");
  title.textContent = reco.concept.name;
  const reason = document.createElement("p");
  reason.className = "muted";
  reason.textContent = reco.reason;
  const button = document.createElement("button");
  button.className = "btn btn-primary";
  button.textContent =
    reco.action === "learn" ? "Start learning →"
    : reco.action === "review" ? "Review now →"
    : "Practice now →";
  button.addEventListener("click", () =>
    reco.action === "practice" ? openQuiz(reco.concept) : openLesson(reco.concept)
  );
  card.append(action, title, reason);
  if (reco.pacing) {
    const pacing = document.createElement("p");
    pacing.className = "pacing-note";
    pacing.textContent = `🧘 ${reco.pacing}`;
    card.appendChild(pacing);
  }
  card.appendChild(button);
}

function renderConcepts(concepts) {
  const list = $("#concept-list");
  list.textContent = "";
  for (const concept of concepts) {
    const item = document.createElement("li");
    item.className = "concept-item" + (concept.unlocked ? "" : " locked");

    const name = document.createElement("span");
    name.className = "c-name";
    name.textContent = (concept.mastered ? "★ " : "") + concept.name;
    if (concept.mastered) name.style.color = "var(--gold)";

    const actions = document.createElement("span");
    actions.className = "concept-actions";
    if (concept.unlocked) {
      const learnBtn = document.createElement("button");
      learnBtn.className = "btn btn-ghost";
      learnBtn.textContent = "Learn";
      learnBtn.addEventListener("click", () => openLesson(concept));
      const quizBtn = document.createElement("button");
      quizBtn.className = "btn btn-ghost";
      quizBtn.textContent = "Quiz";
      quizBtn.addEventListener("click", () => openQuiz(concept));
      const mapBtn = document.createElement("button");
      mapBtn.className = "btn btn-ghost";
      mapBtn.textContent = "🧠 Map";
      mapBtn.setAttribute("aria-label", `Mind map for ${concept.name}`);
      mapBtn.addEventListener("click", () => openMindmap(concept));
      actions.append(learnBtn, quizBtn, mapBtn);
    } else {
      const lock = document.createElement("span");
      lock.className = "mastery-label";
      lock.textContent = "🔒 unlock prerequisites first";
      actions.appendChild(lock);
    }

    const desc = document.createElement("span");
    desc.className = "c-desc";
    desc.textContent = concept.description;

    const meter = document.createElement("span");
    meter.className = "meter" + (concept.mastered ? " mastered" : "");
    meter.setAttribute("role", "progressbar");
    meter.setAttribute("aria-valuenow", Math.round(concept.mastery * 100));
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    meter.setAttribute("aria-label", `${concept.name} mastery`);
    const fill = document.createElement("span");
    fill.style.width = `${Math.round(concept.mastery * 100)}%`;
    meter.appendChild(fill);

    const masteryLabel = document.createElement("span");
    masteryLabel.className = "c-desc mastery-label";
    masteryLabel.textContent =
      `Mastery ${Math.round(concept.mastery * 100)}% · ${concept.band}` +
      ` · next quiz: ${concept.recommended_difficulty}`;

    item.append(name, actions, desc, meter, masteryLabel);
    list.appendChild(item);
  }
}

function renderHistory(history) {
  const list = $("#history-list");
  list.textContent = "";
  if (!history.length) {
    const li = document.createElement("li");
    li.textContent = "No attempts yet — take your first quiz!";
    list.appendChild(li);
    return;
  }
  for (const entry of history.slice(0, 20)) {
    const li = document.createElement("li");
    const mark = document.createElement("span");
    mark.className = entry.is_correct ? "ok" : "bad";
    mark.textContent = entry.is_correct ? "✓ " : "✗ ";
    li.appendChild(mark);
    li.append(`${entry.concept_name} · ${entry.difficulty} · ${entry.created_at} UTC`);
    list.appendChild(li);
  }
}

export function initDashboard() {
  document.querySelectorAll("[data-back]").forEach((button) =>
    button.addEventListener("click", async () => {
      loader(true, "Refreshing dashboard…");
      try {
        await refreshDashboard();
      } catch {
        /* a stale view is still usable */
      }
      loader(false);
      show("view-dashboard");
    })
  );
}
