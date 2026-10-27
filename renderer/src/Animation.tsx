import {useCurrentFrame} from 'remotion';
import {SvgComposer, type SceneProps} from '../../packages/animation-runtime/src';
export function Animation(props: SceneProps) {
  return <SvgComposer {...props} frame={useCurrentFrame()} />;
}
