# Gatekeeper

*Lattice.* Scores and the other enemies: [the overview](README.md).

No chain.

**Now.** Two pylons at the edges and a beam between them that closes as it comes down; fly the gap, or drop a pylon (`gate`, `src/sim/director.ts:354`). The pylon itself only glares (`src/sim/foes.ts:774`).
**Tell → window.** The gate is drawn with its gap for the whole approach. No window: it's a hazard with hit points.
**Weak.** Nothing to learn beyond "find the gap".
- [ ] A small move of its own: the gap shifts once, drawn first.
- [ ] A hum that rises as the gate closes.
