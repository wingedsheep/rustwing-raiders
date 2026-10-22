# Turret

*The old guard.* Scores and the other enemies: [the overview](README.md).

**Now.** On the ground, tracks you, three-shot bursts (`src/sim/enemies.ts:280`). The head turns (`src/view/level-view.ts:1817`).
**Weak.** The windup has no tell shape (`null`), so only the body glow warns.
- [ ] A short line tell on the first shot of each burst.
