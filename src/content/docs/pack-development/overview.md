---
title: "Pack Developer Guide"
description: "Packs are the unit of reuse in Attune. A good pack is self-contained, declarative, testable, and explicit about its runtime, configuration, permissions, and operational behavior."
sidebar:
  label: "Pack Developer Guide"
  order: 1
---
Packs are the unit of reuse in Attune. A good pack is self-contained, declarative, testable, and explicit about its runtime, configuration, permissions, and operational behavior.

![Pack detail page showing metadata, components, and dependencies](/screenshots/Pack-Developer-Guide.png)

## Pack layout

```text
my_pack/
  pack.yaml
  pack-icon.svg           # Optional web UI icon; svg/png/jpg/jpeg/ico supported
  README.md
  requirements.txt        # Python pack dependencies, if needed
  package.json            # Node.js pack dependencies, if needed
  lib/                    # Optional Python modules added to PYTHONPATH
  permission_sets/
    executor.yaml
  actions/
    do_thing.yaml
    do_thing.py
    workflows/
      deploy.workflow.yaml
  sensors/
    poller.yaml
    poller.py
  triggers/
    item_detected.yaml
  runtimes/
    python.yaml
  dashboards/
    operations.yaml
  queues/
    item_queue.yaml
  policies/
    concurrency.yaml
  rules/
    on_item_detected.yaml
  caches/
    items.yaml
  workflows/               # Legacy/standalone workflows only
  tests/
```

Runtime-specific pack layout expectations:

| Runtime | Standard layout | Dependency behavior |
| --- | --- | --- |
| Python | Put `.py` action/sensor entrypoints under `actions/` or `sensors/`. Put shared modules under pack-root `lib/` when you want them importable by actions/sensors. | Workers create a virtualenv under `runtime_envs_dir`; if pack-root `requirements.txt` exists, they install it with pip. `PYTHONPATH` is prepended with `{pack_dir}/lib`. |
| Node.js | Put `.js` action/sensor entrypoints under `actions/` or `sensors/`. Keep package metadata at pack root. | If pack-root `package.json` exists, workers copy it into the external Node environment and run `npm install --prefix {env_dir}`. `NODE_PATH` points at `{env_dir}/node_modules`. |
| Shell | Put `.sh` action entrypoints under `actions/`; write scripts for `/bin/bash`. Execute bits are useful for manual testing, but the worker invokes the script through the shell runtime. | The shell runtime does not create a pack dependency environment. If a shell action needs Python, Node.js, or another runtime available on the same worker, declare `required_worker_runtimes` on the action. |
| Native | Put the compiled action/sensor entrypoint in its component directory. | Ordinary native entrypoints must exist, be executable, and match the worker architecture; symbolic identifiers are platform-specific exceptions. |

Dependency manifests are pack-level, not per-action. Runtime environments are created outside the pack directory so installed dependencies do not modify read-only pack files.

## Component loading order

Attune loads pack components in dependency order:

```text
permission sets -> runtimes -> triggers -> actions and action-linked workflows -> dashboards -> work queues -> policies -> rules -> sensors -> cache namespaces -> cleanup
```

This allows actions to reference runtimes, queues to reference actions, rules to reference triggers/actions, and sensors to emit known trigger refs.

## Deployable metadata files

The pack loader deploys these metadata files from an installed pack:

| Metadata | Location | Notes |
| --- | --- | --- |
| Pack manifest | `pack.yaml` | Pack identity, config schema/defaults, tags, runtime deps, test metadata, and arbitrary `meta`. |
| Pack icon | `pack-icon.svg`, `pack-icon.png`, `pack-icon.jpg`, `pack-icon.jpeg`, or `pack-icon.ico` | Optional visual identity shown in the web client for pack-owned components. |
| Permission sets | `permission_sets/*.yaml` | Pack-scoped named grants that can be assigned to roles/users or delegated to executions. |
| Runtimes | `runtimes/*.yaml` | Runtime definitions, aliases, execution config, and optional version-specific configs. |
| Triggers | `triggers/*.yaml` | Event type/config schemas and emitted payload schemas. |
| Actions | `actions/*.yaml` | Action metadata, parameters, output schema, runtime selection, token refs, and worker placement. |
| Workflow graphs | `actions/workflows/*.workflow.yaml` | Graph-only workflow definitions referenced by action YAML through `workflow_file`. |
| Dashboards | `dashboards/*.yaml` | Pack-managed dashboard metadata/spec (`filters`, `data_sources`, `cards`, and breakpoint layout). |
| Work queues | `queues/*.yaml` | Pack-owned queue definitions, item schema, dispatch action, parameter templates, and dispatch tuning. |
| Policies | `policies/*.yaml` | Pack-owned execution policy definitions. |
| Rules | `rules/*.yaml` | Pack-owned trigger-to-action mappings, conditions, trigger parameters, and action parameter templates. |
| Sensors | `sensors/*.yaml` | Sensor metadata, runtime selection, config schema, and emitted trigger refs. |
| Cache namespaces | `caches/*.yaml` | Pack-managed Data Cache namespace policies loaded after action and sensor owners exist. |

Pack-loaded rules are declarative and non-ad-hoc. API/UI-created rules remain ad-hoc and are preserved separately. Keys, identities, role assignments, and pack configuration values are environment data; document them in the pack README or install guide rather than committing secrets or environment-specific assignments to the pack.

### Pack icon

To configure a pack icon, place one supported icon file at the pack root next to `pack.yaml`:

```text
my_pack/
  pack.yaml
  pack-icon.svg
```

Supported file names are checked in this priority order:

1. `pack-icon.svg`
2. `pack-icon.png`
3. `pack-icon.jpg`
4. `pack-icon.jpeg`
5. `pack-icon.ico`

If more than one icon file exists, Attune serves the first match in that order. SVG is the preferred format because it scales cleanly at the small sizes used throughout the UI. Keep the icon self-contained; do not rely on remote images, external fonts, or scripts inside SVG files.

The API serves the selected file from:

```text
GET /api/v1/packs/{pack_ref}/icon
```

The response uses the appropriate image content type and a short public cache (`max-age=300`). If no supported icon exists, the endpoint returns `404`.

The web client uses this endpoint automatically through the shared `PackIcon` component. Pack icons appear beside pack-owned resources in lists and builders, including actions, triggers, sensors, rules, events, enforcements, executions, queues, workflow action palettes, and workflow task nodes. If the icon cannot be loaded or is missing, the UI falls back to a neutral gear glyph, so the icon is optional and does not affect pack registration or execution behavior.

### Action reference visibility

Actions can declare `reference_visibility` to control whether other packs may call them from rules, workflow tasks, and work queues. The default is `public` when the field is omitted.

| Visibility | Cross-pack reference behavior |
| --- | --- |
| `public` | Any pack may reference the action. |
| `private` | Only the action's owning pack may reference it. |
| `restricted` | The owning pack and packs in `reference_allowed_pack_refs` may reference it. |

Use `private` for implementation details that should not become a pack API. Use `restricted` when a helper pack is intentionally shared with a known set of dependent packs:

```yaml
ref: shared_helpers.create_ticket
label: Create Ticket
reference_visibility: restricted
reference_allowed_pack_refs:
  - incidents
  - maintenance
```

The pack loader and API validate rule `action_ref`, workflow task `action`, and queue `dispatch_action` values against this policy. Tightening an existing action's visibility is blocked while incompatible external references exist.

### Trigger reference visibility

Triggers can declare the same `reference_visibility` and `reference_allowed_pack_refs` fields to control which packs may subscribe to them from rules. The default is `public` when omitted.

| Visibility | Cross-pack subscription behavior |
| --- | --- |
| `public` | Rules from any pack may subscribe to the trigger. |
| `private` | Only rules in the trigger's owning pack may subscribe to it. |
| `restricted` | The owning pack and packs in `reference_allowed_pack_refs` may subscribe to it. |

Use `private` for pack-internal event contracts. Use `restricted` when a pack intentionally exposes an event contract to a known set of dependent packs:

```yaml
ref: shared_alerts.alert_created
label: Alert Created
reference_visibility: restricted
reference_allowed_pack_refs:
  - incidents
  - notifications
parameters: {}
output:
  alert_id:
    type: string
```

The pack loader and API validate rule `trigger_ref` values against this policy. Tightening an existing trigger's visibility is blocked while incompatible external rule subscriptions exist.

### Enabled state during pack reloads

Actions, triggers, sensors, rules, and work queues can all declare `enabled: true` or `enabled: false` in their metadata YAML. When the field is present, pack installation or reload applies that explicit value. When the field is omitted, new records default to enabled, while existing records keep their current enabled/disabled state.

Use this intentionally:

- Include `enabled: false` when a pack should install a component disabled until an operator configures it.
- Omit `enabled` when a pack should not override an operator's current enabled/disabled choice during reload.
- Include `enabled: true` when pack reloads should force the component back on.

For declarative work queues, `accepting_new_items` has the same create/update behavior: omitted means `true` on create and "preserve current value" on reload.

At runtime, disabling is non-destructive: metadata remains visible, but active behavior stops. Disabled triggers reject new event creation, disabled sensors stop or remain stopped, disabled rules do not create enforcements, disabled queues do not dispatch items, and disabled actions cannot be scheduled or manually executed.

## Pack manifest

`pack.yaml` identifies the pack:

```yaml
ref: my_pack
label: My Pack
description: Example automation pack
version: 0.1.0
enabled: true
author: Automation Team
email: automation@example.com
tags:
  - examples
  - remediation

conf_schema:
  base_url:
    type: string
    description: Base URL for the external service.
    required: true
  default_timeout_seconds:
    type: integer
    default: 30
    minimum: 1
    maximum: 300

config:
  default_timeout_seconds: 30

runtime_deps:
  - python
  - shell

meta:
  repository_url: https://git.example.com/automation/my_pack
  documentation_url: https://docs.example.com/my_pack
  category: operations
```

Use lowercase stable refs. Changing refs breaks action, workflow, key, artifact, rule, and queue references.

`conf_schema` uses the same flat schema format as action parameters and trigger payloads. Put non-secret defaults in `config`; create keys separately for credentials.

Use canonical `label`, `conf_schema`, `meta`, and `tags`. The shared checker/registration normalization accepts legacy `name`, `config_schema`, `metadata`, and `keywords` only as fallbacks when the corresponding canonical field is absent. If both forms are present, the canonical value takes precedence and differing values produce a conflict diagnostic. Mirrored field pairs are not required.

`runtime_deps` is useful inventory metadata, but affected versions do not use it as a complete install preflight. Independently verify required runtimes and versions on target workers; action `required_worker_runtimes`, entrypoint checks, and smoke executions remain the execution gate.

## Configuration and secrets

Pack config is for non-secret settings. Keys are for sensitive values.

Good:

```yaml
conf_schema:
  base_url:
    type: string
    required: true
```

Then create a pack-scoped key for the token:

```bash
attune key create --ref my_pack.api_token --name "API Token" --value "secret" --encrypt --owner-type pack --owner-pack-ref my_pack
```

Actions and workflows can access keys only when their execution token permission refs allow it, typically through `standard` for same-pack action/pack-scoped keys.

## Flat schemas

Attune uses a flat schema format for parameters, output, config, queue items, and trigger payloads:

```yaml
parameters:
  message:
    type: string
    required: true
  retries:
    type: integer
    default: 3
  token:
    type: string
    secret: true
```

Do not write external-facing schemas in legacy JSON Schema object/property form unless a specific API endpoint says it expects generated OpenAPI JSON Schema.

## Actions

Actions should:

- Read parameters from stdin as JSON unless there is a strong reason to use another format.
- Return JSON when downstream workflows need structured data.
- Write logs to stdout/stderr and structured artifacts for durable outputs.
- Avoid printing secrets.
- Declare `default_execution_permission_set_refs` only when the action needs Attune API access.
- Use worker placement constraints only when required.

See [Writing Actions](/pack-development/actions/).

## Sensors

Sensors should:

- Emit events with payloads matching trigger schemas.
- Use sensor/execution auth flows rather than user tokens.
- Keep external polling backoff and failure handling explicit.
- Avoid embedding credentials in sensor YAML.

See [Writing Sensors](/pack-development/sensors/).

## Workflows

Workflow actions use two files:

```text
actions/deploy.yaml
actions/workflows/deploy.workflow.yaml
```

The action YAML owns action metadata. The workflow YAML owns only the graph: `version`, `vars`, `tasks`, `output_map`, and `cancellation_policy`.

See [Writing Workflows](/pack-development/workflows/).

## Dashboards

Packs can ship dashboards in `dashboards/*.yaml`. These definitions are loaded as pack-managed dashboard metadata and can be rendered on the runtime dashboard page.

See [Writing Dashboards](/pack-development/dashboards/).

## Queues

Pack-owned queues live under `queues/*.yaml`. They can validate item payloads, shape action params, set concurrency/batch behavior, and define retry policy.

## Release checklist

- Pack refs and component refs are stable.
- Manifest version was bumped.
- Required runtime dependencies are declared and tested.
- Action/sensor schemas are flat and complete.
- Workflow task permission refs are intentional.
- Pack config avoids secrets.
- Tests or example executions cover common paths.
- README explains install, config, and key creation.
- Removed components were reconciled. Cleanup tracks the component classes reported by the loader; removed standalone workflow definitions may require explicit cleanup on affected versions.

## Related

- [Pack Administration](/administration/packs/)
- [Writing Actions](/pack-development/actions/)
- [Runtime Authoring Guide](/pack-development/runtime-authoring/)
- [Runtime Environments](/pack-development/runtime-environments/)
