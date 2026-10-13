#!/usr/bin/env bash
# Runs the end-to-end test suite against a fresh SQLite database.
# Usage: bash tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
export DB_DRIVER=sqlite DB_SQLITE_PATH="$TMP/test.sqlite" UPLOADS_DIR="$TMP/uploads" APP_DEBUG=1
php backend/bin/install.php --admin-email=admin@shaggar.test --admin-password=Admin@12345 --demo > /dev/null
php -S 127.0.0.1:8799 -t frontend/public frontend/public/index.php > "$TMP/server.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; rm -rf "$TMP"' EXIT
sleep 1
php tests/http_test.php http://127.0.0.1:8799
