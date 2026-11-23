# Agent Factory

[GitHub repository](https://github.com/Jeevan-0508/agent-factory) · [Dashboard source](https://github.com/Jeevan-0508/agent-factory/tree/codex/god-mode-v2/dashboard) · [Draft Multiverse V2 pull request](https://github.com/Jeevan-0508/agent-factory/pull/1)

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
- `scripts/validate-catalog.mjs` — deterministic catalog validation.
- `scripts/test-catalog.mjs` — regression checks for catalog, profile, workflow, dashboard, and cross-platform behavior.

The multiverse experiences are Command Center, Minimal Studio, Cyberpunk Neon, Glass Universe, Agent Galaxy, Mythology Atlas, Retro Terminal, and Neo-Brutalist Lab. They share the same catalog and application state; the selected experience is persisted locally and switching does not reset the active search, role, prompt, or workflow draft.

## Local preview

The command center is a static artifact: it reads `catalog/roles.json` and does not execute agents, call providers, or report live telemetry. Serve the repository root with any local static server, then open `/dashboard/`.

The generator refreshes catalog and documentation artifacts without replacing the polished command center. The dashboard is maintained as a separate checked-in artifact so catalog regeneration cannot overwrite its security-conscious DOM implementation.

## Verification

```text
npm test
npm run validate
node --check dashboard/app.js
```

Continuous integration runs the same checks on Ubuntu and Windows.

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

