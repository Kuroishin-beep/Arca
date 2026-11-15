@echo off
rem Installs the Arca Symbiote into TaleSpire. Double-click it.
rem Copies the files next to this script into TaleSpire's Symbiotes folder.
rem Run it again any time to update. To uninstall, delete the Arca folder it
rem names at the end.
setlocal

set "TALESPIRE=%USERPROFILE%\AppData\LocalLow\BouncyRock Entertainment\TaleSpire"
set "DEST=%TALESPIRE%\Symbiotes\Arca"

if not exist "%TALESPIRE%" (
  echo TaleSpire's data folder was not found:
  echo   %TALESPIRE%
  echo Start TaleSpire once, close it, and run this again.
  pause
  exit /b 1
)

if not exist "%DEST%" mkdir "%DEST%"

for %%F in (manifest.json arca-bridge.js description.md icon.png notification.png) do (
  if not exist "%~dp0%%F" (
    echo Missing %%F next to this script. Unzip the whole download first.
    pause
    exit /b 1
  )
  copy /Y "%~dp0%%F" "%DEST%\" >nul
)

echo.
echo Arca is installed in:
echo   %DEST%
echo.
echo In TaleSpire: Settings - turn on Symbiotes, then open Arca from the
echo Symbiotes panel on the right. Restart TaleSpire if it was open.
echo.
pause
