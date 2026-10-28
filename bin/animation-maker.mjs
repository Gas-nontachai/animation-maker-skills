#!/usr/bin/env node
import {register} from 'tsx/esm/api';
import {readFileSync} from 'node:fs';

const command = process.argv[2];
if (command === '--version') {
  console.log(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
} else if (!['create', 'validate', 'render', 'doctor', 'inspect'].includes(command)) {
  console.error('Usage: animation-maker <create|validate|render|doctor|inspect> [options]');
  process.exitCode = command === '--help' ? 0 : 1;
} else {
  process.argv.splice(2, 1);
  register({tsconfig: false});
  await import(new URL(`../scripts/${command}.ts`, import.meta.url).href);
}
