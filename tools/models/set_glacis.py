"""GLACIS's set pieces: bridges of ice and a frozen cable car across the shelf's
crevasses, a mammoth frozen in a glacier, terraced springs the size of hills under an arch of
ice, frost-shattered teeth and a buried engine on the tundra, and in Engine City pipe racks and
gantries to fly under and a turbine turning in the floor. Plus the scenery that
grows or lies about between them: penitentes, sastrugi, humming crystals and Engine relics on the
shelf; rimstone pools, steam-reeds, mistwillows and blushcaps at the springs; bellcrowns,
emberroots, sedge, bones and lichen boulders on the tundra; heat sinks, cables, cracked ice over
the furnace, hex cells and vents in Engine City."""
from __future__ import annotations

import math
import random

import bmesh

from mathutils import Vector
from kit import Model, animate, emitter, light
from props_a_lib import hull, lump
from props_b_kit import M, collider, facet, jitter, limb, mark, new_faces, paint, path_tube, pulse, ring, root, xform
from props_b_glacis import (AURORA, CRUST, HOT, HOT_DEEP, HOT_PALE, ICE, ICE_LOW, METAL, PINE, PINE_LIGHT, POOL,
                            ROCK, SNOW, ALGAE)

IVORY = ["#8a7a5a", "#b8a47a", "#dccaa0", "#f4e8c8"]
FUR = ["#3a2220", "#5a3428", "#7a4a32", "#9a6440"]
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


# --- Aurora Shelf scenery ------------------------------------------------------------------------

AUR_ICE = ["#2a4a9a", "#3e68c0", "#6a98e0", "#a8d0f8", "#e0f4ff"]
AUR_VIOLET = "#b48aff"
BLADE = [ICE[2], ICE[3], ICE[4], SNOW[1], SNOW[2]]


def _blade(m, rng, x, y, h, w, heading, lean=0.25):
    """A penitent: a thin blade of snow-ice standing on edge, its point leaning toward the sun."""
    ca, sa = math.cos(heading), math.sin(heading)
    t = w * 0.32
    pts = []
    for s_ in (-1, 1):
        for q in (-1, 1):
            pts.append((x + ca * w / 2 * s_ - sa * t * q, y + sa * w / 2 * s_ + ca * t * q, -0.2))
    for s_ in (-0.3, 0.25):
        pts.append((x + ca * w * s_ + sa * lean * h * 0.5, y + sa * w * s_ - ca * lean * h * 0.5, h * 0.55))
    pts.append((x + ca * w * rng.uniform(-0.15, 0.15) + sa * lean * h, y + sa * w * 0.1 - ca * lean * h, h))
    facet(m, hull(m, pts, BLADE[0]), BLADE, noise=0.15, bias=-0.15)


def penitents(v):
    """Scenery (shelf): penitentes, fields of snow blades the sun has carved, all leaning one way, in
    ranks (v0), a dense crowd (v1), one tall rank with stragglers (v2)."""
    r = root("glacis_penitents", v)
    rng = random.Random(1400 + v)
    m = Model(f"glacis_penitents_{v}", 1400 + v)
    hd = rng.uniform(-0.15, 0.15)
    if v == 0:
        spots = [(c * 1.15 - 2.3 + rng.uniform(-0.2, 0.2), rk * 1.6 - 1.6 + c * 0.15, rng.uniform(1.3, 2.4))
                 for rk in range(3) for c in range(5) if rng.random() < 0.85]
    elif v == 1:
        spots = []
        for _ in range(16):
            a, d = rng.uniform(0, math.tau), rng.uniform(0, 2.4) ** 0.9
            spots.append((math.cos(a) * d, math.sin(a) * d * 0.8, 2.6 - d * 0.6 + rng.uniform(-0.3, 0.3)))
    else:
        spots = [(c * 1.05 - 2.6, rng.uniform(-0.2, 0.2), rng.uniform(2.4, 3.2)) for c in range(6)]
        spots += [(rng.uniform(-2.5, 2.5), rng.uniform(1.2, 2.2) * rng.choice((-1, 1)), rng.uniform(0.8, 1.4)) for _ in range(5)]
    for x, y, h in spots:
        _blade(m, rng, x, y, h, rng.uniform(0.75, 1.05), hd + rng.uniform(-0.15, 0.15), lean=rng.uniform(0.15, 0.3))
    st = mark(m)
    m.ball(1.0, (0, 0, -0.25), SNOW[1], subdiv=1, scale=(3.4, 2.6, 0.35), jitter=0.12)
    facet(m, new_faces(m, st), SNOW, noise=0.06, bias=0.2)
    m.build(r, rot_z=rng.uniform(-0.3, 0.3))
    return r


def sastrugi(v):
    """Scenery (shelf): sastrugi, the wind's carving in hard snow: low ridges with a sharp prow and
    a blue shadowed lee, in a set of three (v0), a scatter of small ones (v1), a crescent (v2)."""
    r = root("glacis_sastrugi", v)
    rng = random.Random(1420 + v)
    m = Model(f"glacis_sastrugi_{v}", 1420 + v)
    cols = ["#5a7eb8", "#94b4dc", "#d4e4f4", "#f2f8ff"]
    def ridge(x, y, L, w, h, a, bend=0.0):
        ca, sa = math.cos(a), math.sin(a)
        pts = []
        for i in range(5):
            t = i / 4
            ww = w * math.sin(math.pi * (0.15 + 0.85 * t)) * (1.1 - t * 0.5)
            hh = h * (0.3 + 0.7 * math.sin(math.pi * t * 0.85))
            off = bend * (t - 0.5) ** 2 * L
            lx, ly = (t - 0.5) * L, off
            for q, z in ((-ww, 0.0), (ww * 0.5, 0.0), (-ww * 0.2, hh)):
                px, py = lx, ly + q
                pts.append((x + ca * px - sa * py, y + sa * px + ca * py, z - 0.15))
        facet(m, hull(m, pts, cols[2]), cols, noise=0.08, bias=0.15)
    if v == 0:
        for i in range(3):
            ridge(rng.uniform(-0.6, 0.6), i * 1.5 - 1.5, rng.uniform(4.5, 6.5), rng.uniform(0.6, 0.9), rng.uniform(0.45, 0.7), 0.0)
    elif v == 1:
        for _ in range(6):
            ridge(rng.uniform(-2.5, 2.5), rng.uniform(-2.0, 2.0), rng.uniform(1.8, 3.0), rng.uniform(0.35, 0.55), rng.uniform(0.3, 0.45),
                  rng.uniform(-0.2, 0.2))
    else:
        for k in range(4):
            a = -0.9 + k * 0.6
            ridge(math.cos(a + math.pi / 2) * 3.0, math.sin(a + math.pi / 2) * 3.0 - 2.4, 2.6, 0.75 - abs(k - 1.5) * 0.12,
                  0.75 - abs(k - 1.5) * 0.18, a)
    m.build(r, rot_z=rng.uniform(-0.25, 0.25))
    return r


def hum_crystal(v):
    """Scenery (shelf): where the aurora hums. Crystals of deep blue ice grown out of the shelf, a
    cold light caught in a few of their faces: a tall fan (v0), a crowned ring round a lit hollow
    (v1), a toppled cluster glowing violet where it broke (v2)."""
    r = root("glacis_hum_crystal", v)
    rng = random.Random(1440 + v)
    m = Model(f"glacis_hum_crystal_{v}", 1440 + v)
    from props_b_kit import crystal as kcrystal
    shafts = []
    if v == 0:
        shafts.append(((0, 0, -0.3), (0.1, -0.05, 1), 0.55, 2.8))
        for k in range(6):
            a = k / 6 * math.tau + rng.uniform(-0.3, 0.3)
            t = rng.uniform(0.35, 0.8)
            shafts.append(((math.cos(a) * 0.5, math.sin(a) * 0.5, -0.3), (math.cos(a) * math.sin(t), math.sin(a) * math.sin(t), math.cos(t)),
                           rng.uniform(0.28, 0.42), rng.uniform(1.0, 2.0)))
    elif v == 1:
        for k in range(8):
            a = k / 8 * math.tau
            shafts.append(((math.cos(a) * 1.7, math.sin(a) * 1.7, -0.3), (-math.cos(a) * 0.25, -math.sin(a) * 0.25, 1),
                           rng.uniform(0.3, 0.45), rng.uniform(1.2, 2.4)))
        m.cyl(1.2, 0.08, (0, 0, -0.02), AURORA, segs=8, glow=True)
        m.cyl(1.45, 0.06, (0, 0, -0.04), AUR_ICE[0], segs=8)
    else:
        for k in range(5):
            a = rng.uniform(-0.6, 0.6)
            shafts.append(((rng.uniform(-1.5, 1.5), rng.uniform(-0.8, 0.8), 0.1), (math.cos(a), math.sin(a), rng.uniform(0.15, 0.5)),
                           rng.uniform(0.35, 0.55), rng.uniform(1.6, 2.8)))
    st = mark(m)
    for base, d, rr, L in shafts:
        kcrystal(m, base, d, rr, L, rr * 1.8, AUR_ICE[0], segs=rng.choice((5, 6)), twist=rng.uniform(0, 1))
    fs = new_faces(m, st)
    facet(m, fs, AUR_ICE, noise=0.16, bias=-0.1)
    glow_t = m._slot(AURORA, True)
    glow_v = m._slot(AUR_VIOLET, True)
    for f in fs:
        if abs(f.normal.z) < 0.6 and rng.random() < 0.15:
            f.material_index = glow_v if (v == 2 or rng.random() < 0.3) else glow_t
    st = mark(m)
    m.ball(1.0, (0, 0, -0.2), ICE_LOW[3], subdiv=1, scale=(2.0, 1.6, 0.35), jitter=0.12)
    facet(m, new_faces(m, st), ICE_LOW[1:], noise=0.08, bias=0.1)
    for q in m.bm.verts:
        q.co *= 1.5
    m.build(r, rot_z=rng.uniform(0, math.tau))
    light(r, (0, 0, 2.2), AURORA if v != 2 else AUR_VIOLET, radius=6, intensity=0.6, halo=False)
    return r


def relic(v):
    """Scenery (shelf): the Engine showing through. A great ring half sunk in a mound of ice (v0); a
    mast leaning out of a slab, its tip still lit (v1); a dark sphere-eye under cracked ice, a slit of
    orange in it (v2)."""
    r = root("glacis_relic", v)
    rng = random.Random(1460 + v)
    m = Model(f"glacis_relic_{v}", 1460 + v)
    if v == 0:
        _chunk(m, rng, (-2.6, -1.8, -0.4), (2.6, 1.8, 0.8), ICE_LOW, n=14, bias=-0.1)
        st = mark(m)
        for k in range(12):
            a = k / 20 * math.tau - 0.3
            m.box((0.9, 0.8, 1.0), (math.cos(a) * 2.6, 0, math.sin(a) * 2.6), METAL[2], rot=(0, -a, 0))
        for k in (2, 6, 10):
            a = k / 20 * math.tau - 0.3
            m.box((0.35, 0.84, 0.45), (math.cos(a) * 2.95, 0, math.sin(a) * 2.95), HOT, rot=(0, -a, 0), glow=True)
        fs = xform(m, st, M((0, 0.3, 0.2), (1.0, 0, 0)))
        facet(m, [f for f in fs if m.mats[f.material_index].name.startswith("c_")], METAL, noise=0.06)
    elif v == 1:
        _chunk(m, rng, (-2.4, -1.8, -0.4), (2.4, 1.8, 0.9), ICE_LOW, n=12, bias=-0.1)
        st = mark(m)
        base, tip = (-0.6, 0.3, 0.5), (2.2, -0.6, 4.6)
        limb(m, base, tip, 0.45, 0.25, METAL[2], segs=5)
        for t in (0.35, 0.65):
            p = [base[i] + (tip[i] - base[i]) * t for i in range(3)]
            m.box((0.35, 1.8 - t, 0.3), tuple(p), METAL[3], rot=(0, -0.6, 0.3))
        facet(m, new_faces(m, st), METAL, noise=0.06)
        m.ball(0.38, tip, HOT_PALE, subdiv=0, glow=True)
        light(r, tip, HOT, radius=4, intensity=0.6, flicker=0.3, halo=False)
        _drift(m, rng, (-0.4, 0.6, 1.0), (1.6, 1.2, 0.3))
    else:
        st = mark(m)
        m.ball(1.9, (0, 0, -0.2), METAL[1], subdiv=1, scale=(1, 1, 0.7))
        facet(m, new_faces(m, st), METAL, noise=0.05)
        m.box((2.2, 0.36, 0.3), (0, -0.3, 1.1), HOT, glow=True, rot=(0.25, 0, 0.2))
        # the cracked ice still over half of it
        for k in range(4):
            a = 0.8 + k * 0.55
            st = mark(m)
            _chunk(m, rng, (-0.9, -0.6, -0.25), (0.9, 0.6, 0.25), ICE_LOW, n=8, bias=0.05)
            xform(m, st, M((math.cos(a) * 1.4, math.sin(a) * 1.4, 0.95 - abs(k - 1.5) * 0.15), (0.3 * math.sin(a), -0.3 * math.cos(a), a)))
        _drift(m, rng, (-1.6, -1.0, -0.1), (1.8, 1.2, 0.5))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    if v != 1:
        light(r, (0, 0, 1.4), HOT, radius=4, intensity=0.5, halo=False)
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
    """One rimstone terrace: a lobed step of pale crust, a lip, and a pool inside it banded like a
    hot spring: orange algae at the edge, gold, then turquoise, and only the hottest pools glowing
    in the very middle (glow is an accent here, not the whole pool)."""
    pts = _lobed(rng, cx, cy, rx, ry, n=13, wob=0.14)
    top = [(cx + (x - cx) * 0.94, cy + (y - cy) * 0.94) for x, y in pts]
    f = m.slab(pts, z0, z1, TRAV[0], top=top)
    facet(m, f, TRAV, noise=0.1, bias=0.1)
    lip = [(cx + (x - cx) * 0.88, cy + (y - cy) * 0.88) for x, y in pts]
    facet(m, m.slab(top, z1, z1 + 0.16, TRAV[3], top=lip), TRAV[2:], noise=0.05)
    bands = [("#e0905e", 0.84), ("#f2c474", 0.74), ("#2a9ab8", 0.6), ("#6ad8dc", 0.38)][:2 + min(hot, 2)]
    for k, (col, s) in enumerate(bands):
        ring_pts = [(cx + (x - cx) * s + rng.uniform(-0.06, 0.06), cy + (y - cy) * s) for x, y in pts]
        m.slab(ring_pts, z1 + 0.17 + k * 0.025, z1 + 0.2 + k * 0.025, col)
    if hot >= 2:
        core = [(cx + (x - cx) * 0.18, cy + (y - cy) * 0.18) for x, y in pts]
        m.slab(core, z1 + 0.26, z1 + 0.29, "#c8fff8", glow=True)
    # pink algae running down the step's face where it spills
    for _ in range(3):
        a = rng.uniform(0, math.tau)
        x, y = cx + math.cos(a) * rx * 0.97, cy + math.sin(a) * ry * 0.97
        m.box((rng.uniform(0.9, 1.8), 0.3, (z1 - z0) * 0.9), (x, y, (z0 + z1) / 2), ALGAE[0], rot=(0, 0, a + math.pi / 2))


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


LILAC = ["#3a1a5e", "#5a2e8e", "#8048bc", "#a46ad8", "#c890f0"]
FLESH = ["#5a1830", "#862a48", "#b04462", "#d8707e", "#f4a8a8"]


def frost_reed(v):
    """Scenery (springs): steam-reeds, stiff flat blades rose at the foot, rimed white where the
    steam freezes on them; a clump (v0), a broad bed (v1), a few tall ones (v2)."""
    r = root("glacis_frost_reed", v)
    rng = random.Random(1160 + v)
    m = Model(f"glacis_frost_reed_{v}", 1160 + v)
    n, spread, hi = ((9, 1.0, 2.0), (16, 1.8, 1.6), (6, 0.8, 2.8))[v]
    st = mark(m)
    m.ball(spread + 0.4, (0, 0, -0.25), TRAV[1], subdiv=1, scale=(1, 0.85, 0.25), jitter=0.06)
    facet(m, new_faces(m, st), TRAV, noise=0.08, bias=0.1)
    for _ in range(n):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0, spread)
        x, y = math.cos(a) * d, math.sin(a) * d
        h = hi * rng.uniform(0.6, 1.1)
        la = a + rng.uniform(-0.5, 0.5)
        lx, ly = math.cos(la) * h * 0.25, math.sin(la) * h * 0.25
        w = rng.uniform(0.32, 0.45)
        st = mark(m)
        m.cyl(w, h * 0.6, (0, 0, 0), rng.choice(("#8a3a44", "#a8504a", "#6a3040")), segs=4, r_top=w * 0.7)
        m.cyl(w * 0.7, h * 0.4, (0, 0, h * 0.6), SNOW[1], segs=4, r_top=0.03)
        fs = xform(m, st, M(scale=(1, 0.35, 1)))
        xform(m, st, M((x, y, -0.05), (math.atan2(ly, lx) * 0 + 0.3 * rng.uniform(-1, 1), 0.3 * rng.uniform(-1, 1), rng.uniform(0, math.pi))))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def mistwillow(v):
    """Scenery (springs): a mistwillow, which drinks the steam. A squat pale trunk under a lilac dome
    hung all round with curtains of frozen mist, icicle-tipped: from above, a lobed lilac crown; one
    (v0), a pair (v1), an old one leaning, its curtains trailing long on one side (v2)."""
    r = root("glacis_mistwillow", v)
    rng = random.Random(1170 + v)
    m = Model(f"glacis_mistwillow_{v}", 1170 + v)
    trees = {0: [(0, 0, 3.2, 1.8, (0.2, 0.1))], 1: [(-1.3, 0.3, 2.6, 1.4, (-0.2, 0.1)), (1.3, -0.4, 3.4, 1.7, (0.3, -0.1))],
             2: [(0, 0, 3.6, 2.1, (0.9, 0.3))]}[v]
    for x, y, h, R, lean in trees:
        top = (x + lean[0], y + lean[1], h)
        st = mark(m)
        limb(m, (x, y, -0.2), (x + lean[0] * 0.6, y + lean[1] * 0.6, h * 0.55), 0.42, 0.3, "#6a5a6e", segs=6)
        limb(m, (x + lean[0] * 0.6, y + lean[1] * 0.6, h * 0.55), top, 0.3, 0.2, "#6a5a6e", segs=6)
        facet(m, new_faces(m, st), ["#3e3444", "#5a4c60", "#7a6c80"], noise=0.1)
        st = mark(m)
        # the dome
        pts = []
        for k in range(9):
            a = k / 9 * math.tau
            for rr, dz in ((R, 0.0), (R * 0.6, 0.55), (R * 0.2, 0.75)):
                rj = rr * rng.uniform(0.9, 1.08)
                pts.append((top[0] + math.cos(a) * rj, top[1] + math.sin(a) * rj, top[2] + dz))
        hull(m, pts, LILAC[2])
        facet(m, new_faces(m, st), LILAC, noise=0.12, bias=-0.1)
        # the curtains hanging from the rim
        n = 9
        la = math.atan2(lean[1], lean[0])
        for k in range(n):
            a = (k + 0.5) / n * math.tau + rng.uniform(-0.1, 0.1)
            drop = rng.uniform(1.6, 2.4) * (1 + (0.5 * max(0, math.cos(a - la)) if v == 2 else 0))
            drop = min(drop, top[2] - 0.4)
            st = mark(m)
            _wedge(m, (top[0], top[1]), top[2] + 0.05, a, R * 0.9, R * 1.12, 2 * math.pi * R / n * 0.75, 2 * math.pi * R / n * 0.35,
                   0.24, -drop, LILAC[3])
            facet(m, new_faces(m, st), LILAC, noise=0.1, bias=-0.05)
            ex, ey = top[0] + math.cos(a) * R * 1.12, top[1] + math.sin(a) * R * 1.12
            m.cyl(0.2, 0.5, (ex, ey, top[2] + 0.05 - drop + 0.05), "#e0b8ff", segs=4, r_top=0, rot=(math.pi, 0, 0), glow=k % 3 == 0)
        m.ball(0.3, (top[0], top[1], top[2] + 0.82), SNOW[2], subdiv=0, scale=(1.3, 1.3, 0.6))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def blushcap(v):
    """Scenery (springs): blushcaps, fat rose cushions of something between moss and flesh, crowding
    the warm runoff; a cushion (v0), a ring round a little warm pool (v1), tall candles (v2)."""
    r = root("glacis_blushcap", v)
    rng = random.Random(1180 + v)
    m = Model(f"glacis_blushcap_{v}", 1180 + v)
    st = mark(m)
    if v == 0:
        caps = [(0, 0, 0.95)] + [(math.cos(a) * 1.25, math.sin(a) * 1.1, rng.uniform(0.45, 0.75)) for a in
                                 (k / 6 * math.tau + rng.uniform(-0.3, 0.3) for k in range(6))]
        for x, y, s in caps:
            m.ball(s, (x, y, s * 0.15), FLESH[2], subdiv=1, scale=(1, 0.95, 0.65), jitter=0.05)
    elif v == 1:
        for k in range(9):
            a = k / 9 * math.tau
            s = rng.uniform(0.4, 0.7)
            m.ball(s, (math.cos(a) * 1.5, math.sin(a) * 1.3, s * 0.15), FLESH[2], subdiv=1, scale=(1, 0.95, 0.65), jitter=0.05)
    else:
        for k in range(5):
            a, d = rng.uniform(0, math.tau), rng.uniform(0.2, 1.2)
            x, y, h = math.cos(a) * d, math.sin(a) * d, rng.uniform(0.9, 2.0)
            m.cyl(0.32, h, (x, y, 0), FLESH[1], segs=6, r_top=0.26)
            m.ball(0.45, (x, y, h), FLESH[3], subdiv=1, scale=(1, 1, 0.75))
        m.ball(0.9, (0, 0, 0), FLESH[2], subdiv=1, scale=(1.4, 1.2, 0.4))
    facet(m, new_faces(m, st), FLESH, noise=0.12)
    if v == 1:
        m.cyl(1.0, 0.06, (0, 0, 0.02), "#3aa8c0", segs=8)
        m.cyl(0.45, 0.08, (0, 0, 0.03), "#c8fff8", segs=8, glow=True)
        emitter(r, (0, 0, 0.3), "steam")
    else:
        # pores: a couple of pale pits glowing faintly
        for k in range(2):
            a = rng.uniform(0, math.tau)
            m.cyl(0.18, 0.08, (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.75 if v == 0 else 0.4), "#ffd0e0", segs=5, glow=True)
    st = mark(m)
    m.ball(1.0, (0, 0, -0.25), TRAV[1], subdiv=1, scale=(2.0, 1.8, 0.25), jitter=0.06)
    facet(m, new_faces(m, st), TRAV, noise=0.08, bias=0.1)
    for q in m.bm.verts:
        q.co *= 1.35
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


VIOLET = ["#1e1238", "#301e58", "#46307e", "#6044a4", "#7e60c4"]   # the bellcrowns' cups
HEART = ["#6a1a5a", "#9a2a7a", "#c8449a", "#ec70b8"]               # and the bulb in the middle
VBARK = ["#2a2234", "#3e3248", "#54465e"]
EBARK = ["#1c1418", "#2c2026", "#422e36", "#5c424a"]                # emberroot: near black, rust lit
EMBER = "#ffb04a"
TUSS = ["#86643a", "#a8844a", "#cca462", "#e8cc8a"]                 # frozen sedge
THAW = ["#5a4a48", "#6e5c58", "#86726a"]                            # wet ground where the snow's gone


def _wedge(m, c, z, a, r0, r1, w0, w1, th, lift, col):
    """A flat petal/blade from radius r0 to r1 along angle a, widening w0 -> w1, rising by lift."""
    ca, sa = math.cos(a), math.sin(a)
    pts = []
    for r_, w_, dz in ((r0, w0, 0.0), (r1, w1, lift)):
        for side in (-0.5, 0.5):
            for zz in (-th / 2, th / 2):
                pts.append((c[0] + ca * r_ - sa * w_ * side, c[1] + sa * r_ + ca * w_ * side, z + dz + zz))
    return hull(m, pts, col)


def bellcrown(v):
    """Scenery (tundra): a bellcrown, Glacis's own tree. A banded violet trunk holding up a cup of
    stiff, waxy petals that catches the snow: from above, a white disc in a ragged violet star.
    Lone (v0), a family of three (v1), an old one with its cup tipped and buds on the trunk (v2),
    a clump of saplings (v3)."""
    r = root("glacis_bellcrown", v)
    rng = random.Random(1220 + v)
    m = Model(f"glacis_bellcrown_{v}", 1220 + v)
    # (x, y, height, cup radius, lean)
    trees = {0: [(0, 0, 4.0, 1.6, (0.3, -0.2))],
             1: [(-1.1, 0.4, 3.1, 1.2, (-0.3, 0.2)), (1.1, -0.5, 4.3, 1.55, (0.25, -0.1)), (0.1, 1.6, 2.0, 0.85, (0.1, 0.35))],
             2: [(0, 0, 4.6, 1.9, (0.7, 0.2))],
             3: [(rng.uniform(-1.6, 1.6), rng.uniform(-1.6, 1.6), rng.uniform(1.2, 2.0), rng.uniform(0.5, 0.75),
                  (rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3))) for _ in range(5)]}[v]
    for x, y, h, R, lean in trees:
        top = (x + lean[0], y + lean[1], h - 0.35)
        st = mark(m)
        limb(m, (x, y, -0.2), top, 0.3 * min(1.2, R / 1.3), 0.2 * min(1.2, R / 1.3), VBARK[0], segs=6)
        facet(m, new_faces(m, st), VBARK, noise=0.1)
        # pale frost bands round the trunk
        for t in (0.3, 0.55):
            m.cyl(0.32 * min(1.2, R / 1.3) * (1 - t * 0.3) + 0.04, 0.22, (x + lean[0] * t, y + lean[1] * t, (h - 0.35) * t),
                  SNOW[1], segs=6)
        tilt = (0.35 if v == 2 else rng.uniform(0.0, 0.12), rng.uniform(0, math.tau))
        st = mark(m)
        m.ball(0.42 * R / 1.3 + 0.1, top, VIOLET[1], subdiv=0, scale=(1, 1, 1.2))
        n = rng.choice((7, 8, 9)) if R > 1 else 6
        a0 = rng.uniform(0, math.tau)
        for j in range(n):
            a = a0 + (j + rng.uniform(-0.15, 0.15)) / n * math.tau
            # the cup tilts: petals on one side ride higher
            lift = R * (0.55 + tilt[0] * math.cos(a - tilt[1])) * rng.uniform(0.85, 1.15)
            _wedge(m, top, top[2], a, 0.15, R * rng.uniform(0.9, 1.1), 0.35, 2 * math.pi * R / n * 0.9, 0.2, lift, VIOLET[2])
        facet(m, new_faces(m, st), VIOLET, noise=0.14, bias=-0.2)
        # the heart: a fat magenta bulb filling the cup, a cap of the snow it caught off to one side
        st = mark(m)
        m.ball(R * 0.6, (top[0], top[1], top[2] + R * 0.32), HEART[2], subdiv=1, scale=(1, 1, 0.55), jitter=0.04 * R)
        facet(m, new_faces(m, st), HEART, noise=0.1, bias=0.05)
        st = mark(m)
        m.ball(R * 0.3, (top[0] - R * 0.22, top[1] + R * 0.18, top[2] + R * 0.6), SNOW[2], subdiv=1, scale=(1.2, 0.9, 0.35))
        facet(m, new_faces(m, st), SNOW, noise=0.06, bias=0.3)
        if v == 2:
            # buds: little cups on short stalks off the trunk
            for t, a in ((0.45, 1.0), (0.62, 3.6), (0.3, 5.0)):
                b0 = (x + lean[0] * t, y + lean[1] * t, (h - 0.35) * t)
                b1 = (b0[0] + math.cos(a) * 0.9, b0[1] + math.sin(a) * 0.9, b0[2] + 0.7)
                limb(m, b0, b1, 0.16, 0.12, VBARK[1], segs=5)
                st = mark(m)
                for j in range(5):
                    _wedge(m, b1, b1[2], j / 5 * math.tau + a, 0.1, 0.55, 0.2, 0.62, 0.14, 0.35, VIOLET[2])
                facet(m, new_faces(m, st), VIOLET, noise=0.14)
                m.ball(0.3, (b1[0], b1[1], b1[2] + 0.22), SNOW[2], subdiv=0, scale=(1, 1, 0.5))
    for x, y, h, R, _ in trees:
        st = mark(m)
        m.ball(R * 0.7, (x + 0.2, y - 0.1, -0.2), SNOW[1], subdiv=1, scale=(1.1, 0.9, 0.3), jitter=0.06)
        facet(m, new_faces(m, st), SNOW, noise=0.06, bias=0.2)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def emberroot(v):
    """Scenery (tundra, springs): an emberroot, whose roots go down to the Engine's heat. A black,
    knotted trunk forking into arching limbs that hang clusters of amber seed-lamps; round its foot
    the snow has melted back to wet dark ground. The one warm light in the white."""
    r = root("glacis_emberroot", v)
    rng = random.Random(1260 + v)
    m = Model(f"glacis_emberroot_{v}", 1260 + v)
    spec = {0: (3, 2.0, 1.9, 3.6), 1: (4, 1.5, 2.4, 2.9), 2: (2, 2.4, 2.0, 4.1)}[v]   # limbs, fork z, reach, crown z
    nl, fz, reach, cz = spec
    lean = {0: (0.2, 0.1), 1: (-0.1, 0.2), 2: (0.7, -0.3)}[v]
    fork = (lean[0], lean[1], fz)
    # the thaw: wet dark ground and a few meltwater puddles
    n = 11
    rr = reach + 0.2
    pts = [(math.cos(a) * rr * rng.uniform(0.8, 1.1), math.sin(a) * rr * rng.uniform(0.8, 1.1)) for a in (i / n * math.tau for i in range(n))]
    facet(m, m.slab(pts, -0.1, 0.05, THAW[0], top=[(x * 0.97, y * 0.97) for x, y in pts]), THAW, noise=0.2)
    for _ in range(3):
        a, d = rng.uniform(0, math.tau), rng.uniform(0.9, reach)
        m.cyl(rng.uniform(0.4, 0.7), 0.04, (math.cos(a) * d, math.sin(a) * d, 0.05), "#4a7a8c", segs=6)
    st = mark(m)
    lump(m, rng, (0, 0, 0.15), (1.0, 0.9, 0.6), EBARK[1], n=12, flat=0.6)
    for k in range(4):
        a = k / 4 * math.tau + rng.uniform(-0.3, 0.3)
        limb(m, (0, 0, 0.4), (math.cos(a) * 1.4, math.sin(a) * 1.4, -0.1), 0.3, 0.12, EBARK[1], segs=4)
    limb(m, (0, 0, 0), fork, 0.42, 0.32, EBARK[1], segs=6)
    a0 = rng.uniform(0, math.tau)
    tips = []
    for j in range(nl):
        a = a0 + (j + rng.uniform(-0.2, 0.2)) / nl * math.tau
        if v == 2:
            a = a0 + (j - 0.5) * 1.1          # both limbs reaching the same way
        rch = reach * rng.uniform(0.85, 1.1)
        mid = (fork[0] + math.cos(a) * rch * 0.45, fork[1] + math.sin(a) * rch * 0.45, cz - 0.1)
        tip = (fork[0] + math.cos(a) * rch, fork[1] + math.sin(a) * rch, cz + rng.uniform(0.1, 0.4))
        end = (fork[0] + math.cos(a) * rch * 1.12, fork[1] + math.sin(a) * rch * 1.12, cz - 0.4)
        limb(m, fork, mid, 0.3, 0.22, EBARK[1], segs=5)
        m.ball(0.22, mid, EBARK[1], subdiv=0)
        limb(m, mid, tip, 0.22, 0.15, EBARK[1], segs=5)
        m.ball(0.15, tip, EBARK[1], subdiv=0)
        limb(m, tip, end, 0.15, 0.12, EBARK[1], segs=4)
        tips.append(end)
    facet(m, new_faces(m, st), EBARK, noise=0.12)
    for e in tips:
        # a dark husk, and the seed-lamps hanging under it
        m.cyl(0.42, 0.3, (e[0], e[1], e[2] - 0.05), EBARK[0], segs=5, r_top=0.15)
        for k in range(3):
            a = k / 3 * math.tau + rng.uniform(0, 1)
            m.ball(rng.uniform(0.24, 0.3), (e[0] + math.cos(a) * 0.28, e[1] + math.sin(a) * 0.28, e[2] - 0.25 - 0.15 * k),
                   EMBER if k else HOT_PALE, subdiv=0, glow=True)
    # snow banked just outside the thaw
    for k in range(4):
        a = rng.uniform(0, math.tau)
        st = mark(m)
        m.ball(1.0, (math.cos(a) * (rr + 0.4), math.sin(a) * (rr + 0.4), -0.15), SNOW[1], subdiv=1,
               scale=(1.4, 0.9, 0.35), rot=(0, 0, a + math.pi / 2), jitter=0.08)
        facet(m, new_faces(m, st), SNOW, noise=0.06, bias=0.2)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    light(r, (fork[0], fork[1], cz - 0.5), EMBER, radius=5, intensity=0.6, flicker=0.08, halo=False)
    return r


def tussock(v):
    """Scenery (tundra): frozen sedge, tough ochre tufts rimed white at the tips, the ground layer
    the herds graze; a few (v0), a straggling line (v1), big old hummocks (v2)."""
    r = root("glacis_tussock", v)
    rng = random.Random(1280 + v)
    m = Model(f"glacis_tussock_{v}", 1280 + v)
    if v == 0:
        spots = [(rng.uniform(-1.6, 1.6), rng.uniform(-1.6, 1.6), rng.uniform(1.0, 1.5)) for _ in range(6)]
    elif v == 1:
        spots = [(i * 0.9 - 3.2 + rng.uniform(-0.3, 0.3), math.sin(i * 0.8) * 0.8 + rng.uniform(-0.3, 0.3), rng.uniform(0.9, 1.4))
                 for i in range(8)]
    else:
        spots = [(0, 0, 2.1), (1.9, 0.9, 1.6), (-1.7, 1.2, 1.4), (0.5, -1.9, 1.3)]
    spots = [(x * 1.3, y * 1.3, s) for x, y, s in spots]
    for x, y, s in spots:
        st = mark(m)
        m.ball(0.55 * s, (x, y, 0.05), TUSS[0], subdiv=0, scale=(1, 1, 0.6))
        for k in range(3):
            a = rng.uniform(0, math.tau)
            lx, ly = math.cos(a) * 0.3 * s, math.sin(a) * 0.3 * s
            limb(m, (x + lx * 0.3, y + ly * 0.3, 0.1), (x + lx, y + ly, 0.9 * s * rng.uniform(0.8, 1.2)), 0.32 * s, 0.04,
                 TUSS[1], segs=4, twist=rng.uniform(0, 1))
        jitter(m, new_faces(m, st), 0.04 * s)
        fs = new_faces(m, st)
        facet(m, fs, TUSS, noise=0.18)
        paint(m, [f for f in fs if f.calc_center_median().z > 0.62 * s and f.normal.z > 0.2], lambda f: SNOW[2])
    st = mark(m)
    m.ball(1.0, (0, 0, -0.2), SNOW[1], subdiv=1, scale=(2.2 if v != 1 else 3.6, 1.5, 0.25), jitter=0.1)
    facet(m, new_faces(m, st), SNOW, noise=0.06, bias=0.2)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def tusk_bones(v):
    """Scenery (tundra): what the herds leave. A skull with its two great tusks curling up out of the
    snow (v0); a ribcage arching over the drift (v1); one tusk, broken, and scattered bones (v2)."""
    r = root("glacis_tusk_bones", v)
    rng = random.Random(1300 + v)
    m = Model(f"glacis_tusk_bones_{v}", 1300 + v)
    def tusk(base, a, L, r0, curl=1.0):
        pts, rad = [], []
        for i in range(7):
            t = i / 6
            ang = a + curl * t * 1.4
            d = L * 0.55 * math.sin(t * 2.2)
            pts.append((base[0] + math.cos(a) * L * 0.6 * t + math.cos(ang) * d * 0.4,
                        base[1] + math.sin(a) * L * 0.6 * t + math.sin(ang) * d * 0.4,
                        base[2] + math.sin(t * 2.6) * L * 0.2))
            rad.append(r0 * (1 - 0.75 * t) + 0.05)
        return path_tube(m, pts, rad, IVORY[2], segs=6)
    st = mark(m)
    if v == 0:
        lump(m, rng, (0, 0, 0.3), (1.2, 1.0, 0.8), IVORY[1], n=14, flat=0.4)
        m.box((0.5, 0.35, 0.3), (-0.35, 0.55, 0.85), "#3a2e2a")
        m.box((0.5, 0.35, 0.3), (0.35, 0.55, 0.85), "#3a2e2a")
        for s in (-1, 1):
            tusk((s * 0.55, 0.8, 0.2), math.pi / 2 + s * 0.25, 4.2, 0.36, curl=-s)
    elif v == 1:
        for i in range(6):
            y = i * 0.75 - 1.9
            lump(m, rng, (0, y, 0.15), (0.35, 0.3, 0.3), IVORY[1], n=8)
            h = 1.8 - abs(i - 2.2) * 0.25
            for s in (-1, 1):
                path_tube(m, [(s * 0.2, y, 0.3), (s * 1.0, y, h * 0.85), (s * 1.7, y + 0.1, h * 0.4), (s * 1.9, y + 0.15, -0.1)],
                          [0.17, 0.15, 0.13, 0.11], IVORY[2], segs=5)
    else:
        tusk((0, 0, -0.2), 0.3, 5.0, 0.42, curl=1.0)
        for _ in range(5):
            x, y = rng.uniform(-2, 2.5), rng.uniform(-1.8, 1.8)
            lump(m, rng, (x, y, 0.1), (rng.uniform(0.3, 0.6), rng.uniform(0.25, 0.4), 0.25), IVORY[1], n=8)
    facet(m, new_faces(m, st), IVORY, noise=0.1)
    for _ in range(3 if v != 1 else 2):
        st = mark(m)
        a = rng.uniform(0, math.tau)
        m.ball(1.0, (math.cos(a) * 1.2, math.sin(a) * 1.2, -0.25), SNOW[1], subdiv=1, scale=(1.8, 1.2, 0.45), jitter=0.1)
        facet(m, new_faces(m, st), SNOW, noise=0.06, bias=0.2)
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
            m.cyl(0.45, 0.2, (x, y - 0.95, 2.1), COOL if i == 1 else HOT, segs=6, glow=True, rot=(0.5 + math.pi / 2, 0, 0))
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


# --- Engine City scenery --------------------------------------------------------------------------

RUBBER = ["#2a4656", "#3a5e70", "#52808e"]   # frosted teal sheathing
COOL = "#8ad8ff"          # the Engine's standby lights: cold, where the furnace isn't yet


def _convex_clip(poly, nx, ny, c):
    """Keep the part of a convex polygon where nx*x + ny*y <= c."""
    out = []
    for i in range(len(poly)):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        dp, dq = nx * p[0] + ny * p[1] - c, nx * q[0] + ny * q[1] - c
        if dp <= 0:
            out.append(p)
        if (dp <= 0) != (dq <= 0):
            t = dp / (dp - dq)
            out.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    return out


def radiator(v):
    """Scenery (engine city): the Engine's heat sinks. A long housing with fins along its back, snow
    lying in the troughs, a hot seam at its foot (v0); two banks at right angles (v1); twin tanks
    banded in metal, snow-capped, piped together (v2)."""
    r = root("glacis_radiator", v)
    rng = random.Random(1500 + v)
    m = Model(f"glacis_radiator_{v}", 1500 + v)
    def bank(x, y, L, W, H, ang, fins):
        st = mark(m)
        m.box((L + 0.4, W + 0.6, 0.4), (0, 0, 0.0), METAL[1])
        m.box((L, W, H), (0, 0, 0.2 + H / 2), METAL[2])
        for i in range(fins):
            fx = -L / 2 + 0.35 + i * (L - 0.7) / (fins - 1)
            m.box((0.32, W * 0.9, 1.1), (fx, 0, 0.2 + H + 0.55), METAL[3])
            if i < fins - 1:
                m.box(((L - 0.7) / (fins - 1) - 0.32, W * 0.86, 0.3), (fx + (L - 0.7) / (fins - 1) / 2, 0, 0.2 + H + 0.15), SNOW[2])
        m.box((L * 0.8, 0.3, 0.3), (0, -W / 2 - 0.05, 0.45), HOT, glow=True)
        m.box((0.35, W * 0.5, 0.3), (L / 2 + 0.05, 0, 0.2 + H * 0.7), COOL, glow=True)
        fs = xform(m, st, M((x, y, 0), (0, 0, ang)))
        facet(m, [f for f in fs if m.mats[f.material_index].name in ("c_" + METAL[1][1:], "c_" + METAL[2][1:], "c_" + METAL[3][1:])],
              METAL, noise=0.05)
    if v == 0:
        bank(0, 0, 5.6, 2.2, 1.2, 0, 8)
        m.box((1.0, 1.0, 0.8), (3.4, 1.2, 0.4), METAL[1])
        m.cyl(0.3, 0.1, (3.4, 1.2, 0.8), COOL, segs=6, glow=True)
    elif v == 1:
        bank(-0.8, 0.6, 4.6, 1.8, 1.0, 0, 7)
        bank(1.9, -1.6, 3.4, 1.8, 1.4, math.pi / 2, 5)
    else:
        for x in (-1.3, 1.3):
            st = mark(m)
            m.cyl(1.15, 2.6, (x, 0, 0), METAL[2], segs=8)
            for z in (0.5, 1.6):
                m.cyl(1.25, 0.3, (x, 0, z), METAL[1], segs=8)
            facet(m, new_faces(m, st), METAL, noise=0.05)
            st = mark(m)
            m.ball(1.08, (x, 0, 2.6), SNOW[2], subdiv=1, scale=(1, 1, 0.35), jitter=0.04)
            facet(m, new_faces(m, st), SNOW, bias=0.3)
            m.box((0.3, 0.6, 0.3), (x, -1.2, 1.1), HOT, glow=True)
        limb(m, (-1.3, 0, 1.9), (1.3, 0, 1.9), 0.35, 0.35, METAL[3], segs=6)
        m.cyl(0.45, 0.2, (0, -0.35, 1.9), HOT_DEEP, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    _drift(m, rng, (rng.uniform(-1, 1), 1.6, -0.1), (2.2, 0.9, 0.4))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    light(r, (0, -1.5, 0.8), HOT, radius=4, intensity=0.5, halo=False)
    return r


def cable_run(v):
    """Scenery (engine city): the Engine's cables, thick as a ship, snaking over the floor in
    bundles, clamped, half under the snow; a junction box with a cold standby light at one end."""
    r = root("glacis_cable_run", v)
    rng = random.Random(1520 + v)
    m = Model(f"glacis_cable_run_{v}", 1520 + v)
    L = (8.0, 7.0, 6.0)[v]
    def path(t):
        if v == 0:
            return (t * L - L / 2, math.sin(t * 2.0) * 0.6)
        if v == 1:
            return (t * L - L / 2, math.sin(t * math.tau) * 1.6)
        return (t * L - L / 2, (t ** 2) * 2.0)
    st = mark(m)
    for k, (dy, rad) in enumerate(((-0.55, 0.36), (0.0, 0.42), (0.55, 0.3))):
        pts, rads = [], []
        for i in range(9):
            t = i / 8
            x, y = path(t)
            z = rad * 0.6 + (0.15 * math.sin(t * 9 + k) if i not in (0, 8) else 0)
            if v == 2 and t > 0.85:
                z -= (t - 0.85) * 6
            pts.append((x, y + dy, z))
            rads.append(rad)
        path_tube(m, pts, rads, RUBBER[1], segs=6)
    facet(m, new_faces(m, st), RUBBER, noise=0.08)
    st = mark(m)
    for t in (0.2, 0.5, 0.8):
        x, y = path(t)
        x2, y2 = path(t + 0.01)
        m.box((0.5, 1.8, 1.0), (x, y, 0.35), METAL[3], rot=(0, 0, math.atan2(y2 - y, x2 - x)))
    x, y = path(0)
    m.box((1.4, 2.2, 1.3), (x - 0.6, y, 0.6), METAL[2])
    facet(m, new_faces(m, st), METAL, noise=0.05)
    m.box((0.3, 0.9, 0.3), (x - 1.32, y, 0.8), COOL, glow=True)
    if v == 2:
        xe, ye = path(1)
        st = mark(m)
        m.cyl(1.6, 0.4, (xe - 0.3, ye, -0.2), METAL[1], segs=6)
        facet(m, new_faces(m, st), METAL, noise=0.05)
        m.cyl(1.1, 0.1, (xe - 0.3, ye, 0.2), HOT_DEEP, segs=6, glow=True)
    for t in (0.35, 0.65):
        x, y = path(t)
        _drift(m, rng, (x, y + 0.6, 0.0), (1.0, 1.0, 0.4))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def ice_crust(v):
    """Scenery (engine city): the White Furnace showing through. Ice plates gone over the floor,
    cracked apart, and the orange light of the Engine burning up through the cracks; one plate
    heaved up on its edge (v2)."""
    r = root("glacis_ice_crust", v)
    rng = random.Random(1540 + v)
    m = Model(f"glacis_ice_crust_{v}", 1540 + v)
    R, sy = ((3.0, 1.0), (4.2, 0.65), (2.6, 1.0))[v]
    n = 12
    outline = [(math.cos(a) * R * rng.uniform(0.85, 1.05), math.sin(a) * R * sy * rng.uniform(0.85, 1.05))
               for a in (i / n * math.tau for i in range(n))]
    m.slab(outline, -0.1, 0.04, HOT_DEEP, glow=True)
    seeds = [(rng.uniform(-R, R) * 0.8, rng.uniform(-R, R) * sy * 0.8) for _ in range((7, 9, 5)[v])]
    for i, (sx_, sy_) in enumerate(seeds):
        cell = [(x * 1.02, y * 1.02) for x, y in outline]
        for j, (ox, oy) in enumerate(seeds):
            if i == j:
                continue
            nx, ny = ox - sx_, oy - sy_
            c = (ox * ox + oy * oy - sx_ * sx_ - sy_ * sy_) / 2
            cell = _convex_clip(cell, nx, ny, c)
            if len(cell) < 3:
                break
        if len(cell) < 3:
            continue
        cx = sum(p[0] for p in cell) / len(cell)
        cy = sum(p[1] for p in cell) / len(cell)
        # shrink toward the middle to open the crack
        cell = [(cx + (x - cx) * 0.86 - 0.08 * math.copysign(1, x - cx) * 0, cy + (y - cy) * 0.86) for x, y in cell]
        top = [(cx + (x - cx) * 0.9, cy + (y - cy) * 0.9) for x, y in cell]
        h = rng.uniform(0.25, 0.45)
        st = mark(m)
        m.slab(cell, -0.05, h, ICE_LOW[1], top=top)
        fs = new_faces(m, st)
        facet(m, fs, ICE_LOW, noise=0.15, bias=-0.25)
        if rng.random() < 0.25:
            paint(m, [f for f in fs if f.normal.z > 0.9], lambda f: SNOW[2])
        if v == 2 and i == 0:
            xform(m, st, M((cx, cy, 0.2)) @ M(rot=(0.7, 0.2, 0)) @ M((-cx, -cy, 0)))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    light(r, (0, 0, 0.6), HOT, radius=5, intensity=0.6, flicker=0.15, halo=False)
    return r


def hexcells(v):
    """Scenery (engine city): the Engine's cells, hexagonal capsules standing packed like a comb,
    frost on their caps, snow on some, a few open on the orange inside and a few still showing a
    cold standby light: a cluster (v0), a broken row (v1), a low floor of them (v2)."""
    r = root("glacis_hexcells", v)
    rng = random.Random(1560 + v)
    m = Model(f"glacis_hexcells_{v}", 1560 + v)
    d = 1.75
    if v == 0:
        cells = [(0, 0)] + [(math.cos(a) * d, math.sin(a) * d) for a in (k / 6 * math.tau + math.pi / 6 for k in range(6))]
        hfn = lambda x, y: 2.8 - math.hypot(x, y) * 0.5 + rng.uniform(-0.3, 0.3)
    elif v == 1:
        cells = [(i * d * 0.87 - 2.6, (i % 2) * d * 0.5) for i in range(5)]
        hfn = lambda x, y: rng.uniform(1.0, 2.6)
    else:
        cells = []
        for q in range(-2, 3):
            for rr_ in range(-1, 2):
                x = q * d * 0.87
                y = rr_ * d + (q % 2) * d / 2
                if rng.random() < 0.8:
                    cells.append((x, y))
        hfn = lambda x, y: rng.uniform(0.4, 0.9)
    for i, (x, y) in enumerate(cells):
        h = max(0.4, hfn(x, y))
        st = mark(m)
        m.cyl(0.95, h, (x, y, -0.1), METAL[2], segs=6, r_top=0.88, rot=(0, 0, math.pi / 6))
        facet(m, new_faces(m, st), METAL, noise=0.05)
        cap = rng.random()
        if cap < 0.28:
            m.cyl(0.62, 0.1, (x, y, h - 0.1), "#2a1a14", segs=6, rot=(0, 0, math.pi / 6))
            m.cyl(0.42, 0.12, (x, y, h - 0.08), HOT, segs=6, rot=(0, 0, math.pi / 6), glow=True)
        elif cap < 0.4:
            m.cyl(0.32, 0.1, (x, y, h - 0.1), COOL, segs=6, rot=(0, 0, math.pi / 6), glow=True)
        elif cap < 0.75:
            st = mark(m)
            m.cyl(0.84, 0.18, (x, y, h - 0.1), SNOW[2], segs=6, r_top=0.6, rot=(0, 0, math.pi / 6))
            facet(m, new_faces(m, st), SNOW, bias=0.3)
        else:
            m.cyl(0.7, 0.08, (x, y, h - 0.1), ICE_LOW[2], segs=6, rot=(0, 0, math.pi / 6))
    if v == 1:
        _chunk(m, rng, (2.0, -1.5, -0.3), (3.6, 0.2, 0.6), METAL, n=9)
    _drift(m, rng, (rng.uniform(-1, 1), -1.6, -0.1), (2.4, 1.0, 0.45))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    light(r, (0, 0, 2.0), HOT, radius=5, intensity=0.5, halo=False)
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
    for v in range(4):
        bellcrown(v)
    for v in range(3):
        penitents(v)
        sastrugi(v)
        hum_crystal(v)
        relic(v)
    for v in range(3):
        rimpool(v)
        frost_reed(v)
        mistwillow(v)
        blushcap(v)
        tusk_bones(v)
        tussock(v)
        emberroot(v)
        lichen_rock(v)
        engine_vent(v)
        radiator(v)
        cable_run(v)
        ice_crust(v)
        hexcells(v)
