---
title: "Policy Administration"
description: "Use execution policies to control how many matching executions can run, how quickly they can be requested, and which execution counters must stay under a quota. Policies are config"
sidebar:
  label: "Policy Administration"
  order: 6
---
Use execution policies to control how many matching executions can run, how quickly they can be requested, and which execution counters must stay under a quota. Policies are configured from the web UI under **Policies**.

## What policies control

Attune resolves one effective policy for each execution:

1. Action-scoped policies override pack-scoped policies.
2. Pack-scoped policies override global policies.
3. If multiple enabled policies match at the same scope, the highest `priority` wins.

Policy features are optional, but each policy must enable at least one feature before it can be saved.

| Feature | Use it for |
| --- | --- |
| Concurrency | Limit simultaneous matching executions. |
| Rate limit | Limit matching execution requests during a rolling time window. |
| Quotas | Enforce supported execution counters, such as currently running executions or total executions. |

## Required access

The **Policies** navigation item is shown only to users with access to the `policies` resource. Creating, editing, or deleting policies requires the matching policy-management permissions through your roles or permission sets.

If you cannot see **Policies**, ask an administrator to grant policy access. See [Permissions and RBAC](/administration/permissions-and-rbac/) for role and permission management.

## Open the policy UI

1. Sign in to the web UI.
2. Select **Policies** in the left navigation.
3. Use the list filters to find existing policies by search text, scope, enabled state, or concurrency behavior.
4. Select a policy name to inspect its scope, priority, enabled state, and configured features.

The policy list shows feature badges for concurrency, rate limit, and quota configuration. Disabled policies are stored but do not participate in execution policy resolution.

## Create a policy

1. Open **Policies** and select **Create Policy**.
2. In **Policy identity**, enter a name, ref, description, enabled state, priority, and optional comma-separated tags.
3. In **Scope**, choose where the policy applies:

| Scope | Applies to |
| --- | --- |
| Action | One selected action. This is the most specific scope. |
| Pack | All actions in one selected pack, unless an action policy overrides it. |
| Global | All executions, unless a pack or action policy overrides it. |

For pack and action policies, the UI stores the ref as a pack-qualified ref such as `core.limit_echo`. The effective policy preview explains how the selected scope and priority compare with current same-scope policies.

## Configure concurrency

Enable **Concurrency** when you need to limit simultaneous matching executions.

| Field | Meaning |
| --- | --- |
| Concurrent execution limit | Maximum number of matching executions that may run at the same time. |
| When the limit is reached | `enqueue` waits for capacity; `cancel` fails the scheduling attempt when no slot is available. |
| Group by parameter paths | Optional action input paths that split the limit into independent pools. Leave empty for one shared pool. |

When an action is selected, the UI suggests parameter names from the action schema. Add a grouping path such as `customer_id` when each customer should have its own concurrency bucket.

Example: an action policy with limit `1`, method `enqueue`, and group path `customer_id` allows one running execution per customer while queueing additional executions for the same customer.

## Configure rate limits

Enable **Rate limit** when you need to cap how many matching executions may be requested in a rolling window.

| Field | Meaning |
| --- | --- |
| Max executions | Number of matching executions allowed in the window. |
| Window | Positive time value. |
| Unit | Seconds, minutes, or hours. |

The UI shows a preview such as `10 executions per 1 minute`. Use rate limits for burst control, API protection, or external service limits.

## Configure quotas

Enable **Quotas** when you need supported execution counters to stay below explicit limits.

| Quota type | Meaning |
| --- | --- |
| Running executions | Maximum currently running executions that match this policy. |
| Total executions | Maximum historical executions that match this policy. |

Each quota needs a positive limit. Add multiple quota rows when more than one counter should be checked.

## Edit or delete a policy

1. Open **Policies**.
2. Select the policy name.
3. Select **Edit** to update name, description, enabled state, priority, tags, and policy features.
4. Select **Delete** to remove the policy after confirming the browser prompt.

Policy scope and ref are immutable in the edit form. To change scope or ref, create a new policy with the desired scope and delete or disable the old one.

## Recommended patterns

| Goal | Recommended policy |
| --- | --- |
| Protect a single production deployment action | Action scope, concurrency limit `1`, method `enqueue`. |
| Prevent a whole pack from overloading a shared system | Pack scope, rate limit tuned to the external system's allowance. |
| Provide a safe platform-wide fallback | Global scope with conservative concurrency or rate limits and low priority. |
| Isolate customers or tenants | Action or pack scope with concurrency grouping paths such as `customer_id` or `tenant_id`. |

Start with action-scoped policies for sensitive actions. Add pack or global policies when you need broader defaults.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| A policy is not taking effect | Confirm it is enabled and that no more-specific action or pack policy overrides it. |
| The wrong same-scope policy wins | Compare priorities; higher priority wins within the same scope. |
| The form will not save | Make sure the name/ref are set, scope is complete, and at least one feature is enabled. |
| Grouping does not split concurrency as expected | Verify the grouping path matches a top-level or nested action parameter path sent in the execution config. |
| A user cannot open the policy page | Grant access to the `policies` resource through RBAC. |

## Related

- [Permissions and RBAC](/administration/permissions-and-rbac/)
- [Writing Actions](/pack-development/actions/)
- [Writing Workflows](/pack-development/workflows/)
- [Queue Administration](/administration/queues/)
- [CLI Reference](/reference/cli/)
