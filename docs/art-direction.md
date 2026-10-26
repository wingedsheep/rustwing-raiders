# Art direction

How Rustwing Raiders should look in flight: the image, light, colour, shapes, the world and the action. The cast, faction table and event art are in [style and characters](style-and-characters.md); how to paint art with Codex is in [making art with Codex](art-with-codex.md). The readability work this serves is item 1 of the [backlog](backlog.md), split into pushes in [readability](readability.md).

**Rust-punk frontier: a modern game in a retro jacket.** The machines are worn and hand-built. The world they fly through is huge, old, alive, and different on every planet. No one light or palette covers the game: each biome has its own sky, weather and time of day. What stays the same is the player, a small rust-and-cream ship that is always easy to find.

## The image

- **A fine pixel grain.** The scene renders small (one texel per art pixel) and is blown up with nearest-neighbour sampling (`src/render/pixel.ts`). It should look like a painting made on a pixel grid, not a 16×16 sprite game.
- **Banded toon light**: a few soft steps (lit, mid, shadow) that bleed into each other like wet paint. No smooth plastic gradients, no hard cel lines inside a shape.
- **Brushwork**: inside each band the colour wanders in strokes longer one way than the other.
- **Soft outlines** where depth jumps. Foes get a crisp one-texel dark ring, so they read on any ground.
- **Bloom only on light sources**: engines, lamps, lava, muzzle flash. Lit surfaces never bloom.
- **A split tone and a soft vignette** that pull the eye to the lane.
- **The camera** looks down from above, tilted back about 30° (`TILT` in `src/sim/types.ts`). It stays as it is.
- **Smooth scroll**: the camera moves in whole texels plus a sub-pixel shift, so the land glides without crawling.

## Light

- **Every biome has its own light.** Salt glare at noon, a violet moon-night, overcast ash, arctic dusk under an aurora, a pearl sea haze, lamp-light under ice, the glow of hot glass from below. You should know where you are from a thumbnail.
- **A key and a fill of different temperatures** in every frame, so there's depth even in flat weather.
- **Light has a source you can point to**: the sun, a gas giant, a moon, lava, lamps under the ice.
- **Cloud shadows** slide across the ground with the wind: big, soft and slow.

## Colour

- **Rust and cream belong to the player**: ships, shots, trails and the engine's warm glow. No enemy uses that family.
- **Faction hues belong to enemy fire**: scrap brass and flare red, lattice cyan and white, bloom violet and acid green, wild earth tones with one hot accent.
- **Pickups are salvage with a dark outline**, in shapes no bullet has: scrap is a blued-steel cog, a hex nut on a copper washer or an offcut of hazard-striped plate; a repair is a riveted dark patch with a glowing green +. Small and lit from within (their bright steel and copper glow), in a soft halo of their own light: loot that shines, not a bullet's hard glow. They bob and turn; they never streak (a magnet's pull spins them up).
- **Colliders have one look**: dark faces, a lit cream lip along the top, a bold dark outline. A prop you'd hit wears a cream band ringed in dark at the height you fly, its collider's true size, showing through a cap or crown over it. If it has a lip or a band, you'll hit it; nothing without one is solid. Laser gates are white-hot cores with a dark edge, not scrap red.
- **The lane sits at mid-value and mid-saturation.** The richest colour is at the screen's edges and on the horizon. The most saturated things on screen are always enemy fire.
- **Each planet has a palette you could name blind**, and its four biomes vary it without breaking it. A planet's sides can have styles of their own (a day side and a night side, a coast and an ice cap).

## The four layers

Every frame splits into four layers you can tell apart in under a second:

1. **The world**: painted and muted under the lane, with the bloom, grade and vignette.
2. **Walls and solid things**: the collider look.
3. **Danger**: unlit, saturated, with a near-black rim, drawn above the grade. The world is painted; the danger isn't.
4. **What's yours**: rust and cream, plus the salvage pickups.

Nothing ambient may look like a bullet. Spores, embers, pollen, ash and glints stay below the flight plane, dimmer, bigger and softer than any shot, and drift with the ground. They thin out while a fight is on.

**The test**: grey out the world. What's left at full contrast (threats, pickups, lips and your ship) must show at once where you can fly, what will hurt you and what you can take.

## Materials

- **The used universe**: mismatched panels, primer patches, scorch marks round exhausts, weld seams, chunky rivets, repairs on repairs. Wear shows where the hot parts are and where hands grab.
- **Lattice is the exception**: clean white ceramic, glass and hard-light, perfectly symmetric. It's the only new-looking thing in the frontier, and that's what makes it threatening. Copies (the Compact's, Vantorr's) show their seams and bolts.
- **Chunky detail**: thick plates, heavy panel lines and big bolts that survive the pixel grain. No fine greebling.

## Shapes

- **Silhouette first**: every foe reads as a black shape at 32 pixels from the tilted camera above.
- **The faction is in the material and hue; the job is in the shape.**
  - Scrap: asymmetric, bolted-on, forward-leaning.
  - Lattice: symmetric hexes, rings and gates.
  - Wild: curves, crouches and tails.
  - Bloom: swelling, clustered and dripping.
- **Ships stay spacecraft**: a frame with an animal's name is still hardware. No feathered wings, teeth or stingers.
- **Enemies are craft, vehicles or alien grown things** that could fight a ship. Plain animals are fauna. Giants are welcome.
- **Creatures are alien and plausible**, never Earth animals in space. Materials are "glass-like", never literal glass.
- **Nothing borrowed**: no TIE or X-wing shapes, no hooded glowing eyes, no Earth insignia.

## Tells and deaths

- **The tell is in the body as well as the flat marker**:
  - scrap engines **flare** red and belch smoke;
  - lattice machines **draw** the whole attack in light a full second first, with a click;
  - beasts **rear**, and their shadow falls where they'll land;
  - bloom **swells** and pulses faster.
- **Deaths fit the body**:
  - machines break up into plates and burning parts;
  - lattice shatters into white shards, its light collapsing to a point;
  - beasts fall and crash into the ground;
  - bloom bursts into a spore cloud.
- **Bosses change how they look by phase**: a phase sheds or reveals parts (Vask's cage, the Engine's ice, Khet's scrap, ARU-0's company hull), so you can see the fight's story from a still. Per-enemy and per-boss looks: [enemies](enemies/README.md), [bosses](bosses/README.md).

## Scale and height

- **The world is big and you are small.**
- **Height must read**: anything you fly under is clearly higher than you, lit from the side, and casts a band of shadow on the ground. An object's size matches its layer.
- **No foliage in the sky.** The high parallax layer is haze, cloud, moons and planets.
- **Ground cover, mid props, rare heroes**, several species each, so no planet looks copy-pasted. Props fit their planet.
- **Props are beautiful and make the biome its own**: each biome has props you won't see anywhere else, worth looking at up close. Anything a biome needs is modelled in Blender (`tools/models/`); never make do with another biome's props or generic ones.
- **Big shapes and small details, balanced**: a few large forms give each screen its shape, mid-sized groups frame the lane, and small details gather round the big forms. Never all crumbs, all blocks, or one size everywhere. This balance is a big part of what makes a level look great.
- **Composed, not scattered**: groups along the canyon edges and the field's sides frame a clear lane. One hero landmark per screen at most, at a chosen beat.

## Levels and placement

The game comes first: a level must show at once what you'll hit and what will hurt you, however beautiful its planet.

- **Designed, not strewn**: a level is laid out from its bones (walls, rivers, roads, ridges, craters, coasts) and everything is placed by them. You should be able to say why each group is where it is. Each biome has its own layout algorithm, because a canyon, a salt flat and a reef aren't built by the same rules. How the layouts are built: [laying out a level](level-design.md#laying-out-a-level).
- **Foes fit the ground**: a boat follows the waterways, an armoured car keeps to a road, a turret sits where someone would build one (on a wall, at a choke, guarding a bridge or a depot). A biome without the route doesn't have the foe.
- **Checked by looking**: every change to a planet is judged on many screenshots (several seeds, calm and mid-fight, the whole strip), not one good frame. Looking good in the screenshots weighs more than any metric or rule in this document. The loop is in [level design](level-design.md#checking-a-level-screenshots-many-of-them).
- **Hazards fly in, they never pop in.**

## A living world

- **Wind** rolls across the land in visible gusts. Plant tops swing downwind, and a ship flying low flattens what's under it (`src/render/alive.ts`).
- **Water moves**: waves, tide lines, foam, the sky's colour in it. Lava crawls, ice steams.
- **Life at ground level** goes on with its own business as you pass: herds, crawlers, beetles.
- **Scripted moments**, one or two per biome: a titan walking past in the far parallax, drift-calves climbing out of the haze, Engine City's lamps waking under the ice, a bell under the Drowned Temple's water.

## Juice

- **Every action has a flash, a kick, shake, debris and its own sound.** Firing kicks the ship and lights the muzzle. A hit flashes white for a frame (bosses only glint). A kill breaks into chunks of the foe's own plating, which tumble, smoke and burn on the ground.
- **Layered explosions**: a white-hot core, a fireball, rolling dark smoke, sparks in arcs, a shockwave ring on the ground that blows the plants flat.
- **Shake and shoves** for weight: a jitter for hits, a directional shove that springs back for blasts. No hitstop: co-op pilots share a clock.
- **Wrecks stay** on the ground while they scroll past, smoking and lit by their own fire.
- **A wall scrape** is a shower of sparks along the lip and a slide, not a bounce.

## HUD

- **Full-screen with a slim HUD**: small panels in the corners, never a frame round the field.
- **The HUD wears the retro jacket hardest**: chunky upper-case pixel type on small dark plates with a rust or cream trim, like stencils on a dashboard. Plain words ("NEEDS 15 SCRAP").
- **Pop text** in the world is short, in the speaker's colour, and gone quickly.
- **In co-op**, each pilot's numbers sit by their own plate.

## Event and key art

640×360 painted scenes in the same grain, quantised to the same palette, so events and flight feel like one game. The composition, light and prompt skeleton are in [style and characters §5](style-and-characters.md#5-event-art-direction).

## Target screenshots

The paintings in [`art-direction/planets/`](art-direction/planets/) show the style, cleanness, contrast, grouping and sizes we want. They are a reference, not a spec: a biome doesn't have to copy its painting's palette, props or layout, and a generated level never will. It passes when its screenshots read as cleanly as the painting does. One line each:

| Planet | Biome | Light | What the shot shows |
|---|---|---|---|
| Kessra | The Salt Pans | noon glare, white sky | salt pillars in clusters with cornflower shadows; brass skimmers and black-rimmed red slugs reading like ink on paper |
| Kessra | Red Mesa Run | dusk, light only on the tops | rust cliffs standing up with a hot lit lip; a broken arch's shadow banding the floor; a gun dug into the wall |
| Mirefall | Glowcap Forest | violet night under the gas giant | caps in two clusters, glowing down and brightening in a wave as you pass; acid-green brood sacs; the warm engine the only warm thing |
| Mirefall | Spore Vents | grey-green fog, no direction | vents glow and bulge before each spore column rises like smoke |
| Glacis | Aurora Shelf | blue dusk, a moving aurora | ice spires in threes and fives; white hex drones; your cream shots the only fire for miles |
| Glacis | Engine City | night, light from under the ice | amber districts switching on below frosted ice; a humming white laser gate |
| Ashgrave | Titan Graveyard | flat overcast, falling ash | one titan's hand framing the lane, its knuckles lipped; an almost monochrome frame where only factions and the player are saturated |
| Ashgrave | Glass Craters | black sky, light from the ground | crater floors glowing like embers, kept down under the lane |
| Vesh | Calving Haze | pearl haze, a soft sun | drift-calves gliding under you in the mist; Court skiffs firing harpoon bolts |
| Vesh | Tide Caves | green-blue light from above | close purple reef walls with wet lips; light rippling on the rock |
