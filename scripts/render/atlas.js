// Multi-page atlas builder. Renders every page defined in a JSON config in
// one Playwright browser context via AtlasControl.prepare() + a single
// page.pdf() call (ADR 0013) — no per-page pdf-lib merge (superseded
// approach, see git history for the old design).
//
// Usage:
//   node scripts/render/atlas.js --pages scripts/render/sample-atlas.json --out atlas.pdf

import { writeFile, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { repoRoot, startStaticServer, renderAtlas } from "./lib.js";

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

  const { bytes, idleMs, totalMs } = await renderAtlas(browser, port, pages);

  await browser.close();
  server.close();

  await writeFile(outPath, bytes);

  console.log(
    JSON.stringify(
      { pageCount: pages.length, idleMs, totalMs, outPath },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
