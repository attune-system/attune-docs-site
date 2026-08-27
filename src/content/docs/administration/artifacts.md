---
title: "Artifact Administration"
description: "Artifacts are versioned outputs associated with executions or reusable pack/action scopes. They can represent files, logs, progress, URLs, or structured data."
sidebar:
  label: "Artifact Administration"
  order: 11
---
Artifacts are versioned outputs associated with executions or reusable pack/action scopes. They can represent files, logs, progress, URLs, or structured data.

![Artifact list with filters, visibility, scope, owner, and download actions](/screenshots/Artifact-Administration.png)

## Artifact types

Common categories:

- File artifacts: binary, text, image, data table.
- Progress artifacts: execution progress entries.
- URL artifacts: links to external results.
- Other artifacts: database-stored byte or JSON content versions.

## Storage model

The `artifact` row stores metadata and current structured data. The `artifact_version` row stores immutable content versions.

File-type versions store a relative file path under `artifacts_dir`, for example:

```text
<artifact-ref-with-dots-as-dirs>/v1.txt
```

Database-stored versions use byte or JSON columns.

For file-backed versions, the allocation API creates the metadata row and returns the relative path. The producer writes bytes to `$ATTUNE_ARTIFACTS_DIR/<file_path>`. If the producer is an execution-scoped action and the request omits `execution`, Attune records the current execution id from the token so the worker can finalize that version after the action exits.

## Visibility

Artifacts have `public` or `private` visibility, but read decisions are path-aware:

- Progress artifacts default to `public` when visibility is omitted.
- Other artifact types default to `private`.
- Callers can override visibility explicitly.

Read evaluation order:

1. Unscoped/global artifact read grants immediate access.
2. If artifact versions have execution linkage, execution-derived visibility is authoritative.
3. If no execution linkage exists, owner-path visibility (`identity`, `pack`, `action`, `sensor`) is evaluated.

Important implications:

- When execution linkage exists, owner-path visibility does not broaden access.
- Child-execution linkage inherits parent execution visibility semantics.
- Version reads/downloads/streams are evaluated per version linkage; callers can read only versions whose linkage is readable.
- Latest-version endpoints for non-global callers return the latest readable version (or deny when none is readable).

## Retention

Artifact version content is immutable after creation/allocation. The current automatic retention enforcement is version-count based: when `retention_policy` is `versions`, the database trigger removes oldest versions beyond `retention_limit`. Time-based policy values (`days`, `hours`, `minutes`) are stored but are not automatically pruned by the trigger.

Action stdout/stderr artifacts default to `days` / `7`, because each execution can create a new log artifact version. Sensor log artifacts default to `versions` / `4`, because a sensor creates a new artifact version only when its rotating log segment exceeds the configured size limit. Action and sensor rows can override these defaults with `log_retention_policy` and `log_retention_limit`.

## File-backed artifacts

Workers and actions can create file artifact versions and write to `ATTUNE_ARTIFACTS_DIR`. After execution, the worker finalizes observed sizes. In standalone/API-transport mode, the worker first copies locally staged files to the API-accessible artifact volume, then updates `size_bytes`. Delete operations remove disk files and clean empty parent directories.

Sensor stdout/stderr logs are also file-backed artifact versions. Each rotation segment is a retained artifact version, and the sensor log endpoints read the retained versions rather than relying on an untracked local log file.

## CLI examples

```bash
attune artifact list
attune artifact list --execution 42
attune artifact show mypack.build_log
attune artifact download 1 -o ./build.log
attune artifact version list 1
```

## Operational checks

- In shared-volume deployments, ensure API and workers/sensors mount the same artifact volume.
- In standalone deployments, ensure workers/sensors use API transport and can reach the API internal file endpoints.
- Keep artifacts backed up if they are business records.
- Use private visibility for sensitive output.
- Use version-count retention limits for high-volume logs.
- Review artifact audit events for sensitive create/download/delete operations.

## Related

- [Permissions and RBAC](/administration/permissions-and-rbac/)
- [Writing Actions](/pack-development/actions/)
- [Backup and Recovery](/operations/backup-and-recovery/)
