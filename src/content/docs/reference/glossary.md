---
title: "Glossary"
description: "| Term | Meaning | | --- | --- | | Action | Executable automation unit with metadata and implementation. | | Agent worker | Universal attune-agent worker injected into an arbitrary"
sidebar:
  label: "Glossary"
  order: 6
---
| Term | Meaning |
| --- | --- |
| Action | Executable automation unit with metadata and implementation. |
| Agent worker | Universal `attune-agent` worker injected into an arbitrary container. |
| Alert | `core.alert` event emitted for Attune operational exceptions. |
| Artifact | Versioned execution output such as files, progress, logs, or URLs. |
| Data Cache | Owner-scoped, versioned external dataset read through point, multi-ID, or cursor APIs. |
| Cache generation | Immutable dataset snapshot progressing through staging, ready, active, retired, or failed state. |
| Cache namespace | Normalized dataset name combined with an explicit system, identity, pack, action, or sensor owner. |
| Cordon | Operator intent flag that prevents new scheduling on a worker without marking it unhealthy. |
| Enforcement | Record that a rule fired for an event. |
| Event | Immutable trigger occurrence. |
| Execution | A single action or workflow run. |
| Execution token | Narrow JWT issued to an execution when permission refs are present. |
| Identity | User or service account. |
| Inquiry | Human-in-the-loop approval/input request. |
| Key | Scoped secret/config value, optionally encrypted. |
| MCP | Model Context Protocol; Attune provides `attune-mcp` for curated API tool access. |
| Pack | Bundle of actions, sensors, triggers, rules, workflows, runtimes, queues, and config. |
| Pack index | Ordered registry source listing installable packs. |
| Permission set | Named group of permissions that can be assigned or delegated to executions. |
| Queue item | Durable work item in a work queue. |
| Role | Opaque label assigned to identities; permission sets can map to roles. |
| Rule | Maps trigger events to action/workflow executions. |
| Runtime | Execution environment definition for actions/sensors. |
| Sensor | Component that monitors external/internal conditions and emits events. |
| Sensor process | Durable live state for a managed long-running pack sensor process. |
| Sensor worker | Worker-role service that supervises sensor processes and emits sensor events. |
| Trigger | Event type definition and payload schema. |
| Worker | Service that runs actions, or the shared inventory concept for action and sensor workers. |
| Workflow | Action linked to a graph of task actions and transitions. |

## Common refs

| Ref type | Example |
| --- | --- |
| Pack | `core` |
| Action | `core.echo` |
| Trigger | `core.webhook_received` |
| Sensor | `core.timer_sensor` |
| Workflow action | `my_pack.deploy` |
| Artifact | `my_pack.build_log` |

## Related

- [Core Concepts](/introduction/core-concepts/)
- [Data Caches](/administration/data-caches/)
- [Architecture](/introduction/architecture/)
- [Operational Visibility](/operations/visibility/)
