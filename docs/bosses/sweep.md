# Sweepwright Imre (the Sweep)

*The Syndicate's collection fleet, and the man who counts what it takes.* [The Kindling Syndicate](../factions/syndicate.md). Pursuer. **Designed, not built:** no fight in the game. How it's told: [tone](../lore/tone.md).

## Who he is

Dov Imre is the youngest son of a Lamp family, given the Sweep because the Board needed someone it could trust with a fleet and couldn't trust with a seat. His flagship is ***Due Course***, a lamp-ship: a long gold hull hung with lanterns, which relights each gate behind it as it comes, and puts out the ones ahead. His crews signed on to clear debts of their own, and are paid a share of what they seize, so they never miss anything. The Sweep has grown a third in five years. Imre is collecting harder every month, so the Syndicate has the most in hand when the count comes.

- **Caught between:** the Board, which wants everything collected before the Engine wakes, and the Throne, which can revoke the Syndicate's writ with one signature.
- **Owes:** the Board, for a fleet instead of a seat; and his crews, a share of every seizure.
- **Wants from you:** what you owe. Every unpaid crossing in your log, in tin, in parts, in hull. He isn't angry: you're an entry, and he'd like to close it.
- **Sad truth:** he's collecting for books the Engine won't read. When it counts, it will count metal, not paper, and every seizure he makes is just more crossed metal, piled in one place, for the Engine to come for first.
- **The call:** the Sweep's relays run on reset cores. In his last phase they stop carrying his orders. The lanterns he lit turn north, and his cutters drift off their lines, and he fights on with the crews who'll still answer a lamp-signal by hand.
- **Vibe:** an auction house that comes to you. A gavel on every seizure, a clerk reading out sums, brass bells, the hiss of lanterns lighting.

### His words

- **As he comes:** `SWEEPWRIGHT IMRE: "YOUR ACCOUNT HAS COME DUE, PILOT."`
- **Under the bar:** he enters you. `ENTERS: ONE CROSSING, UNPAID` (hanging back), `ENTERS: ONE HULL, IDLE` (sitting still), `ENTERS: ARREARS, LEFT`, `ENTERS: INTEREST` (boosting), `ENTERS: CONTEMPT` (up close), `ENTERS: A DISCREPANCY` (dashing).
- **As he goes:** `"ENTERED AS A WRITE-OFF. DON'T MAKE ME FIND YOU TWICE."`

## When it comes

The Sweep crosses every chart already, and today being caught by it does nothing (`caught()` in `src/sim/chart.ts` is never called). This makes it matter:

- **Caught**, the next stop is the Sweep: you don't choose it, and it replaces whatever that stop was. It's a boss for taking too long, so the risk is one you chose stop by stop.
- **Win** and you get away with what it was carrying: the seizures it made in this system, a hold of parts and scrap, and the Sweep is held back (`SWEEP HELD`) for the rest of the sector.
- **Lose** and it doesn't kill you: it **seizes**. You lose the parts in your hold and half your scrap, and limp on with one hull. A rustwing gets swept; a rustwing doesn't get to die of it.
- Once a sector at most.

## The dance

Lattice, in Syndicate gold on black: every move drawn first, a full second.

| Move | Tell (pose · shape · sound) | What it does | The answer | Open after |
|---|---|---|---|---|
| **THE FRONT** (opening) | the lanterns light behind you · a line of gold drawn across the bottom of the field · brass bells | the Sweep's front rises from the bottom edge and keeps coming: below it, everything is seized (it hurts). It stops a third of the way up and holds there for the fight | stay ahead of it; the field is smaller now | — (it holds, and pushes up a little each phase) |
| **SEIZURE** (signature) | a gavel · a ring drawn round your ship, closing · the clerk reads a sum | grapples fired at the ring. One that lands doesn't hurt: it takes a part out of your hold, dragged back to *Due Course* on a line | dash out of the ring before it closes; shoot the line to drop the part, and scoop it back | 2.0 s |
| **LEDGER LINES** | lanterns down both sides light in rows · lines across the field, one per row | beams across the field row by row, bottom to top, each row a column of the account | between the rows as they fire, moving up with them | 1.6 s |
| **SHARES** (I, II) | a bell for each | crew cutters, paid by the seizure: they go for any scrap on the field, and for your hold, not for you | kill them before they scoop, or take the window | 0.8 s |

**Phase I: ACCOUNT DUE** (100–66%). The Front, then Seizure → Ledger Lines → Shares, in order. Correct, unhurried, every move announced.

**Phase II: ARREARS** (66–33%). The Front rises again, and the lanterns burn hotter: Seizure fires two rings, one where you are and one where you're going. It reads you and strings moves. Filler: walls, rain.

**Phase III: THE LAMPS GO OUT** (33–0%). The relays stop. The lanterns turn north one by one and go dark, the Front stops rising, and the cutters drift off their lines and listen. Imre fights with what answers by hand: fewer moves, slower tells, Seizure from the flagship alone, and the sums the clerk reads out stop adding up.

**Last stand** (8%): every lantern relit at once, all the rows of the ledger in one sweep, then a last Seizure for everything you're carrying.

**How it ends:** *Due Course* turns about and goes back the way it came, relighting nothing.

## Model, music

- **Model:** from above, a long gold hull hung with lanterns along both sides (each a separate part, to go dark in phase III), a counting-house on the stern, grapple launchers along the keel.
- **Music:** `boss_sweep`: an auction's patter over a brass march; phase III drops the march and leaves the bells, out of time.

## Still to do

- [ ] Call `caught()`: the next stop becomes the Sweep's fight, once a sector.
- [ ] Seizure: a hit that takes a part from the hold, a line you can shoot to drop it, a part you can scoop back.
- [ ] The Front: a field that shrinks from the bottom and holds.
- [ ] Losing that seizes instead of ending the run.
