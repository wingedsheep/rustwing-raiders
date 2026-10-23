# Rustwing Raiders: style and characters

A style guide for how the game looks, sounds and talks, and a proposed cast of creatures and events. It works alongside `docs/design-research.md`, which covers mechanics.

**Tone target: a lived-in frontier, a little Gazillionaire.** The base is strange but believable aliens, droids, smugglers, debts and bounty hunters; the look borrows Star Wars' used universe, but the world is its own: several orders of civilisation grinding together, not an empire and its rebels ([tone](lore/tone.md)). Gazillionaire supplies a pinch of whimsy in the economy and the lenders. Characters should feel like they could sit at a cantina bar, not in a cartoon.

---

## 1. The look we already have

From `src/render/pixel.ts`, `src/render/toon.ts`, `src/render/alive.ts` and the art in `public/art/`:

- **In flight:** a 3D scene rendered small (one texel per art pixel), with **banded toon lighting** of a few soft steps, soft depth outlines, painterly smoothing, bloom, a split-tone grade and a vignette. It is then scaled up with nearest-neighbour sampling, so the result is "pixel art, just finer and better lit". The world breathes: wind, sway and drifting cloud shadows.
- **Key art and events** (`title.png`, `public/art/events/*.png`, 640×360): rusty, chunky, orange-and-cream ships with heavy panel lines, over lush, golden-hour alien landscapes (waterfalls, mesas, ringed planets, a shattered ring-gate). The interiors are cluttered and **lantern-lit**, in warm amber against cold blue starlight through a porthole. The people are larger than life: Mama Ruzz on her fur-trimmed throne between two masked goons, Spoke the one-eyed reel-runner, and an insurance salesman in a pink sequinned suit leaning out of a neon-signed barge.

**Name for the style: "rust-punk frontier under golden light."** The machinery is worn and hand-built, but the light is warm and the world is beautiful and alive, not grimdark. Think *Treasure Planet* and *Cowboy Bebop* by way of Moebius.

### Rules to keep it coherent
1. **Two light temperatures per frame:** warm, man-made light (lanterns, engines, glow parts) against a cool, natural fill (sky, space, ice). The player's eye goes to the warm.
2. **Rust is the player's colour.** Player ships are orange, rust and cream. No enemy faction should share that hue family, so co-op players find themselves instantly.
3. **Each faction owns a material and a hue** (see the table below). Silhouettes come before colour. Every foe must read as a black shape at 32 pixels.
4. **Enemy bullets sit outside the painterly grade:** unlit (`toon.ts` already has an unlit flat material), saturated, with a dark rim. The world is painted, the danger is not.
5. **Golden-hour backgrounds sit at mid-value in combat zones.** Save the deep shadows and blown highlights for between-wave lulls and title art.
6. **Text** is short, upper case, plain verbs and nouns ("NEEDS 15 SCRAP", "A GUN IN FRONT"). Never use jargon in the UI. Put the flavour in the quotes, not the labels.

### Faction visual languages (matching `src/sim/factions.ts`)

| Faction | Material | Hue | Shape language | Sound |
|---|---|---|---|---|
| **scrap** (Hesk, Cartel, Scav Clans, Reef Pirates) | welded plates, chains, harpoons, exhaust stacks | brass and red flare | asymmetric, bolted-on, forward-leaning wedges | two-stroke revving, clanks |
| **lattice** (Port Authority, Waking Engine, Vantorr) | white ceramic, glass, hard-light | cyan and white | symmetrical, hexagonal, rings and gates | clean sine tones, a click before each beam |
| **wild** (native beasts) | hide, chitin, feathers | earth tones with a hot accent where they strike | curves, crouches, tails | breaths, chirps, roars on the tell |
| **bloom** (the Hive, Mirefall) | caps, gills, threads, spore sacs | violet and acid green | swelling, clustered, dripping | wet pops, a choir-like hum |

---

## 2. References: Star Wars, Gazillionaire and others

**Gazillionaire** (LavaMind, 1994; Steam re-release 2020) is a space trading game for 2–7 players. You buy cheap, fly, sell dear, and survive the random events along the way ([Wikipedia](https://en.wikipedia.org/wiki/Gazillionaire)). Reviewers remember it for its "strange graphics" and "bizarre names". The ships are surreal: a detached eyeball, a whale with a pinwheel tail, a locomotive sprouting rockets. The goods are absurd: Kryptoons, cantaloupes, hair tonic, polyester, frog legs, umbrellas, Oggle Sand. A loan shark, **Mr. Zinn**, lends you your first ship at 4% a week ("Mr. Zinn wants his money"). A wealthy prince offers triple price for your cargo, rivals flood your market, and ships get destroyed at random, so insurance matters. A retrospective calls out the short music clips and **the sounds the aliens make** as the first thing you notice ([GameRevolution](https://www.gamerevolution.com/features/369303-remember-gazillionaire-surreal-space-bound-business-simulator-time-forgot), [GameSpot](https://www.gamespot.com/reviews/gazillionaire-deluxe-review/1900-2536140/)).

What to take from it:
- **Weird, but sincere.** The aliens are odd to look at, while the economy underneath is "excellent" and serious. The jokes sit on top of real stakes (debt, insurance, a crashed market) and never replace them.
- **Each character is one function with a face.** The lender, the insurer, the prince who pays triple. You learn the cast as you learn the systems.
- **Silly goods, real economics.** Absurd names make a dry buy-low/sell-high loop memorable.
- **Every character makes a sound.** A two-second creature noise does more for personality than a paragraph of text.

**Our events already follow this pattern** (`src/sim/events.ts`: Mama Ruzz the moneylender, Pip Hollow of Lantern Mutual, Spoke's reels, Lieutenant Holloway, Big Nell, Rollo Stax, Kaspar). The cast is **entirely human**, though. What is missing is the *aliens, droids and creatures* that make a Star Wars port feel crowded and strange.

**How much Gazillionaire:** take its *structure* (lenders, insurers, a prince who pays triple, market shocks, a sound for every character) and its dry humour about money. Leave out its surrealism (eyeball ships, umbrellas as cargo). Keep the weirdness at Star Wars level.

**Star Wars: the main reference for tone**
- **The "used universe".** Lucas wanted ships and places that look worked-in: dirt, scorch marks, mismatched panels, repairs on top of repairs. This is already our rust-punk look. Keep it: nothing in the frontier is new except lattice tech, and that is why lattice looks threatening.
- **Creature-shop aliens.** The cantina works because each alien has **one strong feature** (a snout, eye stalks, a horned head, a tentacle beard) on a body that can still sit, drink and haggle. They are strange, never silly. *Rule:* our creatures are humanoid enough to do business, plus one unforgettable feature.
- **Aliens speak their own language, with subtitles.** Greedo and Jabba speak Huttese and the subtitles carry the meaning. Ben Burtt built alien voices and droid sounds from processed animal and machine recordings. *Lesson:* each species gets a short gibberish voice clip (pitched animal or machine sounds) under subtitled text, like Gazillionaire's alien noises.
- **Everyone has an angle.** Watto haggles, Jabba holds the debt, Lando sells you out and then makes it right, bounty hunters are professionals with a code. Events are interesting because people *want* something, not because they're funny.
- **Droids are characters.** They are anxious, loyal, sarcastic or obsessive. They are the safest way to add comedy without breaking tone.
- **Space creatures are wonders and threats:** mynocks chewing on power cables, the space slug's cave that is a mouth, the purrgil whales of the hyperlanes. Use them for "something is wrong with the ship" and "something huge out there" events.

Other references:
- **Star Control II**: every species has its own **speech quirk, display font and musical theme**. Paul Reiche created aliens by drawing them and "holding little conversations" with them. Computer Gaming World called it "some of the best dialogue ever encountered in this genre" ([Wikipedia](https://en.wikipedia.org/wiki/Star_Control_II)). *Lesson:* give each recurring creature a text colour or typeface treatment and a two-note sting.
- **FTL**: every alien race is also a mechanic (Zoltan power, Mantis fighting, Rock fire immunity, Slug sight), and owning one unlocks blue event options. *Lesson:* each creature in our cast is tied to a tag, part class or faction.
- **Hades**: characters remember what you did on earlier runs and comment on it. *Lesson:* recurring creatures should say a line about your last meeting ("You again. Still flying that wreck?").
- **Monkey Island**: a comic tone that stays kind. Characters are funny because they're sure of themselves, not because the game winks at the player.

---

## 3. Proposed cast: creatures and droids for events

Each entry gives: **look** (one strong feature), **voice**, **sound**, the **mechanic** it fronts (tied to our systems), and where it shows up. Each has one quirk, played straight. Each wants something.

1. **THE VHOSSK TWINS, brokers.** One heavy, grey-skinned alien with two heads that are legally two people, with two signatures and two ledgers. **Voice:** a subtitled grunting language. The two heads interrupt each other and argue about your price in front of you. **Sound:** a low two-tone grumble. **Mechanic:** trading with *two prices*. The left head buys high and the right head sells low, and you may deal with only one per visit; the other remembers. Found at any market.

2. **THE SKREE SALVAGERS.** Small, grey-green scavengers who each wear a shell of war armour cut from a wreck (a shoulder-plate, a nose cone, a titan's knuckle) and trade up as they grow. They follow wrecks in a sail-barge that skates the glass at night. **Voice:** chattering trade-speech. **Sound:** a fast clicking chatter. **Mechanic:** a **junk sale**. They sell cheap parts, some of them *rattled* (50% until repaired). They also buy the parts on **the edge of your grid** for good money, because those are the ones they can unbolt quickly. Found at derelicts and crash sites.

3. **HULL LEECHES** (a creature, not a person). Lane-lice: flat, armoured, many-legged things that used to live on the umora and now ride hot ships out of forced gates, chewing on the warm lines. **Mechanic:** a short shake-them-off mini-game (`thread`/`tug`). Fail, and they drain power from one **outer-edge** part until the next stop. A **heat**-tagged part on that edge burns them off for free, which is a blue option. This makes the grid's edges matter outside combat. Found as an ambush event in deep space.

4. **UNIT 7-HOLLY, a lonely toll droid.** A Port Authority toll droid left at a dead relay for forty years: a tall, thin build with a cyan face-plate and a clerk's hunch. **Voice:** fussy and formal, and **desperately** glad of company. **Sound:** chirps and a printer whirr. **Mechanic:** **contracts**, such as "clear three waves fully" or "beat par twice", paid in lattice parts. Break one and it reports you, which raises your Port Authority bounty. Take it aboard, and it becomes a passive that shows enemy tells earlier. Found on Halcyon and the lattice planets.

5. **THE CHOIR OF MIREFALL.** A fungal mind grown through a crashed freighter, speaking through the corpse-speakers of its intercom. It is eerie, not funny. **Voice:** always "we", polite, slightly wrong. **Sound:** a hummed chord with static. **Mechanic:** offers **bloom-tagged parts that grow**. They gain strength each jump but slowly turn an adjacent cell bloom. Accepting raises your mood with the Hive and makes other factions wary. Found on Mirefall.

6. **OLD MOTHER SEFFA, lane-reader.** A tiny, ancient alien navigator with moth-like antennae and eyes clouded from staring at hyperlanes, who keeps a tea house on an asteroid. She is the old one who has seen everything, and is still worried. **Voice:** slow, answers questions with questions. **Sound:** wind chimes. **Mechanic:** pay **fuel**, and she reveals chart nodes. Pay your *last* fuel, and she tells you the boss's weakness (its punish window opens longer). Found in deep space.

7. **THE LEDGER CLAN.** Tall, beetle-like bankers in layered robes, with mandibles that click as they count. They are bureaucrats, and dangerous on paper. **Voice:** legalistic, citing clauses. **Sound:** an abacus-like clicking. **Mechanic:** **debt consolidation**. They buy your debt from Mama Ruzz at a lower rate, but a missed payment brings *their* collectors (armoured lattice drones, a hard hunt). They are Mama's rival, and siding with one angers the other. Found on Kessra and the Cartel planets.

8. **SAINT FERRULE, the droid hermit.** An old maintenance droid that has founded a small religion around keeping ships alive. It has scavenger-acolytes. **Voice:** solemn blessings ("Go oiled, pilot."). **Sound:** a bell made from a gas canister. **Mechanic:** a **blessing**. For a tithe, it upgrades one part's rarity, but only a part that has been with you since the first stop (rewarding attachment). Found at relays and shrines.

9. **THE UMORA OF VESH** (a creature). A pod of lane-drifters, huge and slow, that the Lowtide Court follows and hunts; Queen Istra lives inside a dead one. **Mechanic:** an **escort or hunt choice**. Protect a calf through a raid level, and the pod shows you a hidden shortcut node. Or help the pirates harvest it for rich scrap, at the cost of a darker run and a wild-faction grudge. Found on Vesh.

10. **TOBBO GRISK, junk dealer.** A long, stooped Bahwoh on a stool on top of his yard, glassy cicada wings folded like a coat, which buzz up when he's insulted. His moulted husks sit on the counter as his "partners". Cheats at odds. **Voice:** fast-talking, wheedling, insulted by low offers. **Sound:** a wing buzz plus a grumble. **Mechanic:** **haggling**. Every part has a hidden "real" price, and pushing too hard closes the shop for the visit. Sometimes he offers a bet instead of a sale (a race on par, double or nothing). Found on Kessra and Ashgrave.

11. **SQUIT, the informant.** A twitchy Eefee, wet and blue-green, with a long soft snout and enormous webbed fan-ears that fold flat when anyone walks past, who sells what he hears. **Voice:** nervous, in his own language, always looking over his shoulder. **Sound:** a nasal trill. **Mechanic:** sells **intelligence**: rumours, market moves, the route of the next **loot carrier**. Lie to him or stiff him, and he sells *your* route to Kaspar. He is a recurring figure who remembers you across runs.

12. **LADY VEY, a collector.** An aristocratic alien in jewelled robes, aboard a gleaming private yacht in the middle of the rust. **Voice:** bored and imperious, delighted only by rarities. **Mechanic:** Gazillionaire's prince. She pays **triple** for one specific part or cargo she names. Sell it, and the faction you took it from hears about it. Very rare.

### Event ideas beyond characters
These are the Star Wars-style situations that make stops interesting:
- **The droid with a secret.** You pick up a stray droid carrying a faction's data. Deliver it and get paid, or sell it to the other side, but someone hunts you until you decide.
- **The smuggling compartment.** A hidden hold in your hull costs one grid cell. Contraband pays double, and customs scans are a mini-game.
- **The cave that isn't.** You shelter in an asteroid tunnel, and it starts to close. A forced race-mode escape (an exogorth tribute).
- **A Kessel-style run.** A dangerous shortcut through a storm nebula skips a chart node, flown as a hard race level with no par.
- **Cantina trouble.** Someone recognises your bounty, and you choose to pay, talk or fight (a hunt).
- **Salvage rights.** Two crews dispute a wreck, and you can arbitrate, side with one, or take it all.
- **The last ride.** An old pilot asks you to fly her ashes through the Stormwall, giving a sentimental reward (a named part with a story).

### Goods with character (flavour for `chart.ts` trades)
Grounded but evocative, each with a home planet and a faction that pays dear: **storm cells** (Halcyon), **wyrm ivory** (Oru-Tal), **spore wine** (Mirefall), **cryo-cores from the Engine** (Glacis), **spice-salt** (Kessra), **titan alloy** (Ashgrave), **umora oil** (Vesh), **ember fruit** (Cinder Orchard). Keep one Gazillionaire wink per run at most (a crate of "retired umbrellas" that sells for a fortune on the rain planet).

### Ships with character
Neutral and NPC ships can carry more personality than combat foes: Big Nell's bulbous tanker, Lady Vey's chrome yacht, the Skree sail-barge, Lantern Mutual's flying lighthouse office. Combat foes stay strictly readable per faction, and the non-combat ships are where the flavour goes.

---

## 4. Writing rules for events

Taken from what works in `events.ts` today ("She writes your name in a very big book."):
1. **Three lines, maximum,** before the choices. The art does the rest.
2. **Costs and odds in plain sight** under every choice (the `note`). The joke is never on the player's ignorance.
3. **End each outcome on a comic beat,** often a physical one ("Both goons crack their knuckles, warmly.").
4. **One quirk per character,** repeated every time they appear. Recurring creatures remember your last meeting.
5. **Strange bodies, sincere voices.** Aliens are serious about their business; the comedy comes from droids, haggling and situations. Never wink at the camera.
6. **Every creature has a two-second sound** and a text accent: a colour for the speaker name, and perhaps a typeface or text-crawl speed (the Auctioneer's text arrives fast, Grandmother Moth's slow).
7. **Every creature fronts a system,** and the system is more interesting because of who fronts it.

## 5. Event art direction

To keep new art matching the existing 640×360 set:
- **Composition:** the character fills the left or centre two-thirds, at mid-shot and larger than life. The deal object (a slot machine, a contract, a crate) sits in the foreground. A porthole or open sky on the right shows **a planet or ringed gas giant** in cool blue or violet.
- **Light:** warm lanterns, neon or engine glow on the character, cool starlight behind. A rim light separates the character from the background.
- **Materials:** riveted rust, brass, worn leather, and clutter that tells a story (ledgers, coins, part crates with our tag colours).
- **Prompt skeleton:** *"painterly sci-fi illustration, rust-punk frontier, [CREATURE: one striking feature], [ACTION involving the deal object], cluttered lantern-lit interior, porthole showing a ringed planet, warm amber against cool blue, rich detail, cinematic, 16:9"*. Then pass the result through the same palette quantise as the in-game filter, so events and flight share a pixel grain.
- **Creatures must read as creatures first:** one exaggerated feature (two heads, antennae, an armour shell, mandibles) visible as a silhouette at thumbnail size, as with the factions.
- **Our own, not borrowed.** Image models default to Star Wars when you say "alien junk dealer" or "space bar", so name the Reach's own peoples and things instead. Never prompt for, and send back any picture with: hooded figures with glowing eyes, Jawa crawlers, head-tails, Yoda-green big-eared goblins, pot-bellied winged shopkeepers, bat-winged hull parasites, TIE or X-wing shapes, and Earth insignia (stars in roundels, real flags). Crowds are the Reach: a Hoowae's antennae, a two-headed Vhossk, a Kehx's mandibles, a Bahwoh's folded cicada wings, an Eefee's fan-ears, a Chikta's armour shell, Sankvi with the green clan hand painted on their gear ([peoples](lore/peoples.md)).

### Art to redo

Reviewed against the lore on 2026-10-23. The rest of the set fits.

| Art | What's wrong | The fix |
|---|---|---|
| `skree` | Jawas: hoods, glowing eyes, sandcrawler | brief in [the Skree](npcs/skree-salvagers.md), under Art |
| `tobbo` | Watto: pot belly, hovering on wings over a desert junkyard | *"painterly sci-fi illustration, rust-punk frontier, a tall stooped alien junk dealer with a hard dusk-purple hide and glassy veined cicada wings folded down his back like a long coat, the wings half-raised and blurred with an offended buzz, perched on a stool on top of a mountain of ship parts, a row of his own empty moulted husks propped along the shop counter like silent partners, lantern-lit junkyard at dusk, a low red sun on the horizon, ringed planet, warm amber against cool violet, rich detail, cinematic, 16:9"* |
| `squit` | reads as a Yoda-green goblin; the snout is missing | *"... a small twitchy amphibian alien informant with wet blue-green skin, a long soft snout, gill-frills at the throat and two huge webbed fan-shaped ears on fine spines, the ears half-folded flat in fear, clutching a data chip in a webbed hand, peering round a pipe in a dripping lantern-lit corridor, porthole showing an ocean planet, ..."* |
| `leeches` | mynocks: bat wings and sucker mouths | *"... view from inside a rusty cockpit, a swarm of flat armoured many-legged lane-lice, from hand-sized to dog-sized, segmented shells in dull red and bone, clinging to the canopy and hull with every leg and chewing through glowing cables in a shower of sparks, a chain of hanging lantern buoys in the lane outside, ..."* The shake sprites (`tools/sprites/shake.py`, `leech_*`) need the same change: legs, not wings. |
| `dice` | the crowd has a hooded figure with glowing eyes and a blue woman with head-tails | keep Spoke and the slot machine; regenerate the crowd from the Reach's peoples (the list above): *"... a crowded smoky gambling den in a hollow asteroid, a one-eyed grinning reel-runner behind a brass three-reel slot machine, around the table a moth-like alien with long feathered antennae, a heavy grey two-headed alien whose heads argue, a tall beetle-like banker with clicking mandibles, a small grey-green creature wearing a slab of dented war armour as a shell, a scarred human pilot with a green hand painted on her jacket, ..."* |
| `hunter` | a TIE-fighter cockpit chained to Kaspar's ship as a trophy | *"... a long spiked scrap-built hunter ship with harpoon launchers, chained to its hull as trophies: the rust-orange canopies and tail fins of rustwing fighters, a torn bounty poster flapping on a chain, ..."* |
| `calf` | a glowing whale with an eye, flippers and a fluke; the umora are [lane-drifters](npcs/the-umora.md) now | *"painterly sci-fi illustration, rust-punk frontier, deep space between stars, a young lane-drifter the size of a freighter: a short curved string of four sealed shell chambers like frosted blue-grey glass, layered like mother-of-pearl, clear at the edges and faintly lit from inside, ringed with growth lines, a ring of pale grinding plates round a dark intake at its front, two pairs of thin black membrane vanes on long jointed pale spines spread wide like sails catching starlight, a soft plume of gas venting from its back end, faint rings of radio song spreading from it; in front of it a rusty orange-and-cream rustwing fighter, and closing from the left a long spiked scrap-built harpoon ship with harpoon launchers, chains and searchlights on the creature, drifting asteroids, a ringed gas giant in cool violet, warm amber engine light against cool blue starlight, rich detail, cinematic, 16:9"*. Send back anything with eyes, a mouth, fins, a tail or wings. |
| `customs` | the cutter wears a star in a roundel (USAF) | the Compact's sign: *"three overlapping hull-plates, blue on cream"* on the bow. A paint-over is enough. |
| `ferrule` | Warhammer tech-priest: cog halo, monk-hooded acolytes | *"... an old lanky maintenance droid with an oil-can body and long patient tool-arms, draped in a stained work apron as vestments, blessing a ship part on an altar of engine blocks, a bell made from a gas canister, its acolytes a mix of grease-stained mechanics of many species in work clothes and goggles pushed up, no hoods, ..."* |
| `ghost` | a gothic spired cathedral, not a lost freighter | *"... the Margarethe, a long bulk freighter lost forty years, frosted over, her docking port still turning, lights on in every porthole, ..."* |

Lower priority: `distress` is flatter and more anime than the rest of the set, and the planet in `pod` is recognisably Earth.
