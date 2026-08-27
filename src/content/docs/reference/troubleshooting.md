---
title: "Troubleshooting Index"
description: "Use this symptom index to find the right manual page quickly."
sidebar:
  label: "Troubleshooting Index"
  order: 7
---
Use this symptom index to find the right manual page quickly.

![Audit log used as an operational troubleshooting surface](/screenshots/Troubleshooting-Index.png)

| Symptom | Start here |
| --- | --- |
| Cannot log in | [Authentication and Identity](/administration/authentication-and-identity/) |
| User cannot see a pack/key/artifact | [Permissions and RBAC](/administration/permissions-and-rbac/) |
| Pack upload fails | [Pack Administration](/administration/packs/) |
| Action gets no `ATTUNE_API_TOKEN` | [Permissions and RBAC](/administration/permissions-and-rbac/), [Writing Actions](/pack-development/actions/) |
| Action cannot import Python/Node dependency | [Runtime Environments](/pack-development/runtime-environments/) |
| No worker is eligible | [Monitoring and Troubleshooting](/operations/monitoring/) |
| Worker or sensor worker is intentionally offline | [Operational Visibility](/operations/visibility/), [Monitoring and Troubleshooting](/operations/monitoring/) |
| Execution becomes `abandoned` | [Operational Visibility](/operations/visibility/), [Monitoring and Troubleshooting](/operations/monitoring/) |
| Sensor repeatedly exits or restarts | [Operational Visibility](/operations/visibility/), [Writing Sensors](/pack-development/sensors/) |
| Need to route Attune operational alerts | [Operational Visibility](/operations/visibility/), [Writing and Managing Rules](/pack-development/rules/) |
| Workflow transition does not fire | [Writing Workflows](/pack-development/workflows/), [Monitoring and Troubleshooting](/operations/monitoring/) |
| Queue items remain pending | [Queue Administration](/administration/queues/), [Monitoring and Troubleshooting](/operations/monitoring/) |
| Artifact download fails | [Artifact Administration](/administration/artifacts/), [Permissions and RBAC](/administration/permissions-and-rbac/) |
| WebSocket connection fails | [Authentication and Identity](/administration/authentication-and-identity/), [Monitoring and Troubleshooting](/operations/monitoring/) |
| Agent worker misses a runtime | [Runtime Environments](/pack-development/runtime-environments/), [Kubernetes Operations](/operations/kubernetes/) |
| Docker pack files are stale | [Docker Operations](/operations/docker/), [Pack Administration](/administration/packs/) |
| Kubernetes install fails before app starts | [Kubernetes Operations](/operations/kubernetes/) |
| Need to restore data | [Backup and Recovery](/operations/backup-and-recovery/) |
| Need to rotate secrets | [Security Operations](/operations/security/) |

## General triage order

1. Identify the failing entity: pack, action, execution, workflow, queue, artifact, sensor, or user.
2. Check the relevant service logs.
3. Check RBAC/permission refs before assuming code failure.
4. Check runtime/worker eligibility.
5. Check RabbitMQ and database health.
6. Reproduce with the CLI when UI behavior is unclear.

## Related

- [Monitoring and Troubleshooting](/operations/monitoring/)
- [CLI Reference](/reference/cli/)
- [API Reference](/reference/api/)
