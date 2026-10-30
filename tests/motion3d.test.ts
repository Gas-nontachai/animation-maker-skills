import {describe, it, expect} from 'vitest';
import {compileMotion3D} from '../packages/animation-runtime/src/motion3d';
import {
  evaluateCinematic,
  cinematicSceneSchema,
  cinematicTimelineSchema,
} from '../packages/animation-runtime/src/cinematic';
import {createStylizedCharacter3D} from '../packages/animation-runtime/src/procedural3d';
const model = createStylizedCharacter3D();
const scene = cinematicSceneSchema.parse({
  version: '1.0',
  renderingMode: '3d',
  canvas: {width: 1280, height: 720},
  objects: [{id: 'actor', model: 'actor.json'}],
});
const timeline = cinematicTimelineSchema.parse({
  version: '1.0',
  fps: 24,
  duration: 3,
  shots: [
    {
      id: 'a',
      startFrame: 0,
      endFrame: 72,
      camera: {
        projection: 'perspective',
        position: [0, 2, 5],
        target: [0, 1, 0],
      },
      transition: 'cut',
    },
  ],
  tracks: [],
});
describe('M4 reusable motion compiler', () => {
  it('compiles repeatable reach poses into existing runtime and preserves original timeline', () => {
    const input = {
      version: '1.0',
      actions: [
        {
          type: 'reach',
          object: 'actor',
          shoulder: 'rightUpperArm',
          elbow: 'rightForearm',
          hand: 'rightHand',
          startFrame: 5,
          endFrame: 40,
          from: [0.7, 1.1, 0.2],
          to: [0.6, 1.5, 0.35],
        },
      ],
    };
    const compiled = compileMotion3D(input, scene, timeline, {
      'actor.json': model,
    });
    expect(timeline.tracks).toHaveLength(0);
    expect(compiled.tracks).toHaveLength(2);
    expect(
      evaluateCinematic(
        {cinematic: scene, timeline: compiled, models: {'actor.json': model}},
        40,
      )
        .objects.get('actor')!
        .joints.has('rightHand'),
    ).toBe(true);
    expect(
      compileMotion3D(input, scene, timeline, {'actor.json': model}),
    ).toEqual(compiled);
  });
  it('compiles pose and movement without changing original schema', () => {
    const result = compileMotion3D(
      {
        version: '1.0',
        actions: [
          {
            type: 'move',
            object: 'actor',
            startFrame: 2,
            endFrame: 25,
            from: [0, 0, 0],
            to: [1, 0, 0],
          },
          {
            type: 'pose',
            object: 'actor',
            startFrame: 30,
            endFrame: 50,
            joints: {head: [0, 0.2, 0]},
          },
        ],
      },
      scene,
      timeline,
      {'actor.json': model},
    );
    expect(result.tracks).toHaveLength(2);
    expect(
      evaluateCinematic(
        {cinematic: scene, timeline: result, models: {'actor.json': model}},
        25,
      ).objects.get('actor')!.matrix.elements[12],
    ).toBeCloseTo(1);
  });
  it('rejects unreachable targets, missing joints and track conflicts', () => {
    const a = {
      type: 'reach',
      object: 'actor',
      shoulder: 'rightUpperArm',
      elbow: 'rightForearm',
      hand: 'rightHand',
      startFrame: 2,
      endFrame: 30,
      from: [0.7, 1.1, 0.2],
      to: [12, 1, 0],
    };
    expect(() =>
      compileMotion3D({version: '1.0', actions: [a]}, scene, timeline, {
        'actor.json': model,
      }),
    ).toThrow('Unreachable');
    expect(() =>
      compileMotion3D(
        {version: '1.0', actions: [{...a, shoulder: 'missing'}]},
        scene,
        timeline,
        {'actor.json': model},
      ),
    ).toThrow('hierarchy');
    expect(() =>
      compileMotion3D(
        {
          version: '1.0',
          actions: [
            {
              type: 'move',
              object: 'actor',
              startFrame: 1,
              endFrame: 20,
              from: [0, 0, 0],
              to: [1, 0, 0],
            },
            {
              type: 'move',
              object: 'actor',
              startFrame: 21,
              endFrame: 40,
              from: [1, 0, 0],
              to: [2, 0, 0],
            },
          ],
        },
        scene,
        timeline,
        {'actor.json': model},
      ),
    ).toThrow('conflict');
  });
});
