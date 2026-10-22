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

## Set pieces (`set_<planet>.py`)

Each planet has its own module, `tools/models/set_<planet>.py` (exported to
`public/models/set_<planet>.glb` and `src/generated/set_<planet>.json`), holding the things that
make its levels feel enormous. Kinds are prefixed with the planet (`orutal_fig_bridge`). They're
wired up per biome in `src/world/looks.ts`: which set pieces a biome has (with a role), the haze
that drifts by high over it, and the pattern painted into its ground. A root needs nothing but `kind` and `variant`.

**Roles** (the runtime places them; build each around the origin):

- **span**: reaches right across the field *above* the flight line. The field is x = −36 … 36 and
  a wide screen shows about ±44, so build spans 80–100 wide with legs out at |x| ≈ 38–46 (outside
  the field), or one variant with an extra leg in the middle (then it's an obstacle to slip past).
  The underside of the deck must be at **13 or higher** everywhere over the field (ships are
  ~1 tall at y 10); the top can go to 22. The runtime stretches spans ×1.6 upwards (gates ×1.35)
  so a deck stands well clear of a ship, and draws whatever is over the flight line with depth:
  the higher, the bigger and the faster it slides by. Deck depth (along y) 3–14: a bridge, a fallen trunk, a
  pipe rack, a rib, a crane boom, a frond canopy. Legs go down to z = −3 (the ground dips; water
  stands up to 2.5). One `collider` per leg (radius = the leg's). The deck stays solid over a
  ship (the ship shows through as a silhouette), and its shadow falls over it: so make the deck's
  top *and* underside's silhouette interesting, with gaps, holes, hanging bits (above 12.5).
- **gate**: a cluster of 2–5 columns taller than the flight line (tops 15–28) with **narrow gaps**
  between them (6–9 units: a ship is ~3 wide), 26–44 wide overall. The runtime stands it with its
  outer end a little past one side of the field, so the other side stays open: threading the gaps
  is the brave line (skimming close builds Burn). Colliders on every column (radius ≈ the
  column's at flight height, 10). Things can join columns *above* 13 (a lintel, a web, a
  hanging vine) to fly under.
- **giant**: something enormous lying below the flight line, 30–70 across: a carcass, a hull, a
  felled statue, a machine. Top under **8.5** except for any part that reaches up past the flight
  line, which needs colliders (one raised arm, a mast). The runtime turns it any way, so it must
  read from every angle; detail on top is what's seen.

**Ground patterns** are set in `looks.ts` (no models): `cells`, `cracks`, `veins`, `tiles`,
`ripples`, `rings`, `streaks`, `plates`, with a colour, a scale, a strength, an optional glow,
`patchy` and `below` (a height it keeps under).
