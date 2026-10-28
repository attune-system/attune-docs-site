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

## Dependency advisories in 0.10.0

The release retains explicit risk acceptance for two dependency advisories:

| Advisory | Status |
| --- | --- |
| [RUSTSEC-2026-0387](https://rustsec.org/advisories/RUSTSEC-2026-0387.html), `crypto-bigint` timing variability | Fixed upstream in `crypto-bigint >=0.7.6`, but the JWT/OIDC dependency graph still resolves to `0.5.5`. `elliptic-curve 0.14.3` uses a patched version, but published authentication dependencies still require older curve packages. |
| [RUSTSEC-2023-0071](https://rustsec.org/advisories/RUSTSEC-2023-0071.html), RSA timing side channels | The RustSec advisory has no patched version range. It is separate from the `crypto-bigint` finding. |

These exceptions in `deny.toml` are risk acceptances, not fixes. Cargo Deny can pass with them present. The `crypto-bigint` exception is scheduled for review by **November 22, 2026**; that date is documented, not an automatically enforced expiry.

Before removing the exception, ensure the full dependency graph contains no affected `crypto-bigint` copies, run authentication regression tests, and rerun Cargo Deny. An updated elliptic-curve release alone does not replace copies pinned by its parent dependencies, and resolving this advisory does not resolve the separate RSA advisory.

Review the deployment's cryptographic operations and exposure rather than treating successful CI as evidence that vulnerable code has been removed. Source: [0.10.0 dependency policy](https://github.com/attune-system/attune/blob/f2eb41cd65474a1df451aa7c0dd339237582096e/deny.toml).

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
