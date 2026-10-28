import type {z} from 'zod';
import type {rigSchema, timelineSchema} from '../../packages/animation-runtime/src/schemas';

// Hand-authored contract fixtures, independent of the wave preset.
const svg = (body: string) => `<svg viewBox="0 0 240 320">${body}</svg>`;
export const dynamicAssets: {rig: z.input<typeof rigSchema>; timeline: z.input<typeof timelineSchema>; assets: Record<string, string>}[] = [
  {
    rig: {id: 'coffee-cup', version: '1.0', canvas: {width: 160, height: 160}, parts: [
      {id: 'cup', asset: 'parts/cup.svg', parent: null, position: {x: 80, y: 80}, pivot: {x: 80, y: 80}, zIndex: 0},
    ]},
    timeline: {version: '1.0', characterId: 'coffee-cup', fps: 24, duration: 3, tracks: []},
    assets: {cup: '<svg viewBox="0 0 160 160"><path d="M110 45 H125 Q155 75 125 105 H110" fill="none" stroke="#7c4525" stroke-width="12"/><rect x="20" y="35" width="95" height="95" rx="15" fill="#eebc79"/><ellipse cx="67" cy="35" rx="47" ry="12" fill="#5a3522"/></svg>'},
  },
  {
    rig: {id: 'yellow-shirt-human', version: '1.0', canvas: {width: 240, height: 320}, parts: [
      {id: 'torso', asset: 'parts/torso.svg', parent: null, position: {x: 50, y: 110}, pivot: {x: 0, y: 0}, zIndex: 0},
      {id: 'head', asset: 'parts/head.svg', parent: 'torso', position: {x: 70, y: 0}, pivot: {x: 40, y: 85}, zIndex: 3},
      {id: 'upper-arm', asset: 'parts/upper-arm.svg', parent: 'torso', position: {x: 115, y: 20}, pivot: {x: 12, y: 10}, zIndex: 1},
      {id: 'forearm', asset: 'parts/forearm.svg', parent: 'upper-arm', position: {x: 12, y: 60}, pivot: {x: 10, y: 5}, zIndex: 2},
    ]},
    timeline: {version: '1.0', characterId: 'yellow-shirt-human', fps: 24, duration: 3, tracks: [
      {target: 'forearm', property: 'rotation', keyframes: [{time: 0, value: 0}, {time: 1, value: -60}, {time: 2, value: 0}]},
    ]},
    assets: {
      torso: svg('<rect x="20" y="0" width="100" height="140" rx="25" fill="#facc15"/>'),
      head: svg('<ellipse cx="40" cy="45" rx="35" ry="42" fill="#b87950"/>'),
      'upper-arm': svg('<rect width="24" height="65" rx="12" fill="#facc15"/>'),
      forearm: svg('<rect width="20" height="60" rx="10" fill="#b87950"/>'),
    },
  },
];
