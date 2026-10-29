import {describe, it, expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {loadProject} from '../scripts/project';
import {
  cinematicSceneSchema,
  cinematicTimelineSchema,
  model3dSchema,
  evaluateCinematic,
  svgToWorld,
  validateCinematic,
} from '../packages/animation-runtime/src/cinematic';
import {validateGlb} from '../packages/animation-runtime/src/glb';
import {Vector3} from 'three';
const coffee = () => loadProject('examples/m4/coffee');
describe('M4 cinematic contracts and evaluation', () => {
  it('keeps contact aligned through cuts and supports seeking in any order', async () => {
    const p = await coffee();
    if (!p.cinematic) throw Error('Not cinematic');
    const run = (frame: number) => evaluateCinematic(p, frame);
    for (const f of [70, 99, 100, 120, 169, 170, 190]) {
      const state = run(f),
        cup = new Vector3().setFromMatrixPosition(
          state.objects.get('cup')!.matrix,
        ),
        hand = new Vector3(-0.17, 0, 0).applyMatrix4(
          state.objects.get('man')!.joints.get('rightHand')!,
        );
      expect(cup.distanceTo(hand)).toBeLessThan(1e-9);
    }
    const expected = run(120).objects.get('cup')!.matrix.toArray();
    run(239);
    run(0);
    expect(run(120).objects.get('cup')!.matrix.toArray()).toEqual(expected);
    expect(run(99).shot).not.toBe(run(100).shot);
    const before = new Vector3().setFromMatrixPosition(
        run(190).objects.get('cup')!.matrix,
      ),
      after = new Vector3().setFromMatrixPosition(
        run(191).objects.get('cup')!.matrix,
      );
    expect(before.distanceTo(after)).toBeLessThan(1e-8);
  });
  it('rejects gaps, overlaps, duplicate shots, invalid lenses and targets', async () => {
    const p = await coffee();
    if (!p.cinematic) throw Error();
    for (const mutate of [
      (t: any) => t.shots[1].startFrame++,
      (t: any) => (t.shots[1].id = t.shots[0].id),
      (t: any) => (t.shots[0].camera.fov = 0),
      (t: any) => (t.tracks[0].keyframes[1].frame = 0),
    ]) {
      const t = structuredClone(p.timeline);
      mutate(t);
      expect(cinematicTimelineSchema.safeParse(t).success).toBe(false);
    }
    const t = structuredClone(p.timeline);
    t.shots[0].follow = 'missing';
    expect(() => validateCinematic(p.cinematic, t, p.models)).toThrow(
      'camera target',
    );
  });
  it('validates finite hierarchies and material references', async () => {
    const p = await coffee();
    if (!p.cinematic) throw Error();
    const m = structuredClone(p.models['man.json']);
    m.joints[0].parent = 'rightHand';
    expect(model3dSchema.safeParse(m).success).toBe(false);
    m.joints[0].parent = null;
    m.joints[0].position[0] = Infinity;
    expect(model3dSchema.safeParse(m).success).toBe(false);
    const s = structuredClone(p.cinematic);
    s.objects[0].model = '../escape.glb';
    expect(cinematicSceneSchema.safeParse(s).success).toBe(false);
  });
  it('converts legacy pixels only at the world boundary', () => {
    expect(svgToWorld(640, 360)).toEqual([0, 0, 0]);
    expect(svgToWorld(740, 260)).toEqual([1, 1, 0]);
    expect(() => svgToWorld(0, 0, 0)).toThrow();
  });
  it('evaluates follow and orthographic framing deterministically', async () => {
    const p = await coffee();
    if (!p.cinematic) throw Error();
    p.timeline.shots[0].camera.projection = 'orthographic';
    p.timeline.shots[0].follow = 'cup';
    const s = evaluateCinematic(p, 10);
    expect(s.camera.projection).toBe('orthographic');
    expect(s.camera.target[0]).toBeCloseTo(0.55);
    expect(s.camera.span).toBe(5);
  });
  it('loads hybrid screen overlays without changing world transforms', async () => {
    const a = await coffee(),
      b = await loadProject('examples/m4/hybrid');
    if (!a.cinematic || !b.cinematic) throw Error();
    expect(b.overlays['overlay.svg'].markup).toContain('<rect');
    expect(
      evaluateCinematic(a, 120).objects.get('cup')!.matrix.toArray(),
    ).toEqual(evaluateCinematic(b, 120).objects.get('cup')!.matrix.toArray());
  });
});
function glb(data: unknown) {
  const source = Buffer.from(JSON.stringify(data));
  const json = Buffer.alloc(Math.ceil(source.length / 4) * 4, 32);
  source.copy(json);
  const result = Buffer.alloc(20 + json.length);
  result.writeUInt32LE(0x46546c67);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(json.length, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  json.copy(result, 20);
  return result;
}
describe('GLB safety', () => {
  it('accepts a self-contained empty model and rejects malformed containers', () => {
    expect(
      validateGlb(glb({asset: {version: '2.0'}, nodes: []})).asset.version,
    ).toBe('2.0');
    expect(() => validateGlb(Buffer.alloc(10))).toThrow();
  });
  it('rejects external dependencies, extensions, cycles and invalid references', () => {
    for (const extra of [
      {buffers: [{uri: 'https://evil/model.bin'}]},
      {extensionsUsed: ['KHR_draco_mesh_compression']},
      {nodes: [{children: [0]}]},
      {nodes: [{mesh: 99}]},
      {accessors: [{count: 1000000000, componentType: 5126, type: 'VEC3'}]},
    ])
      expect(() =>
        validateGlb(glb({asset: {version: '2.0'}, ...extra})),
      ).toThrow();
  });
});

describe('Cinematic import integration', () => {
  it('loads a valid local GLB through the public project loader', async () => {
    const p = await loadProject('examples/m4/glb');
    if (!p.cinematic) throw Error('Expected cinematic project');
    expect(p.glbs['triangle.glb']).toBeTruthy();
    expect(
      evaluateCinematic(p, 0).objects.get('triangle')!.matrix.elements,
    ).toHaveLength(16);
  });
  it('rejects non-finite binary geometry', async () => {
    const bytes = Buffer.from(await readFile('examples/m4/glb/triangle.glb'));
    const jsonLength = bytes.readUInt32LE(12);
    bytes.writeFloatLE(NaN, 28 + jsonLength);
    expect(() => validateGlb(bytes)).toThrow('Non-finite');
  });
  it('separates view direction from framing and supports deterministic orbit', async () => {
    const {cameraPreset} =
      await import('../packages/animation-runtime/src/cinematic');
    expect(cameraPreset('front', 'close-up').position[2]).toBeLessThan(
      cameraPreset('front', 'wide').position[2],
    );
    expect(cameraPreset('back', 'wide').position[2]).toBeLessThan(0);
    const p = await coffee();
    if (!p.cinematic) throw Error();
    p.timeline.shots[0].orbitRadians = Math.PI;
    const start = evaluateCinematic(p, 0).camera,
      end = evaluateCinematic(p, 47).camera;
    expect(end.position[0] - end.target[0]).toBeCloseTo(
      -(start.position[0] - start.target[0]),
    );
    expect(end.position[2] - end.target[2]).toBeCloseTo(
      -(start.position[2] - start.target[2]),
    );
  });
});
