# Legacy 2D camera — experimental

The M4 world-space cinematic contract is documented in [m4-cinematic.md](m4-cinematic.md). This page describes the preserved x/y/zoom format and its limitations.

M4 camera is an **optional extension of an M2 scene timeline**. No additional skill, runtime dependency, rig migration or audio feature is required. Legacy projects without `camera` render with the previous identity framing.

Camera coordinates use the scene's 1280×720 SVG world space (positive Y downward). `x` and `y` designate the world point at the center of the image. `zoom` must be a finite positive number; 1 is the default, values above 1 zoom in. Each shot uses a half-open integer frame range `[startFrame, endFrame)`. Shots must be ordered, contiguous, begin at 0 and cover the exact timeline frame count; boundaries are hard cuts. An optional `to` animates linear camera position and zoom within a shot. Without `to`, the shot is static.

Example addition to a 48-frame (2 s at 24 fps) `timeline.json` scene:

```json
{
  "version": "1.0", "fps": 24, "duration": 2, "tracks": [],
  "camera": {
    "shots": [
      {"startFrame": 0, "endFrame": 24, "from": {"x": 640, "y": 360, "zoom": 1}},
      {"startFrame": 24, "endFrame": 48, "from": {"x": 640, "y": 360, "zoom": 1.5},
       "to": {"x": 520, "y": 300, "zoom": 2}}
    ]
  }
}
```

Run `animation-maker validate --project <scene>`, `render --project <scene> --output <unused.mp4>`, and `inspect --input <mp4>`. Review decoded frames on either side of cuts and during movement; metadata inspection alone cannot establish cinematic quality.

MVP exclusions: automatic shot planning, follow targets, dolly/parallax, 3D camera, transitions, continuity tooling and audio. M4 camera applies to scene projects; existing single-character files remain unchanged.
