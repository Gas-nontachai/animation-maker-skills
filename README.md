# AI Animation Skills — Phase 1.6

Local-first TypeScript tools and Agent Skills for assembling SVG parts, evaluating JSON keyframes, and exporting video. No editor or web application. The controlled example waves three times over 3 seconds.

## Install in any project

Requires Node.js 22+ and npm. `@gas-nontachai/animation-maker@1.0.0` is a provisional package name/version; it has **not been published by this workflow**. The package remains private to prevent accidental publication. Install the local artifact today:

```sh
npm install -D /path/to/gas-nontachai-animation-maker-1.0.0.tgz
```

After publication is separately confirmed, the registry equivalent will be `npm install -D @gas-nontachai/animation-maker@1.0.0`. Installing dependencies and downloading external tools requires the user's authorization. Skills never fetch a missing runtime implicitly.

Install the three Skills from an updated checkout or package directory with an approved skills installer:

```sh
npx skills add ./node_modules/@gas-nontachai/animation-maker --agent codex --copy
```

Once these changes are available in the GitHub repository, `npx skills add Gas-nontachai/animation-maker-skills` is the remote equivalent. The skills installer is separate from the runtime and may itself require a package download. Skills are discoverable under `.agents/skills/`; keep `animate/references/` with its SKILL.md.

From the target project, check the locally installed executable before using npx. `--no-install` prevents fetching a missing CLI:

```sh
./node_modules/.bin/animation-maker doctor
npx --no-install animation-maker validate --project ./example
npx --no-install animation-maker render --project ./example --output ./output.mp4
```

On Windows, use `node_modules\.bin\animation-maker.cmd` or the npx form. `--project` and `--output` are relative to the calling directory. Each asset is relative to the supplied project's `character/` folder, with filesystem and SVG security validation preserved. A complete example is included under `node_modules/@gas-nontachai/animation-maker/examples/waving-character`; copy that directory to `./example` to try it. No original checkout, global CLI or system FFmpeg is needed.

## Browser setup and permissions

`doctor` checks Node/platform information, bundled FFmpeg/ffprobe, Chromium availability and local server binding. It exits nonzero if a prerequisite fails. It does not download a browser by default and does not prove browser launch or all OS libraries; use a real render for that check.

If Chromium is missing, approve one explicit setup command:

```sh
npx --no-install animation-maker doctor --download-browser
```

Alternatively pass `--browser-executable <path>` to doctor and render for an already installed compatible Chromium. No machine-specific path is stored in the package. The browser cache belongs to the calling project (`node_modules/.remotion`), and required Chromium OS libraries must be available, especially on Linux. Render never downloads Chromium implicitly.

Rendering requires permission to bind a local HTTP server and launch headless Chromium. In a restricted Codex sandbox, `listen EPERM` is an environment limitation: request host approval for the command and stop if permission is denied. Do not disable sandbox or SVG/path checks. Phase 1.5 reproduced this with plain Node servers on IPv4 and IPv6; the same renderer worked with authorized execution. Changing ports does not fix a binding prohibition. Browser download errors need network permission separately.

If FFmpeg/ffprobe fail, reinstall platform optional dependencies from the package lock; do not copy binaries from another OS or assume a global installation. Remotion ships a reduced FFmpeg build and macOS requires its adjacent shared libraries. The test helper uses Remotion's pinned binary resolver and library environment. Rerun package/integration tests when upgrading Remotion, including any use of `RenderInternals`.

The renderer exports silent H.264 MP4, 1280 × 720. The example uses 24 FPS, 72 frames, 3 seconds. Existing outputs are refused; failed renders clean up staging files. All Remotion packages must use the same version. This repository's MIT license covers its code and example artwork; Remotion has its own [license terms](https://www.remotion.dev/docs/license).

## Project contract

A project contains `character/rig.json`, SVG assets relative to `character/`, and `timeline.json`. See `examples/waving-character` for a complete six-part character. Validation checks schemas, finite numbers, duplicate IDs/tracks, references, parent cycles, ordered keyframes, asset existence and paths including symlinks.

Rig coordinates are SVG units, positive Y down. Part `position` anchors `pivot` in its parent's original SVG coordinates. Local transform is `T(position) R(rotation) S(scale) T(-pivot)`; parent matrices and opacity propagate to children. Global `zIndex` determines drawing order; rig order breaks ties. Static SVG primitives only: no scripts, event handlers, CSS, text, images, hrefs, declarations, entities or external resources. SVG viewBox is `0 0 width height`; geometry is composed in intrinsic units without nested viewport clipping.

Timeline properties are `position.x`, `position.y`, `rotation`, `scale.x`, `scale.y`, `opacity`. Values replace the local rig values. Rotation is in degrees, positive clockwise; opacity is 0–1. Easing on a keyframe controls its outgoing segment: `linear`, quadratic `easeIn`, `easeOut`, `easeInOut`. Values hold before/after the keyframe range. Duplicate or unsorted times are errors. Frame time is exactly `frame / fps`, starting at zero. The last example frame is 71 at 2.958333 seconds; the endpoint keyframe at 3 seconds is not sampled.

Optional timeline `placement: {"x": 440, "y": 60, "scale": 1}` positions the character on the white output canvas. Defaults match these values. The runtime also accepts placement directly through `SvgComposer` props. The rig canvas records the character's design dimensions, independent of video resolution.

Pure animation exports live in `packages/animation-runtime/src/index.ts`: `validateAnimation`, `ease`, `interpolate`, `evaluateFrame`, and matrix multiplication. Parse data before evaluating; the pure evaluator assumes validated inputs and returns local properties plus world matrices and inherited opacity. It rejects frame indices outside the timeline. Filesystem/SVG validation lives in `scripts/project.ts`; React composition and Remotion consume validated data, never file paths.

## Development and package verification

The existing monorepo layout is retained. The root npm package includes `bin/`, selected CLI scripts, `packages/animation-runtime/src/`, `renderer/src/`, the example and all three Skills. The CLI registers the existing tsx loader with its own settings; tsx is a production dependency. Source shipping avoids a second build pipeline and keeps Remotion's existing TypeScript bundling. TypeScript/Vitest are development-only dependencies. There are no install scripts or checkout path fallbacks.

From this repository:

```sh
npm ci
npm run validate -- --project examples/waving-character
npm test
npm run typecheck
npm run test:integration
npm pack --pack-destination output
npm run test:package
```

`test:integration` preserves the original metadata and pixel checks, using bundled FFmpeg/ffprobe rather than system binaries. Frame sampling uses `trim` and raw RGB through `image2pipe`, supported by the reduced bundled FFmpeg.

`test:package` requires authorized network access to install the tarball's dependencies and skills CLI 1.7.4, and authorized local server/browser execution. It packs the actual artifact, installs it without lifecycle scripts into a fresh temporary project, and uses the real skills installer to copy all three Skills into `.agents/skills/`. It verifies that an empty browser cache is reported without an implicit download, then copies the already provisioned browser cache for the rendering test. This proves independence from the checkout; it does not test a fresh browser download.

On macOS the test applies an additional `sandbox-exec` policy denying all reads under the original checkout. The isolated process asserts that reading the checkout's package.json fails, then runs installed CLI doctor, validation, render, metadata/pixel checks and overwrite protection. No original directory is renamed or hidden. It retains the temporary project for inspection and writes the tarball, `wave-standalone.mp4` and `phase1.6-evidence.json` under gitignored `output/`. The isolation harness currently requires macOS; an equivalent checkout-denial test is needed before claiming Linux/Windows verification.

## Agent Skills

- `create-character`: manual SVG asset and rig contract; automatic generation is deferred.
- `animate`: controlled JSON timeline editing and validation, with a bundled timeline reference.
- `render-video`: installed CLI, browser provisioning, rendering and permission troubleshooting.

Install runtime dependencies locally in each target project and commit that project's package lock. The Skills refer only to the installed CLI and package files, never to this checkout. Installing a Skill does not install its runtime or authorize package/browser downloads.

No Web UI, character generation, natural-language animation generation, audio, lip sync, storyboard or new rendering framework is included.
