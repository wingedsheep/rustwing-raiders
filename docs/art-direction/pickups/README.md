# Pickups

What you can take: small, shaped like no bullet, and lit softly from within so it looks worth taking ([art direction](../../art-direction.md#colour)). `sheet.png` is the target, painted by Codex on two of the planet paintings' grounds (Red Mesa Run, Glowcap Forest) with enemy orbs beside them for comparison; the models are `pickup_scrap`, `pickup_scrap_big` and `pickup_repair` in `tools/models/ships.py`.

- **Scrap**: salvage you can sell, one of three pieces: a stripped cog of blued steel with a copper bush, a hex nut on a copper washer, or a torn offcut of hazard-yellow plate with black stripes and a copper coil. A bigger find is a cog and a nut lashed to an offcut with copper wire.
- **Repair**: a riveted mint patch with a chalk cross stitched on.
- Small, inked round with the foes' dark ring, their bright steel and copper (a repair's cross) lit from within, in a soft warm halo round a white-hot core (mint for a repair), breathing slowly, with a shimmer swelling through it now and then; brighter as the magnet takes them. They bob and turn over; they never streak, except caught by the magnet, when they spin up and shed bright chips on the way in.
- **Taking one** should feel like a catch: its light streaks into the ship, the hull gives a warm flash and a tight ring (both swelling over a quick run of pieces), tiny white sparkles fly off with chips of steel, copper and paint, and the sound is a clink with a bright bell over it, climbing a step for each piece in the run. Then the mote flies up to the tin.
- **A volatile crate** is a prize first: a hazard-orange strongbox in a soft glow of its part's tier colour, with the tier's beacon standing on it. The rarity is in the colour, never in words. It's only a little live: its light blinks red, it crackles now and then, and every so often it rattles. Nothing is written over it while it lies there; the rule (HOLD 30S UNHIT, by tier) is said once, when you take it.

(`sheet.png` and the prompt below are from the earlier chalk-white coins; the models have moved on from them.)

The prompt (with `kessra-red-mesa-run.png` and `mirefall-glowcap-forest.png` as references):

```
Generate ONE image with your image generation tool and save it as pickups_gen.png in the current directory. Do not write code or edit any other file. The attached images are target screenshots of our top-down shoot-'em-up (Rustwing Raiders); match their painterly pixel-art style, grain and lighting exactly.

A pickup sheet for the game, 16:9, split into two halves side by side. Left half: the dusk red-mesa canyon floor from the first painting. Right half: the violet night glowcap forest floor from the second. The in-flight camera: looking down, tilted back about 30 degrees. On each half, at true in-flight size (a little smaller than the player's ship, which you show once per half for scale: a small rust-and-cream spacecraft):

- SCRAP: three or four bent tin coins, each a stamped disc of salvage metal with a bent edge and a punched hole, chalk-white face with a crisp near-black outline. One is tipped on its edge, mid-turn, so it shows its thin rim. Bigger "scrap bundles": two coins stacked and wired together.
- REPAIR: a riveted repair patch, a square plate of chalk-white tin with four chunky rivets at the corners and a dark stitched cross-shaped seam across it, crisp near-black outline. One flat, one tipped mid-turn.

They are matte and chalk-white, lit by the biome's light like the ground, with no glow, no halo, no light trails and no streaks. Next to them, for comparison, a few enemy bullets: small round saturated red and violet orbs with near-black rims and a soft glow. The pickups must look nothing like the bullets: flat, angular, white, solid things, not round glowing dots.

No text, no labels, no UI, no coins with faces or Earth currency symbols, no gems, no hearts, no green crosses.
```
