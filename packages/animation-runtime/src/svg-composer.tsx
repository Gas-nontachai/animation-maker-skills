import type {Rig, Timeline} from './schemas';
import {evaluateFrame} from './evaluate-frame';
export type SceneProps = {character: Rig; timeline: Timeline; assets: Record<string, string>; placement?: {x: number; y: number; scale: number}};
export function SvgComposer({character, timeline, assets, placement = timeline.placement ?? {x: 440, y: 60, scale: 1}, frame}: SceneProps & {frame: number}) {
  const parts = evaluateFrame({character, timeline, frame}).sort((a, b) => a.zIndex - b.zIndex);
  return <svg xmlns="http://www.w3.org/2000/svg" width={1280} height={720} viewBox="0 0 1280 720" style={{background: 'white'}}>
    <g transform={`translate(${placement.x} ${placement.y}) scale(${placement.scale})`}>
      {parts.map(p => <g key={p.id} transform={`matrix(${p.matrix.join(' ')})`} opacity={p.opacity} dangerouslySetInnerHTML={{__html: assets[p.id]}} />)}
    </g>
  </svg>;
}
