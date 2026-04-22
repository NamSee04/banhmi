import type { ReactNode } from 'react'

interface Props {
  variant?: 'glass' | 'elevated'
  title?: string
  children: ReactNode
  className?: string
}

export default function Card({ variant = 'glass', title, children, className = '' }: Props) {
  const base = variant === 'elevated' ? 'glass-elevated' : 'glass'
  return (
    <div className={`${base} rounded-xl p-3 ${className}`}>
      {title && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">{title}</p>
      )}
      {children}
    </div>
  )
}
