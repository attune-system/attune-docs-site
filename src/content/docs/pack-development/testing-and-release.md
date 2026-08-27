---
title: "Pack Testing and Release"
description: "Pack testing should prove that metadata loads, dependencies install, actions/sensors run, and workflows behave correctly before the pack is installed in a shared Attune environment"
sidebar:
  label: "Pack Testing and Release"
  order: 9
---
Pack testing should prove that metadata loads, dependencies install, actions/sensors run, and workflows behave correctly before the pack is installed in a shared Attune environment.

![Installed pack detail page used to verify release metadata and components](/screenshots/Pack-Testing-and-Release.png)

## Local development paths

Use regular pack directories for versioned content and development bind mounts for fast iteration:

```text
packs/       # repository pack content
packs.dev/   # development override/bind-mounted packs
```

With Docker Compose, packs are mounted into services through volumes rather than copied into images.

## Test layers

| Layer | What to check |
| --- | --- |
| Static validation | YAML parses, refs are stable, schemas are flat, entrypoints exist. |
| Runtime setup | Dependencies install into `runtime_envs_dir`, not pack directories. |
| Action smoke tests | Actions accept stdin JSON and produce expected output format. |
| Sensor smoke tests | Sensor starts, authenticates, emits expected trigger payloads. |
| Workflow tests | Transitions, publish values, retries, with_items, inquiries, and output maps. |
| Install tests | Upload/install/register path works in Docker or staging. |

`attune pack check PATH` is the primary read-only structural gate, not a registrar-equivalent simulation. It uses the same canonical-first manifest normalization as registration, including legacy fallback and conflict diagnostics. Follow it with `attune pack test PATH` and, when permitted, an upload or API-visible register smoke test. The checker may not validate testing configuration, every enum-valued action field, registrar persistence behavior, or runtime availability.

```bash
attune --output json pack check ./packs/my_pack
attune pack test ./packs/my_pack --detailed
```

Configure at least one implemented test runner (`script`, `unittest`, or `pytest`) with `result_format: simple`; do not enable testing with an empty runner map. Failed pack tests exit nonzero in table, JSON, and YAML output modes, while still rendering the selected output format.

## Pack upload

Use upload for local pack release testing:

```bash
attune pack upload ./packs/my_pack
attune pack upload ./packs/my_pack --force
```

Use `--force` only when replacing existing content intentionally.

## Pack index metadata

For registry/index publishing, provide enough metadata for admins to decide whether to install:

- Ref, label, description, version.
- Source type (`git` or `archive`).
- Source URL and optional ref.
- Author/owner.
- Compatibility notes.
- Required runtimes and external services.
- Security notes for credentials/permissions.

## Release checklist

- Version bumped.
- README updated.
- CHANGELOG updated if present.
- All YAML examples reflect flat schemas.
- Required keys and config documented.
- Runtime dependencies are declared.
- Required runtimes are checked independently; `runtime_deps` metadata alone is not install preflight on affected versions.
- Workflow files are graph-only.
- Action default permission refs reviewed.
- Tests run in a Docker-like environment.
- Pack can be installed from intended source.

## Related

- [Pack Developer Guide](/pack-development/overview/)
- [Pack Administration](/administration/packs/)
- [Custom Pack Indices](/administration/custom-pack-indices/)
- [Runtime Authoring Guide](/pack-development/runtime-authoring/)
- [Runtime Environments](/pack-development/runtime-environments/)
