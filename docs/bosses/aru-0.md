# Asset Recovery Unit 0 (Cinder)

*Vantorr's debt collector: an Engine recovery unit dug out of the ice, in company paint.* [Vantorr](../factions/vantorr.md). Pursuer. **Built.** Needs to be flown by hand and tuned. How it's told: [tone](../lore/tone.md).

<video src="media/aru-0-fight.mp4" controls width="640"></video>

[The fight, flown by the autopilot](media/aru-0-fight.mp4) (141 s, with sound: *Final Notice* changing with its phases, the notice chime, the printer, claws and winches, the hull plate tearing and clanging off the field's edge, the Engine's toll). It shows the chase (claw rows ahead of you, then it overtakes), Repossession, Lien (tow lines to the scrap, plates on the bar), the nineteen seconds (the march stops, the ledger), the call (its name changes, the company paint comes off), Ballast and the plates coming back, then down. Recorded with `tools/record.ts` (`?planet=cinder&mode=boss&autopilot&length=30&seed=3`) from a production build.

## Who it is

In the Level Age the Engine sent recovery units down every lane that leaned, to carry ballast back. In 380 L Vantorr's Glacis Concession dug one out of the ice intact, built a ship round it, painted it orange and white, and taught it repossession: ships, cargo, and people who owe Vantorr. Its biggest job is runaway tenants, born on the terraces, paid in scrip that's worthless off Cinder, who buy passage out from rustwings. Its second biggest is runaway nemva.

- **Caught between:** the company that paints it, and the machine that made it.
- **Owes:** Vantorr, on paper.
- **Wants from you:** what's in your hold: the tenants and the woken cores you're carrying out. On Vantorr's books they're absconded assets, and so is your ship.
- **Sad truth:** there's nobody in it. It's a sleeping core that never woke, and it obeys whoever calls loudest. In 409 L it stopped for nineteen seconds mid-chase, facing Glacis. Recovery's engineers have started to suspect it was never Vantorr's.
- **The call:** it answers. In its last phase it stops being Vantorr's collector and becomes the Engine's, and throws off the company.
- **Vibe:** corporate politeness over something very old. Account notices in a pleasant voice, a printer's chatter, the clack of claws; and at the end, the Engine's tolls.

### Its words

- **As it comes:** `ASSET RECOVERY UNIT 0: "YOUR ACCOUNT IS IN ARREARS."`
- **Under the bar** (`READ_OWN`): the notices. `ISSUES: ASSET WITHHELD` (hanging back), `ISSUES: ASSET LOCATED` (sitting still), `ISSUES: ASSET EVADING LEFT`, `APPLIES A LATE FEE` (boosting), `SERVES YOU IN PERSON` (up close), `ISSUES: FINAL NOTICE` (dashing). During the nineteen seconds it says nothing.
- **As it goes:** no line. It turns to face Glacis, and stops (not built yet).

## The dance

Its theme's beat is 112 bpm (a beat is 0.54 s): the claw rows land on it.

| Move | Tell (pose · shape · sound) | What it does | The answer | Open after |
|---|---|---|---|---|
| **PURSUIT** (the opening) | it comes up from behind, facing up the field, claws reaching · a ring under it · the notice chime | for ten seconds it chases you up the field, throwing a row of claws ahead of you every two beats, each row with one gap (3 rows, then 4) | keep ahead and take each gap | — (it overtakes, shielded, round your side: `ACCOUNT OPEN`) |
| **REPOSSESSION** (signature, first in every phase) | scanner locks · a reticle on you · the horn (the toll once it's called) | fires where you were and leaves a collector mine there (2.4 s from phase II), and drops a lot of scrap on the spot | keep moving; don't come back over the mines | 2.2 s |
| **LIEN** | hold opens · amber tow lines drawn to every loose scrap on the field (claws thrown down for more if there's too little) · the printer | it reels the scrap home along the lines, and each one it takes is bolted on as a **plate** (a pip on its bar). It never reels you: it follows mass, not debts | fly the scrap off its lines before it gets home (`RECLAIMED`). The lines are live: don't cross them. Then break the plating with a blow: it sheds every plate as scrap and staggers | 1.6 s |
| **COLLECTORS** (I, II) | a chime | a hookjaw: its repossession crew | kill it, or take the window | 0.8 s |
| **BALLAST** (III) | tears a plate off · the lane drawn from it to the field's edge, through you · the hull tearing | throws the plate down the lane at 27 u/s. It clangs off the edge and comes back up the same lane, a little slower, and it catches it | off the lane, and stay off it until the plate's home | 1.8 s |

**Plating.** While it's plated, your stream glances off (as off any plated enemy); a heavy blow breaks all of it at once. So Lien is a race: take the scrap before it does, or break what it bolted on. It holds 8 plates at most.

**Phase I: ACCOUNT OPEN** (100–66%). The chase first, then Repossession → Lien → Collectors, in order. Filler: walls and splitters.

**Phase II: IN ARREARS** (66–33%). Fees and penalties: every Lien is followed by a second, the mines last longer, and it reads you and strings moves. Filler: lasers and walls.

**Phase III: SETTLEMENT** (33–0%). It stops in the middle of the field, faces north, and for **nineteen seconds** it fights on in silence: the march drops to a hum, a clock ticks each second, no notices. All it does is the **ledger**: a row of needles the width of the field, with one gap that walks left and right. Your fire does a quarter of its damage. Then a toll: `IT HAS BEEN CALLED`. Its name on the bar changes to `RECOVERY UNIT`, the company cab, collar and nacelles fly off it (`IT THROWS OFF THE COMPANY`), and the Engine's bells take the theme. From here every tell is drawn for at least a second and opens with a toll, and the signature is named `RECOVERY`. Order: Ballast → Recovery → Ballast → Lien. Each Ballast throws a Lien plate if it has one; with none left it **tears off its own hull** instead: each tear makes it 12% faster and its tells 5% quicker, and after two tears it throws down two lanes at once.

**Last stand** (8%, only once it's called): Ballast down five lanes at once (the middle, and two either side), a Lien on at least six scrap, Ballast again, then Recovery.

**How it ends:** for now the shared kill. Designed: it turns to face Glacis, and goes still. Nobody shot it down; it was called.

## Model and animation

Rebuilt in `tools/models/bosses.py` (`boss_cinder`, `aru_poses`). From above: a long navy-and-ceramic Tonkva keel (the recovery unit), with an empty hold cradle, an amber furnace for its core and drive fins at the stern. Two long hinged arms reach forward from its shoulders, each with a forearm and a pair of jaws. Over it, Vantorr's orange-and-white company hull: a cab with a scanner and beacons, a collar, nacelles, and two hold doors with the three-step sign. The cab, collar and nacelles have `shed=3` (they fly off when it's called). Four plates on its flanks have `plate=1..4`, and Ballast tears them off one by one (`plateTo` in `boss-pose.ts`), so it ends bare to the Tonkva frame. Its core is the weak point.

Clips: `collect_idle` (a patient prowl, claws working), `p2`, `silence` (still, arms folded in, facing north), `pursuit_windup/attack` (claws thrown forward on the beat), `repossess_windup/attack` (scanner locked, recoil), `lien_windup/attack` (doors open, arms reeling), `summon`, `ballast_windup/attack` (an arm tearing a plate off, the throw), `recover`, `stagger`. It faces up the field while it chases you and through its nineteen seconds.

## Music

`boss_cinder` in `src/audio.ts`: *Final Notice*. Vantorr's company march in C major at 112. **Account open:** hold music on the keys over an oom-pah saw bass, with a dot-matrix chatter in the hats. **In arrears:** brass and a distorted bass take over, with snare rolls and the printer running hot. **The nineteen seconds:** lead, arp and drums are muted (`mute` on a part); a sub hum and a cold pad are left. **Called:** the Engine's bells, a rim tick like its clock, a pulsing sub. **Last stand:** the march and the bells at once.

Its sounds: `notice` (the company's two-note chime: its intro, PURSUIT and the collectors), `printer` (Lien's tell), `claw` (each claw thrown), `winch` (the lines taking up), `plate_on` (a scrap bolted on), `plate_tear` (Ballast's tell, and its own hull torn off), `clang` (the plate striking the field's edge), plus the Engine's `toll` and `clock_tick`.

**Not yet listened to by a person.** The video has the theme and the sounds, so start there.

## Bench

Hull 2.2× a boss's usual (`HULL` in `src/sim/boss.ts`). On the autopilot (`just autopilot --planet cinder --mode boss --seeds 16`), 14 of 16 runs cleared, with 2.4 hits a run (the old fight cleared 7 of 8). A god-mode bench over 10 seeds puts the fight at about 120 s: phase I about 50 s (with the 10 s chase), phase II about 24 s, phase III about 46 s (19 s of silence, then 35–46 s called), with 2–3 Ballasts. Most hits come from the ledger's needles during the nineteen seconds and from filler.

## Still to do

- [ ] Fly it by hand. Can you read the claw rows' gaps while it's behind you? Is breaking the plating with a blow clear enough without a word on screen? Is the ledger fair after two phases of a different fight?
- [ ] The nineteen seconds at a quarter damage feel long against the autopilot. Watch them by hand before shortening them.
- [ ] Its end: it turns to face Glacis, and stops (see [Shared by all](README.md#shared-by-all)).
- [ ] Listen to *Final Notice* and its sounds. A spoken notice voice (a pleasant announcer from `tools/voices/`) would sell the company.
- [ ] Claw rows on the beat are timed by the sim, not the music, so they drift against the theme.
- [ ] A graft of its own (`src/game/grafts.ts`): Lien on the AUX (tow lines that reel scrap to you).
