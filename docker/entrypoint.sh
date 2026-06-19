#!/bin/sh
# Runs on every container start, before the main process.
# Both steps are idempotent — safe to re-run on restart.
set -e

echo "[botzin] Applying database schema..."
node dist/database/migrate.js

echo "[botzin] Ensuring admin user exists..."
node dist/database/create-admin-user.js

echo "[botzin] Starting config server..."
exec "$@"
