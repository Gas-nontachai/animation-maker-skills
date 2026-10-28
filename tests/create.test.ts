import {it, expect} from 'vitest';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createWave} from '../scripts/wave';
import {loadProject} from '../scripts/project';
import {evaluateFrame} from '../packages/animation-runtime/src';

it('generates new safe SVG sources and a validated reusable three-wave preset without overwriting', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'animation-create-'));
  const project = path.join(dir, 'wave');
  try {
    await createWave(project);
    const props = await loadProject(project);
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
