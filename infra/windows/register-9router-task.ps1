param(
  [string]$RouterCmd = (Get-Command 9router -ErrorAction Stop).Source,
  [string]$RouterArgs = "",
  [string]$WorkDir = $env:USERPROFILE,
  [string]$TaskName = "AgenticOS-9Router"
)
$ErrorActionPreference = "Stop"
$inner = "`$env:HOSTNAME='127.0.0.1'; `$env:PORT='20128'; `$env:NEXT_PUBLIC_BASE_URL='http://localhost:20128'; " +
         "`$env:REQUIRE_API_KEY='true'; `$env:ENABLE_REQUEST_LOGS='true'; " +
         "Set-Location '$WorkDir'; & '$RouterCmd' $RouterArgs"
$action   = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command `"$inner`""
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
            -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description "9Router for Agentic OS (127.0.0.1:20128)" -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Output "Registered and started $TaskName"
