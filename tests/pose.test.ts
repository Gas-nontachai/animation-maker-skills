import {beforeAll,describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {loadProject} from '../scripts/project';
import {compileMotion,motionPlanSchema} from '../packages/animation-runtime/src/motion';
import {evaluateSceneFrame,type MultiSceneProps,type SceneTimeline} from '../packages/animation-runtime/src/scene';
import {multiply,type Matrix} from '../packages/animation-runtime/src/evaluate-frame';
const fixtures:Record<string,{p:MultiSceneProps;plan:any}>={};
beforeAll(async()=>{for(const name of ['gym-phase2','pose-robot','pose-transition']){const p=await loadProject(`examples/m3/${name}`);if(!('scene' in p))throw Error('Expected scene');fixtures[name]={p,plan:JSON.parse(await readFile(`examples/m3/${name}/motion.json`,'utf8'))};}});
const clone=<T,>(x:T):T=>structuredClone(x);
const compile=(input:unknown,name='pose-robot')=>{const {p}=fixtures[name];return compileMotion(p.scene,p.rigs,input);};
const state=(name:string,frame:number,timeline?:SceneTimeline)=>{const {p}=fixtures[name];return evaluateSceneFrame({...p,timeline:timeline??p.timeline,frame});};
const point=(m:Matrix,p:{x:number;y:number})=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
function simple(){const p=clone(fixtures['pose-robot'].plan);p.actions=[{id:'transition',type:'pose',target:'robot',start:0,duration:1,pose:'rest'}];delete p.secondary;return p;}
describe('Phase 2 semantic poses and constraints',()=>{
  it.each(['gym-phase2','pose-robot','pose-transition'])('recompiles %s deterministically without mutating input',name=>{const {p,plan}=fixtures[name],before=JSON.stringify(plan);expect(compile(plan,name)).toEqual(p.timeline);expect(compile(plan,name)).toEqual(compile(plan,name));expect(JSON.stringify(plan)).toBe(before);});
  it('keeps differently authored shoulders stable while flexing only the elbow during repetitions',()=>{
    for(const [name,target,start,end,shoulder] of [['gym-phase2','man',108,180,-12],['pose-robot','robot',36,108,65]] as const){
      const map=fixtures[name].plan.rigs[target];
      const angles=[];for(let f=start;f<=end;f++){const parts=state(name,f).find(o=>o.id===target)!.parts;expect(parts.find(p=>p.id===map.upperArm)!.rotation).toBeCloseTo(shoulder,9);angles.push(parts.find(p=>p.id===map.forearm)!.rotation);}
      expect(Math.max(...angles)-Math.min(...angles)).toBeGreaterThan(100);
    }
  });
  it('respects every declared limit on every rendered frame',()=>{
    for(const name of ['gym-phase2','pose-robot','pose-transition']){const {p,plan}=fixtures[name];for(let f=0;f<p.timeline.duration*p.timeline.fps;f++)for(const [target,rules] of Object.entries(plan.constraints) as [string,Record<string,{min:number;max:number}>][]){const parts=state(name,f).find(o=>o.id===target)!.parts;for(const [role,rule] of Object.entries(rules)){const angle=parts.find(p=>p.id===plan.rigs[target][role])!.rotation;expect(angle).toBeGreaterThanOrEqual(rule.min-1e-7);expect(angle).toBeLessThanOrEqual(rule.max+1e-7);}}}
  });
  it('holds named pose boundaries and uses existing easing for transitions',()=>{
    const {plan}=fixtures['pose-robot'],t=compile(plan),map=plan.rigs.robot;
    const fore=t.tracks.find(t=>t.target.part===map.forearm)!;
    expect(fore.keyframes.find(k=>k.time===1.5)!.value).toBe(-20);expect(fore.keyframes.find(k=>k.time===1.5)!.easing).toBe('easeInOut');
    expect(fore.keyframes.find(k=>k.time===2)!.value).toBe(-125);expect(fore.keyframes.filter(k=>k.time===2)).toHaveLength(1);
    const angle=(f:number)=>state('pose-robot',f).find(o=>o.id==='robot')!.parts.find(p=>p.id===map.forearm)!.rotation;
    expect(Math.abs(angle(37)-angle(36))).toBeLessThan(Math.abs(angle(42)-angle(41)));
    const transition=fixtures['pose-transition'].p.timeline;
    expect(transition.tracks.find(t=>t.target.part==='upper')!.keyframes.filter(k=>k.time===3.75)).toHaveLength(1);
  });
  it('keeps contacts continuous for both visible and transparent hands, including secondary head motion',()=>{
    for(const [name,target,props] of [['gym-phase2','man',[['dumbbell',96,210,{x:30,y:22}],['bottle',246,306,{x:15,y:32}]]],['pose-robot','robot',[['weight',24,144,{x:30,y:22}],['water',168,228,{x:15,y:32}]]]] as const){
      const map=fixtures[name].plan.rigs[target];
      for(const [id,start,end,contact] of props){for(let f=start;f<=end;f++){const s=state(name,f),actor=s.find(o=>o.id===target)!,hand=actor.parts.find(p=>p.id===map.hand)!,h=point(multiply(actor.matrix,hand.matrix),hand.pivot),o=point(s.find(o=>o.id===id)!.matrix,contact);expect(Math.hypot(h.x-o.x,h.y-o.y)).toBeLessThan(1e-7);}
      const released=state(name,end).find(o=>o.id===id)!.matrix;expect(state(name,fixtures[name].p.timeline.fps*fixtures[name].p.timeline.duration-1).find(o=>o.id===id)!.matrix).toEqual(released);}
    }
  });
  it('keeps bottle openings at each differently placed mouth during sip holds',()=>{
    for(const [name,id,start,end,mouth] of [['gym-phase2','bottle',270,282,{x:501.2,y:268.8}],['pose-robot','water',192,204,{x:466.209862294356,y:297.7435086792658}]] as const)for(let f=start;f<=end;f++){const lip=point(state(name,f).find(o=>o.id===id)!.matrix,{x:15,y:4});expect(Math.hypot(lip.x-mouth.x,lip.y-mouth.y)).toBeLessThan(1e-7);}
  });
  it('leaves unaffected scene objects static',()=>{for(const name of ['gym-phase2','pose-robot','pose-transition']){const target=name==='gym-phase2'?'rack':name==='pose-robot'?'station':'desk';expect(state(name,0).find(o=>o.id===target)!.matrix).toEqual(state(name,120).find(o=>o.id===target)!.matrix);}});
  it('uses compatible preferred configurations without overriding explicit pose targets',()=>{const p=simple();p.poses.rest={joints:{forearm:-70},preferred:{upperArm:75,hand:5}};const t=compile(p),s=state('pose-robot',24,t).find(o=>o.id==='robot')!;expect(s.parts.find(p=>p.id==='servo')!.rotation).toBe(75);expect(s.parts.find(p=>p.id==='lever')!.rotation).toBe(-70);});
  it('automatically selects a constrained Reach branch and rejects a conflicting explicit branch',()=>{const p=simple();p.actions=[{id:'reach',type:'reach',target:'robot',start:0,duration:1,to:{x:570,y:320}}];const t=compile(p);expect(state('pose-robot',24,t).find(o=>o.id==='robot')!.parts.find(p=>p.id==='lever')!.rotation).toBeLessThan(0);p.actions[0].bend=1;expect(()=>compile(p)).toThrow(/no reachable pose/);});
  it('does not change legacy Reach selection for constraints on unrelated joints',()=>{const p=simple();p.actions=[{id:'reach',type:'reach',target:'robot',start:0,duration:1,to:{x:570,y:320}}];delete p.constraints;const base=compile(p);p.constraints={robot:{head:{min:-5,max:5}}};expect(compile(p)).toEqual(base);});
  it('preserves automatic branch selection through schema validation and JSON round trips',()=>{const p=simple();p.actions=[{id:'reach',type:'reach',target:'robot',start:0,duration:1,to:{x:570,y:320}}];const expected=compile(p);expect(compile(motionPlanSchema.parse(p))).toEqual(expected);expect(compile(JSON.parse(JSON.stringify(motionPlanSchema.parse(p))))).toEqual(expected);p.actions[0].bend='auto';expect(compile(p)).toEqual(expected);});
  it('uses joint preferences deterministically when both Reach branches satisfy limits',()=>{const p=simple();p.actions=[{id:'reach',type:'reach',target:'robot',start:0,duration:1,to:{x:570,y:320}}];p.constraints.robot.upperArm={min:-180,max:180,preferred:65};p.constraints.robot.forearm={min:-180,max:180,preferred:150};const t=compile(p);expect(state('pose-robot',24,t).find(o=>o.id==='robot')!.parts.find(p=>p.id==='lever')!.rotation).toBeGreaterThan(0);expect(compile(p)).toEqual(t);});
  it.each([
    ['reversed bounds',(p:any)=>p.constraints.robot.upperArm={min:80,max:70},/min exceeds max/],
    ['invalid preference',(p:any)=>p.constraints.robot.upperArm={min:0,max:90,preferred:100},/preferred angle outside/],
    ['nonfinite',(p:any)=>p.constraints.robot.upperArm.min=Infinity,/finite|number/i],
    ['negative stability',(p:any)=>p.constraints.robot.upperArm.stability=-1,/small|>=0|negative/i],
    ['initial angle',(p:any)=>p.constraints.robot.upperArm={min:70,max:90},/initial rig angle/],
    ['unmapped constraint',(p:any)=>p.constraints.robot.otherUpperArm={min:-10,max:10},/mapped rig part/],
    ['unknown pose',(p:any)=>p.actions[0].pose='missing',/unknown pose/],
    ['unmapped pose',(p:any)=>p.poses.rest.joints={otherUpperArm:0},/semantic part/],
    ['empty pose',(p:any)=>p.poses.rest.joints={},/at least one/],
    ['incompatible preference',(p:any)=>p.poses.rest.preferred={upperArm:70},/conflicts/],
    ['unsatisfiable pose',(p:any)=>p.poses.rest.joints.forearm=10,/unsatisfiable/],
    ['stability',(p:any)=>{p.constraints.robot.upperArm.stability=5;p.poses.rest.joints.upperArm=80;},/stability limit/],
  ])('rejects %s',(_,mutate,pattern)=>{const p=simple();mutate(p);expect(()=>compile(p)).toThrow(pattern);});
  it('validates authored tracks against joint constraints and rejects pose conflicts',()=>{const p=simple();p.tracks=[{target:{object:'robot',part:'lever'},property:'rotation',keyframes:[{time:1,value:-20},{time:2,value:5}]}];expect(()=>compile(p)).toThrow(/joint limits/);p.tracks[0].keyframes=[{time:0,value:-20},{time:1,value:-70}];expect(()=>compile(p)).toThrow(/conflicting/);});
  it('preserves unsupported-rig diagnostics and rejects unreachable actions without substituting a pose',()=>{const p=simple();p.actions=[{id:'reach',type:'reach',target:'robot',start:0,duration:1,to:{x:10000,y:10000}}];expect(()=>compile(p)).toThrow(/unreachable/);const {p:fixture}=fixtures['pose-robot'],rigs=clone(fixture.rigs);rigs['assets/robot/rig.json'].parts.find(p=>p.id==='socket')!.parent='core';p.actions[0].to={x:570,y:320};expect(()=>compileMotion(fixture.scene,rigs,p)).toThrow(/hierarchy/);});
});
describe('Optional deterministic secondary motion',()=>{
  it('is disabled by default and by zero intensity',()=>{const p=simple(),base=compile(p);p.secondary=[{target:'robot',joint:'head',start:0,duration:1}];expect(compile(p)).toEqual(base);});
  it('returns to the baseline at exact boundaries and remains within configured intensity',()=>{const {p,plan}=fixtures['pose-robot'];const track=p.timeline.tracks.find(t=>t.target.part==='sensor')!;expect(track.keyframes.find(k=>k.time===1.5)!.value).toBe(0);expect(track.keyframes.at(-1)!.value).toBe(0);expect(Math.max(...track.keyframes.map(k=>Math.abs(k.value)))).toBeLessThanOrEqual(.6);expect(compile(plan)).toEqual(p.timeline);});
  it('rejects secondary motion that disturbs primary joints or a held-object ancestor',()=>{const p=clone(fixtures['pose-robot'].plan);p.secondary=[{target:'robot',joint:'torso',start:1.5,duration:1,intensity:.5}];expect(()=>compile(p)).toThrow(/disturb a primary/);p.secondary[0].start=4.5;p.secondary[0].duration=.5;expect(()=>compile(p)).toThrow(/held-object ancestor/);});
  it('respects joint limits and sampling constraints',()=>{const p=clone(fixtures['pose-robot'].plan);p.constraints.robot.head={min:-.01,max:.01};expect(()=>compile(p)).toThrow(/joint limits/);delete p.constraints.robot.head;p.secondary[0].start=.01;expect(()=>compile(p)).toThrow(/timing/);});
});
