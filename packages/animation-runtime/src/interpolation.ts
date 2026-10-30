import type {Track} from './schemas';
export function ease(t: number, easing: Track['keyframes'][number]['easing']) {
  switch (easing) {
    case 'linear':
      return t;
    case 'easeIn':
      return t * t;
    case 'easeOut':
      return t * (2 - t);
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  }
}
export function interpolate(track: Track, time: number): number {
  const keys = track.keyframes;
  if (time <= keys[0].time) return keys[0].value;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1],
      b = keys[i];
    if (time <= b.time)
      return (
        a.value +
        (b.value - a.value) *
          ease((time - a.time) / (b.time - a.time), a.easing)
      );
  }
  return keys[keys.length - 1].value;
}
