# Notes for agents

## Making levels: read the level design rules first

Before working on the level generator (`src/sim/layout.ts`, `src/sim/layouts/`, `src/sim/terrain.ts`, the director's foe placement) or on any biome's levels, read [level design](docs/level-design.md). Its first rule: a level must always look great, as well as play clearly. Model the props that make each biome unique and worth exploring (the Blender MCP is encouraged, and procedural generation where it gives more variety, as for rocks or trees; see [modelling props](docs/level-design.md#modelling-props)), and add the effects and details that bring a place alive. Judge every change on many screenshots. The pushes it is being built in are in [readability](docs/readability.md).

## Making enemies and weapons: read their design rules first

Before designing or changing an enemy, a boss or a weapon (its sim, its looks, its model), read [enemy and weapon design](docs/enemy-and-weapon-design.md). The same holds as for levels: it must always look great, as well as play clearly. Model it so it's beautiful (the Blender MCP is encouraged, and procedural generation where it gives more variety, as for a swarm's bodies or debris; see [modelling](docs/enemy-and-weapon-design.md#modelling)), give it the effects and details that bring it alive, and judge it on screenshots and clips of a fight.

## Making art: model it, then judge it in the game

For new art (a biome, an enemy, a boss, a prop set), go straight to Blender. Don't paint a target image first.

1. **Model it in Blender.** The models are Blender scripts in `tools/models/` (the brief is [`tools/models/ART.md`](tools/models/ART.md)), built to the art direction ([`docs/art-direction.md`](docs/art-direction.md)); the paintings in [`docs/art-direction/planets/`](docs/art-direction/planets/) show the style, cleanness and contrast we want. Build them with `just models <module>` and check them with `just preview <module>`. Then look at them in a fight (`just shot`), and refine: fix what looks off in the preview or the fight, rebuild and look again, until the model is right. Don't stop at the first build. Model anything a biome needs: it should have props that are beautiful and its own.
2. **Judge it on many screenshots.** Take a set with `just look` (several seeds, calm and mid-fight, the strip), look at every one against the rules in [level design](docs/level-design.md#the-rules) (it looks great, obstacles clear, danger unmistakable, placement deliberate, foes fitting the ground, the planet its own place) and the art direction's questions:
   - can you tell the world, the colliders, the danger and what's yours apart?
   - does each foe read as a black shape at 32 pixels?
   - does the biome have its own light?
   - is the lane framed, not filled?

   Fix what fails and shoot the set again. The game's screenshots are the judge: whether it looks good in them weighs more than any metric or guideline.
