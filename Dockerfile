# Batch PDF-atlas generation. ADR 0002: Headless Chromium (Playwright) +
# MapLibre GL JS, no self-hosted tile server — map data comes straight from
# stars.optgeo.org over HTTPS.
#
# The Microsoft Playwright base image ships Chromium plus every OS-level
# dependency (Mesa/EGL, fonts, etc.) already wired up for headless rendering,
# which is the whole point of ADR 0002 (avoid the EGL/Xvfb pitfalls that
# MapLibre Native headless rendering hit in ADR 0001). The image tag's version
# must match the `playwright` npm package version in package.json exactly.
FROM mcr.microsoft.com/playwright:v1.62.1-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY scripts ./scripts

# Pages are supplied at run time, e.g.:
#   docker run --rm -v "$PWD/out:/out" zukaku \
#     node scripts/render/atlas.js --pages scripts/render/sample-atlas.json --out /out/atlas.pdf
ENTRYPOINT ["node", "scripts/render/atlas.js"]
