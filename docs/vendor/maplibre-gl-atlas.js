var R = Object.defineProperty;
var A = (n, t, e) => t in n ? R(n, t, { enumerable: !0, configurable: !0, writable: !0, value: e }) : n[t] = e;
var p = (n, t, e) => A(n, typeof t != "symbol" ? t + "" : t, e);
import { Map as N, ScaleControl as k, LngLatBounds as _ } from "maplibre-gl";
const T = { width: 210, height: 297 }, u = 15;
function $(n) {
  return n ?? T;
}
function z(n) {
  return n == null ? { top: u, right: u, bottom: u, left: u } : typeof n == "number" ? { top: n, right: n, bottom: n, left: n } : {
    top: n.top ?? u,
    right: n.right ?? u,
    bottom: n.bottom ?? u,
    left: n.left ?? u
  };
}
function D() {
  return `
#maplibre-gl-atlas-print-root { display: none; }
@media print {
  body > *:not(#maplibre-gl-atlas-print-root) { display: none !important; }
  #maplibre-gl-atlas-print-root { display: block; }
  #maplibre-gl-atlas-print-root .print-page {
    position: relative;
    box-sizing: border-box;
    break-after: page;
    overflow: hidden;
  }
  /* An atlas with exactly one sheet (no index/overview page, or every other
     sheet excluded by the caller) would otherwise get a trailing blank page
     — break-after still forces a break after the last .print-page even
     though nothing follows it. Confirmed empirically via a headless
     Chromium print-to-PDF run (dwg7/zukaku's scripts/render/render.js CLI,
     ADR 0013): a single-sheet atlas came out as a 2-page PDF, page 2 blank.
     Multi-sheet atlases were unaffected — this only bites the last page. */
  #maplibre-gl-atlas-print-root .print-page:last-child {
    break-after: auto;
  }
}
`;
}
function B(n) {
  const t = z(n), e = t.top / 3, i = t.top / 3, o = t.bottom / 5;
  return `
@media print {
  #maplibre-gl-atlas-print-root .print-page-inner .print-map {
    position: absolute;
    top: ${t.top}mm; left: ${t.left}mm; right: ${t.right}mm; bottom: ${t.bottom}mm;
    box-sizing: border-box;
    border: 0.75pt solid #000;
    overflow: hidden;
  }
  #maplibre-gl-atlas-print-root .print-page-inner .print-map img {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain;
  }
  #maplibre-gl-atlas-print-root .print-page-inner .print-header {
    position: absolute;
    top: 0; left: ${t.left}mm; right: ${t.right}mm; height: ${t.top}mm;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  #maplibre-gl-atlas-print-root .print-page-inner .print-brand { font: bold ${e}mm/1 sans-serif; color: #222; }
  #maplibre-gl-atlas-print-root .print-page-inner .print-ref { font: bold ${i}mm/1 sans-serif; color: #222; text-align: right; }
  #maplibre-gl-atlas-print-root .print-page-inner .print-footer {
    position: absolute;
    bottom: 0; left: ${t.left}mm; right: ${t.right}mm; height: ${t.bottom}mm;
    display: flex;
    align-items: center;
  }
  #maplibre-gl-atlas-print-root .print-page-inner .print-footer .maplibregl-ctrl-scale { margin: 0; font-size: ${o}mm; }
}
`;
}
function O(n) {
  const t = n ?? (typeof navigator < "u" ? navigator : void 0);
  if (!t) return !1;
  const e = t.userAgentData;
  return e && e.platform ? e.platform === "Windows" : /Windows/i.test(t.userAgent || "");
}
function j() {
  return O() ? "rotate" : "mixed";
}
function C(n) {
  return !n || n === "auto" ? j() : n;
}
function F(n) {
  const t = n.filter((e) => e === "landscape").length;
  return t > n.length - t ? "landscape" : "portrait";
}
function I(n) {
  return {
    width: Math.min(n.width, n.height),
    height: Math.max(n.width, n.height)
  };
}
function H(n, t) {
  const { width: e, height: i } = I($(n)), o = `calc(${e}mm - 1mm)`;
  return t === "mixed" ? `
@page atlas-portrait { size: ${e}mm ${i}mm; margin: 0; }
@page atlas-landscape { size: ${i}mm ${e}mm; margin: 0; }
@media print {
  #maplibre-gl-atlas-print-root.strategy-mixed .print-page.portrait-page { page: atlas-portrait; width: ${e}mm; height: ${i}mm; }
  #maplibre-gl-atlas-print-root.strategy-mixed .print-page.landscape-page { page: atlas-landscape; width: ${i}mm; height: ${o}; }
  #maplibre-gl-atlas-print-root.strategy-mixed .print-page-inner { position: absolute; inset: 0; }
}
` : `
@page atlas-base-portrait { size: ${e}mm ${i}mm; margin: 0; }
@page atlas-base-landscape { size: ${i}mm ${e}mm; margin: 0; }
@media print {
  #maplibre-gl-atlas-print-root.strategy-rotate.base-portrait .print-page { page: atlas-base-portrait; width: ${e}mm; height: ${i}mm; }
  #maplibre-gl-atlas-print-root.strategy-rotate.base-landscape .print-page { page: atlas-base-landscape; width: ${i}mm; height: ${o}; }
  #maplibre-gl-atlas-print-root.strategy-rotate .print-page-inner.portrait-page { width: ${e}mm; height: ${i}mm; }
  #maplibre-gl-atlas-print-root.strategy-rotate .print-page-inner.landscape-page { width: ${i}mm; height: ${e}mm; }
  #maplibre-gl-atlas-print-root.strategy-rotate .print-page-inner:not(.rotated) { position: absolute; top: 0; left: 0; }
  #maplibre-gl-atlas-print-root.strategy-rotate.base-portrait .print-page-inner.rotated {
    position: absolute; top: 0; left: ${e}mm;
    transform-origin: 0 0; transform: rotate(90deg);
  }
  #maplibre-gl-atlas-print-root.strategy-rotate.base-landscape .print-page-inner.rotated {
    position: absolute; top: 0; left: ${i}mm;
    transform-origin: 0 0; transform: rotate(90deg);
  }
}
`;
}
const G = 96, U = 25.4;
function S(n) {
  return n * G / U;
}
function W(n, t) {
  const e = $(n), i = Math.min(e.width, e.height), o = Math.max(e.width, e.height), a = S(i), r = S(o);
  return t === "landscape" ? { width: Math.round(r), height: Math.round(a) } : { width: Math.round(a), height: Math.round(r) };
}
function q(n, t, e) {
  const i = W(n, t);
  return e ? {
    width: i.width * e.x,
    height: i.height * e.y
  } : i;
}
async function J(n, t) {
  const e = n.orientation === "landscape" ? "landscape" : "portrait", i = q(t, e, n.renderScale), o = document.createElement("div");
  o.setAttribute("aria-hidden", "true"), o.setAttribute("data-maplibre-gl-atlas-stage", ""), o.style.cssText = `position:fixed; top:0; left:0; opacity:0; pointer-events:none; width:${i.width}px; height:${i.height}px;`, document.body.appendChild(o);
  const a = {
    container: o,
    style: n.style,
    bearing: n.bearing ?? 0,
    pitch: n.pitch ?? 0,
    interactive: !1,
    attributionControl: !1,
    fadeDuration: 0
  };
  n.bounds ? (a.bounds = n.bounds, a.fitBoundsOptions = { padding: n.padding ?? 0, animate: !1 }) : (a.center = n.center, a.zoom = n.zoom);
  const r = new N(a);
  r.addControl(new k({ maxWidth: 100, unit: "metric" }), "bottom-left");
  try {
    await new Promise((l, m) => {
      r.on("error", (g) => m(g.error ?? g)), r.on("load", () => {
        var g;
        r.setProjection({ type: "mercator" }), n.terrain || r.setTerrain(null), Promise.resolve((g = n.decorate) == null ? void 0 : g.call(n, r)).then(() => {
          r.once("idle", () => l());
        }).catch(m);
      });
    });
    const h = r.getCanvas().toDataURL("image/png"), s = r.getContainer().querySelector(".maplibregl-ctrl-scale");
    if (s && n.renderScale) {
      const l = Math.max(n.renderScale.x, n.renderScale.y), m = parseFloat(s.style.width);
      Number.isNaN(m) || (s.style.width = `${m / l}px`);
    }
    const d = s ? s.outerHTML : "";
    return { dataUrl: h, scaleHtml: d, orientation: e };
  } finally {
    r.remove(), o.remove();
  }
}
const b = "__maplibre-gl-atlas-review__", x = "__maplibre-gl-atlas-review-fill__", E = "__maplibre-gl-atlas-review-lines__", c = "maplibre-gl-atlas-review-panel", y = "maplibre-gl-atlas-review-toggle";
class K {
  constructor(t) {
    p(this, "options");
    p(this, "rows", []);
    p(this, "panel");
    p(this, "countEl");
    p(this, "confirmButton");
    p(this, "previouslyFocused");
    p(this, "hasMap");
    p(this, "onKeyDown", (t) => {
      t.key === "Escape" && this.cancel();
    });
    p(this, "repositionToggles", () => {
      const t = this.options.map;
      if (!t) return;
      const e = t.getContainer().getBoundingClientRect();
      for (const i of this.rows) {
        if (!i.toggleEl || !i.anchor) continue;
        const o = t.project(i.anchor);
        i.toggleEl.style.left = `${e.left + o.x}px`, i.toggleEl.style.top = `${e.top + o.y}px`;
      }
    });
    p(this, "disposed", !1);
    var r, h;
    this.options = t, this.hasMap = !!t.map, this.previouslyFocused = document.activeElement, t.sheets.forEach((s) => {
      const d = L(s.bounds), l = d ? Z(d) : s.center;
      this.rows.push({ sheet: s, included: !0, anchor: l });
    }), this.panel = document.createElement("div"), this.panel.className = c, this.panel.setAttribute("role", "dialog"), this.panel.setAttribute("aria-label", "Review atlas before printing"), this.panel.setAttribute("tabindex", "-1");
    const e = document.createElement("div");
    e.className = `${c}-header`;
    const i = document.createElement("strong");
    i.textContent = "Review atlas", this.countEl = document.createElement("span"), this.countEl.className = `${c}-count`, e.append(i, this.countEl);
    const o = document.createElement("div");
    o.className = `${c}-actions`;
    const a = document.createElement("button");
    if (a.type = "button", a.className = `${c}-cancel`, a.textContent = "Cancel", a.addEventListener("click", () => this.cancel()), this.confirmButton = document.createElement("button"), this.confirmButton.type = "button", this.confirmButton.className = `${c}-confirm`, this.confirmButton.addEventListener("click", () => this.confirm()), o.append(a, this.confirmButton), this.hasMap)
      this.panel.append(e, o), this.buildMapToggles(), this.addMapOverlay(), (r = this.options.map) == null || r.on("move", this.repositionToggles), (h = this.options.map) == null || h.on("resize", this.repositionToggles), this.repositionToggles();
    else {
      const s = document.createElement("ul");
      s.className = `${c}-list`, this.rows.forEach((d, l) => {
        const m = document.createElement("li"), g = document.createElement("label"), f = document.createElement("input");
        f.type = "checkbox", f.checked = !0, f.addEventListener("change", () => {
          d.included = f.checked, this.handleToggle();
        });
        const w = document.createElement("span");
        w.className = `${c}-label`, w.textContent = X(d.sheet, l);
        const v = document.createElement("span");
        v.className = `${c}-orientation`, v.textContent = Y(d.sheet), g.append(f, w, v), m.appendChild(g), s.appendChild(m), d.checkbox = f;
      }), this.panel.append(e, s, o);
    }
    document.body.appendChild(this.panel), document.addEventListener("keydown", this.onKeyDown), this.handleToggle(), this.panel.focus();
  }
  buildMapToggles() {
    this.rows.forEach((t) => {
      const e = document.createElement("button");
      e.type = "button", e.className = y, this.paintToggle(e, t.included), e.addEventListener("click", () => {
        t.included = !t.included, this.paintToggle(e, t.included), this.handleToggle();
      }), document.body.appendChild(e), t.toggleEl = e;
    });
  }
  paintToggle(t, e) {
    t.textContent = e ? "×" : "+", t.title = e ? "Exclude this sheet from printing" : "Include this sheet in printing", t.setAttribute("aria-label", t.title), t.classList.toggle(`${y}-excluded`, !e);
  }
  handleToggle() {
    const t = this.rows.filter((e) => e.included);
    this.countEl.textContent = `${t.length} / ${this.rows.length} sheets selected`, this.confirmButton.textContent = `Print ${t.length} sheet${t.length === 1 ? "" : "s"}`, this.confirmButton.disabled = t.length === 0, this.updateMapOverlay();
  }
  confirm() {
    if (this.disposed) return;
    const t = this.rows.filter((e) => e.included).map((e) => e.sheet);
    this.dispose(), this.options.onConfirm(t);
  }
  cancel() {
    this.disposed || (this.dispose(), this.options.onCancel());
  }
  addMapOverlay() {
    const t = this.options.map;
    t && (t.addSource(b, { type: "geojson", data: this.overlayGeoJson() }), t.addLayer({
      id: x,
      type: "fill",
      source: b,
      paint: {
        "fill-color": "#000",
        "fill-opacity": ["case", ["get", "included"], 0, 0.35]
      }
    }), t.addLayer({
      id: E,
      type: "line",
      source: b,
      paint: {
        "line-color": "#1a73e8",
        "line-width": ["case", ["get", "included"], 2.5, 1],
        "line-opacity": ["case", ["get", "included"], 1, 0.5]
      }
    }));
  }
  updateMapOverlay() {
    var i;
    const t = this.options.map;
    if (!t) return;
    const e = t.getSource(b);
    (i = e == null ? void 0 : e.setData) == null || i.call(e, this.overlayGeoJson());
  }
  overlayGeoJson() {
    const t = [];
    return this.rows.forEach((e) => {
      const i = L(e.sheet.bounds);
      i && t.push({
        type: "Feature",
        properties: { included: e.included },
        geometry: { type: "Polygon", coordinates: [i] }
      });
    }), { type: "FeatureCollection", features: t };
  }
  /** Removes the panel DOM, on-map toggles/layers, and event listeners. Idempotent. */
  dispose() {
    var e;
    if (this.disposed) return;
    this.disposed = !0, this.panel.remove(), document.removeEventListener("keydown", this.onKeyDown);
    for (const i of this.rows)
      (e = i.toggleEl) == null || e.remove();
    const t = this.options.map;
    t && (t.off("move", this.repositionToggles), t.off("resize", this.repositionToggles), t.getLayer(E) && t.removeLayer(E), t.getLayer(x) && t.removeLayer(x), t.getSource(b) && t.removeSource(b)), this.previouslyFocused instanceof HTMLElement && this.previouslyFocused.focus();
  }
}
function Y(n) {
  return n.orientation === "landscape" ? "landscape" : "portrait";
}
function X(n, t) {
  const e = [n.headerLeft, n.headerRight].filter((i) => !!i);
  return e.length ? e.join(" — ") : n.role ? `${n.role} ${t + 1}` : `Sheet ${t + 1}`;
}
function L(n) {
  if (!n) return null;
  const t = _.convert(n), e = t.getWest(), i = t.getSouth(), o = t.getEast(), a = t.getNorth();
  return [
    [e, a],
    [o, a],
    [o, i],
    [e, i],
    [e, a]
  ];
}
function Z(n) {
  const t = n.map((i) => i[0]), e = n.map((i) => i[1]);
  return [(Math.min(...t) + Math.max(...t)) / 2, (Math.min(...e) + Math.max(...e)) / 2];
}
function Q() {
  return `
.${c} {
  position: fixed; top: 10px; right: 10px; z-index: 10;
  width: 220px; max-height: calc(100vh - 20px); overflow-y: auto;
  background: #fff; color: #222; border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  font: 13px/1.4 system-ui, sans-serif;
  padding: 10px;
}
.${c}-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.${c}-count { color: #555; font-size: 12px; }
.${c}-list { list-style: none; margin: 0 0 10px; padding: 0; }
.${c}-list li { border-bottom: 1px solid #eee; }
.${c}-list label { display: flex; align-items: center; gap: 6px; padding: 6px 2px; cursor: pointer; }
.${c}-label { flex: 1; }
.${c}-orientation { color: #888; font-size: 11px; }
.${c}-actions { display: flex; justify-content: flex-end; gap: 8px; }
.${c}-actions button { font: inherit; padding: 6px 12px; border-radius: 4px; border: 1px solid #ccc; background: #f5f5f5; cursor: pointer; }
.${c}-confirm { background: #1a73e8; border-color: #1a73e8; color: #fff; }
.${c}-confirm:disabled { background: #9ec1f2; border-color: #9ec1f2; cursor: not-allowed; }

/* On-map toggle button — a circle with ×/+, anchored over each sheet's
   center (dwg7/zukaku's Save Paper cell-toggle, ADR 0008). Positioned via
   left/top set in JS (repositionToggles), tracking the map's own pan/zoom. */
.${y} {
  position: fixed; transform: translate(-50%, -50%);
  z-index: 11; width: 26px; height: 26px; border-radius: 50%;
  border: 1px solid rgba(0,0,0,0.5); background: rgba(255,255,255,0.92);
  font: bold 15px/24px system-ui, sans-serif; text-align: center; color: #333;
  cursor: pointer; padding: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
.${y}-excluded { background: rgba(255,255,255,0.6); color: #666; }
`;
}
const M = "maplibre-gl-atlas-print-root";
class it {
  constructor(t) {
    p(this, "options");
    p(this, "map");
    p(this, "container");
    p(this, "printRoot");
    p(this, "styleEl");
    p(this, "activeReview");
    if (typeof document > "u")
      throw new Error(
        "AtlasControl requires a DOM (`document` is undefined) — it cannot be constructed outside a browser."
      );
    if (!t || typeof t.sheets != "function")
      throw new Error("AtlasControl requires `options.sheets: () => AtlasSheet[] | Promise<AtlasSheet[]>`.");
    this.options = {
      ...t,
      pageSize: $(t.pageSize),
      margin: t.margin ?? 15,
      strategy: t.strategy ?? "auto",
      showButton: t.showButton ?? !0,
      confirm: t.confirm ?? !0,
      injectStyles: t.injectStyles ?? !0
    };
  }
  // Sheets themselves are always rendered via their own offscreen MapLibre
  // instance (snapshot.ts), independent of this map — but review() draws
  // sheet-bounds outlines onto it, so (unlike before the review feature)
  // the control now needs to hold onto it.
  onAdd(t) {
    this.map = t, this.options.injectStyles && this.injectStyles(C(this.options.strategy));
    const e = document.createElement("div");
    if (this.options.showButton) {
      e.className = "maplibregl-ctrl maplibregl-ctrl-group maplibre-gl-atlas-ctrl";
      const i = document.createElement("button");
      i.type = "button", i.className = "maplibre-gl-atlas-ctrl-button", i.title = "Print atlas", i.setAttribute("aria-label", "Print atlas"), i.textContent = "🖨", i.addEventListener("click", () => {
        (this.options.confirm ? this.review() : this.print()).catch((a) => this.handleError(a));
      }), e.appendChild(i);
    }
    return this.container = e, e;
  }
  onRemove() {
    var t, e, i;
    (t = this.activeReview) == null || t.dispose(), this.activeReview = void 0, (e = this.container) == null || e.remove(), this.container = void 0, this.cleanup(), (i = this.styleEl) == null || i.remove(), this.styleEl = void 0, this.map = void 0;
  }
  /**
   * Shows the interactive review panel: how many sheets, where each one is
   * (outlined on the live map, for sheets with `bounds`), with a checkbox
   * per sheet to deselect it before printing. Resolves once the user either
   * confirms (after which the selected subset is printed, same as calling
   * `print()` with that subset) or cancels (nothing is printed). This is
   * what the built-in button calls by default (`confirm: true`) — see
   * adr/0002 for why `print()`/`prepare()` themselves never show this.
   */
  async review() {
    var e;
    (e = this.activeReview) == null || e.dispose();
    const t = await this.options.sheets();
    await new Promise((i, o) => {
      this.activeReview = new K({
        map: this.map,
        sheets: t,
        onConfirm: (a) => {
          this.activeReview = void 0, this.printSheets(a).then(i, o);
        },
        onCancel: () => {
          this.activeReview = void 0, i();
        }
      });
    });
  }
  /** Builds the print DOM (sheets resolved, snapshotted, and laid out) without calling `window.print()`. Never shows the review panel. */
  async prepare() {
    const t = await this.options.sheets();
    await this.buildPrintDom(t);
  }
  /** `prepare()`, then triggers `window.print()` and waits for it to finish (the `afterprint` event). Never shows the review panel. */
  async print() {
    const t = await this.options.sheets();
    await this.printSheets(t);
  }
  /** Shared by `print()` and `review()`'s confirm handler: an already-resolved (and possibly user-filtered) sheet list, straight through to printing. */
  async printSheets(t) {
    var e, i;
    await this.buildPrintDom(t), await new Promise((o) => {
      const a = () => {
        window.removeEventListener("afterprint", a), o();
      };
      window.addEventListener("afterprint", a), window.print();
    });
    try {
      await ((i = (e = this.options).onAfterPrint) == null ? void 0 : i.call(e));
    } catch (o) {
      this.handleError(o);
    } finally {
      this.cleanup();
    }
  }
  async buildPrintDom(t) {
    var e, i;
    try {
      await ((i = (e = this.options).onBeforePrint) == null ? void 0 : i.call(e)), V(t);
      const o = C(this.options.strategy), a = t.map(P), r = F(a);
      this.options.injectStyles && this.injectStyles(o);
      const h = this.getOrCreatePrintRoot();
      h.innerHTML = "", h.className = o === "rotate" ? `strategy-rotate base-${r}` : "strategy-mixed";
      for (const s of t) {
        const d = P(s), { dataUrl: l, scaleHtml: m } = await J(s, this.options.pageSize), g = o === "rotate" && d !== r;
        h.appendChild(tt(s, d, g, l, m));
      }
    } catch (o) {
      throw this.handleError(o), o;
    }
  }
  /** Empties the print DOM and removes any offscreen staging elements left behind by a failed snapshot. */
  cleanup() {
    this.printRoot && (this.printRoot.innerHTML = ""), document.querySelectorAll("[data-maplibre-gl-atlas-stage]").forEach((t) => t.remove());
  }
  injectStyles(t) {
    const e = [
      D(),
      H(this.options.pageSize, t),
      B(this.options.margin),
      Q()
    ].join(`
`);
    this.styleEl || (this.styleEl = document.createElement("style"), document.head.appendChild(this.styleEl)), this.styleEl.textContent = e;
  }
  getOrCreatePrintRoot() {
    var e;
    if ((e = this.printRoot) != null && e.isConnected) return this.printRoot;
    let t = document.getElementById(M);
    return t || (t = document.createElement("div"), t.id = M, t.setAttribute("aria-hidden", "true"), document.body.appendChild(t)), this.printRoot = t, t;
  }
  handleError(t) {
    this.options.onError ? this.options.onError(t) : console.error("[maplibre-gl-atlas]", t);
  }
}
function P(n) {
  return n.orientation === "landscape" ? "landscape" : "portrait";
}
function V(n) {
  if (n.length <= 1) return;
  n.some((e) => !!e.pitch) && console.warn(
    "[maplibre-gl-atlas] One or more sheets have a non-zero `pitch`. Pitch introduces perspective distortion — the map scale varies across the sheet, and physical edges won't line up with neighboring sheets. Reserve `pitch` for a standalone sheet (e.g. a cover page) that isn't meant to be tiled edge-to-edge with the others."
  );
}
function tt(n, t, e, i, o) {
  const a = document.createElement("section");
  a.className = `print-page ${t}-page${n.className ? ` ${n.className}` : ""}`;
  const r = document.createElement("div");
  r.className = `print-page-inner ${t}-page${e ? " rotated" : ""}`;
  const h = document.createElement("div");
  if (h.className = "print-header", n.headerLeft) {
    const l = document.createElement("div");
    l.className = "print-brand", l.textContent = n.headerLeft, h.appendChild(l);
  }
  if (n.headerRight) {
    const l = document.createElement("div");
    l.className = "print-ref", l.textContent = n.headerRight, h.appendChild(l);
  }
  r.appendChild(h);
  const s = document.createElement("div");
  s.className = "print-map";
  const d = document.createElement("img");
  if (d.src = i, d.alt = "", s.appendChild(d), r.appendChild(s), n.footer !== !1) {
    const l = document.createElement("div");
    l.className = "print-footer", l.innerHTML = o, r.appendChild(l);
  }
  return a.appendChild(r), a;
}
export {
  it as AtlasControl,
  K as ReviewPanel,
  j as choosePrintStrategy,
  O as isLikelyWindows
};
//# sourceMappingURL=maplibre-gl-atlas.js.map
