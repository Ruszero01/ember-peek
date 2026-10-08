@echo off
REM Double-click entry for the shared development environment. It is the same script the shell
REM calls, started with an execution policy that does not depend on this machine's setting, and
REM it pauses so a failure is readable instead of a window that closes before the reason shows.
REM Optional argument: a file to open in the preview window (see tools/README.md).
REM Keep this file ASCII only, like the PowerShell script it starts.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-with-debug.ps1" %*
pause
