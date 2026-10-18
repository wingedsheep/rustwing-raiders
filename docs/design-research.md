# Rustwing Raiders: design research

What racers, action roguelites, roguelikes and shmups do well, and what Rustwing Raiders should take from each. Every lesson is tied to a system we already have: Burn/boost, dash and slip/perfect, the parry aux, grid builds (adjacency, links, tags, clashes), race shortcuts, wave clears and bounties, factions, the chart (map), and events.

Current numbers referred to below come from `src/sim/level.ts`: `SLIP 0.12`, `DASH_TIME 0.13`, `DASH_RECOVER 0.25`, `BURN_GRAZE 0.035`, `BURN_SKIM 0.3`, `BURN_PERFECT 0.3`, `RISK_MAX 5`, `CRASH_STALL 0.9`.

---

## 1. Racing and sense of speed

### Star Wars: Galactic Racer (Fuse Games / Secret Mode, released 6 Oct 2026)
**Verified:** Fuse Games is a Guildford studio founded by ex-Criterion (Burnout) staff. The game runs on UE5 and launched on PC, PS5 and Xbox Series. It sits at Metacritic 84–88 and OpenCritic about 87. It is a **roguelite racing campaign**: a "tour" across planets, a branching path of races, events and contracts, and a league token you lose when you fail too often ([Wikipedia](https://en.wikipedia.org/wiki/Star_Wars:_Galactic_Racer), [The Outer Haven preview](https://www.theouterhaven.net/everything-we-know-about-star-wars-galactic-racer-after-playing-it-at-sgf-2026/), [Kotaku](https://kotaku.com/star-wars-galactic-racer-the-kotaku-review-2000739105)). Structurally it is our closest relative.

**What makes the speed work**, from the reviews:
- **Two-tier boost with heat.** The *afterburner* spends built-up heat and then has to reheat. The *Ramjet* is a faster, toggled super-boost that "is actively throwing heat at your machine" and can blow the vehicle up from the inside. Switching between the two is the skill. Planets change the heat economy: desert worlds overheat faster ([Outer Haven review](https://www.theouterhaven.net/star-wars-galactic-racer-review-this-is-where-the-fun-begins/)). Kotaku notes you can still win by crossing the line *as it explodes* ([Kotaku](https://kotaku.com/star-wars-galactic-racer-the-kotaku-review-2000739105)).
- **Crashes accumulate instead of resetting.** Collisions push you into "critical condition", which brings a brief stop and a timed button press. Fail the press and you get a faulty part (pulls to one side, overheats more) that persists until you pay to repair it. "Every crash builds towards a failure" (Kotaku).
- **Takedowns with a crash cam and slow-motion replay** (Burnout DNA). The AI is extremely aggressive: it rams, double-teams and drops bombs ([Wccftech](https://wccftech.com/review/star-wars-galactic-racer-review-its-not-a-wipeout-for-star-wars/)).
- **Tracks:** each world has its own hazards (ice slows you, vents speed you up, lava and acid). The developers say there is "no single ideal racing line". Shortcuts such as a cave cut are "genuinely difficult" at speed. Game Informer adds a counterpoint: routes can be hard to read ([Game Informer](https://gameinformer.com/review/star-wars-galactic-racer/very-fast-very-dangerous-and-very-good)).
- **Rivals:** picking a rival makes that racer stronger for the whole tour. Racers keep consistent personalities across runs, so you can learn them.

**Why the building isn't a puzzle.** Reviewers do *not* call it shallow. They praise its "variety in build options". But the structure is: after each race you **pick one of three random parts plus one stat boost**, spread across six stats (Cornering, Afterburner, Resilience, Ramjet, Battery, Drifting), plus ability slots and passive "favors" ([Outer Haven review](https://www.theouterhaven.net/star-wars-galactic-racer-review-this-is-where-the-fun-begins/)). Nothing is spatial and nothing interacts with anything else, so each choice is a slider, not a decision about where something goes. That matches the owner's read. It also tells us what our grid must do: placement should change *which* things work, not just how much.

**Couldn't verify:** FOV and motion-blur specifics, drafting, near-miss rewards, or rubber banding. No review I could reach mentions them. The VULKK review returned a 403.

**Lessons for Rustwing Raiders**
1. **Make the Burn meter two-tier.** Normal boost spends Burn. Past a redline (say, holding the trigger fully while Burn is under 25%, or a "Ramjet" special part), you keep going faster but build **Heat** that damages a random part. This turns analog boost into push-your-luck, not just spend-and-wait.
2. **Crashes should leave scars, not stall you.** Swap some of `CRASH_STALL` for a *rattled part*: one grid part runs at 50% until the next shop or a repair event. That links racing mistakes to the grid and the shop.
3. **Make a showcase moment out of point-blank kills and ramming foes into terrain**: a brief slow-mo, a camera punch, and a scrap shower. The scrap faction (Ramjack, harpoons) is the natural takedown target.
4. **Use a nemesis rival on race stops**: a named scrap-faction racer who appears again across the run and gets stronger if you pick them.

### Comparable racers
- **Burnout 3 / Paradise** ([Wikipedia](https://en.wikipedia.org/wiki/Burnout_3:_Takedown)): boost fills from *risk*, meaning oncoming traffic, near misses, drifts, air and takedowns. Spending it triggers more risk. This is a closed loop, and our Burn loop is the same idea. *Lesson:* every Burn source should be visible and **audible** at the moment it is earned: a graze "tick", a skim whoosh, a perfect "chime". Keep the payout audio rising in pitch through a chain, like Burnout's boost-chain jingles.
- **F-Zero GX**: energy is health *and* boost, so boosting while low is a real gamble. Pit strips refill energy. *Lesson:* put **refill strips** (a skim lane along a canyon wall, a ring corridor) on the risky line of race levels, so the shortcut is also the refuel.
- **WipEout / Redout**: speed comes from the camera and the world, not the HUD. FOV widens with speed, the camera lags then snaps, track-side objects sit close to the racing line, and engine pitch and wind rise with velocity. Redout's camera tilts into banks. *Lesson for a top-down camera:* (a) pull the camera **back and tilt it forward** a little with boost, so you see further ahead, which is both the speed cue and the readability need; (b) speed-line particles in screen space, quantised by the pixel filter so they look deliberate; (c) **near-plane parallax**: clouds or debris layers that scroll faster than the ground; (d) a low-pass "wind" filter that opens up with speed.
- **Trackmania**: shortcuts are a *knowledge* reward, and the community lives on finding them. *Lesson:* hard shortcuts should be **visible but not obviously enterable** (a gap under a gantry, a lava tube) and should pay best when chained. Show the route you took on the results screen next to the ghost of the best route.
- **Episode I Racer** ([Wikipedia](https://en.wikipedia.org/wiki/Star_Wars_Episode_I:_Racer)): the boost heats the engine and parts wear down during a race. You can repair parts in-race at a speed cost, and between races you buy parts from Watto or the junkyard. *Lesson:* our "rattled part" idea above is proven. Episode I also shows that a cheap junkyard (cheap but already damaged parts) is good shop texture.
- **Rubber banding:** the genre consensus is that visible catch-up feels like cheating. Since our race has your *own speed as progress*, banding should only ever be **par-time based** (`PAR_BOOST_RACE`). Never secretly slow the level down.

---

## 2. Precise controls and combat: Hades, Hollow Knight, Silksong

### Hades
- **Generous buffering and cancels.** Almost everything cancels into the dash, which has invulnerability frames. That makes the game forgiving, but a critique of Hades II argues it made the original nearly "faceroll-able" and reduced intentionality. Hades II cut extra dashes and made the dash slower ([Astra's Hades II essay](https://astra.bearblog.dev/hades-ii-action-gameplay)). *Lesson:* our dash keeps a **short slip (0.12 s) and a real recovery (0.25 s)**. That is right. Don't hand out "+1 dash charge" parts cheaply. Make the **perfect refund** the way to dash more.
- **Hit-stop on player hits only, with cheap screen shake.** In Hades a bad hit gets a red flash plus about 0.1 s of freeze, and your own heavy hits get a few frames of freeze. *Lesson:* add 40–60 ms of hit-stop on a **perfect dash** (it is already a highlight moment) and on taking damage. Never add it on routine kills, because in a shmup the stream of kills is constant.
- **Boons and Duo boons.** Each god owns a *verb slot* (attack, special, cast, dash). Duo boons need *two* gods and reward commitment to a pair. Legendary boons need prerequisites. *Lesson:* our **tag set bonuses (3/5)** play the role of god boons. Add **"duo" parts** that only appear in the shop once you own two particular tags (for example, arc plus energy gives a Storm Lens). Prerequisite-gated offers are the cheapest way to make builds feel planned.
- **Verb-slot thinking:** Hades lets a boon *change* your dash rather than just buff it. We already have DashMod (ram, blink, mines, refill, ghost). It is the most Hades-like thing in the game, so lean on it.

### Hollow Knight and Silksong
- **Honest telegraphs and punish windows.** Each enemy attack has a distinct wind-up pose and sound, a committed motion, and a recovery you can punish. Bosses have only a few moves but combine them. *Lesson for factions:* each faction gets **one tell grammar**. For example: scrap shows a red engine flare plus a revving sound and then *commits* to a line; lattice shows a thin aim line that thickens and then fires; wild crouches and shakes dust, then pounces; bloom pulses and swells, then bursts. After any big attack, the enemy is **open** for a while, shown by a vented-heat glow or extra damage taken. That window is the reward for staying close.
- **Short coyote time and an input buffer of about 0.1 s.** Hollow Knight buffers jumps and attacks a little and is famous for feeling exact. *Lesson:* our gamepad code reads the dash on the press edge (`edge(1)` in `src/input.ts`). Buffer the dash and the aux for **100 ms**, so that a press during `DASH_RECOVER` fires on the first frame it is allowed. Buffer the parry for **at most 50 ms**. A buffered parry that "catches" late bullets feels like cheating in the wrong direction.
- **Silksong's crests and tools** ([crest guide](https://www.nintendolife.com/guides/hollow-knight-silksong-crests-guide-all-crest-locations-and-effects), [combat wiki](https://hollowknight.wiki/w/Combat_(Silksong))): a crest is a *moveset* plus a **slot layout** with coloured slots (red attack tools, blue and yellow passives). The Architect crest repairs tools with Silk, and the Shaman crest trades tool slots for three Silk skills. You heal by spending Silk earned from hitting enemies (Bind), and doing so is a deliberate risk. Two warnings from players: people found one crest and stopped switching, and high tool-repair costs pushed them back to the basic nail.
- *Lessons:* (a) **Frames are crests**. Each hull should have a slot-colour layout (gun-only sockets, power-only, a "hot" socket that doubles a booster) and a frame *verb* (one frame's dash is always a blink), not just a shape. (b) A **"Bind" for ships**: spend a full Burn bar to repair one hull point, which takes time and makes you vulnerable. That gives Burn a second use and makes hoarding a real choice. (c) Don't make specials expensive to reload, or players will ignore them, as with Silksong's tools.

---

## 3. Roguelikes: builds, placement puzzles, maps and events

- **Slay the Spire**: the map shows every path up front (elites, campfires, shops, unknowns), so planning is the strategy. Card rewards are skippable, and "deck thinning" is a real lever. MegaCrit balanced the game on pick and win-rate telemetry ([GDC talk](https://www.gdcvault.com/play/1025731/-Slay-the-Spire-Metrics)). *Lesson:* show the whole sector of the **chart** with node types. Let players **skip** a part or **scrap** it for currency. Log pick rates and wins per part from the autopilot (`pilot.ts`) and from playtests.
- **Balatro**: a few multiplicative sources (×Mult jokers) on top of many additive ones. Joker **order matters**, and the scoring animation shows every step of the maths. *Lesson:* when a level ends (or on a hover in the hangar), **animate the grid "firing"**: each link, adjacency and set bonus lights up in order with its number. Players can only puzzle over what they can see. Keep ×multipliers rare (link 150%, the risk multiplier) and most bonuses additive.
- **Backpack Hero / Backpack Battles** ([overview](https://gigazine.net/gsc_news/en/20240310-backpack-battles)): this is the closest model for our grid. Items have **shape plus rotation**, and **stars** on an item's edges mark *where* a synergy partner must sit. Recipes combine neighbours (a sword next to whetstones becomes a hero's sword). Group bonuses reward clustering, for example food next to food. Between rounds you rearrange freely, and the shop offers few items so each one gets looked at. *Lessons:* (a) **Draw the link ports on the part itself**, like Backpack Battles' stars: show the "wants a gun north" side as a socket glyph and light it when satisfied. Our `LinkSpec.side`/`cell` already holds this data. (b) Add **merge recipes**: two identical commons placed adjacent fuse into a rare when the run ends or at a shop. (c) Allow **rotation** for asymmetric parts. (d) Make **rearranging free** and allowed anywhere on the chart. The puzzle is the fun, so never tax it.
- **Luck be a Landlord**: symbols interact with neighbours on a randomised grid, the rent rises each round, and you can remove symbols. *Lesson:* sometimes **removing** a part (a tag clash) is the best upgrade. Offer events that pay you to destroy a part.
- **Nova Drift**: you assemble a ship from body, weapon and shield choices plus a hex grid of mods, and wild synergies (shields that shoot, drones that inherit weapon mods) produce stories. *Lesson:* add parts whose stats are **inherited** ("this drone copies the gun it touches") rather than flat stats. Inheritance makes placement and synergy the same act.
- **Cobalt Core**: a card roguelike where your ship's *position* on a lane and its *part layout* (cannons, missile bay, shields) decide which attacks land. Moving is a card. *Lesson:* this proves that a ship's **part layout plus movement** can be the puzzle. Our guns already fire by grid facing (outer columns angle out, back row fires behind), so show that clearly in the hangar as firing arcs.
- **Into the Breach**: enemies show *exactly* what they will do next turn, and the puzzle is to respond. *Lesson for factions:* the lattice faction especially should **pre-draw** its beams and gates for a full second. Fairness through foresight lets you make the patterns harder.
- **FTL**: the map is a sector graph with a rebel fleet advancing behind you, which forces a trade between exploring and pushing on. Events are short text with **blue options** unlocked by crew or systems. Subsystems are targeted individually. *Lessons:* (a) a **pursuit front** on the chart: the farther behind the fleet, the more stops you get, so speed in races converts into map options. (b) **Blue options in events** unlocked by tags or parts you own (an arc-tag ship can jump-start the derelict). This rewards build identity outside combat. Our `events.ts` is the place for it.
- **Gazillionaire / Taipan-style trading**: buy low, sell high across planets, with random market shocks. *Lesson:* `chart.ts` already gives each faction's planet cheap and dear goods. Add **rumours** (an event that says "Mirefall pays double for heat sinks next stop") so trading becomes a route-planning bet.
- **Dead Cells**: the biome graph has hard-to-reach alternate exits, and **timed doors** reward speed with loot. *Lesson:* the timed door is exactly our par time. Make beating par **open a hidden node** on the chart, not just pay scrap.
- **Enter the Gungeon**: a dodge roll with invulnerable frames, lots of guns with personalities, and "synergy" pop-ups when two items interact (a named jingle). *Lesson:* when a duo or synergy activates, **name it on screen** ("STORM LENS ONLINE"). The pop-up makes the discovery feel like a reward.
- **Risk of Rain 2**: items stack without caps, and the difficulty clock punishes dawdling. *Lesson:* the clock is the same idea as our race par and pursuit. Proc chains (on-hit chance items triggering each other) are great fun but hard to read, so keep ours to *one* layer of on-hit triggers.
- **Hades (structure)**: room rewards are previewed on the doors, so you choose your boon god before you fight. *Lesson:* each chart node and each **level exit** shows the reward class (a gun part, scrap, fuel).

---

## 4. Shmups

- **Ikaruga (polarity)**: absorbing same-colour bullets charges your special, and killing three same-colour enemies in a row builds a chain. The whole game is one verb's consequences ([Wikipedia](https://en.wikipedia.org/wiki/Ikaruga)). *Lesson:* the **parry** should *feed* something: reflected bullets fill the special meter. And a faction should exist that is **only** beatable well by parrying (lattice reflector waves).
- **DoDonPachi (chaining)**: the combo gauge drains fast, so you must keep killing. Hyper mode trades safety for score. Medals and bees reward knowledge. *Lesson:* our risk multiplier (`RISK_MAX 5`, decaying after 2.5 s) is a DoDonPachi gauge. Show it as a **draining bar**, not a number, and make **wave full-clears** add a big chunk to it.
- **Radiant Silvergun**: all seven weapons are available from the start, and they level up by being used. Colour chains reward picking targets. *Lesson:* level up **parts by use** (a gun that gets 200 kills earns a star). That makes "the gun I've had since stop two" a story.
- **Psyvariar (buzz/graze)**: grazing bullets grants experience, levelling up gives brief invulnerability, and the best players fly *into* patterns. *Lesson:* grazing is our cheapest Burn source (`BURN_GRAZE 0.035`). Psyvariar shows that grazing feels best when **long grazes give a visible streak** (rising pitch, a spark trail). Consider rewarding *continuous* graze time rather than the count of grazes, so that hugging a bullet stream is the skill, not twitching through bullets.
- **Mushihimesama**: very dense but **slow** bullets, high-contrast pink and blue orbs, and a tiny hitbox. Readability lets it be generous with density.
- **Sine Mora**: time is health, and hits cost seconds. *Lesson:* for race mode, a hit could cost **par time** rather than HP, so race failure and combat damage use the same currency.
- **Jamestown (co-op)**: "Vaunt" is a shared-risk shield activated with gold, and the team multiplier needs both players alive. Revives are generous. *Lesson:* for co-op, add **tether-style shared bonuses**: Burn that is earned near your partner is shared, and a joint perfect dash (both dashing through the same pattern) gives a team bonus. Our `revive` field exists, so make reviving a *flying* action: fly over the downed ship to rebuild it.
- **Nex Machina**: Housemarque's dash cancels everything, the bullets are neon, and *rescuing humans* is a hard optional objective under fire. *Lesson:* hard drops such as the **fleeing loot carrier** should be Nex-style: always visible, always reachable at a risk, with a clear timer.
- **Sky Force**: each level has four medal goals (kill 70%, 100%, rescue everyone, no damage) that you replay to collect. *Lesson:* each raid level shows **three optional goals** (full clear, carrier caught, no hits). Bounties and wave clears become trophies on the chart node.
- **Tyrian**: between-level shop, front and rear gun slots, a power-level economy, and generator power as a constraint. *Lesson:* our power and mass budget is Tyrian's generator. Show **power draw versus supply** prominently in the hangar, because brown-outs that you can't see feel like bugs.

### Readability rules (genre consensus)
1. **Enemy bullets are the brightest and most saturated things on screen.** The background stays desaturated and mid-value. With a painterly world plus a pixel filter, we must **exempt bullets from the colour quantiser** or give them their own palette. Draw a bright core with a dark outline so they read on any biome.
2. **Hitbox is much smaller than the sprite**, and you can **see it** while focusing (show a hitbox dot on Shift). Grazes then make sense.
3. **Player shots are low-alpha, cool and thin**, so they never mask enemy bullets.
4. **Bullet speed is inversely proportional to density.** Fast bullets come in small numbers, dense curtains are slow.
5. **Telegraph sound plus shape** for every non-bullet attack (a ram, a beam, a pounce). Never rely on colour alone, because there will be co-op players with colour blindness.
6. **Clear bullets on boss phase change and on player death.** A screen full of leftover bullets turns into unfair hits.

---

## Top 15 actionable recommendations

| # | Recommendation | Systems | Impact | Effort |
|---|---|---|---|---|
| 1 | **Bullet readability pass**: exempt enemy bullets from the pixel/colour filter, add dark outlines, show the hitbox dot on focus | render, focus | High | Low |
| 2 | **Input buffer** of 100 ms for dash and special, 50 ms for parry; fire on the first allowed frame | input, dash, aux | High | Low |
| 3 | **Draw link ports on parts** (Backpack Battles stars) and light them when satisfied; show gun firing arcs in the hangar | grid | High | Med |
| 4 | **Animate the build's maths** (Balatro): play links, adjacency and set bonuses in sequence with numbers | grid, UI | High | Med |
| 5 | **Speed presentation**: camera pulls back and tilts with boost, speed lines, a fast parallax layer, wind audio that opens up | boost, race | High | Med |
| 6 | **One tell grammar per faction** plus a visible punish window (vent glow, extra damage taken) after big attacks | factions | High | Med |
| 7 | **Hit-stop and camera punch** on perfect dash and on taking damage only; a slow-mo cam on terrain takedowns | dash, race | Med-High | Low |
| 8 | **Duo parts** gated on owning two tags; name the synergy on screen when it switches on | grid, shop | High | Med |
| 9 | ~~**Redline boost**~~ (tried and removed: Vincent didn't like it, too close to Galactic Racer): beyond Burn, keep boosting for Heat that "rattles" a part (Galactic Racer Ramjet, Ep. I engine heat) | Burn, grid | Med-High | Med |
| 10 | **Crashes rattle a part** (50% until repaired) instead of only stalling; repair at shops or events | race, shop | Med | Low-Med |
| 11 | **Par time opens hidden chart nodes** (Dead Cells timed doors); add a pursuit front on the chart (FTL) | map, race | High | Med |
| 12 | **Three optional goals per raid level** (full clear, carrier caught, no hits), shown on the chart node (Sky Force) | waves, bounties | Med | Low |
| 13 | **Blue event options** unlocked by tags or parts owned; trade rumours that turn routes into bets (FTL, Gazillionaire) | events, map | Med | Low-Med |
| 14 | **Parry feeds the special**; a lattice reflector wave that wants parrying (Ikaruga) | aux, special, factions | Med | Low |
| 15 | **Co-op shared Burn** near your partner; revive by flying over the downed ship (Jamestown) | co-op, Burn | Med | Med |

### What to avoid
- **Stat-slider upgrades.** This is Galactic Racer's "1 of 3 parts plus a stat" pattern. Every part offer should change *what is adjacent to what*, not just add +5%.
- **Cheap extra dash charges.** Hades II walked these back. Perfect refunds should be the path to more dashes.
- **Invisible rubber banding** in race mode. Your own speed is the progress, so keep it honest and par-based.
- **Hit-stop on every kill**, or screen shake that moves the play field. Shake the camera's *offset* lightly, and never shake while bullets are dense.
- **Taxing rearrangement** of the grid. The puzzle is the fun.
- **Multi-layer proc chains** (Risk of Rain): unreadable on a busy screen. Keep it to one trigger layer.
- **Expensive special reloads** (Silksong tool costs): players will just stop using them.
- **Shortcuts you can't read** (a Game Informer complaint about Galactic Racer). Mark entrances with a consistent visual language (rust-orange chevrons) even if they are hard to *take*.
- **Painterly backgrounds that compete with bullets.** Pull background value and saturation down in combat zones.
