# AGENTS.md: live-face-svg


The live face of rossark-motion-skill without React Native, Reanimated or SwiftUI: a face geometry
and a choreography in, one animated SVG out (SMIL, plays in browsers, `<img>` tags and GitHub READMEs).
Needs Node 18+. No packages.

## Commands (run from the repo root)
- One mood: `node live-face-svg.mjs --mood happy -o face.svg`
- Every mood at once: `node live-face-svg.mjs --all out/`
- List moods: `node live-face-svg.mjs --list` (happy, talking, tired, sad, focused, sleepless, wink)
- Your own character: `node live-face-svg.mjs --face my-face.json --mood talking -o face.svg` (start from `examples/robot.json`)
- Your own choreography: `--choreo choreo.json` (same shape as an entry of `MOODS` in `live-face-svg.mjs`)
- A still frame (reduced motion, a thumbnail): `--at 0` (frame 0 is always a good drawing)
- Smaller file: `--fps 30`

## Face JSON
- `size` `[w, h]`, `pivot` `[x, y]` (the neck the head tilts around), `art` (SVG drawn under the eyes:
  head, hair, ears), `front` (SVG drawn over the lids: nose, glasses, fringe).
- `ink`: `white`, `pupil`, `skin` (the lid and cheek colour), `line`, `lineWidth`, `mouth`, `tongue`, `teeth`.
- `eyes`: two `{cx, cy, w, h, pupilW, pupilH, pupilTop, shine}`; the eye white is a pill of `w` x `h`.
- `mouth`: `{x0, x1, top, tilt}`.

## Choreography
Tracks are keyframes `[ms, value, "out"?]`: `lookX`, `lookY` (pupil offset), `lid` and `lidRight`
(0 open .. 1 closed), `cheek` (0..1 happy squint), `mouth` (open depth), `tilt` (degrees).
Rules from the method: the last key equals the first; a blink closes in ~110 ms, holds 30-50 ms and
reopens in ~190 ms with `"out"`; glide the gaze in ~500 ms and hold it at least 1 s.
