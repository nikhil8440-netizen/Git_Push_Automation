#!/bin/bash
# Git Manager Launcher — macOS and Linux
cd "$(dirname "$0")"

echo "==================================================="
echo "             Git Manager Launcher"
echo "==================================================="
echo ""

# Check Python 3
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3 is not installed or not in PATH."
    echo "Install it from https://www.python.org/downloads/ or via your package manager."
    echo "  macOS:  brew install python"
    echo "  Ubuntu: sudo apt install python3 python3-venv"
    exit 1
fi

# Create virtual environment if missing
if [ ! -d ".venv" ]; then
    echo "[INFO] Virtual environment .venv not found. Creating it now..."
    python3 -m venv .venv
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to create virtual environment."
        echo "  Ubuntu/Debian: sudo apt install python3-venv"
        exit 1
    fi
    echo "[SUCCESS] Virtual environment created."
fi

# Activate virtual environment
echo "[INFO] Activating virtual environment..."
source .venv/bin/activate
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to activate virtual environment."
    exit 1
fi

# Install/upgrade dependencies
echo "[INFO] Verifying dependencies inside requirements.txt..."
pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install dependencies."
    exit 1
fi
echo "[SUCCESS] Dependencies verified."

# Open dashboard in default browser
echo "[INFO] Launching dashboard in default web browser..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    open http://127.0.0.1:5000
else
    xdg-open http://127.0.0.1:5000 &> /dev/null || \
    sensible-browser http://127.0.0.1:5000 &> /dev/null || \
    echo "[INFO] Could not auto-open browser. Visit http://127.0.0.1:5000 manually."
fi

# Start Flask server in foreground
echo "[INFO] Booting Flask API Server..."
echo ""
python -m backend.app

if [ $? -ne 0 ]; then
    echo ""
    echo "[ERROR] Flask server exited with an error."
    read -p "Press Enter to exit..."
fi
