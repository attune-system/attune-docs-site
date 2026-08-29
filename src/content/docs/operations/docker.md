---
title: "Docker Operations"
description: "Docker Compose is the standard way to run Attune locally and is useful for single-host testing."
sidebar:
  label: "Docker Operations"
  order: 3
---
The [`attune-docker` repository](https://github.com/attune-system/attune-docker) runs published Attune images with Docker Compose. Use it for local and single-host deployments without cloning the application source.

## Install the distribution

Install Git, OpenSSL, Docker Engine, and Docker Compose v2. Then run:

```bash
git clone https://github.com/attune-system/attune-docker.git attune-docker
cd attune-docker
./scripts/create-env.sh
docker compose pull
docker compose up -d
```

The setup script creates `.env` with random JWT, encryption, and agent-bootstrap secrets. Change `ATTUNE_TEST_PASSWORD` in that file before the first startup if you do not want the default development password.

The Compose file pulls images from `ghcr.io/attune-system`. Set `ATTUNE_IMAGE_TAG` in `.env` to use another published image set, and keep every Attune image on the same tag.

## Start and stop

```bash
docker compose up -d
docker compose ps
docker compose down
```

Follow logs:

```bash
docker compose logs -f api
docker compose logs -f executor worker-shell sensor notifier
```

To update the distribution and its images:

```bash
git pull --ff-only
docker compose pull
docker compose up -d
```

## Connect an MCP client

The public Compose distribution does not run an MCP service. Install `attune-mcp` with the released CLI package and run it next to your local client. See [MCP Server Local Setup](/reference/mcp/).

## Agent workers

The default stack runs `worker-shell`, `worker-python`, `worker-node`, and `worker-full`. The `init-agent` service copies the released agent binaries into the shared `agent_bin` volume before the workers start.

## Export logs to external systems

Attune’s forwarding contract is:

- **Forwarded service logs:** container `stdout`/`stderr` from Attune services.
- **Private runtime logs:** execution and sensor raw stdout/stderr stay in Attune artifacts (`classification=runtime_log`).

Use external agents/listeners to collect container logs, not `/opt/attune/logs` volumes.

Compose publishes machine-readable forwarding labels on Attune application services:

- `com.attune.log.contract=container-stdout-stderr`
- `com.attune.log.transport=docker`
- `com.attune.log.volume_hint=non-forwarding`
- `com.attune.service=<service-name>`

### Example: Datadog Agent (Docker host)

Run Datadog Agent on the same host and collect all container logs:

```yaml
services:
  datadog-agent:
    image: gcr.io/datadoghq/agent:7
    environment:
      DD_API_KEY: ${DD_API_KEY}
      DD_SITE: ${DD_SITE:-datadoghq.com}
      DD_LOGS_ENABLED: "true"
      DD_LOGS_CONFIG_CONTAINER_COLLECT_ALL: "true"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /opt/datadog-agent/run:/opt/datadog-agent/run:rw
```

Attune application services expose stable labels such as `com.attune.service` that Datadog can use for service, environment, and version tags. PostgreSQL, RabbitMQ, migrations, and initialization jobs do not carry these labels.

### Example: Splunk Universal Forwarder (host listener)

If Attune uses Docker `json-file` logs, monitor Docker container logs from the host:

```ini
# inputs.conf
[monitor:///var/lib/docker/containers/*/*-json.log]
disabled = 0
index = attune
sourcetype = docker_json
crcSalt = <SOURCE>
```

Then extract JSON fields at search time (or with indexed extractions) and map labels like `com.attune.service` into searchable fields.

Important: raw Docker `json-file` tailing includes the log line/stream/time envelope but does **not** include container labels by default. To map `com.attune.*` labels, enrich events with Docker metadata (for example via Docker API/socket-aware collection path), or configure your log pipeline to inject those labels.

### Example: OpenTelemetry Collector listener

Use `filelog` receiver to tail Docker container JSON logs and forward to your backend:

```yaml
receivers:
  filelog:
    include:
      - /var/lib/docker/containers/*/*-json.log
processors:
  batch: {}
exporters:
  otlp:
    endpoint: otel-gateway:4317
    tls:
      insecure: true
service:
  pipelines:
    logs:
      receivers: [filelog]
      processors: [batch]
      exporters: [otlp]
```

Important: this basic `filelog` path collects log body/stream/time but not container labels. Add Docker metadata enrichment if you need searchable fields from `com.attune.service` and `com.attune.log.*`.

### Quick validation

```bash
docker inspect attune-api --format '{{json .Config.Labels}}'
docker inspect attune-api --format '{{json .HostConfig.LogConfig}}'
docker logs --tail=5 attune-api
```

Check for `com.attune.log.contract`, `com.attune.log.transport`, `com.attune.log.volume_hint`, and `com.attune.service` in labels. You should also see JSON service-log events in `docker logs`.

## Common commands

```bash
# Pull the configured Attune image set
docker compose pull

# Recreate a service after config/image changes
docker compose up -d --force-recreate api

# Inspect logs from failed initialization jobs
docker compose logs migrations
docker compose logs init-user
docker compose logs init-packs

# Remove all containers but keep named volumes
docker compose down
```

## Volume rules

- Packs are mounted through volumes, not copied into service images.
- Runtime environments live in `runtime_envs`.
- File artifacts live in `artifacts_data`.
- Workers need read-only pack access and read/write runtime/artifact access.
- API needs read/write pack/artifact access, write access to `runtime_envs`, and read-only agent binary access.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| API cannot find packs | `packs_data` volume, `init-packs` logs, `packs_base_dir`. |
| Worker cannot import dependency | `runtime_envs` volume and runtime setup logs. |
| Agent binary missing | `init-agent` logs and the `agent_bin` volume. |
| Web UI cannot call API | CORS config, service URL, container port mapping. |
| WebSocket fails | Notifier logs, JWT secret parity with API, browser subprotocol auth. |

## Related

- [Admin Quick Start](/administration/quick-start/)
- [`attune-docker` distribution](https://github.com/attune-system/attune-docker)
- [Runtime Environments](/pack-development/runtime-environments/)
- [Monitoring and Troubleshooting](/operations/monitoring/)
- [Operational Visibility](/operations/visibility/)
