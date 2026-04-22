import { useState, useCallback, useEffect } from 'react'
import type { HistoryEntry } from './types'

const KEY = 'jarvias.history'
const MAX = 100

function load(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    return JSON.parse(raw) as HistoryEntry[]
  } catch {
    return []
  }
}

function save(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    // quota exceeded — ignore
  }
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>(() => load())

  useEffect(() => {
    save(history)
  }, [history])

  const push = useCallback((entry: HistoryEntry) => {
    setHistory(prev => {
      const last = prev[0]
      if (last) {
        if (
          entry.kind === 'search' &&
          last.kind === 'search' &&
          last.query === entry.query
        ) {
          return [{ ...last, ts: entry.ts, resultCount: (entry as Extract<HistoryEntry, { kind: 'search' }>).resultCount }, ...prev.slice(1)]
        }
        if (
          entry.kind === 'select' &&
          last.kind === 'select' &&
          last.nodeId === entry.nodeId
        ) {
          return [{ ...last, ts: entry.ts }, ...prev.slice(1)]
        }
      }
      const next = [entry, ...prev]
      return next.length > MAX ? next.slice(0, MAX) : next
    })
  }, [])

  const remove = useCallback((id: string) => {
    setHistory(prev => prev.filter(e => e.id !== id))
  }, [])

  const clear = useCallback(() => {
    setHistory([])
    try { localStorage.removeItem(KEY) } catch {}
  }, [])

  return { history, push, clear, remove }
}
