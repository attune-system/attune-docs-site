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

## PostgreSQL and TimescaleDB

Monitor:

- Connection pool usage.
- Hypertable chunk growth.
- Compression/retention policies.
- Continuous aggregate refreshes.
- Audit/history table growth.
- Slow queries on execution, event, enforcement, queue, artifact, and history endpoints.

Large execution results should remain on the live execution row; history stores digest summaries for large mutable fields.

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

## Build performance

Docker builds use optimized Dockerfiles with selective crate copying and BuildKit cache mounts. Keep cache strategy and `RUST_MIN_STACK` settings when modifying Dockerfiles.

## Related

- [Monitoring and Troubleshooting](/operations/monitoring/)
- [Queue Administration](/administration/queues/)
- [Deployment Overview](/operations/deployment/)
