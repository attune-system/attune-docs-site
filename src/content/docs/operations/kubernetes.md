---
title: "Kubernetes Operations"
description: "Attune's Helm chart supports application services, bootstrap jobs, optional MCP, and action/sensor worker pools that run agent binaries."
sidebar:
  label: "Kubernetes Operations"
  order: 4
---
The public [`attune-charts` repository](https://github.com/attune-system/attune-charts) is the supported Helm distribution for Attune. Use its packaged `attune/attune` chart instead of the development chart in the application source repository.

## Prepare a fresh installation

The current chart targets stock PostgreSQL 16 or newer and bundles PostgreSQL 18. It does not convert a populated TimescaleDB installation. Its read-only pre-upgrade check rejects TimescaleDB, PostgreSQL older than 16, and failed database connections. Do not bypass hooks, drop the extension to evade the check, or mount an old TimescaleDB PVC under the stock image. See [Deployment Overview](/operations/deployment/#fresh-installs-and-existing-databases).

Use coordinated API, worker, and publisher images that implement the ordinary authenticated publication contract. `/health/ready` must advertise `pack_publication` with integer `protocol_version: 1`, integer `client_version: 1`, revision `authenticated-pack-publication-1`, `authorization: registrar`, and exactly the `immutable_release` and `atomic_deployment` components. The separate managed-runtime `bootstrap_admission` gate need not be enabled.

A chart render does not prove that compatible images are published. Confirm release support before attempting installation. Pin `corePack.version` to the matching packaged core release. Set optional `corePack.digest` only from the SHA-256 of its canonical immutable `pack.tar.gz`, including the real native timer binaries. It is not an OCI image digest or a source-upload tarball hash. See the [chart publication requirements](https://github.com/attune-system/attune-charts/blob/main/charts/attune/README.md#use-rwx-free-object-storage).

Add the Attune chart repository:

```bash
helm repo add attune https://raw.githubusercontent.com/attune-system/attune-charts/main
helm repo update attune
helm search repo attune/attune
```

Clone the chart repository to use its setup generator. This example uses bundled PostgreSQL and RabbitMQ for a small single-node installation with a default StorageClass. Install Git, OpenSSL, Helm, and kubectl first:

```bash
git clone https://github.com/attune-system/attune-charts.git
cd attune-charts
./scripts/generate-attune-setup.sh \
  --database-mode bundled \
  --admin-email admin@example.com \
  --output-dir attune-setup-native
```

Review the generated `values.yaml` and `secrets.yaml`. The generator sets the required `security.existingSecret`, creates separate administrator and service credentials for the bundled database/broker, and leaves ingress disabled. Inline `security.jwtSecret`, `security.encryptionKey`, and password values are not supported replacements for the runtime Secret.

The generator defaults to CloudNativePG when `--database-mode` is omitted. That mode requires an installed CloudNativePG operator and applying the generated `postgresql.yaml` before Helm. For multi-node shared storage, use a tested RWX StorageClass with `--shared-storage-rwx-class`, or configure release-wide object storage. See the [chart backend guide](https://github.com/attune-system/attune-charts/blob/main/charts/attune/README.md#choose-data-backends).

## Provision publication access

Core-pack publication requires an existing deployment integration token that authenticates to the target Attune API and has the required registrar grants. Provision that credential through the supported operator authentication and token-management process. Neither the generator nor the core-pack Job creates a deployment identity, assigns administrator access, or grants permissions.

For a fresh system, coordinate initial administrator/API access and credential provisioning before the publication Job runs. Do not mint tokens directly from the signing secret or bypass authorization.

Keep the token in a private local file containing only its value, then apply the generated namespace and Secrets. Replace the token path below with your provisioned credential file:

```bash
kubectl apply -f attune-setup-native/namespace.yaml
kubectl apply -f attune-setup-native/secrets.yaml
kubectl --namespace attune create secret generic attune-core-deployment \
  --from-file=token=/secure/path/attune-deployment-token
```

Save this non-secret overlay as `bootstrap-values.yaml`:

```yaml
corePack:
  deploymentTokenSecret: attune-core-deployment
  deploymentTokenKey: token
```

Keep `secrets.yaml`, `credentials.state`, and the token file out of source control. The generator's `--force` option reuses saved credentials, but not its original options. Repeat all options when regenerating. `--rotate-secrets` requires a coordinated rotation, not an ordinary upgrade.

## Render and install

Render locally before installing:

```bash
helm template attune ./charts/attune \
  --namespace attune \
  --values attune-setup-native/values.yaml \
  --values bootstrap-values.yaml > attune-rendered.yaml
```

After verifying image/publication support and provisioning the credential, install the matching chart release:

```bash
helm upgrade --install attune attune/attune \
  --namespace attune \
  --values attune-setup-native/values.yaml \
  --values bootstrap-values.yaml \
  --wait \
  --wait-for-jobs \
  --timeout 20m
```

The generator writes `TEST_LOGIN=admin@example.com`, `TEST_DISPLAY_NAME=Attune Administrator`, and `TEST_PASSWORD=TestPass123!` into the runtime Secret for this example. The current `init-user` script reads these `TEST_*` variables; `bootstrap.testUser` values do not configure the account. It ensures the platform-owned `core.admin` assignment and does not overwrite an existing operator-changed password.

Keep ingress disabled for first login. Forward the web Service locally, sign in at `http://127.0.0.1:8080`, and change the bootstrap password:

```bash
kubectl --namespace attune port-forward service/attune-attune-web 8080:80
```

Then save an `ingress-values.yaml` overlay with your hostname and TLS Secret:

```yaml
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

Create `attune-example-com-tls` in the `attune` namespace through your certificate controller or another trusted certificate process before enabling ingress. Do not expose the default password or send session traffic through a plaintext public ingress.

Install or upgrade Attune:

```bash
helm upgrade --install attune attune/attune \
  --namespace attune \
  --values attune-setup-native/values.yaml \
  --values bootstrap-values.yaml \
  --values ingress-values.yaml \
  --wait \
  --wait-for-jobs \
  --timeout 20m
```

The chart selects images from `ghcr.io/attune-system`. Review its [`values.yaml`](https://github.com/attune-system/attune-charts/blob/main/charts/attune/values.yaml) and confirm compatible published images before each upgrade.

For existing native PostgreSQL or broker major-version upgrades, follow the chart's staged upgrade procedure rather than this fresh-install example. Never reuse old TimescaleDB data with the stock image.

## Core deployment concepts

Kubernetes deployments should include:

- API, executor, supervisor, notifier, web UI, and action and sensor worker pools.
- Migration, default-user, and core-pack initialization jobs.
- Shared-volume mode uses persistent packs, runtime environments, and artifact claims. Object mode uses S3/GCS and per-pod local caches/staging instead. Agent binaries use per-pod `emptyDir` volumes in either mode.
- A pre-created runtime Secret selected by the required `security.existingSecret`, plus the provisioned deployment credential selected by `corePack.deploymentTokenSecret`.
- Service routing for the API, notifier WebSocket, and Web UI. The web ingress proxies `/api`, `/auth`, and `/ws` through one host.
- A separate ClusterIP service when `mcp.enabled` is `true`. The web ingress does not expose MCP.

## Bootstrap images

The Helm release uses bootstrap images as well as application images:

- `attune/migrations`
- `attune/init-user`
- `attune/init-packs`

Fresh installations run migrations and user initialization as ordinary release Jobs. Core-pack publication is a blocking `post-install` hook after API platform readiness; a later content-ready hook checks admission and fresh worker hosts. Upgrades run migrations and user initialization as ordered `pre-upgrade` hooks. Core-pack publication is an ordinary upgrade Job unless `corePack.requiredOnUpgrade: true` selects a blocking `post-upgrade` hook. Use `--wait-for-jobs` and inspect failed Jobs; do not bypass authorization or admission.

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
  --values attune-setup-native/values.yaml \
  --values bootstrap-values.yaml \
  --set mcp.enabled=true
```

The chart creates a ClusterIP service on port `8090`. Do not add an ingress or external route. Disable the service after evaluation.

## Operational checklist

- Confirm the migration and initialization Jobs succeeded for the current release revision.
- Confirm init jobs created the default/admin user and loaded core packs.
- Confirm the selected storage mode's PVC mounts or object access and local staging are working.
- For S3, enable versioning and preserve every exact version referenced by PostgreSQL for the recovery window.
- Confirm supervisor access to the same immutable object backend and the PostgreSQL ownership/grants needed for native partition maintenance.
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
