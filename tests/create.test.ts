import {it, expect} from 'vitest';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createWave} from '../scripts/wave';
import {loadProject} from '../scripts/project';
import {dynamicAssets} from './fixtures/dynamic-assets';
import {evaluateFrame} from '../packages/animation-runtime/src';

it('generates new safe SVG sources and a validated reusable three-wave preset without overwriting', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'animation-create-'));
  const project = path.join(dir, 'wave');
  try {
    await createWave(project);
    const props = await loadProject(project);
    if (!props.character) throw new Error("Expected M1 fixture");
    expect(props.character.id).toBe('waving-robot');
    expect(props.character.parts).toHaveLength(6);
    expect(props.timeline.fps * props.timeline.duration).toBe(72);
    expect([0,12,24,36,48,60].map(frame => evaluateFrame({...props, frame}).find(p => p.id === 'right-arm')!.rotation)).toEqual([0,-150,0,-150,0,-150]);
    const original = await readFile(path.join(project, 'character/parts/body.svg'), 'utf8');
    expect(original).toContain('#087f8c');
    await expect(createWave(project)).rejects.toMatchObject({code: 'EEXIST'});
    expect(await readFile(path.join(project, 'character/parts/body.svg'), 'utf8')).toBe(original);
  } finally {await rm(dir, {recursive: true, force: true});}
});

it.each(dynamicAssets)('loads agent-authored $rig.id sources without the create preset', async ({rig, timeline, assets}) => {
  const project = await mkdtemp(path.join(tmpdir(), 'animation-authored-'));
  try {
    await mkdir(path.join(project, 'character/parts'), {recursive: true});
    await writeFile(path.join(project, 'character/rig.json'), JSON.stringify(rig), {flag: 'wx'});
    await writeFile(path.join(project, 'timeline.json'), JSON.stringify(timeline), {flag: 'wx'});
    for (const part of rig.parts) {
      await writeFile(path.join(project, 'character', part.asset), assets[part.id], {flag: 'wx'});
    }
    const loaded = await loadProject(project);
    if (!loaded.character) throw new Error("Expected M1 fixture");
    expect(loaded.character.id).toBe(rig.id);
    expect(loaded.character.parts).toHaveLength(rig.parts.length);
    expect(loaded.timeline.tracks).toHaveLength(timeline.tracks.length);
    expect(Object.keys(loaded.assets)).toEqual(rig.parts.map(part => part.id));
    for (const part of rig.parts) {
      expect(await readFile(path.join(project, 'character', part.asset), 'utf8')).toBe(assets[part.id]);
    }
    const invalid = rig.parts[0];
    await writeFile(path.join(project, 'character', invalid.asset), '<svg viewBox="0 0 1 1"><script/></svg>');
    await expect(loadProject(project)).rejects.toThrow(`Part ${invalid.id} (${invalid.asset}): Forbidden SVG element script`);
  } finally {await rm(project, {recursive: true, force: true});}
});
