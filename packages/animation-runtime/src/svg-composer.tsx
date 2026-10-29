import {evaluateSceneFrame, evaluateCamera, type MultiSceneProps} from './scene';
import type {Rig, Timeline} from './schemas';
import {evaluateFrame} from './evaluate-frame';
export type SceneProps = {
  character: Rig;
  timeline: Timeline;
  assets: Record<string, string>;
  placement?: {x: number; y: number; scale: number};
};
export function SvgComposer({
  character,
  timeline,
  assets,
  placement = timeline.placement ?? {x: 440, y: 60, scale: 1},
  frame,
}: SceneProps & {frame: number}) {
  const parts = evaluateFrame({character, timeline, frame}).sort(
    (a, b) => a.zIndex - b.zIndex,
  );
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={1280}
      height={720}
      viewBox="0 0 1280 720"
      style={{background: 'white'}}
    >
      <g
        transform={`translate(${placement.x} ${placement.y}) scale(${placement.scale})`}
      >
        {parts.map((p) => (
          <g
            key={p.id}
            transform={`matrix(${p.matrix.join(' ')})`}
            opacity={p.opacity}
            dangerouslySetInnerHTML={{__html: assets[p.id]}}
          />
        ))}
      </g>
    </svg>
  );
}

export type AnimationProps = SceneProps | MultiSceneProps;
export function AnimationComposer(props: AnimationProps & {frame: number}) {
  if (!('scene' in props)) return <SvgComposer {...props} />;
  const objects = evaluateSceneFrame(props);
  const camera = evaluateCamera(props.timeline.camera?.shots, props.frame);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={1280}
      height={720}
      viewBox="0 0 1280 720"
      style={{background: props.scene.background ?? 'transparent'}}
    >
      <g transform={`translate(640 360) scale(${camera.zoom}) translate(${-camera.x} ${-camera.y})`}>
      {objects.map((object) => (
        <g
          key={object.id}
          transform={`matrix(${object.matrix.join(' ')})`}
          opacity={object.opacity}
        >
          {object.parts.map((part) => (
            <g
              key={part.id}
              transform={`matrix(${part.matrix.join(' ')})`}
              opacity={part.opacity}
              dangerouslySetInnerHTML={{
                __html: props.assets[object.rig][part.id],
              }}
            />
          ))}
        </g>
      ))}
      </g>
    </svg>
  );
}
