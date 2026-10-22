"""CINDER ORCHARD's set pieces and extra scenery: the company's machinery at the scale
of a landscape. Irrigation booms and aqueducts over the copper orchards, hero trees, a harvester
the size of a barn; pipe racks, distillation columns and tank farms at Refinery Nine; the pipeline
on its trestles through the canyon; a rusting gantry, cooling towers and a sunk tanker on the
tailings lake. Company white, copper and warning orange, violet where the product shows."""
from __future__ import annotations

import math
import random

from mathutils import Vector
from kit import Model, animate, light
from props_b_kit import (M, collider, facet, flicker, jitter, limb, mark, new_faces, paint, path_tube, pulse, ring,
                         root, xform)
from props_b_cinder import (BRONZE, CHEM, CONCRETE, COPPER, FLAME, FRUIT, GLASS, GROW, HAZARD, ORANGE, PAINT, RED,
                            SOOT, STEEL, VERDIGRIS)

RUST = ["#3a2420", "#5a3424", "#7a4a2e", "#9a6a44"]
CHEM_LIGHT = "#e0a0ff"
TOXIC = "#c0ff4a"
LAMP = "#ffd86a"
CAB = "#4ae8ff"
WATER = "#5ab8d0"
OLIVE = ["#3a4220", "#55602c", "#6a7a3a"]


# --- shared bits ---------------------------------------------------------------------------

def _beam(m, a, b, r, col, segs=4):
    return limb(m, a, b, r, r, col, segs=segs)


def _truss(m, x0, x1, y, z0, z1, panel, col, r=0.2, rc=None):
    """A flat truss in the xz plane at `y`: two chords, posts, diagonals that zig-zag."""
    rc = rc or r * 1.4
    _beam(m, (x0, y, z0), (x1, y, z0), rc, col)
    _beam(m, (x0, y, z1), (x1, y, z1), rc, col)
    n = max(1, round((x1 - x0) / panel))
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        _beam(m, (x, y, z0), (x, y, z1), r, col)
        if i < n:
            xn = x0 + (x1 - x0) * (i + 1) / n
            a, b = ((x, z0), (xn, z1)) if i % 2 else ((x, z1), (xn, z0))
            _beam(m, (a[0], y, a[1]), (b[0], y, b[1]), r * 0.8, col)


def _tower(m, x, y, z0, z1, w, col, brace=3.5, r=0.22):
    """A square lattice tower: four posts and cross-bracing."""
    cs = [(x + sx * w / 2, y + sy * w / 2) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for cx, cy in cs:
        _beam(m, (cx, cy, z0), (cx, cy, z1), r * 1.3, col)
    n = max(1, round((z1 - z0) / brace))
    for i in range(n):
        za = z0 + (z1 - z0) * i / n
        zb = z0 + (z1 - z0) * (i + 1) / n
        for k in range(4):
            (ax, ay), (bx, by) = cs[k], cs[(k + 1) % 4]
            _beam(m, (ax, ay, za), (bx, by, zb), r * 0.8, col)
            _beam(m, (ax, ay, zb), (bx, by, zb), r * 0.8, col)


def _sag(a, b, sag, n=6):
    a, b = Vector(a), Vector(b)
    return [a.lerp(b, i / n) - Vector((0, 0, sag * math.sin(math.pi * i / n))) for i in range(n + 1)]


def _hose(m, a, b, sag, r, col, n=6):
    pts = _sag(a, b, sag, n)
    return path_tube(m, pts, [r] * len(pts), col, segs=5)


def _chain(m, top, length, col, link=0.5):
    x, y, z = top
    n = max(1, int(length / link))
    for i in range(n):
        m.box((0.28, 0.12, link * 0.9) if i % 2 else (0.12, 0.28, link * 0.9), (x, y, z - link * (i + 0.5)), col)


def _pipe_x(m, x0, x1, y, z, r, cols, flanges=8.0, segs=8, flange_col=None):
    """A pipe along x, faceted, with flange collars every `flanges` units."""
    st = mark(m)
    m.cyl(r, x1 - x0, (x0, y, z), cols[1], segs=segs, rot=(0, math.pi / 2, 0))
    facet(m, new_faces(m, st), cols[:3], noise=0.05, bias=-0.15)
    if flanges:
        n = max(1, int((x1 - x0) / flanges))
        for i in range(1, n + 1):
            xx = x0 + (x1 - x0) * i / (n + 1)
            m.cyl(r + 0.16, 0.4, (xx - 0.2, y, z), flange_col or STEEL[0], segs=segs, rot=(0, math.pi / 2, 0))


def _pad(m, x, y, rad, z0=-3.0, z1=0.4, col=CONCRETE[1]):
    st = mark(m)
    m.cyl(rad, z1 - z0, (x, y, z0), col, segs=7, r_top=rad * 0.85)
    facet(m, new_faces(m, st), CONCRETE, noise=0.06)


def _crown(m, rng, c, rad, squash=0.6, lobes=5, fruit=14):
    """A copper tree's crown: a faceted mass of beaten-metal lobes, verdigris here and there, fruit."""
    st = mark(m)
    m.ball(rad, c, COPPER[2], subdiv=1, scale=(1, 1, squash), jitter=rad * 0.08)
    for k in range(lobes):
        a = k / lobes * math.tau + rng.uniform(-0.3, 0.3)
        d = rad * rng.uniform(0.7, 0.95)
        m.ball(rad * rng.uniform(0.45, 0.6), (c[0] + math.cos(a) * d, c[1] + math.sin(a) * d,
                                              c[2] + rng.uniform(-0.2, 0.25) * rad * squash),
               COPPER[2], subdiv=1, scale=(1, 1, squash * 1.1), jitter=rad * 0.06)
    faces = new_faces(m, st)
    facet(m, faces, COPPER[:4], noise=0.2, bias=-0.15)
    vg = [m._slot(c_, False) for c_ in VERDIGRIS]
    for f in faces:
        if rng.random() < 0.06:
            f.material_index = vg[1] if f.normal.z > 0.3 else vg[0]
    for _ in range(fruit):
        th = rng.uniform(0, math.tau)
        ph = rng.uniform(-0.1, 1.0)
        d = Vector((math.cos(th) * math.cos(ph), math.sin(th) * math.cos(ph), math.sin(ph) * squash))
        p = Vector(c) + d * rad * rng.uniform(1.0, 1.25)
        m.ball(rng.uniform(0.32, 0.45), tuple(p), FRUIT, subdiv=0, glow=True)


# --- the Copper Orchards ---------------------------------------------------------------------

def irrigator(v):
    """SPAN. v0: a centre-pivot irrigation boom, a white truss on wheeled towers, nozzles weeping
    violet feed. v1: an aqueduct, a copper trough on concrete piers, one in the middle."""
    r = root("cinder_irrigator", v)
    rng = random.Random(3000 + v)
    m = Model(f"cinder_irrigator_{v}", 3000 + v)
    if v == 0:
        z0, z1, L = 13.8, 16.6, 49.0
        for y in (-2.0, 2.0):
            _beam(m, (-L, y, z0), (L, y, z0), 0.3, PAINT[2])
        _beam(m, (-L, 0, z1), (L, 0, z1), 0.3, PAINT[3])
        n = 28
        for i in range(n + 1):
            x = -L + 2 * L * i / n
            for y in (-2.0, 2.0):
                _beam(m, (x, y, z0), (x, 0, z1), 0.2, PAINT[1])
            _beam(m, (x, -2.0, z0), (x, 2.0, z0), 0.2, PAINT[1])
            if i % 4 == 2:                                                     # orange marker bands
                m.box((0.6, 4.4, 0.6), (x, 0, z0), ORANGE)
        m.box((2 * L, 0.9, 0.15), (0, -1.0, z0 + 0.9), STEEL[1])               # a walkway along it
        _pipe_x(m, -L, L, 0, z0 + 0.1, 0.5, COPPER[1:], flanges=7.0)
        # the bowstring: tension rods arching over each half
        for s in (-1, 1):
            pts = [Vector((s * (2 + 40 * t), 0, z1 + 3.6 * math.sin(math.pi * t))) for t in (i / 8 for i in range(9))]
            path_tube(m, pts, [0.2] * 9, STEEL[2], segs=4)
            for p in pts[1:-1]:
                _beam(m, (p.x, 0, z1), tuple(p), 0.13, STEEL[2])
        # nozzles hanging off the feed pipe, dripping violet
        for i in range(24):
            x = -L + 2 + i * (2 * L - 4) / 23
            _beam(m, (x, 0, z0), (x, 0, z0 - 0.6), 0.12, STEEL[1])
            m.cyl(0.55, 0.22, (x, 0, z0 - 0.82), FRUIT if i % 2 else CHEM_LIGHT, segs=6, r_top=0.15, glow=True)
        # the towers, on fat tyres
        for s in (-1, 1):
            x = s * 42
            for y in (-3.0, 3.0):
                _beam(m, (x, y, 1.6), (x, 0, z0), 0.32, PAINT[2])
            _beam(m, (x, -3.0, 1.6), (x, 3.0, 1.6), 0.32, PAINT[2])
            m.box((2.4, 1.6, 1.6), (x, 0, 10.6), ORANGE)                       # the drive box
            m.box((2.6, 1.8, 0.3), (x, 0, 11.5), PAINT[3])
            for y in (-3.0, 3.0):
                st = mark(m)
                m.cyl(1.6, 1.1, (x - 0.55, y, 1.6), SOOT, segs=10, rot=(0, math.pi / 2, 0))
                m.cyl(0.8, 1.2, (x - 0.6, y, 1.6), ORANGE, segs=6, rot=(0, math.pi / 2, 0))
                for k in range(10):                                            # tread lugs
                    a = k / 10 * math.tau
                    m.box((1.2, 0.35, 0.3), (x, y + math.cos(a) * 1.6, 1.6 + math.sin(a) * 1.6), STEEL[0], rot=(a, 0, 0))
            _beam(m, (x, 0, -3), (x, 0, 1.6), 0.6, CONCRETE[1])
            m.ball(0.5, (x, 0, z1 + 0.6), RED, subdiv=0, glow=True)
            collider(r, x, 0, 3.4)
        # end guns: the long throw at each end
        for s in (-1, 1):
            limb(m, (s * L, 0, z0 + 0.2), (s * (L + 2.5), 0, z0 + 1.6), 0.3, 0.2, COPPER[2], segs=5)
            m.ball(0.45, (s * (L + 2.6), 0, z0 + 1.7), FRUIT, subdiv=0, glow=True)
    else:
        z0, L = 14.0, 50.0
        piers = (-42.0, 0.0, 42.0)
        for x in piers:
            w = 3.6 if x else 4.4
            st = mark(m)
            m.box((w, 3.2, z0 + 3), (x, 0, (z0 - 3) / 2), PAINT[2], taper=0.82)
            facet(m, new_faces(m, st), PAINT, noise=0.03)
            m.box((w + 0.4, 3.6, 0.6), (x, 0, 4.0), ORANGE)
            m.box((w * 0.5, 0.2, 2.0), (x, -1.65, 7.5), "#2a2a2e")            # a dark service door slot
            m.box((w * 0.3, 0.12, 0.4), (x, -1.72, 9.0), LAMP, glow=True)
            collider(r, x, 0, w * 0.6)
        # arches between the piers (springing above the flight line)
        for a, b in ((-42, 0), (0, 42)):
            n = 10
            for i in range(n):
                t0, t1 = i / n, (i + 1) / n
                xa, xb = a + 2 + (b - a - 4) * t0, a + 2 + (b - a - 4) * t1
                za = z0 - 0.6 + 1.6 * math.sin(math.pi * t0) * 0 + (1 - math.sin(math.pi * t0)) * -0.4
                zb = z0 - 0.6 + (1 - math.sin(math.pi * t1)) * -0.4
                m.box((xb - xa + 0.05, 2.8, 0.9), ((xa + xb) / 2, 0, (za + zb) / 2), PAINT[1],
                      rot=(0, -math.atan2(zb - za, xb - xa), 0))
        # the deck and trough
        st = mark(m)
        m.box((2 * L, 3.4, 1.2), (0, 0, z0 + 1.0), PAINT[2])
        facet(m, new_faces(m, st), PAINT, noise=0.03)
        for y in (-1.45, 1.45):
            st = mark(m)
            m.box((2 * L, 0.5, 1.1), (0, y, z0 + 2.1), COPPER[2])
            facet(m, new_faces(m, st), COPPER, noise=0.06)
        m.box((2 * L, 2.4, 0.2), (0, 0, z0 + 1.9), WATER, glow=True)
        for i in range(-12, 13):                                                # rivet straps over the trough
            if i % 3 == 0:
                m.box((0.4, 3.6, 0.3), (i * 3.8, 0, z0 + 2.7), COPPER[3])
        # sluices: water spilling off the side in thin curtains, stopping above the ship
        for x in (-22, 21):
            m.box((2.2, 0.2, 1.6), (x, -1.9, z0 + 0.5), WATER, glow=True)
            m.box((1.6, 0.6, 0.6), (x, -1.9, z0 + 2.3), STEEL[1])
            m.ball(0.5, (x, -2.0, z0 - 0.55), "#a8f0ff", subdiv=0, glow=True)
        # verdigris streaks down the piers
        for x in piers:
            m.box((0.5, 0.15, 6.0), (x + 0.7, -1.62, 9.5), VERDIGRIS[1])
            m.box((0.4, 0.15, 4.0), (x - 0.9, -1.62, 10.5), VERDIGRIS[0])
        # the cascade where it begins and ends
        for s in (-1, 1):
            m.box((3.0, 4.6, 2.0), (s * (L - 1.5), 0, z0 + 2.4), CONCRETE[1])
    m.build(r)
    return r


def grove_gate(v):
    """GATE. Hero copper trees, the company's prize specimens, trunks a ship can just slip between;
    their crowns meet overhead. v1 is trained along a copper trellis with fruit lamps hung off it."""
    r = root("cinder_grove_gate", v)
    rng = random.Random(3020 + v)
    m = Model(f"cinder_grove_gate_{v}", 3020 + v)
    if v == 0:
        trees = [(-15.5, 0.5, 1.5, 19.0), (-5.0, -1.0, 1.7, 22.0), (5.5, 0.8, 1.6, 20.0), (15.0, -0.6, 1.4, 17.5)]
    else:
        trees = [(-11.0, 0.0, 1.9, 21.0), (0.0, 1.2, 1.7, 18.5), (11.0, -0.5, 1.9, 22.0)]
    for x, y, rad, h in trees:
        st = mark(m)
        lean = (rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6))
        pts = [Vector((x, y, -2.5)), Vector((x, y, 3)), Vector((x + lean[0] * 0.3, y + lean[1] * 0.3, 9)),
               Vector((x + lean[0], y + lean[1], h - 3))]
        path_tube(m, pts, [rad * 1.5, rad * 1.05, rad, rad * 0.7], BRONZE[1], segs=7)
        for k in range(5):                                                       # buttress roots
            a = k / 5 * math.tau + rng.uniform(-0.3, 0.3)
            limb(m, (x, y, 2.6), (x + math.cos(a) * rad * 2.6, y + math.sin(a) * rad * 2.6, -0.6), rad * 0.5, rad * 0.25,
                 BRONZE[1], segs=5)
        top = pts[-1]
        for k in range(4):                                                       # boughs into the crown
            a = k / 4 * math.tau + rng.uniform(0, 1)
            limb(m, tuple(top - Vector((0, 0, 1.5))), (top.x + math.cos(a) * 4, top.y + math.sin(a) * 4, h - 0.5),
                 rad * 0.45, rad * 0.25, BRONZE[1], segs=5)
        facet(m, new_faces(m, st), BRONZE, noise=0.1)
        m.cyl(rad * 1.6, 0.9, (x, y, 0.2), STEEL[1], segs=8)                     # the company collar
        m.cyl(rad * 1.65, 0.35, (x, y, 1.1), ORANGE, segs=8)
        m.box((0.9, 0.12, 0.6), (x, y - rad * 1.62, 0.7), PAINT[3])               # an asset tag
        for z in (4.5, 7.5):
            m.cyl(rad * 1.04, 0.35, (x + lean[0] * (z / h) * 0.4, y + lean[1] * (z / h) * 0.4, z), COPPER[3], segs=7)
        _crown(m, rng, (top.x, top.y, h), rng.uniform(5.2, 6.2), squash=0.45, lobes=6, fruit=16)
        collider(r, round(x, 2), round(y, 2), round(rad * 1.1, 2))
    if v == 1:
        # the trellis: a copper beam from trunk to trunk above the flight line, lamps hung off it
        z = 14.2
        for (xa, ya, _, _), (xb, yb, _, _) in zip(trees, trees[1:]):
            st = mark(m)
            _beam(m, (xa, ya, z), (xb, yb, z), 0.4, COPPER[2])
            _beam(m, (xa, ya, z + 1.6), (xb, yb, z + 1.6), 0.3, COPPER[2])
            for t in (0.25, 0.5, 0.75):
                px, py = xa + (xb - xa) * t, ya + (yb - ya) * t
                _beam(m, (px, py, z), (px, py, z + 1.6), 0.2, COPPER[1])
                _beam(m, (px, py, z), (px, py, z - 0.7), 0.1, STEEL[1])
                m.ball(0.55, (px, py, z - 1.0), FRUIT, subdiv=1, glow=True)
            facet(m, new_faces(m, st), COPPER, noise=0.08)
        light(r, (0, 0, 13), FRUIT, radius=10, intensity=0.8, halo=False)
    m.build(r)
    return r


def harvester(v):
    """GIANT. The company harvester: a white barn on tracks, a copper reel at the front shaking fruit
    out of the trees, its hopper heaped with violet, the cab lit cyan. The reel turns."""
    r = root("cinder_harvester", v)
    rng = random.Random(3040 + v)
    m = Model(f"cinder_harvester_{v}", 3040 + v)
    L, W = 30.0, 13.0
    # tracks
    for s in (-1, 1):
        st = mark(m)
        m.box((3.2, L - 4, 2.6), (s * (W / 2 - 0.6), -1, 1.3), SOOT)
        for i in range(16):
            m.box((3.4, 0.5, 0.3), (s * (W / 2 - 0.6), -L / 2 + 2 + i * (L - 6) / 15, 2.7), STEEL[1])
        for y in (-L / 2 + 3, -1, L / 2 - 5):
            m.cyl(1.2, 3.4, (s * (W / 2 - 0.6) - 1.7, y, 1.3), STEEL[2], segs=8, rot=(0, math.pi / 2, 0))
    # the body: a long white hull, stepped
    st = mark(m)
    m.box((W - 2.4, L - 6, 3.6), (0, -1.5, 4.3), PAINT[2])
    m.box((W - 3.6, 10, 1.6), (0, -4, 6.9), PAINT[2])
    facet(m, new_faces(m, st), PAINT, noise=0.03)
    for s in (-1, 1):
        m.box((0.2, L - 6.4, 0.8), (s * (W / 2 - 1.25), -1.5, 4.6), ORANGE)            # the stripe
        for i in range(5):
            m.box((0.25, 1.4, 0.7), (s * (W / 2 - 1.25), -10 + i * 4.2, 3.2), HAZARD if i % 2 else SOOT)
    # roof plates, vents, the company V
    for i in range(4):
        m.box((W - 3.4, 0.25, 0.1), (0, -12 + i * 2.6, 6.15), PAINT[0])
    for x in (-3.0, 3.0):
        m.box((2.2, 2.2, 0.5), (x, -2.0, 7.9), STEEL[1])
        m.cyl(0.8, 0.12, (x, -2.0, 8.15), SOOT, segs=8)
    st = mark(m)
    m.prism([(-1.7, 1.0), (-1.0, 1.0), (0, -0.9), (1.0, 1.0), (1.7, 1.0), (0, -2.0)], 0.12, (0, 0, 0), ORANGE)
    xform(m, st, M((0, -5.6, 7.76), (math.pi / 2, 0, 0), (1.3, 1.3, 1.3)))
    # the hopper, heaped with fruit
    m.box((W - 3.0, 9.0, 0.4), (0, 5.6, 6.3), STEEL[1])
    for s in (-1, 1):
        m.box((0.5, 9.0, 1.6), (s * (W / 2 - 1.6), 5.6, 7.1), PAINT[1])
    for s in (-1, 1):
        m.box((W - 3.0, 0.5, 1.6), (0, 5.6 + s * 4.3, 7.1), PAINT[1])
    for _ in range(46):
        m.ball(rng.uniform(0.4, 0.6), (rng.uniform(-W / 2 + 2.4, W / 2 - 2.4), 5.6 + rng.uniform(-3.8, 3.8),
                                       6.7 + rng.uniform(0, 0.8)), FRUIT if rng.random() < 0.8 else CHEM_LIGHT, subdiv=0,
               glow=True)
    # the cab at the front, glass glowing cyan
    st = mark(m)
    m.box((5.0, 4.0, 2.4), (-2.6, -11.5, 7.0), PAINT[3])
    facet(m, new_faces(m, st), PAINT, noise=0.03)
    m.box((4.6, 0.2, 1.4), (-2.6, -13.55, 7.2), CAB, glow=True)
    m.box((0.2, 3.0, 1.2), (-5.15, -11.5, 7.2), CAB, glow=True)
    m.box((5.4, 4.4, 0.3), (-2.6, -11.5, 8.35), ORANGE)
    m.ball(0.35, (-1.0, -10.5, 8.6), RED, subdiv=0, glow=True)
    m.ball(0.35, (-4.2, -10.5, 8.6), HAZARD, subdiv=0, glow=True)
    # exhaust stacks, a radiator grille
    for x in (3.6, 4.6):
        m.cyl(0.35, 2.0, (x, -9.0, 6.0), STEEL[1], segs=6)
        m.cyl(0.4, 0.3, (x, -9.0, 8.0), SOOT, segs=6)
    m.box((4.0, 0.2, 2.2), (2.6, L / 2 - 2.9, 4.3), STEEL[0])
    # the unloading auger, swung out to the side
    st = mark(m)
    limb(m, (W / 2 - 2, 8.5, 6.6), (W / 2 + 9, 8.5, 8.0), 0.7, 0.6, ORANGE, segs=7)
    limb(m, (W / 2 + 9, 8.5, 8.0), (W / 2 + 9.6, 8.5, 7.0), 0.6, 0.5, ORANGE, segs=7)
    m.cyl(0.5, 0.2, (W / 2 + 9.6, 8.5, 6.8), FRUIT, segs=7, glow=True)
    # the reel: header frame, then the drum as its own part so it can turn
    m.box((W + 6, 2.2, 1.0), (0, -L / 2 - 1.2, 2.0), PAINT[1])
    for s in (-1, 1):
        m.box((1.0, 5.4, 4.2), (s * (W / 2 + 2.6), -L / 2 - 2.6, 3.2), ORANGE)
        m.box((1.0, 3.0, 1.0), (s * (W / 2 + 2.6), -L / 2 + 0.6, 4.6), PAINT[1])
    for i in range(14):                                                                  # header teeth
        m.cyl(0.25, 1.8, (-W / 2 - 1.5 + i * (W + 3) / 13, -L / 2 - 2.3, 1.4), COPPER[3], segs=4, r_top=0.05,
              rot=(math.pi / 2, 0, 0))
    m.build(r)
    d = Model(f"cinder_harvester_{v}_reel", 3045)
    st = mark(d)
    d.cyl(1.3, W + 3.6, (-(W + 3.6) / 2, 0, 0), COPPER[2], segs=8, rot=(0, math.pi / 2, 0))
    facet(d, new_faces(d, st), COPPER, noise=0.05)
    for k in range(6):
        a = k / 6 * math.tau
        st = mark(d)
        d.box((W + 3.2, 0.4, 1.4), (0, math.cos(a) * 2.0, math.sin(a) * 2.0), COPPER[1], rot=(a, 0, 0))
        facet(d, new_faces(d, st), COPPER[:3], noise=0.05)
    for x in (-W / 2 - 1.4, W / 2 + 1.4):
        d.cyl(2.7, 0.4, (x - 0.2, 0, 0), STEEL[1], segs=8, rot=(0, math.pi / 2, 0))
    o = d.build(r, loc=(0, -L / 2 - 3.2, 4.0))
    animate(o, f"cinder_harvester_{v}_reel_idle", "rotation_euler",
            [(0, (0, 0, 0)), (1.5, (-math.pi, 0, 0)), (3.0, (-math.tau, 0, 0))])
    light(r, (-2.6, -13.8, 7.2), CAB, radius=6, intensity=0.7, halo=False)
    return r


def sapling_row(v):
    """A row of company saplings in steel planters, on a drip line."""
    r = root("cinder_sapling_row", v)
    rng = random.Random(3100 + v)
    m = Model(f"cinder_sapling_row_{v}", 3100 + v)
    n = 5 if v == 0 else 4
    gap = 1.7
    L = gap * (n - 1)
    _beam(m, (0, -L / 2 - 0.8, 0.25), (0, L / 2 + 0.8, 0.25), 0.12, STEEL[1])
    for i in range(n):
        y = -L / 2 + i * gap
        m.cyl(0.5, 0.5, (0, y, 0), STEEL[1], segs=6)
        m.cyl(0.52, 0.12, (0, y, 0.45), COPPER[3], segs=6)
        h = rng.uniform(1.0, 1.6) if v == 0 else rng.uniform(0.7, 1.0)
        limb(m, (0, y, 0.4), (0, y, 0.4 + h), 0.1, 0.07, BRONZE[1], segs=4)
        st = mark(m)
        if v == 0:
            m.ball(0.75, (0, y, 0.9 + h), COPPER[2], subdiv=1, scale=(1, 1, 0.8), jitter=0.06)
        else:
            m.cyl(0.8, 0.8, (0, y, 0.5 + h), COPPER[2], segs=6, r_top=0.15)
        facet(m, new_faces(m, st), COPPER[:4], noise=0.15)
        if rng.random() < 0.5:
            m.ball(0.2, (0.5, y, 0.9 + h), FRUIT, subdiv=0, glow=True)
        m.box((0.3, 0.1, 0.2), (0.52, y, 0.25), "#7aff9a" if i % 2 else RED, glow=True)    # moisture tags
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


# --- Refinery Nine -------------------------------------------------------------------------

PIPES = [COPPER[1:], PAINT, STEEL, [ORANGE, ORANGE, "#f09a4a"], COPPER[1:], [VERDIGRIS[0], VERDIGRIS[1], VERDIGRIS[2]]]


def pipe_rack(v):
    """SPAN. v0: a pipe rack across the works, six lines on steel bents, valves and elbows hanging off
    the bottom, a lit catwalk on top. v1: a catwalk bridge on a lattice tower in the middle, hoses
    slung under it, lamps along the rail."""
    r = root("cinder_pipe_rack", v)
    rng = random.Random(3200 + v)
    m = Model(f"cinder_pipe_rack_{v}", 3200 + v)
    L = 48.0
    if v == 0:
        z0 = 14.0
        bents = (-42.0, 42.0)
        for x in bents:
            for y in (-3.6, 3.6):
                _beam(m, (x, y, -3), (x, y, z0 + 3.2), 0.45, HAZARD)
            for z in (z0 - 0.4, z0 + 2.8):
                _beam(m, (x, -3.8, z), (x, 3.8, z), 0.35, HAZARD)
            _beam(m, (x, -3.6, 2), (x, 3.6, z0 - 0.4), 0.22, STEEL[1])
            _beam(m, (x, 3.6, 2), (x, -3.6, z0 - 0.4), 0.22, STEEL[1])
            m.box((2.0, 9.0, 0.8), (x, 0, -0.2), CONCRETE[1])
            collider(r, x, 0, 4.2)
        # the longitudinal stringers, and the lines on two tiers
        for y in (-3.6, 3.6):
            _beam(m, (-L, y, z0 - 0.4), (L, y, z0 - 0.4), 0.3, STEEL[1])
            _beam(m, (-L, y, z0 + 2.8), (L, y, z0 + 2.8), 0.3, STEEL[1])
        for k, (y, z, rad) in enumerate(((-2.4, z0 + 0.4, 0.75), (-0.6, z0 + 0.5, 0.85), (1.3, z0 + 0.35, 0.65),
                                         (2.8, z0 + 0.3, 0.5), (-1.8, z0 + 3.5, 0.55), (1.0, z0 + 3.6, 0.65))):
            _pipe_x(m, -L - 2, L + 2, y, z, rad, PIPES[k], flanges=9.0)
        for x in range(-40, 41, 8):                                                     # cross-members
            _beam(m, (x, -3.6, z0 - 0.4), (x, 3.6, z0 - 0.4), 0.2, STEEL[1])
        # what hangs under it: valve bodies, drops into nowhere, a glowing sight glass
        for x, y in ((-28, -2.4), (-9, -0.6), (14, 1.3), (31, -2.4)):
            m.box((1.4, 1.4, 1.0), (x, y, z0 - 0.5), RED)
            m.cyl(0.25, 0.4, (x, y, z0 - 1.0), STEEL[1], segs=5)
        for x in (-19, 6, 24):
            m.box((0.7, 0.7, 0.35), (x, 2.8, z0 - 0.15), CHEM, glow=True)
        # the catwalk on top, lamps every so often
        m.box((2 * L, 1.4, 0.18), (0, 2.8, z0 + 4.4), STEEL[2])
        _beam(m, (-L, 3.5, z0 + 5.3), (L, 3.5, z0 + 5.3), 0.1, HAZARD)
        for x in range(-44, 45, 11):
            _beam(m, (x, 3.5, z0 + 4.4), (x, 3.5, z0 + 5.6), 0.1, STEEL[1])
            m.ball(0.35, (x, 3.5, z0 + 5.8), LAMP, subdiv=0, glow=True)
        # risers: at each bent some lines turn down to the ground
        for x in bents:
            s_ = 1 if x > 0 else -1
            limb(m, (x + s_ * 1.5, -0.6, z0 + 0.5), (x + s_ * 1.5, -0.6, -2), 0.85, 0.85, PAINT[2], segs=8)
            m.ball(0.9, (x + s_ * 1.5, -0.6, z0 + 0.5), PAINT[1], subdiv=1)
    else:
        z0 = 14.2
        for x in (-41.0, 0.0, 41.0):
            w = 3.6 if x else 3.0
            _tower(m, x, 0, -3, z0, w, STEEL[2], brace=3.4, r=0.24)
            m.box((w + 1.2, w + 1.2, 0.6), (x, 0, -0.2), CONCRETE[1])
            m.box((w + 0.4, w + 0.4, 0.5), (x, 0, z0 - 0.2), HAZARD)
            collider(r, x, 0, w * 0.75)
        # the walk: grating, two rails, toe-boards in hazard yellow
        st = mark(m)
        m.box((2 * L, 3.0, 0.3), (0, 0, z0 + 0.3), STEEL[1])
        facet(m, new_faces(m, st), STEEL, noise=0.04)
        for i in range(-24, 25):
            m.box((0.12, 2.8, 0.06), (i * 2.0, 0, z0 + 0.48), STEEL[0])
        for y in (-1.5, 1.5):
            _beam(m, (-L, y, z0 + 1.5), (L, y, z0 + 1.5), 0.12, HAZARD)
            m.box((2 * L, 0.12, 0.35), (0, y, z0 + 0.6), HAZARD)
            for x in range(-46, 47, 4):
                _beam(m, (x, y, z0 + 0.4), (x, y, z0 + 1.5), 0.09, STEEL[2])
        # a line along the side of it, hoses slung between the towers, sagging but never low
        _pipe_x(m, -L, L, -2.2, z0 + 0.1, 0.55, COPPER[1:], flanges=10.0)
        for a, b, sag, col in ((-40, -2, 0.7, SOOT), (2, 40, 0.8, SOOT), (-38, 38, 0.95, ORANGE)):
            y = 2.0 if col == SOOT else 2.6
            _hose(m, (a, y, z0), (b, y, z0), sag, 0.3, col, n=10)
        for x in (-30, -15, 15, 30):                                              # lamps under it
            _beam(m, (x, -1.5, z0 + 0.1), (x, -1.5, z0 - 0.5), 0.08, STEEL[1])
            m.box((0.9, 0.5, 0.25), (x, -1.5, z0 - 0.6), LAMP, glow=True)
        m.box((3.0, 2.6, 2.0), (-24, 0.3, z0 + 1.5), PAINT[2])                      # a little control hut
        m.box((3.2, 2.8, 0.25), (-24, 0.3, z0 + 2.6), ORANGE)
        m.box((1.2, 0.1, 0.6), (-24, -1.0, z0 + 1.6), CAB, glow=True)
    m.build(r)
    return r


def columns(v):
    """GATE. v0: distillation columns, white and banded, with catwalks joining them overhead and a
    flare roaring on the tallest. v1: a cluster of flare stacks in lattice towers."""
    r = root("cinder_columns", v)
    rng = random.Random(3220 + v)
    m = Model(f"cinder_columns_{v}", 3220 + v)
    flares = []
    if v == 0:
        cols = [(-15.5, 0.0, 2.2, 20.0, PAINT), (-4.0, 1.2, 2.6, 26.0, PAINT), (8.0, -0.6, 2.0, 18.0, COPPER[1:]),
                (17.5, 0.8, 1.6, 22.0, PAINT)]
        for x, y, rad, h, pal in cols:
            st = mark(m)
            m.cyl(rad, h, (x, y, -2.5), pal[1], segs=10)
            facet(m, new_faces(m, st), pal[:3], noise=0.04)
            m.ball(rad, (x, y, h - 2.5), pal[2], subdiv=1, scale=(1, 1, 0.5))
            for z in (3.0, h - 6):
                m.cyl(rad + 0.05, 0.6, (x, y, z), ORANGE if pal is PAINT else STEEL[0], segs=10)
            for z in (15.0, h - 3.5):                                                 # ring platforms
                ring(m, rad + 0.6, 0.9, z, STEEL[1], n=10, h=0.2, loc=(x, y))
                ring(m, rad + 1.0, 0.12, z + 1.0, HAZARD, n=10, h=0.12, loc=(x, y))
            m.box((0.5, 0.25, h - 6), (x + rad * 0.7, y - rad * 0.75, h / 2 - 1), STEEL[0])  # ladder cage
            m.ball(0.4, (x, y, h - 1.4), RED, subdiv=0, glow=True)
            collider(r, x, y, rad + 0.3)
        # catwalks between them, overhead, and a fat transfer line
        for (xa, ya, ra, _, _), (xb, yb, rb, _, _) in zip(cols, cols[1:]):
            m.box((xb - xa - ra - rb, 1.4, 0.25), ((xa + ra + xb - rb) / 2, (ya + yb) / 2, 15.0), STEEL[2])
            _beam(m, (xa + ra, (ya + yb) / 2 + 0.7, 16.0), (xb - rb, (ya + yb) / 2 + 0.7, 16.0), 0.1, HAZARD)
            limb(m, (xa, ya - ra, 18.5), (xb, yb - rb, 18.5), 0.6, 0.6, COPPER[2], segs=6)
        flares.append((-4.0, 1.2, 26.0 - 2.5 + 2.6 * 0.5 + 0.2, 1.4))
    else:
        towers = [(-13.0, 0.0, 22.0), (-1.0, 1.0, 26.0), (11.5, -0.8, 19.0)]
        for x, y, h in towers:
            legs = []
            for k in range(3):
                a = k / 3 * math.tau + 0.4
                legs.append((Vector((x + math.cos(a) * 2.4, y + math.sin(a) * 2.4, -2.5)),
                             Vector((x + math.cos(a) * 0.8, y + math.sin(a) * 0.8, h))))
                limb(m, legs[-1][0], legs[-1][1], 0.24, 0.16, STEEL[2], segs=4)
            for i in range(7):
                t0, t1 = i / 7, (i + 1) / 7
                for k in range(3):
                    a0, b0 = legs[k]
                    a1, b1 = legs[(k + 1) % 3]
                    limb(m, a0.lerp(b0, t0), a1.lerp(b1, t1), 0.12, 0.12, STEEL[1], segs=4)
            st = mark(m)
            m.cyl(0.6, h + 0.5, (x, y, -2.5), COPPER[2], segs=7)
            facet(m, new_faces(m, st), COPPER, noise=0.06)
            for i in range(5):
                m.cyl(0.7, 0.6, (x, y, 2 + i * (h - 4) / 4), RED if i % 2 else PAINT[3], segs=7)
            m.cyl(0.75, 0.6, (x, y, h - 2.0), SOOT, segs=7)
            m.cyl(2.2, 0.3, (x, y, -0.3), CONCRETE[1], segs=6)
            flares.append((x, y, h - 1.4, 1.2))
            collider(r, x, y, 2.0)
        # a knock-out drum on the ground and the lines up to them
        st = mark(m)
        m.cyl(1.8, 7.0, (6, -5, 2.0), PAINT[2], segs=10, rot=(0, math.pi / 2, 0))
        facet(m, new_faces(m, st), PAINT, noise=0.04)
        m.box((0.6, 0.2, 3.4), (8, -5.0, 3.9), ORANGE)
        for x, y, h in towers:
            limb(m, (x, y, 14.0), (x + 3.0, y + 2.5, 14.0), 0.35, 0.35, COPPER[2], segs=5)
        for x, y, h in zip((-13.0, -1.0), (0.0, 1.0), (22.0, 26.0)):
            pass
        _beam(m, (-13, 0, 16.0), (-1, 1, 16.0), 0.3, STEEL[2])
        _beam(m, (-1, 1, 14.5), (11.5, -0.8, 14.5), 0.3, STEEL[2])
    m.build(r)
    for i, (x, y, z, fs) in enumerate(flares):
        f = Model(f"cinder_columns_{v}_flare{i}")
        f.cyl(0.9 * fs, 2.8 * fs, (0, 0, 0), FLAME[0], segs=6, r_top=0.1, glow=True)
        f.cyl(0.62 * fs, 2.1 * fs, (0.08, 0, 0), FLAME[1], segs=5, r_top=0.08, glow=True, rot=(0, 0, 0.6))
        f.cyl(0.35 * fs, 1.4 * fs, (-0.05, 0.05, 0), FLAME[2], segs=5, r_top=0.05, glow=True)
        o = f.build(r, loc=(x, y, z))
        flicker(o, f"cinder_columns_{v}_flare{i}_idle", amp=0.18, seed=40 + v * 5 + i, period=1.0 + i * 0.13)
        light(r, (x, y, z + 1.5), FLAME[1], radius=12, intensity=1.4, flicker=0.4)
    return r


def tank_farm(v):
    """GIANT. A tank farm in its bund: big white floating-roof tanks, a spill gone violet in the
    corner, manifolds between them on the ground."""
    r = root("cinder_tank_farm", v)
    rng = random.Random(3240 + v)
    m = Model(f"cinder_tank_farm_{v}", 3240 + v)
    W, D = 42.0, 34.0
    st = mark(m)
    m.box((W, D, 0.3), (0, 0, -0.1), CONCRETE[0])
    for s in (-1, 1):                                                              # the bund wall
        m.box((W + 1.6, 1.0, 1.6), (0, s * (D / 2 + 0.3), 0.6), CONCRETE[2])
        m.box((1.0, D + 1.6, 1.6), (s * (W / 2 + 0.3), 0, 0.6), CONCRETE[2])
    facet(m, new_faces(m, st), CONCRETE, noise=0.04)
    for i in range(int(W / 3)):
        m.box((1.2, 1.05, 0.12), (-W / 2 + 1.5 + i * 3, -D / 2 - 0.3, 1.45), HAZARD if i % 2 else SOOT)
    tanks = [(-12.5, 6.5, 6.5, 6.4), (2.5, 8.5, 5.5, 6.8), (14.5, 7.0, 4.6, 5.8), (-11.5, -8.5, 5.0, 5.6),
             (4.5, -6.5, 6.0, 6.2), (16.0, -9.5, 3.6, 7.2)]
    for i, (x, y, R, H) in enumerate(tanks):
        st = mark(m)
        m.cyl(R, H, (x, y, 0), PAINT[2], segs=16)
        facet(m, new_faces(m, st), PAINT, noise=0.03)
        m.cyl(R + 0.05, 0.6, (x, y, H - 1.3), ORANGE if i % 3 else RED, segs=16)
        if i % 2 == 0:                                                              # a floating roof, sunk in its rim
            m.cyl(R - 0.3, 0.2, (x, y, H - 0.6), STEEL[2], segs=16)
            ring(m, R - 0.15, 0.3, H - 0.05, PAINT[1], n=16, h=0.25, loc=(x, y))
            for k in range(3):
                a = rng.uniform(0, math.tau)
                m.cyl(0.6, 0.3, (x + math.cos(a) * R * 0.5, y + math.sin(a) * R * 0.5, H - 0.4), STEEL[1], segs=6)
            _beam(m, (x, y, H - 0.4), (x + R * 0.8, y, H), 0.2, STEEL[1])               # the rolling ladder
        else:
            st = mark(m)
            m.cyl(R + 0.05, 0.9, (x, y, H), PAINT[1], segs=16, r_top=R * 0.25)
            facet(m, new_faces(m, st), PAINT, noise=0.03)
            st = mark(m)
            m.prism([(-1.7, 1.0), (-1.0, 1.0), (0, -0.9), (1.0, 1.0), (1.7, 1.0), (0, -2.0)], 0.12, (0, 0, 0), ORANGE)
            xform(m, st, M((x, y + R * 0.15, H + 0.75), (math.pi / 2 - 0.2, 0, 0), (R / 4.5,) * 3))
        for k in range(8):                                                          # the stair round it
            a = -0.8 + k * 0.24
            m.box((0.6, 1.0, 0.15), (x + math.cos(a) * (R + 0.45), y + math.sin(a) * (R + 0.45), 0.4 + k * (H - 0.6) / 8),
                  STEEL[2], rot=(0, 0, a))
        m.ball(0.3, (x, y + R * 0.6, H + 0.2), LAMP, subdiv=0, glow=True)
    # manifolds: pipes on sleepers between them, and out through the wall
    for (xa, ya, Ra, _), (xb, yb, Rb, _) in ((tanks[0], tanks[1]), (tanks[1], tanks[2]), (tanks[3], tanks[4]),
                                             (tanks[0], tanks[3]), (tanks[4], tanks[5]), (tanks[1], tanks[4])):
        for dy, col in ((0, COPPER[2]), (0.9, STEEL[2])):
            _beam(m, (xa, ya + dy, 0.6), (xb, yb + dy, 0.6), 0.35, col, segs=6)
    for dy in (-0.8, 0.4):
        _beam(m, (-W / 2 - 4, dy, 0.8), (W / 2 + 4, dy, 0.8), 0.45, COPPER[2], segs=6)
    m.box((3.0, 3.0, 2.0), (-3.5, 0.0, 1.0), PAINT[2])                                # a pump house
    m.box((3.2, 3.2, 0.3), (-3.5, 0.0, 2.1), ORANGE)
    m.box((1.0, 0.1, 0.6), (-3.5, -1.55, 1.2), CAB, glow=True)
    # the spill, gone violet
    m.slab([(-20, -16), (-13, -16.5), (-9, -14), (-12, -12), (-17, -12.5), (-20.5, -13.5)], 0.0, 0.22, CHEM, glow=True)
    m.slab([(10, 15.5), (15, 16), (12, 13.5)], 0.0, 0.22, CHEM_LIGHT, glow=True)
    m.build(r)
    light(r, (-15, -14, 1), CHEM, radius=7, intensity=0.6, halo=False)
    return r


def cooler(v):
    """A fin-fan cooler bank on legs: a row of fans in square shrouds."""
    r = root("cinder_cooler", v)
    m = Model(f"cinder_cooler_{v}", 3280 + v)
    n = 3 if v == 0 else 2
    rows = 1 if v == 0 else 2
    W, D = n * 2.4, rows * 2.4
    for sx in (-1, 1):
        for sy in (-1, 1):
            _beam(m, (sx * (W / 2 - 0.2), sy * (D / 2 - 0.2), 0), (sx * (W / 2 - 0.2), sy * (D / 2 - 0.2), 2.4), 0.15,
                  STEEL[1])
    st = mark(m)
    m.box((W, D, 0.8), (0, 0, 2.8), PAINT[2])
    facet(m, new_faces(m, st), PAINT, noise=0.03)
    for i in range(n):
        for j in range(rows):
            x, y = -W / 2 + 1.2 + i * 2.4, -D / 2 + 1.2 + j * 2.4
            m.cyl(1.0, 0.2, (x, y, 3.15), SOOT, segs=10)
            for k in range(3):
                m.box((1.8, 0.3, 0.08), (x, y, 3.38), STEEL[3], rot=(0, 0, k * math.pi / 3 + i))
            m.cyl(0.25, 0.12, (x, y, 3.42), ORANGE, segs=6)
    m.box((W, 0.3, 0.3), (0, -D / 2 - 0.15, 2.5), ORANGE)
    _beam(m, (-W / 2 - 1.5, 0.4, 1.0), (W / 2 + 1.5, 0.4, 1.0), 0.3, COPPER[2], segs=6)
    m.build(r, rot_z=random.Random(3280 + v).uniform(0, math.tau))
    return r


def barrels(v):
    """Drums on a pallet: company white and warning orange; v2 leaking, the spill glowing."""
    r = root("cinder_barrels", v)
    rng = random.Random(3300 + v)
    m = Model(f"cinder_barrels_{v}", 3300 + v)
    n = (5, 7, 6)[v]
    spots = []
    while len(spots) < n:
        x, y = rng.uniform(-1.6, 1.6), rng.uniform(-1.6, 1.6)
        if all((x - a) ** 2 + (y - b) ** 2 > 0.95 for a, b in spots):
            spots.append((x, y))
    if v != 2:
        m.box((3.8, 3.8, 0.2), (0, 0, 0.1), RUST[2] if v else CONCRETE[0])
    for i, (x, y) in enumerate(spots):
        col = (PAINT[2], ORANGE, RUST[2], STEEL[2])[(i + v) % 4] if v < 2 else (RUST[1], RUST[2], CHEM, RUST[3])[i % 4]
        if v == 2 and i % 3 == 0:                                                        # knocked over
            m.cyl(0.42, 1.1, (x - 0.55, y, 0.42), col, segs=7, rot=(0, math.pi / 2, 0))
            continue
        m.cyl(0.42, 1.1, (x, y, 0.2), col, segs=7)
        m.cyl(0.44, 0.08, (x, y, 0.75), SOOT, segs=7)
        m.cyl(0.36, 0.05, (x, y, 1.3), CHEM if (v == 2 or i % 4 == 1) else STEEL[1], segs=7, glow=(v == 2 or i % 4 == 1))
    if v == 2:
        m.slab([(-2.6, -1.2), (-0.6, -2.4), (1.8, -1.9), (2.4, 0.2), (0.4, 2.2), (-2.0, 1.5)], 0.0, 0.08, CHEM, glow=True)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


# --- Pipeline Canyon -------------------------------------------------------------------------

def trestle(v):
    """SPAN. v0: the pipeline on lattice trestles, three lines and an expansion loop kicking up
    over them, a maintenance trolley hung underneath. v1: one enormous main on A-frames, a valve
    house riding on it, red lamps."""
    r = root("cinder_trestle", v)
    rng = random.Random(3400 + v)
    m = Model(f"cinder_trestle_{v}", 3400 + v)
    L = 52.0
    if v == 0:
        z = 14.6
        for x in (-40.0, 40.0):
            _tower(m, x, 0, -3, z - 0.8, 5.0, RUST[3], brace=3.6, r=0.3)
            m.box((7.0, 7.0, 0.5), (x, 0, z - 0.8), HAZARD)
            collider(r, x, 0, 3.8)
        for y, rad, pal in ((-2.2, 1.2, COPPER[1:]), (0.6, 1.0, PAINT), (2.8, 0.75, STEEL[1:])):
            _pipe_x(m, -L, L, y, z + rad - 0.5, rad, pal, flanges=8.0)
        # the expansion loop
        for x0, x1 in ((-8, 8),):
            pts = [Vector((x0 - 2, -2.2, z + 0.7)), Vector((x0, -2.2, z + 0.7)), Vector((x0, -2.2, z + 6.0)),
                   Vector((x1, -2.2, z + 6.0)), Vector((x1, -2.2, z + 0.7)), Vector((x1 + 2, -2.2, z + 0.7))]
            st = mark(m)
            path_tube(m, pts, [1.25] * 6, COPPER[2], segs=8)
            facet(m, new_faces(m, st), COPPER[1:4], noise=0.05, bias=-0.15)
        # saddles and cross-beams every few units
        for x in range(-36, 37, 9):
            m.box((0.8, 7.2, 0.6), (x, 0.3, z - 0.6), STEEL[1])
        # the trolley on its rail, under the lines, with a lamp
        _beam(m, (-36, 0.3, z - 1.1), (36, 0.3, z - 1.1), 0.18, STEEL[0])
        m.box((3.0, 2.2, 1.0), (-14, 0.3, z - 1.8), ORANGE)
        m.box((2.4, 0.1, 0.4), (-14, -0.85, z - 1.8), CAB, glow=True)
        m.ball(0.35, (-14, 0.3, z - 2.4), LAMP, subdiv=0, glow=True)
        # warning lamps strung along the side
        _hose(m, (-40, -3.6, z + 1.0), (40, -3.6, z + 1.0), 0.9, 0.1, SOOT, n=12)
        for i in range(1, 12):
            p = _sag((-40, -3.6, z + 1.0), (40, -3.6, z + 1.0), 0.9, 12)[i]
            m.ball(0.3, tuple(p - Vector((0, 0, 0.3))), RED if i % 2 else HAZARD, subdiv=0, glow=True)
    else:
        R, z = 2.6, 13.4 + 2.6
        for x in (-42.0, 42.0):
            for y in (-3.5, 3.5):
                _beam(m, (x, y, -3), (x, 0, z - R), 0.55, RUST[3])
            _beam(m, (x, -2.0, z - R - 3.6), (x, 2.0, z - R - 3.6), 0.35, RUST[3])
            m.box((3.0, 3.6, 0.8), (x, 0, z - R - 0.2), STEEL[1])
            collider(r, x, 0, 3.2)
        st = mark(m)
        m.cyl(R, 2 * L, (-L, 0, z), PAINT[2], segs=10, rot=(0, math.pi / 2, 0))
        facet(m, new_faces(m, st), PAINT, noise=0.04, bias=-0.1)
        for x in range(-48, 49, 8):
            m.cyl(R + 0.25, 0.6, (x - 0.3, 0, z), STEEL[1] if x % 16 else ORANGE, segs=10, rot=(0, math.pi / 2, 0))
        for x in range(-46, 47, 6):
            m.box((1.2, 0.6, 0.3), (x, -R - 0.05, z + 0.8), RUST[2])                     # rust blooms on the flank
        # a valve house riding on it
        m.box((6.0, 5.0, 3.0), (6, 0, z + R + 1.2), PAINT[2])
        m.box((6.6, 5.6, 0.35), (6, 0, z + R + 2.8), ORANGE)
        m.box((2.0, 0.1, 0.8), (6, -2.55, z + R + 1.5), CAB, glow=True)
        m.cyl(0.9, 0.5, (4.5, 1.2, z + R + 2.95), STEEL[1], segs=8)
        ring(m, 1.4, 0.3, z + R + 0.4, RED, n=8, h=0.3, loc=(-6, 0))
        _beam(m, (-6, 0, z + R - 0.1), (-6, 0, z + R + 0.4), 0.2, STEEL[1])
        for x in (-26, -14, 18, 30):
            m.ball(0.4, (x, 0, z + R + 0.2), RED, subdiv=0, glow=True)
        # a drip of product from a weeping joint, stopping well above you
        m.cyl(0.35, 1.6, (-20, 0, z - R - 1.5), CHEM, segs=5, r_top=0.15, glow=True)
    m.build(r)
    return r


def split_pipe(v):
    """GIANT. A section of the main, burst open along its top and fallen: violet product pooled in
    its belly, the torn plates curling out, a flange ring at each joint."""
    r = root("cinder_split_pipe", v)
    rng = random.Random(3420 + v)
    m = Model(f"cinder_split_pipe_{v}", 3420 + v)
    R, L = 4.2, 46.0
    zc = 3.6
    n = 12
    skip = {0, 1, 11}                                       # the burst: no plates over the top
    for i in range(n):
        if i in skip:
            continue
        a0 = math.pi / 2 + (i - 0.5) * math.tau / n
        a1 = a0 + math.tau / n
        am = (a0 + a1) / 2
        chord = 2 * R * math.sin(math.pi / n) + 0.05
        st = mark(m)
        m.box((L, chord, 0.4), (0, math.cos(am) * R, zc + math.sin(am) * R), PAINT[2], rot=(am - math.pi / 2, 0, 0))
        facet(m, new_faces(m, st), PAINT, noise=0.04)
    # the torn edges curling outwards, ragged
    for side in (-1, 1):
        a = math.pi / 2 + side * 1.5 * math.tau / n
        for k in range(9):
            x = -L / 2 + 2.5 + k * (L - 5) / 8
            w = rng.uniform(2.5, 5)
            st = mark(m)
            m.box((w, 1.8, 0.35), (x, math.cos(a) * (R + 0.6), zc + math.sin(a) * R + 0.4), PAINT[1],
                  rot=(a - math.pi / 2 + side * rng.uniform(0.4, 0.9), 0, rng.uniform(-0.1, 0.1)))
            jitter(m, new_faces(m, st), 0.15)
            facet(m, new_faces(m, st), PAINT[:3] + [RUST[2]], noise=0.1)
    # the inside, dark, and the product pooled in it
    m.box((L - 0.5, 2 * R * 0.92, 0.3), (0, 0, zc - R * 0.55), CHEM, glow=True)
    m.box((L - 0.8, 2 * R * 0.8, 0.2), (0, 0, zc - R * 0.8), SOOT)
    for k in range(6):
        m.ball(rng.uniform(0.4, 0.8), (rng.uniform(-L / 2 + 3, L / 2 - 3), rng.uniform(-2, 2), zc - R * 0.5),
               CHEM_LIGHT, subdiv=0, glow=True)
    # the flange rings, broken where it burst
    for x in (-L / 2, -L / 6, L / 6, L / 2):
        for i in range(n):
            if i in skip and abs(x) < L / 2:
                continue
            am = math.pi / 2 + i * math.tau / n
            m.box((1.0, 2 * (R + 0.5) * math.sin(math.pi / n) + 0.1, 0.8),
                  (x, math.cos(am) * (R + 0.4), zc + math.sin(am) * (R + 0.4)), ORANGE if x in (-L / 2, L / 2) else STEEL[1],
                  rot=(am - math.pi / 2, 0, 0))
        for i in range(0, n, 2):                                                    # bolts
            am = math.pi / 2 + i * math.tau / n
            m.ball(0.3, (x + 0.55, math.cos(am) * (R + 0.6), zc + math.sin(am) * (R + 0.6)), STEEL[3], subdiv=0)
    # the spill out of the open ends, and rubble round it
    m.slab([(L / 2, -5), (L / 2 + 6, -7), (L / 2 + 10, -2), (L / 2 + 7, 4), (L / 2, 4.5)], -0.1, 0.1, CHEM, glow=True)
    for k in range(10):
        st = mark(m)
        x = rng.choice((-1, 1)) * rng.uniform(L / 2 - 6, L / 2 + 4)
        m.ball(rng.uniform(0.8, 1.6), (x, rng.choice((-1, 1)) * rng.uniform(R + 0.5, R + 3), 0.3), CONCRETE[1], subdiv=0,
               jitter=0.25)
        facet(m, new_faces(m, st), CONCRETE, noise=0.1)
    m.build(r)
    light(r, (0, 0, zc), CHEM, radius=12, intensity=0.9, halo=False)
    return r


def pump_station(v):
    """GIANT. A pumping station: a long hall with its roof off over the pumps, the mains coming in and
    going on, a stack of transformers, a pad lit in hazard yellow."""
    r = root("cinder_pump_station", v)
    rng = random.Random(3440 + v)
    m = Model(f"cinder_pump_station_{v}", 3440 + v)
    W, D = 18.0, 12.0
    m.box((W + 14, D + 10, 0.4), (0, 0, 0), CONCRETE[0])
    for i in range(int((W + 14) / 2.2)):
        m.box((1.0, 0.3, 0.1), (-(W + 14) / 2 + 1.1 + i * 2.2, -(D + 10) / 2 + 0.6, 0.25), HAZARD)
    st = mark(m)
    for s in (-1, 1):
        m.box((W, 0.6, 5.0), (0, s * D / 2, 2.7), PAINT[2])
        m.box((0.6, D, 5.0), (s * W / 2, 0, 2.7), PAINT[2])
    facet(m, new_faces(m, st), PAINT, noise=0.03)
    for s in (-1, 1):
        m.box((W + 0.4, 1.0, 0.4), (0, s * D / 2, 5.3), ORANGE)
    # half a roof on, and its trusses over the rest
    st = mark(m)
    m.box((W * 0.45, D + 0.6, 0.4), (-W * 0.28, 0, 5.6), COPPER[2])
    facet(m, new_faces(m, st), COPPER, noise=0.06)
    for x in (1.5, 4.5, 7.5):
        _beam(m, (x, -D / 2, 5.3), (x, D / 2, 5.3), 0.2, STEEL[1])
    # the pumps inside, the main going through them
    for x in (3.0, 6.5):
        st = mark(m)
        m.cyl(1.4, 3.0, (x, 1.5, 0.4), STEEL[2], segs=8)
        facet(m, new_faces(m, st), STEEL, noise=0.05)
        m.ball(1.1, (x, 1.5, 3.4), ORANGE, subdiv=1, scale=(1, 1, 0.6))
        m.cyl(0.4, 0.2, (x, 1.5, 4.05), CAB, segs=6, glow=True)
    for y in (-2.5, 3.5):
        st = mark(m)
        m.cyl(1.5, W + 22, (-(W + 22) / 2, y, 1.6), COPPER[2] if y > 0 else PAINT[2], segs=8, rot=(0, math.pi / 2, 0))
        facet(m, new_faces(m, st), COPPER[1:4] if y > 0 else PAINT, noise=0.05, bias=-0.1)
        for x in (-W / 2 - 4, W / 2 + 4):
            m.cyl(1.8, 0.5, (x, y, 1.6), STEEL[0], segs=8, rot=(0, math.pi / 2, 0))
    # transformers and a cable tray out to the side
    for k in range(3):
        x, y = -W / 2 - 4 + k * 3.2, -D / 2 - 3.2
        m.box((2.4, 2.0, 2.6), (x, y, 1.5), STEEL[1])
        for j in range(3):
            m.cyl(0.18, 1.0, (x - 0.6 + j * 0.6, y, 2.8), "#d8d0b8", segs=5)
        m.box((2.5, 0.1, 0.4), (x, y - 1.05, 2.0), HAZARD)
    m.box((1.0, 1.0, 1.0), (W / 2 + 4, -D / 2 - 2, 0.9), RED)
    m.ball(0.35, (W / 2 + 4, -D / 2 - 2, 1.6), RED, subdiv=0, glow=True)
    for x, y in ((-W / 2 - 6, D / 2 + 4), (W / 2 + 6, D / 2 + 4), (W / 2 + 6, -D / 2 - 4)):
        _beam(m, (x, y, 0), (x, y, 6.5), 0.18, STEEL[2])
        m.box((1.2, 0.6, 0.3), (x, y, 6.6), LAMP, glow=True)
    m.build(r)
    light(r, (4.5, 1.5, 4.5), CAB, radius=8, intensity=0.6, halo=False)
    return r


def beacon(v):
    """A warning beacon: v0 a striped post with a chevron board lit orange; v1 a lamp mast with a
    red light and a junction box."""
    r = root("cinder_beacon", v)
    m = Model(f"cinder_beacon_{v}", 3460 + v)
    m.cyl(0.6, 0.4, (0, 0, 0), CONCRETE[1], segs=6)
    if v == 0:
        for i in range(5):
            m.cyl(0.2, 0.8, (0, 0, 0.4 + i * 0.8), HAZARD if i % 2 else SOOT, segs=5)
        m.box((2.6, 0.25, 1.2), (0, 0, 4.4), SOOT)
        for k in range(3):
            st = mark(m)
            m.prism([(-0.3, -0.45), (0.15, 0), (-0.3, 0.45), (0, 0.45), (0.45, 0), (0, -0.45)], 0.12, (0, 0, 0), ORANGE,
                    glow=True)
            xform(m, st, M((-0.8 + k * 0.8, -0.15, 4.4)))
        m.box((2.6, 1.0, 0.15), (0, 0.3, 5.1), ORANGE, glow=True)
    else:
        _beam(m, (0, 0, 0.4), (0, 0, 6.0), 0.16, STEEL[2])
        m.box((0.8, 0.5, 1.0), (0, 0.4, 1.2), PAINT[2])
        m.ball(0.45, (0, 0, 6.3), RED, subdiv=1, glow=True)
        m.cyl(0.5, 0.15, (0, 0, 5.85), SOOT, segs=6)
    m.build(r, rot_z=random.Random(3460 + v).uniform(0, math.tau))
    light(r, (0, 0, 5.5), ORANGE if v == 0 else RED, radius=4, intensity=0.6, flicker=0.2)
    return r


def valve_station(v):
    """A valve station on the pipeline: a manifold of risers, valve wheels, a little hut."""
    r = root("cinder_valve_station", v)
    rng = random.Random(3480 + v)
    m = Model(f"cinder_valve_station_{v}", 3480 + v)
    m.box((6.0, 4.6, 0.3), (0, 0, 0.15), CONCRETE[1])
    n = 3 if v == 0 else 4
    for i in range(n):
        x = -2.2 + i * (4.4 / (n - 1))
        col = (COPPER[2], PAINT[2], STEEL[2], ORANGE)[i % 4]
        limb(m, (x, -2.2, 0.8), (x, 0.4, 0.8), 0.42, 0.42, col, segs=7)
        limb(m, (x, 0.4, 0.3), (x, 0.4, 2.4), 0.45, 0.45, col, segs=7)
        m.cyl(0.6, 0.3, (x, 0.4, 1.3), STEEL[0], segs=7)
        _beam(m, (x, 0.4, 2.4), (x, 0.4, 2.9), 0.1, STEEL[1])
        ring(m, 0.55, 0.15, 2.9, RED if i % 2 else HAZARD, n=8, h=0.15, loc=(x, 0.4))
    if v == 1:
        m.box((2.6, 2.0, 2.4), (0.8, 3.4, 1.2), PAINT[2])
        m.box((2.8, 2.2, 0.25), (0.8, 3.4, 2.5), ORANGE)
        m.box((0.9, 0.1, 0.5), (0.8, 2.35, 1.5), CAB, glow=True)
    else:
        m.box((0.6, 0.6, 1.2), (2.7, 1.8, 0.9), STEEL[1])
        m.box((0.4, 0.1, 0.3), (2.7, 1.48, 1.2), "#7aff9a", glow=True)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


# --- the Tailings Lake ---------------------------------------------------------------------

def gantry(v):
    """SPAN. v0: a rusting truss bridge over the lake, deck holed, chains hanging, product weeping
    out of a line under it. v1: a tailings conveyor on a middle pier, its belt heaped with glowing
    slurry."""
    r = root("cinder_gantry", v)
    rng = random.Random(3500 + v)
    m = Model(f"cinder_gantry_{v}", 3500 + v)
    L = 47.0
    if v == 0:
        z0, z1 = 13.6, 19.4
        for y in (-3.2, 3.2):
            st = mark(m)
            _truss(m, -L, L, y, z0, z1, 4.0, RUST[2], r=0.28)
            facet(m, new_faces(m, st), RUST, noise=0.15)
        for x in range(-44, 45, 8):
            _beam(m, (x, -3.2, z1), (x, 3.2, z1), 0.22, RUST[1])
        # the deck: plates, some gone
        holes = {-5, 3, 4}
        for i in range(-11, 12):
            if i in holes:
                continue
            st = mark(m)
            m.box((3.9, 6.0, 0.3), (i * 4.0, 0, z0 + 0.2), RUST[2] if i % 3 else VERDIGRIS[0], rot=(rng.uniform(-0.04, 0.04), 0, 0))
            facet(m, new_faces(m, st), RUST if i % 3 else VERDIGRIS[:2] + RUST[2:3], noise=0.12)
        for x in (-42, 42):
            _tower(m, x, 0, -3, z0, 6.0, RUST[1], brace=3.2, r=0.35)
            m.cyl(3.6, 2.0, (x, 0, -2.0), CONCRETE[0], segs=7)
            collider(r, x, 0, 4.4)
        # chains, a hook, a weeping line
        for x, ln in ((-30, 0.9), (-14, 0.6), (-4, 0.9), (17, 0.8), (33, 0.5)):
            _chain(m, (x, 2.6, z0), ln, RUST[3], link=0.45)
        m.box((1.0, 0.6, 0.6), (-4, 2.6, z0 - 0.9 - 0.2), STEEL[1])
        _pipe_x(m, -L, L, -2.4, z0 - 0.1, 0.5, STEEL[1:], flanges=11.0)
        for x in (-22, 9, 26):
            m.cyl(0.28, 0.7, (x, -2.4, z0 - 1.2), CHEM, segs=5, r_top=0.12, glow=True)
        # lamps on the top chord, one gone out
        for x in (-36, -12, 12, 36):
            m.ball(0.45, (x, -3.2, z1 + 0.5), LAMP if x != 12 else SOOT, subdiv=0, glow=x != 12)
    else:
        z0 = 14.0
        for x in (-41.0, 0.0, 41.0):
            w = 3.4 if x else 3.0
            _tower(m, x, 0, -3, z0, w, RUST[2], brace=3.0, r=0.28)
            m.cyl(w, 1.5, (x, 0, -2.0), CONCRETE[0], segs=7)
            collider(r, x, 0, w * 0.8)
        st = mark(m)
        for y in (-2.0, 2.0):
            _truss(m, -L, L, y, z0, z0 + 2.4, 3.4, RUST[2], r=0.2)
        facet(m, new_faces(m, st), RUST, noise=0.15)
        m.box((2 * L, 3.0, 0.4), (0, 0, z0 + 1.0), SOOT)                                    # the belt
        for i in range(-23, 24):
            m.box((0.6, 3.2, 0.5), (i * 2.0, 0, z0 + 0.7), STEEL[1])                      # idlers
        for k in range(16):                                                                # slurry heaped on it
            x = -L + 3 + k * (2 * L - 6) / 15 + rng.uniform(-1, 1)
            m.ball(rng.uniform(0.8, 1.2), (x, 0, z0 + 1.3), CHEM if k % 3 else TOXIC, subdiv=0, scale=(1.4, 0.9, 0.45),
                   glow=True)
        # the cover over half of it, corroded
        for i in range(-11, 0):
            st = mark(m)
            m.box((3.9, 4.6, 0.25), (i * 4.0, 0, z0 + 3.1), RUST[1] if i % 2 else RUST[2], rot=(0, 0.05 * (i % 3 - 1), 0))
            facet(m, new_faces(m, st), RUST, noise=0.1)
        # a spill off the belt at the middle pier, stopping above you
        m.cyl(0.6, 1.4, (2.5, -1.8, z0 - 1.2), CHEM, segs=5, r_top=0.3, glow=True)
        m.box((1.6, 0.5, 0.8), (2.5, -1.8, z0 + 0.5), CHEM_LIGHT, glow=True)
    m.build(r)
    return r


def tanker(v):
    """GIANT. A tanker that came to load and sank where she lay: listing, the bow under, the deck
    rusted through, the bridge block still standing. The waterline is z = 0."""
    r = root("cinder_tanker", v)
    rng = random.Random(3520 + v)
    m = Model(f"cinder_tanker_{v}", 3520 + v)
    L, B = 54.0, 13.0
    s0 = mark(m)
    # the hull: a long slab, pointed at the bow (+y), square at the stern
    bow = [(-B / 2, -L / 2), (B / 2, -L / 2), (B / 2, L / 2 - 8), (B * 0.3, L / 2 - 2), (0, L / 2),
           (-B * 0.3, L / 2 - 2), (-B / 2, L / 2 - 8)]
    top = [(x * 1.0, y) for x, y in bow]
    st = mark(m)
    m.slab([(x * 0.85, y * 0.97) for x, y in bow], -4.0, 2.4, RUST[1], top=top)
    facet(m, new_faces(m, st), [RUST[0], RUST[1], RUST[2]], noise=0.1)
    # the deck, a band of red at the sheer
    m.slab([(x * 0.94, y * 0.98) for x, y in bow], 2.4, 2.6, RUST[2])
    for side in (-1, 1):
        m.box((0.4, L - 10, 0.7), (side * B / 2, -4, 2.2), RED)
    # tank hatches and the catwalk down the middle with its pipes
    for i in range(8):
        y = -L / 2 + 14 + i * 4.2
        if i == 5:
            m.box((3.6, 3.0, 0.1), (0, y, 2.62), CHEM, glow=True)                          # rusted through: product
            continue
        m.cyl(1.2, 0.5, (-3.0, y, 2.6), RUST[3], segs=8)
        m.cyl(1.2, 0.5, (3.0, y, 2.6), RUST[3] if i % 3 else VERDIGRIS[0], segs=8)
    m.box((1.6, L - 20, 0.2), (0, 2, 3.6), STEEL[1])
    for x in (-0.6, 0.6):
        _beam(m, (x, -L / 2 + 12, 3.0), (x, L / 2 - 6, 3.0), 0.3, COPPER[2] if x < 0 else STEEL[2], segs=6)
    for k in range(6):
        y = -L / 2 + 13 + k * 6
        _beam(m, (0, y, 2.6), (0, y, 3.6), 0.2, STEEL[1])
    # the manifold and a derrick amidships
    for x in (-4.5, 4.5):
        m.box((1.2, 3.0, 1.2), (x, 2, 3.2), ORANGE)
    _beam(m, (0, 6, 2.6), (0, 6, 8.0), 0.35, RUST[3])
    _beam(m, (0, 6, 7.6), (5.5, 2, 5.0), 0.25, RUST[3])
    # the bridge block at the stern, the funnel
    st = mark(m)
    m.box((B - 1.0, 8.0, 3.6), (0, -L / 2 + 5, 4.4), PAINT[1])
    m.box((B - 3.0, 5.0, 1.8), (0, -L / 2 + 5.5, 7.0), PAINT[2])
    facet(m, new_faces(m, st), PAINT[:3], noise=0.04)
    m.box((B - 2.8, 0.2, 0.7), (0, -L / 2 + 8.05, 7.2), SOOT)                             # dead windows
    m.box((1.6, 0.2, 0.7), (2.0, -L / 2 + 8.05, 7.2), CHEM_LIGHT, glow=True)                 # one lit: someone's aboard
    for side in (-1, 1):
        m.box((2.0, 2.2, 0.3), (side * (B / 2 + 0.2), -L / 2 + 7.4, 6.0), PAINT[1])        # bridge wings
    for k in range(4):
        m.box((0.9, 0.12, 2.2), (-4 + k * 2.5, -L / 2 + 9.02, 4.0), RUST[2])               # rust streaks
    st = mark(m)
    m.cyl(1.4, 1.5, (0, -L / 2 + 2.5, 6.2), ORANGE, segs=8, r_top=1.2)
    m.cyl(1.25, 0.4, (0, -L / 2 + 2.5, 7.7), SOOT, segs=8)
    # lifeboat davits, a crane
    for side in (-1, 1):
        m.box((1.4, 3.6, 1.0), (side * (B / 2 + 0.6), -L / 2 + 3, 3.0), ORANGE)
    # sink her: list to port, bow down, so the fore end goes under
    xform(m, s0, M((0, 0, -0.6), (0.06, 0.13, 0)))
    # the slick she's leaking, round her waterline
    m.slab([(-9, -10), (-6, -22), (2, -30), (9, -20), (10, 0), (8, 18), (-2, 30), (-9, 12)], 0.05, 0.12, "#8a5aa8")
    m.build(r)
    light(r, (2, -L / 2 + 8.5, 6.6), CHEM_LIGHT, radius=5, intensity=0.6, halo=False)
    return r


def _tower_profile(m, x, y, H, rb, rw, rt, col, pal):
    zs = [-2.5, 0.5, H * 0.3, H * 0.62, H * 0.85, H]
    rs = [rb, rb, rb - (rb - rw) * 0.6, rw, rw + (rt - rw) * 0.5, rt]
    pts = [Vector((x, y, z)) for z in zs]
    st = mark(m)
    from props_a_lib import tube
    tube(m, pts, rs, col, segs=14, cap=False)
    facet(m, new_faces(m, st), pal, noise=0.05)
    m.cyl(rt * 0.95, 0.2, (x, y, H - 2.0), "#2a2230", segs=14)
    m.cyl(rt * 0.4, 0.2, (x, y, H - 1.8), "#7a3aa8", segs=10, glow=True)
    ring(m, rt * 0.72, 0.35, H - 1.85, "#4a2a5a", n=12, h=0.2, loc=(x, y))
    return rs, zs


def cooling_towers(v):
    """GATE. Cooling towers, stained violet from the top down, the gaps between them just a ship
    wide, a gantry slung between them overhead. v1 is two towers and a stack."""
    r = root("cinder_cooling_towers", v)
    rng = random.Random(3540 + v)
    m = Model(f"cinder_cooling_towers_{v}", 3540 + v)
    pal = [CONCRETE[0], CONCRETE[1], CONCRETE[2], "#b0aca4"]
    if v == 0:
        towers = [(-14.8, 0.0, 19.0, 5.0, 3.5, 4.0), (0.0, 1.0, 22.0, 5.4, 3.7, 4.3), (14.8, -0.5, 18.0, 4.8, 3.4, 3.9)]
    else:
        towers = [(-9.5, 0.0, 22.0, 5.8, 3.9, 4.5), (9.0, 0.4, 19.0, 5.2, 3.6, 4.1)]
    for x, y, H, rb, rw, rt in towers:
        _tower_profile(m, x, y, H, rb, rw, rt, CONCRETE[1], pal)
        # the stain running down from the lip, and the banded warning at the top
        for k in range(5):
            a = rng.uniform(0, math.tau)
            ln = rng.uniform(3, 8)
            rr = rt * 0.98
            m.box((0.9, 0.3, ln), (x + math.cos(a) * rr, y + math.sin(a) * rr, H - ln / 2 - 0.3),
                  "#6a4a7a" if k % 2 else "#5a5a4a", rot=(0, 0, a + math.pi / 2))
        ring(m, rt + 0.05, 0.25, H - 0.6, RED, n=14, h=0.4, loc=(x, y))
        # raking legs round the foot
        for k in range(10):
            a = k / 10 * math.tau
            m.box((0.5, 0.5, 2.6), (x + math.cos(a) * rb, y + math.sin(a) * rb, 0.6), CONCRETE[0], rot=(0, 0.3, a))
        m.ball(0.45, (x, y - rt, H + 0.2), RED, subdiv=0, glow=True)
        # radius at the flight line, for the collider
        frac = (10 - H * 0.3) / (H * 0.62 - H * 0.3)
        rc = (rb - (rb - rw) * 0.6) + ((rw) - (rb - (rb - rw) * 0.6)) * max(0.0, min(1.0, frac))
        collider(r, x, y, round(rc + 0.1, 2))
    if v == 1:
        # a stack between them
        st = mark(m)
        m.cyl(1.6, 26.0, (0.5, -3.0, -2.5), CONCRETE[2], segs=10, r_top=1.1)
        facet(m, new_faces(m, st), pal, noise=0.04)
        for i in range(4):
            m.cyl(1.25, 0.8, (0.5, -3.0, 19 + i * 1.4), RED if i % 2 == 0 else PAINT[3], segs=10)
        m.cyl(1.15, 0.3, (0.5, -3.0, 23.5), CHEM, segs=10, glow=True)
        collider(r, 0.5, -3.0, 1.6)
    # a pipe gantry slung between them overhead
    for (xa, ya, Ha, _, _, ra), (xb, yb, Hb, _, _, rb_) in zip(towers, towers[1:]):
        z = 14.5
        st = mark(m)
        _beam(m, (xa, ya - 1, z), (xb, yb - 1, z), 0.6, COPPER[2], segs=6)
        _beam(m, (xa, ya + 0.6, z + 0.4), (xb, yb + 0.6, z + 0.4), 0.4, STEEL[2], segs=6)
        facet(m, new_faces(m, st), COPPER[1:4], noise=0.05)
    m.build(r)
    return r


def sludge_vent(v):
    """A seep on the shore: a crusted mound, a pool glowing in its mouth that heaves."""
    r = root("cinder_sludge_vent", v)
    rng = random.Random(3580 + v)
    m = Model(f"cinder_sludge_vent_{v}", 3580 + v)
    R = (1.8, 2.6)[v]
    st = mark(m)
    m.cyl(R, 0.9, (0, 0, -0.2), "#6a6a5a", segs=8, r_top=R * 0.55)
    jitter(m, new_faces(m, st), 0.18)
    facet(m, new_faces(m, st), ["#4a4a40", "#6a6a5a", "#8a8a7a", "#a8a890"], noise=0.12)
    m.cyl(R * 0.5, 0.1, (0, 0, 0.66), TOXIC if v else CHEM, segs=8, glow=True)
    for k in range(6 + 3 * v):                                                          # crust and scum
        a = rng.uniform(0, math.tau)
        d = R * rng.uniform(0.7, 1.2)
        m.ball(rng.uniform(0.2, 0.4), (math.cos(a) * d, math.sin(a) * d, 0.2), rng.choice((TOXIC, "#e8e0c0", "#4a4a40")),
               subdiv=0, glow=False)
    if v == 1:                                                                          # a dead standpipe in it
        limb(m, (0.8, 0.6, 0), (1.0, 0.9, 3.0), 0.25, 0.25, RUST[2], segs=5)
        m.cyl(0.35, 0.3, (1.0, 0.9, 3.0), RUST[3], segs=5)
    m.slab([(-R * 1.6, -0.6), (-R * 0.6, -R * 1.4), (R * 0.9, -R * 1.2), (R * 1.7, 0.2), (R * 0.4, R * 1.3), (-R * 1.2, R)],
           -0.15, -0.02, "#8a7a9a")
    m.build(r, rot_z=rng.uniform(0, math.tau))
    b = Model(f"cinder_sludge_vent_{v}_bubble", 3590 + v)
    b.ball(R * 0.35, (0, 0, 0), CHEM_LIGHT if not v else TOXIC, subdiv=1, scale=(1, 1, 0.5), glow=True)
    o = b.build(r, loc=(0, 0, 0.68))
    pulse(o, f"cinder_sludge_vent_{v}_heave_idle", amp=0.5, period=2.2 + v * 0.5)
    light(r, (0, 0, 1.0), CHEM, radius=4, intensity=0.6, halo=False)
    return r


def build():
    for v in range(2):
        irrigator(v)
        grove_gate(v)
        sapling_row(v)
        pipe_rack(v)
        columns(v)
        cooler(v)
        trestle(v)
        beacon(v)
        valve_station(v)
        gantry(v)
        cooling_towers(v)
        sludge_vent(v)
    harvester(0)
    tank_farm(0)
    split_pipe(0)
    pump_station(0)
    tanker(0)
    for v in range(3):
        barrels(v)
