# Notes for agents

## Making art: paint the screenshot first, then model it

For new art (a biome, an enemy, a boss, a prop set), don't start in Blender. Paint what it should look like in the game first, then build the models to match.

1. **Paint a target screenshot with Codex.** Pass the art direction ([`docs/art-direction.md`](docs/art-direction.md)) in the prompt, and two or three samples from [`docs/art-direction/planets/`](docs/art-direction/planets/) as reference images. Describe the shot the way the art direction does: the biome and its light, what frames the lane, which foes are where and what they're doing. Ask for the in-flight camera (top-down, tilted back about 30°, scrolling up the screen) and the game's pixel grain. The command and how to keep a set consistent: [making art with Codex](docs/art-with-codex.md).
2. **Judge it against the art direction** before building anything:
   - can you tell the world, the colliders, the danger and what's yours apart?
   - does each foe read as a black shape at 32 pixels?
   - does the biome have its own light?
   - is the lane framed, not filled?

   Regenerate until it passes, then keep the painting and its prompt with the art's brief (planets in `docs/art-direction/planets/`, enemies and bosses in `docs/art-direction/enemies/` and `docs/art-direction/bosses/`).
3. **Model it in Blender, from the painting.** The models are Blender scripts in `tools/models/` (the brief is [`tools/models/ART.md`](tools/models/ART.md)). Build them with `just models <module>`, and check them with `just preview <module>` next to the painting. Then look at them in a fight (`just shot`).
4. **Judge it on many screenshots.** The painting is a reference for style, cleanness, contrast, grouping and sizes, not something to copy one to one: each planet has its own style and palette, and levels are generated. Take a set with `just look` (several seeds, calm and mid-fight, the strip), look at every one against the principles in [readability](docs/readability.md#the-principles) (obstacles clear, danger unmistakable, placement deliberate, foes fitting the ground, the planet its own place), fix what fails and shoot the set again. The game's screenshots are the judge.
