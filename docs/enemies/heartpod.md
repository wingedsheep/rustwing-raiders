# Heartpod

*Bloom.* Scores and the other enemies: [the overview](README.md).

Elite chain 2 · graft AUX (bind the nearest enemy).

**Who it is.** The bloom's hearth. The grow-houses on Morang fed every bed from one heart of mould, sharing out what each needed, by the Tonkva's oldest rule: nobody warmer than their neighbour. With no ledger, the hearts still share. They tie themselves to whatever fights beside them and pass it their own strength. Kill the heart and the sharing stops.
**Ship's log.** *"It shares. That's the problem. Heart first."*

**Now.** Tethers up to three nearby enemies: they take ×0.35 and heal 4% a second (`src/sim/foes.ts:781`, `takenNow` in `src/sim/combat.ts:229`). Breathes a slowing ring wave. Always comes with friends (`src/sim/director.ts:258`).
**Tell → window.** Ring tell 0.8 s. Recover 1.4 s.
**Weak.** ×0.35 and 4%/s together make a linked Bulwark nearly unkillable until the pod dies; the lesson is right, the numbers are untested. The tethers have no sound.
- [ ] Tune on the bench: ×0.5 and 3%/s against today's.
- [ ] A heartbeat that quickens on the windup; a wet snap when a tether breaks.
