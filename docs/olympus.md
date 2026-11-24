# OLYMPUS organization builder

OLYMPUS is the native, local-first organization layer for AGENT//FACTORY V5. It models a governed AI workforce without changing the 100-role catalog or promoting registry-only roles into executable agents.

## Operating boundary

- Organizations, departments, members, projects, objectives, and activity are persisted inside the authenticated local workspace.
- Catalog role identity, runtime support, capabilities, and prompts remain authoritative in `catalog/roles.json`.
- A member can be `typed-runtime` or `registry-only`; the organization builder cannot change that status, grant permissions, or enable execution.
- Reporting lines and department parents are checked for self-dependencies and cycles.
- Projects require an existing organization member as owner.
- Export/import uses a versioned JSON envelope and creates a new organization when the source name already exists.
- Activity records are append-only evidence for organization changes.

## Templates

The builder ships seven deterministic templates: software engineering, AI governance, enterprise risk management, fraud intelligence, research laboratory, product development, and supply-chain operations. Templates create a starting department structure; users can add departments and assign catalog roles afterward.

## Local API

All routes require the existing local session cookie and workspace boundary:

```text
GET    /api/v1/olympus/templates
GET    /api/v1/olympus/organizations
POST   /api/v1/olympus/organizations
GET    /api/v1/olympus/organizations/:id
POST   /api/v1/olympus/organizations/:id/departments
POST   /api/v1/olympus/organizations/:id/members
PATCH  /api/v1/olympus/organizations/:id/members/:agentId
POST   /api/v1/olympus/organizations/:id/projects
POST   /api/v1/olympus/organizations/:id/objectives
GET    /api/v1/olympus/organizations/:id/export
POST   /api/v1/olympus/organizations/import
```

The API deliberately has no route that promotes a role, changes its catalog runtime status, or starts a provider execution. Execution remains behind the V4.1 authorization, approval, plan-hash, budget, cancellation, and kill-switch controls.

## Data and privacy

The organization model is local SQLite state. It is not included in the static GitHub Pages showcase, and it does not send organization records to Paperclip or any external provider. The optional Paperclip bridge remains a separately configured, server-side adapter with read-only discovery in M1.
