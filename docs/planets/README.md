# Planets

The eight worlds of a run. Each is a handful of biomes a level flies through in turn, one faction that holds it, a boss, and a market. This page has the overview; each planet has a page of its own (linked from the table). Who lives there: [`docs/factions/`](../factions/README.md) and [`docs/npcs/`](../npcs/README.md). Their bosses: [`docs/bosses/`](../bosses/README.md).

Code: `src/world/planets.ts` (`PLANETS`: biomes, local enemies, boss name and colours), `src/sim/factions.ts` (`PLANET_FACTION`, `factionsIn`), `src/sim/chart.ts` (`MARKET`). The art direction is in [`docs/style-and-characters.md`](../style-and-characters.md). Their history and older names: [`docs/lore/`](../lore/README.md).

## The eight

| Planet | Epithet | Held by | Fights as | Boss | Cheap | Pays ×2 |
|---|---|---|---|---|---|---|
| [Oru-Tal](orutal.md) | the Cradle | [the Hesk](../factions/hesk-poachers.md) | scrap + wild | [Great Mother Vask](../bosses/vask.md) | guns | defence |
| [Halcyon](halcyon.md) | the Long Evening | [Halcyon Compact](../factions/halcyon-compact.md) | lattice + wild | [Harbourmaster Oko](../bosses/oko.md) | defence | specials |
| [Kessra](kessra.md) | the Rust Sea | [the Uukhvar](../factions/dune-cartel.md) | scrap (+ lattice at the monoliths) | [The Sandking](../bosses/sandking.md) | engines | guns |
| [Mirefall](mirefall.md) | Moon of the Violet Giant | [the Hive](../factions/the-hive.md) | bloom + wild | [The Mother-of-Spores](../bosses/mother-of-spores.md) | boosters | specials |
| [Glacis](glacis.md) | the White Furnace | [the Waking Engine](../factions/waking-engine.md) | lattice + wild | [The Waking Engine](../bosses/waking-engine.md) | engines | boosters |
| [Ashgrave](ashgrave.md) | Where the Titans Fell | [the Sankvi](../factions/scav-clans.md) | scrap + wild | [Warlord Khet](../bosses/khet.md) | specials | engines |
| [Vesh](vesh.md) | the Low Tide | [the Lowtide Court](../factions/reef-pirates.md) | scrap + wild | [Queen Istra](../bosses/istra.md) | guns | engines |
| [Cinder Orchard](cinder.md) | Property of Vantorr Agricorp | [Vantorr](../factions/vantorr.md) | lattice | [Asset Recovery Unit 0](../bosses/aru-0.md) | defence | guns |

"Fights as" is the combat family ([`factions/`](../factions/README.md#the-families)): the planet's own, plus wild wherever a biome has creatures (`factionsIn`).

## What every planet shares

- **Four biomes**, flown in order, each with a one-line card as it slides in, its own land shape, sea (or lava, or chemicals), props, creatures, particles and light.
- **Six local enemies** (`enemies` in `planets.ts`): the older archetypes (dart, swarm, turret, gunship, serpent, brute, lancer, carrier, bomber) in the planet's own names and colours. The faction's new kinds come on top, skinned to lean towards the planet's colours (`foeSkin`).
- **A boss**, met as the Warden at the sector's gate.
- **A market**: dealers sell one class of part cheap (what its faction flies with) and pay double for another. Rollo Stax's news can make one class pay ×3 for a sector. Hated: +25% and +1 danger; friends: −20%.
- **Mood** with its faction, −3 to +3 (`run.mood`, keyed by the faction's name), moved by events, escorts and heists.

## Between the planets

- **Sectors** are little solar systems (`src/sim/chart.ts`): the planets go round, every jump is a watch, and **the Sweep**, the [Syndicate](../factions/syndicate.md)'s net, comes across from where you came in. System names: KAPTEYN DRIFT, OLD LANTERN, THE ANVIL, MERIDIAN REACH, SALT NEBULA, HOLLOW CROWN, NINE WELLS, THE ORCHARD (`src/screens/chart.ts`).
- **Sites** on and around a planet: raids, escorts (WATER RUN, ORE RUN, ...), heists (PAYROLL RUNNER, TITHE BARGE, ...), salvage (SALVAGE YARD, SCRAP MARKET, CHOP SHOP), docks, and events out in the dark.
- **A trader comet** goes round the wrong way: she buys anything, at ×1.25.

## Still to do

- [ ] The trade goods with character (storm cells, wyrm ivory, spore wine, ...) from the style guide are ideas only; markets deal in part classes.
- [ ] Each planet a theme in its own voice (only Oru-Tal's boss has one).
- [ ] Planet-specific events: today every event can turn up anywhere (`where: 'any' | 'space' | 'planet'`).
