// Ambient declarations for the node builtins the engine calls. The
// package declares no dependency, so @types/node is not available to
// the type check; these cover exactly the surface the engine uses and
// nothing more. The tests run the engine under real node and bun, so a
// declaration that drifts from the runtime fails there.

declare var process: {
  argv: string[];
  env: Record<string, string | undefined>;
  cwd(): string;
  exit(code?: number): never;
  stdout: { write(chunk: string): boolean };
  stderr: { write(chunk: string): boolean };
};

declare var console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

interface ImportMeta {
  url: string;
}

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean; isFile(): boolean };
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function relative(from: string, to: string): string;
  export function dirname(path: string): string;
  export function basename(path: string, ext?: string): string;
  export function isAbsolute(path: string): boolean;
}

declare module "node:crypto" {
  export function createHash(algorithm: string): {
    update(data: string, encoding?: "utf8"): { digest(encoding: "hex"): string };
  };
}

declare module "node:child_process" {
  export function spawnSync(
    command: string,
    args: string[],
    options?: { cwd?: string; encoding?: "utf8" }
  ): { status: number | null; stdout: string; stderr: string; error?: Error };
}

declare module "node:util" {
  export function parseArgs(config: {
    args?: string[];
    options?: Record<string, { type: "string" | "boolean"; short?: string; multiple?: boolean }>;
    allowPositionals?: boolean;
    strict?: boolean;
  }): { values: Record<string, string | boolean | string[] | undefined>; positionals: string[] };
}
