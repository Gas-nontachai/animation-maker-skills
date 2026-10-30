# M4 cinematic candidate

M4 introduces a separate optional scene contract. Existing Rig 1.0, timeline 1.0, M2/M3 project loading, and the experimental 2D camera remain unchanged. A missing renderingMode means the original 2D path; an explicit `2d` mode also uses that path. No migration is required. The legacy x/y/zoom camera remains a 2D framing feature; it cannot reveal hidden geometry.

## Project and authoring

The animate agent chooses representation from the prompt: flat artwork uses 2D; real front/side/back changes use 3D; overlays plus a 3D world use hybrid. The agent authors editable scene.json, timeline.json, procedural model JSON and optional local GLB/SVG assets. There is no external language-model service or autonomous modeling API. Users describe the animation; the agent writes these contracts.

Use `createStylizedCharacter3D()`, `createCoffeeCup3D()`, and `createBoxModel3D()` from animation-runtime to author reusable procedural assets. `examples/m4/coffee` is the ten-second reference; `examples/m4/hybrid` adds a screen overlay; `examples/m4/glb` is a self-contained local GLB test. `scripts/m4-examples.ts` records the reference construction and analytic two-bone arm solution. The standard validate, render, inspect commands accept these projects. `doctor --3d` checks installed 3D dependencies and probes WebGL2 in the selected browser in addition to normal prerequisites.

## Coordinates and models

Right-handed coordinates: +X right, +Y up, +Z toward the character's front. Distances are world units, angles radians, Euler order XYZ. SVG coordinates stay in pixels, +Y down. `svgToWorld()` is the explicit centered pixel conversion boundary, default 100 pixels/unit. A screen overlay never uses this conversion implicitly.

Model JSON has version 1.0, id, materials, and joints. Each joint defines id, nullable parent, local position/rotation/positive scale, optional box/sphere/cylinder geometry, material ID, geometryPosition relative to the pivot, and named contact anchors. Cycles, duplicates, unknown materials/parents and non-finite values fail validation. Each object can reuse a model reference; transforms and joints are evaluated independently per instance. Procedural rig semantics are separate from SVG Rig 1.0. Never copy SVG joint angles into a 3D rig.

## Timeline and camera

Timeline 1.0 for cinematic scenes contains fps, duration, shots, tracks and attachments. Shots have unique IDs, half-open startFrame/endFrame intervals with complete, ordered coverage, camera, optional endCamera, optional orbitRadians, optional follow object ID, and transition `cut`. A camera defines type `lookAt`, projection perspective/orthographic, position, target, fov (degrees), span (orthographic vertical world extent), near and far. Projection changes require a cut. View direction and framing are independent: `cameraPreset(view, framing, target)` combines front/back/left/right/three-quarter/top with wide/medium/close-up. Top uses a small Z offset to preserve the fixed Y-up convention.

Start/end positions implement pan, tilt, dolly and tracking paths; fov implements optical zoom, span implements orthographic zoom. orbitRadians rotates the interpolated camera offset around world Y. Follow adds the evaluated object position to both camera position and target, evaluated after attachment and motion. Interpolation reaches the endpoint on endFrame-1. Degenerate directions, invalid lenses and missing targets produce diagnostics. Author paths that do not pass through a singular look direction. No live animation loop or wall clock drives state.

Tracks identify object and optional joint, property position/rotation/scale, and strictly increasing frame/value keys. Values interpolate linearly and hold outside the keys. Rotation keys are radians in the joint's local XYZ frame; author intermediate keys for intentional long turns. Walk, sit, reach, hold and sip gestures are authored as representation-specific joint tracks by the agent; this candidate does not add a general-purpose 3D semantic motion compiler. The reference includes a reachable arm trajectory rather than copying M3's 2D joint angles.

Attachments define object, parent object, joint, anchor, [startFrame,endFrame), and local offset. The attached object's origin follows the fully evaluated joint and anchor, including orientation. Authored object tracks are used when detached. Author a release world transform matching the last attached state, as the reference does, to avoid jumps. Attachment cycles and overlapping owners are rejected. Camera cuts never alter action time or attachments.

## Composition

World-space 3D models use the scene depth buffer. World-space-2d layers use safe SVG textures on planes, with fixed or camera-facing billboard orientation; position and size are world units. Texture alpha and a shared depth buffer provide normal plane occlusion, not volumetric SVG geometry. Screen-space layers use position and size in pixels. Negative order is behind the world canvas; nonnegative order is in front. Within each screen band, ascending order controls stacking. World-plane ordering is depth based. Screen layers never participate in 3D depth or perspective. There is no automatic per-pixel depth relationship between independent SVG overlays and world content.

## Import safety and limits

Only confined project-local procedural .json and self-contained .glb 2.0 models are supported. Absolute, escaping, URL and symlink-escaping references are rejected. Model size limit is 20 MiB per model, 64 MiB per scene, 4096 instanced procedural meshes, one million instanced imported accessor elements, 256 nodes/joints, 128 meshes and one million aggregate accessor elements. SVG layers are limited to 1 MiB and use the existing SVG allowlist. GLB extensions, external/data URIs, embedded animation and textures are rejected explicitly. Texture decoding, skeletal GLB animation and loose .gltf dependency loading are not supported in this candidate. Imported models receive object-level keyed transforms; joint animation/attachments currently use procedural models. No model metadata is executed and no external model is fetched.

## Verification and release status

Run `npm test`, `npm run typecheck`, `npm run test:integration`, and `npm run security:check`. Render both ten-second scenarios and inspect H.264, 1280x720, 24 FPS, 240 frames, ten seconds, no audio. Run `npm run test:m4 -- <unused-evidence-directory>` to render both projects at 0,47,48,70,99,100,130,169,170,190,191,239. Review cuts, pickup, sip, release, identity and framing. This is a candidate implementation, not a published M4 release. Generalized semantic motion, unrestricted glTF imports and all PRD acceptance items must not be claimed solely from these examples. Do not merge/publish before acceptance review.
