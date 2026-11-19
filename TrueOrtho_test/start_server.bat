@echo off
setlocal
cd /d "%~dp0"
set PORT=8090

python --version >nul 2>&1
if not errorlevel 1 goto serve_python

py --version >nul 2>&1
if not errorlevel 1 goto serve_py

node --version >nul 2>&1
if not errorlevel 1 goto serve_node

echo Python and Node.js were not found on PATH.
echo Opening index.html directly in your default browser...
start "" "%~dp0index.html"
goto :eof

:serve_python
echo Starting True Ortho 3D Simulator on http://localhost:%PORT% using Python...
python -m http.server %PORT%
goto :eof

:serve_py
echo Starting True Ortho 3D Simulator on http://localhost:%PORT% using Python Launcher...
py -m http.server %PORT%
goto :eof

:serve_node
echo Starting True Ortho 3D Simulator on http://localhost:%PORT% using Node.js...
node static_server.js %PORT%
