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

## Everyday Codex workflow

Use this six-step workflow from the AGENT//FACTORY repository. It does not start the dashboard, local server, Paperclip, or any paid provider.

```text
# 1. Discover the complete catalog or the 30 typed runtime roles
npm run agent-factory -- discover
npm run agent-factory -- discover --runtime

# 2. Preview and install only the specialists needed by the target repository
npm run agent-factory -- install --target C:\path\to\target-repo --roles security_engineer,qa_test_engineer --dry-run
npm run agent-factory -- install --target C:\path\to\target-repo --roles security_engineer,qa_test_engineer --apply

# 3. Validate the project-scoped installation
npm run agent-factory -- validate --target C:\path\to\target-repo

# 4. Update a managed profile after the catalog prompt changes
npm run agent-factory -- update --target C:\path\to\target-repo --roles security_engineer --apply

# 5. Roll back the most recent update if required
npm run agent-factory -- rollback --target C:\path\to\target-repo --apply

# 6. Remove selected profiles only when they are unchanged
npm run agent-factory -- uninstall --target C:\path\to\target-repo --roles security_engineer,qa_test_engineer --apply
```

On Linux or macOS, use the same commands with a POSIX target path. The target repository must be opened in the Codex session where the specialists will be used. After validation, paste the master instruction below into that session and name the installed profiles explicitly. If the current host does not discover a newly installed profile, start a fresh session in the same target repository; do not modify global Codex configuration.

### Reusable master instruction

```text
AGENT//FACTORY activation for this repository:

Use only the installed project-scoped specialist profiles that are relevant to this task. Select the smallest useful set from the available profiles and state which profiles you selected and why. Keep the primary Codex session responsible for integration and final verification.

For each delegated specialist:
- give one precise objective and a disjoint file/write scope;
- require evidence from the current repository, not assumptions;
- require tests or a reproducible verification command;
- prohibit nested Codex processes, Paperclip, ECC, paid APIs, global configuration changes, secret access, permission bypasses, commits, pushes, merges, deployments, and external messages unless I explicitly authorize them;
- distinguish confirmed defects, risks, and intentional design boundaries.

Run the smallest discovery wave first. Then delegate independent work only when it is safe and non-overlapping. Review every specialist result yourself, reconcile conflicts, run the repository's complete relevant checks, inspect the final diff, and report changed files, evidence, unresolved limitations, and the exact decision needed from me.

Current task:
[PASTE THE TASK, ACCEPTANCE CRITERIA, WRITE BOUNDARIES, AND TEST COMMANDS HERE]
```

This workflow activates ordinary native Codex work through the current session; AGENT//FACTORY does not claim autonomous recursive execution or benchmark improvement. For Codex's current instruction-discovery behavior, consult the official [Codex prompting guide](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide).

## Run the local execution plane

Node 22+ is required for the built-in SQLite runtime. From the repository root:

```text
npm install
npm run start:local
```

Open `http://127.0.0.1:8787/dashboard/`, establish the local session, and select **Execution console**. The service creates `.data/agent-factory.sqlite`, applies migrations, and recovers interrupted workflow runs on startup. Use `AGENT_FACTORY_DATA_DIR` for a disposable or separate local database. No provider credentials are needed for the deterministic offline scenarios. Real Codex or Paperclip execution is separately authorized and remains disabled by default.

