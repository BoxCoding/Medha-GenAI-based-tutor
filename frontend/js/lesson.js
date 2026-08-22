/* Lesson view: personalized lesson rendering, mind-map shortcut, and the
 * teach-back (Feynman mode) flow. */
"use strict";

import { api } from "./api.js";
import { $, loader, show, toast } from "./dom.js";
import { state } from "./state.js";
import { escapeHtml, renderMarkdown } from "./markdown.js";
import { stopSpeech } from "./speech.js";
import { openQuiz } from "./quiz.js";
import { openMindmap } from "./mindmap.js";

export async function openLesson(concept) {
  state.currentConcept = concept;
  loader(true, `Preparing your “${concept.name}” lesson…`);
  try {
    const lesson = await api("/lessons", {
      method: "POST",
      body: JSON.stringify({ learner_id: state.learner.id, concept_id: concept.id }),
    });
    $("#lesson-title").textContent = lesson.concept.name;
    const badge = $("#lesson-band");
    badge.textContent = `${lesson.band} · ${Math.round(lesson.mastery * 100)}% mastery`;
    badge.className = "badge ok";
    $("#lesson-content").innerHTML = renderMarkdown(lesson.content);
    $("#teachback-result").textContent = "";
    $("#teachback-input").value = "";
    stopSpeech();
    show("view-lesson");
  } catch (error) {
    toast(error.message);
  } finally {
    loader(false);
  }
}

async function submitTeachback(event) {
  event.preventDefault();
  const explanation = $("#teachback-input").value.trim();
  if (explanation.length < 20) return;
  loader(true, "Grading your explanation…");
  try {
    const result = await api("/teachback", {
      method: "POST",
      body: JSON.stringify({
        learner_id: state.learner.id,
        concept_id: state.currentConcept.id,
        explanation,
      }),
    });
    renderTeachbackResult(result);
  } catch (error) {
    toast(error.message);
  } finally {
    loader(false);
  }
}

function renderTeachbackResult(result) {
  const wrap = $("#teachback-result");
  wrap.textContent = "";
  const banner = document.createElement("div");
  banner.className = "result-banner" + (result.passed ? "" : " retry");

  const heading = document.createElement("h3");
  heading.textContent = result.passed
    ? `✓ ${result.grade.score}/100 — that's real understanding!`
    : `${result.grade.score}/100 — almost there, refine and retry`;
  banner.appendChild(heading);

  const addList = (title, items, cssClass) => {
    if (!items.length) return;
    const label = document.createElement("p");
    label.className = cssClass;
    label.textContent = title;
    const list = document.createElement("ul");
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    }
    banner.append(label, list);
  };
  addList("What you nailed:", result.grade.strengths, "tb-strengths");
  addList("Gaps to close:", result.grade.gaps, "tb-gaps");

  const tip = document.createElement("p");
  tip.className = "muted";
  tip.textContent = `💡 ${result.grade.tip}`;
  banner.appendChild(tip);

  const shift = document.createElement("p");
  shift.className = "mastery-shift";
  shift.innerHTML =
    `Mastery <strong>${Math.round(result.mastery.before * 100)}%</strong> ` +
    `<span class="arrow">→</span> ` +
    `<strong>${Math.round(result.mastery.after * 100)}%</strong>` +
    escapeHtml(result.mastery.mastered ? " · concept mastered! ★" : "");
  banner.appendChild(shift);
  wrap.appendChild(banner);
  banner.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function initLesson() {
  $("#start-quiz").addEventListener("click", () => {
    if (state.currentConcept) openQuiz(state.currentConcept);
  });
  $("#open-mindmap").addEventListener("click", () => {
    if (state.currentConcept) openMindmap(state.currentConcept);
  });
  $("#teachback-form").addEventListener("submit", submitTeachback);
}
