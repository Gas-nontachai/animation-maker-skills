import assert from 'node:assert/strict';
import path from 'node:path';
import {loadProject} from '../scripts/project';
import {evaluateSceneFrame} from '../packages/animation-runtime/src/scene';
// @ts-expect-error Shared dependency-free bundled video helper.
import {ff} from './check-video.mjs';
export async function checkGymVideo(output:string) {
  output=path.resolve(output);
  const p=await loadProject('examples/m3/gym-corrected');
  if(!('scene' in p))throw new Error('Expected Gym scene');
  const metadata=JSON.parse(ff('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output]).toString());
  const video=metadata.streams.find((s:{codec_type:string})=>s.codec_type==='video');
  assert.equal(video.codec_name,'h264');assert.equal(video.width,1280);assert.equal(video.height,720);
  assert.equal(video.r_frame_rate,'24/1');assert.equal(Number(video.nb_frames),360);assert.equal(Number(metadata.format.duration),15);
  assert.equal(metadata.streams.length,1);
  for(const [id,frames,point] of [['dumbbell',[96,108,120,132,144,168,186,210,211],{x:5.5,y:24}],['bottle',[246,258,270,282,294,306,307],{x:15,y:46}]] as const) {
    for(const frame of frames) {
      const object=evaluateSceneFrame({...p,frame}).find(o=>o.id===id)!.matrix;
      const x=Math.round(object[0]*point.x+object[2]*point.y+object[4])-2,y=Math.round(object[1]*point.x+object[3]*point.y+object[5])-2;
      const pixels:Buffer=ff('ffmpeg',['-v','error','-i',output,'-vf',`trim=start_frame=${frame}:end_frame=${frame+1},crop=4:4:${x}:${y}`,'-frames:v','1','-c:v','rawvideo','-f','image2pipe','-pix_fmt','rgb24','pipe:1']);
      assert.equal(pixels.length,48);
      let matching=0;
      for(let i=0;i<pixels.length;i+=3) {
        if(id==='dumbbell'?pixels[i]>150&&pixels[i]>pixels[i+1]*1.5&&pixels[i]>pixels[i+2]*1.5:pixels[i]<120&&pixels[i+1]>130&&pixels[i+2]>180)matching++;
      }
      assert.ok(matching>=8,`${id} should appear at its evaluated world position at frame ${frame}: ${matching}/16 pixels`);
    }
  }
  console.log('Gym decoded-frame smoke passed: 15s metadata and prop pixels at evaluated curl/sip/release samples. This is not naturalness or owner visual acceptance.');
}
