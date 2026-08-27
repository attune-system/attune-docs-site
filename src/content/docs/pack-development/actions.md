---
title: "Writing Actions"
description: "Actions are executable automation units. Each action has metadata YAML and an implementation file."
sidebar:
  label: "Writing Actions"
  order: 2
---
Actions are executable automation units. Each action has metadata YAML and an implementation file.

![Action detail page showing metadata, action defaults, parameters, and quick actions](/screenshots/Writing-Actions.png)

## Minimal action

`actions/echo.yaml`:

```yaml
ref: my_pack.echo
label: Echo
description: Echo a message
enabled: true
runner_type: shell
entry_point: echo.sh
parameter_delivery: stdin
parameter_format: dotenv
output_format: text
parameters:
  message:
    type: string
    required: true
```

This is the minimum deployable shape for a normal action: `ref`, `label`, `runner_type`, `entry_point`, parameter delivery/output settings, and flat schemas.

`actions/echo.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

message_set=false
while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in
    message=*)
      message="${line#message=}"
      case "$message" in
        \'*\')
          message="${message#\'}"
          message="${message%\'}"
          escaped_single_quote="'\\''"
          single_quote="'"
          message="${message//"$escaped_single_quote"/$single_quote}"
          ;;
      esac
      message_set=true
      ;;
  esac
done

if [[ "$message_set" != true ]]; then
  echo "missing required parameter: message" >&2
  exit 1
fi

printf '%s\n' "$message"
```

## Parameter contract

Execution config is a flat JSON object:

```json
{
  "message": "hello",
  "count": 3
}
```

Do not expect:

```json
{
  "parameters": {
    "message": "hello"
  }
}
```

The worker merges permitted secrets into the same top-level parameter object before delivery.

## Execution timeout defaults

Actions can declare a default execution timeout:

```yaml
timeout_seconds: 300
```

`timeout_seconds` is the maximum wall-clock runtime, in seconds, for executions of that action. It must be a positive integer. When omitted, executions inherit the platform default from `default_execution_timeout_seconds` (600 seconds unless configured otherwise).

Timeouts are snapshotted onto each execution when the execution is created. Changing an action's `timeout_seconds` or the platform default affects future executions only; already-created executions keep their stored `execution.timeout_seconds`.

At runtime the worker enforces the snapshotted timeout by sending SIGTERM to the action process group. If the process has not exited after 10 seconds, the worker sends SIGKILL. Timed-out executions finish with status `timeout`, not `failed`.

Manual executions and reruns can override the action default for that single execution. Workflow tasks can also set their own `timeout`, which becomes the timeout snapshot for the child execution.

## Reference visibility

Actions can control which packs may reference them from rules, workflow tasks, and work queues:

```yaml
reference_visibility: restricted
reference_allowed_pack_refs:
  - incidents
  - deployments
```

`reference_visibility` defaults to `public` when omitted.

| Visibility | Who may reference the action |
| --- | --- |
| `public` | Any rule, workflow, or work queue may reference it. |
| `private` | Only metadata owned by the same pack as the action may reference it. |
| `restricted` | The owning pack and packs listed in `reference_allowed_pack_refs` may reference it. |

Ad-hoc metadata that has no pack context can reference only `public` actions. Create/update operations for rules, workflows, and work queues validate the target action's reference policy before saving. Tightening an action from `public` to `private`/`restricted`, or shrinking the allow-list, is rejected if existing rules, workflows, or queues would become invalid.

## Parameter delivery

Implemented delivery modes are `stdin` and `file`; implemented formats are `json`, `yaml`, and `dotenv`. For new structured actions, prefer stdin JSON:

```yaml
parameter_delivery: stdin
parameter_format: json
```

Use another implemented combination only when the entrypoint needs it and tests cover the transport. File delivery exposes the document path through `ATTUNE_PARAMETER_FILE`. DOTENV is a limited scalar-oriented transport: nested objects are flattened to dotted keys, arrays are JSON strings, empty objects produce no entry, single quotes are shell-escaped, and arbitrary multiline values are difficult to parse safely. There is no environment-variable parameter delivery mode; do not put parameters or secrets in custom environment variables.

## Output formats

Set `output_format` to control result parsing:

| Format | Result behavior |
| --- | --- |
| `text` | Captures stdout as text. |
| `json` | Parses stdout as JSON. |
| `yaml` | Parses stdout as YAML. |
| `jsonl` | Parses line-delimited JSON. |

Use JSON for workflow tasks so downstream transitions and templates can access fields through `result().field`.

Structured parsing is currently best-effort. Invalid JSON or YAML does not fail an otherwise successful process, and JSONL silently omits malformed lines. Keep stdout to one valid semantic result, validate it in action tests, and use a real serializer for arbitrary strings or structured values rather than constructing JSON with shell substitutions.

## Arbitrary command action

`core.run_agent_command` executes its `command` with `/bin/sh -c`. Treat execute permission for this action as worker shell access: `command` is trusted executable code, not normal user input. Never interpolate event payloads, prompts, model output, or other untrusted values into it. Prefer a pack-local fixed wrapper that reads structured stdin, and constrain or exclude `core.run_agent_command` from broad action-execute grants.

## Queue item result contract

An action dispatched by a work queue must use `output_format: json` and return its item outcomes in the normal JSON result's `queue_ack` field. `queue_ack` is not a separate response channel; keep stdout limited to this one JSON result and send diagnostics to stderr.

```json
{
  "success": true,
  "processed": 2,
  "queue_ack": {
    "version": 1,
    "items": [
      {
        "id": 1001,
        "status": "completed",
        "summary": { "message": "order accepted" }
      },
      {
        "id": 1002,
        "status": "retry",
        "error": { "message": "upstream timeout" }
      }
    ]
  }
}
```

`queue_ack.items` is required, non-empty, and must contain exactly one entry for every item leased by this execution. Each entry needs the leased queue item `id` and one of these lowercase `status` values:

| Status | Effect |
| --- | --- |
| `completed` | Terminal successful item. |
| `failed` | Terminal failed item. |
| `skipped` | Terminal intentionally unprocessed item. |
| `retry` | Returns the item for another attempt, subject to the queue retry limit. |

`summary` and `error` are optional JSON objects recorded with the item; include `error` for `retry` and `failed` outcomes so operators can diagnose them. `version` defaults to `1`; omit it only when the queue's `ack_contract.version` is also `1`.

For a single-item queue, configure `action_params` to pass both the payload and `queue_item`, then return `queue_item.id` in the sole acknowledgement. For a batch queue, pass `items` and `queue_items`, then acknowledge every `queue_items[].id` exactly once. Do not rely on empty `action_params`: its default payload contract does not include `queue_item` or `queue_items`, so the action cannot reliably return the required IDs.

Treat per-item business outcomes as acknowledgements: after handling an expected item error, emit a valid `retry`, `failed`, or `skipped` acknowledgement. A valid acknowledgement is honored for any terminal execution status, including `failed`, `cancelled`, and `timeout`. Missing or malformed `queue_ack` (including unknown fields), unsupported status, wrong ack version, duplicate/unexpected ID, or omitted leased ID fails queue-dispatch completion; the executor then handles leased items conservatively as retry candidates. A requested `retry` is promoted to `failed` after the queue's `dispatch.retry_limit` is exhausted (the default is `0`).

See [Queue Administration](/administration/queues/#ack-contract) for queue configuration and lifecycle details.

## Standard environment variables

Actions receive:

| Variable | Purpose |
| --- | --- |
| `ATTUNE_ACTION` | Full action ref. |
| `ATTUNE_PACK_REF` | Owning pack ref. |
| `ATTUNE_EXEC_ID` | Execution ID. |
| `ATTUNE_API_URL` | API base URL. |
| `ATTUNE_API_TOKEN` | Present only when execution permission refs are non-empty. |
| `ATTUNE_ARTIFACTS_DIR` | Artifact staging directory. Shared volume in volume mode; worker-local staging directory in standalone/API mode. |
| `ATTUNE_RUNTIME_ENVS_DIR` | Shared runtime env root. |
| `ATTUNE_RULE` | Rule ref when rule-triggered. |
| `ATTUNE_TRIGGER` | Trigger ref when event-triggered. |

Example for a rule-triggered action with execution permission refs:

```bash
ATTUNE_ACTION=my_pack.remediate
ATTUNE_PACK_REF=my_pack
ATTUNE_EXEC_ID=12345
ATTUNE_API_URL=http://api:8080
ATTUNE_API_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
ATTUNE_ARTIFACTS_DIR=/opt/attune/artifacts
ATTUNE_RUNTIME_ENVS_DIR=/opt/attune/runtime_envs
ATTUNE_RULE=my_pack.on_alert
ATTUNE_TRIGGER=my_pack.alert_received
```

For a manual execution without permission refs, the same action would still receive `ATTUNE_ACTION`, `ATTUNE_PACK_REF`, `ATTUNE_EXEC_ID`, `ATTUNE_API_URL`, `ATTUNE_ARTIFACTS_DIR`, and `ATTUNE_RUNTIME_ENVS_DIR`, but not `ATTUNE_API_TOKEN`, `ATTUNE_RULE`, or `ATTUNE_TRIGGER`.

Do not assume `ATTUNE_API_TOKEN` exists. Actions should fail clearly if they require API access but were run without permission refs.

## File-backed artifacts from actions

Actions that need durable files should create or allocate an artifact version through the API, then write bytes to the returned path under `ATTUNE_ARTIFACTS_DIR`.

In shared-volume deployments, that path is visible to the API immediately. In standalone/API-transport deployments, it is a worker-local staging path while the process runs; after the action exits, the worker copies execution-linked file-backed versions to the API-accessible artifact volume and finalizes their `size_bytes`.

Execution-scoped allocation requests do not need to send `execution` explicitly. If omitted, Attune stamps the version with the current execution id from `ATTUNE_API_TOKEN`, which is how worker finalization discovers the file.

Writing an arbitrary file under `ATTUNE_ARTIFACTS_DIR` without creating an artifact/version row is only local scratch output; it will not appear in the artifact UI or be synchronized as a durable artifact.

## Execution API access

Grant default execution access only when needed:

```yaml
default_execution_permission_set_refs:
  - standard
```

Use `standard` when the action needs to call the Attune API for resources that belong to the executing action or pack. Common cases include:

- Reading/decrypting pack- or action-scoped keys instead of passing secrets directly as parameters.
- Creating, updating, or reading artifacts for the current action or pack.
- Reading Data Caches in the executing action/pack scope.
- Running an AI/agent action that talks back to Attune through `attune-mcp` with only execution-scoped access.

Use named permission sets only when the action intentionally needs API access beyond its own action/pack scope, such as reading another pack's artifact or key, or calling a curated set of RBAC-checked API tools for an AI agent. Keep named execution permission sets narrow and constrained; they are snapshotted onto the execution token and are the only API grants the execution token receives. If no permission refs are set, the worker omits `ATTUNE_API_TOKEN` entirely.

Agent-style action metadata usually combines `accesses_mcp` with explicit execution permission refs:

```yaml
ref: my_pack.agent_triage
label: Agent Triage
description: Run a constrained AI agent with execution-local MCP access.
enabled: true
runner_type: shell
entry_point: agent_triage.sh
parameter_delivery: stdin
parameter_format: json
output_format: json
accesses_mcp: true
default_execution_permission_set_refs:
  - standard
  - my_pack.agent_limited_tools
parameters:
  incident_id:
    type: string
    required: true
  prompt:
    type: string
    required: true
output:
  summary:
    type: string
  actions_taken:
    type: array
```

Workflow actions are also action metadata, but they omit `runner_type` and point to a graph file:

```yaml
ref: my_pack.deploy
label: Deploy
description: Deploy an application through a workflow graph.
enabled: true
workflow_file: workflows/deploy.workflow.yaml
parameters:
  service:
    type: string
    required: true
output:
  status:
    type: string
```

## Emitting events and enqueueing queue items

For Attune/OpenAPI `0.3.0`, target SDK `0.3.0` in every runtime. Python actions use the `attune-sdk` distribution (`pip install attune-sdk==0.3.0`) and `import attune`. Node.js actions use the `attune-sdk` package (`npm install attune-sdk@0.3.0`), importing action helpers from `attune-sdk` and generated API functions from `attune-sdk/api_client`. Java uses Maven coordinates `io.attune:attune-sdk:0.3.0` and `io.attune` imports. The SDK context client uses the execution-scoped token and API URL; never read, print, or pass `ATTUNE_API_TOKEN` yourself.

An action needs at least one execution permission-set ref so Attune issues that token. Event creation accepts execution tokens directly, so `standard` is sufficient. Enqueueing also requires `queue_items:create` scoped to the target queue:

`permission_sets/my_pack.enqueue_follow_up.yaml`:

```yaml
ref: my_pack.enqueue_follow_up
label: Enqueue follow-up work
description: Allows actions to add items only to the follow-up queue.
grants:
  - resource: queue_items
    actions: [create]
    constraints:
      refs: [my_pack.follow_up]
```

`actions/create_follow_up.yaml`:

```yaml
default_execution_permission_set_refs:
  - standard
  - my_pack.enqueue_follow_up
```

The event trigger must exist and be enabled, and its payload should match the trigger's declared output schema. The queue must accept new items, and the item payload must match its `item_schema`. Use an `item_key` when the work has a natural idempotency key.

### Enqueueing through `attune-mcp` from a shell action

`attune-mcp` is an MCP JSON-RPC server over stdin/stdout, not a CLI with `queue enqueue` or `event emit` subcommands. It inherits `ATTUNE_API_URL` and the execution-scoped `ATTUNE_API_TOKEN`; do not put either value in parameters, command arguments, logs, or output. Set `accesses_mcp: true` and include the narrow queue permission set shown above. `standard` alone does not grant `queue_items:create`.

The only queue-writing MCP tool is `queues_enqueue`. Its required arguments are `ref` and `payload`; `item_key`, `priority`, and `metadata` are optional. MCP intentionally has no event-creation tool: emit events through the authenticated SDK client in the next example.

`actions/enqueue_follow_up.yaml`:

```yaml
ref: my_pack.enqueue_follow_up
label: Enqueue follow-up
description: Adds one validated ticket to the follow-up queue.
runner_type: shell
entry_point: enqueue_follow_up.sh
parameter_delivery: stdin
parameter_format: dotenv
output_format: json
accesses_mcp: true
default_execution_permission_set_refs:
  - standard
  - my_pack.enqueue_follow_up
parameters:
  ticket_id:
    type: string
    required: true
output:
  queued:
    type: boolean
```

`actions/enqueue_follow_up.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ticket_id=""
while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in
    ticket_id=*)
      ticket_id="${line#ticket_id=}"
      case "$ticket_id" in
        \'*\') ticket_id="${ticket_id#\'}"; ticket_id="${ticket_id%\'}" ;;
      esac
      ;;
  esac
done

[[ "$ticket_id" =~ ^[A-Za-z0-9._:-]+$ ]] ||
  { echo "invalid or missing ticket_id" >&2; exit 1; }
[[ -n "${ATTUNE_API_TOKEN:-}" ]] ||
  { echo "execution API access is required" >&2; exit 1; }

if ! response="$(
  {
    printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"enqueue-follow-up","version":"1.0"}}}'
    printf '%s\n' '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}'
    printf '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"queues_enqueue","arguments":{"ref":"my_pack.follow_up","payload":{"ticket_id":"%s"},"item_key":"follow-up-%s"}}}\n' "$ticket_id" "$ticket_id"
  } | /opt/attune/agent/attune-mcp
)"; then
  echo "attune-mcp request failed" >&2
  exit 1
fi

if grep -Eq '"error"|"isError":true' <<<"$response" ||
  ! grep -q '"id":2' <<<"$response"; then
  echo "queue item was not enqueued" >&2
  exit 1
fi
printf '{"queued":true}\n'
```

The initial `initialize` request and `notifications/initialized` notification are required before `tools/call`. A tool/API failure is returned in the JSON-RPC response with `result.isError: true`; malformed protocol requests use the JSON-RPC `error` field. The server can still exit successfully, so check the response rather than its exit status alone. A queue request may create a new item (`201`) or update a pending item (`200`) when its queue permits the matching `item_key`. Events and queue writes are separate requests, not a transaction: if the later request fails, the earlier event or item remains recorded and the action should fail rather than claim complete success.

`actions/create_follow_up.py`:

```python
#!/usr/bin/env python3
from http import HTTPStatus

import attune
from attune.api_client.api.events import create_event
from attune.api_client.api.queues import enqueue_queue_item
from attune.api_client.models.create_event_request import CreateEventRequest
from attune.api_client.models.create_event_request_payload import (
    CreateEventRequestPayload,
)
from attune.api_client.models.enqueue_work_queue_item_request import (
    EnqueueWorkQueueItemRequest,
)
from attune.api_client.models.enqueue_work_queue_item_request_payload import (
    EnqueueWorkQueueItemRequestPayload,
)


def emit_event(trigger_ref: str, payload: dict) -> int:
    event_payload = CreateEventRequestPayload()
    for key, value in payload.items():
        event_payload[key] = value

    response = create_event.sync_detailed(
        client=attune.context.client,
        body=CreateEventRequest(
            trigger_ref=trigger_ref,
            payload=event_payload,
        ),
    )
    if response.status_code != HTTPStatus.CREATED:
        raise RuntimeError(
            f"event creation failed ({response.status_code}): "
            f"{response.content.decode('utf-8', errors='replace')}"
        )
    if response.parsed is None:
        raise RuntimeError("event creation returned no event")
    return response.parsed.data.id


def enqueue_follow_up(ticket_id: str) -> int:
    payload = EnqueueWorkQueueItemRequestPayload()
    payload["ticket_id"] = ticket_id

    response = enqueue_queue_item.sync_detailed(
        "my_pack.follow_up",
        client=attune.context.client,
        body=EnqueueWorkQueueItemRequest(
            payload=payload,
            item_key=f"follow-up-{ticket_id}",
        ),
    )
    if response.status_code not in {HTTPStatus.OK, HTTPStatus.CREATED}:
        raise RuntimeError(
            f"enqueue failed ({response.status_code}): "
            f"{response.content.decode('utf-8', errors='replace')}"
        )
    if response.parsed is None:
        raise RuntimeError("enqueue returned no queue item")
    return response.parsed.data.id


def main(ticket_id: str) -> dict:
    event_id = emit_event(
        "my_pack.follow_up_requested",
        {"ticket_id": ticket_id},
    )
    queue_item_id = enqueue_follow_up(ticket_id)
    return {"event_id": event_id, "queue_item_id": queue_item_id}


attune.run_action(main)
```

The generated `create_event` and `enqueue_queue_item` wrappers use the execution-scoped client. `attune-mcp` does not expose event creation. Let either call fail the action rather than reporting success when an event or queue item was not created.

## Complete Python action example

This example combines the common action YAML options with a Python implementation that follows the same `stdin` JSON and stdout JSON pattern used by `packs.external/python_example/actions/hello.py` and `artifact_demo.py`.

`actions/full_example.yaml`:

```yaml
ref: my_pack.full_example
label: Full Python Example
description: Demonstrates parameters, output, runtime selection, execution API access, and worker placement.
enabled: true

runner_type: python
runtime_version: ">=3.12"
entry_point: full_example.py
timeout_seconds: 300
reference_visibility: restricted
reference_allowed_pack_refs:
  - support

parameter_delivery: stdin
parameter_format: json
output_format: json

# Set this to true when the action launches `attune-mcp` or another
# execution-local AI/MCP helper.
accesses_mcp: false

# Add this only when the action must call the Attune API for its own
# pack/action-scoped keys or artifacts.
default_execution_permission_set_refs:
  - standard

# Optional: require extra runtimes/tools on the same worker in addition to
# the main Python runtime. Remove this block when not needed.
required_worker_runtimes:
  node: ">=20"

# Optional: constrain placement to workers with matching labels/taints.
worker_selector:
  zone: us-east-1a
worker_tolerations:
  - key: gpu
    operator: exists
    effect: no_schedule
worker_affinity:
  preferred:
    - weight: 50
      preference:
        match_labels:
          disk: ssd

parameters:
  target_url:
    type: string
    description: URL to inspect.
    required: true
  timeout_seconds:
    type: integer
    description: HTTP timeout in seconds.
    default: 10
    minimum: 1
    maximum: 60
  dry_run:
    type: boolean
    description: Skip the outbound HTTP request and return planned work only.
    default: false
  write_summary_file:
    type: boolean
    description: Write a diagnostic JSON file under ATTUNE_ARTIFACTS_DIR.
    default: true
  api_key:
    type: string
    description: Optional API key or secret merged into parameters.
    secret: true
  metadata:
    type: object
    description: Optional caller-supplied metadata.
    default: {}

output:
  action:
    type: string
    required: true
  execution_id:
    type: integer
    required: true
  status_code:
    type: integer
  dry_run:
    type: boolean
    required: true
  api_token_present:
    type: boolean
    required: true
  summary_file:
    type: string
  success:
    type: boolean
    required: true

tags:
  - python
  - example
  - api
```

The current pack-file loader reads the declared result schema from `output`. Some older examples use `output_schema`; prefer `output` for new pack files. Runtime selection, required worker runtimes, and placement fields are consumed by Attune before the process starts; the Python script only sees the resulting parameters, secrets, and `ATTUNE_*` environment variables.

`actions/full_example.py`:

```python
#!/usr/bin/env python3
"""Full Attune Python action example.

The worker invokes this file with:
- Parameters and permitted secrets as one JSON object on stdin.
- Standard ATTUNE_* environment variables.
- stdout captured as the action result because output_format is json.
- stderr captured as execution diagnostics/logging.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def read_params() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def require_str(params: dict, name: str) -> str:
    value = params.get(name)
    if not isinstance(value, str) or not value:
        raise ValueError(f"Missing required string parameter: {name}")
    return value


def as_bool(value, default=False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


def fetch_status(url: str, timeout: int, api_key: str | None) -> int:
    headers = {"User-Agent": "attune-action/full-example"}
    if api_key:
        # Do not print this value. It came through stdin, not env vars.
        headers["Authorization"] = f"Bearer {api_key}"

    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return int(response.status)
    except urllib.error.HTTPError as error:
        return int(error.code)


def write_summary_file(artifacts_dir: str, execution_id: int, result: dict) -> str | None:
    if not artifacts_dir:
        return None

    # This writes to the shared artifact volume path. Registering a formal
    # artifact record requires an API call using ATTUNE_API_TOKEN.
    relative_path = Path("examples") / str(execution_id) / "summary.json"
    full_path = Path(artifacts_dir) / relative_path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return str(relative_path)


def main() -> int:
    try:
        params = read_params()

        action_ref = os.environ.get("ATTUNE_ACTION", "")
        pack_ref = os.environ.get("ATTUNE_PACK_REF", "")
        execution_id = int(os.environ.get("ATTUNE_EXEC_ID", "0"))
        api_url = os.environ.get("ATTUNE_API_URL", "")
        api_token = os.environ.get("ATTUNE_API_TOKEN")
        artifacts_dir = os.environ.get("ATTUNE_ARTIFACTS_DIR", "")
        runtime_envs_dir = os.environ.get("ATTUNE_RUNTIME_ENVS_DIR", "")
        rule_ref = os.environ.get("ATTUNE_RULE")
        trigger_ref = os.environ.get("ATTUNE_TRIGGER")

        target_url = require_str(params, "target_url")
        timeout = int(params.get("timeout_seconds", 10))
        dry_run = as_bool(params.get("dry_run"), default=False)
        should_write_summary = as_bool(params.get("write_summary_file"), default=True)
        api_key = params.get("api_key")
        metadata = params.get("metadata") or {}

        print(
            f"Running {action_ref} execution={execution_id} pack={pack_ref} dry_run={dry_run}",
            file=sys.stderr,
        )

        status_code = None if dry_run else fetch_status(target_url, timeout, api_key)

        result = {
            "action": action_ref,
            "pack": pack_ref,
            "execution_id": execution_id,
            "target_url": target_url,
            "status_code": status_code,
            "dry_run": dry_run,
            "api_url": api_url,
            "api_token_present": bool(api_token),
            "artifacts_dir_present": bool(artifacts_dir),
            "runtime_envs_dir": runtime_envs_dir,
            "rule": rule_ref,
            "trigger": trigger_ref,
            "metadata": metadata,
            "success": True,
        }

        if should_write_summary:
            result["summary_file"] = write_summary_file(
                artifacts_dir, execution_id, result
            )

        # stdout must contain only the declared result when output_format is json.
        print(json.dumps(result))
        return 0

    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        print(json.dumps({"success": False, "error": str(error)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
```

The script intentionally sends diagnostics to stderr and the machine-readable result to stdout. It treats `ATTUNE_API_TOKEN` as optional: actions that require API access should fail with a clear error if it is absent, while actions that only need normal parameters can run without it.

## Worker runtime requirements

An action's `runner_type` selects its main runtime. If a shell action also needs another runtime on the same worker, declare it:

```yaml
runner_type: shell
required_worker_runtimes:
  node: ">=20"
  python: "*"
```

Ordinary native actions require an entrypoint file that exists and is executable on the target worker. Symbolic native action identifiers are platform-specific exceptions and should not be assumed portable.

## Worker placement

Use placement only when a workload needs specific worker capabilities:

```yaml
worker_selector:
  zone: us-east-1a
worker_tolerations:
  - key: gpu
    operator: exists
    effect: no_schedule
worker_affinity:
  preferred:
    - weight: 50
      preference:
        match_labels:
          disk: ssd
```

Manual executions and workflow tasks can override these fields.

### Configuring defaults in the web UI

The action detail page displays configured defaults inline within the **Action Information** panel — MCP access, default execution token access, worker selector, tolerations, and affinity are shown as read-only chips and badges. Click the **Configure** button (⚙ icon next to **Execute**) to open a modal where all action defaults can be edited, including structured editors for placement constraints.

![Configure Action Defaults modal with worker placement editors](/screenshots/Writing-Actions-Configure.png)

## Artifacts

Use artifacts for durable outputs:

- File logs or reports.
- Progress indicators.
- URLs to external systems.
- Structured result snapshots.

For sensitive files, set private visibility.

## Best practices

- Read all stdin before parsing.
- Validate required parameters at the script boundary too.
- Return machine-readable JSON for workflows.
- Keep stdout reserved for declared output when using structured output formats.
- Send diagnostics to stderr.
- Never print raw secrets.
- Make retries idempotent where possible.

## Related

- [Runtime Authoring Guide](/pack-development/runtime-authoring/)
- [Runtime Environments](/pack-development/runtime-environments/)
- [Permissions and RBAC](/administration/permissions-and-rbac/)
- [Artifact Administration](/administration/artifacts/)
- [Writing Dashboards](/pack-development/dashboards/)
