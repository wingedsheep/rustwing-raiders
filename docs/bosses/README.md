# Bosses

One boss a planet, met at the end of its sector. This folder tracks how far along each one is: who it is, how its fight dances, its model and animation, and its music. This page has the scores and what they all share; each boss has a page of its own (linked from the table). Enemies have their own folder ([`docs/enemies/`](../enemies/README.md)).

Code: `src/sim/boss.ts` (the fight), `tools/models/bosses.py` (the models), `src/view/boss-pose.ts` (poses and facing), `src/audio.ts` (`TRACKS`, the boss themes). Each boss's name, title and colours live in `src/world/planets.ts`.

## What a finished boss has

- **Personality.** Someone, not a health bar: a reason to be here, a mood, a way of moving. It shows in the moves it picks, how it reacts when hurt, how its phases change.
- **A dance.** Silksong-style: a handful of moves, each with one tell (shape, pose and sound), a consistent speed and one clean answer, and each leaves it open. First phase in order, to be learnt; later phases string moves and answer how you fly. The phases change *how* it fights, not just how fast.
- **A model** that reads from above as what it is, with parts built to move (hinged at the joints, separate pieces for what breaks off).
- **Animation**: an idle loop, a pose for each tell, a motion for each move, a pose when it's open, a reel when it's staggered. It faces and banks where it goes.
- **Music**: its own theme, in its planet's voice, that changes with its phases. Its own sounds for its tells.

## Scores

0 missing · 1 rough or shared · 2 works, needs tuning · 3 done

| Boss | Planet | Style | Personality | Dance | Model | Animation | Music | Top need |
|---|---|---|---|---|---|---|---|---|
| **[Great Mother Vask](vask.md)** | Oru-Tal | brawler | 2 | 2 | 3 | 2 | 2 | uneven phases; listen to her theme |
| [Harbourmaster Oko](oko.md) | Halcyon | fortress | 1 | 2 | 2 | 1 | 1 | a character: who's on the bridge? |
| [The Sandking](sandking.md) | Kessra | pursuer | 1 | 2 | 2 | 1 | 1 | its phases fight the same after the chase |
| [The Mother-of-Spores](mother-of-spores.md) | Mirefall | hive | 1 | 1 | 2 | 1 | 1 | the pods carry the fight; she only waits |
| **[The Waking Engine](waking-engine.md)** | Glacis | fortress | 2 | 2 | 3 | 2 | 2 | fly it by hand; listen to its theme |
| [Warlord Khet](khet.md) | Ashgrave | brawler | 1 | 2 | 2 | 1 | 1 | a rider on the titan: two characters, one fight |
| **[Queen Istra](istra.md)** | Vesh | brawler | 2 | 2 | 3 | 2 | 2 | fly it by hand; listen to her theme and voices |
| [Asset Recovery Unit 0](aru-0.md) | Cinder | pursuer | 2 | 2 | 2 | 1 | 1 | a corporate voice (notices, fees, warnings) |

## Shared by all

What every boss gets from `boss.ts` today:

- **Three phases** (at two thirds and one third of its hull), a **signature** move second in every phase named on a ribbon under its bar with a low horn, **poise** that breaks into a 2.6 s STAGGER, a **CLEAN** bonus for a phase without a hit, and a **LAST STAND** below 8%.
- **It reads you** (hanging back, sitting still, hugging a side, boosting, crowding it, dashing through everything), from the second phase, and says so under its bar.
- **Filler patterns** between moves (fans, spirals, rain, rings, walls, lasers, splitters, curves), picked from a planet's favourites.
- **Per-boss moves**: `OWN` in `boss.ts` gives a boss its own move list per phase (Vask, the Engine and Istra have one); the rest use their style's (`MOVES`). A move in `MOVE_NAME` is named on the ribbon as it comes (every signature, and the Engine's THE COUNT); only the signature gets the horn.
- **Bare phases**: `BARE` in `boss.ts` names the phase from which a boss has no guns left, so it fights with its moves only (Vask's third).
- **Per-boss filler**: `FILLER` in `boss.ts` gives a boss its own patterns per phase in place of its planet's favourites (the Engine, dozing, only breathes out frost; Istra, alone, only breathes out the sea and draws it back).
- **Tempo**: `TEMPO` in `boss.ts` slows or quickens a boss's tells and moves by phase (the Engine: 1.35× dozing, 0.92× awake). Lattice tells stay at a second or more.
- **Its own voice**: `READ_OWN` in `boss.ts` gives a boss its own lines for what it reads (the Engine *logs* you; Istra talks to you, for her Court).
- **The tide**: `onTide` in `boss.ts` throws a bullet or a strike out to come back: it stalls, turns and flies home to its owner (Istra's third phase: irons, bubbles, her filler). A returning iron only cuts, it no longer catches.
- **Under**: a boss with `under` set is hidden, can't be hit and does no ram damage (Istra's breach), with foam where it is; its tell still shows.
- **Side-on**: a sky dive or a broadside turns a boss side-on, facing where it's going (`SIDE_ON` in `boss-pose.ts`).
- **Shedding**: a model part with `shed=<phase>` breaks away as that phase starts (`boss-pose.ts`): hidden, with shards in its colour.
- **Poses**: clips named `boss_<planet>_<move>_<state>`, `boss_<planet>_<move>` or `boss_<planet>_<state>` (state: windup, attack, recover, stagger) play when it's doing that, cross-faded from the idle; a windup pose holds its last frame. A boss without them just idles. A clip `boss_<planet>_p<phase>` is its idle in that phase (the Engine's p1, p2). Key every part that moves in the idle, or it exports in some other clip's pose.
- **Facing**: on a charge, a rake or a sky dive it turns to face where it's going and banks into the turn; on a scan it turns its gaze part of the way (`LOOKS`).
- **Beams with a gap**: a laser with `r0` starts that far from its owner (the Engine's scan is two, either side of its ring); the autopilot goes to the gap. A shell `strike` with `shards` bursts into a ring of needles where it lands.
- **The fight is its own**: when a boss comes, the rest of the level's waves are dropped and what's still about leaves (fliers go up and off, the ground goes quiet: `flee` in `src/sim/enemies.ts`). Only what the boss calls joins in.
- **Phase lines hold**: no hit carries a boss past the line of a phase it hasn't fought, nor past its last stand (`bossHurt`).
- **Hull**: `HULL` in `boss.ts` gives a boss more or less than the usual 2400 (Vask 2.6×, the Engine and Istra 2.4×).
- **Hit flash**: a boss under fire only glints (a quarter of the white an enemy flashes), so its poses and tells stay readable.
- **Music**: a boss with its own track (`boss_<planet>` in `TRACKS`) plays that, else the shared `boss` track. A track's `parts` change its band at each phase, on the next bar.

Across all, still to do:

- [ ] Five bosses still share the one `boss` track, and all share the one horn.
- [ ] Only Vask, the Engine and Istra have poses; the rest idle through everything (the view only crouches and flashes them on a tell).
- [ ] A second signature for each boss's last phase (Vask's last phase changes how she fights instead; see below).
- [ ] A boss rush or a rematch event to replay a fight you've learnt.
- [ ] How each boss dies: Vask should fly free, not explode (her harness blows, she goes); the Engine should go back to sleep (iris shut, crown stopping); the Throne-Whale should sink with Istra saluting from the stern. Needs a per-boss end in `level.ts`.
- [ ] Moves on the beat are timed by the sim, not the music, so they drift against the theme (Vask's screech, the Engine's count, Istra's irons and broadside).
- [ ] Boss voices are synth (Istra's call and her crew's HO are formant buzzes). Barks from `tools/voices/` would give the bosses with people aboard (Istra, Khet, Oko's harbourmaster) a voice of their own.
