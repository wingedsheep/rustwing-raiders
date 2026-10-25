"""MIREFALL, the Spore Vents: where the bloom breathes (docs/level-design.md, its layout row). Under
the fen the bloom's root-mat is a thousand years thick, and its breath comes up through the crust
wherever the old ground is broken. Round each live vent the breath lays down a crust, ochre and
lumpy as a sponge, its tops cooked pale; a dead vent caves in and goes grey. Where a vent has
breathed long enough it builds itself a chimney: a dark fluted stack crowned with teal shelves,
tall enough to hit. Round them all the little things that fruit in the breath: dark stems with
ochre beads. Built into set_mirefall (see its build())."""
from __future__ import annotations

import math
import random

from mathutils import Vector

from kit import Model
from props_a_lib import collider, lump, pulse, recolor, root, tube

# the crust a live vent breathes out: ochre, cooked pale on top, rust in its shade
CRUST = ["#c66e38", "#b45c2e", "#d4813f"]
CRUST_TOP = "#e6ad6c"
CRUST_DARK = "#7a3622"
# a vent's throat: near black, warm deep down
THROAT = "#1c1814"
THROAT_GLOW = "#d8803a"
# a dead vent: grey crust, ash
ASH = ["#727a70", "#82897e", "#666c64"]
ASH_TOP = "#a8ae9e"
ASH_DARK = "#3e423c"
# the chimneys: near-black fluted crust, a cool sheen, teal shelves
STALK = ["#323b3e", "#3a4446", "#2a3235"]
STALK_TOP = "#5a6668"
CAP = ["#3a5856", "#42625e", "#34504e"]
CAP_TOP = "#6a9a8e"
CAP_DARK = "#22383a"
# the beads the little things fruit, ochre (never a bright speck: that's for danger)
BEAD = "#c8643a"
BEAD_TOP = "#e89a5e"
# the crust's own floor, sage like the ground round it
SAGE = "#6e7a68"


def _shade(m, faces, top, dark=None, dot=0.6, sun=(-0.4, -0.5, 0.3), dark_dot=-0.3):
    """The tops lit, the faces turned from the light in shade."""
    L = Vector(sun).normalized()
    for f in faces:
        if f.is_valid:
            f.normal_update()

    def fn(f):
        if top and f.normal.z > dot:
            return top
        if dark and f.normal.dot(L) < dark_dot:
            return dark
        return None
    recolor(m, faces, fn)


def _crust_ring(m, rng, r_in, r_out, h, n, colors=CRUST, top=CRUST_TOP, dark=CRUST_DARK, gap=None, lean=0.0):
    """A ring of crust lumps round a throat: chunky, sponge-like, piled higher on the inside lip.
    `gap` (angle, width) leaves a notch where it's caved; `lean` heaps it on one side (+x)."""
    fs = []
    # (two courses: the lip, high and close-set, and a lower apron outside it, so it reads as one rim)
    for course, (d0, d1, hk, nk) in enumerate(((r_in, r_in + (r_out - r_in) * 0.55, 1.0, n), (r_in + (r_out - r_in) * 0.45, r_out, 0.55, n + 2))):
        for k in range(nk):
            a = (k + course * 0.5) * math.tau / nk + rng.uniform(-0.1, 0.1)
            if gap and abs((a - gap[0] + math.pi) % math.tau - math.pi) < gap[1]:
                continue
            heap = 1 + max(0.0, math.cos(a)) * lean
            d = rng.uniform(d0, d1)
            rr = max(0.35, (r_out - r_in) * rng.uniform(0.38, 0.5) * (1.2 if course else 1.0))
            arc_w = max(rr * 1.3, d * math.tau / nk * 0.65)
            hh = h * hk * heap * rng.uniform(0.75, 1.1)
            lp = lump(m, rng, (0, 0, hh * 0.3), (rr, arc_w, hh * 0.7), colors[(k + course) % len(colors)], n=12, flat=0.5)
            # (built radial along x, then turned to run round the ring and moved out to it)
            ca, sa = math.cos(a), math.sin(a)
            for v in {v for f in lp for v in f.verts}:
                x, y = v.co.x, v.co.y
                v.co.x = ca * d + x * ca - y * sa
                v.co.y = sa * d + x * sa + y * ca
            fs += lp
    _shade(m, fs, top, dark, dot=0.8)
    return fs


def _beads(m, rng, x, y, z0, n, reach, h=(0.6, 1.4), color=BEAD, top=BEAD_TOP, stem=STALK[0]):
    """A tuft: thin dark stems from (x, y, z0), each tipped with a bead."""
    for k in range(n):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0, reach)
        hh = rng.uniform(*h)
        lean = (math.cos(a) * 0.25 * hh, math.sin(a) * 0.25 * hh)
        bx, by = x + math.cos(a) * d, y + math.sin(a) * d
        tube(m, [(bx, by, z0 - 0.1), (bx + lean[0] * 0.5, by + lean[1] * 0.5, z0 + hh * 0.55), (bx + lean[0], by + lean[1], z0 + hh)],
             [0.09, 0.07, 0.06], stem, segs=4)
        b = m.ball(rng.uniform(0.17, 0.27), (bx + lean[0], by + lean[1], z0 + hh + 0.08), color, subdiv=0, scale=(1, 1, 1.25))
        _shade(m, list(b), top, None, dot=0.5)


def vent_cone(variants):
    """Scenery: a live vent's cone of crust round its throat, or a dead one caved and grey. A squat
    ring; a taller spatter cone, crust spilling down its lee; two mouths run together; dead. About
    4-6 across, under 2.5 tall. The throat's warm glow breathes."""
    for i in range(variants):
        rng = random.Random(6100 + i)
        r = root("mirefall_vent_cone", i)
        m = Model(f"mirefall_vent_cone_{i}", 6100 + i)
        dead = i == 3
        mouths = [(0.0, 0.0, 1.0)] if i != 2 else [(-0.9, 0.3, 0.95), (1.5, -0.4, 0.7)]
        for (mx, my, ms) in mouths:
            if i == 0:
                fs = _crust_ring(m, rng, 1.0 * ms, 2.1 * ms, 1.0 * ms, 11)
            elif i == 1:
                fs = _crust_ring(m, rng, 0.85, 2.4, 1.9, 13, lean=0.5)
                # a skirt of older crust round the foot, flatter, sage at its edge
                fs += _crust_ring(m, rng, 2.2, 3.1, 0.55, 12, colors=[CRUST[1], SAGE, CRUST[0]])
            elif i == 2:
                fs = _crust_ring(m, rng, 0.8 * ms, 1.9 * ms, 1.3 * ms, 10)
            else:
                fs = _crust_ring(m, rng, 1.2, 2.4, 0.8, 10, colors=ASH, top=ASH_TOP, dark=ASH_DARK, gap=(rng.uniform(0, math.tau), 0.7))
            if mx or my:
                for v in {v for f in fs for v in f.verts}:
                    v.co.x += mx
                    v.co.y += my
            if dead:
                # caved: its throat filled with ash, a few slabs fallen in
                m.cyl(1.3, 0.3, (mx, my, -0.1), ASH[2], segs=7)
                for k in range(3):
                    a = rng.uniform(0, math.tau)
                    lump(m, rng, (mx + math.cos(a) * 0.6, my + math.sin(a) * 0.6, 0.25), (0.5, 0.4, 0.25), ASH[k % 3], n=10, flat=0.5)
            else:
                # the throat: dark, a warm glow down in it (its own object, so it can breathe)
                m.cyl(0.95 * ms if i != 1 else 0.85, 0.12, (mx, my, 0.05 if i != 1 else 0.35), THROAT, segs=7)
        if not dead:
            # what fruits on the rim: a tuft or two of beads, and a small stack on the big cone
            for k in range(2 if i != 1 else 3):
                a = rng.uniform(0, math.tau)
                _beads(m, rng, math.cos(a) * 2.2, math.sin(a) * 2.2, 0.4, 4, 0.4, h=(0.5, 1.1))
            if i == 1:
                tube(m, [(2.1, 1.4, 0), (2.15, 1.45, 1.6), (2.1, 1.5, 2.6)], [0.42, 0.34, 0.3], STALK[0], segs=6)
                m.cyl(0.75, 0.22, (2.1, 1.5, 2.55), CAP[0], segs=7, r_top=0.6)
        m.build(r)
        if not dead:
            for k, (mx, my, ms) in enumerate(mouths):
                g = Model(f"mirefall_vent_cone_{i}_glow{k}", 6110 + i * 2 + k)
                g.cyl(0.55 * ms, 0.08, (0, 0, 0), THROAT_GLOW, segs=7, glow=True)
                g.cyl(0.3 * ms, 0.1, (0, 0, 0.02), "#f0b070", segs=6, glow=True)
                obj = g.build(parent=r, loc=(mx, my, 0.12 if i != 1 else 0.45))
                pulse(obj, f"mirefall_vent_cone_{i}_{k}_breathe_idle", amp=0.25, period=2.6 + i * 0.4 + k * 0.7)


def rim_crust(variants):
    """Scenery: a run of crust lining a crater's rim: an arc of sponge-lumps, lipped pale on top,
    sloping in towards the crater (which lies off +y). About 6 along."""
    R0 = 5.0
    for i in range(variants):
        rng = random.Random(6200 + i)
        r = root("mirefall_rim_crust", i)
        m = Model(f"mirefall_rim_crust_{i}", 6200 + i)
        fs = []
        n = 7 + i
        span = 0.62 + i * 0.08
        for k in range(n):
            phi = -span + 2 * span * k / (n - 1) + rng.uniform(-0.04, 0.04)
            x = R0 * math.sin(phi)
            y = R0 - R0 * math.cos(phi)
            # (the lip: higher, on the crater's side; the outer slope lower, wider)
            h = rng.uniform(0.7, 1.15) * (1 - 0.35 * abs(phi) / span)
            fs += lump(m, rng, (x, y + 0.2, h * 0.3), (0.85, 0.7, h * 0.7), CRUST[k % 3], n=12, flat=0.5)
            fs += lump(m, rng, (x * 1.05, y - 0.9, 0.12), (1.0, 0.8, 0.35), [CRUST[1], SAGE][k % 2], n=10, flat=0.6)
        _shade(m, fs, CRUST_TOP, CRUST_DARK)
        if i != 1:
            phi = rng.uniform(-span * 0.6, span * 0.6)
            _beads(m, rng, R0 * math.sin(phi), R0 - R0 * math.cos(phi) - 1.1, 0.25, 5, 0.5, h=(0.5, 1.2))
        m.build(r)


def _stalk(m, rng, x, y, h, r0, cold=False, shelves=1, lean=(0.0, 0.0)):
    """A chimney: a fluted dark stalk (bulging where it grew in spurts), crowned with a teal shelf
    cap; `shelves` more caps stepping down its side. A cold one's snapped, its top ragged."""
    n = max(3, int(h / 1.6))
    pts, radii, cols = [], [], []
    for k in range(n + 1):
        u = k / n
        pts.append((x + lean[0] * u * u, y + lean[1] * u * u, h * u))
        bulge = 1 + 0.18 * math.sin(u * 9 + rng.uniform(0, 1))
        radii.append(r0 * (1.25 - 0.45 * u) * bulge)
        cols.append(STALK[k % 3] if not cold else [ASH_DARK, STALK[2], ASH_DARK][k % 3])
    fs = tube(m, pts, radii, STALK[0], segs=7, colors=cols)
    # the flutes: ribs up its sides
    for k in range(4):
        a = k * math.tau / 4 + rng.uniform(0, 0.5)
        hh = h * rng.uniform(0.5, 0.85)
        fs += tube(m, [(x + math.cos(a) * r0 * 1.1, y + math.sin(a) * r0 * 1.1, 0), (x + math.cos(a) * r0 * 0.8 + lean[0] * 0.3, y + math.sin(a) * r0 * 0.8 + lean[1] * 0.3, hh)],
                   [r0 * 0.35, r0 * 0.15], STALK[2], segs=4)
    _shade(m, fs, STALK_TOP, None, dot=0.7)
    top = (x + lean[0], y + lean[1], h)
    if cold:
        # snapped off: a ragged crown of splinters
        for k in range(5):
            a = k * math.tau / 5 + rng.uniform(-0.3, 0.3)
            tube(m, [(top[0] + math.cos(a) * radii[-1] * 0.7, top[1] + math.sin(a) * radii[-1] * 0.7, h - 0.3), (top[0] + math.cos(a) * radii[-1] * 0.5, top[1] + math.sin(a) * radii[-1] * 0.5, h + rng.uniform(0.3, 1.2))],
                 [radii[-1] * 0.35, 0], ASH_DARK, segs=3)
        return
    # the crown: brackets of teal shelf fungus round the top, at odd heights and tilts, a knob of
    # fresh crust in the middle where it still breathes
    cs = []
    rt = radii[-1]
    for k in range(3):
        a = k * math.tau / 3 + rng.uniform(-0.4, 0.4)
        cr = r0 * rng.uniform(0.85, 1.2)
        zz = h - rng.uniform(0.2, 1.4)
        cx, cy = top[0] + math.cos(a) * (rt + cr * 0.45), top[1] + math.sin(a) * (rt + cr * 0.45)
        cs += list(m.cyl(cr, 0.32, (cx, cy, zz), CAP[k % 3], segs=7, r_top=cr * 0.78, rot=(-math.sin(a) * 0.18, math.cos(a) * 0.18, 0)))
    cs += list(m.cyl(rt * 0.95, 0.5, (top[0], top[1], h - 0.1), CAP[1], segs=6, r_top=rt * 0.5))
    _shade(m, cs, CAP_TOP, CAP_DARK, dot=0.7)
    m.ball(rt * 0.55, (top[0], top[1], h + 0.45), CRUST[0], subdiv=0, scale=(1, 1, 0.7))
    for k in range(shelves):
        u = rng.uniform(0.45, 0.8)
        a = rng.uniform(0, math.tau)
        sr = r0 * rng.uniform(1.2, 1.6)
        rr = r0 * (1.25 - 0.45 * u)
        sx, sy = x + lean[0] * u * u + math.cos(a) * (rr + sr * 0.5), y + lean[1] * u * u + math.sin(a) * (rr + sr * 0.5)
        ss = list(m.cyl(sr, 0.3, (sx, sy, h * u), CAP[2], segs=7, r_top=sr * 0.8))
        _shade(m, ss, CAP_TOP, CAP_DARK, dot=0.7)


def stack(variants):
    """Obstacle: a chimney a vent built itself, tall enough to hit (top 14-16): one great stalk, a
    great one with a lesser fused at its foot, one stepped with shelves, and a dead one snapped off.
    Every variant stands on the one column at the origin (radius 1.6 at the flight line)."""
    for i in range(variants):
        rng = random.Random(6300 + i)
        r = root("mirefall_stack", i)
        m = Model(f"mirefall_stack_{i}", 6300 + i)
        h = (15.0, 14.0, 16.0, 13.5)[i]
        _stalk(m, rng, 0, 0, h, 1.55, cold=i == 3, shelves=(1, 1, 3, 0)[i], lean=(rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6)))
        if i == 1:
            _stalk(m, rng, 2.4, -1.2, 6.5, 0.8, shelves=0, lean=(0.5, -0.3))
        if i in (0, 2):
            _stalk(m, rng, -1.8, 1.6, 4.2, 0.55, shelves=0)
        # its foot: the crust it rose out of, beads round it
        fs = []
        for k in range(7):
            a = k * math.tau / 7 + rng.uniform(-0.2, 0.2)
            fs += lump(m, rng, (math.cos(a) * 2.2, math.sin(a) * 2.2, 0.2), (1.0, 0.85, 0.55), (ASH if i == 3 else CRUST)[k % 3], n=10, flat=0.5)
        _shade(m, fs, ASH_TOP if i == 3 else CRUST_TOP, ASH_DARK if i == 3 else CRUST_DARK)
        if i != 3:
            for k in range(2):
                a = rng.uniform(0, math.tau)
                _beads(m, rng, math.cos(a) * 2.8, math.sin(a) * 2.8, 0.3, 5, 0.6)
        m.build(r)
        collider(r, 0, 0, 1.6)


def stack_low(variants):
    """Scenery: a stand of little chimneys under the flight line (3-7 tall), two to four together,
    crowned teal; and a dead stand, snapped short and grey."""
    for i in range(variants):
        rng = random.Random(6400 + i)
        r = root("mirefall_stack_low", i)
        m = Model(f"mirefall_stack_low_{i}", 6400 + i)
        n = (3, 2, 4, 3)[i]
        for k in range(n):
            a = k * math.tau / n + rng.uniform(-0.4, 0.4)
            d = 0 if k == 0 else rng.uniform(1.3, 2.0)
            h = (6.5 if k == 0 else rng.uniform(3, 5)) * (0.75 if i == 3 else 1)
            _stalk(m, rng, math.cos(a) * d, math.sin(a) * d, h, 0.62 if k == 0 else 0.45, cold=i == 3, shelves=1 if k == 0 and i != 3 else 0,
                   lean=(math.cos(a) * 0.4, math.sin(a) * 0.4))
        fs = []
        for k in range(5):
            a = k * math.tau / 5 + rng.uniform(-0.3, 0.3)
            fs += lump(m, rng, (math.cos(a) * 1.4, math.sin(a) * 1.4, 0.15), (0.8, 0.65, 0.4), (ASH if i == 3 else CRUST)[k % 3], n=10, flat=0.5)
        _shade(m, fs, ASH_TOP if i == 3 else CRUST_TOP, ASH_DARK if i == 3 else CRUST_DARK)
        if i != 3:
            a = rng.uniform(0, math.tau)
            _beads(m, rng, math.cos(a) * 2, math.sin(a) * 2, 0.2, 5, 0.5)
        m.build(r)


def tuft(variants):
    """Scenery, the small details: what fruits in the breath. Dark stems tipped with ochre beads in
    a clump; one with a little teal cap among them; one a lump of crust sprouting them."""
    for i in range(variants):
        rng = random.Random(6500 + i)
        r = root("mirefall_tuft", i)
        m = Model(f"mirefall_tuft_{i}", 6500 + i)
        if i == 3:
            fs = lump(m, rng, (0, 0, 0.3), (1.1, 0.9, 0.6), CRUST[0], n=14, flat=0.5)
            _shade(m, fs, CRUST_TOP, CRUST_DARK)
            _beads(m, rng, 0, 0, 0.6, 6, 0.6, h=(0.4, 1.0))
        else:
            _beads(m, rng, 0, 0, 0, (7, 9, 6)[i], (0.7, 0.9, 0.6)[i], h=(0.6, 1.7))
            if i == 1:
                _stalk(m, rng, 0.6, -0.5, 1.8, 0.22, shelves=0)
            if i == 2:
                fs = lump(m, rng, (-0.7, 0.4, 0.15), (0.6, 0.5, 0.3), SAGE, n=10, flat=0.5)
                _shade(m, fs, "#8a9682", None)
        m.build(r)


def throat(variants):
    """Scenery: the maar's great throat, at the middle of its floor: crust shelves stepping down
    inward like a stair of sponge, a ring of little chimneys, the throat dark and glowing deep down.
    About 16 across, under 3 tall. Its glow breathes, slow."""
    for i in range(variants):
        rng = random.Random(6600 + i)
        r = root("mirefall_throat", i)
        m = Model(f"mirefall_throat_{i}", 6600 + i)
        for k, (ri, ro, h) in enumerate(((5.6, 8.0, 0.9), (4.0, 6.0, 1.5), (2.6, 4.3, 2.2))):
            _crust_ring(m, rng, ri, ro, h, 16 + k * 2 if k < 2 else 14, colors=[CRUST[(k + j) % 3] for j in range(3)])
        m.cyl(2.9, 0.15, (0, 0, 0.6), THROAT, segs=9)
        for k in range(6):
            a = k * math.tau / 6 + rng.uniform(-0.2, 0.2)
            d = rng.uniform(6.2, 7.6)
            _stalk(m, rng, math.cos(a) * d, math.sin(a) * d, rng.uniform(3.5, 6.5), 0.5, shelves=0, lean=(math.cos(a) * 0.5, math.sin(a) * 0.5))
        for k in range(6):
            a = rng.uniform(0, math.tau)
            _beads(m, rng, math.cos(a) * 5.0, math.sin(a) * 5.0, 1.0, 5, 0.6)
        m.build(r)
        g = Model(f"mirefall_throat_{i}_glow", 6610 + i)
        g.cyl(2.1, 0.08, (0, 0, 0), THROAT_GLOW, segs=9, glow=True)
        g.cyl(1.2, 0.1, (0, 0, 0.02), "#f0b070", segs=8, glow=True)
        obj = g.build(parent=r, loc=(0, 0, 0.7))
        pulse(obj, f"mirefall_throat_{i}_breathe_idle", amp=0.2, period=3.6)


def build():
    vent_cone(4)
    rim_crust(3)
    stack(4)
    stack_low(4)
    tuft(4)
    throat(1)
