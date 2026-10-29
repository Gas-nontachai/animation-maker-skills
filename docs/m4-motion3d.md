# M4 procedural 3D motion compiler (candidate)

The runtime now exports `motion3dSchema` and `compileMotion3D(plan, scene, timeline, models)`. It converts a validated action plan into ordinary cinematic position/rotation tracks; the renderer and evaluator need no changes. The compiler does not mutate the input timeline.

Actions supported in this candidate:

- `move`: interpolate a 3D object's world position between authored `from` / `to` vectors
- `pose`: transition explicitly named procedural joint rotations to a specified pose
- `reach`: solve a two-bone arm in object coordinates from `from` to `to`, with reachability checks

All action ranges use inclusive integer start/end frames, with endFrame less than total frame count. Actions compile to reproducible frame-keyed tracks. The motion evaluator and renderer still operate on the existing cinematic timeline. Camera cuts do not change action progress.

Example use (from an authorized developer/agent TypeScript environment):

```ts
import {compileMotion3D} from './packages/animation-runtime/src/motion3d';
const compiled = compileMotion3D({
  version: '1.0',
  actions: [
    {type:'reach', object:'man', shoulder:'rightUpperArm',
     elbow:'rightForearm', hand:'rightHand',
     startFrame:5, endFrame:40, from:[0.7,1.1,0.2], to:[0.6,1.5,0.35]}
  ]
}, scene, timeline, models);
```

Limitations: this is NOT a full prompt-to-motion synthesizer or a generalized IK engine. Reach currently requires a direct upper-arm/forearm/hand chain, downward neutral segments, no pre-rotation of the arm, and an unrotated unit-scaled single torso parent. Reach targets use procedural model coordinates, not arbitrary world transforms. Each action must own distinct output tracks; repeated actions on the same joint or overlapping authored tracks fail explicitly. Hand grip, pickup/release attachments, walk gait, seated pose generation and release continuity still need to be authored/planned through the existing cinematic contracts. There is no new standalone CLI command.

Before release run typecheck, unit tests, integration tests, security checks and the M4 evidence renders on a local checkout. This commit does not establish release or visual acceptance.
