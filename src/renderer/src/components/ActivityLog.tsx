import { useMemo, useState } from 'react'
import type { LogEntry } from '@shared/types'
import { StatusBadge } from './ui'

const STATUSES = ['', 'SUCCESS', 'FAILED', 'NO_CHANGES', 'PENDING_RETRY', 'WARNING', 'PAUSED', 'DISABLED']

export function ActivityLog({ logs, onOpen }: { logs: LogEntry[]; onOpen: (e: LogEntry) => void }): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (status && l.status !== status) return false
      if (search && !l.project.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [logs, search, status])

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-slate-200">Activity Log</h2>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by project…"
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500/60"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500/60"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s || 'All Statuses'}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">No log entries.</div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {filtered.map((l, i) => (
                <tr
                  key={i}
                  onClick={() => onOpen(l)}
                  className="cursor-pointer border-b border-slate-800/60 hover:bg-slate-800/40"
                >
                  <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{l.timestamp}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-300">{l.project}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">
                    <span className="line-clamp-1">{l.message}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export function LogConsoleModal({ entry, onClose }: { entry: LogEntry | null; onClose: () => void }): React.JSX.Element | null {
  if (!entry) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700/70 px-5 py-3.5">
          <h3 className="text-base font-semibold text-slate-100">Git Output — {entry.project}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100">
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <div className="flex flex-wrap gap-4 text-slate-400">
            <div>
              <span className="text-slate-500">Time:</span> {entry.timestamp}
            </div>
            <div>
              <span className="text-slate-500">Status:</span> <StatusBadge status={entry.status} />
            </div>
          </div>
          <Section title="Message" body={entry.message} />
          {entry.stdout && <Section title="Standard Output" body={entry.stdout} mono />}
          {entry.stderr && <Section title="Standard Error" body={entry.stderr} mono />}
        </div>
      </div>
    </div>
  )
}

function Section({ title, body, mono }: { title: string; body: string; mono?: boolean }): React.JSX.Element {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <pre className={`whitespace-pre-wrap break-words rounded-lg bg-slate-800/60 p-3 text-slate-300 ${mono ? 'font-mono text-xs' : ''}`}>
        {body || '(empty)'}
      </pre>
    </div>
  )
}
