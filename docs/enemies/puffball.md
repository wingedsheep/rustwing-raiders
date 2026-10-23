# Puffball

*Bloom.* Scores and the other enemies: [the overview](README.md).

Fodder · no chain.

**Who it is.** A spore sac that drifts until something warm goes by. The mould was raised in hothouses and still loves heat, and a boosting engine is the warmest thing on Mirefall. It follows the heat, and when it bursts the spores get into the guns.
**Ship's log.** *"Don't boost near the balloons."*

**Now.** Drifting spore mines in a loose line. Boost near one and it swells and chases you for 3.5 s; killed, it bursts into a jamming spore cloud (`src/sim/foes.ts:828`, `puff` in `src/sim/combat.ts:380`).
**Tell → window.** Swell 0.4 s. No window: it's a rule about the boost.
**Weak.** The spore burst has no sound (`src/view/level-view.ts:666`).
- [ ] A wet pop on death, a hiss on the chase.
