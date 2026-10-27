import {z} from 'zod';
const number = z.number().finite();
const point = z.object({x: number, y: number}).strict();
const id = z.string().regex(/^[a-zA-Z0-9_-]+$/);
export const rigSchema = z.object({
  id, version: z.literal('1.0'),
  canvas: z.object({width: number.positive(), height: number.positive()}).strict(),
  parts: z.array(z.object({
    id, asset: z.string().min(1), parent: id.nullable(), position: point, pivot: point,
    zIndex: z.number().int(), rotation: number.default(0),
    scale: point.default({x: 1, y: 1}), opacity: number.min(0).max(1).default(1),
  }).strict()).min(1),
}).strict().superRefine((rig, ctx) => {
  const ids = new Set<string>();
  for (const [i, part] of rig.parts.entries()) {
    const fail = (message: string) => ctx.addIssue({code: 'custom', path: ['parts', i], message: `${part.id}: ${message}`});
    if (ids.has(part.id)) fail('duplicate ID');
    ids.add(part.id);
    const seen = new Set([part.id]);
    let parent = part.parent;
    while (parent !== null) {
      if (seen.has(parent)) {fail('circular parent reference'); break;}
      seen.add(parent);
      const ancestor = rig.parts.find(p => p.id === parent);
      if (!ancestor) {fail(`missing parent ${parent}`); break;}
      parent = ancestor.parent;
    }
  }
});
export const propertySchema = z.enum(['position.x', 'position.y', 'rotation', 'scale.x', 'scale.y', 'opacity']);
export const timelineSchema = z.object({
  version: z.literal('1.0'), characterId: id, fps: z.number().int().min(1).max(120), duration: number.positive(),
  placement: z.object({x: number, y: number, scale: number.positive()}).strict().optional(),
  tracks: z.array(z.object({target: id, property: propertySchema, keyframes: z.array(z.object({
    time: number.min(0), value: number, easing: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']).default('linear'),
  }).strict()).min(1)}).strict()),
}).strict().superRefine((timeline, ctx) => {
  const fail = (path: (string | number)[], message: string) => ctx.addIssue({code: 'custom', path, message});
  if (!Number.isSafeInteger(timeline.duration * timeline.fps)) fail(['duration'], 'duration × fps must be an integer frame count');
  const tracks = new Set<string>();
  timeline.tracks.forEach((track, i) => {
    const key = `${track.target}.${track.property}`;
    if (tracks.has(key)) fail(['tracks', i], `${key}: duplicate track`);
    tracks.add(key);
    track.keyframes.forEach((kf, j) => {
      if (kf.time > timeline.duration) fail(['tracks', i, 'keyframes', j], `${key}: time exceeds duration`);
      if (j > 0 && kf.time <= track.keyframes[j - 1].time) fail(['tracks', i, 'keyframes', j], `${key}: keyframe times must be strictly increasing`);
      if (track.property === 'opacity' && (kf.value < 0 || kf.value > 1)) fail(['tracks', i, 'keyframes', j], `${key}: opacity must be 0–1`);
    });
  });
});
export type Rig = z.infer<typeof rigSchema>;
export type Timeline = z.infer<typeof timelineSchema>;
export type Track = Timeline['tracks'][number];
export function validateAnimation(character: unknown, animation: unknown) {
  const rig = rigSchema.parse(character);
  const timeline = timelineSchema.parse(animation);
  if (rig.id !== timeline.characterId) throw new Error(`characterId ${timeline.characterId} does not match ${rig.id}`);
  for (const [i, track] of timeline.tracks.entries()) {
    if (!rig.parts.some(p => p.id === track.target)) throw new Error(`Track ${i}: unknown part ${track.target}`);
  }
  return {rig, timeline};
}
