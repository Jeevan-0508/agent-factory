# Agent Factory

[GitHub repository](https://github.com/Jeevan-0508/agent-factory) · [V4 dashboard source](https://github.com/Jeevan-0508/agent-factory/tree/codex/god-loop-v4/dashboard) · [Draft God Loop V4 pull request](https://github.com/Jeevan-0508/agent-factory/pull/2)

Agent Factory is a versioned, evidence-constrained catalog of 100 specialist Codex roles. Every role has:

- a stable machine ID;
- a mythological codename, such as `zeus-risk-manager`, `shiva-erm-manager`, `vishnu-solution-architect`, and `horus-hr-manager`;
- a job family, mission, capabilities, expected deliverables, and boundaries;
- a reusable developer prompt;
- an explicit runtime status.

## Runtime status

The catalog contains 100 roles. The current Codex host exposes 30 typed delegation roles and allows up to 8 concurrent agent threads per session. The existing 30 roles remain runtime-capable; the 70 new roles are registry-only until they are explicitly reviewed, smoke-tested, and promoted by the host runtime.

The repository is a source of truth for role design and documentation. It does not grant permissions, create security boundaries, or imply that an agent is currently running.

## Contents

- `dashboard/index.html` — responsive multiverse shell with a global experience switcher.
- `dashboard/app.js` / `dashboard/styles.css` / `dashboard/experiences.js` — eight distinct local-first experiences over the shared explorer, profiles, Prompt Studio, workflow designer, evaluation lab, and governance views.
- `catalog/roles.json` — machine-readable catalog and mythic aliases.
- `agents/` — portable TOML definitions for all 100 roles.
- `runtime/approved/` — the 30 currently approved runtime profiles.
- `docs/role-catalog.md` — detailed role reference.
- `docs/prompt-library.md` — complete reusable prompt library.
- `docs/governance.md` — promotion, safety, legal, and privacy boundaries.
- `docs/release-readiness-v3.md` — God Loop V3 QA evidence, visual matrix, findings, and release gates.
- `docs/runtime-api.md` — local API routes, lifecycle examples, and client contract.
- `docs/workflow-lifecycle.md` — bounded orchestration, approvals, retries, recovery, and handoffs.
- `docs/security-model.md` — authorization, threat model, kill switch, and safe-tool boundary.
- `docs/v3-v4-divergence.md` — audited V3/V4 divergence and the no-deploy integration decision.
- `docs/provider-adapters.md` — provider-neutral adapter contract and offline-first policy.
- `docs/database-schema.md` — durable SQLite tables and persistence responsibilities.
- `docs/evaluation-methodology.md` — structural, deterministic, connected, and human evaluation layers.
- `docs/visual-comparison-v4.md` — retained desktop/mobile visual evidence and design comparison.
- `scripts/validate-catalog.mjs` — deterministic catalog validation.
- `scripts/test-catalog.mjs` — regression checks for catalog, profile, workflow, dashboard, and cross-platform behavior.

The multiverse experiences are Command Center, Minimal Studio, Cyberpunk Neon, Glass Universe, Agent Galaxy, Mythology Atlas, Retro Terminal, and Neo-Brutalist Lab. They share the same catalog and application state; the selected experience is persisted locally and switching does not reset the active search, role, prompt, or workflow draft.

## Local runtime (V4)

The V4 runtime is an opt-in loopback service backed by SQLite and Node's built-in `node:sqlite` module. It provides deterministic local execution for typed roles, explicit authorization plans, approval-gated tasks, bounded workflows, structured handoffs, evidence, audit events, provider metadata, and a kill switch. No network or paid provider call is made by default.

```text
npm install
npm run start:local
```

Open `http://127.0.0.1:8787/dashboard/` and choose **Execution console**. The default data directory is `.data/`; set `AGENT_FACTORY_DATA_DIR` to use another local directory. The connected-model adapter remains disabled until credentials, scope, and authorization are explicitly implemented by the operator.

## Local preview

The command center is a static artifact: it reads `catalog/roles.json` and does not execute agents, call providers, or report live telemetry. Serve the repository root with any local static server, then open `/dashboard/`.

The generator refreshes catalog and documentation artifacts without replacing the polished command center. The dashboard is maintained as a separate checked-in artifact so catalog regeneration cannot overwrite its security-conscious DOM implementation.

## Verification

```text
npm test
npm run validate
node --check dashboard/app.js
npm run test:security
npm run test:runtime
npm run test:e2e
npm run test:e2e:runtime
```

Continuous integration runs catalog, build, security, and browser checks on Ubuntu and Windows; Windows also runs the committed visual matrix.

## Naming convention

Stable role IDs use `snake_case` for compatibility. Human-facing aliases use `<mythic-codename>-<role-slug>`. Mythic names are labels for navigation and do not imply religious authority, cultural ownership, or agent capability beyond the documented role contract.

## Legal and regulatory roles

The EU AI Act Specialist, Legal Counsel, Data Protection Officer, Labor Relations Counsel, and related roles are structured research and issue-spotting assistants. They are not substitutes for qualified counsel, a regulator, an auditor, or an accountable decision-maker. Re-verify current law before relying on any output.

Primary references:

- [EU AI Act official text](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng)
- [European Commission: Navigating the AI Act](https://digital-strategy.ec.europa.eu/en/faqs/navigating-ai-act)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)

## Validate

```text
node scripts/validate-catalog.mjs
```

