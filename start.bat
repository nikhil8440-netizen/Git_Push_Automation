@echo off
title Git Manager Launcher
cd /d "%~dp0"

echo ===================================================
echo             Git Manager Launcher
echo ===================================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not available in the system PATH.
    echo Please download and install Python 3.x from https://www.python.org/downloads/
    echo Ensure the option "Add Python to PATH" is checked during installation.
    echo.
    pause
    exit /b 1
)

:: Create Virtual Environment if missing
if not exist ".venv" (
    echo [INFO] Virtual environment .venv not found. Creating it now...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [SUCCESS] Virtual environment created.
)

:: Activate Virtual Environment
echo [INFO] Activating virtual environment...
call .venv\Scripts\activate.bat
if errorlevel 1 (
    echo [ERROR] Failed to activate virtual environment.
    pause
    exit /b 1
)

:: Install/Upgrade dependencies
echo [INFO] Verifying dependencies inside requirements.txt...
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)
echo [SUCCESS] Dependencies verified.

:: Open Dashboard in Browser
echo [INFO] Launching dashboard in default web browser...
start http://127.0.0.1:5000

:: Start Flask server in foreground
echo [INFO] Booting Flask API Server...
echo.
python -m backend.app

if errorlevel 1 (
    echo.
    echo [ERROR] Flask server exited with an error.
    pause
)
