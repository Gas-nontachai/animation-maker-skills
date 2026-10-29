# M3 implementation verification — 2026-10-29

Status: IMPLEMENTATION COMPLETE — OWNER REGRESSION/E2E PENDING.

## Implementation

- `packages/animation-runtime/src/motion/contracts.ts`: strict versioned action and semantic mapping schemas, exported inferred TypeScript types.
- `packages/animation-runtime/src/motion/index.ts`: procedural walk/sit, specialized two-link reach, pickup/putdown, dependencies, conflict diagnostics, continuous track composition and world-matrix attachment baking. Reuses scene/rig validators, interpolation and frame evaluation; no new evaluator or renderer.
- `scripts/plan.ts` and CLI routing: additive plan command, confined input loading/SVG validation, exclusive output creation.
- Runtime barrel export and package file allowlist include compiler, plan command, docs and example; no dependency/version/release workflow changes.
- Three existing Skills updated with capability-gated M3 authoring and validation instructions. README/scene docs explain additive compatibility.
- `examples/m3/coffee`: independent geometric SVG/rig assets, scene, typed motion plan and editable compiled timeline.
- `tests/motion.test.ts`: 23 new automated cases; `tests/check-motion-video.ts` and smoke script add M3 decoded-frame integration checks.

## Verification evidence

- `npm test`: PASS, 123 tests across seven files (100 existing + 23 M3).
- `npm run typecheck`: PASS.
- `npm run test:integration`: PASS with host-authorized rendering, including original M1 decoded arm checks, M2 static/animated/trees metadata and M3 coffee render/metadata/decoded-frame checks. M3 cup pixels match evaluated world positions at frames 0, 107, 108, 120, 132, 156, 168, 180 and 191; desk crop remains stationary. Temporary integration MP4s are removed by the existing harness.
- `node bin/animation-maker.mjs plan --project examples/m3/coffee --output /tmp/m3-timeline.json`: PASS; copied the generated timeline into the editable fixture. Automated fixture recompilation remains identical after final compiler edits. CLI test verifies output overwrite refusal and source preservation.
- `node bin/animation-maker.mjs validate --project examples/m3/coffee`: PASS, four objects, 192 frames.
- `node bin/animation-maker.mjs render --project examples/m3/coffee --output output/m3-coffee.mp4`: PASS with host permission. Retained gitignored developer video.
- `node bin/animation-maker.mjs inspect --input output/m3-coffee.mp4`: PASS; H.264, 1280×720, 24 FPS, 192 frames, eight seconds, no audio.
- Direct `checkMotionVideo('output/m3-coffee.mp4')`: PASS on retained video.
- `npm pack --dry-run --json`: PASS with host permission; compiler, CLI, documentation, Skill changes and editable example are included. No package was published or release configuration changed.
- `git diff --check`: PASS.

Initial sandbox render/integration attempts failed with `listen EPERM`; host-authorized reruns passed. Initial npm dry-run failed on cache permissions; authorized rerun passed. The optional skill-creator `quick_validate.py` helper could not run because system Python lacks PyYAML. Existing automated Skill compatibility tests pass; Skill frontmatter was inspected, and no new Python dependency was installed. The first new hierarchy test expected a hierarchy error but also duplicated a semantic role; its fixture was corrected to isolate the intended hierarchy condition. A relative video filename in the new decoded-frame helper initially failed because bundled ffmpeg uses its binary directory as cwd; resolving the input to an absolute path fixed it.

Final follow-up compiler edit unwraps initial authored object rotations (e.g. 360°) without contact jumps. Unit tests, type checking and deterministic fixture recompilation passed afterward; the fixture's rendered data is unchanged.

## Limitations and handoff

See motion-contract.md for restrictions: direct unit-scale arm chains, frame-aligned boundaries, no moving ancestors during reach, no shear or singular transforms, one held object per hand, no repeated pickup of the same object in one plan. Motion is stylized; drink is a reachable hand-to-mouth pose/hold. No foot planting, collision handling, generalized IK or liquid simulation. Visual asset joint alignment and final motion quality need owner review.

See m3-owner-e2e.md for setup, prompts, automated commands, M1/M2 regression cases, owner manual E2E procedure and expected artifacts. That document separately records the pre-existing 1.1.2 manifest versus 1.1.1 published-baseline documentation discrepancy; public registry state was not queried.

Work is on `feat/m3-motion-intelligence`, with changes left uncommitted for review. No merge, push, PR publication, npm release, milestone acceptance or owner visual approval was performed. These automated checks do not grant final M1/M2 regression or full prompt-to-video E2E acceptance.
