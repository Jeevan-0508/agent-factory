# V5 architecture decision

Status: accepted for M0 planning
Date: 2026-11-24

## Decision

AGENT//FACTORY remains the governance and evidence authority. OLYMPUS becomes a native domain module for organization definitions, departments, reporting lines, objectives, assignments, budgets, and bounded development loops. Paperclip is an optional external orchestration provider behind a server-side adapter interface.

The public GitHub Pages application remains static-only. No Paperclip URL, token, callback, activity feed, organization data, or provider credential may be embedded in `site/` or browser JavaScript.

## Target boundary

```text
Dashboard / local operator
          |
          v
AGENT//FACTORY API
  |-- OLYMPUS domain + local SQLite state
  |-- authorization, approvals, plan hashes, budgets, kill switch
  |-- provider registry and audit/evidence correlation
  |-- Native deterministic runtime
  `-- Paperclip adapter (optional, disabled by default)
            |
            v
       Paperclip REST API
            |
            `-- upstream agent adapters / runtimes
```

## Authority rules

1. A local session, organization/workspace policy, role status, approval record, plan hash, budget, kill switch, and provider allowlist are checked before any remote request.
2. Paperclip may coordinate a remote task, but it cannot grant a registry-only role local execution capability or bypass a local approval.
3. Remote identifiers are stored as opaque correlation fields, never used as local authorization decisions.
4. Remote responses are untrusted. Only validated, bounded, redacted results become local evidence.
5. Missing, stale, revoked, malformed, or contradictory remote state fails closed.
6. The native deterministic runtime remains available when Paperclip is absent, disabled, incompatible, unavailable, or rejected by policy.
7. Credentials are server-side configuration only, loaded from operator-managed environment/secret storage. They are never returned by API routes, logged, exported, or included in static assets.

## Provider interface

The first interface should be capability-oriented rather than Paperclip-shaped:

```text
health() -> provider health + version compatibility
discoverOrganizations(scope) -> external organization summaries
discoverAgents(organizationId) -> external agent summaries
createTask(request, idempotencyKey) -> remote task reference
getTask(taskReference) -> normalized status/result summary
cancelTask(taskReference) -> normalized cancellation result
getBudget(scope) -> advisory spend/budget state
```

The adapter must declare supported operations, authentication mode, provider version, timeout, retry policy, and data residency/egress policy. Unsupported operations return a typed disabled result; they do not silently fall back to an unsafe path.

## Rejected alternatives

- **Replace the local runtime with Paperclip:** rejected because it would transfer the existing V4.1 authorization and recovery boundary to an unverified external control plane.
- **Vendor Paperclip into this repository:** rejected because it creates a large, fast-moving duplicate application and license/maintenance surface.
- **Expose Paperclip directly from GitHub Pages:** rejected because it would leak connection details and cannot enforce server-side governance.
- **Make all 100 catalog roles remotely executable:** rejected because catalog membership is not runtime promotion or authorization.
- **Start with autonomous recursive agents:** rejected because V5 requires explicit iteration, time, concurrency, budget, approval, and cancellation bounds.

## Acceptance gates for M1

- Adapter is absent from the default execution path and tests pass without Paperclip.
- Health/version compatibility is verified against a mock contract and a pinned upstream contract fixture.
- No credential or remote URL appears in browser assets or logs.
- All remote task requests have local approval, plan-hash, idempotency, timeout, and cancellation checks.
- Remote failure cannot corrupt local terminal state or fabricate success evidence.
- Windows and Linux CI run the mock integration without installing Paperclip.
