import { existsSync } from 'fs'
import { join } from 'path'
import type { BackupStatus } from '../../shared/types'
import { getProject, updateProject, isDryRun } from '../store/config'
import { logEvent, formatTimestamp } from '../store/logger'
import {
  runGit,
  checkGitInstalled,
  extractHost,
  checkInternet,
  getRepoSizeBytes,
  parseGitStatus
} from './run'

const now = (): string => formatTimestamp()

/**
 * Connectivity check seam. Defaults to the real TCP check; tests override it to
 * exercise the push paths offline against a local bare remote. Production code
 * never calls the setter.
 */
let connectivityCheck: typeof checkInternet = checkInternet
export function __setConnectivityCheck(fn: typeof checkInternet | null): void {
  connectivityCheck = fn ?? checkInternet
}

export interface BackupOutcome {
  status: BackupStatus
  message: string
}

function isDir(p: string): boolean {
  try {
    return existsSync(p)
  } catch {
    return false
  }
}

function hasGitDir(path: string): boolean {
  return !!path && existsSync(join(path, '.git'))
}

// ── Identity ────────────────────────────────────────────────────────────────

export async function getGitIdentity(): Promise<{
  name: string
  email: string
  configured: boolean
}> {
  const nameRes = await runGit(['config', '--global', 'user.name'])
  const emailRes = await runGit(['config', '--global', 'user.email'])
  const name = nameRes.ok ? nameRes.stdout.trim() : ''
  const email = emailRes.ok ? emailRes.stdout.trim() : ''
  return { name, email, configured: Boolean(name && email) }
}

export async function setGitIdentity(
  name: string,
  email: string
): Promise<{ success: boolean; message: string }> {
  const nameRes = await runGit(['config', '--global', 'user.name', name])
  if (!nameRes.ok) return { success: false, message: `Failed to set user.name: ${nameRes.stderr.trim()}` }
  const emailRes = await runGit(['config', '--global', 'user.email', email])
  if (!emailRes.ok) return { success: false, message: `Failed to set user.email: ${emailRes.stderr.trim()}` }
  return { success: true, message: 'Git identity configured successfully.' }
}

// ── GitHub auth (HTTPS credentials, used on Linux) ────────────────────────────

export async function getGitAuthStatus(): Promise<{
  helper: string
  has_credentials: boolean
  needs_setup: boolean
}> {
  const helperRes = await runGit(['config', '--global', 'credential.helper'])
  const helper = helperRes.ok ? helperRes.stdout.trim() : ''
  const fill = await runGit(['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    timeoutMs: 5000
  })
  const hasCredentials = fill.ok && fill.stdout.includes('password=')
  return { helper, has_credentials: hasCredentials, needs_setup: !hasCredentials }
}

export async function storeGithubPat(
  username: string,
  token: string
): Promise<{ success: boolean; message: string }> {
  const helperRes = await runGit(['config', '--global', 'credential.helper'])
  if (!helperRes.stdout.trim()) {
    const setRes = await runGit(['config', '--global', 'credential.helper', 'store'])
    if (!setRes.ok)
      return { success: false, message: `Failed to configure credential helper: ${setRes.stderr.trim()}` }
  }
  const approve = await runGit(['credential', 'approve'], {
    input: `protocol=https\nhost=github.com\nusername=${username}\npassword=${token}\n\n`,
    timeoutMs: 10000
  })
  if (!approve.ok) return { success: false, message: `Failed to store credentials: ${approve.stderr.trim()}` }
  return { success: true, message: 'GitHub credentials stored successfully.' }
}

// ── Connection test ───────────────────────────────────────────────────────────

export async function testProjectConnection(
  projectId: string
): Promise<{ success: boolean; message: string }> {
  const project = getProject(projectId)
  if (!project) return { success: false, message: 'Project not found' }

  const { name, path, origin } = project

  if (!(await checkGitInstalled())) {
    const msg = 'Git executable is not installed or not in PATH.'
    logEvent(name, 'FAILED', `Connection test failed: ${msg}`)
    return { success: false, message: msg }
  }
  if (!origin) {
    const msg = 'No remote origin URL is configured for this project.'
    logEvent(name, 'FAILED', `Connection test failed: ${msg}`)
    return { success: false, message: msg }
  }

  const gitHost = extractHost(origin)
  const port = origin.includes('git@') ? 22 : 443
  if (!(await connectivityCheck(gitHost, port))) {
    const msg = `Network connection to git host (${gitHost}) failed.`
    logEvent(name, 'FAILED', `Connection test failed: ${msg}`)
    return { success: false, message: 'Network or host unreachable' }
  }

  const hasRepo = hasGitDir(path)
  const target = hasRepo ? 'origin' : origin
  const runCwd = path && isDir(path) ? path : undefined
  const res = await runGit(['ls-remote', target], { cwd: runCwd, timeoutMs: 30000 })

  if (res.ok) {
    logEvent(name, 'SUCCESS', 'Connection test successful.')
    return { success: true, message: 'Connection successful' }
  }
  const err = res.stderr.trim()
  const low = err.toLowerCase()
  let msg: string
  if (
    low.includes('authentication failed') ||
    low.includes('permission denied') ||
    low.includes('could not read from remote repository')
  ) {
    msg = 'Authentication failed. Verify credentials/SSH key access.'
  } else if (low.includes('repository not found') || low.includes('not found')) {
    msg = 'Remote repository not found. Check the origin URL.'
  } else {
    msg = `Connection failed: ${err}`
  }
  logEvent(name, 'FAILED', `Connection test failed: ${msg}`, res.stdout, res.stderr)
  return { success: false, message: msg }
}

// ── Repo readiness ────────────────────────────────────────────────────────────

/** Set a repo-local fallback identity only when none is configured. */
async function ensureIdentity(path: string): Promise<void> {
  const fallbacks: [string, string][] = [
    ['user.name', 'Git Manager'],
    ['user.email', 'git-manager@localhost']
  ]
  for (const [key, fallback] of fallbacks) {
    const res = await runGit(['config', key], { cwd: path })
    if (!res.ok || !res.stdout.trim()) {
      await runGit(['config', key, fallback], { cwd: path })
    }
  }
}

/** Initialize the repo if needed, guarantee identity, point origin at the URL. */
export async function ensureGitRepo(
  path: string,
  branchRaw: string,
  origin: string,
  name: string
): Promise<{ ok: boolean; message: string }> {
  const branch = (branchRaw || 'main').trim()

  if (!hasGitDir(path)) {
    let init = await runGit(['init', '-b', branch], { cwd: path })
    if (!init.ok) {
      init = await runGit(['init'], { cwd: path })
      if (!init.ok) return { ok: false, message: `git init failed: ${init.stderr.trim()}` }
      await runGit(['symbolic-ref', 'HEAD', `refs/heads/${branch}`], { cwd: path })
    }
    logEvent(name, 'SUCCESS', `Initialized new Git repository on branch '${branch}'.`)
  }

  await ensureIdentity(path)

  if (origin) {
    const getUrl = await runGit(['remote', 'get-url', 'origin'], { cwd: path })
    if (!getUrl.ok) {
      const add = await runGit(['remote', 'add', 'origin', origin], { cwd: path })
      if (!add.ok) return { ok: false, message: `Failed to add remote origin: ${add.stderr.trim()}` }
      logEvent(name, 'SUCCESS', `Linked remote origin -> ${origin}`)
    } else if (getUrl.stdout.trim() !== origin) {
      await runGit(['remote', 'set-url', 'origin', origin], { cwd: path })
      logEvent(name, 'SUCCESS', `Updated remote origin -> ${origin}`)
    }
  }

  return { ok: true, message: 'Repository ready.' }
}

// ── Backup sequence ───────────────────────────────────────────────────────────

const GB = 1024 * 1024 * 1024

function fail(projectId: string, name: string, msg: string, out = '', err = ''): BackupOutcome {
  logEvent(name, 'FAILED', msg, out, err)
  updateProject(projectId, { last_status: 'FAILED', last_run: now() })
  return { status: 'FAILED', message: msg }
}

/**
 * Run the full backup sequence for a project. Async so it never blocks the UI.
 * Faithful port of run_backup() — see ARCHITECTURE.md "Backup Sequence".
 * The execution lock is the caller's responsibility (scheduler / IPC handler).
 */
export async function runBackup(
  projectId: string,
  isManual = false,
  commitMessage?: string
): Promise<BackupOutcome> {
  const project = getProject(projectId)
  if (!project) return { status: 'FAILED', message: 'Project not found' }

  const { name, path, origin } = project
  const branch = project.branch || 'main'
  const autoCommit = project.auto_commit
  const autoPush = project.auto_push
  const excluded = project.excluded_paths ?? []

  // 1. Path exists
  if (!isDir(path)) return fail(projectId, name, `Folder missing: path ${path} does not exist.`)

  // 2. Git installed
  if (!(await checkGitInstalled())) return fail(projectId, name, 'Git is not installed or not in PATH.')

  // 3. Ensure repo ready (auto-init + remote)
  const repo = await ensureGitRepo(path, branch, origin, name)
  if (!repo.ok) return fail(projectId, name, repo.message)

  // 4. Size warning (non-fatal)
  const sizeBytes = await getRepoSizeBytes(path)
  if (sizeBytes > GB) {
    logEvent(
      name,
      'WARNING',
      `Unusually large repository detected: ${(sizeBytes / GB).toFixed(2)} GB (exceeds 1GB warning threshold).`
    )
  }

  // 5. git status
  const statusRes = await runGit(['status', '--porcelain'], { cwd: path })
  if (!statusRes.ok) {
    return fail(
      projectId,
      name,
      `Failed to run git status. Stderr: ${statusRes.stderr.trim()}`,
      statusRes.stdout,
      statusRes.stderr
    )
  }
  const changedFiles = parseGitStatus(statusRes.stdout, excluded)

  // 6. No file changes → check for unpushed commits
  if (changedFiles.length === 0) {
    if (autoPush && origin) {
      let unpushed = 0
      const tracking = await runGit(['rev-parse', '--verify', `refs/remotes/origin/${branch}`], { cwd: path })
      if (!tracking.ok) {
        const head = await runGit(['rev-parse', '--verify', 'HEAD'], { cwd: path })
        unpushed = head.ok ? 1 : 0
      } else {
        const ahead = await runGit(['rev-list', '--count', `origin/${branch}..HEAD`], { cwd: path })
        if (ahead.ok && /^\d+$/.test(ahead.stdout.trim())) unpushed = parseInt(ahead.stdout.trim(), 10)
      }

      if (unpushed > 0) {
        const gitHost = extractHost(origin)
        const port = origin.includes('git@') ? 22 : 443
        if (await connectivityCheck(gitHost, port)) {
          const push = await runGit(['push', '-u', 'origin', branch], { cwd: path, timeoutMs: 60000 })
          if (push.ok) {
            const msg = 'Pushed previously committed but unpushed commit(s) to remote.'
            logEvent(name, 'SUCCESS', msg, push.stdout)
            updateProject(projectId, { last_status: 'SUCCESS', last_run: now(), last_push: now() })
            return { status: 'SUCCESS', message: msg }
          }
          if (push.stderr.includes('rejected') || push.stderr.includes('non-fast-forward')) {
            const pull = await runGit(['pull', '--rebase', 'origin', branch], { cwd: path, timeoutMs: 60000 })
            if (pull.ok) {
              const retry = await runGit(['push', '-u', 'origin', branch], { cwd: path, timeoutMs: 60000 })
              if (retry.ok) {
                const msg = 'Pushed pending commits after syncing remote changes.'
                logEvent(name, 'SUCCESS', msg, retry.stdout)
                updateProject(projectId, { last_status: 'SUCCESS', last_run: now(), last_push: now() })
                return { status: 'SUCCESS', message: msg }
              }
            }
          }
        }
      }
    }

    const msg = 'No changes detected (excluding ignored paths).'
    logEvent(name, 'NO_CHANGES', msg)
    updateProject(projectId, { last_status: 'NO_CHANGES', last_run: now() })
    return { status: 'NO_CHANGES', message: msg }
  }

  // 7. Large commit guard (scheduled runs only)
  const changedCount = changedFiles.length
  if (changedCount > 1000 && !isManual) {
    return fail(projectId, name, `Large commit guard: ${changedCount} changed files. Manual Run Now required.`)
  }

  // 8. Dry run
  if (isDryRun()) {
    const msg = `Dry Run Mode: ${changedCount} changes detected. Commits and pushes are simulated.`
    logEvent(name, 'WARNING', msg)
    updateProject(projectId, { last_status: 'NO_CHANGES', last_run: now() })
    return { status: 'NO_CHANGES', message: msg }
  }

  // 9. Add + commit
  let commitSha = ''
  let commitMsg = ''
  if (autoCommit) {
    // 9a. Untrack files now matching .gitignore
    const lsIgnored = await runGit(['ls-files', '-i', '-c', '--exclude-standard'], { cwd: path })
    const trackedIgnored = lsIgnored.stdout.split(/\r?\n/).map((f) => f.trim()).filter(Boolean)
    for (let i = 0; i < trackedIgnored.length; i += 100) {
      await runGit(['rm', '--cached', '--quiet', '--', ...trackedIgnored.slice(i, i + 100)], { cwd: path })
    }

    // 9b. Drop ignored paths from the staging list
    let filesToAdd = changedFiles
    const ignoredNow = new Set<string>()
    for (let i = 0; i < changedFiles.length; i += 100) {
      const batch = changedFiles.slice(i, i + 100)
      const ci = await runGit(['check-ignore', ...batch], { cwd: path })
      ci.stdout.split(/\r?\n/).map((f) => f.trim()).filter(Boolean).forEach((f) => ignoredNow.add(f))
    }
    if (ignoredNow.size > 0) filesToAdd = changedFiles.filter((f) => !ignoredNow.has(f))

    // 9c. Stage remaining changes
    for (let i = 0; i < filesToAdd.length; i += 100) {
      const add = await runGit(['add', '--', ...filesToAdd.slice(i, i + 100)], { cwd: path })
      if (!add.ok) {
        return fail(projectId, name, `Git add failed. Stderr: ${add.stderr.trim()}`, add.stdout, add.stderr)
      }
    }

    // 9d. Nothing staged → no-op
    const staged = await runGit(['diff', '--cached', '--quiet'], { cwd: path })
    if (staged.code === 0) {
      const msg = 'No changes to back up after applying ignore rules.'
      logEvent(name, 'NO_CHANGES', msg)
      updateProject(projectId, { last_status: 'NO_CHANGES', last_run: now() })
      return { status: 'NO_CHANGES', message: msg }
    }

    commitMsg = commitMessage && commitMessage.trim() ? commitMessage.trim() : `Auto Backup - ${now()}`
    const commit = await runGit(['commit', '-m', commitMsg], { cwd: path })
    if (!commit.ok) {
      return fail(projectId, name, `Git commit failed. Stderr: ${commit.stderr.trim()}`, commit.stdout, commit.stderr)
    }
    const sha = await runGit(['rev-parse', 'HEAD'], { cwd: path })
    if (sha.ok) commitSha = sha.stdout.trim()
  }

  const keepCommit = (): string => (commitSha ? commitSha : project.last_commit || '')

  // 10. Verify origin
  const remote = await runGit(['remote', '-v'], { cwd: path })
  if (!remote.ok || !remote.stdout.includes('origin')) {
    logEvent(name, 'FAILED', 'Origin remote missing.', remote.stdout, remote.stderr)
    updateProject(projectId, { last_status: 'FAILED', last_run: now(), last_commit: keepCommit() })
    return { status: 'FAILED', message: 'Origin remote missing.' }
  }

  // 11. Connectivity
  const gitHost = extractHost(origin)
  const port = origin.includes('git@') ? 22 : 443
  if (!(await connectivityCheck(gitHost, port))) {
    const msg = 'Internet unavailable: connection to Git host failed. Marked pending retry.'
    logEvent(name, 'PENDING_RETRY', msg)
    updateProject(projectId, { last_status: 'PENDING_RETRY', last_run: now(), last_commit: keepCommit() })
    return { status: 'PENDING_RETRY', message: msg }
  }

  // 12. Push
  if (autoPush) {
    const push = await runGit(['push', '-u', 'origin', branch], { cwd: path, timeoutMs: 60000 })
    if (!push.ok) {
      const err = push.stderr.trim()
      let msg: string
      if (
        err.includes('Authentication failed') ||
        err.includes('Permission denied') ||
        err.includes('fatal: Could not read from remote repository')
      ) {
        msg = 'Push failed: Authentication failed.'
      } else if (err.includes('rejected') || err.includes('non-fast-forward')) {
        logEvent(name, 'WARNING', 'Push rejected (remote diverged). Attempting auto-rebase...')
        const pull = await runGit(['pull', '--rebase', 'origin', branch], { cwd: path, timeoutMs: 60000 })
        if (pull.ok) {
          const retry = await runGit(['push', '-u', 'origin', branch], { cwd: path, timeoutMs: 60000 })
          if (retry.ok) {
            const okMsg = `Backup completed successfully (synced remote changes and pushed as "${commitMsg}").`
            logEvent(name, 'SUCCESS', okMsg, retry.stdout)
            updateProject(projectId, {
              last_status: 'SUCCESS',
              last_run: now(),
              last_commit: keepCommit(),
              last_push: now()
            })
            return { status: 'SUCCESS', message: okMsg }
          }
          msg = `Push failed after rebase: ${retry.stderr.trim()}`
        } else {
          msg = `Push rejected and auto-rebase failed (possible merge conflict): ${pull.stderr.trim()}`
        }
      } else {
        msg = `Push failed: ${err}`
      }
      logEvent(name, 'FAILED', msg, push.stdout, push.stderr)
      updateProject(projectId, { last_status: 'FAILED', last_run: now(), last_commit: keepCommit() })
      return { status: 'FAILED', message: msg }
    }

    const msg = `Backup completed successfully. Committed and pushed ${changedCount} files as "${commitMsg}".`
    logEvent(name, 'SUCCESS', msg, push.stdout)
    updateProject(projectId, {
      last_status: 'SUCCESS',
      last_run: now(),
      last_commit: keepCommit(),
      last_push: now()
    })
    return { status: 'SUCCESS', message: msg }
  }

  // Commit-only (push disabled)
  const msg = `Backup completed successfully. Committed ${changedCount} files as "${commitMsg}" (push disabled).`
  logEvent(name, 'SUCCESS', msg)
  updateProject(projectId, { last_status: 'SUCCESS', last_run: now(), last_commit: keepCommit() })
  return { status: 'SUCCESS', message: msg }
}
