# Git Manager

**A local-first dashboard that automatically backs up your local folders to GitHub — point it at a folder, and it handles `git init`, `commit`, and `push` for you. No git commands. No cloud. No database.**

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)
![Python](https://img.shields.io/badge/python-3.10%2B-3776AB)
![Flask](https://img.shields.io/badge/Flask-3.x-000000)
![Storage](https://img.shields.io/badge/storage-JSON%20files-orange)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What is this?

Git Manager is a small web app that runs **entirely on your own machine**. It watches the local folders you choose and keeps them backed up to their GitHub remotes — automatically on a schedule, or instantly with a button click. You manage everything through a browser dashboard at `http://127.0.0.1:5000`.

Built around one promise: **you never touch git yourself.** Give it a folder path and a remote URL, and the engine does the rest — including initializing the repository if the folder is not a git repo yet.

> Flask backend + vanilla HTML/CSS/JS frontend + plain JSON file storage. No external services, no heavy frameworks, no database.

---

## Features

- **Zero-git workflow** — add a folder through the dashboard; the app runs `git init`, links the remote, commits, and pushes for you.
- **Auto repository initialization** — point at any plain folder. If it is not a git repo yet, it gets initialized and wired to your remote automatically.
- **Scheduled backups** — configurable per-repo interval (e.g. every 30 minutes); on Windows this integrates with Task Scheduler.
- **Force Run All** — one button backs up every repo at once.
- **Custom commit titles** — name the commit when running manually, or get a clean `Auto Backup - <date time>` message automatically.
- **Git Identity setup** — on first launch, a built-in modal lets you set your `user.name` and `user.email` globally, so commits are always attributed correctly.
- **GitHub authentication setup (Linux)** — on Linux, a guided modal walks you through creating and saving a GitHub Personal Access Token (PAT), so pushes work silently from then on.
- **Dry Run mode** — global switch that runs all checks but skips commit/push, so you can see what would happen without changing anything.
- **Safety guardrails** — warns on repos over 1 GB; blocks scheduled commits with more than 1000 files (requires a manual Run Now).
- **Smart exclusions** — per-project path filters (`node_modules`, `.venv`, `dist`, etc.) on top of `.gitignore`.
- **Live diagnostics** — System Status panel shows Python, Git, network, identity, and scheduler state.
- **Full activity log** — every run logged with `stdout`/`stderr`, viewable in a console panel inside the dashboard.
- **HTTPS and SSH** — works with both remote URL styles.

---

## How It Works

### The backup sequence

When a backup runs (scheduled or manual), the engine does this in order — stops and logs on any failure:

1. Verify the local folder exists and Git is installed.
2. **Ensure the repo** — `git init` if needed, set a commit identity fallback if none is configured, link `origin` to your URL.
3. Warn if the repo is unusually large (> 1 GB).
4. `git status --porcelain` → filter out excluded paths and `.gitignore` entries.
5. Enforce the large-commit guard (> 1000 files blocks scheduled runs).
6. If **Dry Run** is on, stop here — no changes made.
7. `git add` the changed files, then `git commit` with your title or the auto-generated one.
8. Check internet connectivity; mark *pending retry* if offline.
9. `git push -u origin <branch>`.

### Architecture

```
Browser (dashboard)
      |
      | HTTP (localhost:5000)
      v
Flask app.py  ──────────────────────────────────────────────────────┐
      |                                                              |
      ├── config_manager.py  (read/write backend/config.json)       |
      ├── logger.py          (read/write backend/logs.json)         |
      └── git_runner.py      (all git subprocess calls)             |
                                                             runs on your machine
                                                             ↓
                                                      git CLI → GitHub
```

The server runs locally. It never leaves your machine — it talks to GitHub directly through the git CLI the same way you would from a terminal.

---

## Requirements

| Requirement | Windows | macOS | Linux |
|---|---|---|---|
| Python 3.10+ | Required | Required | Required |
| Git | Git for Windows | Homebrew `git` or Xcode CLT | `apt install git` / `dnf install git` |
| pip / venv | Included with Python | Included with Python | May need `python3-venv` |

**Python dependencies** (installed automatically by the launcher):

```
Flask>=3.0.0
```

That is the only third-party dependency.

---

## Setup & Launch

### Windows

**Prerequisites:** Python 3.10+ (tick "Add Python to PATH" during install) + Git for Windows.

```bat
start.bat
```

Double-click `start.bat` or run it from a terminal. It will:
1. Create a `.venv` virtual environment if one does not exist.
2. Install/verify dependencies from `requirements.txt`.
3. Open `http://127.0.0.1:5000` in your default browser.
4. Start the Flask server.

On first launch it sets everything up. After that it opens in a few seconds.

---

### macOS

**Prerequisites:** Python 3.10+ and Git (via Homebrew: `brew install git`, or Xcode Command Line Tools: `xcode-select --install`).

```bash
chmod +x start.sh
./start.sh
```

`start.sh` does the same as `start.bat` — creates the venv, installs dependencies, opens the browser, starts the server.

**Authentication:** macOS handles GitHub credentials automatically through the system Keychain. On your first push, a dialog appears asking you to sign in — after that it is silent and permanent.

> **Note:** Run `chmod +x start.sh` once after downloading or cloning. Without it, the script will be refused ("Permission denied").

---

### Linux

**Prerequisites:** Python 3.10+, Git, and the `python3-venv` package.

```bash
# Ubuntu / Debian
sudo apt install git python3 python3-venv

# Fedora / RHEL
sudo dnf install git python3

# Then launch:
chmod +x start.sh
./start.sh
```

**Authentication:** Linux does not have a built-in credential store the way Windows and macOS do. On first launch, Git Manager detects this and shows a **GitHub Authentication Setup** modal that walks you through creating and saving a Personal Access Token (PAT). After that, pushes authenticate automatically. See the [Linux authentication](#linux-github-authentication) section below.

> **Caution — line ending conflict:** `start.sh` may have Windows line endings (`\r\n`) if you cloned or copied it on a Windows machine. Bash on Linux/macOS will reject it with:
> ```
> /bin/bash^M: bad interpreter: No such file or directory
> ```
> Fix it before running:
> ```bash
> sed -i 's/\r//' start.sh
> chmod +x start.sh
> ./start.sh
> ```

---

## First Launch Walkthrough

On first launch (any platform), two setup modals appear in sequence if needed:

### 1. Git Identity Setup

Git needs a name and email to label commits. The dashboard detects if these are missing and shows a modal to set them globally:

- **Name** — e.g. `John Doe`
- **Email** — e.g. `john@example.com`

This is a one-time setup. It writes to your global git config (`~/.gitconfig` on macOS/Linux, `%USERPROFILE%\.gitconfig` on Windows).

### 2. GitHub Authentication (Linux only)

On Linux, after the identity step, the dashboard checks whether GitHub credentials are stored. If not, a **GitHub Authentication Setup** modal appears with a step-by-step guide to create a Personal Access Token:

1. Go to **github.com** → click your profile picture → **Settings**
2. Scroll to the bottom of the left sidebar → **Developer settings**
3. Personal access tokens → **Tokens (classic)**
4. Click **"Generate new token (classic)"**
5. Give it a name, set an expiry, tick the **repo** checkbox
6. Click **Generate token** — copy it immediately (shown only once)

Paste it into the modal along with your GitHub username and click **Save Credentials**. The token is stored via `git credential store` and used automatically for every future push.

---

## Linux GitHub Authentication

On Linux, HTTPS pushes require stored credentials because:

- Git Manager runs with `GIT_TERMINAL_PROMPT=0` (prevents git from blocking the server waiting for a password prompt).
- Linux has no system-level credential manager like Windows Credential Manager or macOS Keychain.

**The app handles this automatically** through the PAT setup modal on first launch.

**Alternative — SSH keys:** If you prefer SSH over HTTPS, configure your SSH keys normally (`ssh-keygen`, upload public key to GitHub), then use `git@github.com:user/repo.git` style URLs when adding repos. The PAT modal will appear but you can safely click **Skip for now** — SSH does not use it.

---

## Automated Backups (Windows only)

The scheduler (`backend/scheduler.py`) runs a single pass — it checks which repos are due and backs them up. On Windows, you can register it as a scheduled task to run automatically in the background:

```powershell
# Run PowerShell as Administrator
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
cd backend
.\create_task.ps1
```

This registers a Windows Task Scheduler job that runs at logon and every 10 minutes. Each repo is backed up when its configured interval has elapsed. Remove it anytime:

```powershell
.\remove_task.ps1
```

On macOS and Linux, automated scheduling via `cron` or `launchd` is not set up by the app — use Run Now or Force Run All from the dashboard, or set up a cron job yourself to call `python -m backend.scheduler` from the project directory.

---

## Project Structure

```
Git_Manager/
├── backend/
│   ├── app.py             # Flask server + all REST API routes
│   ├── git_runner.py      # The engine: git ops, identity, auth, safety guards
│   ├── scheduler.py       # Headless entry point for scheduled runs
│   ├── config_manager.py  # JSON config + project CRUD
│   ├── logger.py          # JSON activity log (read/write)
│   ├── create_task.ps1    # Register Windows scheduled task
│   └── remove_task.ps1    # Unregister Windows scheduled task
├── frontend/
│   ├── index.html         # Dashboard HTML
│   ├── app.js             # Frontend logic (polling, modals, actions)
│   └── style.css          # Dark theme
├── requirements.txt       # Python dependencies (Flask only)
├── start.bat              # One-click launcher — Windows
├── start.sh               # One-click launcher — macOS and Linux
└── README.md
```

**Local-only files (git-ignored, never pushed):**

```
backend/config.json    # Your project list, paths, settings
backend/logs.json      # Activity history
```

These are recreated with safe defaults on any machine — safe to delete, safe to ignore.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3, Flask |
| Frontend | Vanilla HTML / CSS / JavaScript |
| Storage | JSON files (no database) |
| Git operations | `git` CLI via Python `subprocess` |
| Automation (Windows) | Windows Task Scheduler + PowerShell |
| Platform | Windows 10/11, macOS, Linux |

---

## Notes

- Git Manager uses Flask's development server bound to `127.0.0.1` — it is a **local personal tool**, not intended for public or network-facing deployment.
- For a brand-new GitHub repo, create it **empty** (no README, no license, no `.gitignore`) so the first push is a clean fast-forward.
- The Scheduler indicator in the dashboard will always show red on macOS and Linux — that is expected. It only reflects Windows Task Scheduler registration and has no effect on the rest of the app.
- `backend/config.json` stores machine-specific paths. If you move the app to a different machine, add your repos again through the dashboard.

---

*Made for people who want their work safely on GitHub without thinking about git.*
