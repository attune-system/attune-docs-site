---
title: "MCP Server Local Setup"
description: "Use attune-mcp to connect local IDEs, editors, and AI agent tooling to an Attune API. The MCP server exposes a curated tool surface backed by the same permissions as the authentica"
sidebar:
  label: "MCP Server Local Setup"
  order: 2
---
Use `attune-mcp` to connect local IDEs, editors, and AI agent tooling to an Attune API. The MCP server exposes a curated tool surface backed by the same permissions as the authenticated Attune identity.

For most local tools, run `attune-mcp` over stdio. Use HTTP only when the client or harness explicitly supports an HTTP JSON-RPC endpoint.

## Prerequisites

Start a local Attune environment with the [`attune-docker` distribution](/administration/quick-start/), then verify the API:

```bash
curl http://localhost:8080/health
```

Install the released CLI package with [Homebrew or Chocolatey](/reference/cli/#install-a-released-binary). Both packages install `attune` and `attune-mcp`. Verify the MCP binary with `attune-mcp --help`.

For source builds or development, build or install the CLI binaries instead:

```bash
cargo build -p attune-cli
./target/debug/attune --help
./target/debug/attune-mcp --help
```

For a persistent local install:

```bash
cargo install --path crates/cli
attune --help
attune-mcp --help
```

Authenticate the CLI profile that the MCP server will use:

```bash
attune auth login --username test@attune.local --password 'TestPass123!'
attune auth whoami
```

The default local API URL is `http://localhost:8080`. Override it with `--api-url` or `ATTUNE_API_URL` when connecting to another Attune instance.

## What MCP Exposes

`attune-mcp` exposes a curated, version-dependent tool surface. The following catalog is representative, not exhaustive; use `tools/list` against the running binary for the authoritative list.

| Area | Tools |
| --- | --- |
| Actions | List, search, get, and execute actions. |
| Workflows | List and get workflows. |
| Executions | List, get, and cancel executions. |
| Trace reports | Get an execution trace report. |
| Rules | Get rules and update supported rule metadata. |
| Work queues | List queues, get queue definitions, and enqueue queue items. |
| Artifacts | List and get artifacts. |
| Events | List and get recorded events. |
| Inquiries | List inquiries and submit inquiry responses. |
| Packs | List packs, get pack metadata, update pack config, and list actions in a pack. |
| Data caches | Manage namespaces and refreshes, and perform bounded entry and generation reads. |

Direct event creation is intentionally not exposed through MCP.

## STDIO Mode

Stdio is the recommended transport for local MCP clients. The IDE or agent process starts `attune-mcp`, sends JSON-RPC over stdin, and reads responses from stdout.

Run with the active CLI profile:

```bash
attune-mcp
```

Run from a source checkout:

```bash
/path/to/attune/target/debug/attune-mcp --api-url http://localhost:8080
```

Run with an explicit profile:

```bash
attune-mcp --profile default
```

Most MCP-capable tools have a server configuration that looks like this:

```json
{
  "mcpServers": {
    "attune": {
      "command": "/path/to/attune-mcp",
      "args": [
        "--api-url",
        "http://localhost:8080"
      ]
    }
  }
}
```

Use an absolute path for `command`. If the binary is installed on `PATH`, `attune-mcp` is usually enough, but absolute paths are more reliable for GUI-launched editors.

## Client Examples

Replace `/path/to/attune-mcp` with either an installed binary path or the repo build path, for example `/home/david/Codebase/attune/target/debug/attune-mcp`.

### VS Code

VS Code stores MCP configuration in `mcp.json`. Use `MCP: Open User Configuration` for a user-level server or `MCP: Open Workspace Folder MCP Configuration` for `.vscode/mcp.json`.

```json
{
  "servers": {
    "attune": {
      "type": "stdio",
      "command": "/path/to/attune-mcp",
      "args": [
        "--api-url",
        "http://localhost:8080"
      ]
    }
  }
}
```

Token-based variant:

```json
{
  "servers": {
    "attune": {
      "type": "stdio",
      "command": "/path/to/attune-mcp",
      "env": {
        "ATTUNE_API_URL": "http://localhost:8080",
        "ATTUNE_AUTH_TOKEN": "${input:attune-token}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "attune-token",
      "description": "Attune access token",
      "password": true
    }
  ]
}
```

### Zed

Zed uses `context_servers` in `settings.json`, not `mcpServers`. Open user settings with `zed: open settings` or project settings with `zed: open project settings`.

```json
{
  "context_servers": {
    "attune": {
      "command": "/path/to/attune-mcp",
      "args": [
        "--api-url",
        "http://localhost:8080"
      ],
      "env": {}
    }
  }
}
```

Token-based variant:

```json
{
  "context_servers": {
    "attune": {
      "command": "/path/to/attune-mcp",
      "env": {
        "ATTUNE_API_URL": "http://localhost:8080",
        "ATTUNE_AUTH_TOKEN": "replace-with-access-token"
      }
    }
  }
}
```

If this is project-level Zed configuration, the worktree must be trusted before Zed will run the configured context server.

### Cursor

Cursor uses `mcpServers`. Use `~/.cursor/mcp.json` for a global server or `.cursor/mcp.json` for a project-local server.

```json
{
  "mcpServers": {
    "attune": {
      "command": "/path/to/attune-mcp",
      "args": [
        "--api-url",
        "http://localhost:8080"
      ]
    }
  }
}
```

Cursor supports variable interpolation in `command`, `args`, and `env`, so token injection can use environment variables:

```json
{
  "mcpServers": {
    "attune": {
      "command": "/path/to/attune-mcp",
      "env": {
        "ATTUNE_API_URL": "http://localhost:8080",
        "ATTUNE_AUTH_TOKEN": "${env:ATTUNE_AUTH_TOKEN}"
      }
    }
  }
}
```

### Windsurf

Windsurf uses `~/.codeium/windsurf/mcp_config.json` with the `mcpServers` key.

```json
{
  "mcpServers": {
    "attune": {
      "command": "/path/to/attune-mcp",
      "args": [
        "--api-url",
        "http://localhost:8080"
      ]
    }
  }
}
```

Windsurf also supports variable interpolation:

```json
{
  "mcpServers": {
    "attune": {
      "command": "/path/to/attune-mcp",
      "env": {
        "ATTUNE_API_URL": "http://localhost:8080",
        "ATTUNE_AUTH_TOKEN": "${env:ATTUNE_AUTH_TOKEN}"
      }
    }
  }
}
```

### Claude Code

Claude Code can add a stdio MCP server from the command line:

```bash
claude mcp add --transport stdio --scope user attune -- \
  /path/to/attune-mcp --api-url http://localhost:8080
```

Token-based variant:

```bash
claude mcp add --transport stdio --scope user \
  --env ATTUNE_API_URL=http://localhost:8080 \
  --env ATTUNE_AUTH_TOKEN="$ATTUNE_AUTH_TOKEN" \
  attune -- /path/to/attune-mcp
```

Project-scoped JSON uses the same `mcpServers` shape in `.mcp.json`:

```json
{
  "mcpServers": {
    "attune": {
      "type": "stdio",
      "command": "/path/to/attune-mcp",
      "args": [
        "--api-url",
        "http://localhost:8080"
      ],
      "env": {}
    }
  }
}
```

### Claude Desktop

Claude Desktop-style local MCP configuration uses `mcpServers` in `claude_desktop_config.json`.

```json
{
  "mcpServers": {
    "attune": {
      "command": "/path/to/attune-mcp",
      "args": [
        "--api-url",
        "http://localhost:8080"
      ],
      "env": {}
    }
  }
}
```

Restart Claude Desktop after changing the config.

## Authentication Options

### Saved CLI Profile

This is the simplest local development setup. Log in once with the CLI, then configure the MCP client to launch `attune-mcp`.

```bash
attune auth login --username test@attune.local --password 'TestPass123!'
attune-mcp --profile default
```

Client config:

```json
{
  "mcpServers": {
    "attune": {
      "command": "/path/to/attune-mcp",
      "args": [
        "--profile",
        "default"
      ]
    }
  }
}
```

### Explicit Token

Use this when your client or secret manager can inject environment variables.

```json
{
  "mcpServers": {
    "attune": {
      "command": "/path/to/attune-mcp",
      "env": {
        "ATTUNE_API_URL": "http://localhost:8080",
        "ATTUNE_AUTH_TOKEN": "replace-with-access-token"
      }
    }
  }
}
```

`ATTUNE_API_TOKEN` takes precedence over `ATTUNE_AUTH_TOKEN` and is intended for execution-scoped tokens inside Attune actions. Local IDE usage normally uses `ATTUNE_AUTH_TOKEN` or a saved CLI profile.

If you also provide `ATTUNE_REFRESH_TOKEN`, the client can refresh expired access tokens.

### Startup Login

`attune-mcp` can log in at startup when both `ATTUNE_LOGIN` and `ATTUNE_PASSWORD` are set:

```json
{
  "mcpServers": {
    "attune": {
      "command": "/path/to/attune-mcp",
      "env": {
        "ATTUNE_API_URL": "http://localhost:8080",
        "ATTUNE_LOGIN": "test@attune.local",
        "ATTUNE_PASSWORD": "TestPass123!"
      }
    }
  }
}
```

On affected versions, startup login does not initially replace an existing token in the selected profile. Use a dedicated token-free profile or an explicit token when deterministic credential selection matters, and verify the resulting identity before exposing tools.

Prefer saved profiles or a client-managed secret store for normal workstation use. Environment variables can be visible to local process inspection tools and may be captured by editor diagnostics.

## HTTP Mode

HTTP mode is useful for service deployment, containers, or custom harnesses that can speak MCP-style JSON-RPC over HTTP.

**Security boundary:** HTTP `/mcp` requires an inbound bearer token configured with `--http-bearer-token` or `ATTUNE_MCP_HTTP_BEARER_TOKEN`. This token is separate from the profile, login, `ATTUNE_AUTH_TOKEN`, or `ATTUNE_API_TOKEN` used as outbound Attune API authority. HTTP defaults to loopback; a non-loopback address is rejected unless `--public-listen` is also set. Put every non-loopback deployment behind protected ingress and restricted network reachability. `GET /health` intentionally remains unauthenticated for service probes.

Run the binary directly:

```bash
ATTUNE_API_URL=http://localhost:8080 \
ATTUNE_LOGIN=test@attune.local \
ATTUNE_PASSWORD='TestPass123!' \
attune-mcp --transport http --http-bearer-token "$MCP_CLIENT_TOKEN"
```

Verify the service:

```bash
curl http://localhost:8090/health
```

The JSON-RPC endpoint is:

```text
POST http://localhost:8090/mcp
```

Example tools-list request:

```bash
curl -s http://localhost:8090/mcp \
  -H "Authorization: Bearer $MCP_CLIENT_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The default listener is `127.0.0.1:8090`. Remote or container listeners require both the inbound bearer token and an explicit opt-in:

```bash
attune-mcp --transport http --listen-addr 0.0.0.0:8090 \
  --public-listen --http-bearer-token "$MCP_CLIENT_TOKEN"
```

Do not publish that listener directly. Use protected ingress with authentication and network controls. Treat public `/health` exposure as a separate proxy/network policy decision.

## Inside Attune Executions

Agent-style actions should use the execution-scoped API token provided by the worker, not a user password or broad long-lived token:

```bash
ATTUNE_API_URL=http://attune-api:8080 \
ATTUNE_API_TOKEN="$ATTUNE_API_TOKEN" \
attune-mcp
```

Executions receive `ATTUNE_API_TOKEN` only when their snapped `permission_set_refs` are non-empty. Use the narrowest permission refs that allow the agent to complete its task.

## Security Notes

- MCP tool calls run with the permissions of the configured Attune identity or execution token.
- Avoid using an admin identity for day-to-day local agent work unless the task requires admin access.
- Do not paste access tokens into prompts or commit MCP client configuration files containing secrets.
- Prefer stdio for local editor integrations because it does not open a listening port.
- HTTP `/mcp` requires its separate inbound bearer token. Keep the default loopback listener; non-loopback exposure additionally requires explicit public-listen opt-in, protected ingress, and restricted network reachability.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Client cannot start the server | Use an absolute `command` path and verify `attune-mcp --help` works in a terminal. |
| API calls fail with connection errors | Confirm `curl http://localhost:8080/health` succeeds and set `ATTUNE_API_URL` if the API is elsewhere. |
| Tool calls return `401` | Re-run `attune auth login`, provide a valid `ATTUNE_AUTH_TOKEN`, or include `ATTUNE_REFRESH_TOKEN`. |
| Tool calls return `403` | The authenticated identity lacks the required Attune permission. Grant narrower RBAC permissions rather than switching to admin by default. |
| HTTP `/mcp` returns `401` | Send `Authorization: Bearer <token>` matching `--http-bearer-token` or `ATTUNE_MCP_HTTP_BEARER_TOKEN`; do not use the outbound Attune API token. |
| HTTP client works but editor stdio does not | Confirm the editor is configured with `command` and `args`, not the HTTP URL. |
| Stdio client hangs during startup | Run `attune-mcp --verbose` from the same environment and inspect stderr for API URL or auth errors. |

## Related

- [CLI Reference](/reference/cli/)
- [Permissions and RBAC](/administration/permissions-and-rbac/)
- [Admin Quick Start](/administration/quick-start/)
- [API Reference](/reference/api/)
