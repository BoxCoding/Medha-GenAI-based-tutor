/* Medhā — Adaptive Learning Intelligence frontend.
 * Vanilla JS single-page app. All rendering uses DOM APIs / escaped text —
 * LLM output goes through a small sanitizing markdown renderer, never raw HTML.
 */
"use strict";

const API_BASE = window.MEDHA_API_BASE || "";
const API = API_BASE + "/api";

const state = {
  user: null,
  learner: null,
  concepts: [],
  recommendation: null,
  currentConcept: null,
  quiz: null,
  quizStartedAt: null,
};

/* ================================ utils ================================ */

const $ = (sel) => document.querySelector(sel);

function show(viewId) {
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== viewId));
  window.scrollTo({ top: 0 });
}

function loader(on, text = "Working…") {
  $("#loader").hidden = !on;
  $("#loader-text").textContent = text;
}

let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4200);
}

async function api(path, options = {}) {
  const response = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    // Cross-origin backend (split deployment) needs "include" for the
    // session cookie; same-origin keeps the tighter default.
    credentials: API_BASE ? "include" : "same-origin",
    ...options,
  });
  if (response.status === 401 && !path.startsWith("/auth")) {
    enterAuthView();
    throw new Error("Please sign in to continue.");
  }
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body.detail) detail = typeof body.detail === "string" ? body.detail : detail;
    } catch (_) { /* keep default */ }
    throw new Error(detail);
  }
  return response.json();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/** Minimal markdown → HTML for trusted-structure, escaped-content rendering.
 * Supports headings, lists, quotes, tables, code fences — and dispatches
 * ```chart / ```flow fences to the MedhaViz engine (falling back to a plain
 * code block if the visual spec is invalid). */
function renderMarkdown(md) {
  const lines = escapeHtml(md).split("\n");
  const out = [];
  let fenceLang = null;   // null = not inside a fence
  let fenceBuffer = [];
  let listType = null;
  let tableBuffer = [];

  // escapeHtml encoded & < > — the viz engine needs the raw JSON back.
  const unescapeEntities = (s) =>
    s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };
  const inline = (s) =>
    s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  const flushTable = () => {
    if (!tableBuffer.length) return;
    const rows = tableBuffer.map((line) =>
      line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim())
    );
    tableBuffer = [];
    const hasHeader =
      rows.length >= 2 && rows[1].every((cell) => /^:?-{3,}:?$/.test(cell));
    const html = ['<div class="table-wrap"><table>'];
    if (hasHeader) {
      html.push("<thead><tr>");
      for (const cell of rows[0]) html.push(`<th>${inline(cell)}</th>`);
      html.push("</tr></thead>");
    }
    html.push("<tbody>");
    for (const row of rows.slice(hasHeader ? 2 : 0)) {
      html.push("<tr>");
      for (const cell of row) html.push(`<td>${inline(cell)}</td>`);
      html.push("</tr>");
    }
    html.push("</tbody></table></div>");
    out.push(html.join(""));
  };

  const closeFence = () => {
    const content = fenceBuffer.join("\n");
    fenceBuffer = [];
    if ((fenceLang === "chart" || fenceLang === "flow") && window.MedhaViz) {
      const visual = window.MedhaViz.render(fenceLang, unescapeEntities(content));
      if (visual) { out.push(visual); fenceLang = null; return; }
    }
    out.push(`<pre><code>${content}</code></pre>`);
    fenceLang = null;
  };

  for (const line of lines) {
    if (fenceLang !== null) {
      if (line.trim().startsWith("```")) closeFence();
      else fenceBuffer.push(line);
      continue;
    }
    const fenceOpen = line.trim().match(/^```(\w*)\s*$/);
    if (fenceOpen) {
      closeList();
      flushTable();
      fenceLang = fenceOpen[1].toLowerCase() || "text";
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList();
      tableBuffer.push(line);
      continue;
    }
    flushTable();

    const heading = line.match(/^(#{1,4})\s+(.*)/);
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)/);
    const quote = line.match(/^&gt;\s?(.*)/); // ">" is already HTML-escaped here

    if (heading) {
      closeList();
      const depth = Math.min(heading[1].length + 1, 4);
      out.push(`<h${depth}>${inline(heading[2])}</h${depth}>`);
    } else if (bullet) {
      if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; }
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else if (numbered) {
      if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; }
      out.push(`<li>${inline(numbered[1])}</li>`);
    } else if (quote) {
      closeList();
      out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  flushTable();
  if (fenceLang !== null) closeFence();
  return out.join("\n");
}

/* ============================== health ================================ */

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
  } catch (_) {
    badge.textContent = "API unreachable";
    badge.className = "badge warn";
  }
}

/* =============================== auth ================================= */

function enterAuthView() {
  state.user = null;
  state.learner = null;
  if (window.MedhaBehavior) window.MedhaBehavior.stop();
  $("#switch-learner").hidden = true;
  $("#logout-btn").hidden = true;
  $("#tutor-open").hidden = true;
  $("#tutor-panel").hidden = true;
  show("view-auth");
}

function enterApp(user) {
  state.user = user;
  $("#logout-btn").hidden = false;
  $("#logout-btn").textContent = `Sign out (${user.name})`;
  loadReturningLearners();
  show("view-onboard");
}

function authError(message) {
  const el = $("#auth-error");
  el.textContent = message;
  el.hidden = false;
}

function switchAuthTab(mode) {
  const login = mode === "login";
  $("#login-form").hidden = !login;
  $("#register-form").hidden = login;
  $("#tab-login").classList.toggle("active", login);
  $("#tab-register").classList.toggle("active", !login);
  $("#tab-login").setAttribute("aria-selected", String(login));
  $("#tab-register").setAttribute("aria-selected", String(!login));
  $("#auth-error").hidden = true;
}

$("#tab-login").addEventListener("click", () => switchAuthTab("login"));
$("#tab-register").addEventListener("click", () => switchAuthTab("register"));

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: $("#l-email").value.trim(), password: $("#l-password").value }),
    });
    $("#l-password").value = "";
    enterApp(data.user);
  } catch (error) {
    authError(error.message);
  }
});

$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: $("#r-name").value.trim(),
        email: $("#r-email").value.trim(),
        password: $("#r-password").value,
      }),
    });
    $("#r-password").value = "";
    enterApp(data.user);
  } catch (error) {
    authError(error.message);
  }
});

$("#logout-btn").addEventListener("click", async () => {
  try { await api("/auth/logout", { method: "POST" }); } catch (_) { /* session gone anyway */ }
  enterAuthView();
});

async function restoreSession() {
  try {
    const data = await api("/auth/me");
    enterApp(data.user);
  } catch (_) {
    enterAuthView();
  }
}

/* ============================ onboarding ============================== */

async function loadReturningLearners() {
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
  } catch (_) { /* onboarding still works */ }
}

$("#onboard-form").addEventListener("submit", async (event) => {
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
    show("view-dashboard");
    $("#switch-learner").hidden = false;
    $("#tutor-open").hidden = false;
    if (window.MedhaBehavior) window.MedhaBehavior.start(data.learner.id);
  } catch (error) {
    toast(error.message);
  } finally {
    loader(false);
    $("#onboard-submit").disabled = false;
  }
});

async function enterDashboard(learnerId) {
  loader(true, "Loading your knowledge state…");
  try {
    const data = await api(`/learners/${learnerId}/progress`);
    applyProgress(data);
    show("view-dashboard");
    $("#switch-learner").hidden = false;
    $("#tutor-open").hidden = false;
    if (window.MedhaBehavior) window.MedhaBehavior.start(learnerId);
  } catch (error) {
    toast(error.message);
  } finally {
    loader(false);
  }
}

/* ============================= dashboard ============================== */

function applyProgress(data) {
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

const PACE_DISPLAY = {
  sprinter: { value: "⚡ Sprinter", hint: "fast + accurate" },
  "deep-diver": { value: "🔍 Deep diver", hint: "accurate + thorough" },
  "warming-up": { value: "🌱 Warming up", hint: "scaffolding enabled" },
  steady: { value: "🎯 Steady", hint: "consistent progress" },
  new: { value: "✨ New", hint: "calibrating…" },
};

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
    { value: `${summary.concepts_mastered}/${summary.concepts_total}`, label: "Concepts mastered" },
    { value: `${summary.streak_days} 🔥`, label: "Day streak" },
    { value: pace.value, label: `Learning pace · ${pace.hint}` },
  ]);
  const note = $("#profile-note");
  if (note) note.textContent = state.profile?.description || "";
}

const EXPRESSION_EMOJI = {
  focused: "🎯", happy: "😊", neutral: "😐",
  confused: "🤔", bored: "🥱", tired: "😴",
};

function renderEngagement(engagement) {
  const tiles = [];
  if (engagement && engagement.focus_ratio !== null) {
    tiles.push({ value: `${Math.round(engagement.focus_ratio * 100)}%`, label: "Screen focus (30 min)" });
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
    reco.action === "learn" ? "Start learning →" :
    reco.action === "review" ? "Review now →" : "Practice now →";
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
      mapBtn.addEventListener("click", () => window.MedhaMindmap?.open(concept));
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

async function refreshDashboard() {
  const data = await api(`/learners/${state.learner.id}/progress`);
  applyProgress(data);
}

/* =============================== lesson =============================== */

async function openLesson(concept) {
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
    state.lessonMarkdown = lesson.content;
    $("#teachback-result").textContent = "";
    $("#teachback-input").value = "";
    if (window.MedhaSpeech) window.MedhaSpeech.stop();
    show("view-lesson");
  } catch (error) {
    toast(error.message);
  } finally {
    loader(false);
  }
}

$("#start-quiz").addEventListener("click", () => {
  if (state.currentConcept) openQuiz(state.currentConcept);
});

$("#open-mindmap").addEventListener("click", () => {
  if (state.currentConcept) window.MedhaMindmap?.open(state.currentConcept);
});

/* ============================= teach-back ============================= */

$("#teachback-form").addEventListener("submit", async (event) => {
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
});

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
    `<span class="arrow">→</span> <strong>${Math.round(result.mastery.after * 100)}%</strong>` +
    (result.mastery.mastered ? " · concept mastered! ★" : "");
  banner.appendChild(shift);
  wrap.appendChild(banner);
  banner.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ================================ quiz ================================ */

async function openQuiz(concept) {
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
      ? `${quiz.questions.length} questions — difficulty adjusted to "${quiz.difficulty}" based on your recent scores.`
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

$("#quiz-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const answers = state.quiz.questions.map((question) => {
    const chosen = document.querySelector(`input[name="q-${question.question_id}"]:checked`);
    return { question_id: question.question_id, selected_index: Number(chosen.value) };
  });
  if (state.quizStartedAt && window.MedhaBehavior) {
    const perQuestion = (Date.now() - state.quizStartedAt) / 1000 / answers.length;
    window.MedhaBehavior.push("response_time", Math.min(3600, perQuestion));
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
});

function showQuizResults(result) {
  // Annotate each question block with correct/wrong + explanation.
  for (const r of result.results) {
    const block = document.querySelector(`.q-block[data-question-id="${r.question_id}"]`);
    if (!block) continue;
    block.querySelectorAll("input").forEach((input) => (input.disabled = true));
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
  heading.textContent = `Score: ${result.score.correct}/${result.score.total}` +
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

/* ================================ tutor =============================== */

$("#tutor-open").addEventListener("click", () => {
  $("#tutor-panel").hidden = false;
  $("#tutor-open").hidden = true;
  $("#tutor-input").focus();
});
$("#tutor-close").addEventListener("click", () => {
  $("#tutor-panel").hidden = true;
  $("#tutor-open").hidden = false;
});

$("#tutor-form").addEventListener("submit", async (event) => {
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
});

function appendTutorMessage(text, who) {
  const log = $("#tutor-log");
  const msg = document.createElement("div");
  msg.className = `msg msg-${who}`;
  if (who === "bot") {
    msg.innerHTML = renderMarkdown(text);
    if (window.MedhaSpeech) {
      const listen = document.createElement("button");
      listen.className = "btn btn-ghost msg-listen";
      listen.textContent = "🔊";
      listen.setAttribute("aria-label", "Read this answer aloud");
      listen.addEventListener("click", () => window.MedhaSpeech.speak(text));
      msg.appendChild(listen);
    }
  } else {
    msg.textContent = text;
  }
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
}

/* ============================= navigation ============================= */

document.querySelectorAll("[data-back]").forEach((button) =>
  button.addEventListener("click", async () => {
    loader(true, "Refreshing dashboard…");
    try {
      await refreshDashboard();
    } catch (_) { /* stale view is still usable */ }
    loader(false);
    show("view-dashboard");
  })
);

$("#switch-learner").addEventListener("click", () => {
  state.learner = null;
  if (window.MedhaBehavior) window.MedhaBehavior.stop();
  $("#switch-learner").hidden = true;
  $("#tutor-open").hidden = true;
  $("#tutor-panel").hidden = true;
  loadReturningLearners();
  show("view-onboard");
});

document.querySelectorAll("[data-back-lesson]").forEach((button) =>
  button.addEventListener("click", () => show("view-lesson"))
);

/* ================================ theme =============================== */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const toggle = $("#theme-toggle");
  const dark = theme === "dark";
  toggle.textContent = dark ? "☀️" : "🌙";
  toggle.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  toggle.setAttribute("aria-pressed", String(dark));
  try { localStorage.setItem("medha-theme", theme); } catch (_) { /* private mode */ }
}

$("#theme-toggle").addEventListener("click", () => {
  const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  applyTheme(current === "dark" ? "light" : "dark");
});

let savedTheme = "light";
try { savedTheme = localStorage.getItem("medha-theme") || "light"; } catch (_) { /* ignore */ }
applyTheme(savedTheme === "dark" ? "dark" : "light");

/* ============================ shared API ============================== */
/* Companion modules (speech.js, behavior.js, mindmap.js) use this surface. */

window.Medha = {
  api, state, loader, toast, show, renderMarkdown, escapeHtml,
  refreshDashboard, renderEngagement,
};

/* ================================ boot ================================ */

checkHealth();
restoreSession();
