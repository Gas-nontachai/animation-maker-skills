# Dynamic SVG asset contract — M1

The agent authors SVG source from a prompt; the existing pipeline remains:
**Prompt → AI-authored SVG → Rig → Timeline → Remotion → MP4**.
No external AI API, category generator, new schema or renderer is required.
`create` retains the default waving robot. For custom assets, author project files
directly and run `animation-maker validate --project <directory>` before rendering.

Reserve a new directory exclusively; refuse existing directories and write new
files exclusively. Keep all SVG/JSON sources available for editing. Never replace
unrelated assets. The compatible layout remains:

```text
project/
  character/rig.json
  character/parts/<part>.svg
  timeline.json
```

## SVG and rig authoring

Each SVG requires `viewBox="0 0 width height"` with finite positive dimensions.
The allowlisted elements are `svg`, `g`, `path`, `rect`, `circle`, `ellipse`,
`line`, `polyline`, `polygon`. Plain allowlisted presentation attributes are
supported; `scripts/project.ts` is authoritative. Scripts, handlers, CSS, text,
images, hrefs, resources, declarations and entities are forbidden. Do not insert
XML declarations or comments. Asset paths resolve relative to `character/` and
must remain inside the project, including after symlink resolution.

Rig v1.0 requires a unique asset `id`, positive `canvas` dimensions and at least
one part. IDs use letters, digits, underscores or hyphens. Each part requires
`id`, `asset`, nullable `parent`, `position`, `pivot`, and integer `zIndex`.
Part IDs must be unique; parents must exist and be acyclic. Optional defaults:
`rotation: 0`, `scale: {x:1,y:1}`, `opacity: 1`. All numbers must be finite;
opacity is 0–1. `character/` and `characterId` remain compatible names for objects.

Coordinates are intrinsic SVG units, positive Y down and positive rotation
clockwise. The local matrix is `T(position) R(rotation) S(scale) T(-pivot)`.
A part's pivot lands at position in the parent's original SVG coordinates.
Parent matrices and opacity propagate through any number of nested parts.
Global zIndex determines draw order, with rig order breaking ties. Geometry is
composed without nested viewport clipping. The rig canvas records design size;
it does not resize the fixed 1280×720 white video canvas. Optional timeline
`placement: {x,y,scale}` positions/scales the whole rig (default 440,60,1;
scale must be positive).

## Single-part static cup

`character/parts/cup.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
  <path d="M110 45 H125 Q155 75 125 105 H110" fill="none" stroke="#7c4525" stroke-width="12"/>
  <rect x="20" y="35" width="95" height="95" rx="15" fill="#eebc79"/>
  <ellipse cx="67" cy="35" rx="47" ry="12" fill="#5a3522"/>
</svg>
```

`character/rig.json`:

```json
{
  "id": "coffee-cup", "version": "1.0",
  "canvas": {"width": 160, "height": 160},
  "parts": [
    {"id": "cup", "asset": "parts/cup.svg", "parent": null,
     "position": {"x": 80, "y": 80}, "pivot": {"x": 80, "y": 80}, "zIndex": 0}
  ]
}
```

`timeline.json` (static assets still need duration/fps for export):

```json
{
  "version": "1.0", "characterId": "coffee-cup", "fps": 24, "duration": 3,
  "placement": {"x": 440, "y": 60, "scale": 1}, "tracks": []
}
```

## Multipart human

Author a human silhouette directly, for example a yellow-shirt torso, head and
an arm split at the elbow. Do not create/recolor the robot first. The following
four-part rig illustrates a nested hierarchy; it is not a mandatory skeleton.
Use `<svg viewBox="0 0 240 320">…</svg>` around each indicated primitive:

| File under `character/parts/` | SVG body |
| --- | --- |
| torso.svg | `<rect x="20" y="0" width="100" height="140" rx="25" fill="#facc15"/>` |
| head.svg | `<ellipse cx="40" cy="45" rx="35" ry="42" fill="#b87950"/>` |
| upper-arm.svg | `<rect x="0" y="0" width="24" height="65" rx="12" fill="#facc15"/>` |
| forearm.svg | `<rect x="0" y="0" width="20" height="60" rx="10" fill="#b87950"/>` |

```json
{
  "id": "yellow-shirt-human", "version": "1.0",
  "canvas": {"width": 240, "height": 320},
  "parts": [
    {"id":"torso","asset":"parts/torso.svg","parent":null,"position":{"x":50,"y":110},"pivot":{"x":0,"y":0},"zIndex":0},
    {"id":"head","asset":"parts/head.svg","parent":"torso","position":{"x":70,"y":0},"pivot":{"x":40,"y":85},"zIndex":3},
    {"id":"upper-arm","asset":"parts/upper-arm.svg","parent":"torso","position":{"x":115,"y":20},"pivot":{"x":12,"y":10},"zIndex":1},
    {"id":"forearm","asset":"parts/forearm.svg","parent":"upper-arm","position":{"x":12,"y":60},"pivot":{"x":10,"y":5},"zIndex":2}
  ]
}
```

Pair this with a timeline whose characterId is `yellow-shirt-human`. Use empty
tracks for static output or, for example, a forearm rotation track with keyframes
`[{"time":0,"value":0},{"time":1,"value":-60},{"time":2,"value":0}]`.
The track target is `forearm` and property is `rotation`.

## Motion, validation and stopping

Timeline v1.0 requires matching characterId, integer fps 1–120, positive duration
and tracks. Duration × fps must be an integer frame count. Tracks target existing
parts and use absolute local values for `position.x`, `position.y`, `rotation`,
`scale.x`, `scale.y`, or `opacity`. Each has at least one finite-valued keyframe;
times must be strictly increasing between 0 and duration inclusive. No duplicate
target/property pairs. Easing: linear, easeIn, easeOut, easeInOut; the starting
keyframe controls the outgoing segment. Values hold outside the keyed interval.
Untracked properties retain defaults. See the animate Skill's timeline reference.

After initial validation, allow at most two automatic source-repair attempts,
validating after each (three validations total). Report the failing part/path or
schema field and stop if unsuccessful. Preserve validators and never render an
invalid project. The renderer already loads/validates before browser/bundle work.

M1 supports a single rig and keyed local transforms/opacity. Report unsupported
behavior explicitly: multi-object scenes, interaction, automatic walking/sitting/
typing, IK, physics, backgrounds, audio, lip sync, 3D or camera motion. Do not
silently substitute a wave. Identical validated files and frame inputs retain
deterministic runtime evaluation.

## Owner verification (pending)

Automated contract tests do not establish prompt interpretation or visual quality.
Using the candidate Skills with a compatible installed runtime, request:

1. “Create a human wearing a yellow shirt.” Inspect the editable sources and
   silhouette; confirm custom parts/pivots rather than a recolored robot.
2. “Create a coffee cup.” Confirm one part and empty tracks validate; request
   export and inspect the static MP4.
3. “Create a cartoon tree” and “Create a character with a different body shape.”
   Check that geometry and part counts follow the prompts.
4. Request a supported forearm rotation and export. Check attachment, motion,
   framing and playable MP4. Request unsupported walking and verify it is reported.
5. Repeat the original three-second waving-character prompt and check its output.
6. Check preserved sources, no overwritten projects/outputs, and validation failure
   stopping after at most two repairs without rendering.

Final acceptance remains pending the owner's manual E2E and visual review.
