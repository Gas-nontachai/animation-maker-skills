import assert from 'node:assert/strict';
import {bundle} from '@remotion/bundler';
import {
  renderMedia,
  selectComposition,
  RenderInternals,
} from '@remotion/renderer';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadProject} from './project';
import {browser, checkBinding} from './environment';
// @ts-expect-error Shared bundled-binary helper also runs in installed-package checks.
import {ff} from '../tests/check-video.mjs';
const directory = process.argv[2];
if (!directory)
  throw new Error('Usage: npm run test:m4 -- <new evidence directory>');
await mkdir(directory);
await checkBinding();
const browserExecutable = await browser();
const temp = await mkdtemp(path.join(tmpdir(), 'm4-verify-'));
const evidence: unknown[] = [];
try {
  const serveUrl = await bundle({
    entryPoint: fileURLToPath(
      new URL('../renderer/src/index.ts', import.meta.url),
    ),
    outDir: temp,
  });
  for (const name of ['coffee', 'hybrid', 'glb']) {
    const inputProps = await loadProject(`examples/m4/${name}`);
    if (!inputProps.cinematic) throw Error('Expected cinematic project');
    const composition = await selectComposition({
      serveUrl,
      id: 'Animation',
      inputProps,
      browserExecutable,
    });
    const video = path.resolve(directory, `${name}.mp4`);
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      browserExecutable,
      codec: 'h264',
      pixelFormat: 'yuv420p',
      muted: true,
      outputLocation: video,
    });
    const metadata = JSON.parse(
      ff('ffprobe', [
        '-v',
        'error',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        video,
      ]).toString(),
    );
    const stream = metadata.streams.find(
      (s: {codec_type: string}) => s.codec_type === 'video',
    );
    assert.equal(stream.codec_name, 'h264');
    assert.equal(stream.width, 1280);
    assert.equal(stream.height, 720);
    assert.equal(stream.r_frame_rate, '24/1');
    assert.equal(Number(stream.nb_frames), composition.durationInFrames);
    assert.equal(
      Number(metadata.format.duration),
      inputProps.timeline.duration,
    );
    assert.equal(metadata.streams.length, 1);
    const frames =
      name === 'glb'
        ? [0, 23]
        : [0, 47, 48, 70, 99, 100, 130, 169, 170, 190, 191, 239];
    for (const frame of frames) {
      await RenderInternals.callFf({
        bin: 'ffmpeg',
        args: [
          '-ss',
          String(frame / 24),
          '-i',
          video,
          '-frames:v',
          '1',
          path.resolve(directory, `${name}-${frame}.png`),
        ],
        indent: false,
        logLevel: 'error',
        binariesDirectory: null,
        cancelSignal: undefined,
      });
      const pixels: Buffer = ff('ffmpeg', [
        '-v',
        'error',
        '-ss',
        String(frame / 24),
        '-i',
        video,
        '-frames:v',
        '1',
        '-vf',
        'scale=320:180',
        '-c:v',
        'rawvideo',
        '-f',
        'image2pipe',
        '-pix_fmt',
        'rgb24',
        'pipe:1',
      ]);
      assert.equal(pixels.length, 320 * 180 * 3);
      let saturated = 0;
      for (let i = 0; i < pixels.length; i += 3)
        if (
          pixels[i] - pixels[i + 2] > 50 &&
          pixels[i + 1] - pixels[i + 2] > 35
        )
          saturated++;
      assert.ok(
        saturated > 500,
        `${name} frame ${frame}: character or GLB is missing (${saturated} colored pixels)`,
      );
    }
    evidence.push({
      project: name,
      video,
      frames,
      metadata: 'PASS',
      nonblankSamples: 'PASS',
      visualAcceptance: 'Manual review required',
    });
  }
  await writeFile(
    path.join(directory, 'verification.json'),
    JSON.stringify(evidence, null, 2) + '\n',
    {flag: 'wx'},
  );
  console.log(`M4 rendered and decoded-frame checks passed: ${directory}`);
} finally {
  await rm(temp, {recursive: true, force: true});
}
