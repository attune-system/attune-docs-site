---
title: "Backup and Recovery"
description: "Back up Attune as a system, not just a database. Packs, artifacts, runtime environments, message queues, and secrets all affect recovery."
sidebar:
  label: "Backup and Recovery"
  order: 9
---
Back up Attune as a system, not just a database. Packs, artifacts, runtime environments, message queues, and secrets all affect recovery.

## What to back up

| Data | Required? | Notes |
| --- | --- | --- |
| PostgreSQL/TimescaleDB | Yes | Primary records, identities, RBAC, executions, events, audit/history, queues, artifacts metadata. |
| Pack storage | Yes | Installed pack files and generated static pack binaries. |
| Artifact storage | Yes if artifacts matter | File-backed artifact contents. |
| RabbitMQ | Recommended | Durable in-flight work and broker state. |
| Config/secrets | Yes | Config files, Kubernetes secrets, JWT/encryption keys, identity-provider credentials. |
| Runtime envs | Optional | Can usually be recreated, but backing up may speed recovery. |

## Database backup

Use your organization's PostgreSQL backup standard. Include TimescaleDB extension state and all schemas used by Attune.

Test restores regularly by:

1. Restoring to an isolated environment.
2. Running migrations if needed.
3. Starting API/executor/workers.
4. Listing packs, executions, queues, artifacts, and identities.
5. Running a smoke action.

## File storage backup

Packs and artifacts must be consistent with database metadata. If possible:

- Take snapshots close to the database backup time.
- Pause pack install/delete and artifact delete operations during snapshots.
- Record the application version and migration state.

## Secret recovery

`ENCRYPTION_KEY` is required to decrypt encrypted keys. Losing it means encrypted key values cannot be recovered from the database.

`JWT_SECRET` controls token verification. Rotating it invalidates existing tokens.

Store both in a secure secret manager with versioned backups.

## Restore order

```text
restore config and secrets
start infrastructure
restore database
restore packs/artifacts volumes
run migrations if required
start API
start executor/workers/sensor/notifier
validate smoke workflows
```

## Disaster recovery checklist

- Database restored and migrations compatible.
- Pack refs and files match database records.
- Artifact files referenced by artifact versions exist.
- Workers can recreate runtime envs.
- RabbitMQ queues are healthy.
- Identity login works.
- Execution token behavior works.
- Notifier WebSocket auth works.

## Related

- [Security Operations](/operations/security/)
- [Docker Operations](/operations/docker/)
- [Kubernetes Operations](/operations/kubernetes/)
