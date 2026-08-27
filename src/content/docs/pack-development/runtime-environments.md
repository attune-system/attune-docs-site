---
title: "Runtime Environments"
description: "Runtime environments isolate per-pack dependencies from pack files and from other packs."
sidebar:
  label: "Runtime Environments"
  order: 10
---
Runtime environments isolate per-pack dependencies from pack files and from other packs.

For a field-by-field runtime YAML reference for pack authors, see [Runtime Authoring Guide](/pack-development/runtime-authoring/).

![Runtimes and workers page showing worker capacity and supported runtimes](/screenshots/Runtime-Environments.png)

## Runtime definitions

Runtime YAML files live under `runtimes/*.yaml`. Runtime refs usually look like:

```text
core.shell
core.python
core.nodejs
```

A runtime with an empty execution config is native (entrypoint runs directly). A runtime with interpreter config runs the entrypoint through that interpreter.

Use [Runtime Authoring Guide](/pack-development/runtime-authoring/) for the full runtime YAML contract, field semantics, and complete authoring examples.

## Runtime versions

Actions and sensors can declare constraints:

```yaml
runtime_version: ">=3.12,<4.0"
```

A bare version such as `3.12` is treated as a compatible minor constraint. Standard workers verify registered runtime versions at startup; executions and sensors select the highest locally available compatible version.

Runtime definitions can include `versions[]` entries. Workers verify each declared version and mark versions available before the scheduler can select them.

Use [Runtime Authoring Guide](/pack-development/runtime-authoring/) for `versions[]` authoring syntax and examples.

## Environment location

Runtime environments are outside pack directories:

```text
{runtime_envs_dir}/{pack_ref}/{runtime_name}
{runtime_envs_dir}/{pack_ref}/{runtime_name}-{version}
```

In Docker this is usually:

```text
/opt/attune/runtime_envs
```

This keeps pack directories read-only and lets multiple workers share installed dependencies.

## Python

Python environments should use virtualenvs with copies, not symlinks, in shared Docker volumes:

```bash
python3 -m venv --copies {env_dir}
```

Runtime environments are commonly recreated during install and repair flows, so this copy-based setup is usually a practical default.

Install dependencies into `{env_dir}`, not `{pack_dir}`.

## Node.js

Node dependencies should install under the runtime env directory, for example:

```bash
npm install --prefix {env_dir}
```

Set `NODE_PATH` through runtime env vars if actions need Node module lookup from the isolated env.

## Agent runtime auto-detection

`attune-agent` probes the container for interpreters such as shell, Python, Node.js, Ruby, Go, Java, R, and Perl. It then:

1. Sets `ATTUNE_WORKER_RUNTIMES` from detected runtimes unless explicitly set.
2. Registers detected runtimes dynamically if the database lacks them.
3. Starts in agent mode and registers structured runtime capabilities.

Use `--detect-only` to inspect what the agent would detect.

## Operational notes

- Workers proactively set up environments at startup and on pack registration events.
- The worker can repair broken Python virtualenv interpreter symlinks by recreating the environment.
- Agent mode skips some proactive setup and creates environments lazily on demand.
- API setup is best-effort; workers are authoritative for execution-time environments.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Action cannot import dependency | Runtime env path, dependency install command, `NODE_PATH`/venv activation. |
| Wrong interpreter version | Runtime version constraints, worker verification results, available versions. |
| Env path inside pack | Runtime create/install command should use `{env_dir}`. |
| Agent did not detect runtime | Container PATH, interpreter binary name, explicit `ATTUNE_WORKER_RUNTIMES`. |

## Related

- [Runtime Authoring Guide](/pack-development/runtime-authoring/)
- [Writing Actions](/pack-development/actions/)
- [Writing Sensors](/pack-development/sensors/)
- [Docker Operations](/operations/docker/)
