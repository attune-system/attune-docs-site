---
title: "Runtime Authoring Guide"
description: "This guide is for pack authors who want to define or customize runtimes under runtimes/.yaml."
sidebar:
  label: "Runtime Authoring Guide"
  order: 11
---
This guide is for pack authors who want to define or customize runtimes under `runtimes/*.yaml`.

## Where runtime definitions live

Runtime files are loaded from:

```text
<pack>/runtimes/*.yaml
```

At pack load time, Attune upserts runtime records by `ref`, then upserts optional version entries from `versions[]`.

## Required model to keep in mind

- Runtimes are **unified** for actions and sensors.
- `runtime_type` is legacy and should not be used.
- A runtime can be:
  - **Interpreter-managed** (`execution_config` has interpreter/environment/dependency config), or
  - **Native/direct** (`execution_config: {}`), where entrypoints run directly.

## Runtime YAML fields

| Field | Required | Notes |
| --- | --- | --- |
| `ref` | Yes | Lowercase runtime ref, format `<pack_ref>.<runtime_name>` (example: `my_pack.python`). |
| `pack_ref` | Recommended | Should match your pack ref for pack-managed runtimes. |
| `name` | Recommended | Human-readable runtime name. |
| `aliases` | Recommended | Lowercase aliases used in runtime matching (`python`, `python3`, `node`, `nodejs`, `node.js`, etc.). |
| `description` | No | Runtime description. |
| `distributions` | Recommended | Includes verification metadata (`verification`). |
| `installation` | No | Installation/support metadata. |
| `execution_config` | Depends | Required for interpreter-managed runtimes; `{}` is valid for native/direct execution runtimes. |
| `versions` | No | Optional list of version-specific runtime configs. |

## Verification metadata (`distributions.verification`)

Runtime auto-detection/verification reads this structure:

```yaml
distributions:
  verification:
    always_available: false
    check_required: true
    commands:
      - binary: python3
        args: ["--version"]
        exit_code: 0
        pattern: "Python 3\\."
        priority: 1
        optional: false
```

### Verification semantics

- `always_available: true` skips checks and marks runtime available.
- `check_required: false` also treats runtime as available without executing commands.
- `commands` are tried by ascending `priority` (lower first).
- `pattern` (regex) matches command output when specified.
- `optional: true` lets a failed command be ignored while trying the next command.

## `execution_config` shape

`execution_config` supports:

- `interpreter`
  - `binary`
  - `args`
  - `file_extension`
- `inline_execution`
  - `strategy`: `direct` or `temp_file`
  - `extension` (optional)
  - `inject_shell_helpers` (optional)
- `environment` (optional)
  - `env_type`
  - `dir_name`
  - `create_command`
  - `interpreter_path`
- `dependencies` (optional)
  - `manifest_file`
  - `install_command`
- `env_vars` (optional)
  - string form: `VAR: "{env_dir}/node_modules"`
  - object form: `VAR: { operation: prepend, value: "...", separator: ":" }`

### Supported template variables

- `{pack_dir}`
- `{env_dir}`
- `{interpreter}`
- `{action_file}`
- `{manifest_path}`

### Python virtualenv recommendation

For Python virtualenv runtimes, prefer `venv --copies` in `create_command`:

```yaml
create_command: ["python3", "-m", "venv", "--copies", "{env_dir}"]
```

Copy-based virtualenvs avoid symlink breakage on shared volumes. Runtime envs are commonly re-created during install/repair flows, so the copy overhead is usually acceptable.

## Full runtime template

```yaml
ref: my_pack.python
pack_ref: my_pack
name: Python
aliases: [python, python3]
description: Python runtime for my_pack

distributions:
  verification:
    always_available: false
    check_required: true
    commands:
      - binary: python3
        args: ["--version"]
        exit_code: 0
        pattern: "Python 3\\."
        priority: 1

installation: {}

execution_config:
  interpreter:
    binary: python3
    args: ["-u"]
    file_extension: ".py"
  inline_execution:
    strategy: direct
  environment:
    env_type: virtualenv
    dir_name: ".venv"
    create_command: ["python3", "-m", "venv", "--copies", "{env_dir}"]
    interpreter_path: "{env_dir}/bin/python3"
  dependencies:
    manifest_file: requirements.txt
    install_command: ["{interpreter}", "-m", "pip", "install", "-r", "{manifest_path}"]
  env_vars:
    PYTHONPATH:
      operation: prepend
      value: "{pack_dir}/lib"
      separator: ":"
```

## Version-specific entries (`versions`)

Use `versions` when you need explicit version targeting:

```yaml
versions:
  - version: "3.11"
    distributions:
      verification:
        commands:
          - binary: python3.11
            args: ["--version"]
            exit_code: 0
            pattern: "Python 3\\.11\\."
            priority: 1
    execution_config:
      interpreter:
        binary: python3.11
        args: ["-u"]
        file_extension: ".py"

  - version: "3.12"
    is_default: true
    distributions:
      verification:
        commands:
          - binary: python3.12
            args: ["--version"]
            exit_code: 0
            pattern: "Python 3\\.12\\."
            priority: 1
    execution_config:
      interpreter:
        binary: python3.12
        args: ["-u"]
        file_extension: ".py"
```

Each `versions[]` item supports:

- `version` (required)
- `execution_config` (optional; defaults to `{}`)
- `distributions` (optional; defaults to `{}`)
- `is_default` (optional; defaults to `false`)
- `meta` (optional; defaults to `{}`)

## System-managed runtime fields (do not author manually in pack YAML)

These fields exist on runtime records but are managed by Attune:

- `auto_detected`
- `detection_config`

Pack-authored runtimes are loaded with `auto_detected = false` and empty `detection_config`.

## Authoring checklist

1. Use lowercase `ref` and include `pack_ref`.
2. Add useful `aliases` for scheduler/runtime matching.
3. Add `distributions.verification` unless runtime is intentionally always available.
4. Provide `execution_config` for interpreter-managed runtimes; use `{}` only for native/direct execution.
5. Use `{env_dir}` for generated environments and dependency installs (not the pack directory), and prefer `venv --copies` for Python virtualenv create commands.
6. Add `versions[]` only when you need explicit version selection behavior.

## See also

- [Runtime Environments](/pack-development/runtime-environments/)
- [Pack Developer Guide](/pack-development/overview/)
- [Writing Actions](/pack-development/actions/)
- [Writing Sensors](/pack-development/sensors/)
