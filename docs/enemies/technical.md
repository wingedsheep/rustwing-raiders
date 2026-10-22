# Technical

*Scrap.* Scores and the other enemies: [the overview](README.md).

Elite chain 3 · not plated.

**Now.** A gun truck: tears in from the side, skids, empties its bed gun down a locked line, drives on; two bursts, then gone (`src/sim/foes.ts:900`). Dust trail (`src/view/level-view.ts:1879`).
**Tell → window.** Line 0.65 s, locks at 0.4 s. Recover 1.1 s at ×1.8, but it's driving off at 7 u/s while open.
**Weak.** No engine, skid or gun sound of its own.
- [ ] Tune: stand still for the first half of recover.
- [ ] A skid clip (the bed slews) and a skid sound.
