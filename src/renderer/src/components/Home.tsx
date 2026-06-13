import { useMemo } from 'react'
import type { Project, LogEntry } from '@shared/types'
import { Button, StatusBadge, Toggle } from './ui'
import { ActivityLog } from './ActivityLog'
import { timeAgo, shortPath } from '../lib/format'

function Metric({ label, value, accent }: { label: string; value: number; accent: string }): React.JSX.Element {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</div>
    </div>
  )
}

function ProjectCard({
  project,
  onOpen,
  onCommit,
  onToggleEnabled
}: {
  project: Project
  onOpen: () => void
  onCommit: () => void
  onToggleEnabled: (v: boolean) => void
}): React.JSX.Element {
  return (
    <div
      onClick={onOpen}
      className="group cursor-pointer rounded-2xl border border-slate-800 bg-slate-900/50 p-5 transition-colors hover:border-indigo-500/50 hover:bg-slate-800/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-slate-100 group-hover:text-white">{project.name}</h3>
          <p className="mt-0.5 truncate text-xs text-slate-500" title={project.path}>
            {shortPath(project.path)}
          </p>
        </div>
        <StatusBadge status={project.last_status} />
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/60 px-2 py-0.5">
          ⎇ {project.branch}
        </span>
        <span>Last run {timeAgo(project.last_run)}</span>
        {project.paused && <span className="text-violet-400">• paused</span>}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3" onClick={(e) => e.stopPropagation()}>
        <Toggle checked={project.enabled} onChange={onToggleEnabled} label="Enabled" />
        <Button variant="primary" onClick={onCommit} className="px-3 py-1.5 text-xs">
          ⬆ Commit
        </Button>
      </div>
    </div>
  )
}

export function Home({
  projects,
  logs,
  onOpenProject,
  onCommit,
  onToggleEnabled,
  onAdd,
  onRunAll,
  onOpenLog
}: {
  projects: Project[]
  logs: LogEntry[]
  onOpenProject: (id: string) => void
  onCommit: (p: Project) => void
  onToggleEnabled: (p: Project, v: boolean) => void
  onAdd: () => void
  onRunAll: () => void
  onOpenLog: (e: LogEntry) => void
}): React.JSX.Element {
  const metrics = useMemo(() => {
    return {
      total: projects.length,
      active: projects.filter((p) => p.enabled && !p.paused).length,
      success: projects.filter((p) => p.last_status === 'SUCCESS').length,
      failed: projects.filter((p) => p.last_status === 'FAILED').length,
      retry: projects.filter((p) => p.last_status === 'PENDING_RETRY').length,
      paused: projects.filter((p) => p.paused).length
    }
  }, [projects])

  return (
    <div className="space-y-6 px-6 py-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Total" value={metrics.total} accent="text-slate-100" />
        <Metric label="Active" value={metrics.active} accent="text-indigo-300" />
        <Metric label="Successful" value={metrics.success} accent="text-emerald-300" />
        <Metric label="Failed" value={metrics.failed} accent="text-rose-300" />
        <Metric label="Pending Retry" value={metrics.retry} accent="text-sky-300" />
        <Metric label="Paused" value={metrics.paused} accent="text-violet-300" />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Monitored Repositories</h2>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onRunAll}>
              ⚡ Force Run All
            </Button>
            <Button variant="primary" onClick={onAdd}>
              + Add Repository
            </Button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 px-6 py-16 text-center">
            <p className="text-slate-400">No repositories yet.</p>
            <Button variant="primary" className="mt-4" onClick={onAdd}>
              + Add your first repository
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={() => onOpenProject(p.id)}
                onCommit={() => onCommit(p)}
                onToggleEnabled={(v) => onToggleEnabled(p, v)}
              />
            ))}
          </div>
        )}
      </section>

      <ActivityLog logs={logs} onOpen={onOpenLog} />
    </div>
  )
}
