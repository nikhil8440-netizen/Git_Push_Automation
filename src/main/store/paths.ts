import { join } from 'path'
import { mkdirSync } from 'fs'

/**
 * Resolves where config.json / logs.json / .lock live.
 *
 * The Electron main process calls setDataDir(app.getPath('userData')) at
 * startup. Tests call setDataDir(tmpDir). This indirection keeps the store
 * modules free of any `electron` import so they can run under Vitest (node).
 */
let dataDir: string | null = null

export function setDataDir(dir: string): void {
  dataDir = dir
}

export function getDataDir(): string {
  if (dataDir) return dataDir
  const fromEnv = process.env.GITMANAGER_DATA_DIR
  if (fromEnv) return fromEnv
  return process.cwd()
}

export function ensureDataDir(): void {
  mkdirSync(getDataDir(), { recursive: true })
}

export function configPath(): string {
  return join(getDataDir(), 'config.json')
}

export function logsPath(): string {
  return join(getDataDir(), 'logs.json')
}

export function lockPath(): string {
  return join(getDataDir(), '.lock')
}
