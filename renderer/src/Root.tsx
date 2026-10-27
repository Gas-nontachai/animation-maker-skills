import {Composition} from 'remotion';
import {Animation} from './Animation';
import {rigSchema, timelineSchema} from '../../packages/animation-runtime/src';
const defaultProps = {
  character: rigSchema.parse({id: 'placeholder', version: '1.0', canvas: {width: 400, height: 600}, parts: [{id: 'body', asset: 'body.svg', parent: null, position: {x: 0, y: 0}, pivot: {x: 0, y: 0}, zIndex: 0}]}),
  timeline: timelineSchema.parse({version: '1.0', characterId: 'placeholder', fps: 24, duration: 3, tracks: []}),
  assets: {},
};
export function Root() {
  return <Composition id="Animation" component={Animation} width={1280} height={720} fps={24} durationInFrames={72} defaultProps={defaultProps}
    calculateMetadata={({props}) => ({fps: props.timeline.fps, durationInFrames: props.timeline.fps * props.timeline.duration})} />;
}
