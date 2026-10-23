# Readability and the painted look

Item 1 of the [backlog](backlog.md), split into pushes. The goal: a screen you can read at a glance, that looks like the paintings in [`art-direction/planets/`](art-direction/planets/). The rules are in the [art direction](art-direction.md).

Each push is small enough to finish and check on its own, and is checked before the next one starts. Each one lists only the checks that fit it, with the line it has to pass. Done pushes are deleted from here.

## The checks

Pushes 1 and 2 build these. Each later push names the ones it needs.

**Stills**
- **Look**: `just look <planet> <biome>` saves the painting and the game side by side, at a fixed seed with the sim paused at a set moment. `--all` makes a contact sheet of every biome.
- **Grey**: the same frame with the world greyed out, leaving threats, pickups, wall lips and the ship at full contrast.
- **Value**: the frame in greyscale, and through deuteranopia and protanopia filters.
- **Seeds**: twelve seeds of one biome on one sheet. Composed placement looks like one family; random placement looks like noise.
- **Strip**: the whole level as one tall top-down strip, to see its rhythm of groups, landmarks and breathers.
- **Squint**: the still shrunk to 160×90 and blurred, next to the painting's.

**Numbers** (`just look --stats`, the game's numbers printed next to the painting's, with a pass or fail)
- **Detail ratio**: edge energy (Sobel) in the outer thirds over the middle third. The paintings keep the lane calm and the edges busy.
- **Bullet contrast**: render with and without enemy bullets; for each bullet, the lightness gap (OKLab L) to the ground right round it. Report the worst bullet.
- **Saturation rule**: the world's top 1% of saturation against the bullets' median. Enemy fire must be the most saturated thing on screen.
- **Look-alikes**: a detector for small, bright, saturated blobs, run on the frame without bullets. Anything it finds could be mistaken for a shot.
- **Clumping**: the Clark–Evans nearest-neighbour score of prop positions. 1 is random scatter; lower is grouped.
- **Open lane**: the narrowest corridor a ship can fly through, over every screen of the level.
- **Budget**: props, colliders, ambient particles and landmarks per screen, counted in the sim. Lists every screen over the limit.

**People and play**
- **Five seconds**: show a still to someone new for five seconds, then hide it. Ask them where they can fly, what will hurt them and what they can take, and score their answers against the sim.
- **Hand**: a fight flown by hand.
- **Bench**: the autopilot bench before and after. Wall and prop hits must not go up (laser gate hits are pilot error: ignore them).

The thresholds below are starting values. Push 2 measures the paintings and today's game, and sets the real ones from what separates the two.

## Tools

`just look <planet> <biome>` and `just look --all` are built (`tools/look.ts`; `--at` and `--seed` move the moment, `--twice` checks that two runs give the same pixels). The grey frame keeps `readers()` in `src/view/level-view.ts`: the ships, foes, their fire and tells, hazards, pickups, and anything tagged `userData.lip`. The *before* for every later push is [`readability/before.jpg`](readability/before.jpg): seed 1, 15 s into a raid.

### Push 2: `just look --stats`
The numbers above, plus the Value, Seeds, Strip and Squint sheets.

- **Pass:** the numbers agree with the eye. Run on all ten paintings and on today's ten biomes: the paintings should pass and today's game should fail where it looks wrong (a busy lane, flat bullets, scatter).
- **Keep:** both sets of numbers, written into this doc as the thresholds.

## The four layers, game-wide

No new biome art. After these four pushes, every biome shows the [four layers](art-direction.md#the-four-layers) apart, even before its world is redone.

### Push 3: threats above the grade
Enemy bullets go into the overlay pass, so bloom, split tone and the black lift stop flattening them. (The comment at `level-view.ts:132` says they are drawn there already; they aren't.) Tone down the ground under the lane: less bloom and saturation there, the richest colour at the edges.

- **Pass, bullet contrast:** the worst bullet in every biome clears the threshold (start at ΔL ≥ 0.3).
- **Pass, saturation rule:** holds in all biomes.
- **Pass, value:** bullets still stand out in the greyscale frame.
- **Pass, squint:** each biome's thumbnail still reads as its own place next to the *before* sheet. Toning down the ground mustn't wash the biomes out.

### Push 4: the colour contract
Enemy fire in faction hues on the dark plate, player shots in rust and cream only, pickups chalk-white, laser gates white-hot cores with a dark edge. Fix what breaks it:
- the legacy roster's orange and yellow bullets (`src/world/planets.ts`);
- the player's rail in lattice cyan, the player's mine and missile in scrap red;
- the scrap glow in the player's slug gold;
- repair green, the same as bloom bullets and spores;
- the hot strongbox's red lamp and ring;
- laser gates in scrap red;
- grafts recolouring player shots to faction hues.

Checks:
- **Pass, owner sheet:** every bullet, shot, pickup and gate drawn on neutral grey, grouped by owner (player, each faction, pickups, colliders). No hue family shows up in two groups.
- **Pass, value:** in the colour-blind frames, the player's shots and enemy fire still differ by lightness or shape.
- **Pass, hand:** a fight with grafts fitted. Your shots stay rust and cream.

### Push 5: pickups by shape
Paint a pickup sheet with Codex first (a bent tin coin for scrap, a riveted repair patch, at in-flight size on two of the paintings' grounds), then model them. They bob and turn and never streak; today scrap is a glowing blob, like an orb bullet.

- **Pass, silhouettes:** every pickup and every bullet as black shapes at in-game size on one sheet. No pickup could be taken for a bullet.
- **Pass, motion:** a short clip of pickups and bullets on screen together. The pickups drift and the bullets travel.
- **Pass, five seconds:** three people asked "what can you take?" point to the pickups and nothing else.

### Push 6: nothing ambient looks like a bullet
Spores, embers, pollen, ash and glints stay below the flight plane, bigger and softer than any shot, and thin out while a fight is on. The same goes for low clouds and flocks.

- **Pass, look-alikes:** zero blobs found, in every biome, both in a calm moment and mid-fight.
- **Pass, budget:** the ambient count mid-fight is at most half the calm count, read from the sim.
- **Pass, grey:** the contact sheet shows no ambient specks.

## Red Mesa Run, piece by piece

The first biome taken all the way to [its painting](art-direction/planets/kessra-red-mesa-run.png). It is a canyon, so it settles the camera, walls, colliders and placement, which every later biome reuses.

### Push 7: the camera
The paintings look down more steeply than the game's 30° (`TILT` in `src/sim/types.ts`), so the cliffs show their faces. Try 30°, 38° and 45°.

- **Look:** Red Mesa, Glowcap and Titan Graveyard at each angle, beside their paintings.
- **Pass, warning time:** how long a bullet fired from the top of the screen takes to reach the ship. The chosen angle loses at most 10% against 30°.
- **Pass, hand and bench:** each angle flown by hand. The bench's hit rate doesn't rise at the chosen angle.
- **Decide:** one angle for the whole game, written into the art direction.

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

### Push 10: props composed, not scattered
Groups along the canyon edges framing a clear lane, a density budget per screen, and fewer, bigger landmarks at chosen beats. Today each chunk scatters props at random x, landmarks up to 26 wide included.

- **Pass, clumping:** clearly below 1 (start at ≤ 0.7), against today's score of about 1.
- **Pass, open lane:** at least three ship widths on every screen.
- **Pass, budget:** no screen over its budget, and at most one landmark per screen.
- **Pass, seeds:** twelve seeds look like one family.
- **Pass, strip:** the level has visible beats and breathers.

### Push 11: Red Mesa Run, like its painting
The models and light from the painting. Codex paints the painting's pieces on flat grey from the in-flight angle and the side (cliff pieces, the broken arch, scrub, rock stacks, the depot dug into the wall). They are modelled in Blender (`tools/models/`), with dusk light: only the tops lit, a warm key and a cool fill.

- **Pass, preview:** `just preview` of each model next to its sheet.
- **Pass, look:** beside the painting, it's the same place.
- **Pass, squint:** the thumbnail's palette matches the painting's (six-colour swatches of each, side by side).
- **Pass, detail ratio:** within 25% of the painting's.
- **Pass, paint-over:** Codex repaints the game's still in the painting's style without moving anything. What it changes is the to-do list, and the push is done when that list is small.
- **Re-run:** the checks from pushes 3, 6 and 10.
- **Keep:** the final still as `art-direction/planets/kessra-mesarun-game.png`.

## More biomes to their paintings

Each push reuses pushes 7–10. Each one runs push 11's checks, plus its own.

### Push 12: Glowcap Forest
An [open field at night](art-direction/planets/mirefall-glowcap-forest.png). Caps in two groups at the sides frame the lane. They glow down and brighten in a wave as you pass, under a violet night; tall caps carry the collider lip.

- **Pass, look-alikes:** zero, with every cap glowing.
- **Pass, saturation rule:** the acid-green brood sacs are the only saturated green, and the engine the only warm thing.

### Push 13: Titan Graveyard
[Flat overcast and ash](art-direction/planets/ashgrave-titan-graveyard.png), with one titan's hand framing the lane, its knuckles lipped. This is Khet's planet, so the sector comes together with its rebuilt Warden.

- **Pass, saturation:** the world's median saturation stays near grey. Only factions and the player are saturated.
- **Pass, budget:** the hand counts as the screen's one landmark.

## The foes

### Pushes 14–17: one faction each (scrap, lattice, wild, bloom)
Codex paints a sheet of the faction's foes from the in-flight angle, kept in [`art-direction/enemies/`](art-direction/enemies/), and the models are rebuilt from it. The faction is in the material and hue, the job in the shape ([shapes](art-direction.md#shapes)).

- **Pass, silhouettes:** every foe as a black shape at 32 pixels. Each one is told apart from its faction's others.
- **Pass, ring:** a crisp one-texel dark ring on every foe, in Look on three biomes' grounds.
- **Pass, tells:** a clip of each foe's tell. Engines flare, lattice draws, beasts rear, bloom swells.

## Then: a planet at a time

Each planet is a push, all four biomes together, starting with Kessra, Mirefall, Ashgrave, then Glacis and Vesh. Oru-Tal, Halcyon and Cinder have no paintings yet, so each starts by painting its four biomes and judging them against the questions in [AGENTS.md](../AGENTS.md).

- **Pass:** push 11's checks, for each biome.
- **Pass, blind test:** thumbnails of the planet's four biomes, shuffled with two other planets' thumbnails. People sort them by planet.

The scripted moments and each planet's music stay with [biomes](backlog.md#7-biomes-places-worth-seeing).
