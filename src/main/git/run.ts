import { spawn } from 'child_process'
import { createConnection } from 'net'
import { readdir, stat, lstat } from 'fs/promises'
import { join } from 'path'
import type { GitResult } from '../../shared/types'

/**
 * Environment for every git call. Faithful to get_git_env():
 *  - GIT_TERMINAL_PROMPT=0  → git never blocks on a password prompt.
 *  - GIT_SSH_COMMAND batch  → ssh never prompts; new host keys auto-accepted,
 *    changed keys rejected (MITM protection).
 */
export function getGitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new'
  }
}

export interface RunOptions {
  cwd?: string
  input?: string
  timeoutMs?: number
}

/**
 * Run the git CLI. Never throws — every outcome (success, non-zero exit, spawn
 * error, timeout) is returned as a structured GitResult. This is the single
 * choke point all git work flows through (mirrors run_git in git_console.py).
 */
export function runGit(args: string[], opts: RunOptions = {}): Promise<GitResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: NodeJS.Timeout | null = null

    const finish = (code: number, errMsg?: string): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({ ok: code === 0, code, stdout, stderr: stderr || (errMsg ?? '') })
    }

    let child
    try {
      child = spawn('git', args, {
        cwd: opts.cwd,
        env: getGitEnv(),
        windowsHide: true
      })
    } catch (e) {
      finish(-1, e instanceof Error ? e.message : String(e))
      return
    }

    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()))
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
    child.on('error', (err: Error) => finish(-1, err.message))
    child.on('close', (code: number | null) => finish(code ?? -1))

    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill()
        finish(-1, `git timed out after ${opts.timeoutMs}ms`)
      }, opts.timeoutMs)
    }

    if (opts.input != null) {
      child.stdin?.write(opts.input)
      child.stdin?.end()
    }
  })
}

/** True if the git CLI is available. */
export async function checkGitInstalled(): Promise<boolean> {
  const res = await runGit(['--version'], { timeoutMs: 5000 })
  return res.ok
}

/** Extract host domain from a git remote URL (HTTPS or SSH). */
export function extractHost(url: string): string {
  if (!url) return 'github.com'
  const m = url.match(/(?:https?:\/\/|git@)([^:/]+)/)
  return m ? m[1] : 'github.com'
}

/** TCP-reachability check to the git host, falling back to Google DNS. */
export function checkInternet(host = 'github.com', port = 443, timeoutMs = 3000): Promise<boolean> {
  const tryConnect = (h: string, p: number): Promise<boolean> =>
    new Promise((resolve) => {
      const sock = createConnection({ host: h, port: p })
      let done = false
      const ok = (val: boolean): void => {
        if (done) return
        done = true
        sock.destroy()
        resolve(val)
      }
      sock.setTimeout(timeoutMs)
      sock.once('connect', () => ok(true))
      sock.once('timeout', () => ok(false))
      sock.once('error', () => ok(false))
    })

  return tryConnect(host, port).then((reached) =>
    reached ? true : tryConnect('8.8.8.8', 53)
  )
}

/** Total size of a directory tree in bytes (does not follow symlinks). */
export async function getRepoSizeBytes(path: string): Promise<number> {
  let total = 0
  const walk = async (dir: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      try {
        if (entry.isSymbolicLink()) {
          continue
        }
        if (entry.isDirectory()) {
          await walk(full)
        } else if (entry.isFile()) {
          const info = await lstat(full)
          total += info.size
        }
      } catch {
        /* ignore unreadable entries */
      }
    }
  }
  try {
    const s = await stat(path)
    if (!s.isDirectory()) return 0
  } catch {
    return 0
  }
  await walk(path)
  return total
}

/** Parse `git status --porcelain` and drop excluded paths. Faithful to parse_git_status. */
export function parseGitStatus(statusOutput: string, excludedPaths: string[]): string[] {
  const changed: string[] = []
  const normalizedExclusions = excludedPaths
    .filter((e) => e.trim())
    .map((e) => e.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))

  for (const line of statusOutput.split(/\r?\n/)) {
    if (line.length < 4) continue
    let pathPart = line.slice(3).trim()

    if (pathPart.startsWith('"') && pathPart.endsWith('"')) {
      pathPart = pathPart.slice(1, -1)
    }
    if (pathPart.includes(' -> ')) {
      pathPart = pathPart.split(' -> ')[1].trim()
      if (pathPart.startsWith('"') && pathPart.endsWith('"')) {
        pathPart = pathPart.slice(1, -1)
      }
    }

    const normalizedFile = pathPart.replace(/\\/g, '/')
    let excluded = false
    for (const exc of normalizedExclusions) {
      const parts = normalizedFile.split('/')
      if (parts.includes(exc) || normalizedFile.startsWith(exc + '/')) {
        excluded = true
        break
      }
    }
    if (!excluded) changed.push(pathPart)
  }
  return changed
}
