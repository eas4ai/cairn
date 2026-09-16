commitment: the-plugin-installs-from-a-marketplace
commit: 82090a1
examined:
  - the manifests: .claude-plugin/plugin.json, .claude-plugin/marketplace.json and .codex-plugin/plugin.json agree with package.json on the name cairn and version 0.2.0; the listing names the repository root as the plugin; the test pins each of these and the four skill directories.
  - the hooks file: hooks/hooks.json registers SessionStart and Stop, each one command running the plugin's own bin/hook.mjs through the plugin root variable; the test runs both commands through sh from a plugin root that is a copy of bin/ elsewhere, with node on PATH and no cairn, and observes the link into the plugin, the verdict at session start, and the refused stop.
  - a real install in Claude Code, in a scratch HOME, from this checkout as a directory marketplace: the marketplace was added, cairn@cairn installed at 0.2.0 and enabled, and the component inventory lists the four skills and the two hooks SessionStart and Stop.
  - a real install in Codex, in a scratch CODEX_HOME: the marketplace was added, cairn@cairn installed into plugins/cache/cairn/cairn/0.2.0, and that copy holds hooks/hooks.json and bin/ with the three kernel files. Codex resolved the manifest without a Codex-specific field beyond skills and interface.
  - the plugin is the whole repository, so an install carries docs/, tests/ and .cairn/ evidence along with bin/ and skills/; the requirement asks for the repository alone and the harnesses accept it; a slimmer package would be a layout decision, not a defect.
  - after a plugin update the command link keeps pointing at the version it was made from until that version's files are gone, by PKG-034; the README and the install skill say to check the resolved path and remove the link. The link's target under a plugin cache is what PKG-021 and PKG-033 make the hooks judge with, so the agent and the hooks stay on one kernel either way.
  - the skills-CLI and checkout installs are unchanged; the skills tests still pin their phrases in the README and the install skill.
findings:
  - resolved: the README and the install skill did not tell a user who registered the hooks by hand to remove those entries when the plugin is installed; both now say so, with the reason (62ec2b1).

## Commitment review at 8f40853, 2026-09-15

PKG-037, PKG-038 and the rest have current passing evidence; 457
tests pass, both lints clean, the kernel unchanged at 1510 of 1600
lines. Attacked as listed under examined. One open finding, resolved
as its own work below.

## Commitment review at 82090a1, 2026-09-15

The resolution changed two documents; node-test and pkg-lint rerun
and passing. No open finding.
