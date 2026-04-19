---
name: promql-query
description: Query VictoriaMetrics using PromQL. Use when the user asks about metrics, alerts, CPU, memory, disk, network, or any infrastructure monitoring data. Also use when investigating alerts or checking system health.
metadata: { "openclaw": { "requires": { "bins": ["curl"] } } }
---

# PromQL Query Skill

## Connection

- **URL:** `https://10.10.0.2:8427`
- **Auth:** Basic auth via environment variables `$VM_USER` / `$VM_PASS`
- **Type:** VictoriaMetrics (PromQL-compatible)

## Querying

Always use `-sk` flags (silent + insecure TLS) because the endpoint uses a self-signed certificate.

### Instant query

```bash
curl -sk -u "$VM_USER:$VM_PASS" \
  'https://10.10.0.2:8427/api/v1/query?query=<PROMQL>'
```

### Range query

```bash
curl -sk -u "$VM_USER:$VM_PASS" \
  'https://10.10.0.2:8427/api/v1/query_range?query=<PROMQL>&start=<START>&end=<END>&step=<STEP>'
```

- `start` / `end` — RFC3339 or Unix timestamp
- `step` — e.g. `15s`, `1m`, `5m`

### List all metric names

```bash
curl -sk -u "$VM_USER:$VM_PASS" \
  'https://10.10.0.2:8427/api/v1/label/__name__/values'
```

### List label values

```bash
curl -sk -u "$VM_USER:$VM_PASS" \
  'https://10.10.0.2:8427/api/v1/label/<label_name>/values'
```

### Check firing alerts

```bash
curl -sk -u "$VM_USER:$VM_PASS" \
  'https://10.10.0.2:8427/api/v1/query?query=ALERTS{alertstate="firing"}'
```

## Common Queries

| What | PromQL |
|------|--------|
| CPU load (1m) | `node_load1` |
| CPU usage % | `100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)` |
| Memory available | `node_memory_MemAvailable_bytes` |
| Memory used % | `100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)` |
| Disk available | `node_filesystem_avail_bytes{fstype!~"tmpfs|swap"}` |
| Disk used % | `100 * (1 - node_filesystem_avail_bytes{fstype!~"tmpfs|swap"} / node_filesystem_size_bytes{fstype!~"tmpfs|swap"})` |
| Network in (bytes/s) | `rate(node_network_receive_bytes_total{device=~"eth.*"}[5m])` |
| Network out (bytes/s) | `rate(node_network_transmit_bytes_total{device=~"eth.*"}[5m])` |
| Firing alerts | `ALERTS{alertstate="firing"}` |

## Alert Rule Expressions

These are the PromQL expressions from the active NodeExporter alert rules. Use them to check the same conditions the alerting system monitors.

| Alert | Severity | PromQL |
|-------|----------|--------|
| HostDown | critical | `up{job="node"} == 0` |
| HostOutOfMemory | warning | `node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes < .20` |
| HostUnusualNetworkThroughputIn | warning | `(rate(node_network_receive_bytes_total[5m]) / on(instance, device) node_network_speed_bytes) > .80` |
| HostUnusualNetworkThroughputOut | warning | `(rate(node_network_transmit_bytes_total[5m]) / on(instance, device) node_network_speed_bytes) > .80` |
| HostOutOfDiskSpace | critical | `node_filesystem_avail_bytes{fstype!~"^(fuse.*\|tmpfs\|cifs\|nfs)"} / node_filesystem_size_bytes < .10 and on (instance, device, mountpoint) node_filesystem_readonly == 0` |
| HostDiskMayFillIn24Hours | warning | `predict_linear(node_filesystem_avail_bytes{fstype!~"^(fuse.*\|tmpfs\|cifs\|nfs)"}[6h], 86400) <= 0 and node_filesystem_avail_bytes > 0` |
| HostOutOfInodes | critical | `node_filesystem_files_free / node_filesystem_files < .10 and on (instance, device, mountpoint) node_filesystem_readonly == 0` |
| HostFilesystemDeviceError | critical | `node_filesystem_device_error{fstype!~"^(fuse.*\|tmpfs\|cifs\|nfs)"} == 1` |
| HostHighCpuLoad | warning | `1 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))) > .80` |
| HostSystemdServiceCrashed | warning | `node_systemd_unit_state{state="failed"} == 1` |
| HostOomKillDetected | warning | `increase(node_vmstat_oom_kill[1m]) > 0` |
| HostClockSkew | warning | `node_timex_offset_seconds > 0.05 or node_timex_offset_seconds < -0.05` |
| HostConntrackTableFull | critical | `node_nf_conntrack_entries / node_nf_conntrack_entries_limit > 0.8` |

## VictoriaMetrics Extensions

VictoriaMetrics supports MetricsQL which extends PromQL with additional functions:

- `rollup()` — aggregate over time window
- `range_default()` — default range vector functions
- `keep_last_value()` — fill gaps in time series
- `label_set()` — add/replace labels on the fly

See [{baseDir}/references/vm-extensions.md]({baseDir}/references/vm-extensions.md) for the full list.
