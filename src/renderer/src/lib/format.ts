import type { BackupStatus } from '@shared/types'

export interface StatusMeta {
  label: string
  /** Tailwind classes for a badge (bg + text + border). */
  badge: string
  /** Tailwind class for a status dot background. */
  dot: string
}

const STATUS: Record<string, StatusMeta> = {
  SUCCESS: { label: 'Success', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
  NO_CHANGES: { label: 'No changes', badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30', dot: 'bg-slate-400' },
  FAILED: { label: 'Failed', badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30', dot: 'bg-rose-400' },
  WARNING: { label: 'Warning', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30', dot: 'bg-amber-400' },
  PENDING_RETRY: { label: 'Pending retry', badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30', dot: 'bg-sky-400' },
  PAUSED: { label: 'Paused', badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30', dot: 'bg-violet-400' },
  DISABLED: { label: 'Disabled', badge: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30', dot: 'bg-zinc-500' },
  ALREADY_RUNNING: { label: 'Running', badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30', dot: 'bg-indigo-400' }
}

export function statusMeta(status: BackupStatus | string | ''): StatusMeta {
  if (!status) return { label: 'Never run', badge: 'bg-slate-500/10 text-slate-400 border-slate-600/30', dot: 'bg-slate-600' }
  return STATUS[status] ?? { label: String(status), badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30', dot: 'bg-slate-400' }
}

export function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

/** "YYYY-MM-DD HH:MM:SS" → friendly relative time. */
export function timeAgo(ts: string): string {
  if (!ts) return 'never'
  const t = Date.parse(ts.replace(' ', 'T'))
  if (Number.isNaN(t)) return ts
  const diff = Date.now() - t
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return ts.slice(0, 10)
}

export function shortPath(p: string, max = 48): string {
  if (p.length <= max) return p
  return '…' + p.slice(p.length - max + 1)
}
