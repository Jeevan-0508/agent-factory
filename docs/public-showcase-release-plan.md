# Public showcase release plan (source repository stays private)

Status: **Preparation only. Not deployed.**

## Scope and separation

- Source: private `Jeevan-0508/agent-factory` repository, V4.1 on `main`.
- Intended public destination: a **separate public repository** containing only audited static showcase assets (name to be chosen).
- No mirroring of the private Git history, Node/SQLite backend, migrations, local database, environment files, credentials, internal test fixtures, or CI artifacts.
- Public content is deliberately non-executing: no server-side workflow execution, approval, model invocation, or real operational telemetry.
- The public site must visibly label its catalog and execution-console views as **showcase / preview only**.

## Important pre-publication gate

The current `npm run build:site` copies `dashboard/{index.html,app.js,experiences.js,styles.css}` and the **complete** `catalog/roles.json` to `dist/`. Do **not** publish `dist/` unreviewed. Inspect catalog contents and every copied asset for sensitive or proprietary prompts, credentials, URLs, internal identifiers, hidden API endpoints, private data, and any content not intended for public release.

The dashboard currently contains an Execution Console designed to connect to the local backend. A public preview must disable its executable actions, suppress any automatic session/API calls, and present an explicit offline preview state. Avoid suggesting that local approvals or audit events are remotely accessible.

## Implementation checklist

1. Implement a separate `build:showcase` output, distinct from `build:site`, with a curated, sanitized public catalog.
2. Remove or disable all API/session/network execution paths in the public build. Make the offline preview state unmistakable.
3. Ensure assets work under the intended GitHub Pages project subpath (relative URLs or a verified base path).
4. Add `.nojekyll`, proper `index.html`, and no secrets, sourcemaps with private paths, or hidden backend files.
5. Add a public-facing README explaining the eight UI experiences, 100 role identities, 30 locally supported runtime roles, 70 registry-only roles, and the distinction between **public static preview** and **private local execution**.
6. Add actual Playwright smoke tests for the public build: all eight experiences, mobile layout, catalog load, no executable network requests, no console errors, and 404/link checks.
7. Add automated artifact allowlist and sensitive-content checks. Manually inspect the exact publishable output.
8. Prepare a separate **public** GitHub repository containing only the reviewed output and a minimal site workflow. Never copy private repository history.
9. Deploy via GitHub Pages and check the returned URL in a real browser before adding a `Launch Dashboard` link to the private README.
10. Retain the original repository as **private** and verify its visibility after deployment.

## Current status

- V4.1 merge to `main`: completed.
- Dedicated preparation branch: `codex/public-showcase-prep`.
- Public showcase build: not implemented.
- Separate public repository: not created.
- Public GitHub Pages URL: not yet available.
- No deployment or visibility changes have been made.

## Explicit release gate

Do not publish the current `dist/` without completing the security review and creating a sanitized static-only build. The final URL must be reported only after a successful deployment and browser verification.
