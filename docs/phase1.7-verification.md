# Phase 1.7 — public release FAIL / candidate verification

Verified 2026-10-27 on macOS arm64, Node.js 22.23.4, npm 10.9.9 and Codex CLI 0.164.0. Candidate runtime 1.1.0 pins Remotion 4.0.539. No npm package or GitHub update was published by this work.

## Definition of Done

| Required check | Evidence / result |
| --- | --- |
| GitHub Skills install in an empty project | PASS for installation: real skills CLI downloaded all three Skills. FAIL for candidate availability: remote animate still does not pin 1.1.0. |
| Codex detects the animation prompt | PASS for locally installed candidate Skills: actual Codex CLI selected animate from the exact Thai prompt, read its instructions, detected the missing runtime and requested package/browser approval. |
| Runtime installs from npm after authorization | BLOCKED: registry returns E404 for @gasnonthachai/animation-maker@1.1.0; npm whoami reports ENEEDAUTH on the maintainer machine. No tarball was substituted in the public release test. |
| Chromium resolves/installs | PASS in independent artifact tests: explicit download of 170.9 MB, progress, extraction and usable project-local executable. An unversioned incomplete platform cache was seeded before setup and recovered through public ensureBrowser. |
| New SVG character generated | PASS: create command authors new six-part robot SVGs and rig, not copied example artwork. Generated sources retained. |
| Valid timeline generated | PASS: reusable three-wave preset, 24 FPS, three seconds, 72 frames, schema validation and exact frame rotations tested. |
| Project validation | PASS for original example and generated robot. |
| Authorized rendering | PASS for both characters with checkout reads denied by OS policy. No per-character renderer changes. |
| Metadata and actual movement | PASS for both: H.264, 1280×720, 24 FPS, 72 frames, three seconds, no audio; decoded pixels verify down/raised arm at six frames. |
| No original checkout at runtime | PASS in artifact tests: reading the original package.json failed with EPERM, while installed CLI doctor/create/validate/render/inspect succeeded. |

**The complete public one-prompt workflow is not shipped.** Registry publication, updated GitHub Skills and the subsequent no-tarball registry demonstration remain mandatory. A local artifact demonstration is deliberately reported separately from the release gate.

## Executable tests and evidence

- `npm test`: 15/15 tests across three files, including source generation/no-overwrite and browser opt-in/failure/version-mismatch checks.
- `npm run typecheck`: passes.
- `npm run test:integration`: PASS after explicitly bootstrapping the newly pinned browser; original example metadata and decoded pixel assertions pass.
- `npm run test:package`: clean artifact installation, the same target-project Zod override instructed by Skills, full consumer audit, real skill installation, incomplete-cache repair, original and generated renders, metadata/pixels, overwrite refusal and version/inspect CLI checks.
- `npm run test:release`: FAIL at GitHub Skills candidate version check. Test began in a clean project with no runtime and no tarball. It does not silently downgrade or fall back to the artifact.
- Real Codex first-use test: `codex exec --sandbox workspace-write --skip-git-repo-check --ephemeral --json -C <clean-candidate-project> "สร้างแอนิเมชันตัวละครโบกมือ 3 วินาที และ Export เป็น MP4"`. Candidate Skills only, no runtime or tarball. It selected animate and stopped for setup permission/network availability. This does not prove a full interactive approved completion.

Raw evidence is retained under gitignored output/: `audit-*.json`, `phase1.7-codex.jsonl`, `phase1.7-codex-project.json`, `phase1.7-release-evidence.json`, and phase1.7-package-evidence.json when the combined package test passes. `wave-generated.mp4` and `generated-wave/` retain the new character export/source; `wave-standalone.mp4` retains the original example export. Temporary projects are retained for inspection.

## Chromium investigation

The prior pinned API returned a status object, not void. Old Remotion skipped a pre-existing platform directory even when extraction had not produced the executable. A completed ZIP download alone therefore did not prove browser availability. The new version uses a containment-checking ZIP extractor, download locks, VERSION tracking and recovery for unversioned/mismatched caches. The CLI uses only public ensureBrowser for browser setup and validates the returned file/executable access; doctor and render share it. Failed installs retain underlying error details and give explicit cache/path/network remediation.

No system Chrome modification or App Management permission was requested. Explicit --browser-executable remains supported. A current-VERSION cache damaged after installation can still require the documented move-aside recovery; the wrapper does not import undocumented browser internals to delete it.

## Security/release gates

See [security review](security-phase1.7.md). Original audits had critical/high findings. Updated root audits are zero, but a bare downstream package still reports the upstream transitive Zod advisory. Skills apply a scoped project override before approved installation, rather than claiming package root overrides propagate. The mitigation and the residual risk of bypassing it require explicit maintainer acceptance before public release.

Required release actions: npm login in an authorized terminal, explicit approval of the reviewed candidate and mitigation, publication of that artifact, updating GitHub Skills, then rerunning `npm run test:release` and the full interactive prompt demonstration. No publication or authentication bypass has been attempted.

## Changed scope and limits

Package version/dependencies/manifest/lock, CLI dispatch, create/inspect commands and reusable wave generator, shared browser status handling, three Skills, package/release tests, regression tests, README and these reports. Animation runtime schemas/evaluation, renderer components and existing example assets/timeline are unchanged. No new framework or dependency was added; existing dependencies were upgraded.

Linux/Windows, App Management workflows and arbitrary motion synthesis are not claimed. The first scenario is a procedural SVG robot selected from natural language by Codex, with editable source SVGs and a reusable motion preset. Sandbox bind failures remain environment limitations; the Skills provide an exact authorized-terminal render command instead of treating validation as an MP4 export.
