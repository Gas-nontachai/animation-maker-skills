import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir = await mkdtemp(path.join(tmpdir(), 'animation-smoke-'));
try {
  execFileSync('ffprobe', ['-version']);
  execFileSync('ffmpeg', ['-version']);
  const output = path.join(dir, 'wave.mp4');
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/render.ts', '--project', 'examples/waving-character', '--output', output], {stdio: 'inherit'});
  const metadata = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output], {encoding: 'utf8'}));
  const video = metadata.streams.find((s: any) => s.codec_type === 'video');
  assert.equal(video.codec_name, 'h264');
  assert.equal(video.width, 1280); assert.equal(video.height, 720);
  assert.equal(video.r_frame_rate, '24/1'); assert.equal(Number(video.nb_frames), 72);
  assert.equal(Number(metadata.format.duration), 3);
  assert.equal(metadata.streams.filter((s: any) => s.codec_type === 'audio').length, 0);
  // Sample the raised hand, clear of the head and the lowered arm.
  for (const frame of [0,12,24,36,48,60]) {
    const pixels = execFileSync('ffmpeg', ['-v','error','-i',output,'-vf',`select=eq(n\\,${frame}),crop=30:30:750:156`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
    assert.equal(pixels.length, 30*30*3);
    const dark = Array.from(pixels).filter(v=>v<230).length / pixels.length;
    if (frame % 24 === 12) assert.ok(dark > .35, `Arm should be raised at frame ${frame}: ${dark}`);
    else assert.ok(dark < .05, `Arm should be down at frame ${frame}: ${dark}`);
  }
  console.log('Integration passed: H.264, 1280×720, 24 FPS, 72 frames, 3s, no audio; three arm raises confirmed.');
} finally {await rm(dir, {recursive: true, force: true});}
