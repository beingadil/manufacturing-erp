#!/bin/bash
# Tool-consistency guard — fails fast when Biome and tsgo DISAGREE.
#
# The failure this catches: `biome check --write` (or an unsafe autofix) removes
# an import that tsgo still resolves, producing "Cannot find name" errors on CI
# *after* the commit landed. Biome's unused-import analysis and tsc's symbol
# resolution can disagree mid-refactor; whenever they do, the type check is the
# source of truth, so this guard re-runs tsgo AFTER any biome --write pass and
# demands a clean type check before letting the pipeline continue.
#
# Usage: scripts/consistency-check.sh [--write]
#   --write  run `biome check --write` first (organize imports + safe fixes),
#            then verify tsgo still passes. Without --write, just verifies the
#            tree as it stands.
#
# Exit 0: biome and tsgo agree (or nothing to do).
# Exit 1: disagreement — a clear error explains which files/imports broke.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

MODE="${1:---check}"

echo "━━━ Tool consistency (biome ↔ tsgo) ━━━"

if [ "$MODE" = "--write" ]; then
  echo "→ Applying safe biome fixes (organize imports, safe autofixes)…"
  if ! npx biome check --write --files-ignore-unknown=true . >/dev/null 2>&1; then
    # biome exits non-zero when it *finds* fixable issues even after fixing;
    # only a diagnostics error is fatal here.
    if [ -n "$(npx biome check --files-ignore-unknown=true . 2>/dev/null | grep -i 'error')" ]; then
      echo "❌ biome itself failed. Run 'npx biome check .' and fix manually."
      exit 1
    fi
  fi
fi

echo "→ Verifying types still resolve after any biome edits…"
TSGO_OUT="$(npx tsgo -p tsconfig.check.json 2>&1)"
TSGO_CODE=$?

if [ $TSGO_CODE -eq 0 ]; then
  echo "✅ Consistent — tsgo resolves every symbol biome left behind."
  exit 0
fi

# Disagreement: produce a targeted, actionable error.
echo ""
echo "❌ BIOME/TSGO DISAGREEMENT — biome edits broke symbol resolution."
echo "   This usually means an autofix removed an import that is still used,"
echo "   or reordering changed a side-effectful import. First errors:"
echo ""
echo "$TSGO_OUT" | grep -E "error TS" | head -10 | sed 's/^/   /'
echo ""
echo "   Fix: restore the removed import(s) in the files above (tsgo is the"
echo "   source of truth), or revert the biome autofix for those files:"
echo "     git checkout -- <file>   # then re-apply fixes file-by-file"
echo ""
exit 1
