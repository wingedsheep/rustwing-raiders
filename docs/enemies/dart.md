# Dart

*The old guard.* Scores and the other enemies: [the overview](README.md).

**Who it is.** The cheapest hull that carries a gun, flown in numbers by every power. They fly in formation because their pilots, or their sleeping cores, learnt it from each other.
**Ship's log.** *"Lots of them, not much each. Mind the one that dives."*

**Worn as.**

| Planet | Name | What it is |
|---|---|---|
| Oru-Tal | Hesk Skiff | a net-crew skiff, the Hesk's |
| Halcyon | Patrol Cutter | a Port Authority cutter: line abreast, signal lamps, a navy pretending not to be |
| Kessra | Sand Skimmer | a house racer of the Uukhvar, skimming the pans |
| Mirefall | Hive Needle | grown, not built: a bloom-thing that copied the shape of ships |
| Glacis | Frost Wisp | one of the Engine's small maintenance fliers, clearing the shafts |
| Ashgrave | Scav Kite | a Sankvi kite of titan plate and a stolen engine |
| Vesh | Reef Glider | a Court glider, spotting umora |
| Cinder Orchard | Security Drone | a Vantorr drone, wiped on the first of the month |

**Now.** Formations on four paths: swoop, dive, cross, loop (`src/sim/enemies.ts:172`). Also the escort boarders' skin (`boarderSkin`, `src/sim/convoy.ts:413`).
**Tell → window.** Only the dive has a tell (a line, 0.6 s); the other paths fire with none. No window.
- [ ] Keep it fodder, but give the dive a recover so a parry pays.
- [ ] Ship the planets' named darts.
