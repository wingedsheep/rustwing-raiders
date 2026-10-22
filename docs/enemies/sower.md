# Sower

*Wild.* Scores and the other enemies: [the overview](README.md).

Elite chain 3. (In code it's still `swooper`.)

**Who it is.** A seed the Tonkva grew to plant the [kept seed](../planets/orutal.md): a husk with a planting-spike, a tassel of roots, and a crown of four papery vanes it spins on like a falling maple key. Sowers marked a plot with their shadow and drove the seed into it. The ledger that told them where to plant has been dead a thousand years, and they bud more of themselves and go on sowing, wherever the Tonkva planted (`peoples.md`, creatures). A ship is the one plot that moves.

**Now.** Circles high; its shadow tracks you, then holds; it dives through the mark in a curve and climbs away (`src/sim/foes.ts:556`). Only harmful near the mark (`winded`, `src/sim/combat.ts:421`).
**Tell → window.** Circle tell 1.1 s, follows you for the first half. Its crown spins up through the windup. Recover 1.3 s at ×2 while it climbs. Parryable.
**Model.** `enemy_sower` in `tools/models/enemies_order.py`. `spin_idle`: the crown turns and a ripple runs round the vanes, the husk wobbles like a spinning seed, the roots whip, the heart beats. `fold`, a pose the runtime weighs in over the idle (`fold` in `src/view/level-view.ts`): in the dive the vanes sweep back into a dart behind the spike, the heart flares, the roots stream. It folds in about 0.2 s, opens over about 0.4 s as it climbs away, and spins fast out of the dive.
**Weak.** No sound of its own.
- [ ] A dry, papery whirr rising through the windup; a whistle on the dive; a rattle as the vanes snap open.
