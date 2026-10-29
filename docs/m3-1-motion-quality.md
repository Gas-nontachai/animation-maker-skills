# M3.1 — Motion Quality Improvements

Status: IMPLEMENTATION COMPLETE — OWNER E2E PENDING.

Regression, Manual E2E and Visual Acceptance remain owner responsibilities. A playable MP4, a correct endpoint and zero grip error do not prove natural-looking motion. No merge, publication or release is performed by this work.

## Reproduction and confirmed cause

The supplied reproduction was found at `/private/tmp/animation-prod-test/gym-scene` with video `/private/tmp/animation-prod-test/output/gym.mp4`. Both remain untouched. `examples/m3/gym-reference` is a byte-preserving source snapshot; `source-sha256.json` records original file hashes and the original video hash. A separate corrected copy lives at `examples/m3/gym-corrected`. The original video is also copied to the gitignored `output/m3-1/gym-original.mp4` for comparison.

Investigation preceded code changes:

- The near upper-arm shoulder pivot/position is (100,125), elbow pivot/position (100,162) and hand pivot/position (100,204). The rig uses full-canvas SVG coordinates, a torso pivot at (100,215), unit arm scales and scene scale 1.3. Link lengths are 37 and 42 rig units (48.1 and 54.6 world units). Parent/child matrices correctly keep those pivots joined.
- The hand SVG is a radius-one circle with fill-opacity zero. It is a valid transform anchor, but supplies no visible palm or fingers. The forearm geometry stops at its end, so apparent grip quality cannot follow from schema validity alone.
- The action plan expresses all curl-up/down movements as endpoint-driven Reach. Compiling the original plan reproduces every generated track exactly; the supplied timeline additionally contains a following-shadow position.x track. That extra authored track explains why a naive positional comparison of track arrays differs.
- At 4.75 seconds the original upper arm is −196.0364° and forearm 126.0967°; at 5.5 seconds they are −67.8556° and 51.4204°. This moves the shoulder through 128.1809°, rather than keeping the elbow near the torso. Reach correctly meets its hand endpoints, but those endpoints and the selected elbow branch do not specify an elbow-dominant exercise.
- Across every attached frame, maximum original contact error is about 2.34e-13 world units. Attachment math was already correct. The invisible anchor, object/character layering and absent wrist articulation explain the weak visible grip; copying local object positions would not fix it.
- The bottle contact is (15,32), while its opening is (15,4). At the original 11.25-second pose, the opening is approximately (517.3288,235.7232), about 36.80 units from the authored mouth at (501.2,268.8). Merely moving the hand to (527,262) does not place the opening at the mouth. Decoded source frames 114 and 270 confirm the raised shoulder and misplaced bottle opening.

## Small implementation

Optional `motion.json.tracks` composes existing M2 keyframes before attachment baking. See [motion contract](motion-contract.md#m31-authored-tracks-additive) for the exact rules. Part tracks support rotation only; explicitly targeted independent scene-object tracks retain existing M2 properties. Conflicts, frame alignment, references, easing/numeric validity and boundary continuity are checked. The field is optional in both JSON and the exported TypeScript plan type. Existing M1/M2 schemas, M3 actions, compileMotion signature and CLI commands retain their behavior.

No Curl preset is needed. The corrected example settles from pickup during 4–4.5 seconds, keeps upperArm.rotation at −12° through 7.75 seconds and alternates forearm.rotation between −10° and −125°, with easeInOut. All rig pivots/hierarchy/part IDs are unchanged. Selecting bend −1 for the rack transports keeps the elbow on the intended side; it is an authoring choice, not a change to Reach defaults.

The comparison's hand SVG adds optional palm/thumb geometry around the original grip pivot. The bottle SVG depicts an open neck. For drinking, Reach transports the arm to (526.5766,280.6333); a local hand rotation of approximately −44.6858° tilts the bottle to −65° in world space. Its opening reaches the mouth throughout the 11.25–11.75-second hold. Grip-offset capture is deferred until all authored joint/wrist tracks have been composed, including any wrist movement during pickup. The same existing matrix attachment sampler then drives both props. Transparent anchors need no new capability or geometry.

Changes are limited to motion contracts/compiler, focused unit/video checks and integration smoke routing, three Skills plus their shared motion-quality reference, README/technical documentation and separate Gym fixtures. The package allowlist includes this document; dependencies, version, release workflows and renderer/evaluator are unchanged.

## Automated evidence

- `npm test`: 140 tests across eight files passed (123 existing plus 17 focused M3.1 cases).
- `npm run typecheck`: passed.
- `npm run test:integration`: passed all six renders (M1 wave, M2 static/animated/trees, M3 coffee and corrected Gym), including decoded-frame checks.
- `npm pack --dry-run --json`: passed; 161 entries include the compiler, Skill reference, M3.1 guide and both editable Gym fixtures. No publication occurred.
- `git diff --check`: passed.
- `node bin/animation-maker.mjs validate --project examples/m3/gym-corrected`: seven objects, 360 frames, passed.
- Corrected render and bundled ffprobe inspection: H.264, 1280×720, 24 FPS, 360 frames, 15 seconds, no audio.
- Unit checks cover original reproduction, unchanged pivots, input preservation/determinism, stable curl shoulder/elbow, easing, every-frame dumbbell/bottle contact, release holds, mouth/opening alignment, stationary rack/floor/clock, transparent anchors, wrist movement during pickup and invalid/conflicting tracks. The coffee fixture recompiles identically.
- Direct decoded-frame smoke checks find prop pixels at evaluated positions through curl/sip/release. These test position/render consistency, not naturalness.
- Original source/video hashes were rechecked unchanged. `output/m3-1/metrics.json` records max corrected contact error about 3.46e-13, upper-arm range 0° during the repetitions and sip opening error about 2.54e-13. Numerical tolerances are used for matrix-derived points.
- The optional skill-creator Python quick validator could not run because system Python lacks PyYAML. No dependency was added. Existing Skill compatibility tests pass; frontmatter is unchanged and the new reference links were inspected.

The first render attempt hit sandbox `listen EPERM`; the host-authorized rerun passed. Initial exact-equality assertions for matrix-derived contact/elbow points differed by about 1e-14 and were corrected to use numerical tolerances. An initial multi-frame ffmpeg select-filter attempt was unsupported by the bundled filter parser; per-frame trim/crop decoding succeeded.

## Reproduce and compare

Use Node 22+ and the authorized source checkout. Reuse existing installed dependencies/browser; otherwise install with `npm ci` and follow doctor instructions before rendering. Choose unused output names (plan/render refuse overwrite).

```sh
npm test
npm run typecheck
npm run test:integration
node bin/animation-maker.mjs doctor
node bin/animation-maker.mjs plan --project examples/m3/gym-corrected --output output/m3-1/owner-candidate.json
node bin/animation-maker.mjs validate --project examples/m3/gym-corrected
node bin/animation-maker.mjs render --project examples/m3/gym-corrected --output output/m3-1/gym-owner.mp4
node bin/animation-maker.mjs inspect --input output/m3-1/gym-owner.mp4
```

Compare the compiled candidate with the committed corrected timeline before replacing anything. To render the preserved reference separately:

```sh
node bin/animation-maker.mjs render --project examples/m3/gym-reference --output output/m3-1/gym-reference-owner.mp4
```

The original reference timeline includes the following shadow; do not overwrite it with a bare original-plan compile that omits that authored shadow track. The corrected motion plan preserves the following shadow explicitly in its `tracks` field.

Developer comparison artifacts are `output/m3-1/gym-original.mp4`, `gym-corrected.mp4`, original/corrected PNGs at frames 114 and 270, `metrics.json` and `original-sha256.json`. They are gitignored; editable source snapshots and plans/timelines are in the repository. Regenerate videos on another machine with the commands above. Rendering may require host approval for local server/browser access; it never implicitly downloads a browser.

## Owner procedure and limitations

Compare both full videos at normal speed and frame-step around 3.5/4/4.5 (contact/settle), 5/5.5/6/6.5/7/7.5 (curl peaks/reversals), 7.75/8.75 (return/release), 10.25/11.25/11.75/12.75 (bottle contact/sip/return). Check shoulder stability, continuous elbow/wrist connection, apparent palm/handle grip, unobscured fingers, bottle opening at the mouth and relaxed timing. Look for clipping or unnatural silhouettes between key poses; mathematical contact alone cannot detect them. Confirm rack, clock and floor remain stationary; the explicitly authored shadow follows the walk.

Run a fresh prompt through the updated Skills, for example: “Create a 15-second gym animation: walk to a dumbbell rack, pick up a dumbbell, do three elbow-dominant biceps curls, return it, pick up an open water bottle, take a sip and put it back.” Require preserved SVGs, rig, scene, motion plan, compiled timeline and MP4. Verify that curl repetitions use local forearm rotation and that joint/wrist edits are included before attachment baking. Independently perform the existing M1/M2/M3 regression and manual E2E cases in m3-owner-e2e.md.

This remains stylized 2D motion: no automatic biomechanics, collision/clipping avoidance, generalized IK, finger solving, fluid/swallowing simulation, cap-opening animation or physical realism. The direct-chain hand pivot approximates wrist/grip at one location. Scene-object grouping can occlude hand geometry. Authored intervals reserve their whole property span, including holds; disjoint generated movements inside one such span are rejected. Existing unsupported repeated-pickup, moving-ancestor Reach and singular/sheared-transform cases remain unsupported. Original walking, far arm and victory gesture are not redesigned. Final Regression, Manual E2E and Visual Acceptance are pending owner review.
