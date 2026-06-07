# Git Manager

**Git Manager** is a local-first Windows 11 dashboard and automation engine that monitors, manages, and automatically backs up multiple Git repositories (designed to comfortably handle 20+). You point it at a folder and a remote URL, and it keeps that folder committed and pushed to GitHub for you — **on a schedule, with one click, and without you ever touching the `git` command line.**

It runs entirely on your own machine: a small Flask backend, a vanilla HTML/CSS/JS dashboard, and plain JSON files for storage. No external database, no cloud service, no heavy framework.

---

## Table of Contents
1. [Motivation & Philosophy](#motivation--philosophy)
2. [Features](#features)
3. [How It Works (The Backup Pipeline)](#how-it-works-the-backup-pipeline)
4. [Architecture](#architecture)
5. [Project Structure](#project-structure)
6. [Installation & Setup](#installation--setup)
7. [Running the App](#running-the-app)
8. [Using the Dashboard](#using-the-dashboard)
9. [Dry Run Mode](#dry-run-mode)
10. [Status Reference](#status-reference)
11. [Windows Task Scheduler Integration](#windows-task-scheduler-integration)
12. [API Reference](#api-reference)
13. [Configuration & Data Files](#configuration--data-files)
14. [Troubleshooting](#troubleshooting)
15. [Tech Stack](#tech-stack)

---

## Motivation & Philosophy

The core idea: **"Give the dashboard a folder, and it handles git for you."**

A lot of people keep important work in local folders and forget (or don't know how) to back it up to GitHub. Git Manager removes every manual step:

- You don't run `git init`.
- You don't run `git remote add`.
- You don't run `git add` / `commit` / `push`.

You add a project through a web form (local folder path + GitHub URL), and the engine does the rest — **initializing the repository if it doesn't exist yet**, wiring up the remote, committing changes, and pushing — either on a timer or on demand.

Design principles:
- **Local-first:** everything lives and runs on your machine. State is stored in human-readable JSON.
- **Safe by default:** locking prevents concurrent runs, guardrails stop runaway commits, and Dry Run lets you preview before anything is written.
- **No git knowledge required:** the dashboard is the only interface you need.

---

## Features

1. **Hands-off Git Automation** — Periodically (or on demand) detects changes, stages, commits, and pushes them. Commit messages are timestamped (`Auto Backup - YYYY-MM-DD HH:MM:SS`).
2. **Automatic Repository Initialization** — Point the dashboard at *any* folder. If it isn't a Git repo yet, Git Manager runs `git init`, sets the branch, configures a commit identity if one is missing, and links `origin` to the remote URL you provided. You never run git yourself.
3. **Execution Locking** — A `.lock` file (containing the running process's PID) prevents two backup runs (e.g. the scheduler and a manual "Run Now") from colliding.
4. **Dry Run Simulation** — A global toggle that runs every *check* but skips `commit` and `push`, so you can preview what a backup would do without changing anything. (See [Dry Run Mode](#dry-run-mode).)
5. **Internal Exclusion Lists** — Per-project "Excluded Paths" (e.g. `.venv`, `node_modules`, `dist`, `build`) are filtered out **in Python** during staging, on top of whatever `.gitignore` already excludes — without editing `.git/info/exclude` or `.gitignore`.
6. **Safety Guardrails** —
   - **Large-repo warning:** logs a `WARNING` if a repository exceeds **1 GB**.
   - **Large-commit guard:** if a scheduled run would stage **more than 1000 files**, it aborts and requires a manual "Run Now" confirmation (prevents accidental massive commits).
7. **Live System Diagnostics** — A System Status panel continuously reports Python, Git, network connectivity, and Windows Task Scheduler registration.
8. **SSH & HTTPS Support** — Works with both `https://` and `git@` remote URLs; it parses the host automatically to check connectivity (port 443 for HTTPS, port 22 for SSH).
9. **Connection Testing** — A "Test Conn" button validates the remote URL, credentials, and network reachability — and it works **even before the folder has been initialized** as a repo.
10. **Detailed Log Console** — Every command's `stdout`/`stderr` is captured and viewable in an in-dashboard console modal. Logs are kept newest-first and capped at 1000 entries.
11. **Per-project Controls** — Enable/disable, pause/resume, per-project backup interval, auto-commit and auto-push toggles, and "run on startup."
12. **Retry Logic** — If the network is unavailable at push time, the project is marked `PENDING_RETRY` and retried on the next scheduler tick instead of failing permanently.

---

## How It Works (The Backup Pipeline)

When a backup runs for a project (`git_runner.run_backup`), it executes these steps in order. Any failure logs an event and stops the run for that project:

1. **Path check** — the local folder exists.
2. **Git check** — `git` is installed and on `PATH`.
3. **Ensure repository** (`ensure_git_repo`) — the headline feature:
   - If there's no `.git`, run `git init -b <branch>`.
   - Ensure a commit identity exists (sets a safe local fallback only if none is configured).
   - Ensure `origin` points at the configured URL (`git remote add` / `set-url`).
4. **Size check** — warn (non-fatal) if the repo exceeds 1 GB.
5. **Status** — `git status --porcelain` to detect changes.
6. **Filter** — parse the status output and drop anything matching the project's Excluded Paths. If nothing is left → `NO_CHANGES`.
7. **Large-commit guard** — if > 1000 changed files **and** this is a scheduled (non-manual) run → `FAILED` (requires manual Run Now).
8. **Dry Run check** — if Dry Run is ON, log a `WARNING` and stop here (no commit/push).
9. **Stage & commit** — `git add` in batches of 100, then `git commit -m "Auto Backup - <timestamp>"`.
10. **Verify remote** — confirm `origin` is configured.
11. **Connectivity** — TCP-check the git host; if unreachable → `PENDING_RETRY`.
12. **Push** — `git push -u origin <branch>` (sets upstream tracking). On success → `SUCCESS`.

---

## Architecture

```
Browser (frontend)  ──HTTP──▶  Flask API (app.py)  ──▶  git_runner.py  ──▶  git CLI
       ▲                              │                       │
       │  polls every few seconds     ▼                       ▼
       └────────────────────────  config.json / logs.json (JSON storage)

Windows Task Scheduler  ──runs──▶  scheduler.py  ──▶  git_runner.py  (same engine, no browser)
```

- **Frontend** is a single page that polls the backend for projects, logs, and system status, and renders the dashboard.
- **Backend (Flask)** exposes a small REST API and delegates all git work to `git_runner.py`.
- **`git_runner.py`** is the engine — it does every git operation and all the safety logic.
- **`scheduler.py`** is a headless entry point that runs the same engine for due projects; it's what Windows Task Scheduler invokes.
- **Storage** is two JSON files: `config.json` (settings + projects) and `logs.json` (activity history).

---

## Project Structure

```
Git_Manager/
├── backend/
│   ├── app.py              # Flask server + REST API endpoints
│   ├── scheduler.py        # Headless automation entry point (Task Scheduler runs this)
│   ├── git_runner.py       # The engine: all git ops, auto-init, safety guards, diagnostics
│   ├── config_manager.py   # Loads/saves config.json; project CRUD; dry-run flag
│   ├── logger.py           # Loads/saves logs.json; append + cap to 1000 entries
│   ├── create_task.ps1     # Registers the "Git Manager" scheduled task (run as Admin)
│   ├── remove_task.ps1     # Unregisters the scheduled task (run as Admin)
│   ├── config.json         # (generated) settings + project list
│   └── logs.json           # (generated) activity log history
├── frontend/
│   ├── index.html          # Dashboard markup (metrics, table, form, log panel, modal)
│   ├── app.js              # Frontend logic: polling, rendering, form submit, actions
│   └── style.css           # Dark theme styling and status badges
├── README.md               # This file
├── requirements.txt        # Python dependencies (Flask)
├── .gitignore              # Ignores .venv, __pycache__, *.pyc, *.log, .vscode, backend/.lock
└── start.bat               # One-click launcher (creates venv, installs deps, opens browser, starts server)
```

> **Generated at runtime:** `backend/config.json`, `backend/logs.json`, `backend/.lock`, `.venv/`, and `__pycache__/`. The JSON files self-initialize to safe defaults if missing or corrupt.

---

## Installation & Setup

### 1. Install Python 3
- Download Python 3.10+ from the [official page](https://www.python.org/downloads/).
- During install, check **"Add Python to PATH."**
- The `py` launcher and a working `python` on PATH are both fine.

### 2. Install Git
- Install [Git for Windows](https://git-scm.com/download/win) and make sure `git --version` works in a terminal.

### 3. First launch
Just run the launcher (double-click in Explorer, or run from a terminal):
```
E:\Git_Manager\start.bat
```
On first run it will:
- Verify Python is available.
- Create a virtual environment (`.venv`) if missing.
- Install dependencies from `requirements.txt`.
- Open the dashboard at `http://127.0.0.1:5000` in your default browser.
- Start the Flask server in that window.

---

## Running the App

- **Normal use:** double-click `start.bat`. Keep the console window open while you use the dashboard; close it (or press `Ctrl+C`) to stop.
- **Manual / dev:** from the project root, with the venv active, run `python -m backend.app`. (It **must** be run as a module from the project root — `python backend\app.py` also works because the scripts self-correct `sys.path`, but `-m` is the canonical way.)
- The dashboard lives at **http://127.0.0.1:5000** (also reachable as `localhost:5000`).

---

## Using the Dashboard

1. **Add a repository:** click **+ Add Repository** and fill in:
   - **Project Name** — any label.
   - **Local Directory Path** — absolute path (e.g. `D:\Projects\MyApp`). *It does not need to be a Git repo yet* — it will be initialized automatically.
   - **Remote Origin URL** — HTTPS (`https://github.com/you/repo.git`) or SSH (`git@github.com:you/repo.git`).
   - **Branch** — usually `main`.
   - **Backup Interval (minutes)**, **Excluded Paths**, and toggles (Enabled, Auto Commit, Auto Push, Run on Startup).
2. **Test Conn** — verifies the remote URL/credentials/network (works before init).
3. **Run Now** — runs the full pipeline immediately: init (if needed) → commit → push.
4. **Pause / Edit / Delete** — manage each project from its row.
5. The **metrics row** (Total / Active / Successful / Failed / Pending Retry / Paused) and the **Activity Log Panel** update automatically as the frontend polls the backend.

---

## Dry Run Mode

A **global** toggle in the dashboard header. **Dry Run = "do everything except commit and push."**

| Pipeline step | Dry Run ON | Dry Run OFF (default) |
|---|---|---|
| Auto-init repo (`git init`) | ✅ runs | ✅ runs |
| Link/fix `origin` remote | ✅ runs | ✅ runs |
| `git status` + filtering | ✅ runs | ✅ runs |
| Safety guards | ✅ runs | ✅ runs |
| `git add` / `commit` | ❌ skipped | ✅ runs |
| `git push` | ❌ skipped | ✅ runs |

With Dry Run ON, a run logs `Dry Run Mode: N changes detected. Commits and pushes are simulated.` and leaves your files and remote untouched. It affects **all** projects and both scheduled and manual runs. It is saved instantly to `config.json` when toggled. For real backups, leave it **OFF**.

---

## Status Reference

| Status | Meaning |
|---|---|
| `SUCCESS` | Backup (or sub-step) completed successfully. |
| `NO_CHANGES` | Nothing to commit after exclusions (also used for Dry Run outcome). |
| `FAILED` | An error occurred (auth, missing folder, large-commit guard, etc.). |
| `WARNING` | Non-fatal notice (large repo, Dry Run simulation, dry-run enabled). |
| `PENDING_RETRY` | Network unavailable at push time; will retry next tick. |
| `PAUSED` | Project paused by the user; scheduler skips it. |
| `DISABLED` | Project disabled (or deleted) by the user. |
| `ALREADY_RUNNING` | A run was attempted while the lock was held. |

---

## Windows Task Scheduler Integration

To back up automatically without the dashboard open:

### Register the task
1. Open **PowerShell as Administrator**.
2. ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   cd E:\Git_Manager\backend
   .\create_task.ps1
   ```
This registers a task named **`Git Manager`** that runs `scheduler.py` (via the venv Python, falling back to system Python) **at logon and every 10 minutes**, under your user account (so your SSH keys / Windows Credential Manager are available).

### Remove the task
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
cd E:\Git_Manager\backend
.\remove_task.ps1
```

> Note: the **per-project interval** (e.g. 30 min) controls whether a project is *due*; the task itself ticks every 10 min and runs only the projects whose interval has elapsed.

---

## API Reference

All endpoints are served from `http://127.0.0.1:5000`.

| Method | Route | Purpose |
|---|---|---|
| GET | `/` | Serve the dashboard. |
| GET | `/projects` | List all projects. |
| POST | `/projects` | Add a project (`name` + `path` required). |
| PUT | `/projects/<id>` | Update a project (logs pause/resume/enable/disable transitions). |
| DELETE | `/projects/<id>` | Delete a project. |
| POST | `/run/<id>` | Run a backup now (respects the lock; `409` if already running). |
| POST | `/test-connection/<id>` | Test remote connectivity for a project. |
| GET | `/system-status` | Python/Git/network/task-scheduler/dry-run status. |
| GET | `/logs` | Full activity log (newest first). |
| GET | `/config` | Full configuration (dry-run + projects). |
| POST | `/config` | Update global config (currently the dry-run toggle). |

---

## Configuration & Data Files

**`backend/config.json`** — global settings and the project list. Each project:
```json
{
  "id": "uuid",
  "name": "My Project",
  "path": "D:/Projects/MyApp",
  "origin": "https://github.com/you/repo.git",
  "branch": "main",
  "enabled": true,
  "paused": false,
  "auto_commit": true,
  "auto_push": true,
  "run_on_startup": true,
  "run_interval_minutes": 30,
  "excluded_paths": [".venv", "node_modules", "dist", "build"],
  "last_run": "",
  "last_commit": "",
  "last_push": "",
  "last_status": "Never Run"
}
```
Both `config.json` and `logs.json` auto-recreate from safe defaults if missing; a corrupt `config.json` is renamed to `config.json.corrupt` and replaced.

---

## Troubleshooting

**1. Authentication failures on push/`ls-remote`**
- **SSH:** ensure your key is loaded (`ssh-add -l`) or present at `C:\Users\<you>\.ssh\`.
- **HTTPS:** use the Windows Credential Manager — `git config --global credential.helper manager`. The first push may pop a credential dialog; after that it's cached.

**2. `ALREADY_RUNNING` / "A backup process is already running"**
- A previous run crashed or a manual run overlapped the scheduler. If nothing is actually running, delete the lock file: `E:\Git_Manager\backend\.lock`.

**3. PowerShell blocks the `.ps1` scripts**
- Run with the bypass flag: `powershell -ExecutionPolicy Bypass -File .\create_task.ps1`.

**4. "Push rejected (non-fast-forward)"**
- The remote already has commits the local repo doesn't. This happens if you created the GitHub repo *with* a README/license. Either start from an empty remote, or reconcile the histories manually once.

**5. The dashboard is empty**
- That's expected with no projects configured. Click **+ Add Repository**.

---

## Tech Stack

- **Backend:** Python 3, Flask, standard library (`subprocess`, `socket`, `os`, `json`, `uuid`, `re`).
- **Frontend:** vanilla HTML, CSS, JavaScript (no frameworks, no build step).
- **Storage:** JSON files.
- **Automation:** Windows Task Scheduler + PowerShell.
- **Platform:** Windows 11.
