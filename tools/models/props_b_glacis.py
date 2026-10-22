"""GLACIS, the White Furnace: frozen on top, burning underneath. Blue ice spires and aurora light
on the shelf, pink-and-turquoise hot springs, dark snow-laden conifers on the mammoth tundra, and
under the ice an alien machine city waking up in orange."""
from __future__ import annotations

import math
import random

from kit import Model, emitter, light
from props_a_lib import hull
from props_b_kit import (M, collider, crystal, facet, jitter, limb, mark, new_faces, paint, pulse, bob,
                         ring, root, xform)

# ice, dark (deep crevasse blue) to light (sunlit face)
ICE = ["#1f4a96", "#2f6ab8", "#4a90d8", "#7ab8ec", "#b0dcf8", "#e4f6ff"]
ICE_LOW = ["#2a5aa8", "#4a8ad0", "#8ac4ee", "#c8ecff", "#f0faff"]
AURORA = "#7af0e8"                    # the aurora caught in the ice: a cold glow
SNOW = ["#c8d8f0", "#e4eefa", "#f6faff"]
ROCK = ["#2e3648", "#3e4860", "#525e78", "#66728a"]
PINE = ["#163c40", "#1f4a4c", "#28585a"]
PINE_LIGHT = "#336a64"
BARK = "#4a3436"
# hot springs: travertine crust, and pools hot in the middle (turquoise) cooling to orange at the rim
CRUST = ["#c88a7a", "#e0aa98", "#f0ccc0", "#faeae4"]
POOL = ["#4ae0f0", "#9af4e8", "#ffe07a", "#ff9a4a", "#ff6a7a"]
ALGAE = ["#ff7aa0", "#ff9ab8"]
# the Waking Engine
METAL = ["#1e2230", "#2a3040", "#3e4858", "#5a6a7a", "#7a8a9a"]
HOT = "#ff8a2a"
HOT_DEEP = "#ff5a14"
HOT_PALE = "#ffc46a"


# --- the Aurora Shelf ------------------------------------------------------------------

def _spire_cluster(m, rng, base, main_h, main_r, sats, lean=(0.0, 0.0)):
    """One tall crystal leaning a touch, with smaller ones bursting out of its foot."""
    d = (math.sin(lean[1]), -math.sin(lean[0]), 1)
    crystal(m, base, d, main_r, main_h, main_r * 2.4, ICE[0], segs=6, twist=rng.uniform(0, 1))
    for i in range(sats):
        a = rng.uniform(0, math.tau)
        t = rng.uniform(0.35, 0.75)
        off = (base[0] + math.cos(a) * main_r * 0.7, base[1] + math.sin(a) * main_r * 0.7, -0.4)
        dd = (math.cos(a) * math.sin(t), math.sin(a) * math.sin(t), math.cos(t))
        r = rng.uniform(0.45, 0.85) * main_r
        crystal(m, off, dd, r, rng.uniform(2.0, 5.5) * main_r, r * 2.2, ICE[0], segs=rng.choice((5, 6)),
                twist=rng.uniform(0, 1))


def ice_spire(v):
    """OBSTACLE: a spire of blue ice, faceted light and dark so it reads as glassy, with a seam of
    aurora light frozen in it."""
    r = root("ice_spire", v)
    rng = random.Random(100 + v)
    m = Model(f"ice_spire_{v}", 100 + v)
    if v == 0:
        _spire_cluster(m, rng, (0, 0, -0.5), 12.5, 1.5, 5, lean=(0.06, -0.05))
        cols = [(0, 0, 1.9)]
    else:
        _spire_cluster(m, rng, (-1.3, 0.2, -0.5), 11.5, 1.25, 3, lean=(0.05, -0.12))
        _spire_cluster(m, rng, (1.4, -0.4, -0.5), 9.6, 1.1, 3, lean=(-0.06, 0.14))
        cols = [(-1.6, 0.3, 1.6), (1.6, -0.4, 1.5)]
    facet(m, m.bm.faces, ICE, noise=0.18)
    # a few faces catch the aurora: a cold glow running up the shafts
    glow = m._slot(AURORA, True)
    for f in list(m.bm.faces):
        c = f.calc_center_median()
        if c.z > 2 and abs(f.normal.z) < 0.5 and rng.random() < 0.07:
            f.material_index = glow
    # a snow skirt round the foot
    s = mark(m)
    m.cyl(3.2, 0.7, (0, 0, -0.2), SNOW[1], segs=9, r_top=2.0)
    jitter(m, new_faces(m, s), 0.25)
    facet(m, new_faces(m, s), SNOW, noise=0.1)
    m.build(r)
    for x, y, rad in cols:
        collider(r, x, y, rad)
    light(r, (0, 0, 6), AURORA, radius=7, intensity=0.5, halo=False)
    return r


def _shard(m, rng, size, mat, cols, snow=True, n=10):
    """An angular slab of ice: the hull of points on the faces of a box, moved by `mat`; faces
    that look straight up get snow."""
    st = mark(m)
    sx, sy, sz = size
    pts = []
    for _ in range(n):
        p = [rng.uniform(-sx, sx) / 2, rng.uniform(-sy, sy) / 2, rng.uniform(-sz, sz) / 2]
        k = rng.randrange(3)
        p[k] = size[k] / 2 * (1 if rng.random() < 0.5 else -1)
        pts.append(p)
    for cx in (-1, 1):
        for cy in (-1, 1):
            for cz in (-1, 1):
                if rng.random() < 0.7:
                    pts.append((cx * sx / 2 * rng.uniform(0.75, 1), cy * sy / 2 * rng.uniform(0.75, 1), cz * sz / 2))
    hull(m, pts, cols[0])
    fs = xform(m, st, mat)
    facet(m, fs, cols, noise=0.14, bias=-0.2)
    if snow:
        paint(m, [f for f in fs if f.normal.z > 0.82], lambda f: SNOW[2] if f.normal.z > 0.93 else SNOW[1])
    return fs


def ice_block(v):
    """Ice on the shelf, four ways: a tabular berg with a blue stratum through it and the aurora
    caught in one cliff (v0); a slab broken and tumbled, one piece reared up on edge (v1); a
    pressure ridge, plates shoved up in a row (v2); a hoodoo, the wind having carved its foot
    thin under a snow cap (v3)."""
    r = root("ice_block", v)
    rng = random.Random(120 + v)
    m = Model(f"ice_block_{v}", 120 + v)
    if v == 0:
        n = 8
        pts = [(math.cos(a) * rng.uniform(1.9, 2.7), math.sin(a) * rng.uniform(1.4, 2.0))
               for a in ((i + rng.uniform(-0.2, 0.2)) / n * math.tau for i in range(n))]
        sc = lambda k, dx=0.0, dy=0.0: [(x * k + dx, y * k + dy) for x, y in pts]
        facet(m, m.slab(sc(1.0), -0.3, 0.9, ICE_LOW[0], top=sc(0.96)), ICE_LOW, noise=0.1, bias=-0.25)
        facet(m, m.slab(sc(0.95), 0.9, 1.15, ICE[1], top=sc(0.93)), ICE[:3], noise=0.1)
        facet(m, m.slab(sc(0.93, 0.1, -0.05), 1.15, 1.75, ICE_LOW[1], top=sc(0.86, 0.12, -0.05)), ICE_LOW, noise=0.1,
              bias=-0.15)
        facet(m, m.slab(sc(0.85, 0.1, -0.05), 1.75, 1.95, SNOW[2], top=sc(0.76, 0.05, 0.0)), SNOW, noise=0.05, bias=0.2)
        # a crack across the top, and the aurora frozen in the cliff under it
        m.box((3.2, 0.32, 0.12), (0.3, 0.0, 1.93), ICE[1], rot=(0, 0, 0.5))
        m.box((0.34, 0.12, 0.9), (pts[1][0] * 0.97, pts[1][1] * 0.97, 0.75), AURORA, rot=(0, 0, math.atan2(pts[1][1], pts[1][0]) + math.pi / 2), glow=True)
    elif v == 1:
        _shard(m, rng, (3.2, 2.4, 0.8), M((-0.6, -0.3, 0.2), (0.08, -0.06, 0.3)), ICE_LOW)
        _shard(m, rng, (2.4, 1.8, 0.7), M((1.5, 0.9, 0.9), (0.15, 1.05, 2.0)), ICE_LOW)       # reared up on edge
        _shard(m, rng, (1.6, 1.2, 0.6), M((-1.8, 1.5, 0.2), (0.3, 0.2, 1.1)), ICE_LOW)
        _shard(m, rng, (1.0, 0.8, 0.5), M((0.9, -1.8, 0.1), (0.4, -0.3, 0.4)), ICE_LOW)
        _shard(m, rng, (0.8, 0.6, 0.5), M((2.6, -0.6, 0.1), (0.2, 0.5, 2.4)), ICE_LOW)
    elif v == 2:
        for i in range(6):
            w = rng.uniform(1.0, 1.7)
            tilt = (0.55 if i % 2 else -0.45) + rng.uniform(-0.2, 0.2)
            _shard(m, rng, (w, 0.55, rng.uniform(1.6, 2.6)),
                   M((i * 0.95 - 2.4, rng.uniform(-0.35, 0.35), 0.45), (tilt, rng.uniform(-0.2, 0.2), rng.uniform(-0.3, 0.3))),
                   ICE_LOW, n=8)
        st = mark(m)
        m.ball(1.0, (0, 0.2, -0.1), SNOW[1], subdiv=1, scale=(3.4, 1.3, 0.45), jitter=0.12)
        facet(m, new_faces(m, st), SNOW, bias=0.2)
    else:
        # the hoodoo: a waisted pedestal under a broad cap
        st = mark(m)
        pts = []
        for z, rr in ((-0.3, 1.4), (0.4, 0.9), (1.4, 0.65), (2.1, 1.1)):
            a0 = rng.uniform(0, math.tau)
            for k in range(6):
                a = a0 + k / 6 * math.tau
                pts.append((math.cos(a) * rr * rng.uniform(0.85, 1.1), math.sin(a) * rr * rng.uniform(0.85, 1.1), z))
        hull(m, pts, ICE_LOW[0])
        facet(m, new_faces(m, st), ICE_LOW, noise=0.15, bias=-0.3)
        _shard(m, rng, (3.6, 3.0, 0.8), M((0.25, 0.1, 2.4), (0.06, -0.05, 0.4)), ICE_LOW)
        st = mark(m)
        m.ball(1.5, (0.15, 0.15, 2.82), SNOW[2], subdiv=1, scale=(1.05, 0.9, 0.28), jitter=0.1)
        facet(m, new_faces(m, st), SNOW, noise=0.05, bias=0.3)
        _shard(m, rng, (1.2, 0.9, 0.6), M((1.9, -1.2, 0.1), (0.3, 0.2, 0.7)), ICE_LOW)
    m.build(r, rot_z=rng.uniform(0, 1))
    return r


def snow_rock(v):
    """Dark slate under a thick cap of snow: from above a white blob with a dark rim."""
    r = root("snow_rock", v)
    rng = random.Random(140 + v)
    m = Model(f"snow_rock_{v}", 140 + v)
    spots = {0: [(0, 0, 1.3)], 1: [(0, 0, 1.0), (1.3, 0.6, 0.7), (-0.9, 1.0, 0.55)], 2: [(0, 0, 1.6)]}[v]
    for x, y, s in spots:
        flat = 0.45 if v == 2 else 0.75
        st = mark(m)
        m.ball(s, (x, y, s * 0.35), ROCK[0], subdiv=1, scale=(1.2, 1.0, flat), jitter=0.13 * s)
        facet(m, new_faces(m, st), ROCK, noise=0.15)
        st = mark(m)
        m.ball(s * 0.82, (x - 0.1 * s, y + 0.08 * s, s * 0.35 + s * flat * 0.38), SNOW[2], subdiv=1,
               scale=(1.12, 0.92, flat * 0.55), jitter=0.06 * s)
        facet(m, new_faces(m, st), SNOW, noise=0.08, bias=0.3)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


# --- Rosewater Springs ------------------------------------------------------------------

def steam_vent(v):
    """A hot spring: terraced travertine round a pool that's turquoise in the hot middle, gold, then
    orange at the rim. Steams."""
    r = root("steam_vent", v)
    rng = random.Random(160 + v)
    m = Model(f"steam_vent_{v}", 160 + v)
    if v == 0:
        z = 0
        for i, (rad, h) in enumerate(((2.6, 0.35), (2.15, 0.35), (1.7, 0.35))):
            st = mark(m)
            m.cyl(rad, h, (0.15 * i, -0.1 * i, z), CRUST[0], segs=10, r_top=rad * 0.97)
            jitter(m, new_faces(m, st), 0.06, z=False)
            facet(m, new_faces(m, st), CRUST, noise=0.1, bias=0.1)
            # the terrace's own little pool, a pink crescent
            if i < 2:
                m.cyl(rad * 0.88, 0.04, (0.15 * i - 0.25, -0.1 * i - 0.35, z + h), ALGAE[i % 2], segs=10)
            z += h
        cx, cy = 0.3, -0.2
        for k, (rad, col) in enumerate(((1.45, "#d8705a"), (1.15, "#f0a860"), (0.85, "#3aa8c0"), (0.4, "#c8fff8"))):
            m.cyl(rad, 0.05, (cx, cy, z + 0.01 + k * 0.012), col, segs=10, glow=k == 3)
        emitter(r, (cx, cy, z + 0.2), "steam")
        light(r, (cx, cy, z + 0.6), "#7af0f0", radius=4, intensity=0.5, halo=False)
    else:
        # a fissure: a crusted chimney with an orange throat, pink algae spilling down from it
        st = mark(m)
        for _ in range(5):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.4, 1.2)
            m.cyl(rng.uniform(0.6, 0.9), rng.uniform(1.0, 2.2), (math.cos(a) * d, math.sin(a) * d, 0), CRUST[0],
                  segs=6, r_top=rng.uniform(0.25, 0.4))
        jitter(m, new_faces(m, st), 0.08)
        facet(m, new_faces(m, st), CRUST, noise=0.15)
        m.cyl(0.55, 0.12, (0, 0, 2.05), "#3a2a2a", segs=6)
        m.cyl(0.38, 0.1, (0, 0, 2.15), HOT, segs=6, glow=True)
        for a, d, s in ((0.3, 2.1, 1.0), (2.4, 2.0, 0.8), (4.3, 2.3, 0.9)):
            st = mark(m)
            m.cyl(1.0 * s, 0.08, (math.cos(a) * d, math.sin(a) * d, 0), CRUST[3], segs=8)
            m.cyl(0.8 * s, 0.05, (math.cos(a) * d, math.sin(a) * d, 0.08), ALGAE[0], segs=8)
            m.cyl(0.4 * s, 0.05, (math.cos(a) * d, math.sin(a) * d, 0.1), "#3aa8c0", segs=8)
        emitter(r, (0, 0, 2.4), "steam")
        light(r, (0, 0, 2.6), HOT, radius=4, intensity=0.6, flicker=0.2)
    m.build(r)
    return r


SPRUCE = ["#10243a", "#173452", "#20486a", "#2e6082"]   # rime-spruce: deep blue-teal needles
SPRUCE_BARK = ["#2a2230", "#3e3040", "#544456"]


def _lens(m, rng, cx, cy, z, rad, th, droop, cols, n=None, squash=(1.0, 1.0), bias=0.0):
    """A flat plate of needles, irregular and a little drooping at the rim: the convex hull of a
    jittered rim (dropped by `droop`), an inner ring on top and a point underneath."""
    n = n or rng.choice((5, 6, 7))
    a0 = rng.uniform(0, math.tau)
    rim = []
    for i in range(n):
        a = a0 + (i + rng.uniform(-0.25, 0.25)) / n * math.tau
        d = rad * rng.uniform(0.72, 1.1)
        rim.append((math.cos(a) * d * squash[0], math.sin(a) * d * squash[1], a))
    pts = [(cx + x, cy + y, z - droop * rng.uniform(0.6, 1.2)) for x, y, _ in rim]
    pts += [(cx + x * 0.45, cy + y * 0.45, z + th) for x, y, _ in rim]
    pts.append((cx, cy, z - th * 0.5 - droop))
    f = hull(m, pts, cols[0])
    facet(m, f, cols, noise=0.12, bias=bias)
    return rim


def _arm(m, rng, c, z, a, length, w, th, droop, cols, snow=True):
    """One bough of a rime-spruce: a flat, leaf-shaped blade of needles from the trunk out, its tip
    drooping, a ridge of snow along its back."""
    ca, sa = math.cos(a), math.sin(a)
    px, py = -sa, ca
    def at(t, side, dz):
        return (c[0] + ca * length * t + px * side, c[1] + sa * length * t + py * side, z + dz)
    pts = [at(0, -w * 0.45, th), at(0, w * 0.45, th), at(0, 0, -th),
           at(0.55, -w, th * 0.6 - droop * 0.35), at(0.55, w, th * 0.6 - droop * 0.35), at(0.55, 0, -th - droop * 0.35),
           at(1.0, -w * 0.18, -droop), at(1.0, w * 0.18, -droop), at(1.0, 0, -droop - th * 0.5)]
    for i in range(3, 6):
        q = pts[i]
        pts[i] = (q[0] + rng.uniform(-0.06, 0.06), q[1] + rng.uniform(-0.06, 0.06), q[2])
    facet(m, hull(m, pts, cols[0]), cols, noise=0.12, bias=-0.05)
    if snow:
        sp = [at(0.05, -w * 0.22, th + 0.02), at(0.05, w * 0.22, th + 0.02), at(0.05, 0, th + 0.2),
              at(0.5, -w * 0.4, th * 0.6 - droop * 0.3 + 0.05), at(0.5, w * 0.4, th * 0.6 - droop * 0.3 + 0.05),
              at(0.45, 0, th * 0.6 - droop * 0.25 + 0.2), at(0.72, 0, -droop * 0.6 + th * 0.6)]
        facet(m, hull(m, sp, SNOW[2]), SNOW, noise=0.06, bias=0.35)


def conifer(v):
    """A rime-spruce: no cone of needles but tiers of flat, leaf-shaped boughs standing straight out
    from a leaning trunk, each tier turned against the one below, so from above it is a spiky star of
    snow-ridged blades over blue-black, with the trunk showing between; a pale frost bud on top."""
    r = root("conifer", v)
    rng = random.Random(180 + v)
    m = Model(f"conifer_{v}", 180 + v)
    # (x, y, height, base reach, tiers, lean, arms in the bottom tier)
    trees = {0: [(0, 0, 5.2, 2.1, 4, (0.35, -0.2), 6)],
             1: [(0, 0, 3.4, 2.3, 3, (-0.2, 0.3), 7)],
             2: [(-1.0, 0.3, 4.4, 1.7, 4, (-0.3, 0.1), 5), (1.3, -0.6, 2.8, 1.3, 3, (0.25, -0.2), 5)],
             3: [(0, 0, 4.6, 2.0, 4, (0.6, 0.25), 5)]}[v]
    for x, y, h, reach, tiers, lean, arms0 in trees:
        top = (x + lean[0], y + lean[1], h)
        st = mark(m)
        limb(m, (x, y, -0.2), (x + lean[0] * 0.5, y + lean[1] * 0.5, h * 0.5), 0.3, 0.22, SPRUCE_BARK[0], segs=5)
        limb(m, (x + lean[0] * 0.5, y + lean[1] * 0.5, h * 0.5), top, 0.22, 0.08, SPRUCE_BARK[0], segs=5)
        facet(m, new_faces(m, st), SPRUCE_BARK, noise=0.1)
        a0 = rng.uniform(0, math.tau)
        lean_a = math.atan2(lean[1], lean[0])
        for i in range(tiers):
            t = i / max(1, tiers - 1)
            z = h * (0.3 + 0.6 * t)
            k = 0.35 + 0.65 * (1 - t)
            cx, cy = x + lean[0] * (z / h), y + lean[1] * (z / h)
            n = max(3, arms0 - i)
            for j in range(n):
                a = a0 + i * 0.9 + (j + rng.uniform(-0.18, 0.18)) / n * math.tau
                L = reach * k * rng.uniform(0.8, 1.12)
                if v == 3:
                    # windswept: the boughs on the weather side broken short
                    L *= 0.45 + 0.55 * (1 + math.cos(a - lean_a)) / 2
                _arm(m, rng, (cx, cy), z, a, L, 0.42 * k + 0.2, 0.1 + 0.05 * k, 0.32 * k + 0.1, SPRUCE)
        m.cyl(0.22, 0.8, top, ICE[4], segs=5, r_top=0.0)
    if v == 0:
        x, y, h, *_ = trees[0]
        lean = trees[0][5]
        m.ball(0.3, (x + lean[0], y + lean[1], h + 0.3), AURORA, subdiv=0, glow=True)
    for x, y, *_ in trees:
        _snow_foot(m, rng, (x, y), 0.9)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def _snow_foot(m, rng, c, rad):
    """A low drift round a trunk, so it stands in the snow rather than on it."""
    st = mark(m)
    m.ball(rad, (c[0] + 0.2, c[1] - 0.15, -0.25), SNOW[1], subdiv=1, scale=(1.1, 0.9, 0.22), jitter=0.08 * rad)
    facet(m, new_faces(m, st), SNOW, noise=0.06, bias=0.2)


# --- Engine City ------------------------------------------------------------------------

def alien_pylon(v):
    """OBSTACLE: a black obelisk of the Waking Engine, its seams glowing orange, rings of metal
    floating round it and a hot core hanging over the tip. The core breathes and the rings bob."""
    r = root("alien_pylon", v)
    rng = random.Random(200 + v)
    m = Model(f"alien_pylon_{v}", 200 + v)
    # a stepped plinth, frosted at the edges
    st = mark(m)
    m.cyl(2.4, 0.6, (0, 0, 0), METAL[1], segs=6, r_top=2.2)
    m.cyl(1.8, 0.6, (0, 0, 0.6), METAL[1], segs=6, r_top=1.6, rot=(0, 0, math.pi / 6))
    facet(m, new_faces(m, st), METAL, noise=0.08)
    ring(m, 2.0, 0.35, 0.62, HOT, n=6, h=0.06, glow=True)
    if v == 0:
        st = mark(m)
        m.box((1.6, 1.6, 12.6), (0, 0, 7.4), METAL[1], rot=(0, 0, math.pi / 4), taper=0.45)
        facet(m, new_faces(m, st), METAL, noise=0.06)
        # glowing seams up the four faces
        for k in range(4):
            a = k * math.pi / 2
            for z0, z1 in ((1.6, 6.0), (6.8, 10.5), (11.2, 13.2)):
                w = 0.62 - (z0 / 14) * 0.3
                m.box((0.3, 0.12, z1 - z0), (math.cos(a) * w, math.sin(a) * w, (z0 + z1) / 2), HOT,
                      rot=(0, 0, a + math.pi / 2), glow=True)
        top = 14.0
        coll = [(0, 0, 1.5)]
    else:
        # a tuning fork: two tines, an arc of light hanging between them
        for side in (-1, 1):
            st = mark(m)
            limb(m, (side * 0.5, 0, 1.2), (side * 1.1, 0, 7), 0.6, 0.55, METAL[1], segs=5)
            limb(m, (side * 1.1, 0, 7), (side * 0.9, 0, 13.5), 0.55, 0.15, METAL[1], segs=5)
            facet(m, new_faces(m, st), METAL, noise=0.06)
            for z in (3.5, 6.5, 9.5, 12.0):
                x = side * (0.5 + (1.1 - 0.5) * min(1, (z - 1.2) / 5.8)) if z < 7 else side * (1.1 - 0.2 * (z - 7) / 6.5)
                m.box((0.35, 0.9, 0.3), (x + side * 0.2, 0, z), HOT, glow=True)
        top = 13.0
        coll = [(0, 0, 2.0)]
    m.build(r)
    # rings hovering round the shaft
    for i, z in enumerate((4.5, 8.0, 11.0) if v == 0 else (5.0, 10.0)):
        rm = Model(f"alien_pylon_{v}_ring{i}")
        rr = (1.5 - z * 0.05) if v == 0 else 2.3
        ring(rm, rr, 0.3, 0, METAL[3], n=8, h=0.32)
        ring(rm, rr, 0.32, 0.18, HOT, n=8, h=0.06, glow=True)
        o = rm.build(r, loc=(0, 0, z))
        bob(o, f"alien_pylon_{v}_pulse_idle", amp=0.25, period=3.0, phase=i * 1.3)
    cm = Model(f"alien_pylon_{v}_core")
    cm.ball(0.75, (0, 0, 0), HOT_PALE, subdiv=0, scale=(1, 1, 1.7), glow=True)
    cm.ball(0.95, (0, 0, 0), HOT_DEEP, subdiv=0, scale=(0.6, 0.6, 2.0), glow=True, rot=(0, 0, 0.6))
    core = cm.build(r, loc=(0, 0, top + 1.2))
    pulse(core, f"alien_pylon_{v}_pulse_idle", amp=0.22, period=3.0)
    light(r, (0, 0, top + 1.2), HOT, radius=9, intensity=1.2, flicker=0.1)
    for x, y, rad in coll:
        collider(r, x, y, rad)
    return r


def machine_dome(v):
    """A dome of the machine city pushing up through the snow, a ring of orange slits round its
    waist and a great eye in the top that slowly brightens and dims."""
    r = root("machine_dome", v)
    rng = random.Random(220 + v)
    m = Model(f"machine_dome_{v}", 220 + v)
    if v == 0:
        st = mark(m)
        m.ball(3.0, (0, 0, -0.4), METAL[2], subdiv=1, scale=(1, 1, 0.75))
        facet(m, new_faces(m, st), METAL[1:], noise=0.05)
        for k in range(5):
            a = k / 5 * math.tau + 0.4
            m.box((0.35, 0.7, 0.4), (math.cos(a) * 2.55, math.sin(a) * 2.55, 0.75), HOT, rot=(0, 0, a), glow=True)
        m.cyl(1.1, 0.25, (0, 0, 1.6), METAL[0], segs=8)
        eye_z, eye_r = 1.85, 0.55
        # snow drifted up one side
        st = mark(m)
        m.ball(2.4, (-1.6, 1.3, 0.0), SNOW[2], subdiv=1, scale=(1.0, 0.8, 0.55), jitter=0.15)
        facet(m, new_faces(m, st), SNOW, noise=0.06, bias=0.2)
    else:
        # a stepped octagonal ziggurat, light leaking from between the tiers
        z = 0
        for i, (rad, h) in enumerate(((3.0, 0.9), (2.3, 0.8), (1.6, 0.7))):
            st = mark(m)
            m.cyl(rad, h, (0, 0, z), METAL[1], segs=8, r_top=rad * 0.92, rot=(0, 0, math.pi / 8))
            facet(m, new_faces(m, st), METAL, noise=0.05)
            z += h
            m.cyl(rad * 0.86, 0.16, (0, 0, z), METAL[0], segs=8, rot=(0, 0, math.pi / 8))
            for k in range(4):
                a = (k + 0.5 * i) / 4 * math.tau + 0.3
                m.box((0.3, rad * 0.5, 0.18), (math.cos(a) * rad * 0.8, math.sin(a) * rad * 0.8, z + 0.02), HOT,
                      rot=(0, 0, a), glow=True)
            z += 0.12
        eye_z, eye_r = z, 0.5
        # an ice crust cracked over half of it
        st = mark(m)
        m.ball(2.6, (1.3, -0.6, 0.6), ICE_LOW[3], subdiv=1, scale=(1.0, 1.1, 0.6), jitter=0.2)
        facet(m, new_faces(m, st), ICE_LOW, noise=0.15, bias=0.15)
    m.build(r)
    em = Model(f"machine_dome_{v}_eye")
    em.cyl(eye_r, 0.2, (0, 0, 0), HOT, segs=8, glow=True)
    em.cyl(eye_r * 0.5, 0.25, (0, 0, 0), HOT_PALE, segs=8, glow=True)
    eye = em.build(r, loc=(0, 0, eye_z))
    pulse(eye, f"machine_dome_{v}_pulse_idle", amp=0.25, period=2.6, axes=(1, 1, 0.5))
    light(r, (0, 0, eye_z + 0.6), HOT, radius=6, intensity=0.6, halo=False)
    return r


def light_strip(v):
    """Orange lights set into the ground: a landing strip of chevrons, a hex floor, a conduit."""
    r = root("light_strip", v)
    rng = random.Random(240 + v)
    m = Model(f"light_strip_{v}", 240 + v)
    if v == 0:
        st = mark(m)
        m.box((2.0, 8.0, 0.25), (0, 0, 0.1), METAL[1])
        m.box((2.4, 8.4, 0.12), (0, 0, 0.04), METAL[0])
        facet(m, new_faces(m, st), METAL[:3], noise=0.04)
        for i in range(5):
            y = -3.0 + i * 1.5
            m.prism([(-0.75, 0), (0, 0.55), (0.75, 0), (0.75, 0.35), (0, 0.9), (-0.75, 0.35)][::1], 0.08,
                    (0, y, 0.25), HOT if i % 2 else HOT_PALE, rot=(-math.pi / 2, 0, 0), glow=True)
        for y in (-4.0, 4.0):
            for x in (-0.85, 0.85):
                m.box((0.3, 0.3, 0.12), (x, y, 0.27), HOT_DEEP, glow=True)
    elif v == 1:
        # hex floor plates, some lit from beneath
        for i, (x, y) in enumerate(((0, 0), (1.95, 1.12), (-1.95, 1.12), (0, -2.25), (1.95, -1.12))):
            st = mark(m)
            m.cyl(1.2, 0.3, (x, y, -0.05), METAL[2], segs=6, rot=(0, 0, math.pi / 6))
            facet(m, new_faces(m, st), METAL[1:4], noise=0.05)
            if i % 2 == 0 or i == 3:
                m.cyl(0.75, 0.06, (x, y, 0.25), HOT, segs=6, rot=(0, 0, math.pi / 6), glow=True)
                m.cyl(0.35, 0.08, (x, y, 0.27), HOT_PALE, segs=6, rot=(0, 0, math.pi / 6), glow=True)
            else:
                ring(m, 0.85, 0.2, 0.27, HOT_DEEP, n=6, h=0.06, glow=True)
    else:
        # a ribbed conduit running through the snow, glowing between the ribs
        st = mark(m)
        m.cyl(0.65, 8.0, (0, -4, 0), HOT, segs=6, rot=(-math.pi / 2, 0, 0), glow=True)
        for i in range(9):
            y = -3.6 + i * 0.9
            s2 = mark(m)
            m.cyl(0.85, 0.45, (0, y - 0.22, 0), METAL[2], segs=6, rot=(-math.pi / 2, 0, 0))
            facet(m, new_faces(m, s2), METAL[1:], noise=0.05)
        xform(m, st, M(scale=(1, 1, 0.6)))
        for y in (-4.4, 4.4):
            s2 = mark(m)
            m.ball(1.2, (0, y, 0), SNOW[2], subdiv=1, scale=(1.3, 1.0, 0.5), jitter=0.12)
            facet(m, new_faces(m, s2), SNOW, bias=0.2)
    m.build(r)
    light(r, (0, 0, 0.8), HOT, radius=5, intensity=0.7, halo=False)
    return r


def build():
    for v in range(2):
        ice_spire(v)
    for v in range(4):
        ice_block(v)
        conifer(v)
    for v in range(3):
        snow_rock(v)
        light_strip(v)
    for v in range(2):
        steam_vent(v)
        alien_pylon(v)
        machine_dome(v)
