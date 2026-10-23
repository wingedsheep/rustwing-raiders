# Parry rules and feedback

Decision, 2026-10-23. **Only small, discrete, bullet-like projectiles can be parried.** Parry is one defensive answer alongside movement and dash; it cannot answer every attack. These rules are implemented for flight combat.

## What can be parried

| Attack | Parry or late block? | Response |
|---|---|---|
| Ordinary small bullets / orbs | Yes | Time the guard to reflect them; an early guard can block them after the parry window. |
| Small needles, shards, or thorns | Yes | Same rule regardless of the enemy or faction firing them. |
| Individual small flying spores | Yes | These are discrete shots. A spore cloud is a different attack. |
| Large or heavy projectiles | No | Move or dash out of their path. |
| Torpedoes | No | Evade or shoot them down. Their small-looking nose does not make the missile a small bullet. |
| Seekers | No | Dodge them. Guns and fire pass through; read the drawn lane at each square turn. |
| Mines, explosive pods, and rounds that split | No | Avoid the parent attack. Small ordinary bullets released by it are individually eligible. |
| Continuous lasers, beams, and laser gates | No | Leave the beam or time a dash. The guard does not turn off the emitter or damage its owner. |
| Shell impacts, explosions, shockwaves, slams, and wrecking balls | No | Read the warning and move or dash clear. |
| Acid puddles, spore clouds, terrain, and other persistent hazards | No | Leave the affected area. |
| Enemy bodies, dives, melee, rams, and boss charges | No | Evade; a guard cannot stagger a charging body. |
| Harpoons and an existing grab | No | Evade the harpoon or use the existing dash/shooting escape rules. Parry does not release a grab. |

The late block uses exactly the same eligibility rule. An attack that cannot be parried cannot be made safe by raising the guard earlier.

## Why this boundary

Small bullets are discrete objects that can visibly be caught and thrown back. A continuous beam, a large missile, or a ship's body carries a different expectation: move away from it. Keeping that distinction consistent makes enemy attacks easier to learn and preserves a reason to dodge even on a ship built around parry.

The rule follows the attack, not the enemy's rank. A boss's ordinary small bullet can be parried; a weak enemy's mine cannot. Dense patterns can mix both kinds, requiring the player to choose position as well as timing.

Raising the guard grants no general invulnerability. A successful parry also grants no general invulnerability: it removes the eligible shots it actually catches, while preserving the normal rewards of reflection, special charge, perfects, and riposte. A simultaneous beam, blast, body collision, or heavy projectile can still hit. Existing damage recovery, phase, and dash mechanics remain separate defenses.

## Inspiration from Dead Cells

Dead Cells distinguishes attack categories and gives successful shield timing a direct reward: ranged attacks are reflected, while shockwaves are excluded from the ordinary shield parry rule. Its rules are broader than ours: melee attacks and bombs can also be parried, and its shield documentation describes absorbing explosions. We deliberately use a narrower subset to follow the small-projectile-only decision above. [Dead Cells shield mechanics](https://deadcells.wiki.gg/wiki/Shields)

The developer also describes the difference between holding a shield and tapping it for a parry. That is useful inspiration for rewarding timing and making a missed timing window matter. Our existing short guard burst and late block retain their own timing and cooldown rules. [Motion Twin's shield/parry notes](https://deadcells.com/patchnotes/4)

The lesson we take is a dependable distinction between attacks, with a useful reward for the correct response. The exact list above is this game's design, not a claim about Dead Cells' complete exception list. Sources checked on 2026-10-23.

## Implementation contract

`src/sim/parry.ts` defines one eligibility predicate, shared by the guard and autopilot. An eligible projectile must be alive, have kind `orb`, `needle`, or `spore`, have collision radius greater than zero and at most **0.6 world units**, and have neither splitting payload nor shoot-down hit points. Ordinary rounds default to radius 0.45. The combination of kind, size, and payload prevents a heavy attack becoming parryable just because it travels through the bullet system.

The guard applies the predicate before both reflection and late blocking. Noneligible attacks continue into their ordinary collision handling. Lasers always use their normal damage path; there is no laser-parry branch. The unused legacy helper that could stagger lunging enemies, stop charges, or break harpoons has been removed. The autopilot only attempts a parry for eligible shots.

New attacks must respect the visual distinction: use small discrete shapes for eligible shots, and the established large bodies, missile shapes, beams, area warnings, or hazard surfaces for attacks that bypass guard. A new projectile kind defaults to ineligible until explicitly reviewed. New visual markers or an additional warning colour are future presentation work, not part of this implementation.

## Feedback and co-op

Combat feedback must not change the shared simulation clock. Flight and boarding now run without cinematic slow motion or hitstop, including heavy hits, perfects, takedowns, boss deaths, loot, grafts, and core effects. Particles and animations advance normally too. A partner's successful action must not steal movement or input time from the other player.

A parry keeps its ship-local rings, sparks, guard reaction, reflected shots, text, and positioned sound. It no longer triggers a full-screen paper/ink flash, screen tint, chromatic aberration, camera shove, camera punch, or music duck. The accompanying perfect-parry event follows the same rule. Other events retain their existing visual feedback, but cannot slow or freeze time.

This removes presentation-driven changes to the whole game's speed. It does not remove deliberate gameplay effects such as a ship being slowed by a hazard or THE LONG SECOND slowing enemy bullets; those do not slow either player's input clock.

## Verification targets

- Eligible bullets reflect once, award the normal perfect/riposte rewards, and cannot award twice after removal.
- Early/late guard timing preserves the existing parry versus block distinction for eligible shots.
- Heavy rounds, missiles, mines, oversized ordinary rounds, and splitting rounds bypass both parry and late block.
- Raising guard, or reflecting a small bullet, cannot make a simultaneous beam or area attack harmless.
- One player's parry does not change the other player's resources or interrupt either player's simulation steps.
- Normal and perfect-parry events retain local feedback without writing full-screen or camera effects.
- Both flight and boarding advance at their normal rate through combat events.
