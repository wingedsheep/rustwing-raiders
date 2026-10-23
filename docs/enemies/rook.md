# Rook

*Lattice.* Scores and the other enemies: [the overview](README.md).

Elite chain 2 · graft HEAVY (rounds that turn square).

**Who it is.** A plotting unit. The Tonkva laid out every terrace, shaft and garden square, and rooks walked the ground first, in straight lines and right angles, marking where things would grow. A rook's darts still plot: straight, a square turn, each lane drawn before it's taken. It's laying out a field, and you're standing in it.
**Ship's log.** *"Draws its turns before it makes them. Read the lines."*

**Now.** Locks on, then lets go crystal darts out to its sides (a third straight down for an elite or late on) that fly straight and only turn square, each drawing its next lane before it takes it; guns pass straight through them, so they must be dodged (`src/sim/foes.ts:1083`, `SEEKER` in `src/sim/level.ts`).
**Tell → window.** Lock with chevrons 1.1 s, then each dart's lane. Recover 1.7 s at ×1.8. Own sounds: `lock_on` pitched up, `seeker_halt`, `seeker_go` (`src/view/level-view.ts:468`).
- [ ] A death sound that isn't the shared explosion.
