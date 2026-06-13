import { useEffect, useState } from 'react'
import type { Project, ProjectInput } from '@shared/types'
import { Modal, Button, Field, Toggle, inputClass } from './ui'
import { toast } from '../lib/toast'

const empty = {
  name: '',
  path: '',
  origin: '',
  branch: 'main',
  run_interval_minutes: 30,
  excluded: '.venv, node_modules, dist, build',
  enabled: true,
  auto_commit: true,
  auto_push: true,
  run_on_startup: false
}

export function ProjectForm({
  open,
  initial,
  onClose,
  onSaved
}: {
  open: boolean
  initial: Project | null
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setForm({
        name: initial.name,
        path: initial.path,
        origin: initial.origin,
        branch: initial.branch,
        run_interval_minutes: initial.run_interval_minutes,
        excluded: (initial.excluded_paths ?? []).join(', '),
        enabled: initial.enabled,
        auto_commit: initial.auto_commit,
        auto_push: initial.auto_push,
        run_on_startup: initial.run_on_startup
      })
    } else {
      setForm(empty)
    }
  }, [open, initial])

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]): void => setForm((f) => ({ ...f, [k]: v }))

  async function save(): Promise<void> {
    if (!form.name.trim() || !form.path.trim() || !form.origin.trim()) {
      toast('Name, path and remote URL are required.', 'error')
      return
    }
    setSaving(true)
    const payload: ProjectInput = {
      name: form.name.trim(),
      path: form.path.trim(),
      origin: form.origin.trim(),
      branch: form.branch.trim() || 'main',
      run_interval_minutes: Number(form.run_interval_minutes) || 30,
      excluded_paths: form.excluded
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      enabled: form.enabled,
      paused: initial?.paused ?? false,
      auto_commit: form.auto_commit,
      auto_push: form.auto_push,
      run_on_startup: form.run_on_startup
    }
    try {
      if (initial) await window.api.projects.update(initial.id, payload as Partial<Project>)
      else await window.api.projects.add(payload)
      toast(initial ? 'Repository updated.' : 'Repository added.', 'success')
      onSaved()
      onClose()
    } catch (e) {
      toast(`Save failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit Repository' : 'Add Repository'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Repository'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Project Name">
          <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="My Website" />
        </Field>
        <Field
          label="Local Directory Path"
          hint="Absolute path on this machine. If it isn't a Git repo yet, it's initialized and linked automatically."
        >
          <input className={inputClass} value={form.path} onChange={(e) => set('path', e.target.value)} placeholder="C:/Projects/MyWeb" />
        </Field>
        <Field label="Remote Origin URL (HTTPS or SSH)">
          <input className={inputClass} value={form.origin} onChange={(e) => set('origin', e.target.value)} placeholder="git@github.com:user/repo.git" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Branch">
            <input className={inputClass} value={form.branch} onChange={(e) => set('branch', e.target.value)} placeholder="main" />
          </Field>
          <Field label="Backup Interval (minutes)">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.run_interval_minutes}
              onChange={(e) => set('run_interval_minutes', Number(e.target.value))}
            />
          </Field>
        </div>
        <Field label="Excluded Paths (comma separated)" hint="Changes inside these folders are filtered out before staging.">
          <input className={inputClass} value={form.excluded} onChange={(e) => set('excluded', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Toggle checked={form.enabled} onChange={(v) => set('enabled', v)} label="Enabled" />
          <Toggle checked={form.auto_commit} onChange={(v) => set('auto_commit', v)} label="Auto Commit" />
          <Toggle checked={form.auto_push} onChange={(v) => set('auto_push', v)} label="Auto Push" />
          <Toggle checked={form.run_on_startup} onChange={(v) => set('run_on_startup', v)} label="Run on Startup" />
        </div>
      </div>
    </Modal>
  )
}
