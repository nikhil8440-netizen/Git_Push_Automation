# Git Manager → Electron Desktop App — Design Spec

Date: 2026-06-13
Status: IMPLEMENTED — all phases complete. App builds, typechecks, 36 tests pass,
boots cleanly, and a Windows installer is produced (dist/Git Manager-1.0.0-setup.exe).

## Goal

Rebuild Git Manager as a single, installable **desktop application** on a modern
native stack — **Electron + React + TypeScript + Tailwind + Node.js** — with full
feature parity to the current Flask + vanilla-JS app, plus a redesigned navigation
model. **No Python, no Flask, no venv, no pip.** Removing Python is a primary goal:
it is the exact dependency that broke the launcher (a wedged WMI service hung pip).

## Stack & rationale

- **Electron** — cross-platform desktop shell (Win/mac/Linux), single installable app.
- **React + TypeScript** — typed UI. Type safety on every status code, op name, and
  config field is part of "bulletproof" for a tool that runs `git push`/`reset`.
- **Tailwind v4** — styling, faithful to the current dark dashboard look.
- **Node.js (Electron main process)** — the backend/engine. Git work via a thin
  `child_process` wrapper (full control, mirrors the existing Python `run_git`).
- **electron-vite** — integrated main/preload/renderer bundling with secure defaults.
- **electron-builder** — produces installers (NSIS / dmg / AppImage).
- **Vitest** — test suite; this is how a rewrite is made bulletproof.

## Architecture

```
Electron Main process (Node + TS) — the backend
├── git/run.ts        ← port of get_git_env/run_git: GIT_TERMINAL_PROMPT=0,
│                        SSH BatchMode, shlex-style argv, NEVER throws → {ok,stdout,stderr,code}
├── git/engine.ts     ← port of git_runner.py: run_backup() sequence, test_connection,
│                        get/set identity, auth status, store PAT. Never destructive.
├── git/console.ts    ← port of git_console.py: overview/log/branches/remotes/stashes/
│                        tags/diff/config reads; perform(op) ACTIONS map (full git power).
├── store/config.ts   ← port of config_manager.py: atomic JSON writes, self-healing.
├── store/logger.ts   ← port of logger.py: newest-first, capped 1000.
├── lock.ts           ← the .lock file, acquire/release in finally.
├── scheduler.ts      ← in-process scheduler (replaces Windows Task Scheduler).
├── tray.ts           ← system tray + launch-at-login + run-in-background.
├── ipc.ts            ← typed IPC handlers, one per current REST route.
└── index.ts          ← app/window lifecycle, secure BrowserWindow.

Preload (contextBridge) — the ONLY bridge; renderer has NO Node access.
        │ typed, whitelisted channels
        ▼
Renderer (React + Tailwind) — see UI section.
```

### Security (non-negotiable)
`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, renderer talks
only through a typed preload API. All git/file work in main. localhost-only trust
model is preserved (there is no network server at all now — IPC replaces HTTP).

### Storage
Keep JSON files (`config.json`, `logs.json`) under Electron `userData`. **Atomic
writes** (temp file + `rename`) so a crash mid-write cannot corrupt them. Schema is
unchanged from `ARCHITECTURE.md`. Self-heal on missing/corrupt, same as today.

### Data dir migration
On first launch, if a legacy `backend/config.json`/`logs.json` exists, import it into
the new `userData` location once. (Best-effort; never destructive.)

## REST → IPC mapping (1:1)

| Current route | IPC channel |
|---|---|
| GET /projects | `projects:list` |
| POST /projects | `projects:add` |
| PUT /projects/:id | `projects:update` |
| DELETE /projects/:id | `projects:delete` |
| POST /run/:id | `backup:run` |
| POST /run-all | `backup:runAll` |
| POST /test-connection/:id | `project:testConnection` |
| GET/POST /git-identity | `identity:get` / `identity:set` |
| GET/POST /git-auth | `auth:get` / `auth:set` |
| GET /system-status | `system:status` |
| GET /logs | `logs:list` |
| GET/POST /config | `config:get` / `config:set` |
| GET /git/:id/data/:kind | `git:data` |
| POST /git/:id/action | `git:action` |

## UI / UX — redesigned navigation (per user)

Two-view model instead of one crowded dashboard:

### Home (Dashboard)
- **Header:** app **name** + **Profile** button only. **Logo icon removed.**
- **System status** strip: Git / Identity / Network / Scheduler dots + Dry Run toggle.
  (The "Python" dot is removed — there is no Python anymore.)
- **Metrics grid:** Total / Active / Successful / Failed / Pending Retry / Paused.
- **Project list = clickable cards** (replaces the dense table). **The whole card is
  clickable** and opens the Project Detail view. Each card shows name, path, branch,
  status badge, last run, enabled toggle, and **only one action button: Commit**
  (the quick manual backup). Test Connection / Push / Pull / control buttons are
  **removed from the home page.**
- **Add Repository** form (slide-in panel, same fields as today).
- **Activity Log** panel (search + status filter), with the per-entry console modal.

### Project Detail (opens on card click)
Everything operational lives here:
- **Header:** project name, branch chip, ahead/behind sync info, path, Back button.
- **Rich repo stats read live from that project's `.git`:** total commit count,
  last commit (sha + message + time), current branch, ahead/behind origin,
  tracked/untracked/staged counts, remotes, last push time, repo size, # of branches,
  # of tags, # of stashes. Organized into stat cards.
- **Action bar:** Commit / Push / Pull / Fetch / Force Push (force is UI-gated) /
  Test Connection / Edit settings.
- **Control panel tabs** (ported from the current panel): Changes, History, Branches,
  Remotes, Stash, Terminal.

### Preserved modals / overlays
Profile, Git Identity setup, GitHub Auth (PAT, Linux), backup prompt, generic input
prompt, log console, run-loading overlay, and the **centered red DANGER overlay** for
every destructive op (kept exactly — see destructive-ops safety rule).

## Scheduler / tray (upgrade)
In-process scheduler runs due backups while the app is open. App supports
**run-in-tray + launch-at-login**, so closing the window keeps backups firing. This
replaces the brittle `schtasks`/PowerShell Task Scheduler integration.

## Safety rules (carried over verbatim from ARCHITECTURE.md)
- Automated engine NEVER force-pushes, NEVER `reset --hard`, NEVER deletes files.
- Manual control panel exposes destructive ops, each gated behind the red confirm overlay.
- `GIT_TERMINAL_PROMPT=0` on every git call.
- Only one backup at a time (lock file); manual action acquires the same lock (409 → busy).
- Config writes limited to user.name/email/credential.helper, with explicit consent.

## Testing (bulletproofness)
Vitest suite runs `git/engine.ts` and `git/console.ts` against throwaway temp repos.
Each safety rule and each backup-sequence branch from ARCHITECTURE.md becomes a test:
no-changes path, unpushed-commit detection, large-commit guard, dry-run stop, lock
always released, excluded-paths filtering, never-force-push, never-hard-reset.

## Phased plan
0. **Scaffold** — electron-vite + React + TS + Tailwind + electron-builder + Vitest;
   secure window renders.
1. **Data layer** — types, config store, logger, lock (+ tests).
2. **Git engine** — run wrapper, backup engine, console engine (+ tests vs temp repos).
3. **IPC + preload** — typed bridge, scheduler, tray, launch-at-login.
4. **Renderer** — Home (cards), Project Detail, control-panel tabs, all modals, status.
5. **Packaging & polish** — installers, icon, migration import, docs; retire Python.

## Risk & mitigation
Porting ~1,600 lines of careful git logic carries regression risk. Mitigation: the
existing Python is the executable spec — behavior ported precisely — and the Vitest
suite asserts every safety rule before we rely on it. Built in phases with checkpoints.
