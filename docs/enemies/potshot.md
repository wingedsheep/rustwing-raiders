# Potshot

*Scrap, light.* Scores and the other enemies: [the overview](README.md).

**Who it is.** A shell drum with a slug-gun through its lid and one gunner inside. It's cheap, so they come in fours. Every scrap power fields them, because a drum and a gun is what's left after a war.
**Ship's log.** *"One shot each, then they run. Make it none."*

**Now.** Comes in 3 or 4, in lanes on alternating sides, so you sway between them (`src/sim/director.ts`). Each drops in to a spot, stops, flares, and fires one aimed slug (two from difficulty 0.5). It sits a moment, then runs off up its own side (`src/sim/foes.ts:320`).
**Tell → window.** A tracking line, 0.7 s, locking at 0.45 s. A 0.9 s recover after the shot, open. Kill it before it fires and it never does.
- [ ] A barrel that glows as it charges, and a hollow *thunk* for the shot.
