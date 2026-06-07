# PowerShell script to remove the Git Manager Scheduled Task
# Requires Administrator privileges.

$TaskName = "Git Manager"

Write-Host "Attempting to remove Scheduled Task '$TaskName'..." -ForegroundColor Cyan

try {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
        Write-Host "Successfully removed scheduled task '$TaskName'." -ForegroundColor Green
    } else {
        Write-Host "Scheduled task '$TaskName' does not exist. Nothing to do." -ForegroundColor Yellow
    }
}
catch {
    Write-Error "Failed to remove scheduled task. Ensure you are running PowerShell as Administrator. Error: $_"
    exit 1
}
