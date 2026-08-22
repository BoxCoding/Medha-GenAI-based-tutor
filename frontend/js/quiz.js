/* Adaptive quiz flow: generation, answering, grading feedback, and the
 * mastery-shift banner. */
"use strict";

import { api } from "./api.js";
import { $, loader, show, toast } from "./dom.js";
import { state } from "./state.js";
import { escapeHtml } from "./markdown.js";
import { pushEvent } from "./behavior.js";
import { refreshDashboard } from "./dashboard.js";

export async function openQuiz(concept) {
  state.currentConcept = concept;
  loader(true, `Generating an adaptive quiz on “${concept.name}”…`);
  try {
    const quiz = await api("/quizzes/generate", {
      method: "POST",
      body: JSON.stringify({ learner_id: state.learner.id, concept_id: concept.id }),
    });
    state.quiz = quiz;
    $("#quiz-title").textContent = `Quiz · ${quiz.concept.name}`;
    const badge = $("#quiz-difficulty");
    badge.textContent = `difficulty: ${quiz.difficulty}`;
    badge.className = `badge ${quiz.difficulty}`;
    $("#quiz-progress").textContent = quiz.difficulty_adjusted
      ? `${quiz.questions.length} questions — difficulty adjusted to "${quiz.difficulty}" ` +
        "based on your recent scores."
      : `${quiz.questions.length} questions, calibrated to your current mastery.`;
    $("#quiz-result").textContent = "";
    renderQuizForm(quiz);
    state.quizStartedAt = Date.now();
    show("view-quiz");
  } catch (error) {
    toast(error.message);
  } finally {
    loader(false);
  }
}

function renderQuizForm(quiz) {
  const form = $("#quiz-form");
  form.textContent = "";
  quiz.questions.forEach((question, qIndex) => {
    const block = document.createElement("div");
    block.className = "q-block";
    block.dataset.questionId = question.question_id;

    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = `${qIndex + 1}. ${question.question}`;
    fieldset.appendChild(legend);

    question.options.forEach((option, oIndex) => {
      const wrap = document.createElement("div");
      wrap.className = "option";
      wrap.dataset.optionIndex = oIndex;
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `q-${question.question_id}`;
      input.value = String(oIndex);
      input.id = `q-${question.question_id}-${oIndex}`;
      input.required = true;
      const label = document.createElement("label");
      label.htmlFor = input.id;
      label.textContent = option;
      wrap.append(input, label);
      fieldset.appendChild(wrap);
    });
    block.appendChild(fieldset);
    form.appendChild(block);
  });

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "btn btn-primary";
  submit.textContent = "Submit answers";
  form.appendChild(submit);
}

async function submitQuiz(event) {
  event.preventDefault();
  const answers = state.quiz.questions.map((question) => {
    const chosen = document.querySelector(`input[name="q-${question.question_id}"]:checked`);
    return { question_id: question.question_id, selected_index: Number(chosen.value) };
  });
  if (state.quizStartedAt) {
    const perQuestion = (Date.now() - state.quizStartedAt) / 1000 / answers.length;
    pushEvent("response_time", Math.min(3600, perQuestion));
  }
  loader(true, "Grading and updating your knowledge state…");
  try {
    const result = await api("/quizzes/submit", {
      method: "POST",
      body: JSON.stringify({
        learner_id: state.learner.id,
        quiz_id: state.quiz.quiz_id,
        answers,
      }),
    });
    showQuizResults(result);
    await refreshDashboard();
  } catch (error) {
    toast(error.message);
  } finally {
    loader(false);
  }
}

function showQuizResults(result) {
  // Annotate each question block with correct/wrong + explanation.
  for (const r of result.results) {
    const block = document.querySelector(`.q-block[data-question-id="${r.question_id}"]`);
    if (!block) continue;
    block.querySelectorAll("input").forEach((input) => {
      input.disabled = true;
    });
    const options = block.querySelectorAll(".option");
    options[r.correct_index]?.classList.add("correct");
    if (!r.correct) options[r.selected_index]?.classList.add("wrong");
    const feedback = document.createElement("p");
    feedback.className = "q-feedback";
    feedback.textContent = (r.correct ? "✓ Correct. " : "✗ Not quite. ") + r.explanation;
    block.appendChild(feedback);
  }
  $("#quiz-form").querySelector("button[type=submit]")?.remove();

  const banner = document.createElement("div");
  banner.className = "result-banner";
  const heading = document.createElement("h3");
  heading.textContent =
    `Score: ${result.score.correct}/${result.score.total}` +
    (result.mastery.mastered ? " — concept mastered! ★" : "");
  const shift = document.createElement("p");
  shift.className = "mastery-shift";
  const before = Math.round(result.mastery.before * 100);
  const after = Math.round(result.mastery.after * 100);
  shift.innerHTML =
    `Mastery <strong>${before}%</strong> <span class="arrow">→</span> ` +
    `<strong>${after}%</strong> · next quiz difficulty: ` +
    `<strong>${escapeHtml(result.mastery.next_difficulty)}</strong>`;

  const again = document.createElement("button");
  again.className = "btn btn-primary";
  again.textContent = "Quiz again";
  again.addEventListener("click", () => openQuiz(state.currentConcept));
  const back = document.createElement("button");
  back.className = "btn btn-ghost";
  back.textContent = "Back to dashboard";
  back.addEventListener("click", () => show("view-dashboard"));

  banner.append(heading, shift, again, back);
  const resultEl = $("#quiz-result");
  resultEl.textContent = "";
  resultEl.appendChild(banner);
  banner.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function initQuiz() {
  $("#quiz-form").addEventListener("submit", submitQuiz);
}
