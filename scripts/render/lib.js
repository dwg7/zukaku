// Shared rendering logic used by both render.js (single-page CLI) and
// atlas.js (multi-page atlas builder). See ADR 0002 for why this goes through
// a real headless browser instead of a native renderer.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..", "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

// A4 at 96 CSS px/inch, used for the browser viewport (deviceScaleFactor handles
// the actual raster resolution of the map canvas).
const A4_PORTRAIT_PX = { width: 794, height: 1123 };

export function startStaticServer(root) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(req.url.split("?")[0]);
        const filePath = path.join(root, urlPath);
        if (!filePath.startsWith(root)) {
          res.writeHead(403);
          res.end();
          return;
        }
        const data = await readFile(filePath);
        const ext = path.extname(filePath);
        res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
        res.end(data);
      } catch (err) {
        res.writeHead(404);
        res.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

export function viewportFor(orientation) {
  return orientation === "landscape"
    ? { width: A4_PORTRAIT_PX.height, height: A4_PORTRAIT_PX.width }
    : { width: A4_PORTRAIT_PX.width, height: A4_PORTRAIT_PX.height };
}

export function pdfDimsFor(orientation) {
  return orientation === "landscape"
    ? { width: "297mm", height: "210mm" }
    : { width: "210mm", height: "297mm" };
}

/**
 * Render one atlas page to PDF bytes using an already-launched Playwright
 * browser and an already-running static server (both are reused across pages
 * by atlas.js to avoid the cost of relaunching Chromium per page).
 *
 * @param {import('playwright').Browser} browser
 * @param {number} port - port of the static server serving `repoRoot`
 * @param {object} spec - { style, bbox: [w,s,e,n] } OR { style, lon, lat, zoom },
 *   plus optional { orientation, bearing, pitch, deviceScaleFactor }
 * @returns {Promise<{bytes: Uint8Array, idleMs: number, totalMs: number}>}
 */
export async function renderPage(browser, port, spec) {
  const orientation = spec.orientation === "landscape" ? "landscape" : "portrait";
  const deviceScaleFactor = spec.deviceScaleFactor ?? 3;
  const viewport = viewportFor(orientation);

  const context = await browser.newContext({ viewport, deviceScaleFactor });
  const page = await context.newPage();

  const qs = new URLSearchParams({ style: spec.style || "positron" });
  if (spec.bbox) {
    qs.set("bbox", spec.bbox.join(","));
  } else {
    qs.set("lon", String(spec.lon ?? 139.767));
    qs.set("lat", String(spec.lat ?? 35.681));
    qs.set("zoom", String(spec.zoom ?? 14));
  }
  if (spec.bearing) qs.set("bearing", String(spec.bearing));
  if (spec.pitch) qs.set("pitch", String(spec.pitch));
  if (spec.ref) qs.set("ref", spec.ref);
  if (spec.grid) qs.set("grid", JSON.stringify(spec.grid));
  if (spec.title) qs.set("title", spec.title);
  if (spec.padding) qs.set("padding", String(spec.padding));
  // Zoom-level shift (ADR 0009): overview-only, see page.html and
  // docs/index.html's computePages() for what this does.
  if (spec.renderScale) qs.set("renderScale", JSON.stringify(spec.renderScale));

  const url = `http://127.0.0.1:${port}/scripts/render/page.html?${qs}`;

  const t0 = Date.now();
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(
    () => window.__zukakuReady === true || window.__zukakuError,
    null,
    { timeout: 30000 }
  );
  const mapError = await page.evaluate(() => window.__zukakuError);
  if (mapError) {
    await context.close();
    throw new Error(`MapLibre GL JS reported an error: ${mapError}`);
  }
  const idleMs = Date.now() - t0;

  const bytes = await page.pdf({
    ...pdfDimsFor(orientation),
    printBackground: true,
    margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
  });
  const totalMs = Date.now() - t0;

  await context.close();
  return { bytes, idleMs, totalMs };
}
