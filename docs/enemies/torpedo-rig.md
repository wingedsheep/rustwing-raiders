# Torpedo Rig

*Scrap.* Scores and the other enemies: [the overview](README.md).

Elite chain 2 · graft TRIGGER (a torpedo every few shots).

**Who it is.** Toll War stock. Both sides built torpedoes by the thousand to bring down titans, and most never flew. The Sankvi dig them out of the glass by the crate and sell them to anyone, so a torpedo rig is a frame, a lock-finder and two war-surplus fish slung under it. The fish are far better made than the rig. They were built to kill something the size of a hill, and they don't give up.
**Ship's log.** *"Old war, still being delivered. Give the fish something else to hit."*

**Now.** Hovers at the top, locks on, then lets go two torpedoes (three later) out to its sides that chase you (`src/sim/foes.ts:401`).
**Tell → window.** Lock brackets on you for 1.15 s, `lock_on` and LOCK ON (`src/view/level-view.ts:575`). Recover 1.8 s at ×1.8.
**Weak.** It sits at the top of the screen while you deal with the torpedoes, so the window is rarely taken.
- [ ] Tune: drift lower during recover, or lengthen it while torpedoes are still live.
