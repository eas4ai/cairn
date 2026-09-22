#!/bin/sh
# hooks/session-start.sh: print the current verdict and, in one line, any missing
# command link, PATH entry or durable ref. Writes nothing. Exit 0.
cat >/dev/null 2>&1 || true
here=$(cd "$(dirname "$0")/.." && pwd)
link="${HOME:-/nonexistent}/.local/bin/cairn"
missing=""
if command -v cairn >/dev/null 2>&1; then run="cairn"
elif [ -x "$link" ]; then run="$link"; missing="$missing PATH entry ~/.local/bin"
else run="node $here/bin/cairn.mjs"; missing="$missing command link ~/.local/bin/cairn"
fi
# Prefer this plugin's own copy when the command found runs a different version: a marketplace
# update leaves an older ~/.local/bin/cairn link in place, and a session would run the old kernel.
want=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$here/package.json" | head -n 1)
have=$($run --version 2>/dev/null | head -n 1)
if [ -n "$want" ] && [ "$have" != "$want" ]; then
  printf 'cairn: the cairn command found runs %s, this plugin is %s; using the plugin copy. Fix the link: ln -sfn %s/bin/cairn.mjs ~/.local/bin/cairn\n' "${have:-an older version}" "$want" "$here"
  run="node $here/bin/cairn.mjs"
fi
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  for ref in refs/cairn/log refs/cairn/snapshots; do
    git rev-parse -q --verify "$ref" >/dev/null 2>&1 || missing="$missing durable ref $ref"
  done
fi
[ -n "$missing" ] && printf 'cairn: missing%s\n' "$missing"
out=$($run wake 2>&1); code=$?
printf '%s\n' "$out"
[ "$code" -eq 0 ] || [ "$code" -eq 3 ] || printf 'cairn: wake exited %s\n' "$code"
exit 0
