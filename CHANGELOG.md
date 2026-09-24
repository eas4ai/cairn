# Changelog

Every release is one tagged commit; the tag is v<version>, and
scripts/release.mjs cuts it, as docs/releasing.md describes. Versions
follow semantic versioning: a patch changes no verdict, record shape,
or document meaning; a minor adds or revises requirements, verdicts, or
record shapes and still reads earlier records; a major changes what
earlier records mean.

## 3.5.4 - 2026-09-24

- `sudus accept` no longer fails after recording when the second rejection of a finding has a reason that spans lines. It exited 1 with "draft field because must be one non-empty line", with the acceptance appended and no escalation for the finding. The escalation now quotes each reason on one line; the acceptance keeps the reason as written. The escalations an acceptance writes are drafted and checked before the acceptance is appended, so `accept` cannot stop between the two (issue #21).

## 3.5.3 - 2026-09-24

- The escalation `sudus accept` writes for a finding rejected twice now recommends the one ruling your `ok` makes: the finding is closed as answered, and Done no longer waits on a fix for it. It used to offer "the finding stands and the fix changes approach" as well, but `ok` closed the finding either way, and `sudus resolve` then refused the new fix with "no unresolved finding". Its `instead` line now says the finding stays open for a fix in the direction you give (issue #20).
- After an `instead` answer on an escalation about a finding, wake names the finding's next resolution. It used to leave out any finding an escalation had ever concerned, so it named an acceptance with nothing to judge, which spent an acceptance round.
- `sudus resolve` on a finding your `ok` closed names that escalation, instead of "no unresolved finding".

## 3.5.2 - 2026-09-24

- An untracked nested git repository or worktree, such as the ones Claude Code's agent tool creates under `.claude/worktrees/`, no longer makes every command fail with "git hash-object exited 128". It is left out of the workspace (issue #19).
- A project with a tracked submodule can run Sudus. The submodule is recorded as git records it: a gitlink at its checked-out commit. Committing inside the submodule shows as a change to it. A brief still refuses a projection that holds a gitlink, as before.

## 3.5.1 - 2026-09-24

- The escalation `sudus accept` writes for a finding rejected twice quotes that finding's own two rejection reasons, in order, each naming its acceptance record. It used to quote every rejection in the latest acceptance, which could be other findings', and left out the finding's first rejection (issue #18).
- A later acceptance no longer writes a second escalation for a finding already rejected twice; only the acceptance that rejects it the second time escalates it.

## 3.5.0 - 2026-09-24

- `sudus start` and `sudus promote` no longer commit `.sudus/output/`, the check output and briefs that its own `.gitignore` keeps local, and `sudus push` no longer publishes them. This covers files that are untracked, ignored, or already tracked by an earlier version. Files an earlier version committed stay in history; `git rm -r --cached .sudus/output` and a commit stop tracking them (issue #11).
- `sudus measure` refuses a draft whose `--recommendation` does not repeat one `--option` word for word, or that has no `--option`, before writing any record, and names the options. Such a draft used to floor as `incomplete-projection` and cost you an answer. When a concern names nothing in the commitment or a cited decision is missing, the floor's printed reason now names it (issue #12).
- The adversary brief ends with a Report section: the report's JSON fields, the brief's projection digest, every required (question, target) pair as the report spells it, and the interface paths as JSON strings. The adversary's file goes to `sudus report` unchanged (issue #13).
- The new optional settings key `adversary_rules` is a list of one-line rules the machine sets for the adversary, such as a cap on parallel build jobs. The brief prints them under Host rules, inside the text its record digests. It is the only key a settings file may leave out (issue #13).
- `sudus end` no longer declares a touched path that a declared input already covers, such as `src/new.rs` under `src`. It prints that the input covers it, and the mechanism file does not change. A declared input written with a trailing slash, `src/`, now covers the paths under it (issue #14).
- `sudus show` describes a workspace or input snapshot: its kind, path count, tree and payload. It used to refuse with "unknown record kind snapshot" (issue #15).
- `sudus measure` refuses a directory in `--path` by name before writing any record; it used to call it a special file. The usage lines say `--path <file>` (issue #16).
- An oversize measurement names the limit that broke, both sizes in bytes, the named files' total and the largest named file (issue #17).
- A changed interface file whose name has non-ASCII bytes is an interface obligation again. Git quoted the name, no `interfaces` glob matched it, and the brief and the report dropped it.
- A file whose name holds a newline no longer breaks the workspace snapshot or the lease listing.

## 3.4.1 - 2026-09-24

- The new-project, existing-project and next-feature skills name the working agreement template by a path that exists from each of them: `../new-project/templates/AGENTS.md` from the skill's directory. existing-project and next-feature said to copy `templates/AGENTS.md` "from this skill", which only new-project ships, so an agent had to search for it or write `AGENTS.md` from memory (issue #10).

## 3.4.0 - 2026-09-24

- Setting up a project no longer asks how your decisions are recorded. They are attested by default: your words as the agent quoted them, the harness and your Git author. `sudus init` needs no `--signing-key` or `--attested`; `--signing-key <path>` still sets a key, and `--attested` names the default. The new-project and existing-project skills ask only which remote holds the records, or local-only.
- A signing key is optional, and it lives in the settings file. Put your public key in `signing_key` in `.sudus/settings.json`, and the next `sudus authorize` takes a signature from it. The manual's "Attested or signed" section says how.
- Decisions are checked against the key in force: the key in the settings you last authorized, not the settings file on disk. Before, an agent could set `signing_key` to its own key or to `null`, approve that change itself, and then sign every answer after it. Replacing or removing a key now takes a signature from the key in force. Only records whose evidence verifies count, so a record appended outside Sudus's commands cannot move the key either. A project that has only ever been attested reads nothing extra.
- `sudus authorize` works in a repository with no commits yet, where a new project starts. It failed with "git rev-parse exited 1".
- When `SUDUS_ROOT` or `CAIRN_ROOT` pins an older Sudus than the plugin, the hooks name that variable and say to unset it, instead of telling you to copy the shim again, which changed nothing (issue #9). A pin to a versioned plugin folder keeps running that version after an update.

## 3.3.4 - 2026-09-24

- The verdict band and pane in Claude Code are off until you turn them on. The `view` option now takes `off` (the default), `above-prompt`, `pane` or `both`. `above-prompt` is the band, and replaces `status-line`; a stored `status-line` now reads as off. The README's "The verdict above the prompt in Claude Code" section gives the three steps to turn it on: function hooks in the settings `env` block, `above-prompt` in `/config` (the row "Where the Sudus verdict shows"), and a new session or `/reload-plugins`.

## 3.3.3 - 2026-09-24

- The band above the prompt says where things stand in a word (Working, Your answer needed, Stuck, Done, Setup, Not answering) and what happens next in plain words, such as "independent review of z-index-tests-segfault". It used to repeat wake's reason for the agent, with record hashes and kernel terms. Only a question you owe an answer to gets a line of its own, with hashes cut to 7 characters. The pane keeps wake's reason and predicate.
- The status row that 3.3.1 pinned under the prompt no longer stays on screen after the plugin updates inside a running session.
- The face keeps clear of the band's collapse control, which Claude Code draws over the band's top-right corner.

## 3.3.2 - 2026-09-24

- In Claude Code, the verdict moves from the status row under the prompt to the band above it. Claude Code draws a plugin's status text itself, in bold with a warning prefix, cut to one line, so a long reason could not be read. The band shows the verdict in its colour, what it names, and the reason in full, wrapped rather than cut.
- Sudus's face is its blobatar, floating at the band's right, not an ASCII face. It breathes, glances and blinks the way blobatar does, and wears the verdict's expression: thinking during a turn, idle with work to do, unsure while you owe an answer, mad when no one can answer, sick on a repair, sleepy when `sudus wake` cannot be reached, happy at Done. On a terminal that shows pictures it is a picture. Where Claude Code reports that the terminal draws none, such as inside tmux, it is the same face in braille, which blinks and changes expression too. Blobatar 2.7.0 (MIT) ships in `mod/vendor/blobatar`, so any `face` text is drawn on your machine and nothing is fetched. The `asciiFace` option is gone; `motion: false` keeps the face still.

## 3.3.1 - 2026-09-24

- The developer's answer to an escalation no longer costs an acceptance round. Sudus appends an `answered` line to `docs/decisions.jsonl` for it, and that line moved the workspace off the last acceptance, so wake named `accept` and the adversary ran one more round to examine that line alone. A workspace that differs from an accepted, reviewed or reported snapshot only by `answered`, `read` or `realized` lines is still at it. `build` follows `accept`, so realizing a decision after the last acceptance cost the same extra round.
- The developer's ok or instead answer to the acceptance-round cycle escalation now restarts the count in `sudus accept` as well as in wake. `accept` counted every round after the report, so the first round after an ok that did not reach Done wrote a new cycle escalation.
- A decision made before `sudus migrate` can be realized after it. The realization delta runs from the decision's starting snapshot, which still held `.cairn/`, so `realize` escalated the settings file and every mechanism definition as protected or reserved changes the decision made. The move is no longer the decision's; a moved file changed afterwards is judged as the path it is now. The same move was a scope breach on a definition redeclared after `migrate` and before the next start.

## 3.3.0 - 2026-09-23

Spec revision 10, accepted by the developer on 2026-09-23 after an agent reported what the rules cost on a consumer project.

- While the latest report has an unresolved finding, wake names the next `resolve` instead of `run` for a receipt a fix made stale. The checks run once, after the last finding is resolved and before `accept`, not after every fix. A check that ran and failed is still `implement`, and three failing attempts are still `escalate`; Done still needs a current passing receipt for every requirement.
- A mechanism review binds to what decides what the check detects: its command, working directory and results mode. A redeclare that adds inputs, documents, tool versions or requirements, or a `--touch` input written at `sudus end`, keeps the review bound and only makes receipts stale; a changed command, working directory or results mode unbinds it, and a new requirement needs its own review. Review metadata written before 3.3.0 binds its exact definition as before, and a redeclare that keeps those three carries it over.

## 3.2.2 - 2026-09-23

- The skills and the manual say that a violating example needs no commit: make it in the working tree, run `sudus check`, bind the fail receipt with `sudus review mechanism`, then undo it. The receipt's input snapshot keeps the violating bytes, so the only commit is the bound mechanism file. An agent rebinding reviews after a redeclare had committed each example and its revert, two extra commits per batch.

## 3.2.1 - 2026-09-23

- Wake reads each mechanism's input tree and tool identities once per pass instead of once per stale receipt. It walked every receipt of every requirement and re-ran `git ls-files`, `git hash-object` and every declared tool version probe for each one. On a Rust project with 23 requirements, up to 31 receipts each and `cargo`/`rustc` probes through rustup, one wake started 34,077 processes and took 28 s; it now takes 1.4 s, and a mechanism redeclare went from 59 s to 3.5 s. The verdict is unchanged.

## 3.2.0 - 2026-09-23

- After a supersede, the successor's brief, `sudus report` and wake's report predicate measure changed paths and interface obligations from the first start of the supersession chain (issue #8). The successor carries the superseded commitment's work, all of it committed before its own start, so its brief listed almost nothing under Changed paths and raised no interface obligation for that work: Q4 had nothing to compare and the interfaces got no caller-level attempt. The brief's heading names the commitment it measures from. Spec revision 9, section 9.
- In Claude Code, the plugin can keep the wake verdict on screen: a status line under the prompt (the default), a pane beside the transcript, or both, with a face drawn by blobatar whose expression follows the verdict. It runs `sudus wake` itself after every turn and after every `sudus`, `cairn` or history-changing `git` command, and never asks the model. A repository without `.sudus/settings.json` or `.cairn/settings.json` shows nothing. The view, the face, the ASCII face and the command are plugin options in `~/.claude/settings.json`. It is a hooks module, which Claude Code loads only with function hooks on (early access, `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`); without them, and in Codex and Muse, the shell hooks work as before.

## 3.1.2 - 2026-09-23

- After `sudus migrate`, the first scope preflight between commitments no longer records the migration's own move of the mechanism definitions as breaches (issue #7). The base is the last done snapshot, which still names the former paths, so each moved file read as two breaches: the former path as a deletion, the new path as bytes with no base and no ledger line. A kernel-managed path now resolves its counterpart under the other layout: the moved file is valid when its bytes are what the base or the ledger holds for the former path, and the former path's absence is valid when the counterpart holds those bytes. Thanks to John Lockwood for the report.

## 3.1.1 - 2026-09-23

- The working agreement template no longer tells the agent that better evidence lowers the measure composite. The evidence requirement stands on its own; a sentence describing the score's mechanics steered effort toward the score instead of the evidence (prompt audit, accepted by the developer).

## 3.1.0 - 2026-09-23

- Wake names `supersede SLUG` when the Agreed text of a requirement in the open commitment was revised under it. Receipts and `sudus review mechanism` bind to the text as it reads now, while the start record, the review predicate and the Done rule hold the frozen digest, so wake named `review mechanism` after every review and nothing in the project could satisfy it. The frozen contract is not amended: the reason names both exits, restoring the frozen text or superseding on the developer's ruling to a successor that freezes the revised text. New action row in the spec's section 5 and the manual; the precedence order places it after Waiting and before `fix`.

## 3.0.3 - 2026-09-23

- Between commitments, a defect against a requirement the last commitment never owned can now be discharged (issue #6). Wake's fix predicate read the pass table built for that commitment's requirement set, found nothing for the defect's requirement, and named `fix` after every later passing check. It now looks the pass up for the defect's own requirement. Thanks to John Lockwood for the report.

## 3.0.2 - 2026-09-23

A second adversarial review of the kernel (six read-only reviewers, every predicate against a two-commitment history, every test comment that called a behavior a deviation treated as a defect candidate). Every finding below was reproduced with a script before it was fixed.

- No contract is frozen between commitments, so a fix recorded there measures no protected delta. A defect carried across a supersede could never be fixed: the gap after a supersede is where the spec phase edits Agreed text before the successor start, yet the fix was measured against the superseded start and refused for those edits, and under the successor it was refused as not owned. Section 5's fix row revised in place.
- A new commitment resets the administrative cycle counter. A closed commitment's phase is 3 and the next one's starts at 0, which read as no progress, so counts from the closed commitment carried over and a single ordinary action under the new one wrote a false cycle escalation.
- After the first invocation of a signed-key `sudus init` (settings written, no signature yet), wake named the clone's fetch, which fails against a remote nothing was pushed to, forever. Settings that are written but not committed, with no log, are an unfinished init: wake names `sudus init --adopt <digest>` with the flags to finish it.
- Three sites still used the Sudus-layout ref names on a former-layout project: the after-fetch validation asked the remote for the wrong refs (a stale `.cairn` clone was told to push instead of fetch), the evaluator captured a null log head (every `sudus measure` failed), and a CAS race on the log lost its retry hint.
- `sudus migrate` asks the authority remote first: when another clone already migrated and pushed, it names the fetch of the moved refs instead of renaming this clone's stale ones, which made an old log current and wake called it Done. After a move it installs the new refspecs. Its `.gitignore` rewrite also moves negated lines (`!.cairn/keep`).
- Text: `Cairn 1.x` where the rename had produced `Sudus 1.x`; the walkthrough's init and authorize transcripts showed the terminal prompts revision 6 removed and said the developer runs authorize; the README said the hooks fall back to the plugin copy on another version (only an older one); the manual's install diagram said `--help` prints exit codes.

## 3.0.1 - 2026-09-23

- A fix recorded between commitments is judged against the contract in force when it was recorded (issue #4): the last start before it, or that commitment's done snapshot once it had closed. The newest start was used, so the next commitment's own spec edits revoked an earlier fix and a new fix was refused for the same delta; the defect could never be discharged. A new fix between commitments is judged against the last done snapshot. Section 5's predicate row revised in place.
- After `sudus migrate`, a transaction recorded under the former refs is not drift (issue #5): a store named `refs/cairn/*` resolves through the layout, so wake no longer names a recover that could never succeed. Migrate commits with the repository's hooks bypassed and moves the refs only after the commit; a commit that fails leaves the project unchanged, where a formatting hook used to leave it half moved.

## 3.0.0 - 2026-09-23

- Cairn is renamed Sudus. The old name collided with an autonomous penetration-testing tool and two other agent tools of the same name. The command, package, plugins, marketplace, skills, spec, manual and README carry the new name; the repositories are eas4ai/sudus and eas4ai/sudus-dev, and GitHub redirects the old addresses.
- Nothing a project recorded breaks. The command answers to both names (`bin/cairn.mjs` runs the same kernel), the shim finds a plugin cache under either name and reads `CAIRN_ROOT`, and `CAIRN_SIGNATURE` still supplies a signature. A project initialized before 3.0.0 keeps `.cairn/` and `refs/cairn/*`: every command reads and writes them there, readers accept both record envelopes, a mechanism that prints `cairn: REQ: pass` still passes, and wake adds one line naming the move. The session-start hook does not report the former refs as missing.
- `sudus migrate` moves such a project to `.sudus/` and `refs/sudus/*` once, between commitments: it renames the refs, moves the directory and the matching `.gitignore` lines in one commit, and refuses while a commitment, lease or transaction is open or the directory has uncommitted changes. A clone that pulls the move with its refs still under the former name is told to run it, and it moves the refs alone. Spec revision 7 (section 2, Layouts).
- Both state directories are reserved paths in every project.

## 2.2.2 - 2026-09-23

- No scope breach is observed between commitments (issue #3). The spec phase writes the next commitment's mechanism files, tests and declarations before `cairn start`, and every one of them read as an undeclared change against the finished commitment's base, so the developer was asked to keep files the working agreement had just told the agent to create. The next start's snapshot is the next allowed base; only the kernel-managed ledger is still checked in the gap. A gap breach recorded by an earlier version is closed by the next start, so a project already carrying one is unblocked on upgrade. Spec definition revised in place.

## 2.2.1 - 2026-09-22

- The spec and manual state the Done rule's acceptance exception the kernel always applied: a report with no findings and no change after it needs no acceptance record. Found by the adversarial review; the developer chose documenting the exception over demanding an empty acceptance.

## 2.2.0 - 2026-09-22

From an adversarial review of the kernel by six independent agents; every finding was reproduced with a script before it was fixed, and each fix carries that reproduction as a test.

- `cairn realize` escalates, as the spec says, when the realized delta touches a data, protected or reserved path: one escalation concerning `decision:<id>`, and the developer's ok lets the next `cairn realize` record the realization. It used to refuse forever with nothing written.
- A promoted commitment can reach Done: the promote decision no longer stops on the roadmap line its own start transaction wrote. Every commitment opened by `cairn promote` was stuck at `build <decision>`.
- `cairn check` refuses a fourth distinct failing attempt until an escalation concerns the requirement, as the spec's "requires an escalation first" states; receipts used to pile up without limit while wake said escalate.
- `cairn fix` under an open commitment takes only a defect against that commitment's own requirement; between commitments it takes any defect, since promote refuses while one is unfixed. Wake names `fix` for any unfixed defect once the range is closed, instead of naming a promote that then refuses.
- `cairn promote` refuses when `Current:` names a section that is neither the finished commitment nor the promoted item, instead of overwriting the developer's line.
- Unresolved findings carried by a supersession stay open in the successor until resolved; they used to fall out of scope, and Done was reachable over them.
- Between commitments, a hand-written `Current:` line is not a missing start record: wake no longer prints a `cairn push` repair that recommends itself.
- `cairn done` writes the done record only once wake names `done` (2.1.14) and now also gates the case above.
- Under `developer: absent`, every unanswered escalation exits 4, not only the floor or a veto (spec revised in place).
- `cairn fix`, `cairn outside` and `cairn promote` take the item slug wake prints as well as the sha; `cairn scope` takes the path wake prints; `cairn review mechanism REQ` defaults to the latest fail receipt, which wake's reason now names.
- `cairn begin --touch` refuses a gitignored path: it can never be an input, and touching one counted an untouched file as changed and unbound the mechanism's review.
- Lease refusals name `cairn end` and `cairn end --abandon` instead of a `cairn reconcile` command that does not exist; the manual's reconcile row says the same; the start refusal for a wrong `Current:` names the edit instead of an impossible supersede.
- The item usage line says `--from <REQ or contract>` only for `--next-feature`; the install skill's help gate tests for the command list `cairn --help` actually prints.

## 2.1.14 - 2026-09-22

- `cairn done` refuses until wake names `done`, and its refusal says what wake names instead. It used to write the done record with an unfixed defect against the commitment's own requirement (issue #1: wake then named `fix` on a closed commitment that no command could fix) and with findings unresolved (issue #2: a cycle escalation written before the done record left the finished commitment Waiting).
- `cairn fix` records a defect raised by the last closed commitment against its own requirement, so a project that reached that state on an earlier version has a way out. For any other defect with no open commitment the refusal names the route: open the next commitment, then fix.

## 2.1.13 - 2026-09-22

- The acceptance-round bound counts rounds since the developer's last ok or instead answer to a cycle escalation, as the escalation itself says. It used to count every round after the report, so each answer was followed by a fresh escalation on the next round.
- `cairn show items` lists every item record with its sha, kind, slug, source, body and whether it was promoted or fixed. The next-feature skill already named it.
- The report refusals for a missing model or transport say what goes there: what the adversary actually ran as and over. The brief's `any` accepts either transport but is not itself a report value.

## 2.1.12 - 2026-09-22

- The adversary brief carries the changed paths from the start snapshot to the reviewed snapshot (name-status, never contents), so Q4 is answerable from the projection, which has no history.

## 2.1.11 - 2026-09-22

- A keep is a disposition of the path's content. A kept path whose mode and blob still match the keep's snapshot is not observed again, so fifteen concurrent breaches can be kept one at a time and converge. Before, while any other breach was open, the next command wrote a fresh breach for every kept path.
- A file's mode is 100755 only when its owner execute bit is set, as git reads it. A file at mode 0605 used to show as modified on a clean tree, in the workspace delta, the snapshot and the lease touch.

## 2.1.10 - 2026-09-22

- `cairn wake` no longer contacts the authority remote: the remote's tips are fetched only when a repair has to name a fetch or a push. Every wake, and so every hook turn, made one `git ls-remote` to the remote.
- A tree identity, a snapshot and a lease touch hash their files in one `git hash-object` call instead of one spawn per file. A wake in a project with a thousand declared input files made a thousand spawns per receipt it examined.
- Git is found on PATH once per process and spawned by absolute path. Each spawn used to try every PATH entry in the child first.
- The hooks declare a 90 second timeout.
- A snapshot stores a file whose name begins with a double quote under its own name; the index update used to unquote it.

## 2.1.9 - 2026-09-22

- Every command runs at the repository top level whatever directory it is typed in. `cairn wake` from a subdirectory used to hash declared inputs against that directory and fail on the first one. A `--file` or `--signing-key` path is still read from where it was typed.
- The hooks use the cairn command found when it runs this plugin's version or a newer one. A session started before a plugin update saw the shim's newer Cairn as a mismatch and printed the install advice every turn. Only an older command, or one that cannot say its version, falls back to the plugin copy.
- The `record PATH` reason names an untracked file under a declared input as such and says a build artifact (a Python cache, a build output) is gitignored instead. The working agreement and manual say to lease the action that changes the path; `record` is a verdict, not a `cairn begin` action.

## 2.1.8 - 2026-09-22

- Reading the log costs one `git cat-file --batch` instead of one spawn per record, and a process reads a given log head once. A project with 1500 records took 9 s for `cairn wake` and tens of seconds for a state-changing command; both now take well under a second.
- The refusal for a missing `--quote` says whose words go there: the developer's answer in the conversation, quoted.

## 2.1.7 - 2026-09-22

- The working agreement's Waiting line no longer reads as "stop and let the developer run cairn answer". The prompt is the escalation in prose: the problem, then `ok` (the recommendation), `instead` (what it costs if wrong, and the alternative), `ask` (to discuss), ending with `ok | instead | ask`; the agent records the developer's words with `cairn answer`. Agents were handing the command back to the developer. The README, manual and work-loop diagram say the same.

## 2.1.6 - 2026-09-22

- `cairn <command> --help` (or `-h`) prints that command's usage line and runs nothing. Before, the first argument was passed to the command, so `cairn push --help` pushed.

## 2.1.5 - 2026-09-22

- `cairn end` handles a `--touch` path that is a directory: the outcome compares the listing of files below it, before and after, instead of failing to hash the directory and leaving the touch unwritten.
- The working agreement tells the agent to run tools that rewrite `AGENTS.md` (GitNexus keeps a block there) with their skip option while a commitment is open, or to restore the file; such a rewrite is a scope breach on a protected path, not a Cairn defect.
- The command at `~/.local/bin/cairn` is a shim, `bin/cairn.sh`, that runs the newest installed Cairn at run time: `$CAIRN_ROOT` when set, else the newest Claude Code or Codex plugin cache entry or the checkout at `~/.local/share/cairn`, by version. A symlink into a versioned plugin cache was stranded by every marketplace update. `/install-cairn` installs the shim, replacing only a symlink an earlier Cairn made or an older shim; the hooks print the one command that installs it when they find a stale `cairn`, and still write nothing.

## 2.1.4 - 2026-09-22

- While a scope breach's own escalation is unanswered, wake says Waiting and prints it, instead of naming `scope PATH`. Scope outranks Waiting so that an unrelated escalation cannot hide captured work, but when the open escalation is about that breach the developer's answer is the next step; naming scope read as "act now" and produced a second escalation.

## 2.1.3 - 2026-09-22

- A refused kernel write no longer escalates on its own. It names the violation it would create and its cause, tells the agent to resolve that and run the command again, and counts as one administrative occurrence toward the cycle bounds; the fourth refusal of the same write, or the twenty-eighth administrative transition, writes the one cycle escalation, which now says what was refused and why. Before, every refusal wrote a "the loop is cycling" escalation and cost the developer an answer (spec section 5, "Waiting and liveness", revised on the developer's ruling).
- The liveness guard skips Waiting when it looks for the first violation a kernel write would create. An open cycle escalation used to outrank and hide a record violation, so the same refused declare went through once the escalation existed.
- Wake names `commit docs/decisions.jsonl` whenever the decisions file has uncommitted lines, including under a gitignored `docs/`; the kernel appends it and never committed it, and nothing said so.
- A fail receipt in which another requirement of the same commitment also failed is not an attempt: a requirement whose gate includes its siblings' falsifiers no longer burns three attempts and an escalation while they are being fixed (spec section 5, "Deferral and attempts").
- The hooks print the exact `ln -sfn` command that fixes a stale `~/.local/bin/cairn` link.
- The working agreement says that `docs/decisions.jsonl` is appended but not committed by the kernel, so the agent commits it with its next commit, and that a path must be committed or leased before a declaration covers it.

## 2.1.2 - 2026-09-22

- The existing-project skill migrates a Cairn 1.x project: on the developer's ok it removes the 1.x record directories (Git history keeps them), converts the specification in place until `cairn lint docs/spec` is clean without changing a requirement's words, keeps each 1.x mechanism's command for the declare step, and after `cairn init` files one item record per 1.x item. Spec section 3, the diagram and the manual say the same.

## 2.1.1 - 2026-09-22

Fixes from the first project run on 2.1.0; no record shape change.

- `cairn start` and `cairn authorize` work when `docs/` is gitignored: the branch write lists ignored paths and force-adds them. Before, the commit failed with "pathspec did not match" and the transaction needed `cairn recover`.
- The hooks compare the `cairn` they find with the plugin's own version and use the plugin's copy on a mismatch, printing one line that says so. A marketplace update used to leave the old `~/.local/bin/cairn` link running the old kernel.
- Wake prints full record SHAs in its reasons, since every command that takes one refuses a prefix.
- Attempts are counted from the open commitment's start record. The fail receipts that bind mechanisms during the spec phase no longer count, so a requirement no longer escalates on its first real attempt (spec section 5, "Deferral and attempts", revised).
- `cairn check` says why a per-requirement result is unverified: the exact line it expected and the output lines that name the requirement.
- The liveness refusal on a kernel write names the violation it would create, not only its class.
- `cairn --version` prints the version.
- `cairn scope <breach-sha> keep` now accepts the escalation `cairn escalate` writes. It looked for a concern spelled `scope-breach:<sha>`, which the concern parser refuses, while the parser and the command store `breach:<sha>`; no keep written through the command line could ever succeed. The refusal names the `breach:<sha>` token, and the manual shows the flag. Found by a project running 2.1.0 (reported 2026-09-22).

## 2.1.0 - 2026-09-21

The developer is never asked to run a command.

- The agent asks in conversation and records the answer. Escalations, decision reads and authorizations are answered in the developer's own words; the agent quotes them: `cairn answer <slug> ok|instead|ask --quote "<words>"`, `cairn decisions --read <id> --quote "<words>"`, `cairn authorize --quote "<words>"`. No choice widget: a sentence and a wait is the prompt.
- Attested evidence replaces the terminal confirmation. With `signing_key: null`, a developer-only record holds the quoted words, the harness name (`claude_code`, `codex`, `muse` or `none`) and the Git author; Cairn says "evidence, not authentication" wherever it reports it. The kernel never opens a terminal. Records written by 2.0.x with `unsigned-local` evidence still read.
- `cairn authorize instead|ask --quote "<words>"` writes a `direction` record, a new kind that keeps the developer's change request or question in the log and binds nothing.
- `cairn init` takes its former questions as flags: `--remote <name>` or `--local-only`, `--signing-key <path>` or `--attested`, `--adopt <digest>` for settings that exist without refs, and `--quote`. It refuses, naming the flag, when an answer is missing.
- Spec revision 6, the working-agreement template, the three skills, the manual, the README and the diagrams say the same thing.

## 2.0.2 - 2026-09-20

Documentation; no kernel change.

- README: a full section on the evaluator under "What Cairn does": the five dimensions, the two sources, jev set up in three steps, what the agent sees, what can go wrong and who decides.
- Manual: a Settings reference listing every key in `.cairn/settings.json` with its default and meaning, and "Turn on the TypeSafe evaluator".
- Mermaid versions of the six process diagrams in the manual, and the work loop in the README, rendered by GitHub; the Graphviz sources stay under docs/diagrams.
- The work-loop diagram shows the measure step at a Consequential decision, the floor-or-veto branch, the agent's own decide, and exit 4 when the developer is absent; the old routing sentence is gone.
- The kernel spec carries a Prefix header and a spec map, so `cairn lint docs/spec` is clean on this repository.

## 2.0.1 - 2026-09-20

Documentation and install fixes; no kernel change.

- Codex: ship `.agents/plugins/marketplace.json`, the manifest Codex reads a marketplace from, so `codex plugin marketplace add eas4ai/cairn` and `codex plugin add cairn@cairn` work as the README says (proven against the public repository with Codex 0.155.1).
- Muse: the install text follows the official Muse Code docs: `muse plugins install <checkout>`, per-hook approval with `muse plugins approve cairn:hook:session-start` and `cairn:hook:stop`, `muse plugins update cairn` to refresh; no experimental flag.
- Skills CLI: `--agent universal` installs into the project's `.agents/skills/`, which Muse reads; with `--global` it goes to `$HOME/.config/agents/skills`, which Muse does not.
- README: the link to the 1.x video is gone; "Cairn calls no AI model on its own" now names the TypeSafe evaluator as the exception; Claude Code updates with `claude plugin update cairn@cairn`.

## 2.0.0 - 2026-09-20

Cairn 2 is a rewrite of the kernel. It keeps the seven ideas that
matter (agreement by falsifier, one commitment at a time, checked
evidence, freshness, independent review, captured scope, developer
authority over the contract) and replaces almost everything else. A
1.x project is not upgraded in place; see the note at the end of this
entry.

- **The kernel reads and writes Git records, not markdown files.**
  Evidence, reviews, escalations, decisions, and every other durable
  fact are now commits on `refs/cairn/log` and `refs/cairn/snapshots`,
  two refs local Git history never touches. Each record is a canonical
  JSON object in an empty commit's body, with a schema and a digest
  trailer. Nothing under `.cairn/evidence`, `.cairn/reviews`,
  `.cairn/escalations`, `.cairn/backlog`, `.cairn/next-iteration`,
  `.cairn/stops`, `.cairn/queue`, `docs/decisions/`, `docs/commitments/`,
  or `docs/audit` exists any more. Decisions live in one file,
  `docs/decisions.jsonl`, appended one canonical JSON line at a time.
  `cairn show <sha>` prints any record with its references resolved.
- **Hooks only read and print.** The session-start, per-turn, and stop
  hooks print the current verdict and never refuse a stop, count
  refusals, write a file, commit, or call a model. The working
  agreement in `AGENTS.md` is what an agent follows either way; a
  harness without hooks is unaffected.
- **The evaluator is the agent's gut check at a Consequential decision.**
  `cairn measure` scores a draft on five dimensions -- evidence, reach,
  contract fit, new surface, ambiguity -- from `jev`
  (`typesafeai.enabled: true`) or, otherwise, the harness's own review
  model started with none of the agent's context. Code computes a
  composite and an advisory `suggested: agent | developer` from the five
  numbers; the agent decides either way, except at a fixed code floor
  (an Agreed requirement, the working agreement, or unrecoverable data)
  or the measurement's own veto, which always go to the developer. There
  is no shadow mode and no off switch: every Consequential draft is
  measured, because a shadow default that never let a draft reach the
  agent was tried and measured at zero agent routing out of twelve
  expected cases.
- **The action lease is explicit.** `cairn begin <action> <target>`
  claims a declared input before you change it and prints a lease sha;
  `cairn end --lease <sha>` releases it after the commit, so a stale
  end can never close another session's lease. `cairn begin --touch
  <path>` declares a new file for the life of the lease.
- **A project is initialized with `cairn init`,** which did not exist
  in 1.x. It creates or adopts `.cairn/settings.json`, asks you to
  confirm one authority remote or explicit local-only operation, asks
  you to choose a signing key or accept unsigned-local evidence, and
  creates the two durable refs. `cairn authorize` binds the final
  digests of the specification, the working agreement, and settings
  in one record; `cairn start` checks that authorization before it
  opens a commitment.
- **Commands renamed or removed.** `next-iteration` is `next-feature`
  everywhere: the skill, the item kind, and the flag. `reword` is
  gone; attribution is checked once, at release, by
  `scripts/release.mjs`, not by a per-commit kernel command. `explain`
  and the stop record it answered are gone, because the stop hook no
  longer refuses a stop. `cairn --version` and `cairn --root DIR` are
  gone; run commands from the project root. `cairn check` no longer
  takes a `--stale` flag; run `cairn wake` to see which requirement
  needs a check. See `cairn --help` for the exact command and flag
  surface v2 ships.
- **New commands for the record kinds 1.x did not separate.**
  `cairn declare` writes a mechanism definition explicitly.
  `cairn scope <breach-sha> keep|restore` disposes of a scope breach.
  `cairn item --backlog|--next-feature|--defect` replaces 1.x's
  separate `backlog` command and next-iteration file. `cairn decide`,
  `cairn realize`, and `cairn dispute` manage the decision record
  explicitly. `cairn brief`, `cairn report`, `cairn resolve`, and
  `cairn accept` write the review chain one record at a time, in place
  of hand-edited markdown review and report files.
- **Snapshots, not commit SHAs, are the code reference.** A workspace
  or input snapshot is a commit on `refs/cairn/snapshots` whose tree
  is the exact bytes a record refers to; the working branch stays
  rewriteable (rebase, squash, amend) without invalidating any record
  that names one.
- **One adversarial report per commitment, with bounded cumulative
  acceptance,** replaces 1.x's independent-report-per-commit and
  finding-format rules. There is no more `findings:` list grammar to
  get wrong: `cairn report` and `cairn accept` take a file and record
  it.

Upgrading: a 1.x project's records are not read by v2. Migration is a
manual step at a v2 Done, described in the working agreement of the
project doing the migration; it is not part of the kernel.

## 1.x

Every release below shipped as Cairn 1.x, described in the 1.x
documentation. Copied here verbatim for history; 1.x behavior is not
current in this checkout.

### 0.7.0 - 2026-09-18

Five fixes the developer confirmed after asking what made Cairn a
frustration, and a raised kernel ceiling to give them room.

- The kernel ceiling is 2000 lines, raised from 1900 (PKG-004). The
  files under bin/ stood at 1900 on the day it rose, the whole of the old
  ceiling, so no change to the kernel could add a line without removing
  one; the new ceiling leaves room to write the reader plainly.
- The working agreement no longer promises something the loop refuses. A
  heading whose title names findings is refused whatever the record's
  `findings:` list holds, and AGENTS.md and the project template now say
  so; put elaboration under a heading that does not name findings. A
  reviewer briefed from the old text wrote a report the loop rejected
  (LOOP-020).
- `reword` yields to `explain`. Both PKG-045 and LOOP-139 claimed the
  slot ahead of every action but a live check, so a commit that was both
  unexplained and attributed broke one of them whichever the wake named.
  PKG-045 now says it comes after explaining a stop record, which is what
  the kernel already did; the attribution is named on the next wake
  (PKG-045).
- A defect an Agreed requirement already forbids is captured with
  `cairn backlog --defect` and worked under the current commitment:
  wake names `fix <item>`, and the item carries its fixing commit.
- A mechanism declaration may list `documents:`. A change to one of
  them leaves the commitment's review current, so a documentation edit
  costs a check and not a review round. The release script accepts an
  uncommitted CHANGELOG.md and commits it with the release.
- A revised requirement outside the current commitment no longer blocks
  it: the mechanism review the revision asks for is named for the
  commitment's own requirements.
- A project may forbid AI attribution in its own commits. With
  `attribution: forbidden` in `.cairn/policy`, wake names
  `reword <sha>` for an unpushed commit whose message carries it.
- No commitment is Done on the builder's review alone. An independent
  report, written by a reviewer with none of the build's context, sits
  at `.cairn/reviews/<slug>.independent.md`, names the same commit as
  the review, and every finding it raises is answered on one line of
  the review. More than thirty review rounds of this feature hardened
  the record reader, and its rule is now one sentence: a line that says
  `open:` or `resolved:` is a finding wherever it sits in the record,
  whatever marks it up, and only the findings list's own lines are
  exempt. Markers, labels, tags, table cells, headings and fences are
  markup, not cover. A fence still keeps a quoted field out of the
  metadata, as LOOP-071 asks, but hides no finding, because pairing
  fence markers cannot be told from prose that begins with one.
  Limits are recorded rather than hidden: a finding written as ordinary
  prose under a heading that does not name findings is read as a note
  (escalation loop-020-loop-086), a heading whose title names findings
  is refused even when every finding is listed, and an honest line that
  begins with the prefix outside the list is refused, which is the price
  of never losing one (escalation loop-020-2).

### 0.6.0 - 2026-09-17

- The stop hook no longer lets a stop through because the harness says
  it already refused once; that let an agent quit by ignoring one
  refusal. It refuses while the agent can act (PKG-018).
- The stop hook judges with the kernel that wrote the latest evidence
  when that kernel is on disk: the command on PATH, the link, the
  project's own bin/cairn.mjs, or its own. A newer checkout's receipts
  are no longer called stale by an older command on PATH (PKG-033,
  PKG-021).
- The refusal says that an agent that cannot act raises an escalation
  and stops (PKG-044).
- After three refusals of the same verdict in one session with nothing
  committed or edited in between, the fourth stop goes through: the
  harness shows the developer a message naming the verdict, and the
  hook writes a stop record under `.cairn/stops/` (PKG-043).
- The wake names `explain <path>` for a stop record with no
  `Explanation:` line or not yet committed, ahead of every action but
  waiting for a live check (LOOP-139). The working agreement has the
  move.
- Specified, not yet built: autonomous mode and Jev mode
  (docs/spec/autonomy.md, AUTO-001 to AUTO-018). The kernel ceiling
  is 1900 lines (PKG-004).

Upgrading: nothing is rewritten. Copy the template's `explain` move into
a project's AGENTS.md when it is next written. The hook keeps its
refusal count in the Git directory, so a fresh clone starts at zero. The
kernel changed, so every mechanism re-runs once.

### 0.5.0 - 2026-09-17

- A file Git does not track is no longer a change under way: a draft,
  report or image dropped under a declared folder does not make the
  wake name `record`, so it cannot hold a session at the stop hook.
  `cairn check` still refuses to record evidence while one sits in a
  declared input, and now says it can go in `.gitignore` (LOOP-110).
- The stop hook gives way once it has refused: when the harness reports
  that the stop was already blocked (`stop_hook_active`), the hook
  prints the verdict and lets the agent stop (PKG-018).
- `cairn check --stale` holds back a mechanism whose requirement has
  three attempts and no escalation since, and names the requirement to
  escalate, instead of recording a fourth attempt (LOOP-094, DEC-016).
- The working agreement says a report, audit or review the agent did
  not write is not work under way: its findings are captured to the
  backlog, or to next-iteration when the fix would change Agreed text,
  and the report is committed with them (LOOP-138). Copy the template's
  new sentence into a project's AGENTS.md when it is next written.

Upgrading: nothing is rewritten. The kernel changed, so every mechanism
re-runs once, and a revised requirement asks for its mechanism review
before its next check (LOOP-059).

### 0.4.0 - 2026-09-17

- `cairn decide --decided-by` takes `developer`, `agent` or `joint`,
  case-insensitively, and stores the value lowercase. Any other value is
  refused; name the person or tool in `--body` instead. `cairn reversals`
  counts one decider once and reports a value it does not recognize as
  `unrecognized: <value>` rather than dropping it (DEC-020).
- The wake names a decision record as a repair when its `Realized by`
  section holds `(none yet: recorded, not built)` above a commit that
  resolves: the record says it was never built directly over the commits
  that built it (DEC-021). A section holding the placeholder alone is
  unchanged, and a shallow clone still gets its own repair.
- Cairn installs in Muse from `.muse-plugin/plugin.json`, with one hook
  entry file per hook under `bin/hooks/`.
- Eight kernel defects found by a code review of the kernel, each a
  new requirement with its own test:
  - A field line that carries a value followed by `- item` lines keeps
    the value as the first item instead of dropping it (LOOP-133).
  - The footprint's walk through roadmap history reads `Current:`
    through the same fence-stripping reader the wake uses, so a fenced
    example never moves where the commitment began (LOOP-134).
  - While an escalation waits for the agent's reply to an `ask`, an
    answer shaped as the developer's (`ok`, `instead`, `ask`, any case)
    is refused instead of being stored as the agent's reply (LOOP-135).
  - The hooks name a working directory that does not exist or is not a
    directory, a Muse hook entry whose shared hook cannot start prints
    one line and exits 0, and the walk to the Git toplevel ends by
    construction when the toplevel is `/` (PKG-041).
  - `cairn supersede` accepts only a record slug that exists under
    docs/decisions/ and refuses a record already superseded (DEC-022).
  - Evidence receipts record the full commit identifier; receipts with
    the short form are still read (LOOP-136).
  - The wake resolves every `Realized by` entry through one `git
    cat-file --batch-check` call instead of one process per entry,
    and still reports an ambiguous identifier (DEC-023).
  - A git that cannot be started is one line on stderr and exit 3 from
    every command, never a verdict or a receipt (LOOP-137).
- The release script reads a version field in any JSON spacing, so a
  compact manifest no longer blocks a release (PKG-042).

Upgrading a repository that already holds records: existing records are
never rewritten, and nothing is lost. Two things change on the first
wake. A record whose placeholder survived its realization is named as a
repair, one record per wake, until each placeholder line is removed. A
decider outside the three words is refused the next time a decision is
written, and until then it is reported as unrecognized rather than
counted as one of the three. The kernel changed, so every mechanism
re-runs once, as it does at any upgrade.

### 0.3.0 - 2026-09-15

- `cairn --version` prints the version from package.json.
- scripts/release.mjs cuts a release as one tagged commit, after
  checking the tree, the version, this file, the tag and the loop.
- This changelog, and docs/releasing.md.

### 0.2.0 - 2026-09-15

- Cairn installs as a plugin from a marketplace, in Claude Code and
  in Codex: the manifest, the marketplace listing and hooks/hooks.json
  register the session-start and stop hooks from the plugin.
- The second audit's remediation: the gates bind to the commitment,
  every record shape is read or repaired by name, the hooks find the
  kernel and the project, the lints and tests observe what they name,
  the documents say what the code does, and the verifiers' findings
  are closed.
- The kernel ceiling is 1600 lines.

### 0.1.0 - 2026-09-04

- The kernel, the four skills, and the hooks registered by hand.
