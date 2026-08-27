---
title: "Operational Visibility"
description: "Attune distinguishes observed component health from operator intent. Workers and sensor workers can be healthy but cordoned, sensor processes can be restarted with backoff, and une"
sidebar:
  label: "Operational Visibility"
  order: 7
---
Attune distinguishes observed component health from operator intent. Workers and sensor workers can be healthy but cordoned, sensor processes can be restarted with backoff, and unexpected platform conditions emit structured `core.alert` events that rules can route to notification actions.

## Dashboard health

The home dashboard surfaces current worker health, including:

- Unexpected offline action workers.
- Unexpected offline sensor workers.
- Cordoned action workers.
- Cordoned sensor workers.

Worker health is computed by the API from the worker role, observed status, heartbeat age, stale-heartbeat threshold, and cordon fields. Prefer those API fields over recreating heartbeat logic in clients.

## Worker cordon

Cordoning is an operator action that prevents new scheduling on a worker without pretending the worker is unhealthy.

| Field | Meaning |
| --- | --- |
| `worker.status` | Observed lifecycle state such as `active`, `inactive`, `busy`, or `error`. |
| `worker.cordoned` | Operator intent: do not schedule new work here. |
| `cordon_reason` | Optional maintenance or incident note. |
| `cordoned_by` / `cordoned_at` | Identity and timestamp for the cordon operation. |

Cordoned workers may continue to heartbeat. The executor excludes cordoned action workers from new scheduling. Unexpected-offline alerts are suppressed for cordoned workers because the outage is expected.

Use the workers inventory in the Runtimes page, or the API:

```http
POST /api/v1/workers/{id}/cordon
POST /api/v1/workers/{id}/uncordon
```

## Dead-worker execution reconciliation

If a worker disappears while an execution is already `running`, Attune does not restart that execution automatically. The executor reconciles it to `abandoned` with result metadata describing the worker, last heartbeat, heartbeat age, cordon state, and reconciliation source.

The executor publishes the normal completion message after reconciliation, so workflows, queues, notifier updates, and history see a terminal transition.

## `core.alert`

`core.alert` is a built-in trigger for Attune operational exceptions. It is emitted through the normal event path and can be consumed by rules like any other trigger.

Alert payloads include:

| Field | Meaning |
| --- | --- |
| `severity` | Alert severity such as `warning` or `error`. |
| `category` | Broad area such as worker or sensor-process health. |
| `failure_type` | Specific condition, for example worker unavailable or repeated sensor failure. |
| `component_type` | Component class such as `worker`, `execution`, or `sensor`. |
| `component_id` / `component_ref` | Component identity when available. |
| `worker_role` | `action` or `sensor` when relevant. |
| `observed_at` | Time the condition was observed. |
| `summary` | Human-readable summary. |
| `details` | Structured context for routing and message formatting. |
| `correlation_id` | Stable grouping key for dedupe/routing. |

Current emitters include unexpected non-cordoned worker loss, execution abandonment caused by worker loss, and repeated managed sensor-process failures while enabled rules depend on the sensor.

## Row-level visibility in the event pipeline

Operational endpoints are authenticated and then row-filtered:

- Rules are private-scoped metadata and require explicit rule scope for non-global reads.
- Enforcements derive visibility from their originating rule for all non-global paths.
- Events derive visibility from the associated rule when present; trigger-derived visibility is used only when no rule association exists.
- Artifacts with execution linkage derive visibility from linked execution readability; owner-path checks are used only when no execution linkage exists.

This keeps list/search/get behavior consistent and prevents trigger/action visibility from broadening rule-derived operational rows.

## Secret-safe event, enforcement, and execution metadata

Operational records are readable for troubleshooting and audit without automatically exposing secrets.

When a trigger schema marks event payload or config fields with `secret: true`, Attune stores only redaction markers on the event record and keeps the original values in encrypted secret storage. Enforcements keep a redacted copy of the event payload, so reading an enforcement cannot bypass event redaction.

Rules may still map an event secret into an action parameter when the target action parameter is also marked `secret: true`. The executor restores the event secret only inside rule-template rendering, validates that the destination is allowed to receive a secret, then stores the enforcement/execution config with redaction markers. Normal readers can still verify that non-secret values were mapped correctly.

Default detail reads return redacted values:

```http
GET /api/v1/events/{id}
GET /api/v1/enforcements/{id}
GET /api/v1/executions/{id}
```

Use `include_secret_values=true` to request restored values. The caller must have the matching decrypt permission for that record type:

| Record | Normal read permission | Secret reveal permission |
| --- | --- | --- |
| Event | `events:read` | `events:decrypt` |
| Enforcement | `enforcements:read` | `enforcements:decrypt` |
| Execution | `executions:read` | `executions:decrypt` |

Enforcement decrypt reveals enforcement config secrets. It does not reveal the copied event payload secrets; use event decrypt on the source event when event payload disclosure is required.

Notifier/WebSocket notifications remain metadata-only. The notifier evaluates the same row-level visibility rules used by API reads before forwarding each message, and does not provide a secret-decrypt path.

## Runtime retention audit events

`attune-supervisor` records runtime database retention activity in the audit log. This gives operators durable evidence that purge work happened, independent of container logs.

| Event type | Resource | Details |
| --- | --- | --- |
| `maintenance.retention.target_completed` | `runtime_retention:<target>` | Cutoff, max age, candidate count, deleted row/chunk count, dry-run flag, service name, environment, batch size, and advisory lock key. |
| `maintenance.retention.target_failed` | `runtime_retention:<target>` | Target, max age, dry-run flag, service name, environment, batch size, advisory lock key, and error. |
| `maintenance.retention.config_updated` | `runtime_retention:config` | Previous and updated retention configuration after an authenticated API/web update. |

Retention purge audit events use `category = admin`, `actor_login = attune-supervisor`, and `actor_token_type = system`. Configuration update events use the authenticated user's identity and token type. Querying them through the API or CLI requires `audit_log:read`.

## Sensor process health

Long-lived pack sensors are supervised by the sensor worker. Live process state is stored in `sensor_process`; field-level changes are stored in `sensor_process_history`.

Tracked state includes:

- Sensor id/ref.
- Owning sensor worker id/name.
- Status: `starting`, `running`, `stopped`, `failed`, or `backoff`.
- PID when available.
- Consecutive failure count.
- Last exit code or signal.
- Last start/stop timestamps.
- Next restart time.
- Stderr excerpt and log artifact ref.
- Active enabled-rule count.
- Last alerted failure count/time.

Unexpected exits while enabled rules still reference the sensor are moved to `backoff`, stderr context is captured from the rotating stderr log, and the sensor is restarted with capped exponential backoff. Intentional stops, disabled or deleted sensors, sensors with no active rules, and placement mismatches are marked stopped and are not restarted.

Repeated failures emit `core.alert` once the threshold is crossed. Alert bookkeeping prevents the same failure count from alerting repeatedly.

## Sensor logs

Sensor stdout/stderr logs are written under:

```text
{artifacts_dir}/sensors/{sensor_ref}/stdout.log
{artifacts_dir}/sensors/{sensor_ref}/stderr.log
```

The sensor detail page can tail and follow both streams. The API supports:

```http
GET /api/v1/sensors/{sensor_ref}/logs
GET /api/v1/sensors/{sensor_ref}/logs/{stdout|stderr}?tail=200
```

## Sensor placement

Pack sensors can use the same placement vocabulary as actions:

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

Sensor workers advertise labels and taints through `sensor.labels` and `sensor.taints`. `SensorManager` evaluates those capabilities before starting or restarting a sensor process.

## Related

- [Monitoring and Troubleshooting](/operations/monitoring/)
- [Supervisor Operations](/operations/supervisor/)
- [Standalone Workers and Sensors](/operations/standalone-workers-and-sensors/)
- [Writing Dashboards](/pack-development/dashboards/)
- [Writing Sensors](/pack-development/sensors/)
- [YAML Reference](/reference/yaml/)
