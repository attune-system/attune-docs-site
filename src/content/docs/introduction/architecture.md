---
title: "Architecture"
description: "Attune is a distributed service platform built around PostgreSQL/TimescaleDB, RabbitMQ, and independently scalable Rust services."
sidebar:
  label: "Architecture"
  order: 3
---
Attune is a distributed service platform built around PostgreSQL/TimescaleDB, RabbitMQ, and independently scalable Rust services.

## Service interaction diagram

```mermaid
flowchart TD
    subgraph Clients
        direction LR
        WebUI["Web UI<br/>(React/Vite)"]
        CLI["attune CLI"]
        MCP["attune-mcp"]
    end

    subgraph Platform
        direction LR
        API["attune-api<br/>:8080"]
        Executor["attune-executor"]
        Notifier["attune-notifier<br/>:8081"]
        Worker["attune-worker"]
        Sensor["attune-sensor"]
    end

    subgraph Infrastructure
        direction LR
        PG[("PostgreSQL<br/>TimescaleDB")]
        RMQ{{"RabbitMQ"}}
        Vol[/"Shared<br/>Volumes"\]
    end

    %% Link 0-4: Client connections
    WebUI -->|HTTP| API
    WebUI -->|WS| Notifier
    CLI -->|HTTP| API
    CLI -->|WS| Notifier
    MCP -->|HTTP| API

    %% Link 5-7: API
    API --> PG
    API --> RMQ
    API --> Vol

    %% Link 8-9: Executor
    Executor --> PG
    Executor --> RMQ

    %% Link 10: Notifier
    Notifier -->|LISTEN/NOTIFY| PG

    %% Link 11-13: Worker
    Worker --> RMQ
    Worker --> PG
    Worker --> Vol

    %% Link 14-16: Sensor
    Sensor --> PG
    Sensor --> RMQ
    Sensor --> Vol

    %% Link 17-20: Pack action/sensor callbacks
    Worker -.->|action| API
    Worker -.->|action| Notifier
    Worker -.->|action| MCP
    Sensor -.->|sensor| API

    %% Edge colors by protocol
    %% HTTP (blue):  0,2,4
    linkStyle 0,2,4 stroke:#3b82f6,stroke-width:2px
    %% WebSocket (purple):  1,3
    linkStyle 1,3 stroke:#8b5cf6,stroke-width:2px
    %% SQL (amber):  5,8,10,12,14
    linkStyle 5,8,10,12,14 stroke:#f59e0b,stroke-width:2px
    %% AMQP (green):  6,9,11,15
    linkStyle 6,9,11,15 stroke:#10b981,stroke-width:2px
    %% Filesystem (gray dashed):  7,13,16
    linkStyle 7,13,16 stroke:#6b7280,stroke-width:2px,stroke-dasharray:5 5
    %% Action/sensor callbacks (blue dashed):  17,18,19,20
    linkStyle 17,20 stroke:#3b82f6,stroke-width:1.5px,stroke-dasharray:5 5
    linkStyle 18 stroke:#8b5cf6,stroke-width:1.5px,stroke-dasharray:5 5
    linkStyle 19 stroke:#3b82f6,stroke-width:1.5px,stroke-dasharray:5 5

    %% Node styling
    classDef client fill:#e0e7ff,stroke:#4f46e5,color:#1e1b4b
    classDef core fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    classDef worker fill:#d1fae5,stroke:#059669,color:#064e3b
    classDef sensor fill:#fef3c7,stroke:#d97706,color:#78350f
    classDef infra fill:#f3f4f6,stroke:#6b7280,color:#1f2937

    class WebUI,CLI,MCP client
    class API,Executor,Notifier core
    class Worker worker
    class Sensor sensor
    class PG,RMQ,Vol infra
```

> **Legend** &nbsp; 🔵 HTTP &nbsp; 🟣 WebSocket &nbsp; 🟡 SQL &nbsp; 🟢 AMQP &nbsp; ⚫ Filesystem (dashed) &nbsp; Dashed arrows from Worker/Sensor indicate pack action and sensor callbacks to Attune services.

## Services

| Service | Role |
| --- | --- |
| `attune-api` | REST API gateway, authentication, RBAC checks, pack management, and client interactions. |
| `attune-executor` | Execution lifecycle, rule processing, scheduling, policy enforcement, workflow orchestration, and work queue dispatch. |
| `attune-worker` | Executes actions in configured runtimes such as shell, Python, Node.js, or native binaries. |
| `attune-sensor` | Runs sensors and creates events. |
| `attune-notifier` | Streams real-time notifications over authenticated WebSockets using PostgreSQL LISTEN/NOTIFY. |
| Web UI | React/Vite application for users and admins. |
| `attune-mcp` | Optional MCP server exposing curated Attune API tools to agents and harnesses. |

`attune-agent` and `attune-sensor-agent` are not separate platform services. They are statically linked entrypoint binaries copied into arbitrary action-worker or sensor-worker containers. An action-worker container running `attune-agent` registers and behaves as an Attune worker; a sensor-worker container running `attune-sensor-agent` registers and behaves as an Attune sensor worker. This is how Docker Compose and Kubernetes support agent-based workers without building a custom Attune worker image for every runtime.

## Infrastructure

| Component | Use |
| --- | --- |
| PostgreSQL 16+ with TimescaleDB | Primary data store, event and history hypertables, audit data, workflow/queue state, and LISTEN/NOTIFY. |
| RabbitMQ 3.12+ | Asynchronous work dispatch between API, executor, worker, and sensor services. |
| Shared volumes | Pack files, runtime environments, artifacts, agent binaries, and service logs. Optional for workers/sensors - see [Standalone Workers and Sensors](/operations/standalone-workers-and-sensors/). |

## Runtime flow

### Event-triggered action

```mermaid
sequenceDiagram
    participant S as Sensor
    participant PG as PostgreSQL
    participant RMQ as RabbitMQ
    participant EX as Executor
    participant W as Worker
    participant N as Notifier
    participant UI as Web UI

    S->>PG: Insert event
    PG-->>EX: EventCreated (via MQ)
    EX->>PG: Evaluate matching rules
    EX->>PG: Create enforcement
    EX->>PG: Create execution (requested)
    EX->>RMQ: ExecutionRequested
    EX->>PG: Update execution (scheduled)
    RMQ-->>W: Consume execution
    W->>PG: Update execution (running)
    PG-->>N: NOTIFY execution_updated
    N-->>UI: WebSocket notification
    W->>W: Run action
    W->>PG: Update execution (completed)
    W->>PG: Write artifacts
    PG-->>N: NOTIFY execution_updated
    N-->>UI: WebSocket notification
```

### Workflow action

```mermaid
sequenceDiagram
    participant C as Caller
    participant API as API
    participant EX as Executor
    participant W as Worker
    participant PG as PostgreSQL

    C->>API: Execute workflow action
    API->>PG: Create parent execution
    API->>EX: ExecutionRequested (via MQ)
    EX->>PG: Detect workflow_def
    EX->>PG: Create workflow_execution
    EX->>PG: Mark parent running
    loop For each ready task
        EX->>PG: Create child execution
        EX->>W: Dispatch child (via MQ)
        W->>W: Run task action
        W->>PG: Complete child
        W-->>EX: ExecutionCompleted (via MQ)
        EX->>PG: Evaluate transitions
        EX->>PG: Publish variables
    end
    EX->>PG: Complete parent with output_map
```

### Work queue dispatch

```mermaid
sequenceDiagram
    participant C as Caller
    participant API as API
    participant PG as PostgreSQL
    participant EX as Executor
    participant W as Worker

    C->>API: Enqueue item
    API->>PG: Insert work_queue_item
    loop Executor poll cycle
        EX->>PG: Query enabled queues
        EX->>PG: Lease ready items (priority/age)
        EX->>PG: Create execution
        EX->>PG: Insert work_queue_dispatch
        EX->>W: ExecutionRequested (via MQ)
    end
    W->>W: Run dispatch action
    W->>PG: Complete with queue_ack
    W-->>EX: ExecutionCompleted (via MQ)
    EX->>PG: Apply item outcomes (done/retry/fail)
    EX->>PG: Finalize dispatch record
```

## Data model highlights

- IDs are `BIGINT`/`i64`.
- `event`, `execution_history`, `worker_history`, and `audit_event` are TimescaleDB hypertables; `execution` and `enforcement` remain regular mutable tables.
- Historical execution rows preserve text refs where possible; references to hypertables are plain `BIGINT` rather than foreign keys.
- Entity history is append-only for mutable execution and worker fields.
- Worker cordon metadata records operator intent separately from observed worker status.
- Managed sensor process live state is stored in `sensor_process`; changes are mirrored to `sensor_process_history`.
- Artifacts split metadata from immutable versions; file artifacts are stored on the shared artifact volume.
- Packs own most declarative components and can be system/global or user-created.

## Worker scheduling

The executor filters workers by:

1. Runtime compatibility.
2. Runtime version constraints.
3. Action-level required worker runtimes.
4. Worker labels, selectors, taints/tolerations, affinity, and anti-affinity.
5. Cordon state.
6. Availability and heartbeat health.

Manual executions and workflow tasks can override placement fields. Omitted override fields inherit action defaults; explicit empty objects/arrays clear them.

## Sensor process supervision

Sensor workers run long-lived pack sensor processes. Each process is tracked in `sensor_process` with status, pid, consecutive failures, exit code/signal, timestamps, next restart time, stderr excerpt, and alert bookkeeping.

Managed sensor processes receive rule activate/deactivate lifecycle deltas over authenticated notifier WebSockets rather than direct AMQP subscriptions.

Unexpected exits while enabled rules still reference the sensor are restarted with capped exponential backoff. Repeated failures emit `core.alert` events for routing through normal rules.

Sensor placement uses the same selector/toleration/affinity vocabulary as action placement, but matches sensor-worker labels and taints configured under `sensor.labels` and `sensor.taints`.

## Operational alerts

`core.alert` is a built-in trigger for unexpected Attune component failures. Current emitters include unexpected non-cordoned worker loss, executions abandoned due to worker loss, and repeated managed sensor-process failures.

## Notifications

The notifier subscribes to PostgreSQL channels in a single batch and sends typed WebSocket messages. WebSocket clients authenticate at connection time using either:

- `Authorization: Bearer <jwt>` for non-browser clients.
- Browser subprotocols `attune.v1` and `attune.jwt.<jwt>`.

Tokens in query strings are intentionally not accepted. Mid-connection token expiration closes the socket with code `4401`.

## Deployment shapes

- **Docker Compose** is the standard local and single-host orchestration path.
- **Helm/Kubernetes** supports production-style deployments, hook jobs, and agent workers.
- **Agent workers** allow Attune to run actions inside arbitrary container images without building a custom worker image for every runtime.

## Next

- [Core Concepts](/introduction/core-concepts/)
- [Deployment Overview](/operations/deployment/)
- [Operational Visibility](/operations/visibility/)
- [Monitoring and Troubleshooting](/operations/monitoring/)
