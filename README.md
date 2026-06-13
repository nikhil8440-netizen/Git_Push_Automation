# Git Manager

**A local-first desktop app that automatically backs up your local folders to GitHub — point it at a folder, and it handles `git init`, `commit`, and `push` for you. No git commands. No cloud. No database.**

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)
![Electron](https://img.shields.io/badge/Electron-42-47848F)
![React](https://img.shields.io/badge/React-19-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-38BDF8)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What is this?

Git Manager is a **desktop application** that runs entirely on your own machine. It
watches the local folders you choose and keeps them backed up to their GitHub
remotes — automatically on a schedule, or instantly with a button.

Built around one promise: **you never touch git yourself.** Give it a folder path
and a remote URL, and the engine does the rest — including initializing the
repository if the folder is not a git repo yet.

> Electron + React + TypeScript + Tailwind, with a Node.js git engine. No Python,
> no web server, no database — just a single installable app and plain JSON storage.

---

## The app

**Home** — a clean dashboard. Each repository is a **clickable card** showing its
status, branch, and last run, with a single **Commit** button for a quick manual
backup. Health metrics across the top, an activity log below, and a system-status
strip (Git / Identity / Network / Scheduler) plus a Dry Run switch in the header.

**Project Detail** — click any card to open it. Here you get rich live stats read
straight from that project's `.git` (commit count, ahead/behind, branches, tags,
stashes, repo size, last commit/push) and the full **control panel**: Push, Pull,
Fetch, Force Push, Test Connection, plus tabs for Changes, History, Branches,
Remotes, Stash, and a Terminal that runs any git command. Every destructive
operation is gated behind a red confirmation overlay.

---

## Run it (development)

Requires **Node.js 18+** and **Git** on PATH.

```bash
npm install      # first time only
npm run dev      # launches the desktop app with hot reload
```

## Build an installer

```bash
npm run build:win     # Windows  → dist/Git Manager-<v>-setup.exe (NSIS)
npm run build:mac     # macOS    → dist/*.dmg
npm run build:linux   # Linux    → dist/*.AppImage
```

## Tests & checks

```bash
npm test          # Vitest — git engine + storage suite (runs against temp repos)
npm run typecheck # strict TypeScript across main, preload, and renderer
```

---

## How a backup works

When a backup runs (scheduled or manual), the engine does this in order — stopping
and logging on any failure:

1. Verify the local folder exists and Git is installed.
2. **Ensure the repo** — `git init` if needed, set a fallback commit identity if
   none is configured, link `origin` to your URL.
3. Warn if the repo is unusually large (> 1 GB).
4. `git status --porcelain` → filter out excluded paths and `.gitignore` entries.
5. No file changes? Detect and push any previously-committed-but-unpushed commits.
6. Enforce the large-commit guard (> 1000 files blocks scheduled runs).
7. If **Dry Run** is on, stop here — nothing is changed.
8. Untrack newly-ignored files, `git add`, then `git commit` with your title or an
   auto-generated `Auto Backup - <timestamp>`.
9. Check connectivity (mark *pending retry* if offline), then `git push`. On a
   non-fast-forward rejection it `pull --rebase`s and retries once.

---

## Architecture

```
Electron Main process (Node + TypeScript) — the backend
├── git/run.ts      git CLI wrapper (GIT_TERMINAL_PROMPT=0, never throws)
├── git/engine.ts   automated backup engine (safe, never destructive)
├── git/console.ts  manual control-panel engine (full git power)
├── store/*         atomic JSON config + logs, self-healing
├── scheduler.ts    in-process scheduler (no OS Task Scheduler needed)
├── tray.ts         system tray + run-in-background
└── ipc.ts          typed IPC, one channel per operation
        │  preload contextBridge (contextIsolation on, nodeIntegration off)
        ▼
Renderer (React + Tailwind) — Home + Project Detail
```

The app never opens a network port. The renderer talks to the engine only through
a typed, whitelisted preload bridge. All git work happens in the main process.

**Data location:** `config.json` and `logs.json` live in the OS-standard app data
directory (Electron `userData`), written atomically so a crash can't corrupt them.
On first launch the app imports a legacy `backend/config.json`/`logs.json` if present.

---

## Safety rules

- The **automated** engine never force-pushes, never `reset --hard`, never deletes files.
- The **manual** control panel exposes destructive ops, each gated behind a red
  confirmation overlay (force push uses `--force-with-lease`).
- `GIT_TERMINAL_PROMPT=0` on every git call — git can never hang on a prompt.
- One backup at a time (lock file); a manual control-panel action can't race a backup.

These are enforced by the Vitest suite, which runs the engine against throwaway
repositories and asserts every rule.

---

## Authentication

- **Windows / macOS** — Git uses the system credential store (Credential Manager /
  Keychain) automatically. Your first push prompts a sign-in, then it's silent.
- **Linux** — set a GitHub Personal Access Token once via the Profile → GitHub
  Sign-in modal; it's saved by Git's credential helper and used automatically.
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
