---
title: "Supervisor Operations"
description: "attune-supervisor owns platform maintenance jobs that should not run inside request or execution workers. It manages runtime database retention for events, executions, enforcements"
sidebar:
  label: "Supervisor Operations"
  order: 6
---
`attune-supervisor` owns platform maintenance jobs that should not run inside request or execution workers. It manages runtime database retention for events, executions, enforcements, audit rows, queue runtime rows, worker state, and related history tables. It also manages Data Cache generation cleanup and performs cross-cutting maintenance checks such as time-based artifact version cleanup, stuck runtime-state monitoring, and retention-lag monitoring.

## Deployment coverage

The supervisor is deployed as a first-class Attune service:

| Surface | How it is included |
| --- | --- |
| Docker Compose | `docker-compose.yaml` defines the `supervisor` service using `SERVICE=supervisor`. |
| Distributable Compose | `docker/distributable/docker-compose.yaml` includes the published `attune/supervisor` image. |
| Docker build | `docker/Dockerfile.optimized` builds `attune-supervisor` with the other Rust service binaries. |
| Helm | The chart includes a supervisor Deployment controlled by `supervisor.replicaCount`. |
| Image publishing | [`.github/workflows/publish.yml`](https://github.com/attune-system/attune/blob/main/.github/workflows/publish.yml) publishes `ghcr.io/attune-system/attune/supervisor` images and includes the binary in release bundles. |
| Linux packages | `attune-supervisor` has an nfpm package and systemd unit. |

Multiple supervisor instances are safe: each maintenance cycle takes a PostgreSQL advisory lock, so only one instance performs the cycle.

## Boot recovery and dirty shutdown detection

On startup, the supervisor records a durable row in `supervisor_run` after it acquires the maintenance advisory lock. The row starts with `clean_shutdown = false` and is marked clean only during graceful supervisor shutdown. If a later supervisor boot sees an older row for the same service name where `clean_shutdown = false`, it treats the first cycle as `dirty_shutdown_recovery`.

Dirty shutdown recovery runs the same guarded maintenance/remediation checks as a normal cycle, but is logged distinctly so operators can identify that the cycle followed an unclean stop. These checks include stale non-terminal executions, unavailable-worker executions, stale workflow state, stale work-queue leases/dispatches, stale execution-admission entries, artifact cleanup, and retention lag. Corrective actions still use status predicates and stale thresholds before mutating rows, and each mutation emits the canonical `core.alert` event plus a semantic audit record.

## Runtime retention configuration

Retention configuration is stored in PostgreSQL and is managed through Attune. The migration that creates the retention tables seeds a singleton runtime config plus one row per target. Defaults are 30 days for all runtime metadata targets except `audit_events`, which defaults to 90 days.

The supervisor reloads this database configuration every retention cycle. Updating retention in the API or web client automatically applies on the next cycle; no supervisor restart is required.

Use `max_age_seconds: null` to keep a target forever while leaving it visible in config. Targets have no separate `enabled` field. The top-level `enabled` switch controls runtime retention. `dry_run: true` reports candidates without deleting rows or dropping leaves; it does not stop native reconciliation or summary building.

## Runtime changes

Platform administrators can manage retention in the web client at **Runtime Retention** (`/retention`). The same configuration is available through the API:

| Operation | Endpoint | Permission |
| --- | --- | --- |
| Read current retention config | `GET /api/v1/retention-config` | `retention:read` |
| Update retention config | `PUT /api/v1/retention-config` | `retention:update` |

`core.admin` includes both `retention:read` and `retention:update`. Operators who only need evidence of purge activity need `audit_log:read` to query the audit records.

The legacy shared config `retention` block is no longer the operational management surface for live deployments; it is only a startup fallback for the supervisor loop if database config cannot be loaded. The database-backed settings are the source of truth.

## Retention targets and guardrails

| Target | Default | Guardrail |
| --- | ---: | --- |
| `events` | 30 days | Drops fully expired daily `event` leaves; deletes boundary/DEFAULT rows by `created`. |
| `enforcements` | 30 days | Only non-`created` rows. |
| `executions` | 30 days | Only terminal statuses: `completed`, `failed`, `cancelled`, `timeout`, `abandoned`. |
| `execution_history` | 30 days | Drops fully expired daily leaves; deletes boundary/DEFAULT rows by `time`. |
| `worker_history` | 30 days | Deletes ordinary-table rows by `time`. |
| `sensor_process_history` | 30 days | Deletes ordinary-table rows by `time`. |
| `audit_events` | 90 days | Drops fully expired daily `audit_event` leaves; deletes boundary/DEFAULT rows by `created`. |
| `notifications` | 30 days | Rows older than cutoff. |
| `webhook_event_logs` | 30 days | Rows older than cutoff. |
| `inquiries` | 30 days | Only `responded`, `timeout`, or `cancelled`; never `pending`. |
| `work_queue_items` | 30 days | Only terminal items; never `queued`, `leased`, or `retry`. |
| `work_queue_dispatches` | 30 days | Only terminal dispatches; never `leased` or `dispatched`. |
| `pack_test_executions` | 30 days | Rows older than cutoff. |
| `execution_admission` | 30 days | Removes stale execution admission state and entries. |
| `workers` | 30 days | Only stale `inactive`/`error` workers that are not cordoned and do not own active sensor processes. |
| `sensor_processes` | 30 days | Only `stopped`/`failed` processes with `active_rule_count = 0`. |

Purging an execution does not automatically delete artifact metadata or artifact content. Artifact rows are controlled by their own per-artifact retention policy.

Each target uses one fixed cutoff. Row deletion commits in bounded batches, with defaults of `batch_size: 1000` and `max_batches_per_target: 100`. Remaining backlog continues in later cycles. Waiting-workflow and undelivered-runtime-log protections remain in effect. Independent retention can leave runtime relationship IDs pointing to rows that have already expired.

## Native partitions and hourly summaries

`event`, `execution_history`, and `audit_event` use native PostgreSQL daily UTC RANGE partitions plus DEFAULT partitions. The supervisor reconciles today and seven future days by default. Backdated data and missed future maintenance remain queryable through DEFAULT. Bounded repair moves a whole DEFAULT day and attaches its leaf atomically; oversized or contended repairs defer rather than hide data.

Three persisted jobs share the supervisor leader lock but have independent schedules:

| Job | Default interval | Work |
| --- | ---: | --- |
| `partition` | 3600 seconds | Reconcile future leaves and attempt bounded DEFAULT repair. |
| `retention` | 3600 seconds | Runtime retention, cache cleanup, and housekeeping. |
| `summary` | 300 seconds | Refresh bounded completed-hour summaries. |

Hourly summaries cover execution creation/status, event volume, and worker status. Readers use only clean completed hours fully included in the request. Gaps, dirty hours, current hours, and partial boundaries use raw queries. Summary retention follows raw-source retention; there is no separate aggregate-retention target.

Native settings live in the `native_maintenance` object returned by `GET /api/v1/retention-config`. Read the current object, edit it, and PUT the complete object to preserve other retention and cache settings. The supervisor reloads persisted values without restarting. `retention.native_maintenance` YAML seeds initial values only while the stored object is the migration default. With `native_maintenance.enabled: false`, partition reconciliation and summary building stop; enabled runtime retention uses bounded row deletion instead of whole-leaf expiry.

Use `GET /api/v1/retention-config/native-status` with `retention:read` for partition, summary, and schedule inventories. `default_rows_at_least` is a lower bound when `default_count_exact` is false. Summary coverage extrema can enclose gaps or dirty hours. `next_due` and `last_success` describe each job, and success can still leave bounded backfill work.

The migration/supervisor roles need effective ownership of the managed parents and schema `USAGE`/`CREATE` for partition DDL, plus the maintenance-table and sequence grants. Ordinary DML grants are insufficient; superuser access is not required. See [PostgreSQL-only deployment](https://github.com/attune-system/attune/blob/main/docs/deployment/postgresql-only.md#database-roles-for-native-maintenance) and the [native maintenance settings](https://github.com/attune-system/attune/blob/main/docs/deployment/supervisor.md#native-maintenance-configuration).

## Additional maintenance jobs

These jobs run under the same supervisor advisory lock after the runtime retention pass.

| Job | Default | Behavior |
| --- | --- | --- |
| Artifact cleanup | Enabled | Enforces time-based and version-count retention in bounded cleanup cycles. Removes eligible file-backed bytes and metadata, queues exact object-version deletion in the durable ledger, and reconciles abandoned uploads and missing non-log ready objects. Version-count overflow remains while cleanup is disabled. |
| Pack release and object retention | Enabled | Preserves active/pinned releases and rollback windows; reclaims eligible inactive releases and exact object versions through the durable maintenance ledger after the deletion grace period. |
| Data Cache lifecycle cleanup | Enabled | Expires abandoned staging generations, removes expired retired generations and entries in bounded batches, and completes cleanup for tombstoned namespaces while preserving active and still-readable snapshots. |
| Stuck runtime monitoring | Enabled | Detects old non-terminal executions, expired leased queue items, and stale leased/dispatched queue dispatches. It emits deduplicated canonical `core.alert` events using the core pack trigger contract in `packs/core/triggers/alert.yaml`. |
| Corrective runtime remediation | Enabled | After a larger grace window, marks stale non-terminal executions terminal (`canceling` -> `cancelled`, stale requested/scheduling/scheduled/running -> `abandoned`), releases stale queue leases/dispatches, reconciles terminal execution admission entries, promotes queued admission entries when capacity opens, and synchronizes stale workflow rows whose parent/children are already terminal. |
| Retention-lag monitoring | Enabled | After retention runs, checks whether retention-eligible rows remain older than each target's configured retention window plus a grace threshold. It emits deduplicated canonical `core.alert` events for lagging targets. |

The shared config `maintenance` block controls these jobs:

```yaml
maintenance:
  enabled: true
  artifact_cleanup_enabled: true
  artifact_cleanup_batch_size: 100
  pack_release_retention_enabled: true
  pack_release_newest_inactive: 2
  pack_release_rollback_seconds: 604800
  pack_release_cleanup_batch_size: 100
  object_upload_abandon_seconds: 86400
  object_delete_grace_seconds: 86400
  storage_rollback_snapshot_seconds: 604800
  monitoring_enabled: true
  corrective_actions_enabled: true
  stuck_execution_seconds: 3600
  execution_remediation_seconds: 7200
  stuck_queue_seconds: 900
  queue_remediation_seconds: 1800
  admission_remediation_seconds: 1800
  retention_lag_alert_seconds: 86400
  alert_limit_per_cycle: 25
  alert_cooldown_seconds: 3600
```

Unlike runtime retention settings, these maintenance thresholds are service configuration and require a supervisor restart to change. Runtime retention target windows remain database-backed and hot-applied from `/retention`.

Corrective remediation is idempotent and guarded by current status predicates so it does not overwrite active worker/executor progress. Alerting uses normal Attune events: the supervisor inserts an `event` row for trigger `core.alert` with the payload shape defined by `packs/core/triggers/alert.yaml`, and when RabbitMQ is configured it also publishes the corresponding `EventCreated` message. The supervisor also publishes normal execution lifecycle wakeups after corrective execution/admission changes so downstream workflow, queue, and policy processing can continue. If RabbitMQ is unavailable, it still corrects database state and writes the canonical `core.alert` event plus audit records, but logs that lifecycle wakeups could not be published.

## Data Cache lifecycle

Data Cache cleanup is asynchronous and bounded so large datasets do not create
long maintenance transactions.

- Abandoned `staging` generations expire after the configured staging window.
- The `active` generation is always preserved.
- Retired generations remain readable until `readable_until`; cursor and
  explicit generation reads fail with `snapshot_expired` after that point.
- Expired generation entries are deleted in batches before generation metadata
  is removed.
- Namespace deletion tombstones the namespace immediately. The supervisor
  removes entries, generations, and finally the namespace.
- Owner rows remain referenced until cleanup completes. Pack or component
  teardown should wait for the tombstoned namespace to disappear.

Quota planning must account for the active generation, still-readable retired
generations, and one or more staging generations. A retention policy that
cannot fit those states will block refresh publication with
`cache_quota_exceeded`.

### Cache retention configuration

Cache retention is part of the database-backed runtime retention object. The
top-level `cache_retention` YAML block seeds it only on first start; afterward,
use **Runtime Retention** or `GET`/`PUT /api/v1/retention-config`. The supervisor
reloads the persisted values each cycle without a restart.

```yaml
cache_retention:
  enabled: true
  batch_size: 1000
  max_batches_per_generation: 20
  max_generations_per_cycle: 50
  max_namespaces_per_cycle: 50
  min_traversal_window_seconds: 3600
  staging_expiry_seconds: 86400
  dry_run: false
  freshness_alerts_enabled: true
  freshness_alert_grace_seconds: 900
  staging_failure_alert_threshold: 3
  alert_cooldown_seconds: 3600
  alert_limit_per_cycle: 25
```

| Field | Default | Meaning |
| --- | ---: | --- |
| `enabled` | `true` | Enables cache cleanup within the retention cycle. |
| `batch_size` | `1000` | Maximum cache-entry rows deleted in one bounded batch. |
| `max_batches_per_generation` | `20` | Maximum deletion batches for one generation per cycle. |
| `max_generations_per_cycle` | `50` | Maximum failed or expired-retired generations processed per cycle. |
| `max_namespaces_per_cycle` | `50` | Maximum namespaces inspected for expiry/freshness and tombstone completion per cycle. |
| `min_traversal_window_seconds` | `3600` | Minimum post-retirement readability window. |
| `staging_expiry_seconds` | `86400` | Age at which abandoned `staging` or `ready` generations are failed. |
| `dry_run` | `false` | Reports candidates and metrics without deleting or changing rows. |
| `freshness_alerts_enabled` | `true` | Enables stale-generation and repeated-refresh-failure alerts. |
| `freshness_alert_grace_seconds` | `900` | Additional age beyond a namespace freshness target before alerting. |
| `staging_failure_alert_threshold` | `3` | Consecutive failed generations before repeated-failure alerting. |
| `alert_cooldown_seconds` | `3600` | Duplicate cache-alert suppression window. |
| `alert_limit_per_cycle` | `25` | Maximum cache alerts of each kind emitted per cycle. |

### Cache admission configuration

`cache_admission` is startup-loaded API configuration, not runtime retention.
All values must be positive. Configure the same values on every API instance
and restart the API after changing them.

```yaml
cache_admission:
  max_live_namespaces: 10000
  max_live_namespaces_per_owner: 1000
  max_physical_bytes: 107374182400
  max_physical_bytes_per_owner: 10737418240
  max_unpublished_generations_per_owner: 100
```

Physical-byte accounting includes every generation state and tombstoned
namespaces until cleanup actually deletes their entries. Admission failures do
not evict published data, and capacity is not recovered immediately when a
namespace is tombstoned.

Run at least one supervisor instance wherever Data Caches are enabled. Monitor
stale/unpopulated namespaces, failed or old staging generations, retained
bytes, and supervisor cycle failures. See [Data Caches](/administration/data-caches/) for the
publication and traversal contracts.

## Audit visibility

The supervisor writes audit events for retention work so operators can verify when purging occurred:

| Event type | Outcome | Meaning |
| --- | --- | --- |
| `maintenance.retention.target_completed` | `success` | A target had candidates/deletions, or dry-run mode reported candidates. |
| `maintenance.retention.target_failed` | `failure` | A target failed during a retention cycle. |
| `maintenance.retention.config_updated` | `success` | A user changed runtime retention configuration through the API/web client. |
| `maintenance.artifact.cleanup_completed` | `success` | The supervisor deleted expired time-based artifact versions and/or empty artifact metadata. |
| `maintenance.corrective_action.applied` | `success` | The supervisor made a corrective runtime mutation, such as terminalizing a stale execution, releasing queue leases, reconciling admission entries, or synchronizing workflow state. |

Audit rows use:

| Field | Value |
| --- | --- |
| `category` | `admin` |
| `actor_login` | `attune-supervisor` for target purge events; the authenticated user for config updates. |
| `actor_token_type` | `system` for target purge events; token type from the authenticated user for config updates. |
| `resource_type` | `runtime_retention` |
| `resource_ref` | Target name, such as `executions` or `audit_events`. |
| `details` | Target, cutoff, max age, row candidates, committed `deleted` rows, committed `partitions_dropped`, separate `partition_candidates`, candidate exactness, dry-run flag, service context, and bounded failure fields when applicable. |

Row deletions and leaf drops have different units. Do not add them into one total or infer deleted-row counts from leaf contents. `candidates_exact: false` reports a lower bound for the bounded row cohort. Confirmed progress survives a later batch or housekeeping failure.

Example audit-log query:

```bash
attune audit list --event-type maintenance.retention.target_completed
```

No audit row is emitted for a retention target with zero candidates in normal mode to avoid hourly noise. Stuck-state and retention-lag monitoring use canonical `core.alert` events instead of audit rows because they are operational alerts, not purge activity. Corrective remediation emits both a canonical `core.alert` event and `maintenance.corrective_action.applied` audit row so operators can see that Attune automatically changed runtime state.

## Related

- [Configuration Reference](/reference/configuration/)
- [Data Caches](/administration/data-caches/)
- [Operational Visibility](/operations/visibility/)
- [Docker Operations](/operations/docker/)
- [Kubernetes Operations](/operations/kubernetes/)
