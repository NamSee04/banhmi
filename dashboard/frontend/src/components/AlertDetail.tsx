import type { GraphNode, SearchResult } from '../types'
import { CLUSTER_COLORS } from '../colors'
import { X } from 'lucide-react'
import Badge from './ui/Badge'
import Skeleton from './ui/Skeleton'
import IconButton from './ui/IconButton'

interface Props {
  node: GraphNode
  similar: SearchResult[]
  loading: boolean
  onClose: () => void
  onSelectId: (id: string) => void
}

export default function AlertDetail({ node, similar, loading, onClose, onSelectId }: Props) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl glass animate-slide-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-3 border-b border-border-subtle">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="severity" value={node.severity} pulse={node.severity === 'critical'} />
          <Badge variant="status" value={node.status} />
        </div>
        <IconButton size="sm" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
        <p className="text-fg-primary font-medium leading-snug">{node.description}</p>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <Dt>Source</Dt><dd className="text-fg-secondary truncate">{node.source || '—'}</dd>
          <Dt>Host</Dt><dd className="text-fg-secondary font-mono truncate">{node.host || '—'}</dd>
          {node.value && <><Dt>Value</Dt><dd className="text-fg-secondary">{node.value}</dd></>}
          <Dt>Time</Dt><dd className="text-fg-secondary">{node.time || '—'}</dd>
          <Dt>Cluster</Dt>
          <dd>
            <span className="inline-flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{
                  background: CLUSTER_COLORS[node.clusterId % CLUSTER_COLORS.length],
                  boxShadow: `0 0 6px ${CLUSTER_COLORS[node.clusterId % CLUSTER_COLORS.length]}`,
                }}
              />
              <span className="text-fg-secondary">{node.clusterName || `Cluster ${node.clusterId}`}</span>
            </span>
          </dd>
        </dl>

        {/* Similar alerts */}
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-fg-muted">
            Similar alerts
          </div>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : similar.length === 0 ? (
            <p className="text-xs text-fg-muted">No similar alerts found.</p>
          ) : (
            <ul className="space-y-1.5">
              {similar.map((r, i) => (
                <li key={r.alert.id}>
                  <button
                    onClick={() => onSelectId(r.alert.id)}
                    style={{ animationDelay: `${i * 40}ms` }}
                    className="w-full text-left rounded-lg border border-border-subtle bg-bg-surface/50 p-2 hover:border-accent/50 transition-colors animate-slide-in"
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex gap-1">
                        <Badge variant="severity" value={r.alert.severity} />
                      </div>
                      <span className="text-xs text-accent-soft">{(r.similarity * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-xs text-fg-secondary line-clamp-2">{r.alert.description}</p>
                    <p className="text-xs text-fg-muted mt-0.5 font-mono">{r.alert.host}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="text-fg-muted whitespace-nowrap">{children}</dt>
}
