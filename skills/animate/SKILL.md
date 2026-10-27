---
name: animate
description: Validate and evaluate controlled JSON keyframe timelines with the AI Animation Skills runtime. Use for Phase 1 timeline changes and checking animation values.
---
Use Node.js 22+ and the project-local `@gas-nontachai/animation-maker@1.0.0` CLI. The npm name is provisional and publication is not confirmed. Check `./node_modules/.bin/animation-maker` before running commands. If missing, ask approval to install a trusted package tarball with `npm install -D /path/to/gas-nontachai-animation-maker-1.0.0.tgz`; after publication is confirmed, the equivalent is `npm install -D @gas-nontachai/animation-maker@1.0.0`. Do not silently use `npx` to fetch missing code.

Run from the target project, using `./node_modules/.bin/animation-maker` (Windows: `node_modules\.bin\animation-maker.cmd`). After confirming it is installed, `npx --no-install animation-maker` is also supported. `--project` and `--output` resolve from the current directory; SVG asset paths resolve from the supplied project's `character/` directory. The original repository is not required.

Edit controlled JSON keyframes; automatic natural-language animation generation is deferred.

Read [timeline-spec.md](references/timeline-spec.md) before editing a timeline. Load the rig and validate the project through `./node_modules/.bin/animation-maker validate --project <project-directory>`. The installed package includes runtime/schema sources under `node_modules/@gas-nontachai/animation-maker/packages/animation-runtime/src/`. Preserve their animation semantics; do not introduce browser timing or renderer-specific interpolation.

For the wave example, keep 24 FPS and 3 seconds. Check right-arm rotations at frames 0, 12, 24, 36, 48 and 60: 0, -150, 0, -150, 0, -150. Render with the render-video skill workflow and report any unverified output honestly.
