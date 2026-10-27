---
name: create-character
description: Explain and validate the Phase 1 SVG character asset and rig contract for AI Animation Skills. Use when preparing or checking manually authored character parts.
---
Phase 1 defines assets; it does not generate characters automatically.

Use Node.js 22+ and the project-local `@gas-nontachai/animation-maker@1.0.0` CLI. The npm name is provisional and publication is not confirmed. Check `./node_modules/.bin/animation-maker` before running commands. If missing, ask approval to install a trusted package tarball with `npm install -D /path/to/gas-nontachai-animation-maker-1.0.0.tgz`; after publication is confirmed, the equivalent is `npm install -D @gas-nontachai/animation-maker@1.0.0`. Do not silently use `npx` to fetch missing code.

Run from the target project, using `./node_modules/.bin/animation-maker` (Windows: `node_modules\.bin\animation-maker.cmd`). After confirming it is installed, `npx --no-install animation-maker` is also supported. `--project` and `--output` resolve from the current directory; SVG asset paths resolve from the supplied project's `character/` directory. The original repository is not required.

Use `node_modules/@gas-nontachai/animation-maker/examples/waving-character/character/rig.json` and its six bundled parts as references, and copy them to the target project when needed. The rig schema is bundled at `node_modules/@gas-nontachai/animation-maker/packages/animation-runtime/src/schemas/index.ts`.

Each part has a unique ID, asset relative to `character/`, nullable parent ID, local position, pivot in its SVG coordinates, and global zIndex. Coordinates are SVG units, positive Y down; positive rotation is clockwise. Child position is in the parent's original SVG coordinate system. Position anchors the pivot: local matrix is T(position) R(rotation) S(scale) T(-pivot). Parent matrices and opacity multiply into children. Global zIndex orders all parts, with rig order breaking ties.

SVG must have viewBox `0 0 width height`. Geometry may extend beyond the viewBox because parts share character units and are composed without nested viewports. Use only the static primitives and presentation attributes allowed in the installed package's `scripts/project.ts`. Scripts, CSS, text, images, hrefs, entities, declarations and external resources are rejected. Paths must stay within the project after symlink resolution.

Run `./node_modules/.bin/animation-maker validate --project <project-directory>` after changes. Report failures with their part IDs. Do not add generation services or change the renderer for an individual character.
