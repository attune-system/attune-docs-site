---
title: "Security Operations"
description: "Security operations cover secrets, identity, RBAC, audit logs, pack trust, network exposure, and execution-scoped delegation."
sidebar:
  label: "Security Operations"
  order: 11
---
Security operations cover secrets, identity, RBAC, audit logs, pack trust, network exposure, and execution-scoped delegation.

![Audit log with security and lifecycle event filters](/screenshots/Security-Operations.png)

## Secrets

Production must use non-default:

- `JWT_SECRET`
- `ENCRYPTION_KEY`

Store them in a secret manager. Rotate on a schedule and after suspected exposure.

Effects:

- Rotating `JWT_SECRET` invalidates existing tokens.
- Rotating `ENCRYPTION_KEY` requires planned re-encryption of encrypted key values.

## Network exposure

- Put API/Web UI/notifier behind TLS.
- Restrict PostgreSQL and RabbitMQ to trusted networks.
- Configure CORS only for trusted Web UI origins.
- Do not pass tokens in URLs.
- Do not expose RabbitMQ management publicly.

## Pack trust

Packs contain executable code. Treat pack installation like deploying software:

- Install from trusted repositories or controlled indices.
- Review actions and sensors.
- Pin versions in production.
- Restrict who can `packs:install`, `packs:create`, and `packs:configure`.
- Use isolated workers for high-risk runtimes or third-party packs.

## RBAC review

Regularly review:

- Admin role membership.
- Broad unconstrained grants.
- Key decrypt grants.
- Event, enforcement, and execution decrypt grants.
- Artifact private access grants.
- Audit-log read grants.
- Execution permission sets that can be delegated to actions or AI agents.

## Audit log

Sensitive operations emit semantic audit events. Audit details must not contain raw passwords, tokens, key values, decrypted secrets, or artifact content.

Review events for:

- RBAC denials.
- Identity/role/permission changes.
- Key read/decrypt/create/update/delete.
- Event/enforcement/execution secret disclosure.
- Artifact create/update/delete/download.
- Pack upload/register/install/delete.
- Manual execution requests.
- Audit-log reads.

## AI agents

Run AI agents with execution-scoped tokens, not full user credentials. Prefer:

- `ATTUNE_API_TOKEN` from execution permission refs.
- `attune-mcp` over stdio.
- `standard` plus narrowly scoped named permission sets.
- Private artifacts for sensitive prompts/results.

## Incident checklist

1. Identify affected identities, tokens, packs, keys, executions, and artifacts.
2. Disable or remove suspect roles/permission sets.
3. Rotate secrets and identity-provider credentials as needed.
4. Disable suspect packs/actions/sensors.
5. Review audit logs.
6. Preserve relevant execution/artifact evidence.
7. Restore from backup only if data integrity is compromised.

## Related

- [Permissions and RBAC](/administration/permissions-and-rbac/)
- [Authentication and Identity](/administration/authentication-and-identity/)
- [Backup and Recovery](/operations/backup-and-recovery/)
