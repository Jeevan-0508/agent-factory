# Architecture and boundaries

Agent Factory is split into four bounded layers:

1. **Role source** — `scripts/generate.mjs` defines the stable role registry, mythic aliases, prompts, profile metadata, and workflow templates.
2. **Portable artifacts** — `agents/*.toml`, `runtime/approved/*.toml`, `catalog/roles.json`, and generated Markdown provide reviewable, versioned outputs.
3. **Static command center** — `dashboard/` reads only the catalog over local HTTP. DOM construction uses text nodes and explicit attributes; untrusted catalog content is not interpolated as HTML.
4. **Verification** — `scripts/validate-catalog.mjs`, `scripts/test-catalog.mjs`, and the Ubuntu/Windows GitHub Actions matrix check structural integrity and cross-platform path handling.

The repository intentionally does not contain a provider router, hosted memory, credentials, external MCP server, live executor, or fabricated telemetry. The approved runtime list documents compatibility with the current host; it does not create additional Codex runtime capacity.

## Promotion path

Registry-only roles become runtime candidates only after prompt review, boundary review, security/privacy review where relevant, scenario tests, and explicit host-side promotion. A role profile cannot authorize itself or approve a consequential decision. HR, legal, privacy, security, governance, and risk workflows retain accountable human owners.
