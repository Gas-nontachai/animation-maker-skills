#!/usr/bin/env node
import {register} from 'tsx/esm/api';

const command = process.argv[2];
if (!['validate', 'render', 'doctor'].includes(command)) {
  console.error('Usage: animation-maker <validate|render|doctor> [options]');
  process.exitCode = command === '--help' ? 0 : 1;
} else {
  process.argv.splice(2, 1);
  register({tsconfig: false});
  await import(new URL(`../scripts/${command}.ts`, import.meta.url).href);
}
