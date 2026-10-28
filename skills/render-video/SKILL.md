---
name: render-video
description: Export validated SVG character animations as H.264 MP4 with the project-local Animation Maker CLI. Handles Chromium setup, sandbox permission failures and output metadata verification.
---
The compatible runtime is exactly `@gasnonthachai/animation-maker@1.1.0`, installed in the user's project. Check `node_modules/@gasnonthachai/animation-maker/package.json` and `./node_modules/.bin/animation-maker --version`. If both report 1.1.0, reuse them without reinstalling. On Windows use the `.cmd` shim. Never resolve a developer checkout or a global executable.

If missing or incompatible, check whether `npm view @gasnonthachai/animation-maker@1.1.0 version --fetch-retries=0 --fetch-timeout=10000` confirms availability. A network/permission failure is not evidence of an unpublished package; request host network approval if needed. This version is a release candidate until that registry check succeeds: on E404 report that the maintainer must publish it; do not pretend installation worked or substitute a local tarball. Request permission to run `npm install --save-dev --save-exact @gasnonthachai/animation-maker@1.1.0` when installation is needed and not already authorized. Before the approved npm install, preserve existing package.json fields and merge this scoped security mitigation into its overrides: `"@gasnonthachai/animation-maker": {"zod": "4.6.7"}`. This patches pinned vulnerable transitive Zod copies only within this runtime's subtree. Do not replace unrelated overrides; if that exact scope already has conflicting values, report the conflict for review rather than overwriting it. In a new directory create a minimal private package.json with that override. Preserve the project lockfile and run `npm audit` afterward; do not claim security readiness if unexpected advisories remain. The runtime's root overrides do not propagate to consumers, so this step is required even if an earlier repo audit was clean. Do not run `npx animation-maker` to implicitly fetch code; use the installed shim or `npx --no-install animation-maker`.

Run from the target project:

```sh
./node_modules/.bin/animation-maker doctor
./node_modules/.bin/animation-maker validate --project ./animation
./node_modules/.bin/animation-maker render --project ./animation --output ./output/wave.mp4
./node_modules/.bin/animation-maker inspect --input ./output/wave.mp4
```

Project/output paths resolve from the calling directory; each SVG path resolves relative to the target project's character directory. Choose unused outputs. Preserve the source directory and final MP4. For a new character/timeline request, generate sources with the create-character/animate workflow first.

If doctor reports a missing or incompatible browser, ask approval for `doctor --download-browser` unless already authorized. Download/extraction use a compatible project-local browser and show progress. Never change App Management permissions or modify system Chrome. An explicitly supplied compatible executable may be used via `--browser-executable <path>` on doctor and render. Render never downloads implicitly.

For `listen EPERM` or browser launch permission failures, request approval using the host's supported rendering mechanism only after the failure. Do not disable sandbox or SVG/path security. If approval is unavailable or refused, provide the exact project-relative render command for an authorized terminal and report validation-only status. Browser network failures require network approval separately.

Inspect the MP4 using bundled ffprobe via `animation-maker inspect`; no system FFmpeg installation is required. The default wave must be H.264, 1280×720, 24 FPS, 72 frames, 3 seconds, no audio. Report the playable output path only after render and metadata checks succeed. Never claim actual visual movement was checked without decoded-frame evidence.
