import {z} from 'zod';
import {rigSchema, timelineSchema, type Rig} from './schemas';
import {evaluateFrame} from './evaluate-frame';
const scalar = z.number().finite();
const id = z.string().regex(/^[a-zA-Z0-9_-]+$/);
export const sceneSchema = z
  .object({
    version: z.literal('1.0'),
    canvas: z.object({width: z.literal(1280), height: z.literal(720)}).strict(),
    background: z
      .string()
      .regex(/^(transparent|#[\da-f]{3,8}|[a-z]+)$/i)
      .optional(),
    objects: z
      .array(
        z
          .object({
            id,
            rig: z.string().min(1),
            position: z
              .object({x: scalar, y: scalar})
              .strict()
              .default({x: 0, y: 0}),
            rotation: scalar.default(0),
            scale: z
              .object({x: scalar, y: scalar})
              .strict()
              .default({x: 1, y: 1}),
            opacity: scalar.min(0).max(1).default(1),
            zIndex: z.number().int().default(0),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((scene, ctx) => {
    const ids = new Set<string>();
    scene.objects.forEach((object, i) => {
      if (ids.has(object.id))
        ctx.addIssue({
          code: 'custom',
          path: ['objects', i, 'id'],
          message: 'duplicate object ID',
        });
      ids.add(object.id);
    });
  });
const track = timelineSchema.shape.tracks.element;
const cameraStateSchema = z.object({
  x: scalar, y: scalar, zoom: scalar.positive(),
}).strict();
const cameraShotSchema = z.object({
  startFrame: z.number().int().min(0),
  endFrame: z.number().int().positive(),
  from: cameraStateSchema,
  to: cameraStateSchema.optional(),
}).strict();
export type CameraShot = z.infer<typeof cameraShotSchema>;
export function evaluateCamera(shots: CameraShot[] | undefined, frame: number) {
  const shot = shots?.find(s => frame >= s.startFrame && frame < s.endFrame);
  if (!shot) return {x: 640, y: 360, zoom: 1};
  const end = shot.to ?? shot.from;
  const progress = Math.max(0, Math.min(1, (frame - shot.startFrame) / Math.max(1, shot.endFrame - shot.startFrame - 1)));
  return {
    x: shot.from.x + (end.x - shot.from.x) * progress,
    y: shot.from.y + (end.y - shot.from.y) * progress,
    zoom: shot.from.zoom + (end.zoom - shot.from.zoom) * progress,
  };
}
export const sceneTimelineSchema = z
  .object({
    version: z.literal('1.0'),
    fps: timelineSchema.shape.fps,
    duration: timelineSchema.shape.duration,
    tracks: z.array(
      track.extend({
        target: z.object({object: id, part: id.optional()}).strict(),
      }),
    ),
  })
  .strict()
  .superRefine((timeline, ctx) => {
    if (timeline.camera) {
    const shots = timeline.camera.shots;
    const frames = timeline.fps * timeline.duration;
    let cursor = 0;
    for (const [i, shot] of shots.entries()) {
      if (shot.startFrame !== cursor || shot.endFrame <= shot.startFrame || shot.endFrame > frames) {
        ctx.addIssue({code: 'custom', path: ['camera', 'shots', i], message: 'Camera shots must be contiguous, ordered and within timeline'});
      }
      cursor = shot.endFrame;
    }
    if (cursor !== frames) ctx.addIssue({code: 'custom', path: ['camera', 'shots'], message: 'Camera shots must cover all frames'});
  }
  const targets = new Map<string, string>();
    const tracks = timeline.tracks.map((t) => {
      const key = JSON.stringify([t.target.object, t.target.part ?? null]);
      if (!targets.has(key)) targets.set(key, `target${targets.size}`);
      return {...t, target: targets.get(key)!};
    });
    const result = timelineSchema.safeParse({
      ...timeline,
      characterId: 'scene',
      tracks,
    });
    if (!result.success)
      for (const issue of result.error.issues)
        ctx.addIssue({
          code: 'custom',
          path: issue.path,
          message: issue.message,
        });
  });
export type Scene = z.infer<typeof sceneSchema>;
export type SceneTimeline = z.infer<typeof sceneTimelineSchema>;
export function validateScene(
  manifest: unknown,
  animation: unknown,
  inputs: Record<string, unknown>,
) {
  const scene = sceneSchema.parse(manifest),
    timeline = sceneTimelineSchema.parse(animation);
  const rigs: Record<string, Rig> = Object.create(null);
  for (const object of scene.objects) {
    if (!Object.hasOwn(inputs, object.rig))
      throw new Error(`Missing rig ${object.rig}`);
    if (!Object.hasOwn(rigs, object.rig))
      rigs[object.rig] = rigSchema.parse(inputs[object.rig]);
  }
  for (const track of timeline.tracks) {
    const object = scene.objects.find((o) => o.id === track.target.object);
    if (!object) throw new Error(`Unknown object ${track.target.object}`);
    if (
      track.target.part &&
      !rigs[object.rig].parts.some((p) => p.id === track.target.part)
    )
      throw new Error(`Unknown part ${track.target.part} on ${object.id}`);
  }
  return {scene, timeline, rigs};
}
export type MultiSceneProps = ReturnType<typeof validateScene> & {
  assets: Record<string, Record<string, string>>;
};
export function evaluateSceneFrame({
  scene,
  timeline,
  rigs,
  frame,
}: Omit<MultiSceneProps, 'assets'> & {frame: number}) {
  return [...scene.objects]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((object) => {
      const timing = {
        version: '1.0' as const,
        characterId: object.id,
        fps: timeline.fps,
        duration: timeline.duration,
      };
      const placement = evaluateFrame({
        character: {
          id: object.id,
          version: '1.0',
          canvas: scene.canvas,
          parts: [{...object, asset: '', parent: null, pivot: {x: 0, y: 0}}],
        },
        timeline: {
          ...timing,
          tracks: timeline.tracks
            .filter((t) => t.target.object === object.id && !t.target.part)
            .map((t) => ({...t, target: object.id})),
        },
        frame,
      })[0];
      const rig = rigs[object.rig];
      const parts = evaluateFrame({
        character: rig,
        timeline: {
          ...timing,
          characterId: rig.id,
          tracks: timeline.tracks
            .filter((t) => t.target.object === object.id && t.target.part)
            .map((t) => ({...t, target: t.target.part!})),
        },
        frame,
      }).sort((a, b) => a.zIndex - b.zIndex);
      return {
        ...object,
        matrix: placement.matrix,
        opacity: placement.opacity,
        parts,
      };
    });
}
