# Burrower

*Wild.* Scores and the other enemies: [the overview](README.md).

Plated; untouchable while under.

**Now.** Under the ground and untouchable, it follows you; then erupts with a slam and a ring wave, sits exposed, and goes under again (`src/sim/foes.ts:627`).
**Tell → window.** Circle tell 0.8 s at the eruption. Recover 1.8 s.
**Weak.** Its tip promises "a ripple comes for you", but nothing is drawn while it's `hidden` (`src/view/level-view.ts:1828`).
- [ ] Draw the ripple (dust and a moving bulge) while hidden.
- [ ] A rumble under the ground, a roar on the eruption.
