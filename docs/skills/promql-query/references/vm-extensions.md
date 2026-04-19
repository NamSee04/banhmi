# VictoriaMetrics MetricsQL Extensions

VictoriaMetrics implements MetricsQL — a superset of PromQL. All standard PromQL works as-is. These are the additional functions available.

## Rollup Functions

| Function | Description |
|----------|-------------|
| `rollup(series[d])` | Returns min, max, avg for each time series over the lookbehind window `d` |
| `rollup_rate(series[d])` | Returns per-second rate calculated over the lookbehind window |
| `rollup_deriv(series[d])` | Returns per-second derivative over the lookbehind window |
| `rollup_increase(series[d])` | Returns increase over the lookbehind window, handling counter resets |
| `rollup_candlestick(series[d])` | Returns open, high, low, close over the lookbehind window |

## Transform Functions

| Function | Description |
|----------|-------------|
| `keep_last_value(series)` | Fills gaps with the last known value |
| `default(series, value)` | Replaces NaN/missing with `value` |
| `range_default(series, value)` | Like `default` but for range vectors |
| `label_set(series, "label", "value", ...)` | Adds or replaces labels |
| `label_del(series, "label", ...)` | Removes labels |
| `label_copy(series, "src", "dst")` | Copies label value from `src` to `dst` |
| `label_move(series, "src", "dst")` | Moves label value from `src` to `dst` |
| `label_join(series, "dst", "sep", "src1", "src2", ...)` | Joins label values into `dst` |
| `label_replace(series, "dst", "replacement", "src", "regex")` | Regex-based label replacement |
| `label_match(series, "label", "regexp")` | Filters series by label regexp |
| `label_mismatch(series, "label", "regexp")` | Inverse of `label_match` |
| `label_uppercase(series, "label")` | Uppercases label value |
| `label_lowercase(series, "label")` | Lowercases label value |

## Aggregate Functions

| Function | Description |
|----------|-------------|
| `median(series)` | Returns the median across series |
| `mad(series)` | Median absolute deviation |
| `outliers_iqr(series)` | Returns outlier series using IQR method |
| `limit_offset(limit, offset, series)` | Pagination for series |

## Useful Extras

| Function | Description |
|----------|-------------|
| `union(series1, series2, ...)` | Merges multiple series into one result |
| `ru(free, limit)` | Resource utilisation: `(1 - free/limit) * 100` |
| `ttf(free)` | Time to finish: predicts when free resource reaches zero |
| `now()` | Current Unix timestamp |

## Reference

Full MetricsQL documentation: <https://docs.victoriametrics.com/metricsql/>
