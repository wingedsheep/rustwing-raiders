# Halo

*Lattice.* Scores and the other enemies: [the overview](README.md).

Elite chain 3 · graft AUX (a ring of shards).

**Who it is.** A counting ring: a gate's ring the size of a cart wheel, made to count what passes round it. Its first ring of shards leaves a gap where you are, because you're the one entry it hasn't made yet. Then it turns and counts again.
**Ship's log.** *"Leaves a hole where we are. Then it moves the hole. Keep up."*

**Now.** A ring drone: two rings of shards, the first with its gap where you are, the second's gap turned the way it spins (`src/sim/foes.ts:1033`).
**Tell → window.** A plain ring tell 0.95 s. Recover 1.3 s.
**Weak.** The tell doesn't show either gap, so the lattice's "draw it first" rule is broken here. The second gap is only 0.6 rad off the first.
- [ ] Draw both gaps in the tell, the second one dimmer.
- [ ] Tune: second gap offset 0.6 rad → test 0.9.
