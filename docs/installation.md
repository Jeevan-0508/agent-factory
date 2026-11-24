# Installation and local use

AGENT//FACTORY is project-portable. It does not silently install all 100 roles, modify `CODEX_HOME`, or overwrite a user's Codex configuration.

## Review a role

1. Open `catalog/roles.json` or the dashboard.
2. Confirm the role's family, mission, capabilities, deliverables, boundaries, and runtime status.
3. Add task-specific scope and acceptance criteria to the reusable prompt.
4. For a new role, run a bounded smoke test before promoting it.

## Discover and install selected profiles

The supported installer writes project-scoped custom agents under `.codex/agents/`, matching Codex's documented project-scoped custom-agent location. It requires an explicit target and an explicit `--apply` before changing files:

```text
npm run agent-factory -- discover --runtime
npm run agent-factory -- install --target C:\path\to\project --roles solution_architect,qa_test_engineer --dry-run
npm run agent-factory -- install --target C:\path\to\project --roles solution_architect,qa_test_engineer --apply
npm run agent-factory -- validate --target C:\path\to\project
```

Linux/macOS uses the same commands with a POSIX target path. The installer refuses unmanaged conflicts, records SHA-256 hashes in `.codex/agent-factory-manifest.json`, and never treats a catalog role as permission to execute.

To update files previously installed by AGENT//FACTORY, use `update --apply`. Existing managed files are backed up under `.agent-factory/backups/` before replacement:

```text
npm run agent-factory -- update --target C:\path\to\project --roles solution_architect --apply
npm run agent-factory -- rollback --target C:\path\to\project --apply
```

To remove profiles, the file must still match its recorded hash; locally modified files are refused:

```text
npm run agent-factory -- uninstall --target C:\path\to\project --roles solution_architect --apply
```

For personal agents, use an explicitly chosen Codex home with `--scope codex-home`; profiles go to `<target>\agents` and the manifest goes to `<target>\agent-factory-manifest.json`. The installer never guesses `CODEX_HOME`:

```text
npm run agent-factory -- install --target C:\Users\you\.codex --scope codex-home --roles solution_architect --dry-run
npm run agent-factory -- install --target C:\Users\you\.codex --scope codex-home --roles solution_architect --apply
```

The current repository snapshot intentionally keeps new roles registry-only. The generated TOML files in `agents/` are portable definitions, not an automatic permission grant. `scripts/generate.mjs` only regenerates repository artifacts; it no longer writes to a global Codex directory.

## Cross-repository use

The dashboard and SQLite runtime are not required for profile discovery. From any target repository, the installer adds only the selected role instructions; Codex still applies the target repository's `AGENTS.md`, sandbox, approval policy, skills, and project configuration. Keep task scope, acceptance criteria, write boundaries, and verification commands in the target repository's instructions.

## Run the local execution plane

Node 22+ is required for the built-in SQLite runtime. From the repository root:

```text
npm install
npm run start:local
```

Open `http://127.0.0.1:8787/dashboard/`, establish the local session, and select **Execution console**. The service creates `.data/agent-factory.sqlite`, applies migrations, and recovers interrupted workflow runs on startup. Use `AGENT_FACTORY_DATA_DIR` for a disposable or separate local database. No provider credentials are needed for the deterministic offline scenarios. Real Codex or Paperclip execution is separately authorized and remains disabled by default.

