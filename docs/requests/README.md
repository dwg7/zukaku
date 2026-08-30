# docs/requests/

Atlas render requests land here as `atlas-*.json` files — normally created by
clicking **Make Atlas** in [docs/index.html](../index.html), which opens
GitHub's own "create file" page pre-filled with the JSON (see
[ADR 0006](../../adr/0006-github-actions-render-pipeline.md)). Pushing or
merging a `docs/requests/*.json` file triggers
[.github/workflows/atlas.yml](../../.github/workflows/atlas.yml), which
renders it with `scripts/render/atlas.js` into
[../responses/](../responses/) and (once pushed/merged) commits the PDF back
so it's reachable at a stable GitHub Pages URL.

Lives under `docs/` (not a top-level `requests/`) specifically so it's paired
with its matching file in `docs/responses/` at a browsable URL — e.g.
`docs/requests/atlas-2026-08-30.json` alongside
`docs/responses/atlas-2026-08-30.pdf` — letting anyone trace a PDF back to
the exact request that produced it.

**These files are cheap to keep, but not precious.** The workflow only
renders a request if `docs/responses/<name>.pdf` doesn't already exist, so
`docs/requests/` can grow indefinitely without making later runs slower —
old requests are just skipped, not re-rendered. There's no operational need
to clean this out regularly; do it whenever it's convenient, not on a
schedule.

The same file also works locally without GitHub Actions:

```bash
node scripts/render/atlas.js --pages docs/requests/atlas-*.json --out atlas.pdf
```
