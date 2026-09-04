---
title: "CLI Reference"
description: "The attune CLI is the primary command-line interface for users, admins, CI/CD, and operators. The same crate also provides the attune-mcp server."
sidebar:
  label: "CLI Reference"
  order: 1
---
The `attune` CLI is the primary command-line interface for users, admins, CI/CD, and operators. The same crate also provides the `attune-mcp` server.

## Install a released binary

The Windows and macOS packages install both `attune` and `attune-mcp`.

### Windows (Chocolatey)

In an elevated PowerShell session, install the approved `attune-cli` package from the Chocolatey community feed:

```powershell
choco install attune-cli -y
attune --help
attune-mcp --help
```

The package supports 64-bit Windows and installs both executables. Open a new terminal if PowerShell cannot find either command immediately after installation. To install a newer approved release later, run `choco upgrade attune-cli -y`.

### macOS (Homebrew)

Install the Attune cask from the Attune Homebrew tap:

```bash
brew install --cask attune-system/attune-client-tap/attune
attune --help
attune-mcp --help
```

Homebrew selects the appropriate released binary for Apple Silicon or Intel Macs.

To install a newer release later, run `brew upgrade --cask attune`.

For GUI-launched MCP clients, use the installed binary's absolute path:

```bash
command -v attune-mcp
```

## Install from source

```bash
cargo install --path crates/cli
```

Development:

```bash
cargo build -p attune-cli
./target/debug/attune --help
./target/debug/attune-mcp --help
```

## Configuration

CLI config is stored under:

```text
~/.config/attune/config.yaml
```

If `XDG_CONFIG_HOME` is set, the CLI uses `$XDG_CONFIG_HOME/attune/config.yaml`.

Useful environment variables:

| Variable | Purpose |
| --- | --- |
| `ATTUNE_API_URL` | Override API endpoint. |
| `ATTUNE_PROFILE` | Select a saved profile. |
| `ATTUNE_API_TOKEN` | Execution-scoped token, preferred inside worker actions. |
| `ATTUNE_AUTH_TOKEN` | Non-interactive access token. |
| `ATTUNE_REFRESH_TOKEN` | Non-interactive refresh token. |
| `ATTUNE_LOGIN` / `ATTUNE_PASSWORD` | Non-interactive login for MCP/automation. |
| `ATTUNE_MCP_HTTP_BEARER_TOKEN` | Separate bearer token required from HTTP `/mcp` clients. |
| `ATTUNE_MCP_PUBLIC_LISTEN` | Explicitly allow a non-loopback MCP HTTP listener. |

## Global options

```bash
attune --api-url http://localhost:8080 <command>
attune -j <command>      # JSON output
attune -y <command>      # YAML output
attune -v <command>      # verbose logging
```

`--output ndjson` is supported only for cache entry scans; other commands use `table`, `json`, or `yaml`.

For one-off profile selection, verify the target with `attune config show-profile NAME`; `config current` and `config get` inspect global config state rather than proving the `--profile` target. API commands, including `auth whoami`, use environment-token precedence: `ATTUNE_API_TOKEN`, then `ATTUNE_AUTH_TOKEN`, then the selected profile.

## Authentication

```bash
attune auth login --username test@attune.local
attune auth whoami
attune auth logout
```

### SSO/OIDC login

Use `auth sso-login` when Attune is configured for OIDC SSO. The CLI starts a temporary loopback callback server, opens the provider login page in your browser, and saves the returned access and refresh tokens to the active profile.

```bash
# Log in with SSO using the active profile's API URL
attune auth sso-login

# Use a specific API URL and save the tokens to a named profile
attune auth sso-login --url https://attune.example.com --save-profile prod

# Headless or remote shell: print the URL instead of opening a browser
attune auth sso-login --no-browser
```

For headless login, open the printed URL in a browser that can reach the Attune API. After provider authentication, the browser posts the tokens back to the CLI's local callback URL.

Useful options:

| Option | Purpose |
| --- | --- |
| `--url <url>` | API URL to use for this login and save to the target profile. |
| `--save-profile <name>` | Save returned tokens to a named profile. |
| `--port <port>` | Use a specific local callback port instead of a random free port. |
| `--no-browser` | Print the login URL instead of launching the system browser. |

The OIDC provider must already be configured on the API service. See [SSO Configuration](/administration/sso/).

## Packs

```bash
attune pack list
attune pack show core
attune pack create --ref my_pack
attune pack upload ./packs/my_pack
attune pack upload ./packs/my_pack --force
attune pack register /opt/attune/packs/my_pack
attune pack install https://example.com/pack.git --ref-spec v1.0.0
attune pack install my_pack@1.0.0 --registry-id 42
attune pack install https://example.com/my-pack.tar.gz --no-registry
```

Prefer registry references for verified installation. The direct remote example
requires the deployment-level
`pack_registry.allow_unverified_direct_remote_installs: true` opt-in and an
approved HTTPS host.

`--registry-id` pins a registry ref to one enabled managed index. `--no-registry`
requires an explicit URL or a path already visible to the API server, never
performs registry lookup, and cannot be combined with `--registry-id`. The CLI
does not upload workstation-local paths.

Pack upload works from a local workstation. Pack register requires the path to be visible from the API service.

Prefer `pack upload` for local content. Successful `pack register` responses include the registered pack plus test status/skipped-test information and render consistently in table, JSON, and YAML output.

## Pack indices

```bash
attune pack index list
attune pack index add <url>
attune pack index update <id> --position 0
attune pack index browse
attune pack index show <pack-ref>
attune pack index delete <id>
attune pack index-entry ./packs/my_pack --git-url https://example.com/my_pack.git --git-ref <commit-sha>
attune pack index-update --index index.json ./packs/my_pack --git-url https://example.com/my_pack.git --git-ref <commit-sha>
attune pack index-merge --file merged-index.json first-index.json second-index.json
```

Use `pack index` to manage server-side trusted pack catalogs. `index-entry`,
`index-update`, and `index-merge` build index files locally.
See [Custom Pack Indices](/administration/custom-pack-indices/) for ordering, format,
hosting, validation, and configuration examples.

## Shell completion

```bash
source <(attune completion bash)
```

`attune completion fish` and `attune completion zsh` emit files for the Fish
and Zsh completion directories. The scripts complete commands and options
locally. Dynamic action and parameter candidates use the active profile and
fail closed when the API is unavailable.

## Actions and executions

```bash
attune action list
attune action show core.echo
attune action execute core.echo --param message=hello
attune action execute core.echo --params-json '{"message":"hello"}'
attune action execute core.echo --param message=hello --watch
attune action execute my_pack.long_job --execution-timeout 900 --watch
attune execution list
attune execution show <id>
attune execution watch <id>
attune execution rerun <id>
attune execution rerun <id> --watch
```

Use `--watch` where available to follow long-running executions.

Single-execution watch honors its timeout/notifier options and exits nonzero when the execution finishes `failed`, `cancelled`, or `timeout`. List-mode `attune execution watch` ignores those single-execution settings and runs until interrupted.

Rerun can safely reuse visible non-secret parameters. Stored execution config redacts secret destinations, so supply every secret parameter again through an appropriately protected input path. The CLI rejects a rerun while any Attune redaction marker remains and reports the parameter paths that require replacement.

Use `--execution-timeout <seconds>` on `action execute`, `run`, or `execution rerun` to override the action default for that single execution. The timeout is snapshotted onto the new execution row; omitted values inherit the action's `timeout_seconds` default or the platform `default_execution_timeout_seconds`.

Pack-deployed action defaults can be changed from YAML with `timeout_seconds`, or patched from the CLI:

```bash
attune action update my_pack.long_job --timeout-seconds 900
attune action update my_pack.long_job --clear-timeout
```

### Top-level `run` shortcut

`attune run` is an alias for `attune action execute`:

```bash
attune run core.echo --param message=hello --watch
```

### Worker placement overrides

Constrain execution to specific workers at run time:

```bash
# Target workers with specific labels
attune action execute my_pack.train --param epochs=10 \
  --worker-selector '{"pool": "gpu"}'

# Add taint tolerations
attune run my_pack.heavy_job --param input=data.csv \
  --worker-tolerations '[{"key":"dedicated","operator":"equal","value":"ml","effect":"no_schedule"}]'

# Affinity preferences
attune action execute my_pack.deploy --param env=prod \
  --worker-affinity '{"preferred":[{"weight":100,"selector":{"zone":"us-east-1"}}]}'
```

These flags are also available on `attune execution rerun`. Omitting a flag inherits the action's default placement; passing an empty object (`'{}'`) or array (`'[]'`) explicitly clears it for that execution.

## Workflows

```bash
attune workflow upload actions/deploy.yaml
attune workflow upload actions/deploy.yaml --force
attune workflow list
attune workflow show my_pack.deploy
attune workflow delete my_pack.deploy --yes
```

Workflow upload reads `workflow_file` from the action YAML and uploads both action metadata and the companion graph file.

## Keys

```bash
attune key list
attune key create --local-ref my_token --name "Token" --value "secret" --encrypt
attune key show system.my_token
attune key show system.my_token --decrypt
attune key update system.my_token --value '{"host":"db","port":5432}'
attune key delete system.my_token --yes
```

Keys can store structured JSON, not just strings. Attune combines the owner scope and `--local-ref` into a canonical ref such as `system.my_token` or `pack.my_pack.api_token`.

`key show` reads the key through the API. If the caller has a matching `keys:decrypt` grant, the API returns plaintext and the CLI displays its SHA-256 digest by default. `--decrypt` displays the returned value instead. Without the decrypt grant, the API returns null for an encrypted value.

See [Keys and secrets](/administration/keys-and-secrets/) for owner flags, canonical refs, UI operations, and execution access.

## Data Caches

`attune cache` manages versioned external-data caches separately from Keys and
Secrets. Every namespace-addressed command requires `--owner-type`; pack,
action, and sensor owners also require the matching owner-ref flag.

```bash
# Namespace policy
attune cache namespace list --owner-type pack --owner-pack-ref salesforce
attune cache namespace create salesforce.users --owner-type pack --owner-pack-ref salesforce
attune cache namespace show salesforce.users --owner-type pack --owner-pack-ref salesforce
attune cache namespace update salesforce.users --owner-type pack --owner-pack-ref salesforce \
  --freshness-target-seconds 3600
attune cache namespace delete salesforce.users --owner-type pack --owner-pack-ref salesforce --yes

# Reads and generation history
attune cache entry get salesforce.users 005xx --owner-type pack --owner-pack-ref salesforce
attune cache entry get-many salesforce.users --owner-type pack --owner-pack-ref salesforce \
  --external-id 005xx --external-id-file ids.txt
attune cache entry scan salesforce.users --owner-type pack --owner-pack-ref salesforce
attune cache generation list salesforce.users --owner-type pack --owner-pack-ref salesforce
attune cache generation show salesforce.users 123 --owner-type pack --owner-pack-ref salesforce

# Refresh
attune cache refresh begin salesforce.users --owner-type pack --owner-pack-ref salesforce \
  --expected-chunk-count 1 --expect-empty
attune cache refresh upload salesforce.users 123 --owner-type pack --owner-pack-ref salesforce \
  --chunk-index 0 --file users.ndjson
attune cache refresh seal salesforce.users 123 --owner-type pack --owner-pack-ref salesforce \
  --expected-chunk-count 1
attune cache refresh promote salesforce.users 123 --owner-type pack --owner-pack-ref salesforce \
  --expect-empty
attune cache refresh abort salesforce.users 123 --owner-type pack --owner-pack-ref salesforce --yes
```

Use `attune cache refresh apply <namespace> --input <ndjson>` for a bounded
single-command refresh. It still requires `--expected-active <id>` or
`--expect-empty` and never force-promotes over another writer.

For streaming scans:

```bash
attune --output ndjson cache entry scan salesforce.users \
  --owner-type pack --owner-pack-ref salesforce --all > users.ndjson
```

Entries go to stdout one per line; pinned generation and cursor metadata go to
stderr. See [Data Caches](/administration/data-caches/) for ownership, lifecycle, quotas, and
error behavior.

## Artifacts

```bash
attune artifact list
attune artifact list --execution 42
attune artifact show my_pack.build_log
attune artifact create --ref my_pack.build_log --scope action --owner my_pack.deploy --type file_text --name "Build Log"
attune artifact upload 1 ./output.log
attune artifact download 1 -o ./output.log
attune artifact version list 1
attune artifact version download 1 2 -o ./v2.log
```

`artifact create` returns the new artifact ID. Capture that response and use the returned ID, rather than assuming `1`, for upload, download, delete, and version commands.

## MCP server

`attune-mcp` exposes a curated, non-exhaustive surface that also includes packs, rules, execution listing and trace reports, queue metadata operations, and bounded cache lifecycle/read operations. Query `tools/list` for the installed binary's exact catalog.

For local IDE, editor, and AI agent configuration, see [MCP Server Local Setup](/reference/mcp/).

Stdio:

```bash
attune-mcp
```

HTTP:

```bash
attune-mcp --transport http --http-bearer-token "$MCP_CLIENT_TOKEN"
```

HTTP defaults to `127.0.0.1:8090` and requires a separate inbound bearer token for `/mcp`. Clients send `Authorization: Bearer $MCP_CLIENT_TOKEN`; this token is distinct from the profile, login, `ATTUNE_AUTH_TOKEN`, or `ATTUNE_API_TOKEN` used for outbound Attune API calls. Non-loopback listeners also require `--public-listen`; expose them only through protected ingress with authentication and restricted network reachability.

Inside an Attune execution:

```bash
ATTUNE_API_URL=http://attune-api:8080 ATTUNE_API_TOKEN="$ATTUNE_API_TOKEN" attune-mcp
```

Direct event creation is intentionally not exposed through MCP.

## Related

- [API Reference](/reference/api/)
- [Custom Pack Indices](/administration/custom-pack-indices/)
- [Data Caches](/administration/data-caches/)
- [Permissions and RBAC](/administration/permissions-and-rbac/)
- [MCP Server Local Setup](/reference/mcp/)
- [Using Pack Actions in Workflows](/pack-development/composing-actions/)
