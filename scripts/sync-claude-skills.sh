#!/usr/bin/env bash
# Legacy convenience wrapper — prefer:
#   npm run just-do-it -- list --target claude-code
#   npm run just-do-it -- install <skillId> --target claude-code
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f package.json ]] && command -v npm >/dev/null 2>&1; then
  for skill_dir in skills/*; do
    [[ -d "$skill_dir" && -f "$skill_dir/SKILL.md" ]] || continue
    name="$(basename "$skill_dir")"
    # Phase 4 CLI: preview/refuse overwrite, import gate, managed state
    npm run just-do-it -- install "$name" --target claude-code "$@" || {
      echo "WARN: install failed or refused for $name (see JSON above)"
    }
  done
  echo "Done. Prefer explicit: npm run just-do-it -- list --target claude-code"
  exit 0
fi

# Fallback without Node tooling
SOURCE="$ROOT/skills"
TARGET="${HOME}/.claude/skills"
mkdir -p "$TARGET"

for skill_dir in "$SOURCE"/*; do
  [[ -d "$skill_dir" && -f "$skill_dir/SKILL.md" ]] || continue
  name="$(basename "$skill_dir")"
  dest="$TARGET/$name"
  if [[ -e "$dest" ]]; then
    echo "SKIP existing skill: $dest (review/merge manually; refusing to overwrite)"
    continue
  fi
  cp -R "$skill_dir" "$dest"
  echo "Installed $name -> $dest"
done
echo "Done. Review installed skills and reload Claude Code if needed."
