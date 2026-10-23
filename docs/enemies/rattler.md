# Rattler

*Scrap.* Scores and the other enemies: [the overview](README.md).

Not plated.

**Who it is.** A wreck-chaser. Salvage law in the Reach is old and simple: the first hull alongside a wreck owns it. Rattlers are built to get there first: an engine, a seat, a bumper and nothing else, bolted so loose they rattle. They follow battles, and they follow you, because a ship in a fight is a wreck that hasn't happened yet. Ramming you and then sitting in front of you is, in salvage law, a claim. They were built to start a race, never to win one, so a boost leaves them behind.
**Ship's log.** *"It thinks we're salvage. Prove it wrong, fast."*

**Now.** Waits under the bottom edge behind a chevron, then chases faster than the level. Boost and it falls behind and spins out (OUTRAN, `src/sim/foes.ts:298`). Close behind you, it rams up the screen, then brake-checks in front of you for 2.5 s (`:330`).
**Tell → window.** Edge chevron 1.0 s, then a ram line that locks at once and lasts 0.35 s (`:309`). The brake-check is open (×1.5) but its body still hurts (`winded`, `src/sim/combat.ts:419`).
**Weak.** The 0.35 s ram tell is the shortest in the game.
- [ ] Tune: ram tell 0.5 s, or a short track before it locks.
- [ ] Make the rattle a sound.
