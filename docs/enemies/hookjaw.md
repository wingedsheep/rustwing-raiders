# Hookjaw

*Scrap.* Scores and the other enemies: [the overview](README.md).

Elite chain 2.

**Now.** Hangs at a side and harpoons you along a locked line; hooked, you're reeled in until you dash free, shoot it hard enough, or parry (`src/sim/foes.ts:343`, `release` in `src/sim/combat.ts:315`). Reeled all the way, it hurts.
**Tell → window.** Line tell 0.9 s, locks at 0.6 s. A miss is a 1.2 s recover; breaking free staggers it 1.6 s.
**Weak.** HOOKED! uses the `hook` sound, which is also every beast's tell sound.
- [ ] A winch sound while reeling, a twang when the line snaps.
