# Brute

*The old guard.* Scores and the other enemies: [the overview](README.md).

Elite chain 2.

**Who it is.** Something big and armoured that charges. On most worlds it's an animal; on Ashgrave it's a piece of the war.
**Ship's log.** *"Armoured until it commits. Then it's not."*

**Worn as.**

| Planet | Name | What it is |
|---|---|---|
| Oru-Tal | Armoured Thunderhide | a giant the Hesk have plated and harnessed, like Vask |
| Mirefall | Bog Shellback | a marsh beast that the bloom lives in |
| Glacis | Tusked Bull | a tundra bull stampeding from the Engine's noise |
| Ashgrave | Revived Titan Torso | a titan's chest on tracks, Khet's pride |
| Vesh | Crab Dreadnought | a reef crab the size of a boat |

**Now.** Armoured (×0.5) between charges, spirals of shots, then a charge down a locked line ending in a slam and a ring wave (`src/sim/enemies.ts:347`). Parryable.
**Tell → window.** Line 1.2 s, locks at 0.6 s. Recover 1.6 s at ×1.5.
- [ ] A stamp sound on the windup, a slam sound of its own.
- [ ] Clips: rear on the windup, head down in the charge.
