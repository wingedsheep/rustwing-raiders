# Technical

*Scrap.* Scores and the other enemies: [the overview](README.md).

Elite chain 3 · not plated.

**Who it is.** A work truck with a gun on the bed: a salt-cutter's hauler on Kessra, a lodge truck on Oru-Tal, a crawler-barge scout on Ashgrave. Nobody builds a technical; everybody makes one. It tears in, skids, empties the gun and drives off, because it has a day job to get back to.
**Ship's log.** *"Somebody's work truck. They'd like it back in one piece."*

**Now.** A gun truck: tears in from the side, skids, empties its bed gun down a locked line, drives on; two bursts, then gone (`src/sim/foes.ts:900`). Driven by a rig, not a clip (`src/view/car-rig.ts`): wheels roll and steer with its real motion, it sits on the slope, dives into the skid with its tail slewed out, bucks with each burst, and tears off in grit and exhaust; dust plume, skid fan, tyre marks.
**Tell → window.** Line 0.65 s, locks at 0.4 s. Recover 1.1 s at ×1.8, but it's driving off at 7 u/s while open.
**Weak.** No gun sound of its own (its motor, skid and getaway have theirs: `truck`, `skid`, `truck_rev`).
- [ ] Tune: stand still for the first half of recover.
