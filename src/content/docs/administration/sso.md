---
title: "SSO Configuration"
description: "Attune supports three login methods:"
sidebar:
  label: "SSO Configuration"
  order: 4
---
Attune supports three login methods:

- Local username/password accounts.
- OIDC browser redirect login.
- LDAP username/password login against a directory.

The API service owns SSO configuration. The Web UI discovers enabled login methods from `GET /auth/settings`, then shows or hides login buttons based on `security.login_page`.

![Access control identities page for users created through local or SSO login](/screenshots/SSO-Configuration.png)

## Login page controls

```yaml
security:
  login_page:
    show_local_login: true
    show_oidc_login: true
    show_ldap_login: true
```

Users can also choose a login method directly with:

```text
/login?auth=direct
/login?auth=<provider_name>
```

`provider_name` comes from `security.oidc.provider_name` or `security.ldap.provider_name`.

## OIDC provider configuration

OIDC is the preferred enterprise SSO option when your identity provider supports OpenID Connect. Attune uses browser redirect login with PKCE, verifies the ID token, can enrich identity details from userinfo, and stores provider claims under `identity.attributes.oidc`.

Minimal configuration:

```yaml
security:
  oidc:
    enabled: true
    discovery_url: https://sso.example.com/.well-known/openid-configuration
    client_id: attune
    client_secret: replace-with-literal-secret
    provider_name: sso
    provider_label: Company SSO
    redirect_uri: https://attune.example.com/auth/callback
    post_logout_redirect_uri: https://attune.example.com/login
    scopes:
      - groups
```

| Field | Required when enabled | Purpose |
| --- | --- | --- |
| `enabled` | Yes | Enables the OIDC login flow. |
| `discovery_url` | Yes | Provider discovery document URL. |
| `client_id` | Yes | Confidential OIDC client ID registered with the provider. |
| `client_secret` | Yes | Confidential client secret. Inject it as a runtime secret. |
| `redirect_uri` | Yes | Callback URI registered with the provider. For normal web deployments use `https://<attune-host>/auth/callback`. |
| `provider_name` | No | Stable login selector name used by `?auth=<provider_name>`. Defaults to `oidc`. |
| `provider_label` | No | User-facing button label. |
| `provider_icon_url` | No | Optional icon shown on the login page. |
| `post_logout_redirect_uri` | No | Where users return after provider logout. |
| `scopes` | No | Additional scopes beyond Attune's base OIDC scopes. Use this for provider-specific group claims when needed. |

Register the exact `redirect_uri` with the provider. If users access Attune through a reverse proxy or ingress, use the public HTTPS URL, not the internal API service URL.

`scopes` is a YAML list. The runtime `ATTUNE__...` environment override loader does not currently parse list-valued fields for `Config::load()`, so configure additional OIDC scopes in YAML or omit the field when using environment-only SSO overrides.

## CLI SSO login

After OIDC is enabled on the API service, users can log in from the Attune CLI without a password:

```bash
# Use the active profile's API URL
attune auth sso-login

# Save SSO credentials to a named profile
attune auth sso-login --url https://attune.example.com --save-profile prod

# Headless or remote shell: print the URL instead of opening a browser
attune auth sso-login --no-browser
```

The CLI starts a temporary local callback server, sends its loopback callback URL to `/auth/oidc/login`, and opens the provider login page. After the provider redirects back to Attune, the API posts the access and refresh tokens to the CLI callback and the CLI stores them in `~/.config/attune/config.yaml`.

For `--no-browser`, copy the printed URL into a browser that can reach the Attune API. Keep the CLI process running until the browser flow completes. Use `--port <port>` only when a fixed local callback port is required by your environment; otherwise the CLI chooses a free port automatically.

Verify the saved session:

```bash
attune auth whoami
```

## LDAP provider configuration

LDAP is useful when users should log in with existing directory credentials but no OIDC provider is available. Attune supports two modes.

### Direct-bind mode

Direct bind constructs a user DN from the login value and binds with the user's password:

```yaml
security:
  ldap:
    enabled: true
    url: ldaps://ldap.example.com:636
    bind_dn_template: "uid={login},ou=users,dc=example,dc=com"
    login_attr: uid
    email_attr: mail
    display_name_attr: cn
    group_attr: memberOf
    provider_name: ldap
    provider_label: Company LDAP
```

Use direct-bind mode when logins map cleanly to a DN template.

### Search-and-bind mode

Search-and-bind first binds with a service account, searches for the user's DN, then re-binds as that user:

```yaml
security:
  ldap:
    enabled: true
    url: ldaps://ldap.example.com:636
    user_search_base: "ou=users,dc=example,dc=com"
    user_filter: "(uid={login})"
    search_bind_dn: "cn=attune-readonly,ou=service-accounts,dc=example,dc=com"
    search_bind_password: replace-with-literal-secret
    login_attr: uid
    email_attr: mail
    display_name_attr: cn
    group_attr: memberOf
    provider_name: ldap
    provider_label: Company LDAP
```

Use search-and-bind when user DNs vary or the login value is not enough to construct a DN. `search_bind_dn` and `search_bind_password` must both be set or both omitted; setting only one is a configuration error.

Raw Attune YAML does not interpolate `${TOKEN}` placeholders. Values shown in
these YAML examples are literal; prefer the corresponding `ATTUNE__...`
environment override or deployment secret injection for credentials.

| Field | Purpose |
| --- | --- |
| `enabled` | Enables LDAP login. |
| `url` | LDAP server URL, such as `ldap://ldap.example.com:389` or `ldaps://ldap.example.com:636`. Required when enabled. |
| `bind_dn_template` | Direct-bind DN template using `{login}`. If set, direct-bind mode is used. |
| `user_search_base` | Base DN for search-and-bind mode. |
| `user_filter` | Search filter using `{login}`. Defaults to `(uid={login})`. |
| `search_bind_dn` | Service-account DN for search-and-bind mode. |
| `search_bind_password` | Service-account password. Inject it as a runtime secret. |
| `login_attr` | Directory attribute used as the Attune login. Defaults to `uid`. |
| `email_attr` | Email attribute. Defaults to `mail`. |
| `display_name_attr` | Display-name attribute. Defaults to `cn`. |
| `group_attr` | Group membership attribute. Defaults to `memberOf`. |
| `starttls` | Use STARTTLS with an `ldap://` URL. Defaults to `false`. |
| `danger_skip_tls_verify` | Skip TLS certificate verification. Only use for local testing. |
| `provider_name` | Stable login selector name used by `?auth=<provider_name>`. Defaults to `ldap`. |
| `provider_label` | User-facing button label. |
| `provider_icon_url` | Optional icon shown on the login page. |

Prefer `ldaps://` with valid certificates. Use `starttls: true` only when your LDAP server expects STARTTLS on a plain LDAP port. Do not use `danger_skip_tls_verify` in production.

## Docker Compose deployment

Docker Compose uses `config.docker.yaml` plus explicit environment variables on each service. A project `.env` file is used by Compose for interpolation, but variables are not automatically injected into containers unless the compose file references them. For SSO, add the `ATTUNE__...` overrides to the `api` service environment, preferably through a local override file that is not committed.

Example `docker-compose.sso.yaml`:

```yaml
services:
  api:
    environment:
      ATTUNE__SECURITY__LOGIN_PAGE__SHOW_LOCAL_LOGIN: "true"
      ATTUNE__SECURITY__LOGIN_PAGE__SHOW_OIDC_LOGIN: "true"
      ATTUNE__SECURITY__LOGIN_PAGE__SHOW_LDAP_LOGIN: "true"

      ATTUNE__SECURITY__OIDC__ENABLED: "true"
      ATTUNE__SECURITY__OIDC__DISCOVERY_URL: "https://sso.example.com/.well-known/openid-configuration"
      ATTUNE__SECURITY__OIDC__CLIENT_ID: "attune"
      ATTUNE__SECURITY__OIDC__CLIENT_SECRET: "${OIDC_CLIENT_SECRET}"
      ATTUNE__SECURITY__OIDC__PROVIDER_NAME: "sso"
      ATTUNE__SECURITY__OIDC__PROVIDER_LABEL: "Company SSO"
      ATTUNE__SECURITY__OIDC__REDIRECT_URI: "https://attune.example.com/auth/callback"
      ATTUNE__SECURITY__OIDC__POST_LOGOUT_REDIRECT_URI: "https://attune.example.com/login"
```

For LDAP search-and-bind:

```yaml
services:
  api:
    environment:
      ATTUNE__SECURITY__LDAP__ENABLED: "true"
      ATTUNE__SECURITY__LDAP__URL: "ldaps://ldap.example.com:636"
      ATTUNE__SECURITY__LDAP__USER_SEARCH_BASE: "ou=users,dc=example,dc=com"
      ATTUNE__SECURITY__LDAP__USER_FILTER: "(uid={login})"
      ATTUNE__SECURITY__LDAP__SEARCH_BIND_DN: "cn=attune-readonly,ou=service-accounts,dc=example,dc=com"
      ATTUNE__SECURITY__LDAP__SEARCH_BIND_PASSWORD: "${LDAP_SEARCH_BIND_PASSWORD}"
      ATTUNE__SECURITY__LDAP__LOGIN_ATTR: "uid"
      ATTUNE__SECURITY__LDAP__EMAIL_ATTR: "mail"
      ATTUNE__SECURITY__LDAP__DISPLAY_NAME_ATTR: "cn"
      ATTUNE__SECURITY__LDAP__GROUP_ATTR: "memberOf"
      ATTUNE__SECURITY__LDAP__PROVIDER_NAME: "ldap"
      ATTUNE__SECURITY__LDAP__PROVIDER_LABEL: "Company LDAP"
```

Run with:

```bash
OIDC_CLIENT_SECRET=... LDAP_SEARCH_BIND_PASSWORD=... \
docker compose -f docker-compose.yaml -f docker-compose.sso.yaml up -d api web
```

Restart the API after changing SSO configuration. The Web UI reads login settings from the API, so a web rebuild is not required.

## Kubernetes / Helm deployment

The Helm chart mounts `charts/attune/files/config.docker.yaml` as the base config and loads environment variables from the chart secret with `envFrom`. The chart currently does not have first-class `values.yaml` keys for OIDC/LDAP, so use `ATTUNE__...` environment overrides in the secret used by `envFrom`.

There are two patterns:

1. Use the chart-generated secret for basic values, then add SSO keys with your secret-management tooling.
2. Set `security.existingSecret` and provide a complete secret yourself.

When using `security.existingSecret`, the secret must include the normal required Attune keys as well as SSO overrides, because the chart will not create its default secret.

Create `attune-secrets.yaml` with every key from the chart-generated secret plus the SSO overrides. The connection URLs below require percent-encoded credentials. Either generate URI-safe database and RabbitMQ passwords, or percent-encode those two password values in the URLs while keeping `DB_PASSWORD` and the Helm values unencoded.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: attune-secrets
  namespace: attune
type: Opaque
stringData:
  ATTUNE__SECURITY__JWT_SECRET: "replace-with-strong-random-secret"
  ATTUNE__SECURITY__ENCRYPTION_KEY: "replace-with-32-plus-byte-secret"
  ATTUNE__DATABASE__URL: "postgresql://attune:replace-with-uri-safe-database-password@attune-attune-postgresql:5432/attune"
  ATTUNE__MESSAGE_QUEUE__URL: "amqp://attune:replace-with-uri-safe-rabbitmq-password@attune-attune-rabbitmq:5672"
  DB_HOST: "attune-attune-postgresql"
  DB_PORT: "5432"
  DB_USER: "attune"
  DB_PASSWORD: "replace-with-uri-safe-database-password"
  DB_NAME: "attune"
  DB_SCHEMA: "attune"
  TEST_LOGIN: "admin@example.com"
  TEST_DISPLAY_NAME: "Attune Administrator"
  TEST_PASSWORD: "TestPass123!"
  DEFAULT_ADMIN_LOGIN: "admin@example.com"
  DEFAULT_ADMIN_PERMISSION_SET_REF: "core.admin"
  SOURCE_PACKS_DIR: "/source/packs"
  TARGET_PACKS_DIR: "/opt/attune/packs"
  RUNTIME_ENVS_DIR: "/opt/attune/runtime_envs"
  ARTIFACTS_DIR: "/opt/attune/artifacts"
  LOADER_SCRIPT: "/scripts/load_core_pack.py"

  ATTUNE__SECURITY__LOGIN_PAGE__SHOW_LOCAL_LOGIN: "true"
  ATTUNE__SECURITY__LOGIN_PAGE__SHOW_OIDC_LOGIN: "true"
  ATTUNE__SECURITY__LOGIN_PAGE__SHOW_LDAP_LOGIN: "true"

  ATTUNE__SECURITY__OIDC__ENABLED: "true"
  ATTUNE__SECURITY__OIDC__DISCOVERY_URL: "https://sso.example.com/.well-known/openid-configuration"
  ATTUNE__SECURITY__OIDC__CLIENT_ID: "attune"
  ATTUNE__SECURITY__OIDC__CLIENT_SECRET: "replace-with-oidc-client-secret"
  ATTUNE__SECURITY__OIDC__PROVIDER_NAME: "sso"
  ATTUNE__SECURITY__OIDC__PROVIDER_LABEL: "Company SSO"
  ATTUNE__SECURITY__OIDC__REDIRECT_URI: "https://attune.example.com/auth/callback"
  ATTUNE__SECURITY__OIDC__POST_LOGOUT_REDIRECT_URI: "https://attune.example.com/login"

  ATTUNE__SECURITY__LDAP__ENABLED: "true"
  ATTUNE__SECURITY__LDAP__URL: "ldaps://ldap.example.com:636"
  ATTUNE__SECURITY__LDAP__USER_SEARCH_BASE: "ou=users,dc=example,dc=com"
  ATTUNE__SECURITY__LDAP__USER_FILTER: "(uid={login})"
  ATTUNE__SECURITY__LDAP__SEARCH_BIND_DN: "cn=attune-readonly,ou=service-accounts,dc=example,dc=com"
  ATTUNE__SECURITY__LDAP__SEARCH_BIND_PASSWORD: "replace-with-ldap-password"
  ATTUNE__SECURITY__LDAP__LOGIN_ATTR: "uid"
  ATTUNE__SECURITY__LDAP__EMAIL_ATTR: "mail"
  ATTUNE__SECURITY__LDAP__DISPLAY_NAME_ATTR: "cn"
  ATTUNE__SECURITY__LDAP__GROUP_ATTR: "memberOf"
  ATTUNE__SECURITY__LDAP__PROVIDER_NAME: "ldap"
  ATTUNE__SECURITY__LDAP__PROVIDER_LABEL: "Company LDAP"
```

Keep the database, RabbitMQ, and bootstrap identity values in `values-sso.yaml` synchronized with that Secret:

```yaml
security:
  existingSecret: attune-secrets

database:
  password: replace-with-uri-safe-database-password

rabbitmq:
  password: replace-with-uri-safe-rabbitmq-password

bootstrap:
  testUser:
    login: admin@example.com
    displayName: Attune Administrator
```

Then install or upgrade from the public chart repository:

```bash
helm repo add attune https://raw.githubusercontent.com/attune-system/attune-charts/main
helm repo update attune

kubectl create namespace attune --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f attune-secrets.yaml

helm upgrade --install attune attune/attune \
  --namespace attune \
  --values values-sso.yaml \
  --wait \
  --wait-for-jobs
```

If your cluster uses External Secrets, Sealed Secrets, Vault, or another secret operator, create the same key names in the resulting Kubernetes Secret.

## Operational checks

After changing SSO configuration:

1. Restart the API pods/containers.
2. Open `/auth/settings` and verify the provider is marked configured and visible.
3. Open `/login?auth=<provider_name>` to test a specific provider.
4. For OIDC, confirm the provider redirects back to `/auth/callback`.
5. For CLI SSO, run `attune auth sso-login --no-browser` and confirm the printed URL starts with the expected Attune API host.
6. For LDAP, test both a valid and invalid credential path and inspect API logs for bind/search errors.

## Related

- [Authentication and Identity](/administration/authentication-and-identity/)
- [Configuration](/administration/configuration/)
- [Configuration Reference](/reference/configuration/)
- [Docker Operations](/operations/docker/)
- [Kubernetes Operations](/operations/kubernetes/)
