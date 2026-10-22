# Great Mother Vask (Oru-Tal)

*A caged queen pterosaur, armoured by the Hesk.* **Worked out.** Needs playing and tuning.

<video src="media/vask-fight.mp4" controls width="640"></video>

[The fight, flown by the autopilot](media/vask-fight.mp4) (66 s, with sound: *Cage of Brass* changing with her phases, her shriek and wing beats): caged, the cage cracking, free (her screech rings, sky dives, a brood call), then her last stand and down. Recorded with `tools/record.ts` (`?planet=orutal&mode=boss&autopilot&length=30&seed=2`).

## Who she is

The Hesk poachers caught the queen of Oru-Tal's pterosaur flocks, bolted a brass cage and a reactor harness onto her back and fly her as a living gunship over their poaching grounds. The guns on her cage are theirs; the moves are hers. She isn't evil, she's furious and driven. Every phase you break more of the Hesk off her, and she fights more like herself: wilder, faster, and with no guns at all.

- **Vibe:** regal, wild, grieving-angry. Leathery wing beats, a shriek, Hesk machinery clanking on her back.
- **Arc:** caged (I) → the cage cracks (II) → free (III).

## The dance

Her moves keep to her theme's beat (140 bpm, a beat is 0.43 s): screech rings and wing beats land on it.

| Move | Tell (pose · shape · sound) | What it does | The answer | Open after |
|---|---|---|---|---|
| **RAKE** | rears back, wings up, talons forward · a line from her that follows you until it locks (0.8 s) · the scrap faction's tell sound | swoops talons-first down the line, fast | step off the line, or dash through her (a read) | 1.6 s; 2.2 s REELING if she hits the edge. From phase II she turns and rakes back at you once (a shorter tell) |
| **SKY DIVE** (signature) | wings fold, she flies out to the end of your lane · the lane drawn across the screen · the horn | crosses the lane low and fast, sowing eggs that burst | leave the lane (and don't sit behind it: eggs); a perfect dash through her breaks her poise | 2.3 s, landed and winded |
| **SCREECH** | head thrown back, beak opening · a ring about her · her shriek | 2, then 3 rings of sound pulse out on the beat | dash through each ring on the beat, or be out of reach (but hanging back invites a rake) | 1.4 s |
| **WING GUST** (II+) | wings raised high · a wide ring · a deep whump | three beats of her wings, two beats apart: each shoves you down the screen and throws a row of feathers with one gap, first where you are, then the far side, then back | weave: stay, cross, cross back | 1.8 s, wings spent |
| **BROOD CALL** (II) | head up, a cry | two pterosaurs answer | kill them, or ignore them for a free window on her | 0.8 s |

**Phase I: THE HARNESS** (100–66%). Rake → Sky Dive → Screech, always in that order. Between moves, the Hesk turrets on her cage fire metronomic fans and rain: the machine's rhythm, not hers.

**Phase II: THE CAGE CRACKS** (66–33%). The cage's front hoop and her shoulder turrets break off. Gust and Brood Call join; the rake doubles back. She starts reading you and stringing moves.

**Phase III: FREE** (33–0%). The rest of the cage and the reactor's armour fly off. No guns: no filler at all, just her, move after move with a short breath between, strings of two or three. Screech goes to three rings. This is the dance at full speed.

**Last stand** (8%). Her harness overloads: three sky dives back to back, then everything once more, faster.

## Model and animation

Rebuilt in `tools/models/bosses.py` (`boss_orutal`): a pteranodon silhouette from above (a long swept crest behind a long beak, long narrow wings on a long fourth finger, a short tail), red with a cream belly and bone leading edges, the Hesk brass on top (cage hoops, shoulder turrets, a glowing harness reactor: her weak point). Parts hinge where they should: neck, head, jaw, inner and outer wing each side, legs, tail. The cage and turrets are separate pieces with `shed` so they break away by phase.

Clips: `flap_idle` (a slow soar), `rake_windup`, `rake_attack`, `skydive_windup`, `skydive_attack`, `screech_windup`, `screech_attack`, `gust_windup`, `gust_attack`, `summon`, `recover` (panting, wings half open), `stagger` (head down, wings slumped, wobbling). She faces down the line on a rake and banks across the screen on a sky dive.

## Music

`boss_orutal` in `src/audio.ts`: *Cage of Brass*. G harmonic minor at 140, Oru-Tal's toms and congas under a galloping distorted bass. Phase I: the Hesk in the band (clanking metal, a grinding saw lead, no flute). Phase II: her flute takes the lead, the metal thins. Phase III: the metal gone, war toms, the flute doubled an octave up. Last stand: the harness clanks back in under everything. The band changes on the bar after a phase starts (`parts` and `audio.part`).

Her sounds: a ragged `shriek` with every screech ring (lower as she draws breath for it), a `wingbeat` whump with every gust beat (and a creak as her wings go up).

**Not yet listened to by a person.** The theme and the two sounds were written blind; the video has them, so start there.

## Bench

Her hull is 2.6× a boss's usual (`HULL` in `src/sim/boss.ts`), and no hit carries her past a phase line (every phase is fought, and the last stand always comes).

12 autopilot runs (`just autopilot --planet orutal --mode boss --seeds 12`): 10 cleared, 2 lost (in her last phases), 3.8 hits a run, most of them from her body (the rake and the sky dive), 6.3 perfects, 3.4 takedowns. Her fight runs 65–100 s against the autopilot (it was 25–35 s); a phase anywhere from 10 s to 50 s.

## Still to do

- [ ] Phases are uneven (10–50 s against the autopilot): staggers and takedowns decide it. See if a phase should end on its own after a while, or her poise should come back faster later on.
- [ ] Two in twelve autopilot runs die to her: most hits are her body on a rake or a sky dive. Fly it by hand before making her easier.
- [ ] Listen to *Cage of Brass*, the shriek and the wing beat; tune the mix (the saw lead against the distorted bass) and the flute's octave.
- [ ] Fly her by hand: are the gust gaps fair at every width? Does the rake back come too fast after a reel? Do the screech rings feel on the beat?
- [ ] Tune the gust shove (26 u/s for 0.3 s, about 8 units): enough to make you work, never into a feather.
- [ ] Her body is what hits you: check the rake's and sky dive's hit width against the new, wider wings.
- [ ] Her own death: the harness blows and she flies off free (see [Shared by all](README.md#shared-by-all)).
- [ ] Sounds still shared: the rake's tell (the faction's), and the cage breaking (a shield break, pitched down).
- [ ] Her graft (`docs/combat-and-builds.md`) still says SKY DIVE; a WING GUST graft would suit the AUX.
