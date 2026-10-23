# Controller layout: combat, bombs, and deployables

Design decision, 2026-10-23. The goal is comfortable, readable combat: keep the actions Vincent finds easiest on the face buttons, preserve shooting through defensive actions, and give deploying a companion or drone its own input.

**Status:** Circle/B parry and L1/LB focus are implemented. The separate utility slot and R1/RB deploy action below are the agreed direction, still to be implemented. R1/RB currently also fires heavy weapons. This note records the intended layout and its reasoning.

## Intended layout

| Role | PlayStation | Xbox | Behaviour and examples |
|---|---|---|---|
| Move | Left stick / D-pad | Left stick / D-pad | Steer the ship. |
| Dash | Cross | A | Press to evade; dash through an open enemy for a takedown. |
| Heavy attack | Square | X | Press for a heavy round; follow a dash with a heavy for a dash-strike. |
| Defensive aux | Circle | B | Press for the fitted defensive response: parry, flare, siphon, or tether. |
| Burst special | Triangle | Y | Press for the fitted special: bomb, EMP, phase, or overdrive. |
| Deploy utility | R1 | RB | Press to deploy the fitted drone, companion, or turret. |
| Fire | R2 | RT | Hold for the main guns. |
| Boost | L2 | LT | Analog pressure controls boost. |
| Focus / weld | L1; L3 alternate | LB; L3 alternate | Hold for precision; with guns released and Weld ready, hold to repair. |

R1/RB stops duplicating heavy attack when deployment is implemented. Menus retain Cross/A confirm, Circle/B back, and shoulders for changing tabs. An empty utility slot does not turn R1 back into heavy fire: a button keeps its meaning across builds.

## Why each action goes there

### Dash and heavy stay adjacent

Cross/A and Square/X put the repeated dash → heavy sequence under a short thumb movement. This supports the game's dash-strike and takedown loop. Moving heavy to a shoulder would remove that familiar relationship, while keeping a duplicate on R1 would occupy the button needed for deployment.

### Parry gets Circle/B

Vincent finds the face buttons easier to press than L1. Parry is a reaction that depends on precise timing, so it gets an accessible face button next to dash. The thumb chooses between evading and meeting the attack, while the main guns can stay held on R2/RT.

This is a preference for this player and game, not a universal claim that face buttons are faster. Circle also remains the defensive aux button when another tool replaces the Parry Emitter. Tether stays here because it is already an immediate movement/combat response; this proposal does not reclassify existing tools merely to make the categories perfectly symmetrical.

Parry only catches small, discrete shots; it cannot answer beams, heavy projectiles, blasts, or bodies. Its feedback stays local and never slows or freezes the shared game. See [Parry rules and feedback](parry-rules.md).

### Bombs get Triangle/Y

A bomb is a burst special: a deliberate expenditure for immediate impact. It shares the special slot with EMP, phase, and overdrive, which already use the game's special charge. Triangle/Y gives that family a consistent place without taking Circle away from parry.

The role matters more than the object's name. A screen-clearing bomb uses special; ammunition fired by a heavy gun, including the existing Mine Chute, stays on heavy attack. There is no separate button for every explosive item.

### Companions and drones get R1/RB

Deployment is a separate decision: put support into the fight, then return attention to movement and defense. Its input should coexist with a bomb and a parry. R1/RB becomes available by removing the duplicate heavy binding, so deployment needs neither a chord nor a hold on a face button that delays another action.

Deploying should normally be a press, after which the unit acts on its own. A drone may follow, a turret may remain where placed, and a companion may fight independently. Their lifetime, cooldown, replacement, and recall rules need defining per tool; this layout does not invent a second command system on the same button. Holding R1 must not repeatedly spawn units.

R1 and R2 can compete for the same index finger, depending on grip. Deployment should therefore be occasional rather than a rapid repeated attack. Test whether players can keep firing comfortably when deploying; do not assume everyone uses separate fingers on bumper and trigger.

### Sustained actions leave the thumb available

Main fire stays on R2/RT because the stream is held through much of a fight. Putting it on Square would make every dash or parry compete with holding fire. Analog boost stays on L2/LT. Focus moves to L1/LB, allowing the thumb to use dash, heavy, parry, and special while focus is held. L3 remains an alternate, rather than requiring a sustained stick click.

Face actions still compete with right-stick aiming. This arrangement prioritizes the current steering and sustained-fire loop; playtests should also cover situations where manual aim matters. Remapping would let players adapt those tradeoffs to their grip.

## Inspiration and what we take from it

These are references for button relationships, not proof that one layout suits every combat game. The applications below are our design judgments.

| Game | Observed controls or behaviour | Application here |
|---|---|---|
| Hades | Cross/A dash, Square/X attack, Triangle/Y special, Circle/B cast. | Keep dash beside the attack used for dash-strikes, and keep the special on Triangle. Our sustained stream goes on R2, while Square handles the heavy blow. |
| Dead Cells | A shield parries through its assigned equipment button; a short press attempts the parry. | Give a defensive tool a direct, stable combat input. Equipment changes what the action does without requiring a different gesture. |
| Hollow Knight: Silksong | Cross/A jump, Square/X attack, Circle/B Bind, R2/RT dash/sprint, R1/RB skill. | Shoulders can carry meaningful abilities and support overlapping actions. Borrow R1 as a dedicated tool input; retain Cross dash here because this game has no platforming jump competing for it. |
| Furi | Its developer describes keeping a single dash input rather than splitting quick and charged dash across two buttons. | Seek depth in timing and encounters, while keeping each action simple to invoke. |

Sources checked on 2026-10-23:

- [Hades controller listing](https://www.blackscreengaming.com/hades/controls/index.php), for the four face-button mappings.
- [Dead Cells: shields](https://deadcells.wiki.gg/wiki/Shields) and [Motion Twin's shield/parry notes](https://deadcells.com/patchnotes/4), for tapping the shield's assigned input to parry.
- [Silksong default controls](https://hollowknight.wiki/w/Controls_%28Silksong%29), for the face-button and shoulder mappings.
- [The Game Bakers on Furi's design decisions](https://www.thegamebakers.com/blog/page/14/), under “Dashing on the release,” for the decision to avoid splitting dash across two inputs.

Silksong also shows why “all timed actions belong on face buttons” is too broad: its dash lives on a trigger. Our rule is to place actions according to comfort, frequency, and which actions must overlap.

## Equipment implications

Keep three independent equipment roles:

| Slot | Input | Examples | Resource |
|---|---|---|---|
| Defensive aux | Circle/B | Parry Emitter, flare, siphon, tether | Existing aux cooldown rules. |
| Special | Triangle/Y | Bomb Bay, EMP, phase, overdrive | Existing special charge. |
| Utility — new | R1/RB | Deployable drone, companion, turret | Its own deployment availability and active-unit state; values still to be designed. |

A ship with the corresponding hardpoints can fit **bomb + parry + drone** simultaneously. They still cost space and load, and empty slots remain possible. The utility should not consume the bomb's charge or replace the defensive aux. Exact utility capacity per frame remains a balancing decision; a new binding alone does not grant every frame every tool.

The existing Sentry Pod is an automatic gun, and SENTINEL is a legendary effect that leaves a turret after a dash. Neither is currently a manually deployed utility. Preserve their existing behaviour unless a separate equipment change explicitly migrates them.

## Implementation and playtest criteria

- Add the utility slot through equipment definitions, frame hardpoints, fitting rules, loot descriptions, and hangar displays.
- Add a separate deploy intent, including a keyboard binding for solo and both shared-keyboard players, buffering, online transport, and neutral/autopilot inputs. R1/RB must no longer fire a heavy.
- Give deployables independent availability, lifecycle, ownership, and active-unit limits. Specify what happens on expiry, owner death, and level end.
- Show the fitted utility and its ready/active/cooldown state in combat and the controls card. Identify the actual button in prompts.
- Verify bomb, parry, and deployment independently on the same build, including co-op. A press should produce one deployment, with no heavy shot or accidental special.
- Playtest sustained fire with dash and parry, dash → heavy, focus with face actions, and deployment while firing. Judge comfort on a physical controller as well as input correctness.

The separate utility system is future implementation work. This document establishes its place in the controls and the reasons for that choice.
