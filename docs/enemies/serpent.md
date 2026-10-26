# Serpent

*The old guard.* Scores and the other enemies: [the overview](README.md).

**Who it is.** A long thing that weaves: a head and a body that trails it. Every one is a beast of its world.
**Ship's log.** *"Kill the head and the rest gives up."*

**Worn as.**

| Planet | Name | What it is |
|---|---|---|
| Oru-Tal | Jade Wyrm | the wyrm the Hesk hunt for ivory, hunting back |
| Kessra | Rust Worm | a sand worm that eats iron |
| Mirefall | Mire Eel | on the water, a Tonkva channel-keeper with the bloom on its back (see below); elsewhere the old flying weaver |
| Vesh | Reef Eel | a reef eel that follows the harpooners for scraps |

**Now.** A head weaving down the screen with 7–10 body segments trailing it; the head fires fans, the body fires out of its sides; kill the head and the body comes apart (`src/sim/enemies.ts:413`).
**Weak.** No tells at all. Its model is three chained templates, so it reads well.
- [ ] A tell on the head's fan (its jaw opens).

## The Mire Eel on the water

**Who it is.** The Tonkva grew channel-keepers to keep the grow-beds' water clear on Morang: a long low body that swims flat, a plate of their pale ceramic over each ring of it, paddle vanes at every ring, a broad dredge-scoop for a head combed like their own antennae. A thousand years with no ledger to say what to clear, and the bloom has grown over its back in sacs. It takes anything fast over its water for silt.
**Ship's log.** *"It's under the channel ahead of us. When its back comes up, get past its head."*

**Now.** A bloom foe (`eel` in `src/sim/factions.ts`) that keeps to a layout's water routes (the Drowned Temple's beds channel, hall aisle, the water beside the causeway and between the grounds; `channel` in `src/sim/foes.ts`). Under, it swims a stretch ahead of you, untouchable, a wake of foam off its head. Then it surfaces (only on open water), its back humping out of the water and its sacs swelling (the sweep tell on your side, 1.1 s); its head spits a fan at you and its flanks fire ring by ring, head to tail, a fence of spores slanting back down the screen; it lies out on the water, open (takes ×1.8), for 1.9 s; it sinks and goes on; after three it swims off. Shots hit it anywhere along its body. On Mirefall, a Serpent roll sends it instead wherever there's a channel. Drawn by a rig (`src/view/eel-rig.ts`) from `enemy_mire_eel` (`channel_keeper` in `tools/models/enemies_mirefall.py`).
- [ ] Its own sounds (it borrows the whale's breach and dive).
- [ ] Fly it by hand and on the bench: the fence's spacing and speed, the open window.

