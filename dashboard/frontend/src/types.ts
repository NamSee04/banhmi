// API types mirroring the Go models

export interface Alert {
  id: string
  date: string
  file: string
  severity: 'critical' | 'warning' | 'info'
  status: 'firing' | 'resolved'
  description: string
  source: string
  host: string
  value: string
  time: string
  details: string
}

export interface GraphNode {
  id: string
  label: string
  severity: string
  status: string
  source: string
  host: string
  time: string
  description: string
  clusterId: number
  clusterName: string
  connections: number
  date: string
  value: string
}

export interface GraphEdge {
  source: string
  target: string
  similarity: number
}

export interface Cluster {
  id: number
  name: string
  members: string[]
  size: number
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  clusters: Cluster[]
}

export interface TimeSlot {
  hour: string
  count: number
}

export interface DaySummary {
  date: string
  total: number
  critical: number
  warning: number
  info: number
  firing: number
  resolved: number
  bySource: Record<string, number>
  byHost: Record<string, number>
  timeline: TimeSlot[]
}

export interface SearchResult {
  alert: Alert
  similarity: number
}

export interface ChatSourceAlert {
  id: string
  similarity: number
  severity: string
  host: string
  time: string
  description: string
}
