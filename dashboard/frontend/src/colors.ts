export const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444', // red-500
  warning: '#eab308',  // yellow-500
  info: '#22c55e',     // green-500
}

export const SEVERITY_BG: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-400 border border-red-500/25',
  warning: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/25',
  info: 'bg-green-500/15 text-green-400 border border-green-500/25',
}

export const STATUS_BG: Record<string, string> = {
  firing: 'bg-orange-500/15 text-orange-400 border border-orange-500/25',
  resolved: 'bg-blue-500/15 text-blue-400 border border-blue-500/25',
}

// Cluster palette — up to 12 distinct colors
export const CLUSTER_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#ef4444', // red
  '#a855f7', // purple
]
