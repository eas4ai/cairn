# A git that fails to spawn is read as a git that said no

Surfaced from: unstated
Outside because: an observation of the test suite under load during the kernel review commitments of 2026-09-17, outside every falsifier of the current commitment; the developer directed that review findings enter the backlog
Captured: 2026-09-17T12:48:10.997Z

The kernel's git() helper returns spawnSync's result and nearly every caller reads only .status: a spawn failure (EAGAIN under load, ENOMEM, a missing git) leaves status null and error set, which most callers treat as git having answered no. On 2026-09-17 three test runs each failed once in a different test, each on a kernel command's exit status, on a machine running other heavy sessions; each passed on every rerun. The kernel review of 2026-09-17 counted the callers; a spawn failure should be its own one-line refusal naming the cause, never a verdict, so a flake is diagnosable from the output rather than by rerunning.
