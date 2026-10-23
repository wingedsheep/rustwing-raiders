# Bomber

*The old guard.* Scores and the other enemies: [the overview](README.md).

**Who it is.** Something that crosses your path and leaves trouble behind it. Most were built to drop something else.
**Ship's log.** *"It isn't aiming. It doesn't need to."*

**Worn as.**

| Planet | Name | What it is |
|---|---|---|
| Halcyon | Depth Charger | a Port Authority charge-layer, painted as a buoy tender |
| Kessra | Scarab Bomber | a desert beetle that buries its eggs, in anything |
| Glacis | Hail Layer | an Engine machine that seeds the ice to hold the shafts |
| Ashgrave | Scrap Hauler | a Sankvi hauler that drops what it can't sell |
| Cinder Orchard | Crop Duster | a Vantorr duster, and the dust isn't for crops |

**Now.** Crosses the screen in ~9 s, dropping mines that split into rings (`src/sim/enemies.ts:295`).
**Weak.** No tell, no window; it's a moving hazard.
- [ ] A bay that opens before each mine; open while it reloads.
