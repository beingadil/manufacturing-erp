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
#   2. GH_TOKEN / GITHUB_TOKEN environment variable, OR a workflow-scoped
#      PAT stored in Git Credential Manager (run scripts/setup-gh-token.sh
#      once — the script then falls back to it automatically)
#   3. Publish config in package.json pointing to your repo
#   4. All changes committed on your current branch
#
# What it does (the heavy lifting is done by CI):
#   1. Checks the working tree is clean (uncommitted changes must be
#      committed first; pass SKIP_CLEAN_CHECK=1 to override)
#   2. Bumps version in package.json + src/config/version.ts
#   3. Commits the version bump and tags v*.*.*
#   4. Pushes the branch + tag to origin, then verifies the pushed tag
#      really points at HEAD and fails loudly if it does not
#
#   The tag push then triggers .github/workflows/release.yml, which builds
#   the installer on windows-latest and publishes the installer + latest.yml
#   to GitHub Releases (installed users auto-update). CI is the ONLY
#   publisher: building and uploading here as well would race the workflow
#   and produce duplicate releases.
#
#   Run this script, then watch the run in the Actions tab. The workflow
#   also stays available via workflow_dispatch for manual re-runs, and its
#   guard job skips the build if a release for the version already exists.
#
# ============================================================

set -euo pipefail

cd "$(dirname "$0")/.."

# ── Validate prerequisites ──────────────────────────────────────────

if [ -z "${GH_TOKEN:-}" ] && [ -z "${GITHUB_TOKEN:-}" ]; then
  # Fall back to the credential stored in Git Credential Manager by
  # scripts/setup-gh-token.sh — makes releases fully unattended.
  STORED_TOKEN=$(printf "protocol=https\nhost=github.com\n\n" \
    | git credential fill 2>/dev/null | sed -n 's/^password=//p')
  if [ -n "$STORED_TOKEN" ]; then
    export GH_TOKEN="$STORED_TOKEN"
    echo "ℹ️   GH_TOKEN not set — using credential from Git Credential Manager."
  else
    echo "❌  No GitHub token available."
    echo "   Either set GH_TOKEN, or store a workflow-scoped PAT once:"
    echo "   bash scripts/setup-gh-token.sh <token>"
    echo "   (https://github.com/settings/tokens — needs 'repo' + 'workflow' scopes)"
    exit 1
  fi
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

# ── Push branch + tag BEFORE publishing ────────────────────────────
#    ORDERING MATTERS. The tag must exist on GitHub BEFORE anything uploads,
#    so the release is attached to the commit actually being shipped. This
#    shipped v1.0.43 tagged at the v1.0.42 commit when the local build did the
#    publishing. CI (.github/workflows/release.yml) now builds and publishes on
#    the tag push, so this script only has to get the tag to origin.

echo "Pushing branch and tag to origin ($CURRENT_BRANCH)..."
git push origin "$CURRENT_BRANCH"
git push origin "v$NEW_VERSION"
echo ""

# ── Verify the pushed tag actually points at this commit ───────────
#    Cheap insurance: if the tag ever drifts, fail loudly here rather than
#    let CI build a release from the wrong commit.

LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_TAG_COMMIT=$(git ls-remote origin "refs/tags/v$NEW_VERSION^{}" | awk '{print $1}')
if [ "$REMOTE_TAG_COMMIT" != "$LOCAL_COMMIT" ]; then
  echo ""
  echo "❌ Release tag v$NEW_VERSION points at ${REMOTE_TAG_COMMIT:-<missing>}, expected $LOCAL_COMMIT."
  echo "   CI would build the wrong commit. Fix with:"
  echo "   git tag -f -a v$NEW_VERSION -m 'Release v$NEW_VERSION' $LOCAL_COMMIT"
  echo "   git push --force origin v$NEW_VERSION"
  exit 1
fi
echo "✅ Release tag v$NEW_VERSION verified at $LOCAL_COMMIT"
echo ""
echo "✅  Tag v$NEW_VERSION pushed — GitHub Actions is now building the installer."
echo "    Watch it: https://github.com/$(git remote get-url origin | sed -E 's#.*github\.com[:/]##; s#\.git$##')/actions"
echo "    Release appears at: https://github.com/$(git remote get-url origin | sed -E 's#.*github\.com[:/]##; s#\.git$##')/releases/tag/v$NEW_VERSION"
echo ""
echo "Typical build is ~6-10 min. Once published, installed users auto-update."
