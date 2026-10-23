# Flakker

*Scrap.* Scores and the other enemies: [the overview](README.md).

Elite chain 3 · not plated.

**Who it is.** The cheapest gun of the Toll War. Flak batteries were taught to fire where a titan would be in two seconds, and titans never changed pace. Every power has some now, dug out of the glass and bolted to a rock or a truck bed. They still aim at where you're going, and still can't follow a ship that changes its mind.
**Ship's log.** *"Shoots where we're going. So let's not go there."*

**Now.** Ground flak. Shells two or three markers ahead of where you'll be, landing 1.3–1.8 s later (`src/sim/foes.ts:529`). Change pace and they miss.
**Tell → window.** The real tell is the shell markers; the 0.5 s windup circle before them adds little. Recover 1.6 s.
**Weak.** Its loop is the Spitter's with shells for acid.
- [ ] A thump per shell going up, so the count can be heard.
