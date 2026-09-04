#!/usr/bin/env bash
# Link Cairn onto the path and its skills into skill directories, so a
# git pull keeps every install current. Re-run after adding a skill.
#
#   scripts/link.sh [--bin DIR] [--skills DIR]... [--force] [--unlink]
#
# Defaults: --bin $HOME/.local/bin, --skills $HOME/.agents/skills. A link
# that exists and points outside this repository is reported and kept;
# --force replaces it, and only a link, never a real directory. --unlink
# removes the links this script made and nothing else.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
bin="$HOME/.local/bin"; skills=(); force=0; unlink=0; status=0
while [ $# -gt 0 ]; do
  case "$1" in
    --bin) bin="$2"; shift 2 ;;
    --skills) skills+=("$2"); shift 2 ;;
    --force) force=1; shift ;;
    --unlink) unlink=1; shift ;;
    *) echo "link.sh: unknown argument $1" >&2; exit 2 ;;
  esac
done
[ "${#skills[@]}" -gt 0 ] || skills=("$HOME/.agents/skills")

# place <link> <target>: make, keep, or remove one link.
place() {
  local link="$1" target="$2"
  if [ -L "$link" ] && [ "$(readlink "$link")" = "$target" ]; then
    if [ "$unlink" = 1 ]; then rm "$link"; echo "removed $link"; else echo "kept $link"; fi
    return
  fi
  [ "$unlink" = 1 ] && return
  if [ -L "$link" ]; then
    if [ "$force" != 1 ]; then echo "kept $link -> $(readlink "$link"); pass --force to replace it" >&2; status=1; return; fi
  elif [ -e "$link" ]; then
    echo "kept $link: not a link; remove it yourself" >&2; status=1; return
  fi
  mkdir -p "$(dirname "$link")"
  ln -sfn "$target" "$link"
  echo "linked $link -> $target"
}

place "$bin/cairn" "$repo/bin/cairn.mjs"
for dir in "${skills[@]}"; do
  for skill in "$repo"/skills/*/; do
    place "$dir/$(basename "$skill")" "${skill%/}"
  done
done
exit "$status"
