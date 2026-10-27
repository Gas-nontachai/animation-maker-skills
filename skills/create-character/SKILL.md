---
name: create-character
description: Explain and validate the Phase 1 SVG character asset and rig contract for AI Animation Skills. Use when preparing or checking manually authored character parts.
---
Phase 1 defines assets; it does not generate characters automatically.

Work in the AI Animation Skills checkout. Use `examples/waving-character/character/rig.json` and its six parts as the reference. Rig schema is in `packages/animation-runtime/src/schemas/index.ts`.

Each part has a unique ID, asset relative to `character/`, nullable parent ID, local position, pivot in its SVG coordinates, and global zIndex. Coordinates are SVG units, positive Y down; positive rotation is clockwise. Child position is in the parent's original SVG coordinate system. Position anchors the pivot: local matrix is T(position) R(rotation) S(scale) T(-pivot). Parent matrices and opacity multiply into children. Global zIndex orders all parts, with rig order breaking ties.

SVG must have viewBox `0 0 width height`. Geometry may extend beyond the viewBox because parts share character units and are composed without nested viewports. Use only the static primitives and presentation attributes allowed in `scripts/project.ts`. Scripts, CSS, text, images, hrefs, entities, declarations and external resources are rejected. Paths must stay within the project after symlink resolution.

Run `npm run validate -- --project examples/waving-character` after changes. Report failures with their part IDs. Do not add generation services or change the renderer for an individual character.
