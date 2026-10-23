# Bulwark

*Lattice.* Scores and the other enemies: [the overview](README.md).

In code it's still `warden`. Elite chain 3 · an elite comes with a Prism (`src/sim/director.ts:244`).

**Who it is.** A tally-guard; pilots call it a bulwark. At every Tonkva gate, small machines stood at the ring and held back whatever hadn't been counted: a shield in front, and behind it a core that counts. The Engine's own are walking out of the ice; the Compact and Vantorr build copies round dug cores. It drops its shield to fire five at once, a tally mark. It is counting you.
**Ship's log.** *"Counts in fives. When the shield drops, it's our turn too."*

**Now.** A shield in front that stops shots from its arc; it drops the shield to fire a bar of five (`src/sim/foes.ts:688`). Enough fire into the shield cracks it (`wearGuard`, `src/sim/combat.ts:262`). Hex-dome shield view (`src/view/shields.ts`).
**Tell → window.** Wide line tell 1.0 s. Unshielded through the attack, recover 1.6 s; cracked, a 2.2 s stagger.
- [ ] Its shield emitter should open on the windup.
- [ ] A click before the bar, a tone that rises as the shield wears.
