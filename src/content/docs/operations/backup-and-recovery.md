---
title: "Backup and Recovery"
description: "Coordinate PostgreSQL recovery with exact immutable object versions, file-backed storage, and secrets."
sidebar:
  label: "Backup and Recovery"
  order: 9
---
Recover Attune from a coordinated database and storage backup. PostgreSQL metadata alone cannot recover missing pack archives, artifacts, or runtime log bytes.

## What to back up

| Data | Required? | Notes |
| --- | --- | --- |
| PostgreSQL | Yes | Primary records, identities, RBAC, executions, events, audit/history, queues, artifact/log metadata, object-version references, and maintenance ledgers. |
| Immutable blob backend | Yes | Filesystem blob storage such as `blobs_data`, or exact S3 version IDs/GCS generations for pack archives, artifact bodies, and object-backed runtime log segments. A latest-object-only copy is insufficient. |
| Pack storage | Yes | Installed pack files and generated static pack binaries. |
| Artifact storage | Yes when file-backed | File-backed artifact contents and shared-file runtime logs under `artifacts_dir`. This does not replace the immutable blob-backend backup. |
| RabbitMQ | Recommended | Durable in-flight work and broker state. |
| Config/secrets | Yes | Config files, Kubernetes secrets, JWT/encryption keys, identity-provider credentials. |
| Runtime envs | Optional | Can usually be recreated, but backing up may speed recovery. |

## Database backup

Use your organization's PostgreSQL backup and point-in-time recovery standard for stock PostgreSQL 16 or newer. Include every Attune schema, recorded migration state, roles, ownership, and grants needed by migrations and native/cache partition maintenance.

Test restores regularly by:

1. Restoring to an isolated environment.
2. Restoring the exact objects and filesystem data referenced at the selected recovery point.
3. Verifying the application version and recorded migration checksums. Apply only a supported migration path; current fresh-install migrations do not convert a populated older pre-production or TimescaleDB schema.
4. Reconciling ready objects before reopening writes, then starting runtime services.
5. Listing packs, executions, queues, artifacts, and identities, reading restored artifact/log bytes, and running a smoke action.

## Database and object recovery point

Define recoverable time `T` as the latest PostgreSQL recovery point for which storage still retains every exact object version referenced by the restored rows. S3 requires Versioning. Configure S3 version retention or GCS soft delete for at least the PostgreSQL point-in-time recovery window plus `maintenance.object_delete_grace_seconds`, which defaults to 86400 seconds.

To recover, restore PostgreSQL to `T`, then restore or undelete the exact S3 version IDs or GCS generations referenced at `T`. For the filesystem backend, restore the immutable blob directory consistently with the database metadata. Restoring only current object keys, or listing a bucket to guess which bytes belong to restored rows, does not satisfy recovery.

Run supervisor ready-row reconciliation before reopening writes. If any referenced version cannot be restored, that database point is not recoverable. Move `T` back to a point whose complete object set remains available. Monitor database backups and storage retention as one recovery contract.

Storage migration keeps old filesystem sources for `maintenance.storage_rollback_snapshot_seconds`, seven days by default. Retain those snapshots for at least that period and do not shorten it until an object-backed restore has passed. See [Supervisor recovery guidance](https://github.com/attune-system/attune/blob/main/docs/deployment/supervisor.md#postgresql-and-object-recovery-point).

## File storage backup

Packs and artifacts must be consistent with database metadata. If possible:

- Take snapshots close to the database backup time.
- Pause pack publication, artifact uploads, and cleanup that removes referenced bytes during coordinated filesystem snapshots.
- Include the immutable filesystem blob directory as well as packs and file-backed artifacts.
- Record the application version and migration state.

## Secret recovery

`ENCRYPTION_KEY` is required to decrypt encrypted keys. Losing it means encrypted key values cannot be recovered from the database.

`JWT_SECRET` controls token verification. Rotating it invalidates existing tokens.

Store both in a secure secret manager with versioned backups.

## Restore order

```text
restore config and secrets
start infrastructure
restore database to recoverable time T
restore exact referenced object versions and filesystem volumes
verify version, migration history, roles, and ownership
run only supported migrations if required
run supervisor ready-row reconciliation with writes still stopped
start API
start executor/workers/sensor/notifier and normal supervisor maintenance
validate smoke workflows
```

## Disaster recovery checklist

- Database restored and migrations compatible.
- Pack refs and files match database records.
- Artifact files referenced by artifact versions exist.
- Every referenced immutable object version is readable and matches its recorded size/digest, including runtime log segments.
- Ready-row reconciliation completed before writes resumed.
- Workers can recreate runtime envs.
- RabbitMQ queues are healthy.
- Identity login works.
- Execution token behavior works.
- Notifier WebSocket auth works.

## Related

- [Security Operations](/operations/security/)
- [Docker Operations](/operations/docker/)
- [Kubernetes Operations](/operations/kubernetes/)
