import {motionPlanSchema, roles, type MotionAction, type SemanticRig} from './contracts';
import {validateScene, evaluateSceneFrame, type SceneTimeline} from '../scene';
import {multiply, type Matrix} from '../evaluate-frame';
import {interpolate} from '../interpolation';
export * from './contracts';
type Point = {x: number; y: number};
type Track = SceneTimeline['tracks'][number];
type Span = {id: string; type: string; target: string; start: number; duration: number};
const identity: Matrix = [1, 0, 0, 1, 0, 0];
const point = (m: Matrix, p: Point): Point => ({x: m[0]*p.x + m[2]*p.y + m[4], y: m[1]*p.x + m[3]*p.y + m[5]});
function inverse(m: Matrix): Matrix {
  const d = m[0]*m[3] - m[1]*m[2];
  if (Math.abs(d) < 1e-10) throw new Error('singular transform');
  return [m[3]/d, -m[1]/d, -m[2]/d, m[0]/d, (m[2]*m[5]-m[3]*m[4])/d, (m[1]*m[4]-m[0]*m[5])/d];
}
const degrees = (r: number) => r*180/Math.PI;
const nearest = (angle: number, from: number) => from + ((angle-from+180)%360+360)%360-180;
/** Compile a validated, explicit action plan into unchanged M2 tracks. No runtime constraints. */
export function compileMotion(manifest: unknown, inputs: Record<string, unknown>, input: unknown): SceneTimeline {
  const plan = motionPlanSchema.parse(input);
  const {scene, rigs} = validateScene(manifest, {version: '1.0', fps: plan.fps, duration: plan.duration, tracks: []}, inputs);
  const timeline: SceneTimeline = {version: '1.0', fps: plan.fps, duration: plan.duration, tracks: []};
  const fail = (a: Span, message: string): never => {throw new Error(`Action ${a.id} (${a.type}, ${a.target}): ${message}`);};
  const object = (id: string) => {const o = scene.objects.find(o => o.id === id); if (!o) throw new Error(`Unknown object ${id}`); return o;};
  const mapping = (a: MotionAction, required: (keyof SemanticRig)[]) => {
    const map = plan.rigs[a.target];
    if (!map) return fail(a, 'missing semantic rig mapping');
    for (const role of required) if (!map[role]) fail(a, `required semantic part ${role}`);
    return map;
  };
  // Validate all references, capabilities and dependencies before generating tracks.
  for (const [target, map] of Object.entries(plan.rigs)) {
    const rig = rigs[object(target).rig];
    const seen = new Set<string>();
    for (const role of roles) if (map[role]) {
      if (!rig.parts.some(p => p.id === map[role])) throw new Error(`${target}.${role}: unknown part ${map[role]}`);
      if (seen.has(map[role]!)) throw new Error(`${target}.${role}: semantic parts must be distinct`);
      seen.add(map[role]!);
    }
  }
  const ids = new Map<string, MotionAction>();
  for (const a of plan.actions) {
    if (ids.has(a.id)) fail(a, 'duplicate action ID');
    ids.set(a.id, a); object(a.target);
    if (a.start+a.duration > plan.duration+1e-9) fail(a, 'end exceeds plan duration');
    if (![a.start, a.duration].every(t => Math.abs(t*plan.fps-Math.round(t*plan.fps)) < 1e-8)) fail(a, 'start and duration must align with frame boundaries');
    const map = mapping(a, a.type === 'walk' ? ['leftThigh','rightThigh','leftLowerLeg','rightLowerLeg','upperArm','otherUpperArm'] : a.type === 'sit' ? ['torso','leftThigh','rightThigh','leftLowerLeg','rightLowerLeg'] : ['upperArm','forearm','hand']);
    const rig = rigs[object(a.target).rig];
    if (a.type === 'walk' || a.type === 'sit') {
      for (const [lower, upper] of [['leftLowerLeg','leftThigh'],['rightLowerLeg','rightThigh']] as const) {
        if (rig.parts.find(p => p.id === map[lower])!.parent !== map[upper]) fail(a, `${lower} must be a direct child of ${upper}`);
      }
      if (a.type === 'walk' && Math.round(a.duration*plan.fps) < a.cycles*4) fail(a, 'walk needs at least four frames per cycle');
    }
    if ('object' in a) {object(a.object); if (a.object === a.target) fail(a, 'cannot attach character to itself');}
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(a: MotionAction) {
    if (visiting.has(a.id)) fail(a, 'dependency cycle');
    if (visited.has(a.id)) return;
    visiting.add(a.id);
    for (const dep of a.dependencies) {const before = ids.get(dep); if (!before) fail(a, `unknown dependency ${dep}`); visit(before!); if (before!.start+before!.duration > a.start+1e-9) fail(a, `dependency ${dep} has not ended`);}
    visiting.delete(a.id); visited.add(a.id);
  }
  plan.actions.forEach(visit);
  const actions = [...plan.actions].sort((a,b) => a.start-b.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const authored = validateScene(scene, {...timeline, tracks: plan.tracks ?? []}, rigs).timeline.tracks.map(track => {
    const first = track.keyframes[0], last = track.keyframes.at(-1)!;
    const span: Span = {id: `track:${track.target.object}/${track.target.part ?? ''}/${track.property}`, type: 'authored', target: track.target.object, start: first.time, duration: last.time-first.time};
    if (track.target.part && track.property !== 'rotation') fail(span, 'authored part tracks support rotation only; keep joint positions, pivots and scales in the rig');
    if (track.keyframes.length < 2) fail(span, 'authored track needs at least two keyframes');
    if (track.keyframes.some(k => Math.abs(k.time*plan.fps-Math.round(k.time*plan.fps)) > 1e-8)) fail(span, 'keyframes must align with frame boundaries');
    return {track, span};
  });
  type Claim = {start: number; end: number; action: string};
  const claims = new Map<string, Claim[]>();
  const key = (target: Track['target'], property: Track['property']) => JSON.stringify([target.object,target.part ?? null,property]);
  function value(target: Track['target'], property: Track['property'], time: number) {
    const track = timeline.tracks.find(t => key(t.target,t.property) === key(target,property));
    if (track) return interpolate({...track, target: ''}, time);
    const o = object(target.object), p = target.part ? rigs[o.rig].parts.find(p => p.id === target.part)! : o;
    switch (property) {case 'position.x': return p.position.x; case 'position.y': return p.position.y; case 'rotation': return p.rotation; case 'scale.x': return p.scale.x; case 'scale.y': return p.scale.y; case 'opacity': return p.opacity;}
  }
  function insert(a: Span, target: Track['target'], property: Track['property'], keys: Track['keyframes']) {
    const k = key(target,property), ranges = claims.get(k) ?? [];
    if (ranges.some(r => a.start < r.end-1e-9 && a.start+a.duration > r.start+1e-9)) fail(a, `conflicting ${k} with ${ranges.find(r => a.start < r.end && a.start+a.duration > r.start)?.action}`);
    const from = value(target,property,a.start);
    if (a.start > 0 && Math.abs(keys[0].value-from) > 1e-6) fail(a, `discontinuous first value for ${k}: expected ${from}, got ${keys[0].value}`);
    let track = timeline.tracks.find(t => key(t.target,t.property) === k);
    if (!track) {track = {target,property,keyframes:[{time:0,value:from,easing:'linear'}]}; timeline.tracks.push(track);}
    // Preserve the hold before each action, including gaps between actions.
    for (const kf of keys) {const existing = track.keyframes.find(k => Math.abs(k.time-kf.time)<1e-9); if (existing) Object.assign(existing,kf); else track.keyframes.push(kf);}
    track.keyframes.sort((a,b) => a.time-b.time); ranges.push({start:a.start,end:a.start+a.duration,action:a.id}); claims.set(k,ranges);
  }
  function write(a: MotionAction, target: Track['target'], property: Track['property'], end: number, samples?: number[]) {
    const from = value(target,property,a.start);
    const keys = samples ? samples.map((v,i) => ({time:(Math.round(a.start*plan.fps)+i)/plan.fps,value:v,easing:'linear' as const})) : [{time:a.start,value:from,easing:a.easing},{time:a.start+a.duration,value:end,easing:'linear' as const}];
    insert(a,target,property,keys);
  }
  function states(time: number) {
    // The evaluator rejects the exclusive endpoint; extend only this private evaluation view by one frame.
    return evaluateSceneFrame({scene, rigs, timeline:{...timeline,duration:plan.duration+1/plan.fps},frame:Math.round(time*plan.fps)});
  }
  function handMatrix(a: MotionAction, time: number) {
    const state = states(time).find(o => o.id === a.target)!;
    return multiply(state.matrix,state.parts.find(p => p.id === plan.rigs[a.target].hand)!.matrix);
  }
  function reach(a: MotionAction, to: Point) {
    const map = mapping(a,['upperArm','forearm','hand']), rig = rigs[object(a.target).rig];
    const upper = rig.parts.find(p => p.id === map.upperArm)!, lower = rig.parts.find(p => p.id === map.forearm)!, hand = rig.parts.find(p => p.id === map.hand)!;
    if (lower.parent !== upper.id || hand.parent !== lower.id) fail(a,'requires direct upperArm → forearm → hand hierarchy');
    if ([upper,lower].some(p => p.scale.x !== 1 || p.scale.y !== 1)) fail(a,'arm links require unit local scale');
    const state = states(a.start).find(o => o.id === a.target)!;
    const parent = upper.parent ? state.parts.find(p => p.id === upper.parent)!.matrix : identity;
    const desired = point(inverse(multiply(state.matrix,parent)),to);
    const x = desired.x-upper.position.x, y = desired.y-upper.position.y;
    const v1 = {x:lower.position.x-upper.pivot.x,y:lower.position.y-upper.pivot.y};
    const v2 = {x:hand.position.x-lower.pivot.x,y:hand.position.y-lower.pivot.y};
    const l1 = Math.hypot(v1.x,v1.y), l2 = Math.hypot(v2.x,v2.y), d = Math.hypot(x,y);
    if (l1 < 1e-6 || l2 < 1e-6 || d < 1e-6 || d > l1+l2+1e-7 || d < Math.abs(l1-l2)-1e-7) fail(a,`unreachable contact (${to.x}, ${to.y}); link lengths ${l1}, ${l2}`);
    const bend = 'bend' in a ? a.bend : 1;
    const elbow = bend*Math.acos(Math.max(-1,Math.min(1,(d*d-l1*l1-l2*l2)/(2*l1*l2))));
    const shoulder = Math.atan2(y,x)-Math.atan2(l2*Math.sin(elbow),l1+l2*Math.cos(elbow));
    for (const [part,angle] of [[upper.id,degrees(shoulder-Math.atan2(v1.y,v1.x))],[lower.id,degrees(elbow+Math.atan2(v1.y,v1.x)-Math.atan2(v2.y,v2.x))]] as const) {
      const target = {object:a.target,part}; write(a,target,'rotation',nearest(angle,value(target,'rotation',a.start)));
    }
  }
  type Attachment = {action: MotionAction; object: string; start: number; end: number; initial: Matrix};
  const attachments: Attachment[] = [], held = new Map<string, Attachment>();
  const events = [
    ...actions.map(action => ({span: action, action, authored: null})),
    ...authored.map(item => ({span: item.span, action: null, authored: item.track})),
  ].sort((a,b) => a.span.start-b.span.start || (a.span.id < b.span.id ? -1 : a.span.id > b.span.id ? 1 : 0));
  for (const event of events) {
    if (event.authored) {insert(event.span,event.authored.target,event.authored.property,event.authored.keyframes); continue;}
    const a = event.action!;
    try {
      const map = plan.rigs[a.target], target = {object:a.target};
      if (a.type === 'walk' || a.type === 'sit') {
        write(a,target,'position.x',a.to.x); write(a,target,'position.y',a.to.y);
        const poses: [keyof SemanticRig,number][] = a.type === 'walk' ? [['leftThigh',1],['rightThigh',-1],['leftLowerLeg',-0.5],['rightLowerLeg',0.5],['upperArm',-1],['otherUpperArm',1]] : [['torso',0.12],['leftThigh',-1],['rightThigh',-1],['leftLowerLeg',1],['rightLowerLeg',1]];
        for (const [role,sign] of poses) {
          const t = {...target,part:map[role]!}, base = value(t,'rotation',a.start);
          if (a.type === 'walk') {const n = Math.round(a.duration*plan.fps); write(a,t,'rotation',base,Array.from({length:n+1},(_,i) => base+(i===n ? 0 : Math.sin(i/n*a.cycles*2*Math.PI)*a.amplitude*sign)));}
          else write(a,t,'rotation',base+a.amplitude*sign);
        }
      } else if (a.type === 'reach') reach(a,a.to);
      else if (a.type === 'pickUp') {
        if (attachments.some(h => h.object === a.object)) fail(a,'repeated pickup of the same object in one plan is unsupported');
        if (held.has(a.object) || [...held.values()].some(h => h.action.target === a.target)) fail(a,'object or hand already attached');
        const initial = states(a.start).find(o => o.id === a.object)!.matrix;
        reach(a,point(initial,a.contact));
        const start = a.start+a.duration;
        const attach = {action:a,object:a.object,start,end:plan.duration,initial};
        attachments.push(attach); held.set(a.object,attach);
      } else {
        const attached = held.get(a.object);
        if (!attached || attached.action.target !== a.target || attached.start > a.start) fail(a,'object is not attached to this hand');
        reach(a,a.to); attached!.end = a.start+a.duration; held.delete(a.object);
      }
    } catch (error) {fail(a,(error as Error).message);}
  }
  // Ancestor/object movement during a reach invalidates its solved endpoint: reject instead of silently missing contact.
  for (const a of actions.filter(a => ['reach','pickUp','putDown'].includes(a.type))) {
    const rig = rigs[object(a.target).rig], ancestors = new Set<string>();
    let p = rig.parts.find(p => p.id === plan.rigs[a.target].upperArm)!.parent;
    while (p) {ancestors.add(p); p = rig.parts.find(part => part.id === p)!.parent;}
    for (const track of timeline.tracks.filter(t => t.target.object === a.target && (!t.target.part || ancestors.has(t.target.part)))) {
      const ranges = claims.get(key(track.target,track.property)) ?? [];
      if (ranges.some(r => a.start < r.end-1e-9 && a.start+a.duration > r.start+1e-9)) fail(a,'moving arm ancestor during reach is unsupported; sequence these actions');
    }
  }
  for (const attachment of attachments) {
    const {action:a,object:id,start,end,initial} = attachment;
    // Capture after all authored joint/wrist tracks have been composed, including motion during pickup.
    const contactHand = handMatrix(a,start);
    const target = {object:id};
    if (timeline.tracks.some(t => t.target.object === id)) fail(a,`attached object ${id} has explicit motion tracks`);
    const offset = multiply(inverse(contactHand),initial);
    const samples = Array.from({length:Math.round((end-start)*plan.fps)+1},(_,i) => {
      const matrix = multiply(handMatrix(a,(Math.round(start*plan.fps)+i)/plan.fps),offset);
      const sx = Math.hypot(matrix[0],matrix[1]), det = matrix[0]*matrix[3]-matrix[1]*matrix[2];
      if (sx < 1e-9 || Math.abs(matrix[0]*matrix[2]+matrix[1]*matrix[3]) > 1e-7*Math.max(1,sx*Math.hypot(matrix[2],matrix[3]))) fail(a,'attachment produces singular or sheared object transform');
      return {x:matrix[4],y:matrix[5],rotation:degrees(Math.atan2(matrix[1],matrix[0])),sx,sy:det/sx};
    });
    samples[0].rotation = nearest(samples[0].rotation,value(target,'rotation',start));
    for (let i=1;i<samples.length;i++) samples[i].rotation = nearest(samples[i].rotation,samples[i-1].rotation);
    const properties = [['position.x','x'],['position.y','y'],['rotation','rotation'],['scale.x','sx'],['scale.y','sy']] as const;
    for (const [property,field] of properties) {
      const keys: Track['keyframes'] = [{time:0,value:value(target,property,0),easing:'linear'}, {time:start,value:value(target,property,0),easing:'linear'}];
      // Reflected scale decompositions may differ. Reject a discontinuity at contact.
      if (Math.abs(samples[0][field]-keys[0].value)>1e-6) fail(a,`attachment decomposition changes ${property} at contact`);
      samples.forEach((s,i) => keys.push({time:(Math.round(start*plan.fps)+i)/plan.fps,value:s[field],easing:'linear'}));
      timeline.tracks.push({target,property,keyframes:[...new Map(keys.map(k => [k.time,k])).values()].sort((a,b)=>a.time-b.time)});
    }
  }
  return validateScene(scene,timeline,rigs).timeline;
}
