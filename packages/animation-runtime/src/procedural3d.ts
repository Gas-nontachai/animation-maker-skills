import {model3dSchema, type Vec3} from './cinematic';
const material = (color: string) => ({color});
const joint = (
  id: string,
  parent: string | null,
  position: Vec3,
  geometry?: unknown,
  mat = 'shirt',
  geometryPosition: Vec3 = [0, 0, 0],
) => ({
  id,
  parent,
  position,
  geometry,
  material: geometry ? mat : undefined,
  geometryPosition,
});
const box = (size: Vec3) => ({type: 'box', size});
const sphere = (radius: number) => ({type: 'sphere', radius});
export const createStylizedCharacter3D = () =>
  model3dSchema.parse({
    version: '1.0',
    id: 'man',
    materials: {
      shirt: material('#f2c534'),
      skin: material('#bd7952'),
      hair: material('#342622'),
      pants: material('#334d69'),
      eye: material('#201c22'),
    },
    joints: [
      joint('torso', null, [0, 1.5, 0], box([0.65, 0.65, 0.34])),
      joint('head', 'torso', [0, 0.58, 0], sphere(0.25), 'skin'),
      joint('hair', 'head', [0, 0.13, -0.03], box([0.45, 0.22, 0.38]), 'hair'),
      joint('nose', 'head', [0, 0, 0.25], sphere(0.065), 'skin'),
      joint('leftEye', 'head', [-0.09, 0.055, 0.23], sphere(0.025), 'eye'),
      joint('rightEye', 'head', [0.09, 0.055, 0.23], sphere(0.025), 'eye'),
      joint(
        'rightUpperArm',
        'torso',
        [0.4, 0.23, 0],
        box([0.17, 0.42, 0.17]),
        'shirt',
        [0, -0.21, 0],
      ),
      joint(
        'rightForearm',
        'rightUpperArm',
        [0, -0.42, 0],
        box([0.13, 0.4, 0.13]),
        'skin',
        [0, -0.2, 0],
      ),
      {
        ...joint(
          'rightHand',
          'rightForearm',
          [0, -0.4, 0],
          sphere(0.085),
          'skin',
        ),
        anchors: {grip: [-0.17, 0, 0]},
      },
      joint(
        'leftUpperArm',
        'torso',
        [-0.4, 0.23, 0],
        box([0.17, 0.42, 0.17]),
        'shirt',
        [0, -0.21, 0],
      ),
      joint(
        'leftForearm',
        'leftUpperArm',
        [0, -0.42, 0],
        box([0.13, 0.4, 0.13]),
        'skin',
        [0, -0.2, 0],
      ),
      joint('leftHand', 'leftForearm', [0, -0.4, 0], sphere(0.085), 'skin'),
      {
        ...joint(
          'leftThigh',
          'torso',
          [-0.2, -0.4, 0],
          box([0.22, 0.5, 0.22]),
          'pants',
          [0, -0.25, 0],
        ),
        rotation: [-Math.PI / 2, 0, 0],
      },
      joint(
        'leftLowerLeg',
        'leftThigh',
        [0, -0.5, 0],
        box([0.19, 0.55, 0.19]),
        'pants',
        [0, 0, -0.275],
      ),
      {
        ...joint(
          'rightThigh',
          'torso',
          [0.2, -0.4, 0],
          box([0.22, 0.5, 0.22]),
          'pants',
          [0, -0.25, 0],
        ),
        rotation: [-Math.PI / 2, 0, 0],
      },
      joint(
        'rightLowerLeg',
        'rightThigh',
        [0, -0.5, 0],
        box([0.19, 0.55, 0.19]),
        'pants',
        [0, 0, -0.275],
      ),
    ],
  });
export const createBoxModel3D = (id: string, size: Vec3, color: string) =>
  model3dSchema.parse({
    version: '1.0',
    id,
    materials: {main: material(color)},
    joints: [joint('body', null, [0, 0, 0], box(size), 'main')],
  });
export const createCoffeeCup3D = () =>
  model3dSchema.parse({
    version: '1.0',
    id: 'cup',
    materials: {ceramic: material('#fff5df'), coffee: material('#4b2915')},
    joints: [
      joint(
        'body',
        null,
        [0, 0, 0],
        {type: 'cylinder', radius: 0.12, height: 0.18},
        'ceramic',
        [0, -0.08, 0],
      ),
      joint(
        'coffee',
        'body',
        [0, 0.015, 0],
        {type: 'cylinder', radius: 0.105, height: 0.005},
        'coffee',
      ),
      joint(
        'handle',
        'body',
        [0.14, -0.06, 0],
        {type: 'sphere', radius: 0.06},
        'ceramic',
      ),
    ],
  });
