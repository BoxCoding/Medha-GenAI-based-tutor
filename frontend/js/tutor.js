/* Doubt-solving tutor panel — an ongoing conversation grounded in the
 * learner's mastery map. History lives server-side, so the thread survives a
 * page reload and the model can resolve follow-ups against its own replies. */
"use strict";

import { api } from "./api.js";
import { $ } from "./dom.js";
import { state } from "./state.js";
import { renderMarkdown } from "./markdown.js";
import { speak } from "./speech.js";

let historyLoadedFor = null;

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
  return msg;
}

/** Transient "typing" bubble shown while Medhā composes a reply. */
function showThinking() {
  const log = $("#tutor-log");
  const msg = document.createElement("div");
  msg.className = "msg msg-bot msg-thinking";
  msg.setAttribute("aria-label", "Medhā is typing");
  msg.innerHTML = "<span></span><span></span><span></span>";
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
  return msg;
}

async function restoreHistory() {
  const learnerId = state.learner?.id;
  if (!learnerId || historyLoadedFor === learnerId) return;
  historyLoadedFor = learnerId;
  $("#tutor-log").textContent = "";
  try {
    const { messages } = await api(`/tutor/${learnerId}/history`);
    for (const message of messages) {
      appendTutorMessage(message.content, message.role === "model" ? "bot" : "user");
    }
  } catch {
    /* an empty thread is a fine starting point */
  }
}

async function submitQuestion(event) {
  event.preventDefault();
  const input = $("#tutor-input");
  const message = input.value.trim();
  if (!message) return;
  appendTutorMessage(message, "user");
  input.value = "";
  const thinking = showThinking();
  try {
    const reply = await api("/tutor", {
      method: "POST",
      body: JSON.stringify({ learner_id: state.learner.id, message }),
    });
    thinking.remove();
    appendTutorMessage(reply.answer, "bot");
  } catch (error) {
    thinking.remove();
    appendTutorMessage(`Sorry — ${error.message}`, "bot");
  }
}

export function initTutor() {
  $("#tutor-open").addEventListener("click", () => {
    $("#tutor-panel").hidden = false;
    $("#tutor-open").hidden = true;
    $("#tutor-input").focus();
    restoreHistory();
  });
  $("#tutor-close").addEventListener("click", () => {
    $("#tutor-panel").hidden = true;
    $("#tutor-open").hidden = false;
  });
  $("#tutor-form").addEventListener("submit", submitQuestion);
  // Enter sends, Shift+Enter makes a new line — chat-app muscle memory.
  $("#tutor-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      $("#tutor-form").requestSubmit();
    }
  });
}

/** Called when the active learner changes, so threads never bleed together. */
export function resetTutorThread() {
  historyLoadedFor = null;
  $("#tutor-log").textContent = "";
}
