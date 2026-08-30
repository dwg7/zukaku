// Single-page verification CLI for ADR 0002.
//
// Usage:
//   node scripts/render/render.js --style positron --lon 139.767 --lat 35.681 \
//     --zoom 14 --orientation portrait --out out.pdf
//   node scripts/render/render.js --style bvmap-dark --bbox 139.70,35.66,139.80,35.71 \
//     --orientation landscape --out out.pdf

import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
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
  const outPath = args.out || "out.pdf";

  const spec = {
    style: args.style || "positron",
    orientation: args.orientation === "landscape" ? "landscape" : "portrait",
    bearing: args.bearing ? Number(args.bearing) : undefined,
    pitch: args.pitch ? Number(args.pitch) : undefined,
    deviceScaleFactor: args.scale ? Number(args.scale) : undefined,
  };
  if (args.bbox) {
    spec.bbox = args.bbox.split(",").map(Number);
  } else {
    spec.lon = args.lon ? Number(args.lon) : undefined;
    spec.lat = args.lat ? Number(args.lat) : undefined;
    spec.zoom = args.zoom ? Number(args.zoom) : undefined;
  }

  const server = await startStaticServer(repoRoot);
  const port = server.address().port;
  const browser = await chromium.launch();

  const { bytes, idleMs, totalMs } = await renderPage(browser, port, spec);
  await writeFile(outPath, bytes);

  await browser.close();
  server.close();

  console.log(JSON.stringify({ ...spec, idleMs, totalMs, outPath }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
