# Rustwing Raiders: art brief for the Blender models

Rustwing Raiders is a top-down shmup (two scrappy smuggler ships, solo or co-op) through planets
with several biomes each. The look follows wingedsheep.com's island and its kayak river
(`/Users/vincent/Git/wingedsheep/tools/models/*.py` for how that was modelled — read `nature.py`,
`fauna.py`, `river.py` for style and technique): low-poly models with flat colours, rendered at a
low resolution through banded toon lighting and dark depth outlines, so they read as pixel art.

## What makes a model good here

- **Seen from above.** The camera looks almost straight down (leaning back ~30°). Silhouette from
  above and the colours of the *top* surfaces are what the player sees. Tops of trees, roofs, backs
  of animals, decks of ships: make those interesting.
- **Chunky and bold.** About 8 texels per unit. A detail smaller than ~0.25 units disappears; a
  detail of 0.4+ reads. Prefer a few big confident shapes plus a couple of accents over fiddly
  bits. Contrast between neighbouring parts (light/dark, warm/cool) is what survives the pixels.
- **Faceted, not smooth.** Low segment counts (cylinders 5–8 sides, icospheres subdiv 0–1),
  jitter on rocks, slight random tilt and scale. Hand-made, not CAD.
- **Character.** Every planet must feel like its own place (see `src/world/planets.ts`, the
  biome `line`s and the planet `blurb`s). Push colour palettes per planet; use glow (`glow=True`)
  for lava, neon, bioluminescence, engine nozzles and eyes — glow reads beautifully at low res.
- **Variants.** Make 2–4 variants of common kinds (`variant=0,1,2…`) — different shapes, not
  just sizes — so a forest isn't one tree repeated. The runtime also scales and rotates them.

## Units and axes

- 1 Blender unit = 1 game unit. Ships fly at height **10**. A player ship is ~3 long.
  Ground props: small 0.5–2, trees 2–6 tall, buildings 2–5. Keep scenery **under 8** tall so it
  passes beneath you, unless it is a deliberate obstacle.
- **Obstacles** are props tall enough to hit (top ≥ 13): spires, sea stacks, mesas, arches,
  smokestacks, pylons, cranes. Each needs collider markers: for every solid column that reaches
  flight height, `kit.group("collider", loc=(x, y, 0), parent=root, collider=<radius>)`. An arch
  gets one collider per leg, none under its span (you fly through it).
- Blender +y is forward (up the screen); ships and creatures face **+y**. Ground props stand on
  z = 0 at the origin. Water props (buoys, kelp, lily pads) have z = 0 at the waterline.

## The kit (`tools/models/kit.py`)

`Model(name)` with `box`, `cyl`, `ball`, `prism`, `slab`, `gable`, `plank_line`, then
`.build(parent=..., loc=..., kind=..., variant=...)`. `group(name, ..., **props)` makes an empty
(custom props become glTF extras). `animate(obj, clip, path, keys)` keyframes a part for a clip.
Colours are hex strings. `Skin("a"|"b"|"c", "#hex")` is a recolourable slot (enemies only: a =
main body, b = secondary, c = accent; `glow=True` with a Skin c is the glowing accent).

Each template is a **root** object with `kind=<name>` (and `variant=<n>`), at the origin, with
everything else parented under it. Parts that animate must be their own objects (a Model built
with `parent=`), pivoted where they hinge (build the part around its own origin, then place it
with `loc=`).

## Animation

Clips are named `<kind>_<clip>`; ones ending in `_idle` loop (e.g. `sauropod_walk_idle`,
`pterosaur_flap_idle`, `ship_x_idle`). Keep loops seamless (first key == last key). 24 fps; keys
in seconds. Rotations in radians via `"rotation_euler"`, offsets from the rest pose. With variants,
include the variant in the clip name (`tree_fern_1_sway_idle`) — clip names must be unique per GLB.

## Building and checking

    blender -b --factory-startup -P tools/models/build.py -- --only <module>
    blender -b --factory-startup -P tools/models/build.py -- --only <module> --preview <png> [--kind a,b] [--top] [--frame 0.5]

Always render previews and **look at them** (Read the PNG) — from the game angle and `--top` —
and iterate until each model reads clearly and looks lovely. Put preview PNGs in your scratchpad,
not in the repo. Export at the end (no `--preview`) so `public/models/<module>.glb` is written.
Only edit your own module file(s); kit.py and build.py are shared (ask before changing them).
