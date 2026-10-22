# NPCs

The people (and a few creatures) you meet between fights. This page has the overview; each has a page of its own. Where they turn up: [`docs/planets/`](../planets/README.md). Who they work for: [`docs/factions/`](../factions/README.md). The bosses are characters too, in [`docs/bosses/`](../bosses/README.md).

Code: `src/sim/events.ts` (`EVENTS`: each event's `who`, text and choices), `src/screens/stops.ts` (dock gossip), art in `public/art/events/`. How they should look, talk and write: [`docs/style-and-characters.md`](../style-and-characters.md) §3–5. Their voices: [`docs/alien-voices.md`](../alien-voices.md). Their peoples: [`docs/lore/peoples.md`](../lore/peoples.md). The machines among them (7-Holly, Saint Ferrule, the Choir) are woken cores: [`docs/lore/minds.md`](../lore/minds.md).

## The rules (from the style guide)

- **One function with a face.** Each fronts a system (debt, insurance, fuel, bounties, rumours), and the system is more interesting for who fronts it.
- **Everyone wants something.** Strange bodies, sincere voices; the comedy comes from droids, haggling and situations, never a wink.
- **One quirk**, repeated every time. Three lines at most before the choices; costs and odds in plain sight; end on a comic beat.
- **A sound for everyone**: a two-second bark under subtitled text (planned, see the voices doc).

## In the game

All human, all from `events.ts`. "Open" means everyone knows the business, so it shows on the chart before you go.

| Who | Event | Fronts | Open | Art |
|---|---|---|---|---|
| [Mama Ruzz](mama-ruzz.md), moneylender | MAMA RUZZ'S BARGE, MAMA'S BOYS | debt | yes | `loan` |
| [Spoke](spoke.md), who runs the reels | SPOKE'S TABLE | gambling, rumours | yes | `dice` |
| [Inspector Holloway](inspector-holloway.md), Port Authority | CUSTOMS CUTTER | the law, bounty | no | `customs` |
| [Pip Hollow](pip-hollow.md), Lantern Mutual | LANTERN MUTUAL | insurance | yes | `insurance` |
| [Big Nell](big-nell.md), fuel merchant | BIG NELL'S TANKER | fuel | yes | `tanker` |
| [Rollo Stax](rollo-stax.md), the voice of the lanes | THE LANTERN GAZETTE | market news, mood | no | `gazette` |
| [Kaspar](kaspar.md), who hunts for bounties | KASPAR | bounty | comes to you | `hunter` |
| [Captain Juno Pell](juno-pell.md), courier | DISTRESS CALL | contracts | no | `distress` |
| [Captain Odo Brask](odo-brask.md) | THE LAST CONVOY | intel, a favour | no | `refugees` |
| [Dr I. Varga](dr-varga.md), ship's surgeon | COLONY POD | healing, a favour | no | `pod` |
| [The Collector](the-collector.md) | STRANGE SIGNAL | selling secrets | unseen | `signal` |

Named but never met: **Lana Vey**, a racer shot down last season (CRASH SITE), and **the Margarethe**, a ghost freighter whose crew still says "Welcome aboard" (GHOST FREIGHTER). Dock gossip also mentions **a trader comet** going round the wrong way: "She buys anything, and pays a little over."

## Proposed

From the style guide's cast (§3), none built yet. They are the aliens, droids and creatures the human cast lacks.

| Who | What | Would front | Where | Voice |
|---|---|---|---|---|
| [The Vhossk Twins](vhossk-twins.md) | two-headed broker | two prices | any market | voice |
| [The Skree Salvagers](skree-salvagers.md) | hooded scavengers | junk sale | derelicts, crash sites | voice |
| [Hull Leeches](hull-leeches.md) | creature | outer-edge drain | deep space | sfx |
| [Unit 7-Holly](unit-7-holly.md) | lonely toll droid | contracts | Halcyon, lattice planets | droid |
| [The Choir of Mirefall](choir-of-mirefall.md) | fungal mind in a freighter | growing parts | Mirefall | layered |
| [Old Mother Seffa](old-mother-seffa.md) | lane-reader | intel for fuel | deep space | voice |
| [The Ledger Clan](ledger-clan.md) | beetle bankers | debt consolidation | Kessra | voice |
| [Saint Ferrule](saint-ferrule.md) | droid hermit | blessing a part | relays, shrines | droid |
| [The Purrgil of Vesh](purrgil-of-vesh.md) | lane-whales | escort or hunt | Vesh | sfx |
| [Tobbo Grisk](tobbo-grisk.md) | junk dealer | haggling | Kessra, Ashgrave | voice |
| [Squit](squit.md) | informant | intel | anywhere, recurring | voice |
| [Lady Vey](lady-vey.md) | collector on a yacht | pays triple | very rare | voice |

## Still to do

- [ ] Recurring characters don't remember you across meetings or runs yet.
- [ ] No barks recorded: `tools/voices/` and `public/audio/voices/` don't exist yet.
- [ ] No speaker colours or text speeds per character.
- [ ] **Lady Vey** (proposed) and **Lana Vey** (the dead racer) are too close. The lore proposes **Lady Vaelmira** ([peoples](../lore/peoples.md#the-vaelo)).
- [ ] The **purrgil** are Star Wars' name; the lore proposes **umora** ([peoples](../lore/peoples.md#creatures)).
- [ ] Who the **Collector** is: the lore says the Ledger Clan ([the Waking](../lore/the-waking.md#the-truth-for-us-not-the-player)).
