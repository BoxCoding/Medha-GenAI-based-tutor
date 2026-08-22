/* Radial mind-map renderer.
 * Fetches a Gemini-generated (server-cached) mind map for a concept and
 * draws it as pure SVG: center node, colored branches by kind, leaf phrases. */
"use strict";

import { api } from "./api.js";
import { $, loader, show, toast } from "./dom.js";
import { state } from "./state.js";

const KIND_COLORS = {
  intuition: "var(--info)",
  example: "var(--accent-strong)",
  steps: "var(--accent)",
  pitfall: "var(--danger)",
  connection: "var(--gold)",
};
const KIND_LABELS = {
  intuition: "Intuition",
  example: "Practical example",
  steps: "How to apply",
  pitfall: "Pitfalls",
  connection: "Connections",
};

const SVG_NS = "http://www.w3.org/2000/svg";

function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function wrapText(textNode, content, maxChars) {
  // Split long phrases into <tspan> lines so they stay readable.
  const words = content.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((lineText, index) => {
    const tspan = el("tspan", {
      x: textNode.getAttribute("x"),
      dy: index === 0 ? `${-(lines.length - 1) * 0.55}em` : "1.1em",
    });
    tspan.textContent = lineText;
    textNode.appendChild(tspan);
  });
}

function render(container, mindmap) {
  container.textContent = "";
  const width = 960;
  const height = 780;
  const cx = width / 2;
  const cy = height / 2;

  const svg = el("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `Mind map of ${mindmap.center}`,
    preserveAspectRatio: "xMidYMid meet",
  });

  const branches = mindmap.branches;
  const branchRadius = 190;
  const leafRadius = 300;

  branches.forEach((branch, branchIndex) => {
    const angle = (branchIndex / branches.length) * 2 * Math.PI - Math.PI / 2;
    const bx = cx + branchRadius * Math.cos(angle);
    const by = cy + branchRadius * Math.sin(angle);
    const color = KIND_COLORS[branch.kind] || "var(--info)";

    svg.appendChild(
      el("line", {
        x1: cx, y1: cy, x2: bx, y2: by,
        stroke: color, "stroke-width": 2.5, "stroke-opacity": 0.55,
      })
    );

    // Leaves fan out around the branch direction; alternating radii
    // stagger neighbors so long labels don't collide.
    const count = branch.children.length;
    branch.children.forEach((child, childIndex) => {
      const spread = 0.34;
      const childAngle = angle + (childIndex - (count - 1) / 2) * spread;
      const radius = leafRadius + (childIndex % 2 === 0 ? 0 : 62);
      const lx = cx + radius * Math.cos(childAngle);
      const ly = cy + radius * Math.sin(childAngle);
      svg.appendChild(
        el("line", {
          x1: bx, y1: by, x2: lx, y2: ly,
          stroke: color, "stroke-width": 1.5, "stroke-opacity": 0.35,
        })
      );
      const leafText = el("text", {
        x: lx, y: ly, "text-anchor": "middle",
        class: "mm-leaf", fill: "var(--text-muted)",
      });
      wrapText(leafText, child, 24);
      svg.appendChild(leafText);
    });

    const branchWidth = Math.max(90, branch.label.length * 7.5 + 26);
    svg.appendChild(
      el("rect", {
        x: bx - branchWidth / 2, y: by - 20, width: branchWidth, height: 40,
        rx: 20, fill: "var(--card)", stroke: color, "stroke-width": 2,
      })
    );
    const branchText = el("text", {
      x: bx, y: by + 5, "text-anchor": "middle",
      class: "mm-branch", fill: "var(--text)",
    });
    branchText.textContent = branch.label;
    svg.appendChild(branchText);
  });

  const centerWidth = Math.max(120, mindmap.center.length * 8.5 + 40);
  svg.appendChild(
    el("rect", {
      x: cx - centerWidth / 2, y: cy - 28, width: centerWidth, height: 56,
      rx: 28, fill: "var(--accent)", stroke: "var(--accent-strong)", "stroke-width": 2,
    })
  );
  const centerText = el("text", {
    x: cx, y: cy + 6, "text-anchor": "middle",
    class: "mm-center", fill: "var(--accent-ink)",
  });
  centerText.textContent = mindmap.center;
  svg.appendChild(centerText);

  container.appendChild(svg);
}

function renderLegend(listEl, mindmap) {
  listEl.textContent = "";
  const kinds = [...new Set(mindmap.branches.map((branch) => branch.kind))];
  for (const kind of kinds) {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.background = KIND_COLORS[kind] || "var(--info)";
    li.append(dot, KIND_LABELS[kind] || kind);
    listEl.appendChild(li);
  }
}

export async function openMindmap(concept) {
  loader(true, `Drawing the “${concept.name}” mind map…`);
  try {
    const data = await api("/mindmap", {
      method: "POST",
      body: JSON.stringify({ learner_id: state.learner.id, concept_id: concept.id }),
    });
    $("#mindmap-title").textContent = `Mind map · ${data.concept.name}`;
    const badge = $("#mindmap-source");
    badge.textContent = data.source === "cache" ? "cached" : data.source;
    badge.className = "badge " + (data.source === "fallback" ? "warn" : "ok");
    render($("#mindmap-container"), data.mindmap);
    renderLegend($("#mindmap-legend"), data.mindmap);
    state.currentConcept = concept;
    show("view-mindmap");
  } catch (error) {
    toast(error.message);
  } finally {
    loader(false);
  }
}

export function initMindmap() {
  document.querySelectorAll("[data-back-lesson]").forEach((button) =>
    button.addEventListener("click", () => show("view-lesson"))
  );
}
