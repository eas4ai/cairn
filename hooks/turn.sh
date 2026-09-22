#!/bin/sh
# hooks/turn.sh: run wake before a turn and print what it printed. Writes nothing. Exit 0.
cat >/dev/null 2>&1 || true
here=$(cd "$(dirname "$0")/.." && pwd)
link="${HOME:-/nonexistent}/.local/bin/cairn"
if command -v cairn >/dev/null 2>&1; then run="cairn"
elif [ -x "$link" ]; then run="$link"
else run="node $here/bin/cairn.mjs"; fi
# The command found runs when it is this plugin's version or newer: the shim bin/cairn.sh runs
# the newest installed Cairn, which a session started before a plugin update sees as newer than
# this hook's own copy, and that is fine. Only an older command, or one that cannot say its
# version, is stranded (a symlink into a versioned plugin cache after a marketplace update):
# then this plugin's copy runs and one line says how to install the shim. Writes nothing.
want=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$here/package.json" | head -n 1)
have=$($run --version 2>/dev/null | head -n 1)
older() { awk -v a="$1" -v b="$2" 'BEGIN{split(a,x,".");split(b,y,".");for(i=1;i<=3;i++){p=x[i]+0;q=y[i]+0;if(p<q)exit 0;if(p>q)exit 1}exit 1}'; }
if [ -n "$want" ] && older "$have" "$want"; then
  printf 'cairn: the cairn command found runs %s, this plugin is %s; using the plugin copy. Install the shim so this never recurs: cp %s/bin/cairn.sh ~/.local/bin/cairn && chmod +x ~/.local/bin/cairn\n' "${have:-an older version}" "$want" "$here"
  run="node $here/bin/cairn.mjs"
fi
out=$($run wake 2>&1); code=$?
printf '%s\n' "$out"
[ "$code" -eq 0 ] || [ "$code" -eq 3 ] || printf 'cairn: wake exited %s\n' "$code"
exit 0
