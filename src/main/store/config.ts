import { existsSync, readFileSync, renameSync } from 'fs'
import { randomUUID } from 'node:crypto'
import type { GlobalConfig, Project, ProjectInput } from '../../shared/types'
import { atomicWriteJson } from './atomic'
import { configPath } from './paths'

const DEFAULT_CONFIG: GlobalConfig = { dry_run: false, automation_enabled: false, projects: [] }

const DEFAULT_EXCLUDES = ['.venv', 'node_modules', 'dist', 'build']

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

/** Load config.json, self-healing if missing or corrupt (faithful to config_manager.py). */
export function loadConfig(): GlobalConfig {
  const path = configPath()
  if (!existsSync(path)) {
    saveConfig(DEFAULT_CONFIG)
    return structuredClone(DEFAULT_CONFIG)
  }
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error('Config root is not an object')
    }
    const obj = data as Partial<GlobalConfig>
    if (typeof obj.dry_run !== 'boolean') obj.dry_run = false
    // Default OFF so a migrated/old config never auto-backs-up without consent.
    if (typeof obj.automation_enabled !== 'boolean') obj.automation_enabled = false
    if (!Array.isArray(obj.projects)) obj.projects = []
    return obj as GlobalConfig
  } catch {
    // Back up the corrupt file, recreate defaults.
    try {
      renameSync(path, path + '.corrupt')
    } catch {
      /* ignore */
    }
    saveConfig(DEFAULT_CONFIG)
    return structuredClone(DEFAULT_CONFIG)
  }
}

export function saveConfig(config: GlobalConfig): boolean {
  try {
    atomicWriteJson(configPath(), config)
    return true
  } catch {
    return false
  }
}

export function getProjects(): Project[] {
  return loadConfig().projects
}

export function getProject(id: string): Project | null {
  return getProjects().find((p) => p.id === id) ?? null
}

export function addProject(input: ProjectInput): Project {
  const config = loadConfig()
  const project: Project = {
    id: randomUUID(),
    name: input.name || 'Unnamed Repo',
    path: normalizePath(input.path || ''),
    origin: input.origin || '',
    branch: input.branch || 'main',
    enabled: input.enabled ?? true,
    paused: input.paused ?? false,
    auto_commit: input.auto_commit ?? true,
    auto_push: input.auto_push ?? true,
    run_on_startup: input.run_on_startup ?? false,
    run_interval_minutes: Math.trunc(Number(input.run_interval_minutes ?? 30)) || 30,
    excluded_paths: input.excluded_paths ?? [...DEFAULT_EXCLUDES],
    last_run: '',
    last_commit: '',
    last_push: '',
    last_status: ''
  }
  config.projects.push(project)
  saveConfig(config)
  return project
}

export function updateProject(id: string, updates: Partial<Project>): Project | null {
  const config = loadConfig()
  const idx = config.projects.findIndex((p) => p.id === id)
  if (idx === -1) return null
  const current = config.projects[idx]
  for (const [key, rawVal] of Object.entries(updates)) {
    if (key === 'id') continue
    let val = rawVal
    if (key === 'path' && typeof val === 'string') val = normalizePath(val)
    if (key === 'run_interval_minutes') val = Math.trunc(Number(val)) || current.run_interval_minutes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(current as any)[key] = val
  }
  config.projects[idx] = current
  saveConfig(config)
  return current
}

export function deleteProject(id: string): boolean {
  const config = loadConfig()
  const before = config.projects.length
  config.projects = config.projects.filter((p) => p.id !== id)
  if (config.projects.length < before) {
    saveConfig(config)
    return true
  }
  return false
}

export function isDryRun(): boolean {
  return loadConfig().dry_run
}

export function isAutomationEnabled(): boolean {
  return loadConfig().automation_enabled
}

export function setAutomationEnabled(state: boolean): boolean {
  const config = loadConfig()
  config.automation_enabled = Boolean(state)
  saveConfig(config)
  return config.automation_enabled
}

export function setDryRun(state: boolean): boolean {
  const config = loadConfig()
  config.dry_run = Boolean(state)
  saveConfig(config)
  return config.dry_run
}
