"""Demo sheet: the player's ship (the Kestrel from tools/models/ships.py, with its start guns and
two thrusters), side-on for Tow and Thread and top-down in 16 headings.

    just sprites demo
"""
from __future__ import annotations

import ships
from kit import animate, group

SPRITES = {
    # Tow and Thread fly it left to right. Truly side-on the Kestrel is a sliver (it is flat), so
    # the camera sits 30 degrees up, and both wings read
    "ship_side": dict(kind="ship", view="three_quarter", width=32, clips={"rest": 1, "fly": 4}),
    # straight down, nose to the right at angle 0, turning clockwise
    "ship_top": dict(kind="ship", view="top", height=24, rotations=16, clips={"rest": 1, "fly": 4}),
}


def build():
    root = group("ship", kind="ship")
    ships.kestrel(root)
    loadout = [*ships.START["kestrel"], ("thruster", 1, 4), ("thruster", 3, 4)]
    for pid, c, r in loadout:
        x, y = ships.sock(ships.FRAMES["kestrel"], c, r)
        s = group(f"ship_{pid}_{c}_{r}", loc=(x, y, ships.DECK), parent=root)
        ships.PARTS[pid](s, False)
    # the thruster flames flicker and stretch: ship_fly_idle
    for o in root.children_recursive:
        if o.name.startswith("thruster_flame"):
            animate(o, "ship_fly_idle", "scale", [(0, (0.3, 1.6, 0.3)), (0.05, (0.1, 3.0, 0.1)),
                                                  (0.1, (0.4, 2.0, 0.4)), (0.15, (0.2, 3.4, 0.2)),
                                                  (0.2, (0.3, 1.6, 0.3))])
