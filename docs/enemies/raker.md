# Raker

*Scrap, light.* Scores and the other enemies: [the overview](README.md).

**Who it is.** A cargo glider with a slug-thrower slung under it. The clans use them to strafe convoys: cross, rake, gone.
**Ship's log.** *"Overhead and gone. Just don't be under it."*

**Now.** A string of 3 to 6 crosses the top third from one side. As each one comes over you, it flares and drops one slug straight down, leading you by where it'll be (`src/sim/foes.ts:367`). One shot each.
**Tell → window.** A short line straight down, 0.35 s. Step sideways.
- [ ] A propeller drone that rises in pitch as the string crosses.
