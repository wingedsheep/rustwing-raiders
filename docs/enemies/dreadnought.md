# Dreadnought

*Scrap.* Scores and the other enemies: [the overview](README.md).

`blimp` · elite chain 2.

**Now.** A heavy airship: noses in, fires a broadside out of one flank and then the other, and drops parachute mines from its gondola (`src/sim/foes.ts:947`).
**Tell → window.** Sweep tell 1.1 s, then 0.8 s for the second flank. Recover 1.8 s after both.
**Weak.** Mines every 3.2 s with no tell (`:963`). Its tip says "get above it", but nothing rewards being above it.
- [ ] Tell the mines (a hatch opens), or tie them to the windup.
- [ ] Make the tip true: a soft top, or no broadside upwards.
- [ ] Engine drone and creaks of its own.
