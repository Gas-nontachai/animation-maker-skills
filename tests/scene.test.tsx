import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {sceneSchema, sceneTimelineSchema, validateScene, evaluateSceneFrame, AnimationComposer} from '../packages/animation-runtime/src';
import {loadProject} from '../scripts/project';
const manifest = {version: '1.0', canvas: {width: 1280, height: 720}, objects: [{id: 'a', rig: 'rig.json'}, {id: 'b', rig: 'rig.json', position: {x: 100, y: 20}}]};
const timing = {version: '1.0', fps: 24, duration: 3, tracks: []};
const rig = {version: '1.0', id: 'tree', canvas: {width: 100, height: 100}, parts: [{id: 'body', asset: 'body.svg', parent: null, position: {x: 5, y: 6}, pivot: {x: 0, y: 0}, zIndex: 0}]};
it('validates defaults, repeated instances, static transforms and deterministic evaluation without mutation', () => {
 const props = validateScene(manifest, timing, {'rig.json': rig});
 const before = JSON.stringify(props);
 const result = evaluateSceneFrame({...props, frame: 0});
 expect(result.map(o => o.id)).toEqual(['a', 'b']);
 expect(result[1].matrix).toEqual([1, 0, -0, 1, 100, 20]);
 expect(result[1].parts[0].matrix[4]).toBe(5);
 expect(evaluateSceneFrame({...props, frame: 0})).toEqual(result);
 expect(JSON.stringify(props)).toBe(before);
 for (const frame of [-1, 72, 0.5, NaN]) expect(() => evaluateSceneFrame({...props, frame})).toThrow('outside');
});
it('rejects IDs, unknown references, malformed timing and duplicate tracks', () => {
 expect(() => sceneSchema.parse({...manifest, objects: [manifest.objects[0], manifest.objects[0]]})).toThrow('duplicate');
 expect(() => validateScene(manifest, timing, {})).toThrow('Missing rig');
 const track = {target: {object: 'a', part: 'body'}, property: 'rotation', keyframes: [{time: 0, value: 0}]};
 expect(() => sceneTimelineSchema.parse({...timing, tracks: [track, track]})).toThrow('duplicate');
 for (const target of [{object: 'missing'}, {object: 'a', part: 'missing'}]) expect(() => validateScene(manifest, {...timing, tracks: [{...track, target}]}, {'rig.json': rig})).toThrow('Unknown');
 for (const patch of [{fps: 0}, {duration: 0.01}, {tracks: [{...track, keyframes: [{time: 4, value: 0}]}]}]) expect(() => sceneTimelineSchema.parse({...timing, ...patch})).toThrow();
 expect(() => sceneSchema.parse({...manifest, objects: [{...manifest.objects[0], opacity: 2}]})).toThrow();
});
it('synchronizes independent object and part tracks and preserves object groups', () => {
 const props = validateScene(manifest, {...timing, tracks: [{target: {object: 'a'}, property: 'position.x', keyframes: [{time: 0, value: 0}, {time: 2, value: 100}]}, {target: {object: 'a', part: 'body'}, property: 'rotation', keyframes: [{time: 0, value: 0}, {time: 2, value: 90}]}]}, {'rig.json': rig});
 const result = evaluateSceneFrame({...props, frame: 24});
 expect(result[0].matrix[4]).toBe(50);
 expect(result[0].parts[0].rotation).toBe(45);
 expect(result[1].parts[0].rotation).toBe(0);
 const markup = renderToStaticMarkup(<AnimationComposer {...props} assets={{'rig.json': {body: '<rect width="10" height="10"/>'}}} frame={24}/>);
 expect(markup.match(/<svg/g)).toHaveLength(1);
 expect(markup).toContain('background:transparent');
});
it('loads a scene through the same confined SVG pipeline', async () => {
 const props = await loadProject('examples/m2/static');
 if (!('scene' in props)) throw new Error('Expected scene');
 expect(props.scene.objects).toHaveLength(4);
});
it('rejects scene path escapes, unsafe SVG, dangling scene symlinks and invalid references', async () => {
 const {mkdtemp, mkdir, writeFile, symlink, rm} = await import('node:fs/promises');
 const {tmpdir} = await import('node:os');
 const path = await import('node:path');
 const root = await mkdtemp(path.join(tmpdir(), 'scene-security-'));
 const dir = path.join(root, 'project');
 await mkdir(dir);
 const json = (name: string, value: unknown) => writeFile(path.join(dir, name), JSON.stringify(value));
 try {
  await json('timeline.json', timing);
  await writeFile(path.join(root, 'outside.json'), JSON.stringify(rig));
  for (const reference of ['../outside.json', path.join(root, 'outside.json'), 'bad\\rig.json']) {
   await json('scene.json', {...manifest, objects: [{id: 'a', rig: reference}]});
   await expect(loadProject(dir)).rejects.toThrow();
  }
  await symlink(path.join(root, 'outside.json'), path.join(dir, 'rig.json'));
  await json('scene.json', {...manifest, objects: [manifest.objects[0]]});
  await expect(loadProject(dir)).rejects.toThrow('escapes');
  await rm(path.join(dir, 'rig.json'));
  await json('rig.json', rig);
  await writeFile(path.join(dir, 'body.svg'), '<svg viewBox="0 0 10 10"><script/></svg>');
  await expect(loadProject(dir)).rejects.toThrow('Forbidden');
  await rm(path.join(dir, 'scene.json'));
  await symlink(path.join(root, 'missing'), path.join(dir, 'scene.json'));
  await expect(loadProject(dir)).rejects.toThrow();
 } finally {await rm(root, {recursive: true, force: true});}
});
it('uses declaration order for ties and keeps local part layers inside each object', () => {
 const props = validateScene({...manifest, objects: [{...manifest.objects[0], zIndex: 2}, {...manifest.objects[1], zIndex: -1}]}, timing, {'rig.json': rig});
 expect(evaluateSceneFrame({...props, frame: 0}).map(o => o.id)).toEqual(['b', 'a']);
});
it('composes rotation, scale and opacity around the rig origin without changing local matrices', () => {
 const props = validateScene({...manifest, objects: [{...manifest.objects[0], rotation: 90, scale: {x: 2, y: 3}, opacity: 0.5}]}, timing, {'rig.json': rig});
 const object = evaluateSceneFrame({...props, frame: 0})[0];
 expect(object.matrix[1]).toBeCloseTo(2);
 expect(object.matrix[2]).toBeCloseTo(-3);
 expect(object.opacity).toBe(0.5);
 expect(object.parts[0].matrix[4]).toBe(5);
 expect(object.parts[0].matrix[5]).toBe(6);
 const markup = renderToStaticMarkup(<AnimationComposer {...props} assets={{'rig.json': {body: '<rect/>'}}} frame={0}/>);
 expect(markup).toContain('opacity="0.5"');
});
