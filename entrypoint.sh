#!/bin/sh
set -e

echo "🗄️ Running DB init (safe)..."
python init_database.py

echo "🚀 Starting Gunicorn"
exec gunicorn -b 0.0.0.0:8000 app:app

