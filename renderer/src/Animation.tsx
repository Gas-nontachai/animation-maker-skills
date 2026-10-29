import {useCurrentFrame} from 'remotion';
import {
  AnimationComposer,
  type AnimationProps,
} from '../../packages/animation-runtime/src';
export function Animation(props: AnimationProps) {
  return <AnimationComposer {...props} frame={useCurrentFrame()} />;
}
