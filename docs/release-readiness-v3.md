# Agent Factory God Loop V3 — release-readiness evidence

Status: implementation and local verification complete; CI evidence is produced by `.github/workflows/validate.yml`. This document records observed checks, not a production or legal certification.

## Scope

This pass preserves the shared 100-role catalog, five governed workflow templates, 30 typed-runtime profiles, 70 registry-only profiles, eight visual experiences, Prompt Studio, workflow designer, Evaluation Lab, governance documentation, and evidence-backed Agent Galaxy relationships.

No provider execution, hosted memory, analytics, live telemetry, deployment, package publication, or repository visibility change is introduced.

## Browser evidence

The Playwright suite uses a loopback-only Node server with an explicit public-file allowlist. It exercises:

- all eight experience switcher states and 100-role index counts;
- all 100 catalog-backed profiles, including prompt, boundaries, and runtime sections;
- search, filter persistence, Prompt Studio editing, workflow step mutation, Evaluation Lab, and Governance;
- Agent Galaxy’s 100 SVG nodes, explicit relationship edges, and 100-role accessible directory;
- keyboard focus, mobile navigation containment, focus restoration, reduced-motion behavior, and no console/page errors;
- WCAG-tagged axe scans over all eight overviews and the shared Overview, Agents, Prompt Studio, Workflows, Evaluation Lab, and Governance routes;
- performance thresholds for local load, catalog transfer size, and search interaction.

Run locally:

```text
npm ci
npx playwright install chromium
npm run test:e2e
npm run test:e2e:update   # only when intentionally approving a visual change
```

## Visual matrix

Approved overview baselines are stored under `tests/e2e/visual.spec.mjs-snapshots/` and cover 8 experiences × 4 viewports = 32 screenshots:

| Experience | Composition and discovery language |
| --- | --- |
| Command Center | Cinematic operations brief with metrics, coverage map, truth model, and action rail. |
| Minimal Studio | Editorial index with large typographic count, selected typed surface, and quiet row navigation. |
| Cyberpunk Neon | Operator console with neon grid, typed-surface readout, signal board, and boundary notice. |
| Glass Universe | Layered observatory with glass panels, orbit lines, family worlds, and an entry into Galaxy. |
| Agent Galaxy | Deterministic constellation whose edges derive only from shared capabilities or adjacent workflow steps. |
| Mythology Atlas | Encyclopedia grouped by mythology with an explicit codename-versus-capability reading rule. |
| Retro Terminal | Keyboard-first terminal shell with catalog BIOS, query prompt, and role listing. |
| Neo-Brutalist Lab | Bold comparison board with graphic governance banner, feasibility blocks, and contract cards. |

The visual test also asserts that the document has no horizontal overflow at desktop, tablet, mobile, and wide viewports. A mobile clipping defect in the Neo-Brutalist role cards and a tablet margin defect in Minimal Studio were found and repaired before baseline approval.

## Accessibility findings and repairs

The final local axe run has no critical or serious WCAG-tagged violations in the covered routes. Repairs included:

- theme-aware contrast tokens for light surfaces, dark surfaces, and the Neo-Brutalist index;
- named agent and workflow controls;
- mobile drawer `inert`/`aria-hidden` containment, stateful labels, Escape return focus, and open-focus behavior;
- profile-heading focus restoration;
- prompt and agent filter focus restoration after DOM replacement;
- workflow heading hierarchy;
- unique labels for Cyberpunk and Galaxy complementary regions;
- an explicit accessible Agent Galaxy directory as the keyboard/assistive-technology reading path, with the constellation retained as a visual relationship map.

This is evidence from automated and browser keyboard checks, not a screen-reader or legal conformance certification.

## Security and performance posture

`npm run test:security` checks text-node DOM construction, absence of HTML injection sinks, the governance URL allowlist, `noopener noreferrer`, static-server path containment, CSP, `nosniff`, and malformed URL handling logic. `npm audit --audit-level=low` is a CI gate for the development-only Playwright and axe packages.

The local server binds to `127.0.0.1` and exposes only the dashboard entrypoint, its JavaScript/CSS, and the catalog JSON. It does not serve `.git`, source role files, package metadata, or arbitrary repository paths.

The performance suite uses conservative local budgets: under 5 seconds wall-clock for application readiness, under 2.5 seconds for DOM/network milestones, under 1 MB transfer size, and under 500 ms for a search interaction. These are local build budgets, not production SLOs.

## CI gates

The workflow runs:

1. catalog tests, validation, build, security checks, syntax checks, and low-severity dependency audit on Ubuntu and Windows;
2. Playwright functional/browser tests on Ubuntu and Windows;
3. the 32-screenshot visual matrix on Windows;
4. Playwright reports, traces, videos, and failure screenshots as workflow artifacts.

The branch remains a draft PR target. Do not merge, deploy, publish packages, or change repository visibility as part of this release-readiness pass.

## Known limitations

- The static dashboard documents and composes agent contracts; it does not execute agents or prove provider quality.
- Runtime compatibility is a versioned catalog fact, not a heartbeat or authorization grant.
- Scenario, live-runtime, and empirical performance evidence remain explicitly unmeasured by design.
- Linux visual rendering is exercised through functional browser CI; approved visual baselines are generated and compared on Windows to keep the committed image set platform-consistent.
- Legal, employment, privacy, governance, and EU AI Act roles provide structured research assistance and require qualified human oversight.
