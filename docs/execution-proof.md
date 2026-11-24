# Final execution proof — 2026-11-24

## Scope

The authorized proof attempt used Codex CLI `0.159.2`, the authenticated OpenAI provider, `--sandbox read-only`, `--ephemeral`, a maximum subagent concurrency override of 2, and two disposable Git repositories created under the repository workspace. No global Codex files, credentials, unrelated repositories, Paperclip, or paid APIs were accessed.

The fixture contained a known off-by-one defect in `src/rate-limiter.mjs`: a limit of 2 accepted a third request because the guard used `>` instead of `>=`. Independent local verification returned:

```json
{"allowed":true,"timestamps":[1000,1001,1002],"expected_allowed":false,"independent_verification":false}
```

The AGENT//FACTORY repository was installed into the second fixture with `security_engineer` and `qa_test_engineer` under its project-local `.codex/agents/` directory. The installer completed successfully without global changes.

## Execution results

| Run | Intended mode | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Standard Codex read-only analysis | **Blocked** | Codex attempted `rg --files` and `Get-ChildItem`; the host rejected both with `blocked by policy`. No files were inspected, no tests ran, and no defect finding was produced. |
| 2 | AGENT//FACTORY profiles with up to two native subagents | **Blocked** | Native subagent launch failed with `invalid thread-store request: no rollout found`; subsequent read-only commands were rejected by the same host policy. No finding or test result was produced. |

The first invocation without `--ignore-user-config` additionally hit `registered Core launch requires an installed app`. Adding `--ignore-user-config` allowed the authenticated CLI to start, but did not resolve the host policy rejection for repository tools. This flag was used only per invocation and did not modify global configuration.

## Honest comparison

There is no valid standard-Codex versus AGENT//FACTORY comparison. Both runs were prevented from reading the repository, so accuracy, completion time, coordination overhead, and acceptance-criteria satisfaction are not measurable. The only observed Codex usage was failed/blocked analysis context; it must not be interpreted as a benchmark score.

The two additional benchmark pairs and self-review were not started because the first pair could not produce an executable result. This respects the six-run and 30-minute limits.

## Decision

The execution-proof milestone remains incomplete. AGENT//FACTORY’s portable installer, routing preview, governance controls, and deterministic runtime are verified locally, but this environment cannot currently prove genuine repository-reading Codex delegation. The simplest reliable integration remains project-scoped custom-agent installation plus explicit, host-supported Codex delegation; native execution should remain opt-in until the command-runner policy and thread-store issue are repaired.
