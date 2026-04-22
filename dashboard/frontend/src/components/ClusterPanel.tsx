import type { Cluster } from '../types'
import { CLUSTER_COLORS } from '../colors'

interface Props {
  clusters: Cluster[]
  selectedClusterId: number | null
  onSelect: (id: number | null) => void
}

export default function ClusterPanel({ clusters, selectedClusterId, onSelect }: Props) {
  if (clusters.length === 0) return null

  return (
    <div className="glass rounded-xl p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">Clusters</div>
      <div className="space-y-1">
        {clusters.map(c => (
          <button
            key={c.id}
            onClick={() => onSelect(selectedClusterId === c.id ? null : c.id)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-all
              ${
                selectedClusterId === c.id
                  ? 'bg-bg-hover ring-1 ring-accent/60 shadow-glow-soft'
                  : 'hover:bg-bg-elevated'
              }`}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                background: CLUSTER_COLORS[c.id % CLUSTER_COLORS.length],
                boxShadow: `0 0 8px ${CLUSTER_COLORS[c.id % CLUSTER_COLORS.length]}`,
              }}
            />
            <span className="flex-1 truncate text-fg-primary">{c.name || `Cluster ${c.id}`}</span>
            <span className="rounded-full bg-bg-elevated px-1.5 py-0.5 text-xs text-fg-muted">{c.size}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
