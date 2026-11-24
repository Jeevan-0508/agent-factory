# Provider adapters

Provider selection is separated from role contracts and workflow orchestration. The current registry exposes:

- `deterministic-local`: configured, no network, rule-based local contract execution;
- `paperclip`: optional server-side Paperclip bridge, disabled unless `PAPERCLIP_ENABLED=true`, `PAPERCLIP_API_URL`, and `PAPERCLIP_API_TOKEN` are supplied to the local server;
- `mock-paperclip`: deterministic test-only contract fixture, never a production provider.

The runtime never displays or stores raw credentials. No provider call is made in offline mode. M1 only enables authenticated, read-only Paperclip health and discovery routes; remote task creation, cancellation, and execution remain disabled until OLYMPUS authorization and approval binding are implemented.

Paperclip configuration is server-side only:

```text
PAPERCLIP_ENABLED=true
PAPERCLIP_API_URL=https://paperclip.example.internal
PAPERCLIP_API_TOKEN=<operator-managed secret>
PAPERCLIP_EXPECTED_VERSION=v2026.609.0
```

The adapter uses Paperclip's documented `/api/health`, `/api/companies?scope=accessible`, `/api/companies/{companyId}/agents`, `/api/agents/{agentId}`, `/api/companies/{companyId}/dashboard`, `/api/companies/{companyId}/costs/summary`, `/api/companies/{companyId}/issues`, `/api/issues/{issueId}`, and `/api/heartbeat-runs/{runId}/cancel` routes. It pins the inspected upstream commit in metadata, redacts remote response errors, rejects non-HTTPS non-loopback URLs, applies timeouts, and records local audit events for discovery calls.
