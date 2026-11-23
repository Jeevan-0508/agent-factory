# Command center guide

The dashboard is a local-first static interface for the 100-role registry. It is intentionally a documentation and design surface, not an agent executor.

## Multiverse experiences

The global selector changes presentation without changing the underlying catalog or route state:

- **Command Center** — cinematic operations overview with evidence and governance panels.
- **Minimal Studio** — editorial, search-first index for deliberate role selection.
- **Cyberpunk Neon** — operator console with explicit static-snapshot status labels.
- **Glass Universe** — layered observatory where families become visual worlds.
- **Agent Galaxy** — deterministic SVG constellation with catalog-backed relationships.
- **Mythology Atlas** — encyclopedia grouped by mythology with professional role titles first.
- **Retro Terminal** — keyboard-first search shell mapped to real local actions.
- **Neo-Brutalist Lab** — bold comparison board for role contracts and boundaries.

These are separate compositions and interaction grammars, not palette swaps. The shared navigation remains available in every mode so profiles, prompts, workflows, evaluation evidence, and governance documentation stay reachable.

## Views

- **Overview** shows catalog counts, role families, workflow templates, and the verification ledger.
- **Agent explorer** filters by role name, mythic alias, family, mission, capability, runtime state, and sort order.
- **Agent profile** exposes the complete contract: inputs, outputs, example tasks, prompt, evaluation criteria, tools, knowledge domains, standards, approvals, failure handling, boundaries, limitations, maintenance, and runtime compatibility.
- **Prompt Studio** previews bounded prompt configurations and supports copy or `.txt` export. Previewing does not execute a role.
- **Workflow designer** starts from five governed templates, allows role/gate/output edits, and supports JSON copy/export. It does not run workflows.
- **Evaluation lab** separates structural checks from scenario, live-runtime, and performance evidence.
- **Governance** makes human approval, least authority, legal caveats, and non-telemetry claims visible.

## Truth model

`runtime: true` means the role is represented in the current approved typed-runtime surface. `runtime: false` means registry-only: it is documented but not exposed as a typed delegation role. Neither state is a heartbeat, permission grant, provider connection, or performance result.

The interface creates no fabricated run counts, success rates, latency, uptime, or model-quality scores. Where empirical evidence is absent, the UI says so.

### Agent Galaxy relationship model

The Galaxy derives edges only from exact catalog facts: shared capability strings or co-occurrence in an explicit workflow template. It does not infer similarity, dependency, substitution, competence, or performance. The graph has a full accessible agent directory fallback for keyboard and assistive-technology users.

## Safe extension points

Add or revise role contracts in `scripts/generate.mjs`, regenerate the catalog, and run the validator plus regression suite. Keep stable machine IDs unchanged. Add workflow steps only by referencing existing catalog role IDs. Any future executor must introduce explicit authorization, sandboxing, audit logging, rate limits, and human approval outside this static dashboard.
