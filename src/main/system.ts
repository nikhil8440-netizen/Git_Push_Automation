import { hostname, platform } from 'os'
import type { SystemStatus } from '../shared/types'
import { checkGitInstalled, runGit, checkInternet } from './git/run'
import { getGitIdentity } from './git/engine'
import { isAutomationEnabled } from './store/config'

/** Diagnostics for the header status strip (Git / Identity / Network / Scheduler). */
export async function getSystemStatus(): Promise<SystemStatus> {
  const gitOk = await checkGitInstalled()
  let version = ''
  if (gitOk) {
    const v = await runGit(['--version'])
    version = v.ok ? v.stdout.trim() : ''
  }
  const id = await getGitIdentity()
  const net = await checkInternet('github.com', 443)
  const automation = isAutomationEnabled()

  return {
    git: { ok: gitOk, version },
    identity: { ok: id.configured, name: id.name, email: id.email },
    network: { ok: net },
    scheduler: {
      ok: automation,
      detail: automation ? 'Automatic backups on' : 'Automatic backups off'
    },
    platform: `${platform()} (${hostname()})`
  }
}
