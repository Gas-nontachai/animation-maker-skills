import assert from 'node:assert/strict';
import path from 'node:path';
import {loadProject} from '../scripts/project';
import {evaluateSceneFrame} from '../packages/animation-runtime/src/scene';
// @ts-expect-error Shared dependency-free video helpers.
import {ff} from './check-video.mjs';
export async function checkMotionVideo(output: string) {
  output = path.resolve(output);
  const project = await loadProject('examples/m3/coffee');
  if (!('scene' in project)) throw new Error('Expected M3 scene fixture');
  const crop = (frame: number, x: number, y: number, size = 6): Buffer =>
    ff('ffmpeg', [
      '-v',
      'error',
      '-i',
      output,
      '-vf',
      `trim=start_frame=${frame}:end_frame=${frame + 1},crop=${size}:${size}:${x}:${y}`,
      '-frames:v',
      '1',
      '-c:v',
      'rawvideo',
      '-f',
      'image2pipe',
      '-pix_fmt',
      'rgb24',
      'pipe:1',
    ]);
  for (const frame of [0, 107, 108, 120, 132, 156, 168, 180, 191]) {
    const state = evaluateSceneFrame({...project, frame});
    const cup = state.find((o) => o.id === 'cup')!.matrix;
    const pixels = crop(frame, Math.round(cup[4]) - 3, Math.round(cup[5]) - 3);
    assert.equal(pixels.length, 108);
    let orange = 0;
    for (let i = 0; i < pixels.length; i += 3)
      if (
        pixels[i] > 150 &&
        pixels[i] > pixels[i + 1] * 1.4 &&
        pixels[i + 1] > pixels[i + 2] * 1.1
      )
        orange++;
    assert.ok(
      orange > 20,
      `Cup must appear at evaluated world position at frame ${frame}`,
    );
    const desk = crop(frame, 620, 384);
    assert.equal(desk.length, 108);
    for (let i = 0; i < desk.length; i += 3)
      assert.ok(
        desk[i] > 100 && desk[i] < 180 && desk[i + 1] > 60 && desk[i + 1] < 130,
        `Static desk at frame ${frame}`,
      );
  }
  console.log(
    'M3 decoded-frame smoke passed: cup at evaluated positions and desk stationary across contact/transport/release samples. Owner visual acceptance remains pending.',
  );
}
