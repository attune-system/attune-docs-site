---
title: "Configuration Reference"
description: "This page summarizes common Attune configuration keys. Exact defaults can vary by environment file."
sidebar:
  label: "Configuration Reference"
  order: 4
---
This page summarizes common Attune configuration keys. Exact defaults can vary by environment file.

## Loader behavior

```text
config.yaml -> config.<environment>.yaml -> ATTUNE__... env overrides
```

Set `ATTUNE_CONFIG` to choose the base config file. Set `ATTUNE__ENVIRONMENT` to select the `config.<environment>.yaml` overlay.

## Common keys

| Key | Purpose |
| --- | --- |
| `database.url` | PostgreSQL connection URL. |
| `database.max_connections` | Pool size. |
| `server.host` | API bind host. |
| `server.port` | API port. |
| `server.cors_origins` | Allowed Web UI/API origins. |
| `log.level` | Tracing/log level. |
| `message_queue.url` | RabbitMQ connection URL. |
| `packs_base_dir` | Installed pack directory. |
| `runtime_envs_dir` | Runtime environment root. |
| `artifacts_dir` | File artifact root. |
| `default_execution_timeout_seconds` | Platform fallback timeout for action executions, in seconds. Defaults to `600`; must be greater than zero. Snapshotted onto new executions after execution/workflow/action-specific overrides are considered. |
| `security.jwt_secret` | JWT signing/verification secret. |
| `security.encryption_key` | Key encryption secret. |
| `security.oidc` | OIDC provider settings. |
| `security.ldap` | LDAP provider settings. |
| `security.login_page` | Login method visibility. |
| `agent.binary_dir` | Agent binary directory served by API. |
| `agent.bootstrap_token` | Required token when agent binary downloads are enabled. |
| `pack_upload` | Upload extraction safety limits. |
| `pack_registry` | Ordered pack indices, caching, checksum verification, outbound host policy, timeouts, and response-size limits. |
| `worker.labels` | Worker scheduling labels. |
| `worker.taints` | Worker scheduling taints. |
| `worker.execution_log_retention_policy` | Default retention policy for action stdout/stderr artifact versions (`days` by default). |
| `worker.execution_log_retention_limit` | Default retention limit for action stdout/stderr artifact versions (`7` by default). |
| `sensor.labels` | Sensor-worker placement labels. |
| `sensor.taints` | Sensor-worker placement taints. |
| Runtime retention | Managed in PostgreSQL through `/retention` or `/api/v1/retention-config`; the database migration seeds defaults of 30 days for runtime metadata and 90 days for audit log rows. |

## Environment variable examples

```bash
ATTUNE__DATABASE__URL=postgresql://attune:attune@postgres:5432/attune
ATTUNE__MESSAGE_QUEUE__URL=amqp://attune:attune@rabbitmq:5672
ATTUNE__SERVER__PORT=8080
ATTUNE__SERVER__CORS_ORIGINS=http://localhost:3000
ATTUNE__SECURITY__JWT_SECRET=...
ATTUNE__SECURITY__ENCRYPTION_KEY=...
ATTUNE__DEFAULT_EXECUTION_TIMEOUT_SECONDS=600
ATTUNE__AGENT__BINARY_DIR=/opt/attune/agent
ATTUNE__WORKER__EXECUTION_LOG_RETENTION_POLICY=versions
ATTUNE__WORKER__EXECUTION_LOG_RETENTION_LIMIT=4
ATTUNE__SENSOR__LABELS__location=edge-site-nyc
```

Some legacy environment names may be supported by specific binaries, but new deployments should prefer the `ATTUNE__...` nested format.

See [SSO Configuration](/administration/sso/) for `security.oidc`, `security.ldap`, and `security.login_page` examples for Docker Compose and Kubernetes.
See [Supervisor Operations](/operations/supervisor/) for runtime retention targets, guardrails, API/web management, RBAC, and audit events.
See [Custom Pack Indices](/administration/custom-pack-indices/) for complete `pack_registry`
examples and index ordering behavior.

## Production required settings

- Strong JWT secret.
- Strong encryption key.
- Production database URL.
- RabbitMQ URL.
- TLS/CORS appropriate for public endpoints.
- Identity provider settings if local login is not the main auth path.
- Persistent pack/artifact storage.

## Related

- [Configuration](/administration/configuration/)
- [Custom Pack Indices](/administration/custom-pack-indices/)
- [Supervisor Operations](/operations/supervisor/)
- [Security Operations](/operations/security/)
- [Deployment Overview](/operations/deployment/)
