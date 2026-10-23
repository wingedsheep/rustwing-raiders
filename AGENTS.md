# Notes for agents

## Making levels: read the level design rules first

Before working on the level generator (`src/sim/layout.ts`, `src/sim/layouts/`, `src/sim/terrain.ts`, the director's foe placement) or on any biome's levels, read [level design](docs/level-design.md). Its first rule: a level must always look great, as well as play clearly. Model the props that make each biome unique and worth exploring (the Blender MCP is encouraged, and procedural generation where it gives more variety, as for rocks or trees; see [modelling props](docs/level-design.md#modelling-props)), and add the effects and details that bring a place alive. Judge every change on many screenshots. The pushes it is being built in are in [readability](docs/readability.md).

## Making art: paint the screenshot first, then model it

For new art (a biome, an enemy, a boss, a prop set), don't start in Blender. Paint what it should look like in the game first, then build the models to match.

1. **Paint a target screenshot with Codex.** Pass the art direction ([`docs/art-direction.md`](docs/art-direction.md)) in the prompt, and two or three samples from [`docs/art-direction/planets/`](docs/art-direction/planets/) as reference images. Describe the shot the way the art direction does: the biome and its light, what frames the lane, which foes are where and what they're doing. Ask for the in-flight camera (top-down, tilted back about 30°, scrolling up the screen) and the game's pixel grain. The command and how to keep a set consistent: [making art with Codex](docs/art-with-codex.md).
2. **Judge it against the art direction** before building anything:
   - can you tell the world, the colliders, the danger and what's yours apart?
   - does each foe read as a black shape at 32 pixels?
   - does the biome have its own light?
   - is the lane framed, not filled?

   Regenerate until it passes, then keep the painting and its prompt with the art's brief (planets in `docs/art-direction/planets/`, enemies and bosses in `docs/art-direction/enemies/` and `docs/art-direction/bosses/`).
3. **Model it in Blender, from the painting.** The models are Blender scripts in `tools/models/` (the brief is [`tools/models/ART.md`](tools/models/ART.md)). Build them with `just models <module>`, and check them with `just preview <module>` next to the painting. Then look at them in a fight (`just shot`), and refine: fix what looks off in the preview or the fight, rebuild and look again, until the model is right. Don't stop at the first build. Model anything a biome needs: it should have props that are beautiful and its own.
4. **Judge it on many screenshots.** The painting is a reference for style, cleanness, contrast, grouping and sizes, not something to copy one to one: each planet has its own style and palette, and levels are generated. Take a set with `just look` (several seeds, calm and mid-fight, the strip), look at every one against the rules in [level design](docs/level-design.md#the-rules) (it looks great, obstacles clear, danger unmistakable, placement deliberate, foes fitting the ground, the planet its own place), fix what fails and shoot the set again. The game's screenshots are the judge: whether it looks good in them weighs more than any metric or guideline.
