# Database schema

SQLite migrations in `server/migrations/` persist the runtime boundary:

| Table | Responsibility |
| --- | --- |
| `workspaces` | Workspace identity and persisted kill switch. |
| `agent_configs` | Per-agent runtime configuration and enabled state. |
| `workflows` | Versioned bounded definitions. |
| `execution_authorizations` | Actor, scope, tools, limits, grants, and plan hash. |
| `tasks` | Task lifecycle, input, output, evidence, errors, and timestamps. |
| `approvals` | Approval requests, decisions, reasons, and hash binding. |
| `workflow_runs` / `workflow_run_steps` | Run state, step state, retries, outputs, evidence, and recovery. |
| `tool_invocations` | Safe tool calls and outcomes. |
| `handoffs` | Structured agent-to-agent messages. |
| `audit_events` | Correlated append-only operational evidence. |
| `provider_configs` | Provider metadata and secret references, never raw secrets. |
| `idempotency_keys` | Safe replay responses for workflow creation. |

WAL mode, foreign keys, busy timeout, migrations, and transaction boundaries are configured by `server/db.mjs`.
