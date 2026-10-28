---
title: "Shared resource concurrency"
description: "Limit concurrent executions across actions and packs using a resource identifier from each action's parameters."
sidebar:
  order: 7
---

Shared resource concurrency is available in Attune `0.10.0`. Use it when different actions operate on the same external resource, such as a Salesforce organization, tenant, or deployment target.

A shared policy with limit `1` allows one participating execution per resource identifier. Executions for other identifiers can run concurrently. The limit applies across packs, rules, direct API requests, work queues, workflow instances, and executor replicas.

## Standard limits still apply

Shared policies add a constraint to the effective [standard execution policy](/administration/policies/). They do not replace action, pack, or global precedence. For example, an action limit of `10` and a shared organization limit of `1` must both allow admission before dispatch.

Each action can participate in at most one enabled shared policy. Conflicting creation or enablement is rejected, rather than resolved by priority. A shared policy cannot also contain standard concurrency, rate-limit, or quota controls; configure those in a separate standard policy.

## Create a policy in the web UI

1. Open **Policies** and select **Create Policy**.
2. Enter the policy name, qualified ref, description, and enabled state.
3. Enable **Shared resource policy** in **Shared resource concurrency**.
4. Enter the resource namespace, concurrency limit, and exhaustion behavior, `enqueue` or `cancel`.
5. Select each participating action and enter its resource parameter path.
6. Save the policy. List badges and the detail page identify it as shared resource concurrency.

Use global scope for an administrator-owned policy, or pack scope for a pack-owned policy. Pack scope identifies ownership, not the allowed participants: a pack-owned policy can cover actions in other packs. Action scope is not used for shared policies.

## Pack YAML

Save this definition under the owning pack's `policies/` directory. The example actions must already exist before an enabled policy is loaded.

```yaml
ref: salesforce_org_concurrency
name: Salesforce organization concurrency
description: Serialize metadata changes for each organization.
enabled: true
resource_concurrency:
  namespace: salesforce_org
  limit: 1
  method: enqueue
  participants:
    - action: salesforce.deploy_metadata
      resource_parameter: org_id
    - action: salesforce.update_configuration
      resource_parameter: organization_id
    - action: salesforce.validate_metadata
      resource_parameter: org_id
```

An execution of `salesforce.deploy_metadata` with `org_id: org-a` shares capacity with `salesforce.update_configuration` using `organization_id: org-a`. The parameter names do not need to match. Either action targeting `org-b` uses a different group.

The pack loader qualifies the local policy ref with the owning pack. Participant action refs must be fully qualified.

## API configuration

Use the existing policy endpoints. For example, send this body to `POST /api/v1/policies`:

```json
{
  "ref": "ops.salesforce_org_concurrency",
  "name": "Salesforce organization concurrency",
  "enabled": true,
  "scope": { "type": "global" },
  "resource_concurrency": {
    "namespace": "salesforce_org",
    "limit": 1,
    "method": "enqueue",
    "participants": [
      {
        "action": "salesforce.deploy_metadata",
        "resource_parameter": "org_id"
      },
      {
        "action": "salesforce.update_configuration",
        "resource_parameter": "organization_id"
      }
    ]
  }
}
```

The same `resource_concurrency` object is available in update requests and policy responses. Access requires the corresponding `policies` management grants. See [Permissions and RBAC](/administration/permissions-and-rbac/) and the [API explorer](/api/).

## Resource identifiers

Paths traverse objects in the flat execution parameter map. For example, `target.org_id` reads `{"target":{"org_id":"org-a"}}`. There is no `parameters` wrapper, array indexing, expression evaluation, or composite identifier.

Accepted identifiers are nonempty strings, integers, and booleans. Missing values, nulls, objects, arrays, whitespace-only strings, and fractional numbers fail policy admission explicitly. They do not bypass the policy or share an accidental null group.

Strings preserve their exact bytes and case. Integer `1` and string `"1"` are different resources. The namespace labels the pool; separately defined policies with the same namespace do not share capacity.

The stored group combines the policy ID with a SHA-256 digest of the scalar's JSON representation. Logs use the digest rather than the raw parameter value. Hashing is not encryption and does not prevent guessing low-entropy identifiers.

## Waiting and cancellation

| Method | Behavior when capacity is unavailable |
| --- | --- |
| `enqueue` | Keep the execution `requested`, preserve its FIFO position within the resource group, and defer worker selection. Waiting requests consume no shared capacity. |
| `cancel` | Follow the existing policy-violation cancellation path, with the policy reference and hashed group in the diagnostic. |

The executor acquires shared and applicable standard concurrency capacity in one short PostgreSQL transaction. Reservations belong to their execution, not to an executor's in-memory counter. Duplicate requests cannot create additional reservations.

The [supervisor](/operations/supervisor/) republishes eligible waiting executions through the existing requested-execution recovery path. Admission is checked again under database locks. Recovery needs the supervisor and its RabbitMQ publisher enabled, and can wait for the configured recovery grace period. Increasing worker count does not resolve an exhausted resource group.

## Workflows and release

Each participating workflow child acquires its own slot. A parent holds none unless the workflow action itself explicitly participates. Workflow task `concurrency` limits fan-out within that task; it is not a replacement for a cross-workflow resource policy.

A workflow startup failure that reverts `scheduling` to `requested` releases its reservations atomically. After the parent becomes `running`, errors retain capacity because child work may already be in flight. Avoid giving a parent and its children the same resource when the limit would prevent the children from starting.

Reservations are removed on `completed`, `failed`, `cancelled`, `timeout`, or `abandoned`. The intermediate `canceling` state retains capacity. Repeated terminal updates do not release capacity twice; execution deletion also removes its reservation.

## Change or disable a shared policy

| Operation | Effect |
| --- | --- |
| Disable or retire | Stop restricting new executions. Waiting requests drop the shared constraint on their next scheduling attempt. Already admitted executions keep their reservation until terminal. Standard policies still apply. |
| Edit resource settings | Rejected while active or waiting requests remain. Drain or cancel those executions first. Name, description, and enabled state can still change. |
| Delete | Rejected while requests reference the policy. Disable it and let outstanding work drain first. |
| Create or enable | Apply to later scheduling attempts, not retroactively to work already dispatched. Drain existing external operations first if strict exclusion is required during rollout. |

## Diagnose a blocked execution

- Check the policy ref, execution ID, hashed resource group, and admission decision in executor logs. Database logs record terminal releases.
- Check whether the owning execution is still running or canceling. Waiting for cancellation to finish is intentional.
- Confirm all participant paths resolve to the intended scalar, and that no second enabled policy claims the action.
- Check supervisor recovery and RabbitMQ publishing when capacity is free but work remains requested.

A reservation is not an external-operation fencing token. Worker loss can leave a Salesforce operation running after Attune marks its execution abandoned and frees the slot. Recovery and retries do not guarantee exactly-once external execution.

## Related

- [Policy administration](/administration/policies/)
- [Writing workflows](/pack-development/workflows/)
- [Upgrade to 0.10.0](/operations/deployment/#upgrade-from-090-to-0100)
- [Policy storage and admission](/internal-implementation/data-structures/policies/)
