# Evaluation methodology

Agent Factory distinguishes four evidence classes:

1. **Structural** — catalog counts, role fields, prompts, mythic aliases, workflow references, generated artifacts, and static security rules.
2. **Deterministic** — local runtime scenario outcomes, tool evidence, lifecycle transitions, timeout/retry/cancellation behavior, and restart recovery.
3. **Connected** — provider-backed quality, latency, cost, and reliability. Not measured in the current offline build because connected providers are disabled.
4. **Human** — approval quality, legal/privacy/security review, usability, and consequential decision accountability. Never inferred from automated output.

The dashboard reports only persisted measurements or explicit validation results. It does not invent success rates, uptime, latency, provider quality, or agent activity.
