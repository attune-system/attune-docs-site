---
title: "Data Caches"
description: "Data Caches store owner-scoped, versioned external business data for actions, workflows, sensors, and operators to query deliberately. They are designed for read-mostly datasets su"
sidebar:
  label: "Data Caches"
  order: 9
---
![Data Cache namespace list with owner and freshness filters](/screenshots/Data-Caches.png)

Data Caches store owner-scoped, versioned external business data for actions,
workflows, sensors, and operators to query deliberately. They are designed for
read-mostly datasets such as customer records, inventories, CMDB snapshots, and
lookup tables.

Data Caches are separate from:

| Facility | Use it for |
| --- | --- |
| Data Caches | High-cardinality, versioned external datasets queried through the cache API or client. |
| Keys and Secrets | Small configuration values and credentials, optionally encrypted and delivered to authorized executions. |
| Artifacts | Execution outputs such as files, logs, progress, URLs, and structured results. |

Cache values are plain business data. They are never injected into action
parameter stdin or treated as secrets. Do not store credentials or secret
material in a Data Cache.

## Ownership and namespaces

A cache is identified by an owner scope and a normalized namespace. Owner
selection is explicit on CLI and API requests:

| Owner type | Owner reference |
| --- | --- |
| `system` | Omitted. |
| `identity` | Omitted; resolves to the authenticated identity. |
| `pack` | Pack ref, such as `salesforce`. |
| `action` | Action ref, such as `salesforce.sync_users`. |
| `sensor` | Sensor ref, such as `salesforce.change_sensor`. |

Namespaces are lowercase logical dataset names, for example
`salesforce.users`. Owner scope and namespace are immutable. Create a new
namespace to change either one.

Each namespace has policy controls for:

- Freshness target.
- Maximum records and bytes per generation.
- Maximum retained bytes and generations.
- Maximum concurrent staging generations.

Deleting a namespace tombstones it immediately. The supervisor then removes
its generations and entries in bounded batches. Until cleanup completes, the
owner record may still be protected by cache references.

## Deploying namespaces with packs

Packs can deploy cache namespace metadata from `caches/*.yaml`. Cache
definitions load after actions and sensors so component owners can be resolved:

```yaml
ref: salesforce.users
namespace: users
owner_type: action
owner_ref: salesforce.refresh_users
freshness_target_seconds: 3600
max_records_per_generation: 200000
max_generation_bytes: 536870912
max_retained_bytes: 2147483648
max_retained_generations: 5
max_staging_generations: 2
```

`owner_type` may be `pack`, `action`, or `sensor`. The owner must belong to the
installing pack; pack files cannot create system-, identity-, or cross-pack
cache namespaces. `ref` is the stable pack-qualified identity of the
definition, while `namespace` is the queryable cache name.

Reinstalling a pack updates policy in place and preserves the live namespace
ID and generations. Changing the owner or namespace of an existing definition
is rejected; add a new definition instead. Removing a definition tombstones
only that pack-managed namespace. API-created namespaces are not mistaken for
removed pack definitions.

Removing a cache-owning action or sensor, or deleting its pack, tombstones the
affected namespaces in the same database transaction before deleting the
owner. The supervisor drains the retained data asynchronously. Reinstalling
the pack may create a new live definition while the old tombstoned generation
history is still being reclaimed.

### Cache definition reference

Each file in `caches/` defines exactly one namespace. Definitions are strict:
unknown fields cause pack installation to fail. The following is the complete
shape, including every supported policy option:

| Field | Required | Default | Meaning |
| --- | --- | --- | --- |
| `ref` | Yes | None | Stable, pack-qualified definition ID, such as `salesforce.users`. It identifies this declaration across pack upgrades; it is not the namespace query argument. |
| `namespace` | Yes | None | Queryable lowercase dataset name. It must match `[a-z0-9][a-z0-9._-]{0,127}` and is unique within its owner scope. |
| `owner_type` | Yes | None | Owner of the dataset: `pack`, `action`, or `sensor`. Pack definitions cannot use `system` or `identity`. |
| `owner_ref` | Yes | None | The pack ref for a `pack` owner, or the full action/sensor ref for the other owner types. An action or sensor must belong to the installing pack. |
| `freshness_target_seconds` | No | `3600` | Age at which an active generation is reported as stale. `0` disables stale classification. It does not remove data or prevent ordinary reads. |
| `max_records_per_generation` | No | `200000` | Maximum records accepted in one candidate generation. A sealed generation exceeding this cannot be promoted. |
| `max_generation_bytes` | No | `536870912` (512 MiB) | Maximum accounted bytes in one generation. |
| `max_retained_bytes` | No | `2147483648` (2 GiB) | Maximum accounted bytes retained across the namespace's generations. Allow room for the active snapshot, retained readers, and an incoming generation. |
| `max_retained_generations` | No | `5` | Maximum generation count retained when a new generation is promoted. Must be at least `2` so readers can finish traversing the prior snapshot. |
| `max_staging_generations` | No | `2` | Maximum concurrent `staging` generations. Must be at least `1`; increase only when independent producers genuinely need to prepare snapshots concurrently. |

All numeric policy values except the two generation-count fields may be zero,
but zero record or byte limits allow only a zero-sized generation. In normal
use, configure positive values. Policy updates affect future lifecycle
admission and do not alter existing immutable entries.

### Pack deployment workflow

Use a declarative definition when the cache is part of a pack's contract. For
example, a pack with an action that refreshes Salesforce users can be laid out
as follows:

```text
salesforce/
├── pack.yaml
├── actions/
│   └── refresh_users.yaml
└── caches/
    └── users.yaml
```

`caches/users.yaml`:

```yaml
ref: salesforce.users
namespace: users
owner_type: action
owner_ref: salesforce.refresh_users
freshness_target_seconds: 3600
max_records_per_generation: 200000
max_generation_bytes: 536870912
max_retained_bytes: 2147483648
max_retained_generations: 5
max_staging_generations: 2
```

Install or update the pack normally:

```bash
attune pack upload ./salesforce
# Or install/update through the usual pack source workflow.
```

Attune loads cache files after actions and sensors, so the owner must be
declared in the same install. Confirm the deployed policy and capture the
active generation before a refresh:

```bash
attune cache namespace show users \
  --owner-type action --owner-action-ref salesforce.refresh_users
```

Use the API or CLI to create `system`- or `identity`-owned namespaces. Use an
API/CLI namespace rather than a pack definition when an operator, rather than
the pack, owns its lifecycle. Pack deployment is declarative policy management,
not data ingestion: it creates or updates the namespace but never uploads
records.

## Generations and publication

Every published dataset is an immutable generation:

| State | Meaning |
| --- | --- |
| `staging` | A refresh has begun and numbered chunks may be uploaded. |
| `ready` | Upload is sealed and validated but not visible as the active dataset. |
| `active` | The generation serves unpinned reads. |
| `retired` | A newer generation is active; this generation remains readable until its retention deadline. |
| `failed` | The refresh cannot be published. |

Publication is copy-on-write:

1. Begin a staging generation with a unique `client_refresh_id`, expected
   chunk count, and the active generation observed by the caller.
2. Upload numbered chunks. Entries contain `external_id`, JSON `value`, and
   optional source metadata.
3. Seal the generation. Attune verifies chunk continuity, declared counts,
   byte totals, duplicates, and namespace quotas.
4. Promote the ready generation using the same expected-active guard.
5. Attune atomically activates the new generation and retires the old one.

If another refresh wins first, promotion returns
`cache_precondition_failed` rather than overwriting newer data. Abandon a
refresh that should not proceed.

### Entry and refresh metadata

An uploaded entry has this JSON shape. `external_id` is an opaque,
case-sensitive identifier; do not normalize it. `value` is any JSON value,
though an object makes a durable business-data contract easier to evolve.

```json
{
  "external_id": "005xx000001ABC",
  "value": {
    "name": "Ada Lovelace",
    "email": "ada@example.test",
    "active": true
  },
  "source_updated_at": "2026-07-31T12:00:00Z",
  "source_checksum": "a-source-specific-version-or-digest"
}
```

`source_updated_at` and `source_checksum` are optional descriptive metadata;
Attune does not interpret them to merge records. Records are replaced only by
publishing a complete new generation. For the CLI, write one entry object per
line in an NDJSON file:

```json
{"external_id":"005xx000001ABC","value":{"name":"Ada Lovelace","active":true}}
{"external_id":"005xx000001DEF","value":{"name":"Grace Hopper","active":true}}
```

The refresh begin request records producer metadata used for retries and
validation:

| Field | Required | Meaning |
| --- | --- | --- |
| `client_refresh_id` | Yes | Stable producer-generated ID. Repeating `begin` with the same fields is idempotent; changing fields is a conflict. |
| `expected_active_generation_id` | Yes | Generation seen before refresh. Use `null` or CLI `--expect-empty` only for the first publication. Supply the same expectation at promotion. |
| `expected_chunk_count` | Yes | Number of contiguous, zero-based chunks expected. A zero-record snapshot can use `0`; otherwise upload indexes `0` through `count - 1`. |
| `expected_record_count` | No | Expected total record count, validated when sealing. |
| `expected_size_bytes` | No | Expected total accounted byte size, validated when sealing. |
| `source_revision` | No | Upstream revision, timestamp, cursor, or other producer traceability value. |

The service accepts at most 10,000 entries and approximately 32 MiB of
encoded data per API upload chunk. Individual `value` JSON is limited to 1
MiB and identifier/checksum text to 1,024 bytes. CLI `refresh apply` defaults
to 1,000 records per chunk and permits up to 10,000; it also rejects NDJSON
lines larger than 1 MiB. Split unusually large source records before using
them as cache values.

## Reading cache entries

Three bounded read patterns are available:

| Pattern | Behavior |
| --- | --- |
| Point lookup | Returns one external ID from the active or explicitly pinned generation. |
| Multi-ID lookup | Returns a bounded set of entries and reports missing IDs separately. |
| Cursor scan | Returns a page ordered bytewise by external ID, with an opaque cursor pinned to one generation. |

Point and multi-ID lookups place external IDs in the request body so they are
not exposed in URL access logs.

A scan's first response includes `generation_id`, `next_cursor`, and
`cursor_expires_at`. Send both `generation` and `cursor` on the next request.
The cursor is integrity-protected and cannot be reused with another namespace,
generation, or page shape.

Traversal expires at the earliest of the generation's `readable_until`, the
configured traversal window, or the cursor token expiry. If the pinned
generation is no longer readable, the API returns `snapshot_expired`; restart
the scan from the active generation. Attune never silently turns an expired
snapshot into an empty final page.

Read responses report whether the active generation is stale. Set
`require_fresh=true` when stale data must fail with `cache_stale`. An
uninitialized namespace returns `cache_not_populated`.

## Platform deployment

Data Caches are stored in PostgreSQL. Deploy the Attune release containing the
cache migration before deploying packs that contain `caches/*.yaml`. Apply the
normal deployment migration job, or run `sqlx migrate run --source ./migrations`
when operating from source. No separate cache service or object store is
required.

Run at least one `attune-supervisor` instance wherever caches are enabled. It
expires abandoned uploads, preserves still-readable snapshots after promotion,
and reclaims retired records and tombstoned namespaces in bounded batches.
Without it, cache reads and publication work, but failed uploads and retired
storage are not automatically reclaimed.

Before production rollout:

1. Size each namespace for an active generation, the retained snapshots needed
   for cursor readers, and a concurrent staging generation.
2. Grant the operator or producer the needed `caches:create` and
   `caches:update` permissions; grant consumers only `caches:read`.
3. Confirm PostgreSQL backups, replicas, and volumes meet the classification of
   the business data. Cache values are plaintext application data, not
   encrypted secrets.
4. Configure and monitor cache retention through **Runtime Retention** or
   `GET`/`PUT /api/v1/retention-config`. See
   [Supervisor Operations](/operations/supervisor/#cache-retention-configuration)
   for every `cache_retention` setting and its defaults.
5. Review the startup-loaded `cache_admission` limits in
   [Supervisor Operations](/operations/supervisor/#cache-admission-configuration).
   Use identical values on every API instance.
6. Deploy pack metadata, run an initial refresh, then check namespace health
   and the supervisor logs before enabling dependent automation.

## Web UI

Open **Data Caches** at `/caches`. It is a sibling of **Keys & Secrets**, not a
mode inside it.

![Data Cache namespace overview showing policy and active generation health](/screenshots/Data-Caches-Overview.png)

The web UI supports:

- Owner-scoped namespace browsing and policy management.
- Freshness, population, record-count, size, and active-generation health.
- Generation history and lifecycle status.
- Point, multi-ID, and paged entry reads.
- Bounded manual imports and refresh lifecycle operations.

The page and its controls require the matching `caches` permissions. Large
scheduled refreshes should run through an action or the CLI rather than a
browser session.

## CLI

All namespace-addressed commands require an explicit owner selector.

```bash
# Namespace policy
attune cache namespace create salesforce.users \
  --owner-type pack --owner-pack-ref salesforce
attune cache namespace list \
  --owner-type pack --owner-pack-ref salesforce
attune cache namespace show salesforce.users \
  --owner-type pack --owner-pack-ref salesforce

# Bounded reads
attune cache entry get salesforce.users 005xx \
  --owner-type pack --owner-pack-ref salesforce
attune cache entry get-many salesforce.users \
  --owner-type pack --owner-pack-ref salesforce \
  --external-id 005xx --external-id-file ids.txt
attune cache entry scan salesforce.users \
  --owner-type pack --owner-pack-ref salesforce

# Stream a pinned generation without materializing the whole dataset
attune --output ndjson cache entry scan salesforce.users \
  --owner-type pack --owner-pack-ref salesforce --all > users.ndjson
```

For a manual copy-on-write refresh:

```bash
attune cache refresh begin salesforce.users \
  --owner-type pack --owner-pack-ref salesforce \
  --expected-chunk-count 2 --expect-empty

attune cache refresh upload salesforce.users 123 \
  --owner-type pack --owner-pack-ref salesforce \
  --chunk-index 0 --file users-part-0.ndjson

attune cache refresh seal salesforce.users 123 \
  --owner-type pack --owner-pack-ref salesforce \
  --expected-chunk-count 2

attune cache refresh promote salesforce.users 123 \
  --owner-type pack --owner-pack-ref salesforce --expect-empty
```

`refresh apply --input <ndjson>` performs the same lifecycle with bounded
chunking. It still requires an expected active generation or `--expect-empty`;
it never force-promotes over concurrent work. Use `refresh abort ... --yes` to
abandon an incomplete refresh.

With `--output ndjson`, scan entries are written one per stdout line while
generation and cursor metadata go to stderr.

## API

The complete schemas and response definitions are in
[openapi.json](/openapi.json) and the live Swagger UI at `/docs`.

| Method | Endpoint | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/cache/namespaces` | `caches:read` | List visible namespaces for an owner. |
| `POST` | `/api/v1/cache/namespaces` | `caches:create` | Create a namespace and policy. |
| `GET` | `/api/v1/cache/namespaces/{namespace}` | `caches:read` | Read namespace health and policy. |
| `PUT` | `/api/v1/cache/namespaces/{namespace}` | `caches:update` | Update mutable policy fields. |
| `DELETE` | `/api/v1/cache/namespaces/{namespace}` | `caches:delete` | Tombstone a namespace for cleanup. |
| `GET` | `/api/v1/cache/namespaces/{namespace}/entries` | `caches:read` | Read one cursor page. |
| `POST` | `/api/v1/cache/namespaces/{namespace}/entries/lookup` | `caches:read` | Point lookup. |
| `POST` | `/api/v1/cache/namespaces/{namespace}/entries/lookup-many` | `caches:read` | Bounded multi-ID lookup. |
| `GET` | `/api/v1/cache/namespaces/{namespace}/generations` | `caches:read` | List generation history. |
| `POST` | `/api/v1/cache/namespaces/{namespace}/generations` | `caches:create` | Begin a staging generation. |
| `GET` | `/api/v1/cache/namespaces/{namespace}/generations/{generation_id}` | `caches:read` | Read generation metadata. |
| `PUT` | `/api/v1/cache/namespaces/{namespace}/generations/{generation_id}/chunks/{chunk_index}` | `caches:update` | Upload one numbered chunk. |
| `POST` | `/api/v1/cache/namespaces/{namespace}/generations/{generation_id}/seal` | `caches:update` | Validate and seal the upload. |
| `POST` | `/api/v1/cache/namespaces/{namespace}/generations/{generation_id}/promote` | `caches:update` | Atomically publish the generation. |
| `POST` | `/api/v1/cache/namespaces/{namespace}/generations/{generation_id}/abandon` | `caches:update` | Abandon the refresh. |

Owner fields are query parameters on `GET` and `DELETE` requests and JSON body
fields on mutation and lookup requests. `expected_active_generation_id` is a
required field when beginning or promoting a generation; explicit `null`
means the caller expects the namespace to be unpopulated.

Example point lookup:

```http
POST /api/v1/cache/namespaces/salesforce.users/entries/lookup
Authorization: Bearer <token>
Content-Type: application/json

{
  "owner_type": "pack",
  "owner_ref": "salesforce",
  "external_id": "005xx",
  "require_fresh": true
}
```

## RBAC and runtime access

Data Caches use the dedicated `caches` resource. Cache permissions do not
imply key access, and key permissions do not imply cache access.

Grants can be constrained by owner type, owner ref, and namespace:

```yaml
grants:
  - resource: caches
    actions: [read]
    constraints:
      owner_types: [pack]
      owner_refs: [salesforce]
      refs: [salesforce.users]
```

The reserved execution permission ref `standard` grants cache **read** access
only for the executing action and pack scopes. Workflow child executions also
receive read scope for the containing workflow action and pack. Cache refresh,
policy, and deletion operations require explicit named grants.

Execution cache access is opt-in: an action receives `ATTUNE_API_TOKEN` only
when its execution has permission set refs. Empty or invalid execution
authority fails closed. Managed sensors receive signed cache authority scoped
to the exact sensor and pack grants they need; they do not inherit the
triggering identity's roles.

Actions and sensors should use an Attune runtime or generated client where one
is available. Direct HTTP clients must preserve the documented owner,
generation, cursor, and error semantics. Cache records remain API data and are
never mixed into secret parameter delivery.

### Using a cache from an action or sensor

An action receives API credentials only when its execution has non-empty
permission-set references. Add `standard` to read namespaces owned by that
action or its pack:

```yaml
ref: salesforce.use_cached_user
label: Use cached user
runner_type: python
entry_point: use_cached_user.py
default_execution_permission_set_refs:
  - standard
```

At runtime, use `ATTUNE_API_URL` and `ATTUNE_API_TOKEN` with the cache API (or
a generated client). Fetch only required entries, and page through scans while
retaining the returned generation and cursor. `standard` grants read access
only; cache refreshes, namespace policy changes, and deletion need a named
`caches` grant.

```python
import json
import os
import urllib.request

namespace = "users"
request = urllib.request.Request(
    f"{os.environ['ATTUNE_API_URL'].rstrip('/')}/api/v1/cache/namespaces/"
    f"{namespace}/entries/lookup",
    data=json.dumps({
        "owner_type": "pack",
        "owner_ref": "salesforce",
        "external_id": "005xx000001ABC",
        "require_fresh": False,
    }).encode(),
    headers={
        "Authorization": f"Bearer {os.environ['ATTUNE_API_TOKEN']}",
        "Content-Type": "application/json",
    },
    method="POST",
)

with urllib.request.urlopen(request, timeout=30) as response:
    item = json.load(response)["data"]["item"]

if item is not None:
    print(item["value"]["name"])
```

The caller should handle `item: null` as an authorized cache miss and should
not log complete records unless that disclosure is intentional.

The writer grant referenced above can be declared as:

```yaml
ref: salesforce.cache_writer
label: Salesforce cache writer
grants:
  - resource: caches
    actions: [create, update]
    constraints:
      owner_types: [action]
      owner_refs: [salesforce.refresh_users]
      refs: [users]
```

Managed sensors use their own signed, scoped authority and do not inherit the
identity that created a rule. Do not place upstream credentials in the cache:
keep those in Keys and Secrets and use cache entries only for business data.

## Retention and operations

`attune-supervisor` manages cache lifecycle work:

- Expiring abandoned staging generations.
- Preserving the active generation and still-readable retired snapshots.
- Removing expired entries in bounded batches.
- Deleting empty generations and tombstoned namespaces.
- Reporting stale or unpopulated namespaces through cache health state.

Run at least one supervisor instance in every deployment. Multiple instances
are safe because maintenance uses the supervisor advisory lock.

Choose quotas that allow one active generation, any required readable retired
generation, and a new staging generation during refresh. Monitor stale
namespaces, failed refreshes, retained bytes, staging counts, and supervisor
health. Treat repeated promotion conflicts as concurrent-writer coordination
problems rather than retrying without the expected-active guard.

## Error codes

Cache-specific conflict and validation responses include stable machine codes:

| Code | Meaning |
| --- | --- |
| `cache_not_populated` | The namespace has no active generation. |
| `cache_stale` | `require_fresh=true` rejected stale data. |
| `snapshot_expired` | A pinned generation or cursor is no longer readable. |
| `cache_cursor_invalid` | Cursor integrity, namespace, generation, or page shape is invalid. |
| `cache_precondition_failed` | The expected active generation no longer matches. |
| `cache_conflict` | The requested lifecycle transition conflicts with current state. |
| `cache_quota_exceeded` | A namespace, generation, staging, or retained-data quota would be exceeded. |
| `cache_global_namespace_limit_exceeded` | The deployment-wide live namespace admission limit was reached. |
| `cache_owner_namespace_limit_exceeded` | The canonical owner's live namespace admission limit was reached. |
| `cache_owner_unpublished_generations_limit_exceeded` | The canonical owner has too many `staging` or `ready` generations. |
| `cache_global_physical_bytes_limit_exceeded` | Deployment-wide physical cache-entry usage reached its admission limit. |
| `cache_owner_physical_bytes_limit_exceeded` | The canonical owner's physical cache-entry usage reached its admission limit. |
| `cache_duplicate_external_id` | An ingest contains duplicate external IDs; identifiers are not echoed. |
| `namespace_deleted` | The namespace is tombstoned and pending cleanup. |

Authorization failures intentionally avoid revealing whether an inaccessible
namespace or generation exists.

## Related

- [API Reference](/reference/api/)
- [CLI Reference](/reference/cli/)
- [Permissions and RBAC](/administration/permissions-and-rbac/)
- [Supervisor Operations](/operations/supervisor/)
