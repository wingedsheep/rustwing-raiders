# Glass Skater

*Scrap: the Sankvi, on Ashgrave's Glass Craters.* Scores and the other enemies: [the overview](README.md).

Not plated.

**Who it is.** The Chikta skate the glassed plains on sail-barges; the Sankvi clans copied them for raiding. A sail-sled on three runners (two outriggers aft, one steering runner forward), a patched sail of war banners with the clan's bone hand on it, and a gun tub with a gunner. It only goes where the glass is smooth: down the craters' glass gutters, never off them.
**Ship's log.** *"It can only go where the glass goes. So can its guns."*

**Now.** Skates down a glass gutter (a layout's `'glass'` route, `gutter()` in `src/sim/foes.ts`) at 11 u/s, throwing pale glass shavings off its runners. Twice, it luffs, slews about 90° and slides while its gun tub rakes a fan off its flank: two volleys, the second in the first one's gaps (5 shots, 6 past difficulty 0.6, 0.17 rad apart, speed 10). Then it rights itself, skates on and escapes off the bottom. Spawned only where a gutter runs ahead (`skate()` in `src/sim/director.ts`, one or two in file, 9 apart); in the glass biome it takes the Gunboat's place, and otherwise falls back to a Technical. Squad: Flakker and Skater.
**Tell → window.** Luff 0.8 s (×quick): the sail flogs, the runners shriek and spark, and the fan is drawn on the ground. Attack 0.55 s. Window 1.2 s slewed and sliding at 3 u/s, hit at ×1.8 (×2.2 late).
**Model.** `enemy_glass_skater` (`glass_skater()` in `tools/models/enemies_ashgrave.py`): a dark hull on three runners, the rig heeled out over the lee outrigger, the sail in ash-washed banners with kill tallies and a hazard leech, and a gunner in a bone helmet. The idle clip only shivers the cloth. The rig (`src/view/skater-rig.ts`) heels the sled into the slew, lets the sail fly and flogs the leech. When it dies, the sail tears away in banner-coloured rags.
**Sound.** `skate_luff` (flogging cloth, a rising runner squeal and a tick of metal) and `skate_slew` (screech, hiss, crackle, a crack of sail, a thump and two metal knocks).
**Weak.** The sail is still slim from straight above while it runs; it reads best when slewed. No gun sound of its own.
- [ ] A wake scored into the glass behind it.
