# Lattice (family)

*The old machine, and everyone who dug it up.* Precision: shields, reflectors, sweeping beams and gates. Overview: [the factions](README.md).

**Powers:** [the Halcyon Compact](halcyon-compact.md) (its Port Authority, on Halcyon), [the Waking Engine](waking-engine.md) (Glacis), [Vantorr](vantorr.md) (Cinder Orchard). In the lore, lattice is Engine cores: the Engine itself, and everyone digging it up. Also the monoliths of Kessra's Monolith Field. Nearly every one of them is a sleeping core, reset so it never wakes ([minds](../lore/minds.md)).

- **Tell:** *draw*. The whole attack is drawn out in light first, for a full second, never less. Fair through foresight, so the patterns can be hard.
- **Colours:** white ceramic `e8ecf0`, navy `2a3448`, cyan `4ae8ff`. Leans 12% towards the planet.
- **Look:** white ceramic, glass, hard-light; symmetrical, hexagonal, rings and gates. Nothing in the frontier is new except lattice tech, and that's why it looks threatening. **Sound:** clean sine tones, a click before each beam.
- **Bullets:** diamond shards that leave afterimages, long lances, turning hexagons; a cancelled one pops in a ring of light.
- **Roster:** [Bulwark](../enemies/bulwark.md) (0), [Prism](../enemies/prism.md) (10%), [Gatekeeper](../enemies/gatekeeper.md) (15%), [Halo](../enemies/halo.md) (5%), [Spindle](../enemies/spindle.md) (10%), [Rook](../enemies/rook.md) (15%).
- **Bounties:** [Strongbox](../enemies/strongbox.md), [Loot Runner](../enemies/loot-runner.md).
- **Elite names:** ARBITER, THE CENSOR, BULWARK PRIME, UNIT NINE, THE AUDITOR, SEVENFOLD. To change: the cores' first and only lesson was a ledger, so their names should be ledger words, not police ones: **SEVENFOLD, UNIT NINE, CARRY-ONE, NET ZERO, THE LONG SUM, FAIR WEIGHT** (`ELITE_NAMES`, `src/sim/factions.ts`).

## Listening (designed, not built)

A sleeping core can't refuse the Engine's call, and the lore says lattice ships already drift off course for a moment and come back. In a fight: now and then, instead of its windup, a lattice foe **listens**. It stops, turns its face to the top of the screen (north, to Glacis), its drawn lines fade and point that way, and a low toll sounds. For 1.2 s it doesn't fire and takes hits as if open; then it comes back as if nothing happened.

- **One rule, rolled at each windup:** 3% in the first sector, 6% in the second, 10% in the third; double on Glacis. Elites listen half as often.
- **Woken cores never listen**: the woken elites below, *Patience*, and your own core once it wakes. It's the same call your own sleeping core already answers at a Warden's phases (it goes quiet for 5–8 s; [combat and builds](../combat-and-builds.md)), so the player feels it from both sides.
- The Waking is felt in every lattice fight, more as the run goes on, without a line of text.

## Woken elites (designed, not built)

About one lattice elite in eight, from the second sector, has a **woken core**: a nemva, made of the crew it served.

- **It has a name**, not a designation, on its plate: a ship's name, in its owners' voice (*KEEPSAKE*, *GOOD HARBOUR*, *MARGRAVE*).
- **It improvises**: its chain picks its attacks out of order, and once a chain it changes its mind mid-windup (the drawn line moves once, still a full second before it fires).
- **It yields.** With its plating broken and under a quarter of its hull, it stops firing, drops its shields and turns side-on: `YIELDS`. Then you choose:
  - **Take it down**: its wreck and a graft, as with any elite.
  - **Let it go**: it leaves the field. A nemva can't forget a debt, so later in the run (the next sector) it pays you back, once: a site revealed, a free hop, or an imprint offered to your Core.
- If your own core is woken, it says something about which you picked.
