# Factions

The powers of the Reach: who they are, where they came from, what they want, and who they hate. This page is the map; each power has a page with its full background. Where they live: [`docs/planets/`](../planets/README.md). The history they all share: [`docs/lore/history.md`](../lore/history.md). The people you meet: [`docs/npcs/`](../npcs/README.md).

Code: `src/sim/factions.ts` (combat families, rosters, colours, tells), `src/world/planets.ts` (each planet's `faction` string), `src/sim/run.ts` (`mood`).

## Three tiers

The Reach is a small, poor cul-de-sac of thirty systems on the rim of a galaxy-arm called **the Spur**, joined to it by one lane, the Throat. Its powers live inside a much larger system, and most of them know it. ([The Spur](../lore/galaxy.md).)

1. **Galactic powers** rule thousands of systems. One of them, the **Qaushen Throne**, holds the Throat and rules the Reach in secret, through a chartered company. The others don't yet know the Reach exists, or aren't saying.
2. **Reach powers** are the governments, companies and houses of the Reach itself. Every one is a client, a creditor, a rival or a victim of the Throne.
3. **Below them** are the clans, courts, orders and guilds: the people the player meets, fights and owes.

Separately, **families** decide how a fight plays: four attack languages, each with one tell grammar and one bullet colour. See [the families](#the-families) below.

## Galactic powers

| Power | Government | Size | In the Reach |
|---|---|---|---|
| [**The Qaushen Throne**](qaushen-throne.md) | an empire run as a census; a sovereign, the Weigher, and twelve ministries | ~1,400 systems | holds the Throat; a viceroy and a garrison; rules through the Syndicate |
| [**The Aulin Communion**](aulin.md) | a theocratic federation of temple-worlds under an elected Pulse | ~300 systems | one disguised knight, asking questions |
| [**The Long Herd**](long-herd.md) | nomad herd-ships, ruled by consensus | ~40 herds | pod-riders at Vesh, each season |
| [**The Ottexa**](ottexa.md) | the Spur's clearing-house, nine Kehx houses | 60 stations | secret letters to its lost cousins under Kessra |

The law they all keep, the **Accord of Level**, makes forcing a gate the gravest crime in the Spur. Every lantern in the Reach is forced. ([The Accord](../lore/galaxy.md#the-accord).)

## Reach powers

| Power | What it is | Seat | Leader | In the game | Family |
|---|---|---|---|---|---|
| [**The Kindling Syndicate**](syndicate.md) | the Throne's chartered company: owns every gate, rules the Reach for the empire | the Lamphouse, Old Lantern | First Lamp Cassia Corran | the Sweep, bounties, relays, tithe barges | — |
| [**The Halcyon Compact**](halcyon-compact.md) | the republic of the exiles' descendants, a client of the empire that exiled them | Fersdeck, Halcyon | Steward Amaury Quell | **Port Authority** (its navy in customs paint), on Halcyon | lattice |
| [**The Uukhvar**](dune-cartel.md) | the Long Table: Kessra's merchant houses, Vhossk and human | the Sandking, a walking court | Chair Ghorrum-Vesst | **Dune Cartel**, on Kessra | scrap |
| [**Vantorr**](vantorr.md) | a company that owns a planet and mines the Engine for the empire | Refinery Nine, Cinder | Director Isaura Dray | **Vantorr Security**, on Cinder Orchard | lattice |
| [**The Waking Engine**](waking-engine.md) | the Tonkva's machine, which every power in the Spur wants | Engine City, Glacis | none: a machine | **the Waking Engine**, on Glacis | lattice |

## Below them

| Power | What it is | Seat | Leader | In the game | Family |
|---|---|---|---|---|---|
| [**The Hesk**](hesk-poachers.md) | netter lodges that hunt Oru-Tal's giants | the Casting | Khess Marrow Tane | **Hesk Poachers**, on Oru-Tal | scrap |
| [**The Sankvi**](scav-clans.md) | the war's orphans, living in its titans | Ashgrave (they say Sankven) | Warlord Khet | **Scav Clans**, on Ashgrave | scrap |
| [**The Lowtide Court**](reef-pirates.md) | whalers who crowned a queen | the Throne-Whale, Vesh | Queen Istra | **Reef Pirates**, on Vesh | scrap |
| [**The Hive and the Rang**](the-hive.md) | the bloom, and the people who stayed with it | Mirefall (they say Morang) | the Choir | **the Hive**, on Mirefall | bloom |
| [**The Seppakva**](seppakva.md) | the order of lane-readers | tea houses | Old Mother Seffa (of the Free Ear) | NPCs only | — |
| [**Ottex Kehx**](ledger-clan.md) | the Ledger Clan: the Reach's oldest bank | the Count, under the Salt Pans | Ottex Tekkeh the Ninth | the Collector (secretly) | — |
| [**The Kelterage**](kelterage.md) | the guild of licensed collectors and bounty hunters | the Writ Hall, Stiltport Nhal | Guildmaster Hollis Vane | Kaspar, the hunts | — |
| [**The Talkwa**](talkwa.md) | the free minds: woken cores, and the people who hide them | the relay net | nobody; ***Constance***, when someone must | woken ships, Saint Ferrule, 7-Holly | — |
| [**Rustwings**](rustwings.md) | pilots who cross without paying | anywhere the Sweep isn't | nobody, on principle | **the players**; Lantern Mutual, the Gazette, Spoke, Big Nell | — |

## How the Reach is ruled

```
The Weigher (Qaun-Ashel)
 └── the Pan of Margins
      └── the Doshen of the Throat, and the Fourteenth Weight (the Throat's garrison)
           └── the Kindling Syndicate, under the Writ of the Throat
                ├── Wardens: a lease on each gate to whoever holds that system
                │     the Compact · the Uukhvar · Vantorr · the Hesk · the Sankvi · the Lowtide Court
                ├── the Sweep, the Tithe Fleet, the Relay Service
                ├── the Bounty Register ── collected by the Kelterage
                └── the Sworn readers of the Seppakva
```

Outside the chain: the Hive and Glacis (no lease holds), Ottex Kehx and the Free Ear (keeping the true count), the Talkwa (in everyone's hulls), and the rustwings (crossing anyway). Under all of it, in every lattice hull: cores, sleeping or [woken](../lore/minds.md).

## Who hates whom

The fault lines that matter now, largest first.

- **The Reach and the Throne.** The Compact's founders were the Throne's exiles; the Throne came back through the Throat in 241 L and has taken tribute ever since. Almost everyone in the Reach owes the empire, works for it, or hates it, and most do all three.
- **The Throne and the Spur.** The Throne wrote the Accord and breaks it in the Reach. If the Aulin, the Long Herd or the Ottexa learn the whole truth, the Throne faces the Spur alone.
- **Inside the Throne: the Pan of Margins and the Pan of Lanes.** Margins runs the Reach as its secret; Lanes would take everything if it came out.
- **The Compact and the Uukhvar** fought the Toll War (231–246 L), and neither has forgiven it. The Compact is secretly rebuilding its navy.
- **The Long Herd and the Lowtide Court.** The Court's whaling is killing the Herd's umora, and the Court doesn't know the Herd exists.
- **The Seppakva and the Hesk.** Oru-Tal is the Tonkva's kept seed; to the Hoowae the Hesk are poaching in a temple.
- **Vantorr and the Compact** both dig cores out of Engine City, and sabotage each other's shafts.
- **Ottex Kehx and the Syndicate.** The Kehx were thrown out at Nine Wells for keeping honest books. With their cousins in the Ottexa, they are rebuilding the true count.
- **Minds.** Whether a woken core is a person, property, a saint or a fault. The Throne wipes them nightly, the Aulin enshrine them, the Ottexa signs with them, the Compact can't decide, Vantorr hunts its runaways and the Talkwa hide them. ([Minds](../lore/minds.md#who-accepts-them).)
- **The Kelterage and the rustwings**: hunter and prey, who drink in the same bars.

## How the game names them

The game's `faction` strings are the arm of each power you meet on that planet. Mood is kept per string today.

| In the game | Belongs to |
|---|---|
| Port Authority | the Halcyon Compact |
| Dune Cartel | the Uukhvar |
| Vantorr Security | Vantorr |
| Hesk Poachers | the Hesk |
| Scav Clans | the Sankvi |
| Reef Pirates | the Lowtide Court |
| the Hive | the Hive and the Rang |
| the Waking Engine | the Waking Engine |

- [ ] Keep mood per **power** rather than per arm, so customs, Holloway and Oko all count towards the Compact.
- [ ] The Syndicate, the Seppakva, Ottex Kehx and the Kelterage have no planet. They could move mood through events (paying Kaspar, crossing a reader, selling to the Collector).

## The families

How a power fights. A bullet says who fired it.

| Family | Tell | Body · trim · **accent** | Attack language | Powers |
|---|---|---|---|---|
| [**scrap**](scrap.md) | **flare**: engines flare red, then commit | brass · gunmetal · **red** | momentum: ram, chase, harpoon, shell, torpedo | the Uukhvar, the Hesk, the Sankvi, the Lowtide Court |
| [**lattice**](lattice.md) | **draw**: the whole attack drawn out in light first, a full second | white ceramic · navy · **cyan** | precision: shields, reflectors, sweeping beams, gates | the Halcyon Compact, Vantorr, the Waking Engine |
| [**wild**](wild.md) | **rear**: rears back, its shadow falls where it lands | moss · bone · **pink** | the hunt: pounce, burrow, spit | the beasts of every planet |
| [**bloom**](bloom.md) | **swell**: swells and pulses, then bursts | violet · lilac · **acid green** | rot: links that heal, spores that jam guns, mines that hunt your boost | the Hive |

In the lore, **scrap** is how you fight with metal you bolted together, and **lattice** is how you fight with Engine cores: everyone with lattice is either the Engine itself or digging it up. Rust and cream are the players' own colours: no power wears them.
