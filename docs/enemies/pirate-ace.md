# Pirate Ace

*Scrap.* Scores and the other enemies: [the overview](README.md).

Bounty for scrap · no chain.

**Who it is.** A rustwing who sold out: signed on with a power for a season's pay, and still flies by the code. The code says a pilot who gets passed buys the drinks, so an ace you overtake breaks off. That's pride, not orders. Every crew calls the ace hunting it a pirate, and the bounty on its head was usually posted by old friends.
**Ship's log.** *"One of ours, on someone else's pay. Overtake them and they owe us a drink."*

**Now.** A rival: comes past you from behind, sits in your line, fires three-round needle bursts, and rolls away from sustained fire (`src/sim/foes.ts:451`). Boost past it and it's beaten (OVERTAKE!, `:491`).
**Tell → window.** Burst line 0.5 s. After the burst it goes straight back to idle (`:523`): no open window. The only window is the 0.9 s after a roll.
**Weak.** Its best moment is the roll, which it does whenever it's hit; there's no beat where it's yours to punish.
- [ ] Recover ~0.8 s after the third shot.
- [ ] A taunting engine sound on the overtake.
