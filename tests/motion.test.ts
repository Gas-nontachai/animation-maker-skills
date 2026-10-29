import {describe,it,expect} from 'vitest';
import {compileMotion,motionPlanSchema} from '../packages/animation-runtime/src/motion';
import {validateScene,evaluateSceneFrame} from '../packages/animation-runtime/src/scene';
import {multiply} from '../packages/animation-runtime/src/evaluate-frame';
const part = (id:string,parent:string|null,x:number,y:number) => ({id,parent,position:{x,y},pivot:{x:0,y:0},asset:'part.svg',zIndex:0});
const rig = {version:'1.0',id:'person',canvas:{width:200,height:200},parts:[part('body',null,0,0),part('a','body',0,0),part('b','a',60,0),part('h','b',50,0),part('other','body',0,0),part('lt','body',0,40),part('rt','body',20,40),part('ll','lt',0,40),part('rl','rt',0,40)]};
const cup = {version:'1.0',id:'cup',canvas:{width:20,height:20},parts:[part('cup',null,0,0)]};
const scene = {version:'1.0',canvas:{width:1280,height:720},objects:[{id:'actor',rig:'person.json',position:{x:200,y:200}},{id:'cup',rig:'cup.json',position:{x:280,y:220}},{id:'desk',rig:'cup.json',position:{x:400,y:400}}]};
const rigs = {'person.json':rig,'cup.json':cup};
const mapping = {torso:'body',upperArm:'a',forearm:'b',hand:'h',otherUpperArm:'other',leftThigh:'lt',rightThigh:'rt',leftLowerLeg:'ll',rightLowerLeg:'rl'};
const action = (type:string,id:string,start:number,duration:number,params={}) => ({type,id,target:'actor',start,duration,...params});
const plan = (actions:unknown[],extra={}) => ({version:'1.0',fps:24,duration:4,rigs:{actor:mapping},actions,...extra});
const compile = (actions:unknown[]) => compileMotion(scene,rigs,plan(actions));
const frame = (timeline:ReturnType<typeof compile>,t:number,manifest:unknown=scene) => {const v=validateScene(manifest,timeline,rigs);return evaluateSceneFrame({...v,frame:Math.round(t*24)});};
const hand = (timeline:ReturnType<typeof compile>,t:number,manifest:unknown=scene) => {const o=frame(timeline,t,manifest)[0];return multiply(o.matrix,o.parts.find(p=>p.id==='h')!.matrix);};
describe('M3 motion compiler',()=>{
  it('generates deterministic editable M2 keyframes and preserves static objects',()=>{
    const actions=[action('walk','walk',0,1,{to:{x:220,y:200}}),action('sit','sit',1,1,{to:{x:220,y:220},dependencies:['walk']})];
    const t=compile(actions);expect(t).toEqual(compile(actions));expect(t.tracks.some(t=>t.target.object==='desk')).toBe(false);
    expect(frame(t,1)[0].matrix[4]).toBe(220);expect(frame(t,2)[0].matrix[5]).toBe(220);
    const rotation=t.tracks.find(t=>t.target.part==='lt')!;
    expect(rotation.keyframes.find(k=>k.time===1)!.value).toBe(0);
    expect(rotation.keyframes.at(-1)!.value).toBe(-80);
  });
  it('holds transforms across gaps and supports nonconflicting overlap',()=>{
    const t=compile([action('walk','walk',0,1,{to:{x:220,y:200}}),action('walk','walk2',2,1,{to:{x:240,y:200}})]);
    expect(frame(t,1.5)[0].matrix[4]).toBe(220);
    const s={...scene,objects:[...scene.objects,{id:'other',rig:'person.json'}]};
    expect(()=>compileMotion(s,rigs,{...plan([action('walk','one',0,1,{to:{x:220,y:200}}),{...action('reach','two',0,1,{to:{x:80,y:20}}),target:'other'}]),rigs:{actor:mapping,other:mapping}})).not.toThrow();
  });
  it('solves reach under rotated, scaled scene and parent transforms',()=>{
    const s={...scene,objects:scene.objects.map(o=>o.id==='actor'?{...o,rotation:30,scale:{x:1.2,y:0.8}}:o)};
    const r={...rig,parts:rig.parts.map(p=>p.id==='body'?{...p,rotation:20}:p)};
    const rs={...rigs,'person.json':r};
    const t=compileMotion(s,rs,plan([action('reach','reach',0,1,{to:{x:250,y:240}})]));
    const o=evaluateSceneFrame({...validateScene(s,t,rs),frame:24})[0];const m=multiply(o.matrix,o.parts.find(p=>p.id==='h')!.matrix);
    expect(m[4]).toBeCloseTo(250,8);expect(m[5]).toBeCloseTo(240,8);
  });
  it('maintains hand/object matrix offset then holds released object',()=>{
    const t=compile([action('pickUp','pick',0,1,{object:'cup',contact:{x:0,y:0}}),action('reach','lift',1,1,{to:{x:250,y:150},dependencies:['pick']}),action('putDown','put',2,1,{object:'cup',to:{x:280,y:220},dependencies:['lift']})]);
    expect(frame(t,1)[1].matrix[4]).toBeCloseTo(280,8);
    const atContact=hand(t,1),objContact=frame(t,1)[1].matrix;
    for (const time of [1.25,1.5,2,2.5,3]) {
      const h=hand(t,time),o=frame(t,time)[1].matrix;
      // Contact at the hand pivot: origins stay coincident through pickup, transport and release.
      expect(o[4]).toBeCloseTo(h[4],7);expect(o[5]).toBeCloseTo(h[5],7);
      expect(Math.atan2(o[1],o[0])-Math.atan2(h[1],h[0])).toBeCloseTo(Math.atan2(objContact[1],objContact[0])-Math.atan2(atContact[1],atContact[0]),7);
    }
    expect(frame(t,3.5)[1].matrix).toEqual(frame(t,3)[1].matrix);
  });
  it('preserves nonzero local contact offsets and rotated object placement',()=>{
    const s={...scene,objects:scene.objects.map(o=>o.id==='cup'?{...o,rotation:25,scale:{x:1.4,y:1.4}}:o)};
    const t=compileMotion(s,rigs,plan([action('pickUp','pick',0,1,{object:'cup',contact:{x:5,y:3}}),action('reach','lift',1,1,{to:{x:250,y:150}})]));
    for (const time of [1,1.5,2]) {const o=frame(t,time,s)[1].matrix,h=hand(t,time,s);expect(o[0]*5+o[2]*3+o[4]).toBeCloseTo(h[4],7);expect(o[1]*5+o[3]*3+o[5]).toBeCloseTo(h[5],7);}
  });
  it.each([
    [[action('reach','bad',0,0,{to:{x:250,y:220}})],/duration/],
    [[action('reach','bad',0,1,{to:{x:Infinity,y:220}})],/finite|number/i],
    [[action('reach','bad',0.01,1,{to:{x:250,y:220}})],/frame/],
    [[action('reach','bad',0,1,{to:{x:900,y:900}})],/unreachable/],
    [[action('drink','bad',0,1)],/type/],
    [[action('walk','a',0,1,{to:{x:220,y:200}}),action('walk','b',0.5,1,{to:{x:230,y:200}})],/conflicting/],
    [[action('reach','a',0,1,{to:{x:250,y:220},dependencies:['missing']})],/unknown dependency/],
    [[action('reach','a',0,1,{to:{x:250,y:220},dependencies:['b']}),action('reach','b',1,1,{to:{x:250,y:220},dependencies:['a']})],/cycle/],
    [[action('putDown','bad',0,1,{object:'cup',to:{x:280,y:220}})],/not attached/],
    [[action('pickUp','bad',0,1,{object:'missing',contact:{x:0,y:0}})],/Unknown object/],
    [[action('walk','a',0,1,{to:{x:220,y:200}}),action('reach','b',0,1,{to:{x:250,y:220}})],/conflicting|ancestor/],
  ])('rejects invalid actions %#',(actions,pattern)=>expect(()=>compile(actions as unknown[])).toThrow(pattern as RegExp));
  it('validates mappings and hierarchy rather than substituting motion',()=>{
    expect(()=>compileMotion(scene,rigs,{...plan([action('reach','a',0,1,{to:{x:250,y:220}})]),rigs:{actor:{}}})).toThrow(/upperArm/);
    expect(()=>compileMotion(scene,rigs,{...plan([action('reach','a',0,1,{to:{x:250,y:220}})]),rigs:{actor:{...mapping,hand:'missing'}}})).toThrow(/unknown part/);
    expect(()=>compileMotion(scene,rigs,{...plan([action('reach','a',0,1,{to:{x:250,y:220}})]),rigs:{actor:{...mapping,hand:'other',otherUpperArm:undefined}}})).toThrow(/hierarchy/);
    expect(motionPlanSchema.safeParse({...plan([]),version:'2.0'}).success).toBe(false);
  });
  it('rejects unsatisfied timing dependencies and duplicate IDs',()=>{
    expect(()=>compile([action('reach','a',0,2,{to:{x:250,y:220}}),action('reach','b',1,1,{to:{x:260,y:220},dependencies:['a']})])).toThrow(/has not ended/);
    expect(()=>compile([action('reach','a',0,1,{to:{x:250,y:220}}),action('reach','a',1,1,{to:{x:260,y:220}})])).toThrow(/duplicate/);
  });
});

it('recompiles the representative editable fixture and validates its safe assets',async()=>{
  const {loadProject}=await import('../scripts/project');
  const {readFile}=await import('node:fs/promises');
  const p=await loadProject('examples/m3/coffee');
  if (!('scene' in p)) throw new Error('Expected scene');
  const input=JSON.parse(await readFile('examples/m3/coffee/motion.json','utf8'));
  expect(compileMotion(p.scene,p.rigs,input)).toEqual(p.timeline);
});
it('rejects unsupported scales, disconnected semantic legs and singular ancestors',()=>{
  const actions=[action('reach','a',0,1,{to:{x:250,y:220}})];
  const scaled={...rig,parts:rig.parts.map(p=>p.id==='a'?{...p,scale:{x:2,y:1}}:p)};
  expect(()=>compileMotion(scene,{...rigs,'person.json':scaled},plan(actions))).toThrow(/unit local scale/);
  const singular={...rig,parts:rig.parts.map(p=>p.id==='body'?{...p,scale:{x:0,y:1}}:p)};
  expect(()=>compileMotion(scene,{...rigs,'person.json':singular},plan(actions))).toThrow(/singular/);
  const broken={...rig,parts:rig.parts.map(p=>p.id==='ll'?{...p,parent:'body'}:p)};
  expect(()=>compileMotion(scene,{...rigs,'person.json':broken},plan([action('sit','sit',0,1,{to:{x:200,y:220}})]))).toThrow(/leftLowerLeg/);
});
it('rejects shear when compiling attachment motion and preserves hand pivots',()=>{
  const actions=[action('pickUp','p',0,1,{object:'cup',contact:{x:0,y:0}}),action('reach','r',1,1,{to:{x:250,y:150}})];
  const s={...scene,objects:scene.objects.map(o=>o.id==='actor'?{...o,scale:{x:1.5,y:1}}:o)};
  expect(()=>compileMotion(s,rigs,plan(actions))).toThrow(/shear/);
  const pivoted={...rig,parts:rig.parts.map(p=>p.id==='h'?{...p,pivot:{x:7,y:4},rotation:20}:p)};
  const t=compileMotion(scene,{...rigs,'person.json':pivoted},plan(actions));
  for(const time of [1,1.5,2]) {
    const o=evaluateSceneFrame({...validateScene(scene,t,{...rigs,'person.json':pivoted}),frame:time*24});
    const m=multiply(o[0].matrix,o[0].parts.find(p=>p.id==='h')!.matrix);
    expect(m[0]*7+m[2]*4+m[4]).toBeCloseTo(o[1].matrix[4],7);
    expect(m[1]*7+m[3]*4+m[5]).toBeCloseTo(o[1].matrix[5],7);
  }
});
it('plan CLI preserves sources and refuses overwrites',async()=>{
  const {execFileSync}=await import('node:child_process');
  const {mkdtemp,readFile,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');const path=await import('node:path');
  const dir=await mkdtemp(path.join(tmpdir(),'m3-plan-'));
  try {
    const output=path.join(dir,'nested','timeline.json');
    const args=['bin/animation-maker.mjs','plan','--project','examples/m3/coffee','--output',output];
    execFileSync(process.execPath,args,{stdio:'pipe'});
    const before=await readFile(output,'utf8');
    expect(()=>execFileSync(process.execPath,args,{stdio:'pipe'})).toThrow();
    expect(await readFile(output,'utf8')).toBe(before);
    expect(JSON.parse(before)).toEqual(JSON.parse(await readFile('examples/m3/coffee/timeline.json','utf8')));
  } finally {await rm(dir,{recursive:true,force:true});}
});
it('preserves a released object while the character moves away and unwraps authored rotations',()=>{
  const s={...scene,objects:scene.objects.map(o=>o.id==='cup'?{...o,rotation:360}:o)};
  const t=compileMotion(s,rigs,plan([action('pickUp','p',0,1,{object:'cup',contact:{x:0,y:0}}),action('putDown','put',1,1,{object:'cup',to:{x:270,y:230}}),action('walk','away',2,1,{to:{x:150,y:200}})]));
  expect(frame(t,2,s)[1].matrix).toEqual(frame(t,3,s)[1].matrix);
  expect(t.tracks.find(t=>t.target.object==='cup'&&t.property==='rotation')!.keyframes.find(k=>k.time===1)!.value).toBeCloseTo(360,8);
});
