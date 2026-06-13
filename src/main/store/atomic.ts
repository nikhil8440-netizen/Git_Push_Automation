import { writeFileSync, renameSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'

/**
 * Write JSON atomically: serialize to a temp file in the same directory, then
 * rename over the target. rename is atomic on the same filesystem, so a crash
 * mid-write can never leave a half-written config.json / logs.json.
 */
export function atomicWriteJson(filePath: string, data: unknown): void {
  const dir = dirname(filePath)
  mkdirSync(dir, { recursive: true })
  const tmp = join(dir, `.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmp, filePath)
}
