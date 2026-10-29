# M3.1 Phase 2 — Pose-aware natural motion

Status: IMPLEMENTATION COMPLETE — OWNER REGRESSION/E2E PENDING.

## Baseline review and scope

Before implementation the working branch was `feat/m3-1-motion-quality` at `6b6eb3b`. Phase 1's motion-quality report, motion contract, authored-track compiler, corrected/reference Gym sources and tests were reviewed. Fetching `origin/prod` confirmed `2eb32e7`; its tree equals the M3 baseline on main. Divergence consisted of prod merge ancestry and the feature branch's Phase 1 commit, with no competing prod source changes. Prod was merged into the feature branch without replacing Phase 1 files. An external rebase then placed the unchanged Phase 1 content directly on prod as `0b35e5f`; work continued from that state. Neither main nor prod was modified. Baseline fixture SHA-256 values were recorded before edits and rechecked afterward. An existing untracked tarball was left untouched by this implementation.

A read-only registry query (`npm view @gasnonthachai/animation-maker version gitHead --json`) confirmed published **1.4.0**, gitHead **2eb32e79ff46c6068b617fa716cc93fb9f49246b**. Base M2/M3 are published; blanket “M3 unreleased” wording was corrected in current guidance. The source manifest is still 1.1.2 under the existing release workflow. Candidate Phase 1/2 fields are not implied by published 1.4.0 or the M1 compatibility range. No version/release-pipeline change or publication was made.

| Requirement | Already present in Phase 1 | Phase 2 addition |
|---|---|---|
| Joint-driven curls | Authored local rotation tracks | Named semantic configurations and validated limits/preferences |
| Transitions | Existing easing, continuous interval composition | Pose actions with explicit transition duration/easing |
| Grip | World-matrix attachment, wrist tracks, optional palm, transparent anchors | Pose-based hand tilt uses the same baking; tested on a different rig |
| Pose selection | Agent-selected endpoints/angles | Reusable pose library and constrained choice between existing Reach elbow branches |
| Constraints | Input/reference validation | Per-role bounds, preferred angles and interval stability checks |
| Secondary motion | Could be authored manually | Optional bounded head/torso rotation samples, disabled by default, with conservative interference rejection |

Runtime additions are justified by constraints that raw tracks could not validate and reuse of semantic poses across action sequences. There is no new Curl or drink preset, natural-language parser, renderer, animation evaluator, generalized IK, physics or external inference API. The existing agent interprets language and authors rig-specific profiles. Users describe intent; they need not provide joint rotations.

## Additive motion.json contract

Version stays `1.0`; all additions are optional. Existing Rig v1.0, M1 Timeline, M2 scene/timeline, CLI commands and Phase 1 authored tracks retain their interpretation. Omitted additions reproduce existing compiled fixture timelines exactly. Older planners reject unfamiliar fields, so check installed capabilities before emitting them.

### Joint constraints

`constraints` maps scene object IDs to semantic roles and rules:

```json
{
  "constraints": {
    "actor": {
      "upperArm": {"min": -120, "max": 30, "preferred": -12, "stability": 100},
      "forearm": {"min": -150, "max": 10, "preferred": -50}
    }
  }
}
```

These sample angles belong to one authored rig; they are not runtime defaults or anatomical constants. Rotations are absolute local degrees with the existing positive-clockwise convention. Min/max must be finite and ordered; preferred must be within bounds; optional stability is a finite nonnegative maximum departure from an interval's starting angle. The rig's initial rotation must be inside its declared limits. Every constrained role needs a mapped existing part.

Limits apply to generated action keys, poses, authored rotation tracks and secondary samples. Existing easing is monotonic between keys, so valid endpoints/samples remain within limits during interpolation. Stability applies to each complete generated/authored interval (including all keys of a Phase 1 track), not an absolute speed limit or a temporal physics constraint. A small global shoulder stability may make pickup impossible; use compatible broad transport limits and shoulder-held curl poses rather than expecting the compiler to relax constraints.

The additive bend value `auto` is the normalized default: it retains effective legacy +1 without arm constraints and enables constrained selection otherwise. An arm-constrained Reach with **no explicit ±1 bend** evaluates only the existing two analytic elbow solutions. Equivalent angles are selected near the current pose within limits; incompatible limits/stability remove a candidate. Valid candidates are ranked by squared deviation from per-joint preferred angles, or the current angle when no preference is set. Ties keep the existing +1-before−1 ordering. Explicit bends are respected and fail if incompatible. Unrelated head/torso constraints do not change legacy arm selection. No candidate means a clear action diagnostic, never an unrelated substitute or clamped endpoint. Singularity, hierarchy, unit-link-scale and unreachable-contact diagnostics remain in force.

### Named poses and blending

`poses` is a reusable library of semantic configurations:

```json
{
  "poses": {
    "rest": {"joints": {"upperArm": -12, "forearm": -10}, "preferred": {"hand": 0}},
    "flexed": {"joints": {"upperArm": -12, "forearm": -125}, "preferred": {"hand": 0}}
  },
  "actions": [
    {"id": "settle", "type": "pose", "target": "actor", "pose": "rest", "start": 1, "duration": 0.5, "easing": "easeInOut"},
    {"id": "curl-up", "type": "pose", "target": "actor", "pose": "flexed", "start": 1.5, "duration": 0.5, "dependencies": ["settle"]}
  ]
}
```

A pose needs at least one `joints` target. `preferred` optionally supplies additional configuration targets for unspecified joints; it is not permission to violate a limit. Contradictory values for a role in both maps are rejected. Unknown roles, missing poses, unmapped required parts and targets outside declared constraints fail before timeline output. Rig compatibility is checked for each object that uses a pose; unused library entries have structural validation but no assumed target rig.

The `pose` action has the same ID/target/start/duration/dependencies/easing fields as existing actions, plus the named `pose` reference. It transitions from each joint's evaluated current angle to its configured absolute local angle. Unspecified joints remain untouched. Boundary keys are shared with adjacent nonconflicting motion; gaps hold values. Durations and easing control the blend through the existing interpolation functions. Values are not silently wrapped or replaced; author sensible unwrapped angles and limits for the actual rig.

Pose actions use the same property interval claims as authored tracks and presets. A Reach and a hand-only tilt pose can overlap because they write different joints. Two actions on the same joint/property cannot overlap. A long Phase 1 authored track reserves its entire interval, including holds; pose actions inside that same property interval fail. Dependencies name actions, not library poses or secondary samples.

### Grip and drinking

The mapped hand remains a pivot/contact anchor. It can be fully transparent, with no mandatory hand geometry or rig migration. Visible palm/thumb art is optional and its layering still needs visual inspection. World-space contact correctness and a convincing visible grasp are distinct checks.

For drinking, author grasp and opening points from the prop geometry and a mouth point from character geometry. Use Reach for transport and a nonconflicting named hand-tilt pose (or existing rotation track) for orientation; account for all parent/object matrices. Pose actions are composed before grip-offset capture and attachment baking. Both Gym and robot examples maintain bottle opening/mouth alignment during their sip holds and reverse tilt on return. No geometry recognition, cap animation, finger solving, liquid flow or swallowing is inferred.

### Optional secondary motion

`head` is an additional optional semantic role. It is not required by legacy presets. An optional `secondary` array contains explicit supporting-motion intervals:

```json
{"secondary": [{"target": "actor", "joint": "head", "start": 2, "duration": 3, "intensity": 0.3, "amplitude": 2, "cycles": 1}]}
```

Joint is `head` or `torso`; intensity is 0–1 and defaults to **0** (disabled). Amplitude is 0–5 degrees, default 2; cycles is integer 1–20, default 1. Timing must be frame-aligned, in range, with at least four frames per cycle. Active samples are an envelope-bounded sine around the baseline rotation, explicitly returning to it at both boundaries. Existing linear interpolation joins deterministic per-frame samples; there is no random or runtime procedural state.

Secondary motion respects all joint limits/stability. It rejects primary property/descendant intervals that it would disturb, and rejects any held-hand ancestor during attachment. For example torso sway during a curl is rejected; a non-ancestor head movement during the exercise can preserve hand contact. **Moving a head can still move a visual mouth even when the hand is unaffected.** The agent must schedule support away from the sip hold or other visual alignment requirements; automatic surface/face inference is not implemented. Examples stop head movement before drinking. Disabled secondary entries still receive reference/timing validation.

## Examples and comparison artifacts

All prior `gym-reference`, `gym-corrected` (Phase 1) and coffee files are preserved. New editable sources:

| Project | Purpose | Retained video | Metadata |
|---|---|---|---|
| examples/m3/gym-reference | Original endpoint-driven curls | output/m3-1-phase2/reference.mp4 | 15 s / 360 frames |
| examples/m3/gym-corrected | Phase 1 authored rotations | output/m3-1-phase2/phase1.mp4 | 15 s / 360 frames |
| examples/m3/gym-phase2 | Named curl/grip poses, automatic constrained bend, subtle head support | output/m3-1-phase2/phase2.mp4 | 15 s / 360 frames |
| examples/m3/pose-robot | Different IDs, horizontal neutral arm, 55/75 link lengths, rotated/scaled placement, transparent grip anchor | output/m3-1-phase2/robot.mp4 | 10 s / 240 frames |
| examples/m3/pose-transition | Walk → settle pose → sit → ready pose → reach, continuing through pickup/return | output/m3-1-phase2/transition.mp4 | 8 s / 192 frames |

All are H.264, 1280×720, 24 FPS, no audio. Each source project preserves SVGs, rigs, scene.json, motion.json and compiled timeline.json. Videos, decoded PNGs, baseline hash manifest and comparison-metadata.json are gitignored under the separate output directory. PNGs at Gym frames 120/270, robot frames 48/192 and transition frame 96 were inspected as developer evidence, not owner approval.

## Verification

- `npm test`: **172 tests passed across nine files**, including 32 Phase 2 cases (limits/configuration validation, unsatisfiable poses, dependencies/composition, continuous boundaries/easing, preferred elbow branches, explicit branch failures, every-frame contact, mouth alignment on two rigs, input preservation/determinism, secondary interference and legacy fixture equality).
- `npm run typecheck`: passed.
- `npm run test:integration`: passed nine renders: M1 wave, M2 static/animated/trees, M3 coffee, Phase 1 Gym, Phase 2 Gym, robot and transition. Decoded prop pixels match evaluated positions for Phase 1/2 Gym and robot; metadata is checked for every fixture. This is numerical/render consistency, not naturalness acceptance.
- `npm run test:package`: passed in an isolated installed local tarball, with the source checkout denied by macOS policy. Consumer audit reported zero vulnerabilities. Three Phase 2 projects validated and recompiled identically; the alternate robot rendered to 240 frames using only installed files. Existing installed Skills, doctor/bootstrap, M1 render/pixels and overwrite protection passed.
- `git diff --check`: passed.
- All 78 recorded baseline source files are unchanged. `output/m3-1-phase2/numerical-evidence.json` records maximum every-frame grip errors of approximately 2.84e-13 (Gym) and 1.27e-13 (robot).
- Final isolated-package evidence and zero-vulnerability consumer audit are retained as `output/m3-1-phase2/package-evidence.json` and `consumer-audit.json`.
- Read-only registry check confirmed the published version/gitHead above. No publication command was run.

Host permissions were needed for Git ref/network operations, rendering, and the required clean-consumer download/browser test. Initial sandbox fetch failed on FETCH_HEAD; its authorized retry passed. Initial sandbox registry query failed DNS; the authorized query passed. A temporary syntax error in the new normalization regression test was corrected; the complete tests/typecheck were rerun successfully. The optional Python Skill validator remains unavailable without PyYAML; no dependency was introduced. Existing Skill compatibility checks pass. Final focused regressions ensure unrelated joint constraints retain legacy Reach selection and schema/JSON normalization preserves automatic selection; all baseline and new fixture recompilations remained identical after it.

## Owner reproduction and acceptance

Use Node 22+ in the authorized checkout. Reuse installed dependencies/browser when available; otherwise `npm ci`, then doctor and an explicitly authorized browser download if needed. Do not infer candidate availability from package version alone.

```sh
npm test
npm run typecheck
npm run test:integration
npm run test:package
git diff --check
node bin/animation-maker.mjs doctor
node bin/animation-maker.mjs plan --project examples/m3/gym-phase2 --output output/m3-1-phase2/owner-gym-timeline.json
cmp examples/m3/gym-phase2/timeline.json output/m3-1-phase2/owner-gym-timeline.json
```

Render fresh outputs with unused filenames; no existing project/video needs replacement:

```sh
node bin/animation-maker.mjs render --project examples/m3/gym-reference --output output/m3-1-phase2/owner-reference.mp4
node bin/animation-maker.mjs render --project examples/m3/gym-corrected --output output/m3-1-phase2/owner-phase1.mp4
node bin/animation-maker.mjs render --project examples/m3/gym-phase2 --output output/m3-1-phase2/owner-phase2.mp4
node bin/animation-maker.mjs render --project examples/m3/pose-robot --output output/m3-1-phase2/owner-robot.mp4
node bin/animation-maker.mjs render --project examples/m3/pose-transition --output output/m3-1-phase2/owner-transition.mp4
node bin/animation-maker.mjs inspect --input output/m3-1-phase2/owner-phase2.mp4
```

Repeat plan/validate/inspect for each project when reviewing edits. Planning creates a separate candidate file; render consumes timeline.json. Compare before explicitly replacing a timeline in a new working copy. Do not patch character-only keys after attachment baking.

Owner scenarios:

- **A, curls:** compare normal-speed and frame-stepped original/Phase 1/Phase 2 at pickup, settle, each reversal and release. Check controlled shoulder, elbow-dominant movement, readable hand/handle contact and wrist silhouette. Phase 2 adds reuse and enforceable configuration, not a claim that a tiny head movement is automatically more natural.
- **B, drinking:** inspect grasp placement, opening/mouth proximity, modest wrist tilt, sip hold, reverse tilt and release. Both numerical alignment and visible layering matter.
- **C, transition:** inspect walking/sitting/reaching boundaries and intervening poses; look for limb separation, odd silhouettes or abrupt perceived velocity even though transforms are continuous.
- **D, generalization:** compare the robot's different geometry/neutral directions and transparent anchor. Generate another character independently from a prompt; choose its semantic poses/constraints from geometry rather than copying Gym angles.
- **E, regression:** independently repeat existing M1/M2/M3 and Phase 1 workflows from m3-owner-e2e.md. Automated passes do not grant final regression acceptance.

A fresh prompt can be: “Create a gym animation with three controlled curls, then pick up an open bottle, drink and put it back.” The agent should infer pose names/configurations, timing and rig-specific limits without asking for shoulder/elbow/wrist angles. Preserve all source and MP4 artifacts, disclose unsupported behavior and leave final visual approval to the owner.

Known limits remain: specialized direct-chain Reach with unit arm scales, one object per mapped hand, no repeated pickup of the same object in one plan, no moving Reach ancestors, no singular/sheared attachment transforms, no automatic anatomical limits, collision/foot-planting/finger/physics simulation or inferred mouth/prop surfaces. Poses use absolute angles; stability is interval departure, not speed. Secondary safeguards are conservative and do not infer visual alignment intent. Head movement during a sip must be avoided by authoring. Source artwork may still clip, occlude the palm or look stiff; visual naturalness needs owner review. No merge into main/prod, publication, release tag or milestone closure is authorized by these results.
