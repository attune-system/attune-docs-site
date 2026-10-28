---
title: "What's new in 0.10.0"
description: "Shared resource concurrency, complete administrator grants, permission editor coverage, and the 0.10.0 API contract."
sidebar:
  label: "What's new in 0.10.0"
  order: 5
---

Attune `0.10.0` adds shared resource concurrency and completes administrator and permission-editor coverage. This page describes the changes since `0.9.0`.

## Shared resource concurrency

Several actions can now share a named concurrency pool keyed by a scalar input value. For example, deployment, configuration, and validation actions can share one slot per Salesforce organization, even when their organization parameters have different names.

- Limits apply across actions, packs, rule/API/work-queue requests, workflow instances, and executor replicas.
- Shared capacity is additional to the effective standard concurrency policy. Existing action, pack, and global precedence is unchanged.
- Each action can belong to one enabled shared policy. Missing or invalid identifiers and conflicting membership are rejected explicitly.
- `enqueue` preserves resource-group FIFO waiting without consuming shared capacity; `cancel` uses the existing policy-violation path.
- Reservations are durable PostgreSQL records associated with executions. Terminal updates release them without relying on completion-message delivery, and supervisor recovery republishes eligible waiters.

Administrators configure pools in **Policies**. Pack authors use the new `resource_concurrency` object in `policies/*.yaml`; participant mappings can name actions in other packs.

The release also revalidates membership after a blocked policy lock and compensates workflow reservations on genuine pre-start failure. Once a workflow is running, errors retain its reservation because child operations may still be in flight.

See [Shared resource concurrency](/administration/shared-resource-concurrency/) for UI steps, YAML and API examples, rollout behavior, and limitations.

## Administrator and permission-editor changes

Platform catalog revision `3` completes `core.admin` with all supported resource/action pairs. It adds global disclosure grants for packs, queues, queue items, rules, triggers, inquiries, and artifacts, plus `events:create`.

The grant editor now includes policies, queue items, dashboards, and retention. Its choices and display handling match the backend permission vocabulary; unsupported combinations such as `caches:decrypt` remain invalid. `permissions` uses `read` and `manage`, not generic create/update/delete actions.

These changes add grant coverage, not a bypass around token-type, row-visibility, or recorded secret-origin checks. Use constrained operator grants when full administrator access is unnecessary. See [Permissions and RBAC](/administration/permissions-and-rbac/#administrator-permissions-in-0100).

## API contract and client version

The API and generated client report `0.10.0`. Existing policy CRUD endpoints accept `resource_concurrency`; the contract adds `ResourceConcurrency` and `ResourceParticipant` schemas and extends policy request/response types. No separate lock-service API is introduced.

The [API explorer](/api/) loads the `0.10.0` contract. The previous `0.9.0` snapshot remains in the version catalog. When bumping the platform/API version, regenerate the OpenAPI document and clients and run the client-freshness check; the version appears in generated client code even when route shapes are unchanged.

## Deployment and compatibility

| Component | Version for this platform source |
| --- | --- |
| Platform workspace | `0.10.0` |
| Bundled core pack | `1.0.5` |
| Core timer sensor | `0.7.4`, unchanged |

The platform, core pack, and timer sensor are independently versioned. The core pack changes include the updated administrator permission definition; the timer sensor has no new code or build inputs in this release.

Apply the new shared-resource migration before starting the updated services, and keep executor, supervisor, API, and web components aligned. Drain old executors and external operations before enabling a restriction that must exclude already-running work. See [upgrade guidance](/operations/deployment/#upgrade-from-090-to-0100).

Attune remains pre-production. This release does not promise compatibility with arbitrary older pre-production databases or provide exactly-once external execution.

## Security and operational caveats

- Dependency findings `RUSTSEC-2026-0387` for `crypto-bigint` and `RUSTSEC-2023-0071` for `rsa` remain covered by explicit risk acceptance. They are not fixed by this release or by a green CI result. See [dependency advisories](/operations/security/#dependency-advisories-in-0100).
- Shared resource recovery needs the supervisor and its RabbitMQ publisher enabled. Recovery can wait for the configured grace period.
- Shared settings cannot change, and policies cannot be deleted, while requests remain active or waiting. Disabling preserves reservations already held by admitted work.
- Worker loss can leave an external operation running after Attune releases abandoned capacity. Retrying may repeat side effects.
- Persisted rate-limit and quota settings remain subject to the [existing executor limitation](/administration/policies/#what-policies-control); concurrency admission is the database-backed protection.

Implementation changes: [shared concurrency and recovery](https://github.com/attune-system/attune/pull/15), [administrator and editor coverage](https://github.com/attune-system/attune/pull/13), and [dependency policy](https://github.com/attune-system/attune/pull/14).
