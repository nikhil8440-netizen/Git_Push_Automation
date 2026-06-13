import { useCallback, useEffect, useState } from 'react'
import type { Project, RepoStats, GitOp } from '@shared/types'
import type { DangerRequest } from './ui'
import { Button, StatCard, Spinner, Modal, inputClass } from './ui'
import { toast } from '../lib/toast'
import { formatBytes, timeAgo } from '../lib/format'

type TabKey = 'changes' | 'history' | 'branches' | 'remotes' | 'stash' | 'tags' | 'terminal'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'changes', label: 'Changes' },
  { key: 'history', label: 'History' },
  { key: 'branches', label: 'Branches' },
  { key: 'remotes', label: 'Remotes' },
  { key: 'stash', label: 'Stash' },
  { key: 'tags', label: 'Tags' },
  { key: 'terminal', label: 'Terminal' }
]

export interface DiffView {
  title: string
  body: string
}

export function ProjectDetail({
  project,
  onBack,
  onCommit,
  onEdit,
  requestDanger,
  reloadProjects
}: {
  project: Project
  onBack: () => void
  onCommit: () => void
  onEdit: () => void
  requestDanger: (r: DangerRequest) => void
  reloadProjects: () => void
}): React.JSX.Element {
  const [stats, setStats] = useState<RepoStats | null>(null)
  const [tab, setTab] = useState<TabKey>('changes')
  const [bump, setBump] = useState(0)
  const [busy, setBusy] = useState(false)
  const [diff, setDiff] = useState<DiffView | null>(null)
  const [reflogOpen, setReflogOpen] = useState(false)

  const loadStats = useCallback(async () => {
    const res = await window.api.projects.stats(project.id)
    setStats(res.stats ?? null)
  }, [project.id])

  useEffect(() => {
    loadStats()
  }, [loadStats, bump])

  const refresh = useCallback(() => {
    setBump((b) => b + 1)
    reloadProjects()
  }, [reloadProjects])

  const act = useCallback(
    async (op: GitOp, params: Record<string, unknown> = {}): Promise<boolean> => {
      setBusy(true)
      const r = await window.api.git.action(project.id, op, params)
      setBusy(false)
      toast(r.message, r.success ? 'success' : 'error')
      if (r.success) refresh()
      return r.success
    },
    [project.id, refresh]
  )

  async function quick(op: GitOp, params: Record<string, unknown> = {}): Promise<void> {
    await act(op, params)
  }

  const openDiff = useCallback(
    async (file: string, staged: boolean): Promise<void> => {
      const r = await window.api.git.data(project.id, 'diff', { file, staged })
      setDiff({ title: file, body: String(r.diff ?? r.error ?? '(no diff)') })
    },
    [project.id]
  )

  const openShow = useCallback(
    async (sha: string): Promise<void> => {
      const r = await window.api.git.data(project.id, 'show', { sha })
      setDiff({ title: sha.slice(0, 10), body: String(r.diff ?? r.error ?? '(could not load commit)') })
    },
    [project.id]
  )

  return (
    <div className="px-6 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onBack} className="px-2">
            ← Back
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-slate-100">{project.name}</h1>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
              <span className="rounded-md border border-slate-700 bg-slate-800/60 px-2 py-0.5">⎇ {stats?.branch || project.branch}</span>
              {stats && (stats.ahead > 0 || stats.behind > 0) && (
                <span>
                  {stats.ahead > 0 && `↑${stats.ahead} `}
                  {stats.behind > 0 && `↓${stats.behind}`}
                </span>
              )}
              <span className="truncate" title={project.path}>
                {project.path}
              </span>
            </div>
          </div>
        </div>
        <Button variant="secondary" onClick={onEdit}>
          ⚙ Edit Settings
        </Button>
      </div>

      {/* Action bar */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onCommit} disabled={busy}>
          ⬆ Commit
        </Button>
        <Button variant="secondary" onClick={() => quick('push')} disabled={busy}>
          ↑ Push
        </Button>
        <Button variant="secondary" onClick={() => quick('pull', { rebase: true })} disabled={busy}>
          ↓ Pull
        </Button>
        <Button variant="secondary" onClick={() => quick('fetch')} disabled={busy}>
          ⟳ Fetch
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            setBusy(true)
            const r = await window.api.projects.testConnection(project.id)
            setBusy(false)
            toast(r.message, r.success ? 'success' : 'error')
          }}
          disabled={busy}
        >
          🔌 Test Connection
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={() =>
            requestDanger({
              title: 'Force Push?',
              message: `Force-push ${stats?.branch || project.branch} to origin.`,
              consequence: 'This can overwrite commits on the remote that others may rely on. Uses --force-with-lease.',
              confirmLabel: 'Force Push',
              onConfirm: () => void act('push', { force: true })
            })
          }
        >
          ⚠ Force Push
        </Button>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Commits" value={stats?.commit_count ?? '—'} />
        <StatCard label="Ahead / Behind" value={stats ? `↑${stats.ahead} ↓${stats.behind}` : '—'} />
        <StatCard label="Branches" value={stats?.branch_count ?? '—'} />
        <StatCard label="Tags" value={stats?.tag_count ?? '—'} />
        <StatCard label="Stashes" value={stats?.stash_count ?? '—'} />
        <StatCard label="Repo Size" value={stats ? formatBytes(stats.repo_size_bytes) : '—'} />
        <StatCard label="Last Push" value={stats?.last_push ? timeAgo(stats.last_push) : 'never'} />
        <StatCard
          label="Last Commit"
          value={stats?.last_commit ? stats.last_commit.message.slice(0, 24) || stats.last_commit.sha.slice(0, 8) : '—'}
          hint={stats?.last_commit ? `${stats.last_commit.author} · ${stats.last_commit.date}` : undefined}
        />
      </div>

      {/* Control panel */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
        <div className="flex items-center justify-between border-b border-slate-800 px-3 pt-3">
          <nav className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
                  tab === t.key ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <button
            onClick={() => setReflogOpen(true)}
            title="Reflog — recover from a bad reset or operation"
            className="mb-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            ⟲ Recovery
          </button>
        </div>
        <div className="p-4">
          {tab === 'changes' && (
            <ChangesTab projectId={project.id} bump={bump} act={act} requestDanger={requestDanger} openDiff={openDiff} />
          )}
          {tab === 'history' && (
            <HistoryTab projectId={project.id} bump={bump} act={act} requestDanger={requestDanger} openShow={openShow} />
          )}
          {tab === 'branches' && <BranchesTab projectId={project.id} bump={bump} act={act} requestDanger={requestDanger} />}
          {tab === 'remotes' && <RemotesTab projectId={project.id} bump={bump} act={act} requestDanger={requestDanger} />}
          {tab === 'stash' && <StashTab projectId={project.id} bump={bump} act={act} requestDanger={requestDanger} />}
          {tab === 'tags' && <TagsTab projectId={project.id} bump={bump} act={act} requestDanger={requestDanger} />}
          {tab === 'terminal' && <TerminalTab projectId={project.id} />}
        </div>
      </div>

      <DiffModal diff={diff} onClose={() => setDiff(null)} />
      <ReflogModal
        open={reflogOpen}
        projectId={project.id}
        onClose={() => setReflogOpen(false)}
        act={act}
        requestDanger={requestDanger}
      />
    </div>
  )
}

// ── shared tab helpers ──────────────────────────────────────────────────────

type ActFn = (op: GitOp, params?: Record<string, unknown>) => Promise<boolean>
type DangerFn = (r: DangerRequest) => void

function useGitData<T = Record<string, unknown>>(
  projectId: string,
  kind: Parameters<Window['api']['git']['data']>[1],
  bump: number,
  params: Record<string, unknown> = {}
): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const key = JSON.stringify(params)
  useEffect(() => {
    let alive = true
    setLoading(true)
    window.api.git.data(projectId, kind, params).then((d) => {
      if (alive) {
        setData(d as T)
        setLoading(false)
      }
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, kind, bump, key])
  return { data, loading }
}

function Loading(): React.JSX.Element {
  return (
    <div className="flex items-center justify-center py-10 text-slate-500">
      <Spinner /> <span className="ml-2 text-sm">Loading…</span>
    </div>
  )
}

function Empty({ text }: { text: string }): React.JSX.Element {
  return <div className="py-10 text-center text-sm text-slate-500">{text}</div>
}

// ── Changes ─────────────────────────────────────────────────────────────────

interface FileCode {
  path: string
  code: string
}
interface Overview {
  ok: boolean
  is_repo?: boolean
  staged?: FileCode[]
  unstaged?: FileCode[]
  untracked?: string[]
  conflicts?: FileCode[]
  clean?: boolean
  in_progress?: string | null
}

function FileRow({
  name,
  actions,
  onView
}: {
  name: string
  actions: React.JSX.Element
  onView?: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-slate-800/50">
      {onView ? (
        <button onClick={onView} className="truncate text-left font-mono text-xs text-slate-300 hover:text-indigo-300" title="View diff">
          {name}
        </button>
      ) : (
        <span className="truncate font-mono text-xs text-slate-300">{name}</span>
      )}
      <div className="flex shrink-0 gap-1">{actions}</div>
    </div>
  )
}

function ChangesTab({
  projectId,
  bump,
  act,
  requestDanger,
  openDiff
}: {
  projectId: string
  bump: number
  act: ActFn
  requestDanger: DangerFn
  openDiff: (file: string, staged: boolean) => void
}): React.JSX.Element {
  const { data, loading } = useGitData<Overview>(projectId, 'overview', bump)
  const [msg, setMsg] = useState('')
  if (loading) return <Loading />
  if (!data?.ok) return <Empty text="Could not read repository status." />
  const staged = data.staged ?? []
  const unstaged = data.unstaged ?? []
  const untracked = data.untracked ?? []
  const conflicts = data.conflicts ?? []
  const seq = data.in_progress
  const nothing = staged.length + unstaged.length + untracked.length + conflicts.length === 0

  return (
    <div className="space-y-4">
      {seq && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-medium text-amber-200">A {seq} is in progress.</p>
          <p className="mb-2 text-xs text-amber-300/80">Resolve conflicts and stage the files, then continue — or abort to undo.</p>
          <div className="flex gap-2">
            <Button variant="primary" className="text-xs" onClick={() => act('sequence', { command: 'continue' })}>
              Continue
            </Button>
            {seq !== 'merge' && (
              <Button variant="secondary" className="text-xs" onClick={() => act('sequence', { command: 'skip' })}>
                Skip
              </Button>
            )}
            <Button
              variant="danger"
              className="text-xs"
              onClick={() =>
                requestDanger({
                  title: `Abort ${seq}?`,
                  message: `Abort the in-progress ${seq} and return to the previous state.`,
                  confirmLabel: 'Abort',
                  onConfirm: () => void act('sequence', { command: 'abort' })
                })
              }
            >
              Abort
            </Button>
          </div>
        </div>
      )}
      {nothing ? (
        <Empty text="Working tree clean — nothing to commit." />
      ) : (
        <>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => act('stage', { all: true })} className="text-xs">
              Stage All
            </Button>
            <Button variant="secondary" onClick={() => act('unstage', { all: true })} className="text-xs">
              Unstage All
            </Button>
          </div>

          {conflicts.length > 0 && (
            <Group title={`Conflicts (${conflicts.length})`} tone="rose">
              {conflicts.map((f) => (
                <FileRow key={f.path} name={`${f.code}  ${f.path}`} actions={<span className="text-xs text-rose-400">resolve & stage</span>} />
              ))}
            </Group>
          )}

          {staged.length > 0 && (
            <Group title={`Staged (${staged.length})`} tone="emerald">
              {staged.map((f) => (
                <FileRow
                  key={f.path}
                  name={`${f.code}  ${f.path}`}
                  onView={() => openDiff(f.path, true)}
                  actions={
                    <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => act('unstage', { files: [f.path] })}>
                      Unstage
                    </Button>
                  }
                />
              ))}
            </Group>
          )}

          {unstaged.length > 0 && (
            <Group title={`Changed (${unstaged.length})`} tone="amber">
              {unstaged.map((f) => (
                <FileRow
                  key={f.path}
                  name={`${f.code}  ${f.path}`}
                  onView={() => openDiff(f.path, false)}
                  actions={
                    <>
                      <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => act('stage', { files: [f.path] })}>
                        Stage
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-2 py-0.5 text-xs text-rose-300"
                        onClick={() =>
                          requestDanger({
                            title: 'Discard changes?',
                            message: `Discard local changes to ${f.path}.`,
                            consequence: 'The uncommitted changes to this file will be permanently lost.',
                            confirmLabel: 'Discard',
                            onConfirm: () => void act('discard', { files: [f.path] })
                          })
                        }
                      >
                        Discard
                      </Button>
                    </>
                  }
                />
              ))}
            </Group>
          )}

          {untracked.length > 0 && (
            <Group title={`Untracked (${untracked.length})`} tone="slate">
              {untracked.map((p) => (
                <FileRow
                  key={p}
                  name={p}
                  onView={() => openDiff(p, false)}
                  actions={
                    <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => act('stage', { files: [p] })}>
                      Stage
                    </Button>
                  }
                />
              ))}
            </Group>
          )}
        </>
      )}

      <div className="border-t border-slate-800 pt-4">
        <div className="flex gap-2">
          <input className={inputClass} placeholder="Commit message…" value={msg} onChange={(e) => setMsg(e.target.value)} />
          <Button
            variant="primary"
            onClick={async () => {
              if (await act('commit', { message: msg, stage_all: false })) setMsg('')
            }}
          >
            Commit
          </Button>
        </div>
      </div>
    </div>
  )
}

function Group({
  title,
  tone,
  children
}: {
  title: string
  tone: 'emerald' | 'amber' | 'rose' | 'slate'
  children: React.ReactNode
}): React.JSX.Element {
  const color = {
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    rose: 'text-rose-300',
    slate: 'text-slate-300'
  }[tone]
  return (
    <div>
      <h4 className={`mb-1 text-xs font-semibold uppercase tracking-wide ${color}`}>{title}</h4>
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-1">{children}</div>
    </div>
  )
}

// ── History ─────────────────────────────────────────────────────────────────

interface Commit {
  sha: string
  short: string
  author: string
  date: string
  subject: string
  refs: string
}

function HistoryTab({
  projectId,
  bump,
  act,
  requestDanger,
  openShow
}: {
  projectId: string
  bump: number
  act: ActFn
  requestDanger: DangerFn
  openShow: (sha: string) => void
}): React.JSX.Element {
  const { data, loading } = useGitData<{ ok: boolean; commits?: Commit[] }>(projectId, 'log', bump, { limit: 80 })
  if (loading) return <Loading />
  const commits = data?.commits ?? []
  if (commits.length === 0) return <Empty text="No commits yet." />
  return (
    <div className="space-y-1">
      {commits.map((c) => (
        <div key={c.sha} className="group flex items-start justify-between gap-3 rounded-md px-2 py-2 hover:bg-slate-800/40">
          <button onClick={() => openShow(c.sha)} className="flex min-w-0 items-start gap-3 text-left">
            <span className="mt-0.5 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-indigo-300">{c.short}</span>
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-200">{c.subject}</p>
              <p className="text-xs text-slate-500">
                {c.author} · {c.date}
                {c.refs && <span className="ml-2 text-indigo-400">{c.refs}</span>}
              </p>
            </div>
          </button>
          <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => openShow(c.sha)}>
              View
            </Button>
            <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => act('revert', { sha: c.sha })}>
              Revert
            </Button>
            <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => act('cherry_pick', { sha: c.sha })}>
              Cherry-pick
            </Button>
            <Button
              variant="ghost"
              className="px-2 py-0.5 text-xs text-rose-300"
              onClick={() =>
                requestDanger({
                  title: 'Reset to this commit?',
                  message: `Hard-reset the current branch to ${c.short}.`,
                  consequence: 'All commits after this — and any uncommitted changes — will be permanently lost.',
                  confirmLabel: 'Hard Reset',
                  onConfirm: () => void act('reset', { mode: 'hard', target: c.sha })
                })
              }
            >
              Reset here
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Branches ────────────────────────────────────────────────────────────────

interface LocalBranch {
  name: string
  sha: string
  upstream: string
  current: boolean
}

function BranchesTab({
  projectId,
  bump,
  act,
  requestDanger
}: {
  projectId: string
  bump: number
  act: ActFn
  requestDanger: DangerFn
}): React.JSX.Element {
  const { data, loading } = useGitData<{ ok: boolean; current?: string; local?: LocalBranch[]; remote?: string[] }>(
    projectId,
    'branches',
    bump
  )
  const [newName, setNewName] = useState('')
  if (loading) return <Loading />
  const local = data?.local ?? []
  const remote = data?.remote ?? []

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className={inputClass} placeholder="New branch name…" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button
          variant="primary"
          onClick={async () => {
            if (await act('branch_create', { name: newName })) setNewName('')
          }}
        >
          Create
        </Button>
      </div>

      <Group title="Local Branches" tone="slate">
        {local.map((b) => (
          <FileRow
            key={b.name}
            name={`${b.current ? '● ' : ''}${b.name}${b.upstream ? `  → ${b.upstream}` : ''}`}
            actions={
              <>
                {!b.current && (
                  <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => act('branch_switch', { name: b.name })}>
                    Switch
                  </Button>
                )}
                {!b.current && (
                  <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => act('branch_merge', { name: b.name })}>
                    Merge
                  </Button>
                )}
                {!b.current && (
                  <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => act('rebase', { branch: b.name })}>
                    Rebase
                  </Button>
                )}
                {!b.current && (
                  <Button
                    variant="ghost"
                    className="px-2 py-0.5 text-xs text-rose-300"
                    onClick={() =>
                      requestDanger({
                        title: 'Delete branch?',
                        message: `Delete branch '${b.name}'.`,
                        consequence: 'If it has unmerged commits, force delete will permanently drop them.',
                        confirmLabel: 'Delete',
                        onConfirm: () => void act('branch_delete', { name: b.name, force: true })
                      })
                    }
                  >
                    Delete
                  </Button>
                )}
              </>
            }
          />
        ))}
      </Group>

      {remote.length > 0 && (
        <Group title="Remote Branches" tone="slate">
          {remote.map((r) => (
            <FileRow key={r} name={r} actions={<span />} />
          ))}
        </Group>
      )}
    </div>
  )
}

// ── Remotes ─────────────────────────────────────────────────────────────────

interface Remote {
  name: string
  fetch: string
  push: string
}

function RemotesTab({
  projectId,
  bump,
  act,
  requestDanger
}: {
  projectId: string
  bump: number
  act: ActFn
  requestDanger: DangerFn
}): React.JSX.Element {
  const { data, loading } = useGitData<{ ok: boolean; remotes?: Remote[] }>(projectId, 'remotes', bump)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  if (loading) return <Loading />
  const remotes = data?.remotes ?? []
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className={`${inputClass} max-w-40`} placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputClass} placeholder="https://github.com/user/repo.git" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button
          variant="primary"
          onClick={async () => {
            if (await act('remote_add', { name, url })) {
              setName('')
              setUrl('')
            }
          }}
        >
          Add
        </Button>
      </div>
      <Group title="Remotes" tone="slate">
        {remotes.length === 0 ? (
          <div className="px-2 py-3 text-sm text-slate-500">No remotes configured.</div>
        ) : (
          remotes.map((r) => (
            <FileRow
              key={r.name}
              name={`${r.name}  →  ${r.fetch}`}
              actions={
                <Button
                  variant="ghost"
                  className="px-2 py-0.5 text-xs text-rose-300"
                  onClick={() =>
                    requestDanger({
                      title: 'Remove remote?',
                      message: `Remove remote '${r.name}'.`,
                      confirmLabel: 'Remove',
                      onConfirm: () => void act('remote_remove', { name: r.name })
                    })
                  }
                >
                  Remove
                </Button>
              }
            />
          ))
        )}
      </Group>
    </div>
  )
}

// ── Stash ───────────────────────────────────────────────────────────────────

interface Stash {
  index: number
  ref: string
  message: string
  age: string
}

function StashTab({
  projectId,
  bump,
  act,
  requestDanger
}: {
  projectId: string
  bump: number
  act: ActFn
  requestDanger: DangerFn
}): React.JSX.Element {
  const { data, loading } = useGitData<{ ok: boolean; stashes?: Stash[] }>(projectId, 'stashes', bump)
  if (loading) return <Loading />
  const stashes = data?.stashes ?? []
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => act('stash', { action: 'save', include_untracked: true })}>
          Stash changes
        </Button>
        {stashes.length > 0 && (
          <Button
            variant="ghost"
            className="text-rose-300"
            onClick={() =>
              requestDanger({
                title: 'Clear all stashes?',
                message: 'Delete every stash entry.',
                consequence: 'All stashed changes will be permanently lost.',
                confirmLabel: 'Clear All',
                onConfirm: () => void act('stash', { action: 'clear' })
              })
            }
          >
            Clear all
          </Button>
        )}
      </div>
      <Group title="Stashes" tone="slate">
        {stashes.length === 0 ? (
          <div className="px-2 py-3 text-sm text-slate-500">No stashes.</div>
        ) : (
          stashes.map((s) => (
            <FileRow
              key={s.ref}
              name={`${s.ref}: ${s.message} (${s.age})`}
              actions={
                <>
                  <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => act('stash', { action: 'pop', ref: s.ref })}>
                    Pop
                  </Button>
                  <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => act('stash', { action: 'apply', ref: s.ref })}>
                    Apply
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2 py-0.5 text-xs text-rose-300"
                    onClick={() =>
                      requestDanger({
                        title: 'Drop stash?',
                        message: `Drop ${s.ref}.`,
                        consequence: 'This stash entry will be permanently lost.',
                        confirmLabel: 'Drop',
                        onConfirm: () => void act('stash', { action: 'drop', ref: s.ref })
                      })
                    }
                  >
                    Drop
                  </Button>
                </>
              }
            />
          ))
        )}
      </Group>
    </div>
  )
}

// ── Terminal ────────────────────────────────────────────────────────────────

function TerminalTab({ projectId }: { projectId: string }): React.JSX.Element {
  const [cmd, setCmd] = useState('')
  const [lines, setLines] = useState<{ cmd: string; out: string; ok: boolean }[]>([])
  const [busy, setBusy] = useState(false)

  async function run(): Promise<void> {
    if (!cmd.trim()) return
    setBusy(true)
    const r = await window.api.git.action(projectId, 'terminal', { command: cmd })
    setBusy(false)
    setLines((l) => [...l, { cmd: r.message, out: r.output ?? '', ok: r.success }])
    setCmd('')
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Runs any git command in this repo. Only git is invoked — no shell.</p>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-800 bg-black/40 p-3 font-mono text-xs">
        {lines.length === 0 ? (
          <span className="text-slate-600">Output appears here…</span>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="mb-2">
              <div className={l.ok ? 'text-emerald-400' : 'text-rose-400'}>{l.cmd}</div>
              <pre className="whitespace-pre-wrap break-words text-slate-300">{l.out}</pre>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <span className="flex items-center font-mono text-sm text-slate-500">git</span>
        <input
          className={`${inputClass} font-mono`}
          placeholder="status --short"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <Button variant="primary" onClick={run} disabled={busy}>
          Run
        </Button>
      </div>
    </div>
  )
}

// ── Tags ────────────────────────────────────────────────────────────────────

function TagsTab({
  projectId,
  bump,
  act,
  requestDanger
}: {
  projectId: string
  bump: number
  act: ActFn
  requestDanger: DangerFn
}): React.JSX.Element {
  const { data, loading } = useGitData<{ ok: boolean; tags?: string[] }>(projectId, 'tags', bump)
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  if (loading) return <Loading />
  const tags = data?.tags ?? []
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className={`${inputClass} max-w-40`} placeholder="v1.0.0" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputClass} placeholder="annotation message (optional)" value={msg} onChange={(e) => setMsg(e.target.value)} />
        <Button
          variant="primary"
          onClick={async () => {
            if (await act('tag', { action: 'create', name, message: msg })) {
              setName('')
              setMsg('')
            }
          }}
        >
          Create
        </Button>
      </div>
      <Group title="Tags" tone="slate">
        {tags.length === 0 ? (
          <div className="px-2 py-3 text-sm text-slate-500">No tags.</div>
        ) : (
          tags.map((t) => (
            <FileRow
              key={t}
              name={t}
              actions={
                <>
                  <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => act('tag', { action: 'push', name: t })}>
                    Push
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2 py-0.5 text-xs text-rose-300"
                    onClick={() =>
                      requestDanger({
                        title: 'Delete tag?',
                        message: `Delete tag '${t}'.`,
                        confirmLabel: 'Delete',
                        onConfirm: () => void act('tag', { action: 'delete', name: t })
                      })
                    }
                  >
                    Delete
                  </Button>
                </>
              }
            />
          ))
        )}
      </Group>
    </div>
  )
}

// ── Diff viewer ─────────────────────────────────────────────────────────────

function colorizeDiff(text: string): React.JSX.Element[] {
  return text.split('\n').map((line, i) => {
    let cls = 'text-slate-400'
    if (line.startsWith('+') && !line.startsWith('+++')) cls = 'text-emerald-400'
    else if (line.startsWith('-') && !line.startsWith('---')) cls = 'text-rose-400'
    else if (line.startsWith('@@')) cls = 'text-indigo-400'
    else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('+++') || line.startsWith('---'))
      cls = 'text-slate-500'
    return (
      <div key={i} className={cls}>
        {line || ' '}
      </div>
    )
  })
}

function DiffModal({ diff, onClose }: { diff: DiffView | null; onClose: () => void }): React.JSX.Element | null {
  if (!diff) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700/70 px-5 py-3.5">
          <h3 className="truncate font-mono text-sm text-slate-100">{diff.title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100">
            ✕
          </button>
        </div>
        <div className="overflow-auto px-5 py-4 font-mono text-xs leading-relaxed">{colorizeDiff(diff.body)}</div>
      </div>
    </div>
  )
}

// ── Reflog recovery ─────────────────────────────────────────────────────────

interface ReflogEntry {
  short: string
  selector: string
  subject: string
}

function ReflogModal({
  open,
  projectId,
  onClose,
  act,
  requestDanger
}: {
  open: boolean
  projectId: string
  onClose: () => void
  act: ActFn
  requestDanger: DangerFn
}): React.JSX.Element {
  const [entries, setEntries] = useState<ReflogEntry[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!open) return
    setLoading(true)
    window.api.git.data(projectId, 'reflog', { limit: 60 }).then((d) => {
      setEntries((d.entries as ReflogEntry[]) ?? [])
      setLoading(false)
    })
  }, [open, projectId])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Recovery — Reflog"
      size="lg"
      footer={
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <p className="mb-3 text-xs text-slate-500">
        Every HEAD movement is recorded here. If a reset or rebase lost work, reset back to the entry just before it.
      </p>
      {loading ? (
        <Loading />
      ) : entries.length === 0 ? (
        <Empty text="No reflog entries." />
      ) : (
        <div className="space-y-1">
          {entries.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-slate-800/50">
              <div className="min-w-0 truncate font-mono text-xs">
                <span className="text-indigo-300">{e.short}</span> <span className="text-slate-500">{e.selector}</span>{' '}
                <span className="text-slate-300">{e.subject}</span>
              </div>
              <Button
                variant="ghost"
                className="shrink-0 px-2 py-0.5 text-xs text-amber-300"
                onClick={() =>
                  requestDanger({
                    title: 'Reset here?',
                    message: `Hard-reset HEAD to ${e.short} (${e.selector}).`,
                    consequence: 'Your working tree will match that point; uncommitted changes are lost.',
                    confirmLabel: 'Reset',
                    onConfirm: () => {
                      void act('reset', { mode: 'hard', target: e.short })
                      onClose()
                    }
                  })
                }
              >
                Reset here
              </Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
