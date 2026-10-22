# Lancer

*The old guard.* Scores and the other enemies: [the overview](README.md).

Elite chain 2.

**Now.** Hovers and sweeps a beam through where you are; the beam is drawn 1.0 s first (`src/sim/enemies.ts:307`, `telegraph` sound at `src/view/level-view.ts:845`).
**Tell → window.** Sweep 1.0 s, beam 0.55 s, recover 1.2 s at ×1.8.
**Weak.** Plays the same as the Prism without the reflect.
- [ ] Give it a difference: it tracks a little during the sweep, or fires twice.
