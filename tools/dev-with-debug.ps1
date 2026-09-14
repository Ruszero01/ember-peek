# Start the shared development environment with a WebView2 debug port.
#
# Two long-lived pieces:
#   1. Vite + plugin watcher on http://127.0.0.1:1420 (frontend HMR, plugin rebuild)
#   2. The app, with WebView2 remote debugging on http://127.0.0.1:9222, so tooling can
#      read the real DOM instead of guessing from source or from a second reproduction.
#
# The debug port only opens once the app has created a window (windows are on demand),
# so start this, open a preview or the settings window, then use:
#
#   node tools/live-targets.mjs
#   node tools/live-targets.mjs plugin.localhost path/to/expression.js
#
# NOTE: keep this file ASCII only. Windows PowerShell reads .ps1 using the system ANSI
# code page, so non-ASCII text here turns into mojibake and can break parsing.
#
# Usage:  pwsh -File tools/dev-with-debug.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$debugPort = 9222
$frontendPort = 1420
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$debugPort"

function Test-Port([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

# Reuse a frontend that is already serving; only start one when the port is free.
# `tauri dev --config tauri.external-dev.json` clears beforeDevCommand, so it attaches
# to whatever is on the port instead of trying to start a second dev server.
if (Test-Port $frontendPort) {
  Write-Host "[shared-dev] reusing the dev server already on $frontendPort"
} else {
  Write-Host "[shared-dev] starting Vite + plugin watcher..."
  Start-Process -FilePath "cmd" -ArgumentList "/c", "npm", "run", "dev:services" -WindowStyle Hidden
  $ready = $false
  for ($attempt = 0; $attempt -lt 60 -and -not $ready; $attempt++) {
    Start-Sleep -Milliseconds 500
    $ready = Test-Port $frontendPort
  }
  if (-not $ready) { throw "the dev server did not come up on $frontendPort" }
  Write-Host "[shared-dev] Vite is up."
}

if (Test-Port $debugPort) {
  Write-Host "[shared-dev] an app with the debug port is already running; nothing to start."
  Write-Host "[shared-dev] (kill ember-peek first if you need a fresh instance)"
  exit 0
}

Write-Host "[shared-dev] starting the app with WebView2 debugging on $debugPort..."
Write-Host "[shared-dev] frontend : http://127.0.0.1:$frontendPort"
Write-Host "[shared-dev] debugger : http://127.0.0.1:$debugPort/json/list"
Write-Host "[shared-dev] open a preview or the settings window, then run tools/live-targets.mjs"
npm run tauri -- dev --config src-tauri/tauri.external-dev.json
