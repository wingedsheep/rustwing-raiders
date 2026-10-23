# The Sandking (Kessra)

*The Long Table's court, walking on titan legs, with its two-headed Chair on the top deck.* The [Uukhvar](../factions/dune-cartel.md). Pursuer. **Designed, not built:** the fight in the game is still the old one ([Now](#now)). How it's told: [tone](../lore/tone.md).

## Who it is

The Sandking is where the Table sits: twelve houses of Kessra, seven Vhossk and five human, in a court on a deck raised so high on six legs that it walks through the sky you fly in. Its feet are on the salt far below; its deck, its guns and its Table are up here with you. It walks a slow circuit of Kessra's markets so the Table never sits in one house's city again. It was built in 288 L from the hull of a war barge and the legs of three titans that fell in the Toll War. Its Chair is **Ghorrum-Vesst** of House Grovvakh: Ghorrum, the left head, patient, Old Contract; Vesst, the right, furious, New Table. They have never voted the same way, and a tie goes to whoever spoke last.

- **Caught between:** the living's contracts, and the dead's ledger.
- **Owes:** the dead its legs were cut from, and (says the Old Contract) the Tonkva ledger, which the Vhossk witnessed.
- **Wants from you:** your crossed metal. You carry more of it than anyone, and the Table is a market: Ghorrum would buy it to settle Kessra's ledger before the Engine asks, and Vesst would sell you and it to the Throne. Either way it's a deal, done with guns, and it's a courtesy to refuse the first price.
- **Sad truth:** the titan legs have cores, and the cores are listening to Glacis. For seven years the Sandking has drifted north a step a day off its circuit. The Table has voted not to notice.
- **The call:** in its last phase the legs stop asking the Table where to walk.
- **Vibe:** a bazaar on stilts arguing with itself. Two voices over a horn, gavels, a crowd of houses; under it the slow groan of titan joints.

### Its words

- **As it comes:** `THE SANDKING: "THE TABLE WILL HEAR AN OFFER."`
- **Under the bar** (`READ_OWN`): it votes on you. `VOTES: RUN IT DOWN` (hanging back), `VOTES: LET IT WAIT` (sitting still), `VOTES: CLOSE THE LEFT`, `VOTES: CHARGE IT INTEREST` (boosting), `SPLITS: IT WANTS TO DEAL` (up close), `SPLITS, SIX TO SIX` (dashing).
- **As it goes:** `GHORRUM: "SIGNED IS KEPT."` `VESST: "NOTHING WAS SIGNED."`

## The dance

The Table is a market, and it fights the way it trades: **it names a price for your metal while it shoots at you.** On Kessra it's a courtesy to refuse the first price, an insult to take it, and a deal to take the third. (Khet's fight has the "which tell is true?"; this one has the haggle.)

| Move | Tell (pose · shape · sound) | What it does | The answer | Open after |
|---|---|---|---|---|
| **BACK TOLLS** (opening) | it comes up behind you over the salt · its shadow ahead of you · the horn far off | the chase: it lunges from behind while the land races by, shells walking up the ground | keep ahead, sidestep the lunge | — (the chase ends when it overtakes) |
| **THE PRICE** | a head calls a number · the bar says it (`GHORRUM ASKS 90`) and a gold ring is drawn on the field, the Table's counting-light · a gavel | for 5 s it fires slow, measured walls while the ring stands. Fly through the ring and you pay (the scrap goes from the run's purse). Let it close and you've refused, and the next price is lower | refuse the first, refuse the second, take the third | as the walls end |
| **TRIPOD** | it rears and sets three feet · six circles, two triangles · a groan of joints | it strides across the field three legs at a time: each foot slams the salt far below and throws a column of salt up through your height | fly where the last three feet were: their columns are settling as the next rise | 1.6 s, mid-stride |
| **STAMPEDE** (signature) | it stamps and the houses cheer · lines of footprints drawn marching through you · the horn | its feet march lines of stamps through the field, each throwing salt up to your height | between the lines, moving with them | 1.8 s |
| **HOUSE GUARDS** (II) | gavels | two rattlers, a house's skiff-riders, launched off the deck | kill them, or take the window | 0.8 s |

**Phase I: GHORRUM HAS THE FLOOR** (100–66%). The chase, then Tripod → Stampede → the Price, in order. The patient head names the prices, and keeps them:
- **Take the first price**: an insult. Vesst roars, and the rest of the phase comes at 1.15× with no Price again.
- **Take the second**: a fair deal, and nothing changes.
- **Take the third**: a deal on Kessra's terms. The Table signs: its next Stampede is skipped, and the phase ends at its line (hull to 66%).
- **Refuse all three**: no deal, the fight goes on as it was, and you keep your scrap.

Filler: walls and rain, measured.

**Phase II: VESST HAS THE FLOOR** (66–33%). A house quits the Table: its pavilion breaks off the deck and its skiffs fly off with it (`shed=1`), and the furious head takes the Table: charges down your line, shells in walls, the guards. Vesst names the prices now, higher, and under fire: the walls come faster while his ring stands. His third price still signs (Ghorrum makes him keep it: *signed is kept*). It reads you and strings moves. Filler splitters and fans.

**Phase III: THE LEGS DON'T ASK** (33–0%). The heads still name prices, and the ring still lights, but a deal does nothing: the legs walk where they like. Pay and the Table signs, and the legs stride on anyway (the scrap is gone; this is the sad truth, shown). Tripod strides on its own, north, carrying the court with it (`IT IS WALKING NORTH`); between moves it takes a stride towards the top of the screen. The Table goes quiet and the joints get loud.

**Last stand** (8%): a stampede in both directions, then both heads at once: two rings, two prices, and neither of them means anything.

**How it ends:** its legs fold and the deck sinks out of the sky to the salt, and the two heads speak their last lines over each other.

## Model and animation

Today: six legs and a walk loop. To build: from above, a war-barge deck with six titan legs reaching down and out from under it to the ground (three pairs, mismatched: three different titans), a long table on the deck with twelve house banners, the two-headed Chair at its head (both heads turn to call), a house's pavilion with its skiffs (`shed=1`: the house that quits). Clips: `walk_idle`, `price_windup` (a head calling, a gavel), `tripod_windup/attack` (rearing, three feet down), `stampede_windup` (stamping), `p2` (listing, heavier), `p3` (the legs walking without it, the heads slumped), `recover`, `stagger`.

## Music

To write: `boss_kessra`, from Kessra's oud and darbuka. Phase I: an oud taqsim over a slow darbuka, patient. Phase II: double time, a reed lead, hand claps like a market. Phase III: the band drops out under a low drone and a titan's footfall on every beat. Sounds: `gavel`, a `price` call, two `vhossk` voices (the low left, the sharp right), `titan_step`.

## Now

In the game: the chase (lunge from behind, ground shells while the land races by), then charge, shells, harpoon; signature STAMPEDE; filler walls, rain, splitters, fans; calls rattlers. Its votes under the bar are in (`READ_OWN`).

## Still to do

- [ ] Build the Price (the ring, paying from the purse, the three outcomes), Tripod, and the third phase's walk north.
- [ ] The price on the bar: `GHORRUM ASKS 90`, `VESST ASKS 160`, and what it says when you take one (`SIGNED`, `AN INSULT`). Prices scale with the sector.
- [ ] Two voices: the heads arguing over each other, a designed voice each.
- [ ] The model and poses, a theme, its end.
