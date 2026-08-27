---
title: "Deployment Overview"
description: "Attune can run with Docker Compose for local/single-host deployments or with Helm/Kubernetes for production-style environments."
sidebar:
  label: "Deployment Overview"
  order: 1
---
Attune can run with Docker Compose for local/single-host deployments or with Helm/Kubernetes for production-style environments.

## Required infrastructure

- PostgreSQL 16+ with TimescaleDB 2.17+.
- RabbitMQ 3.12+.
- Shared storage for packs, artifacts, and runtime environments. Docker Compose also uses an `agent_bin` volume; Kubernetes agent pools copy agent binaries into pod-local `emptyDir` volumes with an init container. Shared storage is optional for workers and sensors — they can operate in [standalone mode](/operations/standalone-workers-and-sensors/) using HTTP-based transport.
- TLS termination and trusted network routing for API/Web UI/notifier.

## Service deployment order

Think of startup as staged readiness groups. Services in the same group can start in parallel once their listed prerequisites are ready.

```text
1. Infrastructure
   - PostgreSQL/TimescaleDB
   - RabbitMQ

2. Schema and binary bootstrap
   - migrations, after PostgreSQL is healthy
   - init-pack-binaries, to populate native pack binaries in Docker Compose
   - init-agent, to populate agent/CLI/MCP binaries in Docker Compose

3. Data bootstrap
   - init-user, after migrations
   - init-packs, after migrations; Docker Compose also waits for init-pack-binaries, while Helm orders init-user before init-packs with hook weights

4. Core application services
   - API; Compose waits for migrations, init-user, init-packs, init-agent, database, and RabbitMQ, while Helm waits for schema, packs, and RabbitMQ
   - executor; Compose waits for migrations, init-user, init-packs, database, and RabbitMQ, while Helm waits for schema and packs
   - notifier; Compose waits for migrations, database, and RabbitMQ, while Helm waits for schema
   - action workers / agent workers; Compose waits for migrations, init-user, init-packs, init-agent, database, and RabbitMQ, while Helm copies agent binaries with an init container and waits for schema, packs, and RabbitMQ
   - sensor workers / sensor-agent containers; Compose waits for migrations, init-user, init-packs, init-agent, database, and RabbitMQ, while Helm copies agent binaries with an init container and waits for schema, packs, and RabbitMQ

5. User-facing and optional adapters
   - Web UI; Docker Compose waits for API and notifier health, while Helm configures the web container to proxy `/api`, `/auth`, and `/ws` to the API/notifier services
   - optional MCP HTTP service, after API is healthy
```

The executor, notifier, action workers, and sensor workers do not need to wait for the API process to become healthy. They need the database/message queue and relevant bootstrap jobs. Some worker and sensor actions use `ATTUNE_API_URL` at execution time, but that is not the same as a service startup dependency.

Helm and Docker Compose express readiness differently: Compose uses `depends_on` health/completion conditions, while Helm uses hook weights plus init containers for selected waits. A service may still require a configured database or RabbitMQ URL even when the chart does not block startup on an explicit wait for that dependency.

## Images and builds

Published multi-architecture container packages use the `edge` tag for the latest build:

| Package | Pull reference | Build source |
| --- | --- | --- |
| [API](https://git.rdrx.app/attune-system/-/packages/container/attune%2Fapi/edge) | `git.rdrx.app/attune-system/attune/api:edge` | `docker/Dockerfile.runtime` |
| [Executor](https://git.rdrx.app/attune-system/-/packages/container/attune%2Fexecutor/edge) | `git.rdrx.app/attune-system/attune/executor:edge` | `docker/Dockerfile.runtime` |
| [Notifier](https://git.rdrx.app/attune-system/-/packages/container/attune%2Fnotifier/edge) | `git.rdrx.app/attune-system/attune/notifier:edge` | `docker/Dockerfile.runtime` |
| [Agent binary bundle image](https://git.rdrx.app/attune-system/-/packages/container/attune%2Fagent/edge) | `git.rdrx.app/attune-system/attune/agent:edge` | `docker/Dockerfile.agent-package` |
| [Migrations](https://git.rdrx.app/attune-system/-/packages/container/attune%2Fmigrations/edge) | `git.rdrx.app/attune-system/attune/migrations:edge` | `docker/Dockerfile.migrations-package` |
| [Init user](https://git.rdrx.app/attune-system/-/packages/container/attune%2Finit-user/edge) | `git.rdrx.app/attune-system/attune/init-user:edge` | `docker/Dockerfile.init-user-package` |
| [Init packs](https://git.rdrx.app/attune-system/-/packages/container/attune%2Finit-packs/edge) | `git.rdrx.app/attune-system/attune/init-packs:edge` | `docker/Dockerfile.init-packs-package` |
| [Web UI](https://git.rdrx.app/attune-system/-/packages/container/attune%2Fweb/edge) | `git.rdrx.app/attune-system/attune/web:edge` | `docker/Dockerfile.web` |

Local and Compose builds also use:

- `docker/Dockerfile.optimized` for the API, executor, and notifier Rust services.
- `docker/Dockerfile.web` for the Web UI.
- `docker/Dockerfile.mcp` for an optional local MCP image. The publish workflow does not currently publish a standalone MCP container package; the `attune-mcp` binary is included in the agent bundle image.
- `docker/Dockerfile.agent` for statically linked agent, sensor-agent, CLI, and MCP binaries used by Docker Compose's `init-agent`.
- `docker/Dockerfile.pack-binaries` for pack-native binaries.

Rust Dockerfiles use BuildKit cache mounts and set a larger `RUST_MIN_STACK` during release compilation.

## Volumes

| Volume | Purpose |
| --- | --- |
| `postgres_data` | PostgreSQL data. |
| `rabbitmq_data` | RabbitMQ state. |
| `packs_data` | Installed pack files. |
| `runtime_envs` | Isolated runtime environments. |
| `artifacts_data` | File-backed artifacts. |
| `agent_bin` | Docker Compose volume for statically linked `attune`, `attune-agent`, `attune-sensor-agent`, and `attune-mcp`. Kubernetes uses pod-local `emptyDir` instead. |
| `*_logs` | Service logs. |

## Environments

| Environment | Typical deployment |
| --- | --- |
| Development | Docker Compose with local source and default user. |
| Staging | Docker Compose or Kubernetes with production-like secrets. |
| Production | Kubernetes/Helm or managed orchestration with external PostgreSQL/RabbitMQ. |

## Production readiness checklist

- Non-default `JWT_SECRET` and `ENCRYPTION_KEY`.
- Database backups and restore test.
- RabbitMQ durability and monitoring.
- Artifact and pack volume backups.
- TLS and CORS configured.
- Identity provider configured.
- Admin roles limited.
- Audit logs reviewed.
- Worker capacity matches expected action runtime needs.
- Notifier WebSocket authentication verified.
- Pack sources reviewed and pinned.

## Related

- [Docker Operations](/operations/docker/)
- [Kubernetes Operations](/operations/kubernetes/)
- [Security Operations](/operations/security/)
