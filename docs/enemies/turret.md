# Turret

*The old guard.* Scores and the other enemies: [the overview](README.md).

**Who it is.** A gun that stays put. Each world grows or builds its own, and they all do the same thing: watch, track, fire three.
**Ship's log.** *"Doesn't move. We do."*

**Worn as.**

| Planet | Name | What it is |
|---|---|---|
| Oru-Tal | Tusk Battery | Hesk guns on a dead giant's tusk |
| Kessra | Dune Mortar | an Uukhvar caravan gun, dug in |
| Mirefall | Spitter Pod | a bloom pod that learnt to spit |
| Glacis | Engine Eye | one of the Engine's watchers, waking in the ice |
| Ashgrave | Junk Flak | Sankvi flak, built from the war |
| Vesh | Clam Battery | a reef clam that snaps shot instead of water |
| Cinder Orchard | Orchard Sentry | a Vantorr post on the terrace ends |

**Now.** On the ground, tracks you, three-shot bursts (`src/sim/enemies.ts:280`). The head turns (`src/view/level-view.ts:1817`).
**Weak.** The windup has no tell shape (`null`), so only the body glow warns.
- [ ] A short line tell on the first shot of each burst.
