"""KEEP IT TAUT's sheet: the Kestrel pulling, the freighter on the line (whole, holed, and badly
holed, each with its lamp and a lurch), rocks that tumble, dark foreground rocks, and the haven:
the far dock whose light she tows the freighter into.

    just sprites tow
"""
from __future__ import annotations

import math

import ships
from kit import Model, animate, group

TAU = math.pi * 2
ALONG = (-math.pi / 2, 0, 0)    # turns a cylinder (which stands on z) to run along +y

SPRITES = {
    # the Kestrel, three-quarter so her wings read; the game flips her to pull to the left
    "kestrel": dict(kind="ship", view="three_quarter", width=58, clips={"rest": 1, "fly": 4, "pull": 4}),
    # the freighter: tow eye on the left, engines on the right
    **{
        f"freighter_{v}": dict(kind="freighter", variant=v, view={"el": 24, "yaw": 16}, width=104,
                               clips={"rest": 1, "lamp": (f"freighter_{v}_lamp_idle", 4), "lurch": (f"freighter_{v}_lurch", 8)})
        for v in range(3)
    },
    **{f"rock_{v}": dict(kind="rock", variant=v, view="three_quarter", height=h, clips={"tumble": (f"rock_{v}_tumble_idle", 8)})
       for v, h in ((0, 15), (1, 17), (2, 14))},
    "rock_fg": dict(kind="rock", variant=3, view="three_quarter", height=34, edge=0, clips={"tumble": ("rock_3_tumble_idle", 12)}),
    "haven": dict(kind="haven", view={"el": 12, "yaw": 40}, height=120, clips={"rest": 1, "blink": ("haven_blink_idle", 4)}),
}

RUST = "#a8643a"
RUST_L = "#c8804a"
RUST_D = "#6e3a24"
PLATE = "#8a8a94"
DARKS = "#2a2436"
STEEL = "#5e5870"
LAMP = "#ff4a4a"
WARM = "#ffd27a"
FIRE = "#ff8a3a"


def kestrel():
    root = group("ship", kind="ship")
    ships.kestrel(root)
    for pid, c, r in [*ships.START["kestrel"], ("thruster", 1, 4), ("thruster", 3, 4)]:
        x, y = ships.sock(ships.FRAMES["kestrel"], c, r)
        s = group(f"ship_{pid}_{c}_{r}", loc=(x, y, ships.DECK), parent=root)
        ships.PARTS[pid](s, False)
    for o in root.children_recursive:
        if o.name.startswith("thruster_flame"):
            animate(o, "ship_fly_idle", "scale", [(0, (0.3, 1.6, 0.3)), (0.05, (0.1, 3.0, 0.1)), (0.1, (0.4, 2.0, 0.4)),
                                                  (0.15, (0.2, 3.4, 0.2)), (0.2, (0.3, 1.6, 0.3))])
            # pulling hard: long, fat flames
            animate(o, "ship_pull_idle", "scale", [(0, (0.9, 4.5, 0.9)), (0.05, (0.6, 6.5, 0.6)), (0.1, (1.0, 5.0, 1.0)),
                                                   (0.15, (0.7, 7.0, 0.7)), (0.2, (0.9, 4.5, 0.9))])


def freighter(v: int):
    root = group(f"freighter_{v}", kind="freighter", variant=v)
    hull = group(f"freighter_{v}_hull", parent=root)
    m = Model(f"freighter_{v}_body", seed=11 + v)
    R = 1.9
    # three fat tanks with darker ribs between them, the tow end on the left (-y)
    for i, y0 in enumerate((-4.6, -1.0, 2.6)):
        m.cyl(R, 3.3, (0, y0, 0), RUST if i % 2 == 0 else RUST_L, segs=12, rot=ALONG)
        m.cyl(R + 0.16, 0.36, (0, y0 - 0.2, 0), "#4e2a1c", segs=12, rot=ALONG)
        # a band of bare, sun-faded metal along the top of each tank
        m.box((1.1, 3.1, 0.2), (-0.2, y0 + 1.65, R - 0.02), "#e0b07a")
        # plating seams and rust streaks on top
        m.box((0.5, 3.0, 0.12), (0.9, y0 + 1.65, R - 0.05), RUST_D)
        m.box((1.3, 0.5, 0.1), (-0.3, y0 + 2.2, R - 0.02), "#d8955a")
    m.cyl(R + 0.14, 0.32, (0, 5.9, 0), RUST_D, segs=10, rot=ALONG)
    # the nose: a cone down to the tow eye
    m.cyl(R, 1.4, (0, -6.0, 0), RUST_D, segs=10, r_top=0.9, rot=(math.pi / 2, 0, 0))
    m.box((0.5, 0.9, 0.5), (0, -7.6, 0), STEEL)
    m.cyl(0.45, 0.25, (0, -8.05, 0), PLATE, segs=6, rot=ALONG)
    m.cyl(0.22, 0.27, (0, -8.06, 0), DARKS, segs=6, rot=ALONG)
    # stern: engine block and two glowing nozzles
    m.box((3.2, 1.6, 3.0), (0, 6.8, 0), STEEL)
    for x in (-0.9, 0.9):
        m.cyl(0.75, 0.9, (x, 7.5, -0.2), DARKS, segs=8, r_top=0.95, rot=ALONG)
        m.cyl(0.5, 0.2, (x, 8.35, -0.2), FIRE, segs=8, rot=ALONG, glow=True)
    # bridge and windows, aft on top
    m.box((2.2, 2.6, 1.4), (0, 4.8, R + 0.6), PLATE)
    m.box((2.3, 0.3, 0.35), (0, 3.55, R + 0.9), WARM, glow=True)
    m.box((1.8, 1.4, 0.7), (0, 5.2, R + 1.6), "#6e6e7a")
    # pipes along the flank, a walkway, a stubby crane
    m.box((0.28, 10.5, 0.28), (-R + 0.1, 0.4, 0.9), STEEL)
    m.box((0.22, 10.5, 0.22), (-R - 0.05, 0.4, 0.3), "#7a7488")
    m.box((0.6, 9.0, 0.15), (0, -1.2, R + 0.1), "#4a4458")
    m.box((0.25, 0.25, 1.3), (0.6, -3.0, R + 0.6), STEEL)
    m.box((0.2, 1.6, 0.2), (0.6, -3.6, R + 1.2), STEEL, rot=(0.25, 0, 0))
    # portholes along the side, some lit
    for i, y in enumerate((-5.0, -3.6, -1.6, -0.2, 1.8, 3.2)):
        m.cyl(0.22, 0.1, (R - 0.02, y, -0.2), WARM if i % 3 else DARKS, segs=6, rot=(0, math.pi / 2, 0), glow=i % 3 != 0)
    # damage: a holed hull leaks fire light and has plates hanging off
    if v >= 1:
        m.box((0.3, 1.3, 1.0), (R - 0.1, -1.0, 0.6), DARKS)
        m.box((0.25, 0.8, 0.5), (R - 0.02, -1.0, 0.6), FIRE, glow=True)
        m.box((0.12, 1.2, 0.9), (R + 0.35, -0.2, 0.2), PLATE, rot=(0.6, 0.3, 0))
    if v >= 2:
        m.box((0.3, 1.6, 1.2), (R - 0.1, 3.0, -0.5), DARKS)
        m.box((0.25, 1.0, 0.6), (R - 0.02, 3.0, -0.5), "#ffb04a", glow=True)
        m.box((0.9, 1.2, 0.3), (0.3, 1.2, R + 0.05), DARKS)
        m.box((0.6, 0.8, 0.12), (0.6, 1.8, R + 0.55), RUST, rot=(0, 0.9, 0.3))
    m.build(hull)
    # the mast and its lamp: the lamp blinks slowly, and pulses hard in the game before a lurch
    mast = Model(f"freighter_{v}_mast")
    mast.box((0.16, 0.16, 2.2), (0, 0, 1.1), "#8a8098")
    mast.box((0.9, 0.12, 0.12), (0, 0, 1.6), "#8a8098")
    mast.build(hull, loc=(0, 5.6, R + 1.9))
    lamp = Model(f"freighter_{v}_lamp")
    lamp.ball(0.38, (0, 0, 0), LAMP, subdiv=1, glow=True)
    lo = lamp.build(hull, loc=(0, 5.6, R + 4.2))
    animate(lo, f"freighter_{v}_lamp_idle", "scale", [(0, (0, 0, 0)), (0.25, (-0.6, -0.6, -0.6)), (0.5, (0, 0, 0))])
    # the lurch: the hull pitches, kicks back and settles
    animate(hull, f"freighter_{v}_lurch", "rotation_euler",
            [(0, (0, 0, 0)), (0.08, (0.12, 0, 0)), (0.2, (-0.07, 0, 0)), (0.33, (0.03, 0, 0)), (0.45, (0, 0, 0))])


ROCKS = [("#b0a2b0", "#7a6e7e", 1.0), ("#c0a486", "#806a52", 1.2), ("#a2a6c0", "#6a6e88", 0.85), ("#2a2236", "#1c1828", 1.0)]


def rock(v: int):
    a, b, s = ROCKS[v]
    root = group(f"rock_{v}", kind="rock", variant=v)
    m = Model(f"rock_{v}_body", seed=40 + v)
    m.ball(1.0 * s, (0, 0, 0), a, subdiv=1, jitter=0.22, scale=(1.15, 0.9, 0.85))
    m.ball(0.45 * s, (0.5 * s, 0.35 * s, 0.35 * s), b, subdiv=0, jitter=0.08)
    m.ball(0.35 * s, (-0.45 * s, -0.5 * s, 0.2 * s), b, subdiv=0, jitter=0.06)
    body = m.build(root)
    animate(body, f"rock_{v}_tumble_idle", "rotation_euler", [(0, (0, 0, 0)), (1.0, (TAU, TAU / 2, 0))])


def haven():
    root = group("haven", kind="haven")
    m = Model("haven_body", seed=7)
    # a tall dark tower with a lit bay facing right, gantries, and antennae
    m.box((5, 6, 22), (0, 0, 0), "#3a3448")
    m.box((5.4, 1.0, 22.4), (0, -3.2, 0), "#2a2436")
    m.box((4.0, 0.5, 7.0), (0, 3.05, 0), "#ffe6a8", glow=True)
    m.box((4.8, 0.8, 0.6), (0, 3.2, 3.8), "#5a5470")
    m.box((4.8, 0.8, 0.6), (0, 3.2, -3.8), "#5a5470")
    for z in (-9, -6, 6, 9):
        m.box((5.2, 6.2, 0.5), (0, 0, z), "#4a4458")
    for z in (-10.5, -7.5, 7.5, 10.5):
        m.box((0.4, 0.4, 0.4), (0, 3.1, z), "#8affd0", glow=True)
    m.box((0.3, 0.3, 6), (0, -1, 14), "#8a8098")
    m.box((0.3, 0.3, 4), (1.2, 1.5, 13), "#8a8098")
    m.box((2.5, 4, 1.2), (0, 2.5, -12.5), "#2a2436", taper=0.6)
    m.build(root)
    tip = Model("haven_tip")
    tip.ball(0.4, (0, 0, 0), "#ff6a5a", subdiv=0, glow=True)
    t = tip.build(root, loc=(0, -1, 17.2))
    animate(t, "haven_blink_idle", "scale", [(0, (0, 0, 0)), (0.5, (-0.9, -0.9, -0.9)), (1.0, (0, 0, 0))])


def build():
    kestrel()
    for v in range(3):
        freighter(v)
    for v in range(4):
        rock(v)
    haven()
