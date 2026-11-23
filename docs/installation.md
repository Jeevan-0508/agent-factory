# Installation and local use

The repository is intentionally static. It does not install all 100 roles automatically.

## Review a role

1. Open `catalog/roles.json` or the dashboard.
2. Confirm the role's family, mission, capabilities, deliverables, boundaries, and runtime status.
3. Add task-specific scope and acceptance criteria to the reusable prompt.
4. For a new role, run a bounded smoke test before promoting it.

## Install an approved profile

Only copy a reviewed TOML from `runtime/approved/` into the selected Codex runtime directory. Start a new Codex session or verify that the host has reloaded the profile.

The current repository snapshot intentionally keeps new roles registry-only. The generated TOML files in `agents/` are portable definitions, not an automatic permission grant.

## Run the local execution plane

Node 22+ is required for the built-in SQLite runtime. From the repository root:

```text
npm install
npm run start:local
```

Open `http://127.0.0.1:8787/dashboard/`, establish the local session, and select **Execution console**. The service creates `.data/agent-factory.sqlite`, applies migrations, and recovers interrupted workflow runs on startup. Use `AGENT_FACTORY_DATA_DIR` for a disposable or separate local database. No provider credentials are needed for the deterministic offline scenarios.

