@echo off
rem Event-day launcher (Windows). Lives in the build output: `npm run build` copies it from deploy\ to dist\.
rem Double-click dist\kiosk.cmd, or kiosk.cmd in the project root. All the kiosk logic (watchdog, blocked
rem shortcuts, PIN-only exit) is in server\src\kiosk\launcher.ts; it reopens itself in a classic console window.
cd /d "%~dp0"
if not exist public goto incomplete
if not exist node_modules goto incomplete
node server\src\kiosk\run.ts
exit /b
:incomplete
echo   This folder is not a complete build. From the project root, run kiosk.cmd (it builds dist first).
pause
