#!/bin/sh
# hooks/turn.sh: run wake before a turn and print what it printed. Writes nothing. Exit 0.
cat >/dev/null 2>&1 || true
here=$(cd "$(dirname "$0")/.." && pwd)
link="${HOME:-/nonexistent}/.local/bin/cairn"
if command -v cairn >/dev/null 2>&1; then run="cairn"
elif [ -x "$link" ]; then run="$link"
else run="node $here/bin/cairn.mjs"; fi
# Prefer this plugin's own copy when the command found runs a different version: a marketplace
# update leaves an older ~/.local/bin/cairn link in place, and a session would run the old kernel.
want=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$here/package.json" | head -n 1)
have=$($run --version 2>/dev/null | head -n 1)
if [ -n "$want" ] && [ "$have" != "$want" ]; then
  printf 'cairn: the cairn command found runs %s, this plugin is %s; using the plugin copy. Install the shim so this never recurs: cp %s/bin/cairn.sh ~/.local/bin/cairn && chmod +x ~/.local/bin/cairn\n' "${have:-an older version}" "$want" "$here"
  run="node $here/bin/cairn.mjs"
fi
out=$($run wake 2>&1); code=$?
printf '%s\n' "$out"
[ "$code" -eq 0 ] || [ "$code" -eq 3 ] || printf 'cairn: wake exited %s\n' "$code"
exit 0
