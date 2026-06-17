# Git Manager

**A local-first desktop app that backs up your local folders to GitHub — point it at a folder, and it handles `git init`, `commit`, and `push` for you. No git commands. No cloud. No database.**

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)
![Electron](https://img.shields.io/badge/Electron-42-47848F)
![React](https://img.shields.io/badge/React-19-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-38BDF8)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What is this?

Git Manager is a **desktop application** that runs entirely on your own machine. You give it a folder and a GitHub remote, and it keeps that folder backed up — on demand with a click, or automatically on a schedule once you opt in.

Built around one promise: **you never touch git yourself.** Point it at a plain folder and the engine does the rest — `git init`, link the remote, `add`, `commit`, `push` — including initializing the repository if it isn't one yet. When you *do* want full git power, a built-in control panel exposes it visually.

> Electron + React + TypeScript + Tailwind, with a Node.js git engine. No Python, no web server, no database — a single app with plain JSON storage.

### Safe by default

Automatic backups are **off until you switch them on**. Out of the box, Git Manager never commits or pushes on its own — opening the app just shows your repositories and waits. Backups run only when you click **Commit** / **Force Run All**, or after you enable automation in Settings.

---

## The app

### Home
A clean dashboard. Each repository is a **clickable card** showing its status, branch, and last run, with a single **Commit** button for a quick manual backup. Across the top: health metrics (total / active / successful / failed / pending-retry / paused). Below: a searchable **activity log** where every run is recorded with its full git output. The header shows a live system-status strip (Git · Identity · Network · Automatic-backups state) and a **Dry Run** switch.

### Project Detail
Click any card to open it. You get rich live stats read straight from that project's `.git` — commit count, ahead/behind, branches, tags, stashes, repo size, last commit and last push — plus a full **control panel**:

- **Action bar:** Commit · Push · Pull · Fetch · Force Push · Test Connection · Edit settings
- **Changes** — stage / unstage / discard, commit, click any file to see its **diff**; conflict-state banner with **Continue / Skip / Abort** when a merge/rebase/cherry-pick is mid-flight
- **History** — per commit: **View diff**, Revert, Cherry-pick, Reset-to-here
- **Branches** — create / switch / merge / **rebase** / delete
- **Remotes** — add / change-URL / remove
- **Stash** — save / pop / apply / drop / clear
- **Tags** — create / push / delete
- **Terminal** — run any git command (git only, no shell)
- **Recovery** — the reflog, to undo a bad reset or rebase

Every destructive operation is gated behind a centered red confirmation overlay that spells out exactly what will be lost.

### Settings
A master **Automatic backups** switch (the schedule + run-on-startup; off by default), and **Start at login**. Closing the window keeps the app running in the system tray so scheduled backups continue; quit fully from the tray.

---

## Install & run

**Requires [Node.js](https://nodejs.org) 18+ and Git on your PATH.**

```bash
npm install      # first time only
npm run dev      # launch the app with hot reload
```

### Build a distributable

```bash
npm run build:win     # Windows  → dist/Git Manager-<v>-setup.exe (NSIS installer) + dist/win-unpacked/
npm run build:mac     # macOS    → dist/*.dmg
npm run build:linux   # Linux    → dist/*.AppImage
```

The build also produces `dist/win-unpacked/Git Manager.exe`, a ready-to-run copy that needs no installation — handy if an unsigned installer is blocked by SmartScreen or antivirus.

### Tests & checks

```bash
npm test          # Vitest — git engine + storage suite (runs against throwaway repos)
npm run typecheck # strict TypeScript across main, preload, and renderer
npm run make:icons  # regenerate build/icon.* from build/icon.svg
```

---

## How a backup works

When a backup runs (manual, scheduled, or on startup), the engine does this in order — stopping and logging on any failure:

1. Verify the local folder exists and Git is installed.
2. **Ensure the repo** — `git init` if needed, set a fallback commit identity if none is configured, link `origin` to your URL.
3. Warn if the repo is unusually large (> 1 GB).
4. `git status --porcelain` → filter out excluded paths and `.gitignore` entries.
5. No file changes? Detect and push any previously-committed-but-unpushed commits.
6. Enforce the large-commit guard (> 1000 files blocks scheduled runs; a manual run overrides).
7. If **Dry Run** is on, stop here — nothing is changed.
8. Untrack newly-ignored files, `git add`, then `git commit` with your title or an auto-generated `Auto Backup - <timestamp>`.
9. Check connectivity (mark *pending retry* if offline), then `git push`. On a non-fast-forward rejection it `pull --rebase`s and retries once.

---

## Architecture

```
Electron Main process (Node + TypeScript) — the "backend"
├── git/run.ts      git CLI wrapper (GIT_TERMINAL_PROMPT=0, never throws → structured result)
├── git/engine.ts   automated backup engine (safe, never destructive)
├── git/console.ts  manual control-panel engine (full git power) + rich repo stats
├── store/*         atomic JSON config + logs, self-healing, single-run lock
├── scheduler.ts    in-process scheduler (no OS Task Scheduler needed)
├── tray.ts         system tray, run-in-background, launch-at-login
└── ipc.ts          typed IPC — one channel per operation
        │  preload contextBridge  (contextIsolation: on, nodeIntegration: off, sandbox: on)
        ▼
Renderer (React + Tailwind) — Home + Project Detail
```

The app **never opens a network port**. The renderer reaches the engine only through a typed, whitelisted preload bridge; all git and file work happens in the main process. A production Content-Security-Policy is applied to the renderer.

**Your data stays local.** `config.json` (your repositories) and `logs.json` (activity history) live in the OS-standard per-user app-data directory (Electron `userData`), written atomically so a crash can't corrupt them. They are **never bundled into the build, never included in the installer, and git-ignored** — so cloning or installing this project gives you an empty app, never anyone else's repositories.

---

## Safety rules

- The **automated** engine never force-pushes, never `reset --hard`, never deletes files.
- The **manual** control panel exposes destructive ops, each gated behind a red confirmation overlay (force push uses `--force-with-lease`).
- `GIT_TERMINAL_PROMPT=0` on every git call — git can never hang waiting on a prompt.
- One backup at a time (lock file); a manual control-panel action can't race a running backup.

These are enforced by the Vitest suite, which runs the engine against throwaway repositories and asserts every rule.

---

## Authentication

- **Windows / macOS** — Git uses the system credential store (Credential Manager / Keychain) automatically. Your first push prompts a sign-in, then it's silent.
- **Linux** — set a GitHub Personal Access Token once via **Profile → GitHub Sign-in**; it's saved by Git's credential helper and reused automatically.
- **SSH** — use `git@github.com:user/repo.git` URLs with your normal SSH keys.

---

## Tech stack

| Layer | Technology |
|---|---|
| Shell | Electron 42 |
| UI | React 19 + TypeScript 6 + Tailwind v4 |
| Build | electron-vite (Vite 7), electron-builder |
| Engine | Node.js `child_process` → `git` CLI |
| Storage | Atomic JSON files (no database) |
| Tests | Vitest |

---

*Made for people who want their work safely on GitHub without thinking about git.*
