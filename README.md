# Agent Factory

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

- `dashboard/index.html` — static searchable dashboard.
- `catalog/roles.json` — machine-readable catalog and mythic aliases.
- `agents/` — portable TOML definitions for all 100 roles.
- `runtime/approved/` — the 30 currently approved runtime profiles.
- `docs/role-catalog.md` — detailed role reference.
- `docs/prompt-library.md` — complete reusable prompt library.
- `docs/governance.md` — promotion, safety, legal, and privacy boundaries.
- `scripts/validate-catalog.mjs` — deterministic catalog validation.

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

