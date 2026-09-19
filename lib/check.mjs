// lib/check.mjs
import { spawn } from 'node:child_process';
import { readMechanisms, MechanismError } from './mechanisms.mjs';

export class CheckError extends Error {}

export async function selectMechanism(cwd, REQ) {
  const all = await readMechanisms(cwd);
  // Deviation from the plan text: readMechanisms (Task 1) orders its object by sorting the
  // .json filenames, which is not the same order as sorting the plain mechanism names ('-' sorts
  // before '.', so 'greeter-two.json' < 'greeter.json' but 'greeter' < 'greeter-two'). Sort the
  // selected names themselves so a multi-mechanism refusal always lists them alphabetically.
  const names = Object.keys(all).filter((n) => all[n].definition.requirements.includes(REQ)).sort();
  if (names.length === 0) throw new CheckError(`no mechanism declares ${REQ}`);
  if (names.length > 1) throw new CheckError(`${names.length === 2 ? 'two' : names.length} mechanisms declare ${REQ}: ${names.join(', ')}`);
  return { name: names[0], entry: all[names[0]] };
}

export function runCommand(cwd, command) {
  return new Promise((resolve) => {
    const chunks = [];
    let child;
    try {
      child = spawn('sh', ['-c', command], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { return resolve({ spawned: false, out: Buffer.alloc(0), code: null, signal: null }); }
    child.stdout.on('data', (c) => chunks.push(c));
    child.stderr.on('data', (c) => chunks.push(c));
    child.on('error', () => resolve({ spawned: false, out: Buffer.concat(chunks), code: null, signal: null }));
    child.on('close', (code, signal) => resolve({ spawned: true, out: Buffer.concat(chunks), code, signal }));
  });
}

export async function observeIdentity(cwd, identity) {
  const tools = {};
  for (const name of Object.keys(identity.tools).sort()) {
    const r = await runCommand(cwd, identity.tools[name]);
    tools[name] = r.spawned && r.code === 0 ? r.out.toString('utf8').trim() : null;
  }
  const env = {};
  for (const name of identity.env) env[name] = Object.hasOwn(process.env, name) ? process.env[name] : null;
  return { tools, env, image: identity.image };
}

export { MechanismError };
