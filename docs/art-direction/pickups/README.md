# Pickups

What you can take, by shape, not glow ([art direction](../../art-direction.md#colour)). `sheet.png` is the target, painted by Codex on two of the planet paintings' grounds (Red Mesa Run, Glowcap Forest) with enemy orbs beside them for comparison; the models are `pickup_scrap`, `pickup_scrap_big` and `pickup_repair` in `tools/models/ships.py`.

- **Scrap**: a bent tin coin, chalk-white, a punched hole, one edge bent up, a patch of rust. A bigger find is two of them wired together.
- **Repair**: a riveted patch of chalk tin with a stitched cross.
- Matte, inked round with the foes' dark ring, no glow, no trail. They bob and turn over, showing their thin edge; they never streak.

The prompt (with `kessra-red-mesa-run.png` and `mirefall-glowcap-forest.png` as references):

```
Generate ONE image with your image generation tool and save it as pickups_gen.png in the current directory. Do not write code or edit any other file. The attached images are target screenshots of our top-down shoot-'em-up (Rustwing Raiders); match their painterly pixel-art style, grain and lighting exactly.

A pickup sheet for the game, 16:9, split into two halves side by side. Left half: the dusk red-mesa canyon floor from the first painting. Right half: the violet night glowcap forest floor from the second. The in-flight camera: looking down, tilted back about 30 degrees. On each half, at true in-flight size (a little smaller than the player's ship, which you show once per half for scale: a small rust-and-cream spacecraft):

- SCRAP: three or four bent tin coins, each a stamped disc of salvage metal with a bent edge and a punched hole, chalk-white face with a crisp near-black outline. One is tipped on its edge, mid-turn, so it shows its thin rim. Bigger "scrap bundles": two coins stacked and wired together.
- REPAIR: a riveted repair patch, a square plate of chalk-white tin with four chunky rivets at the corners and a dark stitched cross-shaped seam across it, crisp near-black outline. One flat, one tipped mid-turn.

They are matte and chalk-white, lit by the biome's light like the ground, with no glow, no halo, no light trails and no streaks. Next to them, for comparison, a few enemy bullets: small round saturated red and violet orbs with near-black rims and a soft glow. The pickups must look nothing like the bullets: flat, angular, white, solid things, not round glowing dots.

No text, no labels, no UI, no coins with faces or Earth currency symbols, no gems, no hearts, no green crosses.
```
