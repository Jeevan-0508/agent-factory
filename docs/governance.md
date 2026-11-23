# Governance and promotion policy

Agent Factory separates a 100-role catalog from the smaller set of roles that the current host can spawn directly.

## Promotion lifecycle

1. **Registry-only** — documented, reviewed for scope, and available as a prompt/template.
2. **Candidate** — assigned a bounded smoke test, owner, expected inputs, outputs, and failure behavior.
3. **Live-capable** — validated TOML is explicitly installed into a selected Codex runtime directory.
4. **Deprecated** — retained for history but not promoted or installed.

Promotion is explicit. A dashboard badge never means that a role is installed, running, trusted, or authorized to make external changes.

## Safety boundaries

- Prompts are not permission controls. Agents inherit the parent session's tools, sandbox, approvals, and connectors.
- Each delegation must define a precise objective, evidence boundary, write scope, deliverable, and stop condition.
- The primary agent remains responsible for integration, conflict resolution, verification, and final handoff.
- More than eight concurrent tasks are queued into bounded waves in the current host configuration.
- No role may infer permission to commit, push, deploy, delete data, alter credentials, or send external messages.
- HR, employment, legal, privacy, and regulatory roles require qualified human oversight and must not be used to automate adverse decisions.

## EU AI Act caveat

The EU AI Act Specialist should classify applicability, identify evidence gaps, and cite official sources. It must not issue a definitive legal opinion. Employment and worker-management uses may carry high-risk or prohibited-use implications, and the current legal position must be checked against the consolidated regulation and Commission guidance before deployment.

