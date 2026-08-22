/* Minimal markdown → HTML for trusted-structure, escaped-content rendering.
 * Supports headings, lists, quotes, tables, code fences — and dispatches
 * ```chart / ```flow fences to the visualization engine (falling back to a
 * plain code block if the visual spec is invalid). */
"use strict";

import { renderVisual } from "./viz.js";

export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// escapeHtml encodes & < > — the viz engine needs the raw JSON back.
function unescapeEntities(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export function renderMarkdown(md) {
  const lines = escapeHtml(md).split("\n");
  const out = [];
  let fenceLang = null; // null = not inside a fence
  let fenceBuffer = [];
  let listType = null;
  let tableBuffer = [];

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  const flushTable = () => {
    if (!tableBuffer.length) return;
    const rows = tableBuffer.map((line) =>
      line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim())
    );
    tableBuffer = [];
    const hasHeader = rows.length >= 2 && rows[1].every((cell) => /^:?-{3,}:?$/.test(cell));
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
    if (fenceLang === "chart" || fenceLang === "flow") {
      const visual = renderVisual(fenceLang, unescapeEntities(content));
      if (visual) {
        out.push(visual);
        fenceLang = null;
        return;
      }
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
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else if (numbered) {
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
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
