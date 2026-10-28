# M2 automated verification — 2026-10-28

Status: M2 IMPLEMENTED — OWNER E2E PENDING.

- npm test: 100 tests passed across 6 files, including M1 regression, scene contracts, instance isolation, deterministic evaluation, synchronized object/part tracks, transforms, layer ordering, frame bounds and filesystem/SVG rejection.
- npm run typecheck: passed.
- npm run test:integration: passed. Existing M1 video passed decoded-frame wave assertions; static, animated and shared-tree M2 scenes rendered with H.264, 1280×720, 24 FPS, expected frame counts and no audio.
- npm run test:package: passed after host permission for network and render. Local tarball installed outside checkout; consumer audit clean; three Skills installed; checkout access denied by OS policy; doctor, M1 validation/render, decoded pixels, inspect, and overwrite protection passed. This package suite's isolated video assertions remain M1-specific; M2 video coverage is in repository integration tests.
- git diff --check: passed.
- Invalid scene CLI validation: expected exit 1 with duplicate object ID; no renderer started.

Initial integration attempts were blocked by sandbox local-server binding and then missing Chromium. Authorized doctor download and rerun resolved both. Initial sandbox package attempt was interrupted during installation; authorized rerun passed.

Prepared videos: output/m2-static.mp4, output/m2-animated.mp4, output/m2-trees.mp4, output/m2-m1.mp4. Editable sources: examples/m2 and examples/waving-character. See m2-owner-e2e.md for exact owner commands and expected behaviors.

Architecture: separate scene contracts with unchanged Rig/Timeline v1.0; pure evaluator reuses evaluateFrame; object matrices wrap local rig matrices; same sanitizer/confinement and Remotion pipeline; no new dependencies. Stable declaration ordering handles tied object layers. Scene assets are cached per rig reference within loading. Existing M1 default background and placement remain unchanged. Scene detection is file-presence based and never silently falls back on malformed scene data.

No branch merge, registry publication, release or owner visual approval was performed. Current branch feat/m2-scene-composition; base commit 990d716; remaining changes are uncommitted for review. Geometric fixtures do not demonstrate polished prompt-level artwork or advanced motion. Owner scenarios A–E and explicit approval remain pending.
