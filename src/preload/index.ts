import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { GitManagerAPI } from '../shared/api'
import type { GitDataKind, GitOp, Project, ProjectInput } from '../shared/types'

/** Typed, whitelisted bridge. The renderer can ONLY call these channels. */
const api: GitManagerAPI = {
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    get: (id: string) => ipcRenderer.invoke('projects:get', id),
    add: (input: ProjectInput) => ipcRenderer.invoke('projects:add', input),
    update: (id: string, updates: Partial<Project>) => ipcRenderer.invoke('projects:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('projects:delete', id),
    stats: (id: string) => ipcRenderer.invoke('project:stats', id),
    testConnection: (id: string) => ipcRenderer.invoke('project:testConnection', id)
  },
  backup: {
    run: (id: string, commitMessage?: string) => ipcRenderer.invoke('backup:run', id, commitMessage),
    runAll: () => ipcRenderer.invoke('backup:runAll')
  },
  identity: {
    get: () => ipcRenderer.invoke('identity:get'),
    set: (name: string, email: string) => ipcRenderer.invoke('identity:set', name, email)
  },
  auth: {
    get: () => ipcRenderer.invoke('auth:get'),
    set: (username: string, token: string) => ipcRenderer.invoke('auth:set', username, token)
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    setDryRun: (state: boolean) => ipcRenderer.invoke('config:setDryRun', state),
    setAutomation: (state: boolean) => ipcRenderer.invoke('config:setAutomation', state)
  },
  logs: {
    list: () => ipcRenderer.invoke('logs:list')
  },
  system: {
    status: () => ipcRenderer.invoke('system:status')
  },
  settings: {
    getLaunchAtLogin: () => ipcRenderer.invoke('settings:getLaunchAtLogin'),
    setLaunchAtLogin: (enabled: boolean) => ipcRenderer.invoke('settings:setLaunchAtLogin', enabled)
  },
  git: {
    data: (id: string, kind: GitDataKind, params?: Record<string, unknown>) =>
      ipcRenderer.invoke('git:data', id, kind, params),
    action: (id: string, op: GitOp, params?: Record<string, unknown>) =>
      ipcRenderer.invoke('git:action', id, op, params)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (declared in index.d.ts)
  window.electron = electronAPI
  // @ts-ignore (declared in index.d.ts)
  window.api = api
}
