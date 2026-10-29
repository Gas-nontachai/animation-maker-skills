# M2 scene contract

Presence of scene.json selects M2, including malformed files and dangling symlinks (errors never fall back to M1). Without it the existing character/rig.json and Timeline v1.0 path is unchanged.

scene.json is a strict object: version "1.0", canvas {width:1280,height:720}, optional background (named CSS color, hexadecimal color or "transparent"), and nonempty objects. Each object has a unique alphanumeric/underscore/hyphen id, a project-relative rig path, and optional position {x:0,y:0}, rotation 0, scale {x:1,y:1}, opacity 1, zIndex 0. Transforms are finite; opacity is 0–1. Negative and zero scales are supported. Rotation is clockwise in degrees around the rig origin; positive X is right and Y down. Rig canvas does not introduce scaling or clipping. Rig geometry is never copied into the scene.

Timeline is a separate strict contract: version "1.0", fps (integer 1–120), positive duration in seconds producing an integer frame count, and tracks. Targets are {object:"instance-id"} or {object:"instance-id",part:"part-id"}. Properties and easing are exactly Timeline v1.0's. Keyframe times are strictly increasing, within [0,duration]; opacity values are 0–1. Duplicate target/property tracks are rejected. No placement field or characterId is accepted. Static objects need no tracks. Frame indices are integers in [0,fps*duration).

Object transforms wrap the existing rig evaluator's part matrices: world = object × rig-part-world. Object opacity multiplies inherited part opacity. Objects sort by zIndex then declaration order; parts remain grouped and use existing local ordering. Transparent/absent scene backgrounds remain transparent in SVG; H.264 has no alpha channel. Use an explicit solid color for predictable MP4 appearance. M1 stays white. Full-frame SVG backgrounds are ordinary objects.

Rig paths and SVG assets must resolve inside the project, including symlink targets. SVG paths are relative to their rig's directory. Existing SVG sanitation applies unchanged before bundling. Rig assets are loaded and sanitized once per reference per job. Evaluation is pure and uses existing evaluateFrame; composition uses one SVG viewport and Remotion.

See examples/m2 for editable fixtures. These are simple geometric verification assets, not a claim of production visual quality. The M2 runtime has no physics, procedural evaluation, runtime object constraints, camera, audio or editor. M3 optionally compiles procedural motion plans into these unchanged timeline contracts; see [motion contract](motion-contract.md).
