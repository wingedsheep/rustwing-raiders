# Loot Runner

*Bounties.* Scores and the other enemies: [the overview](README.md).

**Who it is.** A toll runner: a fast skiff carrying a system's tolls to the tithe barges for whoever holds the lease. Bring it down and its hold bursts. It's insured, so it doesn't fight. It runs, and in nine seconds it's in the next lane.
**Ship's log.** *"Someone's tolls, in a hurry. Catch it before it's gone."*

**Now.** Keeps away from your guns, drops mines, jinks when you line up, bolts after 9 s; its scrap comes out only when it dies, like every foe's (`src/sim/foes.ts:1169`).
**Weak.** The jink has no tell (0.25 s, `null`).
- [ ] A short tell before the jink (engines flare one side).
