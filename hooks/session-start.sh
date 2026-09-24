#!/bin/sh
# hooks/session-start.sh: print the current verdict and, in one line, any missing
# command link, PATH entry or durable ref. Writes nothing. Exit 0.
cat >/dev/null 2>&1 || true
here=$(cd "$(dirname "$0")/.." && pwd)
link="${HOME:-/nonexistent}/.local/bin/sudus"
missing=""
if command -v sudus >/dev/null 2>&1; then run="sudus"
elif [ -x "$link" ]; then run="$link"; missing="$missing PATH entry ~/.local/bin"
else run="node $here/bin/sudus.mjs"; missing="$missing command link ~/.local/bin/sudus"
fi
# The command found runs when it is this plugin's version or newer: the shim bin/sudus.sh runs
# the newest installed Sudus, which a session started before a plugin update sees as newer than
# this hook's own copy, and that is fine. Only an older command, or one that cannot say its
# version, is stranded (a symlink into a versioned plugin cache after a marketplace update):
# then this plugin's copy runs and one line says how to install the shim. Writes nothing.
want=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$here/package.json" | head -n 1)
have=$($run --version 2>/dev/null | head -n 1)
older() { awk -v a="$1" -v b="$2" 'BEGIN{split(a,x,".");split(b,y,".");for(i=1;i<=3;i++){p=x[i]+0;q=y[i]+0;if(p<q)exit 0;if(p>q)exit 1}exit 1}'; }
if [ -n "$want" ] && older "$have" "$want"; then
  # The shim runs $SUDUS_ROOT, else $CAIRN_ROOT, first when it holds a bin/sudus.mjs. When that pin
  # is the version found, it is the cause, and copying the shim again changes nothing (issue #9).
  pin=SUDUS_ROOT; pinned=${SUDUS_ROOT:-}; [ -n "$pinned" ] || { pin=CAIRN_ROOT; pinned=${CAIRN_ROOT:-}; }
  if [ -n "$pinned" ] && [ -f "$pinned/bin/sudus.mjs" ] && [ "$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$pinned/package.json" 2>/dev/null | head -n 1)" = "$have" ]; then
    printf 'sudus: %s=%s pins Sudus %s, this plugin is %s; using the plugin copy. The sudus command runs %s first: unset it so it runs the newest installed Sudus, or point it at %s.\n' "$pin" "$pinned" "$have" "$want" "$pin" "$here"
  else
    printf 'sudus: the sudus command found runs %s, this plugin is %s; using the plugin copy. Install the shim so this never recurs: cp %s/bin/sudus.sh ~/.local/bin/sudus && chmod +x ~/.local/bin/sudus\n' "${have:-an older version}" "$want" "$here"
  fi
  run="node $here/bin/sudus.mjs"
fi
# A project still on the former layout (refs/cairn/*, before 3.0.0) is not missing anything: wake
# runs on it unchanged and prints the one line that names `sudus migrate`.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && ! git rev-parse -q --verify refs/cairn/log >/dev/null 2>&1; then
  for ref in refs/sudus/log refs/sudus/snapshots; do
    git rev-parse -q --verify "$ref" >/dev/null 2>&1 || missing="$missing durable ref $ref"
  done
fi
[ -n "$missing" ] && printf 'sudus: missing%s\n' "$missing"
out=$($run wake 2>&1); code=$?
printf '%s\n' "$out"
[ "$code" -eq 0 ] || [ "$code" -eq 3 ] || printf 'sudus: wake exited %s\n' "$code"
exit 0
