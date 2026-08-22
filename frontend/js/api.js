/* API client. Same-origin by default; a split deployment sets
 * window.MEDHA_API_BASE (see ../config.js) and cookies switch to "include".
 *
 * Auth is decoupled via a registered handler: on any 401 outside /auth,
 * the auth module's sign-in flow takes over. */
"use strict";

export const API_BASE = window.MEDHA_API_BASE || "";
const API = API_BASE + "/api";

let onUnauthorized = () => {};

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export async function api(path, options = {}) {
  const response = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    credentials: API_BASE ? "include" : "same-origin",
    ...options,
  });
  if (response.status === 401 && !path.startsWith("/auth")) {
    onUnauthorized();
    throw new Error("Please sign in to continue.");
  }
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* keep the default message */
    }
    throw new Error(detail);
  }
  return response.json();
}
