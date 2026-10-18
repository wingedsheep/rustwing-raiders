"""GLACIS, the White Furnace: frozen on top, burning underneath. Blue ice spires and aurora light
on the shelf, pink-and-turquoise hot springs, dark snow-laden conifers on the mammoth tundra, and
under the ice an alien machine city waking up in orange."""
from __future__ import annotations

import math
import random

from kit import Model, emitter, light
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


def ice_block(v):
    r = root("ice_block", v)
    rng = random.Random(120 + v)
    m = Model(f"ice_block_{v}", 120 + v)
    if v == 0:
        # a tabular berg: flat snowy top, blue cliff sides
        n = 7
        pts = [(math.cos(a) * rng.uniform(1.8, 2.5), math.sin(a) * rng.uniform(1.5, 2.1))
               for a in (i / n * math.tau for i in range(n))]
        top = [(x * 0.9, y * 0.9) for x, y in pts]
        f = m.slab(pts, -0.2, 1.4, ICE_LOW[0], top=top)
        facet(m, f, ICE_LOW, noise=0.1, bias=-0.2)
        cap = [(x * 0.86, y * 0.86) for x, y in pts]
        f = m.slab(top, 1.4, 1.65, SNOW[2], top=cap)
        facet(m, f, SNOW, noise=0.05)
        m.box((2.4, 0.35, 0.2), (0.2, 0.1, 1.62), ICE_LOW[1], rot=(0, 0, 0.4))   # a crack across the top
    elif v == 1:
        # tumbled cubes, broken off a shelf
        for (x, y, s) in ((0, 0, 1.8), (1.5, 0.9, 1.2), (-1.2, 1.1, 1.0), (0.7, -1.4, 0.9)):
            st = mark(m)
            m.box((s, s * rng.uniform(0.8, 1.1), s * rng.uniform(0.7, 1.0)), (0, 0, 0), ICE_LOW[0])
            xform(m, st, M((x, y, s * 0.3), (rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), rng.uniform(0, 3))))
            jitter(m, new_faces(m, st), 0.08)
            facet(m, new_faces(m, st), ICE_LOW, noise=0.15, bias=-0.25)
    else:
        # a pressure ridge: slabs shoved up on edge in a row
        for i in range(5):
            st = mark(m)
            w = rng.uniform(1.0, 1.6)
            m.box((w, 0.55, rng.uniform(1.6, 2.6)), (0, 0, 0), ICE_LOW[0])
            xform(m, st, M((i * 1.0 - 2.0, rng.uniform(-0.3, 0.3), 0.4),
                           (rng.uniform(-0.6, 0.6), rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3))))
            jitter(m, new_faces(m, st), 0.06)
            facet(m, new_faces(m, st), ICE_LOW, noise=0.15, bias=-0.3)
        st = mark(m)
        m.cyl(1.2, 0.3, (0, 0, -0.1), SNOW[1], segs=7, r_top=0.9)
        xform(m, st, M(scale=(2.2, 0.9, 1.0)))
        jitter(m, new_faces(m, st), 0.15)
        facet(m, new_faces(m, st), SNOW)
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
                m.cyl(rad * 0.88, 0.04, (0.15 * i - 0.25, -0.1 * i - 0.35, z + h), ALGAE[i % 2], segs=10, glow=True)
            z += h
        cx, cy = 0.3, -0.2
        for k, rad in enumerate((1.45, 1.15, 0.85, 0.5)):
            m.cyl(rad, 0.05, (cx, cy, z + 0.01 + k * 0.012), POOL[[4, 3, 2, 0][k]], segs=10, glow=True)
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
            m.cyl(0.8 * s, 0.05, (math.cos(a) * d, math.sin(a) * d, 0.08), ALGAE[0], segs=8, glow=True)
            m.cyl(0.4 * s, 0.05, (math.cos(a) * d, math.sin(a) * d, 0.1), POOL[0], segs=8, glow=True)
        emitter(r, (0, 0, 2.4), "steam")
        light(r, (0, 0, 2.6), HOT, radius=4, intensity=0.6, flicker=0.2)
    m.build(r)
    return r


def conifer(v):
    """A dark spruce bowed under snow: from above, rings of white and dark teal."""
    r = root("conifer", v)
    rng = random.Random(180 + v)
    m = Model(f"conifer_{v}", 180 + v)
    trees = {0: [(0, 0, 1.0, 4)], 1: [(0, 0, 0.75, 6)], 2: [(-0.8, 0.2, 0.75, 4), (0.9, -0.3, 0.55, 3)]}[v]
    for x, y, s, tiers in trees:
        m.cyl(0.22 * s, 1.2 * s, (x, y, 0), BARK, segs=5)
        step = 1.0 if tiers <= 4 else 0.82
        for i in range(tiers):
            z = (0.7 + i * step) * s
            rad = (1.65 - i * (1.35 / tiers)) * s
            col = PINE[(i + v) % 3]
            st = mark(m)
            m.cyl(rad, 1.5 * s, (x, y, z), col, segs=7, r_top=0.06, rot=(0, 0, rng.uniform(0, 1)))
            jitter(m, new_faces(m, st), 0.06 * s, z=False)
            facet(m, new_faces(m, st), [PINE[0], col, PINE_LIGHT], noise=0.1)
            # the snow load: a white cone sitting on the tier, leaving a dark fringe
            st = mark(m)
            m.cyl(rad * 0.84, 0.95 * s, (x + 0.05, y - 0.05, z + 0.5 * s), SNOW[2], segs=7, r_top=0.04,
                  rot=(0, 0, rng.uniform(0, 1)))
            jitter(m, new_faces(m, st), 0.05 * s, z=False)
            facet(m, new_faces(m, st), SNOW, noise=0.05, bias=0.2)
        m.ball(0.3 * s, (x, y, (0.7 + tiers * step) * s + 0.2), SNOW[2], subdiv=0)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


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
        for k in range(10):
            a = k / 10 * math.tau
            m.box((0.35, 0.9, 0.5), (math.cos(a) * 2.5, math.sin(a) * 2.5, 0.75), HOT, rot=(0, 0, a), glow=True)
        m.cyl(1.1, 0.25, (0, 0, 1.6), METAL[0], segs=8)
        eye_z, eye_r = 1.85, 0.85
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
            m.cyl(rad * 0.85, 0.16, (0, 0, z), HOT, segs=8, rot=(0, 0, math.pi / 8), glow=True)
            z += 0.12
        eye_z, eye_r = z, 0.7
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
    light(r, (0, 0, eye_z + 0.6), HOT, radius=6, intensity=0.9)
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
    for v in range(3):
        ice_block(v)
        snow_rock(v)
        conifer(v)
        light_strip(v)
    for v in range(2):
        steam_vent(v)
        alien_pylon(v)
        machine_dome(v)
