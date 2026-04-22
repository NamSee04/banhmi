import { SEVERITY_BG, STATUS_BG } from '../../colors'

interface Props {
  variant: 'severity' | 'status'
  value: string
  pulse?: boolean
}

export default function Badge({ variant, value, pulse }: Props) {
  const cls = variant === 'severity' ? SEVERITY_BG[value] : STATUS_BG[value]
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls ?? ''} ${pulse ? 'animate-breathe' : ''}`}
    >
      {value}
    </span>
  )
}
