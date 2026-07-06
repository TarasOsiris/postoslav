import { statusMeta } from '@/lib/status'
import type { StatusTone } from '@/lib/status'

const toneClass: Record<StatusTone, string> = {
  neutral: 'bg-white',
  progress: 'bg-sun',
  success: 'bg-teal text-white',
  error: 'bg-coral text-white',
}

export function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta(status)
  return <span className={`badge ${toneClass[meta.tone]}`}>{meta.label}</span>
}
