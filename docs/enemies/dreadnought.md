# Dreadnought

*Scrap.* Scores and the other enemies: [the overview](README.md).

`blimp` · elite chain 2.

**Who it is.** A caravan airship. On Kessra the salt caravans cross the pans under gas bags, and the houses guard them with blimps that carry guns down both flanks. Any power that can patch a bag flies one now. It's slow, proud and hard to sink, and it drops mines from the gondola because nobody aboard can see what's under it.
**Ship's log.** *"A bag of gas with opinions. Slow to turn; use that."*

**Now.** A heavy airship: noses in, fires a broadside out of one flank and then the other, and drops parachute mines from its gondola (`src/sim/foes.ts:947`).
**Tell → window.** Sweep tell 1.1 s, then 0.8 s for the second flank. Recover 1.8 s after both.
**Weak.** Mines every 3.2 s with no tell (`:963`). Its tip says "get above it", but nothing rewards being above it.
- [ ] Tell the mines (a hatch opens), or tie them to the windup.
- [ ] Make the tip true: a soft top, or no broadside upwards.
- [ ] Engine drone and creaks of its own.
