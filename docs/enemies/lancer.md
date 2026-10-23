# Lancer

*The old guard.* Scores and the other enemies: [the overview](README.md).

Elite chain 2.

**Who it is.** A human copy of a Tonkva beam: a dug core and a lens on a hull. The Prism is the original, and it can turn your shots back. A lancer can't; it only has the beam.
**Ship's log.** *"A copy of a Tonkva beam. The copy only sweeps."*

**Worn as.**

| Planet | Name | What it is |
|---|---|---|
| Halcyon | Harbour Lancer | a Port Authority picket, the navy's oldest class |
| Kessra | Glass Lancer | lensed with glass cut from the Monolith Field |
| Glacis | Beam Pylon | the Engine's own beam pylon, which the others copy |
| Ashgrave | Glass Sniper | a Sankvi rig lensed in crater glass from the Glassing |
| Cinder Orchard | Cutter Rig | an orchard-pruning rig with a gun |

**Now.** Hovers and sweeps a beam through where you are; the beam is drawn 1.0 s first (`src/sim/enemies.ts:307`, `telegraph` sound at `src/view/level-view.ts:845`).
**Tell → window.** Sweep 1.0 s, beam 0.55 s, recover 1.2 s at ×1.8.
**Weak.** Plays the same as the Prism without the reflect.
- [ ] Give it a difference: it tracks a little during the sweep, or fires twice.
