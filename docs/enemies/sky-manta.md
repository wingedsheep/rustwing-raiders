# Sky Manta

*Wild.* Scores and the other enemies: [the overview](README.md).

Elite chain 2 · graft BOOST (thorns in your wake).

**Who it is.** A pollinator as wide as a skiff, gliding on thermals and sowing thorn-burrs: seed-cases that hang in the air until they're ripe, then burst. The Tonkva seeded mantas to carry the preserve's plants across water. The burrs don't care what they stick to. On Mirefall the bloom has got into them, and the burrs carry rot.
**Ship's log.** *"Leaves its seeds hanging in the air. Count them before you cross its wake."*

**Now.** Glides across the top in a long wave, sowing thorns that hang and burst up and down; now and then it rears and flings a fan of seven (`src/sim/foes.ts:1129`).
**Tell → window.** Ring tell 0.8 s for the fan. Recover 1.2 s. The thorns are their own tell (they hang 1.5 s).
**Weak.** A thorn every 0.5 s makes a lot of hanging mines; which ones are about to burst is hard to read.
- [ ] Show ripeness on each thorn (swell, then flash).
- [ ] A low call as it crosses, a wing-snap on the fan.
