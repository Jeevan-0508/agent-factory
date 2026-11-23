# Workflow lifecycle

Workflow definitions contain 1–20 steps, explicit agent IDs, input/output contracts, dependencies, retry limits of 0–2, and a maximum concurrency of 1–2. Unknown agents, malformed contracts, unknown dependencies, self-dependencies, cycles, forward dependencies, unsafe tools, unauthorized registry-only steps, and out-of-range limits are rejected.

Runs move through:

`DRAFT → VALIDATED → AWAITING_APPROVAL → APPROVED → RUNNING → COMPLETED`

They can end as `REJECTED`, `FAILED`, `CANCELLED`, or `TIMED_OUT`; an interrupted `RUNNING` run is marked `RECOVERABLE` on restart. Ready steps are scheduled in bounded batches up to `max_concurrency`. Dependencies must be complete before a step starts. Retries use bounded linear backoff, failures propagate, cancellation is persisted and aborts active steps, and the kill switch prevents new work.

Completed steps persist output, evidence, attempts, timestamps, and a structured handoff for each dependent step. Recovery resumes from those durable completed-step checkpoints and does not replay them. A step interrupted before its completion checkpoint may be retried; safe local tools are designed for that retry, while the runtime does not claim exactly-once behavior for non-idempotent external operations.

Human approval is required for ordinary workflow runs. Predefined offline scenarios use a separate, server-controlled `demo` approval mode and are labelled as demonstrations rather than independent human authorization.
