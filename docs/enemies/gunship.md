# Gunship

*The old guard.* Scores and the other enemies: [the overview](README.md).

Elite chain 3.

**Who it is.** A working hull with guns on it: a hold, a crew, and fans of shot to keep you off the cargo. Every power has one, and none of them was built to fight.
**Ship's log.** *"Big, slow and loaded. Get close between fans."*

**Worn as.**

| Planet | Name | What it is |
|---|---|---|
| Oru-Tal | Hesk Trawler | a net trawler, nets trailing |
| Halcyon | Toll Barge | the Port Authority's toll barge, gun decks behind cargo doors |
| Kessra | Cartel Hauler | an Uukhvar house hauler |
| Ashgrave | Clan Rig | a Sankvi rig, half crawler-barge |
| Vesh | Pirate Junk | a Court junk, rendering pots on deck |
| Cinder Orchard | Vantorr Interceptor | a Vantorr security hull, the only one here built to fight |

**Now.** Hovers in, fires fans, every fourth a ring, leaves (`src/sim/enemies.ts:248`).
**Tell → window.** Line or ring tell 0.5 s; recover only 0.6 s at ×1.3.
- [ ] Tune: tell 0.7 s, recover 1.0 s.
