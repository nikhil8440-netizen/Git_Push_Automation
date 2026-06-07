# PowerShell script to create the Git Manager Scheduled Task
# Requires Administrator privileges to register the task for logon/system execution.

$TaskName = "Git Manager"
$ProjectRoot = Resolve-Path "$PSScriptRoot\.."
$PythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $PythonExe)) {
    $PythonExe = "python.exe"
    Write-Host "Virtual environment python not found at $PythonExe. Falling back to system python." -ForegroundColor Yellow
} else {
    Write-Host "Found virtual environment python at: $PythonExe" -ForegroundColor Green
}

$ScriptPath = Join-Path $ProjectRoot "backend\scheduler.py"
Write-Host "Scheduler script path: $ScriptPath"

# Check if script path exists
if (-not (Test-Path $ScriptPath)) {
    Write-Error "Scheduler script not found at $ScriptPath. Aborting."
    exit 1
}

# Define the action: execute python with scheduler.py
$Action = New-ScheduledTaskAction -Execute $PythonExe -Argument """$ScriptPath""" -WorkingDirectory $ProjectRoot

# Define the trigger: At user logon, repeating every 10 minutes indefinitely
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Trigger.RepetitionInterval = New-TimeSpan -Minutes 10
$Trigger.RepetitionDuration = [TimeSpan]::MaxValue

# Define settings: Run as soon as possible after a scheduled start is missed, allow start on demand
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# Define Principal: Run under current user context so Git credentials (SSH agent, Windows credential manager) are available
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$Principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive

# Register the task
Write-Host "Registering Scheduled Task '$TaskName' for user '$CurrentUser'..." -ForegroundColor Cyan

try {
    # Check if task already exists and unregister it first to avoid conflicts
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Write-Host "Task already exists. Re-registering..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
    
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -ErrorAction Stop
    Write-Host "Successfully registered scheduled task '$TaskName'." -ForegroundColor Green
    Write-Host "It will run automatically at user logon and repeat every 10 minutes." -ForegroundColor Green
}
catch {
    Write-Error "Failed to register scheduled task. Ensure you are running PowerShell as Administrator. Error: $_"
    exit 1
}
