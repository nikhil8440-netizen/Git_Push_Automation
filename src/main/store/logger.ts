import { existsSync, readFileSync } from 'fs'
import type { LogEntry } from '../../shared/types'
import { atomicWriteJson } from './atomic'
import { logsPath } from './paths'

const MAX_LOG_ENTRIES = 1000

interface LogsFile {
  logs: LogEntry[]
}

const DEFAULT_LOGS: LogsFile = { logs: [] }

/** "YYYY-MM-DD HH:MM:SS" in local time, matching logger.py. */
export function formatTimestamp(d = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

export function loadLogs(): LogsFile {
  const path = logsPath()
  if (!existsSync(path)) {
    saveLogs(DEFAULT_LOGS)
    return { logs: [] }
  }
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    if (
      typeof data !== 'object' ||
      data === null ||
      !Array.isArray((data as LogsFile).logs)
    ) {
      throw new Error('Logs root is invalid')
    }
    return data as LogsFile
  } catch {
    saveLogs(DEFAULT_LOGS)
    return { logs: [] }
  }
}

export function saveLogs(logs: LogsFile): boolean {
  try {
    atomicWriteJson(logsPath(), logs)
    return true
  } catch {
    return false
  }
}

/** Prepend a log entry (newest first) and cap at MAX_LOG_ENTRIES. */
export function logEvent(
  project: string,
  status: string,
  message: string,
  stdout: string = '',
  stderr: string = ''
): LogEntry {
  const data = loadLogs()
  const entry: LogEntry = {
    timestamp: formatTimestamp(),
    project: project || 'System',
    status,
    message,
    stdout: stdout != null ? String(stdout) : '',
    stderr: stderr != null ? String(stderr) : ''
  }
  data.logs.unshift(entry)
  if (data.logs.length > MAX_LOG_ENTRIES) {
    data.logs = data.logs.slice(0, MAX_LOG_ENTRIES)
  }
  saveLogs(data)
  return entry
}

export function getLogs(): LogEntry[] {
  return loadLogs().logs
}
