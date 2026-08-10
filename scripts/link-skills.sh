#!/usr/bin/env bash
# Symlink Same Page skills into local harness skill directories so a git
# pull keeps installs current. Re-run after adding or renaming a skill.
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
for target in "$HOME/.claude/skills" "$HOME/.agents/skills"; do
  mkdir -p "$target"
  for skill in "$repo_dir"/skills/*/; do
    name="$(basename "$skill")"
    ln -sfn "$skill" "$target/$name"
    echo "linked $target/$name -> $skill"
  done
done
