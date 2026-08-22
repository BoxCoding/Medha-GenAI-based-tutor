/* Medhā — learning-behavior tracker.
 *
 * Signals collected (batched to the server every ~20s):
 *   focus_seconds / blur_seconds — tab visibility (screen focus)
 *   idle_seconds                 — no mouse/keyboard for 60s+ while visible
 *   response_time                — pushed by the quiz flow
 *
 * Camera coaching (strictly opt-in): every ~45s one downscaled frame is sent
 * to the server, classified by Gemini into an engagement label, and discarded.
 * The video never records; only the label is stored.
 */
"use strict";

(function () {
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

  const cameraToggle = document.getElementById("camera-toggle");
  const video = document.getElementById("camera-video");
  const canvas = document.getElementById("camera-canvas");

  /* ------------------------------ queueing ------------------------------ */

  function push(kind, value) {
    if (!learnerId || value <= 0) return;
    queue.push({ kind, value: Math.round(value * 10) / 10 });
    if (queue.length >= 18) flush();
  }

  async function flush() {
    if (!learnerId || !queue.length) return;
    const events = queue.splice(0, 20);
    try {
      await window.Medha.api("/behavior/events", {
        method: "POST",
        body: JSON.stringify({ learner_id: learnerId, events }),
      });
    } catch (_) {
      /* telemetry is best-effort — never interrupt learning */
    }
  }

  /* --------------------------- focus tracking --------------------------- */

  function snapshotFocus() {
    const now = Date.now();
    if (document.visibilityState === "visible" && visibleSince !== null) {
      push("focus_seconds", (now - visibleSince) / 1000);
      visibleSince = now;
    } else if (hiddenSince !== null) {
      push("blur_seconds", (now - hiddenSince) / 1000);
      hiddenSince = now;
    }
    if (idleAccumulated > 0) {
      push("idle_seconds", idleAccumulated);
      idleAccumulated = 0;
    }
  }

  document.addEventListener("visibilitychange", () => {
    const now = Date.now();
    if (document.visibilityState === "hidden") {
      if (visibleSince !== null) push("focus_seconds", (now - visibleSince) / 1000);
      visibleSince = null;
      hiddenSince = now;
      flush();
    } else {
      if (hiddenSince !== null) push("blur_seconds", (now - hiddenSince) / 1000);
      hiddenSince = null;
      visibleSince = now;
    }
  });

  ["mousemove", "keydown", "pointerdown", "scroll", "touchstart"].forEach((eventName) =>
    document.addEventListener(
      eventName,
      () => {
        const now = Date.now();
        if (now - lastActivity > IDLE_THRESHOLD_MS && document.visibilityState === "visible") {
          idleAccumulated += (now - lastActivity) / 1000;
        }
        lastActivity = now;
      },
      { passive: true }
    )
  );

  window.addEventListener("beforeunload", () => {
    snapshotFocus();
    if (learnerId && queue.length && navigator.sendBeacon) {
      const payload = JSON.stringify({ learner_id: learnerId, events: queue.splice(0, 20) });
      navigator.sendBeacon("/api/behavior/events", new Blob([payload], { type: "application/json" }));
    }
  });

  /* --------------------------- camera coaching -------------------------- */

  async function startCamera() {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
        audio: false,
      });
    } catch (_) {
      window.Medha.toast("Camera permission was declined — coaching stays off.");
      return false;
    }
    video.srcObject = cameraStream;
    video.hidden = false;
    await video.play();
    cameraToggle.textContent = "📷 Disable camera coaching";
    cameraToggle.setAttribute("aria-pressed", "true");
    cameraTimer = setInterval(captureAndAnalyze, CAMERA_INTERVAL_MS);
    captureAndAnalyze(); // immediate first read for instant feedback
    return true;
  }

  function stopCamera() {
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
    if (!cameraStream || !learnerId || document.visibilityState !== "visible") return;
    const width = 160;
    const height = Math.round(width * (video.videoHeight / video.videoWidth || 0.75));
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    const base64 = dataUrl.split(",")[1];
    try {
      const result = await window.Medha.api("/behavior/expression", {
        method: "POST",
        body: JSON.stringify({ learner_id: learnerId, image_base64: base64, mime_type: "image/jpeg" }),
      });
      if (result.source === "gemini") {
        const summary = await window.Medha.api(`/behavior/${learnerId}/summary`);
        window.Medha.renderEngagement(summary.engagement);
      }
    } catch (_) {
      /* best-effort; skip this frame */
    }
  }

  cameraToggle.addEventListener("click", () => {
    if (cameraStream) stopCamera();
    else startCamera();
  });

  /* ------------------------------ lifecycle ----------------------------- */

  function start(id) {
    if (learnerId === id) return;
    stop();
    learnerId = id;
    visibleSince = document.visibilityState === "visible" ? Date.now() : null;
    hiddenSince = visibleSince === null ? Date.now() : null;
    flushTimer = setInterval(() => {
      snapshotFocus();
      flush();
    }, FLUSH_INTERVAL_MS);
  }

  function stop() {
    if (flushTimer) clearInterval(flushTimer);
    flushTimer = null;
    stopCamera();
    snapshotFocus();
    flush();
    learnerId = null;
    queue = [];
  }

  window.MedhaBehavior = { start, stop, push };
})();
