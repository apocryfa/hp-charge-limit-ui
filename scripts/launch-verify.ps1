# Launch the app elevated, with an optional verification screenshot.
#
#   powershell -File scripts/launch-verify.ps1            # just launch, elevated
#   powershell -File scripts/launch-verify.ps1 -Shot out.png   # shot, then launch
#
# Run it elevated (it will re-launch the app elevated via UAC):
#   powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-File','<this file>'"
#
# Pitfall: `Start-Process -Wait` waits for the process AND its descendants, so a
# caller that waits on this script hangs while the app stays open. The app is
# therefore spawned detached, via Win32_Process.Create.

param(
  [string]$Shot = ''
)

$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root 'node_modules\electron\dist\electron.exe'

if (-not (Test-Path $exe)) {
  Write-Error "electron.exe not found at $exe - run 'npm install' first"
  exit 1
}

# Kill by window title, not by path: elevated processes do not expose a readable
# Path to a non-elevated shell, so a Path filter silently matches nothing and the
# old instance survives a "restart".
Get-Process electron -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -eq 'HP Charge Limit' } |
  Stop-Process -Force
Start-Sleep -Seconds 2

if ($Shot) {
  if (Test-Path $Shot) { Remove-Item $Shot -Force }
  $env:HPCL_SHOT = $Shot
  Start-Process -FilePath $exe -ArgumentList '.' -WorkingDirectory $root -Wait
  Remove-Item Env:\HPCL_SHOT -ErrorAction SilentlyContinue
  'shot written: ' + (Test-Path $Shot)
}

Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
  CommandLine      = "`"$exe`" ."
  CurrentDirectory = $root
} | Out-Null

Start-Sleep -Seconds 3
'electron processes: ' + (Get-Process electron -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like '*hp-charge-limit-ui*' } | Measure-Object).Count