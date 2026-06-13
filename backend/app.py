import os
import sys
import subprocess
from flask import Flask, jsonify, request

# Adjust path to import sibling modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import config_manager
from backend import logger
from backend import git_runner
from backend import git_console

app = Flask(__name__, static_folder='../frontend', static_url_path='')

def check_task_registered():
    """Verify if the 'Git Manager' scheduled task is registered.

    Windows: checks Windows Task Scheduler via schtasks.
    macOS/Linux: automation via Task Scheduler is not applicable; returns False.
    """
    if sys.platform != 'win32':
        return False
    try:
        res = subprocess.run(
            ['schtasks', '/query', '/tn', 'Git Manager'],
            capture_output=True, text=True, shell=True
        )
        return res.returncode == 0
    except Exception:
        return False

@app.route('/')
def index():
    """Serve the index.html from frontend."""
    return app.send_static_file('index.html')

@app.route('/projects', methods=['GET'])
def get_projects_api():
    """List all projects."""
    return jsonify(config_manager.get_projects())

@app.route('/projects', methods=['POST'])
def add_project_api():
    """Add a new project."""
    data = request.json or {}
    name = data.get("name")
    path = data.get("path")
    if not name or not path:
        return jsonify({"error": "Project Name and Path are required"}), 400
        
    project = config_manager.add_project(data)
    logger.log_event(name, "SUCCESS", f"Added project to dashboard: {name} (Path: {path})")
    return jsonify(project), 201

@app.route('/projects/<project_id>', methods=['PUT'])
def update_project_api(project_id):
    """Update project configuration. Logs status transitions (pause, resume, enable, disable)."""
    data = request.json or {}
    old_project = config_manager.get_project(project_id)
    if not old_project:
        return jsonify({"error": "Project not found"}), 404
        
    name = old_project.get("name")
    
    # Check transitions
    new_paused = data.get("paused")
    new_enabled = data.get("enabled")
    
    if new_paused is not None and new_paused != old_project.get("paused"):
        state_str = "PAUSED" if new_paused else "SUCCESS"  # Log PAUSED state, or return to SUCCESS
        msg = f"Project '{name}' was {'paused' if new_paused else 'resumed'} by user."
        logger.log_event(name, state_str, msg)
        
    if new_enabled is not None and new_enabled != old_project.get("enabled"):
        state_str = "DISABLED" if not new_enabled else "SUCCESS"
        msg = f"Project '{name}' was {'disabled' if not new_enabled else 'enabled'} by user."
        logger.log_event(name, state_str, msg)
        
    updated = config_manager.update_project(project_id, data)
    return jsonify(updated)

@app.route('/projects/<project_id>', methods=['DELETE'])
def delete_project_api(project_id):
    """Delete a project."""
    project = config_manager.get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404
        
    name = project.get("name")
    success = config_manager.delete_project(project_id)
    if success:
        logger.log_event(name, "DISABLED", f"Project '{name}' was deleted from dashboard.")
        return jsonify({"success": True})
    return jsonify({"error": "Failed to delete project"}), 500

@app.route('/run/<project_id>', methods=['POST'])
def run_project_api(project_id):
    """Manual trigger to run backup immediately. Respects lock file.

    Accepts an optional JSON body {"commit_message": "..."}; if omitted or
    blank, the backup uses the default "Auto Backup - <timestamp>" message.
    """
    project = config_manager.get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    name = project.get("name")
    data = request.get_json(silent=True) or {}
    commit_message = data.get("commit_message")

    # Try to acquire lock
    if not git_runner.acquire_lock():
        msg = f"Run Now aborted for '{name}': another automation process is running."
        logger.log_event(name, "ALREADY_RUNNING", msg)
        return jsonify({
            "success": False,
            "status": "ALREADY_RUNNING",
            "message": "A backup process is already running. Please try again shortly."
        }), 409

    try:
        status, msg = git_runner.run_backup(project_id, is_manual=True, commit_message=commit_message)
        return jsonify({
            "success": status in ["SUCCESS", "NO_CHANGES", "PENDING_RETRY"],
            "status": status,
            "message": msg
        })
    finally:
        git_runner.release_lock()

@app.route('/run-all', methods=['POST'])
def run_all_api():
    """Force-run a backup for every enabled, non-paused project in one pass.

    Acquires the lock once (like the scheduler) so the whole batch runs as a
    single unit and won't collide with a scheduled run.
    """
    data = request.get_json(silent=True) or {}
    commit_message = data.get("commit_message")

    if not git_runner.acquire_lock():
        msg = "Force Run aborted: another automation process is currently running."
        logger.log_event("System", "ALREADY_RUNNING", msg)
        return jsonify({
            "success": False,
            "status": "ALREADY_RUNNING",
            "message": "A backup process is already running. Please try again shortly."
        }), 409

    try:
        projects = config_manager.get_projects()
        results = []
        skipped = 0
        for project in projects:
            if not project.get("enabled", True) or project.get("paused", False):
                skipped += 1
                continue
            status, message = git_runner.run_backup(project.get("id"), is_manual=True, commit_message=commit_message)
            results.append({"name": project.get("name"), "status": status, "message": message})

        ran = len(results)
        failed = sum(1 for r in results if r["status"] == "FAILED")
        summary = f"Force Run complete: {ran} processed, {failed} failed, {skipped} skipped (disabled/paused)."
        logger.log_event("System", "FAILED" if failed else "SUCCESS", summary)
        return jsonify({
            "success": failed == 0,
            "status": "DONE",
            "message": summary,
            "results": results
        })
    finally:
        git_runner.release_lock()

@app.route('/test-connection/<project_id>', methods=['POST'])
def test_connection_api(project_id):
    """Run remote validation connectivity check."""
    res = git_runner.test_project_connection(project_id)
    return jsonify(res)

@app.route('/git-auth', methods=['GET'])
def get_git_auth_api():
    """Get GitHub credential status (whether a PAT is stored)."""
    return jsonify(git_runner.get_git_auth_status())

@app.route('/git-auth', methods=['POST'])
def set_git_auth_api():
    """Store a GitHub PAT via git credential approve."""
    data = request.json or {}
    username = data.get("username", "").strip()
    token = data.get("token", "").strip()
    if not username or not token:
        return jsonify({"error": "Both GitHub username and token are required"}), 400
    success, message = git_runner.store_github_pat(username, token)
    if success:
        return jsonify({"success": True, "message": message})
    return jsonify({"success": False, "error": message}), 500

@app.route('/git-identity', methods=['GET'])
def get_git_identity_api():
    """Get current global git identity (user.name and user.email)."""
    return jsonify(git_runner.get_git_identity())

@app.route('/git-identity', methods=['POST'])
def set_git_identity_api():
    """Set global git identity (user.name and user.email)."""
    data = request.json or {}
    name = data.get("name", "").strip()
    email = data.get("email", "").strip()
    if not name or not email:
        return jsonify({"error": "Both name and email are required"}), 400
    success, message = git_runner.set_git_identity(name, email)
    if success:
        return jsonify({"success": True, "message": message})
    return jsonify({"success": False, "error": message}), 500

# ---------------------------------------------------------------------------
# Visual Git Control Panel API
#
# Read-only data for the panel tabs comes from /git/<id>/data/<kind>.
# Every mutating operation goes through a single dispatch: /git/<id>/action.
# All git logic lives in git_console.py — these routes are thin wrappers.
# ---------------------------------------------------------------------------

@app.route('/git/<project_id>/data/<kind>', methods=['GET'])
def git_data_api(project_id, kind):
    """Return read-only repository data (overview, log, branches, remotes,
    stashes, tags, diff, config) for the control panel."""
    params = request.args.to_dict()
    result = git_console.query(project_id, kind, params)
    status = 200 if result.get("ok", True) else 400
    return jsonify(result), status


@app.route('/git/<project_id>/action', methods=['POST'])
def git_action_api(project_id):
    """Perform a mutating git operation for the control panel.

    Body: {"op": "<operation>", "params": {...}}. Destructive operations are
    gated in the UI (centered confirm overlay); the backend just executes and
    logs them. Uses the same execution lock as backups for write operations so
    a manual action can't collide with a running backup.
    """
    data = request.get_json(silent=True) or {}
    op = data.get("op")
    params = data.get("params") or {}
    if not op:
        return jsonify({"success": False, "message": "No operation specified."}), 400

    # Read-only ops (terminal that only reads, etc.) still go through the lock
    # for simplicity — operations are fast. If a backup is mid-flight, fail
    # cleanly rather than risk racing on the git index.
    if not git_runner.acquire_lock():
        return jsonify({
            "success": False,
            "message": "A backup is currently running. Please try again in a moment."
        }), 409
    try:
        result = git_console.perform(project_id, op, params)
        return jsonify(result)
    finally:
        git_runner.release_lock()


@app.route('/system-status', methods=['GET'])
def system_status_api():
    """Retrieve system diagnostics status."""
    python_installed = sys.executable is not None
    git_installed = git_runner.check_git_installed()
    internet_available = git_runner.check_internet()
    task_registered = check_task_registered()
    dry_run = config_manager.is_dry_run()
    git_identity = git_runner.get_git_identity()

    return jsonify({
        "python_installed": python_installed,
        "git_installed": git_installed,
        "internet_available": internet_available,
        "task_registered": task_registered,
        "dry_run": dry_run,
        "git_identity": git_identity,
        "platform": sys.platform
    })

@app.route('/logs', methods=['GET'])
def get_logs_api():
    """Retrieve system logs."""
    return jsonify(logger.get_logs())

@app.route('/config', methods=['GET'])
def get_config_api():
    """Retrieve global configuration."""
    return jsonify(config_manager.load_config())

@app.route('/config', methods=['POST'])
def update_config_api():
    """Update global configuration (e.g. Dry Run toggle)."""
    data = request.json or {}
    new_dry_run = data.get("dry_run")
    
    if new_dry_run is not None:
        old_dry_run = config_manager.is_dry_run()
        if old_dry_run != new_dry_run:
            config_manager.set_dry_run(new_dry_run)
            msg = f"Global Dry Run Mode {'enabled' if new_dry_run else 'disabled'} by user."
            logger.log_event("System", "WARNING" if new_dry_run else "SUCCESS", msg)
            
    return jsonify(config_manager.load_config())

if __name__ == '__main__':
    # Default port 5000, debug mode off for production-grade MVP stability
    app.run(host='127.0.0.1', port=5000, debug=False)
