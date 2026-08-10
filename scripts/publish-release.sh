#!/usr/bin/env bash
# ============================================================
#  Manufacturing ERP — Publish a New Release (ONE COMMAND)
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
#   4. All changes committed on your current branch
#
# What it does (fully local — no waiting on GitHub Actions):
#   1. Checks the working tree is clean (uncommitted changes must be
#      committed first; pass SKIP_CLEAN_CHECK=1 to override)
#   2. Bumps version in package.json + src/config/version.ts
#   3. Commits the version bump
#   4. Builds the Vite frontend
#   5. Runs electron-builder --win --publish always → uploads the
#      installer + latest.yml straight to GitHub Releases (installed
#      users auto-update immediately)
#   6. Pushes the branch + v*.*.* tag to origin
#   7. Auto-generates the release notes body from the commit log since
#      the previous tag and PATCHes it onto the GitHub release
#
#   The GitHub Actions workflow (.github/workflows/release.yml) is kept
#   as a fallback for other machines; this script is the primary path.
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

CURRENT_BRANCH=$(git branch --show-current)
if [ -z "$CURRENT_BRANCH" ]; then
  echo "❌  Detached HEAD — check out a branch before publishing."
  exit 1
fi

# ── Working tree must be clean (except our own version-bump commit) ──

if [ "${SKIP_CLEAN_CHECK:-0}" != "1" ]; then
  UNCOMMITTED=$(git status --porcelain | grep -v '^??' || true)
  if [ -n "$UNCOMMITTED" ]; then
    echo "❌  Working tree has uncommitted changes — commit them first,"
    echo "   or run with SKIP_CLEAN_CHECK=1 to publish anyway."
    echo ""
    echo "$UNCOMMITTED"
    exit 1
  fi
fi

# ── Determine bump type ────────────────────────────────────────────

BUMP="${1:-patch}"
if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: bash scripts/publish-release.sh [patch|minor|major]"
  exit 1
fi

echo "🚀  Preparing $BUMP release (local build + publish)..."
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
echo ""

# ── Build frontend ─────────────────────────────────────────────────

echo "📦  Building Vite frontend..."
npx vite build
echo "✅  Vite build complete."
echo ""

# ── Build installer & publish to GitHub Releases ────────────────────
#    --publish always uploads the installer + latest.yml + blockmap
#    straight to GitHub Releases; installed users auto-update.

echo "🚀  Building installer and publishing to GitHub Releases..."
npx electron-builder --win --publish always
echo "✅  Installer built and published."
echo ""

# ── Push branch + tag ──────────────────────────────────────────────

echo "Pushing commit and tag to origin ($CURRENT_BRANCH)..."
git push origin "$CURRENT_BRANCH"
# electron-builder --publish always already created the v* tag on GitHub when
# it published the release, so the tag push may be rejected as 'already exists'
# — that is expected, not an error.
PUSH_TAG_OUTPUT=$(git push origin "v$NEW_VERSION" 2>&1 || true)
if echo "$PUSH_TAG_OUTPUT" | grep -q "already exists"; then
  echo "ℹ️  Tag v$NEW_VERSION already exists on origin (created by electron-builder) — skipping."
else
  echo "$PUSH_TAG_OUTPUT"
fi

# ── Auto-generate release notes & update the GitHub release ─────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo ""
echo "Updating release body on GitHub..."
bash "$SCRIPT_DIR/set-release-notes.sh"

echo ""
echo "✅  Release v$NEW_VERSION published!"
echo "    https://github.com/$(git remote get-url origin | sed -E 's#.*github\.com[:/]##; s#\.git$##')/releases/tag/v$NEW_VERSION"
echo ""
echo "Users will receive the update automatically within minutes."
