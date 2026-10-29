import {
  createStylizedCharacter3D,
  createCoffeeCup3D,
  createBoxModel3D,
} from '../packages/animation-runtime/src/procedural3d';
import {mkdir, writeFile} from 'node:fs/promises';
import {Euler, Quaternion, Vector3} from 'three';
import {
  model3dSchema,
  cinematicSceneSchema,
  cinematicTimelineSchema,
  evaluateCinematic,
  type Vec3,
} from '../packages/animation-runtime/src/cinematic';
const root = 'examples/m4';
const write = async (name: string, data: unknown) => {
  await mkdir(`${root}/${name.substring(0, name.lastIndexOf('/'))}`, {
    recursive: true,
  });
  await writeFile(`${root}/${name}`, JSON.stringify(data, null, 2) + '\n');
};
const man = createStylizedCharacter3D(),
  cup = createCoffeeCup3D(),
  prop = createBoxModel3D;
const models = {
  'man.json': man,
  'table.json': prop('table', [2.1, 0.12, 0.9], '#956342'),
  'leg.json': prop('leg', [0.12, 1.2, 0.12], '#553e30'),
  'chair.json': prop('chair', [0.85, 0.13, 0.85], '#6e987d'),
  'floor.json': prop('floor', [12, 0.1, 12], '#d9cbb2'),
  'cup.json': cup,
  'wall.json': prop('wall', [9, 4, 0.12], '#c2aa85'),
  'window.json': prop('window', [2.4, 1.6, 0.15], '#83bbc4'),
  'frame.json': prop('frame', [0.1, 1.7, 0.2], '#f8e9cf'),
};
const objects = [
  {id: 'wall', model: 'wall.json', position: [0, 2, -2.5]},
  {id: 'window', model: 'window.json', position: [-1.5, 2.3, -2.4]},
  {id: 'windowFrame', model: 'frame.json', position: [-1.5, 2.3, -2.28]},
  {id: 'man', model: 'man.json'},
  {id: 'table', model: 'table.json', position: [0, 1.2, 1.1]},
  {id: 'legLeft', model: 'leg.json', position: [-0.8, 0.6, 1.1]},
  {id: 'legRight', model: 'leg.json', position: [0.8, 0.6, 1.1]},
  {id: 'chair', model: 'chair.json', position: [0, 0.99, 0]},
  {
    id: 'chairBack',
    model: 'chair.json',
    position: [0, 1.5, -0.4],
    rotation: [Math.PI / 2, 0, 0],
  },
  {id: 'floor', model: 'floor.json', position: [0, -0.05, 0]},
  {id: 'cup', model: 'cup.json', position: [0.55, 1.44, 0.7]},
];
const cameras = [
  {position: [4, 3.1, 5.5], target: [0, 1.1, 0.4], fov: 48},
  {position: [4, 2, 1.1], target: [0, 1.6, 0.4], fov: 44},
  {position: [0.2, 2.12, 2.5], target: [0.05, 1.96, 0.1], fov: 38},
  {position: [-3, 2.6, 3.7], target: [0, 1.4, 0.4], fov: 45},
];
const bounds = [0, 48, 100, 170, 240];
const shots = cameras.map((c, i) => ({
  id: `shot-${i}`,
  startFrame: bounds[i],
  endFrame: bounds[i + 1],
  camera: {projection: 'perspective', ...c},
  transition: 'cut',
  ...(i === 3
    ? {
        endCamera: {
          projection: 'perspective',
          position: [-3.5, 2.8, 4.2],
          target: [0, 1.4, 0.4],
          fov: 45,
        },
      }
    : {}),
}));
const mix = (a: Vec3, b: Vec3, t: number): Vec3 =>
  a.map((v, i) => v + (b[i] - v) * t) as Vec3;
const rest: Vec3 = [0.48, 1.18, 0.3],
  contact: Vec3 = [0.55, 1.44, 0.66],
  mouth: Vec3 = [0.27, 1.98, 0.34];
const handContact: Vec3 = [contact[0] + 0.17, contact[1], contact[2]];
const keys = [
  {frame: 0, value: rest},
  {frame: 35, value: rest},
  {frame: 70, value: handContact},
  {frame: 90, value: handContact},
  {frame: 120, value: mouth},
  {frame: 150, value: mouth},
  {frame: 190, value: handContact},
  {frame: 210, value: rest},
  {frame: 239, value: rest},
];
const upper: {frame: number; value: Vec3}[] = [],
  lower: typeof upper = [],
  hand: typeof upper = [];
for (let frame = 0; frame < 240; frame++) {
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
  const target = new Vector3(
    ...mix(
      a.value,
      b.value,
      a.frame === b.frame ? 0 : (frame - a.frame) / (b.frame - a.frame),
    ),
  );
  const shoulder = new Vector3(0.4, 1.73, 0),
    delta = target.clone().sub(shoulder),
    distance = delta.length();
  if (distance > 0.82) throw new Error('Unreachable coffee contact');
  const direction = delta.normalize(),
    along = (0.42 * 0.42 - 0.4 * 0.4 + distance * distance) / (2 * distance);
  const bend = new Vector3(1, 0, 0)
    .addScaledVector(direction, -direction.x)
    .normalize();
  const elbow = shoulder
    .clone()
    .addScaledVector(direction, along)
    .addScaledVector(bend, Math.sqrt(Math.max(0, 0.42 * 0.42 - along * along)));
  const q1 = new Quaternion().setFromUnitVectors(
    new Vector3(0, -1, 0),
    elbow.clone().sub(shoulder).normalize(),
  );
  const q2 = new Quaternion().setFromUnitVectors(
    new Vector3(0, -1, 0),
    target.clone().sub(elbow).normalize(),
  );
  const e1 = new Euler().setFromQuaternion(q1),
    e2 = new Euler().setFromQuaternion(q1.clone().invert().multiply(q2));
  const sip =
    frame < 120
      ? Math.max(0, (frame - 100) / 20)
      : frame <= 150
        ? 1
        : Math.max(0, 1 - (frame - 150) / 25);
  const e3 = new Euler().setFromQuaternion(
    q2
      .clone()
      .invert()
      .multiply(new Quaternion().setFromEuler(new Euler(-0.22 * sip, 0, 0))),
  );
  hand.push({frame, value: [e3.x, e3.y, e3.z]});
  upper.push({frame, value: [e1.x, e1.y, e1.z]});
  lower.push({frame, value: [e2.x, e2.y, e2.z]});
}
const timeline = cinematicTimelineSchema.parse({
  version: '1.0',
  fps: 24,
  duration: 10,
  shots,
  tracks: [
    {object: 'man', joint: 'rightHand', property: 'rotation', keyframes: hand},
    {
      object: 'man',
      joint: 'rightUpperArm',
      property: 'rotation',
      keyframes: upper,
    },
    {
      object: 'man',
      joint: 'rightForearm',
      property: 'rotation',
      keyframes: lower,
    },
    {
      object: 'cup',
      property: 'position',
      keyframes: [{frame: 0, value: contact}],
    },
  ],
  attachments: [
    {
      object: 'cup',
      parent: 'man',
      joint: 'rightHand',
      anchor: 'grip',
      startFrame: 70,
      endFrame: 191,
    },
  ],
});
// Author world cup transforms during attachment so release matches the last contact exactly.
const scene = cinematicSceneSchema.parse({
  version: '1.0',
  renderingMode: '3d',
  canvas: {width: 1280, height: 720},
  objects,
});
const cupTrack = timeline.tracks.find((t) => t.object === 'cup')!;
for (let frame = 70; frame <= 190; frame++) {
  const m = evaluateCinematic(
    {cinematic: scene, timeline, models},
    frame,
  ).objects.get('cup')!.matrix;
  const p = new Vector3().setFromMatrixPosition(m);
  cupTrack.keyframes.push({frame, value: [p.x, p.y, p.z]});
}
cupTrack.keyframes.push(
  {frame: 191, value: contact},
  {frame: 239, value: contact},
);
for (const name of ['coffee', 'hybrid']) {
  for (const [file, model] of Object.entries(models))
    await write(`${name}/${file}`, model);
  await write(
    `${name}/scene.json`,
    name === 'coffee'
      ? scene
      : {
          ...scene,
          renderingMode: 'hybrid',
          layers: [
            {
              id: 'world-sign',
              type: 'world-space-2d',
              asset: 'overlay.svg',
              order: 0,
              position: [-1.5, 3.4, -2.25],
              size: [1.5, 0.28],
              facing: 'fixed',
            },
            {
              id: 'overlay',
              type: 'screen-space',
              asset: 'overlay.svg',
              order: 1,
              position: [40, 35, 0],
              size: [320, 60],
            },
          ],
        },
  );
  await write(`${name}/timeline.json`, timeline);
  await write(`${name}/prompt.json`, {
    prompt:
      'Create a 10-second stylized cinematic animation of a man in a yellow shirt sitting at a cafe table. He reaches for a coffee cup, picks it up, drinks from it, and puts it back down. Begin with a wide shot, switch to a side view during the reach, show a front close-up while drinking, and end with a three-quarter view.',
  });
}
await writeFile(
  `${root}/hybrid/overlay.svg`,
  '<svg viewBox="0 0 320 60"><rect width="320" height="60" rx="12" fill="#223344"/><circle cx="30" cy="30" r="14" fill="#f2c534"/><path d="M60 20 H290 M60 35 H230" stroke="#fff5df" stroke-width="6"/></svg>',
);
console.log('Generated editable coffee and hybrid projects');
