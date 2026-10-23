# Backlog

The goal for now: **finish Act I.** The three-sector run, complete and tight: a screen you can read at a glance, stages you want to fly again, every Warden fighting its own fight, the arsenal's first new guns, and every biome a place you came to see. Act II stays a design ([endgame](endgame.md)).

Done work is deleted from here; git and the design docs keep the record.

## Now

### 1. Readability: what can hurt you, what you can take
The most important point from playtesting. The screen is crowded and low on contrast, and players can't tell enemy fire, pickups and things you crash into apart. The fix, and the look of the paintings in [`art-direction/planets/`](art-direction/planets/), come in small pushes, each finished and checked on its own before the next: [readability](readability.md).
- **The four layers, game-wide** (3–6): threats above the grade, the colour contract, pickups by shape, nothing ambient like a bullet.
- **Red Mesa Run, piece by piece** (7–11): the camera, walls, colliders, composed props, then the biome like its painting.
- **More biomes, the foes, then a planet at a time** (12 on).

### 2. Shmup stages are the game
Plain fly-and-shoot stages, with the feel of Raptor and Baryon, should be by far the biggest part of the game. Escorts and heists are spice.

**Problem.** Today raid and hunt are only 44–49% of planet sites, escort and heist about 22%, and each sector has about 7 events. A route is about 4 stops on a sector's fuel, and plays only 1–2 plain fights. Those fights also don't vary much: every raid is the director's procedural waves and differs only in danger pips, elite and reward.

**Change.**
- **Reweight the chart** (`make` in `src/sim/chart.ts`): raids and hunts make up about 75% of planet sites. At most one escort or heist per sector, and fewer drifting events, so a route is mostly flying.
- **A stage shape**: build-up, peak, breather, peak, with a mid-stage elite set piece.
- **Faction formations**: each faction flies its own patterns, so how they come at you says who they are.
- **Terrain set pieces**: a canyon run, a span to break, guns dug into the cliffs.
- **Ground targets to strafe**: emplacements, depots and masts that blow up with debris and pay scrap. A FUEL DEPOT or LISTENING POST raid should play like one; today they are only names.

Borrow those games' feel, not their mechanics: build from Rustwing's verbs.

**Done when** about 3 of a route's ~4 stops are plain fights (check by rolling the chart over many seeds), and two raids on the same planet are easy to tell apart.

**Order.** The reweight is a small change to the weights table: ship it first and playtest. Then stage shape and formations, then terrain and ground targets. Decide on length (~100 s today) last, once the stages are richer.

### 3. Co-op jumpstart: obvious and loud
Players like reviving each other, but they don't see that they can, and the moment is flat.
- **Bug:** `hud.ts:574` keeps showing `DOWN! PARTNER: FLY CLOSE` after the 20 s run out and the ship has crashed (`p.down` stays set with `p.out`). It should say it's out.
- **Show the reach.** A pulsing ring at `JUMP_REACH` around the downed ship, in the overlay, and a countdown for `JUMP_WAIT` like the one boarding has.
- **Tell the one who has to act.** A `P2 DOWN: FLY TO THEM` banner by the healthy pilot, shown large the first time in a run.
- **Charging.** In reach, current arcs between the two ships, a ring fills, and a rising hum plays. As the timer runs low, the beeps quicken.
- **The jolt.** A flash, a shockwave that clears the nearby bullets, the engines relighting in a burst, and a `JUMPSTART!` pop with the grease the reviver earns. Use boarding's own `revive` sound instead of `shield_up`.

### 4. Boss rebuilds
Three Wardens still fight the old fight. Take them one at a time to a full score (personality, dance, model, animation, music: see [what a finished boss has](bosses/README.md#what-a-finished-boss-has)), and fly each by hand before moving on.
- **Warlord Khet** (Ashgrave): rebuilt; fly it by hand before moving on (does the false tell read, is the Glassing's way through clear, is going round the Kneel the answer) ([khet](bosses/khet.md)).
- **Harbourmaster Oko** (Halcyon): the three phases, the record, the paint off, *Patience* ([oko](bosses/oko.md)).
- **The Sandking** (Kessra): THE PRICE, a haggle under fire, in place of the Vote ([sandking](bosses/sandking.md)).
- **The Mother-of-Spores** (Mirefall): her pods' Hold and the Lines; her dance needs the most work ([mother-of-spores](bosses/mother-of-spores.md)).
- **Glacis comes last**: never in the first sector, always the third sector's Warden when it's in a run (`make` in `src/sim/chart.ts`).

### 5. Arsenal: the first slice
Already under way on the forge's bench (`src/game/lab-parts.ts`, `src/sim/arsenal.ts`). Finish the slice from [the arsenal](parts-variety.md#a-first-slice), then decide the rest.
- CHILL and FROZEN, in the loot pool.
- The gun rolls RAPID, HEAVY, WIDE, SEEKING: each a trade, changing how the gun fires.
- Frost Sprayer, Charge Cannon, Saw Launcher out of the forge and into `PARTS`, with models and cards.
- Bench them with the autopilot against every frame.
- Then answer the draft's open questions: the roster's size, and whether rolls replace the flat damage and rate mods.

## Next

### 6. Say what things do
Event outcomes, keywords (INFO button), first-time intros, the core's guide and gun loops on cards are in. What's left:
- **Keywords on the results and dealer cards** (`results.ts`, `stops.ts`): the INFO panel is on events, the hangar and the core only.
- **An intro for the first graft** (`wreck.ts`).
- **A loop for the AUX and SPECIAL**, as the guns have (`ui/gun-loop.ts`), and boosters lighting the guns they touch.
- **Count the layers.** A player meets about a dozen build systems (frames, grid, hardpoints, links, load, edges, marks, tiers and affixes, kit, grafts and bonds, the core's veins and imprints). Decide which ones Act I really needs before teaching all of them.

### 7. Biomes: places worth seeing
Every biome should feel like discovering somewhere new: its own look, its own life, its own light. Hollow Knight and Silksong are the bar.
- Every pass follows the readability rules (1): scenery frames the lane, it never fills it.
- The look of each planet comes in the [readability](readability.md) pushes, a planet at a time.
- **Scripted moments**: one or two rare set pieces per biome that make it memorable. A titan walking past in the Titan Graveyard, drift-calves letting their gas go and climbing out of the Calving Haze, the Stormwall lighting up, Engine City's lamps waking, a temple bell under the Drowned Temple's water.
- Each planet a theme of its own voice (only Oru-Tal's boss has one).

### 8. What every boss still lacks
From [bosses](bosses/README.md#across-the-run-designed-not-built), once the four are rebuilt:
- Their own themes (four share the one `boss` track) and their own horns.
- Poses for every boss (only Vask, the Engine, Istra and ARU-0 have them).
- How each one goes: none of them explodes (a per-boss end in `level.ts`).
- A line as each comes and goes, and read lines that change by phase.
- Moves on the beat timed by the music, not the sim.
- Barks from `tools/voices/` for the bosses with people aboard.

## Later

- **Run-wide bosses**: Captain Quist, the rival met three times ([quist](bosses/quist.md)); Sweepwright Imre when the Sweep catches you ([sweep](bosses/sweep.md)); *Evenhand* ([evenhand](bosses/evenhand.md)); Weight-Captain Orrel at the Throat ([orrel](bosses/orrel.md)).
- A second signature for each boss's last phase; a boss rush or rematch event.
- The rest of the arsenal, once the first slice is judged.
- Grafts from the remaining elites; a second agreement per vein; imprints from the derelict, the refugees and the customs cutter.
- Parts that play on edges (a second edge, a frame whose dash always strikes) and on the load class (a dash mod that only works NIMBLE, armour that's better OVERLOADED).
- Enemies from the lore: each scrap power's own foe, lattice foes that listen to the Engine, woken elites that yield, the Port Authority's navy under the customs paint.
- The Rook's own model; field-guide tips for darts, gunships and bombers.
- Planet-specific events.
