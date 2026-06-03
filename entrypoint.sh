#!/bin/sh
set -e

echo "🚀 Starting APAB Application..."

mkdir -p uploads Sparade_Rapporter

echo "🌐 Starting Gunicorn in debug mode..."
exec gunicorn -b 0.0.0.0:8000 app:app \
    --workers 1 \
    --log-level debug \
    --timeout 120 \
    --preload