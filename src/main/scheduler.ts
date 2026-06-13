import type { Project } from '../shared/types'
import type { RunAllItem } from '../shared/api'
import { acquireLock, releaseLock } from './lock'
import { getProjects, isAutomationEnabled } from './store/config'
import { runBackup } from './git/engine'

/** Back up every enabled, non-paused project once, under a single lock. */
export async function runAllEnabled(isManual: boolean): Promise<RunAllItem[]> {
  if (!acquireLock()) {
    return [{ project: 'System', status: 'ALREADY_RUNNING', message: 'Another backup is currently running.' }]
  }
  const results: RunAllItem[] = []
  try {
    for (const p of getProjects()) {
      if (!p.enabled || p.paused) continue
      const out = await runBackup(p.id, isManual)
      results.push({ project: p.name, status: out.status, message: out.message })
    }
  } finally {
    releaseLock()
  }
  return results
}

function isDue(p: Project): boolean {
  if (!p.enabled || p.paused) return false
  const interval = Math.max(1, p.run_interval_minutes || 30)
  if (!p.last_run) return true
  const last = Date.parse(p.last_run.replace(' ', 'T'))
  if (Number.isNaN(last)) return true
  return Date.now() - last >= interval * 60_000
}

let timer: NodeJS.Timeout | null = null
let ticking = false

async function tick(): Promise<void> {
  if (ticking) return
  if (!isAutomationEnabled()) return // master switch off → never auto-backup
  ticking = true
  try {
    const due = getProjects().filter(isDue)
    if (due.length === 0) return
    if (!acquireLock()) return // a manual run holds the lock; skip this tick
    try {
      for (const p of due) await runBackup(p.id, false)
    } finally {
      releaseLock()
    }
  } finally {
    ticking = false
  }
}

/** Start the in-process scheduler — checks every minute for due backups. */
export function startScheduler(): void {
  if (timer) return
  timer = setInterval(() => void tick(), 60_000)
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** Run "Run on Startup" projects once when the app launches. */
export async function runStartupBackups(): Promise<void> {
  if (!isAutomationEnabled()) return // master switch off → nothing runs on launch
  const targets = getProjects().filter((p) => p.enabled && !p.paused && p.run_on_startup)
  if (targets.length === 0) return
  if (!acquireLock()) return
  try {
    for (const p of targets) await runBackup(p.id, false)
  } finally {
    releaseLock()
  }
}
