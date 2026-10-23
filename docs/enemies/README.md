# Enemies: where each one stands

Every regular enemy in the game, how worked-out it is, and what it still needs. This page has the scores and what they share; each enemy has a page of its own (linked from the table and the lists below). Bosses are in [`docs/bosses/`](../bosses/README.md).

Each page opens with **who it is** (who builds or breeds it, and why it fights the way it does, from the [lore](../lore/README.md)) and a **ship's log** line: what your own core would write about it ([tone](../lore/tone.md#how-its-told), rule 7; not built). The old guard's pages also list what each planet's version is (**worn as**).

The aim for each enemy: a clear personality, a pattern you can learn (Hollow Knight and Silksong: a **tell**, a **commit**, then an **open** window you can punish), a good model with animations, and its own sounds.

## The scale

Each enemy gets a score from 0 to 3 on five axes:

| Score | Meaning |
|---|---|
| 0 | Missing |
| 1 | Placeholder or rough |
| 2 | Works |
| 3 | Done and polished |

- **Personality**: does it have an identity beyond its stats? A shape, a habit, a way it makes you fly.
- **Pattern**: a distinct tell, a committed attack, then a window you can learn to punish.
- **Model**: a model of its own that reads well from above, at 32 pixels.
- **Animation**: an idle loop, plus clips driven by its state (windup, attack, recover, stagger, death).
- **Sound**: its own sounds for the tell, the attack and the death.

The scores are conservative. A 3 means the code clearly shows it. Nothing scores 3 on model, animation or sound yet.

### What every enemy shares today

So the per-enemy notes don't repeat it:

- **One loop.** Every foe runs `idle → windup → attack → recover`, with `stagger`, `dodge` and `hidden` on some (`src/sim/combat.ts:6`, `go` at `:152`). Hits in `recover` and `stagger` land harder, per kind (`TAKEN`, `src/sim/combat.ts:195`).
- **Plating** on everything bigger than fodder (`PLATED`, `src/sim/combat.ts:293`). Elites wear gold armour and **chain** 2–3 attacks (`CHAIN`, `src/sim/combat.ts:129`).
- **Tells are drawn flat** on the flight plane in the faction's colour (`src/view/threats.ts`): lines, sweeps, circles, rings, locks, spins, gates.
- **The body's tell is the same for all:** a glow that ramps through the windup and flickers at the end, an 8% crouch, a pulse while open (`src/view/level-view.ts:1826`).
- **Models:** every enemy has its own (`enemy_<its name>` in `public/models/enemies.glb`, from `tools/models/enemies_<planet>.py`, `enemies_scrap.py` and `enemies_order.py`), with one idle clip; the archetype models are the fallback (`cloneEnemy`, `src/view/enemy-model.ts`). Foes are outlined. None of the new models has been reviewed in a fight yet, so model scores stop at 2.
- **Sound:** one windup sound per faction (`laser_charge`, `hook` or `overheat`, `src/view/level-view.ts:578`), one `enemy_shot` pitched per faction (`:450`), and `explode_small` / `explode_big` for every death (`:443`).

---

## Overview

P = Personality, Pt = Pattern, M = Model, A = Animation, S = Sound.

| Enemy | Faction / where | Role | P | Pt | M | A | S | Top need |
|---|---|---|---|---|---|---|---|---|
| [Ramjack](ramjack.md) | scrap: Orutal, Kessra, Ashgrave, Vesh | Lunger | 2 | 3 | 2 | 1 | 1 | A rev on the tell |
| [Rattler](rattler.md) | scrap | Chaser from behind | 2 | 2 | 2 | 1 | 1 | Longer ram tell |
| [Hookjaw](hookjaw.md) | scrap | Harpoon, pins you | 2 | 3 | 2 | 1 | 1 | A winch sound |
| [Torpedo Rig](torpedo-rig.md) | scrap | Homing pressure | 2 | 2 | 2 | 1 | 2 | Make the reload window reachable |
| [Pirate Ace](pirate-ace.md) | scrap (and bounty) | Rival | 2 | 2 | 2 | 1 | 1 | An open window after its burst |
| [Flakker](flakker.md) | scrap | Ground artillery | 1 | 2 | 2 | 1 | 1 | A body tell of its own |
| [Technical](technical.md) | scrap | Gun truck | 2 | 2 | 2 | 1 | 1 | Skid and engine sounds |
| [Gunboat](gunboat.md) | scrap, water only | Broadside boat | 2 | 2 | 2 | 1 | 1 | Telegraph the deck gun |
| [Dreadnought](dreadnought.md) | scrap | Heavy airship | 2 | 2 | 2 | 1 | 1 | Tell the mines |
| [Sower](sower.md) | wild, bloom | Diver | 2 | 3 | 2 | 2 | 1 | A whirr on the spin-up |
| [Burrower](burrower.md) | wild | Ambusher | 2 | 2 | 2 | 1 | 1 | Draw the ripple |
| [Spitter](spitter.md) | wild, bloom | Ground lobber | 1 | 2 | 2 | 1 | 1 | Something the Flakker doesn't do |
| [Sky Manta](sky-manta.md) | wild, bloom | Crossing heavy | 2 | 2 | 2 | 1 | 1 | Show which thorns ripen when |
| [Bulwark](bulwark.md) | lattice: Halcyon, Glacis, Cinder | Shield | 2 | 3 | 2 | 1 | 1 | Open its emitter on the windup |
| [Prism](prism.md) | lattice | Reflector, sweeper | 2 | 3 | 2 | 1 | 1 | Faces that open and close |
| [Gatekeeper](gatekeeper.md) | lattice | Gate pylon | 1 | 2 | 2 | 1 | 1 | Give the pylon something to do |
| [Spindle](spindle.md) | lattice | Spinning pylon | 2 | 3 | 2 | 1 | 1 | A spin-up sound |
| [Halo](halo.md) | lattice | Ring drone | 1 | 2 | 2 | 1 | 1 | Draw the gaps in the tell |
| [Rook](rook.md) | lattice | Square-turning seekers | 2 | 3 | 2 | 1 | 2 | A death of its own |
| [Heartpod](heartpod.md) | bloom: Mirefall, spore vents | Healer, linker | 2 | 2 | 2 | 1 | 1 | Tune the heal and toughness |
| [Puffball](puffball.md) | bloom | Spore mine (fodder) | 2 | 2 | 2 | 1 | 1 | A wet pop and a spore sound |
| [Loot Runner](loot-runner.md) | bounty | Escaping target | 1 | 1 | 2 | 1 | 1 | A tell on its jink |
| [Strongbox](strongbox.md) | bounty | Hauled by two tugs: cut them loose | 2 | 2 | 2 | 1 | 1 | A model for the tug |
| [Iron Crate](iron-crate.md) | bounty | Dash check | 2 | 1 | 2 | 1 | 1 | A crack sound of its own |
| [Dart](dart.md) | old guard, every planet | Formation fodder | 1 | 1 | 2 | 1 | 1 | Tells on the non-dive paths |
| [Swarm](swarm.md) | old guard | Homing fodder | 1 | 0 | 2 | 1 | 1 | A readable approach |
| [Gunship](gunship.md) | old guard | Hover and fan | 1 | 2 | 2 | 1 | 1 | A longer open window |
| [Turret](turret.md) | old guard | Ground gun | 1 | 1 | 2 | 1 | 1 | A tell shape |
| [Bomber](bomber.md) | old guard | Mine layer | 1 | 1 | 2 | 1 | 1 | Telegraph the mines |
| [Lancer](lancer.md) | old guard | Beam sweeper | 1 | 3 | 2 | 1 | 1 | Separate it from the Prism |
| [Brute](brute.md) | old guard | Armoured charger | 2 | 3 | 2 | 1 | 1 | Charge and slam sounds |
| [Serpent](serpent.md) | old guard | Segmented weaver | 1 | 1 | 2 | 1 | 1 | Tell the head's fan |
| [Carrier](carrier.md) | old guard | Launches swarms | 1 | 1 | 2 | 1 | 1 | A tell on the launch |

---

## Scrap

Metal you bolted together yourself: the Hesk, the Uukhvar, the Sankvi and the Lowtide Court. Each is to get one foe of its own on top of this shared roster ([scrap](../factions/scrap.md#each-powers-own-designed-not-built)). Tell grammar: **flare** (engines flare red, then they commit, `TELL` in `src/sim/factions.ts:188`). Roster and weights at `src/sim/factions.ts:131`. Their models are in `tools/models/enemies_scrap.py`.

- [Ramjack](ramjack.md)
- [Rattler](rattler.md)
- [Hookjaw](hookjaw.md)
- [Torpedo Rig](torpedo-rig.md)
- [Pirate Ace](pirate-ace.md)
- [Flakker](flakker.md)
- [Technical](technical.md)
- [Gunboat](gunboat.md)
- [Dreadnought](dreadnought.md)

## Wild

The native beasts, on any biome with creatures (`factionsIn`, `src/sim/factions.ts`). Tell grammar: **rear** (crouch back, the shadow falls where they'll land). Their models are in `tools/models/enemies_order.py`.

- [Sower](sower.md)
- [Burrower](burrower.md)
- [Spitter](spitter.md)
- [Sky Manta](sky-manta.md)

## Lattice

The old machine and its copies. Tell grammar: **draw** (the whole attack in light first, a full second). Designed, not built: a lattice foe now and then **listens** to the Engine instead of attacking, and a few elites have **woken** cores and can yield ([lattice](../factions/lattice.md#listening-designed-not-built)). Their models are in `tools/models/enemies_order.py`.

- [Bulwark](bulwark.md)
- [Prism](prism.md)
- [Gatekeeper](gatekeeper.md)
- [Spindle](spindle.md)
- [Halo](halo.md)
- [Rook](rook.md)

## Bloom

The fungal rot of Mirefall (and spore-vent biomes). Tell grammar: **swell** (it pulses, then bursts). Sower, Spitter and Sky Manta fly with it too (`ROSTER`).

- [Heartpod](heartpod.md)
- [Puffball](puffball.md)

## Bounties

Worth chasing before they get away (`BOUNTIES`, `src/sim/factions.ts:175`). The Pirate Ace is one too.

- [Loot Runner](loot-runner.md)
- [Strongbox](strongbox.md)
- [Iron Crate](iron-crate.md)

## The old guard

Each planet's own roster (`src/world/planets.ts`), drawn by `spawnArch` (`src/sim/director.ts:374`) for 55% of the wave rolls (`OLD_SHARE`). Nine archetypes, each worn under a planet's name (the Hesk Skiff, the Glass Lancer, the Crab Dreadnought). They fight in the planet's faction look, or wild if the skin is a beast (`lookOf`, `src/sim/combat.ts:189`). Each planet's version has its own model (`tools/models/enemies_<planet>.py`); the archetype's mech or beast model is the fallback.

- [Dart](dart.md)
- [Swarm](swarm.md)
- [Gunship](gunship.md)
- [Turret](turret.md)
- [Bomber](bomber.md)
- [Lancer](lancer.md)
- [Brute](brute.md)
- [Serpent](serpent.md)
- [Carrier](carrier.md)

## Across all enemies

1. **No state-driven animation.** Every model has one idle loop (`CLIPS` in `tools/models/enemies_lib.py`). Windup, attack, recover, stagger and death are faked by the view with a glow ramp, an 8% crouch and a roll (`src/view/level-view.ts:1826`). Each enemy needs at least a windup pose and a recover pose, and the runtime needs a way to play them.
2. **Sound is shared.** One windup sound per faction, one shot sound pitched per faction, two explosions for every death. Only the Torpedo Rig and the Rook have sounds of their own. The faction table in `docs/style-and-characters.md` (two-stroke revs, a click before each beam, roars on the tell, wet pops) isn't in yet; the creature barks in `docs/alien-voices.md` aren't wired.
3. **The models are new and unlooked-at.** Every enemy got a model of its own (commit `c595cbf`), but none has been checked in a fight: does it read at 32 pixels, over each biome, as what it does? A pass per faction, with `just shot`.
4. **The faction tell grammar is only colour and one sound.** `TELL` (flare, draw, rear, swell) picks the windup sound and nothing else. A scrapper should flare its engines, a beast crouch, a bloom swell.
5. **Untelegraphed side-fire** undercuts the fair-death test: the Gunboat's deck gun, the Dreadnought's mines, the dart paths, the Serpent and the Carrier.
6. **Open windows have no common length.** Recovers run from 0.6 s (Gunship) to 2.5 s (Rattler), and the Ace has none. Settle a band (say 1.0–1.8 s, longer on elites) and tune to it on the autopilot bench (`just autopilot --foes <kind>`).
7. **The old guard lags the faction foes** on pattern: five of nine have no real tell. Either bring them up to the loop, or keep them as fodder on purpose and say so.
8. **Deaths are all the same.** A beast and a machine go up in the same fireball. A beast should fall, a machine break up, a bloom burst into spores.
9. **Grafts cover 8 elites** (`docs/combat-and-builds.md` §3). The other elites have none yet: Hookjaw, Flakker, Technical, Dreadnought, Sower, Spitter, Bulwark, Prism, and the old guard's Gunship, Brute and Lancer.
