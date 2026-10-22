# Strongbox

*Bounties.* Scores and the other enemies: [the overview](README.md).

`vault` · not plated.

**Now.** Reseals itself if not hit for 0.3 s, so only a steady burst cracks it (`src/sim/foes.ts:1208`).
**Weak.** Nothing shows how close it is to opening; the `recover` state flips at half hull with no view of its own.
- [ ] Draw the tumblers (a ring that fills, clicks as it goes).
