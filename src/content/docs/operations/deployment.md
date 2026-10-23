---
title: "Deployment Overview"
description: "Attune can run with Docker Compose for local/single-host deployments or with Helm/Kubernetes for production-style environments."
sidebar:
  label: "Deployment Overview"
  order: 1
---
Attune can run with Docker Compose for local/single-host deployments or with Helm/Kubernetes for production-style environments.

## Required infrastructure

- Stock PostgreSQL 16 or newer. TimescaleDB is not required. The application repository's Compose and CI defaults use PostgreSQL 18.
- RabbitMQ 3.12+.
- Durable storage for pack archives, artifacts, and runtime logs. The immutable blob backend is `filesystem`, S3, or GCS. Preserve filesystem blob storage separately from file-backed artifacts. Shared-volume deployments also share packs and runtime environments; workers and sensors can instead use [standalone mode](/operations/standalone-workers-and-sensors/) with explicit API transport. Kubernetes supports release-wide object storage without shared PVCs.
- TLS termination and trusted network routing for API/Web UI/notifier.

## Service deployment order

Think of startup as staged readiness groups. Services in the same group can start in parallel once their listed prerequisites are ready.

```text
1. Infrastructure
   - PostgreSQL
   - RabbitMQ

2. Schema and agent bootstrap
   - migrations, after PostgreSQL is healthy
   - init-agent, to populate agent/CLI/MCP binaries in Docker Compose

3. User bootstrap and platform services
   - init-user, after migrations
   - API; requires schema, database, and RabbitMQ readiness, and must be available before API-based core-pack publication
   - executor; requires platform readiness before normal scheduling
   - supervisor and notifier, after schema and required infrastructure are ready
   - action workers / agent workers; require database, RabbitMQ, and agent binaries; current Helm waits for platform readiness, not content readiness
   - sensor workers / sensor-agent containers; require database, RabbitMQ, and agent binaries; current Helm waits for platform readiness, not content readiness

4. Content bootstrap
   - init-packs, through the API after platform readiness; requires a provisioned deployment integration credential
   - content-ready checks admitted core content and fresh runtime hosts

5. User-facing and optional adapters
   - Web UI; Docker Compose waits for API and notifier health, while Helm configures the web container to proxy `/api`, `/auth`, and `/ws` to the API/notifier services
   - optional Helm MCP service, after API is healthy
```

Platform readiness and content readiness are separate. Current Helm starts API and runtime services before publishing the core pack, then checks admitted content and fresh worker hosts. See [Kubernetes Operations](/operations/kubernetes/) for bootstrap prerequisites and rollout requirements.

Helm and Docker Compose express readiness differently: Compose uses `depends_on` health/completion conditions, while Helm uses hook weights plus init containers for selected waits. A service may still require a configured database or RabbitMQ URL even when the chart does not block startup on an explicit wait for that dependency.

## Published images

Both public distributions pull multi-architecture images from `ghcr.io/attune-system`.

- [`attune-docker`](https://github.com/attune-system/attune-docker) requires an explicitly selected compatible image set through `ATTUNE_IMAGE_TAG`. Do not assume that a legacy tag or `edge` supports the current schema and publication contract.
- [`attune-charts`](https://github.com/attune-system/attune-charts) pins platform and core-pack publisher images in each chart release. Verify publication and authenticated pack-publication compatibility before installation.

Keep API, executor, supervisor, notifier, web, agent, migration, and user-initialization images aligned. The chart pins its core-pack publisher independently; use the matching packaged core release.

Core publication uses the ordinary authenticated registrar contract advertised as `pack_publication` by `/health/ready`, revision `authenticated-pack-publication-1`. It does not require the separate managed-runtime `bootstrap_admission` gate to be enabled. Provision the deployment integration credential through the supported operator process; publication does not create identities, assign administrator access, or bypass authorization.

## Fresh installs and existing databases

The current canonical migrations target an empty stock PostgreSQL database. They do not convert a populated TimescaleDB or older pre-production schema. Startup validates migration checksums and never resets a database or rewrites its recorded checksums.

Do not attach an old TimescaleDB data directory or PVC to the stock PostgreSQL image, even when the PostgreSQL major version matches. Preserve that database and its backups until a separate conversion procedure has been designed and tested. A development reset requires explicit approval to discard the specifically identified database only. Keep pack, artifact, blob, and runtime-environment volumes intact.

See [PostgreSQL-only deployment](https://github.com/attune-system/attune/blob/main/docs/deployment/postgresql-only.md) for the migration policy and maintenance-role requirements.

## Volumes

| Volume | Purpose |
| --- | --- |
| `postgres_data_plain_pg18` or database PVC | Fresh native PostgreSQL data. Compose prefixes the volume with its project name. The separate name preserves old TimescaleDB volumes without converting them. |
| `rabbitmq_data` | RabbitMQ state. |
| `packs_data` | Installed pack files. |
| `runtime_envs` | Isolated runtime environments. |
| `artifacts_data` | File-backed artifacts. |
| `blobs_data` | Immutable filesystem objects and log segments in the application repository's Compose deployment. S3/GCS deployments retain exact provider object versions instead. |
| `agent_bin` | Docker Compose volume for statically linked `attune`, `attune-agent`, `attune-sensor-agent`, and `attune-mcp`. Kubernetes uses pod-local `emptyDir` instead. |
| `*_logs` | Service logs. |

## Environments

| Environment | Typical deployment |
| --- | --- |
| Development | The public Docker Compose distribution with a local default user. |
| Staging | Docker Compose or Kubernetes with production-like secrets. |
| Production | Kubernetes/Helm or managed orchestration with external PostgreSQL/RabbitMQ. |

## Production readiness checklist

- Non-default `JWT_SECRET` and `ENCRYPTION_KEY`.
- Coordinated database and exact-version object backups with a tested restore point.
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
