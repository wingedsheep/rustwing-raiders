# Readability and the look of the planets

Item 1 of the [backlog](backlog.md), split into pushes. The goal: a screen you can read at a glance, on planets that each look like somewhere of their own. The rules are in the [art direction](art-direction.md).

Each push is small enough to finish and check on its own, and is checked before the next one starts. Each one lists only the checks that fit it, with the line it has to pass. Done pushes are deleted from here.

**The level design rules are in [level design](level-design.md)**: the principles every screen must pass (it looks great and plays clearly), what the paintings are for, how a level is laid out (the shared toolkit and each biome's layout), modelling props, and the screenshot loop every push is judged by. Read it before starting any push here. How it looks in screenshots outweighs every metric and guideline in this document.

## The checks

`just look` builds these (see Tools). Each push names the ones it needs; every push also takes the [screenshot set](level-design.md#checking-a-level-screenshots-many-of-them), and that set has the last word.

**Stills**
- **Look**: `just look <planet> <biome>` saves a painting and the game side by side, at a fixed seed with the sim paused at a set moment. `--all` makes a contact sheet of every biome.
- **Grey**: the same frame with the world greyed out, leaving threats, pickups, wall lips and the ship at full contrast.
- **Value**: the frame in greyscale, and through deuteranopia and protanopia filters.
- **Seeds**: twelve seeds of one biome on one sheet. Designed placement looks like one family; random placement looks like noise.
- **Strip**: the whole level as one tall top-down strip, to see its bones, its rhythm of groups, landmarks and breathers, and the foes on their routes.
- **Squint**: the still shrunk to 160×90 and blurred, next to other biomes' thumbnails.

**Numbers** (`just look --stats`, the game's numbers printed next to the paintings', with a pass or fail)
- **Detail ratio**: edge energy (Sobel) in the outer thirds over the middle third. The paintings keep the lane calm and the edges busy.
- **Bullet contrast**: render with and without enemy bullets; for each bullet, the lightness gap (OKLab L) to the ground right round it. Report the worst bullet.
- **Saturation rule**: the world's top 1% of saturation against the bullets' median. Enemy fire must be the most saturated thing on screen.
- **Look-alikes**: a detector for small, bright, saturated blobs, run on the frame without bullets. Anything it finds could be mistaken for a shot.
- **Clumping**: the Clark–Evans nearest-neighbour score of prop positions. 1 is random scatter; lower is grouped.
- **Open lane**: the narrowest corridor a ship can fly through, over every screen of the level.
- **Budget**: colliders, ambient particles and landmarks per screen, counted in the sim. Lists every screen over the limit. Props are counted too, but never capped: how it looks decides.
- **Off-route**: route-bound foes not on their route (a boat off the water, a car off the road), and turrets not at a guarded spot. Should be zero.

**People and play**
- **Five seconds**: show a still to someone new for five seconds, then hide it. Ask them where they can fly, what will hurt them and what they can take, and score their answers against the sim.
- **Hand**: a fight flown by hand.
- **Bench**: the autopilot bench before and after. Wall and prop hits must not go up (laser gate hits are pilot error: ignore them).

## Tools

`just look <planet> <biome>` and `just look --all` (`tools/look.ts`): a painting beside the game at a fixed seed and moment, and the grey frame, which keeps `readers()` in `src/view/level-view.ts` (the ships and their shots, foes, their fire and tells, hazards, pickups, and anything tagged `userData.lip`). `--at <s>` picks the moment, so a set is a few calls at different seeds and moments. The *before* for every later push is [`readability/before.jpg`](readability/before.jpg): seed 1, 15 s into a raid.

The owner sheet, `sheet.html` on the dev server (`src/lab/sheet.ts`): every kind of enemy fire in every accent its foes fire in, a row per faction, then the player's shots and the pickups, through the game's own renderer on flat grey (`?ground=efe8dc` for salt, `?ground=1a1430` for night). Take it with `just shot "" --url http://localhost:5190/sheet.html`. It's the quickest way to see whether fire, shots and pickups can be told apart.

`--stats` adds the numbers (20 s in, when every biome's foes are firing) and the Value, Squint and Strip sheets, with a `-found.png` showing each bullet and look-alike it measured. `--seeds` makes the Seeds sheet. The measures are in `tools/look-stats.ts`. Bullet contrast is the OKLab distance (lightness and colour), because the Salt Pans painting's orange shots on white salt read by colour. The paintings' numbers come from the bullets the look-alike finder finds in them.

The lines are rough, from one run. They only need to point at what looks chaotic. When a line and the screenshots disagree, the screenshots win, and the line gets moved:

| | paintings | today's game | line |
|---|---|---|---|
| Detail (edges over lane) | 1.05–2.2 | 0.75–1.23 | ≥ 1.0 |
| Bullet ΔE (worst) | 0.12–0.34 | 0.03–0.18 | ≥ 0.2 |
| Bullet chroma (median) | 0.12–0.23 | 0.05–0.13 | ≥ 0.15 |
| Look-alikes | (their own bullets) | 0–139 | ≤ 5 |
| Clumping | – | 0.76–0.97 | ≤ 0.7 |
| Open lane (ship widths) | – | 4.2–13.6 | ≥ 3 |
| Most on a screen (scenery / colliders / landmarks) | – | up to 162 / 9 / 2 | 60 / 8 / 1 |

Today's game fails detail, bullet contrast and colour, and clumping everywhere. Glowcap, Spore Vents, Glass Craters and Engine City are full of look-alikes, and every biome puts two landmarks on a screen. The lane is open everywhere.

## The level generator

The most important part of the plan: build the generator, then run every biome through it and improve it from screenshots. It decides what is a wall, what is solid and what is scenery, as well as where everything goes, so walls and colliders are part of it. It is tried first on Red Mesa Run, since a canyon has the most walls to get right. The camera stays as it is.

### Push 8: walls that read as walls
Stand the cliffs up (no `depthOff` push on rock above the flight line), with a lit cream lip along the top, dark faces and a bold edge. A first touch slides along the wall in a shower of sparks, instead of bouncing.

- **Pass, five seconds:** three newcomers draw where they can fly on a still. Lay their drawings over the sim's collision map: they match within a ship's width.
- **Pass, grey:** the lips show as one unbroken line along each wall.
- **Pass, bench:** wall hits don't go up.
- **Pass, hand:** a scrape clip. It reads as a slide, and you don't lose control.

### Push 9: colliders look solid, scenery stays low
Today a prop is a collider at 11 or taller and scenery reaches 8.5, with nothing marking the difference, and colliders dither away up close (`seeThrough` with a hole). Colliders get the collider look and stay solid; scenery stays low and dark.

- **Pass, data:** a test over every prop definition. Each one is either a collider with the lip, or scenery under the height gap, never in between.
- **Pass, collider map:** a debug frame with every collider tinted, next to the normal frame. In the five-second test, newcomers pick out the same things as solid.
- **Pass, look:** fly into a collider. It stays solid all the way.

### Push 11: foes that belong where they are
The generator places the foes: vehicles along the wash and the canyon tracks, turrets dug into the walls at the narrows and guarding the depot, fliers coming in over the rim. Any foe in the roster whose route the canyon lacks moves to a biome that has it.

- **Pass, screenshots:** a mid-fight set. Every foe's place and path makes sense from the still alone.
- **Pass, off-route:** zero, over every seed.
- **Pass, strip:** routes and the foes on them show in the strip.
- **Pass, hand and bench:** the fights still play well; hits don't go up.

## Every biome through the generator

Then every biome gets its own layout on the generator, a family at a time. Today's models are the start; anything a layout needs that's missing or not good enough (its bones, its big forms, the props that make it its own) is modelled in Blender as part of the push. Biomes that share bones share most of their layout code, and each gets its own rules on top. A family is one push. Inside it, for each biome: write its [layout row](level-design.md#each-biomes-layout), build it, put its foes on their routes, then take a screenshot set, look, fix and reshoot until it looks right. When a family needs the toolkit to change, reshoot the families already done.

A first guess at the families, to be changed as the rows get written:

| Push | Family | Biomes |
|---|---|---|
| 12 | Gorges and walls | mesarun, tidecaves, bonearch, basalt |
| 13 | Open flats | saltpans (laid out: `src/sim/layouts/saltpans.ts`, its own props in `tools/models/set_kessra.py`), tundra, coralflats, oasis (laid out: `src/sim/layouts/oasis.ts`; its qanat shafts, sand fences, garden walls, dovecotes, windcatcher cistern, noria, dead crowns, mud houses and house blocks, caravanserai, wagons and cargo modelled in `tools/models/set_kessra.py`) |
| 14 | Water and channels | kelp, whalelagoon, peat, chemlake, stiltport |
| 15 | Roads, grids and built places | enginecity, refinery, pipeline, scavcamp |
| 16 | Fields and forests | glowcap (laid out: `src/sim/layouts/glowcap.ts`; its caps' light moved off lime and their warts unlit in `tools/models/props_a_mirefall.py`; the moss a dim grey teal so the violet caps stand off it by hue; the *Tamsin Lowe* modelled as `mirefall_tamsin_lowe` in `tools/models/set_mirefall.py`), fernwood, whitewood, orchards, jade |
| 17 | Rises, bowls and craters | glass, sporevents (laid out: `src/sim/layouts/sporevents.ts`; its vent cones, rim crust, chimneys, low stacks, tufts and the maar's throat modelled in `tools/models/set_mirefall_vents.py`; a `pocks` ground pattern; fog banks and breathing vents in `src/view/life.ts`; the spore clouds come up out of its live vents), springs, prism |
| 18 | Monuments and giants | titans, monoliths (laid out: `src/sim/layouts/monoliths.ts`; its Tonkva ledger-beacons, sunk faces, fallen beacons, count stones and the reading ring's hearth modelled in `tools/models/set_kessra_monoliths.py`), temple (laid out: `src/sim/layouts/temple.ts`; its hearth-lamps, water-gate pylons, columns, shrines, sluices, the socket's torn roots, the bell, the Rang's huts and punts and the bloom's rows and mats modelled in `tools/models/set_mirefall_temple.py`; the temple's glow moved off lime to a warm hearth; `spill` and `toll` effects in `src/view/life.ts`), arkbones |
| 19 | Sky and ice | stormwall, shelf |

Each family push passes push 11's checks for every biome in it, and the generator's: a set of twelve seeds, calm and mid-fight, where you can say why each group is where it is; a few big forms on every screen with the details gathered round them; clumping at most 0.7; an open lane of at least three ship widths; at most one landmark on a screen; twelve seeds that look like one family; a strip with visible bones, beats and breathers; a way in and a way out. And:

- **Pass, screenshots:** each biome's set passes every principle.
- **Pass, squint:** next to each other, the family's biomes read as different places, not one layout reskinned.

## The look, a biome at a time

New models and light come after a biome's layout passes. A good layout in plain grey is worth more than new art on a bad one. Red Mesa Run goes first and sets the routine; each later biome runs push 20's checks, plus its own.

### Push 20: Red Mesa Run's own look
The models and light. The biome's pieces (cliff pieces, the broken arch, scrub, rock stacks, the depot dug into the wall) are modelled straight in Blender (`tools/models/`), with the painting as a reference for grain, cleanness and contrast, not a model sheet to copy, and dusk light: only the tops lit, a warm key and a cool fill.

- **Pass, preview:** `just preview` of each model reads at in-flight size.
- **Pass, screenshots:** a full set (seeds, moments, the strip) passes every principle. Beside the painting it is as clean, as contrasted and as well grouped, in its own palette. The new models keep the balance of big forms and small details the layout set up.
- **Pass, squint:** the thumbnail reads as Red Mesa next to every other biome's.
- **Pass, detail ratio:** at least the painting's lower bound, the lane calmer than the edges.
- **Re-run:** bullet contrast, saturation, look-alikes and squint, and the checks from pushes 10 and 11.
- **Keep:** the final set's best still as `art-direction/planets/kessra-mesarun-game.png`.

### Push 21: Glowcap Forest
An open field at night under a violet sky. The bones are wet hollows and the dry rises between them; caps grow in groups in the hollows at the sides and frame the lane. They glow down and brighten in a wave as you pass; tall caps carry the collider lip. Brood sacs root in the deepest hollows.

- **Pass, look-alikes:** zero, with every cap glowing.
- **Pass, saturation rule:** the acid-green brood sacs are the only saturated green, and the engine the only warm thing.

### Push 22: Titan Graveyard
Flat overcast and ash. The bones are the titans' fallen bodies; wrecks and scavenger camps gather round them, and one titan's hand frames the lane, its knuckles lipped. This is Khet's planet, so the sector comes together with its rebuilt Warden.

- **Pass, saturation:** the world's median saturation stays near grey. Only factions and the player are saturated.
- **Pass, budget:** the hand counts as the screen's one landmark.

## The foes

### Pushes 23–26: one faction each (scrap, lattice, wild, bloom)
The faction's foes are remodelled in Blender. The faction is in the material and hue, the job in the shape ([shapes](art-direction.md#shapes)). Each foe's brief says what ground it needs (water, road, wall, open sky) and how it moves along it.

- **Pass, silhouettes:** every foe as a black shape at 32 pixels. Each one is told apart from its faction's others.
- **Pass, ring:** a crisp one-texel dark ring on every foe, in Look on three biomes' grounds.
- **Pass, tells:** a clip of each foe's tell. Engines flare, lattice draws, beasts rear, bloom swells.
- **Pass, screenshots:** each foe in a mid-fight set on two biomes. It reads at once, and it sits where it belongs.

## Then: a planet at a time

Each planet is a push, all four biomes together, starting with Kessra, Mirefall, Ashgrave, then Glacis and Vesh. Each planet picks its own style and palette, and its sides can differ (a day side and a night side, a sea coast and an ice cap). Oru-Tal, Halcyon and Cinder have no paintings; they are modelled straight away and judged on screenshots against the questions in [AGENTS.md](../AGENTS.md).

- **Pass:** each biome's layout already through the generator (pushes 12–19), then push 20's checks for each biome.
- **Pass, blind test:** thumbnails of the planet's four biomes, shuffled with two other planets' thumbnails. People sort them by planet.

The scripted moments and each planet's music stay with [biomes](backlog.md#7-biomes-places-worth-seeing).
