---
title: "Configuration"
description: "Attune loads configuration from YAML files plus environment variable overrides."
sidebar:
  label: "Configuration"
  order: 2
---
Attune loads configuration from YAML files plus environment variable overrides.

## Files and precedence

Typical files:

```text
config.yaml
config.development.yaml
config.test.yaml
config.docker.yaml
config.production.yaml
```

Loading order:

```text
base config -> environment-specific config -> environment variables
```

Set `ATTUNE_CONFIG` to choose the base config file.

## Environment overrides

Environment overrides use the `ATTUNE__` prefix and double underscores for nesting:

```bash
ATTUNE__DATABASE__URL=postgresql://attune:attune@postgres:5432/attune
ATTUNE__SERVER__PORT=8080
ATTUNE__LOG__LEVEL=info
ATTUNE__RUNTIME_ENVS_DIR=/opt/attune/runtime_envs
```

Production deployments must provide strong secrets:

```bash
ATTUNE__SECURITY__JWT_SECRET="$(openssl rand -base64 64)"
ATTUNE__SECURITY__ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

## Important paths

| Setting | Purpose | Docker default |
| --- | --- | --- |
| `packs_base_dir` | Pack files loaded by API/workers/sensors. | `/opt/attune/packs` |
| `runtime_envs_dir` | Per-pack runtime environments. | `/opt/attune/runtime_envs` |
| `artifacts_dir` | File-backed artifact storage. | `/opt/attune/artifacts` |
| `agent.binary_dir` | Statically linked agent/CLI/MCP binaries. | `/opt/attune/agent` |

Pack directories should be read-only in worker containers. Runtime dependencies belong in `runtime_envs_dir`, not inside the pack directory.

## Execution timeout default

`default_execution_timeout_seconds` sets the platform fallback for action execution runtime:

```yaml
default_execution_timeout_seconds: 600
```

The value is in seconds and must be greater than zero. Attune snapshots the resolved timeout onto each execution row at creation time. Resolution order is:

1. Explicit execution timeout override.
2. Workflow task `timeout` for workflow child executions.
3. Action `timeout_seconds`.
4. `default_execution_timeout_seconds`.

Changing this setting affects future executions only. Existing execution rows keep their stored `execution.timeout_seconds`.

The worker enforces the snapshotted value by terminating the action process group when the timeout expires.

## Agent binary downloads

The API can serve agent binaries through the agent binary endpoint when `agent.binary_dir` is configured. `agent.bootstrap_token` is required; clients must provide it with:

```http
X-Agent-Token: <token>
```

Do not put bootstrap tokens in URLs.

## Authentication configuration

Local username/password auth is available when authentication is enabled; `security.login_page` can hide it from the web login page. Optional providers include:

- OIDC browser redirect login.
- LDAP direct bind or search-and-bind login.

The login page can show or hide local, OIDC, and LDAP methods through `security.login_page`.

For complete Docker Compose and Kubernetes examples, see [SSO Configuration](/administration/sso/).

## Database configuration

Attune relies on PostgreSQL `search_path`. Do not hardcode schema-qualified table names in application queries. Production should explicitly configure the intended schema and run migrations before starting app services.

## Message queue configuration

RabbitMQ is required for service communication. Queue names and routing should be treated as internal service contracts; operators usually manage RabbitMQ through Docker Compose or Kubernetes values rather than application code.

## Worker and sensor placement labels

Action workers use `worker.labels` / `worker.taints`; sensor workers use `sensor.labels` / `sensor.taints`.

```yaml
worker:
  labels:
    pool: general
  taints: []

sensor:
  labels:
    location: edge-site-nyc
    network: internal
  taints:
    - key: dedicated
      value: sensors
      effect: no_schedule
```

Pack actions and sensors can use placement constraints to target matching workers. See [Operational Visibility](/operations/visibility/) and [YAML Reference](/reference/yaml/).

## Validation checklist

- Config file path is correct.
- Database and RabbitMQ URLs resolve from the service container.
- `JWT_SECRET` and `ENCRYPTION_KEY` are non-default in production.
- Pack, runtime env, artifact, and agent paths are mounted with correct read/write modes.
- CORS origins match the web UI host.
- Notifier uses the same JWT secret as the API.
- Worker and sensor labels/taints match any placement constraints used by packs.

## Related

- [Configuration Reference](/reference/configuration/)
- [Security Operations](/operations/security/)
- [Docker Operations](/operations/docker/)
- [Operational Visibility](/operations/visibility/)
