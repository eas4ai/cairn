#!/bin/sh
# sudus command shim. Runs the newest installed Sudus, so a plugin update never strands the
# command: the versioned plugin cache moves, this file does not. Installed by /install-sudus at
# ~/.local/bin/sudus; safe to delete and copy again.
# Order: $SUDUS_ROOT (or $CAIRN_ROOT, the former name) when it holds a bin/sudus.mjs; else the
# newest of the Claude Code, Codex and Muse plugin caches and the checkouts at ~/.local/share/sudus
# and ~/.local/share/cairn, by package.json version.
newer() { awk -v a="$1" -v b="$2" 'BEGIN{split(a,x,".");split(b,y,".");for(i=1;i<=3;i++){p=x[i]+0;q=y[i]+0;if(p>q)exit 0;if(p<q)exit 1}exit 1}'; }
ver() { sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$1/package.json" 2>/dev/null | head -n 1; }
# A pin ($SUDUS_ROOT, or $CAIRN_ROOT) that is not an absolute path makes the file that runs depend
# on the caller's current directory, so it is refused here rather than used as given.
pinvar=""; pin=""
if [ -n "$SUDUS_ROOT" ]; then pinvar="SUDUS_ROOT"; pin="$SUDUS_ROOT"
elif [ -n "$CAIRN_ROOT" ]; then pinvar="CAIRN_ROOT"; pin="$CAIRN_ROOT"
fi
case "$pin" in
  "") root="" ;;
  /*) root="$pin" ;;
  *) printf 'sudus: %s=%s is not an absolute path\n' "$pinvar" "$pin" >&2; exit 1 ;;
esac
[ -n "$root" ] && [ -f "$root/bin/sudus.mjs" ] || root=""
if [ -z "$root" ]; then
  best=""
  for d in "$HOME"/.claude/plugins/cache/*/sudus/*/ "$HOME"/.claude/plugins/cache/*/cairn/*/ "${CODEX_HOME:-$HOME/.codex}"/plugins/cache/*/sudus/*/ "${CODEX_HOME:-$HOME/.codex}"/plugins/cache/*/cairn/*/ "$HOME"/.local/share/muse/plugins/cache/*/sudus/*/package/ "$HOME"/.local/share/muse/plugins/cache/*/cairn/*/package/ "$HOME/.local/share/sudus/" "$HOME/.local/share/cairn/"; do
    [ -f "$d/bin/sudus.mjs" ] || continue
    v=$(ver "$d")
    if [ -z "$root" ] || newer "$v" "$best"; then root="$d"; best="$v"; fi
  done
fi
[ -n "$root" ] || { printf 'sudus: no installed Sudus found; run /install-sudus\n' >&2; exit 127; }
exec node "$root/bin/sudus.mjs" "$@"
