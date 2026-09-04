---
title: "Service map"
description: "The processes that run Attune and the responsibilities each process owns."
sidebar:
  label: "Service map"
  order: 1
---
Attune separates client-facing control, orchestration, execution, sensor supervision, live updates, and maintenance into independently runnable processes.

## Responsibility map

| Concern | Primary owner | Other participants |
| --- | --- | --- |
| HTTP resources, authentication, and RBAC | API | PostgreSQL and RabbitMQ |
| Rule evaluation and execution scheduling | Executor | API and sensors publish inputs |
| Action processes and terminal action state | Worker | Executor dispatches and consumes completion |
| Managed sensor processes | Sensor service | API, notifier, and pack sensor binaries |
| Live client updates | Notifier | PostgreSQL trigger publishers |
| Retention and stale-state repair | Supervisor | RabbitMQ wakeups where available |
| Terminal and agent integrations | CLI and MCP | API and notifier |

## Deployment map

```mermaid
flowchart TB
    subgraph Clients
        Web[Web UI]
        CLI[CLI]
        MCP[MCP server]
    end
    subgraph Control
        API[API]
        Notifier[Notifier]
    end
    subgraph Orchestration
        Executor[Executor]
        Supervisor[Supervisor]
    end
    subgraph Workloads
        Worker[Worker or agent]
        Sensor[Sensor service or sensor agent]
        Child[Managed sensor processes]
    end
    MQ{{RabbitMQ}}
    PG[(PostgreSQL)]
    Web --> API
    Web --> Notifier
    CLI --> API
    CLI --> Notifier
    MCP --> API
    API --> PG
    API --> MQ
    MQ --> Executor
    Executor --> PG
    Executor --> MQ
    MQ --> Worker
    Sensor --> PG
    PG --> Notifier
    Supervisor --> PG
    Sensor --> Child
```

The worker and sensor agent binaries change bootstrap and runtime discovery, not service ownership. Managed sensor binaries are child processes owned by the sensor service rather than additional platform services.
