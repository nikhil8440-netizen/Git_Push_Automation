import { useEffect, useState } from 'react'
import type { IdentityInfo, AuthInfo } from '@shared/api'
import { Modal, Button, Field, inputClass } from './ui'
import { toast } from '../lib/toast'

export function ProfileModal({
  open,
  onClose,
  onEditIdentity,
  onEditAuth
}: {
  open: boolean
  onClose: () => void
  onEditIdentity: () => void
  onEditAuth: () => void
}): React.JSX.Element {
  const [id, setId] = useState<IdentityInfo | null>(null)
  const [auth, setAuth] = useState<AuthInfo | null>(null)

  useEffect(() => {
    if (!open) return
    window.api.identity.get().then(setId)
    window.api.auth.get().then(setAuth)
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Your Git Profile"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <p className="mb-4 text-sm text-slate-400">
        The same name, email, and GitHub sign-in Git uses. Set it once and every backup uses it automatically.
      </p>
      <div className="space-y-3">
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-medium text-slate-200">Git Identity</h4>
            <span className={`text-xs ${id?.configured ? 'text-emerald-400' : 'text-amber-400'}`}>
              {id?.configured ? 'Configured' : 'Not set'}
            </span>
          </div>
          <div className="space-y-1 text-sm text-slate-300">
            <div>Name: {id?.name || '—'}</div>
            <div>Email: {id?.email || '—'}</div>
          </div>
          <Button variant="secondary" className="mt-3 w-full" onClick={onEditIdentity}>
            Set / Edit Identity
          </Button>
        </div>

        <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-medium text-slate-200">GitHub Sign-in</h4>
            <span className={`text-xs ${auth?.has_credentials ? 'text-emerald-400' : 'text-amber-400'}`}>
              {auth?.has_credentials ? 'Stored' : 'Not stored'}
            </span>
          </div>
          <div className="space-y-1 text-sm text-slate-300">
            <div>Helper: {auth?.helper || '—'}</div>
          </div>
          <Button variant="secondary" className="mt-3 w-full" onClick={onEditAuth}>
            Set / Update GitHub Credentials
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function IdentityModal({
  open,
  onClose,
  onSaved
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    window.api.identity.get().then((i) => {
      setName(i.name)
      setEmail(i.email)
    })
  }, [open])

  async function save(): Promise<void> {
    setSaving(true)
    const res = await window.api.identity.set(name.trim(), email.trim())
    setSaving(false)
    if (res.success) {
      toast('Identity saved.', 'success')
      onSaved()
      onClose()
    } else {
      toast(res.message, 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Git Identity Setup"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            Save Identity
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-400">
        Git labels your commits with a name and email. One-time setup, saved globally on this machine — not a GitHub login.
      </p>
      <div className="space-y-3">
        <Field label="Your Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
        </Field>
        <Field label="Your Email">
          <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@example.com" />
        </Field>
      </div>
    </Modal>
  )
}

export function AuthModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }): React.JSX.Element {
  const [username, setUsername] = useState('')
  const [token, setToken] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setUsername('')
      setToken('')
    }
  }, [open])

  async function save(): Promise<void> {
    if (!username.trim() || !token.trim()) {
      toast('Username and token are required.', 'error')
      return
    }
    setSaving(true)
    const res = await window.api.auth.set(username.trim(), token.trim())
    setSaving(false)
    if (res.success) {
      toast('GitHub credentials stored.', 'success')
      onSaved()
      onClose()
    } else {
      toast(res.message, 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="GitHub Authentication Setup"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            Save Credentials
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-400">
        Store a GitHub Personal Access Token so pushes never prompt. Saved on this machine via Git's credential helper.
      </p>
      <div className="space-y-3">
        <Field label="GitHub Username">
          <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="johndoe" />
        </Field>
        <Field label="Personal Access Token (PAT)" hint="github.com → Settings → Developer settings → Tokens (classic) → generate with 'repo' scope.">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              className={inputClass}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxx"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-400"
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
        </Field>
      </div>
    </Modal>
  )
}
