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

/**
 * Renders an entire atlas (all pages) to a single combined PDF, using
 * `AtlasControl.prepare()` (scripts/render/atlas-page.html) instead of the
 * old one-`BrowserContext`-and-`page.pdf()`-per-page + `pdf-lib` merge
 * approach — see ADR 0013 for why that couldn't just be a mechanical
 * swap. One `BrowserContext` navigates once to atlas-page.html, which builds
 * every sheet into one print DOM (named `@page` rules, mixing portrait and
 * landscape sheets in one job — same CSS strategy as docs/index.html's
 * "Print in Browser", ADR 0007/0012), then `page.pdf()` is called exactly
 * once with no explicit width/height/format — the injected `@page` rules
 * decide each page's physical size, the same way they do in a real
 * browser's print pipeline (Playwright's `page.pdf()` goes through the same
 * underlying Chromium print-to-PDF code as `window.print()`).
 *
 * @param {import('playwright').Browser} browser
 * @param {number} port - port of the static server serving `repoRoot`
 * @param {object[]} pages - docs/requests/*.json shape (computePages()'s
 *   output, unchanged by ADR 0012): each entry is
 *   { style, bbox: [w,s,e,n] } OR { style, lon, lat, zoom }, plus optional
 *   { orientation, bearing, pitch, ref, grid, title, padding, renderScale }
 * @param {object} [opts]
 * @param {number} [opts.deviceScaleFactor] - default 3, matches the old
 *   per-page pipeline's default raster resolution
 * @returns {Promise<{bytes: Uint8Array, idleMs: number, totalMs: number}>}
 */
export async function renderAtlas(browser, port, pages, opts = {}) {
  const deviceScaleFactor = opts.deviceScaleFactor ?? 3;
  const context = await browser.newContext({ viewport: { width: 1200, height: 1600 }, deviceScaleFactor });
  const page = await context.newPage();

  // Playwright's own mechanism for handing a page complex data before its
  // scripts run — not a query string, which has practical length limits a
  // multi-cell grid's JSON can exceed.
  await page.addInitScript((pagesData) => {
    window.__zukakuPages = pagesData;
  }, pages);

  const url = `http://127.0.0.1:${port}/scripts/render/atlas-page.html`;

  const t0 = Date.now();
  await page.goto(url, { waitUntil: "load" });
  // Every sheet is snapshotted sequentially inside one prepare() call (same
  // total work as the old per-page loop, just not split across separate
  // browser contexts) — scale the timeout with page count instead of a flat
  // budget sized for one page.
  await page.waitForFunction(
    () => window.__zukakuReady === true || window.__zukakuError,
    null,
    { timeout: Math.max(30000, pages.length * 20000) }
  );
  const mapError = await page.evaluate(() => window.__zukakuError);
  if (mapError) {
    await context.close();
    throw new Error(`AtlasControl reported an error: ${mapError}`);
  }
  const idleMs = Date.now() - t0;

  // preferCSSPageSize is required — without it, Playwright's page.pdf()
  // ignores @page size entirely and defaults to Letter format, silently
  // discarding the mixed portrait/landscape @page rules AtlasControl
  // injected (confirmed empirically: omitting this produced uniform
  // 612x792pt/792x612pt Letter pages instead of A4).
  const bytes = await page.pdf({ printBackground: true, preferCSSPageSize: true });
  const totalMs = Date.now() - t0;

  await context.close();
  return { bytes, idleMs, totalMs };
}
