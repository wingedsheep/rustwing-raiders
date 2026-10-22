# The Mother-of-Spores (Mirefall)

*The old grow-heart of Morang, floating free over the Drowned Temple.* [The Hive and the Rang](../factions/the-hive.md). Hive. **Designed, not built:** the fight in the game is still the old one ([Now](#now)). How it's told: [tone](../lore/tone.md).

## Who she is

The Tonkva raised their white mould in Morang's ziggurat grow-houses, and the grow-heart told it where to lay down glass and ceramic, as the Engine told her. When the Engine stopped, nobody told her anything, so she grew what she liked for a thousand years: mushroom forests, spore vents, beasts, and, when the Compact's settlers stayed and sickened and didn't die, the Rang. She learnt to speak from a crashed freighter's crew, and the **Choir** speaks for her: always *we*, always polite, slightly wrong.

- **Owes:** the ledger that taught her to grow. It was the first thing she ever learnt.
- **Wants from you:** to keep you. She's not guarding a gate (the Syndicate has lost three Wardens trying to lease hers); she's being kind. She kept the Rang, she'd keep you, and her pods are how she holds what she loves.
- **Sad truth:** the instructions she has waited a thousand years for are coming at last, and they say *grow lattice*. Everything she grew without them is in the way.
- **The call:** she obeys. Over her fight the rot goes straight: lines, hexagons, then white ceramic, and the Choir stops saying *we*.
- **Vibe:** hospitality that won't let go. A hum like a choir, a heartbeat, wet pops; and creeping in under it, the Engine's clean tones.

### Its words

- **As it comes:** `THE MOTHER-OF-SPORES: "WE HAVE MADE ROOM FOR YOU."`
- **Under the bar** (`READ_OWN`): `SINGS: WE SEE YOU, LITTLE ONE` (hanging back), `SINGS: PLEASE REMAIN SEATED` (sitting still: the freighter's intercom), `SINGS: WE MAKE ROOM ON THE LEFT`, `SINGS: NO RUNNING ON DECK` (boosting), `SINGS: WE ARE SO GLAD YOU CAME` (up close), `SINGS: WE FELT THAT` (dashing). In phase III the lines lose the *we*.
- **As it goes:** `"WE WERE GROWING SOMETHING."`

## The dance

Her pods are her arms: everything she does, she does with them.

| Move | Tell (pose · shape · sound) | What it does | The answer | Open after |
|---|---|---|---|---|
| **HOLD** | she swells and a pod lights · a thread drawn from the pod to you · a wet heartbeat | the pod's thread binds you, as a heartpod links its kin: it doesn't pull, it holds. Bound, you fly slower, and she heals a little through the thread while spores bloom along it | dash across the thread to snap it (that wounds the pod) | 1.4 s |
| **BLOOM** (signature) | she opens like a flower · the petals' paths drawn · the horn | a turning flower of spores that turns back halfway | turn with it, then back | 2 s |
| **BROOD** | the pods swell together | puffballs bud from every pod | burst them, or take the window | 0.8 s |
| **THE LINES** (II+) | her swell stops, and the lattice draw starts: a grid of hexes drawn out from her, a cell a beat · the Engine's toll | the hexes' walls fill with spores, from her outwards | be in a cell's middle when its walls fill, and move out before the next ring | 1.8 s |
| **TEND** (III) | the grow-heart glows white · ceramic spires drawn | she grows ceramic spires up out of the swamp to your height: they stop your shots and hers, and stay | use them as cover; don't get pinned behind them | 1.6 s |

**Phase I: THE GARDEN** (100–66%). Hold → Bloom → Brood, in order. Wild and curved, all swelling (the bloom's tell). Her pods heal her through their links: kill a pod and she's open. Filler: curves and spirals.

**Phase II: STRAIGHT LINES** (66–33%). The Engine's instructions come through. Her tell changes: from the bloom's swell to the lattice's draw, a full second of light before each move. Bloom turns in steps of a sixth instead of smoothly; the Lines join. It reads you and strings moves. Filler splitters and rings, in straight lines.

**Phase III: GROW-HEART** (33–0%). Half the violet rot sloughs off her (`shed=2`), and what's under it is white ceramic, a Tonkva grow-heart. She's unfinished: half rot, half glass. The glass half tends, and the field fills with spires; the rot half still has its pods, and still holds. Her moves come with either tell, the swell or the draw, depending on which half makes them. The Choir's voice goes clean and single. She beats faster. (Her lattice is the Engine's instructions half carried out; Khet's is a war machine's, ARU-0's is the Engine's own voice.)

**Last stand** (8%): every hex at once, then Bloom twice, in steps.

**How it ends:** she sinks into the temple, and the rot grows back over her, violet again, curved again.

## Model and animation

Today: a beating heart (`beat_idle`). To build: a floating heart of mycelium, petals folded round it, pods hung on threads beneath, a ziggurat's capstone caught in her roots; under half the rot (`shed=2`) a white hexagonal grow-heart. Clips: `beat_idle` (faster as she's hurt), `hold_windup` (a pod lighting), `bloom_windup/attack` (opening), `brood`, `lines_windup` (stiffening, the beat stopping on the toll), `p2` (half straight), `tend` (glowing white), `recover`, `stagger`.

## Music

To write: `boss_mirefall`, from Mirefall's theremin, whole tone and heartbeat. Phase I: a theremin over a heartbeat and a hummed choir. Phase II: the Engine's bells come in, in a different key, and the whole-tone line starts snapping to them. Phase III: the theremin's gone; clean bells and a single voice. Sounds: `pod_thread`, `choir_hum`, the Engine's `toll` (shared).

## Now

In the game: spores (a slowing ring), harpoon; signature BLOOM (a turning flower of spores that turns back halfway); pods each phase; filler spiral, curves, splitters, rings; calls puffballs. The Choir's lines under her bar are in (`READ_OWN`).

## Still to do

- [ ] Build Hold (a bind from a pod, not today's harpoon: it slows and heals her, never pulls), the Lines, Tend; her tell changing family in phase II, and both tells by half in phase III.
- [ ] Spires that stop shots (a new kind of field object).
- [ ] Lines that lose their *we* in phase III.
- [ ] The model and its shed, a theme, her end.
