---
title: "API Reference"
description: "The Attune API is the authoritative service interface used by the Web UI, CLI, MCP server, workers, sensors, and external integrations."
sidebar:
  label: "API Reference"
  order: 3
---
The Attune API is the authoritative service interface used by the Web UI, CLI, MCP server, workers, sensors, and external integrations.

## Access

Local Docker default:

```text
http://localhost:8080
```

Protected endpoints require:

```http
Authorization: Bearer <access-token>
```

Execution-scoped actions may use `ATTUNE_API_TOKEN` when present.

## Response shape

Many single-resource and mutation responses use a standard wrapper:

```json
{
  "data": {}
}
```

Paginated list responses return:

```json
{
  "items": [],
  "pagination": {}
}
```

Errors include an error message/code and appropriate HTTP status.

## Endpoint families

| Family | Purpose |
| --- | --- |
| Auth | Login, refresh, current user, OIDC/LDAP flows. |
| Health | Liveness, readiness, and detailed health checks. |
| Packs | List, show, create, configure, upload, register, install, download, test, delete. |
| Pack indices | Configure and browse registry/index sources. |
| Actions | List, show, create/update/delete, search, queue stats. |
| Executions | Request action execution, lifecycle, search, cancel, parent filtering, logs, history. |
| Dashboards | List/show/create/update/delete/clone dashboards, preview draft specs, source catalog, and runtime data queries. |
| Workflows | Upload/save workflow files, list/show/delete workflow actions. |
| Rules | Link triggers to actions/workflows. |
| Triggers, sensors, and webhooks | Define event types, sensor components, and webhook receivers. |
| Events and enforcements | Event stream and rule-firing records. |
| Inquiries | Human approval/input responses. |
| Keys | Scoped secret/config storage. |
| Data Caches | Owner-scoped namespaces, immutable generations, bounded reads, and copy-on-write refresh. |
| Artifacts | Metadata, versions, uploads, downloads, streams, retention. |
| Queues | Queue definitions and items. |
| Runtimes and workers | Runtime definitions, worker status, health fields, and cordon operations. |
| Permissions and identities | Identities, permission sets, grants, role assignments. |
| Audit events | Security/compliance event queries. |
| Analytics/history | TimescaleDB rollups and entity history. |
| Agent | Binary download and agent info. |

`POST /api/v1/packs/install` accepts optional `registry_id` to resolve a pack
ref only through one enabled managed index. `no_registry: true` instead
requires an explicit URL or a path already visible to the API server and disables registry lookup;
the options are mutually exclusive. Registry installs bind the resolved ref
and version to `pack.yaml`, and higher-priority index fetch/validation errors
abort resolution. A forced replacement also requires pack `configure`
permission and preserves the existing owner.

## OpenAPI

This documentation repository stores the latest API contract and immutable
historical versions:

- [OpenAPI JSON](/openapi.json)
- [Interactive API explorer](/api/)
- [Available versions](/openapi/versions.json)

The running API also serves Swagger UI at `/docs` and live OpenAPI JSON at
`/api-spec/openapi.json`. To refresh this site's snapshot, export the contract
from Attune and import it into this repository:

```bash
cargo run --quiet -p attune-api --bin export-openapi -- web/openapi.json
cd /path/to/attune-docs-site
npm run import:openapi -- /path/to/attune/web/openapi.json
```

When the API version changes, the importer archives the previous contract at
`/openapi/versions/<version>.json`. Use the version selector in the API explorer
to open an older contract.

The Web UI client can be regenerated from the running API.

Do not hand-edit generated clients. Update API DTOs/routes and regenerate.

## Auth and RBAC expectations

- Use `RequireAuth` on protected API routes.
- Use repository-layer access for database operations.
- Apply authorization checks before returning private packs, keys, artifacts, queues, private/restricted action references, or audit data.
- Execution tokens authorize only through their embedded permission refs, not the triggering user's full role set.
- For operational datasets, list/search/get calls are row-filtered in-database. Endpoint access and row visibility are evaluated separately.

Action list, search, and detail endpoints hide private or restricted actions from callers that cannot manage the action's owning pack unless the request supplies an allowed `referencing_pack_ref` context. Rule, workflow, and work-queue create/update endpoints validate `action_ref`, task `action`, and `dispatch_action` against the target action's reference policy before saving.

Trigger list and detail endpoints use the same `referencing_pack_ref` context for private/restricted trigger discovery. Rule create/update endpoints validate `trigger_ref` against the target trigger's subscription policy before saving: public triggers can be subscribed to by any pack, private triggers only by the owning pack, and restricted triggers by the owning pack plus `reference_allowed_pack_refs`.

## Pagination and filtering

List/search endpoints should apply visibility filtering in database queries (not fetch-then-filter in memory for final results). Pagination totals/counts should be computed from the same visibility-filtered dataset returned to the caller.

## Data Cache endpoints

Data Cache routes are under `/api/v1/cache`. They provide 15 operations for:

- Namespace list, create, show, policy update, and asynchronous delete.
- Point lookup, bounded multi-ID lookup, and generation-pinned cursor scans.
- Generation list/show and the begin, chunk upload, seal, promote, and abandon
  refresh lifecycle.

All requests include an explicit owner type. Pack, action, and sensor ownership
also include an owner ref; system and authenticated-identity scopes do not.
External IDs are sent in request bodies for point and multi-ID lookups.

Cache reads return the selected `generation_id` and stale state. Cursor scans
must send the returned cursor together with its pinned generation. Expired
snapshots return `snapshot_expired`, and optimistic publication conflicts
return `cache_precondition_failed`.

See [Data Caches](/administration/data-caches/) for the endpoint table, lifecycle, examples, and
runtime access rules.

Workflow-native cache traversal exposes a separate safe progress endpoint:

```http
GET /api/v1/executions/{id}/workflow-cache-iterations
```

It follows normal execution visibility and omits cache values, external IDs,
scan cursors, and workflow secrets.

## Operational visibility endpoints

Worker list responses include operational fields such as role, observed status, cordon state, heartbeat age, stale-heartbeat flag, health state, runtime support, and load. Worker list filters can be used to retrieve action workers, sensor workers, cordoned workers, or unhealthy workers.

Event, enforcement, and execution detail endpoints are redacted by default when schema-designated secret values are present:

```http
GET /api/v1/events/{id}
GET /api/v1/enforcements/{id}
GET /api/v1/executions/{id}
```

To request restored secret values, add `include_secret_values=true`:

```http
GET /api/v1/events/{id}?include_secret_values=true
GET /api/v1/enforcements/{id}?include_secret_values=true
GET /api/v1/executions/{id}?include_secret_values=true
```

Read visibility is row-level and authoritative-path aware:

- Rules are private-scoped metadata; non-global callers need explicit rule scope to see rule rows.
- Enforcements inherit visibility from their originating rule for non-global reads.
- Events use rule-derived visibility when a rule association exists; trigger-derived visibility applies only when no rule association exists.
- Artifacts use execution-derived visibility when execution linkage exists; owner-path visibility is considered only when no execution linkage exists.
- Execution rows are filtered by execution ownership/ancestry, parent inheritance, and execution-scoped grants.

Secret reveal additionally requires the matching `*:decrypt` action. If decrypt is missing, callers can still read redacted records.

Worker cordon endpoints:

```http
POST /api/v1/workers/{id}/cordon
POST /api/v1/workers/{id}/uncordon
```

Sensor log endpoints:

```http
GET /api/v1/sensors/{sensor_ref}/logs
GET /api/v1/sensors/{sensor_ref}/logs/{stdout|stderr}?tail=200
```

## Execution timeout fields

Action resources expose nullable `timeout_seconds`, the default runtime limit for future executions of that action. Execution create requests can also include `timeout_seconds` to override the action/platform default for one execution.

Execution responses expose the resolved `timeout_seconds` snapshotted at creation time. A timed-out action finishes with status `timeout` and result metadata such as `timed_out: true`.

Refresh the committed `public/openapi.json` snapshot after timeout DTO changes
so the explorer and generated clients include these fields.

## WebSocket protocol

The notifier WebSocket endpoint is `/ws` on the notifier service (local Docker default `http://localhost:8081`). It requires a JWT via `Authorization: Bearer <token>` or the browser subprotocol pair `attune.v1`, `attune.jwt.<token>`.

Notifier WebSocket client messages:

```json
{"type":"subscribe","filter":"entity:execution:42"}
```

Common filters:

```text
all
entity_type:<type>
entity:<type>:<id>
user:<id>
notification_type:<type>
```

Server messages are tagged with `type`, such as `welcome`, `notification`, or `error`.

Notifier messages are metadata-only and use the same row-level visibility rules as REST reads. A subscription filter may be accepted, but each notification is still authorization-filtered before delivery. WebSocket delivery does not provide a secret-decrypt path.

## Related

- [CLI Reference](/reference/cli/)
- [Authentication and Identity](/administration/authentication-and-identity/)
- [Permissions and RBAC](/administration/permissions-and-rbac/)
