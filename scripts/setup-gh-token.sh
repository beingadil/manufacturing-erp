#!/usr/bin/env bash
# ============================================================
#  Manufacturing ERP — Store a workflow-scoped GitHub PAT in
#  Git Credential Manager (ONE COMMAND)
# ============================================================
# Usage:
#   bash scripts/setup-gh-token.sh                 # prompt for the token (hidden input)
#   bash scripts/setup-gh-token.sh <token>          # inline
#   bash scripts/setup-gh-token.sh /path/file.txt   # from a file
#   GH_TOKEN=<token> bash scripts/setup-gh-token.sh # from environment
#
# What it does:
#   1. Resolves the token (env / inline / file)
#   2. VALIDATES it against the GitHub API — refuses to store a
#      token that lacks 'repo' + 'workflow' scopes (a token without
#      'workflow' scope cannot push .github/workflows changes, which
#      is exactly the failure that blocked v1.0.19)
#   3. Stores it in Git Credential Manager (username=x-access-token,
#      the key git already uses for this repo)
#   4. Verifies the stored credential round-trips
#   5. Prints next-step instructions
#
# After this runs once, every future release is fully unattended:
#   bash scripts/publish-release.sh patch
# (publish-release.sh now falls back to the stored credential when
#  GH_TOKEN / GITHUB_TOKEN are not set in the environment.)
# ============================================================

set -euo pipefail
cd "$(dirname "$0")/.."

# ── 1. Resolve the token ──────────────────────────────────────────

TOKEN=""
if [ -n "${GH_TOKEN:-}" ]; then
  TOKEN="$GH_TOKEN"
elif [ -n "${GITHUB_TOKEN:-}" ]; then
  TOKEN="$GITHUB_TOKEN"
elif [ -n "${1:-}" ]; then
  if [ -f "$1" ]; then
    TOKEN=$(tr -d '[:space:]' < "$1")
  else
    TOKEN="$1"
  fi
fi

if [ -z "$TOKEN" ]; then
  # Interactive mode: prompt for the token with hidden input so it
  # never lands in shell history or a file on disk.
  read -r -p "Paste your GitHub PAT (input hidden): " -s TOKEN
  echo ""
  if [ -z "$TOKEN" ]; then
    echo "❌  No token entered."
    exit 1
  fi
fi

if [ "${#TOKEN}" -lt 20 ]; then
  echo "❌  Token looks too short (${#TOKEN} chars) to be a GitHub PAT — aborting."
  exit 1
fi

echo "🔑  Token resolved (${#TOKEN} chars). Validating scopes against GitHub..."

# ── 2. Validate scopes ─────────────────────────────────────────────
#    GET /user returns an X-OAuth-Scopes header listing the classic
#    PAT's scopes. Require 'repo' (full repo access) and 'workflow'.

HEADERS=$(curl -s --connect-timeout 10 --max-time 25 -D - -o /dev/null \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/user" || true)

HTTP_CODE=$(echo "$HEADERS" | sed -n 's/^HTTP\/[0-9.]* \([0-9]*\).*/\1/p' | tail -1)
SCOPES=$(echo "$HEADERS" | grep -i '^x-oauth-scopes:' | sed 's/^[^:]*: *//' | tr -d '\r' | sed 's/ *$//')

if [ -z "$HTTP_CODE" ] || [ "$HTTP_CODE" != "200" ]; then
  echo "❌  GitHub rejected the token (HTTP ${HTTP_CODE:-no response})."
  echo "   Check the token is valid and not expired."
  exit 1
fi

echo "    Authenticated as: $(echo "$HEADERS" | grep -i '^x-oauth-scopes' >/dev/null && echo 'classic PAT')"
echo "    Scopes: ${SCOPES:-<none>}"

if ! echo "$SCOPES" | grep -qiE '(^|,)[[:space:]]*repo([, ]|$|,)'; then
  echo "❌  Token is missing the 'repo' scope — it cannot push code."
  exit 1
fi

if ! echo "$SCOPES" | grep -qiE '(^|,)[[:space:]]*workflow([, ]|$|,)'; then
  echo "❌  Token is missing the 'workflow' scope."
  echo "   Without it, GitHub refuses any push that changes .github/workflows/"
  echo "   — the exact failure that blocked the v1.0.19 push."
  echo "   Generate a token with BOTH 'repo' and 'workflow' scopes:"
  echo "   https://github.com/settings/tokens"
  exit 1
fi

echo "✅  Scopes OK (repo + workflow present)."

# ── 3. Store in Git Credential Manager ──────────────────────────────
#    Same key git already uses for this repo (username=x-access-token),
#    so this overwrites the old scoped-down token in place.

printf "protocol=https\nhost=github.com\nusername=x-access-token\npassword=%s\n\n" "$TOKEN" \
  | git credential approve

echo "✅  Stored in Git Credential Manager (git:https://github.com)."

# ── 4. Verify round-trip ────────────────────────────────────────────

STORED=$(printf "protocol=https\nhost=github.com\n\n" \
  | git credential fill 2>/dev/null | sed -n 's/^password=//p')

if [ -n "$STORED" ] && [ "$STORED" = "$TOKEN" ]; then
  echo "✅  Verified: credential manager returns the new token."
else
  echo "⚠️   Round-trip check could not confirm the stored value —"
  echo "    re-run 'git credential fill' to inspect."
fi

# ── 5. Next steps ──────────────────────────────────────────────────

echo ""
echo "✔  Done. Future releases are now fully unattended:"
echo "      bash scripts/publish-release.sh patch"
echo "   (publish-release.sh falls back to this stored credential when"
echo "    GH_TOKEN is not set — no manual token needed.)"
echo ""
echo "   If the v1.0.19 push is still pending, complete it with:"
echo "      git push origin master"
echo "      git push --force origin v1.0.19"
