---
title: "Authentication and Identity"
description: "Attune authenticates API, CLI, Web UI, notifier, and MCP clients with JWTs. Identities can come from local accounts, OIDC, LDAP, and sensor identities. Execution-scoped tokens carr"
sidebar:
  label: "Authentication and Identity"
  order: 3
---
Attune authenticates API, CLI, Web UI, notifier, and MCP clients with JWTs. Identities can come from local accounts, OIDC, LDAP, and sensor identities. Execution-scoped tokens carry the triggering identity with narrowed permissions.

![Access control identity list showing local and automation identities](/screenshots/Authentication-and-Identity.png)

## Token types

| Token | Use |
| --- | --- |
| Access token | Short-lived API/Web UI/CLI access. |
| Refresh token | Gets new access tokens. |
| Execution token | Narrow token issued for an execution when permission refs are present. |
| Sensor token | Sensor/event-emission flows. |

The notifier accepts access and execution tokens for WebSocket connections. Refresh and sensor tokens are rejected for WebSocket use.

## Local login

Local accounts authenticate with login/password. Passwords are hashed with Argon2id.

```bash
attune auth login
attune auth whoami
attune auth logout
```

## OIDC

OIDC supports browser redirect login with PKCE, ID token validation, optional userinfo enrichment, and provider logout when configured. Identities are matched by issuer and subject in identity attributes.

Use OIDC when users already authenticate through an enterprise identity provider. See [SSO Configuration](/administration/sso/) for Docker Compose and Kubernetes examples.

CLI users can authenticate through the same OIDC flow:

```bash
attune auth sso-login
attune auth sso-login --no-browser
```

The CLI saves the returned access and refresh tokens to the active or selected profile. See [CLI Reference](/reference/cli/#ssooidc-login) for profile and headless login options.

## LDAP

LDAP supports:

- Direct bind with a DN template.
- Search-and-bind through a service account.
- STARTTLS.
- Configurable attribute mapping for login, email, display name, and groups.

Use LDAP when existing directory accounts should log into Attune without an OIDC provider.

## Automation identities

There is no separate `service_account` identity type or service-account CRUD API. For automation, use a constrained local identity, a sensor token for sensor event emission, or an execution token inside an action run. Grant only the roles, constrained permissions, or permission refs required.

## Execution identity

Executions are attributed to the triggering identity where possible:

- Manual executions use the authenticated caller.
- Rule-triggered executions use `rule.owner_identity` when present; system-loaded rules can fall back to the system identity.
- Queue-dispatched and workflow child executions preserve attribution through execution metadata.

## WebSocket authentication

Non-browser clients:

```http
Authorization: Bearer <jwt>
```

Browser clients use WebSocket subprotocols:

```text
attune.v1
attune.jwt.<jwt>
```

The server selects `attune.v1` and extracts the token from the secondary protocol. Query-string tokens are not accepted.

## Token expiration

Access tokens expire. Clients should refresh and retry. WebSocket clients are disconnected when the token expires, using close code `4401` and reason `token expired`.

## Related

- [Permissions and RBAC](/administration/permissions-and-rbac/)
- [SSO Configuration](/administration/sso/)
- [Security Operations](/operations/security/)
- [CLI Reference](/reference/cli/)
