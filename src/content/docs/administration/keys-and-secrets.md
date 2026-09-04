---
title: "Keys and secrets"
description: "Create owner-scoped configuration and secrets, address them by canonical reference, and control access with RBAC."
sidebar:
  label: "Keys and secrets"
  order: 4
---

Keys store small JSON values such as API tokens, credentials, and shared configuration. Encrypt values that contain secrets. Use [Data Caches](/administration/data-caches/) for external datasets and [Artifacts](/administration/artifacts/) for files or execution output.

## Key references

When you create a key, provide a `local_ref`, an owner type, and the owner identifier required by that type. Attune constructs the canonical `ref`.

| Owner type | Owner identifier | Canonical ref |
| --- | --- | --- |
| `system` | None | `system.<local_ref>` |
| `identity` | Identity login | `identity.<login>.<local_ref>` |
| `pack` | Pack ref | `pack.<pack_ref>.<local_ref>` |
| `action` | Action ref | `action.<action_ref>.<local_ref>` |
| `sensor` | Sensor ref | `sensor.<sensor_ref>.<local_ref>` |

For example, a key with local ref `api_token` owned by pack `tickets` has canonical ref `pack.tickets.api_token`.

The local ref must start with a lowercase letter or number. It can contain lowercase letters, numbers, underscores, and hyphens, with a maximum length of 63 characters. It cannot contain dots because Attune reserves dots for canonical-ref segments.

You cannot change a key's owner or local ref after creation. Create a new key to move or rename it.

## Manage keys in the Web UI

Open **Keys & Secrets** at `/keys`.

To create a key:

1. Click **Create Key**.
2. Enter the local reference and display name.
3. Select the value format and enter the value.
4. Keep **Encrypt value** selected for secret text, JSON, or YAML values.
5. Select the owner scope. For identity, pack, action, or sensor scope, enter the corresponding login or ref.
6. Check the canonical-reference preview, then click **Create Key**.

The list displays metadata only. It never includes key values. Use the edit action to change the display name, value, or encryption setting. The owner and local ref remain fixed.

Opening the editor reads the key through the API. For an encrypted key, the API returns plaintext only when your grants include both `keys:read` and matching `keys:decrypt`. Without decrypt access, the API returns a null value.

## Manage keys with the CLI

Create a system key:

```bash
attune key create \
  --local-ref webhook_token \
  --name "Webhook token" \
  --value "secret" \
  --encrypt
```

Create a pack-owned structured key:

```bash
attune key create \
  --local-ref api_credentials \
  --name "Ticket API credentials" \
  --value '{"username":"attune","token":"secret"}' \
  --encrypt \
  --owner-type pack \
  --owner-pack-ref tickets
```

Attune returns `pack.tickets.api_credentials` as the canonical ref. Use that full ref for later commands and RBAC constraints.

```bash
attune key list --owner-type pack --owner tickets
attune key show pack.tickets.api_credentials
attune key show pack.tickets.api_credentials --decrypt
attune key update pack.tickets.api_credentials --value '{"username":"attune","token":"new-secret"}'
attune key delete pack.tickets.api_credentials --yes
```

`attune key show` reads the key through the API. If the caller has `keys:decrypt`, the API returns plaintext and the CLI displays its SHA-256 digest by default. The `--decrypt` flag displays that returned value instead. The flag controls CLI output; it does not change the API request or grant check. Without `keys:decrypt`, the API returns null for an encrypted value.

## Encryption

Encrypted keys use the server's configured `ENCRYPTION_KEY`. Attune stores ciphertext in PostgreSQL and decrypts the value in memory when an authorized caller or worker needs it.

Changing or losing `ENCRYPTION_KEY` makes existing encrypted values unreadable until you restore the original key or recreate the values. Database and backup access exposes unencrypted key values, so do not store credentials with encryption disabled.

## Access from actions and workflows

An execution does not inherit the initiating user's permissions. Its `permission_set_refs` determine whether it can read keys.

The reserved `standard` permission set grants read and decrypt access to keys owned by the executing action and its pack. A workflow child also receives access for its containing workflow action and pack. Use custom permission sets for other scopes.

The worker loads system, pack, and action keys in that order. Later scopes replace earlier values with the same display `name`. The worker merges the resulting values into the action's flat parameter object and sends it as JSON through standard input. Identity-owned and sensor-owned keys do not participate in action key inheritance.

## RBAC

Key grants use the `keys` resource with `read`, `create`, `update`, `delete`, and `decrypt` actions. Grants can constrain owner types, owner refs, canonical key refs, numeric IDs, and encryption status.

```yaml
grants:
  - resource: keys
    actions: [read, decrypt]
    constraints:
      owner_types: [pack]
      owner_refs: [tickets]
      refs: [pack.tickets.api_credentials]
      encrypted: true
```

`keys:read` and `keys:decrypt` are separate. Reading encrypted-key metadata does not reveal the value without a matching decrypt grant. Updating a key requires `keys:update`; the API does not require `keys:decrypt` to replace its value.

Identity-owned keys have an extra restriction. An unconstrained grant does not expose another identity's keys. Cross-identity access requires a matching owner constraint.

## Deletion behavior

Deleting an action or sensor deletes its owned keys. Pack-owned and identity-owned keys use restrictive foreign keys, so delete those keys before deleting their owner. This prevents pack deletion from silently removing credentials.

## Related

- [Permissions and RBAC](/administration/permissions-and-rbac/)
- [CLI Reference](/reference/cli/)
- [API Reference](/reference/api/)
- [Writing Actions](/pack-development/actions/)
