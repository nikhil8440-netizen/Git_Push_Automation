import { existsSync, copyFileSync } from 'fs'
import { join } from 'path'
import { configPath, logsPath, ensureDataDir } from './paths'

/**
 * One-time, best-effort import of the legacy Python app's data. If a
 * backend/config.json (or logs.json) exists next to where the app was launched
 * and the new userData copies don't exist yet, bring them across. Both files
 * share the same JSON shape, so a straight copy is safe. Never destructive.
 */
export function importLegacyData(): void {
  try {
    ensureDataDir()
    const legacyDir = join(process.cwd(), 'backend')
    const legacyConfig = join(legacyDir, 'config.json')
    const legacyLogs = join(legacyDir, 'logs.json')
    if (!existsSync(configPath()) && existsSync(legacyConfig)) {
      copyFileSync(legacyConfig, configPath())
    }
    if (!existsSync(logsPath()) && existsSync(legacyLogs)) {
      copyFileSync(legacyLogs, logsPath())
    }
  } catch {
    /* best effort — never block startup */
  }
}
