/* Learning-behavior tracker.
 *
 * Signals collected (batched to the server every ~20s):
 *   focus_seconds / blur_seconds — tab visibility (screen focus)
 *   idle_seconds                 — no mouse/keyboard for 60s+ while visible
 *   response_time                — pushed by the quiz flow
 *
 * Camera coaching (strictly opt-in): every ~45s one downscaled frame is sent
 * to the server, classified by Gemini into an engagement label, and
 * discarded. The video never records; only the label is stored. */
"use strict";

import { api, API_BASE } from "./api.js";
import { toast } from "./dom.js";
import { renderEngagement } from "./dashboard.js";

const FLUSH_INTERVAL_MS = 20_000;
const CAMERA_INTERVAL_MS = 45_000;
const IDLE_THRESHOLD_MS = 60_000;

let learnerId = null;
let queue = [];
let flushTimer = null;

let visibleSince = Date.now();
let hiddenSince = null;
let lastActivity = Date.now();
let idleAccumulated = 0;

let cameraStream = null;
let cameraTimer = null;

/* ------------------------------ queueing ------------------------------ */

export function pushEvent(kind, value) {
  if (!learnerId || value <= 0) return;
  queue.push({ kind, value: Math.round(value * 10) / 10 });
  if (queue.length >= 18) flush();
}

async function flush() {
  if (!learnerId || !queue.length) return;
  const events = queue.splice(0, 20);
  try {
    await api("/behavior/events", {
      method: "POST",
      body: JSON.stringify({ learner_id: learnerId, events }),
    });
  } catch {
    /* telemetry is best-effort — never interrupt learning */
  }
}

/* --------------------------- focus tracking --------------------------- */

function snapshotFocus() {
  const now = Date.now();
  if (document.visibilityState === "visible" && visibleSince !== null) {
    pushEvent("focus_seconds", (now - visibleSince) / 1000);
    visibleSince = now;
  } else if (hiddenSince !== null) {
    pushEvent("blur_seconds", (now - hiddenSince) / 1000);
    hiddenSince = now;
  }
  if (idleAccumulated > 0) {
    pushEvent("idle_seconds", idleAccumulated);
    idleAccumulated = 0;
  }
}

function onVisibilityChange() {
  const now = Date.now();
  if (document.visibilityState === "hidden") {
    if (visibleSince !== null) pushEvent("focus_seconds", (now - visibleSince) / 1000);
    visibleSince = null;
    hiddenSince = now;
    flush();
  } else {
    if (hiddenSince !== null) pushEvent("blur_seconds", (now - hiddenSince) / 1000);
    hiddenSince = null;
    visibleSince = now;
  }
}

function onActivity() {
  const now = Date.now();
  if (now - lastActivity > IDLE_THRESHOLD_MS && document.visibilityState === "visible") {
    idleAccumulated += (now - lastActivity) / 1000;
  }
  lastActivity = now;
}

function onBeforeUnload() {
  snapshotFocus();
  if (learnerId && queue.length && navigator.sendBeacon) {
    const payload = JSON.stringify({ learner_id: learnerId, events: queue.splice(0, 20) });
    navigator.sendBeacon(
      API_BASE + "/api/behavior/events",
      new Blob([payload], { type: "application/json" })
    );
  }
}

/* --------------------------- camera coaching -------------------------- */

async function startCamera() {
  const cameraToggle = document.getElementById("camera-toggle");
  const video = document.getElementById("camera-video");
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: "user" },
      audio: false,
    });
  } catch {
    toast("Camera permission was declined — coaching stays off.");
    return;
  }
  video.srcObject = cameraStream;
  video.hidden = false;
  await video.play();
  cameraToggle.textContent = "📷 Disable camera coaching";
  cameraToggle.setAttribute("aria-pressed", "true");
  cameraTimer = setInterval(captureAndAnalyze, CAMERA_INTERVAL_MS);
  captureAndAnalyze(); // immediate first read for instant feedback
}

function stopCamera() {
  const cameraToggle = document.getElementById("camera-toggle");
  const video = document.getElementById("camera-video");
  if (cameraTimer) clearInterval(cameraTimer);
  cameraTimer = null;
  if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  video.srcObject = null;
  video.hidden = true;
  cameraToggle.textContent = "📷 Enable camera coaching";
  cameraToggle.setAttribute("aria-pressed", "false");
}

async function captureAndAnalyze() {
  const video = document.getElementById("camera-video");
  const canvas = document.getElementById("camera-canvas");
  if (!cameraStream || !learnerId || document.visibilityState !== "visible") return;
  const width = 160;
  const height = Math.round(width * (video.videoHeight / video.videoWidth || 0.75));
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(video, 0, 0, width, height);
  const base64 = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
  try {
    const result = await api("/behavior/expression", {
      method: "POST",
      body: JSON.stringify({
        learner_id: learnerId,
        image_base64: base64,
        mime_type: "image/jpeg",
      }),
    });
    if (result.source === "gemini") {
      const summary = await api(`/behavior/${learnerId}/summary`);
      renderEngagement(summary.engagement);
    }
  } catch {
    /* best-effort; skip this frame */
  }
}

/* ------------------------------ lifecycle ----------------------------- */

export function startTracking(id) {
  if (learnerId === id) return;
  stopTracking();
  learnerId = id;
  visibleSince = document.visibilityState === "visible" ? Date.now() : null;
  hiddenSince = visibleSince === null ? Date.now() : null;
  flushTimer = setInterval(() => {
    snapshotFocus();
    flush();
  }, FLUSH_INTERVAL_MS);
}

/** Stop tracking, flushing what we have while the session is still valid.
 *  Await this before signing out, or the final POST 401s after the cookie
 *  is cleared. */
export async function stopTracking() {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
  stopCamera();
  snapshotFocus();
  await flush();
  learnerId = null;
  queue = [];
}

/** Drop tracking immediately without touching the network — for when the
 *  session is already gone (an expired-session 401), where flushing could
 *  only produce another failed request. */
export function abandonTracking() {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
  stopCamera();
  learnerId = null;
  queue = [];
}

export function initBehavior() {
  document.addEventListener("visibilitychange", onVisibilityChange);
  ["mousemove", "keydown", "pointerdown", "scroll", "touchstart"].forEach((eventName) =>
    document.addEventListener(eventName, onActivity, { passive: true })
  );
  window.addEventListener("beforeunload", onBeforeUnload);
  document.getElementById("camera-toggle").addEventListener("click", () => {
    if (cameraStream) stopCamera();
    else startCamera();
  });
}
