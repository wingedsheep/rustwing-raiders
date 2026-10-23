# Boarding

On foot through a freighter's crew for her cargo, then back to your ship before the kelters
clamp on. A small game of its own: quick, loud, readable, different every ship.

Code: `src/sim/deck.ts` (the plan), `src/sim/boarding.ts` (the sim), `src/view/boarding-view.ts`
and `src/view/board-juice.ts` (the look), `src/screens/boarding.ts` (the HUD),
`src/screens/board-choice.ts` (the card). Bench: `tools/board-sim.ts`.

## Her

- **Size** from the site's danger, now and then one bigger: skiff, freighter, hauler, bulker.
  Bigger is longer, more rooms, more crates (2 to 5), a longer clock, more pay.
- **Crew** by whose ship she is. Each crew has four hands: one rushes you, one shoots, one
  holds the line, and one odd one with its own trick.

  | | rushes | shoots | holds | odd |
  |---|---|---|---|---|
  | scrap | deckhand | gunner | bruiser (shield, charge) | torcher |
  | Lattice | clerk (listens) | auditor (lance through cover) | bulwark (wall of light) | notary |
  | Bloom | thrall (lunge) | puffer (spore sacs) | nurse (mends) | rooter |

  Beasts (skulks) come in cages on poachers' ships. Kelters come when the clock runs out.
- **State**, sometimes: DARK (no alarms, half asleep, torchlight), CAGES, BREACH (the hull
  breathes out and takes loose things with it).

## The odd ones

- **Torcher.** Walks in, lights a pilot flame, then hoses a cone of fire that turns slowly.
  Get round its side. The tank on its back takes double, and enough shots set it off: it and
  whoever's near.
- **Notary.** Keeps its distance and stamps three seals across your way; they burst a beat
  later. Keep moving. Kill it and its seals come to nothing. Seals hurt crew too.
- **Rooter.** Goes under the deck (a ripple, nothing to hit), comes up under you after a
  rumble (the cracks are the tell), then sits stuck in the broken plating, wide open.

## Arms off the deck

Crew drop what they carry. Walk over one with empty hands and it's yours, in the pistol's place,
till it's empty; with your hands full, press special to swap. One or two lie about by the cargo,
and the strongbox may hold one.

| arm | whose | what it does | who loves it |
|---|---|---|---|
| nailer | scrap | a hose of light nails | trigger-leaners |
| scatter | scrap | a wall of pellets, kicks you back | point-blank brawlers |
| lance | Lattice | hold to draw, then a beam through everyone to the bulkhead | lining them up |
| stamp | Lattice | a heavy slug that comes back off walls twice | bank shots |
| spore | Bloom | lobs a sac; its cloud eats crew, not you | area denial |
| hook | kelters | reels a crewman in, open for a slide; reels you to heavies | takedown hunters |

## The deck fights back

- **Fire.** A canister's blast spills burning fuel. It burns crew as well as you, sets off
  other canisters, and lights spore clouds in a flash.
- **Steam.** The engine pipes hiss, then jet across the room. A shot bursts one early.
- **Gates** on Lattice ships, the **vent** on a breached hull.
- **Bodies.** A body knocked flying bowls over the crew it hits, leaving them open.

## Two of you

More crew (a hand more in most rooms), more hide on them, more kelters. Two at one crate work
it twice as fast. A partner down has about 15 seconds to be hauled up, or the crew throw them
out the lock.

## The grade

Marks at the end: GHOST (never seen), CLEAN (never hit), FULL (every crate), CORE, QUICK.
They make an S to C rank that pays a little on top, more on a bigger ship.

## Feel

No hitstop and no slow motion (the clock is shared in co-op: see `parry-rules.md`). The punch
comes from flashes, camera kick and shake, casings, shards of kit, bodies flying, stains left
on the deck, and each arm's own voice.
