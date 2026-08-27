---
title: "Writing Sensors"
description: "Sensors monitor external systems or internal schedules and emit Attune events. Rules consume those events and request executions."
sidebar:
  label: "Writing Sensors"
  order: 4
---
Sensors monitor external systems or internal schedules and emit Attune events. Rules consume those events and request executions.

![Sensor detail page showing ref, pack, entrypoint, and status](/screenshots/Writing-Sensors.png)

## Sensor files

Typical pack layout:

```text
triggers/ticket_created.yaml
sensors/ticket_poller.yaml
sensors/ticket_poller.py
```

The trigger defines payload shape. The sensor implementation emits payloads matching that shape.

## Trigger definition

Triggers are deployable metadata under `triggers/*.yaml`. A minimal payload-only trigger looks like this:

```yaml
ref: my_pack.ticket_created
label: Ticket Created
description: Emitted when a new ticket is found
output:
  ticket_id:
    type: string
    required: true
  priority:
    type: string
```

Use flat schema format.

A configurable trigger declares `parameters` for each trigger instance and `output` for the event payload emitted by the sensor:

```yaml
ref: my_pack.ticket_poll
label: Ticket Poll
description: Periodic ticket polling trigger.
enabled: true
parameters:
  query:
    type: string
    description: Search query to poll.
    required: true
  interval_seconds:
    type: integer
    description: Polling interval for this rule/trigger instance.
    default: 60
    minimum: 5
output:
  ticket_id:
    type: string
    required: true
  status:
    type: string
  priority:
    type: string
  source:
    type: string
    default: ticket-system
tags:
  - tickets
  - polling
```

## Sensor metadata

Sensors are deployable metadata under `sensors/*.yaml`. Use `trigger_type` for one emitted trigger or `trigger_types` for several.

```yaml
ref: my_pack.ticket_poller
label: Ticket Poller
description: Polls the ticket API
enabled: true
runner_type: python
runtime_version: ">=3.12"
entry_point: ticket_poller.py
trigger_type: my_pack.ticket_created
parameters:
  check_interval_seconds:
    type: integer
    default: 30
    minimum: 1
config:
  page_size: 100

# Optional log artifact retention override.
log_retention_policy: versions
log_retention_limit: 4
```

Persisted sensor `config` is not a general runtime parameter channel in affected versions and is not injected into the child process. Put per-rule settings in `trigger_params`, or read required shared values from an explicitly authorized source. Do not place secrets in plain environment variables.

Native sensors can use compiled binaries. Python/Node/shell sensors use runtime definitions and runtime environments like actions.

Sensors may also declare placement constraints so they only run on suitable sensor workers:

```yaml
worker_selector:
  location: edge-site-nyc
worker_tolerations:
  - key: dedicated
    operator: equal
    value: sensors
    effect: no_schedule
worker_affinity:
  required:
    - match_labels:
        network: internal
```

Sensor workers advertise matching labels and taints through `sensor.labels` and `sensor.taints` configuration.

`worker_selector`, required affinity, anti-affinity, and tolerations constrain eligibility. Preferred affinity is currently stored but is not used to score sensor placement, so do not rely on it to choose among eligible sensor workers.

Multi-trigger native sensor example:

```yaml
ref: my_pack.ticket_sensor
label: Ticket Sensor
description: Emits ticket lifecycle events from a compiled sensor binary.
enabled: true
runner_type: native
entry_point: my-pack-ticket-sensor
trigger_types:
  - my_pack.ticket_created
  - my_pack.ticket_updated
  - my_pack.ticket_closed
parameters:
  check_interval_seconds:
    type: integer
    default: 10
    minimum: 1
poll_interval: 10
tags:
  - tickets
  - native
meta:
  owner: sre
  external_system: ticket-system
```

## Event payloads

Events should be small, structured, and sufficient for rule/action parameter rendering:

```json
{
  "ticket_id": "INC-123",
  "priority": "high",
  "source": "ticket-system"
}
```

Store large external payloads in artifacts or external storage and include a pointer.

Direct event creation validates payloads against the trigger's flat `output` schema and accepts only sensor or execution tokens; access, refresh, and worker tokens are rejected. For per-rule emission, set `trigger_instance_id` to `rule_<positive-numeric-id>`. Attune resolves that rule and fails closed if the identifier is malformed, the rule does not exist, or it belongs to another trigger. Omit `trigger_instance_id` only when broadcast matching across the trigger's eligible rules is intentional.

## Authentication

Sensors should use configured service credentials or pack-scoped keys. Do not hardcode API keys in sensor code or YAML.

Sensor-generated events use sensor-specific auth/event-emission paths rather than a user's interactive token.

## SDK behavior

For Attune/OpenAPI `0.3.0`, target SDK `0.3.0` in every runtime.

| Runtime | Package and imports | Current managed-sensor behavior |
| --- | --- | --- |
| Python | `pip install "attune-sdk[sensor]==0.3.0"`; `import attune` | Numeric rule targeting is the default when `rule=` is supplied; `target_rule=False` broadcasts explicitly. Supports notifier WebSocket lifecycle updates. |
| Node.js | `npm install attune-sdk@0.3.0`; import from `attune-sdk` | Numeric rule targeting is the default when `{ rule }` is supplied; `targetRule: false` broadcasts explicitly. Supports notifier WebSocket lifecycle updates. |
| Java | Maven `io.attune:attune-sdk:0.3.0`; imports under `io.attune` | Numeric rule targeting is the default when `.rule(rule)` is supplied; `.targetRule(false)` broadcasts explicitly. Notifier WebSocket lifecycle is not supported. |

Python and JavaScript notifier clients use `ATTUNE_SENSOR_TRIGGER_TYPES` to subscribe to every trigger declared by the sensor, including trigger refs with no active rule in the startup snapshot. Pin and test the selected SDK revision or package release; the synchronized working-tree behavior may be newer than a published package.

Verification snapshot (2026-08-11): Python is based on `93814eacffad22207768b2ab9368865a1b1008a1` plus uncommitted remediation and a regenerated client; all 91 tests and the sdist/wheel builds pass. JavaScript is based on `15773a5a3767213f5d1ac005219174d5e06f4681` plus uncommitted remediation and a regenerated client; all 61 tests, lint, build, package smoke, generated-client freshness, and npm audit checks pass. The Java working tree is based on `02755db2d62683bfff0c5ca19427d4a4f5a596ba` plus uncommitted remediation and has 31 passing tests, but still has no notifier WebSocket lifecycle support. These working trees are package-version aligned to SDK `0.3.0` for Attune/OpenAPI `0.3.0`; the base commits remain the verification anchors and do not contain the uncommitted remediation. Attune API-environment E2E checks remain a separate gate.

## Live rule updates (WebSocket, not AMQP)

Managed sensor processes receive live rule lifecycle updates from `attune-notifier` over an authenticated WebSocket stream, not a direct AMQP/RabbitMQ connection.

- Use `ATTUNE_NOTIFIER_WS_URL` (for example, `ws://localhost:8081/ws`).
- `ATTUNE_ALLOW_INSECURE_NOTIFIER_WS` controls whether insecure notifier WebSocket URLs are allowed; keep it false outside explicitly trusted development networks.
- Subscribe to the sensor's trigger refs and handle `rule.created`, `rule.enabled`, `rule.updated`, `rule.disabled`, and `rule.deleted` updates.
- Reconnect with backoff on disconnect and treat duplicate lifecycle messages idempotently.

`ATTUNE_SENSOR_TRIGGERS` is a startup snapshot. `ATTUNE_SENSOR_TRIGGER_TYPES` is the complete declared trigger-ref list used to build notifier subscriptions. Ordinary rule changes do not restart a still-needed process, so compatible sensors must consume notifier lifecycle updates in process. Confirm that the exact SDK version used implements this WebSocket lifecycle contract; otherwise rule state can remain stale until a process restart.

## Process environment

Managed processes receive `ATTUNE_API_URL`, `ATTUNE_API_TOKEN`, `ATTUNE_SENSOR_ID`, `ATTUNE_SENSOR_REF`, `ATTUNE_PACK_REF`, `ATTUNE_SENSOR_TRIGGER_TYPES`, `ATTUNE_SENSOR_TRIGGERS`, `ATTUNE_ARTIFACTS_DIR`, `ATTUNE_LOG_LEVEL`, `ATTUNE_LOG_FORMAT`, `ATTUNE_NOTIFIER_WS_URL`, and `ATTUNE_ALLOW_INSECURE_NOTIFIER_WS`, plus legacy MQ connection values. Treat all tokens and rule configuration as sensitive and never log the environment wholesale.

Persisted sensor `config` is not injected into the child process. SDK `config` views include only explicitly supplied `ATTUNE_SENSOR_CONFIG_*` variables; use rule trigger parameters for per-rule runtime settings. The standard sensor manager rotates its sensor token by renewing it and performing a controlled process restart. SDK support for re-reading a token or token-state file applies only when a custom runtime actually updates that source; a parent process cannot rotate a running child's environment in place.

## Rules consume sensor events

Rule action parameters can render from event data:

```yaml
action_params:
  ticket_id: "{{ event.payload.ticket_id }}"
  priority: "{{ event.payload.priority }}"
```

Use `event.payload.*`, not legacy `trigger.payload.*`.

## Lifecycle and reliability

Sensors should:

- Start cleanly when the sensor service starts.
- Handle transient external failures with backoff.
- Include stable source identifiers in payloads when possible so rules/actions can be idempotent.
- Log enough context to debug failed polling. Sensor stdout/stderr are written to rotating file-backed artifact versions and can be tailed from the sensor detail page; lines are not forwarded one-by-one into service tracing logs.
- Shut down cleanly on service termination.
- Avoid blocking unrelated sensors.

Attune supervises long-lived sensor processes. Unexpected exits while enabled rules still depend on the sensor are recorded in `sensor_process`, restarted with capped exponential backoff, and escalated through `core.alert` after repeated failures.

## Sensor log artifacts

Each managed sensor stream is registered as a private FileText artifact:

- `sensor.<sensor_ref>.stdout`
- `sensor.<sensor_ref>.stderr`

Each rotation segment is an `artifact_version.file_path`. The default retention is `versions` / `4`, independent of action log retention. Set `log_retention_policy` and/or `log_retention_limit` on the sensor YAML or sensor row to override the default for that sensor.

Sensor processes receive `ATTUNE_ARTIFACTS_DIR`. In standalone/API-transport mode, stdout/stderr stream through the API transport. If a sensor creates additional sensor-owned file-backed artifacts locally, the sensor agent copies them to the API-accessible artifact volume when the process stops or exits.

## Runtime detection and workers

Sensor runtime assignment uses `runner_type`, defaulting to native when omitted. Runtime names are normalized, so aliases such as `node`, `nodejs`, and `node.js` resolve consistently.

## Author-facing metadata limitations

Current pack loaders ignore several descriptive fields rather than persisting them: applicable trigger/sensor `type`, `tags`, `examples`, `meta`, and `poll_interval`. Keep them only as source documentation and do not depend on them for scheduling, filtering, API responses, or runtime behavior. The sensor process owns its polling interval.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Sensor does not start | Sensor service logs, runtime availability, pack registration. |
| Events are not created | Sensor credentials, trigger ref, trigger output schema, API/sensor token. |
| Sensor runs but does not receive live rule updates | Verify `ATTUNE_NOTIFIER_WS_URL`, notifier reachability, and WebSocket auth token validity. |
| Rules do not fire | Rule enabled state, trigger ref, rule criteria, executor logs. |
| Action gets missing parameters | Rule `action_params` templates and event payload fields. |
| Sensor keeps restarting | Sensor detail stderr tail, sensor placement, active rules, and `core.alert` events. |

## Related

- [Writing and Managing Rules](/pack-development/rules/)
- [Writing Actions](/pack-development/actions/)
- [Runtime Authoring Guide](/pack-development/runtime-authoring/)
- [Runtime Environments](/pack-development/runtime-environments/)
- [Writing Dashboards](/pack-development/dashboards/)
- [Pack Developer Guide](/pack-development/overview/)
- [Monitoring and Troubleshooting](/operations/monitoring/)
- [Operational Visibility](/operations/visibility/)
