# requests/

Atlas render requests land here as `atlas-*.json` files — normally created by
clicking **Make Atlas** in [docs/index.html](../docs/index.html), which opens
GitHub's own "create file" page pre-filled with the JSON (see
[ADR 0006](../adr/0006-github-actions-render-pipeline.md)). Pushing or
merging a `requests/*.json` file triggers
[.github/workflows/atlas.yml](../.github/workflows/atlas.yml), which renders
it with `scripts/render/atlas.js` and uploads the resulting PDF as a workflow
artifact.

**Everything under `requests/` is disposable — treat it like `tmp/`.** The
JSON files here are triggers, not an archive; the rendered PDFs live only as
workflow artifacts (default retention, currently 30 days) and are never
committed. Nothing here needs to be kept forever — old `requests/*.json`
files can be deleted/squashed away at any time without asking. If a PDF
needs to be kept long-term, save it somewhere outside this repo.

The same file also works locally without GitHub Actions:

```bash
node scripts/render/atlas.js --pages requests/atlas-*.json --out atlas.pdf
```
