/* Doubt-solving tutor panel, grounded in the learner's mastery map. */
"use strict";

import { api } from "./api.js";
import { $ } from "./dom.js";
import { state } from "./state.js";
import { renderMarkdown } from "./markdown.js";
import { speak } from "./speech.js";

function appendTutorMessage(text, who) {
  const log = $("#tutor-log");
  const msg = document.createElement("div");
  msg.className = `msg msg-${who}`;
  if (who === "bot") {
    msg.innerHTML = renderMarkdown(text);
    const listen = document.createElement("button");
    listen.className = "btn btn-ghost msg-listen";
    listen.textContent = "🔊";
    listen.setAttribute("aria-label", "Read this answer aloud");
    listen.addEventListener("click", () => speak(text));
    msg.appendChild(listen);
  } else {
    msg.textContent = text;
  }
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
}

async function submitQuestion(event) {
  event.preventDefault();
  const input = $("#tutor-input");
  const message = input.value.trim();
  if (!message) return;
  appendTutorMessage(message, "user");
  input.value = "";
  try {
    const reply = await api("/tutor", {
      method: "POST",
      body: JSON.stringify({ learner_id: state.learner.id, message }),
    });
    appendTutorMessage(reply.answer, "bot");
  } catch (error) {
    appendTutorMessage(`Sorry — ${error.message}`, "bot");
  }
}

export function initTutor() {
  $("#tutor-open").addEventListener("click", () => {
    $("#tutor-panel").hidden = false;
    $("#tutor-open").hidden = true;
    $("#tutor-input").focus();
  });
  $("#tutor-close").addEventListener("click", () => {
    $("#tutor-panel").hidden = true;
    $("#tutor-open").hidden = false;
  });
  $("#tutor-form").addEventListener("submit", submitQuestion);
}
