# Chromium bootstrap — verification

Verified on 2026-10-27 with macOS arm64, Node.js 22.23.4 and installed `@remotion/renderer@4.0.373`.

## Root cause

Both installed `dist/ensure-browser.js` and `dist/ensure-browser.d.ts` return `Promise<BrowserStatus>`, not `void`. Success includes `path`; failure can return `{type: 'no-browser'}`. The old wrapper's `Chromium setup failed` message was thrown for that last status, not for a void result.

The exact original message was reproduced with an empty platform directory in a fresh project's Remotion cache. In this version, `browser/BrowserFetcher.js` skips downloading if the platform directory already exists, even when its expected executable is missing. `ensureBrowser` then returns `no-browser`. This demonstrates an incomplete-cache cause of the reported failure; the user's original failing cache was not inspected. The wrapper also suppressed all download progress with a no-op callback.

## Change

- Keep the public `ensureBrowser` status/path contract for executable discovery in the shared `browser()` helper used by doctor and render.
- Only enable downloads through `doctor --download-browser`; otherwise the callback rejects before downloading.
- Use the public API's default download and progress handling for opted-in setup.
- Validate that a returned path is an executable file. Preserve underlying download errors and provide path/cache/network remediation.
- Explain the incomplete-cache condition and advise moving the affected project-local cache aside before retrying. No automatic cache deletion or security relaxation.

No browser bootstrap internals are imported. The recovery instructions and incomplete-cache test fixture describe the pinned version's cache layout; revisit those on upgrades. Existing `RenderInternals.callFf` usage in doctor remains solely for bundled FFmpeg/ffprobe, separately documented in README. No animation runtime, assets, timeline, renderer components or rendering semantics changed.

## Results

| Check | Result |
| --- | --- |
| Original tests plus new bootstrap regressions | PASS: 13/13 in two files (seven existing, six new) |
| TypeScript | PASS: `npm run typecheck` |
| Missing browser | PASS: no opt-in means an actionable error instead of a download |
| Successful installation | PASS: mocked API contract and actual fresh Chromium download via the installed CLI |
| Failed installation | PASS: mocked network failure retains its cause; actual incomplete-cache fixture reports remediation |
| Executable validation | PASS: missing files and directories rejected; valid cached/custom paths accepted |
| Packaging and standalone | PASS: `npm run test:package` packs/installs a tarball in a clean project, installs all three Skills, denies checkout reads, downloads Chromium with progress, then runs doctor/validate/render |
| Video | PASS: H.264, 1280×720, 24 FPS, 72 frames, 3 seconds, no audio; decoded pixels confirm three arm raises and overwrite protection |

The standalone browser download was 85.4 MB and used no browser copied from the checkout. Generated artifact integrity and temporary project location are in `output/phase1.6-evidence.json`; the tarball and standalone video remain under `output/`.

## Limits

The real download/render run used authorized network, local server and browser permissions. Restricted sandbox binding remains an environment limitation. Incomplete caches require the documented manual move-aside step or an explicit existing executable; the CLI does not silently remove user files. Linux/Windows were not exercised. No publication was performed, and the user's pre-existing package.json change was preserved.
