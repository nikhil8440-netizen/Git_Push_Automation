import os
import json
from datetime import datetime

# Base path setup
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
LOGS_PATH = os.path.join(BACKEND_DIR, 'logs.json')

MAX_LOG_ENTRIES = 1000

DEFAULT_LOGS = {
    "logs": []
}

def load_logs():
    """Load logs from logs.json. Automatically initializes if missing or invalid."""
    if not os.path.exists(LOGS_PATH):
        save_logs(DEFAULT_LOGS)
        return DEFAULT_LOGS
    
    try:
        with open(LOGS_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if not isinstance(data, dict) or "logs" not in data or not isinstance(data["logs"], list):
                raise ValueError("Logs root is invalid")
            return data
    except Exception:
        # Recreate logs if malformed
        save_logs(DEFAULT_LOGS)
        return DEFAULT_LOGS

def save_logs(logs_data):
    """Save logs to logs.json."""
    try:
        os.makedirs(os.path.dirname(LOGS_PATH), exist_ok=True)
        with open(LOGS_PATH, 'w', encoding='utf-8') as f:
            json.dump(logs_data, f, indent=4)
        return True
    except Exception:
        return False

def log_event(project, status, message, stdout="", stderr=""):
    """
    Log an event to logs.json. Caps total logs to MAX_LOG_ENTRIES.
    Statuses supported: SUCCESS, FAILED, NO_CHANGES, WARNING, PENDING_RETRY, PAUSED, DISABLED, ALREADY_RUNNING
    """
    logs_data = load_logs()
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    new_entry = {
        "timestamp": timestamp,
        "project": project if project else "System",
        "status": status,
        "message": message,
        "stdout": str(stdout) if stdout is not None else "",
        "stderr": str(stderr) if stderr is not None else ""
    }
    
    logs_data["logs"].insert(0, new_entry)  # Prepend so newest is at the top
    
    # Cap size
    if len(logs_data["logs"]) > MAX_LOG_ENTRIES:
        logs_data["logs"] = logs_data["logs"][:MAX_LOG_ENTRIES]
        
    save_logs(logs_data)
    return new_entry

def get_logs():
    """Get all logs (newest first)."""
    logs_data = load_logs()
    return logs_data.get("logs", [])
