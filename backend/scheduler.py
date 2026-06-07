import sys
import os
from datetime import datetime

# Adjust path to import backend modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import config_manager
from backend import logger
from backend import git_runner

def run_scheduler():
    """Main scheduler run loop. Executes due projects."""
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Scheduler started.")
    
    # 1. Acquire execution lock
    if not git_runner.acquire_lock():
        msg = "Scheduler execution aborted: Another backup process is currently running."
        print(msg)
        logger.log_event("System", "ALREADY_RUNNING", msg)
        return
        
    try:
        projects = config_manager.get_projects()
        current_time = datetime.now()
        
        for project in projects:
            project_id = project.get("id")
            name = project.get("name")
            enabled = project.get("enabled", True)
            paused = project.get("paused", False)
            last_run_str = project.get("last_run")
            last_status = project.get("last_status", "Never Run")
            interval = project.get("run_interval_minutes", 30)
            
            # Skip if disabled or paused
            if not enabled:
                # Log state changes if they weren't captured? No, just skip silently or log once.
                # The requirements say "Paused projects remain in config, visible, skipped by scheduler"
                continue
                
            if paused:
                continue
                
            # Determine if due
            should_run = False
            
            # Case 1: Never Run before
            if not last_run_str or last_status == "Never Run":
                should_run = True
                
            # Case 2: In PENDING_RETRY status (retry logic for network errors)
            elif last_status == "PENDING_RETRY":
                should_run = True
                print(f"Project '{name}' is in PENDING_RETRY status. Retrying now.")
                
            # Case 3: Run interval has elapsed
            else:
                try:
                    last_run = datetime.strptime(last_run_str, "%Y-%m-%d %H:%M:%S")
                    elapsed_minutes = (current_time - last_run).total_seconds() / 60.0
                    if elapsed_minutes >= interval:
                        should_run = True
                except Exception as e:
                    print(f"Error parsing last run date for '{name}': {e}. Forcing run.")
                    should_run = True
            
            if should_run:
                print(f"Running backup for '{name}'...")
                # Run the backup (lock is already held by scheduler)
                status, msg = git_runner.run_backup(project_id, is_manual=False)
                print(f"Project '{name}' finished with status: {status}. Message: {msg}")
                
    except Exception as e:
        print(f"Scheduler encountered an unexpected error: {e}")
        logger.log_event("System", "FAILED", f"Scheduler error: {str(e)}")
        
    finally:
        # 2. Release execution lock
        git_runner.release_lock()
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Scheduler finished and lock released.")

if __name__ == "__main__":
    run_scheduler()
