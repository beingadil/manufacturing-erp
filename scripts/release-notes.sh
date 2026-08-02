#!/usr/bin/env bash
# ============================================================
#  Manufacturing ERP — Release Notes Generator (library)
# ============================================================
# Sourced by scripts/publish-release.sh. Provides:
#   build_release_body <previous_tag> <new_version> <release_date> <out_file>
#
# Builds a Markdown changelog from `git log` since the previous release
# tag, grouped by conventional-commit prefixes (feat / fix / perf /
# refactor / docs / ci / chore), with a full commit list at the bottom.

# build_release_body <prev_tag> <new_version> <release_date> <out_file>
#   prev_tag     — previous release tag (e.g. v1.0.4); empty = full history
#   new_version  — e.g. 1.0.5 (used in the title)
#   release_date — e.g. 2026-08-01
#   out_file     — path to write the Markdown body to
build_release_body() {
  local prev_tag="$1" new_version="$2" release_date="$3" out_file="$4"
  local log_range="" line subject
  [ -n "$prev_tag" ] && log_range="$prev_tag..HEAD"

  local feat="" fix="" perf="" refactor="" docs="" ci="" chore="" other="" commits=""

  while IFS= read -r line; do
    [ -z "$line" ] && continue
    # Skip the version-bump commit itself — it is not release content.
    case "$line" in
      "chore: bump version"*) continue ;;
    esac

    subject="${line#*: }"
    commits+="* $line"$'\n'
    case "$line" in
      feat:*|feat\(*) feat+="- $subject"$'\n' ;;
      fix:*|fix\(*) fix+="- $subject"$'\n' ;;
      perf:*|perf\(*) perf+="- $subject"$'\n' ;;
      refactor:*|refactor\(*) refactor+="- $subject"$'\n' ;;
      docs:*|docs\(*) docs+="- $subject"$'\n' ;;
      ci:*|ci\(*) ci+="- $subject"$'\n' ;;
      chore:*|chore\(*) chore+="- $subject"$'\n' ;;
      *) other+="- $line"$'\n' ;;
    esac
  done <<< "$(git log --no-merges --format='%s' $log_range 2>/dev/null || true)"

  {
    echo "# Manufacturing ERP v$new_version"
    echo ""
    echo "**Release date:** $release_date"
    echo ""
    if [ -n "$prev_tag" ]; then
      echo "> Changelog generated from commits since **$prev_tag**."
    else
      echo "> Changelog generated from the full project history."
    fi
    echo ""
    if [ -n "$feat" ]; then echo "## 🚀 Features"; echo ""; printf '%s' "$feat"; echo ""; fi
    if [ -n "$fix" ]; then echo "## 🐛 Bug Fixes"; echo ""; printf '%s' "$fix"; echo ""; fi
    if [ -n "$perf" ]; then echo "## ⚡ Performance"; echo ""; printf '%s' "$perf"; echo ""; fi
    if [ -n "$refactor" ]; then echo "## ♻️ Refactoring"; echo ""; printf '%s' "$refactor"; echo ""; fi
    if [ -n "$docs" ]; then echo "## 📚 Documentation"; echo ""; printf '%s' "$docs"; echo ""; fi
    if [ -n "$ci" ]; then echo "## 🔧 CI & Build"; echo ""; printf '%s' "$ci"; echo ""; fi
    if [ -n "$chore" ]; then echo "## 🧹 Chores & Internal"; echo ""; printf '%s' "$chore"; echo ""; fi
    if [ -n "$other" ]; then echo "## 📦 Other"; echo ""; printf '%s' "$other"; echo ""; fi
    if [ -n "$commits" ]; then echo "## 📜 Full Commit List"; echo ""; printf '%s' "$commits"; fi
    echo ""
    echo "---"
    echo "_Generated automatically by scripts/publish-release.sh._"
  } > "$out_file"
}
