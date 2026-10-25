# Backlog

The goal for now: **one run that feels absolutely perfect, then the next.** Flying stages, picking up parts, making a build, fighting Wardens, and every one of those done really well. A run is a fixed seed, polished build by build: you play it, the flight recorder logs it, and the logs say what to tune next ([one run at a time](simple-run.md#one-run-at-a-time)). The design is in [the simple run](simple-run.md). Act II stays a design ([endgame](endgame.md)).

Done work is deleted from here; git and the design docs keep the record.

## Now

### 1. The flight recorder: the first run by hand
The recorder is in ([how to use it](simple-run.md#how-it-gets-to-me)). What's left:
- **Fly one run by hand** on the dev server, and read its report together.
- **Part drops in flight** still roll from the stage's own dice, so they change with how you fly. The site rewards of the first slice (2) are rolled from the site's seed, so the same run offers the same rewards.

**Done when** one run, played by hand, gives a report that answers: where did I die, what hurt me, what did I pick, and which buttons did I never press?

### 2. The simple run: first slice
Get to something you can play. Unhook what goes, but don't delete it yet.
- **The chart**: keep the orbiting solar system. A sector is five stops, then the gate; each jump still turns the planets.
  - Site kinds are stage, elite stage and dealer, and every site shows its reward.
  - Drop fuel, the Sweep, danger pips, markets, intel, events, escorts, heists and boarding from the run (`src/sim/chart.ts`, `src/sim/run.ts`, `src/game/flow.ts`).
- **Rewards, one of three**: PART, GRAFT (from the faction you just fought), REFIT, SCRAP, REPAIR.
  - Rarity odds are by site, with the bad-luck build-up ([the table](simple-run.md#good-rewards-anywhere-better-from-elites-and-wardens)).
  - Grafts come with the results; the wreck screen and the core screen leave the flow.
- **The dealer**: three parts, a refit, a repair, a reroll, selling. One cast member per sector, with a line or two.
- **Staying alive**: one hull bar carried over, the Weld, REPAIR, the dealer, and a big repair after a Warden. Drop the shield, the +20 a level, and the run's affairs (debt, policy, bounty, reputation, favours, passengers, contracts, markets, cargo).
- **The core** stays in the fiction only. Veins, knots, imprints, waking and the Engine's call are switched off.

**Done when** a full three-sector run plays from title to ending with only stages, rewards, dealers and Wardens, solo and in local co-op.

### 3. Run 1, until it's perfect
Pick the seed together: one frame, three planets, three Wardens. Then loop:
- **A build with a note**: what changed, and what to watch.
- **You fly it**, as often as you like.
- **I read the reports and replays**, and tune.
- **Pull in work from Next only when run 1 needs it**: the wave cards for its stages, the scaling for its builds, the Silksong pass for its Wardens, the readability and looks of its biomes.
- Answer [the open questions](simple-run.md#open-questions) from what the runs show: the shield, five stages or four.
- Recalibrate the bench's verdict bands so the autopilot's hull loss tracks yours.

**Done when** you say it's perfect: every stage and Warden rated fun, nothing rated unfair, and hull lost and times to kill inside [the targets](simple-run.md#scaling-with-the-ships-power). Then run 2: a new seed that keeps what run 1 taught us. Every few builds, a random seed checks that the polish carries over.

### 4. Readability (ongoing)
The most important point from earlier playtests, and it still holds: players couldn't tell enemy fire, pickups and things you crash into apart. It keeps going in small pushes, as in [readability](readability.md), each judged on many screenshots against the [level design](level-design.md) rules. The pushes are: the level generator (8–11), every biome through it (12–19), then the look, the foes, and a planet at a time (20 on).

## Next

Pulled into the run being polished as it needs them.

### 5. Stages built from wave cards
See [stages that play well](simple-run.md#stages-that-play-well).
- **The stage shape**: intro, build-up, set piece, breather, peak, out. About 2½–3 minutes.
- **Wave cards** in the wave lab's `ScriptWave` format, each with a faction, foes, entry, what it tests, and a threat cost. Start with six to eight per faction.
- **The director draws cards** to a threat budget per beat (`src/sim/director.ts`). Harder cards unlock by sector.
- **One idea per stage**, from the biome.
- **A bullet cap** per sector.
- **Ground targets to strafe** in the breather: emplacements, depots and masts that blow up with debris and pay scrap.

**Done when** two stages on the same planet are easy to tell apart, and the recorder shows no stage where most of the hull is lost to one card.

### 6. Scaling to the ship's power
- **The expected build per stage**: the autopilot takes random picks from real reward offers over many seeds, and the bench measures each build's damage per second.
- **Enemy hull and Warden HP** set from the time-to-kill targets, replacing today's `hullGrowth` curve. Enemy damage barely scales.
- **A floor**: the dealer always offers a trigger gun when the build's damage falls below the band.
- Check against round 1's real builds.

### 7. The build, collapsed
See [the build, simplified](simple-run.md#the-build-simplified).
- **Loot the way Dead Cells does it** ([parts](simple-run.md#parts-loot-the-way-dead-cells-does-it)):
  - Each part has a level from where it dropped, and a rarity that sets its affixes and trait.
  - The flat mods go, and about eight affixes are kept, each a rule you can feel.
  - Every part card compares against the part it would replace, in green and red.
  - A REFIT keeps a favourite up to date.
- **The hangar, clearer** ([parts on the ship](simple-run.md#parts-on-the-ship-kept-made-clearer)):
  - Three rules: hardpoints, facing, touching.
  - A new part goes on in one press, at its best spot.
  - The ship fires while you place a part, and boosters light what they touch.
  - Every part shows on the ship in flight and grows with its level.
- **Remove** links, load classes, edges, arsenal states and the kit as a layer. Good kit pieces become parts.
- **The arsenal's first slice**: Frost Sprayer, Charge Cannon and Saw Launcher as plain parts, with models and cards.
- **The best knacks come back as grafts** or legendary traits: Cold Blood, Follow Through, Hot Rivets.
- **The aux becomes a frame's thing**: parry on GUARD frames, and from parts for the rest.
- **Cut the verbs** the recorder shows nobody presses.
- Bench every part on every frame.

### 8. Wardens: the Silksong pass
Against [Wardens that are fun](simple-run.md#wardens-that-are-fun) and [what a finished boss has](bosses/README.md#what-a-finished-boss-has). Take them one at a time, and fly each by hand before moving on.
- **For every Warden**: four to six moves, each with a tell; pick a move, then move into position; no filler patterns; an opening after every big move; 90–150 s at the sector's expected power.
- **Warlord Khet** (Ashgrave): fly it by hand. Does the false tell read? Is the Glassing's way through clear? Is going round the Kneel the answer? ([khet](bosses/khet.md)).
- **Harbourmaster Oko** (Halcyon): the three phases, the record, the paint off, *Patience* ([oko](bosses/oko.md)).
- **The Sandking** (Kessra): THE PRICE, a haggle under fire ([sandking](bosses/sandking.md)).
- **The Mother-of-Spores** (Mirefall): her pods' Hold and the Lines; her dance needs the most work ([mother-of-spores](bosses/mother-of-spores.md)).
- **The Waking Engine** stays the third sector's Warden whenever it's in a run. Its fight no longer calls the cores.
- **A Warden rematch** on the title screen, once you've met it.
- **Mid-bosses**: each planet's set-piece elite gets a small dance of two or three moves.

### 9. Delete what wasn't missed
- Once run 1 is perfect, **delete**: fuel and the Sweep, run affairs, events and minigames, escort, heist, boarding, the core's systems, and the build layers removed in 7. Bring the design docs in line ([combat and builds](combat-and-builds.md), [endgame](endgame.md), [boarding](boarding.md), [design research](design-research.md)).

### 10. Co-op jumpstart: obvious and loud
Players like reviving each other, but they don't see that they can, and the moment is flat.
- **Bug:** `hud.ts` keeps showing `DOWN! PARTNER: FLY CLOSE` after the 20 s run out and the ship has crashed (`p.down` stays set with `p.out`). It should say the ship is out.
- **Show the reach**: a pulsing ring at `JUMP_REACH` round the downed ship, and a countdown for `JUMP_WAIT`.
- **Tell the one who has to act**: a `P2 DOWN: FLY TO THEM` banner by the healthy pilot, large the first time in a run.
- **Charging**: arcs between the ships, a filling ring, a rising hum, and beeps that quicken as the timer runs low.
- **The jolt**: a flash, a shockwave that clears nearby bullets, a `JUMPSTART!` pop, and boarding's `revive` sound.

### 11. Biomes: places worth seeing
Every biome should feel like discovering somewhere new: its own look, its own life, its own light. Hollow Knight and Silksong are the bar.
- Every pass follows the readability rules: scenery frames the lane, it never fills it, and foes fit the ground they're on.
- **Scripted moments**: one or two rare set pieces per biome that make it memorable. For example: a titan walking past in the Titan Graveyard, the Stormwall lighting up, Engine City's lamps waking, or a temple bell under the Drowned Temple's water.
- **Each planet gets a theme** in its own voice.

### 12. What every Warden still lacks
- Their own themes and horns: four share the one `boss` track.
- Poses for every Warden.
- How each one goes: a per-Warden end in `level.ts`.
- A line as each comes and goes.
- Moves on the beat timed by the music.

## Later

- **Medals**: three small goals per stage, shown on its node, each paying scrap.
- **Cross grafts**: a graft that mixes two factions, unlocked by holding grafts from both.
- **Pressure**: difficulty notches after a win, each one plain rule.
- **Meta unlocks**: a beaten Warden's parts join the pool. Only once the run itself is fun.
- **Captain Quist**, the rival met three times ([quist](bosses/quist.md)).
- The rest of the arsenal, once the first slice is judged.
- Enemies from the lore: each faction's own new foes.
