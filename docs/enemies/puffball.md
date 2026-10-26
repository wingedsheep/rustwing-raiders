# Puffball

*Bloom.* Scores and the other enemies: [the overview](README.md).

Fodder · no chain.

**Who it is.** A spore sac that drifts until something warm goes by. The mould was raised in hothouses and still loves heat, and a boosting engine is the warmest thing on Mirefall. It follows the heat, and when it bursts the spores get into the guns.
**Ship's log.** *"Don't boost near the balloons."*

**Now.** Spore mines sinking down the screen in a loose line, quicker than the ground (`PUFF`, `src/sim/foes.ts`). Come within 4.5 of one and it stops and swells, then bursts: a blast, and a spore cloud that burns for 3 s as it sinks. Boost near one and it swells and chases you for 3.5 s, and bursts when it gets there. Shot down, it only puffs a jamming spore cloud (`puff` in `src/sim/combat.ts`). One that bursts on its own counts as missed.
**Tell → window.** Swell 0.55 s, its burst ring drawn round it: get out of the ring, or shoot it while it swells and it only puffs.
**Weak.** The spore burst has no sound (`src/view/level-view.ts:666`).
- [ ] A wet pop on death, a hiss on the chase.
