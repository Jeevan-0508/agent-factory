# Command center guide

The dashboard is a local-first static interface for the 100-role registry. It is intentionally a documentation and design surface, not an agent executor.

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

## Safe extension points

Add or revise role contracts in `scripts/generate.mjs`, regenerate the catalog, and run the validator plus regression suite. Keep stable machine IDs unchanged. Add workflow steps only by referencing existing catalog role IDs. Any future executor must introduce explicit authorization, sandboxing, audit logging, rate limits, and human approval outside this static dashboard.
