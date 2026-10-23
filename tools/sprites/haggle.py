"""Sprites for HAGGLE, in Tobbo Grisk's scrap yard: his wings (drawn over the painting, beating
slow when he's soft and buzzing when he isn't), the counter and the brass turntable the part turns
on, the scrap coins you slap down, the other buyer walking up to it, and the powder keg at the
end of his patience.

    just sprites haggle
"""
from __future__ import annotations

import math

from kit import Model, animate, group

FPS = 24

SPRITES = {
    # a wing lies flat, root at the origin, reaching right; the beat turns it about its length
    "wing": dict(kind="tobbo_wing", view="top", width=84, clips={"beat": 8}, margin=1.25, edge=0),
    "counter": dict(kind="counter", view="three_quarter", width=128, clips={"rest": 1}),
    "turntable": dict(kind="turntable", view="three_quarter", width=56, clips={"spin": 12}),
    "coin": dict(kind="coin", view="three_quarter", width=11, clips={"spin": 8}, edge=0, cover=0.4),
    "coin_flat": dict(kind="coin", variant=1, view="three_quarter", width=11, clips={"rest": 1}, edge=0, cover=0.4),
    "buyer": dict(kind="buyer", view="side", height=30, clips={"rest": 1, "walk": 8, "grab": 6}, margin=1.3),
    "keg": dict(kind="keg", view="three_quarter", height=22, clips={"rest": 1}),
}


def keys_each(n, fn):
    """A key on every sampled frame, so the sprite frames land exactly on the values."""
    return [(i / FPS, fn(i / max(1, n - 1))) for i in range(n)]


def loop_keys(n, fn):
    """Keys for an n-frame loop: n + 1 keys, the last one the first again (the renderer drops it)."""
    return [(i / FPS, fn(i / n)) for i in range(n + 1)]


# ------------------------------------------------------------------------------------------------
# Tobbo's wings: big glassy insect wings, veined, a little torn at the tip
# ------------------------------------------------------------------------------------------------

def wing():
    root = group("tobbo_wing", kind="tobbo_wing")
    hinge = group("tobbo_wing_hinge", parent=root)
    m = Model("tobbo_wing_membrane", seed=5)
    L = 5.0
    # the outline, root to tip and back: broad behind, a long rounded tip
    upper = [(0.0, 0.0), (0.3, 0.7), (0.7, 1.6), (0.95, 2.6), (1.0, 3.5), (0.85, 4.3), (0.45, 4.85), (0.0, 5.0)]
    lower = [(-0.2, 4.75), (-0.45, 4.2), (-0.62, 3.2), (-0.65, 2.0), (-0.45, 1.0), (-0.15, 0.3)]
    pts = [(-x, y) for x, y in upper] + [(-x, y) for x, y in lower]
    m.slab(pts[::-1], -0.02, 0.02, "#f2ead6")
    # the veins: fanning out from the root along the wing, a thick one down the leading edge,
    # and a few cross-veins between them, like a dragonfly's
    def vein(x0, y0, x1, y1, r, c="#8a6a40"):
        dx, dy = x1 - x0, y1 - y0
        m.box((r * 2, math.hypot(dx, dy), 0.06), ((x0 + x1) / 2, (y0 + y1) / 2, 0.03), c, rot=(0, 0, -math.atan2(dx, dy)))
    vein(0, 0.0, -0.95, 2.6, 0.08, "#6a4a2a")
    vein(-0.95, 2.6, -0.85, 4.3, 0.06, "#6a4a2a")
    vein(-0.85, 4.3, -0.05, 4.98, 0.05, "#6a4a2a")
    for x1, y1 in ((-0.55, 4.6), (-0.1, 4.75), (0.35, 4.0), (0.62, 2.9), (0.6, 1.6)):
        vein(0, 0.1, x1, y1, 0.035)
    for (x0, y0), (x1, y1) in (((-0.7, 2.2), (-0.3, 2.5)), ((-0.25, 3.2), (0.2, 3.4)), ((0.25, 2.2), (0.55, 2.5)),
                               ((-0.6, 3.6), (-0.4, 3.9)), ((0.1, 4.2), (0.3, 3.9)), ((0.3, 1.4), (0.5, 1.9))):
        vein(x0, y0, x1, y1, 0.03, "#a88a5a")
    # a smoky patch near the tip (a pterostigma), and a sheen of colour in the cells
    m.ball(0.2, (-0.88, 3.9, 0.0), "#7a5a3a", subdiv=1, scale=(1, 1.8, 0.1))
    m.ball(0.42, (-0.3, 3.6, 0.0), "#dce8e0", subdiv=1, scale=(1, 1.6, 0.05))
    m.ball(0.35, (0.25, 2.1, 0.0), "#f0e0c0", subdiv=1, scale=(1, 1.8, 0.05))
    body = m.build(hinge)
    # the beat rolls it about its length (foreshortening it to a sliver and back), swinging a little
    animate(hinge, "tobbo_wing_beat_idle", "rotation_euler",
            loop_keys(8, lambda f: (0, 1.15 * math.sin(f * 2 * math.pi), 0.12 * math.cos(f * 2 * math.pi))))
    return body


# ------------------------------------------------------------------------------------------------
# the counter: planks on scrap, a brass plate on the front for the part's name, a lamp
# ------------------------------------------------------------------------------------------------

def counter():
    root = group("counter", kind="counter")
    m = Model("counter_body", seed=9)
    wood, dark, plate, iron = "#7a5232", "#4a3020", "#c89a48", "#5a5260"
    # the top: three planks, a little uneven
    for i, (y, z) in enumerate(((-0.6, 0.0), (0.0, 0.03), (0.6, -0.02))):
        m.box((0.58, 7.4, 0.22), (y, 0, 1.6 + z), wood if i % 2 == 0 else "#8a6040")
    # the front: a sheet of riveted iron over crates
    m.box((0.12, 7.2, 1.5), (0.95, 0, 0.75), iron)
    m.box((0.14, 7.0, 0.12), (0.97, 0, 1.36), "#7a7080")
    for y in (-3.2, -1.6, 1.6, 3.2):
        for z in (0.25, 1.15):
            m.ball(0.07, (1.02, y, z), "#b8a890", subdiv=0)
    # the name plate, brass, middle of the front
    m.box((0.1, 2.6, 0.6), (1.04, 0, 0.75), plate)
    m.box((0.08, 2.4, 0.46), (1.08, 0, 0.75), "#a8783a")
    # crates showing at the sides, and a lamp on the left end
    m.box((1.6, 1.0, 1.5), (0.1, -3.4, 0.75), dark)
    m.box((1.6, 1.0, 1.5), (0.1, 3.4, 0.75), dark)
    m.cyl(0.22, 0.12, (-0.2, -3.2, 1.7), "#3a2a2a", segs=6)
    m.cyl(0.18, 0.4, (-0.2, -3.2, 1.82), "#ffd27a", segs=6, glow=True)
    m.cyl(0.24, 0.08, (-0.2, -3.2, 2.22), "#b8823a", segs=6)
    # bits of scrap on the top: a spanner, a few bolts
    m.box((0.12, 0.9, 0.06), (-0.4, 2.6, 1.74), "#9a9aa8", rot=(0, 0, 0.5))
    for k, (x, y) in enumerate(((0.3, 2.9), (-0.1, 3.1), (0.45, 2.4))):
        m.cyl(0.08, 0.1, (x, y, 1.72), "#c8b070" if k % 2 else "#8a8a98", segs=6)
    m.build(root)


# ------------------------------------------------------------------------------------------------
# the turntable: a brass disc on a geared drum, turning
# ------------------------------------------------------------------------------------------------

def turntable():
    root = group("turntable", kind="turntable")
    m = Model("turntable_base", seed=4)
    m.cyl(1.3, 0.35, (0, 0, 0), "#4a3a3a", segs=10)
    m.cyl(1.05, 0.25, (0, 0, 0.35), "#7a6a5a", segs=10)
    m.build(root)
    disc = group("turntable_disc", loc=(0, 0, 0.6), parent=root)
    d = Model("turntable_top", seed=6)
    d.cyl(1.55, 0.18, (0, 0, 0), "#c89a48", segs=12)               # the brass rim
    d.cyl(1.3, 0.06, (0, 0, 0.16), "#3e3646", segs=12)              # an iron plate in it
    # brass spokes and bolts on the plate, so you can see it turn
    for k in range(3):
        a = k / 3 * 2 * math.pi
        d.box((0.18, 1.1, 0.05), (math.cos(a) * 0.62, math.sin(a) * 0.62, 0.23), "#e0b060", rot=(0, 0, a - math.pi / 2))
        d.cyl(0.1, 0.08, (math.cos(a + 1.05) * 1.0, math.sin(a + 1.05) * 1.0, 0.2), "#b8a890", segs=6)
    for k in range(12):
        a = k / 12 * 2 * math.pi
        d.box((0.14, 0.14, 0.22), (math.cos(a) * 1.5, math.sin(a) * 1.5, 0.06), "#f0d080" if k % 3 else "#6a4a2a")
    d.cyl(0.25, 0.1, (0, 0, 0.2), "#f0d080", segs=8)
    d.build(disc)
    animate(disc, "turntable_spin_idle", "rotation_euler", loop_keys(12, lambda f: (0, 0, 2 * math.pi * f)))


# ------------------------------------------------------------------------------------------------
# a scrap coin: a stamped disc with a square hole
# ------------------------------------------------------------------------------------------------

def coin(variant: int):
    root = group(f"coin_{variant}", kind="coin", variant=variant)
    turn = group(f"coin_turn_{variant}", parent=root)
    m = Model(f"coin_body_{variant}", seed=2)
    stand = variant == 0
    rot = (0, math.pi / 2, 0) if stand else (0, 0, 0)
    m.cyl(1.0, 0.24, (0, 0, 0) if not stand else (-0.12, 0, 0), "#d8a840", segs=10, rot=rot)
    m.cyl(0.8, 0.28, (0, 0, -0.02) if not stand else (-0.14, 0, 0), "#f0c860", segs=10, rot=rot)
    hole = (0.4, 0.4, 0.34) if not stand else (0.34, 0.4, 0.4)
    m.box(hole, (0, 0, 0.1) if not stand else (0, 0, 0), "#3a2418")
    m.build(turn)
    if stand:
        animate(turn, "coin_spin_idle", "rotation_euler", loop_keys(8, lambda f: (0, 0, 2 * math.pi * f)))


# ------------------------------------------------------------------------------------------------
# the other buyer: a broad hat, a long coat, a pack with a pipe sticking out
# ------------------------------------------------------------------------------------------------

def buyer():
    root = group("buyer", kind="buyer")
    body = group("buyer_body", loc=(0, 0, 1.6), parent=root)
    coat, dark, skin, hat = "#5a6a7a", "#2a2a38", "#c89a78", "#7a4a3a"
    m = Model("buyer_torso", seed=8)
    m.box((0.9, 1.1, 1.9), (0, 0, 0.6), coat, taper=0.75)          # the coat
    m.box((0.95, 1.2, 0.2), (0, 0, -0.3), "#4a5868")
    m.box((0.2, 0.9, 0.16), (0, 0.05, 0.2), "#c8a050")            # a belt
    m.box((0.8, 0.8, 1.2), (0, -0.85, 0.9), "#6a5040")            # the pack
    m.cyl(0.1, 1.1, (0, -1.0, 1.4), "#9a9aa8", segs=6)            # a pipe out of it
    m.ball(0.42, (0, 0.15, 1.9), skin, subdiv=1)                  # the head
    m.box((0.5, 0.3, 0.2), (0, 0.45, 1.75), "#e8d8c8")            # a scarf over the mouth
    m.ball(0.06, (0.18, 0.5, 2.0), "#ffd04a", subdiv=0, glow=True)  # goggles glint
    m.cyl(0.95, 0.12, (0, 0.1, 2.15), hat, segs=10)               # the hat's brim
    m.cyl(0.5, 0.5, (0, 0.05, 2.25), hat, segs=8, r_top=0.42)
    m.box((0.12, 0.6, 0.1), (0, 0.1, 2.32), "#c8a050")            # its band
    m.build(body)
    arm = Model("buyer_arm", seed=1)
    arm.box((0.3, 0.3, 1.2), (0, 0, -0.5), coat)
    arm.ball(0.2, (0, 0, -1.15), skin, subdiv=0)
    a = arm.build(body, loc=(0.5, 0.1, 1.3))
    legs = []
    for s in (1, -1):
        g = Model(f"buyer_leg_{s}", seed=3)
        g.box((0.32, 0.34, 1.3), (0, 0, -0.65), dark)
        g.box((0.36, 0.6, 0.24), (0, 0.15, -1.35), "#3a2a20")       # boot
        legs.append((s, g.build(body, loc=(s * 0.22, 0, -0.3))))
    # walk: legs swinging, the arm against them, a bob
    for s, leg in legs:
        animate(leg, "buyer_walk_idle", "rotation_euler", loop_keys(8, lambda f, s=s: (s * 0.55 * math.sin(f * 2 * math.pi), 0, 0)))
    animate(a, "buyer_walk_idle", "rotation_euler", loop_keys(8, lambda f: (-0.45 * math.sin(f * 2 * math.pi), 0, 0)))
    animate(body, "buyer_walk_idle", "location", loop_keys(8, lambda f: (0, 0, 0.08 * abs(math.cos(f * 2 * math.pi)))))
    # grab: he reaches out and snatches it up
    animate(a, "buyer_grab", "rotation_euler", keys_each(6, lambda f: (-1.9 * math.sin(f * math.pi * 0.75), 0, 0)))
    animate(body, "buyer_grab", "rotation_euler", keys_each(6, lambda f: (0.25 * math.sin(f * math.pi), 0, 0)))


# ------------------------------------------------------------------------------------------------
# the powder keg his patience burns down to
# ------------------------------------------------------------------------------------------------

def keg():
    root = group("keg", kind="keg")
    m = Model("keg_body", seed=12)
    m.cyl(0.8, 0.3, (0, 0, 0), "#6a4428", segs=10, r_top=0.95)
    m.cyl(0.95, 0.9, (0, 0, 0.3), "#7a5030", segs=10)
    m.cyl(0.95, 0.3, (0, 0, 1.2), "#6a4428", segs=10, r_top=0.8)
    for z in (0.15, 0.75, 1.35):
        m.cyl(0.99 if z == 0.75 else 0.9, 0.1, (0, 0, z), "#4a4a58", segs=10)
    m.cyl(0.8, 0.06, (0, 0, 1.5), "#5a3a22", segs=10)
    m.box((0.5, 0.7, 0.4), (0.92, 0, 0.75), "#e8d8b8")             # a label
    m.box((0.1, 0.4, 0.2), (1.18, 0, 0.75), "#c83a2a")
    m.cyl(0.08, 0.25, (0, 0.3, 1.55), "#c8a878", segs=6)          # the fuse's end
    m.build(root)


def build():
    wing()
    counter()
    turntable()
    coin(0)
    coin(1)
    buyer()
    keg()
