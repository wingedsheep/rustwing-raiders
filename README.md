# Rustwing Raiders

A pixel-art space shooter of runs: raids, escorts, events and the odd little game in between.

## Running it

```bash
just install   # once
just serve     # the dev server on http://localhost:5190 (`just dev` rebuilds the models first)
```

`just` on its own lists every recipe.

## Trying the minigames

Events sometimes offer a little game. Each comes at a level from 1 (EASY) to 5 (DEADLY), which the
event rolls, rising through the run. To play one straight away, open:

```
http://localhost:5190/?crew=kestrel&screen=event&ev=<event>&mini&level=<1-5>
```

`&mini` skips the event's talk and goes straight into its game; leave it off to see the event
with its briefing card first. Leave off `&level` to get the level the event would roll.

| Game | `ev=` | Try it at HARD |
|---|---|---|
| Keep It Taut (tow a wreck) | `distress` | [link](http://localhost:5190/?crew=kestrel&screen=event&ev=distress&mini&level=3) |
| Match and Dock | `pod` | [link](http://localhost:5190/?crew=kestrel&screen=event&ev=pod&mini&level=3) |
| Tune In (find the voices) | `signal` | [link](http://localhost:5190/?crew=kestrel&screen=event&ev=signal&mini&level=3) |
| Spoke's Reels (slots) | `dice` | [link](http://localhost:5190/?crew=kestrel&screen=event&ev=dice&mini&level=3) |
| Haggle (with Tobbo) | `tobbo` | [link](http://localhost:5190/?crew=kestrel&screen=event&ev=tobbo&mini&level=3) |
| Shake Them Off (hull leeches) | `leeches` | [link](http://localhost:5190/?crew=kestrel&screen=event&ev=leeches&mini&level=3) |
| Grab and Go (a dark hold) | `derelict` | [link](http://localhost:5190/?crew=kestrel&screen=event&ev=derelict&mini&level=3) |
| Thread It (a minefield) | `minefield` | [link](http://localhost:5190/?crew=kestrel&screen=event&ev=minefield&mini&level=3) |

Some events use the same game too: `tanker` (Keep It Taut), `ghost` (Match and Dock), `relay` and
`calf` (Tune In), `lastride` and `hunter` (Thread It).

Controls: stick, d-pad or arrow keys to move, and one button (Space or Enter on the keyboard).
Reload the page to play again. The games live in `src/screens/minigames/`.
