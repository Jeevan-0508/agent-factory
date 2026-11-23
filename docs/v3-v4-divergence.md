# V3/V4 branch divergence decision

The V4 branch was verified from the V3 runtime baseline at commit `da3c8e0`. The only commits unique to `origin/codex/god-mode-v2` after that point were:

- `ec11c1d` — add a live dashboard link to the README;
- `72f8a05` — add a GitHub Pages deployment workflow.

These commits were audited and intentionally not integrated into V4.1. They are deployment/publishing changes, while the V4.1 scope explicitly prohibits deployment, publishing, and enabling a public live surface. Keeping them out preserves both PR histories without silently expanding the release boundary. Neither PR is merged by this repair loop.
