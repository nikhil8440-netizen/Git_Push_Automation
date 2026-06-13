import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { subscribeToasts, dismissToast, type ToastItem } from '../lib/toast'
import { statusMeta } from '../lib/format'
import type { BackupStatus } from '@shared/types'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/40',
  secondary: 'bg-slate-700/60 hover:bg-slate-700 text-slate-100 border border-slate-600/60',
  danger: 'bg-rose-600 hover:bg-rose-500 text-white border border-rose-500/40',
  ghost: 'bg-transparent hover:bg-slate-700/50 text-slate-300 border border-transparent'
}

export function Button({
  variant = 'secondary',
  className = '',
  children,
  ...rest
}: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Spinner({ className = '' }: { className?: string }): React.JSX.Element {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent ${className}`}
    />
  )
}

export function StatusBadge({ status }: { status: BackupStatus | string | '' }): React.JSX.Element {
  const m = statusMeta(status)
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

export function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}): React.JSX.Element {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={(e) => {
          e.stopPropagation()
          onChange(!checked)
        }}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-indigo-500' : 'bg-slate-600'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-4' : 'left-0.5'}`}
        />
      </button>
      {label && <span className="text-sm text-slate-300">{label}</span>}
    </label>
  )
}

export function StatCard({
  label,
  value,
  hint
}: {
  label: string
  value: ReactNode
  hint?: string
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md'
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}): React.JSX.Element | null {
  if (!open) return null
  const width = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl'
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full ${width} max-h-[88vh] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700/70 px-5 py-3.5">
          <h3 className="text-base font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="max-h-[64vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-700/70 px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  )
}

export interface DangerRequest {
  title: string
  message: string
  consequence?: string
  confirmLabel?: string
  onConfirm: () => void
}

export function DangerOverlay({
  request,
  onCancel
}: {
  request: DangerRequest | null
  onCancel: () => void
}): React.JSX.Element | null {
  if (!request) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-6 text-center shadow-2xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-2xl text-rose-400">
          ⚠
        </div>
        <h2 className="text-lg font-semibold text-slate-100">{request.title}</h2>
        <p className="mt-2 text-sm text-slate-300">{request.message}</p>
        {request.consequence && (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {request.consequence}
          </div>
        )}
        <div className="mt-5 flex justify-center gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              request.onConfirm()
              onCancel()
            }}
          >
            {request.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function Toaster(): React.JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([])
  useEffect(() => subscribeToasts(setItems), [])
  return (
    <div className="fixed bottom-5 right-5 z-[70] flex w-80 flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className={`cursor-pointer rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur ${
            t.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-950/80 text-emerald-200'
              : t.type === 'error'
                ? 'border-rose-500/40 bg-rose-950/80 text-rose-200'
                : 'border-slate-600/60 bg-slate-800/90 text-slate-200'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}

export function Field({
  label,
  children,
  hint
}: {
  label: string
  children: ReactNode
  hint?: string
}): React.JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-slate-600/70 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/40'
