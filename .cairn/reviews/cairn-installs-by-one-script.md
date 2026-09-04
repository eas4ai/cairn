commitment: cairn-installs-by-one-script
commit: 922f53e
examined:
  - the README's two commands from a fresh clone: the script resolves the repository from its own location, so the working directory does not matter
  - the script under set -u with no --skills given: the default is assigned before the array is expanded
  - a link whose target carries a trailing slash, as this machine's Same Page links do: it compares unequal to ours and is reported as another package's, which is right
  - --force against a real directory: refused, tested; --unlink against a stranger's link: kept, tested
  - the linked cairn running through its shebang: bin/cairn.mjs is tracked executable, and the test runs the link, not node
  - the footprint: README.md, scripts/, tests/, and bin/ are declared inputs of node-test or pkg-lint, so the commit is inside it
  - the decision as Consequential: it writes into the developer's home, and the queue entry is committed
  - PKG-006 in the script's defaults and the README: no harness is named; the cross-vendor skill directory is the default
  - PKG-014's falsifier against the README on a machine where the default bin directory is not on the path
findings:
  - open: the README links cairn into $HOME/.local/bin and does not say that directory must be on the path, so following its steps on a machine where it is not leaves cairn off the path, which is the falsifier
