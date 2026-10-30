import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {
  validateScene,
  evaluateCamera,
  AnimationComposer,
} from '../packages/animation-runtime/src';

const scene = {
  version: '1.0',
  canvas: {width: 1280, height: 720},
  objects: [{id: 'box', rig: 'box.json'}],
};
const rigs = {
  'box.json': {
    id: 'box',
    version: '1.0',
    canvas: {width: 100, height: 100},
    parts: [
      {
        id: 'body',
        asset: 'body.svg',
        parent: null,
        position: {x: 0, y: 0},
        pivot: {x: 0, y: 0},
        zIndex: 0,
      },
    ],
  },
};
const camera = {
  shots: [
    {startFrame: 0, endFrame: 24, from: {x: 640, y: 360, zoom: 1}},
    {
      startFrame: 24,
      endFrame: 48,
      from: {x: 640, y: 360, zoom: 1},
      to: {x: 400, y: 300, zoom: 2},
    },
  ],
};
const timeline = {version: '1.0', fps: 24, duration: 2, tracks: [], camera};
it('defaults to identity and interpolates camera shots deterministically', () => {
  expect(evaluateCamera(undefined, 10)).toEqual({x: 640, y: 360, zoom: 1});
  expect(evaluateCamera(camera.shots, 24)).toEqual({x: 640, y: 360, zoom: 1});
  expect(evaluateCamera(camera.shots, 47)).toEqual({x: 400, y: 300, zoom: 2});
  expect(evaluateCamera(camera.shots, 36).zoom).toBeGreaterThan(1);
});
it('rejects gaps, overlap, out-of-range shots and invalid zoom', () => {
  for (const bad of [
    [{...camera.shots[0], endFrame: 23}, camera.shots[1]],
    [camera.shots[0], {...camera.shots[1], startFrame: 23}],
    [camera.shots[0], {...camera.shots[1], endFrame: 49}],
    [camera.shots[0], {...camera.shots[1], from: {x: 0, y: 0, zoom: 0}}],
  ])
    expect(() =>
      validateScene(scene, {...timeline, camera: {shots: bad}}, rigs),
    ).toThrow();
});
it('renders both the scene and the camera group without changing objects', () => {
  const props = validateScene(scene, timeline, rigs);
  const markup = renderToStaticMarkup(
    <AnimationComposer
      {...props}
      assets={{'box.json': {body: '<rect width="10" height="10"/>'}}}
      frame={47}
    />,
  );
  expect(markup).toContain('scale(2)');
  expect(markup).toContain('<rect width="10" height="10"');
  expect(markup.match(/<svg/g)).toHaveLength(1);
});
