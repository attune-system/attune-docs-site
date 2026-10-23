---
title: "Events"
description: "How Attune stores immutable trigger occurrences and carries them into rule evaluation."
sidebar:
  order: 10
---

An event is a durable record that a trigger fired. It separates event production from rule evaluation: a sensor, an action execution, or the webhook receiver can record an occurrence before the executor decides which rules match it. See [Core concepts](/introduction/core-concepts/) for the public event flow and [Sensors](/pack-development/sensors/) for authoring guidance.

## PostgreSQL representation

The [trigger, sensor, event, and rule migration](https://github.com/attune-system/attune/blob/main/migrations/20250101000004_trigger_sensor_event_rule.sql) creates `event` directly as a native PostgreSQL RANGE-partitioned parent on `created`, with a DEFAULT partition and composite primary key `(id, created)`. The [native partition migration](https://github.com/attune-system/attune/blob/main/migrations/20261006000001_native_partitions.sql) adds daily UTC leaves. DEFAULT keeps backdated records and records outside maintained daily bounds queryable through the parent.

| Column group | Stored value |
| --- | --- |
| Identity | `id`, `created`, and optional `trace_tag` |
| Trigger | Nullable `trigger` ID and required `trigger_ref` snapshot |
| Producer | Nullable `source` sensor ID and `source_ref` snapshot |
| Targeted rule | Optional `rule` ID and `rule_ref` |
| Event data | Optional `config` and `payload` JSONB objects |

`trigger`, `source`, and `rule` are foreign keys to definition tables. Deleting one of those definitions sets the numeric column to `NULL`; the adjacent ref remains useful for retained events. `enforcement.event` is deliberately a plain `BIGINT` so event and enforcement retention remain independent. It can dangle after event retention removes its event. PostgreSQL supports foreign keys to partitioned tables when the referenced key meets its uniqueness rules, but `event(id)` alone is not unique by constraint.

Events have no `event_history` table. They are immutable in application code: [EventRepository](https://github.com/attune-system/attune/blob/main/crates/common/src/repositories/event.rs) implements create, read, search, and delete, but no update. The partitioned table holds the raw records. The ordinary `event_volume_hourly` view reads them directly; native analytics use `event_volume_hourly_summary` for clean, completed hours and raw queries for dirty hours, gaps, and partial hours.

Event ingestion checks `trigger.param_schema` for protected fields in both config and payload. It replaces matching values with markers and stores encrypted values in `execution_secret_value`, using the `event_payload` or `event_config` entity type. This supporting table uses a logical `entity_id`, not a foreign key. Ingestion does not consult `out_schema`, so an output-only secret marker does not protect a payload field.

## Creation and processing

The protected `POST /api/v1/events` route accepts only sensor and execution tokens. User sessions must use an enabled trigger webhook. The [events route](https://github.com/attune-system/attune/blob/main/crates/api/src/routes/events.rs) verifies the trigger, token scope, sensor ownership, workload-assignment fence, and any `rule_<id>` target before it inserts the row. An execution-token request inherits its parent execution's trace tag unless the request supplies one.

Webhook ingestion performs its own authentication, HMAC, IP, and rate-limit checks, then uses the same repository. Work-queue lifecycle code and supervisor alerts can also create system events through repository-backed helpers.

```mermaid
flowchart LR
    Producer[Sensor, execution, or webhook] --> API[API validation]
    API --> E[(event RANGE parent)]
    API -. best-effort .-> MQ[event.created]
    MQ --> EP[Executor event processor]
    EP --> R[Enabled matching rules]
    R --> F[(enforcement)]
```

After the transaction commits, the API publishes an `EventCreated` RabbitMQ message when a publisher is available. Publication failure does not roll back the event. The [executor event processor](https://github.com/attune-system/attune/blob/main/crates/executor/src/event_processor.rs) reloads the event from PostgreSQL. If `event.rule` is set, it considers only that rule. Otherwise, it finds enabled rules for `trigger_ref`. For each rule whose conditions pass, it resolves action parameters and creates one enforcement for the `(rule, event)` pair.

PostgreSQL also emits `event_created` through `LISTEN/NOTIFY` after insertion. The notifier uses that channel for live client updates. This notification is not the executor's durable work queue. See [RabbitMQ](/internal-implementation/supporting-systems/rabbitmq/) and [Notifier WebSocket](/internal-implementation/supporting-systems/notifier-websocket/) for the two delivery contracts.

## Queries and visibility

The API exposes list and detail reads through the same [events route](https://github.com/attune-system/attune/blob/main/crates/api/src/routes/events.rs). Repository searches filter by ID, trigger, source, rule ref, or trace tag and order by newest `created`. Read visibility derives from accessible rules for events that produced enforcements. For an event with no enforcement, visibility derives from its trigger. Secret values stay redacted unless the caller passes the separate decrypt authorization path.

Trace reports join events to enforcements and executions by their plain numeric links. Code must tolerate a missing event because retention can break that chain.

## Retention and caveats

The supervisor owns event retention. The database seed keeps 30 days by default, but administrators can change or disable that target at runtime. With native maintenance enabled, the [retention repository](https://github.com/attune-system/attune/blob/main/crates/common/src/repositories/retention.rs) drops fully expired daily leaves and removes their summaries and coverage in the same transaction. It deletes expired boundary-day and DEFAULT rows in bounded batches. There is no TimescaleDB compression policy. See [Supervisor](/operations/supervisor/) for runtime settings and the [PostgreSQL-only contract](https://github.com/attune-system/attune/blob/main/docs/deployment/postgresql-only.md) for partition and summary behavior.

Event insertion and RabbitMQ publication are not transactional together. A committed event can exist without a corresponding queue message if publication fails. Also, `id` comes from a sequence and repository lookups use it alone, but the database primary key is `(id, created)`. Contributors adding references or conflict constraints must design against the composite key and retention behavior, not assume that `event(id)` is a relational target.
