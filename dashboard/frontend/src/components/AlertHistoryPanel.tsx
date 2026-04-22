import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Search, X, ChevronDown, ChevronRight } from 'lucide-react'
import type { Alert } from '../types'
import { SEVERITY_COLORS, SEVERITY_BG, STATUS_BG } from '../colors'
import IconButton from './ui/IconButton'
import Skeleton from './ui/Skeleton'

type SevFilter = 'all' | Alert['severity']
type StatusFilter = 'all' | Alert['status']
type SortBy = 'newest' | 'oldest' | 'severity' | 'host'

const SEV_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 }
const SORT_OPTIONS: SortBy[] = ['newest', 'oldest', 'severity', 'host']
const SORT_LABELS: Record<SortBy, string> = { newest: 'Newest', oldest: 'Oldest', severity: 'Severity', host: 'Host' }

function shortTime(time: string): string {
  const m = /(\d{2}):(\d{2})/.exec(time)
  return m ? `${m[1]}:${m[2]}` : '—'
}

function formatDate(d: string): string {
  return d.length === 8 ? `${d.slice(0, 2)}/${d.slice(2, 4)}` : d
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-accent/20 text-fg-primary rounded px-0.5 not-italic">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  )
}

interface TooltipState { x: number; y: number; alert: Alert }

interface Props {
  alerts: Alert[]
  total: number
  loading: boolean
  filter: string
  onFilterChange: (s: string) => void
  selectedId: string | null
  onSelectId: (id: string | null) => void
  showDate?: boolean
}

export default function AlertHistoryPanel({
  alerts,
  total,
  loading,
  filter,
  onFilterChange,
  selectedId,
  onSelectId,
  showDate,
}: Props) {
  const [open, setOpen] = useState(true)
  const [sevFilter, setSevFilter] = useState<SevFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('newest')
  const [focusIdx, setFocusIdx] = useState(0)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Sort + chip filter
  const shown = useMemo(() => {
    const list = [...alerts]
    if (sortBy === 'newest') list.sort((a, b) => b.time.localeCompare(a.time))
    else if (sortBy === 'oldest') list.sort((a, b) => a.time.localeCompare(b.time))
    else if (sortBy === 'severity') list.sort((a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3))
    else if (sortBy === 'host') list.sort((a, b) => a.host.localeCompare(b.host))
    return list.filter(a =>
      (sevFilter === 'all' || a.severity === sevFilter) &&
      (statusFilter === 'all' || a.status === statusFilter)
    )
  }, [alerts, sortBy, sevFilter, statusFilter])

  // Chip counts from text-filtered `alerts`
  const counts = useMemo(() => {
    const sev = { critical: 0, warning: 0, info: 0 }
    const st = { firing: 0, resolved: 0 }
    alerts.forEach(a => {
      if (a.severity in sev) sev[a.severity as keyof typeof sev]++
      if (a.status in st) st[a.status as keyof typeof st]++
    })
    return { sev, st }
  }, [alerts])

  useEffect(() => { setFocusIdx(0) }, [shown.length])

  useEffect(() => {
    rowRefs.current[focusIdx]?.scrollIntoView({ block: 'nearest' })
  }, [focusIdx])

  const anyChipActive = sevFilter !== 'all' || statusFilter !== 'all'
  const isFiltered = filter.trim() !== '' || anyChipActive
  const countLabel = isFiltered ? `${shown.length} / ${total}` : total

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.target === inputRef.current) {
      if (e.key === 'Escape') { onFilterChange(''); inputRef.current?.blur() }
      return
    }
    if (e.key === '/') { e.preventDefault(); inputRef.current?.focus(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, shown.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Home') { e.preventDefault(); setFocusIdx(0); return }
    if (e.key === 'End') { e.preventDefault(); setFocusIdx(Math.max(0, shown.length - 1)); return }
    if (e.key === 'Enter' && shown[focusIdx]) { onSelectId(shown[focusIdx].id); return }
  }, [shown, focusIdx, onFilterChange, onSelectId])

  function handleMouseEnter(e: React.MouseEvent, alert: Alert) {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
    const { clientX: x, clientY: y } = e
    tooltipTimer.current = setTimeout(() => setTooltip({ x, y, alert }), 150)
  }

  function handleMouseLeave() {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
    setTooltip(null)
  }

  const q = filter.trim().toLowerCase()

  return (
    <div
      className="glass rounded-xl flex flex-col min-h-0 flex-1 h-full focus-visible:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseLeave={handleMouseLeave}
    >
      {/* Sticky header */}
      <div className="sticky top-0 z-10 rounded-t-xl bg-bg-deep/90 backdrop-blur px-3 pt-3 pb-2 shrink-0">
        {/* Row 1: chevron + label + count + sort + clear */}
        <div className="flex items-center gap-1.5 mb-2">
          <button
            onClick={() => setOpen(o => !o)}
            className="flex flex-1 items-center gap-1 text-xs font-semibold uppercase tracking-wider text-fg-muted hover:text-fg-primary transition-colors"
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Alerts
            <span className="ml-1 rounded-full bg-bg-elevated px-1.5 py-0.5 text-xs text-fg-muted font-normal normal-case tracking-normal">
              {countLabel}
            </span>
          </button>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            title="Sort"
            className="rounded border border-border-subtle bg-bg-elevated px-1.5 py-0.5 text-xs text-fg-muted focus:outline-none focus:border-accent"
          >
            {SORT_OPTIONS.map(s => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
          </select>
          {isFiltered && (
            <IconButton size="sm" title="Clear all filters" onClick={() => { onFilterChange(''); setSevFilter('all'); setStatusFilter('all') }}>
              <X size={12} />
            </IconButton>
          )}
        </div>

        {open && (
          <>
            {/* Row 2: severity chips + status chips */}
            <div className="flex items-center gap-1 flex-wrap mb-2">
              {(['all', 'critical', 'warning', 'info'] as SevFilter[]).map(s => (
                <button
                  key={s}
                  aria-pressed={sevFilter === s}
                  onClick={() => setSevFilter(s)}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors ${
                    sevFilter === s
                      ? s === 'all' ? 'bg-bg-hover text-fg-primary ring-1 ring-accent/40' : SEVERITY_BG[s]
                      : 'bg-bg-elevated text-fg-muted hover:text-fg-primary'
                  }`}
                >
                  {s !== 'all' && (
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: SEVERITY_COLORS[s] }} />
                  )}
                  {s === 'all' ? 'all' : `${s.slice(0, 4)} ${counts.sev[s as keyof typeof counts.sev]}`}
                </button>
              ))}
              <div className="ml-auto flex gap-1 shrink-0">
                {(['all', 'firing', 'resolved'] as StatusFilter[]).map(s => (
                  <button
                    key={s}
                    aria-pressed={statusFilter === s}
                    onClick={() => setStatusFilter(s)}
                    className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                      statusFilter === s
                        ? s === 'all' ? 'bg-bg-hover text-fg-primary ring-1 ring-accent/40' : STATUS_BG[s]
                        : 'bg-bg-elevated text-fg-muted hover:text-fg-primary'
                    }`}
                  >
                    {s === 'all' ? '·' : s === 'firing' ? `🔥 ${counts.st.firing}` : `✓ ${counts.st.resolved}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Text filter */}
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
              <input
                ref={inputRef}
                className="w-full rounded-lg glass border-border-subtle py-1.5 pl-7 pr-3 text-xs text-fg-primary placeholder-fg-muted focus:border-accent focus:outline-none"
                placeholder="Filter host / description… ( / )"
                value={filter}
                onChange={e => onFilterChange(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      {/* Scrollable list */}
      {open && (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
          {loading ? (
            <div className="space-y-2 pt-1">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : total === 0 ? (
            <p className="text-xs text-fg-muted text-center py-4">No alerts</p>
          ) : alerts.length === 0 ? (
            <div className="text-center py-4 space-y-1">
              <p className="text-xs text-fg-muted">No text match</p>
              <button onClick={() => onFilterChange('')} className="text-xs text-accent hover:underline">Clear filter</button>
            </div>
          ) : shown.length === 0 ? (
            <div className="text-center py-4 space-y-1">
              <p className="text-xs text-fg-muted">No match</p>
              <button onClick={() => { setSevFilter('all'); setStatusFilter('all') }} className="text-xs text-accent hover:underline">Reset filters</button>
            </div>
          ) : (
            <ul role="listbox" className="space-y-0.5 pt-1">
              {shown.map((alert, idx) => {
                const color = SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS.info
                const isSelected = alert.id === selectedId
                const isFocused = idx === focusIdx
                return (
                  <li key={alert.id}>
                    <button
                      ref={el => { rowRefs.current[idx] = el }}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => { onSelectId(isSelected ? null : alert.id); setFocusIdx(idx) }}
                      onMouseEnter={e => handleMouseEnter(e, alert)}
                      onMouseLeave={handleMouseLeave}
                      className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-all border-l-2 ${
                        isSelected
                          ? 'bg-bg-hover border-accent shadow-glow-soft'
                          : isFocused
                          ? 'border-accent/50 bg-bg-elevated/60 outline outline-1 outline-accent/40 outline-offset-[-1px]'
                          : 'border-transparent hover:bg-bg-elevated'
                      }`}
                    >
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rounded-full"
                        title={alert.severity}
                        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-xs text-fg-muted shrink-0">{shortTime(alert.time)}</span>
                          {showDate && alert.date && (
                            <span className="shrink-0 rounded bg-bg-elevated px-1 text-[10px] text-fg-muted">{formatDate(alert.date)}</span>
                          )}
                          <span className="truncate text-xs font-medium text-fg-primary">{highlight(alert.host, q)}</span>
                          {alert.status === 'resolved' && (
                            <span className="shrink-0 text-xs text-blue-400/70">resolved</span>
                          )}
                        </span>
                        <span className={`mt-0.5 block text-xs leading-snug line-clamp-2 ${
                          alert.status === 'resolved' ? 'text-fg-muted line-through decoration-fg-muted/40' : 'text-fg-secondary'
                        }`}>
                          {highlight(alert.description, q)}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* Hover tooltip */}
      {tooltip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed glass-elevated rounded-lg p-2 text-xs max-w-56 z-50"
          style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
        >
          <p className="text-fg-primary font-medium line-clamp-3 leading-snug">{tooltip.alert.description}</p>
          <p className="text-fg-muted mt-0.5">{tooltip.alert.source}</p>
          {tooltip.alert.value && <p className="text-fg-muted">{tooltip.alert.value}</p>}
          <p className="text-fg-muted font-mono">{tooltip.alert.time}</p>
        </div>
      )}
    </div>
  )
}
