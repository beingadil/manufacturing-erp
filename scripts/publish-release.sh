#!/usr/bin/env bash
# ============================================================
#  Manufacturing ERP — Publish a New Release
# ============================================================
# Usage:
#   bash scripts/publish-release.sh patch   # 1.0.0 → 1.0.1
#   bash scripts/publish-release.sh minor   # 1.0.0 → 1.1.0
#   bash scripts/publish-release.sh major   # 1.0.0 → 2.0.0
#
# Prerequisites:
#   1. A GitHub repository with your code pushed to 'origin'
#   2. GH_TOKEN or GITHUB_TOKEN environment variable set
#   3. Publish config in package.json pointing to your repo
#   4. All changes committed and pushed to main
#
# What it does:
#   1. Bumps version in package.json + src/config/version.ts
#   2. Commits the version bump
#   3. Tags with v*.*.*
#   4. Pushes tag to GitHub (triggers Actions release workflow)
#   5. Builds & publishes to GitHub Releases
#
# ============================================================

set -euo pipefail

cd "$(dirname "$0")/.."

# ── Validate prerequisites ──────────────────────────────────────────

if [ -z "${GH_TOKEN:-}" ] && [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "❌  GH_TOKEN or GITHUB_TOKEN environment variable must be set."
  echo "   Create a GitHub Personal Access Token with 'repo' scope:"
  echo "   https://github.com/settings/tokens"
  exit 1
fi

if ! git remote get-url origin &>/dev/null; then
  echo "❌  No 'origin' git remote configured."
  echo "   Run: git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git"
  exit 1
fi

# ── Determine bump type ────────────────────────────────────────────

BUMP="${1:-patch}"
if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: bash scripts/publish-release.sh [patch|minor|major]"
  exit 1
fi

echo "🚀  Preparing $BUMP release..."
echo ""

# ── Read current version ──────────────────────────────────────────

CURRENT=$(node -e "console.log(require('./package.json').version)")
echo "Current version: $CURRENT"

# Bump using npm (updates package.json)
npm version "$BUMP" --no-git-tag-version
NEW_VERSION=$(node -e "console.log(require('./package.json').version)")
echo "New version:     $NEW_VERSION"

# ── Update src/config/version.ts ──────────────────────────────────

BUILD_NUM=$(date +%Y%m%d.%H%M)
RELEASE_DATE=$(date +%Y-%m-%d)

sed -i "s/APP_VERSION = '[0-9.]*'/APP_VERSION = '$NEW_VERSION'/" src/config/version.ts
sed -i "s/BUILD_NUMBER = '[0-9.]*'/BUILD_NUMBER = '$BUILD_NUM'/" src/config/version.ts
sed -i "s/RELEASE_DATE = '[0-9-]*'/RELEASE_DATE = '$RELEASE_DATE'/" src/config/version.ts

echo "Updated: src/config/version.ts → $NEW_VERSION (build $BUILD_NUM)"

# ── Commit & tag ───────────────────────────────────────────────────

git add package.json src/config/version.ts
git commit -m "chore: bump version to $NEW_VERSION"

git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo "Tagged: v$NEW_VERSION"

# ── Push ───────────────────────────────────────────────────────────

echo ""
echo "Pushing commit and tag to origin..."
git push origin main
git push origin "v$NEW_VERSION"

echo ""
echo "✅  Release v$NEW_VERSION pushed!"
echo ""
echo "GitHub Actions will now build and publish the release."
echo "Check progress at: https://github.com/$(git remote get-url origin | sed 's/.*://;s/\.git//')/actions"
echo ""
echo "Users will receive the update automatically within minutes."
