import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { Alert, Graph, DaySummary, GraphNode, SearchResult, HistoryEntry } from './types'
import { fetchGraph, fetchSummary, fetchSimilar, fetchAlerts, search } from './api'

import AlertGraph from './components/AlertGraph'
import AlertDetail from './components/AlertDetail'
import SummaryPanels from './components/SummaryPanels'
import ClusterPanel from './components/ClusterPanel'
import SearchBar from './components/SearchBar'
import ChatPanel from './components/ChatPanel'
import HistoryPanel from './components/HistoryPanel'
import AlertHistoryPanel from './components/AlertHistoryPanel'
import { useHistory } from './useHistory'
import { RefreshCw } from 'lucide-react'
import IconButton from './components/ui/IconButton'
import Skeleton from './components/ui/Skeleton'

const DATE_OPTIONS = [
  { label: 'All days', value: '' },
  { label: '04/17/2026', value: '04172026' },
  { label: '04/18/2026', value: '04182026' },
  { label: '04/20/2026', value: '04202026' },
]

type Tab = 'graph' | 'summary' | 'chat'

export default function App() {
  const [date, setDate] = useState('')
  const [threshold, setThreshold] = useState(0.75)
  const [tab, setTab] = useState<Tab>('graph')

  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [], clusters: [] })
  const [summary, setSummary] = useState<DaySummary | null>(null)
  const [loadingGraph, setLoadingGraph] = useState(false)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [similar, setSimilar] = useState<SearchResult[]>([])
  const [loadingSimilar, setLoadingSimilar] = useState(false)

  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null)
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set())

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)

  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loadingAlerts, setLoadingAlerts] = useState(false)
  const [alertFilter, setAlertFilter] = useState('')

  const loadGraph = useCallback(async () => {
    setLoadingGraph(true)
    setError(null)
    try {
      const g = await fetchGraph(date, threshold)
      setGraph(g)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingGraph(false)
    }
  }, [date, threshold])

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true)
    try {
      const s = await fetchSummary(date)
      setSummary(s)
    } catch {
      // non-fatal
    } finally {
      setLoadingSummary(false)
    }
  }, [date])

  const loadAlerts = useCallback(async () => {
    setLoadingAlerts(true)
    try { setAlerts(await fetchAlerts(date)) }
    catch { setAlerts([]) }
    finally { setLoadingAlerts(false) }
  }, [date])

  useEffect(() => { loadGraph() }, [loadGraph])
  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { loadAlerts() }, [loadAlerts])

  const filteredAlerts = useMemo(() => {
    const q = alertFilter.trim().toLowerCase()
    if (!q) return alerts
    return alerts.filter(a =>
      a.description.toLowerCase().includes(q) ||
      a.host.toLowerCase().includes(q) ||
      a.source.toLowerCase().includes(q) ||
      a.severity.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q)
    )
  }, [alerts, alertFilter])

  // When selectedId changes, resolve alert + graph node, load similar
  useEffect(() => {
    if (!selectedId) {
      setSelectedAlert(null)
      setSelectedNode(null)
      setSimilar([])
      return
    }
    const alert = alerts.find(a => a.id === selectedId) ?? null
    setSelectedAlert(alert)
    const node = graph.nodes.find(n => n.id === selectedId) ?? null
    setSelectedNode(node)

    setLoadingSimilar(true)
    fetchSimilar(selectedId, 5)
      .then(setSimilar)
      .catch(() => setSimilar([]))
      .finally(() => setLoadingSimilar(false))
  }, [selectedId, alerts, graph.nodes])

  // Cluster highlight
  useEffect(() => {
    const empty = selectedClusterId === null && searchResults.length === 0
    if (empty) {
      setHighlightIds(prev => (prev.size === 0 ? prev : new Set()))
      return
    }
    const ids = new Set<string>()
    if (selectedClusterId !== null) {
      graph.clusters.find(c => c.id === selectedClusterId)?.members.forEach(id => ids.add(id))
    }
    searchResults.forEach(r => ids.add(r.alert.id))
    setHighlightIds(ids)
  }, [selectedClusterId, searchResults, graph.clusters])

  const { history, push, clear: clearHistory, remove: removeHistory } = useHistory()
  const pendingSelectIdRef = useRef<string | null>(null)

  const executeSearch = useCallback(async (query: string, dateVal: string) => {
    if (!query.trim()) return
    setLoadingSearch(true)
    try {
      const results = await search(query, dateVal, 8)
      setSearchResults(results)
      push({ kind: 'search', id: crypto.randomUUID(), query, date: dateVal, ts: Date.now(), resultCount: results.length })
    } catch {
      setSearchResults([])
    } finally {
      setLoadingSearch(false)
    }
  }, [push])

  const handleSearch = useCallback(() => {
    executeSearch(searchQuery, date)
  }, [searchQuery, date, executeSearch])

  const handleReplaySearch = useCallback((entry: Extract<HistoryEntry, { kind: 'search' }>) => {
    setSearchQuery(entry.query)
    setDate(entry.date)
    executeSearch(entry.query, entry.date)
  }, [executeSearch])

  const handleSelectId = useCallback((id: string | null) => {
    setSelectedId(id)
    setSelectedClusterId(null)
    if (id) {
      const node = graph.nodes.find(n => n.id === id)
      if (node) {
        push({ kind: 'select', id: crypto.randomUUID(), nodeId: id, description: node.description, host: node.host, date: node.date, ts: Date.now() })
      }
    }
  }, [graph.nodes, push])

  const handleReplaySelect = useCallback((entry: Extract<HistoryEntry, { kind: 'select' }>) => {
    const node = graph.nodes.find(n => n.id === entry.nodeId)
    if (node) {
      setSelectedId(entry.nodeId)
      setSelectedClusterId(null)
    } else {
      pendingSelectIdRef.current = entry.nodeId
      setDate(entry.date)
    }
  }, [graph.nodes])

  // Pending select: fires after graph reloads for cross-date replay
  useEffect(() => {
    if (!pendingSelectIdRef.current) return
    const node = graph.nodes.find(n => n.id === pendingSelectIdRef.current)
    if (node) {
      setSelectedId(pendingSelectIdRef.current)
      setSelectedClusterId(null)
      pendingSelectIdRef.current = null
    }
  }, [graph.nodes])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Toolbar */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border-subtle glass px-4 py-2">
        <h1 className="text-sm font-semibold text-gradient-accent tracking-[0.14em] shrink-0">JARVIAS</h1>

        <div className="flex flex-1 items-center gap-2 flex-wrap">
          {/* Date */}
          <select
            value={date}
            onChange={e => setDate(e.target.value)}
            className="rounded-lg border border-border-subtle bg-bg-elevated px-2 py-1 text-xs text-fg-primary focus:outline-none focus:border-accent"
          >
            {DATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {/* Threshold */}
          <label className="flex items-center gap-1.5 text-xs text-fg-secondary">
            Threshold
            <input
              type="range" min={0.5} max={0.99} step={0.01}
              value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              className="w-20 accent-[#7c3aed]"
            />
            <span className="w-6 text-fg-primary">{threshold.toFixed(2)}</span>
          </label>

          {/* Tab */}
          <div className="flex rounded-lg border border-border-subtle overflow-hidden text-xs ml-auto">
            {(['graph', 'summary', 'chat'] as Tab[]).map(v => (
              <button
                key={v}
                onClick={() => setTab(v)}
                className={`px-3 py-1 capitalize transition-colors ${tab === v ? 'bg-accent text-white shadow-glow-soft' : 'bg-bg-elevated text-fg-secondary hover:bg-bg-hover hover:text-fg-primary'}`}
              >
                {v}
              </button>
            ))}
          </div>

          <IconButton onClick={loadGraph} disabled={loadingGraph} title="Refresh" size="sm">
            <RefreshCw size={13} className={loadingGraph ? 'animate-spin' : ''} />
          </IconButton>
        </div>
      </header>

      {error && (
        <div className="shrink-0 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {tab === 'graph' ? (
          <>
            {/* Left sidebar */}
            <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-r border-border-subtle bg-bg-deep p-3 animate-fade-in">
              <AlertHistoryPanel
                alerts={filteredAlerts}
                total={alerts.length}
                loading={loadingAlerts}
                filter={alertFilter}
                onFilterChange={setAlertFilter}
                selectedId={selectedId}
                onSelectId={handleSelectId}
                showDate={!date}
              />
            </aside>

            {/* Graph canvas */}
            <div className="relative flex-1 overflow-hidden">
              {loadingGraph && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-bg-void/70">
                  <Skeleton className="h-3 w-48" />
                  <Skeleton className="h-3 w-36" />
                  <Skeleton className="h-3 w-52" />
                </div>
              )}
              <AlertGraph
                graph={graph}
                selectedId={selectedId}
                highlightIds={highlightIds}
                onSelectNode={handleSelectId}
                colorBy="severity"
              />

              {/* Floating alert card */}
              {selectedAlert && (
                <div className="absolute bottom-16 right-4 w-80 z-20 pointer-events-auto animate-slide-in">
                  <AlertDetail
                    alert={selectedAlert}
                    graphNode={selectedNode}
                    similar={similar}
                    loading={loadingSimilar}
                    onClose={() => setSelectedId(null)}
                    onSelectId={handleSelectId}
                  />
                </div>
              )}
            </div>

            {/* Right sidebar */}
            <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border-subtle bg-bg-deep p-3 animate-fade-in">
              <SearchBar
                query={searchQuery}
                results={searchResults}
                loading={loadingSearch}
                onQueryChange={setSearchQuery}
                onSearch={handleSearch}
                onClear={() => { setSearchResults([]); setHighlightIds(new Set()) }}
                onSelectId={handleSelectId}
              />

              <HistoryPanel
                history={history}
                onReplaySearch={handleReplaySearch}
                onReplaySelect={handleReplaySelect}
                onRemove={removeHistory}
                onClear={clearHistory}
              />

              <ClusterPanel
                clusters={graph.clusters}
                selectedClusterId={selectedClusterId}
                onSelect={id => {
                  setSelectedClusterId(id)
                  setSelectedId(null)
                  setSearchResults([])
                }}
              />
            </aside>
          </>
        ) : tab === 'chat' ? (
          <ChatPanel
            date={date}
            onSelectId={handleSelectId}
            onJumpToGraph={() => setTab('graph')}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            {loadingSummary ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : summary ? (
              <SummaryPanels summary={summary} date={date} />
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
