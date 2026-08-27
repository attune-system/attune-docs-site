---
title: "Using Pack Actions in Workflows"
description: "Workflows can call actions from any installed pack by full action ref. Cross-pack workflows are powerful, but they require explicit attention to dependencies, configuration, keys, "
sidebar:
  label: "Using Pack Actions in Workflows"
  order: 8
---
Workflows can call actions from any installed pack by full action ref. Cross-pack workflows are powerful, but they require explicit attention to dependencies, configuration, keys, artifacts, and execution permissions.

![Workflow builder showing actions from installed packs in a workflow graph](/screenshots/Using-Pack-Actions-in-Workflows.png)

## Call another pack's action

```yaml
tasks:
  notify:
    action: slack.post_message
    input:
      channel: "#deployments"
      text: "Deployment {{ workflow.deployment_id }} completed"
```

The target pack must be installed/registered so the action ref exists in the database. Keep the action enabled for UI/API discoverability.

## Configuration boundaries

Workflow task templates do not automatically load another pack's config or keys. If a task action from another pack needs pack config or secrets, either:

- Pass the needed values explicitly as task input.
- Let the task action read its own pack-scoped keys through an execution token.
- Use a named permission set that grants the intended cross-pack access.

Do not rely on implicit access to another pack's secrets.

## Permission refs on workflow tasks

Task `permission_set_refs` override the target action default refs:

```yaml
tasks:
  analyze:
    action: ai_agent.run
    permission_set_refs:
      - standard
      - ai_agent_limited
    input:
      prompt: "{{ parameters.prompt }}"
```

The field is rendered through workflow templates, so it can be dynamic:

```yaml
permission_set_refs: "{{ workflow.agent_permission_sets }}"
```

Allowed shapes are a string ref, an array of string refs, null/empty for no refs, or omitted to inherit action defaults.

Named child refs are delegation, not an escalation mechanism. Ordinary task dispatch, inherited action defaults, and native cache iteration all require named child refs to be a subset of the parent execution's delegated refs. An undelegated ref fails the workflow task instead of granting additional authority. The reserved `standard` ref retains its scoped behavior and does not need a database permission-set row.

## What `standard` includes in workflow children

For workflow task executions, `standard` includes:

- The child task action's action/pack scope.
- The containing workflow action's action/pack scope.

This allows a workflow in one pack to pass its own pack-scoped keys/artifacts to a helper action in another pack without granting broad access.

The reserved scope also permits read-only Data Cache access for the signed child and containing workflow action/pack scopes. It does not grant arbitrary cross-pack cache, key, or artifact access.

## Cross-pack artifacts

Cross-pack writes are allowed only when the target pack is included in the token's standard access pack refs or a named permission set grants matching constrained artifact access.

Use explicit artifact refs and private visibility when passing sensitive data between packs.

## Dependency and version strategy

Document external pack dependencies in your pack README and release notes. Prefer stable action refs and semver-compatible pack versions.

When a workflow depends on another pack:

- Verify the target pack is installed during deployment.
- Validate the target action parameter schema.
- Confirm the target action's reference visibility allows your workflow pack.
- Pin pack versions in controlled environments.
- Add a smoke test that executes the cross-pack path.

Target actions marked `private` are pack-internal and cannot be called by workflows from other packs. Target actions marked `restricted` can be called only by packs listed in `reference_allowed_pack_refs`.

## Timeout defaults across packs

Workflow task executions snapshot their timeout when the child execution is created. If a task omits `timeout`, it inherits the target action's `timeout_seconds` default, even when that action lives in another pack. If the target action also omits a default, the platform `default_execution_timeout_seconds` is used.

Set task-level `timeout` when the workflow needs a stricter or looser runtime limit than the called action's pack default:

```yaml
tasks:
  notify:
    action: slack.post_message
    timeout: 30
    input:
      channel: "#deployments"
      text: "Deployment complete"
```

## AI agent workflows

For AI agent tasks:

1. Use a purpose-built agent action.
2. Grant `standard` only if the agent needs workflow/action-scoped keys or artifacts.
3. Add named permission sets for specific API tool access.
4. Run the local `/opt/attune/agent/attune-mcp` over stdio inside the execution.
5. Avoid passing full user tokens into the agent process.

## Related

- [Writing Workflows](/pack-development/workflows/)
- [Permissions and RBAC](/administration/permissions-and-rbac/)
- [CLI Reference](/reference/cli/)
