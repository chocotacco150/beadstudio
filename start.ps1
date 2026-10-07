$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$beadNodeCommand = Get-Command node -ErrorAction SilentlyContinue
$beadNode = if ($beadNodeCommand) { $beadNodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $beadNode)) { throw 'Node.js 22+ is required. Install Node.js, then run this launcher again.' }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules\vite\bin\vite.js'))) {
  $beadPnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  $beadNpmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
  $beadBundledPnpm = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
  if ($beadPnpmCommand) { & $beadPnpmCommand.Source install }
  elseif ($beadNpmCommand) { & $beadNpmCommand.Source install }
  elseif (Test-Path -LiteralPath $beadBundledPnpm) { & $beadBundledPnpm install }
  else { throw 'npm or pnpm is required to install dependencies.' }
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
Write-Host 'Bead Studio: http://127.0.0.1:5173 (Ctrl+C to stop)' -ForegroundColor Cyan
& $beadNode (Join-Path $PSScriptRoot 'node_modules\vite\bin\vite.js') --host 127.0.0.1 --port 5173 --open
