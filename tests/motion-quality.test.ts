import {beforeAll,describe,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {compileMotion,type MotionPlan} from '../packages/animation-runtime/src/motion';
import {evaluateSceneFrame,type SceneTimeline,type MultiSceneProps} from '../packages/animation-runtime/src/scene';
import {multiply,type Matrix} from '../packages/animation-runtime/src/evaluate-frame';
import {loadProject} from '../scripts/project';
let original: MultiSceneProps, corrected: MultiSceneProps, plan: MotionPlan, originalPlan: MotionPlan;
beforeAll(async()=>{
  const a=await loadProject('examples/m3/gym-reference'),b=await loadProject('examples/m3/gym-corrected');
  if (!('scene' in a) || !('scene' in b)) throw new Error('Expected Gym scenes');
  original=a;corrected=b;
  originalPlan=JSON.parse(await readFile('examples/m3/gym-reference/motion.json','utf8'));
  plan=JSON.parse(await readFile('examples/m3/gym-corrected/motion.json','utf8'));
});
const point=(m:Matrix,p:{x:number;y:number})=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
const state=(p:MultiSceneProps,frame:number,timeline=p.timeline)=>evaluateSceneFrame({...p,timeline,frame});
const part=(p:MultiSceneProps,frame:number,id:string,timeline=p.timeline)=>state(p,frame,timeline).find(o=>o.id==='man')!.parts.find(p=>p.id===id)!;
function contactError(p:MultiSceneProps,timeline:SceneTimeline,frame:number,id:string,contact:{x:number;y:number}) {
  const objects=state(p,frame,timeline),man=objects.find(o=>o.id==='man')!,hand=man.parts.find(p=>p.id==='hand')!;
  const h=point(multiply(man.matrix,hand.matrix),hand.pivot),o=point(objects.find(o=>o.id===id)!.matrix,contact);
  return Math.hypot(h.x-o.x,h.y-o.y);
}
const compile=(input:unknown)=>compileMotion(corrected.scene,corrected.rigs,input);
const track=(part:string,property:string,keys:[number,number][])=>({target:{object:'man',part},property,keyframes:keys.map(([time,value])=>({time,value,easing:'easeInOut'}))});
describe('M3.1 Gym reproduction and joint-driven motion',()=>{
  it('reproduces all original generated tracks; only the authored shadow track was added',()=>{
    const t=compileMotion(original.scene,original.rigs,originalPlan);
    for(const track of t.tracks) expect(original.timeline.tracks.find(t=>t.target.object===track.target.object&&t.target.part===track.target.part&&t.property===track.property)).toEqual(track);
    expect(original.timeline.tracks.length).toBe(t.tracks.length+1);
  });
  it('recompiles deterministically, preserves inputs and leaves the coffee contract unchanged',async()=>{
    const before=JSON.stringify(plan),t=compile(plan);
    expect(t).toEqual(corrected.timeline);expect(compile(plan)).toEqual(t);expect(JSON.stringify(plan)).toBe(before);
    const coffee=await loadProject('examples/m3/coffee');if(!('scene' in coffee))throw new Error('Expected scene');
    expect(compileMotion(coffee.scene,coffee.rigs,JSON.parse(await readFile('examples/m3/coffee/motion.json','utf8')))).toEqual(coffee.timeline);
  });
  it('confirms shoulder-driven Reach was the cause, then keeps the elbow stable during curls',()=>{
    const old=Array.from({length:91},(_,i)=>part(original,96+i,'arm-near-upper').rotation);
    expect(Math.max(...old)-Math.min(...old)).toBeGreaterThan(120);
    const elbow0=part(corrected,108,'arm-near-lower').matrix;
    for(let frame=108;frame<=186;frame++) {
      expect(part(corrected,frame,'arm-near-upper').rotation).toBeCloseTo(-12,9);
      const elbow=part(corrected,frame,'arm-near-lower');
      const now=point(elbow.matrix,elbow.pivot),initial=point(elbow0,elbow.pivot);
      expect(now.x).toBeCloseTo(initial.x,9);expect(now.y).toBeCloseTo(initial.y,9);
    }
    for(const frame of [120,144,168]) expect(part(corrected,frame,'arm-near-lower').rotation).toBeCloseTo(-125,9);
    for(const frame of [108,132,156,180]) expect(part(corrected,frame,'arm-near-lower').rotation).toBeCloseTo(-10,9);
    // A distinct ease-in/out segment starts and ends gently rather than sampling a linear sawtooth.
    const r=(f:number)=>part(corrected,f,'arm-near-lower').rotation;
    expect(Math.abs(r(109)-r(108))).toBeLessThan(Math.abs(r(114)-r(113)));
  });
  it('keeps dumbbell and bottle contacts at the hand pivot on every attached frame in both versions',()=>{
    for(const p of [original,corrected]) for(const [id,start,end,contact] of [['dumbbell',96,210,{x:30,y:22}],['bottle',246,306,{x:15,y:32}]] as const) {
      for(let f=start;f<=end;f++) expect(contactError(p,p.timeline,f,id,contact)).toBeLessThan(1e-7);
      const atRelease=state(p,end).find(o=>o.id===id)!.matrix;
      for(let f=end+1;f<360;f++) expect(state(p,f).find(o=>o.id===id)!.matrix).toEqual(atRelease);
    }
  });
  it('places the bottle opening at the mouth throughout the sip hold, not just the hand near the face',()=>{
    const mouth={x:501.2,y:268.8};
    const distance=(p:MultiSceneProps,f:number)=>{const m=state(p,f).find(o=>o.id==='bottle')!.matrix;const lip=point(m,{x:15,y:4});return Math.hypot(lip.x-mouth.x,lip.y-mouth.y);};
    expect(distance(original,270)).toBeGreaterThan(30);
    for(let f=270;f<=282;f++) expect(distance(corrected,f)).toBeLessThan(1e-7);
    const wrist=part(corrected,270,'hand').rotation;expect(Math.abs(wrist)).toBeLessThan(50);
  });
  it('keeps floor, rack and clock static and preserves all original rig pivots',()=>{
    expect(corrected.rigs).toEqual(original.rigs);
    for(let frame=0;frame<360;frame+=12) for(const id of ['floor','rack','clock']) {
      expect(state(corrected,frame).find(o=>o.id===id)!.matrix).toEqual(state(original,0).find(o=>o.id===id)!.matrix);
    }
  });
  it('supports transparent hand anchors and captures wrist rotation authored during pickup at the actual contact boundary',()=>{
    // The original hand SVG is transparent. Opacity/geometry is not a capability requirement.
    const scene={...original.scene,objects:original.scene.objects.map(o=>o.id==='man'?{...o,position:{x:340,y:157}}:o)};
    const input={...plan,duration:4,actions:[{type:'pickUp',id:'pickup',target:'man',start:0,duration:1,object:'dumbbell',contact:{x:30,y:22},bend:-1}],tracks:[track('hand','rotation',[[.5,0],[1,30],[2,60],[3,30]])]};
    const t=compileMotion(scene,original.rigs,input),p={...original,scene};
    const contact=state(p,24,t).find(o=>o.id==='dumbbell')!.matrix,initial=state(p,0,t).find(o=>o.id==='dumbbell')!.matrix;
    contact.forEach((value,i)=>expect(value).toBeCloseTo(initial[i],9));
    for(let f=24;f<96;f++) expect(contactError(p,t,f,'dumbbell',{x:30,y:22})).toBeLessThan(1e-7);
  });
  it('preserves authored easing and holds the pickup pose before the joint-driven interval starts',()=>{
    const t=compile(plan),upper=t.tracks.find(t=>t.target.part==='arm-near-upper')!;
    expect(upper.keyframes.find(k=>k.time===4)!.easing).toBe('easeInOut');
    const atPickup=part(corrected,96,'arm-near-upper').rotation;
    expect(atPickup).toBeCloseTo(-31.87644842551714,9);
    expect(part(corrected,97,'arm-near-upper').rotation).not.toBe(atPickup);
  });
  it.each([
    [track('missing','rotation',[[4,0],[5,20]]),/Unknown part/],
    [track('hand','rotation',[[4,0],[4.01,20]]),/frame boundaries/],
    [track('hand','rotation',[[4,50],[5,20]]),/discontinuous first value/],
    [track('hand','rotation',[[4,0],[16,20]]),/time exceeds duration/],
    [track('hand','rotation',[[4,0],[5,Infinity]]),/finite|number/i],
    [track('hand','position.x',[[4,100],[5,120]]),/rotation only/],
    [track('hand','rotation',[[4,0]]),/at least two/],
  ])('rejects invalid authored tracks %#',(bad,pattern)=>expect(()=>compile({...plan,tracks:[bad]})).toThrow(pattern));
  it('rejects unknown easing, duplicate tracks, conflicting Reach and attached-object tracks',()=>{
    const bad=track('hand','rotation',[[4,0],[5,20]]);bad.keyframes[0].easing='bounce';expect(()=>compile({...plan,tracks:[bad]})).toThrow();
    const t=track('hand','rotation',[[4,0],[5,20]]);expect(()=>compile({...plan,tracks:[t,t]})).toThrow(/duplicate track/);
    expect(()=>compile({...originalPlan,tracks:[track('arm-near-lower','rotation',[[4,58.486619110419156],[5,-20]])]})).toThrow(/conflicting/);
    const objectTrack={...t,target:{object:'dumbbell'}};expect(()=>compile({...plan,tracks:[...(plan.tracks ?? []),objectTrack]})).toThrow(/explicit motion tracks/);
  });
  it('rejects a moving ancestor during Reach instead of silently changing the solved contact',()=>{
    expect(()=>compile({...originalPlan,tracks:[track('torso','rotation',[[4,0],[4.75,5]])]})).toThrow(/moving arm ancestor/);
  });
});
