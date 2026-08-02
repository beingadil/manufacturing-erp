#!/usr/bin/env bash
# ============================================================
#  Manufacturing ERP — Set Release Notes on GitHub
# ============================================================
# Derives the previous release tag, generates the changelog body from the
# commit log since that tag, and PATCHes it onto the GitHub release for
# the current version (creating the release if it doesn't exist yet; CI's
# electron-builder later uploads the installer assets).
#
# Used by:
#   - scripts/publish-release.sh  (after pushing the tag)
#   - CI (.github/workflows/release.yml, after electron-builder uploads,
#     to guarantee the professional body survives the publish step)
#
# Usage:
#   bash scripts/set-release-notes.sh
#
# Environment:
#   GH_TOKEN or GITHUB_TOKEN  required
#   PUBLISH_DRY_RUN=1         skip the API call (print body only)
# ============================================================

set -euo pipefail

cd "$(dirname "$0")/.."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/release-notes.sh"

if [ -z "${GH_TOKEN:-}" ] && [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "❌  GH_TOKEN or GITHUB_TOKEN environment variable must be set."
  exit 1
fi

NEW_VERSION=$(node -e "console.log(require('./package.json').version)")
RELEASE_DATE=$(date +%Y-%m-%d)

# Previous release tag = newest tag reachable from the commit before this release.
PREV_TAG=$(git describe --tags --abbrev=0 HEAD~1 2>/dev/null || git tag --sort=-v:refname | grep -v "^v$NEW_VERSION$" | head -1 || true)

BODY_FILE=$(mktemp)
trap 'rm -f "$BODY_FILE"' EXIT

build_release_body "$PREV_TAG" "$NEW_VERSION" "$RELEASE_DATE" "$BODY_FILE"

REPO_SLUG=$(git remote get-url origin | sed -E 's#.*github\.com[:/]##; s#\.git$##')
if [ -z "$REPO_SLUG" ] || [ "$REPO_SLUG" = "origin" ]; then
  echo "❌  Could not determine the GitHub repository slug from the 'origin' remote."
  exit 1
fi

echo "📝  Release notes for v$NEW_VERSION (since ${PREV_TAG:-the beginning}):"
sed 's/^/    /' "$BODY_FILE"
echo ""

if [ "${PUBLISH_DRY_RUN:-0}" = "1" ]; then
  echo "ℹ️  PUBLISH_DRY_RUN=1 — skipping the release body update."
else
  node "$SCRIPT_DIR/update-release-body.mjs" "$REPO_SLUG" "$NEW_VERSION" "$BODY_FILE"
fi
