---
title: "Performance and Scaling"
description: "Scale Attune by separating bottlenecks: API traffic, executor scheduling, worker capacity, database throughput, RabbitMQ queue depth, and artifact storage."
sidebar:
  label: "Performance and Scaling"
  order: 10
---
Scale Attune by separating bottlenecks: API traffic, executor scheduling, worker capacity, database throughput, RabbitMQ queue depth, and artifact storage.

## API

Scale API instances horizontally behind a load balancer. Ensure all instances share:

- Database.
- RabbitMQ.
- Pack/artifact storage.
- The same immutable blob backend, bucket/prefix, and provider access policy. S3 requires versioning.
- JWT/encryption configuration.
- CORS and identity-provider configuration.

## Executor

The executor owns scheduling, workflow advancement, and queue dispatch. Treat executor high availability carefully because duplicate schedulers can create duplicate work unless coordination is in place for each responsibility.

Watch:

- Scheduling latency.
- Workflow child execution fan-out.
- Queue dispatcher lease/publish recovery.
- Completion listener lag.

## Workers

Scale workers by runtime and placement needs:

- More shell/Python/Node/full workers for general throughput.
- Agent workers for specialized images.
- Labeled/tainted workers for GPU, region, or sensitive workloads.

Workers should have enough CPU, memory, disk, and runtime env storage for expected actions.

## RabbitMQ

Monitor:

- Queue depth.
- Consumer count.
- Publish/ack rates.
- Dead-letter queues.
- Connection churn.

Persistent backlogs usually mean worker capacity, runtime setup, or scheduling filters need attention.

## PostgreSQL

Monitor:

- Connection pool usage.
- Daily UTC partition coverage for `event`, `execution_history`, and `audit_event`, including DEFAULT backlog and deferred DDL.
- Runtime retention backlog, confirmed row deletions, and partition drops as separate counts.
- Hourly summary coverage, dirty hours, refresh backlog, and job schedules.
- Audit/history table growth.
- Table/index size, disk headroom, WAL generation, replica lag, checkpoints, dead tuples, and autovacuum.
- Slow queries on execution, event, enforcement, queue, artifact, and history endpoints.

Large execution results should remain on the live execution row; history stores digest summaries for large mutable fields.

`worker_history` and `sensor_process_history` are ordinary tables with bounded row deletion. The supervisor drops fully expired daily leaves for native partitioned targets and deletes expired boundary/DEFAULT rows in bounded batches. API analytics use clean completed-hour summaries, with raw queries for dirty hours, gaps, and partial hours. Summaries follow raw retention rather than a separate retention window.

There is no TimescaleDB columnstore compression in the current schema. Measure retained table and index sizes again when planning capacity. Native partitioning and summary status do not establish production throughput or latency guarantees. See [Supervisor Operations](/operations/supervisor/#native-partitions-and-hourly-summaries) for configuration and status.

## Work queues

Tune:

- Concurrency.
- Batch size.
- Coalescing.
- Sequential cooldown.
- Retry limit.
- Priority strategy.

If a queue's target action is slow, increasing queue concurrency helps only if enough eligible workers exist.

## Artifacts

File-backed artifacts reduce database byte load but require storage capacity, inode monitoring, retention policy, and backup planning.

For API-backed artifacts and runtime logs, monitor object-backend request rates, errors, retained versions, and storage growth. Coordinate object retention with PostgreSQL recovery as described in [Backup and Recovery](/operations/backup-and-recovery/).

## Build performance

Docker builds use optimized Dockerfiles with selective crate copying and BuildKit cache mounts. Keep cache strategy and `RUST_MIN_STACK` settings when modifying Dockerfiles.

## Related

- [Monitoring and Troubleshooting](/operations/monitoring/)
- [Queue Administration](/administration/queues/)
- [Deployment Overview](/operations/deployment/)
