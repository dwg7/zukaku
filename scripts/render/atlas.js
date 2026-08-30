// Multi-page atlas builder for ADR 0002: renders each page defined in a JSON
// config through the same headless-Chromium pipeline as render.js, then merges
// all pages into a single PDF with pdf-lib.
//
// Usage:
//   node scripts/render/atlas.js --pages scripts/render/sample-atlas.json --out atlas.pdf

import { writeFile, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { repoRoot, startStaticServer, renderPage } from "./lib.js";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[key] = val;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outPath = args.out || "atlas.pdf";
  const pagesPath = args.pages;
  if (!pagesPath) {
    throw new Error("--pages <config.json> is required (array of page specs)");
  }
  const pages = JSON.parse(await readFile(pagesPath, "utf8"));
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error(`${pagesPath} must contain a non-empty JSON array of page specs`);
  }

  const server = await startStaticServer(repoRoot);
  const port = server.address().port;
  const browser = await chromium.launch();

  const atlas = await PDFDocument.create();
  const timings = [];
  const t0 = Date.now();

  for (const [i, spec] of pages.entries()) {
    const { bytes, idleMs, totalMs } = await renderPage(browser, port, spec);
    const src = await PDFDocument.load(bytes);
    const [copiedPage] = await atlas.copyPages(src, [0]);
    atlas.addPage(copiedPage);
    timings.push({ page: i + 1, style: spec.style, orientation: spec.orientation || "portrait", idleMs, totalMs });
    console.error(`page ${i + 1}/${pages.length} done (${totalMs}ms)`);
  }

  await browser.close();
  server.close();

  const mergedBytes = await atlas.save();
  await writeFile(outPath, mergedBytes);

  console.log(
    JSON.stringify(
      { pageCount: pages.length, totalMs: Date.now() - t0, outPath, timings },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
