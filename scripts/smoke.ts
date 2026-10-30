import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {checkMotionVideo} from '../tests/check-motion-video';
import {checkGymVideo} from '../tests/check-gym-video';
import {checkPoseVideo} from '../tests/check-pose-video';
// @ts-expect-error Shared JavaScript assertions also run in the isolated installed-package test.
import {checkVideo} from '../tests/check-video.mjs';
const dir = await mkdtemp(path.join(tmpdir(), 'animation-smoke-'));
try {
  const output = path.join(dir, 'wave.mp4');
  execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/render.ts',
      '--project',
      'examples/waving-character',
      '--output',
      output,
    ],
    {stdio: 'inherit'},
  );
  checkVideo(output);
  for (const name of [
    'static',
    'animated',
    'trees',
    'coffee',
    'gym',
    'gym-phase2',
    'pose-robot',
    'pose-transition',
  ]) {
    const video = path.join(dir, `${name}.mp4`);
    execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/render.ts',
        '--project',
        ['gym-phase2', 'pose-robot', 'pose-transition'].includes(name)
          ? `examples/m3/${name}`
          : name === 'gym'
            ? 'examples/m3/gym-corrected'
            : name === 'coffee'
              ? 'examples/m3/coffee'
              : `examples/m2/${name}`,
        '--output',
        video,
      ],
      {stdio: 'inherit'},
    );
    const metadata = JSON.parse(
      execFileSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/inspect.ts', '--input', video],
        {encoding: 'utf8'},
      ),
    );
    const stream = metadata.streams.find(
      (s: {codec_type: string}) => s.codec_type === 'video',
    );
    if (name === 'coffee') await checkMotionVideo(video);
    if (name === 'gym') await checkGymVideo(video);
    if (name === 'gym-phase2' || name === 'pose-robot')
      await checkPoseVideo(video, name);
    assert.equal(stream.codec_name, 'h264');
    assert.equal(stream.width, 1280);
    assert.equal(stream.height, 720);
    assert.equal(stream.r_frame_rate, '24/1');
    assert.equal(
      Number(stream.nb_frames),
      name === 'gym-phase2'
        ? 360
        : name === 'pose-robot'
          ? 240
          : name === 'pose-transition'
            ? 192
            : name === 'gym'
              ? 360
              : name === 'coffee'
                ? 192
                : name === 'animated'
                  ? 120
                  : 72,
    );
    assert.equal(
      metadata.streams.filter(
        (s: {codec_type: string}) => s.codec_type === 'audio',
      ).length,
      0,
    );
  }
} finally {
  await rm(dir, {recursive: true, force: true});
}
