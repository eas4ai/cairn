# A git that fails to spawn is read as a git that said no

Surfaced from: unstated
Promoted to: a-git-that-cannot-start-is-a-refusal-never-a-verdict (2026-09-17, by promote-a-git-that-cannot-start-is-a-refusal-never-a-verdict)
Outside because: an observation of the test suite under load during the kernel review commitments of 2026-09-17, outside every falsifier of the current commitment; the developer directed that review findings enter the backlog
Captured: 2026-09-17T12:48:10.997Z

The kernel's git() helper returns spawnSync's result, and of its 29 call sites about 26 read .status or .stdout without looking at .error. A spawn failure (EAGAIN under load, ENOMEM, a missing git) leaves status null, error set and stdout empty: a caller that reads .status treats it as git having answered no, and one that reads .stdout directly crashes with a stack trace instead of a one-line refusal. Corrected on 2026-09-17 after counting the callers; the first draft said nearly every caller reads only .status. On 2026-09-17 three test runs each failed once in a different test, each on a kernel command's exit status, on a machine running other heavy sessions; each passed on every rerun. The kernel review of 2026-09-17 counted the callers; a spawn failure should be its own one-line refusal naming the cause, never a verdict, so a flake is diagnosable from the output rather than by rerunning.
