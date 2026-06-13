import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { setDataDir, logsPath } from '../src/main/store/paths'
import { logEvent, getLogs, loadLogs, saveLogs, formatTimestamp } from '../src/main/store/logger'
import type { LogEntry } from '../src/shared/types'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gm-logs-'))
  setDataDir(dir)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('logger', () => {
  it('prepends newest first', () => {
    logEvent('A', 'SUCCESS', 'first')
    logEvent('B', 'FAILED', 'second')
    const logs = getLogs()
    expect(logs[0].project).toBe('B')
    expect(logs[1].project).toBe('A')
  })

  it('defaults a missing project name to System', () => {
    const e = logEvent('', 'WARNING', 'msg')
    expect(e.project).toBe('System')
  })

  it('caps at 1000 entries, dropping the oldest', () => {
    // Pre-seed 1000 entries in a single write, then add one more.
    const seeded: LogEntry[] = Array.from({ length: 1000 }, (_, i) => ({
      timestamp: 't',
      project: 'P',
      status: 'SUCCESS',
      message: `old${i}`,
      stdout: '',
      stderr: ''
    }))
    saveLogs({ logs: seeded })
    logEvent('P', 'SUCCESS', 'newest')
    const logs = getLogs()
    expect(logs).toHaveLength(1000)
    expect(logs[0].message).toBe('newest') // newest first
  })

  it('formats the timestamp as YYYY-MM-DD HH:MM:SS', () => {
    expect(formatTimestamp(new Date(2026, 5, 13, 9, 5, 8))).toBe('2026-06-13 09:05:08')
  })

  it('self-heals corrupt logs', () => {
    writeFileSync(logsPath(), 'not json', 'utf-8')
    expect(loadLogs()).toEqual({ logs: [] })
  })
})
