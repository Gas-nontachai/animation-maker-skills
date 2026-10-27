---
name: animate
description: Validate and evaluate controlled JSON keyframe timelines with the AI Animation Skills runtime. Use for Phase 1 timeline changes and checking animation values.
---
Work in the AI Animation Skills checkout; use the existing controlled example rather than generating animation automatically from natural language in Phase 1.

Read [timeline-spec.md](references/timeline-spec.md) before editing a timeline. Load the rig and validate the project through `npm run validate -- --project <project-directory>`. The runtime exports `validateAnimation`, `interpolate`, and `evaluateFrame` from `packages/animation-runtime/src/index.ts`. Use these for inspecting exact frame transforms; do not introduce browser timing or renderer-specific interpolation.

For the wave example, keep 24 FPS and 3 seconds. Check right-arm rotations at frames 0, 12, 24, 36, 48 and 60: 0, -150, 0, -150, 0, -150. Render with the render-video skill workflow and report any unverified output honestly.
