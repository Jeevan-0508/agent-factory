# Runtime API

The runtime API is local-first and session-authenticated. Start it with `npm run start:local`; it listens on `127.0.0.1:8787` by default. `GET /api/v1/health` is the only unauthenticated health route. `GET /api/v1/session` establishes an eight-hour HttpOnly, SameSite loopback session cookie for the single local operator. This is not production identity verification.

## Core routes

| Route | Purpose |
| --- | --- |
| `GET /api/v1/agents` | Shared 100-role registry with runtime status. |
| `GET /api/v1/tools` | Safe local tool registry. |
| `GET /api/v1/scenarios` | Five deterministic offline scenarios. |
| `GET /api/v1/providers` | Provider metadata without secrets. |
| `GET/POST /api/v1/runtime/kill-switch` | Read or change the workspace execution stop. |
| `POST /api/v1/tasks` | Create a task authorization and `DRAFT` task. |
| `POST /api/v1/tasks/:id/validate` | Move task to `VALIDATED`. |
| `POST /api/v1/tasks/:id/request-approval` | Record approval request. |
| `POST /api/v1/tasks/:id/approve` | Approve or reject the immutable plan hash. |
| `POST /api/v1/tasks/:id/execute` | Execute an approved deterministic task. |
| `GET /api/v1/tasks/:id/events` | Read persisted task audit events. |
| `GET/POST /api/v1/workflows` | List or create bounded workflow definitions. |
| `POST /api/v1/workflows/:id/runs` | Create a persisted workflow run. Supports `Idempotency-Key`. |
| `POST /api/v1/workflow-runs/:id/request-approval` | Request workflow approval. |
| `POST /api/v1/workflow-runs/:id/approve` | Approve or reject the plan hash. |
| `POST /api/v1/workflow-runs/:id/execute` | Start a bounded run. |
| `POST /api/v1/workflow-runs/:id/resume` | Resume a recovered run. |
| `GET /api/v1/workflow-runs/:id/events` | Read audit events and structured handoffs. |
| `POST /api/v1/scenarios/run` | Create, automatically approve, and start one named offline demonstration using a server-controlled policy; it is not human authorization. |

Every execution plan includes actor, workspace, agent, requested capabilities, allowed tools, data scope, time limit, budget limit, approval policy, server-controlled grants, execution mode, and a SHA-256 plan hash. Client requests cannot provide `explicit_grants`; plans, persisted grants, authorization records, revocation state, and approval mode are rechecked immediately before execution.
