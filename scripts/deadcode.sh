#!/bin/bash
# Dead Code Detection via ts-prune
# Reports unused exports found by ts-prune.
#
# Usage:
#   scripts/deadcode.sh              — warn-only (default, exit 0)
#   scripts/deadcode.sh --fail       — fail on any unused export (for CI)
#   scripts/deadcode.sh --allow=Foo  — skip items matching /Foo/
#   scripts/deadcode.sh tsconfig.check.json — use a different tsconfig
#
# The skip list handles known false positives:
#   .d.ts / .test.ts / .spec.ts / .cjs / vite.config
#   /ui/ (shadcn re-exports tree-shaken by bundler)
#   AppWrapper (used in main.tsx, ts-prune false positive)
#   ReportContext (internal to ReportEngine)
#   (used in module) — radix-ui style self-referential exports

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
FAIL_MODE=false
ALLOW_EXTRAS=""
PROJECT="tsconfig.app.json"

# Parse all args — flags and positional
for arg in "$@"; do
  case "$arg" in
    --fail) FAIL_MODE=true ;;
    --allow=*) ALLOW_EXTRAS="$ALLOW_EXTRAS|${arg#--allow=}" ;;
    --allow) echo "Usage: --allow=PATTERN (e.g. --allow=MyComponent)"; exit 1 ;;
    --*) echo "Unknown flag: $arg"; exit 1 ;;
    *) PROJECT="$arg" ;;  # bare positional = the tsconfig file
  esac
done

# Known false positives — items that are actually used elsewhere
# or re-exported for bundler tree-shaking.
BASE_SKIP='(default$|\.d\.ts$|\.test\.ts$|\.spec\.ts$|vite\.config|\.cjs$|/ui/|AppWrapper|ReportContext|\(used in module\)|CurrentStock|DispatchRegister|ReceiveRegister|SupplierPurchaseSummary|CustomerOutstandingReport|CustomerSalesSummary|TopSellingProducts|ValidationLevel|ValidationMessage|ValidationResult|IValidator|FieldValidators|BusinessValidators|ErrorManagement|ValidationEngine|PurchaseDTO|PurchaseValidator|SalesDTO|SalesValidator|ProcessingDispatchDTO|ProcessingDispatchValidator|ProcessingReceiveDTO|ProcessingReceiveValidator|VoucherDTO|VoucherValidator|Sidebar|RELEASE_DATE|DATABASE_SCHEMA_VERSION|isElectron|moduleIcon|moduleDisplayName|actionDisplayName|logAuditEvent|PermissionAction|formatDate|formatDateISO|ProcessingRateMethod|ProcessingLossDTO|ProcessingLossValidator|ProcessingStageDTO|ProcessingStageValidator|useIsMobile)'

if [ -n "$ALLOW_EXTRAS" ]; then
  SKIP="$BASE_SKIP$ALLOW_EXTRAS"
else
  SKIP="$BASE_SKIP"
fi

OUTPUT=$(cd "$PROJECT_DIR" && npx --yes ts-prune --project "$PROJECT" 2>/dev/null | grep -vE "$SKIP" || true)

if [ -n "$OUTPUT" ]; then
  COUNT=$(echo "$OUTPUT" | grep -c '[^[:space:]]' || echo 0)
  
  if [ "$COUNT" -gt 0 ]; then
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  Dead Code Report  —  $COUNT potentially unused export(s)  ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "$OUTPUT"
    echo ""
    echo "────────────────────────────────────────────────────────────"
    echo "Review each item above. To suppress known false positives,"
    echo "update BASE_SKIP in scripts/deadcode.sh."
    echo "To fail the build on dead code, run: scripts/deadcode.sh --fail"
    echo "────────────────────────────────────────────────────────────"
    
    if [ "$FAIL_MODE" = true ]; then
      exit 1
    fi
  fi
else
  echo "✓ No dead code detected"
fi

exit 0
