# Hookjaw

*Scrap.* Scores and the other enemies: [the overview](README.md).

Elite chain 2. Queen Istra calls two as her captains in her second phase ([her page](../bosses/istra.md)).

**Who it is.** A salvage harpoon on a winch, mounted on whatever flies. Scrap is money, and a wreck is worth more dragged home whole, so every salvage crew in the Reach carries a harpoon. The Hookjaw just doesn't wait for you to be a wreck. The Lowtide Court flies the best of them: its whalers learnt the trade on umora, and a ship is easier.
**Ship's log.** *"A tow-hook with manners missing. Dash, and the line goes slack."*

**Now.** Hangs at a side and harpoons you along a locked line; hooked, you're reeled in until you dash free or shoot it hard enough (`release` in `src/sim/combat.ts`). Reeled all the way, it hurts. Harpoons and grabs cannot be parried; see [parry rules](../parry-rules.md).
**Tell → window.** Line tell 0.9 s, locks at 0.6 s. A miss is a 1.2 s recover; breaking free staggers it 1.6 s.
**Weak.** HOOKED! uses the `hook` sound, which is also every beast's tell sound.
- [ ] A winch sound while reeling, a twang when the line snaps.
