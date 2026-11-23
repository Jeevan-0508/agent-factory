# Provider adapters

Provider selection is separated from role contracts and workflow orchestration. The current registry exposes:

- `deterministic-local`: configured, no network, rule-based local contract execution;
- `connected-model-adapter`: interface metadata only, disabled until the operator supplies explicit credentials, model scope, data scope, budget, and authorization.

The runtime never displays or stores raw credentials. No provider call is made in offline mode. A future connected adapter must implement explicit timeout, retry, redaction, audit, cost/budget, cancellation, and data residency behavior before it is enabled.
