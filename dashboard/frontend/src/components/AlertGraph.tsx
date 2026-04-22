import { useRef, useEffect, useState, useCallback } from 'react'
import MultiGraph from 'graphology'
import Sigma from 'sigma'
import { EdgeCurvedArrowProgram } from '@sigma/edge-curve'
import FA2LayoutSupervisor from 'graphology-layout-forceatlas2/worker'
import noverlap from 'graphology-layout-noverlap'
import type { Graph, GraphNode } from '../types'
import { SEVERITY_COLORS, CLUSTER_COLORS } from '../colors'
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Play, Pause } from 'lucide-react'
import IconButton from './ui/IconButton'

interface Props {
  graph: Graph
  selectedId: string | null
  highlightIds: Set<string>
  onSelectNode: (id: string | null) => void
  colorBy: 'severity' | 'cluster'
}

interface TooltipState {
  x: number
  y: number
  node: GraphNode
}

interface HaloState {
  x: number
  y: number
}

export default function AlertGraph({ graph, selectedId, highlightIds, onSelectNode, colorBy }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma | null>(null)
  const layoutRef = useRef<FA2LayoutSupervisor | null>(null)
  const graphRef = useRef<MultiGraph | null>(null)
  const [playing, setPlaying] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [halo, setHalo] = useState<HaloState | null>(null)

  // Live refs — read inside sigma event handlers / reducers without causing remount
  const colorByRef = useRef(colorBy)
  const highlightRef = useRef(highlightIds)
  const selectedRef = useRef(selectedId)
  const onSelectNodeRef = useRef(onSelectNode)
  colorByRef.current = colorBy
  highlightRef.current = highlightIds
  selectedRef.current = selectedId
  onSelectNodeRef.current = onSelectNode

  // Tween ref for smooth selected-node size (1.0 → 1.6)
  const selectedScaleRef = useRef(1)
  const tweenRafRef = useRef<number>(0)

  const startSizeTween = useCallback((targetScale: number) => {
    cancelAnimationFrame(tweenRafRef.current)
    const start = selectedScaleRef.current
    const startTime = performance.now()
    const duration = 220

    function tick(now: number) {
      const t = Math.min((now - startTime) / duration, 1)
      const ease = 1 - Math.pow(1 - t, 3) // ease-out cubic
      selectedScaleRef.current = start + (targetScale - start) * ease
      sigmaRef.current?.refresh()
      if (t < 1) {
        tweenRafRef.current = requestAnimationFrame(tick)
      }
    }
    tweenRafRef.current = requestAnimationFrame(tick)
  }, [])

  // Build and mount Sigma when graph data changes (NOT on selection/colorBy changes)
  useEffect(() => {
    if (!containerRef.current || graph.nodes.length === 0) return

    const g = new MultiGraph()

    const maxCluster = Math.max(0, ...graph.nodes.map(n => n.clusterId))
    const clusterCount = maxCluster + 1
    graph.nodes.forEach(n => {
      const angle = (2 * Math.PI * n.clusterId) / Math.max(clusterCount, 1)
      const r = 10
      const jitter = (Math.random() - 0.5) * 4
      g.addNode(n.id, {
        x: Math.cos(angle) * r + jitter,
        y: Math.sin(angle) * r + jitter,
        size: 4 + Math.sqrt(n.connections || 0) * 1.5,
        label: n.description?.slice(0, 24) ?? n.id,
        severity: n.severity,
        clusterId: n.clusterId,
        connections: n.connections,
        _node: n,
      })
    })

    graph.edges.forEach(e => {
      try {
        g.addEdge(e.source, e.target, {
          type: 'curved',
          size: Math.max(0.5, e.similarity * 1.5),
          similarity: e.similarity,
        })
      } catch {
        // skip duplicate edges
      }
    })

    graphRef.current = g

    const makeNodeColor = (nodeId: string, data: Record<string, unknown>) => {
      const cb = colorByRef.current
      const hl = highlightRef.current
      const dimmed = hl.size > 0 && !hl.has(nodeId)
      if (dimmed) return '#1c1c28'
      return cb === 'cluster'
        ? CLUSTER_COLORS[Number(data.clusterId) % CLUSTER_COLORS.length]
        : (SEVERITY_COLORS[data.severity as string] ?? '#6b7280')
    }

    const sigma = new Sigma(g, containerRef.current!, {
      defaultEdgeType: 'curved',
      edgeProgramClasses: { curved: EdgeCurvedArrowProgram },
      labelFont: 'Outfit, sans-serif',
      labelSize: 10,
      labelWeight: '400',
      labelColor: { color: '#8888a0' },
      labelRenderedSizeThreshold: 6,
      renderEdgeLabels: false,
      zIndex: true,
      nodeReducer: (nodeId: string, data) => {
        const hl = highlightRef.current
        const sel = selectedRef.current
        const isSelected = nodeId === sel
        const dimmed = hl.size > 0 && !hl.has(nodeId)
        const baseSize = data.size as number
        const scale = isSelected ? selectedScaleRef.current : 1
        return {
          ...data,
          color: makeNodeColor(nodeId, data as Record<string, unknown>),
          size: baseSize * scale,
          zIndex: isSelected ? 3 : dimmed ? 0 : 1,
          highlighted: false, // use DOM halo instead
        }
      },
      edgeReducer: (_edge: string, data) => {
        const sim = Number(data.similarity) || 0
        const alpha = Math.round(sim * 180).toString(16).padStart(2, '0')
        return {
          ...data,
          color: `#7c3aed${alpha}`,
          size: Math.max(0.5, sim * 1.5),
        }
      },
    })
    sigmaRef.current = sigma

    // Update halo position after each render frame
    sigma.on('afterRender', () => {
      const sel = selectedRef.current
      if (!sel || !g.hasNode(sel)) {
        setHalo(null)
        return
      }
      const { x, y } = g.getNodeAttributes(sel)
      const vp = sigma.graphToViewport({ x: x as number, y: y as number })
      setHalo({ x: vp.x, y: vp.y })
    })

    sigma.on('clickNode', ({ node }) => {
      const wasSelected = selectedRef.current === node
      onSelectNodeRef.current(wasSelected ? null : node)
    })
    sigma.on('clickStage', () => {
      onSelectNodeRef.current(null)
      setTooltip(null)
    })
    sigma.on('enterNode', ({ node, event }) => {
      const attrs = g.getNodeAttributes(node)
      const nodeData = attrs._node as GraphNode | undefined
      if (nodeData) setTooltip({ x: event.x, y: event.y, node: nodeData })
      if (wrapperRef.current) wrapperRef.current.style.cursor = 'pointer'
    })
    sigma.on('leaveNode', () => {
      setTooltip(null)
      if (wrapperRef.current) wrapperRef.current.style.cursor = ''
    })

    // FA2 layout
    const layout = new FA2LayoutSupervisor(g, {
      settings: {
        barnesHutOptimize: graph.nodes.length > 50,
        strongGravityMode: true,
        gravity: 0.05,
        scalingRatio: 1.2,
        slowDown: 5,
      },
    })
    layout.start()
    setPlaying(true)
    layoutRef.current = layout

    const stopTimer = setTimeout(() => {
      if (layoutRef.current?.isRunning()) {
        layoutRef.current.stop()
        setPlaying(false)
      }
      noverlap.assign(g, { maxIterations: 50 })
      sigmaRef.current?.getCamera().animatedReset({ duration: 400 })
      sigmaRef.current?.refresh()
    }, 1800)

    return () => {
      clearTimeout(stopTimer)
      cancelAnimationFrame(tweenRafRef.current)
      layout.kill()
      sigma.kill()
      sigmaRef.current = null
      layoutRef.current = null
      graphRef.current = null
      selectedScaleRef.current = 1
      setPlaying(false)
      setHalo(null)
    }
  }, [graph]) // only remount on graph data change

  // Update colors/highlights/selection in place — no sigma remount
  useEffect(() => {
    sigmaRef.current?.refresh()
  }, [colorBy, highlightIds, selectedId])

  // Animate size when selection changes
  useEffect(() => {
    startSizeTween(selectedId ? 1.6 : 1)
  }, [selectedId, startSizeTween])

  // Keyboard: Escape to deselect
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSelectNodeRef.current(null)
        setTooltip(null)
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [])

  const handlePlayPause = useCallback(() => {
    const layout = layoutRef.current
    if (!layout) return
    if (layout.isRunning()) {
      layout.stop()
      setPlaying(false)
    } else {
      layout.start()
      setPlaying(true)
    }
  }, [])

  const handleZoomIn = useCallback(() => {
    sigmaRef.current?.getCamera().animatedZoom(1.5)
  }, [])

  const handleZoomOut = useCallback(() => {
    sigmaRef.current?.getCamera().animatedUnzoom(1.5)
  }, [])

  const handleFit = useCallback(() => {
    sigmaRef.current?.getCamera().animatedReset()
  }, [])

  const handleReset = useCallback(() => {
    sigmaRef.current?.getCamera().animatedReset()
    onSelectNodeRef.current(null)
  }, [])

  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-fg-muted text-sm">
        No alerts to display. Ingest some alerts first.
      </div>
    )
  }

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      className="relative h-full w-full bg-graph-radial cursor-grab active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-accent/40 outline-none rounded-lg"
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* Selected node halo — DOM overlay, tracks node via afterRender */}
      {halo && selectedId && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full animate-pulse-glow"
          style={{
            left: halo.x,
            top: halo.y,
            boxShadow: '0 0 24px 6px rgba(124,58,237,0.45)',
          }}
        />
      )}

      {/* Hover tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute glass-elevated rounded-lg p-2 text-xs max-w-56 z-20"
          style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
        >
          <p className="text-fg-primary font-medium line-clamp-2 leading-snug">{tooltip.node.description}</p>
          <p className="text-fg-muted font-mono mt-0.5">{tooltip.node.host}</p>
        </div>
      )}

      {/* Graph controls */}
      <div className="absolute bottom-3 left-3 glass-elevated rounded-xl p-1 flex flex-col gap-0.5 z-10">
        <IconButton size="sm" onClick={handleZoomIn} title="Zoom in">
          <ZoomIn size={14} />
        </IconButton>
        <IconButton size="sm" onClick={handleZoomOut} title="Zoom out">
          <ZoomOut size={14} />
        </IconButton>
        <IconButton size="sm" onClick={handleFit} title="Fit to view">
          <Maximize2 size={14} />
        </IconButton>
        <IconButton size="sm" onClick={handleReset} title="Reset">
          <RotateCcw size={14} />
        </IconButton>
        <IconButton
          size="sm"
          onClick={handlePlayPause}
          title={playing ? 'Pause layout' : 'Resume layout'}
          className={playing ? 'text-accent-soft' : ''}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </IconButton>
      </div>
    </div>
  )
}
