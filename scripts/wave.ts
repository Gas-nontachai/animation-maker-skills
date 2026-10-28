import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {validateAnimation} from '../packages/animation-runtime/src/schemas';
import {loadProject, safeSvg} from './project';

export async function createWave(project: string) {
  const {rig, timeline} = validateAnimation({id: 'waving-robot', version: '1.0', canvas: {width: 400, height: 600}, parts: [
    {id: 'body', asset: 'parts/body.svg', parent: null, position: {x: 200, y: 260}, pivot: {x: 0, y: 0}, zIndex: 2},
    {id: 'head', asset: 'parts/head.svg', parent: 'body', position: {x: 0, y: -90}, pivot: {x: 0, y: 0}, zIndex: 4},
    ...['left', 'right'].flatMap((side, i) => [
      {id: `${side}-arm`, asset: `parts/${side}-arm.svg`, parent: 'body', position: {x: i ? 66 : -66, y: -48}, pivot: {x: 16, y: 16}, zIndex: i ? 3 : 1},
      {id: `${side}-leg`, asset: `parts/${side}-leg.svg`, parent: 'body', position: {x: i ? 34 : -34, y: 132}, pivot: {x: 18, y: 0}, zIndex: 0},
    ]),
  ]}, {version: '1.0', characterId: 'waving-robot', fps: 24, duration: 3, tracks: [{target: 'right-arm', property: 'rotation',
    keyframes: Array.from({length: 7}, (_, i) => ({time: i / 2, value: i % 2 ? -150 : 0, easing: 'easeInOut'})),
  }]});
  const arm = '<rect width="32" height="134" rx="10" fill="#087f8c"/><rect x="-3" y="115" width="38" height="42" rx="8" fill="#f4bd50"/>';
  const leg = '<rect width="36" height="112" rx="8" fill="#334155"/><rect x="-6" y="96" width="48" height="24" rx="6" fill="#0f172a"/>';
  const shapes: Record<string, string> = {
    body: '<rect x="-66" y="-66" width="132" height="200" rx="22" fill="#087f8c"/><rect x="-38" y="-30" width="76" height="65" rx="10" fill="#f4bd50"/><circle cy="2" r="14" fill="#334155"/>',
    head: '<rect x="-58" y="-85" width="116" height="100" rx="24" fill="#f4bd50"/><circle cx="-24" cy="-42" r="9" fill="#0f172a"/><circle cx="24" cy="-42" r="9" fill="#0f172a"/><path d="M -22 -15 Q 0 4 22 -15" fill="none" stroke="#0f172a" stroke-width="6" stroke-linecap="round"/>',
    'left-arm': arm, 'right-arm': arm, 'left-leg': leg, 'right-leg': leg,
  };
  const assets = Object.fromEntries(Object.entries(shapes).map(([id, shape]) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600">${shape}</svg>`;
    safeSvg(svg);
    return [id, svg];
  }));
  // Reserve a new directory exclusively so existing user assets are never overwritten.
  await mkdir(path.dirname(path.resolve(project)), {recursive: true});
  await mkdir(project);
  await mkdir(path.join(project, 'character/parts'), {recursive: true});
  await writeFile(path.join(project, 'character/rig.json'), JSON.stringify(rig, null, 2) + '\n', {flag: 'wx'});
  await writeFile(path.join(project, 'timeline.json'), JSON.stringify(timeline, null, 2) + '\n', {flag: 'wx'});
  for (const part of rig.parts) await writeFile(path.join(project, 'character', part.asset), assets[part.id], {flag: 'wx'});
  await loadProject(project);
}
