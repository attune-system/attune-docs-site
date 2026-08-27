---
title: "User and Team Operations"
description: "This page collects common administrative tasks for identities, teams, and day-to-day operations."
sidebar:
  label: "User and Team Operations"
  order: 12
---
This page collects common administrative tasks for identities, teams, and day-to-day operations.

![Access control identity list for user and automation account operations](/screenshots/User-and-Team-Operations.png)

## Identity sources

Attune can use:

- Local username/password accounts.
- OIDC identities.
- LDAP identities.
- Automation identities such as passwordless sensor identities; executions use short-lived scoped tokens tied to an identity.

Choose one primary human identity source for production and reserve local accounts for bootstrap or emergency access.

## User onboarding

1. Confirm the identity exists or can be created through the chosen provider.
2. Assign roles or direct permissions.
3. Grant pack, key, artifact, queue, and pack-configuration access with constraints where possible.
4. Confirm the user can log in and read expected packs/actions.
5. Confirm they cannot access restricted packs, keys, artifacts, or queues.

## User offboarding

1. Remove roles and direct permission assignments.
2. Rotate any shared secrets the user knew.
3. Reassign or recreate owned rules, keys, queues, or packs where the current API supports ownership changes.
4. Review audit logs for recent sensitive operations.
5. Ensure active WebSocket sessions expire by token lifetime or service restart if urgent.

## Service accounts

Use non-human identities for CI/CD, external automation, and machine-to-machine access. Today these are ordinary identities used for automation, passwordless sensor identities, or execution-scoped API access tied to a triggering identity rather than a separate service-account resource. Avoid using personal accounts for unattended jobs.

Recommended practices:

- Grant only required actions.
- Prefer constrained resource grants.
- Rotate credentials.
- Separate automation identities by environment and responsibility.
- Monitor audit logs by identity.

## Teams and roles

Attune does not have a separate team object. Model broad job functions with role labels and permission sets, then use constrained direct grants for exceptions. Keep admin roles small.

Example role split:

| Role | Typical access |
| --- | --- |
| Viewer | Read executions, packs, artifacts allowed by constraints. |
| Operator | Execute approved actions/workflows and respond to assigned inquiries. |
| Pack developer | Create/configure packs in owned namespaces. |
| Queue operator | Enqueue and manage specific queues. |
| Admin | Identity, permission, audit-log, pack, and pack-index administration. |

## Audit review

Sensitive operations emit semantic audit events. Review audit logs for:

- RBAC denials.
- Identity/role/permission changes.
- Key read/decrypt/create/update/delete.
- Artifact create/update/delete/download.
- Pack create/update/delete/upload/register/install.
- Manual execution requests.
- Audit-log reads.

## Related

- [Authentication and Identity](/administration/authentication-and-identity/)
- [Permissions and RBAC](/administration/permissions-and-rbac/)
- [Security Operations](/operations/security/)
