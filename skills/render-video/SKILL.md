---
name: render-video
description: Validate SVG character projects and render silent H.264 MP4 videos using the AI Animation Skills CLI and Remotion. Use for local video export from an existing rig and timeline.
---
Use Node.js 22+ and the project-local `@gas-nontachai/animation-maker@1.0.0` CLI. The npm name is provisional and publication is not confirmed. Check `./node_modules/.bin/animation-maker` before running commands. If missing, ask approval to install a trusted package tarball with `npm install -D /path/to/gas-nontachai-animation-maker-1.0.0.tgz`; after publication is confirmed, the equivalent is `npm install -D @gas-nontachai/animation-maker@1.0.0`. Do not silently use `npx` to fetch missing code.

Run from the target project, using `./node_modules/.bin/animation-maker` (Windows: `node_modules\.bin\animation-maker.cmd`). After confirming it is installed, `npx --no-install animation-maker` is also supported. `--project` and `--output` resolve from the current directory; SVG asset paths resolve from the supplied project's `character/` directory. The original repository is not required.

```
./node_modules/.bin/animation-maker doctor
./node_modules/.bin/animation-maker validate --project ./example
./node_modules/.bin/animation-maker render --project ./example --output ./output.mp4
```

Choose an unused output filename; the CLI refuses existing files. Validation is repeated during render. Do not bypass SVG/path validation or add per-character renderer code. Remotion uses headless Chromium internally; no interactive browser window is opened. Rendering never downloads Chromium implicitly. If missing, ask approval for `./node_modules/.bin/animation-maker doctor --download-browser`, or supply an existing browser with `--browser-executable <path>` to doctor/render. Doctor checks binary availability and local binding, but a real render is needed to verify browser launch and OS libraries. Render output is silent H.264, 1280×720; FPS and frame count come from the timeline.

Preserve the requested final export. Report the output path, validation result, and any checks that could not run. The package bundles the controlled example; its metadata is H.264, 1280×720, 24 FPS, 72 frames, 3 seconds, with no audio.

Remotion needs permission to bind a local HTTP server and launch headless Chromium. If rendering fails with `listen EPERM`, request host approval for the render/test command; stop and report the required permission if denied. Do not disable sandbox or security controls, or treat a binding restriction as an animation defect. Initial Chromium download may separately require network permission.
