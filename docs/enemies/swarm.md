# Swarm

*The old guard.* Scores and the other enemies: [the overview](README.md).

**Who it is.** Small creatures that come in clouds. They don't shoot; they mob. No power owns a swarm: it's the world's own wildlife, defending its sky, or chasing your lights.
**Ship's log.** *"Not a weapon. Just a lot of very angry wildlife."*

**Worn as.**

| Planet | Name | What it is |
|---|---|---|
| Oru-Tal | Pterosaur | Vask's flocks, mobbing anything in her sky |
| Halcyon | Lantern Jelly | drifting sky-jellies that follow light, a lantern's or yours |
| Mirefall | Glowmoth | moths drawn to warmth, as the Tonkva were |
| Vesh | Shrimp Kite | the lagoon's flying shrimp, feeding in the umora's wake |

**Now.** 10–17 at once, homing with a wobble, fleeing after 7 s (`src/sim/enemies.ts:229`). Doesn't shoot.
**Weak.** No tell; contact is the attack. Not in any parry or punish rule.
- [ ] A readable approach: they gather, then commit as a flock.
