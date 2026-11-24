# V5 execution adapter investigation

## Observed local surface

The development workstation has `codex-cli 0.159.2` installed and exposes a non-interactive `codex exec` command. The CLI supports JSON event output, an ephemeral session, and a read-only sandbox. This confirms an available local control surface; it does not by itself prove that AGENT//FACTORY has authorization to invoke it, access to a provider, or a production-grade execution contract.

No Codex task was invoked during this investigation. Authentication material was not read, copied, logged, or sent to a provider, and no paid or external model call was made.

## Current product boundary

V4.1 remains the execution authority:

- deterministic-local typed roles are the only executable runtime surface;
- plan hashes, approval records, budgets, tool allowlists, cancellation, timeout handling, and the kill switch remain mandatory;
- registry-only roles cannot be promoted by OLYMPUS, a client request, or a provider adapter;
- Paperclip is optional and read-only in the current bridge;
- the GitHub Pages dashboard is static-only and never invokes a local or remote executor.

## Safe adapter contract for a later milestone

Any Codex adapter must be server-side and disabled by default. Before enabling it, the implementation must pin and validate the CLI contract, require an explicit operator policy, pass only the approved plan and bounded prompt, use an ephemeral read-only sandbox unless a separately approved workspace is needed, enforce a hard timeout and output limit, capture structured evidence, reject recursive delegation, and preserve the existing approval and revocation checks immediately before invocation.

The adapter must report `configured`, `available`, `authorized`, `running`, `completed`, `cancelled`, and `failed` as separate states. “CLI installed” must never be shown as “agent executed successfully.”

## Decision

Do not enable real Codex execution in V5 from this workstation without an explicit execution-policy decision and a reviewed provider adapter test contract. The platform is prepared for that adapter through the shared provider registry and OLYMPUS role-status boundary, while the current release remains evidence-constrained and deterministic-local.
