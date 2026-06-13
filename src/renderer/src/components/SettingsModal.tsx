import { useEffect, useState } from 'react'
import { Modal, Button, Toggle } from './ui'
import { toast } from '../lib/toast'

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const [launchAtLogin, setLaunchAtLogin] = useState(false)
  const [automation, setAutomation] = useState(false)

  useEffect(() => {
    if (!open) return
    window.api.settings.getLaunchAtLogin().then(setLaunchAtLogin)
    window.api.config.get().then((c) => setAutomation(c.automation_enabled))
  }, [open])

  async function toggleLaunch(v: boolean): Promise<void> {
    const result = await window.api.settings.setLaunchAtLogin(v)
    setLaunchAtLogin(result)
    toast(result ? 'Git Manager will start at login.' : 'Start at login disabled.', 'success')
  }

  async function toggleAutomation(v: boolean): Promise<void> {
    const result = await window.api.config.setAutomation(v)
    setAutomation(result)
    toast(result ? 'Automatic backups are ON.' : 'Automatic backups are OFF.', result ? 'success' : 'info')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      size="sm"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
          <div>
            <div className="font-medium text-slate-200">Automatic backups</div>
            <p className="mt-0.5 text-xs text-slate-500">
              Master switch. When off, Git Manager never commits or pushes on its own — backups run only when you click
              Commit or Force Run All. Turn on to enable the schedule and run-on-startup.
            </p>
          </div>
          <Toggle checked={automation} onChange={toggleAutomation} />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
          <div>
            <div className="font-medium text-slate-200">Start at login</div>
            <p className="mt-0.5 text-xs text-slate-500">
              Launch Git Manager automatically when you sign in, so scheduled backups keep running.
            </p>
          </div>
          <Toggle checked={launchAtLogin} onChange={toggleLaunch} />
        </div>
        <p className="text-xs text-slate-500">
          Closing the window keeps Git Manager running in the system tray so backups continue. Quit fully from the tray
          icon.
        </p>
      </div>
    </Modal>
  )
}
