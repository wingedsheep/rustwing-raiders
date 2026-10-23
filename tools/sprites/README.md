# Minigame sprites from Blender

The minigames (src/screens/minigames) draw on the 640 × 360 UI canvas. For anything nicer than
`fillRect` shapes, model it low-poly in Blender (same kit and style as tools/models, see
tools/models/ART.md) and render it to a sprite sheet here: banded toon light, dark 1-px outline,
whole pixels, transparent background.

    just sprites demo        # render tools/sprites/demo.py, preview at $TMPDIR/sprites-demo.png
    just sprites             # every sheet

Each sheet `<sheet>.py` writes `public/art/minigames/<sheet>.png` (the atlas) and
`src/generated/sprites_<sheet>.json` (frames). The runtime finds every `sprites_*.json` by itself:
nothing to register. Rendering takes ~0.2 s a frame (the demo's 85 frames: ~17 s).

## Writing a sheet

```python
# tools/sprites/crate.py
import ships                      # tools/models is on the path: reuse real models where they exist
from kit import Model, animate, group

SPRITES = {
    # sprite name: what to render. kind = the template's kind (default: the sprite name)
    "crate": dict(view="three_quarter", height=20, clips={"rest": 1, "wobble": 6}),
    "crate_top": dict(kind="crate", view="top", height=16, rotations=8),
}

def build():
    root = group("crate", kind="crate")          # a root at the origin, like tools/models
    m = Model("crate_body")
    m.box((2, 2, 2), (0, 0, 0), "#8a5a32")
    m.box((2.1, 0.3, 2.1), (0, 0, 0), "#ffc24a", glow=True)
    body = m.build(root)
    animate(body, "crate_wobble_idle", "rotation_euler",
            [(0, (0, 0, 0)), (0.25, (0, 0.2, 0)), (0.5, (0, 0, 0))])
```

Per sprite:

- `kind`, `variant`: which template (roots with `kind`, as in tools/models).
- `view`: `"side"` (horizon level), `"three_quarter"` (30° up), `"top"` (straight down), or
  `{"el": degrees_up, "yaw": degrees}`. In every view the model's **+y (its nose) points right**
  on screen.
- Size, one of: `height=` px (the rest pose's height on screen), `width=` px, or `ppu=` pixels a
  unit. Every frame and angle of a sprite shares one scale and one frame size.
- `clips`: `{name: frames}`. `"rest"` is the pose as built. Any other name plays the kit clip
  `<kind>_<name>` or `<kind>_<name>_idle` (or give `(kit_clip_name, frames)`). `_idle` clips loop
  (sampled without the repeated last key); others are one-shots (both ends kept). Default: rest.
- `rotations=N`: N headings, turned about the vertical axis; angle i faces `i * 360/N` degrees
  clockwise from the right, matching canvas angles.
- Optional: `light=(right, up, towards camera)` (defaults: the game's sun for top, upper-left
  for the others), `edge=0.3` (depth jump in units that draws an inner line; 0 turns them off
  and halves the render time), `outline=False`, `cover=0.45` (how much of a pixel must be covered
  to be drawn; lower keeps thin parts), `margin=1.3` (room for clips that reach out of the rest
  pose: raise it if a frame gets clipped).

Tips: colours follow the toon bands, so give neighbouring parts contrasting colours. Details under
about 1.5 px vanish or turn into noise: for a 24-px sprite, make fewer, bigger shapes than the
in-game model has. `glow=True` parts are unlit and full-bright, good for flames, lights, eyes.
Look at the preview (Read the PNG; it is the atlas at 1× and 4×) and iterate.
`SPRITE_KEEP=/some/dir` keeps every raw 4× render, for debugging.

## Drawing one in a game

```ts
import { drawSprite, spriteReady, spriteInfo } from './sprites';

drawSprite(ctx, 'demo', 'ship_side', x, y, { clip: 'fly', t });          // t in seconds picks the frame
drawSprite(ctx, 'demo', 'ship_top', x, y, { angle: heading, clip: 'fly', t });
drawSprite(ctx, 'demo', 'ship_side', x, y, { flipX: true, scale: 2, alpha: 0.5, anchor: 'bottom',
  fallback: () => sideShip(ctx, x, y, 0.5) });                             // until the atlas loads
```

- (x, y) is where the model's origin goes (`anchor`: `'origin'` default, `'center'`, `'bottom'`,
  `'topleft'`). Positions round to whole pixels; keep `scale` whole too.
- `frame` picks a frame directly instead of `t`. `angle` (radians, 0 = right, clockwise) picks
  the nearest rendered heading; no canvas rotation, so pixels stay crisp.
- Atlases load in the background on first use; before that `drawSprite` draws nothing (or calls
  `fallback`) and returns false. `spriteReady(sheet)` says whether it has loaded;
  `spriteInfo(sheet, name)` gives the frame size and origin, for layout.

The demo sheet (`demo.py`): the Kestrel from tools/models/ships.py with its start guns and two
thrusters: `ship_side` (32 px, three-quarter so the flat ship reads) and `ship_top` (24 px tall,
16 headings), each with `rest` and a flickering-flame `fly` clip.
