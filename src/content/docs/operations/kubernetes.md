---
title: "Kubernetes Operations"
description: "Attune's Helm chart supports application services, bootstrap jobs, optional MCP, and action/sensor worker pools that run agent binaries."
sidebar:
  label: "Kubernetes Operations"
  order: 4
---
Attune's Helm chart supports application services, bootstrap jobs, optional MCP, and action/sensor worker pools that run agent binaries.

## Core deployment concepts

Kubernetes deployments should include:

- API, executor, notifier, web UI, and action/sensor worker pools.
- Migration, default-user, and core-pack initialization jobs.
- Persistent volumes for packs, artifacts, and runtime envs; agent binaries are copied into per-pod `emptyDir` volumes.
- A Kubernetes Secret, or `security.existingSecret`, containing JWT/encryption keys plus database, RabbitMQ, and bootstrap values.
- Service routing for API, notifier WebSocket, Web UI, and optional MCP; the chart's Web ingress targets the web service, whose nginx config proxies `/api`, `/auth`, and `/ws`.

## Bootstrap images

The Helm install depends on bootstrap hook images as well as app images:

- `attune/migrations`
- `attune/init-user`
- `attune/init-packs`

Keep these in publishing and manifest matrices.

## Agent workers

Action and sensor worker deployments use an init-container pattern:

```text
init-agent init container
  -> copies statically linked agent binaries into emptyDir
action worker container
  -> arbitrary image runs /opt/attune/agent/attune-agent
sensor worker container
  -> arbitrary image runs /opt/attune/agent/attune-sensor-agent
```

Each `actionWorkers[]` or `sensorWorkers[]` values entry can set:

- Image.
- Environment variables.
- Explicit `runtimes` or runtime auto-detection.
- Resources.
- `nodeSelector`.
- `tolerations`.
- `runtimeClassName` for GPU or specialized scheduling.

## Registry notes

Gitea/Forgejo registries can reject BuildKit attestation manifests. Image publishing should keep `--provenance=false --sbom=false` on Rust service/agent/bootstrap and web images unless the registry is upgraded and verified.

Rust binary bundles are published through Gitea generic packages rather than ORAS/OCI artifacts because ORAS compatibility has been unreliable in this environment.

## Operational checklist

- Confirm migrations ran once and succeeded.
- Confirm init jobs created the default/admin user and loaded core packs.
- Confirm packs, runtime envs, and artifacts PVCs are mounted read/write where needed.
- Confirm all services share compatible config and secrets.
- Confirm notifier and API share `security.jwt_secret`.
- Confirm workers register and heartbeat.
- Confirm agent workers detect expected runtimes.
- Confirm pack binary architecture matches node/container architecture.

## Related

- [Deployment Overview](/operations/deployment/)
- [Runtime Environments](/pack-development/runtime-environments/)
- [Monitoring and Troubleshooting](/operations/monitoring/)
