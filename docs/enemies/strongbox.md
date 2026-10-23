# Strongbox

*Bounties.* Scores and the other enemies: [the overview](README.md).

`vault` · not plated · hauled by two `tug`s.

**Who it is.** A Tonkva counting-box, the kind every gate kept its tallies in, now holding whatever someone wants kept safe. It doesn't fly on its own: two tugs haul it, small recovery units of the kind the Engine once sent along the lanes with ballast. They still carry what they're given, and they don't stop for anyone. Shoot them down and the box falls, and the old box bursts when it hits the ground.
**Ship's log.** *"Don't bother with the box. Cut the strings."*

**Now.** Two tugs fly it down onto the screen, weave, then haul it off the top (`src/sim/foes.ts`, `case 'vault'` and `case 'tug'`). The box is iron while it's carried: shots spark off it (`takenNow`, `src/sim/combat.ts`). Kill one tug and its line snaps: the box swings from the other like a pendulum, and the last tug panics, bolting from side to side. Kill both and the box drops, tumbling, and bursts open on the ground: the bounty pays out there (`strongbox_open` sound, a ring of gold and sparks).
**View.** Each tug hauls on a rod of hard light (`towLine`, `src/view/level-view.ts`); a line snapping cracks light and plays `hook_snap`; the last one going shows **IT DROPS!**
- [ ] A model for the tug (it borrows the swarm drone's).
- [ ] A sound of its own for the tow line's hum and the snap (it borrows the boarding harpoon's).
