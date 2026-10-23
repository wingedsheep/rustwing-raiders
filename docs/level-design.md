# Level design

The rules for laying out a level: read these before working on the level generator (`src/sim/layout.ts`, `src/sim/layouts/`, `src/sim/terrain.ts`) or on a biome's levels. How the work is split into pushes, and the checks and tools that measure it, are in [readability](readability.md). How the world should look is in the [art direction](art-direction.md).

## The rules

**A level must play clearly and look great, both, always.** A screen that reads but looks dull isn't done, and neither is a beautiful one you can't read. How it looks in the screenshots outweighs every metric and guideline: the numbers help find problems, they don't decide. If the screenshots look good and a number fails, question the number. If every number passes and the screenshots look wrong, it isn't done.

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
7. **Big shapes and small details, balanced.** A good screen has a few large forms (a cliff, a titan's hand, a crater, a cap tree) that give it its shape, mid-sized groups that frame the lane, and small details gathered round them that give texture up close. All small things look like noise; all big things look empty and blocky; the same size everywhere looks like a pattern. The big forms are placed first and the details follow them (rubble at a cliff's foot, shards round a crater's rim), never sprinkled evenly. This is one of the main things that makes a level look great.
8. **Props are beautiful, and make the biome its own.** Every prop is worth looking at, and the props are much of what makes a biome feel unique and interesting to explore: shapes, materials and life you won't see on any other planet. A biome never makes do with another biome's props or with generic rocks and trees. If a layout needs something that doesn't exist (a jetty, a road, a fallen titan's rib, a vent cone, a better cliff piece), model it (see [modelling props](#modelling-props)). A model isn't done when it builds.
9. **Effects and details bring it alive.** Add what makes a place feel lived in and worth flying through: dust blowing off a ridge, spray where water breaks on rock, steam from a vent, glow pulsing in the hollows, embers drifting from a burning wreck, light shafts through a gap, birds or drifters lifting as you pass. Like props, they belong to the place (steam at the vents, not everywhere), stay in the screen's budget, and never look like enemy fire or a pickup: small, bright, saturated specks are reserved for danger.

## What the paintings are for

The paintings in [`art-direction/planets/`](art-direction/planets/) are a reference, not a target to copy. Take from them:

- **the graphical style**: the pixel grain, the banded light, the brushwork;
- **the cleanness**: a calm lane, busy edges, nothing in the frame that doesn't need to be there;
- **the contrast**: danger, walls and your ship stand out from the world at once;
- **the grouping, placement and sizes** of things: props in groups that frame the lane, a few big things rather than many small ones, objects sized to their layer.

Don't copy their palettes, props or layouts one to one. Each planet gets its own style and palette, and so can each side of a planet. The levels are generated, so no frame will ever match a painting anyway. A biome passes when its screenshots read as cleanly as the paintings do, and look as good, not when they look like them.

## Laying out a level

**The level generator is one of the most important things to get right.** Good art on a random layout still looks like clutter; a well laid-out level reads even in plain grey. Placement comes from algorithms that build the level the way the place would have formed or been built, never from scattering props at random x.

**Each biome has its own layout.** A canyon, a salt flat, a reef and a buried city aren't the same algorithm with different props: they grow different bones, group things by different rules and give foes different routes. The layouts are built on a shared toolkit (`src/sim/layout.ts`), one per biome in `src/sim/layouts/`. A biome without a layout yet still falls back to the old generator, which differs only in its terrain `shape` and prop weights (`src/world/planets.ts`, `src/sim/terrain.ts`).

### The shared toolkit

Every biome's layout runs the same steps, in order, but each step is its own per biome:

1. **The bones**: the big features first. Canyon walls, a river and its banks, a road or a rail line, ridges, craters, a coast, a fault, a street grid. They run with the scroll and give the level its beats.
2. **The lane**: the open space the ship flies through, kept at least three ship widths wide, opened and narrowed on purpose.
3. **Groups along the bones, big to small**: the large forms go down first, then mid-sized groups, then the small details round them. Props cluster where the features say they would (reeds on the banks, rubble under the cliffs, wrecks along the road, caps in the wet hollows), at the sides of the lane, framing it. Each biome sets its own mix of sizes. There's no cap on how much goes on a screen: how it looks decides, and performance is made to work round it.
4. **Landmarks at chosen beats**: at most one per screen, where the level turns or opens.
5. **Foes on the features they need**: route-bound foes are only spawned where their route exists, and follow it (boats on the water, vehicles on the road). Turrets are placed at the spots the bones make worth guarding. Free fliers fill the rest.
6. **Breathers**: stretches with little scenery and no fire, so the busy parts read as busy.
7. **Effects and life**: the ambient effects and moving details that belong to the bones (spray on the banks, steam on the faults, dust on the ridges), within the budget.

The toolkit gives the shared parts (a route the sim can follow, other lines to group along, a lane carved through the bones, groups whose details settle round what's already down, big-to-small placement, the beat clock, the place's effects). The layout gives the rules. A foe whose route a biome lacks isn't in that biome's roster.

**No two levels of a biome alike.** A layout doesn't shuffle the same beats into the same frame every time: each level of a biome should feel different to fly through. The Salt Pans pick a season and three grounds of six, each grown by its own bones, so one crossing is a slalom through the buckle into the works' ponds, and the next is an open sheet of brine with islands of crust and a buried hall.

**A stretch is a whole place, with a way in and a way out.** It opens and closes on beats of its own, so it reads as somewhere you flew through, not a cut from an endless strip: Red Mesa Run, the old race course, starts under its start gantry and ends under the finish. Its features fit the stretch they have: one that doesn't fit gives way to one that does, rather than to a plain run.

### Each biome's layout

A first idea for each painted biome, to be tried in screenshots and changed. Every other biome writes its row before its layout is built.

| Biome | Bones | Groups | Routes and posts | Beats |
|---|---|---|---|---|
| Salt Pans | a white table with no relief, so its shapes are drawn on it: the crust's polygon net of pressure ridges, a fault with brine eyes on it, the caravan track. A crossing, shore to shore, through three grounds, each with bones of its own: plates (the open net), the buckle (rows of ridges across the pan), eyes, the spice-salt works (ponds of uneven shape, heaped dykes, sluices between them; painted in `docs/art-direction/planets/kessra-salt-works.png`), the sheet (the low pan flooded) and the Kehx hall (a buried counting-house). A season per level: dry, wet or flooded | salt stacks where brine wells up: at the net's junctions, in rows on the buckle's ridges, round the eyes; cones raked in rows on the works' harvested pans; vents in ranks over the hall; the caravans' wrecks on the track; salt flakes blowing off the ridges | trucks on the track and the works' causeway; guns at the cartel's toll where the track breaks the buckle, at the works' gate | in off one shore, out on the other; a raided caravan burning; a stranded hauler; the leviathan's bones; long bright breathers of bare plates |
| Red Mesa Run | the old race course: a winding gorge, its stepped walls, a dry wash on the floor, the racing line's ruts; open mesa country between | fallen blocks heaped at the cliffs' feet with scree and scrub round them, scrub along the wash, hoodoo stands, tyre walls round the wash's bends | vehicles in the wash and on the depot's track; guns on the ledges at the narrows, guarding the depot, on a butte's skirt | in under the start gantry, out under the finish; the broken arch; the depot in the wall; narrows, a bowl, a split round a butte |
| Glowcap Forest | grown, not formed: one organism (the bloom, the Tonkva's mould gone wild) laid out the way mould grows, lit from within at night under the violet giant. A night's flight, in over the mire's edge and out through the mother ring, through three grounds of six, each grown by its own rule: rings (fairy rings spreading out from where a spore fell, broken into arcs where they're old, cut off where two meet, the moss dead inside and lush on the band), the hollows (a chain of dark pools the lane runs over, rises between), the stand (old growth: tower-caps you'd hit, an aisle wandering between them), the windfall (a stand the wind felled, its rotted stalks marked by rows of young caps all lying the one way, one still whole across the field), the straightening (the Waking: the bloom planting itself in an exact hex lattice, the same cap over and over turned the same way, fraying back to the wild at its edges) and the wreck (the *Tamsin Lowe*'s crash furrow, straight through the forest, the hull the Choir speaks from at its end). The mire's level per level: a dry spell, wet, or flooded (the rings and stalks standing in black water) | caps where the mould fruits: on the rings' bands, round the pools' margins at the sides, young caps at the tower-caps' feet, along the rotted stalks, one to a cell in the lattice, regrowth in the furrow; puffballs on the rot; spores drifting off the caps | spitter pods rooted on the rings' bands either side of the lane's gap, by the pools, in the lattice in matched pairs, round the wreck | in over the mire's edge, out through the mother ring (tower-caps round a bare floor); the wreck; a fallen tower-cap across the aisle; clearings between |
| Bluepalm Oasis | water brought to the desert, and everything gathered round it: the one place on Kessra where the iron sand is green and blue, and every line of it follows the water. A caravan's arrival, in over the erg along the qanats and out over the dunes on the far side, through three grounds of six, each with bones of its own: the qanats (shaft mounds in dotted lines converging on the oasis across the dunes, sand fences in rows on the windward side), the springs (a chain of turquoise pools, one mother pool, reeds on the sheltered banks, salt-white beaches, a noria lifting water into a channel), the palmery (the main channel down the middle, side channels branching off it in a herringbone, bunded plots between them: walled orchards of bluecrowns planted in rows, crop strips, flooded basins, fallow), the market (Bluepalm itself: a street between rows of stalls, alleys off it, a square with the windcatcher cistern, mud houses behind, the caravanserai), the camp (caravans drawn up in rings round their fires, striders in lines, the cartel's tax tent) and the dry garden (a palmery whose qanat failed: dead crowns in their rows, dry channels, the dunes coming in over the bunds). The water per level: a low year (the pools shrunk inside white rings, the side channels dry), a full one, or a flood (the basins under water, the pools brimming) | bluecrowns in rows in the orchards, in twos and threes on the pools' banks; reeds in arcs at the waterline, mat on the beaches; crops in strips; stalls facing the street, houses behind them; tents round each fire; shafts every few metres down a qanat line | trucks on the caravan road, down the market street and beside the main channel; guns on the dovecotes at the garden corners, at the market's gates, by the noria, at the tax tent | in over the qanats, out over the dunes past the sand fences; the windcatcher in the square; the caravanserai; the noria; the aqueduct over the road; open dunes between the grounds |
| Spore Vents | a field of vent lines along buried faults | vents in rows on the faults, growth thickest round them | grown things root by the vents; fliers come out of the fog | a vent column; a dead quiet stretch |
| Aurora Shelf | a shelf edge and its crevasses | ice spires in threes and fives on the ridges | sledges on the shelf road; pylons on the ridges | a calving face; open ice |
| Engine City | a buried street grid under the ice | districts in blocks along the streets, lit from below | ground units on the streets; guns at junctions and gates | a laser gate across an avenue; a dark district |
| Titan Graveyard | the titans' fallen bodies | wrecks and scavenger camps round the bodies | crawlers along the spines; guns on the ribs | one titan's hand framing the lane |
| Glass Craters | crater rims and floors | glass shards on the rims, the floors glowing | rollers round the rims; emplacements on the high rims | a big crater to cross |
| Calving Haze | no ground, a haze sea in layers | drift-calves in herds below, cloud banks at the sides | skiffs along wind lanes; harpoon posts on the floating rocks | a calf rising past |
| Tide Caves | close reef walls and channels between them | wet growth on the lips, shell beds in the shallows | boats in the channels; guns in the cave mouths | a flooded hall; a narrows |

### Layout first, art after

Each biome's layout is built and judged before its full new look. Its screenshots (in today's models plus whatever the layout needed modelled, and in the grey frame and the strip) must already read as a designed place: clear bones, grouped props, an open lane, foes on their routes. New models on a bad layout don't fix it.

## Modelling props

Model whatever a biome needs to look great and be its own: its big forms, the pieces its bones are made of, the props that frame its lane, the small details that gather round them. Use of the Blender MCP (`mcp__blender__*`) is encouraged: build and shape a prop in the live Blender with `execute_blender_code`, see it with `look`, and iterate until it's beautiful. Keep the result as a script in `tools/models/` (the brief is [`tools/models/ART.md`](../tools/models/ART.md)), so it builds with `just models <module>` like every other model. For new art, paint the target first ([AGENTS.md](../AGENTS.md)).

Where it works better, generate props procedurally instead of shaping each one by hand. This suits kinds that need a lot of variety, like rocks, trees, shards, coral or rubble: a seeded generator in a `tools/models/` script can make many variants that differ in shape, not just size, so a field never looks like one rock repeated. It can also run in the game itself (`src/view/`) when a prop has to fit the layout it sits in, like a ridge that follows the bones or growth along a bank. Procedural props follow the same brief as hand-made ones (chunky, faceted, the biome's own palette), and they're judged the same way.

Then check it and refine it: look at it in `just preview <module>` and in game screenshots, fix what's off, rebuild and look again, until it's right.

## Checking a level: screenshots, many of them

Looking is the main check, and it wins over every other. While working on a level, take many screenshots, look at every one, and fix what fails before going on. The numbers and tools ([the checks](readability.md#the-checks)) help find problems; they don't replace looking, and passing them doesn't make a level good.

1. **Take a set** with `just look` ([tools](readability.md#tools)): several seeds, several moments (calm flight, mid-fight, a landmark, a breather, the boss's approach), and the whole level as a strip. One good frame proves nothing; a dozen bad ones are easy to miss without a set.
2. **Look at each one against the rules**, and write down what fails:
   - Does it look great? Would you stop to look at it?
   - Where can I fly? What will I hit? Is any solid thing hard to see, or any harmless thing easy to mistake for solid?
   - What will hurt me? Can I find every enemy shot in a second? Does anything else look like one?
   - Does the placement make sense? Could I say why each group is where it is? Does any screen look like a random scatter, or a clutter?
   - Do the foes fit the ground? Boats on water, cars on roads, turrets where they guard something?
   - Are big shapes and small details balanced? Does each screen have a few large forms giving it shape, with the details gathered round them, or is it all crumbs, all blocks, or one size everywhere?
   - Is it this planet, and nowhere else? Is it alive? Are the props worth looking at, and could they only be from here? What effect or detail would make it better?
   - Beside a painting: is it as clean, as contrasted and as well grouped, even though it looks different?
3. **Fix, then shoot the set again** at the same seeds and moments, so before and after sit side by side.
4. **Repeat until the list is empty.** Then fly it by hand and run the bench.

A level isn't done until its last set of screenshots has been looked at and passes.
