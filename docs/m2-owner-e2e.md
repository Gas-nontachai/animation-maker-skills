# M2 owner E2E — PENDING

Branch: feat/m2-scene-composition. Base commit: 990d716. Implementation changes remain in the working tree; use `git diff` and `git status --short` to review. No merge, publication or release is authorized by this handoff.

From repository root, use Node 22+ and installed dependencies. Run `node bin/animation-maker.mjs doctor`; browser download requires authorization if missing. Commands below need permission for browser launch and local server binding. Render refuses existing output files; choose unused output names on repeats.

## A — static objects

Sources: examples/m2/static (scene/timeline and assets/**).

```sh
node bin/animation-maker.mjs validate --project examples/m2/static
node bin/animation-maker.mjs render --project examples/m2/static --output output/owner-a.mp4
node bin/animation-maker.mjs inspect --input output/owner-a.mp4
```

Expect four independent geometric objects: yellow character with arm, brown desk, gray laptop and orange cup. Check placement, layers, playback and preserved editable sources. Prepared video: output/m2-static.mp4.

## B — synchronized animation

```sh
node bin/animation-maker.mjs validate --project examples/m2/animated
node bin/animation-maker.mjs render --project examples/m2/animated --output output/owner-b.mp4
node bin/animation-maker.mjs inspect --input output/owner-b.mp4
```

Sources: examples/m2/animated. Prepared video: output/m2-animated.mp4. Expect 5 seconds at 24 FPS: character arm rotates up, cup moves left across desk independently; no transform jumps. Check visual coherence yourself.

## C — shared asset

```sh
node bin/animation-maker.mjs validate --project examples/m2/trees
node bin/animation-maker.mjs render --project examples/m2/trees --output output/owner-c.mp4
node bin/animation-maker.mjs inspect --input output/owner-c.mp4
```

Sources: examples/m2/trees. Prepared video: output/m2-trees.mp4. Three green geometric tree placeholders share one rig reference, with different positions/scales. Check stable ordering and no duplicated geometry.

## D — M1 regression

```sh
node bin/animation-maker.mjs create --project output/owner-d-source
node bin/animation-maker.mjs validate --project output/owner-d-source
node bin/animation-maker.mjs render --project output/owner-d-source --output output/owner-d.mp4
node bin/animation-maker.mjs inspect --input output/owner-d.mp4
```

Expect the existing 3-second waving character without scene.json or migration. Prepared original-fixture video: output/m2-m1.mp4; sources examples/waving-character.

## E — failure handling

```sh
node bin/animation-maker.mjs validate --project examples/m2/invalid
node bin/animation-maker.mjs render --project examples/m2/invalid --output output/owner-e-must-not-exist.mp4
```

Both commands must fail with duplicate object ID at objects[4]. No MP4 should be created; source files must remain unchanged. Automated tests also cover missing references, unsafe SVG, path traversal and symlink escapes.

All valid videos: H.264, 1280×720, no audio; A/C/D are 72 frames, B is 120. These fixtures verify composition using simple rectangles; they do not establish natural-language authoring quality. For full prompt-level E2E, ask the Agent to author the PRD prompts using updated Skills and visually review those newly authored sources/videos too. Advanced motion synthesis, physics, IK, interactions, camera and audio remain unsupported. H.264 does not preserve transparent alpha; choose a solid scene background for MP4.

Owner must explicitly report A/B/C/D/E results and approval. Automated checks and metadata never change owner E2E to PASSED.
