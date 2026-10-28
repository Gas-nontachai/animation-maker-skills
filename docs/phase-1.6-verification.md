# Phase 1.6 — PASS

Verified 2026-10-27 on macOS arm64, Node.js 22.23.4, npm 10.9.9 and Remotion 4.0.373. Package name/version: `@gasnonthachai/animation-maker@1.0.0`, provisional and not published by this work. `private: true` remains set.

| Requirement | Result and evidence |
| --- | --- |
| Three independent Skills | PASS: skills CLI 1.7.4 discovered and copied animate, create-character and render-video into a clean project's `.agents/skills/`; timeline reference verified. |
| Installable runtime artifact | PASS: `npm pack`, then clean `npm install -D <tarball> --ignore-scripts`; 182 packages installed. CLI, renderer, schemas and environment helper checked in pack contents. |
| Original checkout unavailable | PASS: an additional OS policy denied all checkout reads; reading its package.json produced EPERM. Installed CLI and dependencies remained outside that directory. |
| CLI and validation | PASS: installed doctor, validate and render succeeded with checkout reads denied. `npx --no-install animation-maker validate --project ./example` also succeeded under that policy. |
| Authorized MP4 render | PASS: copied bundled waving-character to the target project and rendered there with a separately provisioned browser cache. |
| Metadata and movement | PASS: H.264, 1280×720, 24 FPS, 72 frames, 3 seconds, no audio. Pixel checks confirmed arm down at frames 0/24/48 and raised at 12/36/60. Existing output refusal preserved the original bytes. |
| Installation and troubleshooting docs | PASS: README and all three Skills describe local installation, provisional publication status, project-relative paths, explicit browser setup and permission failures. |

Additional checks: existing unit tests 7/7, TypeScript check, example validation and existing render integration all passed. Shared pixel checks also passed directly against the retained standalone export. No runtime/schema, renderer component, character or timeline semantics changed.

## Artifacts

- `output/gasnonthachai-animation-maker-1.0.0.tgz` — tested installable artifact, including source files and production tsx dependency.
- `output/wave-standalone.mp4` — independently rendered video; SHA-256 `c19e26bb723831b470dfb58a38a7544e5ac60af86f2cc03041a68383236480f7`.
- `output/phase1.6-evidence.json` — artifact integrity and retained temporary project location.

Generated artifacts are gitignored. Reproduce with `npm run test:package` after authorizing dependency/skills downloads and local rendering. The test retains its temporary project for inspection and applies a checkout read prohibition without moving or deleting the repository.

## Environment limitations and defects

The restricted Codex sandbox still denies local network binding. Both doctor and render return a permission-specific error; the latest render fails before bundling or creating staging output. Authorized execution passes. This remains an environment limitation, not a packaging defect; no security control was disabled.

The first standalone run exposed a test helper defect: FFprobe received a relative video path while running from its binary directory. The shared helper now resolves video paths before launching binaries. The subsequent clean install, isolated render and metadata/pixel checks passed. No animation logic change was needed.

An empty-cache installation reports missing Chromium without downloading it. Browser setup is explicitly opt-in via `doctor --download-browser`, or doctor/render can receive `--browser-executable`. The successful standalone render used a copy of the already provisioned cache before denying checkout reads.

## Modified files

- Packaging: `package.json`, `package-lock.json`, `bin/animation-maker.mjs`.
- CLI/environment: `scripts/project.ts`, `scripts/render.ts`, `scripts/doctor.ts`, `scripts/environment.ts`.
- Tests: `scripts/smoke.ts`, `scripts/package-smoke.ts`, `tests/check-video.mjs`, `tests/installed-package.mjs`.
- Skills: each of the three `skills/*/SKILL.md` files and `skills/animate/references/timeline-spec.md`.
- Documentation: `README.md` and this report.

## Remaining limits

Linux/Windows, a fresh Chromium download and automatic agent task selection were not tested. Actual skill discovery/installation and their filesystem references were tested with the real installer. The skill-creator Python quick validator could not run because PyYAML is absent; no dependency was added solely for that check.

The filesystem isolation harness currently requires macOS sandbox-exec. Doctor checks prerequisites and binding; only a real render proves browser launch and OS library readiness. Remotion internals used for binary resolution are version-sensitive, so rerun integration and package tests on upgrades. Registry publication and updating the remote GitHub Skills source are separate release actions and were not performed.
