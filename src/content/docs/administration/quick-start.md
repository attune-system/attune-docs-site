---
title: "Admin Quick Start"
description: "Use this page to bring up a local Attune environment and perform the first administrative checks."
sidebar:
  label: "Admin Quick Start"
  order: 1
---
Use this page to bring up a local Attune environment and perform the first administrative checks.

![Attune dashboard showing first-check system status](/screenshots/Admin-Quick-Start.png)

## Start Docker Compose

From the repository root:

```bash
docker compose up -d
```

Core services include PostgreSQL/TimescaleDB, RabbitMQ, migrations, core-pack initialization, API, executor, workers, sensor, notifier, and web UI.

Open:

- Web UI: `http://localhost:3000`
- API: `http://localhost:8080`
- Notifier WebSocket: `ws://localhost:8081/ws` (`http://localhost:8081/health` for health)

Default local login:

```text
test@attune.local
TestPass123!
```

## First checks

```bash
docker compose ps
docker compose logs --tail=100 api executor worker-shell sensor notifier
```

Then confirm the core pack and actions are available:

```bash
cargo run -p attune-cli -- auth login --username test@attune.local --password 'TestPass123!'
cargo run -p attune-cli -- pack list
cargo run -p attune-cli -- action list --pack core
```

## Optional MCP service

The MCP HTTP service is optional:

```bash
ATTUNE_MCP_HTTP_BEARER_TOKEN="$MCP_CLIENT_TOKEN" \
  docker compose --profile mcp up -d mcp
```

It serves authenticated MCP over HTTP on host-loopback port `8090` and can also run over stdio through the `attune-mcp` binary. The inbound MCP token is separate from Attune API credentials; non-loopback deployment requires explicit public-listen opt-in plus protected ingress and network controls.

For local IDE, editor, and AI agent setup, see [MCP Server Local Setup](/reference/mcp/).

## Agent workers

To run agent-based workers using arbitrary runtime images:

```bash
docker compose -f docker-compose.yaml -f docker-compose.agent.yaml up -d
```

Agent workers download or mount the statically linked `attune-agent`, auto-detect interpreters, and register worker runtime capabilities.

## Common admin tasks

| Task | Page |
| --- | --- |
| Configure secrets and paths | [Configuration](/administration/configuration/) |
| Configure auth providers | [Authentication and Identity](/administration/authentication-and-identity/) |
| Grant access | [Permissions and RBAC](/administration/permissions-and-rbac/) |
| Configure execution policies | [Policy Administration](/administration/policies/) |
| Install packs | [Pack Administration](/administration/packs/) |
| Operate queues | [Queue Administration](/administration/queues/) |
| Inspect artifacts | [Artifact Administration](/administration/artifacts/) |

## Shutdown

```bash
docker compose down
```

Named volumes preserve database, RabbitMQ, packs, artifacts, runtime environments, and agent binaries unless explicitly removed.
