#!/bin/bash
# Lint Pipeline — runs all checks in sequence
# Each step runs regardless of previous failures (like ; separator on Unix),
# so that the deadcode check always executes.
#
# Steps:
#   1. tsgo (native TypeScript type check)
#   2. biome lint
#   3. ast-grep rule checks (.rules/check.sh)
#   4. tailwindcss CSS validation
#   5. vite build smoke test
#   6. ts-prune dead code detection

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
EXIT_CODE=0

step() {
  local label="$1"
  shift
  echo ""
  echo "━━━ $label ━━━"
  "$@" || EXIT_CODE=$?
}

step "TypeScript (tsgo)"        npx tsgo -p tsconfig.check.json
step "Biome Lint"               npx biome lint

# ast-grep rule checks live in .rules/ which is gitignored (dev-only) —
# skip gracefully when absent so CI (fresh checkout) doesn't fail on it.
if [ -f "$PROJECT_DIR/.rules/check.sh" ]; then
  step "Rule Checks (ast-grep)"   bash "$PROJECT_DIR/.rules/check.sh"
else
  echo ""
  echo "━━━ Rule Checks (ast-grep) ━━━"
  echo "(skipped — .rules/check.sh not present in this checkout)"
fi

# Tailwind — suppress everything except CSS errors
step "Tailwind CSS" sh -c 'npx tailwindcss -i ./src/index.css -o /dev/null 2>&1 | grep -E "^(CssSyntaxError|Error):" || true'

# Vite build smoke test is dev-only (gitignored .rules/testBuild.sh) — skip
# gracefully when absent; CI runs a real `npx vite build` in the workflow.
if [ -f "$PROJECT_DIR/.rules/testBuild.sh" ]; then
  step "Vite Build (smoke)"       bash "$PROJECT_DIR/.rules/testBuild.sh"
else
  echo ""
  echo "━━━ Vite Build (smoke) ━━━"
  echo "(skipped — .rules/testBuild.sh not present in this checkout)"
fi
step "Dead Code (ts-prune)"     bash "$SCRIPT_DIR/deadcode.sh"

exit $EXIT_CODE
