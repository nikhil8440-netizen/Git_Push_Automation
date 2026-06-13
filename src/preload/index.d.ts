import { ElectronAPI } from '@electron-toolkit/preload'
import type { GitManagerAPI } from '../shared/api'

declare global {
  interface Window {
    electron: ElectronAPI
    api: GitManagerAPI
  }
}
