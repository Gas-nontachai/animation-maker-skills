---
name: render-video
description: Validate SVG character projects and render silent H.264 MP4 videos using the AI Animation Skills CLI and Remotion. Use for local video export from an existing rig and timeline.
---
Run commands from the AI Animation Skills repository root, with Node.js 22+ and dependencies installed via `npm ci` (or `npm install` if no lockfile exists).

```
npm run validate -- --project examples/waving-character
npm run render -- --project examples/waving-character --output output/wave.mp4
```

Choose an unused output filename; the CLI refuses existing files. Validation is repeated during render. Do not bypass SVG/path validation or add per-character renderer code. Remotion uses headless Chromium internally; no interactive browser window is opened. Its first run can require a browser download. Render output is silent H.264, 1280×720; FPS and frame count come from the timeline.

For the controlled 3-second wave, run `npm run test:integration`. It uses Remotion's bundled platform-specific FFmpeg and ffprobe, creates a temporary export, checks video metadata and samples decoded frames to check arm movement. No separate FFmpeg installation is needed. Preserve the requested final export. Report the output path, validation result, and any checks that could not run.

Remotion needs permission to bind a local HTTP server and launch headless Chromium. If rendering fails with `listen EPERM`, request host approval for the render/test command; stop and report the required permission if denied. Do not disable sandbox or security controls, or treat a binding restriction as an animation defect. Initial Chromium download may separately require network permission. See README's Phase 1.5 verification for the reproduced sandbox restriction and portability requirements.
