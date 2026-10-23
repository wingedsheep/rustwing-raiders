# Burrower

*Wild.* Scores and the other enemies: [the overview](README.md).

Plated; untouchable while under.

**Who it is.** A soil-turner. The Tonkva seeded them on Oru-Tal to work new ground: a long armoured body that swims through earth and comes up wherever the ground hums. With no ledger to name the plots, it turns over anything that hums: drills, lodge trucks, a ship's engines flying low. It doesn't want to eat you. It thinks you're a field.
**Ship's log.** *"It hears our engines through the ground. Watch for the bulge."*

**Now.** Under the ground and untouchable, it swims after you, its back plates breaking the surface along a furrow of dust; then the ground boils and it erupts with a slam and a ring wave, rearing up to the flight line in a hook out of its crater, mandibles flung wide; it writhes there exposed, then pours itself back down the hole (still shootable on the way) and goes again (`src/sim/foes.ts`). Drawn by a procedural rig, not clips: head, jaws and twelve ring segments laid along an arch from the hole (`src/view/worm-rig.ts`).
**Tell → window.** Circle tell 0.8 s at the eruption. Out 2.4 s, then 0.45 s going under.
**Weak.** Its sounds are borrowed (the Throne-Shell's breach and dive, a low shriek, the heavy thump).
- [ ] Its own rumble, roar and gulp.
