# Gunboat

*Scrap.* Scores and the other enemies: [the overview](README.md).

Elite chain 2 · graft DASH (a broadside fan) · only where there's water, else a Technical comes (`src/sim/director.ts:271`).

**Who it is.** A broadside boat, built wherever there's water: Court longboats off Vesh, Hesk river barges on Oru-Tal. The people who built it learnt naval war from old books carried on the arks, so it fights like a ship of sail: turn a flank, fire everything, turn the other. The deck gun was the crew's own idea.
**Ship's log.** *"Fights like a picture in an ark history book. Stay off its flanks."*

**Now.** Patrols the water, turns a flank to you, fires three volleys out of it; its deck gun picks at you between (`src/sim/foes.ts:855`). Wake foam (`src/view/level-view.ts:1882`).
**Tell → window.** Sweep tell on the flank, 1.0 s. Recover 1.5 s.
**Weak.** The deck gun fires every 1.5 s with no tell (`:868`).
- [ ] Tell the deck gun (the head turns and holds), or drop it while the broadside is up.
- [ ] Port flashes from its `port` mounts; a cannon roll for the volleys.
