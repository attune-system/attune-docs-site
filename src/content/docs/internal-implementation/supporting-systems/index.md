---
title: "Protocol references"
description: "Internal delivery contracts for live notifications and asynchronous service messages."
sidebar:
  label: "Overview"
  order: 1
---
Attune uses two different asynchronous delivery systems:

| System | Purpose | Delivery model |
| --- | --- | --- |
| [Notifier WebSocket](/internal-implementation/supporting-systems/notifier-websocket/) | Push database changes to authenticated clients and managed sensors | Best-effort live stream with no replay |
| [RabbitMQ](/internal-implementation/supporting-systems/rabbitmq/) | Deliver work and lifecycle messages between services | Durable queues for work, ephemeral queues for replica-local invalidation |

Do not confuse RabbitMQ queues with user-visible [Work queues](/internal-implementation/data-structures/work-queues/). Work queues are persisted business objects whose dispatch eventually creates normal executions. RabbitMQ is internal transport between processes.
