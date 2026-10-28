import assert from 'node:assert/strict';
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
  for (const name of ['static', 'animated', 'trees']) {
    const video = path.join(dir, `${name}.mp4`);
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/render.ts', '--project', `examples/m2/${name}`, '--output', video], {stdio: 'inherit'});
    const metadata = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', 'scripts/inspect.ts', '--input', video], {encoding: 'utf8'}));
    const stream = metadata.streams.find((s: {codec_type: string}) => s.codec_type === 'video');
    assert.equal(stream.codec_name, 'h264'); assert.equal(stream.width, 1280); assert.equal(stream.height, 720);
    assert.equal(stream.r_frame_rate, '24/1'); assert.equal(Number(stream.nb_frames), name === 'animated' ? 120 : 72);
    assert.equal(metadata.streams.filter((s: {codec_type: string}) => s.codec_type === 'audio').length, 0);
  }
} finally {await rm(dir, {recursive: true, force: true});}
