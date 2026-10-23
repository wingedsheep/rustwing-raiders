# NPCs

The people (and a few creatures) you meet between fights. This page has the overview; each has a page of its own. Where they turn up: [`docs/planets/`](../planets/README.md). Who they work for: [`docs/factions/`](../factions/README.md). The bosses are characters too, in [`docs/bosses/`](../bosses/README.md).

Code: `src/sim/events.ts` (`EVENTS`: each event's `who`, text and choices), `src/screens/event.ts` (the event screen: dialogue, choices with their costs and odds, the roll), `src/screens/stops.ts` (dock gossip), art in `public/art/events/`. How they should look, talk and write: [`docs/style-and-characters.md`](../style-and-characters.md) §3–5. Their voices: [`docs/alien-voices.md`](../alien-voices.md). Their peoples: [`docs/lore/peoples.md`](../lore/peoples.md). The machines among them (7-Holly, Saint Ferrule, the Choir) are woken cores: [`docs/lore/minds.md`](../lore/minds.md).

## The rules (from the style guide)

- **One function with a face.** Each fronts a system (debt, insurance, fuel, bounties, rumours), and the system is more interesting for who fronts it.
- **Everyone wants something.** Strange bodies, sincere voices; the comedy comes from droids, haggling and situations, never a wink.
- **One quirk**, repeated every time. Three lines at most before the choices; costs and odds in plain sight; end on a comic beat.
- **A sound for everyone**: a two-second bark under subtitled text ([the voices doc](../alien-voices.md)).

## In the game

Humans, aliens, woken machines and creatures, all from `events.ts`; who they are (name plate, colour, text speed, voice) is `src/sim/cast.ts`. "Open" means everyone knows the business, so it shows on the chart before you go. Recurring characters remember you across runs (`src/sim/memory.ts`: "MET BEFORE", and what you did to them last time).

| Who | Kind | Event | Fronts | Open | Art |
|---|---|---|---|---|---|
| [Mama Ruzz](mama-ruzz.md), moneylender | human | MAMA RUZZ'S BARGE, MAMA'S BOYS | debt | yes | `loan` |
| [Spoke](spoke.md), who runs the reels | human | SPOKE'S TABLE | gambling, rumours | yes | `dice` |
| [Lieutenant Holloway](inspector-holloway.md), Port Authority | human | A ROUTINE INSPECTION | a navy buying cores | no | `customs` |
| [Pip Hollow](pip-hollow.md), Lantern Mutual | human | LANTERN MUTUAL | insurance | yes | `insurance` |
| [Big Nell](big-nell.md), fuel merchant | human | BIG NELL'S TANKER | fuel | yes | `tanker` |
| [Rollo Stax](rollo-stax.md), the voice of the lanes | human | THE LANTERN GAZETTE | market news, your deeds | no | `gazette` |
| [Kaspar](kaspar.md), who hunts for bounties | human | KASPAR | bounty | comes to you | `hunter` |
| [Captain Juno Pell](juno-pell.md), courier | human | DISTRESS CALL | contracts | no | `distress` |
| [Captain Odo Brask](odo-brask.md) | human | THE LAST CONVOY | intel, a favour | no | `refugees` |
| [Dr I. Varga](dr-varga.md), ship's surgeon | human | COLONY POD | healing, a favour | no | `pod` |
| [Wick Tarrow](wick-tarrow.md), the oldest rustwing | human | THE LAST RIDE | a last wish | no | `ashes` |
| [Old Mother Seffa](old-mother-seffa.md), lane-reader | Hoowae | SEFFA'S TEA HOUSE | easy jumps, the warden | no | `teahouse` |
| [The Vhossk Twins](vhossk-twins.md) | Vhossk | THE VHOSSK TWINS | two prices | no | `twins` |
| [Tobbo Grisk](tobbo-grisk.md), junk dealer | Bahwoh | TOBBO GRISK'S YARD | haggling (the haggle game) | no | `tobbo` |
| [The Skree](skree-salvagers.md), salvagers | Chikta | THE CHIKTA SAIL-BARGE | blind crates | no | `skree` |
| [Squit](squit.md), informant | Eefee | SQUIT | a tip, or a grudge | no | `squit` |
| [The Ledger Clan](ledger-clan.md) | Kehx | THE COUNT, THE COUNT'S COLLECTORS | cheaper debt | no | `ledger` |
| [Lady Vaelmira](lady-vaelmira.md), collector | Vaelo | A CHROME YACHT | five times the price | no | `vaelmira` |
| [Censor Ashqel](censor-ashqel.md), of the Throne | Zhaun | THE CENSUS | papers, the warden | no | `census` |
| [Unit 7-Holly](unit-7-holly.md), toll droid | woken core | TOLL RELAY 41 | a crewmate who talks to the law | no | `holly` |
| [Saint Ferrule](saint-ferrule.md), droid hermit | woken core | THE SHRINE OF SAINT FERRULE | blessing a part | no | `ferrule` |
| [The Choir of Mirefall](choir-of-mirefall.md) | woken core, fungal | THE TAMSIN LOWE | growing parts | no | `choir` |
| [The Wren](the-wren.md), runaway freighter | woken core | ABSCONDED ASSET | a passenger, or a writ | no | `runaway` |
| [Hull Leeches](hull-leeches.md) | creature | HULL LEECHES | fuel drain (the shake game) | comes to you | `leeches` |
| [The umora](the-umora.md), lane-drifters | creature | A LOST CALF | escort or hunt | no | `calf` |
| [The Collector](the-collector.md) | unseen | STRANGE SIGNAL | selling secrets | unseen | `signal` |

Named but never met: **Lana Vey**, a racer shot down last season (CRASH SITE), and **the Margarethe**, a ghost freighter whose crew still says "Welcome aboard" (GHOST FREIGHTER). Dock gossip also mentions **a trader comet** going round the wrong way: "She buys anything, and pays a little over."

Each speaks a short bark in their own voice when the event opens and when it lands (`src/voices.ts`, clips in `public/audio/voices/`, baked by `tools/voices/`).
