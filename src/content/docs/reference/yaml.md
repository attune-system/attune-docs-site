---
title: "YAML Reference"
description: "This page provides compact examples of Attune metadata YAML. Pack-installed metadata lives in a pack directory, including declarative rules/.yaml files for trigger-to-action automa"
sidebar:
  label: "YAML Reference"
  order: 5
---
This page provides compact examples of Attune metadata YAML. Pack-installed metadata lives in a pack directory, including declarative `rules/*.yaml` files for trigger-to-action automation.

![Workflow builder raw YAML view showing action YAML and workflow YAML](/screenshots/YAML-Reference.png)

## Pack layout

```text
my_pack/
  pack.yaml
  pack-icon.svg        # optional; svg/png/jpg/jpeg/ico supported
  permission_sets/
    executor.yaml
  runtimes/
    python.yaml
  triggers/
    item_seen.yaml
  actions/
    fetch.yaml
    fetch.py
    workflows/
      deploy.workflow.yaml
  dashboards/
    operations.yaml
  queues/
    items.yaml
  policies/
    concurrency.yaml
  rules/
    on_item_seen.yaml
  sensors/
    poller.yaml
    poller.py
  caches/
    items.yaml
```

The pack loader imports components in dependency order: permission sets, runtimes, triggers, actions/action-linked workflows, dashboards, queues, policies, rules, sensors, cache namespaces, then cleanup.

Pack icons are configured as files at the pack root, not as fields in `pack.yaml`. Attune looks for `pack-icon.svg`, `pack-icon.png`, `pack-icon.jpg`, `pack-icon.jpeg`, then `pack-icon.ico` in that order and serves the first match from `GET /api/v1/packs/{ref}/icon`. The web client uses that URL automatically for pack-owned actions, triggers, sensors, rules, events, enforcements, executions, queues, and workflow builder nodes; missing or failed icons fall back to a gear glyph.

## Enabled flag semantics

Pack-deployed actions, triggers, sensors, rules, and queues all support an optional `enabled` boolean in their YAML metadata.

| YAML state | New metadata record | Existing metadata record on pack reload |
| --- | --- | --- |
| `enabled: true` | Created enabled | Updated to enabled |
| `enabled: false` | Created disabled | Updated to disabled |
| Field omitted | Created enabled | Existing enabled state is preserved |

This lets packs ship components enabled by default while still allowing operators to disable a component and safely reload or reinstall a pack without the omission of `enabled` re-enabling it. For work queues, `accepting_new_items` follows the same reload rule: an omitted field defaults to `true` on create and preserves the current value on update.

Operationally, disabled components are respected by their owning subsystem: disabled triggers reject new event creation, disabled rules are skipped, disabled sensors are stopped/not run, disabled queues are not dispatched, and disabled actions cannot be manually executed or scheduled by the executor.

## Pack manifest

`pack.yaml`:

```yaml
ref: my_pack
label: My Pack
description: Example automation pack
version: 0.1.0
author: Automation Team
email: automation@example.com
enabled: true
tags:
  - examples
  - operations

conf_schema:
  base_url:
    type: string
    description: External API base URL.
    required: true
  default_timeout_seconds:
    type: integer
    default: 30
    minimum: 1
    maximum: 300

config:
  default_timeout_seconds: 30

runtime_deps:
  - python
  - shell

meta:
  category: operations
  repository_url: https://git.example.com/automation/my_pack
  documentation_url: https://docs.example.com/my_pack
```

Use `conf_schema` and `config` for non-secret settings. Deploy secrets as keys outside the pack.

Canonical manifest fields are `label`, `conf_schema`, `meta`, and `tags`. Legacy `name`, `config_schema`, `metadata`, and `keywords` are accepted as fallbacks only when their canonical field is absent. If both forms are present, the canonical value takes precedence and differing values produce a conflict diagnostic; mirrored pairs are not required. `runtime_deps` is persisted inventory metadata, so verify runtime availability separately rather than treating it as complete install preflight.

## Permission set

`permission_sets/executor.yaml`:

```yaml
ref: my_pack.executor
label: My Pack Executor
description: Read and execute selected automation from my_pack.
grants:
  - resource: packs
    actions: [read]
    constraints:
      pack_refs: [my_pack]
  - resource: actions
    actions: [read, execute]
    constraints:
      pack_refs: [my_pack]
  - resource: artifacts
    actions: [read]
    constraints:
      pack_refs: [my_pack]
      visibility: [public]
```

Constrained execution permission set:

```yaml
ref: my_pack.agent_limited_tools
label: My Pack Agent Limited Tools
description: Delegate only selected API access to execution-scoped agents.
grants:
  - resource: actions
    actions: [read, execute]
    constraints:
      refs:
        - my_pack.safe_lookup
        - my_pack.create_ticket
  - resource: keys
    actions: [read, decrypt]
    constraints:
      owner_types: [pack]
      owner_refs: [my_pack]
      refs: [my_pack.api_credentials]
      encrypted: true
  - resource: artifacts
    actions: [read, create, update]
    constraints:
      pack_refs: [my_pack]
      owner_types: [pack, action]
      owner_refs: [my_pack, my_pack.agent_triage]
```

Supported grant resources include `packs`, `actions`, `queues`, `queue_items`, `rules`, `triggers`, `executions`, `events`, `enforcements`, `inquiries`, `keys`, `artifacts`, `runtimes`, `workers`, `identities`, `permissions`, and `audit_log`.

## Runtime

For a field-by-field runtime authoring reference, see [Runtime Authoring Guide](/pack-development/runtime-authoring/). For runtime lifecycle and worker behavior, see [Runtime Environments](/pack-development/runtime-environments/).

Native runtime:

```yaml
ref: my_pack.native
name: Native
aliases: [native, builtin, standalone]
description: Execute compiled binaries directly.
distributions:
  verification:
    always_available: true
    check_required: false
execution_config: {}
```

Interpreted runtime with versions:

```yaml
ref: my_pack.python
name: Python
aliases: [python, python3]
description: Python runtime with isolated per-pack virtualenvs.
distributions:
  verification:
    commands:
      - binary: python3
        args: ["--version"]
        exit_code: 0
        pattern: "Python 3\\."
        priority: 1
execution_config:
  interpreter:
    binary: python3
    args: ["-u"]
    file_extension: ".py"
  environment:
    env_type: virtualenv
    create_command: [python3, -m, venv, --copies, "{env_dir}"]
    interpreter_path: "{env_dir}/bin/python3"
  dependencies:
    manifest_file: requirements.txt
    install_command: ["{interpreter}", -m, pip, install, -r, "{manifest_path}"]
  env_vars:
    PYTHONPATH:
      operation: prepend
      value: "{pack_dir}/lib"
      separator: ":"
versions:
  - version: "3.12"
    is_default: true
    distributions:
      verification:
        commands:
          - binary: python3.12
            args: ["--version"]
            exit_code: 0
            pattern: "Python 3\\.12\\."
            priority: 1
    execution_config:
      interpreter:
        binary: python3.12
        args: ["-u"]
        file_extension: ".py"
      environment:
        env_type: virtualenv
        create_command: [python3.12, -m, venv, --copies, "{env_dir}"]
        interpreter_path: "{env_dir}/bin/python3.12"
      dependencies:
        manifest_file: requirements.txt
        install_command: ["{interpreter}", -m, pip, install, -r, "{manifest_path}"]
```

## Trigger

Payload-only trigger:

```yaml
ref: my_pack.item_seen
label: Item Seen
description: Item was detected.
enabled: true
output:
  item_id:
    type: string
    required: true
  source:
    type: string
```

Configurable trigger:

```yaml
ref: my_pack.ticket_poll
label: Ticket Poll
description: Poll an external ticket system.
enabled: true
parameters:
  query:
    type: string
    required: true
  interval_seconds:
    type: integer
    default: 60
    minimum: 5
output:
  ticket_id:
    type: string
    required: true
  priority:
    type: string
  status:
    type: string
```

## Action

Normal action:

```yaml
ref: my_pack.fetch
label: Fetch
description: Fetch a resource
enabled: true
runner_type: python
runtime_version: ">=3.12"
entry_point: fetch.py
parameter_delivery: stdin
parameter_format: json
output_format: json
timeout_seconds: 300
log_retention_policy: versions
log_retention_limit: 4
parameters:
  url:
    type: string
    required: true
  timeout_seconds:
    type: integer
    default: 30
  token:
    type: string
    secret: true
output:
  status:
    type: integer
  body:
    type: string
```

Trigger schemas can also mark event fields as secret. Event ingress and webhook ingress redact those fields before storing the event:

```yaml
ref: demo.external_alert
label: External Alert
parameters:
  service:
    type: string
  api_key:
    type: string
    secret: true
```

Rules may map a secret event field only into an action parameter that is also marked `secret: true`. Mapping a secret source into a non-secret action parameter is rejected so secret material does not leak into readable enforcement or execution config.

`timeout_seconds` is an action-level default execution timeout in seconds. It must be positive when set. When an execution is created, Attune snapshots the resolved timeout onto `execution.timeout_seconds` using this order: explicit execution override, workflow task `timeout`, action `timeout_seconds`, then platform `default_execution_timeout_seconds`.

Action reference visibility controls which packs may call an action from rules, workflow tasks, and queues. Omitted `reference_visibility` defaults to `public`.

| `reference_visibility` | Meaning |
| --- | --- |
| `public` | Any pack, plus ad-hoc metadata with no pack context, may reference the action. |
| `private` | Only the action's owning pack may reference it. |
| `restricted` | The owning pack and packs listed in `reference_allowed_pack_refs` may reference it. |

Example:

```yaml
reference_visibility: restricted
reference_allowed_pack_refs:
  - incidents
  - deployments
```

Trigger reference visibility controls which packs may subscribe to a trigger from rules. Omitted `reference_visibility` defaults to `public`.

| `reference_visibility` | Meaning |
| --- | --- |
| `public` | Rules from any pack may subscribe to the trigger. |
| `private` | Only rules in the trigger's owning pack may subscribe to it. |
| `restricted` | Rules in the owning pack and packs listed in `reference_allowed_pack_refs` may subscribe to it. |

Example trigger:

```yaml
ref: shared_alerts.alert_created
label: Alert Created
reference_visibility: restricted
reference_allowed_pack_refs:
  - incidents
  - notifications
parameters: {}
output:
  alert_id:
    type: string
```

Action with execution API access and worker placement:

```yaml
ref: my_pack.agent_triage
label: Agent Triage
enabled: true
runner_type: shell
entry_point: agent_triage.sh
parameter_delivery: stdin
parameter_format: json
output_format: json
accesses_mcp: true
timeout_seconds: 900
reference_visibility: private
default_execution_permission_set_refs:
  - standard
  - my_pack.agent_limited_tools
log_retention_policy: versions
log_retention_limit: 4
required_worker_runtimes:
  node: ">=20"
worker_selector:
  pool: agent
worker_tolerations:
  - key: gpu
    operator: exists
    effect: no_schedule
worker_affinity:
  preferred:
    - weight: 50
      preference:
        match_labels:
          disk: ssd
parameters:
  incident_id:
    type: string
    required: true
output:
  summary:
    type: string
```

## Workflow action

Action wrapper at `actions/deploy.yaml`:

```yaml
ref: my_pack.deploy
label: Deploy
description: Deployment workflow
enabled: true
workflow_file: workflows/deploy.workflow.yaml
default_execution_permission_set_refs:
  - standard
parameters:
  service:
    type: string
    required: true
output:
  status:
    type: string
  deployment_id:
    type: string
tags:
  - deployment
```

Graph file at `actions/workflows/deploy.workflow.yaml`:

```yaml
version: "1.0"
vars:
  deployment_id: null
tasks:
  - name: start
    action: core.echo
    input:
      message: "Deploying {{ parameters.service }}"
    next:
      - when: "{{ succeeded() }}"
        publish:
          - deployment_id: "{{ result().message }}"
        do:
          - verify
  - name: verify
    action: my_pack.fetch
    permission_set_refs:
      - standard
    input:
      url: "{{ config.base_url }}/deployments/{{ workflow.deployment_id }}"
    retry:
      count: 3
      delay: 5
      backoff: exponential
    timeout: 120
output_map:
  status: complete
  deployment_id: "{{ workflow.deployment_id }}"
```

Workflow task `timeout` is a per-child-execution override in seconds. Timeouts are terminal execution status `timeout`, can be matched with `timed_out()` transitions, and qualify for task retry when a `retry` block has attempts remaining.

For a generation-pinned, lazily streamed cache dataset task, use
[`iterate_cache`](/pack-development/cache-iteration/) rather than `with_items`:

```yaml
- name: process_cached_users
  action: my_pack.process_users
  iterate_cache:
    owner_type: pack
    owner_ref: my_pack
    namespace: users
    generation: active
    page_size: 100
    require_fresh: false
  batch_size: 25
  concurrency: 4
  permission_set_refs: [standard]
  input:
    users: "{{ item }}"
    batch_number: "{{ index }}"
```

With `batch_size: 1`, `item` is one cache entry. With a larger batch size, it
is an array of entries. See [Iterating Data Caches in Workflows](/pack-development/cache-iteration/)
for the entry shape, generation semantics, and cross-owner permission setup.

Workflow task `action` refs are validated against the target action's `reference_visibility`. Cross-pack tasks can call only public actions or restricted actions whose `reference_allowed_pack_refs` includes the workflow action's pack.

Rule `trigger_ref` values are validated against the target trigger's `reference_visibility`. Cross-pack rules can subscribe only to public triggers or restricted triggers whose `reference_allowed_pack_refs` includes the rule's pack.

Queue visibility uses the same `public`/`private`/`restricted` model. Cross-pack queue producers can target public queues or restricted queues whose `reference_allowed_pack_refs` includes the producer pack; private queues are same-pack only. Queue definition permissions use `queues:*`, while item operations use `queue_items:*`.

## Dashboard

Pack-managed dashboard at `dashboards/operations.yaml`:

```yaml
version: 1
kind: dashboard
ref: operations
label: Operations
description: Operational overview for this pack.
scope_type: pack
scope_ref: my_pack
visibility: public
enabled: true
is_default_home: false
spec_version: 1
defaults:
  timezone: UTC
  refresh_seconds: 15
  time_window: 24h
layout:
  columns: 12
  row_height: 44
  gap: 12
  breakpoints:
    lg:
      min_width: 1280
      columns: 12
    sm:
      min_width: 0
      columns: 4
filters:
  - id: pack_ref
    type: pack_ref
    label: Pack
    default: my_pack
data_sources:
  execution_status:
    type: execution_status_breakdown
    params:
      pack_ref: "{{ filters.pack_ref }}"
cards:
  - id: execution_status
    title: Execution Status
    source: execution_status
    visualization:
      type: table
    position:
      lg: { x: 0, y: 0, w: 6, h: 6 }
      sm: { x: 0, y: 0, w: 4, h: 6 }
```

Dashboard source params can reference declared filters with `{{ filters.<id> }}` templates.

## Queue

Single-item queue:

```yaml
ref: my_pack.items
label: Item Queue
enabled: true
accepting_new_items: true
reference_visibility: restricted
reference_allowed_pack_refs:
  - partner_pack
dispatch_action: my_pack.process_item
batch_mode: single
default_priority: 0
allow_pending_update: true
update_strategy: merge_patch
item_schema:
  item_id:
    type: string
    required: true
action_params:
  item: "{{ item }}"
  queue_item: "{{ queue_item }}"
config:
  dispatch:
    concurrency:
      source: literal
      value: 2
    retry_limit: 1
  ack_contract:
    version: 1
```

Batch queue with coalescing and tunables:

```yaml
ref: my_pack.order_batches
label: Order Batches
dispatch_action: my_pack.process_orders
batch_mode: batch
default_priority: 50
item_schema:
  order_id:
    type: string
    required: true
  region:
    type: string
action_params:
  orders: "{{ items }}"
  queue_items: "{{ queue_items }}"
  queue:
    ref: "{{ queue.ref }}"
    leased_item_count: "{{ queue.leased_item_count }}"
    ack_contract_version: "{{ queue.ack_contract_version }}"
config:
  dispatch:
    concurrency:
      source: pack_config
      path: queues.orders.concurrency
      fallback: 2
    batch_size:
      source: keystore
      key_ref: my_pack.dispatch_limits
      path: batch_size
      fallback: 10
    retry_limit: 2
    coalescing:
      enabled: true
      group_by_path: region
      across_priorities: false
  ack_contract:
    version: 1
```

Queue-dispatched executions use the dispatch action's timeout default unless the execution creation path supplies a more specific override. If a queue dispatch times out before returning a valid `queue_ack`, leased items are treated as retry candidates and then capped by `config.dispatch.retry_limit`. The default retry limit is `0`, so configure a positive value when timeout retry is desired.

Queue `dispatch_action` refs are also validated against action reference visibility. Pack-owned queues use their queue pack as the referencing pack; ad-hoc queues can dispatch only public actions.

## Sensor

Python sensor:

```yaml
ref: my_pack.poller
label: Poller
description: Poll external API
enabled: true
runner_type: python
runtime_version: ">=3.12"
entry_point: poller.py
trigger_type: my_pack.item_seen
log_retention_policy: versions
log_retention_limit: 4
worker_selector:
  location: edge-site-nyc
worker_tolerations:
  - key: dedicated
    operator: equal
    value: sensors
    effect: no_schedule
worker_affinity:
  preferred:
    - weight: 50
      preference:
        match_labels:
          network: internal
parameters:
  check_interval_seconds:
    type: integer
    default: 30
config:
  page_size: 100
```

Native multi-trigger sensor:

```yaml
ref: my_pack.ticket_sensor
label: Ticket Sensor
enabled: true
runner_type: native
entry_point: my-pack-ticket-sensor
trigger_types:
  - my_pack.ticket_created
  - my_pack.ticket_updated
parameters:
  check_interval_seconds:
    type: integer
    default: 10
poll_interval: 10
meta:
  owner: sre
```

Sensor placement fields use the same shape as action placement fields, but they match sensor-worker `sensor.labels` and `sensor.taints`.

## Rule

`rules/on_item_seen.yaml`:

Rules can be deployed with a pack under `rules/*.yaml`. Pack-loaded rules are non-ad-hoc and are reconciled on pack reload.

```yaml
ref: my_pack.on_item_seen
label: On Item Seen
description: Run fetch when an item event arrives.
trigger_ref: my_pack.item_seen
action_ref: my_pack.fetch
enabled: true
conditions:
  expression: "{{ event.payload.source == \"external\" }}"
trigger_params: {}
trace_tag_template: "item.{{ event.payload.item_id }}"
permission_set_refs: []
action_params:
  url: "{{ pack.config.base_url }}/items/{{ event.payload.item_id }}"
```

Rule with trigger configuration:

```yaml
ref: my_pack.poll_high_priority_tickets
label: Poll High Priority Tickets
trigger_ref: my_pack.ticket_poll
action_ref: my_pack.agent_triage
enabled: true
trigger_params:
  query: "priority:high"
  interval_seconds: 30
conditions:
  - field: priority
    operator: contains
    value: high
action_params:
  incident_id: "{{ event.payload.ticket_id }}"
  prompt: "Triage ticket {{ event.payload.ticket_id }}"
```

## Flat schema reminder

Use:

```yaml
parameters:
  url:
    type: string
    required: true
```

Not:

```yaml
parameters:
  type: object
  properties:
    url:
      type: string
  required:
    - url
```

## Related

- [Pack Developer Guide](/pack-development/overview/)
- [Writing Actions](/pack-development/actions/)
- [Writing Dashboards](/pack-development/dashboards/)
- [Writing Sensors](/pack-development/sensors/)
- [Writing and Managing Rules](/pack-development/rules/)
- [Writing Workflows](/pack-development/workflows/)
- [Iterating Data Caches in Workflows](/pack-development/cache-iteration/)
- [Queue Administration](/administration/queues/)
- [Permissions and RBAC](/administration/permissions-and-rbac/)
