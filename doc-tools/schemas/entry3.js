import mermaid from "mermaid";
import ELK from "elkjs/lib/elk.bundled.js";
import { convertToExcalidrawElements, exportToBlob } from "@excalidraw/excalidraw";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";

mermaid.initialize({ startOnLoad: false });
const elk = new ELK();
const FONT = 5, FS = 16, LH = 1.25;
const PALETTE = [
  { bg: "#a5d8ff", stroke: "#1971c2", frame: "#e7f5ff" },
  { bg: "#b2f2bb", stroke: "#2f9e44", frame: "#ebfbee" },
  { bg: "#ffd8a8", stroke: "#e8590c", frame: "#fff4e6" },
  { bg: "#d0bfff", stroke: "#6741d9", frame: "#f3f0ff" },
  { bg: "#ffc9c9", stroke: "#e03131", frame: "#fff5f5" },
  { bg: "#99e9f2", stroke: "#0c8599", frame: "#e3fafc" },
  { bg: "#fcc2d7", stroke: "#c2255c", frame: "#fff0f6" },
  { bg: "#ffec99", stroke: "#e67700", frame: "#fff9db" },
];
const NEUTRAL = { bg: "#e9ecef", stroke: "#343a40", frame: "#f8f9fa" };

const clean = (t) => (t || "")
  .replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/#quot;/g, '"').replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/^"(.*)"$/s, "$1").trim();

let ctx;
const measure = (text, fs = FS) => {
  ctx ||= document.createElement("canvas").getContext("2d");
  ctx.font = `${fs}px Excalifont, Xiaolai, sans-serif`;
  const lines = text.split("\n");
  return { w: Math.max(...lines.map((l) => ctx.measureText(l).width)), h: lines.length * fs * LH };
};

window.warmup = async () => {
  const sample = "AaBbÉéèêàçùô→←⚠️ïœ«»—…(){}[]_:/0123456789";
  const els = convertToExcalidrawElements([{ type: "text", x: 0, y: 0, text: sample, fontFamily: FONT }]);
  await exportToBlob({ elements: els, files: {}, mimeType: "image/png" });
  await document.fonts.ready;
  return measure(sample).w;
};

async function flowchart(src) {
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(src);
  const db = diagram.db;
  const vmap = db.getVertices();
  const vertices = vmap instanceof Map ? [...vmap.values()] : Object.values(vmap);
  const edges = db.getEdges();
  const subgraphs = db.getSubGraphs();
  const dir = (db.getDirection?.() || "TB").replace("TD", "TB");
  const elkDir = { TB: "DOWN", BT: "UP", LR: "RIGHT", RL: "LEFT" }[dir] || "DOWN";

  const sgIds = new Set(subgraphs.map((s) => s.id));
  const parentOf = {};
  for (const sg of subgraphs) for (const n of sg.nodes) if (!parentOf[n]) parentOf[n] = sg.id;
  const depth = (id) => (parentOf[id] ? 1 + depth(parentOf[id]) : 0);
  const topSg = (id) => { let p = parentOf[id], last = null; while (p) { last = p; p = parentOf[p]; } return last; };
  const sgColor = {};
  subgraphs.filter((s) => !parentOf[s.id]).forEach((s, i) => (sgColor[s.id] = PALETTE[i % PALETTE.length]));
  const colorOf = (id) => {
    if (sgColor[id]) return sgColor[id];
    const t = topSg(id);
    return t ? sgColor[t] : null;
  };
  const noSg = subgraphs.length === 0;
  // Without subgraphs, colour by graph depth from roots so layers read as bands.
  const elkNodes = {};
  const mk = (id, children) => (elkNodes[id] = { id, children: children || [], edges: [], labels: [] });

  const root = { id: "root", children: [], edges: [],
    layoutOptions: {
      "elk.algorithm": "layered", "elk.direction": elkDir,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "90",
      "elk.spacing.nodeNode": "45",
      "elk.layered.spacing.edgeNodeBetweenLayers": "40",
      "elk.spacing.edgeNode": "25", "elk.spacing.edgeEdge": "28", "elk.layered.spacing.edgeEdgeBetweenLayers": "22",
      "elk.spacing.edgeLabel": "6",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.edgeLabels.inline": "false",
      "elk.layered.mergeEdges": "false",
      "elk.separateConnectedComponents": "false",
    } };
  const info = {};
  for (const v of vertices) {
    const text = clean(v.text ?? v.id);
    const m = measure(text || " ");
    const shape = v.type === "diamond" ? "diamond" : (v.type === "circle" || v.type === "doublecircle") ? "ellipse" : "rectangle";
    const empty = !text.trim();
    let w = Math.ceil(m.w + 36), h = Math.ceil(m.h + 26);
    if (shape === "diamond") { w = Math.ceil(m.w * 1.6 + 40); h = Math.ceil(m.h * 1.8 + 30); }
    if (empty) { w = h = 24; }
    info[v.id] = { text, shape, w, h, empty, round: ["round", "stadium"].includes(v.type) };
  }
  for (const sg of subgraphs) {
    const title = clean(sg.title || sg.id);
    const m = measure(title, 18);
    info[sg.id] = { text: title, sg: true, tw: m.w, th: m.h };
  }
  const place = (id) => {
    const p = parentOf[id];
    return p ? elkNodes[p] || mk(p) : root;
  };
  for (const sg of subgraphs) {
    const n = mk(sg.id);
    n.layoutOptions = {
      "elk.padding": `[top=${Math.ceil(info[sg.id].th + 24)},left=22,bottom=22,right=22]`,
      "elk.layered.spacing.nodeNodeBetweenLayers": "90",
      "elk.layered.spacing.edgeNodeBetweenLayers": "40",
      "elk.spacing.nodeNode": "45",
    };
    n.width = Math.ceil(info[sg.id].tw + 44);
  }
  // Children follow Mermaid declaration order (a group sits where its first node appears),
  // because the MODEL_ORDER cycle breaking treats that order as the forward direction.
  const inserted = new Set();
  const insertGroup = (sgId) => {
    if (inserted.has(sgId)) return;
    if (parentOf[sgId]) insertGroup(parentOf[sgId]);
    inserted.add(sgId);
    (parentOf[sgId] ? elkNodes[parentOf[sgId]] : root).children.push(elkNodes[sgId]);
  };
  for (const v of vertices) {
    if (sgIds.has(v.id)) continue;
    if (parentOf[v.id]) insertGroup(parentOf[v.id]);
    const i = info[v.id];
    place(v.id).children.push({ id: v.id, width: i.w, height: i.h });
  }
  for (const sg of subgraphs) insertGroup(sg.id);
  edges.forEach((e, k) => {
    const label = clean(e.text);
    const ed = { id: "e" + k, sources: [e.start], targets: [e.end], labels: [] };
    if (label) { const m = measure(label, 14); ed.labels.push({ id: "l" + k, text: label, width: Math.ceil(m.w + 10), height: Math.ceil(m.h + 4) }); }
    root.edges.push(ed);
  });
  // Model order only helps when there are loops to break; on acyclic graphs it distorts layering.
  const adj = {};
  edges.forEach((e) => (adj[e.start] ||= []).push(e.end));
  const state = {};
  const hasCycle = (u) => {
    state[u] = 1;
    for (const w of adj[u] || []) { if (state[w] === 1 || (!state[w] && hasCycle(w))) return true; }
    state[u] = 2; return false;
  };
  const cyclic = Object.keys(adj).some((u) => !state[u] && hasCycle(u));
  if (cyclic) {
    root.layoutOptions["elk.layered.considerModelOrder.strategy"] = "NODES_AND_EDGES";
    root.layoutOptions["elk.layered.cycleBreaking.strategy"] = "MODEL_ORDER";
  }
  // Shared trunks read well for trees (one source fanning out, many sources fanning in),
  // but become ambiguous when a fanned-out edge lands on a node that also has other parents.
  const outd = {}, ind = {};
  edges.forEach((e) => { outd[e.start] = (outd[e.start] || 0) + 1; ind[e.end] = (ind[e.end] || 0) + 1; });
  const ambiguous = edges.some((e) => outd[e.start] > 1 && ind[e.end] > 1);
  if (!cyclic && !ambiguous) root.layoutOptions["elk.layered.mergeEdges"] = "true";
  const res = await elk.layout(root);

  // Absolute coordinates.
  const abs = {};
  const walk = (n, ox, oy) => {
    for (const c of n.children || []) {
      abs[c.id] = { x: ox + c.x, y: oy + c.y, w: c.width, h: c.height };
      walk(c, ox + c.x, oy + c.y);
    }
  };
  walk(res, 0, 0);

  const skel = [];
  const ids = {};
  // Frames first (outer to inner) so they sit behind.
  const titles = [];
  const sgSorted = [...subgraphs].sort((a, b) => depth(a.id) - depth(b.id));
  for (const sg of sgSorted) {
    const a = abs[sg.id]; const c = colorOf(sg.id) || NEUTRAL; const d = depth(sg.id);
    skel.push({ type: "rectangle", id: "sg_" + sg.id, x: a.x, y: a.y, width: a.w, height: a.h,
      backgroundColor: d === 0 ? c.frame : "#ffffff", strokeColor: c.stroke, strokeStyle: "dashed",
      fillStyle: "solid", roughness: 1, strokeWidth: 1, roundness: { type: 3 } });
    titles.push({ sg, a, c, d });
  }
  // Depth colouring when there are no subgraphs: roots/sinks differ.
  const indeg = {}, outdeg = {};
  edges.forEach((e) => { indeg[e.end] = (indeg[e.end] || 0) + 1; outdeg[e.start] = (outdeg[e.start] || 0) + 1; });
  for (const v of vertices) {
    if (sgIds.has(v.id)) continue;
    const a = abs[v.id], i = info[v.id];
    let c = colorOf(v.id);
    if (!c) {
      if (noSg) c = !indeg[v.id] ? PALETTE[0] : !outdeg[v.id] ? PALETTE[1] : i.shape === "diamond" ? PALETTE[7] : NEUTRAL;
      else c = NEUTRAL;
    }
    if (i.empty) { skel.push({ type: "ellipse", id: "n_" + v.id, x: a.x, y: a.y, width: a.w, height: a.h, backgroundColor: "#343a40", strokeColor: "#343a40", fillStyle: "solid" }); continue; }
    skel.push({ type: i.shape, id: "n_" + v.id, x: a.x, y: a.y, width: a.w, height: a.h,
      backgroundColor: c.bg, strokeColor: c.stroke, fillStyle: "solid", roughness: 1, strokeWidth: 2,
      roundness: i.shape === "rectangle" ? { type: 3 } : null,
      label: { text: i.text, fontSize: FS, fontFamily: FONT, strokeColor: "#1e1e1e" } });
  }
  const out = convertToExcalidrawElements(skel, { regenerateIds: false });
  const byId = Object.fromEntries(out.map((e) => [e.id, e]));

  // Arrows with the ELK orthogonal route; bindings keep them attached when boxes move.
  const obstacles = vertices.filter((v) => !sgIds.has(v.id) && abs[v.id]).map((v) => abs[v.id]);
  for (const t of titles) obstacles.push({ x: t.a.x + 10, y: t.a.y + 6, w: info[t.sg.id].tw + 8, h: info[t.sg.id].th + 8 });
  const routes = {};
  const collect = (n) => { for (const e of n.edges || []) routes[e.id] = e; for (const c of n.children || []) collect(c); };
  collect(res);
  // Segments of every route, so a label never sits on another edge's line.
  const segRects = [];
  edges.forEach((e, k) => {
    const r = routes["e" + k]; if (!r || !r.sections) return;
    const off = r.container && r.container !== "root" && abs[r.container] ? abs[r.container] : { x: 0, y: 0 };
    const s = r.sections[0];
    const p = [s.startPoint, ...(s.bendPoints || []), s.endPoint].map((q) => [q.x + off.x, q.y + off.y]);
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i], [bx, by] = p[i + 1];
      segRects.push({ k, x: Math.min(ax, bx) - 2, y: Math.min(ay, by) - 2, w: Math.abs(bx - ax) + 4, h: Math.abs(by - ay) + 4 });
    }
  });
  edges.forEach((e, k) => {
    const r = routes["e" + k]; if (!r || !r.sections) return;
    // Edge coordinates are relative to the container of the edge's owner node.
    const ownerOff = r.container && r.container !== "root" && abs[r.container] ? abs[r.container] : { x: 0, y: 0 };
    const s = r.sections[0];
    const pts = [s.startPoint, ...(s.bendPoints || []), s.endPoint].map((p) => [p.x + ownerOff.x, p.y + ownerOff.y]);
    // Excalidraw scales the arrowhead with the last segment: keep it long enough to show.
    const MIN_LAST = 28;
    const n = pts.length;
    if (n >= 3) {
      const [ex, ey] = pts[n - 1], [bx, by] = pts[n - 2], [ax, ay] = pts[n - 3];
      const len = Math.hypot(ex - bx, ey - by);
      if (len > 0 && len < MIN_LAST) {
        if (bx === ex && ay === by) {
          const ny = ey - Math.sign(ey - by) * MIN_LAST;
          pts[n - 2] = [bx, ny]; pts[n - 3] = [ax, ny];
        } else if (by === ey && ax === bx) {
          const nx = ex - Math.sign(ex - bx) * MIN_LAST;
          pts[n - 2] = [nx, by]; pts[n - 3] = [nx, ay];
        }
      }
    }
    const [x0, y0] = pts[0];
    const id = "a" + k;
    const dotted = e.stroke === "dotted";
    const thick = e.stroke === "thick";
    const noHead = (e.type || "").includes("open");
    const srcEl = byId["n_" + e.start], dstEl = byId["n_" + e.end];
    const arrow = {
      id, type: "arrow", x: x0, y: y0, width: 0, height: 0, angle: 0,
      strokeColor: dotted ? "#868e96" : "#495057", backgroundColor: "transparent", fillStyle: "solid",
      strokeWidth: thick ? 3 : 2, strokeStyle: dotted ? "dashed" : "solid", roughness: 1, opacity: 100,
      groupIds: [], frameId: null, roundness: null, seed: Math.floor(Math.random() * 2 ** 31), version: 1,
      versionNonce: Math.floor(Math.random() * 2 ** 31), isDeleted: false, boundElements: [], updated: Date.now(),
      link: null, locked: false, points: pts.map(([x, y]) => [x - x0, y - y0]), lastCommittedPoint: null,
      startBinding: srcEl ? { elementId: srcEl.id, focus: 0, gap: 4 } : null,
      endBinding: dstEl ? { elementId: dstEl.id, focus: 0, gap: 4 } : null,
      startArrowhead: null, endArrowhead: noHead ? null : "arrow", elbowed: false,
    };
    const xs = arrow.points.map((p) => p[0]), ys = arrow.points.map((p) => p[1]);
    arrow.width = Math.max(...xs) - Math.min(...xs); arrow.height = Math.max(...ys) - Math.min(...ys);
    for (const el of [srcEl, dstEl]) if (el) (el.boundElements ||= []).push({ id, type: "arrow" });
    out.push(arrow);
    const lab = r.labels && r.labels[0];
    if (lab) {
      // Anchor the label on the longest segment of the route, where it is least ambiguous.
      const segLen = (q) => Math.hypot(pts[q + 1][0] - pts[q][0], pts[q + 1][1] - pts[q][1]);
      const lw = lab.width - 10, lh = lab.height - 4;
      // Candidates: segment entering the target first, then longest first; each segment offers
      // a side chosen by direction (so opposite edges never stack) and the other side as fallback.
      const segs = [...Array(pts.length - 1).keys()].filter((q) => segLen(q) > 12);
      const lastQ = pts.length - 2;
      segs.sort((a, b) => (b === lastQ) - (a === lastQ) || segLen(b) - segLen(a));
      const cands = [];
      for (const q of segs) {
        const mx = (pts[q][0] + pts[q + 1][0]) / 2, my = (pts[q][1] + pts[q + 1][1]) / 2;
        const dx = pts[q + 1][0] - pts[q][0], dy = pts[q + 1][1] - pts[q][1];
        if (Math.abs(dy) >= Math.abs(dx)) {
          const pref = dy > 0 ? mx - lw - 8 : mx + 8, other = dy > 0 ? mx + 8 : mx - lw - 8;
          cands.push([pref, my - lh / 2], [other, my - lh / 2]);
        } else {
          const pref = dx > 0 ? my - lh - 6 : my + 6, other = dx > 0 ? my + 6 : my - lh - 6;
          cands.push([mx - lw / 2, pref], [mx - lw / 2, other]);
        }
      }
      const overlaps = (o, x, y) => x < o.x + o.w + 3 && x + lw > o.x - 3 && y < o.y + o.h + 3 && y + lh > o.y - 3;
      const hit = (x, y) => obstacles.some((o) => overlaps(o, x, y)) || segRects.some((o) => o.k !== k && overlaps(o, x, y));
      let [lx, ly] = cands.find(([x, y]) => !hit(x, y)) || cands[0] || [pts[0][0], pts[0][1]];
      obstacles.push({ x: lx, y: ly, w: lw, h: lh });
      const [t] = convertToExcalidrawElements([{ type: "text", x: lx, y: ly,
        text: lab.text, fontSize: 14, fontFamily: FONT, strokeColor: "#495057" }]);
      t.containerId = null;
      // A white backdrop keeps labels readable where they cross lines.
      const [bgr] = convertToExcalidrawElements([{ type: "rectangle", x: t.x - 4, y: t.y - 2, width: t.width + 8, height: t.height + 4,
        backgroundColor: "#ffffff", strokeColor: "transparent", fillStyle: "solid", roughness: 0, opacity: 90 }]);
      bgr.groupIds = t.groupIds = ["g" + id];
      out.push(bgr, t);
    }
  });
  for (const { sg, a, c, d } of titles) {
    const [t] = convertToExcalidrawElements([{ type: "text", x: a.x + 14, y: a.y + 10, text: info[sg.id].text,
      fontSize: 18, fontFamily: FONT, strokeColor: c.stroke }]);
    const [bgr] = convertToExcalidrawElements([{ type: "rectangle", x: t.x - 4, y: t.y - 2, width: t.width + 8, height: t.height + 4,
      backgroundColor: d === 0 ? c.frame : "#ffffff", strokeColor: "transparent", fillStyle: "solid", roughness: 0 }]);
    bgr.groupIds = t.groupIds = ["gt" + sg.id];
    out.push(bgr, t);
  }
  return out;
}

const ACTOR = PALETTE;
async function sequence(src) {
  const { elements } = await parseMermaidToExcalidraw(src, { themeVariables: { fontSize: "16px" } });
  for (const e of elements) {
    if (e.label && typeof e.label.text === "string") e.label.text = clean(e.label.text);
    if (typeof e.text === "string") e.text = clean(e.text);
  }
  const els = convertToExcalidrawElements(elements, { regenerateIds: true });
  // Colour actor boxes by their x column, notes in yellow, activations in grey.
  const actors = els.filter((e) => e.type === "rectangle" && e.boundElements?.some((b) => b.type === "text"));
  const cols = [...new Set(actors.map((a) => Math.round(a.x + a.width / 2)))].sort((a, b) => a - b);
  for (const a of actors) {
    const txt = els.find((t) => t.containerId === a.id);
    const isNote = a.backgroundColor && a.backgroundColor !== "transparent" && a.backgroundColor.toLowerCase().startsWith("#fff5");
    const c = ACTOR[cols.indexOf(Math.round(a.x + a.width / 2)) % ACTOR.length];
    if (txt && /^Note|^note/.test(txt.text)) continue;
    a.backgroundColor = isNote ? "#fff3bf" : c.bg; a.strokeColor = isNote ? "#e67700" : c.stroke; a.fillStyle = "solid";
  }
  for (const e of els) {
    if (e.type === "text") e.fontFamily = FONT;
    if (e.type === "arrow") e.strokeColor = e.strokeStyle === "dashed" ? "#868e96" : "#495057";
  }
  return els;
}

window.convertMermaid2 = async (src) => {
  const head = src.trim().split("\n")[0];
  const elements = head.startsWith("sequenceDiagram") ? await sequence(src) : await flowchart(src);
  return { elements, files: {} };
};

window.render = async (elements) => {
  const blob = await exportToBlob({ elements, appState: { exportBackground: true, viewBackgroundColor: "#ffffff" }, files: {}, mimeType: "image/png", exportPadding: 20 });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
};
