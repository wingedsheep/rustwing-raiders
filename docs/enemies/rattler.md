# Rattler

*Scrap.* Scores and the other enemies: [the overview](README.md).

Not plated.

**Now.** Waits under the bottom edge behind a chevron, then chases faster than the level. Boost and it falls behind and spins out (OUTRAN, `src/sim/foes.ts:298`). Close behind you, it rams up the screen, then brake-checks in front of you for 2.5 s (`:330`).
**Tell → window.** Edge chevron 1.0 s, then a ram line that locks at once and lasts 0.35 s (`:309`). The brake-check is open (×1.5) but its body still hurts (`winded`, `src/sim/combat.ts:419`).
**Weak.** The 0.35 s ram tell is the shortest in the game.
- [ ] Tune: ram tell 0.5 s, or a short track before it locks.
- [ ] Make the rattle a sound.
