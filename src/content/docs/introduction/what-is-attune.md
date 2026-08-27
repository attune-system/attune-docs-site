---
title: "What is Attune?"
description: "Attune is an event-driven automation and orchestration platform. It connects events to rules, rules to actions, and actions to workflows that can run across distributed workers wit"
sidebar:
  label: "What is Attune?"
  order: 2
---
Attune is an event-driven automation and orchestration platform. It connects events to rules, rules to actions, and actions to workflows that can run across distributed workers with RBAC, secrets, artifacts, queues, and human-in-the-loop steps.

![Attune dashboard summarizing packs, rules, actions, and executions](/screenshots/What-is-Attune.png)

## What Attune is for

Use Attune when you need to:

- React to events from timers, webhooks, sensors, or external systems.
- Run reusable automation actions written in shell, Python, Node.js, native binaries, or other detected runtimes.
- Compose actions into workflows with retries, branching, concurrency, and approvals.
- Package automation as installable packs.
- Delegate narrowly scoped API access to executions and AI agents.
- Operate automations with durable history, audit logs, artifacts, and work queues.

## The basic event flow

```text
Sensor process
  -> emits an event for a trigger
  -> rule watches matching events
  -> enforcement records the rule activation
  -> action is executed with configured parameters
  -> execution result is parsed from stdout when requested
```

Sensors are processes that emit events for a particular trigger. A trigger is the event type and defines the expected payload schema. Rules watch for events, create enforcements, and conditionally cause actions to be executed with a configurable set of parameters. Executions generate results from the action's stdout stream; depending on the action's output format, Attune can keep stdout as text or parse it as structured data.

For workflows, the parent execution is orchestrated by the executor and fan-outs into child executions:

```text
Workflow execution requested
  -> executor loads workflow definition
  -> entry tasks become child executions
  -> child completions advance transitions
  -> workflow output is evaluated
```

## Who uses Attune?

- **Site admins** configure the system, identity providers, RBAC, packs, indices, queues, and secrets.
- **Pack developers** build reusable packs containing actions, sensors, triggers, rules, workflows, dashboards, runtimes, and queue definitions.
- **SREs/operators** deploy and operate Attune services, databases, queues, workers, agent workers, backups, and monitoring.
- **Automation users** run actions/workflows, respond to inquiries, inspect artifacts, and track execution history.
- **AI agents** can use execution-scoped tokens and the Attune MCP server to interact with a curated API surface inside tightly scoped permissions.

## Main building blocks

| Building block | Purpose |
| --- | --- |
| Pack | A bundle of automation components. |
| Runtime | Defines how actions and sensors execute. |
| Action | A runnable unit of automation. |
| Sensor | A long-running event producer. |
| Trigger | The event type emitted by a sensor or webhook. |
| Rule | Maps trigger events to an action or workflow. |
| Execution | A single action or workflow run. |
| Workflow | A graph of action tasks and transitions. |
| Dashboard | A spec-driven operational view composed from data sources and card visualizations. |
| Inquiry | A human approval/input step. |
| Key | Scoped secret/config value. |
| Artifact | Output, files, progress, logs, or URLs produced by executions. |
| Work queue | Durable queue of business work items dispatched to actions. |

## Next

- [Core Concepts](/introduction/core-concepts/)
- [Architecture](/introduction/architecture/)
- [Admin Quick Start](/administration/quick-start/)
