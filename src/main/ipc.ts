import { ipcMain, app } from 'electron'
import type { GitDataKind, GitOp, Project, ProjectInput } from '../shared/types'
import { acquireLock, releaseLock } from './lock'
import {
  getProjects,
  getProject,
  addProject,
  updateProject,
  deleteProject,
  loadConfig,
  setDryRun,
  setAutomationEnabled
} from './store/config'
import { getLogs } from './store/logger'
import {
  runBackup,
  testProjectConnection,
  getGitIdentity,
  setGitIdentity,
  getGitAuthStatus,
  storeGithubPat
} from './git/engine'
import { query, perform, getRepoStats } from './git/console'
import { getSystemStatus } from './system'
import { runAllEnabled } from './scheduler'

/** Register every IPC handler — one per former REST route. */
export function registerIpc(): void {
  // Projects
  ipcMain.handle('projects:list', () => getProjects())
  ipcMain.handle('projects:get', (_e, id: string) => getProject(id))
  ipcMain.handle('projects:add', (_e, input: ProjectInput) => addProject(input))
  ipcMain.handle('projects:update', (_e, id: string, updates: Partial<Project>) => updateProject(id, updates))
  ipcMain.handle('projects:delete', (_e, id: string) => deleteProject(id))
  ipcMain.handle('project:stats', (_e, id: string) => getRepoStats(id))
  ipcMain.handle('project:testConnection', (_e, id: string) => testProjectConnection(id))

  // Backups (lock-guarded)
  ipcMain.handle('backup:run', async (_e, id: string, commitMessage?: string) => {
    if (!acquireLock()) {
      return { status: 'ALREADY_RUNNING' as const, message: 'Another backup is currently running.' }
    }
    try {
      return await runBackup(id, true, commitMessage)
    } finally {
      releaseLock()
    }
  })
  ipcMain.handle('backup:runAll', () => runAllEnabled(true))

  // Identity & auth
  ipcMain.handle('identity:get', () => getGitIdentity())
  ipcMain.handle('identity:set', (_e, name: string, email: string) => setGitIdentity(name, email))
  ipcMain.handle('auth:get', () => getGitAuthStatus())
  ipcMain.handle('auth:set', (_e, username: string, token: string) => storeGithubPat(username, token))

  // Config & logs
  ipcMain.handle('config:get', () => loadConfig())
  ipcMain.handle('config:setDryRun', (_e, state: boolean) => setDryRun(state))
  ipcMain.handle('config:setAutomation', (_e, state: boolean) => setAutomationEnabled(state))
  ipcMain.handle('logs:list', () => getLogs())
  ipcMain.handle('system:status', () => getSystemStatus())

  // Launch at login
  ipcMain.handle('settings:getLaunchAtLogin', () => app.getLoginItemSettings().openAtLogin)
  ipcMain.handle('settings:setLaunchAtLogin', (_e, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled) })
    return app.getLoginItemSettings().openAtLogin
  })

  // Control panel
  ipcMain.handle('git:data', (_e, id: string, kind: GitDataKind, params?: Record<string, unknown>) =>
    query(id, kind, params ?? {})
  )
  ipcMain.handle('git:action', async (_e, id: string, op: GitOp, params?: Record<string, unknown>) => {
    // A manual control-panel action must not race a running backup.
    if (!acquireLock()) {
      return { success: false, message: 'A backup is currently running. Please try again in a moment.', output: '' }
    }
    try {
      return await perform(id, op, params ?? {})
    } finally {
      releaseLock()
    }
  })
}
