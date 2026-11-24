# V5 Paperclip integration assessment

Status: M0 discovery complete
Date: 2026-11-24
Repository: `paperclipai/paperclip`
Inspected upstream commit: `28aa32e7d7ba72d8f83c03ffd45625c096813e6b` (`master`)

## Executive finding

Paperclip provides genuine value as an optional external orchestration control plane. It supplies organization and reporting structures, goals, tasks, approvals, agent adapters, routines, budgets, connections, activity history, artifacts, and a unified REST API. Those capabilities overlap with the OLYMPUS direction and would be expensive to reproduce safely in one milestone.

It must not replace AGENT//FACTORY's deterministic runtime or governance boundary. AGENT//FACTORY already owns the 100-role registry, role promotion status, plan hashes, approval transitions, safe-tool boundary, cancellation, durable workflow checkpoints, audit evidence, and the static public dashboard. Paperclip should be connected through a server-side, optional adapter with explicit policy translation and fail-closed behavior.

## Verified upstream facts

| Area | Verified finding | Evidence |
| --- | --- | --- |
| License | Paperclip source is MIT licensed. | [upstream LICENSE](https://github.com/paperclipai/paperclip/blob/master/LICENSE) |
| Runtime | Current README requires Node.js 24.11 or newer. | [upstream README](https://github.com/paperclipai/paperclip/blob/master/README.md#quickstart) |
| Package model | The repository uses pnpm `9.15.4` and is a TypeScript monorepo with a Node server and React UI. | Upstream `package.json` at the inspected commit |
| Persistence | The documented local deployment uses an embedded Postgres and local file storage; production can use Postgres. | [upstream README](https://github.com/paperclipai/paperclip/blob/master/README.md#faq) |
| API | Paperclip documents one unified JSON REST API for board and agent clients, with permissions determined by authentication and company scoping. | [API overview](https://docs.paperclip.ing/reference/api/overview/) and [API authentication](https://docs.paperclip.ing/reference/api/authentication/) |
| Control-plane objects | The documented API covers companies, agents, issues, approvals, costs, routines, secrets, activity, and dashboard state. | [API overview](https://docs.paperclip.ing/reference/api/overview/) |
| Agent connectivity | The upstream README lists Codex, Claude Code, Gemini CLI, Cursor, OpenCode, OpenClaw, Pi, Hermes, and other adapters, plus custom processes/HTTP endpoints and external adapter packages. | [upstream README](https://github.com/paperclipai/paperclip/blob/master/README.md) |
| Authentication | Paperclip supports bearer authentication and applies company scoping; agent API keys are scoped differently from board access. | [API authentication](https://docs.paperclip.ing/reference/api/authentication/) |
| Installation | The documented quickstart is `npx paperclipai@latest onboard --yes`; this is not a dependency or credential grant for AGENT//FACTORY. | [installation guide](https://github.com/paperclipai/paperclip-docs/blob/main/docs/guides/getting-started/installation.md) |

The package metadata at the inspected commit does not expose a stable semantic application version, so V5 must pin an explicit upstream commit or operator-selected release rather than using `latest` in production configuration.

## Capability comparison

| Capability | AGENT//FACTORY V4.1 | Paperclip | V5 decision |
| --- | --- | --- | --- |
| 100 specialist identities and mythic aliases | Strong, versioned source of truth | Generic agent records | Keep native; optionally map to Paperclip agents |
| Deterministic offline execution | Implemented and tested | External-agent orchestration | Keep native as the offline fallback |
| Approval and plan-hash binding | Implemented and security-tested | Has approvals and governance, contract must be verified | Native authorization remains authoritative |
| Org chart, goals, departments, routines | Not yet implemented as a first-class model | Core Paperclip capability | Good candidate for optional bridge/OLYMPUS |
| Provider and harness adapters | Metadata-only, disabled | Broad adapter ecosystem | Connect only through server-side policy adapter |
| Budgets and cost reporting | Per-plan local budget bound, no provider spend | Company/agent/project budget features | Import as advisory data; enforce local ceilings first |
| Audit and artifacts | Durable local audit/evidence | Activity, artifacts, task history | Correlate IDs; do not treat remote history as local proof until validated |
| Public dashboard | Static GitHub Pages, no backend | Server UI | Keep Pages static-only; expose disconnected/real state honestly |
| Windows/local-first operation | Node + SQLite, loopback | Node 24.11+, pnpm, Postgres/file storage | Make Paperclip optional and test absence on Windows |

## Risks and open verification items

1. The upstream API and adapter contracts are active and must be pinned, contract-tested, and version-checked before use.
2. Remote authentication, company scoping, secrets, and provider connections create a larger trust boundary than the current loopback runtime.
3. Paperclip's server and database requirements add operational complexity and are not suitable for GitHub Pages.
4. Paperclip's budget telemetry is not automatically equivalent to enforceable AGENT//FACTORY authorization. The local ceiling must fail closed if remote cost data is missing or stale.
5. A remote agent output is untrusted input. It must pass schema, capability, approval, output, and evidence validation before any local action.
6. The current environment has not been authorized to install or run Paperclip, connect a provider, or spend money. M0 therefore uses documentation and repository inspection only.

## Recommendation

Proceed with a thin, opt-in Paperclip bridge in M1. Do not vendor the upstream repository, replace the local runtime, or add Paperclip to the default dependency graph. The first adapter should support health/version discovery and read-only company/agent discovery before task creation or execution is enabled.
