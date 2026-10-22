# Prism

*Lattice.* Scores and the other enemies: [the overview](README.md).

Elite chain 2.

**Now.** Closed, it throws your shots back unless you're in focus (`foeShot`, `src/sim/combat.ts:239`). It opens to sweep a beam, and only one Prism sweeps at a time (`src/sim/foes.ts:744`).
**Tell → window.** Sweep tell 1.0 s, soft (×1.5) during it. Still reflects while sweeping. Recover 1.2 s at ×2.
- [ ] Faces that open and close.
- [ ] A glass ring on each reflect, not the shared `graze`.
