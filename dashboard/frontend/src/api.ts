import type { DaySummary, Graph, SearchResult, Alert, ChatSourceAlert } from './types'

const BASE = '/api'

export async function fetchSummary(date: string): Promise<DaySummary> {
  const r = await fetch(`${BASE}/summary${date ? `?date=${date}` : ''}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function fetchGraph(date: string, threshold: number): Promise<Graph> {
  const url = date
    ? `${BASE}/graph?date=${date}&threshold=${threshold}`
    : `${BASE}/graph/all?threshold=${threshold}`
  const r = await fetch(url)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function fetchAlerts(date: string): Promise<Alert[]> {
  const r = await fetch(`${BASE}/alerts${date ? `?date=${date}` : ''}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function fetchSimilar(alertId: string, topk = 5): Promise<SearchResult[]> {
  const r = await fetch(`${BASE}/alert/${encodeURIComponent(alertId)}/similar?topk=${topk}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function search(query: string, date: string, topk = 8): Promise<SearchResult[]> {
  const r = await fetch(`${BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, date, topk }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function chatStream(
  query: string,
  date: string,
  on: {
    token: (t: string) => void
    sources: (s: ChatSourceAlert[]) => void
    done: () => void
    error: (m: string) => void
  },
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, date }),
    signal,
  })

  if (!res.ok) {
    const text = await res.text()
    on.error(text || `HTTP ${res.status}`)
    return
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let eventName = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    const lines = buf.split('\n')
    buf = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        const data = line.slice(5).trim()
        if (eventName === 'token') {
          try { on.token(JSON.parse(data)) } catch { on.token(data) }
        } else if (eventName === 'sources') {
          try { on.sources(JSON.parse(data)) } catch { /* ignore */ }
        } else if (eventName === 'done') {
          on.done()
        } else if (eventName === 'error') {
          on.error(data)
        }
        eventName = ''
      }
    }
  }
}
