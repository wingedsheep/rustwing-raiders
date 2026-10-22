# Warden

*Lattice.* Scores and the other enemies: [the overview](README.md).

Elite chain 3 · an elite comes with a Prism (`src/sim/director.ts:244`).

**Now.** A shield in front that stops shots from its arc; it drops the shield to fire a bar of five (`src/sim/foes.ts:688`). Enough fire into the shield cracks it (`wearGuard`, `src/sim/combat.ts:262`). Hex-dome shield view (`src/view/shields.ts`).
**Tell → window.** Wide line tell 1.0 s. Unshielded through the attack, recover 1.6 s; cracked, a 2.2 s stagger.
- [ ] Its shield emitter should open on the windup.
- [ ] A click before the bar, a tone that rises as the shield wears.
