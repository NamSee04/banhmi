import { useState, useMemo } from 'react'
import { Search, MapPin, X, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import type { HistoryEntry } from '../types'
import IconButton from './ui/IconButton'

type SearchEntry = Extract<HistoryEntry, { kind: 'search' }>
type SelectEntry = Extract<HistoryEntry, { kind: 'select' }>

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

interface Props {
  history: HistoryEntry[]
  onReplaySearch: (entry: SearchEntry) => void
  onReplaySelect: (entry: SelectEntry) => void
  onRemove: (id: string) => void
  onClear: () => void
}

export default function HistoryPanel({ history, onReplaySearch, onReplaySelect, onRemove, onClear }: Props) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')

  const filtered = useMemo(() => {
    if (!filter.trim()) return history
    const f = filter.toLowerCase()
    return history.filter(e => {
      if (e.kind === 'search') return e.query.toLowerCase().includes(f)
      return e.description.toLowerCase().includes(f) || e.host.toLowerCase().includes(f)
    })
  }, [history, filter])

  return (
    <div className="glass rounded-xl p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex flex-1 items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fg-muted hover:text-fg-primary transition-colors"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          History
          <span className="ml-1 rounded-full bg-bg-elevated px-1.5 py-0.5 text-xs text-fg-muted font-normal normal-case tracking-normal">
            {history.length}
          </span>
        </button>
        {history.length > 0 && (
          <IconButton
            size="sm"
            title="Clear history"
            onClick={() => { if (confirm('Clear all history?')) onClear() }}
          >
            <Trash2 size={12} />
          </IconButton>
        )}
      </div>

      {open && (
        <>
          {/* Filter input */}
          <div className="relative mb-2">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              className="w-full rounded-lg glass border-border-subtle py-1.5 pl-7 pr-3 text-xs text-fg-primary placeholder-fg-muted focus:border-accent focus:outline-none"
              placeholder="Filter history…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>

          {filtered.length === 0 ? (
            <p className="text-xs text-fg-muted text-center py-2">
              {history.length === 0 ? 'No history yet' : 'No matches'}
            </p>
          ) : (
            <ul className="space-y-1 max-h-52 overflow-y-auto">
              {filtered.map(entry => (
                <li key={entry.id} className="group flex items-start gap-1">
                  <button
                    onClick={() =>
                      entry.kind === 'search'
                        ? onReplaySearch(entry as SearchEntry)
                        : onReplaySelect(entry as SelectEntry)
                    }
                    className="flex flex-1 min-w-0 items-start gap-1.5 rounded-lg px-2 py-1.5 text-left hover:bg-bg-elevated transition-colors"
                  >
                    {entry.kind === 'search'
                      ? <Search size={11} className="mt-0.5 shrink-0 text-accent" />
                      : <MapPin size={11} className="mt-0.5 shrink-0 text-fg-secondary" />
                    }
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-xs text-fg-primary">
                        {entry.kind === 'search' ? `"${entry.query}"` : entry.description}
                      </span>
                      <span className="text-xs text-fg-muted">
                        {entry.kind === 'search'
                          ? `${entry.resultCount} hits · ${formatRelative(entry.ts)}`
                          : `${entry.host} · ${formatRelative(entry.ts)}`
                        }
                      </span>
                    </span>
                  </button>
                  <IconButton
                    size="sm"
                    title="Remove"
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                    onClick={() => onRemove(entry.id)}
                  >
                    <X size={11} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
