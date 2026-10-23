# Spindle

*Lattice.* Scores and the other enemies: [the overview](README.md).

Elite chain 2 · graft SPECIAL (four arms that spin, firing).

**Who it is.** A heat-tap valve. Under the Tonkva capital, spindles turned the planet's heat out to the valleys, one way and then the other, to keep the flow even. The ones walking out of Engine City still turn, still alternate, and what they spill now is light. Vantorr and the Compact use copies as perimeter guns, and they turn both ways too: nobody knew how to make one that didn't.
**Ship's log.** *"Turns one way, then the other. It keeps things even. Including us."*

**Now.** A ground pylon: its four arms are drawn with arrows the way they'll turn, then spin 2.4 s, firing down their length; it turns the other way each time (`src/sim/foes.ts:1005`). The head turns in the view (`src/view/level-view.ts:1817`).
**Tell → window.** Spin tell 1.0 s. Recover 1.5 s at ×1.8; idle it takes only ×0.6.
**Weak.** Silent apart from the shared shots.
- [ ] A spin-up whine on the tell, pitch that follows the spin.
