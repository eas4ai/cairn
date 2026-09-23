#!/usr/bin/env node
// bin/cairn.mjs: the command's former name. A shim, hook or working agreement written before
// 3.0.0 still runs; it is bin/sudus.mjs under the old name.
import { main } from '../lib/cli.mjs';
process.exitCode = await main(process.argv.slice(2));
