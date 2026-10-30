import {useCurrentFrame} from 'remotion';
import {
  AnimationComposer,
  type AnimationProps,
} from '../../packages/animation-runtime/src';
import {HybridComposition} from './HybridComposition';
import type {CinematicProps} from '../../packages/animation-runtime/src/cinematic';
export function Animation(props: AnimationProps | CinematicProps) {
  const frame = useCurrentFrame();
  return 'cinematic' in props ? (
    <HybridComposition {...props} frame={frame} />
  ) : (
    <AnimationComposer {...props} frame={frame} />
  );
}
