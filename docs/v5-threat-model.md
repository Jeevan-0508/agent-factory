# V5 threat model

Status: M0 baseline
Date: 2026-11-24
Scope: OLYMPUS, optional Paperclip bridge, connected agent execution, self-improvement workflows

## Assets

- Role contracts, prompts, capability boundaries, and runtime promotion state.
- Organization membership, reporting lines, objectives, tasks, projects, and workspace data.
- Approval records, plan hashes, budgets, kill-switch state, and audit evidence.
- Provider credentials, remote organization/agent IDs, callback secrets, and connection metadata.
- Repository contents, worktree changes, generated artifacts, test evidence, and release credentials.
- The ability to create work, invoke tools, spend money, publish changes, or alter security policy.

## Trust zones

1. Public static browser: untrusted, no credentials, no execution authority.
2. Local operator/API: authenticated single-operator boundary in V4.1; not a production identity system.
3. Native runtime/SQLite: local governed execution and durable evidence.
4. Paperclip control plane: external system with its own authentication, organizations, policies, adapters, and database.
5. Upstream agents/tools/providers: untrusted execution and output boundary.
6. GitHub/repository/release systems: high-impact external state requiring explicit approval.

## Priority threats and controls

| ID | Threat | Severity | Required control | Regression evidence |
| --- | --- | --- | --- | --- |
| T01 | A browser or remote agent submits grants, role status, or approval fields to obtain execution. | Critical | Server-controlled authorization, local role promotion, plan-hash binding, approval state machine. | Malicious grants, forged approval, forged plan hash |
| T02 | Remote organization or task IDs cross workspace/company boundaries. | Critical | Map every request through local workspace/org policy; bind opaque remote IDs to local owner and correlation. | Cross-organization access matrix |
| T03 | Paperclip credential leaks into browser assets, logs, exports, screenshots, or prompts. | Critical | Server-only secret storage, redaction, static bundle scan, log assertions, export scrubber. | Credential canary and artifact scan |
| T04 | Prompt injection in an agent output causes unauthorized tools, policy changes, or publication. | Critical | Treat outputs as data; schema validation, tool allowlists, approval re-check, no authority from output text. | Malicious output fixtures |
| T05 | Remote callbacks duplicate, replay, or reorder task results. | High | Signed/identified callbacks, idempotency, monotonic state transitions, plan-hash/correlation matching. | Duplicate/replayed callback tests |
| T06 | Budget telemetry is stale or absent while remote work continues spending. | High | Local hard ceiling and timeout; fail closed on missing cost evidence; no automatic paid provider enablement. | Budget exhaustion/stale telemetry tests |
| T07 | Cancellation or kill switch races with remote execution and later success writes. | Critical | Abort propagation, authoritative terminal writes, remote cancel, reconciliation state, no success after cancellation. | Concurrent cancellation/late callback tests |
| T08 | Recovery retries a non-idempotent remote action. | High | Durable checkpoints, idempotency keys, explicit at-least-once limitation, operator reconciliation. | Restart-after-partial-completion tests |
| T09 | A self-improvement loop recursively spawns workers or runs forever. | Critical | Explicit max iterations, time, concurrency, spend, depth, approval, and cancellation; no self-modifying policy. | Infinite-loop and recursive-spawn rejection tests |
| T10 | Organization builder accepts cycles or unauthorized promotion. | High | Graph validation, role-status checks, capability requirements, workspace ownership. | Reporting-cycle and promotion tests |
| T11 | External provider/version drift changes semantics silently. | High | Pinned compatibility range, health/version gate, contract fixtures, disabled state on mismatch. | Unsupported-version tests |
| T12 | Public documentation implies mocked or static activity is real. | High | Execution provenance labels: native, connected, mock, demonstration, disconnected; no fabricated telemetry. | UI provenance assertions |

## Required security invariants

- No external execution without a current local authorization record and matching human approval where required.
- No client-controlled grant, role promotion, budget increase, or policy change.
- No cross-organization read or write, including through remote correlation IDs.
- No secret in browser-visible responses, static assets, logs, evidence exports, or screenshots.
- No connected provider call when disabled, unconfigured, incompatible, over budget, cancelled, timed out, or kill-switched.
- No unbounded loop, recursive spawn, background worker, retry, or provider spend.
- No terminal success state after cancellation, timeout, revocation, or invalid evidence.

## Residual limitations

V4.1's default local session is intentionally a single-operator trust boundary, not production identity. Paperclip's current API and adapter behavior must be contract-tested at the pinned commit. Non-idempotent external operations cannot be made exactly once by the local bridge alone; the system must report that limitation and require reconciliation.
