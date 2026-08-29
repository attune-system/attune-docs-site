---
title: "Kubernetes Operations"
description: "Attune's Helm chart supports application services, bootstrap jobs, optional MCP, and action/sensor worker pools that run agent binaries."
sidebar:
  label: "Kubernetes Operations"
  order: 4
---
The public [`attune-charts` repository](https://github.com/attune-system/attune-charts) is the supported Helm distribution for Attune. Use its packaged `attune/attune` chart instead of the development chart in the application source repository.

## Install the chart

Add the Attune chart repository:

```bash
helm repo add attune https://raw.githubusercontent.com/attune-system/attune-charts/main
helm repo update attune
helm search repo attune/attune
```

Create a `values.yaml` file with production secrets and your public hostname:

```yaml
security:
  jwtSecret: REPLACE_WITH_A_RANDOM_SECRET
  encryptionKey: REPLACE_WITH_AT_LEAST_32_RANDOM_BYTES

database:
  password: REPLACE_WITH_A_DATABASE_PASSWORD

rabbitmq:
  password: REPLACE_WITH_A_RABBITMQ_PASSWORD

bootstrap:
  testUser:
    login: admin@example.com
    displayName: Attune Administrator

web:
  config:
    apiUrl: ""
    wsUrl: ""
  ingress:
    enabled: true
    className: traefik
    hosts:
      - host: attune.example.com
        paths:
          - path: /
            pathType: Prefix
    tls:
      - hosts:
          - attune.example.com
        secretName: attune-example-com-tls
```

Create `attune-example-com-tls` with your certificate controller or another trusted certificate process before exposing the ingress. Do not send login or session traffic through a plaintext public ingress.

Install or upgrade Attune:

```bash
helm upgrade --install attune attune/attune \
  --namespace attune \
  --create-namespace \
  --values values.yaml \
  --wait \
  --wait-for-jobs
```

The chart installs the current approved release from `ghcr.io/attune-system`. Review the chart's [`values.yaml`](https://github.com/attune-system/attune-charts/blob/main/charts/attune/values.yaml) before each upgrade.

The current bootstrap job creates the first account with the development password `TestPass123!`. Change that password after the first login.

## Core deployment concepts

Kubernetes deployments should include:

- API, executor, supervisor, notifier, web UI, and action and sensor worker pools.
- Migration, default-user, and core-pack initialization jobs.
- Persistent volumes for packs, artifacts, and runtime envs; agent binaries are copied into per-pod `emptyDir` volumes.
- A Kubernetes Secret, or `security.existingSecret`, containing JWT/encryption keys plus database, RabbitMQ, and bootstrap values.
- Service routing for the API, notifier WebSocket, and Web UI. The web ingress proxies `/api`, `/auth`, and `/ws` through one host.
- A separate ClusterIP service when `mcp.enabled` is `true`. The web ingress does not expose MCP.

## Bootstrap images

The Helm release uses bootstrap images as well as application images:

- `attune/migrations`
- `attune/init-user`
- `attune/init-packs`

Fresh installations run these as release Jobs. Upgrades run them as ordered `pre-upgrade` hooks before the Deployments roll out.

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

## Optional MCP service

The current MCP service has no inbound client authentication and signs in to Attune with its configured account. A ClusterIP is not an authentication boundary. Leave `mcp.enabled` set to `false` in production and in any cluster where untrusted workloads can reach services in the Attune namespace.

For an isolated evaluation cluster where every workload is trusted, enable the service with:

```bash
helm upgrade --install attune attune/attune \
  --namespace attune \
  --reuse-values \
  --set mcp.enabled=true
```

The chart creates a ClusterIP service on port `8090`. Do not add an ingress or external route. Disable the service after evaluation.

## Operational checklist

- Confirm the migration and initialization Jobs succeeded for the current release revision.
- Confirm init jobs created the default/admin user and loaded core packs.
- Confirm packs, runtime envs, and artifacts PVCs are mounted read/write where needed.
- Confirm all services share compatible config and secrets.
- Confirm notifier and API share `security.jwt_secret`.
- Confirm workers register and heartbeat.
- Confirm agent workers detect expected runtimes.
- Confirm pack binary architecture matches node/container architecture.

## Related

- [Deployment Overview](/operations/deployment/)
- [`attune-charts` distribution](https://github.com/attune-system/attune-charts)
- [Runtime Environments](/pack-development/runtime-environments/)
- [Monitoring and Troubleshooting](/operations/monitoring/)
