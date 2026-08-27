---
title: "Pack Administration"
description: "Packs are the main way Attune distributes automation content. Admins install, update, and remove packs through the Web UI, CLI, or API. Pack configuration values are edited through"
sidebar:
  label: "Pack Administration"
  order: 7
---
Packs are the main way Attune distributes automation content. Admins install, update, and remove packs through the Web UI, CLI, or API. Pack configuration values are edited through the Web UI or API.

![Pack management page listing installed packs](/screenshots/Pack-Administration.png)

## Pack sources

Attune supports:

- Local upload from a workstation.
- Registering a server-visible path.
- Installing from Git repositories with explicit unverified-remote opt-in.
- Installing from archive URLs with explicit unverified-remote opt-in.
- Browsing/installing from configured pack registry indices.

Registry references are the secure default because their sources include
expected checksums. Direct remote Git/archive installs are rejected unless an
operator explicitly sets
`pack_registry.allow_unverified_direct_remote_installs: true`; approved-host
and HTTPS policy still apply.

Use `attune pack install <ref> --registry-id <id>` to pin a registry install to
one enabled managed index. Use `--no-registry` only with an explicit URL or
path already visible to the API server; it never falls back to a registry lookup and cannot be
combined with `--registry-id`.

## Upload vs register

Use upload for local files:

```bash
attune pack upload ./my-pack
attune pack upload ./my-pack --force
```

Upload creates an archive and sends it to the API. This works even when the API runs in Docker.

Use register only for paths visible inside the API container:

```bash
attune pack register /opt/attune/packs/my-pack
```

## Pack indices

Pack indices are ordered registry sources managed by the API/UI/CLI. They let admins browse available packs and install by metadata rather than pasting URLs.

Typical index entry sources:

- `git`: repository URL plus optional ref.
- `archive`: downloadable archive URL.

Admins can add, reorder, disable, or remove indices. Index order matters when
the same pack appears in multiple sources. Install resolution fails closed if
a higher-priority index cannot be fetched or validated; it does not silently
continue to a lower-priority origin.

Database migrations add a pinned Attune Standard Pack Index snapshot as managed
configuration. It starts first on a fresh database and is appended after
existing indices during upgrade. Administrators may reorder, disable, or
permanently delete it.

Deletion is blocked if it would remove the last non-standard managed index
while enabled static indices remain configured. Disable or remove the static
entries first to avoid unexpectedly reactivating bootstrap configuration.

The standard public index, custom-index creation, complete JSON format,
approved-host configuration, static bootstrap configuration, and authenticated
index examples are covered in [Custom Pack Indices](/administration/custom-pack-indices/).

## Pack lifecycle

```text
install/upload/register
  -> extract/copy pack files
  -> load pack manifest
  -> load permission sets
  -> load runtimes
  -> load triggers
  -> load actions and workflow definitions
  -> load dashboards
  -> load work queues
  -> load sensors
  -> publish pack.registered for workers when runtime setup is needed
```

Component loading order matters because later components can depend on earlier components.

For registry installs, the resolved index ref and version must exactly match
`pack.yaml`. Attune prefers Git, but if that source fails it tries the first
independently checksummed archive source. Provenance stores the checksum of the
source actually verified, including the archive checksum after fallback.

## Configuration

Pack records store configuration schema and configuration values. API-created packs and initialization can set defaults; installed packs should be configured after install. Use keys for secrets instead of storing secret values in pack config.

## Standard vs user-created packs

- System/standard packs are globally visible and usually loaded by initialization.
- API-created non-standard packs are scoped to the creating identity unless grants allow broader access.

## Safe upload behavior

By default, pack upload extraction rejects unsafe archive entries such as path traversal, absolute paths, symlinks, hardlinks, devices, and FIFOs. Upload size and file-count limits are configurable.

## Operational checklist

- Install packs from trusted sources.
- Review action/sensor code before enabling in production.
- Configure required pack settings and keys.
- Verify runtime dependencies are available.
- Run pack tests where provided.
- Watch worker logs after installation so runtime environments can be created.
- Use `--force` intentionally. Replacing an existing pack additionally requires
  `configure` permission for that pack and preserves its current owner.

## Related

- [Pack Developer Guide](/pack-development/overview/)
- [Pack Testing and Release](/pack-development/testing-and-release/)
- [Custom Pack Indices](/administration/custom-pack-indices/)
- [Runtime Environments](/pack-development/runtime-environments/)
- [CLI Reference](/reference/cli/)
