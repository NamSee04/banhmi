import { Search, Loader2 } from 'lucide-react'
import type { SearchResult } from '../types'
import Badge from './ui/Badge'
import Skeleton from './ui/Skeleton'
import IconButton from './ui/IconButton'
import { X } from 'lucide-react'

interface Props {
  query: string
  results: SearchResult[]
  loading: boolean
  onQueryChange: (q: string) => void
  onSearch: () => void
  onClear: () => void
  onSelectId: (id: string) => void
}

export default function SearchBar({ query, results, loading, onQueryChange, onSearch, onClear, onSelectId }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            className="w-full rounded-lg glass border-border-subtle py-2 pl-8 pr-3 text-sm text-fg-primary placeholder-fg-muted focus:border-accent focus:shadow-glow-soft focus:outline-none"
            placeholder="Search alerts semantically…"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSearch()}
          />
        </div>
        <button
          onClick={onSearch}
          disabled={!query.trim() || loading}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-dim hover:shadow-glow-soft disabled:opacity-40 transition-all"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : 'Search'}
        </button>
        {results.length > 0 && (
          <IconButton onClick={onClear} size="sm" title="Clear">
            <X size={14} />
          </IconButton>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : results.length > 0 && (
        <ul className="space-y-1.5 max-h-60 overflow-y-auto">
          {results.map((r, i) => (
            <li key={r.alert.id}>
              <button
                onClick={() => onSelectId(r.alert.id)}
                style={{ animationDelay: `${i * 40}ms` }}
                className="w-full text-left rounded-lg border border-border-subtle bg-bg-surface/50 p-2 hover:border-accent/50 transition-colors animate-slide-in"
              >
                <div className="flex items-center justify-between">
                  <Badge variant="severity" value={r.alert.severity} />
                  <span className="text-xs text-accent-soft">{(r.similarity * 100).toFixed(0)}% match</span>
                </div>
                <p className="mt-0.5 text-xs text-fg-secondary line-clamp-2">{r.alert.description}</p>
                <p className="text-xs text-fg-muted font-mono">{r.alert.host} · {r.alert.date}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
