---
title: "Writing Dashboards"
description: "Dashboards let pack developers and operators compose operational views from typed data sources and reusable visualizations."
sidebar:
  label: "Writing Dashboards"
  order: 3
---
Dashboards let pack developers and operators compose operational views from typed data sources and reusable visualizations.

## Authoring models

Attune supports two dashboard authoring paths:

1. **Pack-managed dashboards**: YAML files in `dashboards/*.yaml` inside a pack. These are loaded during pack registration/reload.
2. **Ad-hoc dashboards**: Created and edited in the web UI at `/dashboards/new` and `/dashboards/:ref/edit`, persisted by the dashboards API.

Pack-managed dashboards are edited in pack files, not through ad-hoc update/delete API paths.

## Pack layout

```text
my_pack/
  pack.yaml
  dashboards/
    operations.yaml
```

## Dashboard spec shape

Minimal shape:

```yaml
version: 1
kind: dashboard
ref: operations
label: Operations
description: Core operations overview.
scope_type: pack
scope_ref: core
visibility: public
enabled: true
is_default_home: false
spec_version: 1
defaults:
  timezone: UTC
  refresh_seconds: 15
  time_window: 24h
layout:
  columns: 12
  row_height: 44
  gap: 12
  breakpoints:
    lg:
      min_width: 1280
      columns: 12
    sm:
      min_width: 0
      columns: 4
filters:
  - id: pack_ref
    type: pack_ref
    label: Pack
    default: core
data_sources:
  execution_status:
    type: execution_status_breakdown
    params:
      pack_ref: "{{ filters.pack_ref }}"
cards:
  - id: execution_status
    title: Execution Status
    source: execution_status
    visualization:
      type: table
    position:
      lg: { x: 0, y: 0, w: 6, h: 6 }
      sm: { x: 0, y: 0, w: 4, h: 6 }
```

## Filters and source params

`data_sources.<id>.params` can reference dashboard filters via templates such as:

```yaml
pack_ref: "{{ filters.pack_ref }}"
```

Attune validates that referenced filter IDs exist. Array parameters do not support mixed template entries.

## Data sources

Use `GET /api/v1/dashboards/source-catalog` for the authoritative source contract list (availability, required/optional params, ordering, and response shape).

Current source families include:

| Family | Source types |
| --- | --- |
| Keys | `key_value` |
| Executions | `latest_action_result`, `action_result_path`, `execution_count`, `execution_timeseries`, `execution_status_breakdown`, `execution_duration_stats`, `last_execution` |
| Events | `event_count`, `event_timeseries`, `last_event` |
| Enforcements | `enforcement_count`, `enforcement_timeseries`, `last_enforcement` |
| Queues | `queue_backlog`, `queue_throughput`, `queue_dispatch_stats` |
| Inquiries | `inquiry_backlog`, `inquiry_sla` |
| Worker/Sensor health | `worker_health`, `sensor_health` |

## Visualizations

Dashboard cards support these visualization types:

| Type | Notes |
| --- | --- |
| `table` | Tabular rows with inferred/preferred columns. |
| `stat` | Single-value stat card. |
| `kpi` | Single-value KPI with level/band logic. |
| `timeseries` | Multi-series line chart. |
| `stacked_timeseries` | Stacked area chart by series. |
| `gauge` | Min/max gauge with optional custom bands. |
| `bar` | Grouped/series bar chart. |
| `heatmap` | 2D categorical heatmap. |
| `histogram` | Numeric distribution bins. |
| `funnel` | Stage conversion funnel. |
| `treemap` | Hierarchical area chart. |
| `status_matrix` | Matrix of status cells. |

Common mapping fields:

- `value_field`
- `x_field`
- `y_field`
- `series_field`
- optional `format`, `legend`, `min`, `max`, `bands`, and `mode`

## Source status and freshness behavior

Each source result returns a status and metadata:

- Statuses: `ok`, `empty`, `partial`, `stale`, `forbidden`, `invalid`, `error`
- Freshness metadata: `freshness_mode`, `aggregate_watermark`, `bucket_size`
- Shape/limits metadata: `ordering`, `truncated`, `unit_hints`

Design cards to render meaningful empty/partial/error states, not only `ok`.

## API endpoints

Key dashboard endpoints:

- `GET /api/v1/dashboards`
- `POST /api/v1/dashboards`
- `GET /api/v1/dashboards/{ref}`
- `PUT /api/v1/dashboards/{ref}`
- `DELETE /api/v1/dashboards/{ref}`
- `POST /api/v1/dashboards/{ref}/clone`
- `POST /api/v1/dashboards/{ref}/data`
- `POST /api/v1/dashboards/preview`
- `GET /api/v1/dashboards/source-catalog`

## Visibility and row-level behavior

Dashboard reads use progressive row-level disclosure:

- Evaluation order is `global dashboards read -> dashboard scope check -> dashboard visibility`.
- `public` dashboards are visible to authenticated users.
- `private` dashboards require pack-scoped or dashboard-scoped read grants.
- `restricted` dashboards require read scope for the owning pack or one of the allowlisted packs.

Dashboard access does not bypass underlying data visibility. A visible dashboard can still return source-level `forbidden`, `empty`, or partial results when the caller cannot read some linked events, executions, artifacts, or rules.

## Best practices

- Keep source params explicit and scoped (for example by `pack_ref` or `action_ref`).
- Prefer stable IDs (`filter.id`, `data_sources` keys, `card.id`) to keep diffs clean.
- Define positions for all required breakpoints (`lg`, `sm` at minimum).
- Choose visualization fields that match source ordering and numeric semantics.
- Use preview while editing to catch invalid mappings and permission-related `forbidden` sources early.

## Related

- [Pack Developer Guide](/pack-development/overview/)
- [YAML Reference](/reference/yaml/)
- [API Reference](/reference/api/)
- [Operational Visibility](/operations/visibility/)
