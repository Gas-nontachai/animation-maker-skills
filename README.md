# Animation Maker Skills — Phase 1.7 release candidate

Turn a request such as “สร้างแอนิเมชันตัวละครโบกมือ 3 วินาที และ Export เป็น MP4” into a new SVG robot, rig, three-second waving timeline and silent MP4. No editor, Web UI or new rendering framework. The existing monorepo and example remain supported.

## Release status

Runtime/Skills compatibility is pinned to `@gasnonthachai/animation-maker@1.1.0`, using Remotion 4.0.539. This is a release candidate: **do not assume it is published**. Check `npm view @gasnonthachai/animation-maker@1.1.0 version` before registry installation. The current release requires maintainer publication authorization and npm authentication, plus updating the GitHub Skills. A tarball test is not evidence that the public one-prompt workflow has shipped.

## First-use workflow after release

Requires Node.js 22+, npm and Codex:

```sh
mkdir my-animation
cd my-animation
npx skills add Gas-nontachai/animation-maker-skills
codex
```

Ask: “สร้างแอนิเมชันตัวละครโบกมือ 3 วินาที และ Export เป็น MP4”. The animate Skill checks the project-local manifest and CLI version and reuses version 1.1.0. If absent, it verifies registry availability and requests approval for `npm install --save-dev --save-exact @gasnonthachai/animation-maker@1.1.0`. It never falls back to a developer checkout, a global runtime, a tarball or an implicit npx download. Installing Skills does not install the runtime. Existing session authorization is reused.

The workflow runs doctor, requests a compatible browser download only when needed, creates source assets, validates with at most two source-repair attempts, renders with host approval when required, then inspects the MP4. It preserves character SVGs, rig.json and timeline.json. The first supported motion is one character waving in one scene; a friendly robot is the default. Codex can edit generated SVG primitives to match a visual description while retaining attachment points.

The corresponding installed CLI commands are:

```sh
./node_modules/.bin/animation-maker --version
./node_modules/.bin/animation-maker doctor
./node_modules/.bin/animation-maker create --project ./animation
./node_modules/.bin/animation-maker validate --project ./animation
./node_modules/.bin/animation-maker render --project ./animation --output ./output/wave.mp4
./node_modules/.bin/animation-maker inspect --input ./output/wave.mp4
```

Use `npx --no-install animation-maker` after confirming local installation, or the `.cmd` shim on Windows. `create` reserves a new project directory and refuses existing directories; rendering refuses existing outputs. Metadata inspection uses bundled ffprobe. The default wave is H.264, 1280×720, 24 FPS, 72 frames, 3 seconds, no audio. A successful export must be distinguished from validation-only success. Report visual movement verification only when decoded frames were checked.

## Browser and permission troubleshooting

`doctor` checks bundled FFmpeg/ffprobe, a compatible browser and local server binding. It does not prove browser launch or all OS libraries; a real render does. If a browser is missing/incompatible, explicitly approve:

```sh
./node_modules/.bin/animation-maker doctor --download-browser
```

Download, progress, ZIP extraction, cache version checks and executable discovery use the public Remotion `ensureBrowser` API. It returns a status object, not void, in the pinned version. The wrapper verifies the returned executable file. It never modifies system Chrome or App Management permissions. An existing compatible browser may be explicitly supplied using `--browser-executable <path>` on doctor/render. No machine path is stored in code. Render never downloads implicitly.

The old Remotion 4.0.373 downloader could skip an existing platform cache folder with no executable. The new pinned version includes a path-checking ZIP extractor, download locking, a VERSION file and re-download handling for unversioned/mismatched caches. The package test seeds an incomplete cache and verifies recovery through the public API, then renders with the downloaded executable. A damaged cache with a current VERSION may still need manual recovery: move aside the affected project's `node_modules/.remotion/chrome-headless-shell` cache and retry the approved download, or pass an explicit executable. Cache layout instructions are version-specific; no browser internals are imported by this CLI.

For `listen EPERM` or a denied browser launch, use the host's supported approval mechanism for the failed command. Do not disable sandbox, path or SVG checks. If approval is denied/unavailable, provide the exact command to finish in an authorized terminal:

```sh
./node_modules/.bin/animation-maker render --project ./animation --output ./output/wave.mp4
```

Network/cache permission errors are separate from binding errors. Downloading a complete ZIP does not prove successful extraction or rendering. Use project-local headless Chromium and required OS libraries rather than reconfiguring system Chrome. Reinstall platform optional dependencies if bundled FFmpeg is missing. `RenderInternals.callFf`/binary resolution are the existing version-sensitive dependency for bundled FFmpeg; rerun tests on upgrades.

## Project contract

A project contains `character/rig.json`, SVG assets relative to `character/`, and `timeline.json`. See `examples/waving-character` for a complete six-part character. Validation checks schemas, finite numbers, duplicate IDs/tracks, references, parent cycles, ordered keyframes, asset existence and paths including symlinks.

Rig coordinates are SVG units, positive Y down. Part `position` anchors `pivot` in its parent's original SVG coordinates. Local transform is `T(position) R(rotation) S(scale) T(-pivot)`; parent matrices and opacity propagate to children. Global `zIndex` determines drawing order; rig order breaks ties. Static SVG primitives only: no scripts, event handlers, CSS, text, images, hrefs, declarations, entities or external resources. SVG viewBox is `0 0 width height`; geometry is composed in intrinsic units without nested viewport clipping.

Timeline properties are `position.x`, `position.y`, `rotation`, `scale.x`, `scale.y`, `opacity`. Values replace the local rig values. Rotation is in degrees, positive clockwise; opacity is 0–1. Easing on a keyframe controls its outgoing segment: `linear`, quadratic `easeIn`, `easeOut`, `easeInOut`. Values hold before/after the keyframe range. Duplicate or unsorted times are errors. Frame time is exactly `frame / fps`, starting at zero. The last example frame is 71 at 2.958333 seconds; the endpoint keyframe at 3 seconds is not sampled.

Optional timeline `placement: {"x": 440, "y": 60, "scale": 1}` positions the character on the white output canvas. Defaults match these values. The runtime also accepts placement directly through `SvgComposer` props. The rig canvas records the character's design dimensions, independent of video resolution.

Pure animation exports live in `packages/animation-runtime/src/index.ts`: `validateAnimation`, `ease`, `interpolate`, `evaluateFrame`, and matrix multiplication. Parse data before evaluating; the pure evaluator assumes validated inputs and returns local properties plus world matrices and inherited opacity. It rejects frame indices outside the timeline. Filesystem/SVG validation lives in `scripts/project.ts`; React composition and Remotion consume validated data, never file paths.

## Security and development

See [security review](docs/security-phase1.7.md) and [release verification](docs/phase1.7-verification.md). The repo uses its package lock and a Zod override for development audits. Root overrides and attempted shrinkwrap pinning did not patch all downstream consumers: upstream Remotion packages pin vulnerable Zod 4.5.4. The Skills merge a target-project override `"@gasnonthachai/animation-maker": {"zod": "4.6.7"}` before the authorized install. They preserve unrelated config and stop on conflicting override values. This scopes the patch to this runtime's dependencies. A clean workflow consumer audit is a separate required check; installing the bare runtime without this mitigation retains upstream advisories and is not approved for public release without explicit residual-risk acceptance. The old machine-specific self-dependency was removed. TypeScript source shipping uses the existing production tsx loader; no second build framework or install hook is introduced.

```sh
npm ci
npm test
npm run typecheck
npm run test:integration
npm run test:package
npm run test:release
```

`test:package` is an authorized pre-release tarball test. It applies the same scoped project override as the Skills and checks package contents and a clean consumer audit, installs all three candidate Skills, denies checkout reads via an additional macOS policy, repairs a seeded incomplete browser cache through explicit setup, renders both the old example and a newly generated robot, and checks metadata plus decoded pixels. It retains the temporary project and copies generated MP4/source evidence under gitignored output/. It is not the npm-registry release test.

`test:release` starts without a runtime or local tarball. It downloads Skills from GitHub, requires their version pin to match 1.1.0, then installs only from npm and repeats isolated browser/render checks. It fails if the public release is unavailable or outdated. These tests require explicit permission for external downloads and rendering. The isolation harness currently requires macOS; Linux/Windows remain unverified.

Public publication is a separate final action after security review, artifact verification, npm login and explicit maintainer approval. No automatic publish occurs in scripts. The project's MIT license covers its code and artwork; Remotion has separate [license terms](https://www.remotion.dev/docs/license).
