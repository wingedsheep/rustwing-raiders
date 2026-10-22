# Gunboat

*Scrap.* Scores and the other enemies: [the overview](README.md).

Elite chain 2 · graft DASH (a broadside fan) · only where there's water, else a Technical comes (`src/sim/director.ts:271`).

**Now.** Patrols the water, turns a flank to you, fires three volleys out of it; its deck gun picks at you between (`src/sim/foes.ts:855`). Wake foam (`src/view/level-view.ts:1882`).
**Tell → window.** Sweep tell on the flank, 1.0 s. Recover 1.5 s.
**Weak.** The deck gun fires every 1.5 s with no tell (`:868`).
- [ ] Tell the deck gun (the head turns and holds), or drop it while the broadside is up.
- [ ] Port flashes from its `port` mounts; a cannon roll for the volleys.
