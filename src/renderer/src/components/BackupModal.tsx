import { useEffect, useState } from 'react'
import { Modal, Button, Field, inputClass } from './ui'

export function GitInitModal({
  open,
  project,
  onClose,
  onConfirm
}: {
  open: boolean
  project: { name: string; path: string } | null
  onClose: () => void
  onConfirm: (message: string) => void
}): React.JSX.Element {
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (open) setMsg('')
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="No Git Repository Found"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onConfirm(msg)}>
            Initialize &amp; Back Up
          </Button>
        </>
      }
    >
      <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
        <p className="text-sm font-medium text-amber-300">⚠ Not yet a git repository</p>
        <p className="mt-1 break-all text-xs text-amber-200/70">{project?.path}</p>
      </div>
      <p className="mb-4 text-sm text-slate-300">
        This folder has no <code className="rounded bg-slate-800 px-1 text-slate-200">.git</code> directory.
        Initialize it as a git repository and run a backup now?
      </p>
      <Field label="Commit Message (optional)" hint='Leave blank to use: Auto Backup - <date time>'>
        <input
          className={inputClass}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Initial commit"
          autoFocus
        />
      </Field>
    </Modal>
  )
}

export function BackupModal({
  open,
  projectName,
  onClose,
  onConfirm
}: {
  open: boolean
  projectName: string
  onClose: () => void
  onConfirm: (message: string) => void
}): React.JSX.Element {
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (open) setMsg('')
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Run Repository Backup"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onConfirm(msg)}>
            Commit &amp; Push
          </Button>
        </>
      }
    >
      <div className="mb-3 border-l-2 border-indigo-500 pl-3">
        <p className="font-medium text-slate-100">{projectName}</p>
        <p className="text-sm text-slate-400">Your local files will be committed and pushed to GitHub.</p>
      </div>
      <Field label="Commit Message (optional)" hint="Leave blank to use: Auto Backup - <date time>">
        <input className={inputClass} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Added login styles" autoFocus />
      </Field>
    </Modal>
  )
}
