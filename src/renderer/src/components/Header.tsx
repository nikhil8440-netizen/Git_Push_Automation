import type { SystemStatus } from '@shared/types'
import { Toggle } from './ui'

function Dot({ ok }: { ok: boolean }): React.JSX.Element {
  return <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
}

function StatusItem({ label, ok, title }: { label: string; ok: boolean; title?: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-400" title={title}>
      <Dot ok={ok} />
      {label}
    </div>
  )
}

export function Header({
  status,
  dryRun,
  onToggleDryRun,
  onOpenProfile,
  onOpenSettings,
  identityInitial
}: {
  status: SystemStatus | null
  dryRun: boolean
  onToggleDryRun: (v: boolean) => void
  onOpenProfile: () => void
  onOpenSettings: () => void
  identityInitial: string
}): React.JSX.Element {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-6 py-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenProfile}
          title="Your Git profile — name, email & GitHub sign-in"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          {identityInitial || '?'}
        </button>
        <h1 className="text-lg font-semibold tracking-tight text-slate-100">Git Manager</h1>
      </div>

      <div className="flex items-center gap-5">
        <div className="hidden items-center gap-4 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2 sm:flex">
          <StatusItem label="Git" ok={!!status?.git.ok} title={status?.git.version} />
          <StatusItem label="Identity" ok={!!status?.identity.ok} title={status?.identity.email} />
          <StatusItem label="Network" ok={!!status?.network.ok} />
          <StatusItem label="Scheduler" ok={!!status?.scheduler.ok} title={status?.scheduler.detail} />
        </div>
        <Toggle checked={dryRun} onChange={onToggleDryRun} label="Dry Run" />
        <button
          onClick={onOpenSettings}
          title="Settings"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          ⚙
        </button>
      </div>
    </header>
  )
}
