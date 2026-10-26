# The arsenal (draft)

A draft, 2026-10-23, not agreed yet. The aim: a wide arsenal where every part fires, moves or protects in its own way, and pilots end up with favourites. Read with [combat and builds](combat-and-builds.md); this only touches the **Ship** layer. How a weapon should look and feel, and how to model it: [enemy and weapon design](enemy-and-weapon-design.md).

## The rule: every part has a personality

- A part goes in only if it **plays differently**: a new attack pattern, a new way to aim, a new thing it does to enemies. Not a stronger copy of another part.
- **Two parts may share a dial, never a personality.** Scattergun and Plasma Torch are both close range, but one is a burst that shoves, the other a stream that burns and eats bullets.
- Each part says **who loves it**. A sniper should light up at a Rail Driver card and shrug at a Scattergun; a brawler the other way round.
- Each part has a **quirk**, one rule nobody else has, and an **edge**, the moment it crits (see `EDGES` in `src/game/parts.ts`).

## The dials

What makes a weapon feel different. Every gun is a different point among these, plus its quirk.

| Dial | Low ↔ high |
|---|---|
| **Rate** | one big round a second ↔ a hose |
| **Hit** | chip damage ↔ one blow that breaks plating |
| **Range** | a tongue of flame ↔ the far edge of the screen |
| **Shot speed** | slow orbs you can watch ↔ instant beams |
| **Width** | a needle ↔ a fan, a wave |
| **Pierce** | stops on the first ↔ through everything in a line |
| **Area** | single target ↔ blasts, chains, clouds |
| **Aim** | where the gun faces ↔ homing, auto-aim, behind you |
| **Shove** | none ↔ knocks enemies flying |
| **What it leaves** | nothing ↔ burn, shock, crack, chill |

## What weapons do to enemies

The three marks stay, and one more joins them. That's all: a few states, each easy to read, with lots of parts pointing at them.

| Mark | From | What it does |
|---|---|---|
| **BURN** | heat | Damage every moment, more the longer it's kept lit |
| **SHOCK** | arc | Everything it does runs slow; now and then it seizes up |
| **CRACK** | explosive | Takes more from everything |
| **CHILL** (new) | cold | Slows it. Four stacks and it's **FROZEN** solid for 2 s: it can't act, and a blow on it hits double and shatters the ice into shards. Fire and ice **QUENCH**: the burn or the ice is lost, and the hull cracks. |

CHILL stays out of the reaction triangle (OVERLOAD, COOK-OFF, SHATTER), so the reactions don't grow from 3 to 6. Its combo is its own: stack it, freeze it, smash it. Fire is its enemy, so a cold build and a fire build pull apart, which is a choice to make.

Two physical effects come from the dials, not from marks:

- **Shove**: a knocked-back enemy that hits another enemy or the ground takes a blow (breaks plating), and so does what it hit.
- **Pin**: nailed in place. It still shoots; it can't move or turn.

## Combos: set it up, cash it in

The best feeling in these games is two parts that need each other: freeze it, then smash it. In Rustwing that's one rule, built on what's already there.

### The rule: setups are spent by blows

The game already splits hits in two. The **stream** (held fire, flames, mist, lightning) chips. **Blows** (heavy rounds, the dash-strike, crits, parried bullets, blasts, a body flung into another) break plating. So:

- **Streams and area parts set enemies up.** They leave a state on them.
- **A blow on a set-up enemy cashes it**: the state is used up, and something big happens. Each state has its own payoff.
- **Every payoff spills a setup onto the enemies round it**, so one cash-in primes the next. That's how a combo becomes a chain through a whole wave.
- **A part never cashes in its own setup.** Seekers crack, but the next seeker in the salvo doesn't BREACH; the Arc Coil's crits don't GROUND-OUT its own shock. It takes two parts that need each other (or the dash, or a payoff's spill). Without this rule the explosive heavies combo with themselves all fight long, and the combos stop being a build.

| Setup | Looks ready when | Cashed by a blow: | Spills onto its neighbours |
|---|---|---|---|
| **FROZEN** (4 chill) | Ice-white, cracks spreading as it thaws | **SMASH**: the blow hits double, and the ice bursts as shards | CHILL from the shards |
| **BURN** at three stacks | White-hot, roaring | **FLARE-UP**: all the burn still to come lands at once, in a fireball | BURN |
| **SHOCK** | Crackling, sparks jumping | **GROUND-OUT**: the blow runs down the lightning to every shocked enemy on screen | SHOCK (one jump) |
| **CRACK** | Split armour, glowing seams | **BREACH**: the blow goes straight through it, at full strength, into what's behind | CRACK on what it passes through |
| **PINNED** | A taut chain | **NAILED**: it can't roll with the blow: it takes all of it, the plating goes, and it reels | a shockwave that shoves |
| **OPEN** (plating broken) | The band gone, staggering | **TAKEDOWN** (the dash through it, as now) | a big chunk of the Weld, scrap |

The takedown already works like this: plating → open → dash through. Combos are the same idea, everywhere.

Two marks meeting still make a **reaction** (OVERLOAD, COOK-OFF, SHATTER). So there are two ways to combo: two setups meeting, or a setup and a blow.

### It runs through the buttons

- **Trigger** sets them up.
- **Heavy** cashes it in. A heavy only has a few rounds, so the skill is choosing *which* enemy to spend one on: the one that's ripe.
- **Dash** takes down whatever is left open.
- **A perfect** reloads a heavy round and makes the guns riposte (crits are blows). So dodging well feeds the next cash-in, and the loop starts over.

Stream, blow, dash, perfect, stream. It's what the buttons already do; combos give the order a reason.

### Opposites

Some setups undo each other, so a build has to choose:

- **Fire and ice quench.** A chill on a burning enemy puts it out, and fire on the ice thaws it: either way that setup is lost, but the hull cracks (CRACK). Fire on the ice cracks it while it's still alight, so it cooks off at once. A frost and a torch on one ship lose their freezes and flare-ups, and live on cracks and COOK-OFFs instead.
- **Shove and pin fight.** A pinned enemy can't be shoved: the shove turns into a blow instead (which cashes the pin).
- **A payoff ends its setup.** You can't smash the same ice twice: wait for the next freeze, or chain it to the next enemy.

### Bosses

Bosses take setups for less time and shrug off a second freeze or pin in a row. A cash-in on a boss wears its **poise** hard, like a perfect read does. So combos are a way into a boss's punish window as well as a wave clear.

### How you learn them

- **Ready looks ready.** Every setup has a "ripe" look (see the table), readable at speed, so the heavy has a target.
- **The payoff says its name** once, big (SMASH, FLARE-UP), with hitstop and its own sound. After that, now and then.
- **A chain plays a climbing bell**, like a perfect chain. No combo meter, no damage multiplier: the payoff is the explosion itself, not a number.
- **Cards say what a part sets and cashes**: SETS: CHILL, or CASHES: any setup (it's a blow). The hangar draws a line between the two parts that combo on your ship: *Frost Sprayer freezes → Rail Driver smashes*.
- **The dealer helps a little**: when you have a setup part and no way to cash it (or the other way round), one of the three cards leans towards the missing half. Luck still decides; it just gives you a better chance at the matching half.

### Chains, step by step

- **Freeze and smash.** The Frost Sprayer fogs a wave until it's frozen. One Rail Driver slug through the line: SMASH, SMASH, SMASH. The shards chill the ones behind, two more freeze; a Carpet Bomb finishes them. Dash through the open one that's left.
- **Wildfire.** The Plasma Torch keeps a Gunboat at three burns. A Flak shell: FLARE-UP, a fireball that lights the darts round it, and they burn down on their own.
- **Conductor.** The Arc Coil shocks the whole wave. A Bumper Charge throws one into another: that's a blow on a shocked enemy, GROUND-OUT, and the lightning runs to every shocked one on screen.
- **Nail and hammer.** The Anchor Spike pins an elite. Hold the Charge Cannon to full while you dodge its fire, let go: NAILED. Its plating is gone, it reels, dash through for the takedown.
- **The parry chain.** Freeze with Cryo Feed rounds, parry a Rook's shot: the riposte crits are blows, and every frozen enemy in the line is smashed.

## Every part makes something and wants something

Decided 2026-10-25. Parts barely talked to each other: the interesting rules came from random rolls, the boosters added numbers, nothing heard the ship's verb, and combos were switched off outside the forge. Now every card says, in a few shared words, what the part **makes** and what it **wants** (`src/game/combos.ts`):

| Words | What they are | Made by |
|---|---|---|
| **BURN, SHOCK, CRACK, CHILL, PIN** | Setups. Two marks meeting react; a blow on one cashes it in. | Heat, arc and explosive guns; every fourth Rivet; the Frost Sprayer and Cryo Feed; the Anchor Spike; mark boosters |
| **BLOW** | What cashes a setup in, and breaks plating | Heavy guns, the Hammerhead's ram, caught shots, bombs, reflections |
| **PERFECT, GRAZE, RAM, CATCH** | The ships' verbs, which a relay hands on to guns | Every ship's perfects and grazes; the Hammerhead's ram; the Magpie's catch (the Kestrel's FLY-BY volley is a blow) |

- A heavy **wants a setup**; a setup gun **wants a blow**; a relay **wants its verb**.
- **A card says what on your ship it works with** ("WORKS WITH RIVET GUN, HAMMERHEAD"), and the hangar draws the line to it from anywhere on the deck when you look at a part.
- **Fittings change what a gun does**, not only how hard. The relays:

| Fitting | The guns it touches | Who loves it |
|---|---|---|
| **Spark Gap** (epic) | carry each other's marks: two that mark differently make a reaction of every hit | anyone with two setup guns |
| **Echo Coil** | fire a free volley on a perfect or a takedown | anyone |
| **Graze Fins** | heavies load a round every three grazes | whoever flies close |
| **Ram Spurs** | what you ram takes their marks (and the next ram cashes them) | the Hammerhead |
| **Catch Coil** | caught shots go back carrying their marks | the Magpie |

- **Affixes connect too**: KINDLING (its kills set fire round them), CHARGED (its crits shock), ECHOING (a free volley on a perfect). GIANTSLAYER and SPITE are no longer rolled: percentages you can't feel.
- **What makes picking hard**: opposites (fire and ice quench each other into a crack; a breach uses the crack up), setups and blows needing each other, the ship's lean (a torch on the Kestrel lights everything its fly-by tags; Ram Spurs only work on a ship that rams), and a hangar where a fitting can only touch so much.

## The pilots

Eight ways of flying. Each slot has something for most of them, so whoever you are, a run can lean your way.

| Pilot | Loves |
|---|---|
| **Brawler** | being in their face: point-blank, rams, shoves |
| **Sniper** | distance, one perfect shot, lines through a wave |
| **Arsonist** | things that keep hurting after you've moved on |
| **Controller** | slowing, freezing, pinning: the fight on your terms |
| **Trickster** | angles, bounces, decoys, swaps |
| **Tank** | soaking it, absorbing it, throwing it back |
| **Commander** | turrets, drones, homing: let the ship fight |
| **Gambler** | big risks, big payoffs, spending to win |

## The roster

**Kept** = in the game now. **New** = proposed. About 55 parts in all: every slot covers a range of pilots, and no two parts share a personality.

### Trigger guns: the held stream

| Gun | | Pattern | Quirk | Edge | Pilot |
|---|---|---|---|---|---|
| **Rivet Gun** | kept | Fast straight slugs | Nothing fancy: never jams, never surprises | PUNISHER | everyone's first |
| **Scattergun** | kept | A short fan of pellets | Every pellet that lands shoves a little: point-blank it knocks them back | POINT-BLANK | Brawler |
| **Ion Lance** | kept | Held beam, instant, through a line | Overheats fast; the longer on one target, the better | LOCK-ON | Sniper |
| **Plasma Torch** | kept | A roaring cone of flame, about a quarter of the screen long | Burns, and melts the bullets it touches | SEARING | Arsonist |
| **Arc Coil** | kept | Lightning that jumps enemy to enemy | Needs no aim: it finds them | GROUNDED | Commander |
| **Sentry Pod** | kept | A turret that fires on its own | Picks its own targets, trigger or not | FINISHER | Commander |
| **Frost Sprayer** | new | A mist, slow and wide | CHILLS; stacks to freeze | FROZEN (crits the frozen) | Controller |
| **Wave Emitter** | new | Slow rippling waves, wall to wall | Pass through everything, enemies and bullets; low hit, big shove | CROWD | Controller, Brawler |
| **Saw Launcher** | new | Spinning blades, a few a second | Bounce off the screen's edge and the ground, three times | TAILGATE (the bounce comes from behind) | Trickster |
| **Hive Darts** | new | A buzz of slow little darts | Every dart homes; they never miss, and hit soft | ON THE TELL | Commander |

### Heavy guns: rounds you time

| Gun | | Pattern | Quirk | Edge | Pilot |
|---|---|---|---|---|---|
| **Rail Driver** | kept | One very fast slug | Through everything in its way | LONG SHOT | Sniper |
| **Flak Cannon** | kept | A shell that bursts into shrapnel | Clears a crowd | CROWD | Brawler, Arsonist |
| **Seeker Pod** | kept | A salvo of homing missiles | Slow to arrive, find their own way | ON THE TELL | Commander |
| **Mine Chute** | kept | Mines dropped behind | For whatever chases you | TAILGATE | Trickster |
| **Velocity Lance** | kept | A spike | Hits harder the faster you fly | SKIMMER | Brawler |
| **Charge Cannon** | new | Hold the button, let go | The longer you hold (dodging all the while), the bigger the orb: full charge pierces and blows | PUNISHER | Gambler, Sniper |
| **Anchor Spike** | new | A spike on a chain | **Pins** what it hits for 3 s | PINNED | Controller |
| **Bumper Charge** | new | A fat, slow round | Barely hurts; hurls what it hits until it hits something | AIRBORNE (crits the flung) | Brawler, Trickster |
| **Scrap Cannon** | new | A slug of your own scrap | No rounds: every shot costs 3 scrap and hits like a Rail Driver. Win now, be poor at the dealer. | GIANTSLAYER | Gambler |

### Aux: the defensive verb

| Aux | | What it does | Pilot |
|---|---|---|---|
| **Parry Emitter** | kept | Time it: parry small shots and riposte | Tank, Sniper |
| **Grapple Tether** | kept | Hook an enemy, reel in untouchable, hit hard | Brawler |
| **Decoy Flare** | kept | Aimed fire goes for the flare, then it bursts | Trickster |
| **Void Siphon** | kept | Drink the bullets round you into shields; fly slow | Tank |
| **Bulwark** | new | Hold up a wall in front: it stops everything, beams too, but you crawl and it fills. Let go and it throws what it took as one blast. | Tank |
| **Swap Beacon** | new | Throw a beacon; press again to swap places with it. What was aimed at you hits whatever's there now. | Trickster |

### Shields and hull: fittings

| Part | | What it does | Pilot |
|---|---|---|---|
| **Armour Plate** | kept | Every hit takes 3 less | Tank |
| **Deflector** | kept | Soaks one hit; grows back if you stop getting hit | everyone |
| **Reflector Plate** | kept | What a shield or block stops is thrown back as three shots | Tank |
| **Ablative Skin** | new | Three thin layers. Each breaks in a spray of shrapnel, and they only grow back on takedowns: a shield you earn by killing | Brawler |
| **Static Skin** | new | Grazing bullets charges it; the next thing you touch or that touches you gets the charge as lightning | Trickster |

### Specials: the big button, and the bombs

| Special | | What it does | Pilot |
|---|---|---|---|
| **Bomb Bay** | kept | Wipes the screen's bullets and hurts everything | the panic button |
| **EMP Spike** | kept | Stops machines, erases bullets near you | Controller |
| **Phase Drive** | kept | Two seconds where nothing touches you | Trickster |
| **Overdrive** | kept | Five seconds of double fire and no heat | Gambler |
| **Carpet Bomb** | new | Bomblets rain behind you for 2 s: you fly the line you want bombed | Brawler |
| **Cryo Bomb** | new | Everything on screen freezes for 2 s, bullets too; frozen bullets fall as snow | Controller |
| **Gravity Well** | new | Drags everything near into a knot, then lets go: they fly apart into each other | Controller, Brawler |
| **Drone Wing** | new | Four drones fly with you for 8 s, each copying your trigger gun | Commander |

### Dash mods, boosters, engines

Dash mods stay as they are (Ram Prow, Blink Coil, Wake Charges, Ghost Lamp, Catalyst, Lunge Jets): each already changes the dash in its own way. Boosters gain one, **Cryo Feed** (touching guns' rounds chill), so any gun can join a cold build, as Incendiary Feed, Tesla Coupler and Breacher Rack do for the others.

## Rolls: the same gun, a different gun

The random part. A drop's mods change **how the gun fires**, not just its numbers, and each is a trade, so the roll is a choice, not a free win. These would replace the flat +DAMAGE and +FIRE RATE mods on guns.

| Roll | What it does | The trade |
|---|---|---|
| **RAPID** | Half again as fast | Each shot a third lighter |
| **HEAVY** | Hits more than twice as hard, and shoves | Half the rate |
| **WIDE** | Two more shots in a fan | Each a quarter lighter |
| **LONG** | Shots fly further and faster | Fires a bit slower |
| **PIERCING** | Through two more | — |
| **SEEKING** | Shots curve towards enemies | Fly a fifth slower |
| **BOUNCING** | Bounce once off the edge or the ground | — |
| **BIG** | Shots twice the size | Fly slower |
| **BURNING / SHOCKING / CRACKING / CHILLING** | Rounds leave that mark | — |

A gun keeps its personality whatever it rolls: a WIDE Rail Driver is still a sniper's gun, now with three lines. A Rivet Gun that rolls HEAVY and SEEKING is a run's own weird thing. Rolls stack with the affixes (BLASTING, RICOCHET...) and the legendary traits (TWINNED, BOOMERANG...), so the jackpots stay jackpots.

## Builds this makes

- **Freezer.** Frost Sprayer, Cryo Bomb, Rail Driver: freeze the wave, then put a slug through the line for doubled blows and flying ice.
- **Pinball.** Wave Emitter, Bumper Charge, Ram Prow: never shoot plating off, throw them into each other.
- **The Spender.** Scrap Cannon, Overdrive, Rivet Gun rolled RAPID: win every fight, arrive at the dealer broke.
- **The Hive.** Hive Darts, Seeker Pod, Drone Wing, Sentry Pod: fly, dodge, and let the ship hunt.
- **Bank Shot.** Saw Launcher rolled BOUNCING, Swap Beacon, Mine Chute: everything comes at them from the wrong side.
- **The Wall.** Bulwark, Reflector Plate, Armour Plate: take it all, give it back in one go.

## Considered and left out

One test: does it play differently from everything already on the list?

- **Lien Gun** (damage owed, paid all at once): a fun idea, but it plays like a slow Rivet Gun with a delay.
- **Bell Gun** (seventh shot gongs): a Rivet Gun with a counter.
- **Kite Mine**, **Tow Line**: Mine Chute and Ram Prow already cover them.
- **Bribe Beacon**, **Turncoat Spore** (enemies change sides): too strong for a fight about reads, and a dead card on the wrong planet.
- **Hot Zone**, **Census Lamp**: numbers that don't change how you fly.

## Open questions

1. ~55 parts against the plan's ~35: is this the right size, now each one has to earn its place?
2. **CHILL**: in, as a fourth mark outside the reactions?
3. Rolls that **change how a gun fires** replace the flat damage and rate mods on guns: yes?

## The forge

A tab in the wave lab (`just lab`, then **Forge**, or `wave-lab.html?tab=forge`) for designing guns and trying builds:

- **Parts** on the left: the game's, the bench's new ones (NEW), the ones changed (EDITED) or made (MADE) here. **+** bolts a part on.
- **The build**: a frame, the parts on it (each placed where it does most good), their tier, trait and affix.
- **Dials**: every number of a gun (rate, hit, speed, life, shots, spread, pierce, heat, heavy rounds) and the new ones (chill, shove, pin, bounces, homing, ripen, size, phases), its shot, mark, edge and colour. Changes are kept in the browser; **Copy as code** gives the PartDef to paste into `game/parts.ts`.
- **Fly it** in the real game, by the autopilot or by you, against a **target** (Crowd, Plated, Shielded, Elites, Mixed), with **Combos** on or off. Under it, live: where the damage is coming from and the cash-ins.
- **Test it**: the autopilot flies it headless, several runs, at the stage's difficulty. **Pin** a result and the next sits beside it.
- **Combos to try**: builds that show each payoff.

Headless from the terminal: `just forge --a rivet,flak --b frost,charge --target elites --combos=both --seeds 4`.

The new parts live in `src/game/lab-parts.ts` and only exist in the lab (`&forge` in the URL): no dealer, card or event offers them. The combos are on only with `&combos` (the forge's switch). The sim is in `src/sim/arsenal.ts`, the look in `src/view/arsenal-view.ts`.

Built so far: CHILL and FROZEN, shove (a flung body is a blow), pin, bouncing, homing, phasing (through shields and plating), ripening heavy rounds; every cash-in (SMASH, NAILED, FLARE-UP, GROUND-OUT, BREACH); and the new guns **Frost Sprayer, Wave Emitter, Saw Launcher, Hive Darts, Phase Needle, Charge Cannon, Anchor Spike, Bumper Charge**, and the **Cryo Feed** booster. Not yet: the new aux, shields and specials, and the gun rolls.

## What the first runs said (2026-10-23)

Kestrel, difficulty 0.5, three runs a build, combos off and on:

- **Combos pay where fights are long.** Against elites, combos cut the time to kill by a third or more: Rivet + Flak 6.9 → 4.3 s, Frost + Charge 6.5 → 4.1 s, Rivet + Cryo Feed + Flak 7.2 → 5.2 s. Against fodder they do nothing: it dies before a setup lands. That's right: combos are for the things worth a plan.
- **Freeze and smash works** once the mist sticks: the first Frost Sprayer sprayed too wide to freeze anything (chill topped out at 3.7 of 4). Tightened, Frost + Charge is the best elite-killer on the bench with combos on, and the worst against a crowd. That's a personality.
- **Self-combos had to go.** Before the rule above, Saw + Seeker cashed 27 BREACHes a run off its own missiles and the Arc Coil 47 GROUND-OUTs off its own crits.
- **Saw Launcher** is the crowd-clearer (55 kills to the Rivet's 35 on the same waves); cut to 5 damage, it's level with the Rivet on elites.
- **Wave Emitter + Bumper Charge** is the weakest pair alone (19 DPS on elites, which shrug off shoves). It's a control pair: it wants a damage part beside it, and shove has no cash-in of its own yet.
- **Phase Needle** is no better than Rivet + Flak on shielded targets yet; the Shielded preset may not ask the question well (Wardens only shield their front).
- The autopilot barely uses the Mine Chute, so mine numbers say little.

## A first slice

CHILL and FROZEN; the gun rolls (RAPID, HEAVY, WIDE, SEEKING); three new guns that are as far from the current ones as they can be: **Frost Sprayer, Charge Cannon, Saw Launcher**. Bench them with the autopilot against every frame.
