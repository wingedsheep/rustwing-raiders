"""GLACIS's set pieces: bridges of ice and a frozen cable car across the shelf's
crevasses, a mammoth frozen in a glacier, terraced springs the size of hills under an arch of
ice, frost-shattered teeth and a buried engine on the tundra, and in Engine City pipe racks and
gantries to fly under and a turbine turning in the floor. Plus new scenery: travertine pools and
frozen reeds for the springs, golden larches and lichen boulders for the tundra, and vents for the
engine floor."""
from __future__ import annotations

import math
import random

import bmesh

from mathutils import Vector
from kit import Model, animate, emitter, light
from props_a_lib import hull, lump
from props_b_kit import M, collider, facet, jitter, limb, mark, new_faces, paint, pulse, ring, root, xform
from props_b_glacis import (AURORA, CRUST, HOT, HOT_DEEP, HOT_PALE, ICE, ICE_LOW, METAL, PINE, PINE_LIGHT, POOL,
                            ROCK, SNOW, ALGAE)

IVORY = ["#8a7a5a", "#b8a47a", "#dccaa0", "#f4e8c8"]
FUR = ["#3a2220", "#5a3428", "#7a4a32", "#9a6440"]
LARCH = ["#7a3a14", "#b0601e", "#e0902a", "#f8c04a"]
LICHEN = ["#c86a2a", "#e8a03a", "#8aa04a"]
TRAV = ["#b88478", "#e4c4b4", "#f6e8de", "#fffaf4"]   # travertine, near white, against the rosy ground
CAB = ["#8a2a24", "#b8402e", "#e0603a"]            # the cable car's cabins: the one warm thing on the shelf
WINDOW = "#ffd07a"
STEEL = ["#2a3040", "#3e4858", "#5a6878", "#7a8a9a"]


# --- helpers ------------------------------------------------------------------------------

def _chunk(m, rng, lo, hi, cols, n=14, bias=0.0, noise=0.15):
    """A faceted lump filling the box lo..hi (points scattered on its faces), painted by facing."""
    pts = []
    for _ in range(n):
        p = [rng.uniform(lo[i], hi[i]) for i in range(3)]
        k = rng.randrange(3)
        p[k] = lo[k] if rng.random() < 0.5 else hi[k]
        pts.append(p)
    for sx in (0, 1):
        for sy in (0, 1):
            # keep the corners near the box so it fills it, but trimmed a little
            pts.append([lo[0] + (hi[0] - lo[0]) * (0.15 + 0.7 * sx) + rng.uniform(-0.3, 0.3),
                        lo[1] + (hi[1] - lo[1]) * (0.15 + 0.7 * sy) + rng.uniform(-0.3, 0.3), hi[2] - rng.uniform(0, 0.4)])
            pts.append([lo[0] + (hi[0] - lo[0]) * (0.1 + 0.8 * sx), lo[1] + (hi[1] - lo[1]) * (0.1 + 0.8 * sy), lo[2]])
    f = hull(m, pts, cols[0])
    facet(m, f, cols, noise=noise, bias=bias)
    return f


def _column(m, rng, x, y, levels, cols, sides=6, lean=(0.0, 0.0), bias=0.0):
    """A faceted column: rings of points at (z, radius) levels, leaning, hulled."""
    pts = []
    ztop = levels[-1][0]
    for z, r in levels:
        t = z / ztop if ztop else 0
        a0 = rng.uniform(0, math.tau)
        for k in range(sides):
            a = a0 + k * math.tau / sides
            d = r * rng.uniform(0.85, 1.08)
            pts.append((x + lean[0] * t + math.cos(a) * d, y + lean[1] * t + math.sin(a) * d, z))
    f = hull(m, pts, cols[0])
    facet(m, f, cols, noise=0.16, bias=bias)
    return f


def _centre(m, r):
    """Shift a gate so its bounds are even about x = 0 (the runtime stands it by its half-width, so
    its outer column lands just past the field's edge whatever reaches out at the inner end)."""
    xs = [v.co.x for v in m.bm.verts]
    dx = -(min(xs) + max(xs)) / 2
    for v in m.bm.verts:
        v.co.x += dx
    for c in r.children:
        c.location.x += dx


def _trim(m, x):
    """Cut away everything past x on the -x side: a gate's outer end, so its outer column stands
    just past the field's edge (the runtime lines the gate's bounds up with it)."""
    bm = m.bm
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=(x, 0, 0),
                           plane_no=(-1, 0, 0), clear_outer=True)


def _icicles(m, rng, x0, x1, y0, y1, z, n, lo=12.7, longest=2.2, cols=ICE[2:], zfn=None):
    """Icicles hanging from the underside at height z (or zfn(x)), never below `lo`."""
    for _ in range(n):
        x = rng.uniform(x0, x1)
        y = rng.uniform(y0, y1)
        top = zfn(x) if zfn else z
        L = min(longest * rng.uniform(0.4, 1.0), top - lo)
        if L < 0.35:
            continue
        r = rng.uniform(0.22, 0.42)
        m.cyl(r, L + 0.3, (x, y, top + 0.3), rng.choice(cols), segs=4, r_top=0, rot=(math.pi, 0, rng.uniform(0, 1)))


def _drift(m, rng, center, size, cols=SNOW, bias=0.25):
    st = mark(m)
    m.ball(1.0, center, cols[1], subdiv=1, scale=size, jitter=0.12 * min(size))
    facet(m, new_faces(m, st), cols, noise=0.08, bias=bias)


# --- the Aurora Shelf ------------------------------------------------------------------------

def ice_bridge(v):
    """SPAN: a bridge of glacier ice thrown across the crevasse, snow on top, icicles under it and
    the aurora frozen in its seams (v0); the same bridge broken in the middle, its two halves
    reaching for each other and a slab fallen between (v1)."""
    r = root("glacis_ice_bridge", v)
    rng = random.Random(1000 + v)
    m = Model(f"glacis_ice_bridge_{v}", 1000 + v)
    under = lambda x: 13.6 + (abs(x) / 40) ** 2 * 3.0
    gap = 3.8 if v == 1 else 0.0
    x = -50.0
    while x < 50:
        w = rng.uniform(4.5, 9.0)
        x0, x1 = x, min(50.0, x + w)
        x = x0 + w * rng.uniform(0.5, 0.7) if x1 < 50 else 50.0
        if gap:
            if abs(x0) < gap and abs(x1) < gap:
                continue
            x0, x1 = (x0, min(x1, -gap)) if (x0 + x1) / 2 < 0 else (max(x0, gap), x1)
            if x1 - x0 < 1.5:
                continue
        zb = under((x0 + x1) / 2) + rng.uniform(0, 0.8)
        d = rng.uniform(3.8, 6.5)
        cy = math.sin(x0 * 0.11) * 1.6 + rng.uniform(-0.8, 0.8)
        _chunk(m, rng, (x0, cy - d, zb), (x1, cy + d, zb + rng.uniform(2.4, 5.0)), ICE, n=16, bias=-0.15)
        # snow lying on some of it, not to the edges
        if rng.random() < 0.55:
            st = mark(m)
            m.ball(1.0, ((x0 + x1) / 2, cy + rng.uniform(-1.2, 1.2), zb + 3.0), SNOW[1], subdiv=1,
                   scale=((x1 - x0) * 0.4, d * 0.5, 0.9), jitter=0.2)
            facet(m, new_faces(m, st), SNOW, noise=0.06, bias=0.25)
        _icicles(m, rng, x0 + 0.5, x1 - 0.5, cy - d + 0.8, cy + d - 0.8, zb + 0.3, 4, longest=2.4)
    # the aurora caught in the ice: a few faces glow
    glow = m._slot(AURORA, True)
    for f in list(m.bm.faces):
        c = f.calc_center_median()
        if c.z > 12 and abs(f.normal.z) < 0.4 and rng.random() < 0.08:
            f.material_index = glow
    if v == 1:
        # the slab that fell out of the middle, jammed nose-down below the deck's ends, tilted
        st = mark(m)
        _chunk(m, rng, (-3.0, -4.0, 0), (3.0, 4.0, 2.6), ICE, n=14, bias=-0.15)
        xform(m, st, M((0.5, 1.0, 13.6), (0.25, -0.35, 0.3)))
        # (its lowest corner kept above the flight line)
        lo = min(v_.co.z for f in new_faces(m, st) for v_ in f.verts)
        if lo < 13.0:
            xform(m, st, M((0, 0, 13.0 - lo)))
        _icicles(m, rng, -2.5, 3.0, -2.0, 3.0, 13.2, 3, longest=0.6)
    # the abutments: great blue buttresses out past the field's edges
    for s in (-1, 1):
        _column(m, rng, s * 44, 0, [(-3, 5.6), (6, 5.0), (13, 4.6), (17.5, 4.0)], ICE_LOW, sides=7, bias=-0.2)
        _drift(m, rng, (s * 44, 0, 17.6), (5.0, 5.5, 1.4))
        collider(r, s * 44, 0, 5.5)
    m.build(r)
    light(r, (0, 0, 15), AURORA, radius=14, intensity=0.5, halo=False)
    return r


def cable_car(v):
    """SPAN: a frozen cable car line across the crevasse. Lattice pylons out past the edges, two
    cables sagging between them, and red cabins hanging iced up and dark but for a lamp (v0: two
    cabins, v1: one, stopped dead mid-way with a long icicle beard)."""
    r = root("glacis_cable_car", v)
    rng = random.Random(1020 + v)
    m = Model(f"glacis_cable_car_{v}", 1020 + v)
    H = 20.5
    for s in (-1, 1):
        x = s * 43
        # a pylon: four legs tapering to a head with a crossbar
        st = mark(m)
        for dx in (-2.6, 2.6):
            for dy in (-2.6, 2.6):
                limb(m, (x + dx, dy, -3), (x + dx * 0.35, dy * 0.6, H), 0.45, 0.35, STEEL[1], segs=4)
        for z in (3.0, 9.0, 15.0):
            k = 1 - (z + 3) / (H + 3) * 0.6
            for dy in (-2.6, 2.6):
                limb(m, (x - 2.6 * k, dy * (1 - (z + 3) / (H + 3) * 0.4), z), (x + 2.6 * k, dy * (1 - (z + 3) / (H + 3) * 0.4), z + 5.5),
                     0.22, 0.22, STEEL[2], segs=4)
        m.box((3.6, 7.2, 1.0), (x, 0, H + 0.3), STEEL[1])
        for dy in (-2.6, 2.6):
            m.cyl(0.8, 0.5, (x - s * 0.6, dy, H + 0.8), STEEL[3], segs=6, rot=(math.pi / 2, 0, 0))
        facet(m, new_faces(m, st), STEEL, noise=0.08)
        _drift(m, rng, (x, 0, H + 0.9), (2.0, 3.8, 0.5))
        m.box((0.5, 0.5, 0.4), (x, 3.7, H + 0.4), "#ff4a3a", glow=True)
        light(r, (x, 3.7, H + 1), "#ff5a3a", radius=4, intensity=0.6, flicker=0.3)
        collider(r, x, 0, 3.2)
    # the cables, sagging; each a chain of short limbs so they curve
    sag = lambda x: H + 0.6 - 2.8 * (1 - (x / 43) ** 2)
    for dy in (-2.6, 2.6):
        n = 16
        pts = [Vector((-43 + 86 * i / n, dy, sag(-43 + 86 * i / n))) for i in range(n + 1)]
        for a, b in zip(pts, pts[1:]):
            limb(m, a, b, 0.28, 0.28, "#1a1e28", segs=4)
    cabins = [(-15, 0), (17, 1)] if v == 0 else [(4, 2)]
    for cx, k in cabins:
        top = sag(cx) - 0.2
        for dy in (-2.6, 2.6):
            m.cyl(0.6, 0.6, (cx, dy, top - 0.1), STEEL[3], segs=6, rot=(math.pi / 2, 0, 0))   # the trolley wheels
        limb(m, (cx, -2.6, top), (cx, 0, top - 1.6), 0.25, 0.25, STEEL[2], segs=4)
        limb(m, (cx, 2.6, top), (cx, 0, top - 1.6), 0.25, 0.25, STEEL[2], segs=4)
        z1 = top - 1.6
        z0 = 13.4
        st = mark(m)
        m.box((4.6, 3.4, z1 - z0), (cx, 0, (z0 + z1) / 2), CAB[1], taper=0.9)
        m.box((4.9, 3.7, 0.4), (cx, 0, z1), CAB[0])
        facet(m, new_faces(m, st), CAB, noise=0.06)
        for wx in (-1.4, 0, 1.4):
            for sy in (-1, 1):
                lit = (wx == 0 and sy == 1) or (k == 2 and wx == -1.4)
                m.box((0.9, 0.12, 0.8), (cx + wx, sy * 1.72, z0 + 1.2), WINDOW if lit else "#2a1a24", glow=lit)
        _drift(m, rng, (cx - 0.3, 0.2, z1 + 0.3), (2.3, 1.6, 0.45))
        _icicles(m, rng, cx - 2.2, cx + 2.2, -1.5, 1.5, z0, 6 if k == 2 else 3, lo=12.6, longest=0.7)
        light(r, (cx, 1.8, z0 + 1.2), WINDOW, radius=5, intensity=0.7, flicker=0.25)
    # icicles all along the cables
    for dy in (-2.6, 2.6):
        _icicles(m, rng, -34, 34, dy, dy, 0, 20, lo=13.0, longest=1.1, zfn=lambda x: sag(x) - 0.2)
    m.build(r)
    return r


def ice_seracs(v):
    """GATE: seracs, great blue towers of ice shoved up where the shelf cracks, leaning on each other
    with narrow gaps between; v1 has a slab fallen across two of them to fly under."""
    r = root("glacis_seracs", v)
    rng = random.Random(1040 + v)
    m = Model(f"glacis_seracs_{v}", 1040 + v)
    if v == 0:
        cols = [(-19.5, 0.5, 1.8, 20), (-6.5, -1.5, 2.6, 24), (6.5, 1.0, 2.8, 17.5), (19.5, -0.5, 2.4, 22)]
    else:
        cols = [(-19.5, 0, 1.8, 22), (-6.5, 1.2, 2.6, 19), (6.5, -0.8, 2.8, 19.5), (19.0, 1.5, 2.2, 15.5)]
    for x, y, rr, h in cols:
        lean = (rng.uniform(-0.8, 0.8), rng.uniform(-0.8, 0.8))
        # its outline at flight height is rr (the collider): wider at the foot, a split crown
        _column(m, rng, x, y, [(-2.5, rr * 1.7), (4, rr * 1.25), (10, rr), (h - 4, rr * 0.8), (h, rr * 0.35)], ICE, sides=6,
                lean=lean, bias=-0.05)
        _column(m, rng, x + rr * 0.6, y - rr * 0.5, [(max(h - 6, 13.5), rr * 0.5), (h + 1.5, 0.3)], ICE_LOW, sides=5)
        _drift(m, rng, (x + lean[0], y + lean[1], h - 0.6), (rr * 0.6, rr * 0.55, 0.6))
        _drift(m, rng, (x, y, -0.6), (rr * 2.1, rr * 1.8, 1.4))
        collider(r, x + lean[0] * 10 / h, y + lean[1] * 10 / h, rr + 0.45)
    if v == 1:
        st = mark(m)
        _chunk(m, rng, (-19.5, -3.2, 0), (-6.5, 3.2, 2.6), ICE_LOW, n=14, bias=-0.15)
        xform(m, st, M((0, 0.6, 16.0), (0.05, 0.08, 0.0)))
        _drift(m, rng, (-13, 0.6, 18.8), (5.0, 2.5, 0.6))
        _icicles(m, rng, -17, -9, -2, 3, 16.0, 7, lo=13.2, longest=1.6)
    glow = m._slot(AURORA, True)
    for f in list(m.bm.faces):
        if f.calc_center_median().z > 4 and abs(f.normal.z) < 0.5 and rng.random() < 0.06:
            f.material_index = glow
    _trim(m, cols[0][0] - 2.4)
    _centre(m, r)
    m.build(r)
    light(r, (0, 0, 12), AURORA, radius=12, intensity=0.6, halo=False)
    return r


def mammoth_ice(v):
    """GIANT: a mammoth bigger than a hill, frozen into the shelf. v0: its back and head out of
    a blue glacier block, tusks curling, snow on its shoulders. v1: picked to the bone, the
    ribcage arching out of the ice and the skull with its tusks lying apart."""
    r = root("glacis_mammoth", v)
    rng = random.Random(1060 + v)
    m = Model(f"glacis_mammoth_{v}", 1060 + v)
    # the ice it's frozen in: a broad shelf of blue, broken along the edges
    for k in range(7):
        a = k / 7 * math.tau + rng.uniform(-0.2, 0.2)
        d = rng.uniform(9, 14)
        cx, cy = math.cos(a) * d * 1.35, math.sin(a) * d * 0.9
        _chunk(m, rng, (cx - 7, cy - 6, -1.5), (cx + 7, cy + 6, rng.uniform(1.2, 2.6)), ICE_LOW, n=12, bias=-0.1)
    _chunk(m, rng, (-14, -9, -1.5), (14, 9, 1.8), ICE_LOW, n=16, bias=0.0)
    if v == 0:
        st = mark(m)
        m.ball(1.0, (-2, 0, 2.0), FUR[1], subdiv=2, scale=(11, 6.5, 5.6), jitter=0.35)    # the body
        m.ball(1.0, (-8, 0.4, 3.0), FUR[1], subdiv=1, scale=(5, 5.6, 4.4), jitter=0.3)     # the hump of the hindquarters
        m.ball(1.0, (9.5, 0, 3.4), FUR[2], subdiv=1, scale=(4.2, 3.8, 3.8), jitter=0.25)   # the head
        m.ball(1.0, (8.0, 0, 5.6), FUR[2], subdiv=1, scale=(2.6, 2.6, 1.8), jitter=0.2)    # the dome of the skull
        for s in (-1, 1):
            m.ball(1.0, (8.5, s * 3.6, 3.2), FUR[0], subdiv=1, scale=(1.6, 0.7, 2.2), jitter=0.1)   # ears
        facet(m, new_faces(m, st), FUR, noise=0.18)
        # the trunk, curled under
        pts = [(12.5, 0, 3.0), (15.0, 0.2, 1.8), (16.4, 0.8, 0.6), (16.0, 2.4, 0.2), (14.6, 2.8, 0.3)]
        for a, b, ra, rb in zip(pts, pts[1:], (1.3, 1.0, 0.8, 0.6), (1.0, 0.8, 0.6, 0.45)):
            limb(m, a, b, ra, rb, FUR[2], segs=6)
        # tusks: long curling ivory, the light one and the broken one
        for s, n in ((-1, 7), (1, 4)):
            p = Vector((12.0, s * 2.0, 2.6))
            d = Vector((1.0, s * 0.35, -0.25)).normalized()
            rad = 0.9
            for i in range(n):
                q = p + d * 2.4
                limb(m, p, q, rad, rad * 0.86, IVORY[2] if i % 2 else IVORY[1], segs=6)
                p = q
                rad *= 0.86
                d = Vector((d.x - 0.12, d.y + s * 0.42, d.z + 0.38)).normalized()
        # a frozen leg in front, bent at the knee
        limb(m, (6, -4.5, 1.0), (9.0, -7.0, 0.4), 1.6, 1.3, FUR[1], segs=6)
        limb(m, (9.0, -7.0, 0.4), (12.0, -6.6, 0.0), 1.3, 1.1, FUR[0], segs=6)
        # snow on its back and shoulders, and over the ice
        _drift(m, rng, (-3, 0.8, 7.0), (6.5, 3.4, 0.9))
        _drift(m, rng, (7.5, -0.4, 6.8), (2.2, 2.0, 0.5))
        _drift(m, rng, (-14, -5, 1.6), (6.0, 4.0, 1.0))
        # the ice coming over its hindquarters
        _chunk(m, rng, (-18, -8, -1), (-9, 8, 6.0), ICE, n=16, bias=-0.1)
        _drift(m, rng, (-14, 0, 6.2), (4.0, 6.0, 0.6))
    else:
        # the spine, a row of knuckles; the ribs curving up from both sides of it
        spine = [Vector((-12 + i * 2.2, 0, 5.8 + math.sin(i / 10 * math.pi) * 1.6)) for i in range(11)]
        for p in spine:
            m.ball(0.95, tuple(p), IVORY[2], subdiv=0, scale=(1, 1.1, 1.2))
            limb(m, p, p + Vector((0, 0, 1.1)), 0.5, 0.2, IVORY[1], segs=4)
        for a, b in zip(spine, spine[1:]):
            limb(m, a, b, 0.6, 0.6, IVORY[1], segs=5)
        for i in range(1, 10):
            p = spine[i]
            for s in (-1, 1):
                L = 7.0 - abs(i - 4) * 0.4
                pts = [p, p + Vector((0.4, s * L * 0.45, 0.4)), p + Vector((0.8, s * L * 0.8, -1.8)),
                       p + Vector((1.0, s * L * 0.95, -5.2))]
                for a, b in zip(pts, pts[1:]):
                    limb(m, a, b, 0.55, 0.45, IVORY[2], segs=5)
        # the skull, fallen forward, with its tusks sweeping out over the ice
        st = mark(m)
        m.ball(1.0, (14, 0, 2.6), IVORY[2], subdiv=1, scale=(3.6, 3.2, 2.8), jitter=0.25)
        m.box((2.6, 3.0, 2.4), (16.6, 0, 1.6), IVORY[1], taper=0.7)
        facet(m, new_faces(m, st), IVORY, noise=0.15)
        for s in (-1, 1):
            m.ball(0.8, (15.8, s * 1.4, 3.2), "#2a2420", subdiv=0)           # the eye sockets
            p = Vector((16.5, s * 1.6, 1.4))
            d = Vector((1.0, s * 0.5, 0.0)).normalized()
            rad = 0.85
            for i in range(6):
                q = p + d * 2.6
                limb(m, p, q, rad, rad * 0.86, IVORY[2], segs=6)
                p = q
                rad *= 0.86
                d = Vector((d.x - 0.35, d.y + s * 0.15, d.z + 0.22)).normalized()
        facet(m, [f for f in m.bm.faces if f.material_index == m._slot(IVORY[2], False)], IVORY, noise=0.12)
        # the hip bones and a femur dragged off
        st = mark(m)
        m.ball(1.0, (-12.5, 0, 4.2), IVORY[1], subdiv=1, scale=(2.2, 4.2, 1.6), jitter=0.25)
        facet(m, new_faces(m, st), IVORY, noise=0.12)
        limb(m, (-10, -8, 0.4), (-2, -11, 0.6), 0.9, 0.8, IVORY[2], segs=6)
        m.ball(1.3, (-10, -8, 0.4), IVORY[3], subdiv=0)
        m.ball(1.1, (-2, -11, 0.6), IVORY[3], subdiv=0)
        _drift(m, rng, (-4, 6, 1.6), (5.0, 3.0, 0.8))
        _drift(m, rng, (6, -6, 1.5), (4.0, 3.0, 0.7))
    m.build(r)
    return r


# --- Rosewater Springs -----------------------------------------------------------------------

def _lobed(rng, cx, cy, rx, ry, n=11, wob=0.18):
    pts = []
    for i in range(n):
        a = i / n * math.tau
        k = 1 + rng.uniform(-wob, wob) + 0.12 * math.sin(a * 3 + cx)
        pts.append((cx + math.cos(a) * rx * k, cy + math.sin(a) * ry * k))
    return pts


def _terrace(m, rng, cx, cy, rx, ry, z0, z1, hot=0):
    """One rimstone terrace: a lobed step of crust with a glowing pool set into its top."""
    pts = _lobed(rng, cx, cy, rx, ry)
    top = [(cx + (x - cx) * 0.94, cy + (y - cy) * 0.94) for x, y in pts]
    f = m.slab(pts, z0, z1, TRAV[0], top=top)
    facet(m, f, TRAV, noise=0.1, bias=0.1)
    # the rim: a pale lip, then the pool inside it, hotter (bluer) towards the middle
    lip = [(cx + (x - cx) * 0.9, cy + (y - cy) * 0.9) for x, y in pts]
    f = m.slab(top, z1, z1 + 0.18, TRAV[3], top=lip)
    # an orange mat of algae just inside the rim
    m.slab([(cx + (x - cx) * 0.9, cy + (y - cy) * 0.9) for x, y in pts], z1 + 0.18, z1 + 0.22, "#ff8a4a", glow=True)
    seq = [POOL[4], POOL[3], POOL[2], POOL[1], POOL[0]][min(hot, 2):]
    for k, col in enumerate(seq[:4]):
        s = 0.84 - k * 0.17
        if s <= 0.1:
            break
        ring_pts = [(cx + (x - cx) * s + rng.uniform(-0.1, 0.1), cy + (y - cy) * s) for x, y in pts]
        m.slab(ring_pts, z1 + 0.22 + k * 0.03, z1 + 0.25 + k * 0.03, col, glow=True)
    # pink algae running down the step's face where it spills
    for _ in range(3):
        a = rng.uniform(0, math.tau)
        x, y = cx + math.cos(a) * rx * 0.98, cy + math.sin(a) * ry * 0.98
        m.box((rng.uniform(1.0, 2.0), 0.3, (z1 - z0) * 0.9), (x, y, (z0 + z1) / 2), ALGAE[0], rot=(0, 0, a + math.pi / 2), glow=True)


def travertine(v):
    """GIANT: terraced springs the size of a hill, pool spilling into pool down its side, the top
    one boiling turquoise (v0); a geyser's cone, its throat glowing, rimstone rings round its
    foot (v1)."""
    r = root("glacis_travertine", v)
    rng = random.Random(1100 + v)
    m = Model(f"glacis_travertine_{v}", 1100 + v)
    if v == 0:
        steps = [(0, 0, 21, 16, -0.5, 1.2), (-3, 2, 17, 13, 1.2, 2.6), (-6, 3, 13, 10, 2.6, 4.0),
                 (-9, 4.5, 9, 7, 4.0, 5.4), (-11, 5.5, 5.4, 4.2, 5.4, 6.8)]
        for i, (cx, cy, rx, ry, z0, z1) in enumerate(steps):
            _terrace(m, rng, cx, cy, rx, ry, z0, z1, hot=i)
        # side terraces spilling off the main stair the other way
        for cx, cy, rx, ry, z0, z1 in ((10, -7, 7, 5, 1.2, 2.4), (13, -10, 4.5, 3.5, 2.4, 3.4), (-14, -8, 6, 4.5, 1.2, 2.2)):
            _terrace(m, rng, cx, cy, rx, ry, z0, z1, hot=2)
        top = (-11, 5.5, 7.1)
        emitter(r, top, "steam")
        emitter(r, (-6, 3, 4.4), "steam")
        light(r, (top[0], top[1], top[2] + 1), "#7af0f0", radius=12, intensity=0.9, halo=False)
        light(r, (6, -4, 2.5), "#ff9a6a", radius=12, intensity=0.6, halo=False)
    else:
        # rimstone rings round the foot
        for k in range(7):
            a = k / 7 * math.tau + rng.uniform(-0.2, 0.2)
            d = rng.uniform(15, 19)
            _terrace(m, rng, math.cos(a) * d, math.sin(a) * d * 0.85, rng.uniform(4, 6.5), rng.uniform(3.5, 5), -0.4, 0.9, hot=k % 3)
        # the cone, with runnels down its sides
        st = mark(m)
        m.cyl(13.0, 7.0, (0, 0, -0.5), CRUST[1], segs=12, r_top=3.2)
        jitter(m, new_faces(m, st), 0.5)
        facet(m, new_faces(m, st), CRUST, noise=0.12, bias=0.05)
        for k in range(9):
            a = k / 9 * math.tau + rng.uniform(-0.15, 0.15)
            col = ALGAE[k % 2] if k % 3 else POOL[3]
            limb(m, (math.cos(a) * 3.4, math.sin(a) * 3.4, 6.4), (math.cos(a) * 13, math.sin(a) * 13, 0.0), 0.5, 0.9,
                 col, segs=4, glow=True)
        m.cyl(3.4, 0.5, (0, 0, 6.3), CRUST[3], segs=10, r_top=3.0)
        m.cyl(2.6, 0.3, (0, 0, 6.5), "#3a2a3a", segs=10)
        m.cyl(1.9, 0.32, (0, 0, 6.55), POOL[0], segs=10, glow=True)
        m.cyl(0.9, 0.36, (0, 0, 6.6), "#e8ffff", segs=8, glow=True)
        emitter(r, (0, 0, 7.2), "steam")
        light(r, (0, 0, 8), "#7af0f0", radius=12, intensity=1.0, flicker=0.15, halo=False)
    m.build(r)
    return r


def ice_arch(v):
    """SPAN: a natural arch of blue ice over the springs, the steam having carved it, an icicle
    fringe along its underside (v0); two arches side by side, joined by a web of ice with holes
    in it (v1)."""
    r = root("glacis_ice_arch", v)
    rng = random.Random(1120 + v)
    m = Model(f"glacis_ice_arch_{v}", 1120 + v)
    prof = [(-48, -3), (-46, 7), (-43, 13.5), (-38, 17), (-24, 19), (0, 19.6)]
    prof = prof + [(-x, z) for x, z in reversed(prof[:-1])]
    arches = [(0.0, 3.0, 1.6)] if v == 0 else [(-4.2, 2.4, 1.1), (4.4, 2.1, 1.0)]
    def along(step):
        out = []
        for (xa, za), (xb, zb) in zip(prof, prof[1:]):
            n = max(1, round(abs(xb - xa) / step))
            for i in range(n):
                t = i / n
                out.append((xa + (xb - xa) * t, za + (zb - za) * t))
        return out + [prof[-1]]
    crown = lambda x: 19.4 - (abs(x) / 35) ** 2 * 2.0
    for y0, rad, sy in arches:
        for x, z in along(3.2):
            foot = abs(x) > 43
            rr = rad * (1.7 if foot else 1.0) * rng.uniform(0.9, 1.1)
            yy = y0 + math.sin(x * 0.11) * 1.2
            hw = rng.uniform(2.4, 3.6) if not foot else rr
            _chunk(m, rng, (x - hw, yy - rr * sy, z - rr), (x + hw, yy + rr * sy, z + rr * rng.uniform(0.8, 1.1)), ICE, n=12, bias=-0.1)
        # snow along the crown, icicles under it
        for x in range(-30, 31, 7):
            if rng.random() < 0.7:
                _drift(m, rng, (x + rng.uniform(-1, 1), y0, crown(x) + rad * 0.85), (3.0, rad * sy * 0.6, 0.5))
        _icicles(m, rng, -33, 33, y0 - rad * sy * 0.6, y0 + rad * sy * 0.6, 0, 22, lo=12.8, longest=2.6,
                 zfn=lambda x: crown(x) - rad + 0.5)
    if v == 1:
        # the web between the two: slabs of ice with gaps you can see the steam through
        for x in (-24, -15, -4, 9, 20):
            st = mark(m)
            _chunk(m, rng, (x - 3.2, -3, 0), (x + 3.2, 3, 1.2), ICE_LOW, n=10, bias=-0.1)
            xform(m, st, M((0, 0, 19.0 - (abs(x) / 35) ** 2 * 2 - 0.4)))
    for s in (-1, 1):
        _drift(m, rng, (s * 47, 0, -0.5), (6, 6, 2.2))
        collider(r, s * 46.5, 0, 5.0)
    # pink algae seeping down the feet
    for s in (-1, 1):
        for y in (-2, 1.5):
            m.box((0.8, 1.6, 8), (s * 45.4, y, 2.5), ALGAE[0], glow=True, rot=(0, s * 0.2, 0))
    m.build(r)
    light(r, (0, 0, 16), AURORA, radius=12, intensity=0.4, halo=False)
    return r


def rimpool(v):
    """Scenery: a little stair of rimstone pools, the water hot turquoise or cooling gold."""
    r = root("glacis_rimpool", v)
    rng = random.Random(1140 + v)
    m = Model(f"glacis_rimpool_{v}", 1140 + v)
    if v == 0:
        steps = [(0, 0, 3.0, 2.4, -0.3, 0.3), (-0.8, 0.6, 2.0, 1.6, 0.3, 0.75), (-1.3, 1.0, 1.1, 0.9, 0.75, 1.15)]
    elif v == 1:
        steps = [(0, 0, 3.4, 1.8, -0.3, 0.3), (1.8, 0.4, 1.7, 1.2, 0.3, 0.7), (-1.6, -0.2, 1.6, 1.1, 0.3, 0.65)]
    else:
        steps = [(0, 0, 2.2, 2.0, -0.3, 0.45)]
    for i, (cx, cy, rx, ry, z0, z1) in enumerate(steps):
        _terrace(m, rng, cx, cy, rx, ry, z0, z1, hot=i + (2 if v == 2 else 0))
    if v == 2:
        emitter(r, (0, 0, 0.6), "steam")
    m.build(r, rot_z=rng.uniform(0, math.tau))
    light(r, (0, 0, 1.2), "#7af0f0" if v != 1 else "#ffb06a", radius=4, intensity=0.5, halo=False)
    return r


def frost_reed(v):
    """Scenery: reeds by the springs frozen stiff, rimed white on their tips, rust at their feet."""
    r = root("glacis_frost_reed", v)
    rng = random.Random(1160 + v)
    m = Model(f"glacis_frost_reed_{v}", 1160 + v)
    n = (9, 14, 6)[v]
    m.cyl(1.4 + v * 0.3, 0.12, (0, 0, -0.05), "#6a4a4a", segs=8)
    for _ in range(n):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0, 1.2 + v * 0.3)
        x, y = math.cos(a) * d, math.sin(a) * d
        h = rng.uniform(1.2, 2.6)
        lx, ly = rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5)
        limb(m, (x, y, 0), (x + lx * 0.5, y + ly * 0.5, h * 0.6), 0.14, 0.12, rng.choice(("#8a5a3a", "#a8703a", "#6a4a34")), segs=4)
        limb(m, (x + lx * 0.5, y + ly * 0.5, h * 0.6), (x + lx, y + ly, h), 0.12, 0.08, SNOW[1], segs=4)
        if rng.random() < 0.5:
            m.ball(0.22, (x + lx, y + ly, h), SNOW[2], subdiv=0, scale=(1, 1, 2.2))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


# --- Mammoth Tundra ----------------------------------------------------------------------------

def frost_teeth(v):
    """GATE: teeth of dark rock shattered by frost, standing out of the snow, rimed blue on the
    weather side, snow on their crowns; v1 has a fallen tooth wedged across two of them."""
    r = root("glacis_frost_teeth", v)
    rng = random.Random(1180 + v)
    m = Model(f"glacis_frost_teeth_{v}", 1180 + v)
    if v == 0:
        cols = [(-19.5, 0, 1.8, 21), (-6.5, 1.6, 2.8, 26), (6.5, -0.8, 2.6, 18), (19.5, 1.0, 2.4, 22)]
    else:
        cols = [(-19.5, 0.8, 1.8, 19), (-6.5, -0.6, 2.6, 23), (6.5, 1.0, 2.6, 23), (19.5, -1.0, 2.6, 16)]
    rock = ["#1e2230", "#2e3648", "#3e4860", "#525e78", "#6a7690"]
    for x, y, rr, h in cols:
        lean = (rng.uniform(-0.8, 0.8), rng.uniform(-0.8, 0.8))
        _column(m, rng, x, y, [(-2.5, rr * 1.8), (3, rr * 1.3), (10, rr), (h - 5, rr * 0.75), (h, rr * 0.3)], rock,
                sides=5, lean=lean)
        # a split-off flake leaning on it
        _column(m, rng, x - rr * 0.8, y + rr * 0.6, [(-1, rr * 0.8), (5.5, rr * 0.35), (7.5, 0.2)], rock, sides=4,
                lean=(-1.0, 0.6))
        # rime on the north-west face: ice glazed on
        st = mark(m)
        _column(m, rng, x - rr * 0.5 + lean[0] * 0.4, y + rr * 0.5 + lean[1] * 0.4,
                [(2, rr * 0.6), (h * 0.6, rr * 0.45), (h * 0.8, 0.2)], ICE_LOW, sides=4)
        _drift(m, rng, (x + lean[0], y + lean[1], h - 1.0), (rr * 0.7, rr * 0.6, 0.6))
        _drift(m, rng, (x + 0.6, y - 0.4, -0.5), (rr * 2.2, rr * 1.8, 1.6))
        collider(r, x + lean[0] * 10 / h, y + lean[1] * 10 / h, rr + 0.45)
    # frost-shattered blocks scattered in the snow round them
    for _ in range(10):
        x, y = rng.uniform(-16, 22), rng.uniform(-7, 7)
        s = rng.uniform(1.0, 2.2)
        _chunk(m, rng, (x - s, y - s, -0.4), (x + s, y + s * 0.8, s * 0.9), rock, n=9)
    if v == 1:
        st = mark(m)
        _column(m, rng, 0, 0, [(0, 2.2), (6, 1.9), (13.8, 0.8)], rock, sides=5)
        xform(m, st, M((-13, 0, 0)) @ M((0, 0, 18.2), (0, math.pi / 2 + 0.06, 0.04)) @ M((0, 0, -6.6)))
        _drift(m, rng, (0, 0, 20.3), (5.0, 1.6, 0.5))
    _trim(m, cols[0][0] - 2.4)
    _centre(m, r)
    m.build(r)
    return r


def buried_engine(v):
    """GIANT: part of the Waking Engine, buried under the tundra: a ribbed hull longer than a
    convoy, snow drifted over it, its seams and a torn-open end glowing orange (v0); a vast cog
    lying flat in the snow, its teeth sticking up, a hot hub in the middle (v1)."""
    r = root("glacis_buried_engine", v)
    rng = random.Random(1200 + v)
    m = Model(f"glacis_buried_engine_{v}", 1200 + v)
    if v == 0:
        L = 44
        st = mark(m)
        m.cyl(7.2, L, (-L / 2, 0, 0), METAL[2], segs=10, rot=(0, math.pi / 2, 0))
        facet(m, new_faces(m, st), METAL, noise=0.06)
        for i in range(10):
            x = -L / 2 + 2 + i * (L - 4) / 9
            st = mark(m)
            m.cyl(7.9, 1.3, (x - 0.65, 0, 0), METAL[1], segs=10, rot=(0, math.pi / 2, 0))
            facet(m, new_faces(m, st), METAL, noise=0.06)
            if i % 2:
                # slits glowing between the ribs on top
                for a in (-0.5, 0, 0.5):
                    m.box((1.6, 0.6, 0.5), (x + 2.2, math.sin(a) * 7.3, math.cos(a) * 7.3), HOT, rot=(a, 0, 0), glow=True)
        # the torn end: the hull open, the core burning inside
        m.cyl(6.6, 0.4, (L / 2 - 0.2, 0, 0), "#2a1a14", segs=10, rot=(0, math.pi / 2, 0))
        m.cyl(4.4, 0.6, (L / 2 - 0.1, 0, 0), HOT_DEEP, segs=8, rot=(0, math.pi / 2, 0), glow=True)
        m.cyl(2.4, 0.8, (L / 2, 0, 0), HOT_PALE, segs=8, rot=(0, math.pi / 2, 0), glow=True)
        for k in range(6):
            a = k / 6 * math.tau + 0.3
            limb(m, (L / 2, math.cos(a) * 6.5, math.sin(a) * 6.5), (L / 2 + 3.0, math.cos(a) * 8.4, max(0.4, math.sin(a) * 8.4)),
                 0.7, 0.3, METAL[3], segs=4)
        # snow drifted up both flanks and over half the back, and the ground heaped round it
        for x in range(-20, 18, 6):
            for s in (-1, 1):
                _drift(m, rng, (x + rng.uniform(-1, 1), s * 7.2, 1.8), (4.0, 3.0, 3.4))
            if rng.random() < 0.55:
                _drift(m, rng, (x, rng.uniform(-1.5, 1.5), 6.6), (3.4, 3.0, 1.0))
        _drift(m, rng, (-L / 2 - 1, 0, 1.6), (4.5, 8, 4.0))
        light(r, (L / 2 + 1.5, 0, 3), HOT, radius=14, intensity=1.3, flicker=0.15)
        light(r, (0, 0, 8), HOT, radius=10, intensity=0.6, halo=False)
    else:
        R = 18
        # the cog's rim and its teeth, part sunk
        for k in range(20):
            a = k / 20 * math.tau
            st = mark(m)
            m.box((5.8, 4.0, 2.4), (0, 0, 0), METAL[2])
            xform(m, st, M((math.cos(a) * R, math.sin(a) * R, 0.6 + 0.6 * math.sin(a * 2)), (0, 0, a + math.pi / 2)))
            facet(m, new_faces(m, st), METAL, noise=0.06)
            if k % 2 == 0:
                st = mark(m)
                m.box((2.6, 3.0, 3.2), (0, 0, 0), METAL[3], taper=0.7)
                xform(m, st, M((math.cos(a) * (R + 3.0), math.sin(a) * (R + 3.0), 1.8 + 0.6 * math.sin(a * 2)), (0, 0, a + math.pi / 2)))
                facet(m, new_faces(m, st), METAL, noise=0.06)
            m.box((0.5, 3.0, 0.3), (math.cos(a) * (R - 2.6), math.sin(a) * (R - 2.6), 1.85), HOT, rot=(0, 0, a), glow=True)
        # spokes to the hub
        for k in range(6):
            a = k / 6 * math.tau + 0.2
            st = mark(m)
            limb(m, (math.cos(a) * 5, math.sin(a) * 5, 1.5), (math.cos(a) * (R - 2), math.sin(a) * (R - 2), 1.0), 1.6, 1.4, METAL[1], segs=5)
            facet(m, new_faces(m, st), METAL, noise=0.06)
        st = mark(m)
        m.cyl(6.0, 3.0, (0, 0, -0.5), METAL[1], segs=8, r_top=5.0)
        m.cyl(3.8, 1.2, (0, 0, 2.5), METAL[2], segs=8, r_top=3.4)
        facet(m, new_faces(m, st), METAL, noise=0.06)
        m.cyl(2.8, 0.3, (0, 0, 3.6), HOT_DEEP, segs=8, glow=True)
        m.cyl(1.4, 0.4, (0, 0, 3.7), HOT_PALE, segs=8, glow=True)
        ring(m, 5.4, 0.5, 2.6, HOT, n=8, h=0.2, glow=True)
        # the snow, filling between the spokes and piled on one side
        for k in range(6):
            a = k / 6 * math.tau + 0.2 + math.pi / 6
            _drift(m, rng, (math.cos(a) * 11, math.sin(a) * 11, 0.0), (5.5, 4.5, 1.2))
        for a in (2.2, 2.7, 3.2):
            _drift(m, rng, (math.cos(a) * R, math.sin(a) * R, 1.8), (5.0, 4.0, 2.0))
        light(r, (0, 0, 5), HOT, radius=14, intensity=1.2, flicker=0.1)
    m.build(r)
    return r


def larch(v):
    """Scenery: a larch gone gold in the cold, tiers of amber needles dusted with snow, a dark trunk;
    warm against the teal spruce and the white."""
    r = root("glacis_larch", v)
    rng = random.Random(1220 + v)
    m = Model(f"glacis_larch_{v}", 1220 + v)
    trees = {0: [(0, 0, 1.0, 5)], 1: [(0, 0, 1.25, 6)], 2: [(-1.0, 0.3, 0.8, 4), (1.1, -0.5, 0.65, 4), (0.2, 1.4, 0.5, 3)]}[v]
    for x, y, s, tiers in trees:
        m.cyl(0.25 * s, 1.4 * s, (x, y, 0), "#3a2626", segs=5)
        for i in range(tiers):
            z = (0.9 + i * 0.78) * s
            rad = (1.5 - i * (1.2 / tiers)) * s
            st = mark(m)
            m.cyl(rad, 1.15 * s, (x, y, z), LARCH[1], segs=6, r_top=0.08, rot=(0, 0, rng.uniform(0, 1)))
            jitter(m, new_faces(m, st), 0.1 * s, z=False)
            facet(m, new_faces(m, st), LARCH, noise=0.12, bias=0.05 * i)
            if i % 2 == 1:
                m.cyl(rad * 0.55, 0.3 * s, (x + 0.1, y - 0.1, z + 0.7 * s), SNOW[2], segs=6, r_top=0.1)
        m.cyl(0.2 * s, 0.8 * s, (x, y, (0.9 + tiers * 0.78) * s), LARCH[3], segs=4, r_top=0)
    _drift(m, rng, (0, 0, -0.35), (1.8, 1.5, 0.5))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def lichen_rock(v):
    """Scenery: a boulder blotched with orange lichen and grey-green moss, snow in its lee."""
    r = root("glacis_lichen_rock", v)
    rng = random.Random(1240 + v)
    m = Model(f"glacis_lichen_rock_{v}", 1240 + v)
    spots = {0: [(0, 0, 1.6, 1.2)], 1: [(0, 0, 1.2, 0.9), (1.7, 0.6, 0.9, 0.7), (-0.6, 1.6, 0.8, 0.5)], 2: [(0, 0, 2.2, 0.8)]}[v]
    for x, y, s, h in spots:
        st = mark(m)
        lump(m, rng, (x, y, h * s * 0.35), (s, s * 0.8, h * s * 0.7), ROCK[1], n=16, flat=0.5)
        fs = new_faces(m, st)
        facet(m, fs, ROCK, noise=0.15)
        # lichen in a patch or two on the top, snow on the rest of the cap
        a0 = rng.uniform(0, math.tau)
        for f in fs:
            c = f.calc_center_median()
            if f.normal.z > 0.55:
                ang = math.atan2(c.y - y, c.x - x)
                near = math.cos(ang - a0) > 0.75
                f.material_index = m._slot("#a8642a" if near else SNOW[2], False)
        _drift(m, rng, (x + s * 0.7, y - s * 0.6, -0.1), (s * 0.8, s * 0.6, 0.35))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


# --- Engine City -------------------------------------------------------------------------------

def pipe_rack(v):
    """SPAN: a rack of the Engine's pipes across the canyon, hot ones glowing through their
    windows, snow along the tops, frost on the flanges, a catwalk under them (v0); a gantry, a
    lattice girder with a crane trolley and its hook hanging, and lamps (v1)."""
    r = root("glacis_pipe_rack", v)
    rng = random.Random(1300 + v)
    m = Model(f"glacis_pipe_rack_{v}", 1300 + v)
    for s in (-1, 1):
        x = s * 42
        st = mark(m)
        for dy in (-4.5, 4.5):
            m.box((2.6, 2.6, 23.5), (x, dy, 8.75), METAL[1], taper=0.8)
        m.box((4.0, 11.5, 2.2), (x, 0, 19.6), METAL[2])
        m.box((3.0, 9.0, 1.6), (x, 0, 13.0), METAL[1])
        facet(m, new_faces(m, st), METAL, noise=0.06)
        m.box((0.4, 6.0, 0.4), (x - s * 1.5, 0, 19.6), HOT, glow=True)
        _drift(m, rng, (x, 0, 20.8), (2.0, 5.5, 0.5))
        collider(r, x, -4.5, 1.8)
        collider(r, x, 4.5, 1.8)
    if v == 0:
        pipes = [(-3.0, 16.6, 1.7, False), (0.6, 17.4, 1.3, True), (3.6, 16.0, 1.5, False), (-0.8, 19.8, 0.9, False)]
        for y, z, rad, hot in pipes:
            st = mark(m)
            m.cyl(rad, 88, (-44, y, z), METAL[3] if not hot else METAL[2], segs=7, rot=(0, math.pi / 2, 0))
            facet(m, new_faces(m, st), METAL, noise=0.05)
            for x in range(-36, 37, 9):
                st = mark(m)
                m.cyl(rad * 1.25, 0.8, (x, y, z), METAL[1], segs=7, rot=(0, math.pi / 2, 0))
                facet(m, new_faces(m, st), METAL, noise=0.05)
                if hot:
                    m.box((3.6, rad * 1.2, 0.3), (x + 4.5, y, z + rad - 0.05), HOT, glow=True)
            if not hot:
                for x in range(-40, 41, 8):
                    _drift(m, rng, (x + rng.uniform(-2, 2), y, z + rad), (3.0, rad * 0.8, 0.35))
        # the catwalk slung under, open grating
        for y in (-5.2, 5.2):
            m.box((84, 0.35, 0.5), (0, y, 14.2), METAL[1])
        for x in range(-40, 41, 3):
            m.box((0.5, 10.4, 0.35), (x, 0, 14.0), METAL[2] if x % 2 else METAL[1])
        for x in range(-36, 37, 12):
            m.box((0.5, 0.5, 0.5), (x, -5.2, 14.7), HOT_PALE, glow=True)
            light(r, (x, -5.2, 14.6), HOT, radius=5, intensity=0.6, halo=False)
        # a valve wheel and a pipe dropping off the rack (cut short above the flight line)
        m.cyl(1.4, 0.3, (-8, 4.8, 17.2), HOT_DEEP, segs=8, rot=(math.pi / 2, 0, 0), glow=True)
        limb(m, (14, 2.8, 15.0), (14, 2.8, 13.3), 1.0, 1.0, METAL[3], segs=6)
        m.cyl(1.2, 0.4, (14, 2.8, 13.1), METAL[1], segs=6)
        _icicles(m, rng, -30, 30, -5, 5, 14.0, 14, lo=12.9, longest=1.0)
    else:
        # the girder: two chords and a zig-zag web, deep enough to be a wall of shadow
        for y in (-3.5, 3.5):
            for z in (14.6, 19.0):
                st = mark(m)
                m.box((88, 1.2, 1.2), (0, y, z), METAL[2])
                facet(m, new_faces(m, st), METAL, noise=0.05)
            for i in range(22):
                x = -42 + i * 4
                limb(m, (x, y, 14.6), (x + 4, y, 19.0) if i % 2 == 0 else (x, y, 19.0), 0.35, 0.35, METAL[1], segs=4)
                if i % 2:
                    limb(m, (x, y, 19.0), (x + 4, y, 14.6), 0.35, 0.35, METAL[1], segs=4)
        for x in range(-40, 41, 8):
            m.box((1.0, 8.0, 0.6), (x, 0, 19.6), METAL[3])
        # warning stripes along the top chord
        for x in range(-40, 41, 4):
            m.box((2.0, 0.2, 0.6), (x, -4.15, 19.0), "#e8a02a" if (x // 4) % 2 else "#1a1e28")
        # the trolley and its hook
        cx = 9.0
        st = mark(m)
        m.box((6, 9, 2.6), (cx, 0, 20.8), "#c8701e")
        facet(m, new_faces(m, st), ["#6a3a14", "#a85a1a", "#d8801e", "#f0a040"], noise=0.05)
        m.box((4, 0.3, 0.6), (cx, -4.6, 21.0), HOT_PALE, glow=True)
        for dx in (-0.8, 0.8):
            limb(m, (cx + dx, 0, 19.5), (cx + dx, 0, 15.6), 0.2, 0.2, "#1a1e28", segs=4)
        st = mark(m)
        m.box((3.0, 2.0, 1.4), (cx, 0, 14.9), METAL[3], taper=0.6)
        m.cyl(0.6, 1.2, (cx, 0, 13.4), "#e8a02a", segs=5)
        facet(m, new_faces(m, st), METAL, noise=0.05)
        # a load of ice it was lifting, and lamps hung along the girder
        _chunk(m, rng, (cx - 6, -2.4, 13.6), (cx - 2.5, 2.4, 16.5), ICE, n=10)
        limb(m, (cx - 4.2, 0, 16.5), (cx, 0, 18.8), 0.2, 0.2, "#1a1e28", segs=4)
        for x in (-30, -14, 26):
            limb(m, (x, 0, 14.6), (x, 0, 13.6), 0.15, 0.15, "#1a1e28", segs=4)
            m.cyl(0.8, 0.6, (x, 0, 13.0), METAL[1], segs=6, r_top=0.3)
            m.cyl(0.6, 0.15, (x, 0, 12.95), HOT_PALE, segs=6, glow=True)
            light(r, (x, 0, 12.6), HOT, radius=6, intensity=0.9)
    m.build(r)
    return r


def turbine(v):
    """GIANT: a turbine as big as a district, set into the floor and turning: a ring wall frosted at
    the rim, blades sweeping over a core of orange light (v0); an iris hatch, its petals drawn
    half open on the furnace below (v1)."""
    r = root("glacis_turbine", v)
    rng = random.Random(1320 + v)
    m = Model(f"glacis_turbine_{v}", 1320 + v)
    R = 16
    # the ring wall, stepped, with intakes round it
    for k in range(16):
        a = k / 16 * math.tau
        st = mark(m)
        m.box((4.0, 2 * R * math.tan(math.pi / 16) + 0.3, 3.6), (0, 0, 0), METAL[2], taper=0.85)
        xform(m, st, M((math.cos(a) * R, math.sin(a) * R, 1.3), (0, 0, a)))
        facet(m, new_faces(m, st), METAL, noise=0.06)
        if k % 4 == 1:
            st = mark(m)
            m.box((5.0, 5.0, 2.4), (0, 0, 0), METAL[1])
            xform(m, st, M((math.cos(a) * (R + 4), math.sin(a) * (R + 4), 0.7), (0, 0, a)))
            facet(m, new_faces(m, st), METAL, noise=0.06)
            m.box((0.4, 3.6, 1.2), (math.cos(a) * (R + 6.6), math.sin(a) * (R + 6.6), 0.8), HOT, rot=(0, 0, a), glow=True)
        if k % 3 == 0:
            _drift(m, rng, (math.cos(a) * (R + 1), math.sin(a) * (R + 1), 3.0), (3.0, 2.5, 0.7))
    ring(m, R - 2.3, 0.6, 3.1, HOT, n=16, h=0.2, glow=True)
    # the furnace far down
    m.cyl(R - 2, 0.3, (0, 0, -1.2), HOT_DEEP, segs=16, glow=True)
    m.cyl(R * 0.55, 0.35, (0, 0, -1.1), HOT, segs=12, glow=True)
    m.cyl(R * 0.25, 0.4, (0, 0, -1.0), HOT_PALE, segs=10, glow=True)
    m.build(r)
    bm = Model(f"glacis_turbine_{v}_blades")
    if v == 0:
        n = 9
        for k in range(n):
            a = k / n * math.tau
            st = mark(bm)
            bm.box((R - 5, 2.6, 0.4), ((R - 5) / 2 + 3, 0, 0), METAL[3], rot=(0.45, 0, 0))
            xform(bm, st, M((0, 0, 0), (0, 0, a)))
            facet(bm, new_faces(bm, st), METAL, noise=0.04)
        st = mark(bm)
        bm.cyl(4.0, 2.2, (0, 0, -0.8), METAL[1], segs=8, r_top=2.6)
        facet(bm, new_faces(bm, st), METAL, noise=0.05)
        bm.cyl(1.6, 0.3, (0, 0, 1.4), HOT_PALE, segs=8, glow=True)
        o = bm.build(r, loc=(0, 0, 1.0))
        animate(o, "glacis_turbine_0_spin_idle", "rotation_euler", [(0, (0, 0, 0)), (6, (0, 0, math.pi)), (12, (0, 0, math.tau))])
    else:
        n = 8
        for k in range(n):
            a = k / n * math.tau
            st = mark(bm)
            bm.prism([(0, 0), (R - 2.4, -3.2), (R - 2.4, 3.6)], 0.7, (0, 0, 0), METAL[2], rot=(math.pi / 2, 0, 0))
            xform(bm, st, M((math.cos(a) * 6.5, math.sin(a) * 6.5, 0.8), (0.0, -0.12, a + 0.5)))
            facet(bm, new_faces(bm, st), METAL, noise=0.06)
            bm.box((R * 0.5, 0.3, 0.2), (math.cos(a + 0.5) * (R * 0.55), math.sin(a + 0.5) * (R * 0.55), 1.4), HOT, rot=(0, 0, a + 0.5), glow=True)
        o = bm.build(r, loc=(0, 0, 0))
        animate(o, "glacis_turbine_1_spin_idle", "rotation_euler", [(0, (0, 0, 0)), (9, (0, 0, -0.35)), (18, (0, 0, 0))])
    light(r, (0, 0, 2), HOT, radius=20, intensity=1.4, flicker=0.1)
    emitter(r, (0, 0, 2), "steam")
    return r


def engine_vent(v):
    """Scenery: grilles in the Engine's floor breathing orange (v0), a bank of exhaust cowls (v1),
    a hex hatch frosted over, its seams lit (v2)."""
    r = root("glacis_engine_vent", v)
    rng = random.Random(1340 + v)
    m = Model(f"glacis_engine_vent_{v}", 1340 + v)
    if v == 0:
        st = mark(m)
        m.box((5.0, 3.4, 0.6), (0, 0, 0.1), METAL[1])
        facet(m, new_faces(m, st), METAL, noise=0.05)
        m.box((4.4, 2.8, 0.2), (0, 0, 0.32), HOT_DEEP, glow=True)
        for x in (-1.6, -0.8, 0, 0.8, 1.6):
            m.box((0.35, 3.0, 0.4), (x, 0, 0.5), METAL[2])
        emitter(r, (0, 0, 0.8), "steam")
    elif v == 1:
        for i, (x, y) in enumerate(((-1.6, 0), (0, 0.4), (1.6, -0.2))):
            st = mark(m)
            m.cyl(0.85, 1.8, (x, y, 0), METAL[2], segs=6, r_top=0.7)
            m.box((1.4, 1.0, 1.0), (x, y - 0.6, 1.9), METAL[3], rot=(0.5, 0, 0))
            facet(m, new_faces(m, st), METAL, noise=0.06)
            m.cyl(0.45, 0.2, (x, y - 0.95, 2.1), HOT, segs=6, glow=True, rot=(0.5 + math.pi / 2, 0, 0))
        _drift(m, rng, (0.8, 1.2, 0), (2.6, 1.2, 0.6))
    else:
        st = mark(m)
        m.cyl(2.6, 0.5, (0, 0, -0.1), METAL[2], segs=6)
        facet(m, new_faces(m, st), METAL, noise=0.05)
        for k in range(6):
            a = k / 6 * math.tau
            m.box((0.2, 2.5, 0.12), (math.cos(a) * 1.15, math.sin(a) * 1.15, 0.42), HOT, rot=(0, 0, a + math.pi / 2), glow=True)
        _drift(m, rng, (-0.8, 0.6, 0.3), (1.6, 1.2, 0.3), cols=ICE_LOW[2:])
    m.build(r, rot_z=rng.uniform(0, math.tau))
    light(r, (0, 0, 1), HOT, radius=4, intensity=0.6, halo=False)
    return r


def build():
    for v in range(2):
        ice_bridge(v)
        cable_car(v)
        ice_seracs(v)
        mammoth_ice(v)
        travertine(v)
        ice_arch(v)
        frost_teeth(v)
        buried_engine(v)
        pipe_rack(v)
        turbine(v)
    for v in range(3):
        rimpool(v)
        frost_reed(v)
        larch(v)
        lichen_rock(v)
        engine_vent(v)
