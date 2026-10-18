# Backlog

Playtest feedback and design to-dos. Not in priority order.

## Run map & progression
- ~~The map is confusing. Rework its UI/UX.~~ Done: sites in reach shine and get a route line (cyan for a hop, amber for a long jump), the rest are dimmed, a crossing strip at the top shows where you are, the Sweep and the gate, and there's an icon legend.
- ~~Make progression clearer. Start with simple encounters and make them harder step by step.~~ Done: sector 1 has no elites and no planet on alert, the first jumps of each sector are gentle, and every fight shows a five-step THREAT rating (EASY to BRUTAL) that rises with the sector and with each stop.
- ~~Choices on the map should be clear and should matter. Before the player picks a node, show a preview of roughly what that encounter is.~~ Done: the encounter card shows a live 3D diorama for fights (the real biome, the planet's enemies, the elite and its ring, race rings, the Warden), painted art for docks, dealers and known events, and static for unknown ones. Below it: threat, loot, who you'll face, and the jump cost.
  - Follow-up: escort and other objective modes will need their own diorama once they exist (`src/view/encounter-preview.ts`).

## Controls & combat feel
- Combat still feels one-dimensional. Rethink the controls from the ground up.
- Study the best: **Dead Cells** and **Hades** (dash timing, i-frames, cancel windows, attack/skill/dash layering, button layout).
- Boost and dash don't feel like they're on the right controller buttons yet. Re-evaluate the gamepad layout.

## Parts / loot
- It's unclear what you're choosing when picking parts. Improve the UI/UX: clear stats, comparison with the equipped part, what changes.
- Add randomness to drops: rarity tiers plus rolled stats.
- Legendary drops should feel unique and rare, strong enough that you can build your ship around one for that run.
- Goal: every run feels unique and different because of what drops.
- Ship building should be a major part of the skill and the experience. Take the variety of weapons and combinations in **Dead Cells** as the reference, then go further: wild ship builds with parts that work together (synergies, build-defining combos).
- Model the new parts from the builds rework. Until then they show on ships as placeholder tinted boxes, one per cell: blue for dash mods, amber for aux, purple for passives (`src/view/ship-model.ts`).
  - The parts: the dash mods, the aux parts (Parry Emitter, Grapple Tether, Decoy Flare, Void Siphon), the passives, the duo parts, the Sentry Pod and the Velocity Lance.
  - Add `part_<id>` templates in `tools/models/ships.py`.
  - L-shaped and line parts must turn about their first cell, to match `rot` in `src/sim/build.ts`.
  - Each part's look should hint at what it does (its verb), so a build is readable on the ship itself.

## Enemy attacks
- Enemy attacks look too generic, like any other bullet-hell shmup. Improve the projectile and attack visuals.
- Add more kinds of attack beyond bullets: beams, sweeps, mines, homing, area denial, telegraphed charges, and so on.

## Bosses & elites: learnable patterns
- Bosses, and some elite enemies in normal levels, should have attack patterns you can learn, like a soulslike.
- Reference: **Hollow Knight / Silksong**. Clear tells, readable patterns, fair punishes. You get better by learning the fight, not just by getting stronger stats.

## Level variety
- Most levels are wave fights or boss fights. Mix in occasional variety levels:
  - Races
  - Escort / protect a convoy
  - (other objective-based modes)
- Racing levels don't feel like races yet; they feel slow. Research **Galactic Racer** and what players say about it (sense of speed, boost, track feel) and use that to improve the racing experience.
- In races it's hard to see where the track is and what the obstacles are. Make the track boundaries and obstacles clearly readable at speed.

## Biomes & exploration
- Every biome should feel different, unique and beautiful (Hollow Knight / Silksong as the benchmark).
- Add a sense of exploration and discovery between and within biomes.
