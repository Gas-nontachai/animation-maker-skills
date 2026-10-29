# M3 owner handoff

M3 implementation acceptance, M1/M2 regression acceptance, natural-language E2E and visual approval remain owner responsibilities. No release is authorized by this handoff.

## Setup and automated checks

Use Node 22+ in this checkout. Do not infer npm availability from package.json.

```sh
npm ci
npm test
npm run typecheck
npm run test:integration
node bin/animation-maker.mjs doctor
```

If doctor reports no compatible browser, explicitly authorize `node bin/animation-maker.mjs doctor --download-browser`. Render may require host permission for local server binding/browser launch. No runtime/browser download is needed when compatible dependencies already exist.

## Editable example

`examples/m3/coffee/` contains independent person, desk, chair and cup SVG/rig sources, scene.json, motion.json and compiled timeline.json. It demonstrates an eight-second approach, stop gap, sit, reach, pickup, hand-to-mouth pose/hold and replacement. It does not certify polished art or physically realistic motion.

```sh
node bin/animation-maker.mjs plan --project examples/m3/coffee --output output/m3-review-timeline.json
node bin/animation-maker.mjs validate --project examples/m3/coffee
node bin/animation-maker.mjs render --project examples/m3/coffee --output output/m3-owner.mp4
node bin/animation-maker.mjs inspect --input output/m3-owner.mp4
```

Choose unused output filenames; outputs are never overwritten. Compare compiled output to the committed timeline before copying it into the project. Expect H.264, 1280×720, 24 FPS, 192 frames, eight seconds, no audio. Open the MP4 and inspect boundaries at 2, 2.25, 3.25, 4, 4.5, 5.5, 6 and 7 seconds. Check connected joints, stationary desk/chair, no pickup/release jumps, hand/object alignment and stable released cup. In the developer example “drink” is represented by a hand-to-mouth pose and hold; assess whether the resulting gesture meets your visual intent.

## Independent natural-language E2E

Invoke the updated animate Skill in an agent with this M3 checkout explicitly authorized. The stable npm compatibility range alone does not establish M3 availability. Use the PRD's primary prompt:

> Create an 8-second 2D animation of a character walking toward a desk, stopping, sitting on a chair, reaching toward a coffee cup, picking it up, drinking, and placing it back on the desk. Export the result as an MP4.

Require a new unused project directory, prompt-specific SVG assets, explicit motion plan, mapped capabilities, validated compiled timeline, MP4 and inspection output. Review action ordering/timing, generated art, hand contact, static objects, playback and preserved sources. Confirm the agent describes limitations honestly and does not substitute an unrelated animation on failure.

Additional cases: walk → stop → sit; two characters moving concurrently; unreachable cup diagnostic; missing forearm diagnostic; conflicting arm actions diagnostic; attached object with rotated/scaled parents; nonzero contact offset; released cup holding position while character moves away. Verify invalid plans do not replace existing timeline files.

## M1/M2 regression

Independently run the original waving project and M2 static/animated/trees fixtures through validate/render/inspect. Follow docs/m2-owner-e2e.md and docs/asset-contract.md. Confirm legacy schemas/defaults, static scenes, reused rig instances, invalid references, path traversal/symlink and SVG restrictions. Automated compatibility checks are evidence, not final acceptance.

## Release/documentation discrepancy

At implementation start package.json declared 1.1.2; README described 1.1.1 as published, and M2 documentation marked its feature unreleased/owner pending. No registry query or publication was performed here, so the current public registry state is unverified. Version, release workflows, branch protection and publishing settings are unchanged. M3 requires the capability-bearing source checkout until the owner separately approves and verifies a release.
