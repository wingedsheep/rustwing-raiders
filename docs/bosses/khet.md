# Warlord Khet (Ashgrave)

*A Chikta foundling, riding the head of the titan* Unbending*.* The [Sankvi](../factions/scav-clans.md). Brawler. **Designed, not built:** the fight in the game is still the old one ([Now](#now)). How it's told: [tone](../lore/tone.md).

## Who he is

The Chikta found him on the scrap trail and named him *Keti*, "found thing"; he added the *h* to sound harder. In 404 L he climbed into the head of *Unbending*, the Compact's great titan, wired its eye into a power plant, and made it lift its head. Then the clans cut the head free of the body and bolted thrusters to it, and Khet flies it. Nobody had ever made a titan move. The clans followed him, the Syndicate gave him the junction's lease, and he has been a warlord ever since: loud, quick, funny, desperate to be somebody.

***Unbending*** woke during the nine days of the Five Mouths, from a crew dying inside it, and lay in the glass for 166 years with nobody to talk to. It remembers who glassed Sankven: its own side. Then a boy climbed into its head and wouldn't stop talking.

- **Caught between:** the clans' Glass Law, and a mind that is nobody's.
- **Owes:** the Chikta who found him; the clans who believed him.
- **Wants from you:** a win, in front of the clans. A warlord happens when the others can't stop him; he needs to be seen not being stopped.
- **Sad truth:** he never re-wired it. *Unbending* lifted its head because it wanted to, and has carried him since because, after 166 years alone, he talked to it ([minds](../lore/minds.md)).
- **The call:** *Unbending* is a woken core, so it can choose. In Khet's last phase it chooses: it sets him down, and fights for him, its own way.
- **Vibe:** a showman on a giant's head, and the giant patiently letting him. Scrap-built thrusters revving, Khet yelling, a vast slow servo groan; and in the last phase, a Compact war machine's clean tones.

### Its words

- **As it comes:** `WARLORD KHET: "SANKVEN! WATCH THIS!"`
- **Under the bar** (`READ_OWN`): Khet. `YELLS: SCARED OF A HEAD?` (hanging back), `YELLS: HOLD STILL!`, `YELLS: GOT YOU ON THE LEFT`, `YELLS: RUN, RUSTWING!` (boosting), `YELLS: OFF MY TITAN!` (up close), `LAUGHS: SLIPPERY!` (dashing). In phase III *Unbending* doesn't speak; it shows you, drawn in light.
- **As it goes:** *Unbending*, through the head's old Compact speaker, the only thing it ever says: `"NOBODY'S TITAN."`

## The dance

Khet's tells are scrap (engines flare red, then commit). *Unbending*'s are lattice (the whole move drawn in light first). In the middle phase you get both, and only one is true.

| Move | Tell (pose · shape · sound) | What it does | The answer | Open after |
|---|---|---|---|---|
| **RAM** | the thrusters flare · a red line at you · Khet: `HOLD ON!` | the head charges down the line | step off; the charging body cannot be parried | 1.6 s, 2.2 s reeling |
| **TITAN EYE** (signature) | the eye opens · the beam's line drawn · the horn | a beam that follows you, slower than you fly | keep moving round it | 2 s, the eye dimming |
| **SLAM** | the jaw drops open, the head rears · a ring drawn on you | the head drops onto you with its thrusters full; a ring of junk thrown off | leave the ring | 1.4 s |
| **THE CLANS** (I, II) | Khet waves | two ramjacks, his riders | kill them, or take the window | 0.8 s |
| **THE GLASSING** (III) | a grid of circles drawn across the field, the Compact's way · a clean tone a circle | a barrage of air-bursts: each circle hangs as a cloud of molten glass that stays a while and burns | leave each circle as it's drawn; the sky fills with glass, so keep a way out | 2 s |
| **THE KNEEL** (III) | *Unbending* bows its head over Khet · its shield drawn round him | it shields Khet, and turns its eye on you from behind the shield | go round; the eye can't turn and shield at once | 1.8 s |

**Phase I: KHET'S RIDE** (100–66%). Ram → Titan Eye → Slam, in order, and his clans. All scrap: flare tells, junk guns bolted to the head (fans and walls).

**Phase II: THE HEAD WON'T** (66–33%). Khet calls a move and flares for it, and now and then *Unbending* draws something else in light and does that instead (`IT ISN'T LISTENING`). The light is always the true tell: trust it over the flare. What it does instead is never reckless: it won't ram the edge, it won't slam into its own clans. It reads you and strings moves.

**Phase III: UNBENDING** (33–0%). The scav plating and junk guns blow off the head (`shed=2`), and Khet, hurt, is held in its jaw like a cub (`IT HAS DECIDED`). The titan fights the way it was built to, a Compact war machine: everything drawn, precise, the Glassing and the Kneel. No more clans: they won't come against a titan that walks for itself.

**Last stand** (8%): the Glassing over the whole field, with one way out, then the eye twice.

**How it ends:** its thrusters cut, and it sinks out of the sky to the glass below with Khet held in its jaw; it sets him down there, and its eye goes dark. It says its line.

## Model and animation

Today: a titan head (`ride_idle`). To build: a vast Compact titan head in old blue, cut off at the neck, under Sankvi scrap (plating, thrusters, junk guns: `shed=2`), the eye a weak point, a hinged jaw, and Khet on a rig on the brow, small and visible. Clips: `ride_idle`, `ram_windup/attack`, `eye_windup/attack`, `slam_windup/attack`, `p2` (the head moving against its rider), `glassing_windup`, `kneel` (bowed, jaw round Khet), `recover`, `stagger`.

## Music

To write: `boss_ashgrave`, from Ashgrave's industrial grind. Phase I: a grinding riff and a chanting crowd: his. Phase II: the riff falters every other bar, and a Compact march starts under it. Phase III: the march alone, clean brass over a slow heavy kick: the titan's. Sounds: `khet_yell`, `titan_servo`, `glassing` (a clean tone, then glass ringing).

## Now

In the game: charge, slam, harpoon in the last phase; signature TITAN EYE (a beam that follows you, slower than you fly); filler fans, walls, lasers, rain; calls ramjacks. His lines under the bar are in (`READ_OWN`).

## Still to do

- [ ] Build phase II's false tell (a flare, then a different drawn move), and the Glassing (glass that stays and burns) and the Kneel.
- [ ] Lines that change with the phase: Khet, then *Unbending*'s silence.
- [ ] The model with Khet on it, poses, a theme, its end.
