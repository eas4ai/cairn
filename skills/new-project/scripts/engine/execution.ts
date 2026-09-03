// What a command needs before it may execute anything, and what that
// execution depends on.
//
// The trust context and the authority an invocation runs under
// (ENG-058 through ENG-065, ENG-155 through ENG-160), the environment
// inputs a validator declares (ENG-150), the adapter closure that
// narrows its boundary and the supplemental trace that widens it
// (ENG-041, ENG-055, ENG-124), and the fields every evidence record
// carries as a result. `run` and `challenge` both resolve a validator
// here and build their records here, so the two commands cannot drift
// apart on any of it. The `trust` command lives here too: it is how a
// developer grants the permission this module checks.

import { BUILTIN, adapterHas, adapterVersion, readRegistry, registrationPath, type Adapter } from "./adapters.ts";
import { ciActor, ciConfiguration, inCi, type Authority } from "./authority.ts";
import { digest } from "./digest.ts";
import {
  CHALLENGE_ASSUMPTIONS,
  COMMAND_ASSUMPTIONS,
  FORMAL_ASSUMPTIONS,
  dependencyChain,
  residualRisk,
  type ChallengeFacts,
  type Closure,
  type Dependency,
  type EvidenceRecord,
} from "./evidence.ts";
import { completeRef, obligationDigest, type Obligation } from "./obligations.ts";
import type { Finding } from "./policy.ts";
import { printFindings } from "./project.ts";
import type { Requirement } from "./specs.ts";
import {
  findAdapterGrant,
  findEnvironmentGrant,
  findGrant,
  gitActor,
  grant,
  grantAdapter,
  grantEnvironment,
  trustPath,
  trustStoreInsideRepository,
  type TrustStore,
} from "./trust.ts";
import {
  closureArgv,
  computeInputSet,
  environmentLabel,
  fingerprintEnvironment,
  readValidator,
  validatorDigest,
  type EnvironmentInput,
  type InputSet,
  type ValidatorDef,
} from "./validators.ts";

// ------------------------------------------------------- dependency sets

// What a validator's declarations establish now: the adapter closure
// that narrows its boundary, and the supplemental trace that widens it.
// A closure needs a registered adapter with
// can_establish_complete_dependencies (ENG-055, ENG-056) and a grant
// the developer wrote outside the repository (ENG-061, ENG-064);
// without either, the engine keeps the conservative floor and says so.
export type Sets = { closure: Closure | null; closureSet: InputSet | null; trace: InputSet | null };

export function dependencySets(root: string, def: ValidatorDef, store: TrustStore, adapters: Record<string, Adapter>, out: Finding[]): Sets {
  const where = `.same-page/validators/${def.name}.yaml`;
  let closure: Closure | null = null;
  let closureSet: InputSet | null = null;
  if (def.closure) {
    const a = adapters[def.closure.adapter];
    if (!a) {
      out.push({ where, message: `closure adapter ${def.closure.adapter} is not registered; register it in ${registrationPath()}, outside this repository`, rule: "ENG-055" });
    } else if (!adapterHas(adapters, a.name, "can_establish_complete_dependencies")) {
      out.push({ where, message: `adapter ${a.name} is registered without can_establish_complete_dependencies, so it cannot establish a closure; the conservative floor stands`, rule: "ENG-056" });
    } else {
      const g = findAdapterGrant(store, root, a.name, a.version);
      if (!g) {
        out.push({ where, message: `adapter ${a.name} ${a.version} is not trusted for this repository; run \`same-page trust --adapter ${a.name}\`. Until then the boundary stays the repository`, rule: "ENG-064" });
      } else {
        const set = computeInputSet(root, def.cwd, closureArgv(a.name, a.command, def.closure), def.timeout);
        closureSet = set;
        if (set.error !== null) out.push({ where, message: `adapter ${a.name} could not establish the closure (${set.error}); the boundary stays the repository`, rule: "ENG-124" });
        else closure = { adapter: a.name, version: a.version, project: def.closure.project, inputs: set.inputs.length, grantedBy: g.actor };
      }
    }
  }
  let trace: InputSet | null = null;
  if (def.trace) {
    trace = computeInputSet(root, def.cwd, def.trace.command, def.timeout);
    if (trace.error !== null) out.push({ where, message: `the supplemental trace could not be computed (${trace.error}); it names no inputs and narrows nothing`, rule: "ENG-041" });
  }
  return { closure, closureSet, trace };
}



// ---------------------------------------------------------------- trust

export function trust(root: string, name: string | undefined, environment: string | undefined, adapter: string | undefined): number {
  const chosen = [name, environment, adapter].filter((x) => x !== undefined && x !== "").length;
  if (chosen !== 1) {
    process.stderr.write("usage: same-page trust <validator> | same-page trust --environment <name> | same-page trust --adapter <name>\n");
    return 2;
  }
  if (trustStoreInsideRepository(root)) {
    process.stderr.write(`same-page: the trust store ${trustPath()} is inside the repository it would authorize; set SAME_PAGE_HOME outside it (ENG-062)\n`);
    return 2;
  }
  if (adapter) {
    // ENG-055, ENG-056, ENG-065: a grant names a registered adapter and
    // the version it carries now.
    const registry = readRegistry();
    printFindings(registry.findings);
    const a = registry.adapters[adapter];
    if (!a) {
      process.stderr.write(`same-page: adapter ${adapter} is not registered. Built-in: ${Object.keys(BUILTIN).join(", ")}. Register others in ${registrationPath()}, outside this repository\n`);
      return 2;
    }
    const g = grantAdapter(root, a.name, a.version, gitActor(root));
    process.stdout.write(`trusted adapter ${a.name} ${a.version} (${a.capabilities.length ? a.capabilities.join(", ") : "no capabilities"}) for ${g.repository} by ${g.actor}; recorded in ${trustPath()}\n`);
    return 0;
  }
  if (environment) {
    const g = grantEnvironment(root, environment, gitActor(root));
    process.stdout.write(`trusted environment ${environment} for ${g.repository} by ${g.actor}; recorded in ${trustPath()}. Runs there: same-page run --environment ${environment}\n`);
    return 0;
  }
  name = name!;
  const v = readValidator(root, name);
  if (!v.def) {
    printFindings(v.findings);
    return 1;
  }
  const d = validatorDigest(v.def);
  const g = grant(root, name, d, gitActor(root));
  process.stdout.write(`trusted ${name} (${d}) for ${g.repository} by ${g.actor}; recorded in ${trustPath()}\n`);
  return 0;
}



// ------------------------------------------------------- execution context

export type Shared = { context: NonNullable<EvidenceRecord["execution_trust"]>; authority: Authority; name: string | null };

// The trust context and authority a whole invocation runs under, when
// it is not per validator: a named environment the developer trusted,
// or owner-controlled CI (ENG-060).
export function sharedContext(root: string, environment: string | undefined, store: TrustStore, out: Finding[]): Shared | null | "error" {
  if (environment) {
    const g = findEnvironmentGrant(store, root, environment);
    if (!g) {
      out.push({ where: trustPath(), message: `environment ${environment} is not trusted for this repository; run \`same-page trust --environment ${environment}\``, rule: "ENG-058" });
      return "error";
    }
    return { context: { context: "named-environment", actor: `${environment} (${g.actor})` }, authority: "named-environment", name: environment };
  }
  if (inCi(process.env)) {
    const ci = ciConfiguration(root);
    if (!ci) {
      out.push({ where: root, message: "CI is set in the environment but the repository carries no CI configuration at a recognized path; nothing anchors trust for a ci run", rule: "ENG-060" });
      return "error";
    }
    return { context: { context: "ci", actor: ciActor(process.env) }, authority: "ci", name: null };
  }
  return null;
}

// One validator, resolved: whether it may execute here, under whose
// authority, with which environment fingerprint and which dependency
// set. `run` and `challenge` differ only in the verb they name when
// trust is missing and in when they report an environment error, so
// they share both halves of this.
export type ValidatorRun = {
  def: ValidatorDef;
  digest: string;
  context: NonNullable<EvidenceRecord["execution_trust"]>;
  authority: Authority;
  authorityName: string | null;
  environment: EnvironmentInput[];
  sets: Sets;
  dependency: Dependency;
  narrowed: boolean;
  fingerprint: string | null;
  provenance: EvidenceRecord["dependency_provenance"];
  declared: string[];
  environmentOk: boolean;
  traceOk: boolean;
};

export type TrustResolution = {
  digest: string;
  context: NonNullable<EvidenceRecord["execution_trust"]>;
  authority: Authority;
  authorityName: string | null;
};

// May this validator execute here, and whose evidence is the result?
// Nothing is fingerprinted and nothing is spawned until this answers.
export function resolveTrust(args: {
  root: string;
  def: ValidatorDef;
  store: TrustStore;
  shared: Shared | null;
  asDeveloper: boolean;
  actor: string;
  verb: "run" | "challenge";
  out: Finding[];
}): TrustResolution | null {
  const { root, def, store, shared, asDeveloper, actor, verb, out } = args;
  const name = def.name;
  const d = validatorDigest(def);
  const g = findGrant(store, root, name, d);
  let context: NonNullable<EvidenceRecord["execution_trust"]>;
  if (shared) context = shared.context;
  else if (g) context = { context: "trust-record", actor: g.actor };
  else if (asDeveloper) context = { context: "developer-invocation", actor };
  else {
    out.push({ where: `.same-page/validators/${name}.yaml`, message: `${name} is not trusted for this repository at its current definition (${d}); run \`same-page trust ${name}\`, or the developer runs \`same-page ${verb} ${name} --as-developer\``, rule: "ENG-058" });
    return null;
  }
  return { digest: d, context, authority: shared ? shared.authority : "local", authorityName: shared ? shared.name : null };
}

// What this validator's result depends on: the environment inputs it
// declares (ENG-150, ENG-151), the adapter closure that narrows its
// boundary and the trace that widens it (ENG-041, ENG-124). Both spawn
// commands, so both run only after trust is established.
export function resolveInputs(args: {
  root: string;
  def: ValidatorDef;
  trust: TrustResolution;
  store: TrustStore;
  adapters: Record<string, Adapter>;
  snapshotId: string | null;
  out: Finding[];
}): ValidatorRun {
  const { root, def, trust, store, adapters, snapshotId, out } = args;
  const environment: EnvironmentInput[] = fingerprintEnvironment(root, def, true);
  // Whatever the command, an input the engine cannot compute is said
  // out loud when the record is written, not left for the next verify
  // (ENG-126).
  for (const e of environment) if (e.error !== null) out.push({ where: `.same-page/validators/${def.name}.yaml`, message: `environment input ${e.input} cannot be computed (${e.error}); records written now have unknown freshness`, rule: "ENG-126" });
  const sets = dependencySets(root, def, store, adapters, out);
  const dependency = dependencyChain(snapshotId, sets.closure);
  const narrowed = dependency.scope === "package";
  return {
    def,
    digest: trust.digest,
    context: trust.context,
    authority: trust.authority,
    authorityName: trust.authorityName,
    environment,
    sets,
    dependency,
    narrowed,
    fingerprint: narrowed ? sets.closureSet!.fingerprint : snapshotId,
    provenance: sets.trace && sets.trace.error === null ? "traced_supplemental" : narrowed ? "adapter_derived" : "conservative",
    declared: def.environment.map(environmentLabel),
    environmentOk: environment.every((e) => e.error === null),
    traceOk: !sets.trace || sets.trace.error === null,
  };
}

// The evidence record a validator produces for one obligation. Every
// axis the engine owns is set here, from the resolution above and from
// the requirement as it stands now; nothing the validator printed
// reaches this (ENG-051, ENG-052, ENG-054).
export function buildRecord(args: {
  vr: ValidatorRun;
  o: Obligation;
  req: Requirement | undefined;
  root: string;
  actor: string;
  snapshotId: string | null;
  result: EvidenceRecord["result"];
  runPath: string;
  recordedAt: string;
  freshness: EvidenceRecord["freshness"];
  challenge: ChallengeFacts | null;
}): EvidenceRecord {
  const { vr, o, req, root, actor, snapshotId, result, runPath, recordedAt, freshness, challenge } = args;
  const ref = completeRef(o.validators.find((x) => x.name === vr.def.name) ?? { name: vr.def.name }, snapshotId ?? "unknown", actor);
  const attested = ref.attested_by !== undefined;
  const assumptions = [...COMMAND_ASSUMPTIONS];
  if (challenge) assumptions.push(...CHALLENGE_ASSUMPTIONS);
  if (vr.def.kind === "formal") assumptions.push(...FORMAL_ASSUMPTIONS);
  return {
    requirement: o.requirement,
    kind: vr.def.kind,
    adapter: "command",
    validator: vr.def.name,
    result,
    run: runPath,
    recorded_at: recordedAt,
    identity: {
      snapshot: snapshotId,
      requirement: o.requirement,
      requirement_digest: req ? digest(req.text) : o.requirement_digest,
      falsifier_digest: req && req.falsifier !== null ? digest(req.falsifier) : o.falsifier_digest,
      obligation_digest: obligationDigest(o),
      validator_digest: vr.digest,
      adapter: "command",
      adapter_version: adapterVersion("command"),
      dependency_fingerprint: vr.fingerprint,
      environment: vr.environment.map((e) => ({ ...e })),
      traced: vr.sets.trace && vr.sets.trace.error === null ? [...vr.sets.trace.inputs] : [],
      traced_fingerprint: vr.sets.trace && vr.sets.trace.error === null ? vr.sets.trace.fingerprint : null,
      traced_error: vr.sets.trace ? vr.sets.trace.error : null,
      contracts: [],
    },
    execution_trust: vr.context,
    binding_basis: attested ? "attested" : "none",
    binding: attested ? { actor: ref.actor!, actor_type: ref.attested_by!, timestamp: ref.attested_at!, snapshot: ref.snapshot!, developer_confirmed: ref.developer_confirmed === true } : null,
    sensitivity: challenge ? "challenged" : "unchallenged",
    challenge,
    freshness,
    boundary: { scope: vr.dependency.scope, root, project: vr.sets.closure ? vr.sets.closure.project : null, validator: vr.def.name, environment: vr.declared },
    dependency: vr.dependency,
    dependency_provenance: vr.provenance,
    assumptions,
    residual_risk: residualRisk(vr.dependency, vr.declared, "command"),
    authority: vr.authority,
    authority_name: vr.authorityName,
    manual: null,
  };
}
