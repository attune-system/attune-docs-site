---
title: "Permissions and RBAC"
description: "Attune uses roles, permissions, constraints, and execution permission sets to control access. The safest pattern is to grant narrow, constrained access and delegate execution-scope"
sidebar:
  label: "Permissions and RBAC"
  order: 5
---
Attune uses roles, permissions, constraints, and execution permission sets to control access. The safest pattern is to grant narrow, constrained access and delegate execution-scoped permissions only when an action truly needs to call back into Attune.

![Access control permission sets view with pack-scoped grants](/screenshots/Permissions-and-RBAC.png)

## Permission model

Permissions are expressed by resource and action, such as:

```text
packs:read
packs:install
actions:execute
keys:decrypt
artifacts:create
queues:create
queue_items:create
audit_log:read
```

Permissions can be constrained by fields such as owner, pack ref, component ref, IDs, or visibility. For sensitive resources, broad unconstrained grants are intentionally not enough to access another owner's private data.

## Row-level read visibility

Attune read/list/search endpoints are authenticated, then row-filtered. Calling an endpoint and seeing data are separate concerns.

- **Actions, triggers, dashboards**: evaluated as `global read -> scope check -> visibility model (public/private/restricted)`.
- **Rules**: treated as private-scoped metadata. Non-global callers need explicit rule scope (`pack` or specific `rule`).
- **Events**: if linked to a rule, visibility is derived from that rule (authoritative). Trigger visibility is used only when no rule association exists.
- **Enforcements**: visibility is derived from the originating rule for all non-global reads; there is no trigger/event fallback.
- **Artifacts**: if execution linkage exists, execution visibility is authoritative. Owner-path visibility applies only when no execution linkage exists.
- **Executions**: rows are filtered by execution ownership/ancestry, parent inheritance, and execution-scoped grants.

The notifier WebSocket stream applies the same row-level checks before forwarding notifications.

## Packs

Pack permissions include:

- `packs:read`
- `packs:create`
- `packs:install`
- `packs:configure`
- `packs:delete`

Cross-owner access to non-standard packs requires meaningful constrained grants. Standard packs are globally visible.

## Keys

Keys are scoped by owner type and owner ref. Identity-owned keys are visible/decryptable/mutable only by the owner unless a constrained `keys:*` grant matches the key scope. Broad unconstrained key grants do not reveal another identity's keys.

Canonical refs include the owner scope, such as `system.github_token` or `pack.my_pack.api_credentials`. See [Keys and secrets](/administration/keys-and-secrets/) for creation, encryption, and execution delivery.

## Data Caches

Data Caches use the dedicated `caches` resource with `read`, `create`,
`update`, and `delete` actions. Cache permissions are independent of Keys and
Artifacts.

Cache grants can be constrained by owner type, owner ref, and namespace:

```yaml
grants:
  - resource: caches
    actions: [read]
    constraints:
      owner_types: [pack]
      owner_refs: [salesforce]
      refs: [salesforce.users]
```

Namespace lists return only rows visible through the caller's effective cache
grants. Unauthorized requests do not reveal whether a namespace or generation
exists. Use explicit named permission sets for cache refresh or cross-owner
access.

## Operational metadata decrypt

Operational read permissions are intentionally separate from secret disclosure. A user with read access can inspect IDs, refs, status, timestamps, and non-secret JSON values on events, enforcements, and executions. Secret-designated fields remain redacted unless the caller also has the matching decrypt action.

| Resource | Scope-expanding read grant | Decrypt action |
| --- | --- | --- |
| Events | `events:read` | `events:decrypt` |
| Enforcements | `enforcements:read` | `enforcements:decrypt` |
| Executions | `executions:read` | `executions:decrypt` |

Grant decrypt narrowly. Read grants broaden row-level visibility; decrypt grants control whether `include_secret_values=true` may reveal protected values.

## Artifacts

Artifact reads are row-level and path-aware:

- Global artifact read always grants access.
- If execution linkage exists, execution visibility is authoritative.
- If no execution linkage exists, owner-path visibility applies.
- Public artifacts without execution linkage are visible to authenticated callers.

Private artifacts require one of:

- Ownership for identity-scoped artifacts.
- `packs:read` or `packs:configure` on the derived pack for pack/action/sensor-scoped artifacts.
- A constrained artifact permission matching the artifact.

Execution tokens do not automatically get artifact access just because they exist.

## Inquiries

Inquiry assignment is enforced on the user-facing response endpoint. Only the assignee may respond. Tokens without a resolvable identity are rejected. An execution cannot respond to an inquiry that it created, or to an ancestor inquiry, with its own execution-scoped token.

## Execution permission sets

Execution-scoped API access is opt-in. An execution gets `ATTUNE_API_TOKEN` only when its snapped `permission_set_refs` are non-empty.

Sources of execution permission refs:

- Manual execution request override.
- Action `default_execution_permission_set_refs`.
- Workflow task `permission_set_refs`.
- Queue/rule/workflow-created executions that snapshot target action defaults.
- Retries preserve the original execution refs.

Named refs load database permission sets. The reserved `standard` ref is always delegable because it is not a database permission set. Named-set delegation is accepted only when the caller's current effective grants cover every grant in the requested sets; the Web UI exposes assigned permission-set refs and lets `core.admin` users select any set.

## Deployable permission set YAML

Pack-owned permission sets live under `permission_sets/*.yaml` and are loaded before other pack metadata. A broad administrative set looks like this:

```yaml
ref: my_pack.admin
label: My Pack Admin
description: Full administrative access to this pack's components.
grants:
  - resource: packs
    actions: [read, configure, delete]
    constraints:
      pack_refs: [my_pack]
  - resource: actions
    actions: [read, create, update, delete, execute]
    constraints:
      pack_refs: [my_pack]
  - resource: rules
    actions: [read, create, update, delete]
    constraints:
      pack_refs: [my_pack]
  - resource: triggers
    actions: [read, create, update, delete]
    constraints:
      pack_refs: [my_pack]
  - resource: events
    actions: [read]
    constraints:
      pack_refs: [my_pack]
  - resource: enforcements
    actions: [read]
    constraints:
      pack_refs: [my_pack]
  - resource: executions
    actions: [read]
    constraints:
      pack_refs: [my_pack]
  - resource: queues
    actions: [read, create, update, delete]
    constraints:
      pack_refs: [my_pack]
  - resource: queue_items
    actions: [read, create, update, delete]
    constraints:
      pack_refs: [my_pack]
```

For execution-scoped delegation, prefer a narrow set with explicit constraints:

```yaml
ref: my_pack.agent_limited_tools
label: My Pack Agent Limited Tools
description: Grants an execution-scoped agent access only to selected pack resources.
grants:
  - resource: actions
    actions: [read, execute]
    constraints:
      refs:
        - my_pack.safe_lookup
        - my_pack.create_ticket
  - resource: artifacts
    actions: [read, create, update]
    constraints:
      pack_refs: [my_pack]
      owner_types: [pack, action]
      owner_refs:
        - my_pack
        - my_pack.agent_action
      visibility: [private, public]
  - resource: keys
    actions: [read, decrypt]
    constraints:
      owner_types: [pack]
      owner_refs: [my_pack]
      refs:
        - pack.my_pack.api_credentials
      encrypted: true
  - resource: caches
    actions: [read]
    constraints:
      owner_types: [pack]
      owner_refs: [my_pack]
      refs: [my_pack.lookup_data]
```

Supported constraint keys are `pack_refs`, `owner`, `owner_types`, `owner_refs`, `visibility`, `execution_scope`, `refs`, `ids`, `encrypted`, and `attributes`. Use `owner: self` for identity-owned resources that must belong to the caller; use `execution_scope: self` or `descendants` for execution-scoped access patterns.

Add `events:decrypt`, `enforcements:decrypt`, or `executions:decrypt` only when the role should reveal redacted operational values via detail endpoints with `include_secret_values=true`.

## Reserved `standard` ref

`standard` is not a database permission set. It expands during authorization to narrowly scoped grants:

- `keys:read` and `keys:decrypt` for pack/action-scoped keys owned by the executing action/pack.
- `artifacts:read/create/update/delete` for pack/action-scoped artifacts owned by the executing action/pack.
- `caches:read` for cache namespaces owned by the executing action/pack.
- For workflow child executions, the containing workflow action/pack is also included so a workflow can expose its scoped keys, artifacts, and cache data to child task actions.

Use `standard` for common action-local key/artifact access and read-only Data
Cache access. Cache creation, refresh, policy changes, and deletion require
explicit named permission sets.

Managed sensor cache access uses signed authority scoped to the sensor and pack
grants. Sensor tokens do not inherit a user's identity roles. Execution and
sensor cache authorization fails closed when signed authority is missing or
invalid.

## AI agents and MCP

AI/agent actions should prefer the execution-scoped `ATTUNE_API_TOKEN` and local `attune-mcp` binary. This lets the agent interact with Attune through a curated tool surface and only the permissions granted to that execution.

Recommended pattern:

```text
Workflow task permission_set_refs: ["standard", "agent_limited_tools"]
Worker env: ATTUNE_API_TOKEN + ATTUNE_API_URL
Agent command: /opt/attune/agent/attune-mcp over stdio
```

Do not run AI agents with full user access unless the workflow intentionally delegates that level of authority.

## Admin checklist

- Give humans roles for what they need in the Web UI/CLI.
- Use constrained grants for keys, artifacts, packs, and queues; restrict `audit_log:read` to trusted admins.
- Prefer `standard` for execution-local key/artifact access and read-only cache access.
- Create named execution permission sets for explicit agent/API tool access.
- Review audit logs for sensitive permission, key, artifact, and pack operations.

## Related

- [Authentication and Identity](/administration/authentication-and-identity/)
- [Writing Actions](/pack-development/actions/)
- [Data Caches](/administration/data-caches/)
- [Using Pack Actions in Workflows](/pack-development/composing-actions/)
