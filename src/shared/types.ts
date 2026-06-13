/**
 * Shared type contract used by the main process, the preload bridge, and the
 * renderer. This is the single source of truth for the data shapes and the
 * git operation vocabulary. Mirrors the schemas in ARCHITECTURE.md.
 */

/** Backup / project status values. */
export type BackupStatus =
  | 'SUCCESS'
  | 'NO_CHANGES'
  | 'FAILED'
  | 'WARNING'
  | 'PENDING_RETRY'
  | 'PAUSED'
  | 'DISABLED'
  | 'ALREADY_RUNNING'

/** A monitored repository (one entry in config.json `projects`). */
export interface Project {
  id: string
  name: string
  path: string
  origin: string
  branch: string
  run_interval_minutes: number
  excluded_paths: string[]
  enabled: boolean
  paused: boolean
  auto_commit: boolean
  auto_push: boolean
  run_on_startup: boolean
  last_status: BackupStatus | ''
  last_run: string
  last_push: string
  last_commit: string
}

/** Fields accepted when creating/updating a project (server fills the rest). */
export type ProjectInput = Pick<
  Project,
  | 'name'
  | 'path'
  | 'origin'
  | 'branch'
  | 'run_interval_minutes'
  | 'excluded_paths'
  | 'enabled'
  | 'paused'
  | 'auto_commit'
  | 'auto_push'
  | 'run_on_startup'
> &
  Partial<Pick<Project, 'id'>>

/** Global configuration (config.json top level). */
export interface GlobalConfig {
  dry_run: boolean
  /** Master switch. When false, NO automatic backups run (startup or scheduled). */
  automation_enabled: boolean
  projects: Project[]
}

/** One activity-log entry (logs.json). Newest first, capped at 1000. */
export interface LogEntry {
  timestamp: string
  project: string
  status: BackupStatus | string
  message: string
  stdout: string
  stderr: string
}

/** Result of a single backup run reported back to the UI. */
export interface BackupResult {
  status: BackupStatus
  message: string
  project_id: string
}

/** Low-level result of running the git CLI. Never throws; always structured. */
export interface GitResult {
  ok: boolean
  code: number
  stdout: string
  stderr: string
}

/** Result of a control-panel mutating action. */
export interface ConsoleActionResult {
  success: boolean
  message: string
  output?: string
}

/** Read kinds for the control panel (GET /git/:id/data/:kind). */
export type GitDataKind =
  | 'overview'
  | 'log'
  | 'branches'
  | 'remotes'
  | 'stashes'
  | 'tags'
  | 'diff'
  | 'config'
  | 'reflog'
  | 'show'

/** Mutating control-panel operations (POST /git/:id/action). */
export type GitOp =
  | 'stage'
  | 'unstage'
  | 'discard'
  | 'untrack'
  | 'commit'
  | 'push'
  | 'pull'
  | 'fetch'
  | 'branch_create'
  | 'branch_switch'
  | 'branch_merge'
  | 'branch_delete'
  | 'remote_add'
  | 'remote_seturl'
  | 'remote_remove'
  | 'reset'
  | 'revert'
  | 'cherry_pick'
  | 'rebase'
  | 'sequence'
  | 'stash'
  | 'tag'
  | 'clean'
  | 'set_config'
  | 'terminal'

/** An in-progress git sequence detected from .git state. */
export type InProgressOp = 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null

/** Git identity (global user.name / user.email). */
export interface GitIdentity {
  name: string
  email: string
}

/** GitHub credential / auth status. */
export interface GitAuthStatus {
  configured: boolean
  helper: string
  message?: string
}

/** Aggregate system diagnostics for the header status strip. */
export interface SystemStatus {
  git: { ok: boolean; version: string }
  identity: { ok: boolean; name: string; email: string }
  network: { ok: boolean }
  scheduler: { ok: boolean; detail: string }
  platform: string
}

/** Rich per-project git stats shown on the Project Detail view. */
export interface RepoStats {
  is_repo: boolean
  branch: string
  ahead: number
  behind: number
  commit_count: number
  staged: number
  unstaged: number
  untracked: number
  conflicts: number
  in_progress: InProgressOp
  last_commit: { sha: string; message: string; author: string; date: string } | null
  remotes: { name: string; url: string }[]
  branch_count: number
  tag_count: number
  stash_count: number
  last_push: string
  repo_size_bytes: number
}
