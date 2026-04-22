import type { DaySummary } from '../types'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area, CartesianGrid,
} from 'recharts'
import { SEVERITY_COLORS } from '../colors'
import { AlertTriangle, AlertCircle, Info, Flame, CheckCircle2, Layers, Server, Activity } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  summary: DaySummary
  date?: string
}

const TOOLTIP_STYLE = {
  background: '#0a0a10',
  border: '1px solid #2a2a3a',
  borderRadius: 8,
  fontSize: 12,
  color: '#e4e4ed',
}

function formatDate(d?: string): string {
  if (!d) return 'All days'
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

export default function SummaryPanels({ summary, date }: Props) {
  const total = summary.firing + summary.resolved
  const resolvedPct = total > 0 ? Math.round((summary.resolved / total) * 100) : 0
  const healthColor =
    resolvedPct >= 75 ? '#22c55e' : resolvedPct >= 40 ? '#eab308' : '#ef4444'
  const healthLabel =
    resolvedPct >= 75 ? 'Healthy' : resolvedPct >= 40 ? 'Degraded' : 'Critical'

  const severityData = [
    { name: 'Critical', value: summary.critical, color: SEVERITY_COLORS.critical },
    { name: 'Warning', value: summary.warning, color: SEVERITY_COLORS.warning },
    { name: 'Info', value: summary.info, color: SEVERITY_COLORS.info },
  ].filter(d => d.value > 0)

  const sourceData = Object.entries(summary.bySource || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  const topHosts = Object.entries(summary.byHost || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  const maxHostCount = Math.max(...topHosts.map(h => h.value), 1)

  const kpis: { label: string; value: number; color: string; border: string; icon: LucideIcon; glow?: string }[] = [
    { label: 'Total', value: summary.total, color: 'text-fg-primary', border: 'border-border-subtle', icon: Activity },
    { label: 'Critical', value: summary.critical, color: 'text-red-400', border: 'border-red-500/30', icon: AlertTriangle, glow: summary.critical > 0 ? 'shadow-glow-red' : undefined },
    { label: 'Warning', value: summary.warning, color: 'text-yellow-400', border: 'border-yellow-500/30', icon: AlertCircle },
    { label: 'Info', value: summary.info, color: 'text-green-400', border: 'border-green-500/30', icon: Info },
  ]

  const secondary: { label: string; value: number; color: string; border: string; icon: LucideIcon }[] = [
    { label: 'Firing', value: summary.firing, color: 'text-orange-400', border: 'border-orange-500/30', icon: Flame },
    { label: 'Resolved', value: summary.resolved, color: 'text-blue-400', border: 'border-blue-500/30', icon: CheckCircle2 },
    { label: 'Sources', value: Object.keys(summary.bySource || {}).length, color: 'text-purple-400', border: 'border-purple-500/30', icon: Layers },
    { label: 'Hosts', value: Object.keys(summary.byHost || {}).length, color: 'text-cyan-400', border: 'border-cyan-500/30', icon: Server },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-fg-primary">{formatDate(date)}</h2>
          <p className="text-xs text-fg-muted">{summary.total} alerts ingested</p>
        </div>
        <div
          className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
          style={{ borderColor: `${healthColor}40`, color: healthColor, background: `${healthColor}12` }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full animate-breathe"
            style={{ background: healthColor }}
          />
          {healthLabel} — {resolvedPct}% resolved
        </div>
      </div>

      {/* Primary KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k, i) => (
          <KpiCard key={k.label} {...k} delay={i * 50} />
        ))}
      </div>

      {/* Secondary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {secondary.map((k, i) => (
          <KpiCard key={k.label} {...k} delay={200 + i * 50} small />
        ))}
      </div>

      {/* Health bar */}
      {total > 0 && (
        <div className="glass rounded-xl p-3 animate-slide-up" style={{ animationDelay: '400ms' }}>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-wider text-fg-muted">Firing vs Resolved</span>
            <span className="text-fg-secondary">
              <span className="text-orange-400">{summary.firing} firing</span>
              <span className="text-fg-muted mx-1">·</span>
              <span className="text-blue-400">{summary.resolved} resolved</span>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-bg-hover">
            <div className="flex h-full">
              {summary.firing > 0 && (
                <div
                  className="h-full bg-orange-500/70 transition-all duration-700"
                  style={{ width: `${(summary.firing / total) * 100}%` }}
                />
              )}
              {summary.resolved > 0 && (
                <div
                  className="h-full bg-blue-500/70 transition-all duration-700"
                  style={{ width: `${(summary.resolved / total) * 100}%` }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <Panel title="Alerts by Hour" delay={450}>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={summary.timeline}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a26" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#5a5a70' }} interval={3} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#5a5a70' }} allowDecimals={false} axisLine={false} tickLine={false} width={28} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: '#7c3aed', strokeWidth: 1, strokeDasharray: '4 2' }} />
            <Area type="monotone" dataKey="count" stroke="#7c3aed" strokeWidth={2} fill="url(#areaGrad)" dot={false} activeDot={{ r: 4, fill: '#a78bfa' }} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Severity donut */}
        <Panel title="Severity Breakdown" delay={500}>
          <div style={{ position: 'relative' }}>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                <Pie
                  data={severityData} dataKey="value" nameKey="name"
                  cx="50%" cy="46%" innerRadius={50} outerRadius={75} paddingAngle={3}
                  strokeWidth={0}
                >
                  {severityData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                {/* pointer-events: none so text never blocks hover on slices */}
                <text x="50%" y="43%" textAnchor="middle" dominantBaseline="middle"
                  style={{ fill: '#e4e4ed', fontSize: '20px', fontWeight: 700, pointerEvents: 'none' }}>
                  {summary.total}
                </text>
                <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle"
                  style={{ fill: '#5a5a70', fontSize: '10px', pointerEvents: 'none' }}>
                  total
                </text>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  wrapperStyle={{ zIndex: 20, outline: 'none' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const item = payload[0]
                    return (
                      <div style={{ ...TOOLTIP_STYLE, padding: '6px 12px' }}>
                        <span style={{ color: (item.payload as { color: string }).color, fontWeight: 600 }}>
                          {item.name}
                        </span>
                        <span style={{ color: '#e4e4ed' }}>: {item.value}</span>
                      </div>
                    )
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#8888a0' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Source bar */}
        <Panel title="Alerts by Source" delay={550}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={sourceData} layout="vertical" barCategoryGap="30%">
              <XAxis type="number" tick={{ fontSize: 10, fill: '#5a5a70' }} allowDecimals={false} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#8888a0' }} width={90} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(124,58,237,0.06)' }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {sourceData.map((_, i) => (
                  <Cell
                    key={i}
                    fill={`rgba(124,58,237,${Math.max(0.3, 1 - i * 0.1)})`}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* Top hosts */}
      {topHosts.length > 0 && (
        <Panel title="Top Hosts" delay={600}>
          <div className="space-y-2">
            {topHosts.map((h, i) => (
              <div key={h.name} className="flex items-center gap-3">
                <span className="w-5 text-right text-xs text-fg-muted">{i + 1}</span>
                <span className="w-40 shrink-0 truncate font-mono text-xs text-fg-secondary">{h.name}</span>
                <div className="flex flex-1 items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-hover">
                    <div
                      className="h-full rounded-full bg-accent/70 transition-all duration-700"
                      style={{ width: `${(h.value / maxHostCount) * 100}%`, animationDelay: `${600 + i * 40}ms` }}
                    />
                  </div>
                  <span className="w-6 text-right text-xs font-medium text-accent-soft">{h.value}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

interface KpiCardProps {
  label: string
  value: number
  color: string
  border: string
  icon: LucideIcon
  glow?: string
  delay?: number
  small?: boolean
}

function KpiCard({ label, value, color, border, icon: Icon, glow, delay = 0, small }: KpiCardProps) {
  return (
    <div
      className={`glass rounded-xl border-l-2 p-3 animate-slide-up transition-all hover:bg-bg-hover ${border} ${glow ?? ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-fg-muted">{label}</div>
          <div className={`font-bold ${color} ${small ? 'text-xl' : 'text-2xl'}`}>{value}</div>
        </div>
        <Icon size={small ? 14 : 16} className={`mt-0.5 opacity-50 ${color}`} />
      </div>
    </div>
  )
}

function Panel({ title, children, delay = 0 }: { title: string; children: React.ReactNode; delay?: number }) {
  return (
    <div className="glass rounded-xl p-3 animate-slide-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-fg-muted">{title}</div>
      {children}
    </div>
  )
}
