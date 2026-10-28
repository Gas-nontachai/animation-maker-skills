# Timeline v1.0

Project files are `character/rig.json` and `timeline.json`. Optional placement `{x, y, scale}` sets character position and positive scale on the output canvas (default 440, 60, 1). Timeline fields: version `1.0`, characterId matching rig.id, integer fps 1–120, positive duration, tracks. duration × fps must be an integer. Frame indices are 0 through duration × fps − 1; time = frame / fps.

Each track has target (existing part ID), property, and at least one keyframe. Properties: `position.x`, `position.y`, `rotation` (degrees), `scale.x`, `scale.y`, `opacity` (0–1). Values are absolute local values, replacing rig defaults. Untracked properties retain rig defaults (rotation 0, scale 1/1, opacity 1).

Keyframes contain time (seconds, 0 through duration), finite value, easing (default linear). Times must be strictly increasing; duplicate target/property tracks are rejected. The easing on the starting keyframe controls the segment to the next keyframe. Supported easing: linear, easeIn (quadratic), easeOut (quadratic), easeInOut (quadratic). Values hold before the first and after the last keyframe. Rotation interpolates numerically, allowing negative values and multiple turns.

Example controlled timeline: `node_modules/@gasnonthachai/animation-maker/examples/waving-character/timeline.json` in the target project. Last keyframe may be at duration even though the last rendered sample is one frame earlier.
