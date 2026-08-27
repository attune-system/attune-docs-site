---
title: "Writing and Managing Rules"
description: "Rules connect events to action or workflow executions. A rule watches one trigger ref, optionally evaluates event conditions, renders action parameters, and creates an enforcement "
sidebar:
  label: "Writing and Managing Rules"
  order: 5
---
Rules connect events to action or workflow executions. A rule watches one trigger ref, optionally evaluates event conditions, renders action parameters, and creates an enforcement when it matches.

![Rule editor showing trigger and action parameter mapping](/screenshots/Writing-and-Managing-Rules.png)

## Rule lifecycle

1. A sensor or execution emits an event for a trigger ref.
2. The executor finds enabled rules whose `trigger_ref` matches the event. If the event is associated with a specific rule ID, the executor considers only that rule.
3. Each matching rule evaluates its `conditions`.
4. If conditions pass, Attune creates or reuses an enforcement for that rule/event pair.
5. The enforcement is processed into an execution for the rule's `action_ref`.

Rules can be deployed declaratively with packs from `rules/*.yaml`. Rules created through the API, CLI, or UI remain ad-hoc operational records and are preserved separately from pack-loaded rule files.

## Rule fields

| Field | Meaning |
| --- | --- |
| `ref` | Unique rule ref, usually `<pack>.<rule_name>`. |
| `pack_ref` | Pack that owns or groups the rule. Rule authorization checks use this pack context. |
| `label` | Human-readable name. |
| `description` | Optional operator-facing explanation. |
| `trigger_ref` | Trigger/event type that activates the rule. |
| `action_ref` | Action or workflow action to execute when the rule matches. |
| `conditions` | Optional match criteria evaluated against the event. Empty object, empty array, or `null` means always match. |
| `action_params` | Flat parameter object rendered into the enforcement/execution config. |
| `trigger_params` | Optional trigger/sensor configuration data associated with the rule. The API validates it against the trigger schema and publishes rule-created/enabled messages so interested sensor components can react. |
| `trace_tag_template` | Optional template used to derive the enforcement/execution trace tag from event, pack, and system context. |
| `permission_set_refs` | Optional execution permission refs delegated to rule-triggered executions. A string or array is accepted; `permission_set_ref` is a singular compatibility alias in pack YAML. Omission/`null` means no rule-level refs, and an explicit empty array also requests no refs. |
| `enabled` | Disabled rules are skipped. |
| `is_adhoc` | True for API-created rules. |
| `owner_identity` | Identity that registered the rule. Rule-triggered executions are attributed to this identity when available; system/legacy rules can fall back to the system identity. |

`action_ref` must satisfy the target action's reference visibility. Rules in the same pack as the action may reference private or restricted actions. Cross-pack rules may reference public actions, or restricted actions whose allow-list includes the rule's `pack_ref`. Rules without a pack context can reference only public actions.

`trigger_ref` must satisfy the target trigger's reference visibility. Rules in the same pack as the trigger may subscribe to private or restricted triggers. Cross-pack rules may subscribe to public triggers, or restricted triggers whose `reference_allowed_pack_refs` includes the rule's `pack_ref`. Rules without a pack context can subscribe only to public triggers.

## Basic rule example

Rule YAML files live under `rules/*.yaml` in a pack. Pack-loaded rules are installed as non-ad-hoc metadata owned by the pack.

```yaml
ref: incidents.page_on_critical
pack_ref: incidents
label: Page on Critical Incident
description: Page the on-call team when a critical incident event arrives.
trigger_ref: incidents.incident_created
action_ref: pagerduty.create_incident
enabled: true
conditions:
  expression: "{{ event.payload.severity == \"critical\" }}"
action_params:
  title: "{{ event.payload.title }}"
  service: "{{ event.payload.service }}"
  event_id: "{{ event.id }}"
  trigger: "{{ event.trigger }}"
  details: "{{ event.payload }}"
trigger_params: {}
trace_tag_template: "incident.{{ event.id }}"
permission_set_refs: []
```

`action_params` is flat. Do not wrap action inputs in a `parameters` object.

Rule with trigger instance parameters and array conditions:

```yaml
ref: tickets.escalate_prod_high
pack_ref: tickets
label: Escalate Production High-Priority Tickets
description: Poll production high-priority tickets and create incidents.
trigger_ref: tickets.ticket_poll
action_ref: incidents.create_ticket_incident
enabled: true
trigger_params:
  query: 'environment:prod priority:high'
  interval_seconds: 30
conditions:
  - field: environment
    operator: equals
    value: prod
  - field: priority
    operator: contains
    value: high
action_params:
  ticket_id: "{{ event.payload.ticket_id }}"
  payload: "{{ event.payload }}"
  source_rule: "{{ system.rule.ref }}"
```

Disabled maintenance rule:

```yaml
ref: maintenance.cleanup_daily
pack_ref: maintenance
label: Cleanup Daily
trigger_ref: core.crontimer
action_ref: maintenance.cleanup
enabled: false
trigger_params:
  expression: "0 2 * * *"
conditions: {}
action_params:
  mode: daily
```

## Conditions

Rules support three practical condition shapes.

If an event has no payload, the executor currently treats it as a match before evaluating conditions. Design triggers to emit an object payload when rule conditions are important.

### No conditions

Use `{}`, `[]`, or `null` to match every event for the rule's `trigger_ref`.

```yaml
conditions: {}
```

### Expression condition

Use an `expression` string for richer event logic. The expression can be wrapped in `{{ ... }}` or written bare. The condition context exposes `event`:

| Path | Meaning |
| --- | --- |
| `event.id` | Event database ID. |
| `event.trigger` | Trigger ref that emitted the event. |
| `event.trigger_ref` | Alias for the trigger ref. |
| `event.payload` | Event payload JSON. |
| `event.created` | Event creation timestamp. |

```yaml
conditions:
  expression: "{{ event.payload.severity == \"critical\" and event.payload.environment in [\"prod\", \"dr\"] }}"
```

Expression conditions use the same expression engine as workflows for operators and built-in functions, except workflow-status helpers such as `result()`, `succeeded()`, `failed()`, and `timed_out()` are not meaningful in event-rule conditions. See [Writing Workflows](/pack-development/workflows/#template-operators) for the operator and function reference.

### Condition array

Use an array for simple field comparisons. Field paths are relative to the event payload, not prefixed with `event.payload`.

```yaml
conditions:
  - field: severity
    operator: equals
    value: critical
  - field: metadata.region
    operator: not_equals
    value: dev
```

Supported operators:

| Operator | Meaning |
| --- | --- |
| `equals` | JSON equality. |
| `not_equals` | JSON inequality. |
| `contains` | String containment; both the field value and expected value must be strings. |

All array conditions must pass. Unknown operators evaluate to false.

## Rendering action parameters

`action_params` can use templates from the event, pack config, and system context.

| Template | Meaning |
| --- | --- |
| `{{ event.payload.* }}` | Event payload fields. |
| `{{ event.id }}` | Event database ID. |
| `{{ event.trigger }}` | Trigger ref. |
| `{{ event.created }}` | Event creation timestamp. |
| `{{ pack.config.* }}` | Configuration values from the rule's pack. |
| `{{ system.timestamp }}` | Render time timestamp. |
| `{{ system.rule.id }}` | Rule database ID. |
| `{{ system.rule.ref }}` | Rule ref. |

Pure templates preserve JSON type:

```yaml
action_params:
  payload: "{{ event.payload }}"
  retry_count: "{{ event.payload.retry_count }}"
```

Mixed templates become strings:

```yaml
action_params:
  message: "Incident {{ event.payload.id }} in {{ event.payload.service }}"
```

Missing template variables resolve to `null` for pure templates and an empty string inside mixed strings.

## Secret redaction while debugging

Enforcement and execution config remains a flat action-parameter object, but values mapped into secret destinations may appear as redaction markers in normal reads. A marker does not by itself mean template rendering failed and must never be reused as a real parameter value. Plaintext inspection requires explicit decrypt authorization and `include_secret_values=true` on endpoints that support it; prefer proving path presence and execution behavior without decrypting.

## Creating and updating rules with the API

Create a rule:

```bash
curl -sS -X POST "$ATTUNE_API_URL/api/v1/rules" \
  -H "Authorization: Bearer $ATTUNE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ref": "incidents.page_on_critical",
    "pack_ref": "incidents",
    "label": "Page on Critical Incident",
    "description": "Page on-call for critical incidents",
    "trigger_ref": "incidents.incident_created",
    "action_ref": "pagerduty.create_incident",
    "conditions": {
      "expression": "{{ event.payload.severity == \"critical\" }}"
    },
    "action_params": {
      "title": "{{ event.payload.title }}",
      "details": "{{ event.payload }}"
    },
    "trigger_params": {},
    "enabled": true
  }'
```

Update a rule:

```bash
curl -sS -X PUT "$ATTUNE_API_URL/api/v1/rules/incidents.page_on_critical" \
  -H "Authorization: Bearer $ATTUNE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false,
    "conditions": {
      "expression": "{{ event.payload.severity in [\"critical\", \"high\"] }}"
    }
  }'
```

Read and list rules:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/rules` | List rules. |
| `GET /api/v1/rules/enabled` | List enabled rules. |
| `GET /api/v1/rules/{ref}` | Get one rule by ref. |
| `GET /api/v1/packs/{pack_ref}/rules` | List rules in a pack. |
| `GET /api/v1/actions/{action_ref}/rules` | List rules that call an action. |
| `GET /api/v1/triggers/{trigger_ref}/rules` | List rules for a trigger. |
| `POST /api/v1/rules` | Create a rule. |
| `PUT /api/v1/rules/{ref}` | Update a rule. |
| `DELETE /api/v1/rules/{ref}` | Delete a rule. |
| `POST /api/v1/rules/{ref}/enable` | Enable a rule. |
| `POST /api/v1/rules/{ref}/disable` | Disable a rule. |

Create/update validates referenced pack, action, and trigger refs. It also checks the target action's reference visibility and the target trigger's subscription visibility, validates `action_params` against the action parameter schema, and validates `trigger_params` against the trigger schema.

## CLI operations

The CLI has a rule command surface, but the REST API is the authoritative management interface for the current rule payload shape and paginated list responses. Prefer the API examples above or the web UI for creating, listing, and bulk-auditing rules. If you use CLI rule subcommands, verify behavior against your installed CLI version.

## Permissions

Rules use the `rules` RBAC resource in the permission model:

| Grant | Allows |
| --- | --- |
| `rules:read` | View rules and rule details. |
| `rules:create` | Create rules. |
| `rules:update` | Update rule fields such as conditions, parameters, and enabled state. |
| `rules:delete` | Delete rules. |

Rules are private-scoped metadata in row-level visibility:

- Authenticated callers may hit rule read endpoints, but rows are returned only when rule scope matches.
- Non-global read requires explicit rule scope (`pack`-scoped read or specific-rule read).
- A caller with no matching rule scope gets empty list/search results and not-found behavior on direct lookup.
- Rule visibility also gates related operational data: rule-derived events and enforcements are visible only when the originating rule is visible (unless the caller has global read on that resource).

Create/update/delete paths still require the corresponding `rules:*` action grants.

## Operational guidance

- Keep rule refs stable; downstream executions and audits store rule refs.
- Prefer expression conditions for non-trivial logic and array conditions for simple equality checks.
- Keep `action_params` explicit and flat. The action receives only the rendered config, not the whole event unless you pass it.
- Disable before making risky changes to high-volume rules.
- Use trigger-specific list endpoints to see what will fire for a trigger before enabling a rule.
- Include enough event context in action params for idempotency, such as event ID, source identifiers, and external object IDs.

## Related

- [Writing Sensors](/pack-development/sensors/)
- [Writing Actions](/pack-development/actions/)
- [Writing Workflows](/pack-development/workflows/)
- [Permissions and RBAC](/administration/permissions-and-rbac/)
- [API Reference](/reference/api/)
