---
title: "Standalone Workers and Sensors"
description: "By default, Attune workers and sensors share Docker volumes with the API for fast, zero-copy file access. Standalone mode removes that requirement: workers and sensors that cannot "
sidebar:
  label: "Standalone Workers and Sensors"
  order: 5
---
By default, Attune workers and sensors share Docker volumes with the API for fast, zero-copy file access.
**Standalone mode** removes that requirement: workers and sensors that cannot mount shared volumes
automatically fall back to HTTP-based transport for pack files, artifacts, and execution logs.

This lets you run Attune workers on bare-metal servers, cloud VMs, edge nodes, or any container
environment where shared storage is impractical — with no difference visible to end users.

## When to use standalone mode

| Scenario | Shared volumes? | Transport mode |
| --- | --- | --- |
| All services on one Docker host | ✅ Yes | `volume` (default) |
| Kubernetes with ReadWriteMany PVCs | ✅ Yes | `volume` |
| Worker on a remote VM / bare-metal server | ❌ No | `api` (auto-detected) |
| Edge / branch-office worker behind a WAN | ❌ No | `api` |
| GPU node in a separate cluster | ❌ No | `api` |
| Mixed — some local, some remote | Mixed | `auto` per service |

## How transport detection works

Attune uses **sentinel files** to auto-detect whether a worker or sensor shares storage with the API.

1. On startup, the API writes sentinel files into the shared directories:
   - `.attune-api-sentinel` in `artifacts_dir`
   - `.attune-packs-sentinel` in `packs_base_dir`

2. When a worker or sensor starts, it checks for these sentinel files in its local directories.

3. **Sentinel found** → the service is on a shared volume → use fast filesystem I/O (`VolumeTransport`).

4. **Sentinel missing** → no shared volume → switch to HTTP-based transport (`ApiTransport`).

No manual configuration is required. If you want to force a specific mode, set the `artifacts.transport`
config value:

```yaml
# config.yaml on a remote worker
artifacts:
  transport: api    # always use HTTP, never check for sentinel
```

Valid values: `auto` (default), `volume`, `api`.

## What gets transported

| Data | Volume mode | API mode | Direction |
| --- | --- | --- | --- |
| Pack files (actions, sensors, configs) | Shared `packs_data` volume | `GET /api/v1/internal/packs/{ref}/archive` | API → Worker/Sensor |
| Artifact files (logs, outputs, data) | Shared `artifacts_data` volume | `PUT/GET /api/v1/internal/files/{path}` | Bidirectional |
| Execution stdout/stderr logs | Written to shared volume, read by API | Streamed to API via transport | Worker → API |
| Sensor rotating logs | Written as artifact versions on shared volume | Streamed as artifact versions via transport | Sensor → API |
| Runtime environments (venvs, node_modules) | Shared `runtime_envs` volume | Created locally on the worker | Local only |

## Setting up a standalone worker

### Docker Compose

Use `docker-compose.standalone.yaml` as a reference or overlay:

```bash
docker compose -f docker-compose.yaml \
               -f docker-compose.standalone.yaml \
               up -d
```

The key difference from a normal worker is the volume list. A connected worker mounts:

```yaml
volumes:
  - packs_data:/opt/attune/packs:ro
  - artifacts_data:/opt/attune/artifacts
  - runtime_envs:/opt/attune/runtime_envs
  - agent_bin:/opt/attune/agent:ro
```

A standalone worker mounts **only** the agent binary and config:

```yaml
volumes:
  - agent_bin:/opt/attune/agent:ro
  - ./config.docker.yaml:/opt/attune/config/config.yaml:ro
```

The entrypoint creates empty local directories so the agent has somewhere to write:

```yaml
entrypoint:
  - /bin/sh
  - -c
  - |
    mkdir -p /opt/attune/packs /opt/attune/artifacts \
             /opt/attune/runtime_envs /opt/attune/logs
    exec /opt/attune/agent/attune-agent
```

### Bare-metal / VM

1. Download the agent binary from the API:

   ```bash
   curl -H "X-Agent-Token: $BOOTSTRAP_TOKEN" \
        "https://attune.example.com/api/v1/agent/binary?arch=$(uname -m)" \
        -o /opt/attune/agent/attune-agent
   chmod +x /opt/attune/agent/attune-agent
   ```

2. Create a minimal config file:

   ```yaml
   # /opt/attune/config/config.yaml
   database:
     url: postgresql://attune:secret@db.example.com:5432/attune
   message_queue:
     url: amqp://attune:secret@mq.example.com:5672
   security:
     jwt_secret: "your-jwt-secret"
     encryption_key: "your-encryption-key-32-chars-min"
   packs_base_dir: /opt/attune/packs
   artifacts_dir: /opt/attune/artifacts
   runtime_envs_dir: /opt/attune/runtime_envs
   artifacts:
     transport: api    # force API transport since no shared volume
   ```

3. Create local directories and start the agent:

   ```bash
   mkdir -p /opt/attune/{packs,artifacts,runtime_envs,logs}
   export ATTUNE_CONFIG=/opt/attune/config/config.yaml
   export ATTUNE_API_URL=https://attune.example.com
   export ATTUNE_WORKER_NAME=worker-edge-01
   export ATTUNE_WORKER_RUNTIMES=shell,python
   /opt/attune/agent/attune-agent
   ```

   Or use a systemd unit (see [example below](#systemd-unit-example)).

### Kubernetes

For Kubernetes agent workers without shared PVCs, the `emptyDir` init-container
pattern already works as a standalone setup — the worker has only its own
local storage. See [Kubernetes Operations](/operations/kubernetes/) for
the Helm values.

## Setting up a standalone sensor

Sensors follow the same pattern. Use `attune-sensor-agent` instead of `attune-agent`:

```yaml
# Docker Compose
sensor-standalone:
  image: debian:bookworm-slim
  entrypoint:
    - /bin/sh
    - -c
    - |
      mkdir -p /opt/attune/packs /opt/attune/artifacts \
               /opt/attune/runtime_envs /opt/attune/logs
      exec /opt/attune/agent/attune-sensor-agent
  environment:
    ATTUNE_CONFIG: /opt/attune/config/config.yaml
    ATTUNE_API_URL: http://attune-api:8080
    # ... same DB/MQ/security env vars as the worker
  volumes:
    - agent_bin:/opt/attune/agent:ro
    - ./config.docker.yaml:/opt/attune/config/config.yaml:ro
```

For bare-metal, download `attune-sensor-agent` instead:

```bash
curl -H "X-Agent-Token: $BOOTSTRAP_TOKEN" \
     "https://attune.example.com/api/v1/agent/binary?arch=$(uname -m)&binary=attune-sensor-agent" \
     -o /opt/attune/agent/attune-sensor-agent
chmod +x /opt/attune/agent/attune-sensor-agent
```

Managed sensor processes receive live rule lifecycle updates over the notifier WebSocket endpoint (`ATTUNE_NOTIFIER_WS_URL`), not through a direct AMQP subscription in sensor code. `ATTUNE_SENSOR_TRIGGER_TYPES` contains the complete JSON list of trigger refs used for notifier subscriptions, while `ATTUNE_SENSOR_TRIGGERS` is only the active-rule startup snapshot. Keep RabbitMQ connectivity for Attune service-to-service coordination, but implement sensor lifecycle listeners against WebSocket updates (`rule.created`, `rule.enabled`, `rule.updated`, `rule.disabled`, `rule.deleted`).

## Worker labels and placement

Standalone workers can be labeled for targeted execution routing:

```yaml
environment:
  ATTUNE__WORKER__LABELS__location: edge-site-nyc
  ATTUNE__WORKER__LABELS__gpu: "true"
  ATTUNE__WORKER__LABELS__attune_transport: api
```

Workers can also declare taints to repel workloads that don't explicitly tolerate them:

```yaml
environment:
  ATTUNE__WORKER__TAINTS__dedicated: ml
```

Actions or manual executions can then use placement constraints to target specific workers:

```yaml
# In an action YAML — exact label match
worker_selector:
  location: edge-site-nyc

# Tolerate tainted workers
worker_tolerations:
  - key: dedicated
    operator: equal
    value: ml
    effect: no_schedule

# Soft preference for workers with specific labels
worker_affinity:
  preferred:
    - weight: 80
      preference:
        match_labels:
          gpu: "true"
```

```bash
# Manual execution targeting
attune action execute mypack.deploy \
  --param version=2.1 \
  --worker-selector '{"location": "edge-site-nyc"}'

# With tolerations
attune run mypack.train --param epochs=10 \
  --worker-tolerations '[{"key":"dedicated","operator":"equal","value":"ml","effect":"no_schedule"}]'
```

These placement fields can also be configured as action defaults in the web UI via the **Configure** button on the action detail page.

## Sensor-worker labels and placement

Standalone sensor workers use the same capability vocabulary, but the configuration lives under `sensor`:

```yaml
sensor:
  labels:
    location: edge-site-nyc
    network: internal
  taints:
    - key: dedicated
      value: sensors
      effect: no_schedule
```

Environment override examples:

```bash
ATTUNE__SENSOR__LABELS__location=edge-site-nyc
ATTUNE__SENSOR__LABELS__network=internal
```

Pack sensors can then request a matching sensor worker:

```yaml
worker_selector:
  location: edge-site-nyc
worker_tolerations:
  - key: dedicated
    operator: equal
    value: sensors
    effect: no_schedule
worker_affinity:
  preferred:
    - weight: 75
      preference:
        match_labels:
          network: internal
```

The sensor worker evaluates placement before starting or restarting the long-lived sensor process. See [Operational Visibility](/operations/visibility/) for the process-health and restart behavior.

## Pack distribution lifecycle

When a pack is installed, updated, or deleted:

1. The API stores pack files on disk and publishes a `pack.registered` or `pack.deleted` event to RabbitMQ.
2. **Volume-connected** workers already see the files — no action needed.
3. **Standalone** workers receive the MQ event, then download the pack archive from
   `GET /api/v1/internal/packs/{ref}/archive` and extract it locally.
4. After extraction, the worker sets up runtime environments (virtualenvs, node_modules) locally.

On startup, standalone workers also run a full sync, downloading all registered packs they
don't already have locally.

## Artifact and log handling

### Execution artifacts

When an action creates or updates a file-backed artifact version:

- **Volume mode**: the action writes to the shared `artifacts_dir`, and the worker finalizes size metadata after the execution exits.
- **API mode**: the action writes to the worker-local `$ATTUNE_ARTIFACTS_DIR/{file_path}`. At the end of the execution, the worker copies locally staged file-backed versions to the API with `PUT /api/v1/internal/files/{path}` and then finalizes size metadata.

When any client downloads an artifact, the API reads from its local `artifacts_dir`.
In API mode the worker uploads the file during execution finalization, so later tasks and downloads can read it from the API-accessible artifact volume.

File-backed versions allocated with an execution-scoped API token are automatically associated with that execution when the request omits an explicit `execution` id. This lets actions call the allocation endpoint, write to the returned path under `ATTUNE_ARTIFACTS_DIR`, and rely on the worker to discover and finalize the version.

### Execution logs (stdout / stderr)

Execution stdout and stderr are captured by the worker's `LogWriter` and stored as artifacts:

- **Volume mode**: written to `{artifacts_dir}/{pack_ref}/{action_ref}/{execution_id}/stdout.log`.
- **API mode**: streamed to the API via the artifact transport layer. The API stores the file
  in the same path structure, so log download endpoints work identically.

Stderr artifacts are created lazily — only when stderr output is actually produced.

### Sensor logs

Each sensor process gets dedicated rotating log files (`stdout.log` and `stderr.log`).
These are registered as file-backed artifact versions with refs like `sensor.{sensor_ref}.stdout`.

- **Volume mode**: written to artifact version paths under the shared `artifacts_dir`.
- **API mode**: streamed to the API via transport.

Sensor processes also receive `ATTUNE_ARTIFACTS_DIR`. If a standalone sensor creates additional sensor-owned file-backed artifacts locally, the sensor agent copies those files to the API transport when the process stops or exits.

Rotation defaults: 10 MB per segment with 4 retained artifact versions per stream. Configure segment size with:

```yaml
artifacts:
   sensor_log_max_bytes: 10485760   # 10 MB
```

Action logs default to `days` / `7` via `worker.execution_log_retention_policy` / `worker.execution_log_retention_limit`. Sensor logs default separately to `versions` / `4` because artifact versions are created only when log segments rotate. Both action and sensor rows can override retention with `log_retention_policy` and `log_retention_limit`.

## Configuration reference

All transport-related settings and their defaults:

```yaml
# artifacts_dir: where file-backed artifacts are stored
artifacts_dir: /opt/attune/artifacts

# packs_base_dir: where pack files are stored
packs_base_dir: /opt/attune/packs

# runtime_envs_dir: where runtime environments are created
runtime_envs_dir: /opt/attune/runtime_envs

artifacts:
  # Transport mode: auto | volume | api
  # auto (default) checks for API sentinel file
  transport: auto

  # Max upload size for API transport (bytes, default 100 MB)
  max_upload_size: 104857600

  # Buffer flush interval for streaming writes (ms, default 500)
  flush_interval_ms: 500

  # Sensor log rotation settings
  sensor_log_max_bytes: 10485760   # 10 MB per file
  sensor_log_max_files: 4          # legacy raw-file fallback only

worker:
  # Default retention for action stdout/stderr artifact versions
  execution_log_retention_policy: days
  execution_log_retention_limit: 7
```

Environment variable overrides (double-underscore separator):

```bash
ATTUNE__ARTIFACTS__TRANSPORT=api
ATTUNE__ARTIFACTS__MAX_UPLOAD_SIZE=104857600
ATTUNE__ARTIFACTS__FLUSH_INTERVAL_MS=500
ATTUNE__ARTIFACTS__SENSOR_LOG_MAX_BYTES=10485760
ATTUNE__ARTIFACTS__SENSOR_LOG_MAX_FILES=4
ATTUNE__WORKER__EXECUTION_LOG_RETENTION_POLICY=versions
ATTUNE__WORKER__EXECUTION_LOG_RETENTION_LIMIT=4
ATTUNE__PACKS_BASE_DIR=/opt/attune/packs
ATTUNE__ARTIFACTS_DIR=/opt/attune/artifacts
ATTUNE__RUNTIME_ENVS_DIR=/opt/attune/runtime_envs
```

## Verifying standalone operation

Check that a worker registered with API transport:

```bash
# List workers and check capabilities
attune worker list

# Or via API
curl -s http://localhost:8080/api/v1/workers | jq '.items[] | {name, capabilities}'
```

A standalone worker's startup logs will show:

```
INFO  Pack transport mode: api
INFO  Artifact transport mode: api
INFO  Syncing all packs via api transport...
INFO  Synced pack "core" via api transport
```

## Systemd unit example

```ini
[Unit]
Description=Attune Worker Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=attune
Group=attune
Environment=ATTUNE_CONFIG=/opt/attune/config/config.yaml
Environment=ATTUNE_API_URL=https://attune.example.com
Environment=ATTUNE_WORKER_NAME=worker-%H
Environment=ATTUNE_WORKER_RUNTIMES=shell,python
Environment=RUST_LOG=info,attune=debug
ExecStartPre=/bin/mkdir -p /opt/attune/packs /opt/attune/artifacts /opt/attune/runtime_envs
ExecStart=/opt/attune/agent/attune-agent
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

## Network requirements

Standalone workers and sensors need network access to:

| Endpoint | Port | Protocol | Purpose |
| --- | --- | --- | --- |
| PostgreSQL | 5432 | TCP | Database queries (direct) |
| RabbitMQ | 5672 | TCP | Message queue (AMQP) |
| Attune Notifier | 8081 | WebSocket | Managed sensor rule lifecycle updates |
| Attune API | 8080 | HTTP | Pack downloads, artifact/log uploads, internal file endpoints |

If the worker is on an untrusted network, use TLS for all required service connections and restrict
the PostgreSQL connection to read-heavy queries via a connection pooler like PgBouncer.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Worker starts but uses `volume` transport | Sentinel file exists at `artifacts_dir/.attune-api-sentinel` | Ensure `artifacts_dir` points to a local (non-shared) directory, or set `artifacts.transport: api` |
| Pack not synced after upload | `pack.registered` MQ event not received | Check RabbitMQ connectivity; verify the worker's queue bindings |
| Execution fails with "command not found" | Pack files not yet downloaded | Check worker logs for pack sync errors; increase startup wait time |
| Artifact download returns 404 | Execution is still running, or finalization/upload failed | Check worker logs for artifact finalization or transport errors; verify API URL is reachable from the worker |
| Sensor logs not visible in UI | Sensor using volume transport but no shared volume | Set `artifacts.transport: api` or ensure sentinel detection picks the right mode |
| Sensor starts but does not react to rule enable/disable changes | Notifier WebSocket not reachable or `ATTUNE_NOTIFIER_WS_URL`/token misconfigured | Check notifier URL, port `8081`, and sensor WebSocket authentication |
| "connection refused" on pack download | `ATTUNE_API_URL` not set or incorrect | Set `ATTUNE_API_URL` to the API's reachable address from the worker's network |

## See also

- [Architecture](/introduction/architecture/) — service overview and runtime flow
- [Deployment Overview](/operations/deployment/) — deployment topology and startup order
- [Docker Operations](/operations/docker/) — Docker Compose configuration
- [Kubernetes Operations](/operations/kubernetes/) — Helm chart and agent workers
- [Configuration Reference](/reference/configuration/) — full config YAML reference
- [Artifact Administration](/administration/artifacts/) — artifact storage and retention
