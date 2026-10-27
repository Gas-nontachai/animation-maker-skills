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

For the controlled 3-second wave, run `npm run test:integration` with ffmpeg and ffprobe on PATH. This creates a temporary export, checks video metadata and samples decoded frames to check arm movement. Preserve the requested final export. Report the output path, validation result, and any checks that could not run.
