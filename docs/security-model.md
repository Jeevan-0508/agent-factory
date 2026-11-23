# Security model

The default posture is deny-by-default and local-first.

- The API requires a local session for catalog, execution, workflow, provider, and audit routes.
- Origin checks accept loopback requests and reject cross-origin requests.
- Registry-only roles cannot execute without an explicit scenario/promotion grant; catalog status is not authorization.
- Only six deterministic local tools are registered. There is no shell, arbitrary code, network, credential, or connector tool.
- Input is bounded JSON; static responses use text nodes and safe attributes rather than HTML sinks.
- Approval is tied to an immutable plan hash. Tampering produces a stale-approval conflict.
- Workspace kill switch state is persisted and blocks new execution.
- Rate limiting and loopback binding reduce accidental exposure; this is not a production identity system.

## Threat model

The main threats are unauthorized execution, registry-only privilege escalation, unsafe tool requests, cross-origin invocation, plan tampering, runaway loops, restart duplication, and fabricated evidence. Mitigations are session checks, capability/tool allowlists, explicit grants, plan hashes, bounded step/retry/time limits, idempotency for workflow creation, recovery markers, audit events, deterministic evidence labels, and security regression tests. Production deployment would still require a real identity provider, secret manager, TLS, hardened headers, database backup/recovery, and an independent security review.
