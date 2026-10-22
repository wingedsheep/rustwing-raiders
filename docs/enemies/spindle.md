# Spindle

*Lattice.* Scores and the other enemies: [the overview](README.md).

Elite chain 2 · graft SPECIAL (four arms that spin, firing).

**Now.** A ground pylon: its four arms are drawn with arrows the way they'll turn, then spin 2.4 s, firing down their length; it turns the other way each time (`src/sim/foes.ts:1005`). The head turns in the view (`src/view/level-view.ts:1817`).
**Tell → window.** Spin tell 1.0 s. Recover 1.5 s at ×1.8; idle it takes only ×0.6.
**Weak.** Silent apart from the shared shots.
- [ ] A spin-up whine on the tell, pitch that follows the spin.
