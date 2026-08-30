# docs/responses/

Rendered atlas PDFs, one per file in [../requests/](../requests/), written
by [.github/workflows/atlas.yml](../../.github/workflows/atlas.yml) (see
[ADR 0006](../../adr/0006-github-actions-render-pipeline.md)). Because this
lives under `docs/`, every PDF here gets a stable GitHub Pages URL —
`docs/requests/atlas-2026-08-30.json` renders to
`https://dwg7.github.io/zukaku/responses/atlas-2026-08-30.pdf` — shareable
and printable directly, no trip through the Actions UI to unzip an artifact.

Only committed on `push` (i.e. once a request is actually merged), not on
every PR revision — a PR run still renders and checks the PDF, but only as a
throwaway workflow artifact, to avoid committing intermediate versions while
a request is still being reviewed.

**Prune whenever it's convenient — nothing here is precious.** If a file
gets deleted, its request in `docs/requests/` will simply render again the
next time anything touches that directory.
