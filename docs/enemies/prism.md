# Prism

*Lattice.* Scores and the other enemies: [the overview](README.md).

Elite chain 2.

**Who it is.** A return-glass. At a Tonkva gate, a prism caught what came through unannounced and sent it back where it came from: the lane's way of saying *not counted*. A core in a glass body still does it to your shots. Slow, aimed fire it lets through, because it can count it; a spray it returns. Only one sweeps at a time. They take turns, like clerks.
**Ship's log.** *"Throws back what it can't count. Aim, don't spray."*

**Now.** Closed, it throws your shots back unless you're in focus (`foeShot`, `src/sim/combat.ts:239`). It opens to sweep a beam, and only one Prism sweeps at a time (`src/sim/foes.ts:744`).
**Tell → window.** Sweep tell 1.0 s, soft (×1.5) during it. Still reflects while sweeping. Recover 1.2 s at ×2.
- [ ] Faces that open and close.
- [ ] A glass ring on each reflect, not the shared `graze`.
