import { openSync, closeSync, writeSync, unlinkSync, existsSync } from 'fs'
import { lockPath } from './store/paths'

/**
 * Single-run lock. Only one backup may run at a time. The lock is a file
 * containing the owning PID, created atomically with the 'wx' flag (fails if it
 * already exists). Faithful to the .lock behavior in git_runner.py: a stale
 * lock is never auto-cleared (by design, to avoid killing a real concurrent run).
 */
export function acquireLock(): boolean {
  try {
    const fd = openSync(lockPath(), 'wx')
    writeSync(fd, String(process.pid))
    closeSync(fd)
    return true
  } catch {
    return false
  }
}

export function releaseLock(): void {
  try {
    unlinkSync(lockPath())
  } catch {
    /* already gone — fine */
  }
}

export function isLocked(): boolean {
  return existsSync(lockPath())
}
