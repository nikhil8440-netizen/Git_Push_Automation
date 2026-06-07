# 🗂️ Git Manager

**A local-first Windows dashboard that automatically backs up your Git repositories to GitHub — point it at a folder, and it handles `init`, `commit`, and `push` for you. No git commands. No cloud. No database.**

![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D6)
![Python](https://img.shields.io/badge/python-3.10%2B-3776AB)
![Flask](https://img.shields.io/badge/Flask-3.x-000000)
![Storage](https://img.shields.io/badge/storage-JSON%20files-orange)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What is this?

Git Manager is a small web app that runs **entirely on your own machine**. It watches the local folders you choose and keeps them backed up to their GitHub remotes — automatically on a schedule, or instantly with a button. You manage everything from a clean dashboard in your browser at `http://127.0.0.1:5000`.

It was built around one promise: **you never have to touch git yourself.** You give it a folder and a remote URL through a form, and the engine does the rest — including initializing the repository if the folder isn't a git repo yet.

> Built with a Flask backend, a vanilla HTML/CSS/JS frontend, and plain JSON files for storage. No external services, no heavy frameworks.

---

## ✨ Key Features

- **Zero-git workflow** — add a repo through the dashboard; the app runs `git init`, links the remote, commits, and pushes for you.
- **Automatic repository initialization** — point it at *any* folder. If it's not a git repo, it's initialized and wired to your remote automatically.
- **Scheduled backups** — integrates with Windows Task Scheduler to back up on a configurable interval (e.g. every 30 min, or daily), even when the dashboard is closed.
- **Force Run All** — one button to back up every repo at once (perfect for an end-of-day push).
- **Custom commit titles** — when you run a backup manually, name the commit (with a confirmation step); skip it and a clean `Auto Backup - <date time>` message is used.
- **Dry Run mode** — a global preview switch that runs all the checks but skips commit/push, so you can see what *would* happen without changing anything.
- **Safety guardrails** — warns on repositories over 1 GB and blocks scheduled commits staging more than 1000 files (requires a manual confirmation).
- **Execution locking** — a `.lock` file prevents concurrent runs from colliding.
- **Smart exclusions** — per-project ignore lists filter out folders like `.venv`, `node_modules`, `dist`, on top of `.gitignore`.
- **Live diagnostics** — a System Status panel monitors Python, Git, network connectivity, and the scheduled task.
- **Full activity log** — every run, with complete `stdout`/`stderr`, viewable in an in-dashboard console.
- **HTTPS & SSH** — works with both remote URL styles, with credential/connection handling for each.

---

## ⚙️ How It Works

When a backup runs, the engine performs these steps in order (stopping and logging on any failure):

1. Verify the local folder exists and Git is installed.
2. **Ensure the repo** — initialize it (`git init`), set a commit identity if missing, and link `origin` to your URL.
3. Warn if the repository is unusually large (> 1 GB).
4. Detect changes with `git status`, then filter out excluded paths.
5. Enforce the large-commit guard (> 1000 files on scheduled runs).
6. If **Dry Run** is on, stop here (simulate only).
7. `git add` + `git commit` (your custom title, or a timestamped default).
8. Verify connectivity; mark *pending retry* if offline.
9. `git push -u origin <branch>`.

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.10+** (with "Add Python to PATH" checked during install)
- **Git for Windows**

### Run it
```bat
:: From the project folder — double-click or run:
start.bat
```
`start.bat` automatically creates a virtual environment, installs dependencies, opens your browser to the dashboard, and starts the server. On first launch it sets everything up; after that it's instant.

Then in the dashboard:
1. Click **➕ Add Repository**.
2. Enter a name, the **local folder path**, the **remote URL** (HTTPS or SSH), and the branch.
3. Click **Run Now** (or **Force Run All**) — done. Your code is on GitHub.

> The folder does **not** need to be a git repo beforehand — it gets initialized automatically.

---

## 📁 Project Structure

```
Git_Manager/
├── backend/
│   ├── app.py             # Flask server + REST API
│   ├── git_runner.py      # The engine: git ops, auto-init, safety guards, diagnostics
│   ├── scheduler.py       # Headless entry point for Windows Task Scheduler
│   ├── config_manager.py  # JSON config + project CRUD
│   ├── logger.py          # JSON activity log
│   ├── create_task.ps1    # Register the scheduled task
│   └── remove_task.ps1    # Unregister the scheduled task
├── frontend/
│   ├── index.html         # Dashboard
│   ├── app.js             # Frontend logic (polling, actions)
│   └── style.css          # Dark theme
├── requirements.txt       # Python dependencies (Flask)
├── start.bat              # One-click launcher
└── README.md
```

---

## ⏰ Automated Backups

To back up on a schedule without opening the dashboard, register the Windows task (run PowerShell as Administrator):

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
cd backend
.\create_task.ps1
```

This runs the engine at logon and every 10 minutes; each repo is backed up when its configured interval has elapsed (set the interval to `1440` for once-a-day). Remove it anytime with `remove_task.ps1`.

---

## 🔧 Configuration & Privacy

Settings and history are stored locally in `backend/config.json` and `backend/logs.json`. These contain machine-specific paths and personal activity data, so they are **git-ignored and never pushed** — the app recreates them with safe defaults on any machine.

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3, Flask |
| Frontend | Vanilla HTML / CSS / JavaScript |
| Storage | JSON files |
| Automation | Windows Task Scheduler + PowerShell |
| Platform | Windows 10 / 11 |

---

## ⚠️ Notes

- Git Manager uses Flask's development server, bound to `127.0.0.1` — it's intended as a **local personal tool**, not a public-facing deployment.
- Backups push to existing remotes you control. For a brand-new GitHub repo, create it **empty** (no README/license) so the first push is clean.

---

*Made for people who want their work safely on GitHub without thinking about git.*
