@echo off
rem Startet die Seite lokal im Testmodus (ohne echte Datenbank) unter http://localhost:8000
rem Beenden: dieses Fenster schliessen oder Strg+C druecken.
cd /d "%~dp0"
start "" cmd /c "timeout /t 1 >nul & start http://localhost:8000/index.html?lokal"
python lokal-server.py 8000
