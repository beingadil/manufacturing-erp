#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Persistence Smoke Test — orchestrator
#
# Deletes the old database, launches Electron to write test records, then
# launches a FRESH Electron process to verify those records persisted.
#
# Usage:
#   bash scripts/persistence-smoke-test.sh
#
# Exit code: 0 = PASS, 1 = FAIL
# ─────────────────────────────────────────────────────────────────────────────
# Note: intentionally avoid -o pipefail so grep's exit code (1 = no match)
# doesn't mask the preceding command's exit code.
set -euo

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Determine the user data path (matches electron/main.cjs expectations)
# Electron stores userData at: %APPDATA%/<app-name> on Windows
# Default app name from package.json main field is "miaoda-react-admin"
# unless we override with --user-data-dir
TEST_DB_DIR="$ROOT_DIR/.smoke-test-data"
TEST_DB_PATH="$TEST_DB_DIR/manufacturing-erp.sqlite"
PASS=0
FAIL=1

echo "═══════════════════════════════════════════════════════════════"
echo "  Manufacturing ERP — Persistence Smoke Test"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Test database: $TEST_DB_PATH"
echo ""

# ── Step 0: Clean previous test artifacts ───────────────────────────────────
cleanup() {
  rm -rf "$TEST_DB_DIR"
}
cleanup
mkdir -p "$TEST_DB_DIR"

# Note: persistenceTest.cjs is a standalone Electron entry point that never loads
# dist/index.html, so no frontend build is needed.  The database module and
# better-sqlite3 native binary work purely from electron/database.cjs.

# ── Step 2: Write test data ─────────────────────────────────────────────────
echo "[Step 1] Writing test data…"
ELECTRON_USER_DATA="$TEST_DB_DIR" npx electron electron/persistenceTest.cjs --write 2>&1 | \
  grep -E '\[SmokeTest\]|\[DB\]' || true

# Check exit code of the write process
if [ "${PIPESTATUS[0]}" -ne 0 ]; then
  echo ""
  echo "  ✗ WRITE PHASE FAILED — cannot continue."
  cleanup
  exit $FAIL
fi
echo "  ✓ Write phase completed successfully"
echo ""

# ── Step 3: Verify data persisted (in a NEW Electron process) ───────────────
echo "[Step 2] Verifying data persisted across restart…"
ELECTRON_USER_DATA="$TEST_DB_DIR" npx electron electron/persistenceTest.cjs --verify 2>&1 | \
  grep -E '\[SmokeTest\]|\[DB\]' || true

VERIFY_EXIT="${PIPESTATUS[0]}"

echo ""

# ── Step 4: Report result ───────────────────────────────────────────────────
if [ "$VERIFY_EXIT" -eq 0 ]; then
  echo "═══════════════════════════════════════════════════════════════"
  echo "  ✅ ALL PERSISTENCE CHECKS PASSED"
  echo "═══════════════════════════════════════════════════════════════"
  cleanup
  exit $PASS
else
  echo "═══════════════════════════════════════════════════════════════"
  echo "  ❌ PERSISTENCE TEST FAILED"
  echo "═══════════════════════════════════════════════════════════════"
  # Keep the test DB around for debugging
  echo "Test database preserved at: $TEST_DB_PATH"
  exit $FAIL
fi
