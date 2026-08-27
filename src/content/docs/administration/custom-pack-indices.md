---
title: "Custom Pack Indices"
description: "An Attune pack index is an HTTPS-hosted JSON catalog of installable packs. Organizations can use the standard Attune index, publish an internal index, or configure several indices "
sidebar:
  label: "Custom Pack Indices"
  order: 8
---
An Attune pack index is an HTTPS-hosted JSON catalog of installable packs.
Organizations can use the standard Attune index, publish an internal index, or
configure several indices in an explicit search order.

Use a custom index when you need to:

- Distribute organization-specific packs.
- Review and approve pack versions before making them discoverable.
- Override a standard pack with an internal implementation.
- Host pack archives in an internal artifact system.
- Separate development, staging, and production catalogs.

The canonical format is version `1.0`. The maintained JSON Schema and reusable
builder are published in
[`attune-system/index`](https://github.com/attune-system/index).

## Use the standard index

Fresh and upgraded Attune databases include an immutable standard-index
snapshot as managed configuration:

```text
https://raw.githubusercontent.com/attune-system/index/c9e48439677847797d056efb94ba1c855e188df9/index.json
```

It appears in the Web UI and through:

```bash
attune pack index list
attune pack index browse
attune pack index show slack
```

Administrators can reorder, disable, or permanently delete it. A migration
does not recreate a deleted row. If it was removed and should be restored, add
it again through the CLI:

```bash
attune pack index add \
  https://raw.githubusercontent.com/attune-system/index/c9e48439677847797d056efb94ba1c855e188df9/index.json \
  --name "Attune Standard Pack Index"
```

Add the live `main` URL separately only when catalog updates independent of
Attune releases are an explicit operational choice.

Attune approves `raw.githubusercontent.com`, `github.com`, and
`codeload.github.com` by default for this index and its install sources. Set
`pack_registry.approved_public_hosts: []` to opt out explicitly. See
[Configure approved hosts](#configure-approved-hosts) for custom policy.
`codeload.github.com` is required because every pinned standard-index Git
source has an independently checksummed codeload archive fallback.

## Standard index publishing automation

Every participating repository in `attune-packs` contains a thin GitHub Actions
caller workflow. A push to `main` or a manual caller run requests an immediate
refresh from `attune-system/index`. The central workflow reads the pack from
GitHub, pins the current commit, calculates Git and archive checksums, validates
the complete index, and commits only when generated content changed.

A full organization sync runs every six hours. This scheduled run is the
authoritative reconciliation path: it discovers new eligible repositories,
refreshes all entries, and removes repositories that were archived, deleted,
forked, or moved. GitHub may coalesce pending event-driven runs during a burst
of pack changes, so users should expect eventual consistency from the full sync
rather than one index commit per pack commit.

Standard pack maintainer expectations are:

- Keep root `pack.yaml`, semantic version, component metadata, tests, and
  documentation current in the pack repository.
- Treat the pack repository as the source of truth and `index.json` as a
  generated artifact.
- Never hand-edit a generated entry or checksum to bypass a publishing failure.
- Inspect the pack caller run first, then the central index run, when an
  immediate refresh fails.
- Expect a broken eligible pack to fail closed and leave the previous valid
  full index published.
- Use a manual full sync when repository membership changed or event dispatches
  may have been missed.

The cross-organization token can dispatch only to `attune-system/index`; it is
not used to clone or push pack content. The central workflow uses its own
short-lived `GITHUB_TOKEN` for generation and publication. The complete
maintainer responsibilities, credential boundary, guarantees, failure process,
and repository lifecycle are defined in the standard index
[automation contract](https://github.com/attune-system/index/blob/main/docs/automation-contract.md?plain=1).

## How index ordering works

Configured indices have an integer position. Lower positions are searched
first. When two enabled indices contain the same pack `ref`, the first index
wins for browse, detail, and install resolution.

Install resolution is fail-closed. A fetch or validation error from any
higher-priority index aborts the install instead of allowing a lower-priority
index to supply the same ref. To make the origin explicit, install with the
numeric managed index ID:

```bash
attune pack install example@1.2.3 --registry-id 42
```

This makes the following order useful:

| Position | Index | Purpose |
| ---: | --- | --- |
| 0 | Company production index | Approved internal packs and intentional overrides. |
| 10 | Attune standard index | Standard public integrations. |
| 20 | Development index | Optional experimental content. |

Add an index at a specific position:

```bash
attune pack index add \
  https://packs.example.com/index.json \
  --name "Company Production" \
  --position 0
```

Reorder or disable an existing index using its numeric ID from `index list`:

```bash
attune pack index update 42 --position 10
attune pack index update 42 --enabled false
attune pack index update 42 --enabled true
attune pack index delete 42
```

API-managed indices are stored in PostgreSQL and managed through the Web UI,
CLI, or API. Static `pack_registry.indices` configuration is a bootstrap
fallback. The pinned standard snapshot alone does not suppress static bootstrap
entries, except canonical duplicates of managed rows. Once any non-standard
API-managed row exists, the API-managed list takes precedence over the static
list.

Attune blocks deletion of the last non-standard managed index while any static
index is enabled. Disable or remove the static entries before deleting that
managed row.

## Build a GitHub organization index

The standard index repository includes a builder for organizations where each
eligible repository contains one pack at its root.

### Prepare the index repository

Fork or copy [`attune-system/index`](https://github.com/attune-system/index),
then install its tooling with Python 3.11 or newer:

```bash
git clone git@github.com:example-org/pack-index.git
cd pack-index
python -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
```

Build an index from all public, non-archived, non-fork repositories in a GitHub
organization:

```bash
GITHUB_TOKEN="$(gh auth token)" python scripts/build_index.py \
  --org example-packs \
  --registry-name "Example Pack Index" \
  --registry-url "https://github.com/example-org/pack-index"

python scripts/validate_index.py --custom
```

The output is `index.json`. The builder fails if an eligible repository does
not have root `pack.yaml`, contains a symbolic link or another unsafe archive
entry, duplicates another pack ref, or produces invalid metadata.

### Update selected repositories

Use repeated `--repository` arguments for event-driven partial updates:

```bash
GITHUB_TOKEN="$(gh auth token)" python scripts/build_index.py \
  --repository example-packs/network \
  --repository example-packs/storage \
  --registry-name "Example Pack Index" \
  --registry-url "https://github.com/example-org/pack-index"

python scripts/validate_index.py --custom
```

A partial update adds or replaces entries but is not the authority for
removals. Run a periodic full organization build to remove repositories that
were deleted, archived, forked, or moved.

### Automate full reconciliation

Use a scheduled workflow in the custom index repository. This example rebuilds
every six hours and supports manual runs:

```yaml
name: Sync custom pack index

on:
  schedule:
    - cron: "17 */6 * * *"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: custom-pack-index-sync
  cancel-in-progress: false

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-python@v6
        with:
          python-version: "3.12"
          cache: pip
      - run: python -m pip install -r requirements.txt
      - name: Build and validate
        env:
          GITHUB_TOKEN: ${{ github.token }}
        run: |
          python scripts/build_index.py \
            --org example-packs \
            --registry-name "Example Pack Index" \
            --registry-url "https://github.com/example-org/pack-index"
          python scripts/validate_index.py --custom
      - name: Publish changes
        run: |
          if git diff --quiet -- index.json; then
            exit 0
          fi
          git config user.name "pack-index[bot]"
          git config user.email "pack-index[bot]@users.noreply.github.com"
          git add index.json
          git commit -m "Update pack index"
          git push
```

Keep validation in the publishing job. A failed build should leave the last
valid index available rather than publishing a partial catalog.

For immediate per-pack refreshes, adapt the reusable dispatch pattern in the
standard repository. The standard automation's exact ownership, token,
trigger, failure, and reconciliation expectations are documented in its
[automation contract](https://github.com/attune-system/index/blob/main/docs/automation-contract.md?plain=1).

## Index JSON format

An index contains registry metadata and one current entry per pack ref:

```json
{
  "registry_name": "Example Pack Index",
  "registry_url": "https://github.com/example-org/pack-index",
  "version": "1.0",
  "last_updated": "2026-08-15T12:00:00Z",
  "packs": [
    {
      "ref": "example",
      "label": "Example Integration",
      "description": "Automates the Example service",
      "use_case": "Manage Example resources and react to Example events",
      "version": "1.2.3",
      "author": "Example Team",
      "email": "automation@example.com",
      "homepage": "https://docs.example.com/attune-pack",
      "repository": "https://github.com/example-packs/example",
      "license": "Apache-2.0",
      "keywords": ["example", "integration"],
      "runtime_deps": ["python"],
      "install_sources": [
        {
          "type": "git",
          "url": "https://github.com/example-packs/example.git",
          "ref": "0123456789abcdef0123456789abcdef01234567",
          "checksum": "sha256:0000000000000000000000000000000000000000000000000000000000000000"
        },
        {
          "type": "archive",
          "url": "https://artifacts.example.com/example-1.2.3.tar.gz",
          "checksum": "sha256:1111111111111111111111111111111111111111111111111111111111111111"
        }
      ],
      "contents": {
        "actions": [
          {
            "name": "resource_get",
            "description": "Get one Example resource"
          }
        ],
        "sensors": [],
        "triggers": [],
        "rules": [],
        "workflows": []
      },
      "dependencies": {
        "attune_version": ">=0.1.0",
        "python_version": ">=3.11",
        "packs": []
      },
      "meta": {
        "category": "integration",
        "tested_attune_versions": ["0.1.0"]
      }
    }
  ]
}
```

The checksums above are placeholders showing the required shape. Replace them
with checksums calculated from the actual source content.

### Registry fields

| Field | Required | Meaning |
| --- | --- | --- |
| `registry_name` | Yes | Human-readable catalog name. |
| `registry_url` | Yes | HTTPS homepage for the registry or its source repository. |
| `version` | Yes | Index format version. Current value is `1.0`. |
| `last_updated` | Yes | ISO 8601 publication timestamp. |
| `packs` | Yes | Pack entry array. Use unique refs and deterministic ref ordering. |

Unknown top-level fields are rejected by the canonical schema.

### Pack fields

| Field | Required | Meaning |
| --- | --- | --- |
| `ref` | Yes | Unique lowercase pack identifier matching `pack.yaml.ref`. |
| `label` | Yes | Human-readable pack name. |
| `description` | Yes | Short pack summary. |
| `use_case` | No | Browse-oriented explanation of when to use the pack. |
| `version` | Yes | Current semantic pack version. One index entry represents one available version. |
| `author` | Yes | Maintainer or author name. |
| `email` | No | Maintainer contact. |
| `homepage` | No | Documentation or project URL. |
| `repository` | No | HTTPS source repository URL. |
| `license` | Yes | SPDX license identifier or appropriate SPDX special value. |
| `keywords` | Yes | Unique discovery terms; an empty array is valid. |
| `runtime_deps` | Yes | Required Attune runtime names; an empty array is valid. |
| `install_sources` | Yes | At least one verified Git or archive source. |
| `contents` | Yes | Component summaries grouped by type. |
| `dependencies` | No | Attune, language, and pack dependency constraints. |
| `meta` | No | Additional registry metadata. Put extension fields here. |

Unknown fields directly on a pack entry are rejected. Put custom extension
metadata under `meta`.

### Manifest normalization

The maintained Python builder and Attune CLI index commands use the same
manifest precedence. Canonical fields win by presence:

- `label`, then `name`, then pack ref.
- Canonical `tags`, then top-level `keywords`, then `meta.keywords`.
- Top-level `license`, then `meta.license`.
- Top-level `homepage`, then `meta.documentation_url`.
- Top-level `use_case`, then `meta.use_case`.

Discovery and runtime arrays are sorted and deduplicated. List dependencies are
normalized to `{"packs": [...]}`; object dependencies map to the supported
dependency fields. JSON-compatible manifest `meta` fields are preserved. The
GitHub organization builder adds repository-derived branch, commit, and star
metadata, while the local CLI does not invent GitHub-only fields.
Canonical scalar metadata must be strings. Discovery, runtime, and dependency
arrays accept strings and finite numbers; nulls, booleans, objects, and
non-finite values are rejected rather than silently dropped or coerced.

Both `attune pack index-entry` and `attune pack index-update` require at least
one real `--git-url` or `--archive-url`; neither command emits placeholder
sources. A Git URL also requires an explicit `--git-ref`; the CLI never
fabricates `v<version>`. `index-update` sorts entries by ref, advances
`last_updated` only when pack content changes, validates the resulting index,
and writes atomically.

### Install sources and checksums

Git source:

```json
{
  "type": "git",
  "url": "https://github.com/example-packs/example.git",
  "ref": "0123456789abcdef0123456789abcdef01234567",
  "checksum": "sha256:<64 lowercase hexadecimal characters>"
}
```

The Git checksum is the Attune directory checksum of installed pack content.
It is not the commit SHA and not the checksum of a Git archive. The standard
builder calculates it by hashing sorted relative paths and file contents after
Git metadata is removed. Use the builder rather than reproducing this framing
by hand.

Archive source:

```json
{
  "type": "archive",
  "url": "https://artifacts.example.com/example-1.2.3.tar.gz",
  "checksum": "sha256:<64 lowercase hexadecimal characters>"
}
```

The archive checksum is SHA-256 over the downloaded archive bytes. Attune
prefers a Git source when an entry provides both types. If Git download,
validation, or checksum verification fails, it tries the first archive source
using that archive's independent checksum. Provenance records the checksum of
the source actually verified. Keep Git refs immutable and archive URLs
versioned.

Checksum verification is enabled by default. Disabling it weakens source
integrity and is not recommended for production.

### Contents

`contents` must contain arrays for all five supported summary groups:

- `actions`
- `sensors`
- `triggers`
- `rules`
- `workflows`

Each component summary has string `name` and `description` fields. Do not emit
numeric component counts in their place.

### Dependencies

The optional dependency object supports:

| Field | Meaning |
| --- | --- |
| `attune_version` | Attune semantic version requirement. |
| `python_version` | Python version requirement. |
| `nodejs_version` | Node.js version requirement. |
| `packs` | Dependent pack refs, optionally with versions according to the consumer's supported syntax. |

The index describes dependencies for discovery and installation. Pack runtime
requirements and environment-specific external services still require normal
pack testing.

## Validate an index

Validate a custom index with the maintained schema and semantic checks:

```bash
python scripts/validate_index.py path/to/index.json --custom
```

The canonical schema is also directly available at:

```text
https://raw.githubusercontent.com/attune-system/index/main/schema/index.schema.json
```

Validation should be required before every publication. At minimum, reject:

- Invalid JSON or schema violations.
- Duplicate pack refs.
- Unsorted or nondeterministic generated output.
- Missing install sources.
- Git refs other than immutable 40-character commit SHAs in production
  catalogs, including custom indices validated with `--custom`.
- Invalid or missing checksums.
- Component counts where arrays are required.
- HTTP or unapproved source hosts.

## Host an index

Any stable HTTPS endpoint without query parameters that returns the JSON file
within Attune's configured size and timeout limits can host an index. This
excludes presigned and other query-authenticated URLs: query-authenticated index
and pack-source URLs are rejected. Common choices are:

- A raw file in a public GitHub repository.
- An object-storage bucket behind HTTPS.
- A static website or CDN.
- An authenticated internal endpoint configured with request headers.

For a public GitHub repository:

```text
https://raw.githubusercontent.com/OWNER/REPOSITORY/main/index.json
```

Treat the published URL as an API. Avoid moving it, returning HTML login pages,
or rewriting content independently of the reviewed source repository.

## Configure approved hosts

Registry URLs and pack source URLs are independently checked against Attune's
outbound URL policy. Trusting the index host does not automatically trust hosts
named inside the index.

For GitHub-hosted indices and sources:

```yaml
pack_registry:
  enabled: true
  cache_enabled: true
  cache_ttl: 3600
  verify_checksums: true
  timeout: 120
  connect_timeout: 10
  index_max_bytes: 10485760
  archive_max_bytes: 104857600
  allow_http: false
  approved_public_hosts:
    - raw.githubusercontent.com
    - github.com
    - codeload.github.com
    - objects.githubusercontent.com
```

For an organization-hosted index and artifact service:

```yaml
pack_registry:
  enabled: true
  verify_checksums: true
  allow_http: false
  approved_public_hosts:
    - packs.example.com
    - artifacts.example.com
```

Only add hosts controlled by or explicitly trusted by your organization. Use
`approved_private_hosts` or `approved_private_cidrs` deliberately for internal
services; do not broadly permit private network access.

## Bootstrap indices from configuration

Static configuration is useful for first startup before administrators create
API-managed rows:

```yaml
pack_registry:
  enabled: true
  indices:
    - name: Company Production
      url: https://packs.example.com/index.json
      priority: 0
      enabled: true
    - name: Attune Standard
      url: https://raw.githubusercontent.com/attune-system/index/c9e48439677847797d056efb94ba1c855e188df9/index.json
      priority: 10
      enabled: true
  approved_public_hosts:
    - packs.example.com
    - artifacts.example.com
    - raw.githubusercontent.com
    - github.com
    - codeload.github.com
```

Lower `priority` values are searched first. The API-managed equivalent uses
`position`. The pinned standard snapshot alone retains static bootstrap entries
as lower-priority fallbacks, excluding canonical duplicates of managed rows.
Any non-standard API-managed row replaces the static bootstrap list for normal
index resolution.

## Configure an authenticated index

The management API accepts custom request headers. For example:

```bash
curl --fail-with-body \
  -X POST "$ATTUNE_API_URL/api/v1/pack-indices" \
  -H "Authorization: Bearer $ATTUNE_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  --data "$(jq -n --arg token "$PRIVATE_INDEX_TOKEN" '{
    name: "Private Production",
    url: "https://packs.internal.example.com/index.json",
    position: 0,
    enabled: true,
    headers: {Authorization: ("Bearer " + $token)}
  }')"
```

API-managed header values are encrypted at rest and returned as `[REDACTED]`.
Do not commit private-index tokens to YAML or shell scripts.

A private index does not automatically make its install sources private. Index
headers are used only to fetch the index. The current Git installer rejects SSH
and credential-bearing Git URLs, and archive downloads do not send custom
headers. Every pack source must therefore be retrievable from an approved HTTPS
host without per-request credentials.

## Test discovery and installation

After configuring the index:

```bash
attune pack index list
attune pack index browse example
attune pack index show example
attune pack install example
attune pack install example@1.2.3
```

An explicit version succeeds only when it matches the version represented by
the current index entry. Format `1.0` does not provide a version-history array.

Test in a non-production Attune deployment before making an index high
priority. Browse success proves that the index can be fetched and parsed;
installation additionally exercises source host approval, download, checksum,
archive safety, pack validation, dependencies, and runtime setup.

## Troubleshooting

### Index is not listed

- Confirm the add request succeeded and the index is enabled.
- Confirm you are using the intended Attune API profile.
- Check whether static configuration was replaced by a non-standard
  API-managed row.

### Index fetch fails

- Verify HTTPS and DNS from the API service container or host.
- Add the index hostname to the appropriate approved-host list.
- Check authentication headers for private endpoints.
- Confirm the response is JSON and smaller than `index_max_bytes`.
- Account for `cache_ttl` when testing recently published changes.

### Pack is missing or the wrong pack wins

- Check the exact pack ref.
- Inspect index positions; the first enabled index containing the ref wins.
- Validate that the producer completed a full sync after repository removal or
  rename.

### Installation is blocked

- Approve the Git or archive source hostname separately from the index host.
- Confirm the source ref and URL still resolve.
- Rebuild the entry instead of hand-editing a failed checksum.
- Check for symbolic links or unsafe archive paths.
- Verify required runtimes and dependent packs.

### Published changes are not visible

- Check the producer's index workflow and hosted `last_updated` value.
- Wait for or temporarily reduce the configured cache TTL.
- Run a manual full producer sync when event-driven updates may have been
  coalesced or missed.

## Related

- [Pack Administration](/administration/packs/)
- [Pack Testing and Release](/pack-development/testing-and-release/)
- [Configuration](/administration/configuration/)
- [Configuration Reference](/reference/configuration/)
- [CLI Reference](/reference/cli/)
- [Security Operations](/operations/security/)
