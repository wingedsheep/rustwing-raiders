# Swooper

*Wild.* Scores and the other enemies: [the overview](README.md).

Elite chain 3.

**Now.** Circles high; its shadow tracks you, then holds; it dives through the mark in a curve and climbs away (`src/sim/foes.ts:556`). Only harmful near the mark (`winded`, `src/sim/combat.ts:421`).
**Tell → window.** Circle tell 1.1 s, follows you for the first half. Recover 1.3 s at ×2 while it climbs. Parryable.
**Weak.** No screech, though its tip promises one.
- [ ] A screech on the windup (`docs/alien-voices.md` has the recipe), a wing-beat on the climb.
- [ ] Clips: fold wings on the dive, flap on the climb.
