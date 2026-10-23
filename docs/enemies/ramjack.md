# Ramjack

*Scrap.* Scores and the other enemies: [the overview](README.md).

Elite chain 3 · graft DASH (a ram down a drawn line).

**Who it is.** A lantern tug with a ram welded on. At every lantern, reactor tenders shove fuel barges into the ring with stubby jack-tugs. After Nine Wells thousands were sold off cheap, and every power with a welding torch turned them into weapons. It still flies like a tug: line up, lock on, shove. It was built to push things into a ring, not to stop, so after a lunge it spins out. Into a rock, it crashes: tugs never had to steer.
**Ship's log.** *"Tug with a grudge. Step aside and it does the rest."*

**Now.** Hovers high, lines up only when you're well below it, locks a body-wide line, lunges at 40 u/s, then spins out (`src/sim/foes.ts:207`). Into a rock it crashes, takes 30% and staggers 1.8 s (`:248`). Leaves after three lunges.
**Tell → window.** Line tell 0.85 s, locking at 0.5 s. Recover 1.1 s at ×2 damage (`TAKEN`, `src/sim/combat.ts:196`). Parryable while lunging (`:385`).
**Weak.** No rev before the lunge.
- [ ] Clips: rock back on the windup, a spin-out on recover.
- [ ] A two-stroke rev on the tell, a clank on a crash.
