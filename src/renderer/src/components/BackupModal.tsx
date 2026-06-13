import { useEffect, useState } from 'react'
import { Modal, Button, Field, inputClass } from './ui'

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
