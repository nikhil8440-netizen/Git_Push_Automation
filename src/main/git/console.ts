/**
 * console.ts — Visual Git Control Panel engine (port of git_console.py).
 *
 *   engine.ts  → automated BACKUP engine (safe, never destructive).
 *   console.ts → manual CONTROL PANEL engine (full power; destructive ops are
 *                gated in the UI behind the red confirm overlay, never here).
 *
 * Every git call goes through cgit() → runGit() (GIT_TERMINAL_PROMPT=0). Read
 * functions return rich objects the renderer renders directly. Action functions
 * return { success, message, output }. This module never decides whether a
 * destructive op is "allowed" — it executes what it is asked and logs changes.
 */
import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import type { ConsoleActionResult, GitDataKind, GitOp, Project, RepoStats } from '../../shared/types'
import { getProject } from '../store/config'
import { logEvent, formatTimestamp } from '../store/logger'
import { runGit, checkGitInstalled, getRepoSizeBytes } from './run'

const US = '\x1f'
const RS = '\x1e'

type Params = Record<string, unknown>

export interface ConsoleQueryResult {
  ok: boolean
  error?: string
  [key: string]: unknown
}

interface CRun {
  ok: boolean
  returncode: number
  stdout: string
  stderr: string
  command: string
}

// ── helpers ───────────────────────────────────────────────────────────────

let gitInstalled: boolean | null = null
async function ensureGit(): Promise<boolean> {
  if (gitInstalled === null) gitInstalled = await checkGitInstalled()
  return gitInstalled
}

function isDir(p: string): boolean {
  try {
    return !!p && statSync(p).isDirectory()
  } catch {
    return false
  }
}

function isRepo(path: string): boolean {
  return !!path && existsSync(join(path, '.git'))
}

async function cgit(
  path: string,
  args: string[],
  opts: { timeoutMs?: number; input?: string; requireRepo?: boolean } = {}
): Promise<CRun> {
  const command = 'git ' + args.join(' ')
  if (!(await ensureGit())) {
    return { ok: false, returncode: -1, stdout: '', stderr: 'Git is not installed or not in PATH.', command }
  }
  if (!isDir(path)) {
    return { ok: false, returncode: -1, stdout: '', stderr: `Folder does not exist: ${path}`, command }
  }
  if (opts.requireRepo !== false && !isRepo(path)) {
    return {
      ok: false,
      returncode: -1,
      stdout: '',
      stderr: 'This folder is not a Git repository yet. Run a backup once (Run Now) to initialize it.',
      command
    }
  }
  const r = await runGit(args, { cwd: path, input: opts.input, timeoutMs: opts.timeoutMs ?? 120000 })
  return { ok: r.ok, returncode: r.code, stdout: r.stdout, stderr: r.stderr, command }
}

function resolve(projectId: string): { project: Project | null; path: string | null; error: string | null } {
  const project = getProject(projectId)
  if (!project) return { project: null, path: null, error: 'Project not found.' }
  const path = project.path
  if (!isDir(path)) return { project, path: null, error: `Folder missing: ${path} does not exist.` }
  return { project, path, error: null }
}

function inProgress(path: string): 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null {
  const g = join(path, '.git')
  if (existsSync(join(g, 'rebase-merge')) || existsSync(join(g, 'rebase-apply'))) return 'rebase'
  if (existsSync(join(g, 'MERGE_HEAD'))) return 'merge'
  if (existsSync(join(g, 'CHERRY_PICK_HEAD'))) return 'cherry-pick'
  if (existsSync(join(g, 'REVERT_HEAD'))) return 'revert'
  return null
}

function result(ok: boolean, message: string, output = ''): ConsoleActionResult {
  return { success: Boolean(ok), message, output: output || '' }
}

function fromRun(res: CRun, successMsg: string, failPrefix = 'Operation failed'): ConsoleActionResult {
  if (res.ok) {
    const out = (res.stdout || res.stderr || '').trim()
    return result(true, successMsg, out)
  }
  const err = (res.stderr || res.stdout || '').trim()
  return result(false, err ? `${failPrefix}: ${err}` : failPrefix, err)
}

function logOp(project: Project | null, status: string, message: string, res?: CRun): void {
  const name = project ? project.name : 'Console'
  logEvent(name, status, message, res?.stdout ?? '', res?.stderr ?? '')
}

function unquote(p: string): string {
  p = p.trim()
  if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1)
  return p
}

// param accessors
const pStr = (p: Params, k: string): string => (typeof p[k] === 'string' ? (p[k] as string) : '')
const pBool = (p: Params, k: string): boolean => Boolean(p[k])
const pBoolD = (p: Params, k: string, dflt: boolean): boolean => (p[k] === undefined ? dflt : Boolean(p[k]))
const pNum = (p: Params, k: string, dflt: number): number => {
  const n = Number(p[k])
  return Number.isFinite(n) ? Math.trunc(n) : dflt
}
const truthy = (v: unknown): boolean => ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase())

function filesList(p: Params): string[] {
  let files = p.files
  if (typeof files === 'string') files = [files]
  if (!Array.isArray(files)) return []
  return files.filter((f): f is string => typeof f === 'string' && f.trim() !== '')
}

// ── queries (read-only) ───────────────────────────────────────────────────

interface BranchInfo {
  branch: string
  upstream: string
  ahead: number
  behind: number
  detached: boolean
  no_commits: boolean
}

function parseBranchLine(line: string): BranchInfo {
  const info: BranchInfo = { branch: '', upstream: '', ahead: 0, behind: 0, detached: false, no_commits: false }
  const rest = line.slice(2).trim()

  if (rest.startsWith('No commits yet on ')) {
    info.branch = rest.slice('No commits yet on '.length).trim()
    info.no_commits = true
    return info
  }
  if (rest.startsWith('HEAD (no branch)')) {
    info.detached = true
    info.branch = 'HEAD (detached)'
    return info
  }

  let track = ''
  let mainPart = rest
  if (rest.includes(' [') && rest.trimEnd().endsWith(']')) {
    const idx = rest.indexOf(' [')
    mainPart = rest.slice(0, idx)
    track = rest.slice(idx + 2).replace(/\]$/, '')
  }
  if (mainPart.includes('...')) {
    const [b, up] = mainPart.split('...')
    info.branch = b.trim()
    info.upstream = (up ?? '').trim()
  } else {
    info.branch = mainPart.trim()
  }
  if (track) {
    const a = track.match(/ahead (\d+)/)
    if (a) info.ahead = parseInt(a[1], 10)
    const bh = track.match(/behind (\d+)/)
    if (bh) info.behind = parseInt(bh[1], 10)
  }
  return info
}

export async function getOverview(projectId: string): Promise<ConsoleQueryResult> {
  const { project, path, error } = resolve(projectId)
  if (error) return { ok: false, error }
  if (!isRepo(path!)) {
    return {
      ok: true,
      is_repo: false,
      path,
      origin: project!.origin,
      branch_config: project!.branch || 'main'
    }
  }
  const res = await cgit(path!, ['status', '-b', '--porcelain', '--untracked-files=all'])
  if (!res.ok) return { ok: false, error: res.stderr || 'git status failed' }

  let branch: BranchInfo = { branch: '', upstream: '', ahead: 0, behind: 0, detached: false, no_commits: false }
  const staged: { path: string; code: string }[] = []
  const unstaged: { path: string; code: string }[] = []
  const untracked: string[] = []
  const conflicts: { path: string; code: string }[] = []

  for (const line of res.stdout.split(/\r?\n/)) {
    if (!line) continue
    if (line.startsWith('##')) {
      branch = parseBranchLine(line)
      continue
    }
    const xy = line.slice(0, 2)
    let rest = line.slice(3)
    const x = xy[0]
    const y = xy[1]
    if (rest.includes('->')) rest = rest.split('->').slice(1).join('->')
    const pathname = unquote(rest)

    if (xy === '??') {
      untracked.push(pathname)
      continue
    }
    if (xy.includes('U') || xy === 'DD' || xy === 'AA') {
      conflicts.push({ path: pathname, code: xy })
      continue
    }
    if (x !== ' ' && x !== '?') staged.push({ path: pathname, code: x })
    if (y !== ' ' && y !== '?') unstaged.push({ path: pathname, code: y })
  }

  return {
    ok: true,
    is_repo: true,
    path,
    origin: project!.origin,
    branch,
    staged,
    unstaged,
    untracked,
    conflicts,
    clean: !(staged.length || unstaged.length || untracked.length || conflicts.length),
    in_progress: inProgress(path!)
  }
}

export async function getLog(projectId: string, limit = 60, branch?: string): Promise<ConsoleQueryResult> {
  const { path, error } = resolve(projectId)
  if (error) return { ok: false, error }
  if (!isRepo(path!)) return { ok: true, commits: [] }

  const fmt = ['%H', '%h', '%an', '%ae', '%ad', '%s', '%D'].join(US)
  const args = ['log', `--pretty=format:${fmt}${RS}`, '--date=format:%Y-%m-%d %H:%M', `-n${limit}`]
  if (branch) args.push(branch)
  const res = await cgit(path!, args)
  if (!res.ok) {
    if (res.stderr.includes('does not have any commits yet') || res.stderr.includes('bad revision')) {
      return { ok: true, commits: [] }
    }
    return { ok: false, error: res.stderr }
  }

  const commits: Record<string, string>[] = []
  for (let chunk of res.stdout.split(RS)) {
    chunk = chunk.replace(/^\n+|\n+$/g, '')
    if (!chunk) continue
    const parts = chunk.split(US)
    if (parts.length < 6) continue
    commits.push({
      sha: parts[0],
      short: parts[1],
      author: parts[2],
      email: parts[3],
      date: parts[4],
      subject: parts[5],
      refs: (parts[6] ?? '').trim()
    })
  }
  return { ok: true, commits }
}

export async function getBranches(projectId: string): Promise<ConsoleQueryResult> {
  const { path, error } = resolve(projectId)
  if (error) return { ok: false, error }
  if (!isRepo(path!)) return { ok: true, current: '', local: [], remote: [] }

  const cur = await cgit(path!, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const current = cur.ok ? cur.stdout.trim() : ''

  const local: { name: string; sha: string; upstream: string; current: boolean }[] = []
  const lr = await cgit(path!, [
    'for-each-ref',
    '--sort=-committerdate',
    `--format=%(refname:short)${US}%(objectname:short)${US}%(upstream:short)`,
    'refs/heads'
  ])
  if (lr.ok) {
    for (const line of lr.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue
      const p = line.split(US)
      local.push({ name: p[0], sha: p[1] ?? '', upstream: p[2] ?? '', current: p[0] === current })
    }
  }

  const remote: string[] = []
  const rr = await cgit(path!, ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/remotes'])
  if (rr.ok) {
    for (const line of rr.stdout.split(/\r?\n/)) {
      const name = line.trim()
      if (name && !name.endsWith('/HEAD')) remote.push(name)
    }
  }
  return { ok: true, current, local, remote }
}

export async function getRemotes(projectId: string): Promise<ConsoleQueryResult> {
  const { path, error } = resolve(projectId)
  if (error) return { ok: false, error }
  if (!isRepo(path!)) return { ok: true, remotes: [] }

  const res = await cgit(path!, ['remote', '-v'])
  if (!res.ok) return { ok: false, error: res.stderr }

  const seen = new Map<string, { name: string; fetch: string; push: string }>()
  for (const line of res.stdout.split(/\r?\n/)) {
    const m = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)/)
    if (!m) continue
    const [, name, url, kind] = m
    if (!seen.has(name)) seen.set(name, { name, fetch: '', push: '' })
    const entry = seen.get(name)!
    if (kind === 'fetch') entry.fetch = url
    else entry.push = url
  }
  return { ok: true, remotes: [...seen.values()] }
}

export async function getStashes(projectId: string): Promise<ConsoleQueryResult> {
  const { path, error } = resolve(projectId)
  if (error) return { ok: false, error }
  if (!isRepo(path!)) return { ok: true, stashes: [] }
  const res = await cgit(path!, ['stash', 'list', `--pretty=format:%gd${US}%s${US}%cr`])
  const stashes: { index: number; ref: string; message: string; age: string }[] = []
  if (res.ok) {
    res.stdout.split(/\r?\n/).forEach((line, i) => {
      if (!line.trim()) return
      const p = line.split(US)
      stashes.push({ index: i, ref: p[0], message: p[1] ?? '', age: p[2] ?? '' })
    })
  }
  return { ok: true, stashes }
}

export async function getTags(projectId: string): Promise<ConsoleQueryResult> {
  const { path, error } = resolve(projectId)
  if (error) return { ok: false, error }
  if (!isRepo(path!)) return { ok: true, tags: [] }
  const res = await cgit(path!, ['tag', '--sort=-creatordate'])
  const tags = res.ok ? res.stdout.split(/\r?\n/).map((t) => t.trim()).filter(Boolean) : []
  return { ok: true, tags }
}

export async function getDiff(projectId: string, filePath: string, staged = false): Promise<ConsoleQueryResult> {
  const { path, error } = resolve(projectId)
  if (error) return { ok: false, error }
  if (!isRepo(path!)) return { ok: false, error: 'Not a git repository.' }
  const args = ['diff', '--no-color']
  if (staged) args.push('--cached')
  args.push('--', filePath)
  const res = await cgit(path!, args)
  let diff = res.stdout
  if (!diff.trim() && !staged) {
    const full = join(path!, filePath)
    try {
      if (statSync(full).isFile()) {
        const body = readFileSync(full, 'utf-8').slice(0, 200000)
        diff = '(untracked file — full contents)\n\n' + body
      }
    } catch {
      diff = '(untracked binary or unreadable file)'
    }
  }
  return { ok: true, diff: diff || '(no differences)' }
}

export async function getConfig(projectId: string): Promise<ConsoleQueryResult> {
  const { path, error } = resolve(projectId)
  if (error) return { ok: false, error }
  if (!isRepo(path!)) return { ok: true, name: '', email: '' }
  const cfg = async (key: string): Promise<string> => {
    const r = await cgit(path!, ['config', '--get', key])
    return r.ok ? r.stdout.trim() : ''
  }
  return { ok: true, name: await cfg('user.name'), email: await cfg('user.email') }
}

export async function getReflog(projectId: string, limit = 50): Promise<ConsoleQueryResult> {
  const { path, error } = resolve(projectId)
  if (error) return { ok: false, error }
  if (!isRepo(path!)) return { ok: true, entries: [] }
  const res = await cgit(path!, ['reflog', `--format=%h${US}%gd${US}%gs`, `-n${limit}`])
  const entries: { short: string; selector: string; subject: string }[] = []
  if (res.ok) {
    for (const line of res.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue
      const p = line.split(US)
      entries.push({ short: p[0], selector: p[1] ?? '', subject: p[2] ?? '' })
    }
  }
  return { ok: true, entries }
}

export async function getShow(projectId: string, sha: string): Promise<ConsoleQueryResult> {
  const { path, error } = resolve(projectId)
  if (error) return { ok: false, error }
  if (!isRepo(path!) || !sha) return { ok: false, error: 'Not a git repository or no commit specified.' }
  const res = await cgit(path!, ['show', '--no-color', '--stat', '-p', sha])
  return { ok: true, diff: res.ok ? res.stdout : res.stderr || '(could not load commit)' }
}

export async function query(projectId: string, kind: GitDataKind, params: Params): Promise<ConsoleQueryResult> {
  const p = params || {}
  try {
    switch (kind) {
      case 'overview':
        return await getOverview(projectId)
      case 'log':
        return await getLog(projectId, pNum(p, 'limit', 60), pStr(p, 'branch') || undefined)
      case 'branches':
        return await getBranches(projectId)
      case 'remotes':
        return await getRemotes(projectId)
      case 'stashes':
        return await getStashes(projectId)
      case 'tags':
        return await getTags(projectId)
      case 'diff':
        return await getDiff(projectId, pStr(p, 'file'), truthy(p.staged))
      case 'config':
        return await getConfig(projectId)
      case 'reflog':
        return await getReflog(projectId, pNum(p, 'limit', 50))
      case 'show':
        return await getShow(projectId, pStr(p, 'sha'))
      default:
        return { ok: false, error: `Unknown query: ${kind}` }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── actions (mutating) ────────────────────────────────────────────────────

type ActionFn = (path: string, params: Params, project: Project | null) => Promise<ConsoleActionResult>

const actStage: ActionFn = async (path, params) => {
  if (params.all) return fromRun(await cgit(path, ['add', '-A']), 'Staged all changes.', 'Failed to stage')
  const files = filesList(params)
  if (!files.length) return result(false, 'No files specified to stage.')
  return fromRun(await cgit(path, ['add', '--', ...files]), `Staged ${files.length} file(s).`, 'Failed to stage')
}

const actUnstage: ActionFn = async (path, params) => {
  if (params.all) return fromRun(await cgit(path, ['reset', '-q', 'HEAD', '--']), 'Unstaged all changes.', 'Failed to unstage')
  const files = filesList(params)
  if (!files.length) return result(false, 'No files specified to unstage.')
  return fromRun(await cgit(path, ['reset', '-q', 'HEAD', '--', ...files]), `Unstaged ${files.length} file(s).`, 'Failed to unstage')
}

const actDiscard: ActionFn = async (path, params, project) => {
  const files = filesList(params)
  if (!files.length) return result(false, 'No files specified to discard.')
  let res = await cgit(path, ['checkout', '--', ...files])
  if (!res.ok && params.include_untracked) {
    await cgit(path, ['clean', '-fd', '--', ...files])
    res = { ok: true, stdout: '', stderr: '', returncode: 0, command: 'git clean -fd' }
  }
  const out = fromRun(res, `Discarded changes in ${files.length} file(s).`, 'Failed to discard')
  if (out.success) logOp(project, 'WARNING', `Discarded local changes in ${files.length} file(s).`)
  return out
}

const actCommit: ActionFn = async (path, params, project) => {
  let message = pStr(params, 'message').trim()
  const amend = pBool(params, 'amend')
  if (!message && !amend) message = `Manual commit - ${formatTimestamp()}`
  if (params.stage_all) await cgit(path, ['add', '-A'])
  const args = ['commit']
  if (amend) args.push('--amend')
  if (message) args.push('-m', message)
  else if (amend) args.push('--no-edit')
  const res = await cgit(path, args)
  if (!res.ok) {
    const low = (res.stderr + res.stdout).toLowerCase()
    if (low.includes('nothing to commit')) return result(false, 'Nothing staged to commit.')
    return fromRun(res, '', 'Commit failed')
  }
  const verb = amend ? 'Amended commit' : 'Committed'
  logOp(project, 'SUCCESS', `${verb} via control panel: "${message || '(no message change)'}"`, res)
  return result(true, `${verb} successfully.`, res.stdout || res.stderr)
}

async function currentBranch(path: string): Promise<string> {
  const cur = await cgit(path, ['rev-parse', '--abbrev-ref', 'HEAD'])
  return cur.ok ? cur.stdout.trim() : 'main'
}

const actPush: ActionFn = async (path, params, project) => {
  const remote = pStr(params, 'remote') || 'origin'
  const branch = pStr(params, 'branch') || (await currentBranch(path))
  const force = pBool(params, 'force')
  const setUpstream = pBoolD(params, 'set_upstream', true)
  const args = ['push']
  if (setUpstream) args.push('-u')
  if (force) args.push('--force-with-lease') // safer than raw --force
  args.push(remote, branch)
  const res = await cgit(path, args, { timeoutMs: 120000 })
  if (res.ok) {
    logOp(project, 'SUCCESS', `${force ? 'Force-pushed' : 'Pushed'} ${branch} -> ${remote} via control panel.`, res)
    return result(true, `${force ? 'Force-pushed' : 'Pushed'} ${branch} to ${remote}.`, res.stdout || res.stderr)
  }
  return fromRun(res, '', 'Push failed')
}

const actPull: ActionFn = async (path, params, project) => {
  const remote = pStr(params, 'remote') || 'origin'
  const branch = pStr(params, 'branch') || (await currentBranch(path))
  const args = ['pull']
  if (params.rebase) args.push('--rebase')
  args.push(remote, branch)
  const res = await cgit(path, args, { timeoutMs: 120000 })
  if (res.ok) {
    logOp(project, 'SUCCESS', `Pulled ${branch} from ${remote} via control panel.`, res)
    return result(true, `Pulled ${branch} from ${remote}.`, res.stdout || res.stderr)
  }
  return fromRun(res, '', 'Pull failed')
}

const actFetch: ActionFn = async (path, params) => {
  const remote = pStr(params, 'remote') || 'origin'
  const args = remote ? ['fetch', '--prune', remote] : ['fetch', '--all', '--prune']
  return fromRun(await cgit(path, args, { timeoutMs: 120000 }), `Fetched from ${remote}.`, 'Fetch failed')
}

const actBranchCreate: ActionFn = async (path, params, project) => {
  const name = pStr(params, 'name').trim()
  if (!name) return result(false, 'Branch name is required.')
  const checkout = pBoolD(params, 'checkout', true)
  const start = pStr(params, 'start_point')
  const args = checkout ? ['checkout', '-b', name] : ['branch', name]
  if (start) args.push(start)
  const res = await cgit(path, args)
  if (res.ok) logOp(project, 'SUCCESS', `Created branch '${name}' via control panel.`, res)
  return fromRun(res, `Created branch '${name}'.`, 'Failed to create branch')
}

const actBranchSwitch: ActionFn = async (path, params, project) => {
  const name = pStr(params, 'name').trim()
  if (!name) return result(false, 'Branch name is required.')
  const res = await cgit(path, ['checkout', name])
  if (res.ok) logOp(project, 'SUCCESS', `Switched to branch '${name}' via control panel.`, res)
  return fromRun(res, `Switched to '${name}'.`, 'Failed to switch branch')
}

const actBranchMerge: ActionFn = async (path, params, project) => {
  const name = pStr(params, 'name').trim()
  if (!name) return result(false, 'Branch to merge is required.')
  const args = ['merge']
  if (params.no_ff) args.push('--no-ff')
  args.push(name)
  const res = await cgit(path, args)
  if (res.ok) {
    logOp(project, 'SUCCESS', `Merged '${name}' via control panel.`, res)
    return result(true, `Merged '${name}'.`, res.stdout || res.stderr)
  }
  const low = (res.stdout + res.stderr).toLowerCase()
  if (low.includes('conflict')) {
    return result(
      false,
      'Merge produced conflicts. Resolve them in the Changes tab, then commit. (git output below)',
      res.stdout + '\n' + res.stderr
    )
  }
  return fromRun(res, '', 'Merge failed')
}

const actBranchDelete: ActionFn = async (path, params, project) => {
  const name = pStr(params, 'name').trim()
  if (!name) return result(false, 'Branch name is required.')
  const force = pBool(params, 'force')
  const res = await cgit(path, ['branch', force ? '-D' : '-d', name])
  if (res.ok) {
    logOp(project, 'WARNING', `Deleted branch '${name}'${force ? ' (forced)' : ''} via control panel.`, res)
    return result(true, `Deleted branch '${name}'.`, res.stdout || res.stderr)
  }
  if (res.stderr.toLowerCase().includes('not fully merged')) {
    return result(false, `Branch '${name}' is not fully merged. Use force delete to remove it anyway.`, res.stderr)
  }
  return fromRun(res, '', 'Failed to delete branch')
}

const actRemoteAdd: ActionFn = async (path, params, project) => {
  const name = pStr(params, 'name').trim()
  const url = pStr(params, 'url').trim()
  if (!name || !url) return result(false, 'Both remote name and URL are required.')
  const res = await cgit(path, ['remote', 'add', name, url])
  if (res.ok) logOp(project, 'SUCCESS', `Added remote '${name}' -> ${url} via control panel.`, res)
  return fromRun(res, `Added remote '${name}'.`, 'Failed to add remote')
}

const actRemoteSeturl: ActionFn = async (path, params, project) => {
  const name = pStr(params, 'name').trim()
  const url = pStr(params, 'url').trim()
  if (!name || !url) return result(false, 'Both remote name and URL are required.')
  const res = await cgit(path, ['remote', 'set-url', name, url])
  if (res.ok) logOp(project, 'SUCCESS', `Updated remote '${name}' -> ${url} via control panel.`, res)
  return fromRun(res, `Updated remote '${name}'.`, 'Failed to update remote')
}

const actRemoteRemove: ActionFn = async (path, params, project) => {
  const name = pStr(params, 'name').trim()
  if (!name) return result(false, 'Remote name is required.')
  const res = await cgit(path, ['remote', 'remove', name])
  if (res.ok) logOp(project, 'WARNING', `Removed remote '${name}' via control panel.`, res)
  return fromRun(res, `Removed remote '${name}'.`, 'Failed to remove remote')
}

const actReset: ActionFn = async (path, params, project) => {
  const mode = (pStr(params, 'mode') || 'mixed').toLowerCase()
  const target = (pStr(params, 'target') || 'HEAD').trim()
  if (!['soft', 'mixed', 'hard'].includes(mode)) return result(false, `Invalid reset mode: ${mode}`)
  const res = await cgit(path, ['reset', `--${mode}`, target])
  if (res.ok) {
    logOp(project, mode === 'hard' ? 'WARNING' : 'SUCCESS', `Reset --${mode} to ${target} via control panel.`, res)
    return result(true, `Reset --${mode} to ${target}.`, res.stdout || res.stderr)
  }
  return fromRun(res, '', 'Reset failed')
}

const actRevert: ActionFn = async (path, params, project) => {
  const sha = pStr(params, 'sha').trim()
  if (!sha) return result(false, 'Commit SHA is required.')
  const res = await cgit(path, ['revert', '--no-edit', sha])
  if (res.ok) {
    logOp(project, 'SUCCESS', `Reverted commit ${sha.slice(0, 8)} via control panel.`, res)
    return result(true, `Reverted commit ${sha.slice(0, 8)}.`, res.stdout || res.stderr)
  }
  if ((res.stdout + res.stderr).toLowerCase().includes('conflict')) {
    return result(false, 'Revert produced conflicts. Resolve them in the Changes tab, then commit.', res.stdout + '\n' + res.stderr)
  }
  return fromRun(res, '', 'Revert failed')
}

const actCherryPick: ActionFn = async (path, params, project) => {
  const sha = pStr(params, 'sha').trim()
  if (!sha) return result(false, 'Commit SHA is required.')
  const res = await cgit(path, ['cherry-pick', sha])
  if (res.ok) {
    logOp(project, 'SUCCESS', `Cherry-picked ${sha.slice(0, 8)} via control panel.`, res)
    return result(true, `Cherry-picked ${sha.slice(0, 8)}.`, res.stdout || res.stderr)
  }
  if ((res.stdout + res.stderr).toLowerCase().includes('conflict')) {
    return result(false, 'Cherry-pick produced conflicts. Resolve them in the Changes tab, then commit.', res.stdout + '\n' + res.stderr)
  }
  return fromRun(res, '', 'Cherry-pick failed')
}

const actStash: ActionFn = async (path, params, project) => {
  const action = (pStr(params, 'action') || 'save').toLowerCase()
  if (action === 'save' || action === 'push') {
    const args = ['stash', 'push']
    if (params.include_untracked) args.push('-u')
    const msg = pStr(params, 'message').trim()
    if (msg) args.push('-m', msg)
    return fromRun(await cgit(path, args), 'Stashed working-tree changes.', 'Stash failed')
  }
  if (action === 'pop' || action === 'apply' || action === 'drop') {
    const ref = pStr(params, 'ref')
    const args = ['stash', action]
    if (ref) args.push(ref)
    const res = await cgit(path, args)
    const verb = ({ pop: 'Popped', apply: 'Applied', drop: 'Dropped' } as Record<string, string>)[action]
    if (res.ok && action === 'drop') logOp(project, 'WARNING', 'Dropped a stash via control panel.', res)
    if (!res.ok && (res.stdout + res.stderr).toLowerCase().includes('conflict')) {
      return result(false, 'Stash apply produced conflicts. Resolve them in the Changes tab.', res.stdout + '\n' + res.stderr)
    }
    return fromRun(res, `${verb} stash.`, 'Stash operation failed')
  }
  if (action === 'clear') {
    const res = await cgit(path, ['stash', 'clear'])
    if (res.ok) logOp(project, 'WARNING', 'Cleared all stashes via control panel.', res)
    return fromRun(res, 'Cleared all stashes.', 'Failed to clear stashes')
  }
  return result(false, `Unknown stash action: ${action}`)
}

const actTag: ActionFn = async (path, params, project) => {
  const action = (pStr(params, 'action') || 'create').toLowerCase()
  const name = pStr(params, 'name').trim()
  if (!name) return result(false, 'Tag name is required.')
  if (action === 'create') {
    const msg = pStr(params, 'message').trim()
    const args = msg ? ['tag', '-a', name, '-m', msg] : ['tag', name]
    const res = await cgit(path, args)
    if (res.ok) logOp(project, 'SUCCESS', `Created tag '${name}' via control panel.`, res)
    return fromRun(res, `Created tag '${name}'.`, 'Failed to create tag')
  }
  if (action === 'delete') {
    const res = await cgit(path, ['tag', '-d', name])
    if (res.ok) logOp(project, 'WARNING', `Deleted tag '${name}' via control panel.`, res)
    return fromRun(res, `Deleted tag '${name}'.`, 'Failed to delete tag')
  }
  if (action === 'push') {
    const remote = pStr(params, 'remote') || 'origin'
    const res = await cgit(path, ['push', remote, name], { timeoutMs: 120000 })
    if (res.ok) logOp(project, 'SUCCESS', `Pushed tag '${name}' to ${remote} via control panel.`, res)
    return fromRun(res, `Pushed tag '${name}' to ${remote}.`, 'Failed to push tag')
  }
  return result(false, `Unknown tag action: ${action}`)
}

const actClean: ActionFn = async (path, params, project) => {
  const dirs = pBoolD(params, 'dirs', true)
  const res = await cgit(path, ['clean', dirs ? '-fd' : '-f'])
  if (res.ok) {
    logOp(project, 'WARNING', 'Cleaned untracked files via control panel.', res)
    return result(true, 'Removed untracked files.', res.stdout || '(nothing to clean)')
  }
  return fromRun(res, '', 'Clean failed')
}

const actSetConfig: ActionFn = async (path, params) => {
  const name = pStr(params, 'name').trim()
  const email = pStr(params, 'email').trim()
  const out: string[] = []
  if (name) {
    const r = await cgit(path, ['config', 'user.name', name])
    if (!r.ok) return fromRun(r, '', 'Failed to set user.name')
    out.push(`user.name = ${name}`)
  }
  if (email) {
    const r = await cgit(path, ['config', 'user.email', email])
    if (!r.ok) return fromRun(r, '', 'Failed to set user.email')
    out.push(`user.email = ${email}`)
  }
  if (!out.length) return result(false, 'Nothing to update.')
  return result(true, 'Updated repository identity.', out.join('\n'))
}

function splitArgs(command: string): string[] {
  const out: string[] = []
  let cur = ''
  let inToken = false
  let quote: string | null = null
  for (const c of command) {
    if (quote) {
      if (c === quote) quote = null
      else cur += c
    } else if (c === '"' || c === "'") {
      quote = c
      inToken = true
    } else if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      if (inToken) {
        out.push(cur)
        cur = ''
        inToken = false
      }
    } else {
      cur += c
      inToken = true
    }
  }
  if (quote) throw new Error('No closing quotation')
  if (inToken) out.push(cur)
  return out
}

const actTerminal: ActionFn = async (path, params) => {
  const command = pStr(params, 'command').trim()
  if (!command) return result(false, 'No command entered.')
  let tokens: string[]
  try {
    tokens = splitArgs(command)
  } catch (e) {
    return result(false, `Could not parse command: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!tokens.length) return result(false, 'No command entered.')
  if (tokens[0].toLowerCase() === 'git') tokens = tokens.slice(1)
  if (!tokens.length) return result(false, "Enter a git subcommand, e.g. 'status' or 'log --oneline'.")

  const res = await cgit(path, tokens, { timeoutMs: 120000 })
  const output = (res.stdout + (res.stderr ? '\n' + res.stderr : '')).trim()
  if (res.ok) return result(true, `$ git ${tokens.join(' ')}`, output || '(no output)')
  return result(false, `$ git ${tokens.join(' ')} (exit ${res.returncode})`, output || '(no output)')
}

const actSequence: ActionFn = async (path, params, project) => {
  const cmd = pStr(params, 'command').toLowerCase()
  if (!['abort', 'continue', 'skip'].includes(cmd)) return result(false, `Invalid sequence command: ${cmd}`)
  const state = inProgress(path)
  if (!state) return result(false, 'No merge, rebase, cherry-pick or revert is in progress.')
  if (cmd === 'skip' && state === 'merge') return result(false, 'Merge does not support --skip. Use abort or continue.')

  // core.editor=true prevents --continue from opening an editor and hanging.
  const args = cmd === 'continue' ? ['-c', 'core.editor=true', state, '--continue'] : [state, `--${cmd}`]
  const res = await cgit(path, args)
  if (res.ok) {
    logOp(project, cmd === 'abort' ? 'WARNING' : 'SUCCESS', `${state} --${cmd} via control panel.`, res)
    return result(true, `${state} --${cmd} done.`, res.stdout || res.stderr)
  }
  if (cmd === 'continue' && (res.stdout + res.stderr).toLowerCase().includes('conflict')) {
    return result(
      false,
      'There are still unresolved conflicts. Stage the resolved files in the Changes tab, then continue again.',
      res.stdout + '\n' + res.stderr
    )
  }
  return fromRun(res, '', `${state} --${cmd} failed`)
}

const actRebase: ActionFn = async (path, params, project) => {
  const branch = pStr(params, 'branch').trim()
  if (!branch) return result(false, 'Target branch to rebase onto is required.')
  const res = await cgit(path, ['-c', 'core.editor=true', 'rebase', branch])
  if (res.ok) {
    logOp(project, 'SUCCESS', `Rebased onto '${branch}' via control panel.`, res)
    return result(true, `Rebased current branch onto '${branch}'.`, res.stdout || res.stderr)
  }
  if ((res.stdout + res.stderr).toLowerCase().includes('conflict')) {
    return result(
      false,
      'Rebase hit conflicts. Resolve them in the Changes tab and click Continue, or Abort to undo the rebase.',
      res.stdout + '\n' + res.stderr
    )
  }
  return fromRun(res, '', 'Rebase failed')
}

const actUntrack: ActionFn = async (path, params, project) => {
  const files = filesList(params)
  if (!files.length) return result(false, 'No files specified to untrack.')
  const res = await cgit(path, ['rm', '--cached', '--', ...files])
  if (res.ok) {
    logOp(project, 'WARNING', `Untracked ${files.length} file(s) (kept on disk) via control panel.`, res)
    return result(true, `Untracked ${files.length} file(s). They remain on disk; commit to record the removal from the repo.`, res.stdout)
  }
  return fromRun(res, '', 'Failed to untrack')
}

const ACTIONS: Record<GitOp, ActionFn> = {
  stage: actStage,
  unstage: actUnstage,
  discard: actDiscard,
  commit: actCommit,
  push: actPush,
  pull: actPull,
  fetch: actFetch,
  branch_create: actBranchCreate,
  branch_switch: actBranchSwitch,
  branch_merge: actBranchMerge,
  branch_delete: actBranchDelete,
  remote_add: actRemoteAdd,
  remote_seturl: actRemoteSeturl,
  remote_remove: actRemoteRemove,
  reset: actReset,
  revert: actRevert,
  cherry_pick: actCherryPick,
  stash: actStash,
  tag: actTag,
  clean: actClean,
  set_config: actSetConfig,
  sequence: actSequence,
  rebase: actRebase,
  untrack: actUntrack,
  terminal: actTerminal
}

// ── rich repo stats (Project Detail view) ─────────────────────────────────

function emptyStats(): RepoStats {
  return {
    is_repo: false,
    branch: '',
    ahead: 0,
    behind: 0,
    commit_count: 0,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicts: 0,
    in_progress: null,
    last_commit: null,
    remotes: [],
    branch_count: 0,
    tag_count: 0,
    stash_count: 0,
    last_push: '',
    repo_size_bytes: 0
  }
}

export async function getRepoStats(
  projectId: string
): Promise<{ ok: boolean; error?: string; stats?: RepoStats }> {
  const { project, path, error } = resolve(projectId)
  if (error || !project) return { ok: false, error: error ?? 'Project not found.' }
  if (!isRepo(path!)) return { ok: true, stats: emptyStats() }

  const ov = await getOverview(projectId)
  const br = (ov.branch as BranchInfo) ?? { branch: '', ahead: 0, behind: 0 }

  const countRes = await cgit(path!, ['rev-list', '--count', 'HEAD'])
  const commitCount = countRes.ok && /^\d+$/.test(countRes.stdout.trim()) ? parseInt(countRes.stdout.trim(), 10) : 0

  const lastRes = await cgit(path!, [
    'log',
    '-1',
    `--pretty=format:%H${US}%s${US}%an${US}%ad`,
    '--date=format:%Y-%m-%d %H:%M'
  ])
  let lastCommit: RepoStats['last_commit'] = null
  if (lastRes.ok && lastRes.stdout.trim()) {
    const [sha, message, author, date] = lastRes.stdout.split(US)
    lastCommit = { sha, message: message ?? '', author: author ?? '', date: date ?? '' }
  }

  const remotesRes = await getRemotes(projectId)
  const remotes = ((remotesRes.remotes as { name: string; fetch: string }[]) ?? []).map((r) => ({
    name: r.name,
    url: r.fetch
  }))
  const branchesRes = await getBranches(projectId)
  const tagsRes = await getTags(projectId)
  const stashRes = await getStashes(projectId)
  const repoSize = await getRepoSizeBytes(path!)

  return {
    ok: true,
    stats: {
      is_repo: true,
      branch: br.branch || '',
      ahead: br.ahead || 0,
      behind: br.behind || 0,
      commit_count: commitCount,
      staged: ((ov.staged as unknown[]) ?? []).length,
      unstaged: ((ov.unstaged as unknown[]) ?? []).length,
      untracked: ((ov.untracked as unknown[]) ?? []).length,
      conflicts: ((ov.conflicts as unknown[]) ?? []).length,
      in_progress: (ov.in_progress as RepoStats['in_progress']) ?? null,
      last_commit: lastCommit,
      remotes,
      branch_count: ((branchesRes.local as unknown[]) ?? []).length,
      tag_count: ((tagsRes.tags as unknown[]) ?? []).length,
      stash_count: ((stashRes.stashes as unknown[]) ?? []).length,
      last_push: project.last_push || '',
      repo_size_bytes: repoSize
    }
  }
}

export async function perform(projectId: string, op: GitOp, params: Params): Promise<ConsoleActionResult> {
  const { project, path, error } = resolve(projectId)
  if (error) return result(false, error)
  if (!isRepo(path!) && op !== 'terminal') {
    return result(false, "This folder is not a Git repository yet. Click 'Run Now' once to initialize it, then use the control panel.")
  }
  const fn = ACTIONS[op]
  if (!fn) return result(false, `Unknown operation: ${op}`)
  try {
    return await fn(path!, params || {}, project)
  } catch (e) {
    return result(false, `Unexpected error: ${e instanceof Error ? e.message : String(e)}`)
  }
}
