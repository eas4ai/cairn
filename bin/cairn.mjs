#!/usr/bin/env node
// bin/cairn.mjs
import { main } from '../lib/cli.mjs';
process.exitCode = await main(process.argv.slice(2));
