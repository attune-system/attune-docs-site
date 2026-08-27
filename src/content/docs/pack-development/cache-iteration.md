---
title: "Iterating Data Caches in Workflows"
description: "iteratecache lets a workflow process an owner-scoped Data Cache generation without first loading the full dataset into workflow variables. The executor pins one immutable generatio"
sidebar:
  label: "Iterating Data Caches in Workflows"
  order: 7
---
`iterate_cache` lets a workflow process an owner-scoped Data Cache generation
without first loading the full dataset into workflow variables. The executor
pins one immutable generation, reads records in bounded pages, and creates
child executions only as concurrency capacity becomes available.

Use it for high-cardinality datasets such as inventory, CMDB, customer, or
ticket snapshots. Use `with_items` instead when the workflow already has a
small array in its context.

## Before you begin

1. Create and populate the cache namespace. See [Data Caches](/administration/data-caches/).
2. Create an action that accepts one record or one batch of records.
3. Give the workflow task cache read access as described in
   [Permissions](#permissions).
4. Add `iterate_cache` to an action task in the workflow graph file.

The cache is not exposed as an ambient `cache` expression namespace. Only the
current record or batch is made available as `item` while Attune renders that
child task's input.

## Basic example

This task processes every record in the `users` namespace owned by the
`salesforce` pack. It starts up to four child actions at once.

```yaml
tasks:
  - name: process_cached_user
    action: salesforce.process_user
    iterate_cache:
      owner_type: pack
      owner_ref: salesforce
      namespace: users
    concurrency: 4
    permission_set_refs:
      - standard
    input:
      external_id: "{{ item.external_id }}"
      user: "{{ item.value }}"
      source_updated_at: "{{ item.source_updated_at }}"
```

The entry supplied as `item` has this shape:

```json
{
  "external_id": "005xx000001ABC",
  "value": {
    "name": "Ada Lovelace",
    "active": true
  },
  "source_updated_at": "2026-08-05T10:00:00Z",
  "source_checksum": "upstream-revision-42",
  "size_bytes": 96
}
```

Use pure expressions such as `"{{ item.value }}"` when passing structured
data. Attune preserves the JSON type; it does not serialize the object to a
string.

## Task fields

`iterate_cache` and `with_items` are mutually exclusive. Cache iteration is
supported only by action tasks.

| Field | Required | Default | Meaning |
| --- | --- | --- | --- |
| `owner_type` | No | `pack` | Cache owner type: `system`, `identity`, `pack`, `action`, or `sensor`. |
| `owner_ref` | Depends on owner | Current workflow pack for `pack` | Pack, action, or sensor reference. Omit it for `system` and `identity`. |
| `namespace` | Yes | None | Lowercase cache namespace in the selected owner scope. Templates are allowed. |
| `generation` | No | `active` | `active` pins the active generation when the task begins. An integer or template resolving to an integer pins an explicit generation. |
| `page_size` | No | `100` | Internal cache read page size, from 1 to 1000. It does not control the child action payload size. |
| `require_fresh` | No | `false` | Reject a stale selected generation when `true`. The default permits last-known-good data. |
| `batch_size` | No | `1` | Number of cache entries delivered to one child action, from 1 to 1000. This is a task field, outside `iterate_cache`. |
| `concurrency` | No | `1` | Maximum in-flight child batches. Maximum is 100. |

`owner_type: identity` resolves to the identity that started the workflow. It
requires an authenticated workflow execution. `system` and `identity` owners
must not set `owner_ref`.

## Batches and concurrency

`batch_size` controls the action input; `page_size` only controls how the
executor reads the database. They are independent.

With the default `batch_size: 1`, `item` is one entry object and `index` is its
zero-based child-batch number.

```yaml
tasks:
  - name: process_one
    action: inventory.process_sku
    iterate_cache:
      owner_type: pack
      owner_ref: inventory
      namespace: skus
    input:
      sku: "{{ item.value }}"
      source_id: "{{ item.external_id }}"
```

With `batch_size` greater than one, `item` is an array of entry objects and
`index` is the zero-based batch number. The final batch can be smaller.

```yaml
tasks:
  - name: process_batches
    action: inventory.process_sku_batch
    iterate_cache:
      owner_type: pack
      owner_ref: inventory
      namespace: skus
      page_size: 100
    batch_size: 25
    concurrency: 4
    input:
      records: "{{ item }}"
      batch_number: "{{ index }}"
```

Choose `batch_size` according to the target action's input and upstream API
limits. Keep `concurrency` conservative enough for the worker pool and target
system. Attune limits each materialized child payload to a bounded size, so a
single oversized record or batch is failed rather than silently truncated.

## Generation consistency and freshness

The executor resolves `generation: active` once, before creating the first
child. A later cache refresh or promotion cannot mix records from another
generation into the workflow run.

An authoritative empty generation completes the task successfully without
invoking the child action. An unpopulated namespace is an error.

To reproduce or intentionally process a known snapshot, pin the ID explicitly:

```yaml
iterate_cache:
  owner_type: pack
  owner_ref: salesforce
  namespace: users
  generation: "{{ parameters.generation_id }}"
```

An explicit generation must belong to the selected namespace and be readable
when the task starts. If `require_fresh: true`, the task fails when the chosen
generation is retired or older than the namespace freshness target. Keep the
default `false` for workflows where deterministic, last-known-good data is
preferable to an availability failure.

Attune retains a pinned retired generation while its workflow is nonterminal.
The workflow does not use the interactive cache API cursor, and it does not
fall back to a newer active generation if the selected snapshot cannot be read.

## Permissions

Native cache iteration is an executor-side read and requires `caches:read`.
It is independent of whether the child action itself calls the cache API.

For a same-action or same-pack cache, use the reserved `standard` ref:

```yaml
permission_set_refs:
  - standard
```

For a different owner or namespace, create a constrained named permission set:

```yaml
ref: salesforce.read_customer_cache
label: Read Salesforce Customer Cache
grants:
  - resource: caches
    actions: [read]
    constraints:
      owner_types: [pack]
      owner_refs: [salesforce]
      refs: [customers]
```

The named set must have been delegated to the parent workflow execution and
then selected by the task. In practice, put it on the workflow action's
`default_execution_permission_set_refs` or explicitly supply it when the
workflow execution is created, subject to the normal delegation checks.

```yaml
# actions/process_customers.yaml
ref: salesforce.process_customers
workflow_file: workflows/process_customers.workflow.yaml
default_execution_permission_set_refs:
  - salesforce.read_customer_cache
```

```yaml
# actions/workflows/process_customers.workflow.yaml
tasks:
  - name: process_customers
    action: salesforce.process_customer_batch
    permission_set_refs:
      - salesforce.read_customer_cache
    iterate_cache:
      owner_type: pack
      owner_ref: salesforce
      namespace: customers
    input:
      customers: "{{ item }}"
```

`standard` is read-only and limited to the child action/pack and containing
workflow action/pack. It does not grant cross-owner reads, cache refreshes, or
namespace changes. See [Permissions and RBAC](/administration/permissions-and-rbac/) for grant
constraints and delegation rules.

## Retries, failures, and recovery

Task `retry` applies to each materialized child batch. A retry reuses the same
rendered record or batch; it does not advance the cache position or reread a
different generation.

```yaml
retry:
  count: 3
  delay: 5
  backoff: exponential
  max_delay: 60
```

If a batch exhausts retries, Attune stops discovering new batches, waits for
already-running siblings to finish, then evaluates the task's failure
transition. Cache selection, permission, freshness, namespace, and snapshot
errors also take the normal failure path.

The executor persists the pinned generation and scan progress. A scheduler
restart or duplicate delivery resumes the same iteration without reprocessing
completed child batches. Requested child executions and synthetic empty/failure
completions are reconciled by the supervisor if a message publish was lost.

Use a normal failure transition to report or remediate errors without exposing
cache records:

```yaml
next:
  - when: "{{ failed() }}"
    do:
      - report_cache_processing_failure
```

## Monitoring progress

The execution detail page shows safe iteration progress while a workflow runs.
It includes task name, state, pinned generation ID, scanned and dispatched
counts, page size, batch size, concurrency, timestamps, and a bounded error
summary.

API clients can read the same safe summary:

```text
GET /api/v1/executions/{id}/workflow-cache-iterations
```

The endpoint follows normal execution visibility rules. It never returns cache
values, external IDs, internal scan cursors, or workflow secrets.

## Security and data handling

- Cache data is supplied only through explicitly configured task input.
- Do not publish `item` into workflow variables, action results, logs, audit
  details, or error messages unless that disclosure is intentional and allowed.
- Do not use Data Caches for credentials or other secret material. Use Keys and
  Secrets instead.
- Child actions need their own execution token permission refs only if they
  make additional calls to the cache API themselves.

## Related

- [Data Caches](/administration/data-caches/)
- [Writing Workflows](/pack-development/workflows/)
- [Permissions and RBAC](/administration/permissions-and-rbac/)
- [Supervisor Operations](/operations/supervisor/)
