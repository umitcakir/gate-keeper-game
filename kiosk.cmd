@echo off
rem Starts the kiosk from the build (dist\kiosk.cmd), building dist\ first if it is missing.
rem After changing the code, run `npm run build` again. On the reception PC you can also copy just dist\ there.
cd /d "%~dp0"
if not exist dist\kiosk.cmd (
  echo   Building dist\ ...
  call npm run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call dist\kiosk.cmd
