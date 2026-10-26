# Tender

*Lattice, the titans' own.* Scores and the other enemies: [the overview](README.md).

Fodder · no chain · only in a laid-out Titan Graveyard.

**Who it is.** A titan's welders. Every titan of the Toll War was built round an Engine core with a brood of them in its housing, to weld its plates back on in a fight. 166 years on the cores still twitch, and when one wakes, so does its brood, and it does its old job: it mends. To a Tender, you are the hole in the plate. They wear their titan's colours: the Compact's oxblood, or the Uukhvar's hazard yellow.
**Ship's log.** *"It's welding the air shut around us. Watch the lines, not the drones."*

**Now.** A brood of 4 to 6 sleeps in each lit core: a titan on its back with its chest cracked open, or the yard's titan stripped to its frame (`core` posts, `src/sim/layouts/titans.ts`). As the core comes onto the top of the screen it wakes, with a flash, a puff of ash and the hum of its motors (`Director.broods`, `src/sim/director.ts`). The brood climbs out of the crack, circling, up to the flight line. Then each one takes its turn: it draws its line at you, darts down it at 34 u/s, and welds a seam behind it. The seam stays where it was welded, rides the screen, and burns for 1.3 s after the dart, harmless for its last 0.3 s. The Tender then hangs there, cooling and open. After two darts it goes home into the core, or off the top if the core has gone (`TEND`, `src/sim/foes.ts`; seams are lasers with `seam`, `Level.updateLasers`). One brood at a time: a core passed while a brood is out sleeps on.
**Tell → window.** Line tell 0.75 s, locked for the last 0.3 s, with its torch flickering at its nose. Open 1.0 s at the seam's end. Shoot it while it circles up out of the core, before it starts.
**Model.** `enemy_tender` (`tools/models/enemies_ashgrave.py`): a six-sided puck with a core lens and two jointed torch arms around a gap. At 32 pixels it's a horseshoe. The arms work in turn as if still welding.
**Sound.** `brood_wake` for the core waking, `weld` for a seam's arc (`src/audio.ts`).
- [ ] A death of its own (it falls back toward its core, sparking).
