import assert from 'node:assert/strict';
import path from 'node:path';
import {loadProject} from '../scripts/project';
import {evaluateSceneFrame} from '../packages/animation-runtime/src/scene';
// @ts-expect-error Shared bundled video helper.
import {ff} from './check-video.mjs';
export async function checkPoseVideo(
  output: string,
  name: 'gym-phase2' | 'pose-robot',
) {
  output = path.resolve(output);
  const p = await loadProject(`examples/m3/${name}`);
  if (!('scene' in p)) throw Error('Expected scene');
  const m = JSON.parse(
    ff('ffprobe', [
      '-v',
      'error',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      output,
    ]).toString(),
  );
  const v = m.streams[0];
  assert.equal(v.codec_name, 'h264');
  assert.equal(v.width, 1280);
  assert.equal(v.height, 720);
  assert.equal(v.r_frame_rate, '24/1');
  assert.equal(Number(v.nb_frames), p.timeline.fps * p.timeline.duration);
  assert.equal(m.streams.length, 1);
  const samples =
    name === 'gym-phase2'
      ? ([
          ['dumbbell', 120, {x: 5.5, y: 24}],
          ['dumbbell', 180, {x: 5.5, y: 24}],
          ['bottle', 270, {x: 15, y: 46}],
          ['bottle', 307, {x: 15, y: 46}],
        ] as const)
      : ([
          ['weight', 48, {x: 5.5, y: 24}],
          ['weight', 108, {x: 5.5, y: 24}],
          ['water', 192, {x: 15, y: 46}],
          ['water', 229, {x: 15, y: 46}],
        ] as const);
  for (const [id, frame, point] of samples) {
    const matrix = evaluateSceneFrame({...p, frame}).find(
      (o) => o.id === id,
    )!.matrix;
    const x =
        Math.round(matrix[0] * point.x + matrix[2] * point.y + matrix[4]) - 2,
      y = Math.round(matrix[1] * point.x + matrix[3] * point.y + matrix[5]) - 2;
    const pixels: Buffer = ff('ffmpeg', [
      '-v',
      'error',
      '-i',
      output,
      '-vf',
      `trim=start_frame=${frame}:end_frame=${frame + 1},crop=4:4:${x}:${y}`,
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
    assert.equal(pixels.length, 48);
    let matching = 0;
    for (let i = 0; i < 48; i += 3)
      if (
        id === 'dumbbell' || id === 'weight'
          ? pixels[i] > 150 &&
            pixels[i] > pixels[i + 1] * 1.5 &&
            pixels[i] > pixels[i + 2] * 1.5
          : pixels[i] < 120 && pixels[i + 1] > 130 && pixels[i + 2] > 180
      )
        matching++;
    assert.ok(
      matching >= 8,
      `${name}/${id} must appear at evaluated position on frame ${frame}: ${matching}/16`,
    );
  }
  console.log(
    `${name}: metadata and sampled prop pixels passed; owner naturalness review remains pending.`,
  );
}
