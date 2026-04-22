import type { DaySummary } from '../types'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from 'recharts'
import { SEVERITY_COLORS } from '../colors'

interface Props {
  summary: DaySummary
}

export default function SummaryPanels({ summary }: Props) {
  const severityData = [
    { name: 'Critical', value: summary.critical, color: SEVERITY_COLORS.critical },
    { name: 'Warning', value: summary.warning, color: SEVERITY_COLORS.warning },
    { name: 'Info', value: summary.info, color: SEVERITY_COLORS.info },
  ].filter(d => d.value > 0)

  const sourceData = Object.entries(summary.bySource || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const topHosts = Object.entries(summary.byHost || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Total" value={summary.total} color="text-white" />
        <Card label="Critical" value={summary.critical} color="text-red-400" />
        <Card label="Warning" value={summary.warning} color="text-yellow-400" />
        <Card label="Firing" value={summary.firing} color="text-orange-400" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Info" value={summary.info} color="text-green-400" />
        <Card label="Resolved" value={summary.resolved} color="text-blue-400" />
        <Card label="Sources" value={Object.keys(summary.bySource || {}).length} color="text-purple-400" />
        <Card label="Hosts" value={Object.keys(summary.byHost || {}).length} color="text-cyan-400" />
      </div>

      {/* Timeline */}
      <Panel title="Alerts by Hour">
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={summary.timeline}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2a" />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#8888a0' }} interval={3} />
            <YAxis tick={{ fontSize: 10, fill: '#8888a0' }} allowDecimals={false} />
            <Tooltip contentStyle={{ background: '#16161f', border: '1px solid #2a2a3a', borderRadius: 8 }} />
            <Line type="monotone" dataKey="count" stroke="#7c3aed" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Severity donut */}
        <Panel title="Severity">
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={severityData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                innerRadius={40} outerRadius={70} paddingAngle={3}>
                {severityData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#16161f', border: '1px solid #2a2a3a', borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#8888a0' }} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>

        {/* Source bar */}
        <Panel title="By Source">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={sourceData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10, fill: '#8888a0' }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#8888a0' }} width={100} />
              <Tooltip contentStyle={{ background: '#16161f', border: '1px solid #2a2a3a', borderRadius: 8 }} />
              <Bar dataKey="value" fill="#7c3aed" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* Top hosts */}
      {topHosts.length > 0 && (
        <Panel title="Top Hosts">
          <div className="divide-y divide-border-subtle">
            {topHosts.map(h => (
              <div key={h.name} className="flex items-center justify-between py-1.5 text-sm">
                <span className="font-mono text-fg-secondary truncate">{h.name}</span>
                <span className="ml-2 rounded-full bg-bg-elevated px-2 py-0.5 text-xs text-accent-soft">{h.value}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="glass rounded-xl p-3 animate-slide-up">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-xl p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">{title}</div>
      {children}
    </div>
  )
}
