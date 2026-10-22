# Torpedo Rig

*Scrap.* Scores and the other enemies: [the overview](README.md).

Elite chain 2 · graft TRIGGER (a torpedo every few shots).

**Now.** Hovers at the top, locks on, then lets go two torpedoes (three later) out to its sides that chase you (`src/sim/foes.ts:401`).
**Tell → window.** Lock brackets on you for 1.15 s, `lock_on` and LOCK ON (`src/view/level-view.ts:575`). Recover 1.8 s at ×1.8.
**Weak.** It sits at the top of the screen while you deal with the torpedoes, so the window is rarely taken.
- [ ] Tune: drift lower during recover, or lengthen it while torpedoes are still live.
