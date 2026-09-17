# The hooks hang at a root toplevel, hide a failed spawn, and misname a vanished cwd

Surfaced from: PKG-022
Outside because: found by the kernel review the developer requested on 2026-09-17 after this commitment reached Done; every mechanism of the commitment passes, the case lies outside its falsifiers, and the developer directed that review findings enter the backlog
Captured: 2026-09-17T11:59:29.173Z

Three ways the hooks miss PKG-022's promise of one line on stderr and exit 0. bin/hook.mjs line 29: when the Git toplevel is /, dirname('/') is '/', so the roadmap search never ends and both hooks spin at full CPU. bin/hooks/stop.mjs line 10 and session-start.mjs: the Muse wrappers exit with r.status ?? 0, so a failed spawnSync (status null) prints nothing and exits 0, and a Resolvable stop is silently allowed. bin/hook.mjs line 26: a working directory that no longer exists makes spawnSync fail with ENOENT, reported as 'cannot run git', sending the developer to check PATH instead of the directory. Kernel review 2026-09-17, findings 7, 8 and 10.
