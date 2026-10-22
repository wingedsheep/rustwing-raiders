# The Waking Engine (Glacis)

*The Tonkva's ledger-machine, half out of the ice.* Lattice. Fortress. **Worked out.** Needs playing and tuning.

<video src="media/engine-fight.mp4" controls width="640"></video>

[The fight, flown by the autopilot](media/engine-fight.mp4) (90 s, with sound: *The Level-Keeper* changing with its phases, its tolls, ice cracking): dozing in the ice (scans, a single turning bar, ice thrown off it), the ice breaking (the count, its menders, the cross), awake (the count on you, its grasp, the cross turning back), its last stand and down. Recorded with `tools/record.ts` (`?planet=glacis&mode=boss&autopilot&length=30&seed=1`).

## Who it is

Not a mind and not a monster: the account-keeping machine the Tonkva grew under their capital to keep every lane level, broken at the Breaking and a thousand years late for work ([the faction](../factions/waking-engine.md), [the Waking](../lore/the-waking.md)). It has no anger at you. It measures you. Every move is a reading, a count or a balance, and every one is drawn out in light before it happens (the lattice tell), so it's fair through foresight. Its menace is that it's diligent, and that it's only now waking up.

- **Vibe:** vast, patient, clerical, cold; clockwork under ice. Clean struck tones, a click before a beam, a groan of machinery as it comes awake. Under its bar it doesn't say it *sees* you, it **logs** you (`LOGS: HANGING BACK`, `LOGS: EXCESS VELOCITY`, `LOGS: UNWITNESSED CROSSINGS` for your dashes).
- **Arc:** dozing (I) → stirring, the ice breaking (II) → awake (III).
- **Owes:** the ledger itself. **Wants from you:** your crossed metal back. It doesn't read anyone's books; it follows mass, and you carry more than anyone.
- **Sad truth:** it keeps the accounts of a people who are gone. The Hoowae who are left can feel it lean, and can't speak to it.
- **The call:** it *is* the call. Its tolls are heard again in the Mother-of-Spores's second phase and in ARU-0's last.
- **Its words:** none. As it comes, a count of tones; under its bar it logs you; as it goes, it goes back to sleep. The opposite of Vask, who sheds her guns as she frees herself: the Engine *gains* things as it wakes. Its guns thaw, its count starts, its arms come free of the ice.

## The dance

Its theme's beat is 120 bpm (a beat is half a second): the count's beams land on it, and every beam is drawn two beats (a full second) before it burns.

| Move | Tell (pose · shape · sound) | What it does | The answer | Open after |
|---|---|---|---|---|
| **SCAN** | the iris thrown wide, leaning in · its beam drawn at the far side, and a **ring** drawn round it · the lattice charge | the beam sweeps across the lower field, broken at the ring's distance | **be on the ring** as it passes (near if you're far, far if you're near). From phase II it rests at the edge for a second, draws the ring somewhere else (a toll) and sweeps back | 1.7 s |
| **FROST CROSS** (signature) | the crown rises, the core blazes · the beams drawn from its core · the horn | the beams burn and turn | turn with them, staying between two. Dozing it's one bar (two beams) turning a quarter, slowly; stirring, four; awake, it stops halfway for a beat (a click) and turns most of the way back; its last stand, six | 1.9 s |
| **CALVING** (I, II) | a shudder that grows · ice cracking · chunks thrown, their landing circles drawn | five chunks, one on you, burst into a ring of shards where they land; stirring, a second volley a second later | leave the circles, then thread the shards | 1.6 s |
| **THE COUNT** (II, III) | antennae up and spread, a low toll · named on its bar | a beam a beat from its eye, outside in, one side then the other, each drawn a second before it burns, each a tone higher, all burning until the count is done (then a low toll and they go out) | find a wedge no line is drawn in and stay in it; don't cross a lit line. Awake, the last beam is on you: step aside within your wedge on the last beat (its last stand: twice) | 1.8 s |
| **GRASP** (III) | arms flung out to both edges, claws open · claw marks drawn all along your row | the claws close along the row from both edges, meeting where you are | leave the row: up or down, not sideways. In its last stand it reaches again for wherever you went | 2 s |
| **MENDERS** (II) | antennae waving | two prisms come (its maintenance machines) | kill them, or use the window | 0.8 s |

**Phase I: DORMANT** (100–66%). Scan → Frost Cross → Calving, always in that order, and slow (its tells and moves take 1.35× as long). Its guns are frozen: between moves all it does is breathe out a slow ring of frost every 1.6 s (with a hiss). Learn the ring, the bar, the circles.

**Phase II: THE ICE BREAKS** (66–33%). The front ice bursts off it; its antennae lift off its back. Its guns thaw (filler: lasers and rings), the count starts, it calls its menders, the scan comes back, and the calving throws twice. It starts reading you and stringing moves.

**Phase III: IT IS AWAKE** (33–0%). The last ice goes; the crown spins, the iris is wide, the arms are free. No calving (no ice left): it grasps instead. The count ends on you, the cross turns back. Fast (0.92×), strings of two or three, filler spiral and walls. **Closed, it throws your shots back** (as a prism does): fire into it only while it's open after a move, or fire true (focus).

**Last stand** (8%): the cross with six beams, then everything once more, faster (0.85×), the count with two beams on you and the grasp twice.

## Model and animation

Rebuilt in `tools/models/bosses.py` (`boss_glacis`). From above: a hexagon with a navy rim and a white ceramic crown, an **iris** on its brow (six shutters over a burning core: its weak point; they open when it's open), a **crown** of six pylons on a ring turning round it (its guns, and where the cross comes from), two **moth antennae** laid back behind it (the Tonkva felt the lanes with theirs; comb-edged so they read at 32 px), and two **arms** folded at its sides, claws forward. Blue ice holds it: the front shell (`shed=1`) breaks off in phase II, the back and the frost on its brow (`shed=2`) in phase III.

Clips: an idle per phase (`doze_idle`: the crown creeping round, a slow breath, the iris a sliver open; `p1`: faster, iris half open, antennae lifting; `p2`: the crown spinning, iris wide, antennae up and spread, arms flexing), `scan_windup/attack`, `cross_windup/attack` (the crown rises and spins), `calve_windup` (a shudder that grows) and `_attack` (a heave), `count_windup` and `_attack` (the crown ticks a sixth a beat, the antennae twitch on it), `grasp_windup/attack` (arms out, then a clap), `summon`, `recover` (iris gaping, core bare and guttering), `stagger` (listing, the crown wobbling). It turns its gaze a third of the way along its scan (`LOOKS` in `boss-pose.ts`).

## Music

`boss_glacis` in `src/audio.ts`: *The Level-Keeper*. B minor at 120. Phase I: a clock in the ice (a ticking rim on every beat, a held thrum of sub, a sparse music-box bell lead, a click of metal at the end of the bar). Phase II: a pulse bass, hats and a backbeat come up, the bells count upward (the arp). Phase III: four on the floor, a distorted bass, a cold saw lead doubled. Last stand: the bells take the lead back over metal ticking every sixteenth (a ledger being run).

Its sounds: `toll` (a click and a clean struck tone; the count climbs the scale a tone a beat, a low one when it's done; also on a scan's second pass and the cross's turn), `ice_crack` (its shudder and each volley), `frost_breath` (its exhale while dozing), `engine_wake` (a vast groan rising through a chord, a toll on top, as each phase begins).

**Not yet listened to by a person.** Written blind; the video has them.

## Bench

Hull 2.4× a boss's usual. 12 autopilot runs (`just autopilot --planet glacis --mode boss --seeds 12`): 9 cleared, 3 lost (in phases II and III), 2.8 hits a run, most from beams. Its fight runs 74–111 s; phase I about 22 s every time (it's in order), phase II 15–50 s, phase III 25–30 s.

The autopilot needed teaching to get there (`src/sim/pilot.ts`): it now goes to the gap in a broken beam (the scan's ring), and never dashes through a live beam (it used to, and that's a hit). Before that it lost all twelve.

## Still to do

- [ ] Fly it by hand. Is the scan's ring readable at a glance (the ring tell and the beam's two halves)? Is the near ring (15) too tight against its body?
- [ ] Phase II is uneven (15–50 s), as Vask's is: staggers and takedowns decide it.
- [ ] Listen to *The Level-Keeper* and the tolls; the count's tones are scheduled by the sim, not on the music's beat, so they can drift against it (Vask's screech has the same problem).
- [ ] The count's wedges: in phase II a player who finds a quiet wedge sits in it the whole count. Fine for the first count you meet; maybe the second of a string should start from the other side.
- [ ] Its last stand killed the autopilot in the browser recording (the six-beam cross under filler). Check it by hand before softening it.
- [ ] Its own death: the iris closes, the crown slows to a stop, it goes back to sleep (see [Shared by all](README.md#shared-by-all)).
- [ ] A graft of its own (`src/game/grafts.ts`; for now it leaves two of the lattice's): THE COUNT on the special (beams drawn out from you, a beat apart, then they burn), or the SCAN's broken beam on the heavy.
