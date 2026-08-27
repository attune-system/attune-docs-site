---
title: "Monitoring and Troubleshooting"
description: "Start troubleshooting from the execution, then follow the event, queue, worker, and service paths."
sidebar:
  label: "Monitoring and Troubleshooting"
  order: 8
---
Start troubleshooting from the execution, then follow the event, queue, worker, and service paths.

## Health signals

| Area | Signal |
| --- | --- |
| API | HTTP health endpoint, request logs, auth/RBAC errors. |
| Executor | Rule processing, scheduling, workflow advancement, queue dispatch logs. |
| Worker | Registration, heartbeat, cordon state, runtime verification, execution consume/complete logs. |
| Sensor | Sensor-worker registration, process supervision state, external polling, event emission logs, stdout/stderr tails. |
| Notifier | WebSocket auth, LISTEN/NOTIFY subscription, client subscription errors. |
| PostgreSQL | Connections, hypertable chunk health, migrations, audit/history growth. |
| RabbitMQ | Queue depth, consumers, dead letters, publish/ack errors. |

## Execution troubleshooting path

1. Find the execution by ID, action ref, or time.
2. Check status and result.
3. Check parent/child relationship for workflow tasks.
4. Check worker assignment and heartbeat.
5. Check action stderr/log artifacts.
6. Check permission refs if `ATTUNE_API_TOKEN` is missing.
7. Check runtime env setup logs for dependency failures.
8. If status is `timeout`, compare `execution.timeout_seconds` with the action's expected runtime and check whether the process ignored SIGTERM before SIGKILL escalation.
9. Check RabbitMQ queue depth if execution is stuck before running.
10. If status is `abandoned`, check whether the assigned worker went stale or offline mid-run.

## Workflow troubleshooting

| Symptom | Check |
| --- | --- |
| Parent remains running | Child executions, terminal statuses, workflow advancement logs. |
| Transition did not fire | `when` expression, `result()` shape, published variable names. |
| Timeout transition did not fire | Child execution status is `timeout`, task has a `timed_out()` transition, and retry attempts are exhausted or absent. |
| Template value is string not object | Mixed string template vs pure `{{ expr }}`. |
| with_items stalls | In-flight children, pending requested siblings, concurrency value. |
| Inquiry does not resume | Assignee, response API, inquiry timeout, executor completion listener. |

## Queue troubleshooting

| Symptom | Check |
| --- | --- |
| New items rejected | Queue `accepting_new_items`, item schema, enqueue permissions. |
| Items stay queued | Queue `enabled`, resolved concurrency/batch settings, dispatcher logs. |
| Items leased but not running | Dispatch row status, RabbitMQ publish, executor recovery. |
| Items fail immediately | Action result `queue_ack`, retry limit, action errors. |
| Items fail after timeout | Dispatch action timeout, missing `queue_ack`, and `config.dispatch.retry_limit`; default retry limit is `0`. |
| Sequential queue too slow | `inter_execution_delay_seconds`, resolved concurrency. |
| Lifecycle notification missing | Confirm the core pack loaded `core.queue_started` and `core.queue_empty`, then inspect recent `event` rows for the queue id/ref. |

Attune emits `core.queue_started` when a previously empty queue begins processing and `core.queue_empty` when the last queue-processing execution terminates and the queue is still empty.

## Worker troubleshooting

| Symptom | Check |
| --- | --- |
| No eligible worker | Runtime name/version, required worker runtimes, labels, taints, affinity. |
| Worker disappears | Heartbeat, service logs, database connection, RabbitMQ connection, cordon state. |
| Runtime unavailable | Version verification commands and interpreter paths. |
| Agent misses runtime | Container PATH, `--detect-only`, explicit runtime env override. |

## Worker and sensor-worker operations

Use the dashboard or Runtimes worker inventory to distinguish:

- **Unexpected offline**: stale or inactive worker that is not cordoned. Attune emits `core.alert`.
- **Cordoned**: operator intentionally removed the worker from scheduling. Alerts are suppressed for expected shutdowns.
- **Busy/active**: worker is heartbeating and available unless cordoned.

Cordon a worker before planned shutdown:

```http
POST /api/v1/workers/{id}/cordon
```

Uncordon it after maintenance:

```http
POST /api/v1/workers/{id}/uncordon
```

## Sensor process troubleshooting

| Symptom | Check |
| --- | --- |
| Sensor repeatedly exits | Sensor detail stderr tail, `sensor_process.consecutive_failures`, `next_restart_at`, `core.alert` events. |
| Sensor is not restarted | Active rules for the sensor's triggers, sensor enabled state, placement constraints, sensor-worker cordon/health. |
| Sensor runs on the wrong node | Sensor `worker_selector`, tolerations, affinity, and sensor-worker `sensor.labels` / `sensor.taints`. |
| Sensor logs are missing | `artifacts_dir`, sensor log artifact registration, sensor stdout/stderr tail endpoints. |

Managed sensor process state is persisted in `sensor_process`; process state changes are recorded in `sensor_process_history`.

## Operational alerts

`core.alert` is emitted for unexpected Attune component failures, including unexpected worker loss, execution abandonment due to worker loss, and repeated managed sensor-process failures. Create rules against `core.alert` to route these events to email, chat, ticketing, or paging actions.

## Notifier troubleshooting

- Confirm WebSocket clients authenticate without query tokens.
- Confirm browser clients send `attune.v1` and `attune.jwt.<jwt>` subprotocols.
- Confirm token has not expired.
- Confirm server serializes outgoing notifications with a `type` field.
- Confirm PostgreSQL listener uses batch subscription for all channels.

## Useful commands

```bash
docker compose logs --tail=200 executor
docker compose logs --tail=200 worker-shell
docker compose logs --tail=200 sensor
docker compose logs --tail=200 notifier
docker compose logs --tail=200 rabbitmq

attune execution list
attune execution show <id>
attune artifact list --execution <id>
```

## External log collector checks

When troubleshooting Datadog/Splunk/collector ingestion:

1. Confirm your collector tails Docker container logs (`stdout`/`stderr`), not Attune log volumes.
2. Confirm container labels are present (`com.attune.service`, `com.attune.log.contract=container-stdout-stderr`, `com.attune.log.transport=docker`, `com.attune.log.volume_hint=non-forwarding`, service/env/version tags).
3. Confirm JSON body parsing is enabled in the collector pipeline.
4. If using raw Docker `json-file` tailing, confirm your pipeline adds Docker metadata; labels are not embedded in log lines by default.
5. Confirm runtime stdout/stderr expectations: raw execution/sensor logs are in private `runtime_log` artifacts, not mirrored into service logs.

For setup examples, see [Docker Operations](/operations/docker/#export-logs-to-external-systems).

## Related

- [Troubleshooting Index](/reference/troubleshooting/)
- [Operational Visibility](/operations/visibility/)
- [Queue Administration](/administration/queues/)
- [Artifact Administration](/administration/artifacts/)
