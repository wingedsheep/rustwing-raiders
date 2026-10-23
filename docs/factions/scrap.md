# Scrap (family)

*Metal you bolted together yourself.* Momentum: they ram, chase, harpoon, shell and torpedo you. Overview: [the factions](README.md).

**Powers:** [the Hesk](hesk-poachers.md) (Oru-Tal), [the Uukhvar](dune-cartel.md) (Kessra), [the Sankvi](scav-clans.md) (Ashgrave), [the Lowtide Court](reef-pirates.md) (Vesh). Four very different peoples who have one thing in common: nobody sold them a ship, so they built one.

- **Tell:** *flare*. The engines flare red and rev, then it commits to a line.
- **Colours:** brass `a88a4a`, gunmetal `2e2a2e`, red `ff3a3a`. Leans 20% towards the planet's own skins.
- **Look:** welded plates, chains, harpoons, exhaust stacks; asymmetric, bolted-on, forward-leaning wedges. **Sound:** two-stroke revving, clanks.
- **Bullets:** hot slugs with tracer streaks, spiked flak, naval mines; a cancelled one pops in sparks.
- **Roster** (and from how far into a level): [Ramjack](../enemies/ramjack.md) (0), [Flakker](../enemies/flakker.md) (5%), [Rattler](../enemies/rattler.md) (10%), [Hookjaw](../enemies/hookjaw.md) (25%), [Torpedo Rig](../enemies/torpedo-rig.md) (20%), [Pirate Ace](../enemies/pirate-ace.md) (45%), [Technical](../enemies/technical.md) (5%), [Gunboat](../enemies/gunboat.md) (10%, on water), [Dreadnought](../enemies/dreadnought.md) (40%).
- **Bounties:** [Loot Runner](../enemies/loot-runner.md), [Iron Crate](../enemies/iron-crate.md), [Pirate Ace](../enemies/pirate-ace.md).
- **Elite names:** GRISTLE, OLD RUST, BLACK MOLLY, HACKSAW, THE BARON, RIVET-JAW, MAD DOSSA, CINDERBACK.

## Each power's own (designed, not built)

The shared roster is the same bolted metal everywhere. On top of it, each power gets one foe that only it flies, built from what it is, all on the flare tell:

| Power | Foe | What it does | The answer | Why it's theirs |
|---|---|---|---|---|
| **Hesk** | **Net-Caster** | a skiff that flares and throws a weighted net ahead of you: it opens across your path and hangs for 2 s; inside it you fly at half speed | go round it, or dash through (a dash cuts it) | they net beasts for a living, and in Hesk sky you're the beast |
| **Uukhvar** | **Contract Skiff** | a house guard on hire: its plate shows its fee (`CONTRACT 40`), and once it has taken that much it breaks off and flies home, paid; it pays out less than a kill | hit it hard and fast, or ignore it and let the fee run down at its own guns | signed is kept: it's paid to fight you, not to die for the house |
| **Sankvi** | **Glasswright** | a scav rig built round a titan's arm with the core still in it: the rig flares like scrap, but the arm's beam is drawn in light, lattice-style, a full second first | read the rig and the arm apart: two tells on one body | they live in the titans' bones; it teaches Khet's two tells before Khet |
| **Lowtide Court** | **Harpoon Skiff** | a longboat that throws an iron and tows you behind it along its line while it rows away | shoot the line or dash free; the boat's open while it hauls | the Court hunts umora, and you're the season's catch |

To do: the four in `FOES` and each planet's `ROSTER` (`src/sim/factions.ts`), a model each in `tools/models/enemies_scrap.py`, a field-guide tip each.
