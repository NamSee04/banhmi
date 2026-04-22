import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md'
  children: ReactNode
}

export default function IconButton({ size = 'md', className = '', children, ...rest }: Props) {
  const dim = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg text-fg-secondary transition-colors hover:text-fg-primary hover:bg-bg-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-void ${dim} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
