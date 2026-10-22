# Queen Istra (Vesh)

*Pirate queen of the Lowtide Court, in the hollowed bull umora she won the throne with.* Reef Pirates (scrap). Brawler. **Worked out.** Needs playing and tuning.

<video src="media/istra-fight.mp4" controls width="640"></video>

[The fight, flown by the autopilot](media/istra-fight.mp4) (114 s, with sound: *The Tidecall* changing with her phases, her call and her crew's HO, the broadside guns, the whale sounding and breaching, the tide turning): the hunt (irons, her breath, a breach), broadsides (her captains, the guns run out, the row she fires with its gap), the tide coming back (the bubbles, irons and broadside all return to her), her last stand and down. Recorded with `tools/record.ts` (`?planet=vesh&mode=boss&autopilot&length=30&seed=5`) from a production build.

## Who she is

Istra won the Tidecall nineteen years ago by bringing in a bull umora so big the Court hollowed it out for her, and she has ruled from inside it ever since ([the Lowtide Court](../factions/reef-pirates.md)). She's a whaler before she's a pirate: she doesn't fight you, she **hunts** you, the way she'd hunt a whale. Flamboyant, democratic, merciless. She plays to her captains, who are watching, and she keeps her word. Her crew sing on the hunt (the Eefee taught them the umora go quiet when you're quiet), so her fight is a shanty: she calls, the crew answers, and the irons and the guns go on the answer.

- **Vibe:** swagger and salt. A call and a crowd's HO, the boom of a wooden gun deck, a dead whale's groan as it sounds and breaches, surf drawn back off a beach. Under her bar she doesn't *see* you, she **talks to you**, for the Court's benefit: `CALLS YOU IN, LITTLE FISH` (hanging back), `SAYS: A SITTING WHALE` (sitting still), `SAYS: HUGGING THE REEF LEFT`, `THERE SHE BLOWS!` (boosting: you're spouting), `SAYS: BOLD. SHE LIKES BOLD` (up close), `SAYS: SHOW-OFF` (dashing).
- **Arc:** the hunt (I) → a sea fight (II) → alone, and *the tide always comes back* (III, the Court's saying). Vask sheds her captors; the Engine wakes up; Istra loses her crew and fights on alone, and in her last phase everything she throws comes back to her.

## The dance

Her theme's beat is 126 bpm (a beat is 0.48 s): the irons and the broadside's rows land on it.

| Move | Tell (pose · shape · sound) | What it does | The answer | Open after |
|---|---|---|---|---|
| **THE IRONS** | bow comes up and round, Istra's cutlass raised · a line from her bow at you, two beats; then a beat for each after · her call, HEAVE | three irons on the beat (four in her last stand), a crew's HO on each: the first and third at you, **the middle one leads you** (where you're going) | step off each line in time; don't run straight (the second is waiting there). Caught: you're reeled in, dash to snap the line (that staggers her) | 1.6 s, reloading |
| **DEEP BREATH** (signature) | head up, jaw dropped wide · the ring of how far the pull reaches · the horn, the whale drawing breath | the air streams into her maw and pulls you in (boost against it; a dash is free of it), then a wall of bubbles, rows offset, fanned at you | hold your ground, then weave through the rows | 2.3 s |
| **BREACH** | nose down, fluke thrown up, she sinks · a ring drawn on you, following you · the whale sounding | she's under (out of reach, foam boiling where she is); the ring sets a moment before she comes up through it: a slam the size of the ring, and from phase II a ring of sea thrown off her | leave the ring after it sets (not before: it follows). From phase II, dash through the wave or be well clear | 2.4 s, wallowing in the open where she came up (close to you: the big window) |
| **BROADSIDE** (II+) | she runs to your side of the field and turns side-on, gun-port lids swing up · the row she'll fire drawn across the field, the **gap under her waist** (no guns at the queen's cabin) · her call | she sails across the top of the field firing the row every other beat, the gap riding under her | **run with her**, in the gap | 2 s, guns reloading |
| **HER CAPTAINS** (II) | Istra waves them in | two hookjaws (whalers, with irons of their own) | kill them, or take the window | 0.8 s |

**Phase I: THE HUNT** (100–66%). Irons → Deep Breath → Breach, always in that order. Between moves her crew's deck guns fire curving chasers and fans: the crew's rhythm, not hers.

**Phase II: BROADSIDES** (66–33%). The whaleboats are cut loose and the planks over her gun ports blow off (`RUN OUT THE GUNS`). The broadside joins and her captains come; the breach throws a ring of sea; the filler is cannon (splitters) and fans. She starts reading you and stringing moves.

**Phase III: THE TIDE COMES BACK** (33–0%). The mast goes over the side and the crew with it (`THE CREW ABANDONS HER`); Istra stays at the helm, the whale lists and swims lower. One rule changes everything: **what she throws comes back to her.** Each iron is reeled home down its own line (it no longer catches, it only cuts: don't step back onto a line until it's home); the bubble wall stalls and drifts back to her maw, far rows first; the broadside sails back the other way; she breaches twice, the second where you went. Her only filler is the sea itself: a ring of bubbles breathed out that stalls and comes back. You weave everything twice, out and back. Each turn of the tide has its own sound (surf drawn up a beach, a hush, the swell).

**Last stand** (8%): her breath, then everything once more with four irons and three breaches, then her breath again.

## Model and animation

Rebuilt in `tools/models/bosses.py` (`boss_vesh`). From above: a long blue-grey whale, barnacled and scarred with old irons, its back cut open to a deck under arched bone ribs. The whale's heart glows pink between them (a weak point, under the sail until the third phase). A mast and patched sail stand amidships, the queen's cabin at the stern, and **Istra** on its roof: a red coat, a black hat with a pink plume (the other weak point), a cutlass and a lantern. An iron-thrower sits on the bow. Parts hinge where she moves: head, jaw (with baleen), each flipper, the tail stock and the fluke, a lid on each of six gun ports, Istra and her arm. Her hunting gear (whaleboats on davits, planks over the ports) has `shed=1`; the rigging (mast, sail, crow's nest, deck huts) has `shed=2`.

Clips: `swim_idle` (a proud slow swim, the fluke driving, flippers rowing, Istra swaying with the deck), `p2` (alone: listing, lower in the water, heavier), `irons_windup` (bow up, cutlass raised) and `_attack` (the bow kicks and her arm comes down on every beat), `breath_windup` (head up, jaw dropped wide) and `_attack` (heaving as she draws in), `breach_windup` (nose down, fluke up) and `_attack` (nose up, flippers wide), `broadside_windup` (lids up, guns out) and `_attack` (rocking back every other beat), `summon`, `recover` (wallowing on one side, jaw slack, lids hanging open), `stagger` (rolling hard, Istra thrown to her knees). She turns side-on for a broadside, facing where she's sailing, and brings her bow part of the way round on you for the irons (`boss-pose.ts`). While she's under the sea she's hidden and can't be hit or rammed (`under` in `BossState`), and foam boils where she is.

## Music

`boss_vesh` in `src/audio.ts`: *The Tidecall*. A whalers' shanty in D dorian at 126 over Vesh's dembow. Phase I (the hunt): her steel drum calls over marimba, offbeat sub bass, the crew stamping two and four. Phase II (broadsides): brass takes the lead, the bass distorts, low toms go off like guns, metal clanks. Phase III (the tide): the crew's gone, the band thins to the kick and a rim, the marimba washes up and down, the steel drum is high and alone. Last stand: everyone, the brass doubled.

Her sounds: `istra_call` (HEAVE: one voice through two formants, before her irons and her broadside), `crew_ho` (a deck of rough voices on every iron, and as the guns run out), `cannon` (each broadside row), `whale_breath` (her breath's windup; higher, the tide filler), `whale_dive` (sounding), `whale_breach` (up through the surface), `tide_turn` (whenever what she threw turns home; and as the crew leaves her).

**Not yet listened to by a person.** The theme and the sounds were written blind; the video has them, so start there. The voices are synthesised (a buzz through formant filters), so they may read as horns more than shouts.

## Bench

Hull 2.4× a boss's usual (`HULL` in `src/sim/boss.ts`). 12 autopilot runs (`just autopilot --planet vesh --mode boss --seeds 12`): 11 cleared, 1 lost (two hits before the boss, two in phase II), 1.6 hits a run, 8.6 perfects, 1.2 takedowns. What hits: stray bullets and the breach's slam. Her fight runs 100–130 s against the autopilot; phase I about 27 s every time (it's in order), phase II 45–55 s, phase III 16–42 s.

The autopilot needed teaching for the broadside (`src/sim/pilot.ts`): it now runs with the gap. Before that it was shot down there in the browser.

## Still to do

- [ ] Fly her by hand. Is the irons' lead fair (the middle line is where you're going)? Can you read when the breach ring sets? Can every ship keep up with the broadside's gap (13 u/s) while the rows come?
- [ ] Phase II is long (45–55 s against the autopilot): two new moves and her captains. Maybe a shorter list, or the captains only once.
- [ ] The tide: a returning bubble wall over the filler ring may be too much in a string. Watch phase III by hand before softening it.
- [ ] Listen to *The Tidecall* and her voices. The call and the HO are synth formants; real voice barks from `tools/voices/` (ElevenLabs) would make her a character. A designed voice for Istra, with HEAVE, a laugh and THERE SHE BLOWS, is the next step.
- [ ] Moves on the beat are timed by the sim, not the music, so they drift against the theme (as with Vask and the Engine).
- [ ] The bubbles (the `big` bullet look) read as dark smoky blobs over the lagoon. A bubble look of their own (pale, ringed) would suit her better.
- [ ] Her own death: the Throne-Whale sinks, and Istra salutes from the stern as it goes (see [Shared by all](README.md#shared-by-all)).
- [ ] A graft of her own (`src/game/grafts.ts`): THE IRONS on the heavy (three lines, the middle one leading), or a broadside on the AUX.
