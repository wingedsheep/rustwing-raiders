# Serpent

*The old guard.* Scores and the other enemies: [the overview](README.md).

**Who it is.** A long thing that weaves: a head and a body that trails it. Every one is a beast of its world.
**Ship's log.** *"Kill the head and the rest gives up."*

**Worn as.**

| Planet | Name | What it is |
|---|---|---|
| Oru-Tal | Jade Wyrm | the wyrm the Hesk hunt for ivory, hunting back |
| Kessra | Rust Worm | a sand worm that eats iron |
| Mirefall | Mire Eel | a marsh eel that grows bloom along its back |
| Vesh | Reef Eel | a reef eel that follows the whalers for scraps |

**Now.** A head weaving down the screen with 7–10 body segments trailing it; the head fires fans, the body fires out of its sides; kill the head and the body comes apart (`src/sim/enemies.ts:413`).
**Weak.** No tells at all. Its model is three chained templates, so it reads well.
- [ ] A tell on the head's fan (its jaw opens).
