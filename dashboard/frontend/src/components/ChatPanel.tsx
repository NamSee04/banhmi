import { useRef, useState } from 'react'
import { Loader2, Send, X, MessageSquare } from 'lucide-react'
import type { ChatSourceAlert } from '../types'
import { chatStream } from '../api'
import Badge from './ui/Badge'

interface Props {
  date: string
  onSelectId: (id: string) => void
  onJumpToGraph: () => void
}

export default function ChatPanel({ date, onSelectId, onJumpToGraph }: Props) {
  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<ChatSourceAlert[]>([])
  const [streaming, setStreaming] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ctrlRef = useRef<AbortController | null>(null)
  const answerRef = useRef<HTMLDivElement>(null)

  const submit = async () => {
    const query = q.trim()
    if (!query || streaming) return

    setAnswer('')
    setSources([])
    setErr(null)
    setStreaming(true)

    const ctrl = new AbortController()
    ctrlRef.current = ctrl

    try {
      await chatStream(
        query,
        date,
        {
          token: t => {
            setAnswer(a => a + t)
            // auto-scroll
            requestAnimationFrame(() => {
              answerRef.current?.scrollTo({ top: answerRef.current.scrollHeight, behavior: 'smooth' })
            })
          },
          sources: setSources,
          done: () => setStreaming(false),
          error: m => {
            setErr(m)
            setStreaming(false)
          },
        },
        ctrl.signal,
      )
    } catch (e: unknown) {
      if ((e as { name?: string }).name !== 'AbortError') {
        setErr(e instanceof Error ? e.message : String(e))
      }
      setStreaming(false)
    }
  }

  const cancel = () => {
    ctrlRef.current?.abort()
    setStreaming(false)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4 gap-4">
      {/* Input area */}
      <div className="shrink-0 flex gap-2">
        <textarea
          className="flex-1 rounded-lg glass border-border-subtle px-3 py-2 text-sm text-fg-primary placeholder-fg-muted focus:border-accent focus:shadow-glow-soft focus:outline-none resize-none"
          rows={3}
          placeholder="Ask about alerts… (Enter to send, Shift+Enter for newline)"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          disabled={streaming}
        />
        <div className="flex flex-col gap-2">
          <button
            onClick={submit}
            disabled={!q.trim() || streaming}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-dim disabled:opacity-40 transition-colors"
            title="Send"
          >
            {streaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
          {streaming && (
            <button
              onClick={cancel}
              className="rounded-lg border border-border-subtle px-3 py-2 text-fg-secondary hover:text-fg-primary transition-colors"
              title="Cancel"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {err && (
        <div className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400 flex items-center justify-between gap-2">
          <span>{err}</span>
          <button onClick={() => setErr(null)} className="shrink-0 text-red-400 hover:text-red-300">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Answer area */}
      {(answer || streaming) && (
        <div
          ref={answerRef}
          className="flex-1 overflow-y-auto rounded-lg glass p-3 font-mono text-sm text-fg-primary whitespace-pre-wrap leading-relaxed min-h-0"
        >
          {answer}
          {streaming && <span className="inline-block w-2 h-4 bg-accent shadow-glow animate-pulse ml-0.5 align-middle" />}
        </div>
      )}

      {/* Empty state */}
      {!answer && !streaming && !err && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-fg-muted">
          <MessageSquare size={32} className="animate-breathe" />
          <p className="text-sm">Ask a question about the alerts</p>
          <p className="text-xs text-fg-muted/60">Try: &ldquo;why did hosts go critical last night?&rdquo;</p>
        </div>
      )}

      {/* Sources */}
      {sources.length > 0 && (
        <div className="shrink-0 space-y-1.5">
          <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Sources</p>
          <ul className="space-y-1.5 max-h-52 overflow-y-auto">
            {sources.map((s, i) => (
              <li key={s.id}>
                <button
                  onClick={() => { onSelectId(s.id); onJumpToGraph() }}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className="w-full text-left rounded-lg border border-border-subtle bg-bg-surface/50 p-2 hover:border-accent/50 transition-colors animate-slide-in"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="severity" value={s.severity} />
                    <span className="text-xs text-accent-soft">{(s.similarity * 100).toFixed(0)}% match</span>
                  </div>
                  <p className="mt-0.5 text-xs text-fg-secondary line-clamp-2">{s.description}</p>
                  <p className="text-xs text-fg-muted font-mono">{s.host} · {s.id}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
