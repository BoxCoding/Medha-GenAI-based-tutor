/* Sign-in / registration and session lifecycle. */
"use strict";

import { api, setUnauthorizedHandler } from "./api.js";
import { $, show } from "./dom.js";
import { state } from "./state.js";
import { stopTracking } from "./behavior.js";
import { loadReturningLearners } from "./onboarding.js";

export function enterAuthView() {
  state.user = null;
  state.learner = null;
  stopTracking();
  $("#switch-learner").hidden = true;
  $("#logout-btn").hidden = true;
  $("#tutor-open").hidden = true;
  $("#tutor-panel").hidden = true;
  show("view-auth");
}

export function enterApp(user) {
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

async function submitLogin(event) {
  event.preventDefault();
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: $("#l-email").value.trim(),
        password: $("#l-password").value,
      }),
    });
    $("#l-password").value = "";
    enterApp(data.user);
  } catch (error) {
    authError(error.message);
  }
}

async function submitRegister(event) {
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
}

export async function restoreSession() {
  try {
    const data = await api("/auth/me");
    enterApp(data.user);
  } catch {
    enterAuthView();
  }
}

export function initAuth() {
  setUnauthorizedHandler(enterAuthView);
  $("#tab-login").addEventListener("click", () => switchAuthTab("login"));
  $("#tab-register").addEventListener("click", () => switchAuthTab("register"));
  $("#login-form").addEventListener("submit", submitLogin);
  $("#register-form").addEventListener("submit", submitRegister);
  $("#logout-btn").addEventListener("click", async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* session is gone either way */
    }
    enterAuthView();
  });
}
