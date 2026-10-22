# Harbourmaster Oko (Halcyon)

*Teodor Oko, on the bridge of* Patience*: the Compact's flagship, a warship dressed as a crane sky-barge.* The [Halcyon Compact](../factions/halcyon-compact.md). Fortress. **Designed, not built:** the fight in the game is still the old one ([Now](#now)). How it's told: [tone](../lore/tone.md).

## Who he is

Oko is Hull Ansmor, a midshipman under the last admiral, and for thirty years the man who kept the Compact's navy alive after the Throne forbade it: repainted as a port authority, its admirals called harbourmasters, its warships built in the ark wrecks of the Quiet Yard round cores stolen from Engine City. He isn't a customs man and doesn't care what you carry. He's the admiral of a navy that isn't allowed, keeping it ready for whatever comes through the Throat or up out of the ice, and he has spent his life looking like a loyal clerk with the Throne's Census Office a mile from his desk.

- **Owes:** the dead of Hull Ansmor, who did the dying in the Toll War; thirty years of a navy that isn't allowed.
- **Wants from you:** gone. Every crossing of Halcyon's gate goes into the Syndicate's relay log, and the Census Office at Fersdeck reads it; an unpaid one at his gate brings inspectors, and inspectors find the Quiet Yard. So he stops you, properly. It's not personal, and he tells you so.
- **Sad truth:** he's played the loyal harbourmaster so long that only his ship knows which of him is real. ***Patience*** woke twenty years ago and he never reported her ([minds](../lore/minds.md)). They run the fleet together; nobody else knows who's on the bridge.
- **The call:** *Patience* is a woken core, so when the Engine calls she can choose, and she stays with him. In his last phase she takes the helm to keep him alive.
- **Vibe:** a decent man doing a hard thing, on the open band for the watchers and quietly to you. Ship's bells (the Compact keeps ship's time, as the arks did), a calm second voice under his.

### Its words

- **As it comes:** `HARBOURMASTER OKO: "HEAVE TO, PILOT. FOR BOTH OUR SAKES."`
- **Under the bar** (`READ_OWN`): `HAILS: HEAVE TO, PILOT` (hanging back), `SAYS: YOU SHOULD HAVE RUN` (sitting still), `HAILS: KEEP TO THE LEFT`, `SAYS: FAST SHIP. SHAME` (boosting), `SAYS: NOT PERSONAL, PILOT` (up close), `SAYS: ANSMOR FLYING, THAT` (dashing). In phase III the voice is *Patience*'s, and she says what she's doing.
- **As it goes:** *Patience*, on a private band, asking rather than telling: `"HE'LL LIVE. YOU WERE NEVER HERE."`

## The dance

Every move is struck on the ship's bell first, one stroke a beat, so you can count it in.

| Move | Tell (pose · shape · sound) | What it does | The answer | Open after |
|---|---|---|---|---|
| **THE BOOM** | the cranes string a lit cable across the sky · the boom drawn, with one gap · two bells | the boom sweeps down the field, its gap the only way through | find the gap and go through | 2.2 s |
| **CRANE SWING** (signature) | a crane lifts the ball and holds it · its arc drawn under the barge · the horn | a wrecking ball on a chain swings a pendulum under the barge, shedding shrapnel at the ends | ride the top of the swing, behind the ball | 2 s, the chain slack |
| **SEARCHLIGHT** | the bridge lamp swings to you · its cone drawn across the sky · one bell | the light follows you, slower than you fly, and the deck guns fire up it | stay out of the cone; cross it with a dash | 1.6 s, the lamp cooling |
| **THE GUNS** (II+) | the cargo hatches fall open · the row of muzzles drawn · three bells | a warship's broadside of beams, scissoring | between the blades as they cross | 1.8 s |
| **BRACE** (III) | *Patience* heels her plated side to you · the armour line drawn round her · her voice: `BRACING` | she keeps her armour to you and her weak points away, turning as you go round | fly round her (she turns slower than you), or wait for her to commit | a stance, not a move |
| **CUTTERS** (II) | a klaxon | two cutters (wardens) out of the hold | kill them, or take the window | 0.8 s |

**Phase I: FOR THE RECORD** (100–66%). Searchlight → Crane Swing → the Boom, in order, the deck cargo still stacked. A harbourmaster stopping a smuggler, by the book, for the watchers. Filler light: lasers and walls.

**Phase II: THE PAINT COMES OFF** (66–33%). The cargo goes over the side (`shed=1`) and there are guns under it. Out at the gate nobody sees his guns but you, and he knows what that costs: every rustwing who has seen them is a story waiting to be told in a bar. The guns and the cutters join; it reads you and strings moves. Filler fans and rings.

**Phase III: PATIENCE** (33–0%). The bridge is hit and Oko goes quiet; the ship answers (`PATIENCE HAS THE CONN`). She braces through the whole phase, so the fight becomes going round her. Both cranes swing, one after the other. She calls no one: her crew is aboard, and she's keeping them alive.

**Last stand** (8%): eight bells, then everything once more, both cranes at once.

**How it ends:** no explosion. The barge heels away into the Stormwall with its lamps out, and *Patience* says her line.

## Model and animation

Today: a barge with cranes and one idle (`cranes_idle`); the view draws the ball. To build: a long cream sky-barge hull in Compact blue, the bridge forward with its lamp (a weak point), two cranes that carry and swing the ball, deck cargo stacked over the gun ports (`shed=1`), a boom on davits. Clips: `idle`, `lamp_windup`, `crane_windup/attack`, `boom_windup`, `guns_windup` (hatches falling open), `p2` (*Patience*: lower, guns out, bridge dark), `brace` (heeled, plated side round), `recover`, `stagger`.

## Music

To write: `boss_halcyon`, from Halcyon's half-time synthwave. Phase I: a harbour at evening, a bell on the bar, a slow pulse bass. Phase II: the drums go martial, the bass doubles, a bright brass lead. Phase III: down to a pad and one careful, voice-like lead: the ship. Sounds: `ship_bell` (its tells), `hailer` (Oko on the open band), `klaxon`.

## Now

In the game: sweep (scissor beams), gate (a closing wall with a gap), shells; signature CRANE SWING; filler lasers, walls, fans, rings; calls wardens. His lines under the bar are in (`READ_OWN`).

## Still to do

- [ ] Build the dance (`OWN` in `boss.ts`): the boom (today's gate), the searchlight, the guns (today's sweep), BRACE.
- [ ] Lines that change with the phase: Oko, then *Patience*.
- [ ] Its end (a per-boss end in `level.ts`): heeling off, lamps out, her line.
- [ ] The model and poses, a theme, a voice each (`tools/voices/`).
