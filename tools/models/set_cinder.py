"""CINDER ORCHARD's set pieces and extra scenery: the company's machinery at the scale
of a landscape. Irrigation booms and aqueducts over the copper orchards, hero trees, a harvester
the size of a barn; pipe racks, distillation columns and tank farms at Refinery Nine; the pipeline
on its trestles through the canyon; a rusting gantry, cooling towers and a sunk tanker on the
tailings lake. Company white, copper and warning orange, violet where the product shows."""
from __future__ import annotations

import math
import random

from mathutils import Vector
from kit import Model, animate, emitter, light
from props_b_kit import (M, collider, crystal, facet, flicker, jitter, limb, mark, new_faces, paint, path_tube, pulse, ring,
                         root, xform)
from props_b_cinder import (BRONZE, CHEM, CONCRETE, COPPER, CYAN, FLAME, FRUIT, GLASS, GROW, HAZARD, ORANGE, PAINT, RED,
                            SOIL, SOOT, STEEL, VERDIGRIS, YOUNG, orchard_tree)

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
    """A prize tree's crown: a rosette of beaten-copper leaf blades in two tiers round a dark heart,
    each blade its own shade, a verdigris boss on top, ember fruit hung in a few heavy clusters."""
    from props_b_cinder import OLD
    st = mark(m)
    m.ball(rad * 0.55, c, OLD[1], subdiv=1, scale=(1, 1, squash * 1.2), jitter=rad * 0.05)
    facet(m, new_faces(m, st), OLD, noise=0.15)
    tones = [COPPER[:4], [COPPER[1], COPPER[2], COPPER[3], COPPER[4]], OLD]
    for t, (rr, dz, n, ln, tilt) in enumerate(((rad * 0.62, -0.1, lobes * 2, rad * 0.62, 0.32),
                                                (rad * 0.32, rad * squash * 0.55, lobes + 1, rad * 0.5, 0.45))):
        for k in range(n):
            a = k / n * math.tau + rng.uniform(-0.12, 0.12) + t * 0.4
            p = (c[0] + math.cos(a) * rr, c[1] + math.sin(a) * rr, c[2] + dz + rng.uniform(-0.2, 0.2))
            st = mark(m)
            m.ball(1.0, (0, 0, 0), COPPER[2], subdiv=0, scale=(ln, ln * 0.42, ln * 0.16), jitter=0.04)
            xform(m, st, M(p, (0, tilt + rng.uniform(-0.08, 0.08), a)))
            facet(m, new_faces(m, st), tones[(k + t) % 3], noise=0.1, bias=-0.05)
    st = mark(m)
    m.ball(rad * 0.28, (c[0], c[1], c[2] + rad * squash * 0.95), VERDIGRIS[1], subdiv=1, scale=(1, 1, 0.6),
           jitter=0.1)
    facet(m, new_faces(m, st), VERDIGRIS, noise=0.1)
    for q in range(max(2, fruit // 5)):
        a = q / max(2, fruit // 5) * math.tau + rng.uniform(0, 0.6)
        base = Vector((c[0] + math.cos(a) * rad * 0.95, c[1] + math.sin(a) * rad * 0.95, c[2] - 0.4))
        for k in range(3):
            off = Vector((rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), -k * 0.45))
            m.ball(rng.uniform(0.45, 0.6), tuple(base + off), FRUIT, subdiv=0, glow=True)


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


# --- orchard scenery: the crop in rows, and the people and machines who work it ----------------

def _bed(m, rng, w, l, h=0.3, col=None):
    """A raised planting bed of dark tilled soil, edged in company-white kerb."""
    st = mark(m)
    m.box((w, l, h), (0, 0, h / 2 - 0.1), col or SOIL[1])
    jitter(m, new_faces(m, st), 0.04)
    facet(m, new_faces(m, st), SOIL, noise=0.15)
    for s in (-1, 1):
        m.box((0.22, l + 0.2, h + 0.08), (s * (w / 2 + 0.05), 0, (h + 0.08) / 2 - 0.1), PAINT[1])


def _drip(m, x, y0, y1, heads, z=0.32):
    """An irrigation line along y, white, with a cyan-lit dripper at each tree."""
    limb(m, (x, y0, z), (x, y1, z), 0.13, 0.13, PAINT[3], segs=5)
    for y in heads:
        m.box((0.3, 0.3, 0.2), (x, y, z + 0.08), CYAN, glow=True)


def _row_post(m, x, y, n):
    """A row-end post: white, a warning-orange plate on top with the row's cyan status light."""
    m.box((0.32, 0.32, 1.7), (x, y, 0.85), PAINT[3])
    m.box((0.8, 0.5, 0.36), (x, y, 1.8), ORANGE)
    m.box((0.22 + 0.12 * (n % 3), 0.52, 0.06), (x - 0.1, y, 2.0), PAINT[3])           # its number, roughly
    m.cyl(0.18, 0.18, (x + 0.25, y, 1.98), CYAN, segs=5, glow=True)


def _bin(m, rng, x, y, z=0.0, full=True, rot=0.0):
    """A fruit bin: a white ceramic crate heaped with glowing ember fruit."""
    m.box((1.05, 1.05, 0.7), (x, y, z + 0.35), PAINT[2], rot=(0, 0, rot))
    m.box((1.1, 0.12, 0.2), (x, y, z + 0.6), ORANGE, rot=(0, 0, rot))
    if full:
        m.box((0.85, 0.85, 0.12), (x, y, z + 0.66), "#7a3aa8", rot=(0, 0, rot))
        for k in range(4):
            a = rot + k * math.pi / 2 + 0.6
            m.ball(0.24, (x + math.cos(a) * 0.24, y + math.sin(a) * 0.24, z + 0.8), FRUIT, subdiv=0, glow=True)


def _tree_row(m, rng, x, n, gap, stage_of, style_of, fruit_of=None, bed=True):
    """One planted row along y at x: a bed, its trees, the drip line, a post at the end."""
    L = gap * n
    if bed:
        st = mark(m)
        m.box((1.9, L, 0.3), (x, 0, 0.05), SOIL[1])
        jitter(m, new_faces(m, st), 0.04)
        facet(m, new_faces(m, st), SOIL, noise=0.15)
    ys = [-L / 2 + gap * (i + 0.5) for i in range(n)]
    for i, y in enumerate(ys):
        stage = stage_of(i)
        if stage is None:                                                         # grubbed out: a stump
            limb(m, (x, y, 0.15), (x, y, 0.5), 0.3, 0.28, BRONZE[2], segs=6)
            m.cyl(0.26, 0.05, (x, y, 0.5), COPPER[3], segs=6)
            continue
        orchard_tree(m, rng, x + rng.uniform(-0.12, 0.12), y + rng.uniform(-0.1, 0.1), stage, style_of(i), z0=0.2,
                     collar=False, fruit=fruit_of(i) if fruit_of else None)
    _drip(m, x + 0.7, -L / 2, L / 2, [y for i, y in enumerate(ys) if stage_of(i) is not None])
    return ys


def orchard_row(v):
    """The crop, a plot at a time (the scatter turns each plot its own way; within one, it's rows).
    v0 three bearing rows; v1 a block of young vase-pruned trees; v2 two espaliers trained flat
    along trellises; v3 rows half-picked, bins at their foot, a tree grubbed out."""
    r = root("cinder_orchard_row", v)
    rng = random.Random(3700 + v)
    m = Model(f"cinder_orchard_row_{v}", 3700 + v)
    if v == 0:
        old = rng.randrange(12)
        for j, x in enumerate((-3.2, 0, 3.2)):
            _tree_row(m, rng, x, 4, 2.7, lambda i, j=j: 3 if j * 4 + i == old else 2,
                      lambda i, j=j: "round" if (i + j) % 3 else "vase")
        _row_post(m, -3.2, -6.0, 1)
        _row_post(m, 3.2, -6.0, 3)
    elif v == 1:
        gap = 2.6
        st = mark(m)
        m.box((8.4, 8.4, 0.16), (0, 0, -0.02), "#7a6238")                             # a mulched plot
        jitter(m, new_faces(m, st), 0.04)
        facet(m, new_faces(m, st), ["#5e4a2c", "#7a6238", "#8e7444"], noise=0.15)
        for i in range(3):
            for j in range(3):
                x, y = (i - 1) * gap, (j - 1) * gap
                stage = 1 if (i + j) % 3 else 0
                orchard_tree(m, rng, x + rng.uniform(-0.1, 0.1), y, stage, "vase" if stage else "round", z0=0.14)
            _drip(m, (i - 1) * gap + 0.65, -4.0, 4.0, [(j - 1) * gap for j in range(3)], z=0.2)
        for sx, sy in ((-1, -1), (1, 1)):
            _row_post(m, sx * 4.4, sy * 4.4, 2)
    elif v == 2:
        # the prize block, under the company's hail lattice: white ceramic hexes on posts, the
        # bearing trees showing through
        for j, x in enumerate((-2.7, 0, 2.7)):
            _tree_row(m, rng, x, 3, 2.8, lambda i: 2, lambda i, j=j: "vase" if (i + j) % 2 else "round",
                      lambda i: 3)
        H, R = 4.6, 1.75
        cells = []
        for q in range(-2, 3):
            for k in range(-2, 3):
                cx, cy = q * R * 1.5, (k + (q % 2) * 0.5) * R * math.sqrt(3)
                if abs(cx) <= 4.6 and abs(cy) <= 5.2:
                    cells.append((cx, cy))
        edges = set()
        for cx, cy in cells:
            pts = [(round(cx + math.cos(a * math.pi / 3) * R, 2), round(cy + math.sin(a * math.pi / 3) * R, 2)) for a in range(6)]
            for a, b in zip(pts, pts[1:] + pts[:1]):
                edges.add(tuple(sorted((a, b))))
        for a, b in edges:
            m.plank_line((a[0], a[1], H), (b[0], b[1], H), 0.26, 0.2, PAINT[3])
        for x, y in ((-4.6, -4.6), (4.6, -4.6), (-4.6, 4.6), (4.6, 4.6), (0, -5.0), (0, 5.0)):
            m.box((0.3, 0.3, H), (x, y, H / 2), PAINT[2])
            m.cyl(0.2, 0.18, (x, y, H), CYAN, segs=5, glow=True)
        _row_post(m, -2.7, -5.3, 4)
    else:
        ys = _tree_row(m, rng, -1.7, 4, 2.7, lambda i: None if i == 1 else 2, lambda i: "round",
                       lambda i: (0, 0, 1, 2)[i])
        _tree_row(m, rng, 1.7, 4, 2.7, lambda i: 2, lambda i: "vase" if i % 2 else "round", lambda i: (3, 4, 2, 3)[i])
        orchard_tree(m, rng, -1.2, ys[1] + 0.5, 0, "round", z0=0.2, collar=False)              # its replacement
        for k, (x, y) in enumerate(((-3.6, -2.6), (-3.6, -1.4), (-3.7, 1.4), (-4.8, -2.0))):
            _bin(m, rng, x, y, full=k != 2, rot=rng.uniform(-0.2, 0.2))
        for s in (-1, 1):                                                             # a picking ladder
            limb(m, (-2.7 + s * 0.35, ys[2] - 0.8, 0), (-2.25, ys[2] - 0.2 + s * 0.2, 2.4), 0.09, 0.09, ORANGE, segs=4)
        _row_post(m, -1.7, -6.0, 3)
    m.build(r)
    return r


def crop_bed(v):
    """Ground cover between the orchard blocks. v0 two clipped copper hedgerows (windbreak);
    v1 white hydroponic troughs of seedlings over cyan-lit feed; v2 a cover crop, verdigris-blue,
    in mounded drills."""
    r = root("cinder_crop_bed", v)
    rng = random.Random(3720 + v)
    m = Model(f"cinder_crop_bed_{v}", 3720 + v)
    if v == 0:
        for x in (-3.0, 0.0, 3.0):
            st = mark(m)
            for i in range(5):
                y = -4.4 + i * 2.2
                m.box((1.3, 2.4, 0.9 + rng.uniform(-0.1, 0.15)), (x, y, 0.45), COPPER[2], taper=0.8)
            m.box((1.3, 10.8, 0.4), (x, 0, 0.2), COPPER[1])
            jitter(m, new_faces(m, st), 0.1)
            facet(m, new_faces(m, st), [COPPER[0], COPPER[1], VERDIGRIS[0], COPPER[2], COPPER[3]], noise=0.25, bias=-0.1)
        for x in (-1.5, 1.5):
            m.box((1.4, 11.0, 0.06), (x, 0, 0.0), SOIL[2])
    elif v == 1:
        for i, x in enumerate((-3.2, -1.6, 0, 1.6, 3.2)):
            st = mark(m)
            m.box((1.1, 8.0, 0.55), (x, 0, 0.27), PAINT[2])
            facet(m, new_faces(m, st), PAINT, noise=0.04)
            m.box((0.7, 7.6, 0.06), (x, 0, 0.55), "#2a6a7a")
            m.box((0.22, 7.6, 0.08), (x, 0, 0.56), CYAN, glow=True)
            for j in range(8):
                y = -3.4 + j * 0.97
                st = mark(m)
                if (j + i) % 4 == 3:
                    continue
                m.cyl(0.32, 0.5 + 0.08 * (j % 3), (x, y, 0.55), YOUNG[2], segs=5, r_top=0.05, rot=(0, 0, j))
                facet(m, new_faces(m, st), YOUNG, noise=0.1)
        m.box((7.8, 0.6, 0.9), (0, -4.4, 0.45), STEEL[2])                              # the feed pump
        m.box((0.8, 0.12, 0.3), (-1.2, -4.72, 0.6), CYAN, glow=True)
    else:
        for i in range(6):
            x = -4.0 + i * 1.6
            st = mark(m)
            m.box((1.0, 9.0, 0.25), (x, 0, 0.1), SOIL[1])
            facet(m, new_faces(m, st), SOIL, noise=0.15)
            st = mark(m)
            for j in range(7):
                y = -3.9 + j * 1.3 + rng.uniform(-0.2, 0.2)
                if rng.random() < 0.15:
                    continue
                m.ball(rng.uniform(0.5, 0.7), (x + rng.uniform(-0.1, 0.1), y, 0.35), VERDIGRIS[1], subdiv=0,
                       scale=(1, 1.3, 0.7), jitter=0.06)
            facet(m, new_faces(m, st), [OLIVE[1], VERDIGRIS[0], VERDIGRIS[1], VERDIGRIS[2]], noise=0.2)
    m.build(r)
    return r


def work_shed(v):
    """Where the orchard is worked from. v0 a workers' shed: white ceramic, a cyan skylight, crates
    under the awning; v1 a pump house under its water tower; v2 a picker-drone dock, two drones
    parked on the pad and charging."""
    r = root("cinder_shed", v)
    rng = random.Random(3740 + v)
    m = Model(f"cinder_shed_{v}", 3740 + v)
    m.box((5.2, 4.6, 0.2), (0, 0, 0.1), CONCRETE[1])
    if v == 0:
        st = mark(m)
        m.box((3.6, 2.6, 2.0), (-0.4, 0.5, 1.2), PAINT[2])
        facet(m, new_faces(m, st), PAINT, noise=0.03)
        m.gable((3.9, 3.0, 0.8), (-0.4, 0.5, 2.15), PAINT[3], overhang=0.2)
        m.box((3.95, 0.3, 0.25), (-0.4, 0.5, 2.98), ORANGE)                           # the ridge
        m.box((0.8, 0.9, 0.12), (-1.3, 0.1, 2.6), CYAN, glow=True, rot=(0.45, 0, 0))   # skylight
        m.box((0.9, 0.1, 1.5), (0.6, -0.82, 0.95), STEEL[1])                          # the door
        m.box((1.4, 0.1, 0.5), (-1.2, -0.82, 1.4), CYAN, glow=True)                   # a lit window
        # the awning on the side, crates and a water drum under it
        m.box((1.6, 2.8, 0.12), (2.2, 0.5, 2.0), ORANGE, rot=(0, -0.2, 0))
        for y in (-0.5, 1.5):
            m.box((0.15, 0.15, 1.9), (2.9, y, 0.95), PAINT[3])
        _bin(m, rng, 2.1, 1.3)
        _bin(m, rng, 2.1, 0.1, full=False)
        m.cyl(0.4, 0.9, (2.0, -1.5, 0.2), VERDIGRIS[0], segs=7)
        m.box((1.6, 0.5, 0.45), (-0.6, -1.5, 0.42), BRONZE[2])                        # a bench
    elif v == 1:
        st = mark(m)
        m.box((2.4, 2.2, 1.6), (-1.2, -0.8, 0.95), PAINT[2])
        facet(m, new_faces(m, st), PAINT, noise=0.03)
        m.box((2.6, 2.4, 0.2), (-1.2, -0.8, 1.85), ORANGE)
        m.cyl(0.45, 0.3, (-1.6, -1.2, 1.9), STEEL[1], segs=6)
        # the tower: four legs, a copper tank, a cyan level gauge
        for sx in (-1, 1):
            for sy in (-1, 1):
                limb(m, (1.2 + sx * 1.1, 1.0 + sy * 1.1, 0.2), (1.2 + sx * 0.8, 1.0 + sy * 0.8, 3.6), 0.12, 0.12, STEEL[2],
                     segs=4)
        st = mark(m)
        m.cyl(1.35, 1.5, (1.2, 1.0, 3.6), COPPER[2], segs=8)
        facet(m, new_faces(m, st), COPPER, noise=0.06)
        m.cyl(1.4, 0.5, (1.2, 1.0, 5.1), PAINT[3], segs=8, r_top=0.3)
        m.cyl(1.38, 0.2, (1.2, 1.0, 4.0), PAINT[3], segs=8)
        m.box((0.2, 0.14, 1.2), (1.2, -0.38, 4.2), CYAN, glow=True)
        limb(m, (1.2, 1.0, 3.6), (-0.6, -0.2, 1.8), 0.16, 0.16, PAINT[3], segs=5)
        limb(m, (-1.2, -2.0, 0.35), (-1.2, -4.5, 0.35), 0.18, 0.18, PAINT[3], segs=5)   # out to the rows
    else:
        st = mark(m)
        m.cyl(2.3, 0.4, (0, 0, 0.2), PAINT[2], segs=6)
        facet(m, new_faces(m, st), PAINT, noise=0.03)
        ring(m, 1.9, 0.2, 0.6, CYAN, n=6, h=0.06, glow=True)
        m.box((1.0, 0.8, 1.4), (2.0, -1.9, 0.7), STEEL[1])                            # the charger
        m.box((0.6, 0.1, 0.4), (2.0, -2.32, 1.0), CYAN, glow=True)
        for k, (x, y) in enumerate(((-0.8, 0.5), (0.9, -0.4))):
            m.cyl(0.55, 0.35, (x, y, 0.62), PAINT[3], segs=6)
            m.cyl(0.25, 0.12, (x, y, 0.97), CYAN, segs=5, glow=True)
            for a in range(4):
                aa = a * math.pi / 2 + 0.785 + k * 0.3
                px, py = x + math.cos(aa) * 0.75, y + math.sin(aa) * 0.75
                limb(m, (x, y, 0.8), (px, py, 0.85), 0.07, 0.07, STEEL[1], segs=4)
                m.cyl(0.32, 0.06, (px, py, 0.9), STEEL[0], segs=6)
            m.box((0.5, 0.5, 0.3), (x, y, 0.42), "#7a3aa8")                           # its basket
        _bin(m, rng, -1.6, -1.8)
        _bin(m, rng, -0.4, -2.0, rot=0.3)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def picker(v):
    """Orchard machinery. v0 a tracked picking robot reaching into the canopy with its basket; v1 a
    little orange tug towing a trailer of fruit bins."""
    r = root("cinder_picker", v)
    rng = random.Random(3760 + v)
    m = Model(f"cinder_picker_{v}", 3760 + v)
    if v == 0:
        for s in (-1, 1):
            m.box((0.5, 2.0, 0.55), (s * 0.7, 0, 0.28), SOOT)
            for y in (-0.7, 0, 0.7):
                m.box((0.56, 0.2, 0.06), (s * 0.7, y, 0.57), STEEL[1])
        st = mark(m)
        m.box((1.2, 1.5, 0.9), (0, -0.1, 1.0), PAINT[2], taper=0.8)
        facet(m, new_faces(m, st), PAINT, noise=0.03)
        m.box((0.9, 0.12, 0.3), (0, -0.88, 1.15), CYAN, glow=True)                     # its sensor bar
        m.cyl(0.35, 0.3, (0, 0.2, 1.45), STEEL[1], segs=6)
        limb(m, (0, 0.2, 1.7), (0.2, 1.3, 3.0), 0.16, 0.14, ORANGE, segs=5)
        limb(m, (0.2, 1.3, 3.0), (0.3, 2.3, 2.5), 0.13, 0.11, ORANGE, segs=5)
        m.box((0.7, 0.7, 0.45), (0.3, 2.5, 2.3), PAINT[3])
        m.ball(0.22, (0.3, 2.5, 2.6), FRUIT, subdiv=0, glow=True)
        m.box((1.0, 0.7, 0.5), (0, 0.85, 0.85), "#7a3aa8")                            # its hopper
        for k in range(3):
            m.ball(0.22, (-0.3 + k * 0.3, 0.85, 1.15), FRUIT, subdiv=0, glow=True)
        # and a young tree it is working
        orchard_tree(m, rng, 0.4, 3.1, 1, "round", collar=True, fruit=2)
    else:
        st = mark(m)
        m.box((1.4, 1.6, 0.9), (0, 2.2, 0.75), ORANGE)
        m.box((1.2, 0.9, 0.7), (0, 2.0, 1.5), PAINT[3])
        facet(m, new_faces(m, st), [ORANGE, "#f09a4a"], noise=0.05)
        m.box((1.0, 0.12, 0.4), (0, 2.46, 1.55), CYAN, glow=True)
        for s in (-1, 1):
            for y in (1.7, 2.7):
                m.cyl(0.38, 0.3, (s * 0.85, y, 0.38), SOOT, segs=6, rot=(0, math.pi / 2, 0))
        m.box((0.2, 0.9, 0.2), (0, 1.0, 0.45), STEEL[1])
        m.box((1.7, 3.6, 0.25), (0, -1.3, 0.55), STEEL[2])
        for s in (-1, 1):
            for y in (-2.4, -0.3):
                m.cyl(0.33, 0.28, (s * 0.95, y, 0.33), SOOT, segs=6, rot=(0, math.pi / 2, 0))
        for k, y in enumerate((-2.4, -1.25, -0.1)):
            _bin(m, rng, 0, y, z=0.68, full=k != 1)
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


# --- works scenery: Refinery Nine's plant, the canyon's pipe crews, the lake's run-off --------------

ROCK = ["#5a3a26", "#7a5236", "#9a6c48", "#b88a62"]
SCAR = "#3a2a20"
CRUST = ["#8a8a70", "#c8c49a", "#ecead0"]
SULPHUR = ["#a8b02a", "#dce83a", "#f6ff8a"]


def _vessel_x(m, x0, x1, y, z, rad, cols, caps=ORANGE):
    """A horizontal vessel along x with domed ends, faceted."""
    st = mark(m)
    m.cyl(rad, x1 - x0, (x0, y, z), cols[1], segs=8, rot=(0, math.pi / 2, 0))
    for x in (x0, x1):
        m.ball(rad, (x, y, z), cols[1], subdiv=1, scale=(0.5, 1, 1))
    facet(m, new_faces(m, st), cols, noise=0.04)
    for x in (x0 + 0.3, x1 - 0.5):
        m.cyl(rad + 0.06, 0.2, (x, y, z), caps, segs=8, rot=(0, math.pi / 2, 0))


def _wheel(m, x, y, z, col=RED):
    m.cyl(0.12, 0.4, (x, y, z), STEEL[1], segs=4)
    ring(m, 0.36, 0.1, z + 0.4, col, n=6, h=0.1, loc=(x, y))


def process_unit(v):
    """Refinery plant on its own pad. v0 a heat-exchanger skid; v1 a reactor in its platform ring,
    the fired heater beside it glowing through its louvres; v2 a loading bay, a tanker under the arm."""
    r = root("cinder_process_unit", v)
    rng = random.Random(3800 + v)
    m = Model(f"cinder_process_unit_{v}", 3800 + v)
    st = mark(m)
    m.box((7.0, 6.0, 0.3), (0, 0, 0.1), CONCRETE[1])
    facet(m, new_faces(m, st), CONCRETE, noise=0.04)
    m.box((7.0, 0.3, 0.06), (0, -2.85, 0.27), HAZARD)
    if v == 0:
        for y, cols in ((-1.3, PAINT), (1.0, [COPPER[1], COPPER[2], COPPER[3], COPPER[4]])):
            for x in (-2.0, 1.4):
                m.box((0.6, 1.4, 1.0), (x, y, 0.75), CONCRETE[2])                    # saddles
            _vessel_x(m, -2.9, 2.4, y, 1.7, 0.85, cols)
        limb(m, (2.6, -1.3, 1.7), (3.1, -1.3, 1.7), 0.35, 0.35, STEEL[2], segs=6)
        limb(m, (3.1, -1.3, 1.7), (3.1, 1.0, 3.0), 0.3, 0.3, STEEL[2], segs=6)
        limb(m, (3.1, 1.0, 3.0), (2.6, 1.0, 1.9), 0.3, 0.3, STEEL[2], segs=6)
        limb(m, (-3.1, 1.0, 1.7), (-3.1, 2.6, 0.5), 0.3, 0.3, COPPER[2], segs=6)
        m.box((1.4, 0.9, 0.8), (-1.4, 2.5, 0.65), STEEL[1])                           # the pump and motor
        m.cyl(0.4, 0.8, (-0.6, 2.5, 0.65), PAINT[3], segs=6, rot=(0, math.pi / 2, 0))
        m.box((0.4, 0.1, 0.25), (-1.4, 2.03, 0.8), CYAN, glow=True)
        _wheel(m, 0.2, -1.3, 2.5)
        _wheel(m, -1.0, 1.0, 2.5, HAZARD)
    elif v == 1:
        st = mark(m)
        m.cyl(1.25, 4.4, (-1.0, 0.3, 0.25), COPPER[2], segs=10)
        m.ball(1.25, (-1.0, 0.3, 4.65), COPPER[3], subdiv=1, scale=(1, 1, 0.55))
        facet(m, new_faces(m, st), COPPER, noise=0.05)
        m.cyl(0.35, 0.5, (-1.0, 0.3, 5.2), STEEL[1], segs=6)
        ring(m, 1.75, 0.8, 3.0, STEEL[0], n=10, h=0.15)                               # the platform
        ring(m, 2.1, 0.12, 3.5, HAZARD, n=10, h=0.12)
        for k in range(3):
            a = k / 3 * math.tau + 0.4
            limb(m, (-1.0 + math.cos(a) * 1.9, 0.3 + math.sin(a) * 1.9, 0.25),
                 (-1.0 + math.cos(a) * 1.9, 0.3 + math.sin(a) * 1.9, 3.0), 0.1, 0.1, STEEL[1], segs=4)
        m.box((0.6, 0.25, 3.0), (-1.0, -1.85, 1.75), STEEL[2])                        # the ladder
        # the fired heater: a box furnace, its louvres glowing, a short stack
        st = mark(m)
        m.box((2.6, 3.2, 2.2), (2.0, 0.6, 1.35), PAINT[1])
        facet(m, new_faces(m, st), PAINT, noise=0.03)
        for k in range(3):
            m.box((2.66, 0.35, 0.18), (2.0, -0.4 + k * 0.7, 0.9 + 0.0), FLAME[1], glow=True)
        m.box((0.12, 2.6, 0.5), (3.32, 0.6, 1.2), FLAME[0], glow=True)
        m.cyl(0.45, 2.4, (2.4, 1.4, 2.45), SOOT, segs=6)
        m.cyl(0.5, 0.25, (2.4, 1.4, 4.6), RED, segs=6)
        limb(m, (0.7, 0.6, 1.8), (-0.0, 0.4, 2.3), 0.28, 0.28, STEEL[2], segs=6)
        light(r, (3.6, 0.6, 1.2), FLAME[1], radius=4, intensity=0.6, flicker=0.3, halo=False)
        emitter(r, (2.4, 1.4, 5.0), "smoke")
    else:
        # a tanker at the loading arm
        for s in (-1, 1):
            for y in (-2.0, -1.0, 1.8):
                m.cyl(0.38, 0.35, (s * 1.0 - (0.18 if s < 0 else 0.0) + (0.0 if s < 0 else -0.17), y, 0.62), SOOT, segs=6,
                      rot=(0, math.pi / 2, 0))
        m.box((1.9, 5.2, 0.3), (0, -0.2, 0.8), STEEL[0])
        st = mark(m)
        m.cyl(0.95, 4.0, (0, -2.6, 1.9), PAINT[2], segs=8, rot=(-math.pi / 2, 0, 0))
        facet(m, new_faces(m, st), PAINT, noise=0.04)
        m.cyl(1.0, 0.3, (0, -0.8, 1.9), ORANGE, segs=8, rot=(-math.pi / 2, 0, 0))
        m.box((0.6, 0.6, 0.2), (0, -1.4, 2.9), STEEL[1])                              # the hatch
        st = mark(m)
        m.box((1.9, 1.6, 1.6), (0, 2.3, 1.65), ORANGE)
        facet(m, new_faces(m, st), [ORANGE, "#f09a4a"], noise=0.04)
        m.box((1.6, 0.12, 0.5), (0, 3.12, 2.0), CYAN, glow=True)
        # the gantry and its arm swung over the hatch
        m.box((0.6, 0.6, 4.4), (2.4, -1.4, 2.4), PAINT[2])
        m.box((2.2, 2.2, 0.25), (2.4, -1.4, 4.4), STEEL[0])
        m.box((2.3, 0.15, 0.4), (2.4, -2.45, 4.6), HAZARD)
        limb(m, (2.4, -1.4, 4.0), (0.3, -1.4, 4.2), 0.2, 0.2, COPPER[2], segs=5)
        limb(m, (0.3, -1.4, 4.2), (0, -1.4, 3.1), 0.2, 0.2, COPPER[2], segs=5)
        limb(m, (2.4, -1.4, 0.3), (3.3, 2.5, 0.3), 0.3, 0.3, COPPER[1], segs=6)
        m.cyl(0.25, 0.2, (2.4, -1.4, 4.55), RED, segs=5, glow=True)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def control_hut(v):
    """v0 the unit's control room: white ceramic modules, a long cyan window band, roof plant and a
    radio mast; v1 a substation: transformers, insulators, a fence round it, a hazard board."""
    r = root("cinder_control_hut", v)
    rng = random.Random(3820 + v)
    m = Model(f"cinder_control_hut_{v}", 3820 + v)
    if v == 0:
        m.box((6.6, 4.4, 0.3), (0, 0, 0.1), CONCRETE[1])
        st = mark(m)
        m.box((5.6, 3.0, 2.4), (0, 0.3, 1.45), PAINT[2])
        facet(m, new_faces(m, st), PAINT, noise=0.03)
        m.box((5.8, 3.2, 0.25), (0, 0.3, 2.75), PAINT[3])
        m.box((5.0, 0.12, 0.55), (0, -1.22, 1.8), CYAN, glow=True)
        m.box((5.62, 0.14, 0.2), (0, -1.22, 1.25), ORANGE)
        for x in (-1.6, 0.4):
            m.box((1.4, 1.2, 0.6), (x, 0.6, 3.15), STEEL[2])
            m.cyl(0.4, 0.1, (x, 0.6, 3.46), SOOT, segs=8)
        limb(m, (2.2, 1.2, 2.8), (2.2, 1.2, 6.6), 0.1, 0.06, STEEL[2], segs=4)
        m.ball(0.22, (2.2, 1.2, 6.7), RED, subdiv=0, glow=True)
        for k in range(4):                                                           # the stair
            m.box((0.9, 0.4, 0.15), (3.0, -0.8 + k * 0.4, 0.4 + k * 0.5), STEEL[1])
        light(r, (0, -2.0, 1.8), CYAN, radius=4, intensity=0.5, halo=False)
    else:
        m.box((6.0, 5.0, 0.2), (0, 0, 0.08), "#4a4846")
        for s in (-1, 1):
            m.box((6.0, 0.12, 1.1), (0, s * 2.45, 0.6), STEEL[2])
            m.box((0.12, 5.0, 1.1), (s * 2.95, 0, 0.6), STEEL[2])
        for k, x in enumerate((-1.5, 1.2)):
            st = mark(m)
            m.box((1.8, 1.6, 1.8), (x, 0.4, 1.0), "#4a5a52")
            for i in range(4):
                m.box((0.12, 1.9, 1.3), (x - 0.8 + i * 0.53, 0.4, 0.9), "#3a4842")
            facet(m, new_faces(m, st), ["#2e3a34", "#4a5a52", "#6a7a70"], noise=0.05)
            for i in range(3):
                x2 = x - 0.55 + i * 0.55
                m.cyl(0.14, 0.9, (x2, 0.4, 1.9), "#c8b89a", segs=5)
                for z in (2.1, 2.4, 2.7):
                    m.cyl(0.24, 0.08, (x2, 0.4, z), "#e8dcc0", segs=5)
        m.box((1.2, 0.12, 0.8), (0, -2.55, 1.0), HAZARD)
        m.box((0.6, 0.14, 0.4), (0, -2.6, 1.0), SOOT)
        m.cyl(0.18, 0.18, (2.7, -2.2, 1.15), CYAN, segs=5, glow=True)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def manifold(v):
    """A self-contained knot of pipeline: v0 risers out of the ground into a header, valve wheels
    on each; v1 a pig trap, the fat orange barrel and its door on saddles, a gauge on a post."""
    r = root("cinder_manifold", v)
    rng = random.Random(3840 + v)
    m = Model(f"cinder_manifold_{v}", 3840 + v)
    st = mark(m)
    m.box((6.0, 4.4, 0.3), (0, 0, 0.1), CONCRETE[1])
    facet(m, new_faces(m, st), CONCRETE, noise=0.04)
    if v == 0:
        _pipe_x(m, -2.8, 2.8, 0.9, 1.6, 0.45, COPPER[1:], flanges=2.0)
        for i, x in enumerate((-2.0, -0.4, 1.2, 2.4)):
            col = (PAINT[2], COPPER[2], STEEL[2], ORANGE)[i]
            limb(m, (x, -1.6, 0.2), (x, -1.6, 1.2), 0.3, 0.3, col, segs=6)
            limb(m, (x, -1.6, 1.2), (x, 0.6, 1.4), 0.3, 0.3, col, segs=6)
            m.cyl(0.42, 0.25, (x, -1.6, 0.7), STEEL[0], segs=6)
            _wheel(m, x, -0.5, 1.4, RED if i % 2 else HAZARD)
        m.box((0.7, 0.5, 1.1), (-2.6, -1.8, 0.75), PAINT[3])
        m.box((0.4, 0.1, 0.3), (-2.6, -2.06, 1.0), CYAN, glow=True)
    else:
        for x in (-1.6, 1.2):
            m.box((0.5, 1.2, 0.9), (x, 0, 0.7), CONCRETE[2])
        st = mark(m)
        m.cyl(0.8, 4.0, (-2.4, 0, 1.6), ORANGE, segs=8, rot=(0, math.pi / 2, 0))
        facet(m, new_faces(m, st), [RUST[3], ORANGE, "#f09a4a"], noise=0.05)
        m.cyl(0.55, 1.6, (1.6, 0, 1.6), STEEL[2], segs=8, rot=(0, math.pi / 2, 0))
        m.cyl(1.0, 0.35, (-2.75, 0, 1.6), STEEL[1], segs=8, rot=(0, math.pi / 2, 0))   # the closure
        m.box((0.2, 0.9, 0.2), (-2.95, 0, 2.3), HAZARD)
        limb(m, (0.2, 0, 2.2), (0.2, 0, 2.9), 0.15, 0.15, STEEL[1], segs=4)
        m.cyl(0.35, 0.15, (0.2, 0, 2.9), PAINT[3], segs=6)
        m.cyl(0.2, 0.06, (0.2, 0, 3.05), CYAN, segs=6, glow=True)
        limb(m, (3.0, 0, 1.6), (3.0, 0, 0.0), 0.5, 0.5, STEEL[2], segs=6)
        _wheel(m, 0.9, 0, 2.15)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def rubble(v):
    """Blast rock from cutting the canyon: angular slabs and chunks heaped where they fell, drill
    holes in the faces, survey paint. v0 a heap, v1 a split slab tipped up, v2 a scatter of chunks."""
    r = root("cinder_rubble", v)
    rng = random.Random(3860 + v)
    m = Model(f"cinder_rubble_{v}", 3860 + v)
    spots = ([(0, 0, 1.6, 1.4), (1.6, 0.8, 1.0, 0.9), (-1.4, 1.0, 0.9, 0.8), (0.4, -1.6, 0.8, 0.6), (-1.2, -1.2, 0.6, 0.5)],
             [(0, 0, 1.0, 1.0), (2.0, 1.0, 0.7, 0.6), (-1.8, -1.2, 0.5, 0.4)],
             [(rng.uniform(-3, 3), rng.uniform(-3, 3), rng.uniform(0.4, 0.8), 0.5) for _ in range(7)])[v]
    for i, (x, y, rad, h) in enumerate(spots):
        st = mark(m)
        if v == 1 and i == 0:
            m.box((3.6, 1.0, 2.6), (x, y, 1.0), ROCK[2], rot=(0.25, 0.3, rng.uniform(0, 1)))
        else:
            m.ball(rad, (x, y, h * 0.35), ROCK[2], subdiv=0, scale=(1.2, 1, h / rad), jitter=rad * 0.15,
                   rot=(0, 0, rng.uniform(0, math.tau)))
        facet(m, new_faces(m, st), ROCK, noise=0.12)
    if v == 1:
        for k in range(3):                                                             # drill holes, half-pipes
            m.box((0.3, 0.3, 2.2), (-1.0 + k * 1.0, -0.42, 1.2), SCAR, rot=(0.25, 0.3, 0))
    for k in range(3 if v != 2 else 1):                                                # the survey stake
        a = rng.uniform(0, math.tau)
        sx, sy = math.cos(a) * 3.0, math.sin(a) * 3.0
        if k == 0:
            m.box((0.18, 0.18, 1.4), (sx, sy, 0.7), PAINT[3])
            m.box((0.4, 0.2, 0.3), (sx, sy, 1.3), ORANGE)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def racer(v):
    """The night racers' canyon. v0 a racer that didn't make the bend, nose-down and burnt out;
    v1 a checkpoint they built from a pipe offcut and stolen lamps, chequer board on top."""
    r = root("cinder_racer", v)
    rng = random.Random(3880 + v)
    m = Model(f"cinder_racer_{v}", 3880 + v)
    if v == 0:
        st = mark(m)
        m.prism([(-0.5, 0), (0.5, 0), (0.3, 0.7), (-0.3, 0.7)], 4.6, (0, 0, 0), "#3a3a44")
        xform(m, st, M((0, 0, 0.1), (0.18, 0, 0.3)))
        facet(m, new_faces(m, st), ["#24242a", "#3a3a44", "#5a5a66"], noise=0.05)
        for s in (-1, 1):
            st = mark(m)
            m.box((1.9, 1.2, 0.15), (s * 1.3, 0.2, 0.35), "#a8342a", rot=(0, s * 0.3, 0.3))
            facet(m, new_faces(m, st), ["#6a2420", "#a8342a", "#d85a3a"], noise=0.05)
        m.box((0.7, 0.4, 0.4), (-0.6, -1.9, 0.5), SOOT, rot=(0, 0, 0.3))
        m.box((2.4, 0.5, 0.12), (-0.4, 1.6, 0.4), HAZARD, rot=(0, 0, 0.3))           # its racing stripe
        m.slab([(-1.4, 2.0), (0.4, 1.2), (2.2, 2.6), (1.0, 4.6), (-1.6, 4.0)], -0.02, 0.04, SOOT)   # the scorch
        for k in range(3):                                                             # the furrow it ploughed
            m.box((0.5, 1.6, 0.18), (0.6 + k * 0.25, -3.2 - k * 1.5, 0.05), ROCK[1], rot=(0, 0, 0.3))
        m.ball(0.35, (0.2, 1.0, 0.8), FLAME[1], subdiv=0, glow=True)
        light(r, (0.2, 1.0, 1.2), FLAME[1], radius=3, intensity=0.5, flicker=0.4, halo=False)
        emitter(r, (0.2, 1.0, 1.4), "smoke")
    else:
        st = mark(m)
        m.cyl(0.8, 2.6, (0, 0, 0), RUST[2], segs=7)
        facet(m, new_faces(m, st), RUST, noise=0.1)
        m.cyl(0.85, 0.3, (0, 0, 1.0), ORANGE, segs=7)
        for i in range(4):                                                             # a chequer board
            for j in range(2):
                m.box((0.55, 0.12, 0.55), (-0.82 + i * 0.55, 0, 3.0 + j * 0.55),
                      "#f4f2ea" if (i + j) % 2 else SOOT)
        limb(m, (0, 0, 2.6), (0, 0, 3.3), 0.1, 0.1, STEEL[2], segs=4)
        for k in range(3):
            a = k / 3 * math.tau
            x, y = math.cos(a) * 2.2, math.sin(a) * 2.2
            m.box((0.5, 0.5, 0.5), (x, y, 0.25), "#3a3a44", rot=(0, 0, a))
            m.cyl(0.2, 0.2, (x, y, 0.5), ORANGE if k else CYAN, segs=5, glow=True)
        m.slab([(-0.7, -2.5), (0.7, -2.5), (0.7, 2.5), (-0.7, 2.5)], -0.02, 0.04, "#d8d0b8")   # a painted line
        light(r, (0, 0, 3.4), ORANGE, radius=5, intensity=0.6, flicker=0.15)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def pipe_spool(v):
    """The pipe crews' laydown: v0 new pipe sections stacked on timbers, end caps in company orange;
    v1 a cable drum and a welding rig, the arc lit cyan-white."""
    r = root("cinder_pipe_spool", v)
    rng = random.Random(3900 + v)
    m = Model(f"cinder_pipe_spool_{v}", 3900 + v)
    if v == 0:
        for x in (-2.0, 0.0, 2.0):
            m.box((0.4, 4.0, 0.3), (x, 0, 0.15), BRONZE[2])
        for layer, (n, z) in enumerate(((4, 0.75), (3, 1.6), (2, 2.45))):
            for i in range(n):
                y = (i - (n - 1) / 2) * 0.95
                st = mark(m)
                m.cyl(0.45, 6.0, (-3.0, y, z), STEEL[2], segs=7, rot=(0, math.pi / 2, 0))
                facet(m, new_faces(m, st), [STEEL[1], STEEL[2], STEEL[3]] if (i + layer) % 3 else COPPER[1:4],
                      noise=0.05)
                for x in (-3.05, 3.0):
                    m.cyl(0.48, 0.1, (x, y, z), ORANGE, segs=7, rot=(0, math.pi / 2, 0))
    else:
        st = mark(m)
        m.cyl(1.3, 1.1, (-1.2, 0, 1.3), BRONZE[2], segs=10, rot=(math.pi / 2, 0, 0))
        facet(m, new_faces(m, st), BRONZE, noise=0.05)
        m.cyl(1.0, 1.15, (-1.2, 0, 1.3), "#2a2a30", segs=10, rot=(math.pi / 2, 0, 0))
        m.box((0.4, 1.4, 0.4), (-1.2, 0, 0.2), STEEL[1])
        limb(m, (-1.2, 0.0, 2.3), (2.8, 1.6, 0.2), 0.12, 0.12, "#2a2a30", segs=4)
        m.box((1.6, 1.0, 1.0), (1.6, -1.4, 0.5), HAZARD)                             # the welder
        m.box((1.0, 0.1, 0.4), (1.6, -1.92, 0.7), SOOT)
        m.cyl(0.42, 2.4, (0.6, 1.6, 0.42), STEEL[2], segs=7, rot=(0, math.pi / 2, 0))
        m.cyl(0.42, 2.0, (3.0, 1.6, 0.42), STEEL[2], segs=7, rot=(0, math.pi / 2, 0))
        m.ball(0.3, (3.0, 1.6, 0.85), "#e8faff", subdiv=0, glow=True)
        light(r, (3.0, 1.6, 1.0), CYAN, radius=3, intensity=0.8, flicker=0.6, halo=False)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def outfall(v):
    """Where Refinery Nine's run-off reaches the lake: v0 a fat pipe on an apron pouring violet
    sludge down a stained fan; v1 a settling tank, cracked, crusted, overflowing."""
    r = root("cinder_outfall", v)
    rng = random.Random(3920 + v)
    m = Model(f"cinder_outfall_{v}", 3920 + v)
    if v == 0:
        st = mark(m)
        m.box((4.0, 3.0, 1.2), (0, -2.0, 0.4), CONCRETE[1], taper=0.85)
        facet(m, new_faces(m, st), CONCRETE, noise=0.05)
        st = mark(m)
        m.cyl(1.0, 5.0, (0, -5.6, 1.6), RUST[2], segs=8, rot=(-math.pi / 2, 0, 0))
        facet(m, new_faces(m, st), RUST, noise=0.1)
        m.cyl(1.2, 0.4, (0, -0.8, 1.6), STEEL[1], segs=8, rot=(-math.pi / 2, 0, 0))
        m.cyl(0.75, 0.1, (0, -0.42, 1.6), CHEM_LIGHT, segs=8, rot=(-math.pi / 2, 0, 0), glow=True)
        # the pour and the fan it has stained
        m.box((1.0, 1.4, 0.22), (0, 0.1, 1.0), CHEM, glow=True, rot=(-0.9, 0, 0))
        m.slab([(-0.8, 0.4), (0.8, 0.4), (2.6, 3.2), (1.2, 5.4), (-1.6, 5.0), (-2.6, 2.8)], -0.05, 0.06, CHEM, glow=True)
        m.slab([(-1.9, 0.0), (1.9, 0.0), (3.8, 3.4), (2.4, 6.4), (-2.8, 6.0), (-3.9, 3.0)], -0.08, 0.03, "#6a4a7a")
        for k in range(5):
            a = rng.uniform(0, math.tau)
            m.ball(rng.uniform(0.3, 0.5), (math.cos(a) * 2.6, 3.0 + math.sin(a) * 2.2, 0.1), CRUST[2], subdiv=0,
                   scale=(1, 1, 0.5))
        m.box((1.5, 0.12, 1.0), (1.6, -0.5, 1.5), HAZARD)
        m.box((0.6, 0.14, 0.5), (1.6, -0.56, 1.5), SOOT)
        light(r, (0, 1.5, 1.0), CHEM, radius=5, intensity=0.7, halo=False)
    else:
        st = mark(m)
        m.cyl(2.6, 1.6, (0, 0, 0), CONCRETE[1], segs=10)
        jitter(m, new_faces(m, st), 0.08)
        facet(m, new_faces(m, st), CONCRETE, noise=0.06)
        m.cyl(2.25, 0.1, (0, 0, 1.45), CHEM, segs=10, glow=True)
        for k in range(6):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.4, 1.8)
            m.ball(rng.uniform(0.3, 0.55), (math.cos(a) * d, math.sin(a) * d, 1.55), rng.choice(CRUST + SULPHUR[1:]),
                   subdiv=0, scale=(1, 1, 0.4))
        m.box((0.4, 1.8, 1.7), (2.4, 0.4, 0.8), SCAR, rot=(0, 0, 0.2))               # the crack
        m.slab([(2.2, -0.6), (4.8, -1.0), (5.6, 1.4), (3.8, 2.6), (2.3, 1.4)], -0.03, 0.06, CHEM, glow=True)
        for k in range(4):
            a = k / 4 * math.tau + 0.3
            m.box((0.6, 0.6, 0.3), (math.cos(a) * 2.6, math.sin(a) * 2.6, 1.65), STEEL[1], rot=(0, 0, a))
        limb(m, (-2.6, 0, 1.2), (-6.0, 0, 1.2), 0.4, 0.4, RUST[2], segs=6)
        light(r, (0, 0, 2.0), CHEM, radius=4, intensity=0.6, halo=False)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def crust(v):
    """Tailings dried out on the shore: v0 white salt pans in terraced rims; v1 sulphur-yellow crust
    heaved into blisters; v2 violet crystal that grew out of the run-off, glowing at the heart."""
    r = root("cinder_crust", v)
    rng = random.Random(3940 + v)
    m = Model(f"cinder_crust_{v}", 3940 + v)
    if v == 0:
        # evaporation terraces stepping down to one side, like rice paddies of salt
        cx = 0.0
        for k in range(4):
            rad = 2.4 - k * 0.45
            cx += rng.uniform(0.3, 0.6)
            st = mark(m)
            m.cyl(rad, 0.18, (cx, rng.uniform(-0.3, 0.3), k * 0.13), CRUST[1], segs=7)
            jitter(m, new_faces(m, st), 0.18, z=False)
            facet(m, new_faces(m, st), ["#6e6c60", "#9a9684", "#bcb8a0"], noise=0.12)
        m.cyl(0.5, 0.05, (cx, 0, 0.52), "#6a4a8a", segs=6)
    elif v == 1:
        for k in range(7):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0, 2.2)
            st = mark(m)
            m.ball(rng.uniform(0.5, 0.95), (math.cos(a) * d, math.sin(a) * d, 0.0), SULPHUR[1], subdiv=1,
                   scale=(1, 1, 0.55), jitter=0.08)
            facet(m, new_faces(m, st), SULPHUR, noise=0.15)
    else:
        for k in range(6):
            a = k / 6 * math.tau + rng.uniform(-0.3, 0.3)
            tilt = rng.uniform(0.25, 0.6)
            ln = rng.uniform(1.2, 2.4)
            d = Vector((math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt), math.cos(tilt)))
            st = mark(m)
            crystal(m, (math.cos(a) * 0.5, math.sin(a) * 0.5, -0.1), d, rng.uniform(0.3, 0.45), ln, 0.5, CHEM, segs=5)
            facet(m, new_faces(m, st), ["#5a2a8a", "#8a4ad0", (CHEM, True), (CHEM_LIGHT, True)], noise=0.15)
        st = mark(m)
        m.ball(1.4, (0, 0, 0), CRUST[0], subdiv=1, scale=(1.2, 1, 0.35), jitter=0.1)
        facet(m, new_faces(m, st), ["#4a4a40", CRUST[0], CRUST[1]], noise=0.12)
        light(r, (0, 0, 1.5), CHEM, radius=4, intensity=0.5, halo=False)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def blighted_tree(v):
    """An orchard the run-off reached first: a copper tree gone to verdigris, leaves stripped to a
    few green-crusted plates, its company collar still on. v1 has fallen over."""
    r = root("cinder_blighted_tree", v)
    rng = random.Random(3960 + v)
    m = Model(f"cinder_blighted_tree_{v}", 3960 + v)
    m.cyl(0.6, 0.3, (0, 0, -0.05), CRUST[1], segs=6)
    m.cyl(0.65, 0.12, (0, 0, 0.25), RUST[2], segs=6)
    if v == 0:
        st = mark(m)
        limb(m, (0, 0, 0), (0.1, 0, 1.8), 0.3, 0.2, BRONZE[1], segs=5)
        tips = []
        for k in range(4):
            a = k / 4 * math.tau + rng.uniform(0, 0.8)
            tip = (math.cos(a) * 1.4, math.sin(a) * 1.4, 2.6 + rng.uniform(-0.3, 0.5))
            limb(m, (0.1, 0, 1.5), tip, 0.15, 0.06, BRONZE[1], segs=4)
            tips.append(tip)
        facet(m, new_faces(m, st), [VERDIGRIS[0], BRONZE[1], BRONZE[2]], noise=0.2)
        for tip in tips[:3]:
            st = mark(m)
            m.ball(0.55, tip, VERDIGRIS[1], subdiv=0, scale=(1.2, 1, 0.5), jitter=0.06)
            facet(m, new_faces(m, st), VERDIGRIS, noise=0.15)
    else:
        st = mark(m)
        limb(m, (0, 0, 0.3), (0.3, 3.4, 0.6), 0.28, 0.18, BRONZE[1], segs=5)
        for k in range(3):
            limb(m, (0.2, 2.6, 0.5), (rng.uniform(-1.3, 1.5), 3.6 + rng.uniform(0, 0.8), rng.uniform(0.3, 1.2)), 0.13, 0.06,
                 BRONZE[1], segs=4)
        limb(m, (0, 0, 0.2), (0.6, -0.6, 0.6), 0.2, 0.08, BRONZE[2], segs=4)                    # torn roots
        facet(m, new_faces(m, st), [VERDIGRIS[0], BRONZE[1], BRONZE[2]], noise=0.2)
        m.slab([(-1.2, 1.4), (1.6, 1.0), (2.2, 4.4), (-1.4, 4.8)], -0.04, 0.03, "#4a4a3a")
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def sampler(v):
    """Company monitoring on the shore: v0 a sampling post, a cyan readout and a hose into the
    lake; v1 a floating-boom anchor, the boom's orange floats trailing off it."""
    r = root("cinder_sampler", v)
    rng = random.Random(3980 + v)
    m = Model(f"cinder_sampler_{v}", 3980 + v)
    m.box((1.8, 1.8, 0.3), (0, 0, 0.1), CONCRETE[1])
    if v == 0:
        st = mark(m)
        m.box((0.8, 0.6, 2.2), (0, 0, 1.3), PAINT[2])
        facet(m, new_faces(m, st), PAINT, noise=0.03)
        m.box((0.6, 0.12, 0.5), (0, -0.32, 1.8), CYAN, glow=True)
        m.box((0.9, 0.7, 0.18), (0, 0, 2.45), ORANGE)
        limb(m, (0, 0.3, 2.5), (0, 0.3, 3.6), 0.06, 0.06, STEEL[2], segs=4)
        m.ball(0.18, (0, 0.3, 3.65), RED, subdiv=0, glow=True)
        _hose(m, (0.3, 0.4, 0.6), (0.6, 4.5, -0.5), 0.3, 0.12, "#2a2a30")
    else:
        m.box((0.5, 0.5, 1.6), (0, 0, 0.9), STEEL[2])
        m.cyl(0.4, 0.2, (0, 0, 1.7), HAZARD, segs=6)
        for k in range(6):
            p = (0.3 + k * 1.15, 0.6 + math.sin(k * 0.9) * 0.6, 0.15)
            m.cyl(0.4, 0.45, (p[0], p[1], 0), ORANGE if k % 2 == 0 else PAINT[3], segs=6, rot=(0, math.pi / 2, 0))
        limb(m, (0, 0, 1.0), (6.5, 0.9, 0.2), 0.08, 0.08, SOOT, segs=4)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def rack_bay(v):
    """A bay of ground pipe rack: two steel bents carrying a deck of pipes, cable tray on top. v0
    straight, a pipe dropping off to the ground at one end; v1 a corner where the run turns, its
    valve platform lit."""
    r = root("cinder_rack_bay", v)
    rng = random.Random(4000 + v)
    m = Model(f"cinder_rack_bay_{v}", 4000 + v)
    L, W, z = 9.0, 3.4, 3.4
    cols = [COPPER[1:], PAINT, STEEL[1:], [ORANGE, ORANGE, "#f09a4a"], VERDIGRIS]
    for y in (-L / 2 + 0.8, L / 2 - 0.8) if v == 0 else (-L / 2 + 0.8, 0.6):
        for x in (-W / 2, W / 2):
            m.box((0.3, 0.3, z), (x, y, z / 2), HAZARD if v else STEEL[2])
            m.box((0.7, 0.7, 0.3), (x, y, 0.15), CONCRETE[1])
        m.box((W + 0.6, 0.35, 0.3), (0, y, z), STEEL[1])
        m.box((W + 0.6, 0.3, 0.25), (0, y, z - 1.5), STEEL[1])
    if v == 0:
        for i, x in enumerate((-1.2, -0.4, 0.4, 1.2)):
            rad = (0.36, 0.3, 0.42, 0.26)[i]
            st = mark(m)
            m.cyl(rad, L, (x, -L / 2, z + 0.15 + rad), cols[i][1], segs=7, rot=(-math.pi / 2, 0, 0))
            facet(m, new_faces(m, st), cols[i][:3], noise=0.05, bias=-0.15)
        for x in (-0.9, 0.9):
            m.box((0.5, L, 0.12), (x, 0, z - 1.35), "#2a2a30")                         # cable tray
        limb(m, (0.4, L / 2 - 0.3, z + 0.57), (0.4, L / 2 + 1.0, z + 0.57), 0.42, 0.42, STEEL[2], segs=7)
        limb(m, (0.4, L / 2 + 1.0, z + 0.57), (0.4, L / 2 + 1.0, 0.0), 0.42, 0.42, STEEL[2], segs=7)
        _wheel(m, 0.4, L / 2 + 1.0, z + 1.0, RED)
    else:
        # the run comes in along y and turns off along x
        for i, x in enumerate((-1.2, -0.4, 0.4)):
            rad = (0.36, 0.3, 0.42)[i]
            st = mark(m)
            m.cyl(rad, L / 2 + 0.6 + x, (x, -L / 2, z + 0.15 + rad), cols[i][1], segs=7, rot=(-math.pi / 2, 0, 0))
            m.cyl(rad, 4.6 - x, (x, 0.6 + x, z + 0.15 + rad), cols[i][1], segs=7, rot=(0, math.pi / 2, 0))
            m.ball(rad, (x, 0.6 + x, z + 0.15 + rad), cols[i][1], subdiv=1)
            facet(m, new_faces(m, st), cols[i][:3], noise=0.05, bias=-0.15)
        for y in (0.6,):
            for x in (3.4,):
                m.box((0.3, 0.3, z), (x, y, z / 2), HAZARD)
        m.box((1.8, 1.8, 0.15), (2.2, -1.6, 2.0), STEEL[0])                           # the valve platform
        m.box((1.9, 0.12, 0.5), (2.2, -2.5, 2.3), HAZARD)
        _wheel(m, 2.2, -1.6, 2.1, RED)
        m.cyl(0.2, 0.15, (3.0, -0.9, 2.1), CYAN, segs=5, glow=True)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def slick_boom(v):
    """WATER. A containment boom on the tailings: a ring of orange floats on its skirt holding in a
    slick, glossy-dark with a violet sheen; v1 a boom strung off a buoy, half-sunk and drifting."""
    r = root("cinder_slick_boom", v)
    rng = random.Random(4020 + v)
    m = Model(f"cinder_slick_boom_{v}", 4020 + v)
    if v == 0:
        n, R = 14, 4.2
        pts = []
        for k in range(n):
            a = k / n * math.tau
            rr = R * (1 + 0.12 * math.sin(a * 3 + 0.7))
            pts.append((math.cos(a) * rr * 1.2, math.sin(a) * rr))
        m.slab(pts, -0.05, 0.03, "#3e2456")
        inner = [(x * 0.7, y * 0.7) for x, y in pts]
        m.slab(inner, 0.02, 0.05, "#5a2a7a")
        for k in range(4):
            a = rng.uniform(0, math.tau)
            m.slab([(math.cos(a) * 1.5 + dx, math.sin(a) * 1.2 + dy) for dx, dy in ((-0.8, -0.3), (0.6, -0.4), (0.9, 0.3), (-0.5, 0.4))],
                   0.05, 0.07, CHEM, glow=True)
        for k, (x, y) in enumerate(pts):
            a = math.atan2(y, x)
            m.box((0.55, 2.0, 0.4), (x, y, 0.1), ORANGE if k % 3 else PAINT[3], rot=(0, 0, a))
        m.box((0.7, 0.7, 0.9), (pts[0][0] + 0.6, pts[0][1], 0.3), HAZARD)
        m.cyl(0.2, 0.2, (pts[0][0] + 0.6, pts[0][1], 0.75), CYAN, segs=5, glow=True)
    else:
        m.cyl(0.7, 1.0, (0, 0, -0.4), RED, segs=7)
        m.cyl(0.5, 0.6, (0, 0, 0.6), PAINT[3], segs=7, r_top=0.2)
        m.ball(0.2, (0, 0, 1.3), CYAN, subdiv=0, glow=True)
        for k in range(7):
            t = k / 6
            x = 1.2 + t * 7.0
            y = math.sin(t * 3.0) * 1.4
            m.box((0.5, 1.4, 0.35 - 0.03 * k), (x, y, 0.05 - 0.03 * k), ORANGE, rot=(0, 0.15 * (k % 2), 1.4 + math.cos(t * 3) * 0.4))
        m.slab([(1.0, -1.6), (5.0, -2.4), (8.8, -0.6), (6.4, 1.8), (2.0, 1.4)], -0.05, 0.03, "#3e2456")
    m.build(r, rot_z=rng.uniform(0, math.tau))
    if v == 0:
        light(r, (0, 0, 0.8), CHEM, radius=4, intensity=0.4, halo=False)
    return r


def sludge_raft(v):
    """WATER. v0 a skimmer barge: a pontoon deck, its pump and tank, a drum boom swung out, work
    lights in company cyan; v1 a raft of crusted sludge foam, bubbles glowing where it splits."""
    r = root("cinder_sludge_raft", v)
    rng = random.Random(4040 + v)
    m = Model(f"cinder_sludge_raft_{v}", 4040 + v)
    if v == 0:
        for s in (-1, 1):
            st = mark(m)
            m.cyl(0.6, 6.0, (s * 1.5, -3.0, 0.1), ORANGE, segs=7, rot=(-math.pi / 2, 0, 0))
            facet(m, new_faces(m, st), [RUST[3], ORANGE, "#f09a4a"], noise=0.05)
        st = mark(m)
        m.box((4.0, 5.4, 0.25), (0, 0, 0.75), STEEL[1])
        facet(m, new_faces(m, st), STEEL, noise=0.05)
        st = mark(m)
        m.cyl(1.0, 1.6, (0, 1.2, 0.85), PAINT[2], segs=8)
        facet(m, new_faces(m, st), PAINT, noise=0.04)
        m.cyl(1.04, 0.25, (0, 1.2, 1.9), ORANGE, segs=8)
        m.box((1.4, 1.2, 1.1), (-0.9, -1.4, 1.4), PAINT[3])
        m.box((1.0, 0.12, 0.35), (-0.9, -2.02, 1.6), CYAN, glow=True)
        limb(m, (0.8, -1.2, 1.0), (2.6, -3.6, 1.8), 0.14, 0.14, HAZARD, segs=4)
        m.cyl(0.4, 0.8, (2.6, -3.9, 0.0), STEEL[2], segs=6)                           # the skimmer head
        m.cyl(0.5, 0.06, (2.6, -3.9, 0.02), CHEM, segs=7, glow=True)
        for x, y in ((-1.8, 2.5), (1.8, -2.5)):
            m.cyl(0.18, 0.2, (x, y, 0.9), CYAN, segs=5, glow=True)
        light(r, (0, 0, 2.5), CYAN, radius=4, intensity=0.5, halo=False)
    else:
        for k in range(9):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0, 2.6)
            st = mark(m)
            m.ball(rng.uniform(0.7, 1.2), (math.cos(a) * d * 1.3, math.sin(a) * d, 0.0), CRUST[1], subdiv=0,
                   scale=(1.2, 1, 0.3), jitter=0.12)
            facet(m, new_faces(m, st), ["#5a5048", "#8a8070", "#b0a890"], noise=0.15)
        for k in range(4):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.5, 2.0)
            m.ball(rng.uniform(0.25, 0.4), (math.cos(a) * d * 1.3, math.sin(a) * d, 0.25), CHEM_LIGHT, subdiv=0, glow=True)
        m.cyl(0.3, 1.0, (0.8, -0.4, 0.0), RUST[2], segs=6, rot=(0.5, 0.3, 0))           # a drum caught in it
    m.build(r, rot_z=rng.uniform(0, math.tau))
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
        crop_bed(v)
        work_shed(v)
    for v in range(4):
        orchard_row(v)
    for v in range(2):
        picker(v)
        control_hut(v)
        manifold(v)
        racer(v)
        pipe_spool(v)
        outfall(v)
        blighted_tree(v)
        sampler(v)
        rack_bay(v)
        slick_boom(v)
        sludge_raft(v)
    for v in range(3):
        process_unit(v)
        rubble(v)
        crust(v)
