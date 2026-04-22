import { useState, useEffect, useCallback } from 'react'
import type { Graph, DaySummary, GraphNode, SearchResult } from './types'
import { fetchGraph, fetchSummary, fetchSimilar, search } from './api'

import AlertGraph from './components/AlertGraph'
import AlertDetail from './components/AlertDetail'
import SummaryPanels from './components/SummaryPanels'
import ClusterPanel from './components/ClusterPanel'
import SearchBar from './components/SearchBar'
import ChatPanel from './components/ChatPanel'
import { RefreshCw } from 'lucide-react'
import IconButton from './components/ui/IconButton'
import Skeleton from './components/ui/Skeleton'

const DATE_OPTIONS = [
  { label: 'All days', value: '' },
  { label: '04/17/2026', value: '04172026' },
  { label: '04/18/2026', value: '04182026' },
]

type ColorBy = 'severity' | 'cluster'
type Tab = 'graph' | 'summary' | 'chat'

export default function App() {
  const [date, setDate] = useState('')
  const [threshold, setThreshold] = useState(0.75)
  const [colorBy, setColorBy] = useState<ColorBy>('severity')
  const [tab, setTab] = useState<Tab>('graph')

  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [], clusters: [] })
  const [summary, setSummary] = useState<DaySummary | null>(null)
  const [loadingGraph, setLoadingGraph] = useState(false)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [similar, setSimilar] = useState<SearchResult[]>([])
  const [loadingSimilar, setLoadingSimilar] = useState(false)

  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null)
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set())

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)

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

  useEffect(() => { loadGraph() }, [loadGraph])
  useEffect(() => { loadSummary() }, [loadSummary])

  // When selectedId changes, find the node and load similar
  useEffect(() => {
    if (!selectedId) {
      setSelectedNode(null)
      setSimilar([])
      return
    }
    const node = graph.nodes.find(n => n.id === selectedId) ?? null
    setSelectedNode(node)
    if (!node) return

    setLoadingSimilar(true)
    fetchSimilar(selectedId, 5)
      .then(setSimilar)
      .catch(() => setSimilar([]))
      .finally(() => setLoadingSimilar(false))
  }, [selectedId, graph.nodes])

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

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return
    setLoadingSearch(true)
    try {
      const results = await search(searchQuery, date, 8)
      setSearchResults(results)
    } catch {
      setSearchResults([])
    } finally {
      setLoadingSearch(false)
    }
  }, [searchQuery, date])

  const handleSelectId = useCallback((id: string | null) => {
    setSelectedId(id)
    setSelectedClusterId(null)
  }, [])

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

          {/* Color by */}
          <div className="flex rounded-lg border border-border-subtle overflow-hidden text-xs">
            {(['severity', 'cluster'] as ColorBy[]).map(v => (
              <button
                key={v}
                onClick={() => setColorBy(v)}
                className={`px-2 py-1 capitalize transition-colors ${colorBy === v ? 'bg-accent text-white shadow-glow-soft' : 'bg-bg-elevated text-fg-secondary hover:bg-bg-hover hover:text-fg-primary'}`}
              >
                {v}
              </button>
            ))}
          </div>

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
                colorBy={colorBy}
              />
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

              <ClusterPanel
                clusters={graph.clusters}
                selectedClusterId={selectedClusterId}
                onSelect={id => {
                  setSelectedClusterId(id)
                  setSelectedId(null)
                  setSearchResults([])
                }}
              />

              {selectedNode && (
                <AlertDetail
                  node={selectedNode}
                  similar={similar}
                  loading={loadingSimilar}
                  onClose={() => setSelectedId(null)}
                  onSelectId={handleSelectId}
                />
              )}
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
              <SummaryPanels summary={summary} />
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
