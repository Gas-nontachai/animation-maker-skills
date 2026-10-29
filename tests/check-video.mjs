import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {RenderInternals} from '@remotion/renderer';
export function ff(bin, args) {
  const executable = RenderInternals.getExecutablePath({type: bin, indent: false, logLevel: 'error', binariesDirectory: null});
  const cwd = path.dirname(executable);
  // macOS bundled binaries need their adjacent shared libraries, as in Remotion's callFf.
  return execFileSync(executable, args, {cwd, env: {...process.env, ...(process.platform === 'darwin' ? {DYLD_LIBRARY_PATH: cwd} : {})}});
}
export function checkVideo(output) {
  ff('ffprobe', ['-version']);
  ff('ffmpeg', ['-version']);
  output = path.resolve(output);
  const metadata = JSON.parse(ff('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output]).toString('utf8'));
  const video = metadata.streams.find((s) => s.codec_type === 'video');
  assert.equal(video.codec_name, 'h264');
  assert.equal(video.width, 1280); assert.equal(video.height, 720);
  assert.equal(video.r_frame_rate, '24/1'); assert.equal(Number(video.nb_frames), 72);
  assert.equal(Number(metadata.format.duration), 3);
  assert.equal(metadata.streams.filter((s) => s.codec_type === 'audio').length, 0);
  // Sample the raised hand, clear of the head and the lowered arm.
  for (const frame of [0,12,24,36,48,60]) {
    const pixels = ff('ffmpeg', ['-v','error','-i',output,'-vf',`trim=start_frame=${frame}:end_frame=${frame+1},crop=30:30:750:156`,'-frames:v','1','-c:v','rawvideo','-f','image2pipe','-pix_fmt','rgb24','pipe:1']);
    assert.equal(pixels.length, 30*30*3);
    const dark = Array.from(pixels).filter(v=>v<230).length / pixels.length;
    if (frame % 24 === 12) assert.ok(dark > .35, `Arm should be raised at frame ${frame}: ${dark}`);
    else assert.ok(dark < .05, `Arm should be down at frame ${frame}: ${dark}`);
  }
  console.log('Integration passed: H.264, 1280×720, 24 FPS, 72 frames, 3s, no audio; three arm raises confirmed.');
}
