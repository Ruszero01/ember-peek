# Start the shared development environment with a WebView2 debug port.
#
# Two long-lived pieces:
#   1. Vite + plugin watcher on http://127.0.0.1:1420 (frontend HMR, plugin rebuild)
#   2. The app, with WebView2 remote debugging on http://127.0.0.1:9444, so tooling can
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

$debugPort = 9444
$frontendPort = 1420

# A port Windows has reserved (Hyper-V/WSL blocks show up in
# `netsh int ipv4 show excludedportrange protocol=tcp`) binds for nobody: WebView2 then fails
# silently and the debug endpoint simply never appears, which reads as a broken scaffold.
# 9222 is inside such a block on this machine, so the default here is outside all of them;
# this checks the choice instead of trusting it.
function Test-Bindable([int]$Port) {
  try {
    $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $probe.Start()
    $probe.Stop()
    return $true
  } catch {
    return $false
  }
}
if (-not (Test-Bindable $debugPort)) {
  throw "port $debugPort cannot be bound. Pick another one in this script; run 'netsh int ipv4 show excludedportrange protocol=tcp' to see what Windows has reserved."
}

# NOT WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: wry always hands WebView2 an explicit argument
# string, and the loader reads its own variable only when the host passes none, so a port asked
# for that way never opens. The app adds these arguments itself (src-tauri/src/desktop.rs).
# Supplying arguments replaces wry's defaults, so they are repeated here.
$env:EMBER_WEBVIEW_ARGS = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port=$debugPort"
$env:EMBER_DEBUG_PORT = "$debugPort"

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
