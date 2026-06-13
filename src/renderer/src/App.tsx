import { useCallback, useEffect, useState } from 'react'
import type { Project, LogEntry, SystemStatus } from '@shared/types'
import { Header } from './components/Header'
import { Home } from './components/Home'
import { ProjectDetail } from './components/ProjectDetail'
import { ProjectForm } from './components/ProjectForm'
import { BackupModal } from './components/BackupModal'
import { LogConsoleModal } from './components/ActivityLog'
import { ProfileModal, IdentityModal, AuthModal } from './components/ProfileModals'
import { SettingsModal } from './components/SettingsModal'
import { Toaster, DangerOverlay, Spinner, type DangerRequest } from './components/ui'
import { toast } from './lib/toast'

export default function App(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [dryRun, setDryRun] = useState(false)

  const [view, setView] = useState<'home' | 'detail'>('home')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formInitial, setFormInitial] = useState<Project | null>(null)
  const [backupTarget, setBackupTarget] = useState<Project | null>(null)
  const [logEntry, setLogEntry] = useState<LogEntry | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [identityOpen, setIdentityOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [danger, setDanger] = useState<DangerRequest | null>(null)
  const [running, setRunning] = useState(false)

  const reloadProjects = useCallback(async () => {
    const [p, l] = await Promise.all([window.api.projects.list(), window.api.logs.list()])
    setProjects(p)
    setLogs(l)
  }, [])

  const loadAll = useCallback(async () => {
    const [p, l, cfg, sys] = await Promise.all([
      window.api.projects.list(),
      window.api.logs.list(),
      window.api.config.get(),
      window.api.system.status()
    ])
    setProjects(p)
    setLogs(l)
    setDryRun(cfg.dry_run)
    setSystem(sys)
  }, [])

  useEffect(() => {
    loadAll()
    const t = setInterval(() => void reloadProjects(), 15000)
    return () => clearInterval(t)
  }, [loadAll, reloadProjects])

  const selected = projects.find((p) => p.id === selectedId) ?? null
  useEffect(() => {
    if (view === 'detail' && !selected) setView('home')
  }, [view, selected])

  async function runBackup(project: Project, message: string): Promise<void> {
    setBackupTarget(null)
    setRunning(true)
    const r = await window.api.backup.run(project.id, message)
    setRunning(false)
    toast(`${project.name}: ${r.message}`, r.status === 'SUCCESS' ? 'success' : r.status === 'FAILED' ? 'error' : 'info')
    reloadProjects()
  }

  async function runAll(): Promise<void> {
    setRunning(true)
    const results = await window.api.backup.runAll()
    setRunning(false)
    const ok = results.filter((r) => r.status === 'SUCCESS').length
    toast(`Force Run All: ${ok}/${results.length} succeeded.`, 'info')
    reloadProjects()
  }

  async function toggleEnabled(p: Project, v: boolean): Promise<void> {
    await window.api.projects.update(p.id, { enabled: v })
    reloadProjects()
  }

  async function toggleDryRun(v: boolean): Promise<void> {
    await window.api.config.setDryRun(v)
    setDryRun(v)
  }

  const identityInitial = (system?.identity.name || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="min-h-screen bg-[#0b0d12] text-slate-100">
      <Header
        status={system}
        dryRun={dryRun}
        onToggleDryRun={toggleDryRun}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        identityInitial={identityInitial}
      />

      <main className="mx-auto max-w-7xl">
        {view === 'home' || !selected ? (
          <Home
            projects={projects}
            logs={logs}
            onOpenProject={(id) => {
              setSelectedId(id)
              setView('detail')
            }}
            onCommit={(p) => setBackupTarget(p)}
            onToggleEnabled={toggleEnabled}
            onAdd={() => {
              setFormInitial(null)
              setFormOpen(true)
            }}
            onRunAll={runAll}
            onOpenLog={setLogEntry}
          />
        ) : (
          <ProjectDetail
            project={selected}
            onBack={() => setView('home')}
            onCommit={() => setBackupTarget(selected)}
            onEdit={() => {
              setFormInitial(selected)
              setFormOpen(true)
            }}
            requestDanger={setDanger}
            reloadProjects={reloadProjects}
          />
        )}
      </main>

      <ProjectForm open={formOpen} initial={formInitial} onClose={() => setFormOpen(false)} onSaved={reloadProjects} />
      <BackupModal
        open={!!backupTarget}
        projectName={backupTarget?.name ?? ''}
        onClose={() => setBackupTarget(null)}
        onConfirm={(msg) => backupTarget && runBackup(backupTarget, msg)}
      />
      <LogConsoleModal entry={logEntry} onClose={() => setLogEntry(null)} />
      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onEditIdentity={() => {
          setProfileOpen(false)
          setIdentityOpen(true)
        }}
        onEditAuth={() => {
          setProfileOpen(false)
          setAuthOpen(true)
        }}
      />
      <IdentityModal open={identityOpen} onClose={() => setIdentityOpen(false)} onSaved={loadAll} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSaved={loadAll} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <DangerOverlay request={danger} onCancel={() => setDanger(null)} />

      {running && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-slate-700 bg-slate-900 px-10 py-8 text-center">
            <Spinner className="mx-auto h-8 w-8" />
            <p className="mt-4 font-medium text-slate-100">Backing up…</p>
            <p className="mt-1 text-sm text-slate-400">Committing and pushing to GitHub.</p>
          </div>
        </div>
      )}

      <Toaster />
    </div>
  )
}
