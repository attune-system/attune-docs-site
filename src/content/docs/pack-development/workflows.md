---
title: "Writing Workflows"
description: "Workflows compose actions into a graph with transitions, publish directives, retries, concurrency, and human-in-the-loop inquiries."
sidebar:
  label: "Writing Workflows"
  order: 6
---
Workflows compose actions into a graph with transitions, publish directives, retries, concurrency, and human-in-the-loop inquiries.

![Workflow builder visual graph with action palette and transitions](/screenshots/Writing-Workflows.png)

## File model

Workflow actions use companion files:

```text
actions/deploy.yaml
actions/workflows/deploy.workflow.yaml
```

`actions/deploy.yaml` contains action-level metadata:

```yaml
ref: my_pack.deploy
label: Deploy
description: Deploy an application
enabled: true
workflow_file: workflows/deploy.workflow.yaml
parameters:
  service:
    type: string
    required: true
default_execution_permission_set_refs:
  - standard
```

`actions/workflows/deploy.workflow.yaml` contains graph-only workflow data:

```yaml
version: "1.0"
vars:
  attempts: 0
tasks:
  - name: start
    action: core.echo
    input:
      message: "Deploying {{ parameters.service }}"
    next:
      - when: "{{ succeeded() }}"
        do:
          - finish
  - name: finish
    action: core.echo
    input:
      message: "Done"
output_map:
  service: "{{ parameters.service }}"
  status: "complete"
```

Do not duplicate action metadata inside the graph file.

The deployable workflow pair is:

1. `actions/<name>.yaml`: action-level metadata (`ref`, `label`, `parameters`, `output`, `tags`, `workflow_file`).
2. `actions/workflows/<name>.workflow.yaml`: graph-only metadata (`version`, `vars`, `tasks`, `output_map`, `cancellation_policy`).

Multiple action YAML files may reference the same workflow graph when they need different labels, parameter schemas, defaults, or token access policies.

## Tasks

Tasks are action invocations. Define them under `tasks` as a list; each item has `name`.

Canonical task fields:

| Field | Meaning |
| --- | --- |
| `name` | Required unique task name within the workflow. Transition targets and `task.<name>` lookups use this value. |
| `action` | Action ref to execute, such as `core.echo` or `my_pack.deploy`. Workflow actions are actions too, so this can target another workflow action. |
| `input` | Flat JSON/YAML object passed as the child execution config. Values can use templates and pure `{{ ... }}` expressions preserve JSON types. |
| `permission_set_refs` | Optional execution-token permission refs for this child execution. Use a string, array of strings, or template resolving to either. Omit it to use the target action defaults; explicit null/empty disables token issuance. `standard` grants scoped key, artifact, and cache reads for the child and containing workflow action/pack. The singular alias `permission_set_ref` is also accepted. |
| `next` | Ordered transition list evaluated when the task reaches a terminal result. Each transition can include `when`, `publish`, and `do`. |
| `retry` | Retry policy for failed or timed-out child executions. Contains `count`, `delay`, `backoff`, optional `max_delay`, and optional `on_error`. `on_error` is parsed and preserved, but the current scheduler retries based on failed/timeout status and remaining retry count rather than evaluating `on_error`. |
| `timeout` | Maximum runtime in seconds for the child execution. Must be positive when set. Timeout transitions can use `timed_out()`. |
| `with_items` | Expression used for item expansion. Arrays expand into child executions; it cannot be combined with `iterate_cache`. |
| `iterate_cache` | Native bounded iteration over a generation-pinned Data Cache. It is supported by action tasks and cannot be combined with `with_items`. See [Iterating Data Caches in Workflows](/pack-development/cache-iteration/). |
| `batch_size` | Optional positive batch size for `with_items` or `iterate_cache`. A batch is supplied as the `item` array; omit it or set `1` for one item per child. |
| `concurrency` | Maximum number of item or cache-batch children in flight. Defaults to serial execution when omitted. |
| `join` | Join barrier count. The task waits for that many inbound predecessor completions before running. |
| `worker_selector` | Optional worker-label selector override for the child execution. Omit to inherit the action default; use `{}` to clear. |
| `worker_tolerations` | Optional worker taint toleration override. Omit to inherit the action default; use `[]` to clear. |
| `worker_affinity` | Optional worker affinity or anti-affinity override. Omit to inherit the action default; use `{}` to clear. |
| `__chart_meta__` | Visual-builder metadata such as canvas position. The backend preserves it but does not use it for execution behavior. |

The UI model does not use task `type` or task-level `when`; conditions belong on transitions.

Task `action` refs must satisfy the target action's reference visibility. A workflow action may call private or restricted actions in its own pack. Cross-pack calls are allowed only when the target action is public or restricted and the workflow action's pack is in the target action's allow-list.

Legacy fields `on_success`, `on_failure`, `on_complete`, `on_timeout`, `decision`, and task-level `publish` are parsed for older workflow files and normalized into `next`. New workflows should use `next` directly.

## Transitions

Use Orquesta-style `next` transitions:

```yaml
next:
  - when: "{{ succeeded() and result().code == 200 }}"
    publish:
      - deployment_id: "{{ result().deployment_id }}"
    do:
      - verify
  - when: "{{ failed() }}"
    do:
      - rollback
```

Omitting `when` makes the transition unconditional.

The complete `when` expression is evaluated. Status helpers can be combined with result predicates, for example `{{ succeeded() and result().code == 200 }}`; every term must match.

Transitions are all-match, not first-match: every matching transition can publish and schedule its targets, regardless of list order. Make predicates mutually exclusive and avoid an unconditional transition alongside another branch unless both paths should run.

## Expression namespaces

Use canonical namespaces:

| Namespace | Example | Meaning |
| --- | --- | --- |
| `parameters` | `{{ parameters.service }}` | Immutable workflow input parameters from the parent workflow action execution. Defaults from the workflow action parameter schema are applied before task rendering. |
| `workflow` | `{{ workflow.deployment_id }}` | Mutable workflow-scoped variables. Initial values come from the graph file's `vars`; transition `publish` directives update this namespace and persist values to the workflow execution record. |
| `task` | `{{ task.start.id }}` | Completed task results keyed by task name. Structured action data is available under `task.fetch.data.items` and is also flattened as `task.fetch.items` when it does not collide with metadata. Do not add an extra `.result` segment. |
| `config` | `{{ config.base_url }}` | Read-only pack configuration namespace supported by the renderer. In the current workflow scheduler this namespace is not populated and resolves to `null`; when a renderer provides pack config, use normal object access such as `config.api.url` or bracket access for unusual key names. |
| `keystore` | `{{ keystore.api_token }}` | Read-only decrypted key namespace supported by the renderer. In the current workflow scheduler this namespace is not populated and resolves to `null`; when a renderer provides key values, structured keys preserve JSON type and can be accessed with paths such as `keystore.db.password`. |
| `item` | `{{ item.name }}` | Current element for a `with_items` child or the current cache entry/batch for an `iterate_cache` child. |
| `index` | `{{ index }}` | Zero-based item or batch index while rendering an itemized task. |
| `system` | `{{ system.workflow_start }}` | System-provided workflow context values. Currently the supported property is `workflow_start`, the timestamp captured when the workflow context is created or rebuilt. |

Aliases such as `vars`, `variables`, and `tasks` exist for compatibility, but new workflows should use canonical names.

`result()` is the normalized result for the task whose transition is currently being evaluated. Parsed structured output remains under `result().data`; non-conflicting fields in `data` are also exposed as top-level aliases. Use `result().summary` or `result().data.summary`, and `task.<task_name>.summary` or `task.<task_name>.data.summary` for a prior task. Metadata fields win if names collide.

## Template operators

Workflow templates use the expression engine inside `{{ ... }}`. Supported operators:

| Operator | Meaning |
| --- | --- |
| `or`, `and`, `not` | Boolean logic with short-circuiting for `and` and `or`. |
| `==`, `!=` | Deep equality/inequality for JSON values. Integer/float cross-comparison is allowed, so `3 == 3.0` is true. |
| `<`, `>`, `<=`, `>=` | Ordering for numbers and strings. |
| `in` | Membership test: item in array, key in object, or substring in string. |
| `+` | Numeric addition, string concatenation, or array concatenation. |
| `-`, `*`, `/`, `%` | Numeric subtraction, multiplication, division, and modulo. Unary `-` negates numbers. |
| `.field` | Object field access, such as `parameters.service`. |
| `[index]` | Array index access. Negative indexes count from the end. |
| `["key"]` | Object bracket access for keys that are not convenient dot identifiers. |
| `(args)` | Function call syntax. |

Truthiness is Python-like: `null`, `false`, `0`, `""`, `[]`, and `{}` are false; other values are true. There is no broad implicit type coercion in operators; use conversion functions when needed.

## Template functions

Built-in functions:

| Category | Functions |
| --- | --- |
| Type conversion | `string(v)`, `number(v)`, `int(v)`, `bool(v)` |
| Introspection | `type_of(v)`, `length(v)`, `keys(obj)`, `values(obj)` |
| Math | `abs(n)`, `floor(n)`, `ceil(n)`, `round(n)`, `min(a, b)`, `max(a, b)`, `sum(arr)` |
| String | `lower(s)`, `upper(s)`, `trim(s)`, `split(s, sep)`, `join(arr, sep)`, `replace(s, old, new)`, `starts_with(s, prefix)`, `ends_with(s, suffix)`, `match(pattern, s)` |
| Collection | `contains(haystack, needle)`, `reversed(v)`, `sort(arr)`, `unique(arr)`, `flat(arr)`, `zip(a, b)`, `range(n)`, `range(start, end)`, `slice(v, start)`, `slice(v, start, end)`, `index_of(haystack, needle)`, `count(haystack, needle)`, `merge(obj_a, obj_b)`, `chunks(arr, size)` |
| Workflow | `result()`, `succeeded()`, `failed()`, `timed_out()` |

Workflow functions are evaluated relative to the just-completed task while processing its transitions. `succeeded()`, `failed()`, and `timed_out()` return booleans; `result()` returns the task result JSON or `null` if there is no current result.

## Type-preserving templates

A pure template preserves JSON type:

```yaml
input:
  body: "{{ item }}"
  count: "{{ length(workflow.items) }}"
```

If `item` is an object, `body` remains an object. Mixed strings remain strings:

```yaml
message: "Processing {{ item.name }}"
```

## Publish directives

Publish values can be strings, booleans, numbers, arrays, objects, or null:

```yaml
publish:
  - validated: true
  - count: "{{ length(result().items) }}"
  - details: "{{ result().details }}"
```

Published values are persisted in `workflow_execution.variables` and available through `workflow.*`.

## with_items

Use `with_items` to run a task over a value, usually an array:

```yaml
tasks:
  - name: process_each
    action: my_pack.process
    with_items: "{{ parameters.items }}"
    concurrency: 3
    input:
      item: "{{ item }}"
      index: "{{ index }}"
```

Arrays create one child execution row per element. Non-array values are wrapped as a single item. All child execution rows are created up front. Only `concurrency` items are published initially; the executor publishes more as running items finish.

An empty array completes the `with_items` task successfully with `{"succeeded": true, "items": []}` and evaluates its successor transitions without creating child executions.

When `batch_size` is greater than `1`, consecutive values are supplied as an
array in `item`; `index` is the batch number. For large persisted datasets, use
[Iterating Data Caches in Workflows](/pack-development/cache-iteration/) rather
than first materializing a cache into workflow context.

## Cancellation policy

Set graph-level `cancellation_policy` to `allow_finish` (default) to stop pending dispatch while allowing running children to finish, or `cancel_running` to cancel running and pending children. Visual-builder/API save and load paths preserve either value.

## Failure handling and terminal results

Taking a failure or timeout transition handles the source task failure: the workflow can still complete successfully if the handler path succeeds. Initialize every variable used by `output_map`, publish a documented value on every terminal path, and explicitly fail a terminal handler when the parent workflow must remain failed. A rollback or notification task that exits successfully does not by itself preserve the original failed status.

Ordinary workflow children, inherited action defaults, and native cache iteration enforce the same delegation rule: every named child permission ref must be present in the parent execution's delegated refs. An undelegated ref fails the task. `standard` remains a reserved scoped ref, and explicit null/empty refs disable child token issuance.

## Retries and timeouts

```yaml
tasks:
  - name: call_api
    action: my_pack.fetch
    input:
      url: "{{ parameters.url }}"
    retry:
      count: 3
      delay: 5
      backoff: exponential
      max_delay: 60
    timeout: 300
    next:
      - when: "{{ timed_out() }}"
        do:
          - escalate
      - when: "{{ failed() }}"
        do:
          - rollback
      - when: "{{ succeeded() }}"
        do:
          - continue
```

Task `timeout` overrides the target action's default timeout for that child execution. If omitted, the child execution snapshots the target action's `timeout_seconds`, or the platform `default_execution_timeout_seconds` when the action has no default. The snapshot is stored on `execution.timeout_seconds`, so later changes to action or platform defaults do not change already-created workflow children.

When a task reaches its timeout, the worker terminates the action process and marks the child execution `timeout`. `timed_out()` transitions match only that status; `failed()` matches non-timeout failures.

Retries create new child executions preserving workflow lineage, original execution references, and the same snapshotted timeout. Timeouts qualify for workflow task retry when a `retry` block is present and attempts remain.

## Inquiries

Use `core.ask` for human-in-the-loop steps. The scheduler creates an inquiry and pauses that child execution until the assignee responds or the inquiry times out.

Transition on response with complementary approval and rejection predicates. Keep action failure and timeout separate:

```yaml
next:
  - when: "{{ succeeded() and result().response.approved == true }}"
    do:
      - continue
  - when: "{{ succeeded() and result().response.approved != true }}"
    do:
      - rejected
  - when: "{{ failed() }}"
    do:
      - approval_failed
  - when: "{{ timed_out() }}"
    do:
      - approval_timed_out
```

Because transitions are all-match, the two successful response predicates are deliberately mutually exclusive. Neither can overlap the separate failure or timeout branches.

## Related

- [Using Pack Actions in Workflows](/pack-development/composing-actions/)
- [Iterating Data Caches in Workflows](/pack-development/cache-iteration/)
- [Data Caches](/administration/data-caches/)
- [Permissions and RBAC](/administration/permissions-and-rbac/)
- [YAML Reference](/reference/yaml/)
