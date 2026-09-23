#!/bin/sh
# hooks/stop.sh: the fallback wake line at stop for a harness without a per-turn hook. Writes nothing; never refuses. Exit 0.
cat >/dev/null 2>&1 || true
here=$(cd "$(dirname "$0")/.." && pwd)
link="${HOME:-/nonexistent}/.local/bin/sudus"
if command -v sudus >/dev/null 2>&1; then run="sudus"
elif [ -x "$link" ]; then run="$link"
else run="node $here/bin/sudus.mjs"; fi
# The command found runs when it is this plugin's version or newer: the shim bin/sudus.sh runs
# the newest installed Sudus, which a session started before a plugin update sees as newer than
# this hook's own copy, and that is fine. Only an older command, or one that cannot say its
# version, is stranded (a symlink into a versioned plugin cache after a marketplace update):
# then this plugin's copy runs and one line says how to install the shim. Writes nothing.
want=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$here/package.json" | head -n 1)
have=$($run --version 2>/dev/null | head -n 1)
older() { awk -v a="$1" -v b="$2" 'BEGIN{split(a,x,".");split(b,y,".");for(i=1;i<=3;i++){p=x[i]+0;q=y[i]+0;if(p<q)exit 0;if(p>q)exit 1}exit 1}'; }
if [ -n "$want" ] && older "$have" "$want"; then
  printf 'sudus: the sudus command found runs %s, this plugin is %s; using the plugin copy. Install the shim so this never recurs: cp %s/bin/sudus.sh ~/.local/bin/sudus && chmod +x ~/.local/bin/sudus\n' "${have:-an older version}" "$want" "$here"
  run="node $here/bin/sudus.mjs"
fi
out=$($run wake 2>&1); code=$?
printf '%s\n' "$out"
[ "$code" -eq 0 ] || [ "$code" -eq 3 ] || printf 'sudus: wake exited %s\n' "$code"
exit 0
