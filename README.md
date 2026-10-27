# AI Animation Skills — Phase 1

Local-first TypeScript tools and Agent Skills for assembling SVG parts, evaluating JSON keyframes, and exporting video. No editor or web application. The controlled example waves three times over 3 seconds.

## Setup

Install Node.js 22+ and npm, then run:

```sh
npm install
npm run validate -- --project examples/waving-character
npm run render -- --project examples/waving-character --output output/wave.mp4
```

Remotion uses headless Chromium internally, without opening an interactive browser. The first render may download Chromium; subsequent renders can run locally with the downloaded dependencies. OS libraries required by Chromium must be present (especially on Linux). Use an unused output path: existing files are never overwritten. Failed renders clean up temporary files.

The renderer exports silent H.264 MP4, 1280 × 720. The example uses 24 FPS, 72 frames, 3 seconds. All Remotion packages must use the same version. This repository's MIT license covers its code and example artwork; Remotion has its own [license terms](https://www.remotion.dev/docs/license).

## Project contract

A project contains `character/rig.json`, SVG assets relative to `character/`, and `timeline.json`. See `examples/waving-character` for a complete six-part character. Validation checks schemas, finite numbers, duplicate IDs/tracks, references, parent cycles, ordered keyframes, asset existence and paths including symlinks.

Rig coordinates are SVG units, positive Y down. Part `position` anchors `pivot` in its parent's original SVG coordinates. Local transform is `T(position) R(rotation) S(scale) T(-pivot)`; parent matrices and opacity propagate to children. Global `zIndex` determines drawing order; rig order breaks ties. Static SVG primitives only: no scripts, event handlers, CSS, text, images, hrefs, declarations, entities or external resources. SVG viewBox is `0 0 width height`; geometry is composed in intrinsic units without nested viewport clipping.

Timeline properties are `position.x`, `position.y`, `rotation`, `scale.x`, `scale.y`, `opacity`. Values replace the local rig values. Rotation is in degrees, positive clockwise; opacity is 0–1. Easing on a keyframe controls its outgoing segment: `linear`, quadratic `easeIn`, `easeOut`, `easeInOut`. Values hold before/after the keyframe range. Duplicate or unsorted times are errors. Frame time is exactly `frame / fps`, starting at zero. The last example frame is 71 at 2.958333 seconds; the endpoint keyframe at 3 seconds is not sampled.

Optional timeline `placement: {"x": 440, "y": 60, "scale": 1}` positions the character on the white output canvas. Defaults match these values. The runtime also accepts placement directly through `SvgComposer` props. The rig canvas records the character's design dimensions, independent of video resolution.

Pure animation exports live in `packages/animation-runtime/src/index.ts`: `validateAnimation`, `ease`, `interpolate`, `evaluateFrame`, and matrix multiplication. Parse data before evaluating; the pure evaluator assumes validated inputs and returns local properties plus world matrices and inherited opacity. It rejects frame indices outside the timeline. Filesystem/SVG validation lives in `scripts/project.ts`; React composition and Remotion consume validated data, never file paths.

## Checks

```sh
npm test
npm run typecheck
npm run test:integration
```

The integration test uses the platform-specific FFmpeg and ffprobe bundled with Remotion; no system installation or PATH changes are needed. It renders the real example to a temporary file, checks H.264, dimensions, rate, frame count, duration and absent audio, then samples decoded frames at raised/lowered arm positions for all three waves. It removes temporary output afterward. The bundled FFmpeg has fewer filters and muxers than a full installation; frame sampling uses `trim` and raw RGB through `image2pipe`.

## Agent Skills

The three `skills/*/SKILL.md` entrypoints have Agent Skills YAML frontmatter:

- `create-character`: manual character asset contract and example; automatic generation is deferred.
- `animate`: timeline contract, validation and pure runtime evaluation.
- `render-video`: CLI export and video verification.

Keep this checkout available to the agent and load the relevant SKILL.md, or copy the corresponding directory into the agent's supported skill directory. Commands run from this repository root. Do not copy only SKILL.md from `animate`: its references directory is required. See the [Agent Skills specification](https://agentskills.io/specification) for compatible hosts.

## Phase 1.5 environment verification

Verified on 2026-10-27 with macOS arm64, Node.js 22.23.4, Remotion 4.0.373 and bundled FFmpeg/ffprobe n7.1:

- Validation, all seven unit tests and TypeScript checks pass.
- Inside the sandbox, render reproduces `listen EPERM :::3000`. A plain Node TCP server also fails with `EPERM` on both `::` and `127.0.0.1`, using an automatically assigned port. This establishes a sandbox network binding restriction, independent of Remotion configuration or port availability. Remotion's static server selects ports starting at 3000.
- The same render command succeeds with explicitly approved execution beyond the sandbox restriction. Chromium is already cached; no browser download or package installation was needed in this run.
- The original integration test fails with `spawnSync ffprobe ENOENT` because system binaries are absent from PATH. The test now resolves Remotion's bundled binaries and supplies their adjacent library directory on macOS. Directly launching those binaries without this environment fails to load `libavdevice.dylib`.
- Integration passes with a real render: H.264, 1280×720, 24 FPS, 72 frames, 3 seconds, no audio; decoded pixel checks confirm three arm raises at frames 12, 36 and 60, with lowered-arm checks at 0, 24 and 48.
- `output/wave.mp4` already existed and was preserved. A fresh export at `output/wave-phase1.5.mp4` has identical SHA-256: `c19e26bb723831b470dfb58a38a7544e5ac60af86f2cc03041a68383236480f7`. Both files have the expected metadata. Generated videos are gitignored.

No animation runtime, character assets, timeline or security validation changed. Rendering still requires local server and browser process permission; request approval from the host when blocked, and stop if denied. Changing ports or forcing IPv4 does not resolve this sandbox restriction.

For portability between projects:

- Use Node.js 22+ and `npm ci` with the committed lockfile; keep all Remotion package versions aligned and install platform optional dependencies.
- Keep the runtime, renderer, scripts and required skill references available together. Run commands from this repository root with project/output arguments; copying a skill alone does not install its executable tools.
- Reuse Remotion's platform binary resolution instead of machine paths or a required global FFmpeg installation. The integration helper uses `RenderInternals` from the pinned version; rerun integration when upgrading Remotion.
- Provision Chromium and its OS libraries during environment setup, with authorized network access for a first download, then retain its cache. This run did not test a clean-cache download, Linux/Windows, or a separately installed agent workflow.

The npm scripts use `node --import tsx` to avoid the IPC listener created by the standalone tsx CLI.

No character generation, natural-language timeline generation, audio, lip sync, storyboard or editor is included.
