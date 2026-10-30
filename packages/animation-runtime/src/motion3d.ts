import {z} from 'zod';
import {Euler, Quaternion, Vector3} from 'three';
import {
  cinematicTimelineSchema,
  type CinematicScene,
  type CinematicTimeline,
  type Model3D,
  type Vec3,
} from './cinematic';

const vec = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const frame = z.number().int().min(0);
const name = z.string().regex(/^[a-zA-Z0-9_-]+$/);
const transition = z.object({startFrame: frame, endFrame: frame}).strict();
const action = z.discriminatedUnion('type', [
  transition
    .extend({type: z.literal('move'), object: name, from: vec, to: vec})
    .strict(),
  transition
    .extend({
      type: z.literal('pose'),
      object: name,
      joints: z.record(name, vec),
      from: z.record(name, vec).optional(),
    })
    .strict(),
  transition
    .extend({
      type: z.literal('reach'),
      object: name,
      shoulder: name,
      elbow: name,
      hand: name,
      from: vec,
      to: vec,
      bend: vec.default([1, 0, 0]),
    })
    .strict(),
]);
export const motion3dSchema = z
  .object({version: z.literal('1.0'), actions: z.array(action).max(256)})
  .strict();
export type Motion3DPlan = z.infer<typeof motion3dSchema>;
type Action = Motion3DPlan['actions'][number];
type Track = CinematicTimeline['tracks'][number];
const mix = (a: Vec3, b: Vec3, t: number): Vec3 =>
  a.map((v, i) => v + (b[i] - v) * t) as Vec3;
const smooth = (x: number) => x * x * (3 - 2 * x);
const pair = (a: Action, f: number) =>
  smooth(
    Math.max(0, Math.min(1, (f - a.startFrame) / (a.endFrame - a.startFrame))),
  );
function solveReach(
  model: Model3D,
  a: Extract<Action, {type: 'reach'}>,
  point: Vec3,
): [Vec3, Vec3] {
  const byId = new Map(model.joints.map((j) => [j.id, j]));
  const shoulder = byId.get(a.shoulder),
    elbow = byId.get(a.elbow),
    hand = byId.get(a.hand);
  if (
    !shoulder ||
    !elbow ||
    !hand ||
    elbow.parent !== shoulder.id ||
    hand.parent !== elbow.id
  )
    throw new Error(
      'Reach requires a shoulder → elbow → hand direct hierarchy',
    );
  if (
    shoulder.rotation.some((v) => v !== 0) ||
    elbow.rotation.some((v) => v !== 0)
  )
    throw new Error(
      'Reach requires neutral zero base rotations for the arm joints',
    );
  // Root/object coordinates: this solver intentionally supports arms under an unrotated torso.
  const torso = shoulder.parent ? byId.get(shoulder.parent) : undefined;
  if (
    torso &&
    (torso.parent ||
      torso.rotation.some((v) => v !== 0) ||
      torso.scale.some((v) => v !== 1))
  )
    throw new Error('Reach needs an unrotated, unit-scaled torso parent');
  const origin = new Vector3(...shoulder.position).add(
    torso ? new Vector3(...torso.position) : new Vector3(),
  );
  const target = new Vector3(...point);
  const offset = target.clone().sub(origin);
  const d = offset.length();
  const l1 = new Vector3(...elbow.position).length();
  const l2 = new Vector3(...hand.position).length();
  if (
    l1 <= 1e-6 ||
    l2 <= 1e-6 ||
    d <= 1e-6 ||
    d > l1 + l2 + 1e-6 ||
    d < Math.abs(l1 - l2) - 1e-6
  )
    throw new Error(`Unreachable 3D target for ${a.object}/${a.hand}`);
  if (
    Math.abs(elbow.position[0]) > 1e-6 ||
    Math.abs(elbow.position[2]) > 1e-6 ||
    Math.abs(hand.position[0]) > 1e-6 ||
    Math.abs(hand.position[2]) > 1e-6 ||
    elbow.position[1] >= 0 ||
    hand.position[1] >= 0
  )
    throw new Error('Reach expects downward neutral arm segments');
  const axis = offset.clone().normalize();
  const proj = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const bend = new Vector3(...a.bend).addScaledVector(
    axis,
    -new Vector3(...a.bend).dot(axis),
  );
  if (bend.lengthSq() < 1e-12)
    throw new Error('Reach bend axis parallel to target');
  bend.normalize();
  const elbowPoint = origin
    .clone()
    .addScaledVector(axis, proj)
    .addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - proj * proj)));
  const q1 = new Quaternion().setFromUnitVectors(
    new Vector3(0, -1, 0),
    elbowPoint.clone().sub(origin).normalize(),
  );
  const q2 = new Quaternion().setFromUnitVectors(
    new Vector3(0, -1, 0),
    target.clone().sub(elbowPoint).normalize(),
  );
  const relative = q1.clone().invert().multiply(q2);
  const e1 = new Euler().setFromQuaternion(q1);
  const e2 = new Euler().setFromQuaternion(relative);
  return [
    [e1.x, e1.y, e1.z],
    [e2.x, e2.y, e2.z],
  ];
}
export function compileMotion3D(
  planInput: unknown,
  scene: CinematicScene,
  timeline: CinematicTimeline,
  models: Record<string, Model3D>,
): CinematicTimeline {
  const plan = motion3dSchema.parse(planInput);
  const count = timeline.duration * timeline.fps;
  const objects = new Map(scene.objects.map((o) => [o.id, o]));
  const tracks = new Map<string, Track>();
  for (const t of timeline.tracks)
    tracks.set(
      JSON.stringify([t.object, t.joint ?? null, t.property]),
      structuredClone(t),
    );
  const reserved = new Set<string>();
  const add = (
    object: string,
    joint: string | undefined,
    property: Track['property'],
    keys: Track['keyframes'],
  ) => {
    const key = JSON.stringify([object, joint ?? null, property]);
    if (tracks.has(key) || reserved.has(key))
      throw new Error(`Motion track conflict: ${key}`);
    reserved.add(key);
    tracks.set(key, {
      object,
      ...(joint ? {joint} : {}),
      property,
      keyframes: keys,
    });
  };
  for (const a of plan.actions) {
    const object = objects.get(a.object);
    if (!object) throw new Error(`Unknown motion object ${a.object}`);
    if (a.endFrame <= a.startFrame || a.endFrame >= count)
      throw new Error('Motion action frame range invalid');
    if (a.type === 'move') {
      add(
        a.object,
        undefined,
        'position',
        [
          {frame: 0, value: a.from},
          {frame: a.startFrame, value: a.from},
          {frame: a.endFrame, value: a.to},
        ].filter((k, i, all) => i === 0 || k.frame !== all[i - 1].frame),
      );
    } else if (a.type === 'pose') {
      const model = models[object.model];
      if (!model) throw new Error('Pose requires procedural 3D model');
      for (const [joint, to] of Object.entries(a.joints)) {
        const original = model.joints.find((j) => j.id === joint);
        if (!original) throw new Error(`Unknown pose joint ${joint}`);
        const from = a.from?.[joint] ?? original.rotation;
        add(
          a.object,
          joint,
          'rotation',
          [
            {frame: 0, value: from},
            {frame: a.startFrame, value: from},
            {frame: a.endFrame, value: to},
          ].filter((k, i, all) => i === 0 || k.frame !== all[i - 1].frame),
        );
      }
    } else {
      const model = models[object.model];
      if (!model) throw new Error('Reach requires procedural 3D model');
      const upper: Track['keyframes'] = [],
        lower: Track['keyframes'] = [];
      for (let f = 0; f <= a.endFrame; f++) {
        const target = mix(a.from, a.to, pair(a, f));
        const [u, l] = solveReach(model, a, target);
        upper.push({frame: f, value: u});
        lower.push({frame: f, value: l});
      }
      add(a.object, a.shoulder, 'rotation', upper);
      add(a.object, a.elbow, 'rotation', lower);
    }
  }
  return cinematicTimelineSchema.parse({
    ...timeline,
    tracks: [...tracks.values()],
  });
}
