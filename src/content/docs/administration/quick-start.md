---
title: "Admin Quick Start"
description: "Use this page to bring up a local Attune environment and perform the first administrative checks."
sidebar:
  label: "Admin Quick Start"
  order: 1
---
Use the public Docker distribution to start Attune locally and perform the first administrative checks.

![Attune dashboard showing first-check system status](/screenshots/Admin-Quick-Start.png)

## Install the Docker distribution

Install Git, OpenSSL, Docker Engine, and Docker Compose v2. Then clone the [`attune-docker` repository](https://github.com/attune-system/attune-docker) and create its local environment file:

```bash
git clone https://github.com/attune-system/attune-docker.git attune-docker
cd attune-docker
./scripts/create-env.sh
docker compose pull
docker compose up -d
```

The distribution pulls published images from `ghcr.io/attune-system`. It does not build Attune from source. The stack includes PostgreSQL, RabbitMQ, initialization jobs, the API, the executor, the supervisor, action workers, a sensor worker, the notifier, and the web UI.

Open one of these local endpoints:

| Service | Address |
| --- | --- |
| Web UI | `http://localhost:3000` |
| API | `http://localhost:8080` |
| API documentation | `http://localhost:8080/api-spec/swagger-ui/` |
| Notifier WebSocket | `ws://localhost:8081/ws` |

Sign in with the account stored in `.env`. The generated defaults are:

```text
test@attune.local
TestPass123!
```

To use another initial password, change `ATTUNE_TEST_PASSWORD` before the first `docker compose up`.

## First checks

```bash
docker compose ps
docker compose logs --tail=100 migrations init-user init-packs api executor supervisor worker-full sensor notifier web
```

Install the released `attune` CLI by following the [CLI installation instructions](/reference/cli/#install-a-released-binary). Then confirm that you can authenticate and list the core actions:

```bash
attune auth login --username test@attune.local --password 'TestPass123!'
attune pack list
attune action list --pack core
```

## Connect an MCP client

The Docker distribution does not run an MCP endpoint. The Homebrew and Chocolatey CLI packages include `attune-mcp` for local IDEs, editors, and agent tools.

For client configuration and authentication, see [MCP Server Local Setup](/reference/mcp/).

## Agent workers

The default distribution starts shell, Python, Node.js, and combined Python/Node.js action workers. It also starts a sensor worker with shell, Python, Node.js, and native runtime support. The workers run the agent binaries initialized by the `init-agent` service.

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
