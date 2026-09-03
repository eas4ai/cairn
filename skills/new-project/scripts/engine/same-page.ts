// Same Page Conformance -- the engine's command line.
//
//   same-page elaborate                      project Agreed requirements into obligations
//   same-page verify [--as-developer]        evaluate every obligation against the policy
//   same-page trust <validator>              grant execution trust, outside the repository
//   same-page trust --environment <name>     trust a named environment for this repository
//   same-page trust --adapter <name>         trust a registered adapter for this repository
//   same-page run [validator...] [--as-developer] [--environment <name>]
//   same-page challenge [validator...] [--as-developer] [--environment <name>]
//   same-page attest <REQ-ID> --by <actor> --expires <date> --description <text>
//                   [--bindings a,b] [--addresses-falsifier] [--inspection-only]
//   same-page acknowledge <REQ-ID>           acknowledge a disproof-clearing revision
//   same-page policy confirm                 accept a policy downgrade
//   same-page sync-map                       write the machine view into the evidence map
//
// Run with node 22.18+ (`node --disable-warning=ExperimentalWarning
// same-page.ts ...`) or bun; no dependencies. Exit codes: 0 no findings
// and every verdict SUFFICIENT; 1 findings or a verdict below
// SUFFICIENT; 2 usage or configuration error.

import { parseArgs } from "node:util";
import { attest, acknowledge } from "./attestation.ts";
import { elaborate, policyConfirm } from "./elaboration.ts";
import { trust } from "./execution.ts";
import { projectRoot } from "./project.ts";
import { challenge, run } from "./runs.ts";
import { syncMap, verify } from "./verification.ts";

const USAGE = "usage: same-page <elaborate|verify|trust|run|challenge|attest|acknowledge|policy|sync-map> ... [--root DIR]";

// ---------------------------------------------------------------- main

function main(): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      options: {
        root: { type: "string" },
        "as-developer": { type: "boolean" },
        by: { type: "string" },
        expires: { type: "string" },
        description: { type: "string" },
        bindings: { type: "string" },
        "addresses-falsifier": { type: "boolean" },
        "inspection-only": { type: "boolean" },
        environment: { type: "string" },
        adapter: { type: "string" },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (e) {
    process.stderr.write(`same-page: ${(e as Error).message}\n${USAGE}\n`);
    return 2;
  }
  const [command, ...rest] = parsed.positionals;
  const str = (k: string): string | undefined => (typeof parsed.values[k] === "string" ? (parsed.values[k] as string) : undefined);
  const flag = (k: string): boolean => parsed.values[k] === true;
  if (!command) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const root = projectRoot(str("root"));
  switch (command) {
    case "elaborate":
      return rest.length === 0 ? elaborate(root) : usage();
    case "verify":
      return rest.length === 0 ? verify(root, flag("as-developer")) : usage();
    case "trust":
      return trust(root, rest[0], str("environment"), str("adapter"));
    case "run":
      return run(root, rest, flag("as-developer"), str("environment"));
    case "challenge":
      return challenge(root, rest, flag("as-developer"), str("environment"));
    case "attest":
      return attest(root, rest[0], { by: str("by"), expires: str("expires"), description: str("description"), bindings: str("bindings"), addressesFalsifier: flag("addresses-falsifier"), inspectionOnly: flag("inspection-only") });
    case "acknowledge":
      return acknowledge(root, rest[0]);
    case "policy":
      return rest[0] === "confirm" ? policyConfirm(root) : usage();
    case "sync-map":
      return rest.length === 0 ? syncMap(root) : usage();
    default:
      process.stderr.write(`same-page: unknown command ${command}\n`);
      return usage();
  }
}

function usage(): number {
  process.stderr.write(`${USAGE}\n`);
  return 2;
}

process.exit(main());
