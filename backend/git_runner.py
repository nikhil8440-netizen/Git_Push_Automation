import os
import subprocess
import shutil
import socket
import re
from datetime import datetime
from backend import config_manager
from backend import logger

# Lock file path
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
LOCK_PATH = os.path.join(BACKEND_DIR, '.lock')

def is_locked():
    """Check if the lock file exists."""
    return os.path.exists(LOCK_PATH)

def acquire_lock():
    """Acquire the execution lock. Returns True if successful, False otherwise."""
    if os.path.exists(LOCK_PATH):
        return False
    try:
        os.makedirs(os.path.dirname(LOCK_PATH), exist_ok=True)
        with open(LOCK_PATH, 'w', encoding='utf-8') as f:
            f.write(str(os.getpid()))
        return True
    except Exception:
        return False

def release_lock():
    """Release the execution lock."""
    try:
        if os.path.exists(LOCK_PATH):
            os.remove(LOCK_PATH)
        return True
    except Exception:
        return False

def check_git_installed():
    """Check if Git is installed and available in system PATH."""
    return shutil.which('git') is not None

def extract_host(url):
    """Extract host domain from Git remote URL (supports HTTPS and SSH)."""
    if not url:
        return "github.com"
    # Match https://domain.com/user/repo or git@domain.com:user/repo
    match = re.search(r'(?:https?://|git@)([^:/]+)', url)
    if match:
        return match.group(1)
    return "github.com"

def check_internet(host="github.com", port=443, timeout=3):
    """Verify internet connection to the git host, falls back to Google DNS."""
    try:
        socket.setdefaulttimeout(timeout)
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect((host, port))
        s.close()
        return True
    except Exception:
        # Fallback check to Google DNS
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.connect(("8.8.8.8", 53))
            s.close()
            return True
        except Exception:
            return False

def get_repo_size_gb(path):
    """Calculate total size of the repository directory in GB."""
    total_size = 0
    if not os.path.isdir(path):
        return 0.0
    try:
        for dirpath, _, filenames in os.walk(path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                if not os.path.islink(fp):
                    try:
                        total_size += os.path.getsize(fp)
                    except OSError:
                        pass
    except Exception:
        pass
    return total_size / (1024 * 1024 * 1024)

def parse_git_status(status_output, excluded_paths):
    """Parse git status --porcelain and filter out excluded paths."""
    changed_files = []
    
    # Normalize excluded paths
    normalized_exclusions = [exc.replace("\\", "/").strip('/') for exc in excluded_paths if exc.strip()]
    
    for line in status_output.splitlines():
        if len(line) < 4:
            continue
        
        # Format is XY path or XY "path" or XY path1 -> path2
        path_part = line[3:].strip()
        
        # Unquote if path has quotes
        if path_part.startswith('"') and path_part.endswith('"'):
            path_part = path_part[1:-1]
            
        # Handle rename syntax "old_path -> new_path"
        if " -> " in path_part:
            path_part = path_part.split(" -> ")[1].strip()
            if path_part.startswith('"') and path_part.endswith('"'):
                path_part = path_part[1:-1]
        
        normalized_file = path_part.replace("\\", "/")
        
        # Filter against exclusions
        is_excluded = False
        for exc in normalized_exclusions:
            # Match folder name exactly in path components or check if path starts with folder/
            parts = normalized_file.split('/')
            if exc in parts:
                is_excluded = True
                break
            if normalized_file.startswith(exc + '/'):
                is_excluded = True
                break
                
        if not is_excluded:
            changed_files.append(path_part)
            
    return changed_files

def get_git_env():
    """Get environment variables to prevent blocking git commands."""
    env = os.environ.copy()
    env['GIT_TERMINAL_PROMPT'] = '0'  # Disable password prompt
    env['GIT_SSH_COMMAND'] = 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new'
    return env

def test_project_connection(project_id):
    """Test connectivity to the project's remote origin.

    Works even before the local folder has been initialized as a Git repository,
    because it validates the configured origin URL directly with git ls-remote.
    """
    project = config_manager.get_project(project_id)
    if not project:
        return {"success": False, "message": "Project not found"}

    name = project.get("name")
    path = project.get("path")
    origin = project.get("origin")

    if not check_git_installed():
        msg = "Git executable is not installed or not in PATH."
        logger.log_event(name, "FAILED", f"Connection test failed: {msg}")
        return {"success": False, "message": msg}

    if not origin:
        msg = "No remote origin URL is configured for this project."
        logger.log_event(name, "FAILED", f"Connection test failed: {msg}")
        return {"success": False, "message": msg}

    env = get_git_env()

    # Check network connectivity to git host (SSH port 22 or HTTPS port 443)
    git_host = extract_host(origin)
    port = 22 if "git@" in origin else 443
    if not check_internet(host=git_host, port=port):
        msg = f"Network connection to git host ({git_host}) failed."
        logger.log_event(name, "FAILED", f"Connection test failed: {msg}")
        return {"success": False, "message": "Network or host unreachable"}

    # Validate the remote URL directly. This needs no local repository, so the
    # connection can be tested before the folder is ever initialized.
    has_repo = bool(path) and os.path.isdir(os.path.join(path, '.git'))
    target = 'origin' if has_repo else origin
    run_cwd = path if (path and os.path.isdir(path)) else None
    run_res = subprocess.run(
        ['git', 'ls-remote', target],
        cwd=run_cwd, capture_output=True, text=True, env=env, timeout=30
    )

    if run_res.returncode == 0:
        logger.log_event(name, "SUCCESS", "Connection test successful.")
        return {"success": True, "message": "Connection successful"}
    else:
        err_msg = run_res.stderr.strip()
        low = err_msg.lower()
        if "authentication failed" in low or "permission denied" in low or "could not read from remote repository" in low:
            msg = "Authentication failed. Verify credentials/SSH key access."
        elif "repository not found" in low or "not found" in low:
            msg = "Remote repository not found. Check the origin URL."
        else:
            msg = f"Connection failed: {err_msg}"
        logger.log_event(name, "FAILED", f"Connection test failed: {msg}", stdout=run_res.stdout, stderr=run_res.stderr)
        return {"success": False, "message": msg}


def ensure_identity(path, env):
    """Ensure a commit author identity exists so commits never fail.

    Only sets a repo-local fallback when no global/local identity is configured,
    so an existing user identity is always respected.
    """
    for key, fallback in (("user.name", "Git Manager"), ("user.email", "git-manager@localhost")):
        res = subprocess.run(['git', 'config', key], cwd=path, capture_output=True, text=True, env=env)
        if res.returncode != 0 or not res.stdout.strip():
            subprocess.run(['git', 'config', key, fallback], cwd=path, capture_output=True, text=True, env=env)


def ensure_git_repo(path, branch, origin, name, env):
    """Make `path` a ready-to-use Git repository so the user never touches git.

    Initializes the repo if needed, guarantees a commit identity, and points
    'origin' at the configured URL (adding or updating it). Returns (ok, message).
    """
    branch = (branch or "main").strip()

    # 1. Initialize the repository if it isn't one yet
    if not os.path.isdir(os.path.join(path, '.git')):
        init_res = subprocess.run(['git', 'init', '-b', branch], cwd=path, capture_output=True, text=True, env=env)
        if init_res.returncode != 0:
            # Fallback for older Git that lacks 'init -b'
            init_res = subprocess.run(['git', 'init'], cwd=path, capture_output=True, text=True, env=env)
            if init_res.returncode != 0:
                return False, f"git init failed: {init_res.stderr.strip()}"
            subprocess.run(['git', 'symbolic-ref', 'HEAD', f'refs/heads/{branch}'],
                           cwd=path, capture_output=True, text=True, env=env)
        logger.log_event(name, "SUCCESS", f"Initialized new Git repository on branch '{branch}'.")

    # 2. Guarantee a commit identity
    ensure_identity(path, env)

    # 3. Ensure 'origin' points at the configured URL
    if origin:
        get_url = subprocess.run(['git', 'remote', 'get-url', 'origin'], cwd=path, capture_output=True, text=True, env=env)
        if get_url.returncode != 0:
            add_res = subprocess.run(['git', 'remote', 'add', 'origin', origin], cwd=path, capture_output=True, text=True, env=env)
            if add_res.returncode != 0:
                return False, f"Failed to add remote origin: {add_res.stderr.strip()}"
            logger.log_event(name, "SUCCESS", f"Linked remote origin -> {origin}")
        elif get_url.stdout.strip() != origin:
            subprocess.run(['git', 'remote', 'set-url', 'origin', origin], cwd=path, capture_output=True, text=True, env=env)
            logger.log_event(name, "SUCCESS", f"Updated remote origin -> {origin}")

    return True, "Repository ready."

def run_backup(project_id, is_manual=False, commit_message=None):
    """
    Run the Git backup sequence for a project.
    Assumes execution lock is handled by caller (scheduler or manual handler).
    """
    project = config_manager.get_project(project_id)
    if not project:
        return "FAILED", "Project not found"
        
    name = project.get("name")
    path = project.get("path")
    origin = project.get("origin")
    branch = project.get("branch", "main")
    auto_commit = project.get("auto_commit", True)
    auto_push = project.get("auto_push", True)
    excluded_paths = project.get("excluded_paths", [])
    
    # 1. Verify path exists
    if not os.path.isdir(path):
        msg = f"Folder missing: path {path} does not exist."
        logger.log_event(name, "FAILED", msg)
        config_manager.update_project(project_id, {"last_status": "FAILED", "last_run": datetime.now().strftime("%Y-%m-%d %H:%M:%S")})
        return "FAILED", msg
        
    # 2. Verify git executable available
    if not check_git_installed():
        msg = "Git is not installed or not in PATH."
        logger.log_event(name, "FAILED", msg)
        config_manager.update_project(project_id, {"last_status": "FAILED", "last_run": datetime.now().strftime("%Y-%m-%d %H:%M:%S")})
        return "FAILED", msg

    env = get_git_env()

    # 3. Ensure the folder is a ready-to-use Git repository (auto-init + remote).
    #    This is what lets the user just point the dashboard at a plain folder.
    repo_ok, repo_msg = ensure_git_repo(path, branch, origin, name, env)
    if not repo_ok:
        logger.log_event(name, "FAILED", repo_msg)
        config_manager.update_project(project_id, {"last_status": "FAILED", "last_run": datetime.now().strftime("%Y-%m-%d %H:%M:%S")})
        return "FAILED", repo_msg
    
    # 4. Check repo size (warning only)
    repo_size = get_repo_size_gb(path)
    size_warning = repo_size > 1.0
    if size_warning:
        logger.log_event(name, "WARNING", f"Unusually large repository detected: {repo_size:.2f} GB (exceeds 1GB warning threshold).")

    # 5. Check git status
    status_res = subprocess.run(
        ['git', 'status', '--porcelain'],
        cwd=path, capture_output=True, text=True, env=env
    )
    if status_res.returncode != 0:
        msg = f"Failed to run git status. Stderr: {status_res.stderr.strip()}"
        logger.log_event(name, "FAILED", msg, stdout=status_res.stdout, stderr=status_res.stderr)
        config_manager.update_project(project_id, {"last_status": "FAILED", "last_run": datetime.now().strftime("%Y-%m-%d %H:%M:%S")})
        return "FAILED", msg
        
    # Parse and filter changes
    changed_files = parse_git_status(status_res.stdout, excluded_paths)
    
    if not changed_files:
        msg = "No changes detected (excluding ignored paths)."
        logger.log_event(name, "NO_CHANGES", msg)
        config_manager.update_project(project_id, {
            "last_status": "NO_CHANGES",
            "last_run": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
        return "NO_CHANGES", msg
        
    # 6. Safety check: changed files count
    changed_count = len(changed_files)
    if changed_count > 1000 and not is_manual:
        msg = f"Large commit guard: {changed_count} changed files. Manual Run Now required."
        logger.log_event(name, "FAILED", msg)
        config_manager.update_project(project_id, {
            "last_status": "FAILED",
            "last_run": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
        return "FAILED", msg

    # 7. Check Dry Run Mode
    dry_run = config_manager.is_dry_run()
    if dry_run:
        msg = f"Dry Run Mode: {changed_count} changes detected. Commits and pushes are simulated."
        logger.log_event(name, "WARNING", msg)
        config_manager.update_project(project_id, {
            "last_status": "NO_CHANGES",  # Or success? We'll show NO_CHANGES / WARNING in logs
            "last_run": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
        return "NO_CHANGES", msg

    # 8. Add and Commit
    commit_sha = ""
    commit_msg = ""
    if auto_commit:
        # 8a. Untrack files that are tracked but now match .gitignore. This makes
        #     newly-ignored files (e.g. one you just added to .gitignore) get
        #     removed from the repo on this backup, instead of lingering forever
        #     or breaking 'git add'.
        ls_ignored = subprocess.run(
            ['git', 'ls-files', '-i', '-c', '--exclude-standard'],
            cwd=path, capture_output=True, text=True, env=env
        )
        tracked_ignored = [f.strip() for f in ls_ignored.stdout.splitlines() if f.strip()]
        for i in range(0, len(tracked_ignored), 100):
            subprocess.run(['git', 'rm', '--cached', '--quiet', '--'] + tracked_ignored[i:i+100],
                           cwd=path, capture_output=True, text=True, env=env)

        # 8b. Remove any git-ignored paths from the staging list so 'git add' never
        #     fails on them (their removal, if they were tracked, is handled in 8a).
        #     NOTE: 'git check-ignore --stdin' can silently under-report, so paths
        #     are passed as arguments (batched), which is reliable.
        files_to_add = changed_files
        if changed_files:
            ignored_now = set()
            for i in range(0, len(changed_files), 100):
                batch = changed_files[i:i+100]
                ci = subprocess.run(
                    ['git', 'check-ignore'] + batch,
                    cwd=path, capture_output=True, text=True, env=env
                )
                ignored_now.update(f.strip() for f in ci.stdout.splitlines() if f.strip())
            if ignored_now:
                files_to_add = [f for f in changed_files if f not in ignored_now]

        # 8c. Stage the remaining changes (additions, modifications, deletions).
        batch_size = 100
        for i in range(0, len(files_to_add), batch_size):
            batch = files_to_add[i:i+batch_size]
            add_res = subprocess.run(
                ['git', 'add', '--'] + batch,
                cwd=path, capture_output=True, text=True, env=env
            )
            if add_res.returncode != 0:
                msg = f"Git add failed. Stderr: {add_res.stderr.strip()}"
                logger.log_event(name, "FAILED", msg, stdout=add_res.stdout, stderr=add_res.stderr)
                config_manager.update_project(project_id, {"last_status": "FAILED", "last_run": datetime.now().strftime("%Y-%m-%d %H:%M:%S")})
                return "FAILED", msg

        # 8d. If nothing actually ended up staged (e.g. every change was an ignored
        #     path), treat it as a no-op instead of letting 'git commit' fail.
        if subprocess.run(['git', 'diff', '--cached', '--quiet'],
                          cwd=path, capture_output=True, text=True, env=env).returncode == 0:
            msg = "No changes to back up after applying ignore rules."
            logger.log_event(name, "NO_CHANGES", msg)
            config_manager.update_project(project_id, {
                "last_status": "NO_CHANGES",
                "last_run": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            })
            return "NO_CHANGES", msg
                
        # Commit. Use the user-supplied title if given, otherwise fall back to
        # the standard timestamped "Auto Backup" format.
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if commit_message and commit_message.strip():
            commit_msg = commit_message.strip()
        else:
            commit_msg = f"Auto Backup - {timestamp}"
        commit_res = subprocess.run(
            ['git', 'commit', '-m', commit_msg],
            cwd=path, capture_output=True, text=True, env=env
        )
        if commit_res.returncode != 0:
            msg = f"Git commit failed. Stderr: {commit_res.stderr.strip()}"
            logger.log_event(name, "FAILED", msg, stdout=commit_res.stdout, stderr=commit_res.stderr)
            config_manager.update_project(project_id, {"last_status": "FAILED", "last_run": datetime.now().strftime("%Y-%m-%d %H:%M:%S")})
            return "FAILED", msg
            
        # Get commit SHA
        sha_res = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=path, capture_output=True, text=True, env=env
        )
        if sha_res.returncode == 0:
            commit_sha = sha_res.stdout.strip()
            
    # 9. Verify Remote Origin
    remote_res = subprocess.run(
        ['git', 'remote', '-v'],
        cwd=path, capture_output=True, text=True, env=env
    )
    if remote_res.returncode != 0 or 'origin' not in remote_res.stdout:
        msg = "Origin remote missing."
        logger.log_event(name, "FAILED", msg, stdout=remote_res.stdout, stderr=remote_res.stderr)
        config_manager.update_project(project_id, {
            "last_status": "FAILED",
            "last_run": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "last_commit": commit_sha if commit_sha else project.get("last_commit", "")
        })
        return "FAILED", msg

    # 10. Check Internet Connectivity
    git_host = extract_host(origin)
    port = 22 if "git@" in origin else 443
    if not check_internet(host=git_host, port=port):
        msg = "Internet unavailable: connection to Git host failed. Marked pending retry."
        logger.log_event(name, "PENDING_RETRY", msg)
        config_manager.update_project(project_id, {
            "last_status": "PENDING_RETRY",
            "last_run": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "last_commit": commit_sha if commit_sha else project.get("last_commit", "")
        })
        return "PENDING_RETRY", msg

    # 11. Push
    if auto_push:
        push_res = subprocess.run(
            ['git', 'push', '-u', 'origin', branch],
            cwd=path, capture_output=True, text=True, env=env, timeout=60
        )
        if push_res.returncode != 0:
            err_output = push_res.stderr.strip()
            if "Authentication failed" in err_output or "Permission denied" in err_output or "fatal: Could not read from remote repository" in err_output:
                msg = "Push failed: Authentication failed."
            elif "rejected" in err_output or "non-fast-forward" in err_output:
                msg = "Push failed: Push rejected (non-fast-forward)."
            else:
                msg = f"Push failed: {err_output}"
            logger.log_event(name, "FAILED", msg, stdout=push_res.stdout, stderr=push_res.stderr)
            config_manager.update_project(project_id, {
                "last_status": "FAILED",
                "last_run": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "last_commit": commit_sha if commit_sha else project.get("last_commit", "")
            })
            return "FAILED", msg
            
        # Success push
        msg = f"Backup completed successfully. Committed and pushed {changed_count} files as \"{commit_msg}\"."
        logger.log_event(name, "SUCCESS", msg, stdout=push_res.stdout)
        config_manager.update_project(project_id, {
            "last_status": "SUCCESS",
            "last_run": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "last_commit": commit_sha if commit_sha else project.get("last_commit", ""),
            "last_push": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
        return "SUCCESS", msg
    else:
        # Success commit only
        msg = f"Backup completed successfully. Committed {changed_count} files as \"{commit_msg}\" (push disabled)."
        logger.log_event(name, "SUCCESS", msg)
        config_manager.update_project(project_id, {
            "last_status": "SUCCESS",
            "last_run": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "last_commit": commit_sha if commit_sha else project.get("last_commit", "")
        })
        return "SUCCESS", msg
