import os
import json
import uuid

# Base path setup
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BACKEND_DIR, 'config.json')

DEFAULT_CONFIG = {
    "dry_run": False,
    "projects": []
}

def load_config():
    """Load configuration from config.json. Automatically initializes if missing or invalid."""
    if not os.path.exists(CONFIG_PATH):
        save_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG
    
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Ensure basic fields exist
            if not isinstance(data, dict):
                raise ValueError("Config root is not a dictionary")
            if "dry_run" not in data:
                data["dry_run"] = False
            if "projects" not in data or not isinstance(data["projects"], list):
                data["projects"] = []
            return data
    except Exception:
        # If malformed, backup corrupt file and recreate default
        if os.path.exists(CONFIG_PATH):
            try:
                os.rename(CONFIG_PATH, CONFIG_PATH + '.corrupt')
            except Exception:
                pass
        save_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG

def save_config(config_data):
    """Save configuration to config.json."""
    try:
        # Ensure directory exists
        os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, indent=4)
        return True
    except Exception:
        return False

def get_projects():
    """Get all projects."""
    config = load_config()
    return config.get("projects", [])

def get_project(project_id):
    """Get a project by ID."""
    projects = get_projects()
    for p in projects:
        if p.get("id") == project_id:
            return p
    return None

def add_project(project_data):
    """Add a new project configuration."""
    config = load_config()
    
    # Generate unique ID
    project_id = str(uuid.uuid4())
    
    new_project = {
        "id": project_id,
        "name": project_data.get("name", "Unnamed Repo"),
        "path": project_data.get("path", "").replace("\\", "/"),  # Normalize Windows paths
        "origin": project_data.get("origin", ""),
        "branch": project_data.get("branch", "main"),
        "enabled": project_data.get("enabled", True),
        "paused": project_data.get("paused", False),
        "auto_commit": project_data.get("auto_commit", True),
        "auto_push": project_data.get("auto_push", True),
        "run_on_startup": project_data.get("run_on_startup", True),
        "run_interval_minutes": int(project_data.get("run_interval_minutes", 30)),
        "excluded_paths": project_data.get("excluded_paths", [".venv", "node_modules", "dist", "build"]),
        "last_run": "",
        "last_commit": "",
        "last_push": "",
        "last_status": "Never Run"
    }
    
    config["projects"].append(new_project)
    save_config(config)
    return new_project

def update_project(project_id, updated_data):
    """Update an existing project configuration."""
    config = load_config()
    for i, p in enumerate(config["projects"]):
        if p.get("id") == project_id:
            # Update fields while preserving id
            for key, val in updated_data.items():
                if key == "id":
                    continue
                if key == "path" and isinstance(val, str):
                    val = val.replace("\\", "/") # Normalize path
                if key == "run_interval_minutes":
                    val = int(val)
                p[key] = val
            
            config["projects"][i] = p
            save_config(config)
            return p
    return None

def delete_project(project_id):
    """Delete a project configuration."""
    config = load_config()
    initial_len = len(config["projects"])
    config["projects"] = [p for p in config["projects"] if p.get("id") != project_id]
    
    if len(config["projects"]) < initial_len:
        save_config(config)
        return True
    return False

def is_dry_run():
    """Check if dry run mode is enabled."""
    config = load_config()
    return config.get("dry_run", False)

def set_dry_run(state):
    """Set dry run mode state."""
    config = load_config()
    config["dry_run"] = bool(state)
    save_config(config)
    return config["dry_run"]
