// The adapter capability registry (ENG-055 through ENG-057). Every
// trust-sensitive evidence axis is set by the engine from this table,
// never from a validator's output (ENG-051, ENG-052, ENG-054). Two
// adapters are registered and neither holds a capability; backends
// that can establish bindings, closures, challenges, or formal results
// are layer L6 and register here when they arrive. An adapter's
// identity on an evidence record is its name and version (ENG-141);
// the version changes when the adapter's recording behavior changes,
// so evidence recorded under the previous behavior goes stale.

export const CAPABILITIES = [
  "can_establish_binding",
  "can_establish_complete_dependencies",
  "can_establish_challenge",
  "can_establish_formal_result",
  "can_establish_model_result",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type AdapterName = "command" | "manual";

export const ADAPTERS: Record<AdapterName, { version: string; capabilities: readonly Capability[] }> = {
  command: { version: "2", capabilities: [] },
  manual: { version: "2", capabilities: [] },
};

export function adapterHas(adapter: AdapterName, capability: Capability): boolean {
  return ADAPTERS[adapter].capabilities.includes(capability);
}

export function adapterVersion(adapter: AdapterName): string {
  return ADAPTERS[adapter].version;
}
