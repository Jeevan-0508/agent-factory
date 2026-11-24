# Architecture and boundaries

Agent Factory is split into five bounded layers:

1. **Role source** — `scripts/generate.mjs` defines the stable role registry, mythic aliases, prompts, profile metadata, and workflow templates.
2. **Portable artifacts** — `agents/*.toml`, `runtime/approved/*.toml`, `catalog/roles.json`, and generated Markdown provide reviewable, versioned outputs.
3. **Shared application experiences** — `dashboard/` renders eight distinct presentation systems over one state model and one registry. The execution console calls the local API but does not duplicate role data.
4. **Local execution plane** — `server/` exposes a loopback-only-by-default HTTP API, SQLite migrations, deny-by-default authorization, approval lifecycle, deterministic runtime, safe local tools, bounded workflow engine, structured handoffs, provider metadata, audit events, recovery markers, the workspace-scoped OLYMPUS organization builder, the Engineering Council, and the durable bounded GOD LOOP control plane.
5. **Verification** — catalog validation, runtime unit/integration/security tests, Playwright static and runtime tests, accessibility checks, visual snapshots, and the Ubuntu/Windows Actions matrix check structural integrity and cross-platform behavior.

The repository intentionally does not contain hosted memory, credentials, external MCP servers, arbitrary shell/network tools, or fabricated telemetry. The provider registry is an interface boundary; the Paperclip adapter is optional, server-side, and read-only for discovery in the current release. The deterministic runtime is a real local executor over supplied input, and labels its method and limitations in every result. OLYMPUS membership and GOD LOOP authorization do not promote registry-only roles or bypass runtime approval. The approved runtime list documents catalog compatibility; it does not create additional Codex runtime capacity.

## Promotion path

Registry-only roles become runtime candidates only after prompt review, boundary review, security/privacy review where relevant, scenario tests, and explicit host-side promotion. A role profile cannot authorize itself or approve a consequential decision. HR, legal, privacy, security, governance, and risk workflows retain accountable human owners.
