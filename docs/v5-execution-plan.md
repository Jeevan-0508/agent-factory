# V5 execution plan

Status: V5 implementation and Final GOD LOOP repair in progress
Date: 2026-11-24

## Baseline evidence

At M0, the existing `main` branch passed:

- `npm test`: 12 catalog/application checks.
- `npm run validate`: 100 roles, 30 typed runtime roles, 70 registry-only roles, no catalog errors.
- `npm run test:security`: 10 static/security checks.
- `npm run test:runtime`: 14 runtime tests, including grants, approvals, plan hashes, cancellation, timeouts, recovery, graph validation, demo approval, and kill switch behavior.
- `npm run test:e2e`: 12 browser, performance, accessibility, and visual tests.

The public dashboard is static-only and the local API is loopback-first. Paperclip was not installed or executed during M0; the integration assessment is based on the pinned upstream repository and official documentation.

The current branch adds the portable installer, task-routing preview, versioned knowledge control plane, hardened read-only provider boundary, and adversarial GOD LOOP tests. See [the completion matrix](completion-matrix.md) for verified and incomplete capabilities.

## Milestones and gates

| Milestone | Scope | Exit evidence | External/paid boundary |
| --- | --- | --- | --- |
| M0 | Assessment, architecture, threat model, plan | Four V5 docs, baseline test evidence, pinned upstream SHA | No external execution |
| M1 | Optional Paperclip bridge | Mock adapter, health/version gate, contract fixtures, failure-closed behavior | No provider calls; no Paperclip install in ordinary CI |
| M2 | OLYMPUS organization builder | Persisted org/departments/objectives/assignments, graph validation, import/export tests | Local deterministic state only |
| M3 | Codex execution proof | Three-role reviewed team, explicit credentials, approval, bounded task, evidence and rollback | Requires separate operator authorization and credentials |
| M4 | Engineering Council | Actual catalog role IDs, workflow stages, disjoint work scopes, review records | No uncontrolled spawning |
| M5 | Dogfood experiment | Reversible AGENT//FACTORY improvement, baseline comparison, actual evidence | No fabricated improvement claim |
| M6 | GOD LOOP engine | Durable bounded loop, resume, stop conditions, no recursive spawn, audit trail | Spend/time/concurrency limits mandatory |
| M7 | Governance/adversarial QA | Threat regression matrix, isolation, credential, injection, cancellation, budget, recovery tests | Real provider tests opt-in only |
| M8 | UI/documentation/release | Eight universes preserved, provenance labels, screenshots, docs, CI, draft PR | No merge/deploy without explicit release approval |

## Operating limits for all connected work

- Maximum concurrent delegated agents: explicit per run, default 3 for the first reviewed team.
- Maximum loop iterations: explicit per run, default 5.
- Maximum wall-clock duration: explicit per run, default 30 minutes.
- Maximum provider spend: explicit per run, default 0 until the operator sets a non-zero limit.
- Maximum task retries: explicit per task, default 2.
- Maximum workflow depth/recursive delegation: 0 unless a reviewed policy explicitly allows a bounded depth.
- Human approval: required before connected execution, publication, destructive actions, credentials, spending, or policy/security changes.
- Cancellation: available at the organization, project, task, workflow, and global kill-switch levels.

## Delivery workflow

Every substantial change follows:

`DISCOVER → PLAN → CHALLENGE → APPROVE → IMPLEMENT → TEST → REVIEW → REPAIR → VERIFY → RELEASE`

Parallel work must use disjoint write scopes or separate worktrees. The primary coordinator integrates changes, resolves conflicts, runs the complete repository gate, and records evidence. A catalog role being documented does not mean it is available as a live Codex delegation role.

## Stop conditions

Stop and report a blocker when an acceptance criterion is unmet after the configured repair budget, an external dependency is unavailable, authorization is missing, a security invariant fails, the budget/time/iteration limit is reached, or a human cancels the run. Never keep an unfinished autonomous loop active in the background.

## First implementation slice

M1 should begin with a mock-only adapter and no browser changes:

1. Define normalized provider types and a server-side adapter registry.
2. Add a mock Paperclip adapter with deterministic fixtures for health, version, discovery, task create/status/cancel, budget, and error paths.
3. Add configuration validation that keeps the adapter disabled unless explicitly enabled on the local server.
4. Add contract and security tests for auth headers, redaction, timeouts, idempotency, cancellation, workspace binding, and unsupported versions.
5. Review the adapter against the M0 threat model before connecting an actual Paperclip instance.
