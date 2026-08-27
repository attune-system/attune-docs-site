---
title: "Queue Administration"
description: "Work queues are durable business queues that dispatch queued items to actions. They are useful when work should be accepted independently from execution capacity or when processing"
sidebar:
  label: "Queue Administration"
  order: 10
---
Work queues are durable business queues that dispatch queued items to actions. They are useful when work should be accepted independently from execution capacity or when processing needs retry, batching, coalescing, or sequential dispatch.

![Queue detail page showing dispatch settings, schema, and action parameters](/screenshots/Queue-Administration.png)

## Queue definition

A queue stores:

- Ref, label, and ownership.
- Dispatch target action.
- Default priority.
- Batch mode and batch size.
- Concurrency and cooldown settings.
- Pending-item update policy.
- Reference visibility (`public`, `private`, or `restricted`).
- Retry limit.
- Item schema.
- Action parameter templates.

Pack-loaded queues live in `queues/*.yaml` and are declarative. Queues without a pack owner are ad hoc.

## Writing queues in YAML

Declarative queues are deployed with a pack, similar to other pack metadata. Put each queue definition in the pack's `queues/` directory:

```text
my_pack/
  pack.yaml
  actions/
    process_order.yaml
    process_order.py
  queues/
    orders.yaml
```

Queues are loaded after actions, so `dispatch_action` must reference an action that already exists in the same pack load or in the database. Pack-loaded queues are marked `is_adhoc = false`, owned by the pack, and updated in place on pack reload.

`dispatch_action` must also satisfy the target action's reference visibility. Same-pack queues may dispatch private or restricted actions. Cross-pack queues may dispatch public actions, or restricted actions whose allow-list includes the queue's pack. Ad-hoc queues without a pack owner can dispatch only public actions.

### Queue YAML fields

| Field | Required | Default | Meaning |
| --- | --- | --- | --- |
| `ref` | Yes | - | Fully-qualified queue ref, such as `orders.incoming`. |
| `label` | Yes | - | Human-readable name. Cannot be empty. |
| `description` | No | `null` | Optional description. Empty strings are rejected. |
| `enabled` | No | `true` | Whether the executor may dispatch items from this queue. |
| `accepting_new_items` | No | `true` | Whether enqueue requests are accepted. This is separate from dispatching. |
| `dispatch_action` | Yes | - | Fully-qualified action ref to execute for leased items. |
| `default_priority` | No | `0` | Priority stamped on new items when the enqueue request does not supply one. Higher priority leases first. |
| `allow_pending_update` | No | `false` | Whether queued/retry items may be updated before they are leased. |
| `update_strategy` | No | `replace` | Pending update behavior: `replace`, `merge_patch`, or `immutable`. |
| `batch_mode` | No | `single` | `single` leases one item per execution; `batch` leases multiple items per execution. |
| `item_schema` | No | `{}` | Flat schema used to validate item payloads on enqueue and pending updates. |
| `action_params` | No | `{}` | JSON object rendered into the dispatched execution's flat action parameters. |
| `config` | No | `{}` | Dispatch tuning, retry limits, coalescing, and ack-contract metadata. Unknown config keys are rejected. |
| `reference_visibility` | No | `public` | Which packs may target this queue for item submission: `public`, `private`, or `restricted`. |
| `reference_allowed_pack_refs` | No | `[]` | Additional pack refs allowed to target the queue when `reference_visibility: restricted`; the queue's own pack is always allowed. |

The parser rejects unknown top-level fields, so keep queue metadata limited to the supported fields above.

### Complete queue definition example

Minimal single-item queue:

```yaml
ref: orders.incoming
label: Incoming Orders
dispatch_action: orders.process_order
batch_mode: single
item_schema:
  order_id:
    type: string
    required: true
  total_cents:
    type: integer
    required: true
action_params:
  order: "{{ item }}"
  queue_item: "{{ queue_item }}"
config:
  dispatch:
    concurrency:
      source: literal
      value: 2
    retry_limit: 1
```

Full batch queue with coalescing:

```yaml
ref: orders.incoming
label: Incoming Orders
description: Queue orders from external systems and process them with a pack action.
enabled: true
accepting_new_items: true
reference_visibility: restricted
reference_allowed_pack_refs:
  - partner_pack
  - incident_response

dispatch_action: orders.process_order
default_priority: 10
allow_pending_update: true
update_strategy: merge_patch
batch_mode: batch

item_schema:
  order_id:
    type: string
    required: true
  customer_id:
    type: string
    required: true
  region:
    type: string
  total_cents:
    type: integer
    required: true

action_params:
  orders: "{{ items }}"
  queue_items: "{{ queue_items }}"
  queue:
    ref: "{{ queue.ref }}"
    batch_mode: "{{ queue.batch_mode }}"
    leased_item_count: "{{ queue.leased_item_count }}"
    ack_contract_version: "{{ queue.ack_contract_version }}"
  source: "{{ config.source_name }}"

config:
  dispatch:
    concurrency:
      source: pack_config
      path: queues.orders.concurrency
      fallback: 2
    batch_size:
      source: literal
      value: 25
    retry_limit: 2
    inter_execution_delay_seconds: 5
    coalescing:
      enabled: true
      group_by_path: region
      across_priorities: false
  ack_contract:
    version: 1
```

## Reference visibility and item permissions

Queue visibility controls which packs can discover or target a queue:

- `public`: any pack may target the queue.
- `private`: only the queue's own pack may target the queue.
- `restricted`: the queue's own pack and `reference_allowed_pack_refs` may target the queue.

Visibility is not a replacement for RBAC. Queue definitions use `queues:read/create/update/delete`; item operations use `queue_items:read/create/update/delete`. Direct API calls to private or restricted queues need a constrained `queue_items:*` grant, such as `refs`, `ids`, or `pack_refs`, or queue-management access. The `referencing_pack_ref` query parameter is for discovery only; item write endpoints use server-derived execution context or explicit grants.

Tunables can come from literals, pack config, or the key store:

```yaml
config:
  dispatch:
    concurrency:
      source: pack_config
      path: queues.orders.concurrency
      fallback: 2
    batch_size:
      source: keystore
      key_ref: orders.dispatch_limits
      path: batch_size
      fallback: 10
    retry_limit: 3
```

Use `batch_mode: single` when each queue item should become its own execution. In single mode, `action_params` can use:

```yaml
action_params:
  order: "{{ item }}"
  queue_item: "{{ queue_item }}"
```

Use `batch_mode: batch` when the action should receive multiple leased items at once. In batch mode, use `items` for just the payloads and `queue_items` when the action needs queue item IDs for acknowledgements.

## Item lifecycle

```text
queued/retry -> leased -> completed
                    -> failed
                    -> skipped
                    -> retry
```

`queued` and `retry` items are the mutable pending states; the API can edit or delete them before lease. The executor leases ready items by priority descending, then creation time, then ID.

## Dispatch parameters

Queue `action_params` are rendered with workflow-style templates. Available values include:

- `item`: single item payload.
- `items`: batch payload array.
- `queue_item`: metadata-rich single queue item for single-item dispatches.
- `queue_items`: metadata-rich leased item array.
- `queue`: queue metadata: `id`, `ref`, `batch_mode`, `leased_item_count`, and `ack_contract_version`.
- `config`: pack config from the queue's pack.

If `action_params` is empty, the dispatcher uses the default payload contract instead of injecting the metadata helpers above:

- Single mode: object payloads are passed through as the execution parameters; scalar/array payloads become `{ "item": <payload> }`.
- Batch mode: parameters become `{ "items": [<payload>, ...] }`.

## Ack contract

The dispatched action reports queue item outcomes in `execution.result.queue_ack`. The executor validates the ack and updates queue items and dispatch lineage. A completed queue-dispatched action should include one acknowledgement for every leased item:

```json
{
  "processed": 2,
  "queue_ack": {
    "version": 1,
    "items": [
      {
        "id": 1001,
        "status": "completed",
        "summary": {
          "message": "order accepted"
        }
      },
      {
        "id": 1002,
        "status": "retry",
        "error": {
          "message": "upstream timeout"
        }
      }
    ]
  }
}
```

Valid item statuses in `queue_ack.items[]` are `completed`, `retry`, `failed`, and `skipped`. The ack `version` must match `config.ack_contract.version`, which defaults to `1`.

If the execution config contains queue metadata, the completion listener also validates that metadata against the dispatch: `queue.id`, `queue.ref`, `queue.leased_item_count`, `queue.ack_contract_version`, and, when present, `queue.items[*].id` in leased order.

Use retry outcomes carefully. `config.dispatch.retry_limit` defaults to `0`; a requested `retry` outcome becomes `failed` when the queue item's `attempt_count` is greater than the configured retry limit.

Timeouts are also retry-relevant for queue dispatches. Queue-dispatched executions inherit the dispatch action's `timeout_seconds` default unless the creation path supplies a more specific execution timeout. If the dispatch execution reaches status `timeout` before returning a valid `queue_ack`, the completion listener treats leased items as retry candidates and then applies `config.dispatch.retry_limit`. With the default retry limit of `0`, a first timeout is promoted to failed; set a positive `retry_limit` when timed-out dispatches should be attempted again.

## Coalescing and cooldown

Queue config can coalesce pending items into batches by a payload path and can apply an inter-execution delay for sequential queues. Sequential cooldown is meaningful only when resolved concurrency is `1`.

## Lifecycle events

The core pack includes lifecycle triggers for queue activity:

| Trigger | Emitted when |
| --- | --- |
| `core.queue_started` | The executor successfully publishes the first dispatch for a queue whose latest lifecycle state was empty or unknown. |
| `core.queue_empty` | A queue-processing execution terminates, no active dispatches remain, and the queue has no queued/retry items left. |

These are normal Attune events, so rules can subscribe to them for notifications, metrics, or downstream automation. Payloads include queue id/ref, dispatch id, execution id, dispatch action ref, leased item count, and `observed_at`; `core.queue_empty` also reports the terminal dispatch status and the active/ready counts observed after finalization.

## Admin operations

- Enable/disable queue processing with `enabled`.
- Control new enqueues separately with `accepting_new_items`.
- Validate item payloads with `item_schema`.
- Inspect items with status filters such as pending (`queued`/`retry`), `leased`, and `failed`.
- Investigate mismatched executions from queue item details and execution results; dispatch lineage is maintained internally.
- Edit or delete only mutable pending items; terminal outcomes are set by the action `queue_ack`.

## Related

- [Monitoring and Troubleshooting](/operations/monitoring/)
- [API Reference](/reference/api/)
- [YAML Reference](/reference/yaml/)
