# Security model

The default posture is deny-by-default and local-first.

- The API requires a local session for catalog, execution, workflow, provider, and audit routes.
- Origin checks accept loopback requests and reject cross-origin requests.
- Registry-only roles cannot execute without a server-controlled grant; catalog status and client-supplied `explicit_grants` are never authorization decisions.
- Only six deterministic local tools are registered. There is no shell, arbitrary code, network, credential, or connector tool.
- Input is bounded JSON; static responses use text nodes and safe attributes rather than HTML sinks.
- Approval is tied to an immutable plan hash and a one-way state transition from `AWAITING_APPROVAL`; duplicate, late, cancelled, or rejected decisions are rejected.
- Immediately before execution, the persisted authorization, current plan, trusted grant set, approval mode, workspace, agent/workflow binding, and plan hash are revalidated. Revocation fails closed.
- Cancellation and timeout use cooperative `AbortSignal` propagation. Terminal-state writes are conditional, so cancelled or timed-out work cannot publish successful output or start another tool.
- Workspace kill switch state is persisted and blocks new execution.
- Rate limiting and loopback binding reduce accidental exposure; this is not a production identity system.

## Offline demonstrations and local sessions

The predefined scenario endpoint is an explicitly labelled offline demonstration. Its approval is automatic and server-controlled; it is not independent human authorization. Only the scenario registry can supply its grant context and tool policy.

Local sessions are an eight-hour, HttpOnly, SameSite loopback cookie for a single trusted operator. The service binds to loopback, rejects non-loopback hosts and disallowed origins, and does not provide production identity verification. Do not expose it through a proxy or treat a session cookie as an account credential.

## Threat model

The main threats are unauthorized execution, registry-only privilege escalation, unsafe tool requests, cross-origin invocation, plan tampering, runaway loops, restart duplication, and fabricated evidence. Mitigations are session checks, server-controlled grant resolvers, capability/tool allowlists, plan hashes, approval-state guards, bounded step/retry/time limits, abort-aware cancellation, idempotency for workflow creation, durable checkpoints, audit events, deterministic evidence labels, and adversarial security regression tests. Recovery guarantees that completed durable checkpoints are not replayed; an interrupted non-idempotent external operation cannot be made exactly-once by this local runtime and must be reconciled by an operator.

Production deployment would still require a real identity provider, secret manager, TLS, hardened headers, database backup/recovery, and an independent security review.
