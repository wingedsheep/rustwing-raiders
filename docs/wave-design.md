# Wave design

How enemy fire is put together so there's always a way through for a player who reads the screen well. Fights should be fast and ask a lot of your eyes and hands, the way the Silksong bosses do (Grand Mother Silk, Trobbio), but nothing should be a coin toss. Read this with [enemy and weapon design](enemy-and-weapon-design.md) before designing a foe's or a boss's fire.

There are three parts:

- **The trials** (`src/sim/trials.ts`, `just trials`) fly each attack pattern in pure shapes with a pilot that has a human's limits. They measure how far each pattern can be pushed and still be dodged, at each point in a run, and write that down as a table.
- **The patterns** (`src/sim/volleys.ts`): every foe and boss fires one of the trials' families, at the numbers the table gives for this point in the run.
- **Fair fire** (`src/sim/fair.ts`) checks every volley in the game as it's fired, and cuts a gap if a mix of patterns has shut every way. It's the safety net, not the design.

## The pace

Everything is a bit quicker than it was:

| | Was | Now | Where |
|---|---|---|---|
| Enemy fire | as written | ×1.4 | `FIRE_PACE` in `src/sim/level.ts` (`Level.fireSpeed`) |
| Ship top speed, accel, dash speed | as built | ×1.25 | `SHIP_PACE` in `src/sim/build.ts` |
| Ship accel (grip) | as built | ×1.3 more | `SHIP_GRIP` in `src/sim/build.ts` |
| Dash | 62 u/s for 0.17 s, 0.25 s after, recharge as the frame says, 0.35 of its speed kept | 71 u/s for 0.15 s (about as far), 0.1 s after, recharge ×0.65, 0.5 kept | `DASH_*` in `src/sim/build.ts` |

Fire speeds up more than the ship does, so the screen asks a little more of you. The dash is a shorter, harder snap that covers about the same distance as before, and it's ready again sooner, so dodging stays nimble. A frame's own Move still scales it. The autopilot's lag is tuned to the new accel (`ACCEL` in `src/sim/pilot.ts`). Every shot goes through `Level.bullet`, which applies the pace, so the speeds written in the foes and the bosses stay as they were. A mine's ring uses `fireSpeed` too, so fair fire predicts it at the speed it will really fly.

## What Silksong asks

These numbers come from the game's own data (its PlayMaker FSMs, colliders and animation clips). M means read straight from the data. A means taken from an animation clip's length. I means inferred.

| | Tell | Speed | Gap / room | After |
|---|---|---|---|---|
| Hornet | | runs 8.25 u/s (16.5 body-widths a second), dashes 28 u/s for 0.1 s | body 0.5 wide | dash cooldown 0.425 s |
| Silk: finger-blade stomp and swipe | about 0.75 s (I) | 70 u/s, 8.5× Hornet | 3 blades placed round Hornet at ±1 and ±4–5 u: about 1.8 u to move (0.2 s) | stuck in the floor 0.75–0.9 s (M) |
| Silk: combos | the next hand 0.25–1.2 s after the last (M) | | | |
| Silk: web strands | 1.4 s or more (M) | still | gaps typically 2–5 u (4–10 Hornet widths), a few near nothing (I) | 1.75 s active |
| Silk: idle between attacks | 0.8, 0.5, 0, 0.5, 0.5, then 0.1 s over the six phases (M) | | | |
| Trobbio: tornado | 0.45 s (A) | 22 u/s, then shots at 30 | | |
| Trobbio: spin dash | 0.33 s (A) | 42 u/s, 5× Hornet | | 0.5 s pose |
| Trobbio: trapdoor bursts | 0–0.85 s stagger | still | 4 of 7 columns, about 5 Hornet widths clear between | 3.25 s |

What to take from it:

1. **Fast is fine when it's told.** Silksong's hazards fly at 2–8 times Hornet's speed, much faster than anything of ours. That's fair because every fast hit has a tell of 0.45–0.8 s. Once the tell is over you're dodging the place it's going to land, not reacting to the projectile. Ours is the other way round: the bullets are slower than the ship, so you can react to them in flight. A fast attack needs a tell in the body and on the ground (a line, a circle, a sweep: `Enemy.tele`).
2. **Area denial gets a long tell.** Strands, spike floors and rubble give 1.15–2.2 s of warning, then stay up a while. Something that takes away part of the screen is shown well before it does.
3. **Gaps are authored, not luck.** Silk's web patterns are hand-made layouts that move a little each time; they aren't aimed at Hornet. Her blades are aimed at Hornet but land either side of her with lanes between them. Make both kinds: set layouts with a known hole, and aimed attacks that force one sure move.
4. **The pressure is in the gaps between attacks, not in the attacks.** Silk ramps her idle from 0.8 s to 0.1 s, and her combos chain hands 0.25 s apart. A later phase asks more by giving you less rest, while each attack stays readable.
5. **Every attack leaves a window.** Blades stay stuck in the floor for 0.75–0.9 s. Trobbio holds a pose for 0.5 s. That's the moment to punish, and the moment the player gets to breathe.

## The rules for a pattern

1. **One sure way through, which a good read finds.** Every volley leaves a gap at least two ship hitboxes wide, with clearance round the bullets. A ring has its hole. A wall has its gap. A spread can be outflown. Aimed fire forces a step, not a guess.
2. **A tell before anything the player can't outrun.** Shots that cross the screen faster than the ship need a tell of at least 0.45 s (bosses) or 0.6 s (waves). Area denial needs 1.2 s.
3. **Room after the gap.** The way through leads somewhere with space. It doesn't lead into a corner or into the next volley.
4. **Combos are layered, not stacked.** A second pattern comes once the first has shown its gap: 0.25 s after it at the quickest, in a boss's last phase. Two patterns fired in the same frame have to leave a hole together.
5. **Phases tighten the rest, not the gaps.** Shorter idle, more attacks chained together, a little faster fire. The gap a pattern leaves stays as wide.
6. **A window after the attack.** Each attack ends with a recovery the player can see and punish, 0.5–0.9 s.
7. **Point blank is a choice.** Fire from up close (6 u or less) can be as quick as it likes: you chose to be there, and the foe's tell said it was coming.

## The trials: how hard a pattern can get

The trials fly each attack in pure shapes: bullets as circles, the ship as a point with its core, a foe as a disc. Nothing else. They find the hardest version of each pattern that a player of a given skill can be shown to dodge, and how far to push it at each point in a run. The code is in `src/sim/trials.ts` and the tool is `just trials`.

### The patterns

Each family turns one knob, `s` from 0 (gentle) to 1 (brutal), into all its numbers at once: more bullets, quicker, sooner, smaller holes.

| Family | What it is | s = 0 | s = 1 |
|---|---|---|---|
| ring | a ring, its hole a little to one side of the ship (you go to it, as to a web's gap) | 12 bullets, 8 u/s, every 1.6 s, a 6-bullet hole | 96, 40 u/s, every 0.15 s, a 1-bullet hole |
| fan | a fan aimed at the ship | 5 over 0.8 rad, 9 u/s, every 1.3 s | 27 over 2.2 rad, 40 u/s, every 0.18 s |
| burst | aimed shots one after another | 3, 0.14 s apart, 12 u/s, every 1.4 s | 20, 0.02 s apart, 64 u/s, every 0.15 s |
| wall | a row across the screen with a hole near the ship | 2.6 u apart, an 8 u hole, 7 u/s, every 2 s | 1.1 u apart, a 1.6 u hole, 30 u/s, every 0.3 s |
| spiral | arms turning, a shot down each | 3 arms, 8 u/s, every 0.14 s, 1.4 rad/s | 8 arms, 20 u/s, every 0.04 s, 3.4 rad/s |
| rain | shots from random spots along the top | 10 u/s, every 0.3 s | 60 u/s, every 0.002 s |

The speeds are true speeds, after the pace. A foe sways across the top of the screen. In a wave the screen scrolls at 9 u/s, so fire comes down it that much quicker; in a boss fight the screen holds still.

### The reader

The reader is a pilot with a human's limits:

- **It sees a bullet only `react` seconds after it's fired.** Until then the bullet doesn't exist for it.
- **It plans at `pace` of the ship's top speed**, and flies flat out (as a pad's stick does). The difference is its turns and its slips.
- **It thinks again every 0.1 s.**

Each time it thinks, it plans through the gaps on the same grid fair fire uses (`src/sim/reach.ts`):

1. Every cell it could be in over the next 1.2 s, past every bullet it has seen, held 0.5 u clear. If that shuts every way, it tries 0.25 u, then no clearance.
2. The roomiest of the cells it can be in at the end, and of those the nearest to where it likes to sit.
3. Back from there, the cells it can still get there from at each step.
4. Down those, the way that fire crosses least soon. A late dodge is the one that's hit, so it gets out of a bullet's lane early.

| Reader | `react` | `pace` | Where in the run |
|---|---|---|---|
| first stop | 0.55 s | 50% | the first stop |
| early | 0.45 s | 60% | |
| mid | 0.38 s | 70% | |
| late | 0.30 s | 80% | |
| last boss | 0.25 s | 90% | the last boss: Silksong's quickest tells are 0.45 s, and its combos chain 0.25 s apart |

### The verdict and the frontier

A pattern is **dodgeable** for a reader if the reader flies it for 10 s on 10 seeds and is hit on at most 1 of them. A seed sets where the foe stands and sways, where the ship starts, and where the holes and the rain fall. On each seed the reader tries three spots to sit (low, high, lower) and counts the seed clean if any of them gets through. A player picks their spot for the pattern; one pilot with one habit would measure the habit.

The **frontier** is the largest `s` that's still dodgeable, found by bisection to 1/128. A sharper reader can fly anything a gentler one can, so its frontier is never set below the gentler one's.

The reader finding a way proves a way exists, so the frontier is a floor: a player may manage more. The 1 seed in 10 allowed is for the reader's own slips. It plans on a half-unit grid; it isn't a perfect player.

### Over a run

A pattern at a point in the run (`progress` 0 for the first stop, 1 for the last boss) is flown at:

```
s = frontier(the reader for that point) × push(progress)
```

The push climbs over the run as well: waves go from 55% to 85% of the frontier, bosses from 75% to 97%. A wave leaves room for everything else going on (shooting, the land, a second foe). A boss is the test, and the last one asks nearly all of it. So every pattern gets harder over the run on two counts: the reader gets sharper, and less of the margin is left.

`patternAt(table, family, progress, 'wave' | 'boss')` gives a family's numbers there, from the table `just trials` writes (`src/generated/trials_wave.json`, `src/generated/trials_boss.json`).

### What they found

The first full tables (2026-10-26). Each cell is how hard the pattern is flown at that point in the run, as `frontier × push`, from the first stop to the last boss:

| Family | Wave: first stop → last boss | Boss: first stop → last boss | A last boss's version (boss) |
|---|---|---|---|
| ring | 0.37 → 0.64 | 0.54 → 0.77 | 77 bullets, 33 u/s, every 0.48 s, a 2-bullet hole |
| fan | 0.31 → 0.63 | 0.66 → 0.95 | 26 over 2.1 rad, 38 u/s, every 0.24 s |
| burst | 0.24 → 0.85 | 0.35 → 0.56 | 13 shots 0.07 s apart, 41 u/s, every 0.7 s |
| wall | 0.37 → 0.70 | 0.58 → 0.77 | 1.45 u apart, a 3 u hole, 25 u/s, every 0.7 s |
| spiral | 0.33 → 0.50 | 0.22 → 0.59 | 6 arms, 15 u/s, every 0.08 s, 2.6 rad/s |
| rain | 0.48 → 0.82 | 0.70 → 0.94 | 57 u/s, every 0.02 s |

What to take from it:

- **Reaction time matters most for aimed fire.** The burst's frontier climbs from 0.44 to 1.0 as the reader gets sharper (waves). Rings and walls barely move with the reader: their limit is the gap, not the eyes. For those, the run's climb comes from the push.
- **A held-still screen helps fans and rain, and hurts spirals.** With no scroll, a fan's lanes stay straight and wide, so bosses can fire much denser fans (0.95 against 0.63). A spiral's arms don't get pulled apart, so it stays tight round the foe.
- **Patterns together are harder than either alone**, and have to be measured together: a ring and a burst flown at once are dodgeable up to 0.40–0.57, below the ring alone (0.67–0.75) and the burst alone (0.44–1.0). Check a wave's mix with `--combo`.

### Using it

```
just trials                         every family, every reader; writes the wave table
just trials --mode boss             the same with the screen held still; writes the boss table
just trials --family ring,fan       only these (merged into the table)
just trials --combo ring+burst      patterns flown together: their frontier as one
just trials --show ring --s 0.6 --reader 2 --seed 3 --at 4.5
                                    one trial, as a replay page (opens paused 4.5 s in)
```

The replay draws the trial in pure shapes: the bullets, the foe, the ship, and the line to where the reader is going. It's the quickest way to see why a pattern passes or fails.

The table takes about 5 minutes for waves and 8 for bosses on all cores.

## The patterns: foes fire from the table

Every foe's and boss's fire is one of the six families, and reads its numbers from the table with `pattern(lv, e, family, share)` in `src/sim/volleys.ts`. It gives that family's knobs here: the push for this point in the run (the level's difficulty over the last boss's 1.44), the wave table for line foes and the boss table for a boss and everything on its screen.

**The table is the ceiling.** A foe may fire less than its family's numbers, never more: fewer bullets, a wider fan, a bigger hole, a longer pause. Less is always easier, so it stays dodgeable. That's where a foe's character goes: the halo keeps its 18-ring with a gap, the gunboat its single slow shot, but none of them ever goes past the table.

**The share is a foe's weight.** Several foes fire at once in a wave, so each fires a share of its family's strength:

| Share | Who | |
|---|---|---|
| light 0.4 | skirmishers: darts, swarms, scraplings, potshots | there are a lot of them |
| mid 0.6 | line foes: gunships, serpents, skaters, halos, spindles | |
| heavy 0.8 | heavies (carriers, aces, wardens) and a boss's filler between its moves | |
| boss 1 | a boss's signature moves | the whole table |

An elite fires 1.25 times its kind's share. The share cuts the count, the rate and the hole. **The speed is always the table's full value:** fewer shots, but as fast as the run says. That's what keeps the fights quick.

How a foe uses it, in short:

- **counts are a cap:** `n: Math.min(18, k.n)`. The foe's own count, never more than the table's.
- **pauses are a floor:** `d.fire = Math.max(0.13, k.every)`. A boss's filler runs on a clock that speeds up with its phase (`hard`), so its pause is `k.every * hard`, and it's never quicker than the table.
- **holes and spacing are a floor:** a wall's gap is `Math.max(BROAD_GAP, k.hole / 2)`.
- **speeds are the table's:** fired with `lv.shoot` (a true speed: the table already has the pace and the difficulty in it), not `lv.bullet`. A move that's slow by its nature (the Frostwake's breath, ARU-0's printed rows) fires at 0.7 of it. A spread of speeds (the bubble rows, the salvo's file) has its fastest at the table's.
- **mines** split into a ring: `splitV` and `split` from the ring family.
- **reach is kept:** what used to die after a set time (the retro's fan, the tide's turn) has its life set from the distance it used to fly, so a faster shot doesn't reach further.

The fire that isn't a pattern stays as it is: seekers and torpedoes (they chase, the trials don't fly them yet), lasers and strikes (they have their own tells), and a prism's reflected shot (it answers your own fire). A strike's shards are a ring.

Mapping in brief: aimed singles and needle streams are a **burst**; spreads at you are a **fan**; rings, mines and junk shaken off are a **ring**; broadsides, rows and bars abreast are a **wall**; spinners are a **spiral**; the boss's needle rain is **rain**.

The first bench after the rewrite (2026-10-26, 120 runs): 106 cleared, 2.9 hits a run, 101 of them from bullets (0.84 a run). Of the 14 losses, 7 were on Mirefall (mostly its shells), 5 on Glacis (mostly laser gates, which are the autopilot's fault), one was the Vesh boss (slams and a harpoon) and one the Halcyon boss (3 bullets and the crane's ball). Fair fire took 108 bullets from about 10 000 volleys, nearly all too quick to see: darts 20, the boss fans 19 (the fan table is fast at a boss), the boss rain 9.

## Fair fire: the check

Every frame that something fires, fair fire asks whether a player could still get through, for each ship that's flying:

- **Flying at a human pace.** The ship moves at a share of its top speed (`pace`) and without a dash. The dash is the expert's way out, so the guarantee doesn't count on it.
- **With clearance.** It keeps `margin` units clear beyond the hit itself round every bullet, so a gap is something you can see, not a pixel.
- **For long enough.** The way has to stay open for `horizon` seconds, and end with at least `room` units² of space.
- **Past everything.** It counts every bullet already flying and the new ones, the land and the obstacles, and the foes' bodies.

And: **is anything new too quick to see?** A new shot that would hit the ship where it's already heading, sooner than `react` seconds, is taken out. Shots fired from point blank are exempt.

If the way is shut and the old fire alone had left it open, the new volley gets cut. Fair fire finds the path through the old fire that crosses the fewest new bullets, then takes out the new bullets on that path before they're ever drawn. A closed ring gets a hole of about three bullets on the side the ship can reach. A wall gets a gap above the ship. If the old fire had already shut every way, it's counted as `shut` and left alone. The hole there was somewhere else: a laser, a hazard, or the autopilot's line.

| Reading | `react` | `pace` | `margin` | `horizon` | `room` |
|---|---|---|---|---|---|
| Waves | 0.4 s | 75% | 0.45 u | 1.6 s | 4 u² |
| Bosses | 0.3 s | 85% | 0.3 u | 1.6 s | 2.5 u² |

A boss asks quicker hands than a wave does, but there's always a gap. The numbers are in `READING` in `src/sim/fair.ts`.

### How it works

The screen is a grid of half-unit cells, held as bitsets, stepped forward in time. A step is as long as the ship takes to fly about 2.2 cells, so 25–30 steps fill the horizon. At each step:

1. **Grow.** The cells the ship can be in grow by a step's flight: a plus, then a square, which is close to a disc.
2. **Cut.** They lose every cell that a bullet sweeps through in that step. Each sweep is a capsule from where the bullet was to where it is, widened by its radius, the ship's core and the margin.
3. **Cut the rest.** They also lose the cells of the land, the obstacles and the foes' bodies.

Bullets are predicted the way `updateBullets` moves them. That covers turning, speeding up, the screen carrying them, a mine dragged at 70% and its ring when it bursts. Homing fire is predicted for only half a second. The land is sampled once per world row and kept as the screen passes over it.

Cutting a gap is a cheapest-path search over the same grid and steps. The cost is how many new bullets a cell crosses, and old fire can't be crossed at all. That gives the path. Every new bullet that comes within a cell of it is taken out.

A normal check costs about 0.5–0.8 ms. Cutting a gap costs 5–7 ms, and it's rare. On a boss level the check adds about 3% to the sim's time.

### What it doesn't see yet

- **Strikes, lasers and hazards** (`lv.strikes`, `lv.lasers`, `lv.hazards`) aren't in the check. Their tells already give their warning, but a volley fired into the only gap a laser left won't be cut. Next step: rasterise strike shapes (circle, gate, wave) and lasers into the same grid.
- **Moving foes' bodies** are taken where they are now. They aren't predicted.
- **Torpedoes and seekers** are predicted straight, for 0.5 s only.

## Using it

The autopilot reports what fair fire did, per run and in total. The total line lists who it took bullets from:

```
just autopilot --seeds 2
...
Fair fire: 7100 volleys checked, 0 carved, 32 bullets taken (32 too quick), 36 already shut. Taken from: dart 16, spindle 3, ace 2, boss:rain 2, elite:spindle 2, potshot 1, raker 1, gunship 1, manta 1, turret 1, boss:eye 1, ? 1
```

That's the first run at the new pace (2026-10-26, 80 runs over every planet and mode). No volley needed a gap cut, so the patterns leave their own. The dart's shots are the ones that come too quick to see: they want a tell, or a slower shot. At the old pace the same runs cleared 77 of 80 with 1.6 hits a run (38 from bullets). At the new pace they cleared 79 of 80 with 2.3 hits a run (61 from bullets): harder, still flyable.

A pattern that keeps turning up in "taken from" doesn't build its own gap. Fix the pattern: give the ring its hole, or slow the shot, or give it a tell. Don't loosen the check. On a well-designed fight that line stays close to empty. `lv.fair` holds the same counts in the game, for the flight recorder and the lab.

To try it on a made-up volley, fire at a level directly and call `fairFire(lv)`. A closed ring closing in on the ship comes back with a 4-bullet hole, a full-width wall with a 2-bullet gap where the ship can reach, and a ring that already has its gap is left alone.
