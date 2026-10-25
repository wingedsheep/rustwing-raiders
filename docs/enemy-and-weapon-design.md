# Enemy and weapon design

The rules for designing an enemy, a boss or a weapon: read these before working on one, in the sim (`src/sim/enemies.ts`, `src/sim/foes.ts`, `src/sim/combat.ts`, `src/sim/boss.ts`, `src/sim/arsenal.ts`, `src/game/parts.ts`), in its looks (`src/view/enemy-model.ts`, `src/view/threats.ts`, `src/view/bullets.ts`, `src/view/gun-looks.ts`) or in its models (`tools/models/enemies_*.py`, `bosses.py`, `ships.py`). Where each enemy and boss stands is in [enemies](enemies/README.md) and [bosses](bosses/README.md); the arsenal is in [parts variety](parts-variety.md); how things should look is in the [art direction](art-direction.md).

## The rules

**It must play clearly and look great, both, always.** A foe you can read but that looks dull isn't done, and neither is a beautiful gun you can't tell apart from enemy fire. How it looks in screenshots and clips of a fight outweighs every metric and guideline.

1. **Every one has a personality.** An enemy is someone's craft or something grown, with a reason to fight the way it does ([lore](lore/README.md)); a weapon plays differently from every other, has a quirk, and says who loves it ([parts variety](parts-variety.md#the-rule-every-part-has-a-personality)). No filler, no stronger copy of another.
2. **It reads at a glance.** An enemy reads as a black shape at 32 pixels and is told apart from its faction's others; the faction is in the material and hue, the job in the shape ([shapes](art-direction.md#shapes)). Enemy fire is always told apart from the world, your shots and pickups; your shots never look like danger.
3. **A pattern you can learn.** An enemy has a tell in its body as well as on the ground, a committed attack, and a window to punish ([tells and deaths](art-direction.md#tells-and-deaths)). A weapon has a feel you'd know with your eyes shut.
4. **It looks great up close and in a crowd.** A model worth looking at, chunky and faceted, with the top surfaces interesting from above ([`tools/models/ART.md`](../tools/models/ART.md)), animated by its state: idle, windup, attack, recover, stagger, death.
5. **Effects and details bring it alive.** Every action has a flash, a kick, debris and its own sound ([juice](art-direction.md#juice)). Add what makes it feel made and alive: exhaust and heat shimmer, a smoking barrel, sparks off plating, a muzzle that glows as it charges, shell casings, a hull that cracks as it's hurt, a death that fits the body. They never hide the danger: small, bright, saturated specks are for enemy fire.
6. **It fits where it fights.** A foe moves and stands in a way the terrain explains ([level design](level-design.md#the-rules), rule 4); each planet's version wears that planet.

## Modelling

Model whatever an enemy, boss or weapon needs to look great: its body, its moving parts, the pieces it breaks into. Use of the Blender MCP (`mcp__blender__*`) is encouraged: build and shape the model in the live Blender with `execute_blender_code`, see it with `look`, and iterate until it's beautiful. Keep the result as a script in `tools/models/`, so it builds with `just models <module>`.

Where it works better, generate procedurally: a swarm or a brood that needs many different bodies, a planet's versions of a foe, wreck chunks and debris, barrels, fins and plating on a weapon's variants, a bullet's or a beam's shape. A seeded generator in a `tools/models/` script, or in the game itself (`src/view/`) for things built at run time like effects and shots. Procedural parts follow the same brief and are judged the same way.

Then check it and refine it: `just preview <module>` next to its sheet, then in a fight (`just shot`), fix what's off, rebuild and look again. A model isn't done when it builds.

## Checking it: screenshots and clips

1. **Take a set**: the foe or the gun in a mid-fight still on two or three biomes' grounds, as a black shape at 32 pixels, and a clip of its tell, its attack and its death (or its firing and its hit). Fire, shots and pickups side by side are on the owner sheet (`sheet.html`, see [readability tools](readability.md#tools)).
2. **Look at each one against the rules**, and write down what fails:
   - Does it look great? Would you stop to look at it?
   - Is it someone, or something, and could you say who loves it (or who built it)?
   - Can you read it at once, and tell it from its neighbours? Is every enemy shot found in a second, and nothing else mistaken for one?
   - Can you see the tell coming, and the window after?
   - Does it have its flash, kick, debris and sound? What effect or detail would make it better?
3. **Fix, then shoot the set again**, so before and after sit side by side.
4. **Repeat until the list is empty.** Then fly it by hand and run the bench.
