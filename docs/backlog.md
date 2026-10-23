# Backlog

The goal for now: **finish Act I.** The three-sector run, complete and tight: every Warden fights its own fight, the arsenal has its first new guns, and every biome feels like a place you came to see. Act II stays a design ([endgame](endgame.md)).

Done work is deleted from here; git and the design docs keep the record.

## Now

### 1. Boss rebuilds
Four Wardens still fight the old fight. Take them one at a time to a full score (personality, dance, model, animation, music: see [what a finished boss has](bosses/README.md#what-a-finished-boss-has)), and fly each by hand before moving on.
- **Warlord Khet** (Ashgrave): the false tell, and *Unbending*'s phase as a Compact war machine ([khet](bosses/khet.md)).
- **Harbourmaster Oko** (Halcyon): the three phases, the record, the paint off, *Patience* ([oko](bosses/oko.md)).
- **The Sandking** (Kessra): THE PRICE, a haggle under fire, in place of the Vote ([sandking](bosses/sandking.md)).
- **The Mother-of-Spores** (Mirefall): her pods' Hold and the Lines; her dance needs the most work ([mother-of-spores](bosses/mother-of-spores.md)).
- **Glacis comes last**: never in the first sector, always the third sector's Warden when it's in a run (`make` in `src/sim/chart.ts`).

### 2. Arsenal: the first slice
Already under way on the forge's bench (`src/game/lab-parts.ts`, `src/sim/arsenal.ts`). Finish the slice from [the arsenal](parts-variety.md#a-first-slice), then decide the rest.
- CHILL and FROZEN, in the loot pool.
- The gun rolls RAPID, HEAVY, WIDE, SEEKING: each a trade, changing how the gun fires.
- Frost Sprayer, Charge Cannon, Saw Launcher out of the forge and into `PARTS`, with models and cards.
- Bench them with the autopilot against every frame.
- Then answer the draft's open questions: the roster's size, and whether rolls replace the flat damage and rate mods.

## Next

### 3. Biomes: places worth seeing
Every biome should feel like discovering somewhere new: its own look, its own life, its own light. Hollow Knight and Silksong are the bar.
- A pass per planet, all four biomes together, so each one is unmistakably itself (Fernwood Basin to Tailings Lake). Start with the planets whose Warden is being rebuilt, so a sector is finished whole.
- **Scripted moments**: one or two rare set pieces per biome that make it memorable. A titan walking past in the Titan Graveyard, drift-calves letting their gas go and climbing out of the Calving Haze, the Stormwall lighting up, Engine City's lamps waking, a temple bell under the Drowned Temple's water.
- Each planet a theme of its own voice (only Oru-Tal's boss has one).

### 4. What every boss still lacks
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
