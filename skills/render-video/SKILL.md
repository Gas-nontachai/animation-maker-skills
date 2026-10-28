---
name: render-video
description: Export validated SVG character animations as H.264 MP4 with the project-local Animation Maker CLI. Handles Chromium setup, sandbox permission failures and output metadata verification.
---
The compatible runtime is `@gasnonthachai/animation-maker@^1.1.1`, installed in the user's project. Check `node_modules/@gasnonthachai/animation-maker/package.json` and `./node_modules/.bin/animation-maker --version`. Both must report the same version satisfying SemVer `^1.1.1` (`>=1.1.1 <2.0.0`, excluding prereleases). Reuse a compatible installation without reinstalling, upgrading, querying npm or changing package.json/package-lock.json. Reject 1.1.0 and 2.0.0; accept 1.1.1, 1.1.2 and 1.2.0. On Windows use the `.cmd` shim. Never resolve a developer checkout or a global executable.

If missing or incompatible, check whether `npm view '@gasnonthachai/animation-maker@^1.1.1' version --fetch-retries=0 --fetch-timeout=10000` confirms availability. A network/permission failure is not evidence of an unpublished package; request host network approval if needed. On E404 report that no compatible runtime is available; do not pretend installation worked or substitute a local tarball. Request permission to run `npm install --save-dev '@gasnonthachai/animation-maker@^1.1.1'` when installation is needed and not already authorized. Before the approved npm install, preserve existing package.json fields and merge this scoped security mitigation into its overrides: `"@gasnonthachai/animation-maker": {"zod": "4.6.7"}`. This patches pinned vulnerable transitive Zod copies only within this runtime's subtree. Do not replace unrelated overrides; if that exact scope already has conflicting values, report the conflict for review rather than overwriting it. In a new directory create a minimal private package.json with that override. Preserve the project lockfile; let npm update it for the approved install, never delete it or force an update of an already compatible runtime. Recheck the manifest/CLI compatibility and run `npm audit` afterward; do not claim security readiness if unexpected advisories remain. The runtime's root overrides do not propagate to consumers, so this step is required even if an earlier repo audit was clean. Do not run `npx animation-maker` to implicitly fetch code; use the installed shim or `npx --no-install animation-maker`.

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

## M2 scene workflow

Scene support requires an M2-capable runtime; the M1 compatibility range above alone does not establish that capability. In this unreleased checkout use its local CLI only when explicitly authorized. Do not silently install or publish an unreleased build. Read the runtime's docs/scene-contract.md before authoring scenes.

Identify independent objects from the prompt. Reuse the create-character SVG safety, part and pivot instructions for each rig; preserve Rig v1.0. Store rigs under assets/<name>/rig.json and SVGs beside each rig. Reuse rig references for repeated instances. Write scene.json and a scene timeline using explicit {object} or {object,part} targets; use tracks: [] for static scenes. Keep object layers grouped and animate only supported keyed transforms/opacity. Validate, render and inspect using the existing commands, preserving and reporting every SVG/JSON and MP4 path. Owner visual approval remains separate from automated checks. For example: “Create a 5-second animation of a yellow-shirt character raising a hand while a coffee cup moves across a desk.” Author independent character, desk, laptop and cup rigs with synchronized part rotation and cup position tracks. Do not claim walking, typing, sitting synthesis, IK, physics, interactions, camera or audio support.
