@echo off
chcp 65001 >nul
setlocal
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0scripts\local-server.mjs" --open
) else (
  node "%~dp0scripts\local-server.mjs" --open
)
if errorlevel 1 pause
