/* Deterministic micro-visualization engine.
 *
 * Lessons carry structured visual blocks (```chart / ```flow fences with
 * strict JSON) authored by Gemini. This module validates the JSON and renders
 * labeled SVG charts and HTML flow diagrams. Invalid specs return null and
 * the caller falls back to a plain code block — a malformed generation can
 * never break a lesson.
 *
 * All strings from the LLM are HTML-escaped before injection; all numbers
 * are validated as finite. Colors come from theme CSS variables so visuals
 * follow light/dark mode automatically. */
"use strict";

const PALETTE = ["var(--accent-strong)", "var(--info)", "var(--gold)", "var(--danger)"];

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/* ------------------------------- charts ------------------------------- */

function validateChart(spec) {
  if (!spec || typeof spec !== "object") return null;
  const type = spec.type === "bar" ? "bar" : spec.type === "line" ? "line" : null;
  const labels = Array.isArray(spec.labels)
    ? spec.labels.slice(0, 6).map((label) => String(label).slice(0, 24))
    : null;
  if (!type || !labels || labels.length < 2) return null;
  const series = (Array.isArray(spec.series) ? spec.series : [])
    .slice(0, 3)
    .map((entry) => ({
      name: String(entry?.name ?? "").slice(0, 40) || "series",
      values: (Array.isArray(entry?.values) ? entry.values : [])
        .slice(0, labels.length)
        .map(num),
    }))
    .filter(
      (entry) => entry.values.length === labels.length && entry.values.every((v) => v !== null)
    );
  if (!series.length) return null;
  return {
    type,
    labels,
    series,
    title: String(spec.title ?? "").slice(0, 90),
    xLabel: String(spec.x_label ?? "").slice(0, 60),
    yLabel: String(spec.y_label ?? "").slice(0, 60),
    note: String(spec.note ?? "").slice(0, 400),
  };
}

function chartSVG(chart) {
  const width = 680;
  const height = 360;
  const margin = { top: 46, right: 20, bottom: 78, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const allValues = chart.series.flatMap((entry) => entry.values);
  const maxValue = Math.max(...allValues, 0);
  const minValue = Math.min(...allValues, 0);
  const span = maxValue - minValue || 1;
  const y = (value) => margin.top + plotHeight - ((value - minValue) / span) * plotHeight;

  const parts = [];
  parts.push(
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(chart.title || "chart")}" ` +
      `preserveAspectRatio="xMidYMid meet">`
  );
  if (chart.title) {
    parts.push(
      `<text x="${width / 2}" y="22" text-anchor="middle" class="viz-title">` +
        `${esc(chart.title)}</text>`
    );
  }

  // Horizontal gridlines + y-axis tick labels (4 ticks).
  for (let tick = 0; tick <= 4; tick++) {
    const value = minValue + (span * tick) / 4;
    const ty = y(value);
    parts.push(
      `<line x1="${margin.left}" y1="${ty}" x2="${width - margin.right}" y2="${ty}" class="viz-grid"/>`,
      `<text x="${margin.left - 8}" y="${ty + 4}" text-anchor="end" class="viz-tick">` +
        `${esc(Math.round(value * 100) / 100)}</text>`
    );
  }

  if (chart.yLabel) {
    const cy = margin.top + plotHeight / 2;
    parts.push(
      `<text x="16" y="${cy}" class="viz-axis" text-anchor="middle" ` +
        `transform="rotate(-90 16 ${cy})">${esc(chart.yLabel)}</text>`
    );
  }
  if (chart.xLabel) {
    parts.push(
      `<text x="${margin.left + plotWidth / 2}" y="${height - 8}" text-anchor="middle" ` +
        `class="viz-axis">${esc(chart.xLabel)}</text>`
    );
  }

  const slot = plotWidth / chart.labels.length;
  chart.labels.forEach((label, index) => {
    const x = margin.left + slot * index + slot / 2;
    parts.push(
      `<text x="${x}" y="${margin.top + plotHeight + 18}" text-anchor="middle" ` +
        `class="viz-tick">${esc(label)}</text>`
    );
  });

  if (chart.type === "bar") {
    const groupWidth = slot * 0.72;
    const barWidth = groupWidth / chart.series.length;
    chart.series.forEach((entry, seriesIndex) => {
      entry.values.forEach((value, index) => {
        const x = margin.left + slot * index + (slot - groupWidth) / 2 + barWidth * seriesIndex;
        const top = Math.min(y(value), y(0));
        const barHeight = Math.abs(y(value) - y(0)) || 1;
        parts.push(
          `<rect x="${x}" y="${top}" width="${Math.max(2, barWidth - 3)}" height="${barHeight}" ` +
            `rx="3" fill="${PALETTE[seriesIndex % PALETTE.length]}" fill-opacity="0.85"/>`
        );
      });
    });
  } else {
    chart.series.forEach((entry, seriesIndex) => {
      const color = PALETTE[seriesIndex % PALETTE.length];
      const points = entry.values
        .map((value, index) => `${margin.left + slot * index + slot / 2},${y(value)}`)
        .join(" ");
      parts.push(
        `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" ` +
          `stroke-linejoin="round"/>`
      );
      entry.values.forEach((value, index) => {
        parts.push(
          `<circle cx="${margin.left + slot * index + slot / 2}" cy="${y(value)}" r="4" ` +
            `fill="${color}"/>`
        );
      });
    });
  }

  // Legend (only when multiple series).
  if (chart.series.length > 1) {
    let legendX = margin.left;
    const legendY = margin.top + plotHeight + 38;
    chart.series.forEach((entry, seriesIndex) => {
      const color = PALETTE[seriesIndex % PALETTE.length];
      parts.push(
        `<rect x="${legendX}" y="${legendY - 9}" width="12" height="12" rx="3" fill="${color}"/>`,
        `<text x="${legendX + 18}" y="${legendY + 2}" class="viz-tick">${esc(entry.name)}</text>`
      );
      legendX += 30 + entry.name.length * 7;
    });
  }

  parts.push("</svg>");
  return parts.join("");
}

/* -------------------------------- flows ------------------------------- */

function validateFlow(spec) {
  if (!spec || typeof spec !== "object") return null;
  const steps = (Array.isArray(spec.steps) ? spec.steps : [])
    .slice(0, 7)
    .map((step) => String(step).slice(0, 140))
    .filter(Boolean);
  if (steps.length < 2) return null;
  return {
    steps,
    title: String(spec.title ?? "").slice(0, 90),
    note: String(spec.note ?? "").slice(0, 400),
  };
}

function flowHTML(flow) {
  const parts = [`<div class="flow" role="img" aria-label="${esc(flow.title || "process diagram")}">`];
  if (flow.title) parts.push(`<p class="viz-title-html">${esc(flow.title)}</p>`);
  flow.steps.forEach((step, index) => {
    if (index > 0) parts.push(`<div class="flow-arrow" aria-hidden="true">↓</div>`);
    parts.push(`<div class="flow-step"><span class="flow-index">${index + 1}</span>${esc(step)}</div>`);
  });
  parts.push("</div>");
  return parts.join("");
}

/* ------------------------------ dispatcher ---------------------------- */

/** Render a "chart" or "flow" JSON spec to HTML, or null when invalid. */
export function renderVisual(kind, rawJson) {
  let spec;
  try {
    spec = JSON.parse(rawJson);
  } catch {
    return null;
  }
  try {
    if (kind === "chart") {
      const chart = validateChart(spec);
      if (!chart) return null;
      return (
        `<figure class="viz-figure">${chartSVG(chart)}` +
        (chart.note ? `<figcaption class="viz-note">📖 ${esc(chart.note)}</figcaption>` : "") +
        `</figure>`
      );
    }
    if (kind === "flow") {
      const flow = validateFlow(spec);
      if (!flow) return null;
      return (
        `<figure class="viz-figure">${flowHTML(flow)}` +
        (flow.note ? `<figcaption class="viz-note">📖 ${esc(flow.note)}</figcaption>` : "") +
        `</figure>`
      );
    }
  } catch {
    return null;
  }
  return null;
}
