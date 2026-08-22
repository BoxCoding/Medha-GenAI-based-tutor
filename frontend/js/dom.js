/* Shared DOM utilities: selection, view switching, loader, toasts. */
"use strict";

export const $ = (selector) => document.querySelector(selector);

export function show(viewId) {
  document.querySelectorAll(".view").forEach((view) => {
    view.hidden = view.id !== viewId;
  });
  window.scrollTo({ top: 0 });
}

export function loader(on, text = "Working…") {
  $("#loader").hidden = !on;
  $("#loader-text").textContent = text;
}

let toastTimer;

export function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 4200);
}
