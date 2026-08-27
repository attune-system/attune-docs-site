---
title: "Core Concepts"
description: "This page defines the terms used throughout Attune."
sidebar:
  label: "Core Concepts"
  order: 4
---
This page defines the terms used throughout Attune.

![Attune dashboard with primary domain objects and activity](/screenshots/Core-Concepts.png)

## Packs

A **pack** is the deployable unit for automation content. Packs can include actions, sensors, triggers, rules, runtimes, workflow definitions, work queues, configuration schema, tests, and documentation.

Pack refs identify ownership and are used in component refs:

```text
core.echo
my_pack.deploy
```

## Runtimes and runtime versions

A **runtime** describes how an action or sensor executes. Common runtimes include shell, Python, Node.js, native binaries, and auto-detected agent runtimes. Runtime versions allow constraints such as `>=3.12` or `~20`.

Runtime environments are created outside pack directories under the configured runtime env root, usually:

```text
/opt/attune/runtime_envs/<pack_ref>/<runtime_name>
/opt/attune/runtime_envs/<pack_ref>/<runtime_name>-<version>
```

For runtime YAML authoring details, see [Runtime Authoring Guide](/pack-development/runtime-authoring/). For operational runtime behavior, see [Runtime Environments](/pack-development/runtime-environments/).

## Actions

An **action** is a single executable unit. It has metadata YAML and an implementation file. Actions receive flat JSON parameters through stdin by default and return text, JSON, YAML, or JSONL output.

Actions can declare:

- Parameter and output schemas.
- Runtime and runtime version constraints.
- Default execution permission set refs.
- Required worker runtimes.
- Worker placement constraints.
- Artifact usage.

## Executions

An **execution** is a single action or workflow run. Execution config is a flat JSON object of parameters; do not wrap parameters under a `parameters` key.

Execution statuses include requested, scheduling, scheduled, running, completed, failed, canceling, cancelled, timeout, and abandoned. For workflow tasks, child executions are linked to a parent workflow execution.

`abandoned` means Attune no longer has a trustworthy result for a running execution, commonly because the assigned worker disappeared mid-operation. Abandoned executions are not restarted automatically.

## Policies

A **policy** controls execution throughput and limits. Policies can be global, pack-scoped, or action-scoped. Attune resolves one effective policy per execution: action policies override pack policies, pack policies override global policies, and higher priority wins within the same scope.

Policies can configure concurrency limits, rate limits, and supported quota checks. Administrators can manage them in the web UI under **Policies**. See [Policy Administration](/administration/policies/).

## Workflows

A **workflow** is an action linked to a workflow definition file. The action YAML owns user-facing metadata and the workflow YAML owns the graph:

```text
actions/deploy.yaml
actions/workflows/deploy.workflow.yaml
```

Tasks are action invocations. Transitions live in `next` arrays with optional `when`, `publish`, and `do` fields.

## Sensors and triggers

A **sensor** monitors an external condition and emits events for a **trigger** type. Trigger definitions describe the event payload schema. Rules consume events by trigger ref.

Long-lived pack sensor processes are supervised by sensor workers. Their live state is stored in `sensor_process`, with history in `sensor_process_history`. Unexpected exits are restarted with backoff while enabled rules still depend on the sensor.

## Events, rules, and enforcements

An **event** is an immutable trigger occurrence.

A **rule** maps events to actions or workflows. It can render action parameters from event data, pack config, and system values.

An **enforcement** records that a rule fired and whether it was processed or disabled.

`core.alert` is a built-in trigger for Attune operational exceptions such as unexpected worker loss and repeated sensor-process failures. Rules can route these alerts to notification actions.

## Workers and cordon

Action workers run actions. Sensor workers run long-lived sensor processes. Both register in the shared worker inventory and heartbeat to indicate observed health.

Cordoning a worker records operator intent to stop scheduling new work there. Cordon state is separate from observed status: a worker can be active and cordoned at the same time.

## Inquiries

An **inquiry** is a human-in-the-loop input or approval. It can be assigned to an identity, and only that assignee can respond. Execution-scoped tokens cannot answer inquiries they created.

## Keys

A **key** stores scoped config or secret data. Values are JSON, so they can be strings, objects, arrays, numbers, or booleans. Encrypted values use the shared Attune crypto format.

## Data Caches

A **Data Cache** stores an owner-scoped external dataset as immutable
generations. Refreshes upload and validate a staging generation before
atomically promoting it. Readers use point lookup, bounded multi-ID lookup, or
a generation-pinned cursor scan.

Data Caches are not Keys: cache values are plain business data, are never
injected into action secret input, and use the dedicated `caches` RBAC
resource. See [Data Caches](/administration/data-caches/).

## Artifacts

An **artifact** is execution output: files, logs, progress entries, URLs, or structured data. Artifacts have visibility:

- `public`: readable by authenticated identities with matching artifact permissions.
- `private`: restricted by owner/scope or constrained permissions.

Progress artifacts default to public when visibility is omitted. Other artifact types default to private.

## Work queues

A **work queue** stores durable business work items. The executor leases ready queue items and dispatches an action. The action reports queue acknowledgement details in its execution result.

## Identities, roles, and permission sets

An **identity** is a user or service account. Roles and permissions grant access to resources. Permission sets can also be delegated to executions, allowing a worker action or AI agent to call back into Attune with narrowly scoped access.

The reserved execution permission ref `standard` grants action/pack-scoped key
and artifact access plus cache read access for the executing action and pack.
For workflow children, the containing workflow action and pack are also
included.

## Next

- [Permissions and RBAC](/administration/permissions-and-rbac/)
- [Policy Administration](/administration/policies/)
- [Pack Developer Guide](/pack-development/overview/)
- [Writing Workflows](/pack-development/workflows/)
- [Operational Visibility](/operations/visibility/)
