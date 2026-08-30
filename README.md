# zukaku (図郭)

Print-ready field atlases — a modern take on [Field Papers](https://fieldpapers.org/),
without the scan-back.

Pick an area on a map, choose a style and a grid of pages, and get a PDF
atlas built for printing and carrying into the field: an index page up
front, one page per grid cell, each with a scale bar, north arrow, and grid
reference.

- **Interface & output**: modeled on Field Papers.
- **Rendering process**: Headless Chromium (Playwright) driving MapLibre GL
  JS — no self-hosted tile server. Map data comes straight from
  [stars.optgeo.org](https://stars.optgeo.org).
- **Where it runs**: [docs/index.html](docs/index.html) (GitHub Pages) is
  the range picker; rendering itself runs in GitHub Actions or locally —
  nothing is ever hosted as a standing server.

## Try it

1. Open the range picker: **https://dwg7.github.io/zukaku/**
2. Pick a style, a city, and a grid size; pan/zoom the map underneath the
   fixed grid to line it up.
3. Click **Make Atlas** — it opens a pre-filled GitHub "create file" page.
   Commit it (as a PR if you don't have push access) to
   `docs/requests/`, and [the workflow](.github/workflows/atlas.yml) renders
   a matching PDF into `docs/responses/`, reachable at
   `https://dwg7.github.io/zukaku/responses/<name>.pdf`.

Or run it locally:

```bash
npm install
node scripts/render/atlas.js --pages docs/requests/atlas-*.json --out atlas.pdf
```

## Scope

Large-scale field maps only (roughly z12 and above) — no scan-back, no
QR codes, no small-scale overview maps. See [CLAUDE.md](CLAUDE.md) for the
full rationale and [DECISIONS.md](DECISIONS.md) for why things are built the
way they are.

**Everything here is public.** This is a public repository, and `docs/` is
exactly what GitHub Pages serves — every atlas request and every rendered
PDF is visible to anyone, indefinitely. See
[docs/requests/README.md](docs/requests/README.md) for details.

## Docs

- [CLAUDE.md](CLAUDE.md) — scope and design philosophy (read this first)
- [HANDOVER.md](HANDOVER.md) — current state, what's next
- [DECISIONS.md](DECISIONS.md) — index of design decisions
- [adr/](adr/) — full decision records
