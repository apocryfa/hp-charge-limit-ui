# Relaunch the app elevated, with one UAC prompt.
#
# Delegates to launch-verify.ps1, which kills the running instance by window
# title and starts a fresh one. Elevation is needed for the HP firmware mode
# reads/writes; without it the current mode shows as unknown and `set` fails.

$script = Join-Path $PSScriptRoot 'launch-verify.ps1'
if (-not (Test-Path $script)) {
  Write-Error "missing $script"
  exit 1
}

Start-Process -FilePath 'powershell.exe' `
  -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$script`"") `
  -Verb RunAs