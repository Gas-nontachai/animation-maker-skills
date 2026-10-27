import {describe, expect, it} from 'vitest';
import {mkdtemp, mkdir, writeFile, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import {ease, interpolate, evaluateFrame, validateAnimation, rigSchema, timelineSchema, SvgComposer} from '../packages/animation-runtime/src';
import {loadProject, safeSvg, confined} from '../scripts/project';
const project = 'examples/waving-character';
describe('animation', () => {
  it('interpolates and holds boundaries, including negative rotation', () => {
    const track = timelineSchema.parse({version:'1.0',characterId:'test',fps:24,duration:3,tracks:[{target:'arm',property:'rotation',keyframes:[{time:1,value:0},{time:2,value:-60}]}]}).tracks[0];
    expect([0,1,1.5,2,3].map(t => interpolate(track,t))).toEqual([0,0,-30,-60,-60]);
    for (const easing of ['linear','easeIn','easeOut','easeInOut'] as const) {
      expect([0,.5,1].map(t => ease(t,easing))).toEqual([0, {linear:.5,easeIn:.25,easeOut:.75,easeInOut:.5}[easing],1]);
    }
  });
  it('loads sample, evaluates deterministically without mutation and waves three times', async () => {
    const props = await loadProject(project);
    const original = JSON.stringify(props);
    const arm = (frame:number) => evaluateFrame({...props,frame}).find(p => p.id === 'right-arm')!;
    expect([0,12,24,36,48,60].map(f=>arm(f).rotation)).toEqual([0,-150,0,-150,0,-150]);
    expect(arm(71)).toEqual(arm(71));
    expect(JSON.stringify(props)).toBe(original);
    expect(() => arm(72)).toThrow('outside');
    expect(renderToStaticMarkup(<SvgComposer {...props} frame={12}/>)).toContain('matrix(');
  });
  it('inherits parent rotation, scale, opacity and compensates nonzero pivots', () => {
    const rig=rigSchema.parse({id:'test',version:'1.0',canvas:{width:400,height:600},parts:[
      {id:'parent',asset:'a.svg',parent:null,position:{x:100,y:100},pivot:{x:10,y:0},rotation:90,scale:{x:2,y:2},opacity:.5,zIndex:0},
      {id:'child',asset:'b.svg',parent:'parent',position:{x:30,y:0},pivot:{x:5,y:0},opacity:.5,zIndex:1}]});
    const timeline=timelineSchema.parse({version:'1.0',characterId:'test',fps:24,duration:3,tracks:[]});
    const child=evaluateFrame({character:rig,timeline,frame:0})[1];
    expect(child.matrix[4]+child.matrix[0]*5).toBeCloseTo(100);
    expect(child.matrix[5]+child.matrix[1]*5).toBeCloseTo(140);
    expect(child.opacity).toBe(.25);
  });
  it('evaluates every supported property as a local absolute value', async () => {
    const {character,timeline}=await loadProject(project);
    const properties = ['position.x','position.y','rotation','scale.x','scale.y','opacity'] as const;
    const values = [300,200,-45,2,.5,.25];
    const animation=timelineSchema.parse({...timeline,placement:{x:10,y:20,scale:2},tracks:properties.map((property,i)=>({target:'body',property,keyframes:[{time:0,value:values[i]}]}))});
    const body=evaluateFrame({character,timeline:animation,frame:0}).find(p=>p.id==='body')!;
    expect(body.position).toEqual({x:300,y:200});expect(body.scale).toEqual({x:2,y:.5});
    expect(body.rotation).toBe(-45);expect(body.opacity).toBe(.25);
    expect(renderToStaticMarkup(<SvgComposer character={character} timeline={animation} assets={{}} frame={0}/>)).toContain('translate(10 20) scale(2)');
  });
  it('rejects invalid references, duplicate IDs, cycles and malformed timelines', async () => {
    const {character,timeline}=await loadProject(project);
    expect(()=>rigSchema.parse({...character,parts:[...character.parts,character.parts[0]]})).toThrow('duplicate');
    expect(()=>rigSchema.parse({...character,parts:character.parts.map(p=>({...p,parent:'missing'}))})).toThrow('missing parent');
    expect(()=>rigSchema.parse({...character,parts:character.parts.map(p=>({...p,parent:p.id}))})).toThrow('circular');
    expect(()=>validateAnimation(character,{...timeline,characterId:'other'})).toThrow('characterId');
    expect(()=>validateAnimation(character,{...timeline,tracks:[{...timeline.tracks[0],target:'missing'}]})).toThrow('Track 0');
    const track=timeline.tracks[0];
    for (const keyframes of [[track.keyframes[0],track.keyframes[0]],[track.keyframes[1],track.keyframes[0]],[{time:4,value:0,easing:'linear'}]]) expect(()=>timelineSchema.parse({...timeline,tracks:[{...track,keyframes}]})).toThrow();
    expect(()=>timelineSchema.parse({...timeline,duration:3.01})).toThrow('integer');
    expect(()=>timelineSchema.parse({...timeline,tracks:[track,track]})).toThrow('duplicate track');
  });
});
describe('asset boundary', () => {
  it('rejects executable SVG, resources, malformed XML and unsupported CSS', () => {
    for (const body of ['<script>alert(1)</script>','<image href="https://evil.test/a"/>','<rect onload="alert(1)"/>','<foreignObject/>','<style/>','<path fill="url(#a)"/>','<use href="#a"/>','<rect style="fill:red"/>','<g>']) expect(()=>safeSvg(`<svg viewBox="0 0 400 600">${body}</svg>`)).toThrow();
    expect(()=>safeSvg('<!DOCTYPE svg><svg viewBox="0 0 1 1"/>')).toThrow();
    expect(safeSvg('<svg viewBox="0 0 1 1" transform="scale(2)"><circle r="1"/></svg>')).toContain('transform="scale(2)"');
  });
  it('rejects traversal, symlink escapes, missing assets and identifies the part', async () => {
    const root=await mkdtemp(path.join(tmpdir(),'animation-test-'));
    try {
      await mkdir(path.join(root,'project'));
      await writeFile(path.join(root,'outside.svg'),'outside');
      await symlink(path.join(root,'outside.svg'),path.join(root,'project','link.svg'));
      for(const name of ['../outside.svg','link.svg','missing.svg']) await expect(confined(path.join(root,'project'),name)).rejects.toThrow();
      const {character,timeline}=await loadProject(project);
      await mkdir(path.join(root,'project','character'));
      await writeFile(path.join(root,'project','character','rig.json'),JSON.stringify(character));
      await writeFile(path.join(root,'project','timeline.json'),JSON.stringify(timeline));
      await expect(loadProject(path.join(root,'project'))).rejects.toThrow('Part body');
    } finally {await rm(root,{recursive:true,force:true});}
  });
});
