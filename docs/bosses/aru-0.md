# Asset Recovery Unit 0 (Cinder)

*Vantorr's debt collector: an Engine recovery unit dug out of the ice, in company paint.* [Vantorr](../factions/vantorr.md). Pursuer. **Designed, not built:** the fight in the game is still the old one ([Now](#now)). How it's told: [tone](../lore/tone.md).

## Who it is

In the Level Age the Engine sent recovery units down every lane that leaned, to carry ballast back. In 380 L Vantorr's Glacis Concession dug one out of the ice intact, built a ship round it, painted it orange and white, and taught it repossession: ships, cargo, and people who owe Vantorr. Its biggest job is runaway tenants, born on the terraces, paid in scrip that's worthless off Cinder, who buy passage out from rustwings. Its second biggest is runaway nemva.

- **Owes:** Vantorr, on paper.
- **Wants from you:** what's in your hold: the tenants and the woken cores you're carrying out. On Vantorr's books they're absconded assets, and so is your ship.
- **Sad truth:** there's nobody in it. It's a sleeping core that never woke, and it obeys whoever calls loudest. In 409 L it stopped for nineteen seconds mid-chase, facing Glacis. Recovery's engineers have started to suspect it was never Vantorr's.
- **The call:** it answers. In its last phase it stops being Vantorr's collector and becomes the Engine's, and throws off the company.
- **Vibe:** corporate politeness over something very old. Account notices in a pleasant voice, a printer's chatter, the clack of claws; and at the end, the Engine's tolls.

### Its words

- **As it comes:** `ASSET RECOVERY UNIT 0: "YOUR ACCOUNT IS IN ARREARS."`
- **Under the bar** (`READ_OWN`): the notices. `ISSUES: ASSET WITHHELD` (hanging back), `ISSUES: ASSET LOCATED` (sitting still), `ISSUES: ASSET EVADING LEFT`, `APPLIES A LATE FEE` (boosting), `SERVES YOU IN PERSON` (up close), `ISSUES: FINAL NOTICE` (dashing). In phase III it says nothing for nineteen seconds, and then only the Engine's words.
- **As it goes:** no line. It turns to face Glacis, and stops.

## The dance

| Move | Tell (pose · shape · sound) | What it does | The answer | Open after |
|---|---|---|---|---|
| **PURSUIT** (opening) | it comes up behind you over the terraces · its lamps behind you · a notice chime | the chase: claws thrown ahead of you as the orchards race by | keep ahead, off the claws' lines | — (ends as it overtakes) |
| **REPOSSESSION** (signature) | its scanner locks · a reticle on you · the horn | fires where you were, and leaves collector mines on the spot | keep moving; don't come back over the mines | 2.2 s |
| **LIEN** | its hold opens · tow lines drawn to every loose scrap on the field · a printer chatter | the lines reel the scrap in, and what it takes plates it (its poise up). It never reels you: it follows mass, not debts, which is the first hint that it isn't Vantorr's | fly the lines and take the scrap before it does; the lines cut where they cross you | 1.6 s |
| **COLLECTORS** (I, II) | a chime | a hookjaw: its repossession crew | kill it, or take the window | 0.8 s |
| **BALLAST** (III) | it tears off a plate of company hull · the lane drawn through you, end to end · the Engine's toll | it throws the plate down the lane and it comes back the other way, levelled | off the lane, both ways | 1.8 s |

**Phase I: ACCOUNT OPEN** (100–66%). The chase, then Repossession → Lien → Collectors, in order. Vantorr's collector, by the contract.

**Phase II: IN ARREARS** (66–33%). Fees and penalties: it reels harder (two Liens in a string), its mines last longer, it reads you and strings moves. Filler lasers and walls.

**Phase III: SETTLEMENT** (33–0%; the tenants' word for the day the Engine wakes). It stops in the middle of the field, facing north, and for **nineteen seconds** it fights on in silence: no notices, no names on the ribbon, the music down to a hum. Then a toll, and its name on the bar changes to `RECOVERY UNIT` (`IT HAS BEEN CALLED`). From there it fights in the Engine's voice (every move drawn a full second, tolls for tells) and **sheds Vantorr**: each Ballast is a plate of its own company hull, so it gets lighter, faster and barer as the phase goes on.

**Last stand** (8%): a Lien on every scrap on the field at once, then Ballast down every lane.

**How it ends:** it turns to face Glacis, and goes still. Nobody shot it down; it was called.

## Model and animation

Today: one idle (`collect_idle`). To build: a sleek white-and-orange company hull (Vantorr's three-step sign on every plate, the plates `shed` through phase III), over an old grey Tonkva recovery unit: a long carrier body with claws, ceramic under the paint. Clips: `collect_idle`, `lock_windup`, `lien_windup/attack` (hold open, reeling), `ballast_windup` (tearing off a plate), `silence` (still, facing north), `p2` (bare: the Tonkva unit), `recover`, `stagger`.

## Music

To write: `boss_cinder`, from Cinder's corporate march. Phases I and II: a bright company march, a hold-music lead, a printer's rhythm in the hats. Phase III: silence for nineteen seconds, then the Engine's bells and its theme's ticking clock in Cinder's key. Sounds: `notice` (a pleasant chime), `printer`, the Engine's `toll` (shared).

## Now

In the game: chase, then charge, harpoon, shells; signature REPOSSESSION (locks on, fires where you were, collector mines); filler lasers, walls, splitters, spiral; calls a hookjaw. Its notices under the bar are in (`READ_OWN`).

## Still to do

- [ ] Build Lien (scrap on the field reeled in, plating it), the nineteen seconds, the rename, Ballast and its shedding.
- [ ] Scrap on the field during a boss fight: where does it come from (its collectors, its own plates)?
- [ ] The model (company hull over a Tonkva unit), poses, a theme, its end.
