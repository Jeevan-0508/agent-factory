# Bounded GOD LOOP

The GOD LOOP is a persistent development-control surface, not an autonomous background agent. It records an objective, repository scope, acceptance criteria, allowed tools, authorized catalog roles, and hard resource bounds.

## Bounds

- 1–20 iterations
- 1–5 concurrent agents
- 1 second–1 hour maximum time
- spending limit defaults to zero
- no recursive self-spawning
- approval is required by default
- terminal states are `COMPLETED`, `BLOCKED`, `CANCELLED`, and `FAILED`

## Lifecycle

```text
AWAITING_APPROVAL → APPROVED → RUNNING → terminal
```

Durable events record inspection, planning, challenge, implementation, test evidence, review, repair, verification, release, iteration completion, and stop reasons. Events are operator-recorded evidence; the engine does not convert a submitted string into a claim that an external agent or test actually ran.

The loop can stop for satisfied acceptance criteria, exhausted bounds, repeated failure, security violation, human cancellation, missing authorization, or unavailable dependencies. A terminal run cannot be approved, advanced, or overwritten.

## Current release boundary

This slice provides the governed persistence and API control plane. It does not invoke Codex, Paperclip, Claude, Gemini, a local model, or any paid provider. A future executor must pass the same approval, authorization, timeout, budget, cancellation, and evidence checks immediately before invocation.
