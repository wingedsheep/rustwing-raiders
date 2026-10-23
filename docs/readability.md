# Readability and the look of the planets

Item 1 of the [backlog](backlog.md), split into pushes. The goal: a screen you can read at a glance, on planets that each look like somewhere of their own. The rules are in the [art direction](art-direction.md).

Each push is small enough to finish and check on its own, and is checked before the next one starts. Each one lists only the checks that fit it, with the line it has to pass. Done pushes are deleted from here.

**How it looks in screenshots outweighs every metric and guideline here.** The numbers, lines and rules help find problems; they don't decide. If the screenshots look good and a number fails, question the number. If every number passes and the screenshots look wrong, the push isn't done.

## What the paintings are for

The paintings in [`art-direction/planets/`](art-direction/planets/) are a reference, not a target to copy. Take from them:

- **the graphical style**: the pixel grain, the banded light, the brushwork;
- **the cleanness**: a calm lane, busy edges, nothing in the frame that doesn't need to be there;
- **the contrast**: danger, walls and your ship stand out from the world at once;
- **the grouping, placement and sizes** of things: props in groups that frame the lane, a few big things rather than many small ones, objects sized to their layer.

Don't copy their palettes, props or layouts one to one. Each planet gets its own style and palette, and so can each side of a planet. The levels are generated, so no frame will ever match a painting anyway. A biome passes when its screenshots read as cleanly as the paintings do, not when they look like them.

## The principles

**The game comes first.** A biome can be as strange and beautiful as it likes, as long as these hold:

1. **Obstacles are clear.** You can see at a glance what in the terrain you will hit and where you can fly.
2. **Danger is unmistakable.** Enemy fire is always told apart from the world, from your own shots and from pickups, on every ground and in every light.
3. **Levels are designed.** Every object is where it is for a reason: along a riverbank, on a ridge, at the mouth of a canyon, round a depot. Nothing looks strewn about at random.
4. **Foes belong where they are.** Each one moves and stands in a way the terrain explains:
   - a boat follows the waterways, and a level with boats has water to carry them;
   - an armoured car keeps to a road or track, and turns where the road turns;
   - a turret sits where someone would build one: on a wall, at a choke, guarding a bridge or a depot, on high ground with a view of the lane;
   - fliers are free, but come from somewhere (a hangar, a nest, over the horizon);
   - grown things root where they would grow: in the wet, on the rock, round the vents.
5. **Each planet is its own place.** Its own light, its own palette, its own shapes, alive in its own way: wind, water, life at ground level. You should know where you are from a thumbnail.
6. **Contrast where it counts.** The lane stays calm, at mid-value. The strongest contrast goes to danger, walls and your ship; the world's richest colour goes to the edges.

## How a biome is checked: screenshots, many of them

Looking is the main check, and it wins over every other. While working on a planet, take many screenshots, look at every one, and fix what fails before going on. The numbers and tools below help find problems; they don't replace looking, and passing them doesn't make a biome good.

1. **Take a set** with `just look` (see Tools): several seeds, several moments (calm flight, mid-fight, a landmark, a breather, the boss's approach), and the whole level as a strip. One good frame proves nothing; a dozen bad ones are easy to miss without a set.
2. **Look at each one against the principles**, and write down what fails:
   - Where can I fly? What will I hit? Is any solid thing hard to see, or any harmless thing easy to mistake for solid?
   - What will hurt me? Can I find every enemy shot in a second? Does anything else look like one?
   - Does the placement make sense? Could I say why each group is where it is? Does any screen look like a random scatter, or a clutter?
   - Do the foes fit the ground? Boats on water, cars on roads, turrets where they guard something?
   - Is it this planet, and nowhere else? Is it alive? Is it beautiful in its own way?
   - Beside a painting: is it as clean, as contrasted and as well grouped, even though it looks different?
3. **Fix, then shoot the set again** at the same seeds and moments, so before and after sit side by side.
4. **Repeat until the list is empty.** Then fly it by hand and run the bench.

A push isn't done until its last set of screenshots has been looked at and passes.

## Laying out a level

**This is one of the most important things to get right.** Good art on a random layout still looks like clutter; a well laid-out level reads even in plain grey. Placement comes from algorithms that build the level the way the place would have formed or been built, never from scattering props at random x.

**Each biome has its own layout.** A canyon, a salt flat, a reef and a buried city aren't the same algorithm with different props: they grow different bones, group things by different rules and give foes different routes. Today every biome shares one generator and differs only in its terrain `shape` and prop weights (`src/world/planets.ts`, `src/sim/terrain.ts`). That has to become one layout per biome, built on a shared toolkit.

### The shared toolkit

Every biome's layout runs the same steps, in order, but each step is its own per biome:

1. **The bones**: the big features first. Canyon walls, a river and its banks, a road or a rail line, ridges, craters, a coast, a fault, a street grid. They run with the scroll and give the level its beats.
2. **The lane**: the open space the ship flies through, kept at least three ship widths wide, opened and narrowed on purpose.
3. **Groups along the bones**: props cluster where the features say they would (reeds on the banks, rubble under the cliffs, wrecks along the road, caps in the wet hollows), at the sides of the lane, framing it. A density budget per screen.
4. **Landmarks at chosen beats**: at most one per screen, where the level turns or opens.
5. **Foes on the features they need**: route-bound foes are only spawned where their route exists, and follow it (boats on the water, vehicles on the road). Turrets are placed at the spots the bones make worth guarding. Free fliers fill the rest.
6. **Breathers**: stretches with little scenery and no fire, so the busy parts read as busy.

The toolkit gives the shared parts (a route the sim can follow, a lane carved through the bones, group placement along a curve or round a point, the budget, the beat clock). The layout gives the rules. A foe whose route a biome lacks isn't in that biome's roster.

### Each biome's layout

A first idea for each painted biome, to be tried in screenshots and changed. Every other biome writes its row before its push starts.

| Biome | Bones | Groups | Routes and posts | Beats |
|---|---|---|---|---|
| Salt Pans | flat salt, crossed by dry cracks and a few old haul tracks | salt pillars in tight clusters on the crack lines, wide bare salt between | skimmers race the tracks; mortars at track crossings | a stranded hauler; long bright breathers |
| Red Mesa Run | a winding gorge, its walls, a dry wash on the floor | rubble and scrub under the cliffs and along the wash | vehicles in the wash and on ledge tracks; guns dug into the walls at the narrows | the broken arch; the depot in the wall |
| Glowcap Forest | wet hollows and the dry rises between them | caps in groups in the hollows at the sides | crawlers along the rises; spitter pods in the hollows | a ring of giant caps; a clearing |
| Spore Vents | a field of vent lines along buried faults | vents in rows on the faults, growth thickest round them | grown things root by the vents; fliers come out of the fog | a vent column; a dead quiet stretch |
| Aurora Shelf | a shelf edge and its crevasses | ice spires in threes and fives on the ridges | sledges on the shelf road; pylons on the ridges | a calving face; open ice |
| Engine City | a buried street grid under the ice | districts in blocks along the streets, lit from below | ground units on the streets; guns at junctions and gates | a laser gate across an avenue; a dark district |
| Titan Graveyard | the titans' fallen bodies | wrecks and scavenger camps round the bodies | crawlers along the spines; guns on the ribs | one titan's hand framing the lane |
| Glass Craters | crater rims and floors | glass shards on the rims, the floors glowing | rollers round the rims; emplacements on the high rims | a big crater to cross |
| Calving Haze | no ground, a haze sea in layers | drift-calves in herds below, cloud banks at the sides | skiffs along wind lanes; harpoon posts on the floating rocks | a calf rising past |
| Tide Caves | close reef walls and channels between them | wet growth on the lips, shell beds in the shallows | boats in the channels; guns in the cave mouths | a flooded hall; a narrows |

### Layout first, art after

Each biome's layout is built and judged before its new art. Its screenshots in today's models (and in the grey frame and the strip) must already read as a designed place: clear bones, grouped props, an open lane, foes on their routes. New models on a bad layout don't fix it.

## The checks

`just look` builds these (see Tools). Each push names the ones it needs; every push also takes the screenshot set above, and that set has the last word.

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
- **Budget**: props, colliders, ambient particles and landmarks per screen, counted in the sim. Lists every screen over the limit.
- **Off-route**: route-bound foes not on their route (a boat off the water, a car off the road), and turrets not at a guarded spot. Should be zero.

**People and play**
- **Five seconds**: show a still to someone new for five seconds, then hide it. Ask them where they can fly, what will hurt them and what they can take, and score their answers against the sim.
- **Hand**: a fight flown by hand.
- **Bench**: the autopilot bench before and after. Wall and prop hits must not go up (laser gate hits are pilot error: ignore them).

## Tools

`just look <planet> <biome>` and `just look --all` (`tools/look.ts`): a painting beside the game at a fixed seed and moment, and the grey frame, which keeps `readers()` in `src/view/level-view.ts` (the ships and their shots, foes, their fire and tells, hazards, pickups, and anything tagged `userData.lip`). `--at <s>` picks the moment, so a set is a few calls at different seeds and moments. The *before* for every later push is [`readability/before.jpg`](readability/before.jpg): seed 1, 15 s into a raid.

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

## The four layers, game-wide

No new biome art. After these four pushes, every biome shows the [four layers](art-direction.md#the-four-layers) apart, even before its world is redone.

### Push 3: threats above the grade
Enemy bullets go into the overlay pass, so bloom, split tone and the black lift stop flattening them. (The comment at `level-view.ts:132` says they are drawn there already; they aren't.) Tone down the ground under the lane: less bloom and saturation there, the richest colour at the edges.

- **Pass, screenshots:** a mid-fight set of every biome. Every enemy shot is found in a second.
- **Pass, bullet contrast:** the worst bullet in every biome clears the threshold (ΔE ≥ 0.2).
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

The first biome taken all the way. It is a canyon, so it settles the camera, walls, colliders, layout and foe placement, which every later biome reuses. [Its painting](art-direction/planets/kessra-red-mesa-run.png) is the reference for how clean and contrasted it should be.

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

### Push 10: the layout toolkit, and Red Mesa's layout
The [shared toolkit](#the-shared-toolkit) and the first biome layout on it, Red Mesa Run's [row](#each-biomes-layout). Today each chunk scatters props at random x, landmarks up to 26 wide included. Build the toolkit so a second, very different layout (Salt Pans or Tide Caves) fits it without changes: try it as a sketch before the push closes.

- **Pass, screenshots:** a set of twelve seeds, calm and mid-fight, in today's models. On every screen you can say why each group is where it is.
- **Pass, second layout:** a rough Salt Pans or Tide Caves layout on the same toolkit, in a strip and a few stills. It reads as a different place laid out by different rules.
- **Pass, clumping:** clearly below 1 (start at ≤ 0.7), against today's score of about 1.
- **Pass, open lane:** at least three ship widths on every screen.
- **Pass, budget:** no screen over its budget, and at most one landmark per screen.
- **Pass, seeds:** twelve seeds look like one family.
- **Pass, strip:** the level has visible bones, beats and breathers.

### Push 11: foes that belong where they are
Foes placed and moving by the layout: vehicles along the wash and the canyon tracks, turrets dug into the walls at the narrows and guarding the depot, fliers coming in over the rim. Any foe in the roster whose route the canyon lacks moves to a biome that has it.

- **Pass, screenshots:** a mid-fight set. Every foe's place and path makes sense from the still alone.
- **Pass, off-route:** zero, over every seed.
- **Pass, strip:** routes and the foes on them show in the strip.
- **Pass, hand and bench:** the fights still play well; hits don't go up.

### Push 12: Red Mesa Run's own look
The models and light. Codex paints the biome's pieces on flat grey from the in-flight angle and the side (cliff pieces, the broken arch, scrub, rock stacks, the depot dug into the wall), with the painting as a reference for grain, cleanness and contrast, not a model sheet to copy. They are modelled in Blender (`tools/models/`), with dusk light: only the tops lit, a warm key and a cool fill.

- **Pass, preview:** `just preview` of each model next to its sheet.
- **Pass, screenshots:** a full set (seeds, moments, the strip) passes every principle. Beside the painting it is as clean, as contrasted and as well grouped, in its own palette.
- **Pass, squint:** the thumbnail reads as Red Mesa next to every other biome's.
- **Pass, detail ratio:** at least the painting's lower bound, the lane calmer than the edges.
- **Pass, paint-over:** Codex repaints a still in the game's style without moving anything. What it changes is the to-do list, and the push is done when that list is small.
- **Re-run:** the checks from pushes 3, 6, 10 and 11.
- **Keep:** the final set's best still as `art-direction/planets/kessra-mesarun-game.png`.

## More biomes

Each push reuses pushes 7–11 and starts with its own layout: its row in [each biome's layout](#each-biomes-layout), written on the toolkit and judged on screenshots before any new art. Then its foes on its own routes, then its own light and palette. Each one runs pushes 10–12's checks, plus its own.

### Push 13: Glowcap Forest
An open field at night under a violet sky. The bones are wet hollows and the dry rises between them; caps grow in groups in the hollows at the sides and frame the lane. They glow down and brighten in a wave as you pass; tall caps carry the collider lip. Brood sacs root in the deepest hollows.

- **Pass, look-alikes:** zero, with every cap glowing.
- **Pass, saturation rule:** the acid-green brood sacs are the only saturated green, and the engine the only warm thing.

### Push 14: Titan Graveyard
Flat overcast and ash. The bones are the titans' fallen bodies; wrecks and scavenger camps gather round them, and one titan's hand frames the lane, its knuckles lipped. This is Khet's planet, so the sector comes together with its rebuilt Warden.

- **Pass, saturation:** the world's median saturation stays near grey. Only factions and the player are saturated.
- **Pass, budget:** the hand counts as the screen's one landmark.

## The foes

### Pushes 15–18: one faction each (scrap, lattice, wild, bloom)
Codex paints a sheet of the faction's foes from the in-flight angle, kept in [`art-direction/enemies/`](art-direction/enemies/), and the models are rebuilt from it. The faction is in the material and hue, the job in the shape ([shapes](art-direction.md#shapes)). Each foe's sheet says what ground it needs (water, road, wall, open sky) and how it moves along it.

- **Pass, silhouettes:** every foe as a black shape at 32 pixels. Each one is told apart from its faction's others.
- **Pass, ring:** a crisp one-texel dark ring on every foe, in Look on three biomes' grounds.
- **Pass, tells:** a clip of each foe's tell. Engines flare, lattice draws, beasts rear, bloom swells.
- **Pass, screenshots:** each foe in a mid-fight set on two biomes. It reads at once, and it sits where it belongs.

## Then: a planet at a time

Each planet is a push, all four biomes together, starting with Kessra, Mirefall, Ashgrave, then Glacis and Vesh. Each planet picks its own style and palette, and its sides can differ (a day side and a night side, a sea coast and an ice cap). Oru-Tal, Halcyon and Cinder have no paintings yet, so each starts by painting its four biomes and judging them against the questions in [AGENTS.md](../AGENTS.md).

- **Pass:** each biome's own layout, judged on screenshots first, then pushes 10–12's checks.
- **Pass, blind test:** thumbnails of the planet's four biomes, shuffled with two other planets' thumbnails. People sort them by planet.

The scripted moments and each planet's music stay with [biomes](backlog.md#7-biomes-places-worth-seeing).
