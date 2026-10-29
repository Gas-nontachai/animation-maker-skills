import {z} from 'zod';
import {Euler, Matrix4, Quaternion, Vector3} from 'three';
const number = z.number().finite();
const id = z.string().regex(/^[a-zA-Z0-9_-]+$/);
export const vector3Schema = z.tuple([number, number, number]);
export type Vec3 = z.infer<typeof vector3Schema>;
const zero: Vec3 = [0, 0, 0];
const transform = z
  .object({
    position: vector3Schema.default(zero),
    rotation: vector3Schema.default(zero),
    scale: vector3Schema
      .refine((v) => v.every((n) => n > 0), 'Scale must be positive')
      .default([1, 1, 1]),
  })
  .strict();
const geometry = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('box'),
      size: vector3Schema.refine((v) => v.every((n) => n > 0)),
    })
    .strict(),
  z.object({type: z.literal('sphere'), radius: number.positive()}).strict(),
  z
    .object({
      type: z.literal('cylinder'),
      radius: number.positive(),
      height: number.positive(),
    })
    .strict(),
]);
export const model3dSchema = z
  .object({
    version: z.literal('1.0'),
    id,
    materials: z.record(
      id,
      z
        .object({
          color: z.string().regex(/^#[0-9a-f]{6}$/i),
          roughness: number.min(0).max(1).default(0.8),
        })
        .strict(),
    ),
    joints: z
      .array(
        z
          .object({
            id,
            parent: id.nullable(),
            ...transform.shape,
            geometry: geometry.optional(),
            material: id.optional(),
            // Geometry offset leaves the joint pivot at its anatomical anchor.
            geometryPosition: vector3Schema.default(zero),
            anchors: z.record(id, vector3Schema).default({}),
          })
          .strict(),
      )
      .min(1)
      .max(256),
  })
  .strict()
  .superRefine((model, ctx) => {
    const joints = new Map(model.joints.map((j) => [j.id, j]));
    if (joints.size !== model.joints.length)
      ctx.addIssue({code: 'custom', message: 'Duplicate joint ID'});
    for (const joint of model.joints) {
      if (
        joint.geometry &&
        (!joint.material || !Object.hasOwn(model.materials, joint.material))
      )
        ctx.addIssue({
          code: 'custom',
          message: `Unknown material on ${joint.id}`,
        });
      const seen = new Set<string>([joint.id]);
      let parent = joint.parent;
      while (parent) {
        if (seen.has(parent) || !joints.has(parent)) {
          ctx.addIssue({
            code: 'custom',
            message: `Invalid hierarchy at ${joint.id}`,
          });
          break;
        }
        seen.add(parent);
        parent = joints.get(parent)!.parent;
      }
    }
  });
export type Model3D = z.infer<typeof model3dSchema>;
const camera = z
  .object({
    type: z.literal('lookAt').default('lookAt'),
    projection: z.enum(['perspective', 'orthographic']),
    position: vector3Schema,
    target: vector3Schema,
    fov: number.min(1).max(160).default(50),
    span: number.positive().default(5),
    near: number.positive().default(0.01),
    far: number.positive().default(1000),
  })
  .strict()
  .superRefine((c, ctx) => {
    const direction = c.position.map((v, i) => v - c.target[i]);
    if (
      c.far <= c.near ||
      Math.hypot(...direction) < 1e-6 ||
      Math.hypot(direction[0], direction[2]) < 1e-6
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid camera clipping or direction (Y is up)',
      });
  });
export const cinematicTimelineSchema = z
  .object({
    version: z.literal('1.0'),
    fps: z.number().int().min(1).max(60),
    duration: number.positive().max(120),
    shots: z
      .array(
        z
          .object({
            id,
            startFrame: z.number().int().min(0),
            endFrame: z.number().int().positive(),
            camera,
            endCamera: camera.optional(),
            orbitRadians: number.optional(),
            transition: z.literal('cut'),
            follow: id.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(256),
    tracks: z
      .array(
        z
          .object({
            object: id,
            joint: id.optional(),
            property: z.enum(['position', 'rotation', 'scale']),
            keyframes: z
              .array(
                z
                  .object({
                    frame: z.number().int().min(0),
                    value: vector3Schema,
                  })
                  .strict(),
              )
              .min(1)
              .max(10000),
          })
          .strict(),
      )
      .max(4096),
    attachments: z
      .array(
        z
          .object({
            object: id,
            parent: id,
            joint: id,
            anchor: id,
            startFrame: z.number().int().min(0),
            endFrame: z.number().int().positive(),
            offset: vector3Schema.default(zero),
          })
          .strict(),
      )
      .max(1024)
      .default([]),
  })
  .strict()
  .superRefine((t, ctx) => {
    const frames = t.fps * t.duration;
    if (!Number.isInteger(frames))
      ctx.addIssue({
        code: 'custom',
        message: 'Duration must produce integral frames',
      });
    let cursor = 0;
    const shots = new Set<string>();
    for (const s of t.shots) {
      if (
        shots.has(s.id) ||
        s.startFrame !== cursor ||
        s.endFrame <= s.startFrame ||
        s.endFrame > frames
      )
        ctx.addIssue({
          code: 'custom',
          message:
            'Shots require unique IDs and complete ordered half-open coverage',
        });
      if (s.endCamera) {
        const a = s.camera.position.map((v, i) => v - s.camera.target[i]),
          b = s.endCamera.position.map((v, i) => v - s.endCamera!.target[i]);
        const delta = [b[0] - a[0], b[2] - a[2]];
        const axis = Math.abs(delta[0]) > Math.abs(delta[1]) ? 0 : 1;
        const start = axis === 0 ? a[0] : a[2];
        const at = delta[axis] ? -start / delta[axis] : -1;
        if (
          at >= 0 &&
          at <= 1 &&
          Math.hypot(a[0] + delta[0] * at, a[2] + delta[1] * at) < 1e-6
        )
          ctx.addIssue({
            code: 'custom',
            message: 'Camera path passes through a singular direction',
          });
      }
      if (s.endCamera && s.endCamera.projection !== s.camera.projection)
        ctx.addIssue({
          code: 'custom',
          message: 'Projection changes require a cut',
        });
      shots.add(s.id);
      cursor = s.endFrame;
    }
    if (cursor !== frames)
      ctx.addIssue({code: 'custom', message: 'Shots must cover duration'});
    const targets = new Set<string>();
    for (const track of t.tracks) {
      const key = JSON.stringify([track.object, track.joint, track.property]);
      if (targets.has(key))
        ctx.addIssue({code: 'custom', message: 'Duplicate track'});
      targets.add(key);
      let previous = -1;
      for (const k of track.keyframes) {
        if (
          k.frame <= previous ||
          k.frame >= frames ||
          (track.property === 'scale' && k.value.some((v) => v <= 0))
        )
          ctx.addIssue({
            code: 'custom',
            message: 'Invalid keyframe order, range or scale',
          });
        previous = k.frame;
      }
    }
    for (const [i, a] of t.attachments.entries()) {
      if (
        a.object === a.parent ||
        a.startFrame >= a.endFrame ||
        a.endFrame > frames ||
        t.attachments
          .slice(0, i)
          .some(
            (b) =>
              b.object === a.object &&
              a.startFrame < b.endFrame &&
              b.startFrame < a.endFrame,
          )
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Invalid or overlapping attachment',
        });
    }
  });
const localPath = z
  .string()
  .min(1)
  .refine(
    (p) =>
      !p.startsWith('/') &&
      !p.includes('\\') &&
      !p.split('/').includes('..') &&
      !/[:?#]/.test(p),
    'Local relative path required',
  );
export const cinematicSceneSchema = z
  .object({
    version: z.literal('1.0'),
    renderingMode: z.enum(['3d', 'hybrid']),
    canvas: z.object({width: z.literal(1280), height: z.literal(720)}).strict(),
    background: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .default('#e9dfcd'),
    objects: z
      .array(z.object({id, model: localPath, ...transform.shape}).strict())
      .min(1)
      .max(256),
    layers: z
      .array(
        z
          .object({
            id,
            type: z.enum(['screen-space', 'world-space-2d']),
            asset: localPath,
            order: z.number().int(),
            position: vector3Schema.default(zero),
            rotation: vector3Schema.default(zero),
            size: z.tuple([
              number.positive().max(4096),
              number.positive().max(4096),
            ]),
            facing: z.enum(['fixed', 'billboard']).default('fixed'),
          })
          .strict(),
      )
      .max(64)
      .default([]),
  })
  .strict()
  .superRefine((s, ctx) => {
    const ids = [...s.objects, ...s.layers].map((o) => o.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({code: 'custom', message: 'Duplicate scene ID'});
    if (s.renderingMode === '3d' && s.layers.length)
      ctx.addIssue({code: 'custom', message: 'SVG layers require hybrid mode'});
  });
export type CinematicScene = z.infer<typeof cinematicSceneSchema>;
export type CinematicTimeline = z.infer<typeof cinematicTimelineSchema>;
export type CinematicProps = {
  cinematic: CinematicScene;
  timeline: CinematicTimeline;
  models: Record<string, Model3D>;
  glbs: Record<string, string>;
  overlays: Record<
    string,
    {markup: string; viewBox: [number, number, number, number]}
  >;
};
export function validateCinematic(
  scene: CinematicScene,
  timeline: CinematicTimeline,
  models: Record<string, Model3D>,
) {
  const objects = new Map(scene.objects.map((o) => [o.id, o]));
  const joint = (object: string, name: string) => {
    const o = objects.get(object);
    const result = o && models[o.model]?.joints.find((j) => j.id === name);
    if (!result) throw new Error(`Unknown procedural joint ${object}/${name}`);
    return result;
  };
  for (const t of timeline.tracks) {
    if (!objects.has(t.object)) throw new Error(`Unknown object ${t.object}`);
    if (t.joint) joint(t.object, t.joint);
  }
  for (const s of timeline.shots)
    if (s.follow && !objects.has(s.follow))
      throw new Error(`Unknown camera target ${s.follow}`);
  for (const a of timeline.attachments) {
    if (
      !objects.has(a.object) ||
      !Object.hasOwn(joint(a.parent, a.joint).anchors, a.anchor)
    )
      throw new Error(`Invalid attachment ${a.object}`);
  }
  // Reject attachment dependency cycles even when intervals do not overlap.
  const checked = new Set<string>();
  const visit = (id: string, path: Set<string>) => {
    if (path.has(id)) throw new Error('Attachment cycle');
    if (checked.has(id)) return;
    for (const a of timeline.attachments.filter((a) => a.object === id))
      visit(a.parent, new Set([...path, id]));
    checked.add(id);
  };
  scene.objects.forEach((o) => visit(o.id, new Set()));
}
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 =>
  a.map((v, i) => v + (b[i] - v) * t) as Vec3;
export function svgToWorld(x: number, y: number, pixelsPerUnit = 100): Vec3 {
  if (![x, y, pixelsPerUnit].every(Number.isFinite) || pixelsPerUnit <= 0)
    throw new Error('Invalid coordinate conversion');
  return [(x - 640) / pixelsPerUnit, (360 - y) / pixelsPerUnit, 0];
}
const matrix = (t: {position: Vec3; rotation: Vec3; scale: Vec3}) => {
  const value = new Matrix4().compose(
    new Vector3(...t.position),
    new Quaternion().setFromEuler(new Euler(...t.rotation)),
    new Vector3(...t.scale),
  );
  if (!value.elements.every(Number.isFinite))
    throw new Error('Non-finite transform matrix');
  return value;
};
export function evaluateCinematic(
  props: Pick<CinematicProps, 'cinematic' | 'timeline' | 'models'>,
  frame: number,
) {
  const {cinematic: scene, timeline, models} = props;
  if (
    !Number.isInteger(frame) ||
    frame < 0 ||
    frame >= timeline.fps * timeline.duration
  )
    throw new Error('Frame outside timeline');
  function local(
    object: string,
    joint: string | undefined,
    base: {position: Vec3; rotation: Vec3; scale: Vec3},
  ) {
    const result = {...base};
    for (const track of timeline.tracks.filter(
      (t) => t.object === object && t.joint === joint,
    )) {
      const keys = track.keyframes;
      let a = keys[0],
        b = a;
      for (const k of keys) {
        if (k.frame <= frame) a = k;
        else {
          b = k;
          break;
        }
        b = a;
      }
      result[track.property] = lerp3(
        a.value,
        b.value,
        b.frame === a.frame
          ? 0
          : Math.max(0, (frame - a.frame) / (b.frame - a.frame)),
      );
    }
    return matrix(result);
  }
  const states = new Map<
    string,
    {matrix: Matrix4; joints: Map<string, Matrix4>}
  >();
  function objectState(id: string): {
    matrix: Matrix4;
    joints: Map<string, Matrix4>;
  } {
    const cached = states.get(id);
    if (cached) return cached;
    const object = scene.objects.find((o) => o.id === id)!;
    let world = local(id, undefined, object);
    const a = timeline.attachments.find(
      (a) => a.object === id && frame >= a.startFrame && frame < a.endFrame,
    );
    if (a) {
      const parent = objectState(a.parent);
      const model = models[scene.objects.find((o) => o.id === a.parent)!.model];
      const anchor = model.joints.find((j) => j.id === a.joint)!.anchors[
        a.anchor
      ];
      const rotation = new Quaternion(),
        scale = new Vector3();
      world.decompose(new Vector3(), rotation, scale);
      world = parent.joints
        .get(a.joint)!
        .clone()
        .multiply(
          new Matrix4().makeTranslation(
            ...(anchor.map((v, i) => v + a.offset[i]) as Vec3),
          ),
        )
        .multiply(new Matrix4().compose(new Vector3(), rotation, scale));
    }
    if (!world.elements.every(Number.isFinite))
      throw new Error('Non-finite object matrix');
    const joints = new Map<string, Matrix4>();
    const model = models[object.model];
    function jointState(id: string): Matrix4 {
      if (joints.has(id)) return joints.get(id)!;
      const j = model.joints.find((j) => j.id === id)!;
      const value = (j.parent ? jointState(j.parent) : world)
        .clone()
        .multiply(local(object.id, j.id, j));
      if (!value.elements.every(Number.isFinite))
        throw new Error('Non-finite joint matrix');
      joints.set(id, value);
      return value;
    }
    if (model) model.joints.forEach((j) => jointState(j.id));
    const result = {matrix: world, joints};
    states.set(id, result);
    return result;
  }
  scene.objects.forEach((o) => objectState(o.id));
  const shot = timeline.shots.find(
    (s) => frame >= s.startFrame && frame < s.endFrame,
  )!;
  const t =
    (frame - shot.startFrame) /
    Math.max(1, shot.endFrame - shot.startFrame - 1);
  const end = shot.endCamera ?? shot.camera;
  const camera = {
    ...shot.camera,
    position: lerp3(shot.camera.position, end.position, t),
    target: lerp3(shot.camera.target, end.target, t),
    fov: shot.camera.fov + (end.fov - shot.camera.fov) * t,
    span: shot.camera.span + (end.span - shot.camera.span) * t,
  };
  if (shot.orbitRadians) {
    const delta = new Vector3(...camera.position)
      .sub(new Vector3(...camera.target))
      .applyAxisAngle(new Vector3(0, 1, 0), shot.orbitRadians * t);
    camera.position = [
      delta.x + camera.target[0],
      delta.y + camera.target[1],
      delta.z + camera.target[2],
    ];
  }
  if (shot.follow) {
    const p = new Vector3().setFromMatrixPosition(
      states.get(shot.follow)!.matrix,
    );
    camera.target = [
      p.x + camera.target[0],
      p.y + camera.target[1],
      p.z + camera.target[2],
    ];
    camera.position = [
      p.x + camera.position[0],
      p.y + camera.position[1],
      p.z + camera.position[2],
    ];
  }
  if (
    !camera.position.every(Number.isFinite) ||
    !camera.target.every(Number.isFinite) ||
    Math.hypot(
      camera.position[0] - camera.target[0],
      camera.position[2] - camera.target[2],
    ) < 1e-6
  )
    throw new Error('Camera direction becomes singular');
  return {objects: states, camera, shot: shot.id};
}

export function cameraPreset(
  view: 'front' | 'back' | 'left' | 'right' | 'three-quarter' | 'top',
  framing: 'wide' | 'medium' | 'close-up',
  target: Vec3 = [0, 1.5, 0],
) {
  const distance = {wide: 7, medium: 4, 'close-up': 2}[framing];
  const direction: Vec3 = {
    front: [0, 0.1, 1],
    back: [0, 0.1, -1],
    left: [-1, 0.1, 0],
    right: [1, 0.1, 0],
    'three-quarter': [0.7, 0.3, 0.7],
    top: [0, 1, 0.001],
  }[view] as Vec3;
  const v = new Vector3(...direction).normalize().multiplyScalar(distance);
  return camera.parse({
    projection: 'perspective',
    target,
    position: [target[0] + v.x, target[1] + v.y, target[2] + v.z],
    fov: 50,
  });
}
