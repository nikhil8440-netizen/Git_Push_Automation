/**
 * The typed bridge contract exposed to the renderer as `window.api`. Both the
 * preload implementation and the React code import this, so every IPC call is
 * type-checked end to end.
 */
import type {
  Project,
  ProjectInput,
  GlobalConfig,
  LogEntry,
  BackupStatus,
  GitDataKind,
  GitOp,
  ConsoleActionResult,
  RepoStats,
  SystemStatus
} from './types'

export interface ServiceResult {
  success: boolean
  message: string
}

export interface IdentityInfo {
  name: string
  email: string
  configured: boolean
}

export interface AuthInfo {
  helper: string
  has_credentials: boolean
  needs_setup: boolean
}

export interface BackupOutcome {
  status: BackupStatus
  message: string
}

export interface RunAllItem {
  project: string
  status: BackupStatus
  message: string
}

export interface QueryResult {
  ok: boolean
  error?: string
  [key: string]: unknown
}

export interface StatsResult {
  ok: boolean
  error?: string
  stats?: RepoStats
}

export interface GitManagerAPI {
  projects: {
    list(): Promise<Project[]>
    get(id: string): Promise<Project | null>
    add(input: ProjectInput): Promise<Project>
    update(id: string, updates: Partial<Project>): Promise<Project | null>
    delete(id: string): Promise<boolean>
    stats(id: string): Promise<StatsResult>
    testConnection(id: string): Promise<ServiceResult>
  }
  backup: {
    run(id: string, commitMessage?: string): Promise<BackupOutcome>
    runAll(): Promise<RunAllItem[]>
  }
  identity: {
    get(): Promise<IdentityInfo>
    set(name: string, email: string): Promise<ServiceResult>
  }
  auth: {
    get(): Promise<AuthInfo>
    set(username: string, token: string): Promise<ServiceResult>
  }
  config: {
    get(): Promise<GlobalConfig>
    setDryRun(state: boolean): Promise<boolean>
    setAutomation(state: boolean): Promise<boolean>
  }
  logs: {
    list(): Promise<LogEntry[]>
  }
  system: {
    status(): Promise<SystemStatus>
  }
  settings: {
    getLaunchAtLogin(): Promise<boolean>
    setLaunchAtLogin(enabled: boolean): Promise<boolean>
  }
  git: {
    data(id: string, kind: GitDataKind, params?: Record<string, unknown>): Promise<QueryResult>
    action(id: string, op: GitOp, params?: Record<string, unknown>): Promise<ConsoleActionResult>
  }
}
