import type {Rig, Timeline} from './schemas';
import {interpolate} from './interpolation';
export type Matrix = [number, number, number, number, number, number];
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export function evaluateFrame({
  character,
  timeline,
  frame,
}: {
  character: Rig;
  timeline: Timeline;
  frame: number;
}) {
  if (
    !Number.isInteger(frame) ||
    frame < 0 ||
    frame >= timeline.fps * timeline.duration
  )
    throw new Error(`Frame ${frame} outside timeline`);
  const states = character.parts.map((part) => {
    const state = {
      ...part,
      position: {...part.position},
      scale: {...part.scale},
    };
    for (const track of timeline.tracks.filter((t) => t.target === part.id)) {
      const value = interpolate(track, frame / timeline.fps);
      switch (track.property) {
        case 'position.x':
          state.position.x = value;
          break;
        case 'position.y':
          state.position.y = value;
          break;
        case 'scale.x':
          state.scale.x = value;
          break;
        case 'scale.y':
          state.scale.y = value;
          break;
        case 'rotation':
          state.rotation = value;
          break;
        case 'opacity':
          state.opacity = value;
          break;
      }
    }
    return state;
  });
  const results = new Map<string, {matrix: Matrix; opacity: number}>();
  function world(id: string): {matrix: Matrix; opacity: number} {
    const cached = results.get(id);
    if (cached) return cached;
    const p = states.find((p) => p.id === id)!;
    const angle = (p.rotation * Math.PI) / 180,
      c = Math.cos(angle),
      s = Math.sin(angle);
    const local: Matrix = [
      c * p.scale.x,
      s * p.scale.x,
      -s * p.scale.y,
      c * p.scale.y,
      p.position.x,
      p.position.y,
    ];
    local[4] -= local[0] * p.pivot.x + local[2] * p.pivot.y;
    local[5] -= local[1] * p.pivot.x + local[3] * p.pivot.y;
    const parent = p.parent ? world(p.parent) : null;
    const result = {
      matrix: parent ? multiply(parent.matrix, local) : local,
      opacity: p.opacity * (parent?.opacity ?? 1),
    };
    results.set(id, result);
    return result;
  }
  return states.map((p) => ({...p, ...world(p.id)}));
}
