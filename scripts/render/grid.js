// Expands a Field-Papers-style "m rows x n cols, centered on a point" atlas
// spec into a flat array of per-page render specs (ADR 0005: same interaction
// model as fp-web's leaflet-page-composer.js — a grid centered on a point,
// sized by page count and paper aspect ratio).
//
// The grid is computed directly with Web Mercator pixel math (the same math
// MapLibre GL JS uses internally) rather than by asking a live map instance to
// unproject screen points, so it works headlessly in plain Node with no
// browser round-trip. Only bearing=0 is supported for now: a rotated view
// can't be expressed as an axis-aligned per-cell bbox, and grid generation
// with rotation isn't needed until the interactive UI (ADR 0005) exists.

import { viewportFor } from "./lib.js";

const TILE_SIZE = 512; // MapLibre GL JS's world-pixel-size base (worldSize = TILE_SIZE * 2^zoom)

function lonLatToWorldPx(lon, lat, worldSize) {
  const x = worldSize * ((lon + 180) / 360);
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y =
    worldSize * (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI));
  return [x, y];
}

function worldPxToLonLat(x, y, worldSize) {
  const lon = (x / worldSize) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / worldSize;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return [lon, lat];
}

/**
 * @param {object} spec
 * @param {string} spec.style
 * @param {string} [spec.label] - city/area name, reused for every cell
 * @param {number} spec.lon - grid center longitude
 * @param {number} spec.lat - grid center latitude
 * @param {number} spec.zoom - shared zoom level for every cell (this is what
 *   "大縮尺" - large scale - means in practice: a high zoom value)
 * @param {number} spec.rows - m
 * @param {number} spec.cols - n
 * @param {"portrait"|"landscape"} [spec.orientation]
 * @returns {object[]} page specs consumable by lib.js#renderPage
 */
export function buildGridPages(spec) {
  const { style, label, lon, lat, zoom, rows, cols } = spec;
  const orientation = spec.orientation === "landscape" ? "landscape" : "portrait";
  if (!(rows >= 1) || !(cols >= 1)) {
    throw new Error("rows and cols must both be >= 1");
  }

  const worldSize = TILE_SIZE * 2 ** zoom;
  const [centerX, centerY] = lonLatToWorldPx(lon, lat, worldSize);
  const { width: cellWidthPx, height: cellHeightPx } = viewportFor(orientation);

  const totalWidthPx = cols * cellWidthPx;
  const totalHeightPx = rows * cellHeightPx;
  const topLeftX = centerX - totalWidthPx / 2;
  const topLeftY = centerY - totalHeightPx / 2;

  const pages = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellCenterX = topLeftX + (c + 0.5) * cellWidthPx;
      const cellCenterY = topLeftY + (r + 0.5) * cellHeightPx;
      const [cellLon, cellLat] = worldPxToLonLat(cellCenterX, cellCenterY, worldSize);
      pages.push({
        style,
        label: label ? `${label} (${r + 1}/${rows}, ${c + 1}/${cols})` : undefined,
        lon: cellLon,
        lat: cellLat,
        zoom,
        orientation,
      });
    }
  }
  return pages;
}
