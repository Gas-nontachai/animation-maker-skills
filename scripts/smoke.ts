import {execFileSync} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
// @ts-expect-error Shared JavaScript assertions also run in the isolated installed-package test.
import {checkVideo} from '../tests/check-video.mjs';
const dir = await mkdtemp(path.join(tmpdir(), 'animation-smoke-'));
try {
  const output = path.join(dir, 'wave.mp4');
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/render.ts', '--project', 'examples/waving-character', '--output', output], {stdio: 'inherit'});
  checkVideo(output);
} finally {await rm(dir, {recursive: true, force: true});}
