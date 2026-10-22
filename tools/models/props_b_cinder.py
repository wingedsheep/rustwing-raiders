"""CINDER ORCHARD, property of Vantorr Agricorp: copper trees in rows on olive terraces, fruiting
violet light; white silos and greenhouses lit by grow lamps; refinery stacks with flares; tanks;
pipelines you can race between. Company colours: white, copper, and a warning orange."""
from __future__ import annotations

import math
import random

from mathutils import Vector
from kit import Model, emitter, light
from props_b_kit import (M, collider, facet, flicker, jitter, limb, mark, new_faces, paint, pulse, ring, root, xform)

COPPER = ["#7a3e1e", "#a8582a", "#d0843a", "#eaa858", "#fcd08a"]
VERDIGRIS = ["#2e7a6a", "#4aa890", "#7ad0b8"]
BRONZE = ["#2e2220", "#45322a", "#5e4434"]
FRUIT = "#d27aff"
FRUIT_CORE = "#f4d0ff"
PAINT = ["#9a988e", "#c4c0b4", "#e2ded2", "#f4f2ea"]       # company white, shaded
STEEL = ["#2e3034", "#4a4c52", "#6a6c72", "#8e9096"]
ORANGE = "#e07a2a"
RED = "#c8342a"
HAZARD = "#e8c040"
CONCRETE = ["#5a5650", "#7a7670", "#9a968e"]
SOOT = "#26221f"
FLAME = ["#ff4a14", "#ff9a2a", "#ffe07a"]
GLASS = ["#5a9aa8", "#8ac8d4", "#bce6ee"]
GROW = "#a850f0"                                            # grow lamps through the glass
CHEM = "#b04aff"


# --- the Copper Orchards -----------------------------------------------------------------

def _leaves(m, faces, rng):
    """Copper leaf-mass, faceted bright and dark like beaten metal, with a bloom of verdigris."""
    facet(m, faces, COPPER[:4], noise=0.2, bias=-0.2)
    vg = [m._slot(c, False) for c in VERDIGRIS]
    for f in faces:
        if rng.random() < 0.13:
            f.material_index = vg[1] if f.normal.z > 0.3 else vg[0]


def _fruit(m, rng, centre, rad, n, squash=1.0, below=False):
    for _ in range(n):
        th = rng.uniform(0, math.tau)
        ph = rng.uniform(-0.2, 1.1) if not below else rng.uniform(-1.1, -0.4)
        d = Vector((math.cos(th) * math.cos(ph), math.sin(th) * math.cos(ph), math.sin(ph) * squash))
        p = Vector(centre) + d * rad * 1.02
        m.ball(0.26, tuple(p), FRUIT, subdiv=0, glow=True)


CYAN = "#4ae8ff"                                            # Vantorr's lattice cyan: tags, sensors, status
SOIL = ["#3a2618", "#4e3420", "#644630"]
YOUNG = ["#b0682e", "#d8904a", "#f0b464", "#ffd890"]       # fresh copper, bright
OLD = ["#5e2e18", "#7a3e1e", "#a0582c", "#c87c3e"]          # weathered copper, dark


def orchard_tree(m, rng, x, y, stage=2, style="round", z0=0.0, fruit=None, collar=True):
    """One crop tree at (x, y): stage 0 a staked whip, 1 young, 2 bearing, 3 old. Crown styles read
    differently from above: 'round' a dome, 'vase' an open ring (pruned to an open centre),
    'fan' an espalier flattened along x, 'cone' a trained spire. Returns the crown's centre."""
    R = (0.45, 0.85, 1.2, 1.45)[stage]
    h = (0.9, 1.3, 1.6, 1.8)[stage] * rng.uniform(0.92, 1.08)
    leaf = YOUNG if stage <= 1 else (COPPER[:4] if stage == 2 else OLD)
    if collar:
        st = mark(m)
        m.cyl(0.42 + 0.1 * stage, 0.32, (x, y, z0 - 0.05), PAINT[2], segs=6)
        facet(m, new_faces(m, st), PAINT, noise=0.04)
    tz = z0 + h
    lean = (rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12))
    limb(m, (x, y, z0), (x + lean[0], y + lean[1], tz), 0.1 + 0.06 * stage, 0.07 + 0.04 * stage, BRONZE[1], segs=5)
    cx, cy = x + lean[0], y + lean[1]
    if stage == 0:
        limb(m, (x + 0.25, y, z0), (x + 0.25, y, z0 + h + 0.4), 0.07, 0.07, PAINT[3], segs=4)    # the stake
    st = mark(m)
    if style == "vase":
        n = 5
        for k in range(n):
            a = k / n * math.tau + rng.uniform(-0.25, 0.25)
            d = R * 0.62
            px, py = cx + math.cos(a) * d, cy + math.sin(a) * d
            limb(m, (cx, cy, tz - 0.2), (px, py, tz + 0.35), 0.08 + 0.03 * stage, 0.06, BRONZE[1], segs=4)
            m.ball(R * 0.48, (px, py, tz + 0.45 + rng.uniform(-0.1, 0.15)), leaf[1], subdiv=0 if stage < 2 else 1,
                   scale=(1, 1, 0.75),
                   jitter=R * 0.07)
        c = (cx, cy, tz + 0.45)
    elif style == "fan":
        m.ball(R, (cx, cy, tz + R * 0.55), leaf[1], subdiv=1, scale=(1.55, 0.42, 1.0), jitter=R * 0.07)
        for s in (-1, 1):
            m.ball(R * 0.55, (cx + s * R * 1.25, cy, tz + R * 0.2), leaf[1], subdiv=1, scale=(1.3, 0.6, 0.8),
                   jitter=R * 0.06)
        c = (cx, cy, tz + R * 0.55)
    elif style == "cone":
        for i, (k, dz) in enumerate(((1.0, 0.1), (0.7, 0.75), (0.4, 1.35))):
            m.cyl(R * k, 0.7, (cx, cy, tz + dz * R), leaf[1], segs=6, r_top=R * k * 0.5, rot=(0, 0, i * 0.6))
        c = (cx, cy, tz + 0.6 * R)
    else:
        m.ball(R, (cx, cy, tz + R * 0.55), leaf[1], subdiv=1, scale=(1, 1, 0.78), jitter=R * 0.08)
        for k in range(3 if stage >= 2 else 1):
            a = rng.uniform(0, math.tau)
            m.ball(R * 0.55, (cx + math.cos(a) * R * 0.7, cy + math.sin(a) * R * 0.7, tz + R * 0.5), leaf[1], subdiv=0,
                   scale=(1, 1, 0.8), jitter=R * 0.06)
        c = (cx, cy, tz + R * 0.55)
    faces = new_faces(m, st)
    facet(m, faces, leaf, noise=0.18, bias=-0.1)
    if stage >= 2:
        vg = [m._slot(c_, False) for c_ in VERDIGRIS]
        for f in faces:
            if rng.random() < (0.05 if stage == 2 else 0.18):
                f.material_index = vg[1] if f.normal.z > 0.3 else vg[0]
    nf = fruit if fruit is not None else (0, 0, 4, 2)[stage]
    if nf:
        # ember fruit hang in a cluster or two on the sunny side, not sprinkled all over
        base = rng.uniform(0, math.tau)
        for i in range(nf):
            a = base + (i % 2) * 2.4 + rng.uniform(-0.35, 0.35)
            d = R * (1.0 if style != "fan" else 0.45) * rng.uniform(0.85, 1.0)
            sx = 1.5 if style == "fan" else 1.0
            m.ball(rng.uniform(0.26, 0.32), (c[0] + math.cos(a) * d * sx, c[1] + math.sin(a) * d,
                                             c[2] + rng.uniform(-0.1, 0.35) * R), FRUIT, subdiv=0, glow=True)
    return c


def copper_tree(v):
    """A lone company fruit tree (the rows are in set_cinder: cinder_orchard_row). v0 a bearing dome,
    v1 pruned open like a vase, v2 the old heritage tree propped on white crutches, v3 a young cone."""
    r = root("copper_tree", v)
    rng = random.Random(700 + v)
    m = Model(f"copper_tree_{v}", 700 + v)
    if v == 0:
        orchard_tree(m, rng, 0, 0, 2, "round")
    elif v == 1:
        orchard_tree(m, rng, 0, 0, 2, "vase", fruit=5)
    elif v == 2:
        # gnarled, older than the company's charter; two limbs held up on crutches with a brass tag
        st = mark(m)
        m.cyl(1.0, 0.35, (0, 0, -0.05), PAINT[2], segs=7)
        facet(m, new_faces(m, st), PAINT, noise=0.04)
        m.box((0.5, 0.12, 0.3), (0, -1.0, 0.2), CYAN, glow=True)                       # its heritage tag
        limb(m, (0, 0, 0), (0.3, 0.1, 1.4), 0.42, 0.3, BRONZE[1], segs=6)
        limb(m, (0.3, 0.1, 1.3), (-0.2, 0.3, 2.4), 0.3, 0.22, BRONZE[1], segs=5)
        crowns = []
        for a, d, z in ((0.3, 1.9, 2.0), (2.6, 1.7, 2.3), (4.4, 1.2, 2.6)):
            px, py = math.cos(a) * d, math.sin(a) * d
            limb(m, (0.1, 0.2, 1.6), (px, py, z), 0.22, 0.14, BRONZE[0], segs=5)
            crowns.append((px, py, z))
        for px, py, z in crowns[:2]:
            limb(m, (px * 1.05, py * 1.05, 0), (px, py, z - 0.1), 0.1, 0.1, PAINT[3], segs=4)        # the crutches
            m.box((0.5, 0.5, 0.18), (px, py, z - 0.15), PAINT[3])
        st = mark(m)
        for px, py, z in crowns:
            m.ball(1.25, (px, py, z + 0.75), OLD[2], subdiv=1, scale=(1, 1, 0.7), jitter=0.12)
        m.ball(1.2, (0, 0.2, 3.0), OLD[2], subdiv=1, scale=(1, 1, 0.65), jitter=0.12)
        faces = new_faces(m, st)
        facet(m, faces, OLD, noise=0.2, bias=-0.05)
        vg = [m._slot(c_, False) for c_ in VERDIGRIS]
        for f in faces:
            if rng.random() < 0.22:
                f.material_index = vg[1] if f.normal.z > 0.3 else vg[2]
        for px, py, z in crowns:
            for k in range(2):
                a = rng.uniform(0, math.tau)
                m.ball(0.32, (px + math.cos(a) * 1.15, py + math.sin(a) * 1.15, z + 0.9), FRUIT, subdiv=0, glow=True)
    else:
        orchard_tree(m, rng, 0, 0, 1, "cone")
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def silo(v):
    """Company grain silos: white, banded, copper-capped, a red lamp on top."""
    r = root("silo", v)
    rng = random.Random(720 + v)
    m = Model(f"silo_{v}", 720 + v)
    spots = [(0, 0, 1.5, 5.0)] if v == 0 else [(-1.4, 0, 1.25, 4.4), (1.4, 0, 1.25, 4.4)]
    m.box((3.6 if v == 0 else 6.2, 3.6, 0.3), (0, 0, 0.15), CONCRETE[1])
    for x, y, rad, h in spots:
        st = mark(m)
        m.cyl(rad, h, (x, y, 0.3), PAINT[2], segs=10)
        facet(m, new_faces(m, st), PAINT, noise=0.04)
        for z in (1.2, 2.2, 3.2, 4.2)[: int(h) - 1]:
            m.cyl(rad + 0.05, 0.14, (x, y, z), PAINT[0], segs=10)
        m.cyl(rad + 0.06, 0.6, (x, y, h - 0.6), ORANGE, segs=10)
        st = mark(m)
        m.cyl(rad + 0.15, 1.1, (x, y, h + 0.3), COPPER[2], segs=10, r_top=0.35)
        facet(m, new_faces(m, st), COPPER, noise=0.08)
        m.cyl(0.4, 0.3, (x, y, h + 1.4), STEEL[1], segs=6)
        m.ball(0.25, (x, y, h + 1.85), RED, subdiv=0, glow=True)
        for dx in (-0.25, 0.25):                                              # ladder
            limb(m, (x + dx, y - rad - 0.15, 0.3), (x + dx, y - rad - 0.15, h + 0.2), 0.06, 0.06, STEEL[2], segs=4)
        light(r, (x, y, h + 1.9), RED, radius=3, intensity=0.6, flicker=0.05)
    if v == 1:
        # a gantry between them and a conveyor coming down to the ground
        m.box((1.6, 0.8, 0.6), (0, 0, 4.9), STEEL[1])
        st = mark(m)
        m.box((0.9, 5.0, 0.35), (0, 0, 0), STEEL[2])
        m.box((0.6, 5.0, 0.1), (0, 0, 0.22), STEEL[0])
        for yy in (-2.0, -0.7, 0.6, 1.9):
            m.box((0.95, 0.35, 0.12), (0, yy, 0.24), HAZARD)
        xform(m, st, M((0, -2.4, 2.6), (0.85, 0, 0)))
        for y in (-1.6, -3.0):
            limb(m, (0, y, 0.3), (0, y, 2.6 + (y + 2.4) * 1.1), 0.12, 0.12, STEEL[1], segs=4)
    m.build(r)
    return r


def greenhouse(v):
    """A long greenhouse. v0: glass roof glowing violet with grow lamps. v1: a hooped polytunnel."""
    r = root("greenhouse", v)
    rng = random.Random(740 + v)
    m = Model(f"greenhouse_{v}", 740 + v)
    L = 6.4
    m.box((3.6, L + 0.2, 0.25), (0, 0, 0.12), CONCRETE[1])
    if v == 0:
        st = mark(m)
        m.box((3.2, L, 1.3), (0, 0, 0.9), GLASS[1])
        facet(m, new_faces(m, st), GLASS, noise=0.05)
        n = 7
        seg = L / n
        for i in range(n):
            y = -L / 2 + seg * (i + 0.5)
            m.gable((seg - 0.14, 3.2, 1.3), (0, y, 1.55), GROW if i % 2 else "#d080ff", rot=(0, 0, math.pi / 2),
                    thick=0.1)
        # light the panes: they are lit from inside
        for f in m.bm.faces:
            if f.material_index in (m._slot(GROW, False), m._slot("#d080ff", False)):
                f.material_index = m._slot(GROW if f.material_index == m._slot(GROW, False) else "#d080ff", True)
        for i in range(n + 1):
            y = -L / 2 + seg * i
            m.gable((0.16, 3.3, 1.35), (0, y, 1.55), PAINT[3], rot=(0, 0, math.pi / 2), thick=0.16)
        limb(m, (0, -L / 2 - 0.1, 2.9), (0, L / 2 + 0.1, 2.9), 0.12, 0.12, PAINT[3], segs=4)
        for x in (-1.62, 1.62):
            for i in range(n + 1):
                y = -L / 2 + seg * i
                m.box((0.12, 0.12, 1.3), (x, y, 0.9), PAINT[3])
        light(r, (0, 0, 2.2), GROW, radius=7, intensity=0.9, halo=False)
    else:
        st = mark(m)
        m.cyl(1.8, L, (0, -L / 2, 0.25), GLASS[1], segs=10, rot=(-math.pi / 2, 0, 0))
        xform(m, st, M(scale=(1, 1, 1.15)))
        # throw away the half below ground by flattening it
        for vv in {vv for f in new_faces(m, st) for vv in f.verts}:
            vv.co.z = max(vv.co.z, 0.25)
        facet(m, new_faces(m, st), GLASS, noise=0.04)
        for i in range(7):
            y = -L / 2 + L * i / 6
            s2 = mark(m)
            m.cyl(1.86, 0.14, (0, y - 0.07, 0.25), PAINT[3], segs=10, rot=(-math.pi / 2, 0, 0))
            xform(m, s2, M(scale=(1, 1, 1.15)))
            for vv in {vv for f in new_faces(m, s2) for vv in f.verts}:
                vv.co.z = max(vv.co.z, 0.25)
        m.box((0.45, L - 0.4, 0.12), (0, 0, 2.35), GROW, glow=True)                   # a strip of grow light
        for y in (-L / 2 - 0.05, L / 2 + 0.05):
            m.box((1.0, 0.12, 1.4), (0, y, 0.95), STEEL[1])                           # doors
        m.box((1.1, 1.1, 0.9), (2.4, 2.2, 0.45), STEEL[2])                            # a pump box
        m.box((0.5, 0.1, 0.3), (2.4, 1.64, 0.6), "#7aff9a", glow=True)
        light(r, (0, 0, 2.6), GROW, radius=5, intensity=0.6, halo=False)
    m.build(r)
    return r


# --- Refinery Nine -----------------------------------------------------------------------

def smokestack(v):
    """OBSTACLE: a refinery stack, red-and-white banded at the top, a gas flare roaring on it."""
    r = root("smokestack", v)
    rng = random.Random(760 + v)
    m = Model(f"smokestack_{v}", 760 + v)
    if v == 0:
        H = 14.6
        m.box((3.6, 3.6, 1.0), (0, 0, 0.5), CONCRETE[0])
        st = mark(m)
        m.cyl(1.55, H, (0, 0, 1.0), CONCRETE[1], segs=10, r_top=1.0)
        facet(m, new_faces(m, st), CONCRETE, noise=0.05)
        for i in range(5):
            z = H - 3.6 + i * 0.75
            rad = 1.55 - (z - 1.0) / H * 0.55 + 0.04
            m.cyl(rad, 0.75, (0, 0, z), RED if i % 2 == 0 else PAINT[3], segs=10, r_top=rad - 0.03)
        for z in (7.0, H - 4.2):
            rad = 1.55 - (z - 1.0) / H * 0.55
            ring(m, rad + 0.35, 0.3, z, STEEL[1], n=10, h=0.15)
        m.cyl(1.08, 0.35, (0, 0, H + 0.9), SOOT, segs=10)
        limb(m, (0, -1.5, 1.0), (0, -1.0, H), 0.07, 0.07, STEEL[2], segs=4)
        top = H + 1.25
        fs = 1.0
        cols = [(0, 0, 1.9)]
        # pipes coming in at the foot
        for a in (0.6, 2.4):
            limb(m, (math.cos(a) * 4.0, math.sin(a) * 4.0, 0.6), (math.cos(a) * 1.6, math.sin(a) * 1.6, 0.6), 0.35, 0.35,
                 COPPER[2], segs=6)
    else:
        # a flare stack: a thin copper riser in a lattice tower
        H = 14.0
        m.cyl(2.6, 0.4, (0, 0, 0), CONCRETE[1], segs=6)
        legs = []
        for k in range(3):
            a = k / 3 * math.tau
            legs.append((Vector((math.cos(a) * 2.2, math.sin(a) * 2.2, 0.4)), Vector((math.cos(a) * 0.55, math.sin(a) * 0.55, H))))
            limb(m, legs[-1][0], legs[-1][1], 0.16, 0.12, STEEL[2], segs=4)
        for i in range(5):                                                   # cross-bracing
            t0, t1 = i / 5, (i + 1) / 5
            for k in range(3):
                a0, b0 = legs[k]
                a1, b1 = legs[(k + 1) % 3]
                limb(m, a0.lerp(b0, t0), a1.lerp(b1, t1), 0.08, 0.08, STEEL[1], segs=4)
        st = mark(m)
        m.cyl(0.45, H + 0.6, (0, 0, 0.4), COPPER[2], segs=7)
        facet(m, new_faces(m, st), COPPER, noise=0.06)
        for i in range(4):
            z = 2 + i * 3.2
            m.cyl(0.55, 0.3, (0, 0, z), RED if i % 2 else PAINT[3], segs=7)
        m.cyl(0.6, 0.5, (0, 0, H + 1.0), SOOT, segs=7)
        top = H + 1.5
        fs = 1.25
        cols = [(0, 0, 2.4)]
    m.build(r)
    f = Model(f"smokestack_{v}_flare")
    f.cyl(0.9 * fs, 2.6 * fs, (0, 0, 0), FLAME[0], segs=6, r_top=0.1, glow=True)
    f.cyl(0.62 * fs, 2.0 * fs, (0.08, 0, 0), FLAME[1], segs=5, r_top=0.08, glow=True, rot=(0, 0, 0.6))
    f.cyl(0.35 * fs, 1.3 * fs, (-0.05, 0.05, 0), FLAME[2], segs=5, r_top=0.05, glow=True)
    o = f.build(r, loc=(0, 0, top))
    flicker(o, f"smokestack_{v}_flare_idle", amp=0.18, seed=10 + v, period=1.0)
    light(r, (0, 0, top + 1.5), FLAME[1], radius=12, intensity=1.6, flicker=0.4)
    emitter(r, (0, 0, top + 2.5), "smoke")
    for x, y, rad in cols:
        collider(r, x, y, rad)
    return r


def refinery_tank(v):
    r = root("refinery_tank", v)
    rng = random.Random(780 + v)
    m = Model(f"refinery_tank_{v}", 780 + v)
    if v == 0:
        # a big white storage tank, the company V on its roof, a stair winding up it
        R, H = 3.0, 3.2
        st = mark(m)
        m.cyl(R, H, (0, 0, 0), PAINT[2], segs=14)
        facet(m, new_faces(m, st), PAINT, noise=0.04)
        m.cyl(R + 0.05, 0.4, (0, 0, H - 0.6), ORANGE, segs=14)
        st = mark(m)
        m.cyl(R + 0.1, 0.3, (0, 0, H), PAINT[1], segs=14, r_top=0.7)
        facet(m, new_faces(m, st), PAINT, noise=0.04)
        # roof plant: a handrail round the crown, vents, a hatch, a small company mark by the stair
        ring(m, 1.3, 0.12, H + 0.55, STEEL[2], n=10, h=0.2)
        for k in range(3):
            a = 0.8 + k * 2.1
            m.cyl(0.3, 0.35, (math.cos(a) * 2.0, math.sin(a) * 2.0, H + 0.1), STEEL[1], segs=6)
        m.box((0.8, 0.8, 0.15), (0, 0, H + 0.45), STEEL[1])
        st = mark(m)
        m.prism([(-0.6, 0.35), (-0.35, 0.35), (0, -0.3), (0.35, 0.35), (0.6, 0.35), (0, -0.7)], 0.06, (0, 0, 0), PAINT[0])
        xform(m, st, M((-1.6, -1.4, H + 0.2), (math.pi / 2 - 0.1, 0, 0.8)))
        for k in range(9):                                                    # the stair
            a = -1.2 + k * 0.26
            z = 0.3 + k * 0.33
            m.box((0.55, 0.9, 0.12), (math.cos(a) * (R + 0.4), math.sin(a) * (R + 0.4), z), STEEL[2], rot=(0, 0, a))
        m.cyl(0.25, 0.3, (1.2, -1.2, H + 0.45), "#ffd86a", segs=6, glow=True)
        limb(m, (-R - 2.5, 0.8, 0.5), (-R + 0.2, 0.8, 0.5), 0.35, 0.35, COPPER[2], segs=6)
    elif v == 1:
        # a pressure sphere on legs
        st = mark(m)
        m.ball(2.3, (0, 0, 3.0), PAINT[2], subdiv=2)
        facet(m, new_faces(m, st), PAINT, noise=0.03)
        m.cyl(2.33, 0.35, (0, 0, 2.85), ORANGE, segs=14)
        for k in range(6):
            a = k / 6 * math.tau
            limb(m, (math.cos(a) * 2.0, math.sin(a) * 2.0, 0), (math.cos(a) * 2.0, math.sin(a) * 2.0, 2.9), 0.18, 0.18, STEEL[2], segs=5)
        m.cyl(0.5, 0.35, (0, 0, 5.25), STEEL[1], segs=6)
        m.cyl(0.3, 0.12, (0, 0, 5.6), RED, segs=6, glow=True)
        limb(m, (0, -2.6, 0.4), (0, -0.6, 0.8), 0.3, 0.3, COPPER[2], segs=6)
        light(r, (0, 0, 5.9), RED, radius=3, intensity=0.5)
    elif v == 3:
        # a floating-roof tank: a white rim, the dark roof riding low inside it on the product, a
        # rolling ladder down to it, rainwater pooled in the sump
        R, H = 3.2, 3.0
        st = mark(m)
        m.cyl(R, H - 1.0, (0, 0, 0), PAINT[2], segs=14)
        facet(m, new_faces(m, st), PAINT, noise=0.04)
        ring(m, R - 0.12, 0.26, H - 0.5, PAINT[3], n=14, h=1.0)
        ring(m, R + 0.15, 0.4, H - 0.35, ORANGE, n=14, h=0.22)                          # the wind girder
        st = mark(m)
        m.cyl(R - 0.25, 0.2, (0, 0, H - 1.0), STEEL[1], segs=14)
        facet(m, new_faces(m, st), STEEL[:3], noise=0.08)
        m.cyl(0.6, 0.06, (0.9, 0.7, H - 0.8), "#3a5a6a", segs=7)
        st = mark(m)
        m.box((0.5, 3.0, 0.12), (0, 0, 0), STEEL[3])
        xform(m, st, M((-0.9, -1.2, H - 0.45), (0.38, 0, 0.3)))
        for k in range(3):
            m.cyl(0.25, 0.12, (math.cos(k * 2.1) * 1.8, math.sin(k * 2.1) * 1.8, H - 0.8), SOOT, segs=6)
        for k in range(8):                                                       # the stair up its side
            a = 2.0 + k * 0.24
            m.box((0.55, 0.9, 0.12), (math.cos(a) * (R + 0.4), math.sin(a) * (R + 0.4), 0.3 + k * 0.34), STEEL[2],
                  rot=(0, 0, a))
    elif v == 4:
        # LPG bullets: three white capsules on saddles, a header along their ends
        for i, y in enumerate((-1.9, 0, 1.9)):
            for x in (-2.0, 2.0):
                m.box((0.6, 1.3, 0.9), (x, y, 0.45), CONCRETE[2])
            st = mark(m)
            m.cyl(0.8, 5.6, (-2.8, y, 1.6), PAINT[2], segs=8, rot=(0, math.pi / 2, 0))
            for x in (-2.8, 2.8):
                m.ball(0.8, (x, y, 1.6), PAINT[2], subdiv=1, scale=(0.55, 1, 1))
            facet(m, new_faces(m, st), PAINT, noise=0.04)
            m.cyl(0.83, 0.3, (-0.15, y, 1.6), ORANGE if i != 1 else CYAN, segs=8, rot=(0, math.pi / 2, 0),
                  glow=i == 1)
            m.box((0.5, 0.4, 0.3), (1.2, y, 2.45), STEEL[1])
            limb(m, (3.3, y, 1.0), (3.9, y, 1.0), 0.18, 0.18, STEEL[2], segs=5)
        limb(m, (3.9, -2.6, 1.0), (3.9, 2.6, 1.0), 0.3, 0.3, COPPER[2], segs=6)
        m.box((7.0, 0.25, 0.25), (0, -3.0, 0.12), HAZARD)
    else:
        # three small chemical tanks round a glass vat of violet run-off
        for k in range(3):
            a = k / 3 * math.tau + 0.3
            x, y = math.cos(a) * 2.15, math.sin(a) * 2.15
            st = mark(m)
            m.cyl(0.95, 2.6, (x, y, 0), STEEL[2] if k else COPPER[2], segs=8)
            facet(m, new_faces(m, st), STEEL if k else COPPER, noise=0.06)
            m.ball(0.95, (x, y, 2.6), STEEL[3] if k else COPPER[3], subdiv=1, scale=(1, 1, 0.45))
            m.cyl(0.98, 0.25, (x, y, 1.9), HAZARD, segs=8)
            limb(m, (x * 0.55, y * 0.55, 1.4), (x * 0.25, y * 0.25, 1.4), 0.2, 0.2, STEEL[1], segs=5)
        m.cyl(0.95, 2.2, (0, 0, 0), CHEM, segs=8, glow=True)
        m.cyl(0.7, 0.1, (0, 0, 2.2), "#e0a0ff", segs=8, glow=True)
        ring(m, 0.95, 0.2, 2.2, STEEL[1], n=8, h=0.2)
        for k in range(4):
            a = k / 4 * math.tau
            m.box((0.15, 0.15, 2.2), (math.cos(a) * 1.0, math.sin(a) * 1.0, 1.1), STEEL[1])
        m.cyl(0.85, 0.2, (0, 0, 0), STEEL[1], segs=8)
        light(r, (0, 0, 1.5), CHEM, radius=5, intensity=0.8)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def pipe_run(v):
    """A length of pipeline (along y, about 9 long) on its supports."""
    r = root("pipe_run", v)
    rng = random.Random(800 + v)
    m = Model(f"pipe_run_{v}", 800 + v)
    L = 9.0
    if v == 0:
        pipes = [(-0.55, 1.4, 0.48, COPPER), (0.55, 1.3, 0.38, STEEL[1:])]
        for x, z, rad, cols in pipes:
            st = mark(m)
            m.cyl(rad, L, (x, -L / 2, z), cols[1], segs=8, rot=(-math.pi / 2, 0, 0))
            facet(m, new_faces(m, st), cols[:3], noise=0.06, bias=-0.2)
            for y in (-L / 2 + 0.15, -1.5, 1.5, L / 2 - 0.35):
                m.cyl(rad + 0.14, 0.22, (x, y, z), STEEL[0], segs=8, rot=(-math.pi / 2, 0, 0))
        for y in (-3.0, 0.0, 3.0):                                             # H-frame supports
            for x in (-1.3, 1.3):
                m.box((0.25, 0.25, 1.9), (x, y, 0.95), HAZARD)
            m.box((2.85, 0.3, 0.25), (0, y, 0.85), HAZARD)
            m.box((3.2, 0.7, 0.2), (0, y, 0.1), CONCRETE[1])
        # a valve wheel on top of the copper line
        m.cyl(0.18, 0.5, (-0.55, 0.5, 1.8), STEEL[1], segs=5)
        ring(m, 0.45, 0.12, 2.35, RED, n=8, h=0.12, loc=(-0.55, 0.5))
    elif v == 1:
        # one fat insulated line, kicking up into an expansion loop
        R, z0, top = 0.7, 1.0, 4.6
        def run(a, b):
            st = mark(m)
            limb(m, a, b, R, R, PAINT[2], segs=8)
            facet(m, new_faces(m, st), PAINT, noise=0.04)
        pts = [Vector((0, -L / 2, z0)), Vector((0, -1.2, z0)), Vector((0, -1.2, top)), Vector((0, 1.2, top)),
               Vector((0, 1.2, z0)), Vector((0, L / 2, z0))]
        for a, b in zip(pts, pts[1:]):
            run(a, b)
        for p in pts[1:5]:
            m.ball(R * 1.05, tuple(p), PAINT[1], subdiv=1)
        for y in (-3.6, -2.4, 2.4, 3.6):
            m.cyl(R + 0.07, 0.25, (0, y, z0), ORANGE, segs=8, rot=(-math.pi / 2, 0, 0))
        for y in (-3.0, 3.0):
            m.box((1.8, 0.5, z0 - 0.2), (0, y, (z0 - 0.2) / 2), CONCRETE[1])
        m.box((0.5, 0.9, 0.35), (0, 0, top + 0.7), CHEM, glow=True)                 # a sight glass, violet
        light(r, (0, 0, top + 1.0), CHEM, radius=4, intensity=0.6, halo=False)
    else:
        # a low bundle of three on concrete sleepers, into a pump house
        for i, (x, rad, cols) in enumerate(((-0.8, 0.36, COPPER), (0, 0.42, STEEL[1:]), (0.8, 0.36, COPPER))):
            st = mark(m)
            m.cyl(rad, L - 2.6, (x, -L / 2, 0.75), cols[1], segs=7, rot=(-math.pi / 2, 0, 0))
            facet(m, new_faces(m, st), cols[:3], noise=0.06, bias=-0.2)
        for y in (-3.6, -1.8, 0.0, 1.6):
            m.box((2.6, 0.5, 0.4), (0, y, 0.2), CONCRETE[1])
        st = mark(m)
        m.box((3.0, 2.4, 2.2), (0, L / 2 - 1.3, 1.1), PAINT[2])
        facet(m, new_faces(m, st), PAINT, noise=0.03)
        m.box((3.2, 2.6, 0.3), (0, L / 2 - 1.3, 2.3), COPPER[2])
        m.cyl(0.55, 0.4, (0.6, L / 2 - 1.0, 2.45), STEEL[1], segs=8)                # a roof fan
        m.box((1.0, 0.1, 0.5), (-0.6, L / 2 - 2.55, 1.5), CHEM, glow=True)          # its status window
        m.box((2.9, 0.1, 0.3), (0, L / 2 - 2.55, 0.25), HAZARD)
        light(r, (-0.6, L / 2 - 3.0, 1.6), CHEM, radius=3, intensity=0.5, halo=False)
    m.build(r)
    return r


def build():
    for v in range(4):
        copper_tree(v)
    for v in range(5):
        refinery_tank(v)
    for v in range(3):
        pipe_run(v)
    for v in range(2):
        silo(v)
        greenhouse(v)
        smokestack(v)
