"""MIREFALL's set pieces: mushrooms taller than you fly and their fallen stalks, a
drowned tree's roots arching over the bog and the bog-beast asleep in it, the temple's causeway,
pillars and sunken ziggurats, the spore chimneys and fungal arches; and the scenery that thickens
each place (puffballs, inkcaps, bog lanterns, hummocks, idols, rubble, spore tubes)."""
from __future__ import annotations

import math
import random

import bmesh
from mathutils import Matrix, Vector

from kit import Model
from props_a_lib import (arc, bend, collider, frond, hull, lump, pulse, recolor, ribbon, root, sway, tube)
from props_a_mirefall import (BLOOM, CAPS, _bloomcap, _shell, HOLLOW, MOSS_HANG, PAD, REED, RUSH, SPORE, STEM, TEMPLE, TEMPLE_GLOW,
                              TEMPLE_GLOW2, TEMPLE_MOSS, TEMPLE_STEP, TEMPLE_TOP, VENT, VENT_TOP, WOOD, WOOD_TOP, _cap)

# drowned wood goes silver-violet; moss is lit, not black
BARK = ["#5e5660", "#6e6670", "#4e4852"]
BARK_TOP = "#9a92a0"
MOSS = ["#6a8a4a", "#7a9a52", "#5a7a44"]
MOSS_TOP = "#9ab868"
PEAT = ["#5a4a3a", "#4a3e30"]
MUD = "#3a3428"
LANTERN = "#ffd06a"
LANTERN2 = "#ff9ad8"
SHELL = ["#4e5a46", "#5e6a52", "#46503e"]
SHELL_TOP = "#8a9a6a"
SKIN = ["#6a7a5a", "#7a8a64"]
EYE = "#ffe04a"
STONE_DARK = "#2e3230"
FLESH = ["#8a5a7a", "#9a6a88", "#7a4e6c"]
FLESH_TOP = "#c08ab0"
PORE = "#8aff8a"
PORE_HOT = "#e0ffd0"
# the Hive's bloom where it takes hold: violet moss, swollen sacs, acid light
VMOSS = ["#4a2e6a", "#5a3a7e", "#3e2a5a"]
VMOSS_TOP = "#7a5aa8"
LICHEN = "#a8c070"
ACID = "#9aff5a"
SAC = ["#7a3a8a", "#8e4a9e", "#6a3078"]
SAC_TOP = "#c07ad0"
PITCH = ["#6a2a6a", "#8a3a7a", "#5a2a5a"]
PITCH_VEIN = "#a8d060"
DWOOD = ["#8a8290", "#7a7282", "#968ea0"]
DWOOD_TOP = "#c4bccc"
CRUST = ["#8a7098", "#9a80a8", "#7a6088"]
CRUST_TOP = "#c0a8d0"


# --- helpers ----------------------------------------------------------------------------------

def _paint(m, faces, top=None, shade=None, low=None, low_z=0.5, dot=0.7, sun=(-0.5, -0.4, 0.2), shade_dot=-0.4):
    L = Vector(sun).normalized()
    for f in faces:
        f.normal_update()

    def fn(f):
        if top and f.normal.z > dot:
            return top
        if low and f.calc_center_median().z < low_z:
            return low
        if shade and f.normal.dot(L) < shade_dot:
            return shade
        return None
    recolor(m, [f for f in faces if f.is_valid], fn)


def _beam(m, a, b, w0, h0, color, w1=None, h1=None):
    a, b = Vector(a), Vector(b)
    w1 = w0 if w1 is None else w1
    h1 = h0 if h1 is None else h1
    d = (b - a).normalized()
    s = d.cross(Vector((0, 0, 1)))
    if s.length < 1e-4:
        s = Vector((1, 0, 0))
    s.normalize()
    u = s.cross(d).normalized()
    pts = []
    for p, w, h in ((a, w0, h0), (b, w1, h1)):
        for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            pts.append(p + s * sx * w / 2 + u * sz * h / 2)
    return hull(m, pts, color)


def _gnarl(rng, a, b, n=6, wob=1.0, lift=0.0):
    """Points from a to b that wander, sagging or lifting by `lift` in the middle."""
    a, b = Vector(a), Vector(b)
    pts = []
    for k in range(n + 1):
        t = k / n
        p = a.lerp(b, t)
        if 0 < k < n:
            p += Vector((rng.uniform(-wob, wob), rng.uniform(-wob, wob), rng.uniform(-wob, wob) * 0.5))
        p.z += lift * math.sin(math.pi * t)
        pts.append(p)
    return pts


def _hang(m, rng, p, length, color, width=0.35, side=None):
    """A strand of moss or vine hanging from p, ending no lower than 12.6 if p is over the field."""
    p = Vector(p)
    if p.z > 12.6:
        length = min(length, p.z - 12.6)
    if length < 0.4:
        return
    a = rng.uniform(0, math.tau)
    side = side or (math.cos(a), math.sin(a), 0)
    ribbon(m, [p, p + Vector((0.1, 0.05, -length * 0.5)), p + Vector((0.0, 0.15, -length))],
           [width, width * 0.8, width * 0.25], color, fold=0.0, thick=0.06, side=side)


def _ring(m, r0, r1, z0, z1, color, segs=16, glow=False):
    """A flat ring (an annulus) from radius r0 out to r1, z0 up to z1, in faceted blocks."""
    fs = []
    for k in range(segs):
        a0, a1 = k * math.tau / segs, (k + 1) * math.tau / segs
        pts = []
        for a in (a0, a1):
            for rr in (r0, r1):
                for z in (z0, z1):
                    pts.append((math.cos(a) * rr, math.sin(a) * rr, z))
        fs += hull(m, pts, color, glow=glow)
    return fs


def _strand(m, a, b, sag, color, r=0.14, glow=False, n=8):
    """A thread slung from a to b, sagging by `sag`."""
    a, b = Vector(a), Vector(b)
    pts = []
    for k in range(n + 1):
        t = k / n
        p = a.lerp(b, t)
        p.z -= sag * math.sin(math.pi * t)
        pts.append(p)
    tube(m, pts, [r] * (n + 1), color, segs=4, glow=glow)
    return pts


# --- the glowcap forest -----------------------------------------------------------------------

def cap_gate(variants):
    """Gate: mushrooms taller than you fly, their stems the columns and their caps a roof over the
    gaps, threads of mycelium slung between; the second, dead trunks stacked with glowing shelves."""
    for i in range(2):
        r = root("mirefall_cap_gate", i)
        rng = random.Random(4100 + i)
        m = Model(f"mirefall_cap_gate_{i}", 4100 + i)
        if i == 0:
            spec = [(-16, 0.5, 18.0, 6.5, 2.4, "violet"), (-6, -0.8, 22.5, 7.5, 2.8, "teal"),
                    (4, 0.6, 16.5, 5.5, 2.0, "magenta"), (14, -0.4, 20.0, 6.8, 2.6, "amber")]
            tops = []
            for k, (x, y, h, R, H, pal) in enumerate(spec):
                sr = 1.5
                pts = bend((x, y, -1.0), (x + rng.uniform(-0.6, 0.6), y, h), (0, 0), n=8)
                tube(m, pts, [sr * 2.2, sr * 1.4, sr * 1.1, sr, sr, sr * 0.95, sr * 0.95, sr * 1.05, sr * 1.3], STEM[k % 3],
                     segs=8, colors=[STEM[(k + j // 3) % 3] for j in range(8)])
                top = pts[-1]
                # a skirt well over the flight line, glowing under
                m.cyl(sr * 2.8, 0.4, (top.x, top.y, h - 3.2), STEM[2], segs=10, r_top=sr * 1.1)
                m.cyl(sr * 2.6, 0.2, (top.x, top.y, h - 3.35), CAPS[pal][2], segs=10, glow=True)
                _cap(m, top.x, top.y, top.z + H * 0.9, R, H, CAPS[pal], "dome", spots=12, rng=rng)
                tops.append(Vector((top.x, top.y, h - 0.6)))
                collider(r, x, y, sr * 1.15)
                for j in range(4):                                         # little ones at the foot
                    a = rng.uniform(0, math.tau)
                    d = rng.uniform(3.0, 4.2)
                    px, py = x + math.cos(a) * d, y + math.sin(a) * d
                    hh = rng.uniform(1.0, 2.4)
                    m.cyl(0.22, hh, (px, py, 0), STEM[j % 3], segs=5)
                    _cap(m, px, py, hh, rng.uniform(0.7, 1.1), 0.4, CAPS[("violet", "teal", "magenta")[j % 3]], "dome", spots=0)
            for a, b in zip(tops, tops[1:]):                              # mycelium threads under the caps
                _strand(m, a + Vector((0, 0, -1.5)), b + Vector((0, 0, -1.5)), 1.2, SPORE, r=0.16, glow=True)
                _strand(m, a + Vector((0, 0.5, -0.6)), b + Vector((0, -0.5, -0.4)), 0.6, STEM[2], r=0.2)
        else:
            # three dead trunks, snapped high, crusted with bracket fungus right up past you
            spec = [(-14, 0, 19.0, 1.9), (-3, 0.8, 24.0, 2.1), (8.5, -0.6, 17.5, 1.8)]
            for k, (x, y, h, sr) in enumerate(spec):
                pts = bend((x, y, -1.0), (x, y, h), (rng.uniform(-0.8, 0.8), rng.uniform(-0.5, 0.5)), n=6)
                tube(m, pts, [sr * 1.8, sr * 1.15, sr, sr * 0.95, sr * 0.9, sr * 0.85, sr * 0.8], BARK[k % 3], segs=7,
                     colors=[BARK[(k + j) % 3] for j in range(6)])
                top = pts[-1]
                m.cyl(sr * 0.7, 0.15, (top.x, top.y, top.z - 0.05), HOLLOW, segs=7)
                for j in range(5):
                    a2 = j * math.tau / 5 + rng.uniform(-0.3, 0.3)
                    m.box((0.5, 0.4, rng.uniform(1.0, 2.2)), (top.x + math.cos(a2) * sr * 0.8, top.y + math.sin(a2) * sr * 0.8,
                                                            top.z + 0.5), BARK_TOP, rot=(math.sin(a2) * 0.3, -math.cos(a2) * 0.3, a2),
                          taper=0.3)
                collider(r, x, y, sr * 1.1)
                # shelves: only above 13.5 or below 7 (where they can't reach the gaps)
                for z in [3.0, 5.5] + [14.0 + j * 2.2 for j in range(int((h - 15) / 2.2) + 1)]:
                    a2 = rng.uniform(0, math.tau)
                    R = rng.uniform(1.8, 3.0) if z > 10 else rng.uniform(1.0, 1.6)
                    cx, cy = x + math.cos(a2) * (sr + R * 0.5), y + math.sin(a2) * (sr + R * 0.5)
                    col, tip = (("#a88ad0", "#b8ff4a"), ("#6a4ab0", "#9aff5a"), ("#c04aa0", "#ff8aff"))[(k + int(z)) % 3]
                    m.cyl(R, 0.45, (cx, cy, z), col, segs=10, r_top=R * 0.8)
                    m.cyl(R * 1.05, 0.14, (cx, cy, z), tip, segs=10, glow=True)
            for a, b in ((0, 1), (1, 2)):                                 # a web of glowing threads between
                pa = Vector((spec[a][0], spec[a][1], 15.5))
                pb = Vector((spec[b][0], spec[b][1], 16.5))
                _strand(m, pa, pb, 1.4, SPORE, r=0.15, glow=True)
                _strand(m, pa + Vector((0, 0, 2.4)), pb + Vector((0, 0, 1.8)), 1.0, SPORE, r=0.12, glow=True)
            for k in range(6):
                lump(m, rng, (rng.uniform(-18, 12), rng.uniform(-3, 3), 0.0), (1.6, 1.2, 0.6), MOSS[k % 3], n=9, flat=0.5)
        m.build(r)


def fallen_stalk(variants):
    """Span: a colossal mushroom fallen right across, its root-ball on one side and its cap, gills
    lit, on the other; the second fell across a living one, which holds it up in the middle."""
    for i in range(2):
        r = root("mirefall_fallen_stalk", i)
        rng = random.Random(4120 + i)
        m = Model(f"mirefall_fallen_stalk_{i}", 4120 + i)
        pal = CAPS[("violet", "teal")[i]]
        # the stalk, a little bowed, its underside over 13 all the way
        n = 12
        pts = []
        for k in range(n + 1):
            t = k / n
            x = -42 + 84 * t
            z = 16.0 + (1.4 * math.sin(math.pi * t) if i == 0 else 2.2 * math.sin(math.pi * t) ** 2) - 0.8 * t
            pts.append(Vector((x, 1.2 * math.sin(t * 5), z)))
        rad = [2.4 - 0.5 * k / n for k in range(n + 1)]
        tube(m, pts, rad, STEM[0], segs=9, colors=[STEM[(k // 2) % 3] for k in range(n)])
        # bands of glowing rot along it, the torn skirt, its flesh split and bruised along the top
        for k in (3, 6, 9):
            p = pts[k]
            m.cyl(rad[k] * 1.04, 0.5, (p.x - 0.25, p.y, p.z), pal[2], segs=9, rot=(0, math.pi / 2, 0), glow=True)
        p = pts[2]
        m.cyl(rad[2] * 1.9, 0.5, (p.x, p.y, p.z), STEM[2], segs=10, r_top=rad[2] * 1.1, rot=(0, math.pi / 2, 0))
        for k in range(1, n):
            p = pts[k]
            m.box((84 / n * 0.8, rad[k] * 0.8, 0.3), (p.x, p.y, p.z + rad[k] * 0.9), ("#8a7aa0", "#6a5a88")[k % 2],
                  rot=(0, 0, rng.uniform(-0.1, 0.1)))
            if k % 2:
                m.box((84 / n * 0.4, 0.35, 0.2), (p.x + rng.uniform(-1, 1), p.y + rng.uniform(-0.4, 0.4), p.z + rad[k] * 0.98), pal[2],
                      glow=True)
        for k in range(14):
            p = pts[rng.randrange(1, n)]
            a = rng.uniform(0.3, math.pi - 0.3)
            m.ball(rng.uniform(0.4, 0.7), (p.x + rng.uniform(-2, 2), p.y + math.cos(a) * 2.2, p.z + math.sin(a) * 2.2), pal[2],
                   subdiv=0, glow=True)
        # little mushrooms sprouted along its back
        for k in range(9):
            p = pts[rng.randrange(1, n)]
            x = p.x + rng.uniform(-2, 2)
            h = rng.uniform(0.6, 1.4)
            m.cyl(0.18, h, (x, p.y + rng.uniform(-0.8, 0.8), p.z + 1.8), STEM[0], segs=5)
            _cap(m, x, p.y, p.z + 1.8 + h, rng.uniform(0.6, 1.0), 0.35, CAPS[("amber", "magenta", "teal")[k % 3]], "dome", spots=0)
        # shelves of smaller fungus grown out of its flanks since it fell
        for k in range(12):
            p = pts[rng.randrange(1, n)]
            sy = rng.choice((-1, 1))
            R = rng.uniform(1.0, 1.8)
            col, tip = (("#a88ad0", "#b8ff4a"), ("#c04aa0", "#ff8aff"), ("#6a4ab0", "#9aff5a"))[k % 3]
            x = p.x + rng.uniform(-2.5, 2.5)
            z = p.z + rng.uniform(-0.2, 1.4)
            m.cyl(R, 0.35, (x, p.y + sy * (rad[0] - 0.3), z), col, segs=8, r_top=R * 0.8)
            m.cyl(R * 1.05, 0.12, (x, p.y + sy * (rad[0] - 0.3), z), tip, segs=8, glow=True)
        # the root end: a bulb in a mat of torn mycelium, on the ground
        fs = list(m.ball(5.0, (-43, 0, 9.0), STEM[1], subdiv=1, scale=(1, 1.1, 1.9), jitter=0.3))
        for k in range(8):
            a = k * math.tau / 8
            tube(m, [Vector((-43 + math.cos(a) * 3, math.sin(a) * 3, 2)), Vector((-43 + math.cos(a) * 6, math.sin(a) * 6, 0.2)),
                     Vector((-43 + math.cos(a) * 8, math.sin(a) * 8, -1.5))], [0.8, 0.5, 0.15], STEM[2], segs=5)
        collider(r, -43, 0, 5.0)
        # the cap end, tipped on its rim, the gills facing back along the stalk
        cx = 44.5
        fs += list(m.ball(9.0, (cx + 1.5, 0, 8.0), pal[0], subdiv=2, scale=(0.35, 1, 1)))
        m.cyl(8.6, 0.5, (cx - 1.4, 0, 8.0), pal[1], segs=14, rot=(0, math.pi / 2, 0))
        m.cyl(8.0, 0.4, (cx - 1.8, 0, 8.0), pal[2], segs=14, rot=(0, math.pi / 2, 0), glow=True)
        for k in range(16):                                               # gill ridges
            a = k * math.tau / 16
            m.box((0.4, 0.35, 6.8), (cx - 2.2, math.cos(a) * 4.4, 8.0 + math.sin(a) * 4.4), pal[1], rot=(a - math.pi / 2, 0, 0))
        for k in range(10):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(2, 7)
            m.ball(rng.uniform(0.5, 0.9), (cx + 4.4, math.cos(a) * d, 8.0 + math.sin(a) * d), pal[2], subdiv=0, glow=True)
        collider(r, cx, 0, 4.5)
        if i == 1:
            # the living one it fell across, its cap under the stalk
            sr = 1.4
            tube(m, bend((0, -0.6, -1.0), (0, -0.6, 12.0), (0.3, 0.2), n=5), [sr * 2, sr * 1.3, sr, sr, sr * 1.05, sr * 1.3],
                 STEM[2], segs=8)
            _cap(m, 0.3, -0.4, 13.0, 4.6, 1.5, CAPS["magenta"], "dome", spots=8, rng=rng)
            collider(r, 0, -0.6, sr * 1.15)
        _paint(m, fs, None, None)
        m.build(r)


def puffball(variants):
    """Scenery: puffballs, round and pale, freckled with pores of light; a cluster, a split one."""
    for i in range(3):
        r = root("mirefall_puffball", i)
        rng = random.Random(4140 + i)
        m = Model(f"mirefall_puffball_{i}", 4140 + i)
        balls = [(0, 0, 1.8)] if i == 0 else ([(0, 0, 1.4), (1.9, 0.6, 1.0), (-1.2, 1.4, 0.8), (0.6, -1.7, 0.7)] if i == 1 else
                                             [(0, 0, 2.2)])
        for k, (x, y, R) in enumerate(balls):
            m.ball(R, (x, y, R * 0.75), STEM[k % 3], subdiv=1, scale=(1, 1, 0.85), jitter=R * 0.05)
            for j in range(int(R * 5)):
                a = rng.uniform(0, math.tau)
                e = rng.uniform(0.25, 1.2)
                p = (x + math.cos(a) * math.cos(e) * R, y + math.sin(a) * math.cos(e) * R, R * 0.75 + math.sin(e) * R * 0.85)
                if j % 2:
                    m.ball(rng.uniform(0.12, 0.18) * max(1, R), p, SPORE, subdiv=0, glow=True)
        if i == 2:
            # split open at the top, glowing spores inside
            m.cyl(1.3, 0.3, (0, 0, 3.4), SPORE, segs=8, glow=True)
            for k in range(6):
                a = k * math.tau / 6
                m.box((0.9, 0.3, 1.0), (math.cos(a) * 1.4, math.sin(a) * 1.4, 3.6), STEM[1], rot=(math.sin(a) * 0.5, -math.cos(a) * 0.5, a),
                      taper=0.3)
        obj = m.build(r, rot_z=rng.uniform(0, math.tau))
        pulse(obj, f"mirefall_puffball_{i}_breathe_idle", amp=0.04, period=2.6 + i * 0.5, axes=(1, 1, 0.7))


def inkcap(variants):
    """Scenery: inkcaps, tall thin bells in clumps, their dripping rims glowing."""
    for i in range(3):
        r = root("mirefall_inkcap", i)
        rng = random.Random(4160 + i)
        m = Model(f"mirefall_inkcap_{i}", 4160 + i)
        n = (5, 8, 3)[i]
        pal = CAPS[("magenta", "teal", "violet")[i]]
        for k in range(n):
            a = k * math.tau / n + rng.uniform(-0.3, 0.3)
            d = 0 if k == 0 else rng.uniform(0.8, 1.8)
            h = (4.6 if k == 0 else rng.uniform(2.0, 3.8)) * (1.1 if i == 2 else 1)
            x, y = math.cos(a) * d, math.sin(a) * d
            lean = (math.cos(a) * 0.4, math.sin(a) * 0.4)
            pts = bend((x, y, 0), (x, y, h), lean, n=4)
            tube(m, pts, [0.3, 0.22, 0.2, 0.2, 0.2], STEM[k % 3], segs=5)
            t = pts[-1]
            R = 0.6 + h * 0.08
            m.cyl(R, h * 0.3, (t.x, t.y, t.z - h * 0.18), pal[0], segs=7, r_top=R * 0.35)
            m.cyl(R * 0.8, 0.12, (t.x, t.y, t.z - h * 0.2 - 0.02), pal[2], segs=7, glow=True)
            m.ball(R * 0.36, (t.x, t.y, t.z + h * 0.12), pal[1], subdiv=0)
            for j in range(3):                                            # drips
                b = rng.uniform(0, math.tau)
                m.box((0.15, 0.15, 0.6), (t.x + math.cos(b) * R, t.y + math.sin(b) * R, t.z - h * 0.2 - 0.3), pal[2], glow=True)
        m.build(r, rot_z=rng.uniform(0, math.tau))


# --- the peat marsh ---------------------------------------------------------------------------

def drowned_roots(variants):
    """Span: two drowned trees on the banks, their roots and limbs arching over the bog to meet,
    moss hanging off them; the second, one great hollow log fallen across on its root stumps."""
    for i in range(2):
        r = root("mirefall_drowned_roots", i)
        rng = random.Random(4200 + i)
        m = Model(f"mirefall_drowned_roots_{i}", 4200 + i)
        fs = []
        hangs = []
        if i == 0:
            for s in (-1, 1):
                x = s * 42
                pts = bend((x, 0, -3.0), (x - s * 1.5, 0.5, 20.0), (0, 0), n=6)
                fs += tube(m, pts, [3.6, 2.8, 2.5, 2.3, 2.2, 2.0, 1.8], BARK[0], segs=8, colors=[BARK[k % 3] for k in range(6)])
                top = pts[-1]
                m.cyl(1.3, 0.2, (top.x, top.y, top.z - 0.1), HOLLOW, segs=8)
                collider(r, x, 0, 3.2)
                for k in range(6):                                         # buttress roots into the bog
                    a = k * math.tau / 6 + rng.uniform(-0.2, 0.2)
                    fs += tube(m, [Vector((x, 0, 4.0)), Vector((x + math.cos(a) * 4, math.sin(a) * 4, 1.0)),
                                   Vector((x + math.cos(a) * 6.5, math.sin(a) * 6.5, -1.5))], [1.2, 0.8, 0.3], BARK[k % 3], segs=5)
                # limbs reaching across, gnarled, their undersides over 13
                for k, (y0, z0, reach, lift) in enumerate(((-2.5, 15.5, 46, 2.5), (2.6, 17.0, 40, 1.8), (0.0, 18.5, 30, 1.2))):
                    a = Vector((x - s * 1.5, y0 * 0.4, z0))
                    b = Vector((x - s * reach, y0 + rng.uniform(-1.5, 1.5), z0 - 0.5 + rng.uniform(-0.5, 0.5)))
                    p = _gnarl(rng, a, b, n=7, wob=0.8, lift=lift)
                    for q in p:
                        q.z = max(q.z, 14.4)
                    rads = [2.1 - 1.5 * j / 7 for j in range(8)]
                    fs += tube(m, p, rads, BARK[(k + 1) % 3], segs=6)
                    hangs += p[2:]
                    if k < 2:                                               # a twig fork off it
                        q0 = p[4]
                        q1 = q0 + Vector((-s * rng.uniform(3, 5), rng.uniform(-4, 4), rng.uniform(0.5, 2)))
                        tube(m, [q0, q1], [0.8, 0.15], BARK[2], segs=5)
                        hangs.append(q1)
        else:
            # the log: a hollow trunk, end to end, the near end torn open
            pts = [Vector((-46 + 92 * k / 10, 0.8 * math.sin(k * 0.8), 16.8 + 0.6 * math.sin(k * 0.6))) for k in range(11)]
            rads = [3.0 - 0.6 * k / 10 for k in range(11)]
            fs += tube(m, pts, rads, BARK[0], segs=9, colors=[BARK[k % 3] for k in range(10)])
            m.cyl(2.2, 0.3, (46.2, pts[-1].y, pts[-1].z), HOLLOW, segs=9, rot=(0, math.pi / 2, 0))
            m.cyl(2.5, 0.3, (-46.2, pts[0].y, pts[0].z), HOLLOW, segs=9, rot=(0, math.pi / 2, 0))
            for k in (2, 5, 7):                                           # holes rotted through
                p = pts[k]
                m.cyl(1.0, 0.3, (p.x + 1.5, p.y, p.z + rads[k] - 0.1), HOLLOW, segs=7)
            for s in (-1, 1):
                x = s * 40
                fs += tube(m, [Vector((x, 0, -3)), Vector((x, 0, 6)), Vector((x + s * 0.5, 0, 13.6))], [3.2, 2.6, 2.4], BARK[1], segs=8)
                for k in range(5):
                    a = k * math.tau / 5
                    fs += tube(m, [Vector((x, 0, 3.0)), Vector((x + math.cos(a) * 4.5, math.sin(a) * 4.5, 0.5)),
                                   Vector((x + math.cos(a) * 6.0, math.sin(a) * 6.0, -1.5))], [1.0, 0.7, 0.3], BARK[k % 3], segs=5)
                collider(r, x, 0, 3.0)
            # bracket fungus marching along its flanks, lit
            for k in range(14):
                p = pts[rng.randrange(1, 10)]
                sy = rng.choice((-1, 1))
                R = rng.uniform(0.9, 1.6)
                col, tip = (("#a88ad0", "#b8ff4a"), ("#6a4ab0", "#9aff5a"))[k % 2]
                z = p.z + rng.uniform(-0.6, 1.4)
                m.cyl(R, 0.3, (p.x + rng.uniform(-3, 3), p.y + sy * 2.7, z), col, segs=8, r_top=R * 0.8)
                m.cyl(R * 1.05, 0.12, (p.x + rng.uniform(-3, 3), p.y + sy * 2.7, z), tip, segs=8, glow=True)
            hangs = [p + Vector((rng.uniform(-3, 3), rng.uniform(-2, 2), -1.8)) for p in pts[1:-1] for _ in range(3)]
        # moss in patches over the tops, hanging strands under
        for f in fs:
            if f.is_valid:
                f.normal_update()
        recolor(m, [f for f in fs if f.is_valid],
                lambda f: (MOSS_TOP if f.normal.z > 0.8 else MOSS[1]) if f.normal.z > 0.55 and
                math.sin(f.calc_center_median().x * 0.55 + f.calc_center_median().y * 0.9) > 0.15 else None)
        for p in hangs:
            for j in range(2):
                q = Vector(p) + Vector((rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), -0.4))
                _hang(m, rng, q, rng.uniform(1.0, 3.5), MOSS_HANG[j % 2], width=0.4)
            if rng.random() < 0.3:
                m.ball(0.3, (p.x, p.y, p.z - 0.8), SPORE, subdiv=0, glow=True)
        m.build(r)


def bog_beast(variants):
    """Giant: a shellback the size of a hill, asleep in the bog, reeds growing on its back and its
    eyes half open; the second, a long-necked one, only its humps and its head above the water."""
    for i in range(2):
        r = root("mirefall_bog_beast", i)
        rng = random.Random(4220 + i)
        m = Model(f"mirefall_bog_beast_{i}", 4220 + i)
        fs = []
        if i == 0:
            # the shell: a dome of plates, the rim spiked
            fs += list(m.ball(15.0, (0, 0, -4.5), SHELL[0], subdiv=2, scale=(1.0, 0.8, 0.8)))
            for k in range(12):
                a = k * math.tau / 12
                for ring, (d, z) in enumerate(((0.55, 5.6), (0.85, 3.2))):
                    px, py = math.cos(a + ring * 0.26) * 15 * d, math.sin(a + ring * 0.26) * 12 * d
                    fs += list(m.cyl(2.6 - ring * 0.4, 0.8, (px, py, z - 0.4), SHELL[(k + ring) % 3], segs=6, r_top=2.0 - ring * 0.3,
                                     rot=(math.sin(a) * 0.4 * ring, -math.cos(a) * 0.4 * ring, a)))
                m.cyl(1.0, 2.4, (math.cos(a) * 14.6, math.sin(a) * 11.7, -1.0), SHELL[2], segs=5, r_top=0.0,
                      rot=(math.sin(a) * 1.0, -math.cos(a) * 1.0, 0))
            fs += list(m.cyl(3.0, 0.6, (0, 0, 6.9), SHELL[1], segs=6, r_top=2.4))
            # the head, resting on the mud, eyes lit
            fs += list(m.ball(4.2, (17.5, 1.0, 0.6), SKIN[0], subdiv=1, scale=(1.4, 1.0, 0.7)))
            fs += list(m.ball(2.6, (22.0, 1.4, 0.2), SKIN[1], subdiv=1, scale=(1.3, 1.0, 0.6)))
            for s in (-1, 1):
                m.ball(0.7, (19.6, 1.0 + s * 2.6, 2.4), EYE, subdiv=1, scale=(1.3, 1, 0.5), glow=True)
                m.box((1.8, 0.5, 0.3), (19.6, 1.0 + s * 2.6, 2.75), SKIN[0])
                # a forefoot, splayed in the mud
                fs += list(m.ball(2.8, (9.0, s * 12.5, -0.4), SKIN[1], subdiv=1, scale=(1.4, 1.0, 0.5)))
                for k in range(3):
                    m.cyl(0.5, 1.4, (11.8, s * 12.5 + (k - 1) * 1.2, -0.4), "#e0d8b0", segs=5, r_top=0.0, rot=(0, math.pi / 2, 0))
                fs += list(m.ball(2.4, (-10.0, s * 11.0, -0.6), SKIN[0], subdiv=1, scale=(1.4, 1.0, 0.5)))
            fs += list(m.ball(2.0, (-16.5, 0, -0.5), SKIN[0], subdiv=1, scale=(2.0, 0.8, 0.5)))       # the tail
            # moss and reeds on its back, a glowing toadstool or two
            for k in range(10):
                a = rng.uniform(0, math.tau)
                d = rng.uniform(0.5, 0.85)
                px, py = math.cos(a) * 15 * d, math.sin(a) * 12 * d
                pz = -4.5 + 12.0 * math.sqrt(max(0.0, 1 - d * d)) - 0.3
                m.ball(rng.uniform(1.4, 2.4), (px, py, pz), MOSS[k % 3], subdiv=1, scale=(1.4, 1.0, 0.35), jitter=0.1)
                if k % 2:
                    for j in range(8):
                        b = rng.uniform(0, math.tau)
                        q = arc((px + math.cos(b) * 0.4, py + math.sin(b) * 0.4, pz), b, rng.uniform(1.2, 2.0), 2.6, 1.0, n=3)
                        ribbon(m, q, [0.16, 0.12, 0.08, 0.02], REED[j % 4], fold=0.3, thick=0.05)
                else:
                    _cap(m, px, py, pz + 1.2, 0.9, 0.4, CAPS["amber"], "dome", spots=0)
                    m.cyl(0.18, 1.2, (px, py, pz), STEM[0], segs=5)
            _paint(m, fs, None, None)
            recolor(m, [f for f in fs if f.is_valid], lambda f: SHELL_TOP if f.normal.z > 0.85 and f.calc_center_median().z > 3 else None)
        else:
            # humps of back in a curve, ridged with plates, the water round them
            path = [Vector((math.cos(a) * 20, math.sin(a) * 9, 0)) for a in [(-1.4 + 2.6 * k / 5) for k in range(6)]]
            for k, p in enumerate(path[:5]):
                R = 5.5 - abs(k - 2) * 0.8
                fs += list(m.ball(R, (p.x, p.y, -R * 0.4), SKIN[k % 2], subdiv=1, scale=(1.2, 1.0, 0.85)))
                for j in range(3):
                    m.cyl(1.0, 2.6, (p.x + (j - 1) * 1.6, p.y, R * 0.4), SHELL[j % 3], segs=4, r_top=0.0, rot=(0, (j - 1) * 0.3, 0))
                m.cyl(R * 1.35, 0.15, (p.x, p.y, -0.1), "#4a5a4a", segs=10)              # its wake ring on the water
            # the head, raised on its neck just under you, jaws open, eyes lit
            nk = [path[5], path[5] + Vector((4, 2, 3)), path[5] + Vector((7, 3, 6)), path[5] + Vector((10, 2, 6.6))]
            tube(m, nk, [3.0, 2.4, 2.0, 1.8], SKIN[1], segs=7)
            hd = nk[-1]
            fs += list(m.ball(2.4, tuple(hd + Vector((2.0, 0, 0))), SKIN[0], subdiv=1, scale=(1.6, 1.0, 0.7)))
            fs += _beam(m, hd + Vector((2, 0, -1.0)), hd + Vector((7, 0, -2.4)), 2.6, 0.8, SKIN[1], w1=1.6, h1=0.5)
            for s in (-1, 1):
                m.ball(0.55, tuple(hd + Vector((2.6, s * 1.6, 1.2))), EYE, subdiv=1, glow=True)
                for k in range(4):
                    m.cyl(0.2, 0.7, tuple(hd + Vector((3.5 + k, s * 1.0, -1.0))), "#e0d8b0", segs=4, r_top=0.0)
            m.cyl(4.0, 0.15, (path[5].x, path[5].y, -0.1), "#4a5a4a", segs=10)
            # lily pads and reeds caught round it
            for k in range(14):
                p = path[rng.randrange(6)]
                a = rng.uniform(0, math.tau)
                d = rng.uniform(5, 9)
                m.cyl(rng.uniform(0.6, 1.1), 0.08, (p.x + math.cos(a) * d, p.y + math.sin(a) * d, 0.0), PAD[k % 3], segs=8)
            _paint(m, fs, None, None)
            recolor(m, [f for f in fs if f.is_valid], lambda f: MOSS_TOP if f.normal.z > 0.85 else None)
        m.build(r)


def bog_lantern(variants):
    """Scenery: lantern plants, their bulbs hanging off drooping stalks and lit from inside."""
    for i in range(3):
        r = root("mirefall_bog_lantern", i)
        rng = random.Random(4240 + i)
        m = Model(f"mirefall_bog_lantern_{i}", 4240 + i)
        n = (4, 7, 3)[i]
        light = (LANTERN, LANTERN2, LANTERN)[i]
        for k in range(n):
            a = k * math.tau / n + rng.uniform(-0.3, 0.3)
            d = rng.uniform(0.2, 0.6)
            h = rng.uniform(2.0, 3.6) * (1.3 if i == 2 else 1)
            base = Vector((math.cos(a) * d, math.sin(a) * d, -0.2))
            top = base + Vector((math.cos(a) * 0.4, math.sin(a) * 0.4, h))
            tip = top + Vector((math.cos(a) * 1.2, math.sin(a) * 1.2, -0.6))
            tube(m, [base, top, tip], [0.12, 0.09, 0.06], REED[k % 4], segs=4)
            m.ball(0.42, (tip.x, tip.y, tip.z - 0.45), light, subdiv=1, scale=(1, 1, 1.25), glow=True)
            m.cyl(0.3, 0.2, (tip.x, tip.y, tip.z - 0.12), REED[2], segs=5, r_top=0.12)
        for k in range(6):                                                # leaves at the foot
            yaw = k * math.tau / 6
            frond(m, (0, 0, 0), yaw, 1.2, 0.3, PAD[k % 3], PAD[(k + 1) % 3], rise=0.5, droop=0.9, n=4, serrate=0.0)
        obj = m.build(r, rot_z=rng.uniform(0, math.tau))
        sway(obj, f"mirefall_bog_lantern_{i}_sway_idle", amp=(0.06, 0.05), period=2.8 + i * 0.4, phase=i)


def hummock(variants):
    """Scenery: hummocks of moss in the bog, tufted with cottongrass, a peat bank cut in one."""
    for i in range(3):
        r = root("mirefall_hummock", i)
        rng = random.Random(4260 + i)
        m = Model(f"mirefall_hummock_{i}", 4260 + i)
        fs = []
        bumps = [(0, 0, 2.4)] if i == 0 else ([(0, 0, 1.8), (2.4, 0.8, 1.3), (-1.6, 1.8, 1.1)] if i == 1 else [(0, 0, 2.8)])
        for k, (x, y, R) in enumerate(bumps):
            fs += list(m.ball(1.0, (x, y, -0.15), MOSS[k % 3], subdiv=2, scale=(R, R * 0.85, R * 0.42), jitter=0.05))
            for j in range(3):                                             # softer lobes round the mound
                a = j * math.tau / 3 + rng.uniform(0, 1)
                fs += list(m.ball(1.0, (x + math.cos(a) * R * 0.7, y + math.sin(a) * R * 0.6, -0.1), MOSS[(k + j) % 3],
                                  subdiv=1, scale=(R * 0.5, R * 0.45, R * 0.28), jitter=0.04))
            for j in range(2):                                             # sundew stars glinting in the moss
                a = rng.uniform(0, math.tau)
                d = rng.uniform(0.3, 0.6) * R
                m.ball(0.14, (x + math.cos(a) * d, y + math.sin(a) * d, R * 0.38), "#ff6a9a", subdiv=0, glow=True)
            for j in range(int(R * 3)):                                    # cottongrass: a stalk and a white tuft
                a = rng.uniform(0, math.tau)
                d = rng.uniform(0, R * 0.7)
                px, py = x + math.cos(a) * d, y + math.sin(a) * d
                h = rng.uniform(0.8, 1.4) + R * 0.35
                m.cyl(0.05, h, (px, py, 0.2), REED[1], segs=3)
                m.ball(0.2, (px, py, h + 0.2), "#f0f0e0", subdiv=0)
        _paint(m, fs, MOSS_TOP, None, dot=0.8)
        if i == 2:
            # a bank of peat cut square, bricks stacked to dry, a pool of black water
            m.box((3.0, 1.6, 1.4), (0.6, -2.2, 0.2), PEAT[0])
            m.box((3.0, 0.2, 1.4), (0.6, -3.0, 0.2), PEAT[1])
            for k in range(6):
                m.box((0.8, 0.5, 0.4), (-2.4 + (k % 3) * 0.9, -3.6 - (k // 3) * 0.6, 0.2 + (k // 3) * 0.1), PEAT[k % 2],
                      rot=(0, 0, rng.uniform(-0.2, 0.2)))
            m.cyl(1.2, 0.1, (2.8, -3.8, 0.0), MUD, segs=8)
        m.build(r, rot_z=rng.uniform(0, math.tau))


# --- the drowned temple -----------------------------------------------------------------------

def causeway(variants):
    """Span: the temple's causeway, carved and railed, on piers out in the swamp; vines hanging
    off its underside, its glyph band still lit; the second on a third pier mid-field."""
    for i in range(2):
        r = root("mirefall_causeway", i)
        rng = random.Random(4300 + i)
        m = Model(f"mirefall_causeway_{i}", 4300 + i)
        fs = []
        piers = [-41.0, 41.0] + ([0.0] if i == 1 else [])
        D = 7.0
        for x in piers:
            w = 6.0 if x else 5.0
            fs += list(m.box((w, w + 1, 16.0), (x, 0, 5.0), TEMPLE[1], taper=0.88))
            for z in (1.0, 6.0, 11.0):
                fs += list(m.box((w + 0.4, w + 1.4, 0.6), (x, 0, z), TEMPLE[2]))
            m.box((1.4, 0.2, 2.6), (x, -(w + 1) / 2 - 0.05, 8.0), TEMPLE_GLOW, glow=True)
            collider(r, x, 0, w * 0.55)
        # the deck, its underside arched between corbels
        fs += list(m.box((94, D, 1.8), (0, 0, 14.9), TEMPLE[0]))
        for k in range(17):
            x = -44 + k * 5.5
            fs += list(m.box((1.6, D + 0.4, 1.4), (x, 0, 13.8), TEMPLE[2], taper=1.4))
        # the glyph band down both faces
        for sy in (-1, 1):
            m.box((92, 0.2, 0.35), (0, sy * (D / 2 + 0.05), 14.6), TEMPLE_GLOW2, glow=True)
            for k in range(30):
                m.box((0.5, 0.25, 0.5), (-43.5 + k * 3.0, sy * (D / 2 + 0.07), 15.3), TEMPLE_GLOW, glow=True, rot=(0, 0.785, 0))
            # balustrade: posts and a rail, some fallen
            for k in range(31):
                if rng.random() < 0.15:
                    continue
                m.box((0.6, 0.6, 1.4), (-45 + k * 3.0, sy * (D / 2 - 0.4), 16.5), TEMPLE[k % 3])
            fs += list(m.box((92, 0.8, 0.5), (0, sy * (D / 2 - 0.4), 17.4), TEMPLE[1]))
        # paving on top, moss across it, a gate-shrine in the middle of the span
        for k in range(24):
            m.box((3.6, D - 1.8, 0.12), (-43 + k * 3.75, 0, 15.85), TEMPLE_TOP[k % 2])
        fs += list(m.box((5.0, D + 1, 0.8), (0 if i == 0 else 20, 0, 16.2), TEMPLE[2]))
        sx = 0 if i == 0 else 20
        for s in (-1, 1):
            fs += list(m.box((1.2, 1.2, 4.0), (sx + s * 2.0, 0, 18.6), TEMPLE[0]))
        fs += list(m.box((5.6, 2.0, 1.0), (sx, 0, 21.0), TEMPLE[1]))
        m.box((1.4, 1.4, 0.2), (sx, 0, 21.6), TEMPLE_GLOW, glow=True, rot=(0, 0, 0.785))
        for k in range(16):
            x = rng.uniform(-42, 42)
            m.ball(rng.uniform(1.0, 2.0), (x, rng.uniform(-2, 2), 15.9), TEMPLE_MOSS[k % 2], subdiv=1, scale=(1.6, 1.0, 0.25),
                   jitter=0.1)
        # vines down the faces and hanging under, flowering with light
        for k in range(36):
            x = rng.uniform(-44, 44)
            sy = rng.choice((-1, 1))
            p = Vector((x, sy * (D / 2 + 0.15), 15.6))
            _hang(m, rng, p, rng.uniform(1.5, 3.0), TEMPLE_MOSS[k % 2], width=0.3, side=(1, 0, 0))
            if k % 3 == 0:
                m.ball(0.22, (x, sy * (D / 2 + 0.3), 13.4), ("#ff6aff", TEMPLE_GLOW)[k % 2], subdiv=0, glow=True)
        for x in piers:                                                    # and down the piers to the water
            for k in range(5):
                a = rng.uniform(0, math.tau)
                ribbon(m, [Vector((x + math.cos(a) * 3, math.sin(a) * 3.5, 13.0)), Vector((x + math.cos(a) * 3.1, math.sin(a) * 3.6, 6.0)),
                           Vector((x + math.cos(a) * 3.2, math.sin(a) * 3.7, 0.0))], [0.35, 0.3, 0.2], TEMPLE_MOSS[k % 2],
                       fold=0.0, thick=0.08, side=(-math.sin(a), math.cos(a), 0))
        _paint(m, fs, TEMPLE_TOP[0], None, dot=0.9)
        m.build(r)


def ziggurat_ruin(variants):
    """Giant: a great ziggurat going under, its stair climbing out of the water to a lit shrine,
    one corner fallen in; the second, a sunken well-court stepping down in rings to a pool of
    light, broken pillars round its rim. Under 8.5."""
    for i in range(2):
        r = root("mirefall_ziggurat_ruin", i)
        rng = random.Random(4320 + i)
        m = Model(f"mirefall_ziggurat_ruin_{i}", 4320 + i)
        fs = []
        if i == 0:
            tiers = 6
            step = 1.2
            base = -1.0
            W0 = 40.0
            for k in range(tiers):
                w = W0 - k * 6.2
                z0 = base + k * step
                fs += list(m.box((w, w, step), (0, 0, z0 + step / 2), TEMPLE[k % 3]))
                for s in (-1, 1):                                          # lit bands under the lips
                    if k and not (k == 3 and s == 1):
                        m.box((w * 0.5, 0.15, 0.25), (0, s * (w / 2 + 0.05), z0 + step * 0.5), TEMPLE_GLOW2, glow=True)
                        m.box((0.15, w * 0.5, 0.25), (s * (w / 2 + 0.05), 0, z0 + step * 0.5), TEMPLE_GLOW2, glow=True)
            top = base + tiers * step
            # stairs up two sides
            for sy in (-1, 1):
                n = 18
                y0, y1 = sy * (W0 / 2 + 2), sy * (W0 - (tiers - 1) * 6.2) / 2
                for k in range(n):
                    t = (k + 0.5) / n
                    m.box((5.0, abs(y1 - y0) / n + 0.05, 0.5), (0, y0 + (y1 - y0) * t, base + (top - base) * t),
                          TEMPLE_STEP[k % 2])
                for s in (-1, 1):
                    m.plank_line((s * 2.9, y0, base + 0.4), (s * 2.9, y1, top + 0.4), 0.8, 0.8, TEMPLE[1])
            # the shrine, its door lit, a glow pool before it
            fs += list(m.box((6.0, 6.0, 1.6), (0, 0, top + 0.8), TEMPLE[0]))
            fs += list(m.box((7.0, 7.0, 0.4), (0, 0, top + 1.8), TEMPLE[2]))
            m.box((2.0, 0.2, 1.6), (0, -3.05, top + 0.9), TEMPLE_GLOW, glow=True)
            m.box((2.0, 0.2, 1.6), (0, 3.05, top + 0.9), TEMPLE_GLOW, glow=True)
            m.box((2.6, 2.6, 0.2), (0, 0, top + 2.05), TEMPLE_GLOW, glow=True, rot=(0, 0, 0.785))
            # the fallen corner: tiers broken off, blocks tumbled into the water
            for k in range(9):
                a = rng.uniform(-0.6, 0.4)
                d = rng.uniform(14, 24)
                fs += list(m.box((rng.uniform(2, 4), rng.uniform(2, 4), rng.uniform(1.2, 2.4)),
                                 (math.cos(a) * d + 6, math.sin(a) * d + 6, rng.uniform(-0.6, 1.4)), TEMPLE[k % 3],
                                 rot=(rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), rng.uniform(0, 3))))
            # moss over the steps, trees of vine on the faces
            for k in range(30):
                t = rng.randrange(tiers - 1)
                w = W0 - t * 6.2
                zt = base + (t + 1) * step
                along = rng.uniform(-1, 1) * (w / 2 - 2)
                edge = w / 2 - 1.6
                x, y = [(along, edge), (along, -edge), (edge, along), (-edge, along)][rng.randrange(4)]
                if abs(x) < 4 and abs(y) > 8:
                    continue
                m.ball(rng.uniform(1.4, 2.4), (x, y, zt), TEMPLE_MOSS[k % 2], subdiv=1, scale=(1.5, 1.0, 0.3), jitter=0.12)
            for k in range(5):
                a = rng.uniform(0, math.tau)
                x, y = math.cos(a) * 9, math.sin(a) * 9
                _cap(m, x, y, top + 0.2 - 2 * step + 2.6, 1.6, 0.6, CAPS[("violet", "teal", "magenta")[k % 3]], "dome", spots=3, rng=rng)
                m.cyl(0.3, 2.6, (x, y, top - 2 * step), STEM[k % 3], segs=5)
            # tip it a touch, going under on one side
            bmesh.ops.rotate(m.bm, verts=list(m.bm.verts), cent=(0, 0, 0), matrix=Matrix.Rotation(0.03, 3, "X") @ Matrix.Rotation(-0.025, 3, "Y"))
        else:
            # rings stepping down to the pool
            for k in range(5):
                R0 = 22 - k * 3.6
                z1 = 2.8 - k * 1.0
                fs += _ring(m, R0 - 3.6, R0, z1 - 1.4, z1, TEMPLE[k % 3])
                if k:
                    _ring(m, R0 - 0.3, R0 + 0.02, z1 - 0.6, z1 - 0.3, TEMPLE_GLOW2 if k % 2 else TEMPLE_GLOW, glow=True)
            m.cyl(7.0, 0.3, (0, 0, 0.1), "#2a6a5a", segs=12)
            m.cyl(5.0, 0.3, (0, 0, 0.25), "#4affc0", segs=12, glow=True)
            m.cyl(2.0, 0.3, (0, 0, 0.4), "#e0ffd0", segs=10, glow=True)
            # broken pillars round the rim, and the wall of the court, half gone
            for k in range(12):
                a = k * math.tau / 12
                h = rng.choice((1.5, 3.0, 4.5, 6.5)) if k % 3 else 2.0
                x, y = math.cos(a) * 24, math.sin(a) * 24
                for j in range(int(h / 1.4) + 1):
                    m.cyl(1.4, min(1.35, h - j * 1.4), (x, y, 1.0 + j * 1.4), TEMPLE[(k + j) % 3], segs=8)
                fs += list(m.box((3.4, 3.4, 1.2), (x, y, 0.6), TEMPLE[2], rot=(0, 0, a)))
                if h > 6:
                    m.box((0.5, 0.2, 1.0), (x, y - 1.45, 6.0), TEMPLE_GLOW, glow=True, rot=(0, 0, a))
                if k % 2 == 0:
                    a2 = a + math.pi / 12
                    fs += list(m.box((7.0, 2.0, rng.uniform(1.6, 4.0)), (math.cos(a2) * 27, math.sin(a2) * 27, 1.0), TEMPLE[1],
                                     rot=(0, 0, a2 + math.pi / 2)))
            # a carved face fallen into the court, looking up
            fs += list(m.box((6.0, 5.0, 3.0), (10, -6, 0.8), TEMPLE[0], rot=(0, 0, 0.5)))
            for s in (-1, 1):
                m.box((1.2, 0.8, 0.3), (10 + s * 1.2, -6 + s * 0.6, 2.35), TEMPLE_GLOW, glow=True, rot=(0, 0, 0.5))
            for k in range(26):
                a = rng.uniform(0, math.tau)
                d = rng.uniform(8, 26)
                m.ball(rng.uniform(1.2, 2.2), (math.cos(a) * d, math.sin(a) * d, 1.4 - max(0, 20 - d) * 0.15), TEMPLE_MOSS[k % 2],
                       subdiv=1, scale=(1.5, 1.0, 0.3), jitter=0.12)
        _paint(m, fs, TEMPLE_TOP[0], None, dot=0.9)
        m.build(r)


def pillar_gate(variants):
    """Gate: the temple's carved pillars, taller than you fly, vines spiralling up them and lintels
    over the gaps; the second, three totems stacked with faces whose eyes still glow."""
    for i in range(2):
        r = root("mirefall_pillar_gate", i)
        rng = random.Random(4340 + i)
        m = Model(f"mirefall_pillar_gate_{i}", 4340 + i)
        fs = []
        if i == 0:
            xs = [-15.0, -5.0, 5.0, 15.0]
            H = [20.0, 21.0, 19.0, 22.0]
            for k, (x, h) in enumerate(zip(xs, H)):
                fs += list(m.box((3.6, 3.6, 1.0), (x, 0, 0.2), TEMPLE[1]))
                n = int(h / 2.2)
                for j in range(n):                                         # drums, out of true
                    z = 0.7 + j * (h - 1.6) / n
                    m.cyl(1.4, (h - 1.6) / n - 0.08, (x + rng.uniform(-0.08, 0.08), 0, z), TEMPLE[(k + j) % 3], segs=8,
                          rot=(0, 0, rng.uniform(0, 1)))
                fs += list(m.box((3.6, 3.6, 0.9), (x, 0, h - 0.4), TEMPLE[2]))
                m.box((0.8, 0.2, 0.5), (x, -1.85, h - 0.4), TEMPLE_GLOW, glow=True)
                collider(r, x, 0, 1.55)
                pts = []
                for j in range(31):                                       # the vine
                    t = j / 30
                    a = t * 3.0 * math.tau + k
                    pts.append(Vector((x + math.cos(a) * 1.55, math.sin(a) * 1.55, 0.3 + t * (h - 1))))
                tube(m, pts, [0.16] * 31, TEMPLE_MOSS[0], segs=4)
                for j in range(2, 31, 3):
                    p = pts[j]
                    m.ball(0.2, (p.x, p.y, p.z), ("#ff6aff", TEMPLE_GLOW)[j % 2], subdiv=0, glow=True)
            for a, b in ((0, 1), (2, 3), (1, 2)):
                z = max(H[a], H[b]) + (1.0 if (a, b) != (1, 2) else 2.6)
                fs += list(m.box((xs[b] - xs[a] + 3.8, 3.4, 1.6), ((xs[a] + xs[b]) / 2, 0, z), TEMPLE[a % 3]))
                m.box((xs[b] - xs[a] - 3.0, 0.2, 0.35), ((xs[a] + xs[b]) / 2, -1.75, z), TEMPLE_GLOW2, glow=True)
                for j in range(5):                                         # vines hanging from it
                    px = xs[a] + 2.0 + j * (xs[b] - xs[a] - 4) / 4
                    _hang(m, rng, (px, rng.uniform(-1.2, 1.2), z - 0.8), rng.uniform(2.0, 5.0), TEMPLE_MOSS[j % 2], width=0.35,
                          side=(1, 0, 0))
                m.ball(1.2, ((xs[a] + xs[b]) / 2 + 1, 0, z + 0.8), TEMPLE_MOSS[1], subdiv=1, scale=(2.0, 1.0, 0.35))
        else:
            xs = [-13.0, -1.5, 10.0]
            H = [18.0, 24.0, 20.0]
            for k, (x, h) in enumerate(zip(xs, H)):
                fs += list(m.box((4.0, 4.0, 1.2), (x, 0, 0.3), TEMPLE[2]))
                n = int(h / 4.0)
                for j in range(n):                                         # a face on each block
                    z0 = 0.9 + j * (h - 0.9) / n
                    bh = (h - 0.9) / n - 0.1
                    w = 3.2 - 0.12 * (j % 2)
                    fs += list(m.box((w, w, bh), (x, 0, z0 + bh / 2), TEMPLE[(k + j) % 3]))
                    for sy in (-1, 1):
                        fs += list(m.box((w + 0.5, 0.6, 0.5), (x, sy * (w / 2 + 0.1), z0 + bh * 0.72), TEMPLE[(k + j + 1) % 3]))
                        for s in (-1, 1):
                            m.box((0.6, 0.2, 0.35), (x + s * 0.7, sy * (w / 2 + 0.05), z0 + bh * 0.55), TEMPLE_GLOW if j % 2 else EYE,
                                  glow=True)
                        m.box((1.4, 0.2, 0.3), (x, sy * (w / 2 + 0.05), z0 + bh * 0.2), STONE_DARK)
                fs += list(m.box((4.2, 4.2, 0.6), (x, 0, h + 0.3), TEMPLE[1]))
                m.cyl(1.2, 1.4, (x, 0, h + 0.6), TEMPLE[0], segs=4, r_top=0.0, rot=(0, 0, math.pi / 4))
                collider(r, x, 0, 1.75)
            # a web of vine strung between their heads, flowering
            for a, b in ((0, 1), (1, 2)):
                pa = Vector((xs[a], 0, H[a] - 2.5))
                pb = Vector((xs[b], 0, H[b] - 2.5))
                pts = _strand(m, pa, pb, 2.4, TEMPLE_MOSS[0], r=0.25)
                for p in pts[1:-1]:
                    _hang(m, rng, p, rng.uniform(0.8, 2.0), TEMPLE_MOSS[1], width=0.3, side=(1, 0, 0))
                    m.ball(0.25, tuple(p), "#ff6aff", subdiv=0, glow=True)
        for x in xs:                                                       # rubble and moss at the feet
            for k in range(3):
                lump(m, rng, (x + rng.uniform(-3.5, 3.5), rng.uniform(-3.5, 3.5), 0.0), (1.0, 0.8, 0.6), TEMPLE[k % 3], n=8, flat=0.5)
            m.ball(2.0, (x, 0, 0.6), TEMPLE_MOSS[0], subdiv=1, scale=(1.6, 1.4, 0.3), jitter=0.1)
        _paint(m, fs, TEMPLE_TOP[0], None, dot=0.85)
        m.build(r)


def idol(variants):
    """Scenery: idols of whoever built the temple, sinking, their eyes lit."""
    for i in range(2):
        r = root("mirefall_idol", i)
        rng = random.Random(4360 + i)
        m = Model(f"mirefall_idol_{i}", 4360 + i)
        fs = []
        if i == 0:
            fs += list(m.box((2.4, 2.2, 3.4), (0, 0, 1.4), TEMPLE[0], taper=0.85))
            fs += list(m.box((2.8, 0.6, 0.5), (0, -1.0, 2.5), TEMPLE[1]))
            fs += list(m.box((3.0, 2.6, 0.5), (0, 0.1, 3.3), TEMPLE[2]))
            for s in (-1, 1):
                m.box((0.5, 0.2, 0.3), (s * 0.6, -1.12, 2.15), TEMPLE_GLOW, glow=True)
            m.box((1.0, 0.2, 0.25), (0, -1.12, 1.1), STONE_DARK)
        else:
            # a squat toad-god, mouth open, a glow in it
            fs += list(m.ball(1.8, (0, 0, 0.8), TEMPLE[1], subdiv=1, scale=(1.2, 1.0, 0.8)))
            fs += list(m.ball(1.1, (0, -1.0, 1.9), TEMPLE[0], subdiv=1, scale=(1.3, 1.0, 0.8)))
            m.ball(0.5, (0, -2.0, 1.6), TEMPLE_GLOW, subdiv=1, glow=True, scale=(1.3, 0.6, 0.6))
            for s in (-1, 1):
                m.ball(0.35, (s * 0.8, -1.6, 2.5), EYE, subdiv=0, glow=True)
                fs += list(m.ball(0.7, (s * 1.6, -0.9, 0.2), TEMPLE[2], subdiv=0, scale=(1.2, 1.4, 0.6)))
        _paint(m, fs, TEMPLE_TOP[0], None, dot=0.8)
        m.ball(1.0, (rng.uniform(-0.5, 0.5), 0.4, 3.5 if i == 0 else 2.3), TEMPLE_MOSS[i], subdiv=1, scale=(1.4, 1.0, 0.3))
        m.build(r, rot_z=rng.uniform(0, math.tau))


def rubble(variants):
    """Scenery: the temple coming apart: tumbled blocks, a broken stair, drums of a fallen column."""
    for i in range(3):
        r = root("mirefall_rubble", i)
        rng = random.Random(4380 + i)
        m = Model(f"mirefall_rubble_{i}", 4380 + i)
        fs = []
        if i == 0:
            for k in range(6):
                fs += list(m.box((rng.uniform(1.2, 2.2), rng.uniform(1.0, 1.8), rng.uniform(0.8, 1.4)),
                                 (rng.uniform(-2, 2), rng.uniform(-2, 2), rng.uniform(0, 0.6)), TEMPLE[k % 3],
                                 rot=(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0, 3))))
        elif i == 1:
            for k in range(5):
                fs += list(m.box((3.6 - k * 0.3, 1.0, 0.5), (0, k * 0.9 - 2, 0.25 + k * 0.5), TEMPLE_STEP[k % 2]))
            fs += list(m.box((1.0, 5.0, 3.0), (-2.2, 0, 1.0), TEMPLE[1], taper=0.8))
            m.box((0.2, 1.0, 0.4), (-2.75, 0, 2.0), TEMPLE_GLOW, glow=True)
        else:
            for k in range(4):
                fs += list(m.cyl(1.3, 1.6, (-3 + k * 2.0, k * 0.3, 1.2), TEMPLE[k % 3], segs=8, rot=(math.pi / 2, 0, 1.5 + k * 0.08)))
            fs += list(m.box((3.0, 3.0, 1.0), (4.5, 0.5, 0.3), TEMPLE[2], rot=(0.1, 0.2, 0.3)))
        _paint(m, fs, TEMPLE_TOP[0], None, dot=0.8)
        for k in range(3):
            m.ball(rng.uniform(0.8, 1.2), (rng.uniform(-2, 2), rng.uniform(-2, 2), 1.2), TEMPLE_MOSS[k % 2], subdiv=1,
                   scale=(1.4, 1.0, 0.3))
        m.build(r, rot_z=rng.uniform(0, math.tau))


# --- the spore vents --------------------------------------------------------------------------

def _chimney(m, rng, x, y, h, R, pal_i, mouths):
    pts = bend((x, y, -1.0), (x, y, h), (rng.uniform(-1, 1), rng.uniform(-0.6, 0.6)), n=6)
    rads = [R * 1.8, R * 1.3, R * 1.05, R, R * 0.95, R * 1.0, R * 1.15]
    tube(m, pts, rads, VENT[pal_i % 3], segs=8, colors=[VENT[(pal_i + j) % 3] for j in range(6)])
    top = pts[-1]
    m.cyl(R * 1.25, 0.6, (top.x, top.y, top.z - 0.3), VENT_TOP, segs=8, r_top=R * 0.9)
    m.cyl(R * 0.85, 0.2, (top.x, top.y, top.z + 0.3), SPORE, segs=8, glow=True)
    m.ball(R * 0.6, (top.x, top.y, top.z + 0.5), PORE_HOT, subdiv=1, scale=(1, 1, 0.5), glow=True)
    # rings of glowing pores up its sides (they breathe)
    for j in range(3, 6):
        p = pts[j]
        for k in range(5):
            a = k * math.tau / 5 + j
            m.ball(0.3, (p.x + math.cos(a) * rads[j], p.y + math.sin(a) * rads[j], p.z), PORE, subdiv=0, glow=True)
    mouths.append(top)
    return pts


def spore_chimney(variants):
    """Gate: chimneys of the vent fungus, taller than you fly, breathing light from their throats,
    webbed together over the gaps; the second, crooked and fewer, one split into two flues."""
    for i in range(2):
        r = root("mirefall_spore_chimney", i)
        rng = random.Random(4420 + i)
        m = Model(f"mirefall_spore_chimney_{i}", 4420 + i)
        mouths = []
        spec = ([(-15, 0, 19.0, 1.5), (-5, 0.6, 23.0, 1.7), (5, -0.5, 17.0, 1.4), (15, 0.4, 21.0, 1.6)] if i == 0 else
                [(-12, 0, 24.0, 2.0), (0, 0.6, 18.0, 1.5), (11.5, -0.4, 21.0, 1.8)])
        chims = []
        for k, (x, y, h, R) in enumerate(spec):
            chims.append(_chimney(m, rng, x, y, h, R, k, mouths))
            collider(r, x, y, R * 1.1)
        if i == 1:
            # the middle one splits into two flues past the flight line
            p = chims[1][4]
            for s in (-1, 1):
                q = p + Vector((s * 2.6, 0, 5.0))
                tube(m, [p, p.lerp(q, 0.5) + Vector((s * 0.4, 0, 0)), q], [1.0, 0.85, 0.8], VENT[1], segs=7)
                m.cyl(0.7, 0.2, (q.x, q.y, q.z), SPORE, segs=7, glow=True)
        # webs of mycelium slung between, above 13
        for a, b in zip(spec, spec[1:]):
            pa = Vector((a[0], a[1], min(a[2], b[2]) - 2.0))
            pb = Vector((b[0], b[1], min(a[2], b[2]) - 1.5))
            _strand(m, pa, pb, 1.4, "#c8b0d0", r=0.22)
            _strand(m, pa + Vector((0, 0, 1.8)), pb + Vector((0, 0, 1.6)), 0.9, SPORE, r=0.14, glow=True)
        # the crater floor round them
        for k in range(10):
            a = rng.uniform(0, math.tau)
            x = rng.choice(spec)[0] + math.cos(a) * 3.5
            fs = lump(m, rng, (x, math.sin(a) * 3.5, 0.0), (1.6, 1.3, 0.8), VENT[k % 3], n=9, flat=0.5)
            _paint(m, fs, VENT_TOP)
        m.build(r)


def fungal_arch(variants):
    """Span: a fleshy fungal arch grown right across from vent to vent, lumpy, its pores lit,
    tendrils hanging; the second, two strands braided round each other."""
    for i in range(2):
        r = root("mirefall_fungal_arch", i)
        rng = random.Random(4440 + i)
        m = Model(f"mirefall_fungal_arch_{i}", 4440 + i)
        fs = []
        strands = [0.0] if i == 0 else [0.0, math.pi]
        n = 16
        for ph in strands:
            pts = []
            for k in range(n + 1):
                t = k / n
                x = -42 + 84 * t
                z = -2.0 + 18.0 * math.sin(math.pi * t) ** 0.35
                y = 0.0
                if i == 1:
                    y = math.sin(t * 3 * math.tau + ph) * 1.8
                    z += math.cos(t * 3 * math.tau + ph) * 1.2 * math.sin(math.pi * t)
                pts.append(Vector((x, y, z)))
            rads = [(3.6 if i == 0 else 2.4) * (1.3 - 0.45 * math.sin(math.pi * k / n)) + rng.uniform(-0.3, 0.3) for k in range(n + 1)]
            # over the field keep the underside above 13
            for k, p in enumerate(pts):
                if abs(p.x) < 37:
                    p.z = max(p.z, 13.2 + rads[k])
            fs += tube(m, pts, rads, FLESH[0], segs=8, colors=[FLESH[k % 3] for k in range(n)])
            for k in range(2, n - 1):                                     # lumps and pores
                p = pts[k]
                a = rng.uniform(0.2, math.pi - 0.2)
                fs += list(m.ball(rads[k] * 0.6, (p.x + rng.uniform(-1, 1), p.y + math.cos(a) * rads[k] * 0.7,
                                                  p.z + math.sin(a) * rads[k] * 0.7), FLESH[(k + 1) % 3], subdiv=1, jitter=0.1))
                for j in range(3):
                    b = rng.uniform(0.3, math.pi - 0.3)
                    m.ball(rng.uniform(0.25, 0.45), (p.x + rng.uniform(-2, 2), p.y + math.cos(b) * rads[k],
                                                     p.z + math.sin(b) * rads[k]), PORE, subdiv=0, glow=True)
                if abs(p.x) < 36 and k % 2:                                # tendrils hanging off it
                    q = Vector((p.x + rng.uniform(-1, 1), p.y, p.z - rads[k] + 0.2))
                    _hang(m, rng, q, rng.uniform(0.8, 2.0), FLESH[2], width=0.3, side=(1, 0, 0))
        for s in (-1, 1):                                                  # the vent mounds at its feet
            x = s * 42
            for k in range(7):
                a = k * math.tau / 7
                f = lump(m, rng, (x + math.cos(a) * 4.5, math.sin(a) * 4.5, 0.0), (2.2, 1.8, 1.4), VENT[k % 3], n=10, flat=0.5)
                _paint(m, f, VENT_TOP)
            m.cyl(2.4, 0.4, (x + s * 4, 0, 0.6), SPORE, segs=8, glow=True)
            collider(r, x, 0, 4.0)
        _paint(m, fs, FLESH_TOP, None, dot=0.75)
        m.build(r)


def vent_crater(variants):
    """Giant: a vent crater as wide as the field, its rim of fungal rock, a pool of light breathing
    at its heart and little chimneys round it. Under 8.5."""
    r = root("mirefall_vent_crater", 0)
    rng = random.Random(4460)
    m = Model("mirefall_vent_crater_0", 4460)
    for k in range(18):
        a = k * math.tau / 18 + rng.uniform(-0.1, 0.1)
        d = rng.uniform(15, 18)
        f = lump(m, rng, (math.cos(a) * d, math.sin(a) * d * 0.85, 0.6), (rng.uniform(3.4, 4.6), 3.0, rng.uniform(2.6, 4.2)), VENT[k % 3],
                 n=10, flat=0.4)
        _paint(m, f, VENT_TOP)
    for k in range(9):                                                     # the inner terrace
        a = k * math.tau / 9 + 0.3
        f = lump(m, rng, (math.cos(a) * 10, math.sin(a) * 8.5, -0.2), (3.0, 2.4, 1.4), VENT[(k + 1) % 3], n=9, flat=0.5)
        _paint(m, f, VENT_TOP)
    m.cyl(9.0, 0.3, (0, 0, -0.6), "#3a8a4a", segs=14)
    m.cyl(7.0, 0.3, (0, 0, -0.4), SPORE, segs=14, glow=True)
    for k in range(5):
        a = k * math.tau / 5
        x, y = math.cos(a) * 12, math.sin(a) * 10
        h = rng.uniform(3.0, 6.5)
        tube(m, [Vector((x, y, 0)), Vector((x, y, h * 0.5)), Vector((x * 1.03, y * 1.03, h))], [1.4, 1.0, 0.8], VENT[k % 3], segs=7)
        m.cyl(0.6, 0.2, (x * 1.03, y * 1.03, h), SPORE, segs=7, glow=True)
    for k in range(20):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(19, 24)
        m.ball(0.35, (math.cos(a) * d, math.sin(a) * d * 0.85, 0.1), SPORE, subdiv=0, glow=True, scale=(1, 1, 0.5))
    m.build(r)
    g = Model("mirefall_vent_crater_0_heart", 4461)
    g.ball(3.2, (0, 0, 0), PORE_HOT, subdiv=1, scale=(1, 1, 0.4), glow=True)
    obj = g.build(r, loc=(0, 0, -0.2))
    pulse(obj, "mirefall_vent_crater_0_breathe_idle", amp=0.2, period=3.0)


def spore_tube(variants):
    """Scenery: tube fungus in clumps, like organ pipes, their mouths lit."""
    for i in range(3):
        r = root("mirefall_spore_tube", i)
        rng = random.Random(4480 + i)
        m = Model(f"mirefall_spore_tube_{i}", 4480 + i)
        n = (6, 10, 4)[i]
        for k in range(n):
            a = k * 2.4
            d = math.sqrt(k) * 0.55
            x, y = math.cos(a) * d, math.sin(a) * d
            h = (rng.uniform(2.5, 4.5) if k < 3 else rng.uniform(1.0, 2.8)) * (1.4 if i == 2 else 1)
            R = rng.uniform(0.32, 0.5) * (1.5 if i == 2 else 1)
            tube(m, [Vector((x, y, -0.2)), Vector((x + math.cos(a) * 0.2, y + math.sin(a) * 0.2, h))], [R * 1.1, R], FLESH[k % 3], segs=6)
            m.cyl(R * 1.15, 0.25, (x + math.cos(a) * 0.2, y + math.sin(a) * 0.2, h - 0.1), FLESH_TOP, segs=6)
            m.cyl(R * 0.75, 0.1, (x + math.cos(a) * 0.2, y + math.sin(a) * 0.2, h + 0.1), PORE if k % 2 else "#ff8aff", segs=6, glow=True)
        m.build(r, rot_z=rng.uniform(0, math.tau))



# --- the Hive's bloom: new scenery -------------------------------------------------------------

def _blob(m, rng, x, y, z, R, col, sub=1, sq=0.8):
    return m.ball(R, (x, y, z), col, subdiv=sub, scale=(1, rng.uniform(0.85, 1.1), sq), jitter=R * 0.06)


def moss_bed(variants):
    """Ground cover: beds of violet moss under the caps: one freckled with buttons and lichen, one
    bristling with lit pins, one a fairy ring round a bare patch."""
    for i in range(3):
        r = root("mirefall_moss_bed", i)
        rng = random.Random(4500 + i)
        m = Model(f"mirefall_moss_bed_{i}", 4500 + i)
        fs = []
        if i < 2:
            for k in range(5 + i):
                a = rng.uniform(0, math.tau)
                d = rng.uniform(0, 1.6)
                fs += list(m.ball(1.0, (math.cos(a) * d, math.sin(a) * d, -0.05), VMOSS[k % 3], subdiv=1,
                                  scale=(rng.uniform(0.8, 1.3), rng.uniform(0.7, 1.1), 0.32), jitter=0.06))
        _paint(m, fs, VMOSS_TOP, None, dot=0.85)
        if i == 0:
            for k in range(4):                                             # lichen rosettes
                a = rng.uniform(0, math.tau)
                d = rng.uniform(0.4, 1.8)
                m.cyl(rng.uniform(0.3, 0.45), 0.1, (math.cos(a) * d, math.sin(a) * d, 0.3), LICHEN, segs=6)
            for k in range(7):                                             # buttons
                a = rng.uniform(0, math.tau)
                d = rng.uniform(0.3, 2.0)
                x, y = math.cos(a) * d, math.sin(a) * d
                h = rng.uniform(0.25, 0.55)
                m.cyl(0.08, h, (x, y, 0.1), STEM[k % 3], segs=4)
                pal = BLOOM[("lilac", "orchid", "violet")[k % 3]]
                m.ball(rng.uniform(0.2, 0.3), (x, y, 0.1 + h), pal[0], subdiv=0, scale=(1, 1, 0.55))
                if k % 2:
                    m.ball(0.1, (x, y, 0.2 + h), pal[3], subdiv=0, glow=True)
        elif i == 1:
            for k in range(14):                                            # pin moulds: lit heads on threads
                a = rng.uniform(0, math.tau)
                d = rng.uniform(0.2, 2.0)
                x, y = math.cos(a) * d, math.sin(a) * d
                h = rng.uniform(0.4, 0.8)
                m.cyl(0.05, h, (x, y, 0.2), STEM[1], segs=3)
                m.ball(0.14, (x, y, 0.2 + h), (ACID, "#ff7aff")[k % 4 == 0], subdiv=0, glow=True)
        else:
            m.cyl(1.9, 0.08, (0, 0, -0.02), "#2a1e36", segs=12)                 # the bare, trodden middle
            for k in range(11):
                a = k * math.tau / 11 + rng.uniform(-0.1, 0.1)
                d = 1.75 + rng.uniform(-0.15, 0.2)
                x, y = math.cos(a) * d, math.sin(a) * d
                h = rng.uniform(0.35, 0.7)
                m.cyl(0.1, h, (x, y, 0), STEM[k % 3], segs=4)
                m.ball(0.3, (x, y, h), BLOOM["lilac"][0] if k % 2 else BLOOM["violet"][1], subdiv=0, scale=(1, 1, 0.5))
                m.ball(0.12, (x, y, h + 0.12), ACID, subdiv=0, glow=True)
            for k in range(6):
                a = rng.uniform(0, math.tau)
                fs2 = list(m.ball(1.0, (math.cos(a) * 2.6, math.sin(a) * 2.6, -0.05), VMOSS[k % 3], subdiv=1, scale=(0.9, 0.7, 0.28)))
                _paint(m, fs2, VMOSS_TOP, None, dot=0.85)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def lattice(variants):
    """Hero fungus: cage fungi, an open lattice of violet ribs with a light caught inside; a stand of
    small ones; a burst egg throwing out curled orchid arms."""
    for i in range(3):
        r = root("mirefall_lattice", i)
        rng = random.Random(4520 + i)
        m = Model(f"mirefall_lattice_{i}", 4520 + i)
        if i < 2:
            cages = [(0, 0, 1.7, "violet")] if i == 0 else [(0, 0, 1.15, "orchid"), (1.9, 0.6, 0.85, "violet"),
                                                           (-1.2, 1.5, 0.7, "lilac"), (0.4, -1.7, 0.6, "orchid")]
            for x, y, R, pal in cages:
                cap, crown, wart, glow = BLOOM[pal]
                bm2 = bmesh.new()
                bmesh.ops.create_icosphere(bm2, subdivisions=1, radius=R)
                zc = R * 0.75
                m.ball(R * 0.45, (x, y, zc - R * 0.1), glow, subdiv=1, glow=True)      # the light inside
                for e in bm2.edges:
                    a, b = e.verts[0].co, e.verts[1].co
                    if a.z < -R * 0.6 and b.z < -R * 0.6:
                        continue
                    pa = Vector((x + a.x, y + a.y, zc + a.z * 0.9))
                    pb = Vector((x + b.x, y + b.y, zc + b.z * 0.9))
                    hi = max(a.z, b.z) > R * 0.3
                    tube(m, [pa, pb], [R * 0.11, R * 0.11], crown if hi else cap, segs=3, cap=False)
                for v in bm2.verts:                                         # the nodes, knuckled
                    if v.co.z > -R * 0.6 and R > 1.0:
                        m.ball(R * 0.14, (x + v.co.x, y + v.co.y, zc + v.co.z * 0.9), cap, subdiv=0)
                bm2.free()
                m.cyl(R * 0.6, 0.25, (x, y, -0.05), STEM[2], segs=6, r_top=R * 0.4)      # the cup it rose from
                m.cyl(R * 0.7, 0.04, (x, y, 0.0), glow, segs=8, glow=True)               # what drips out of it
        else:
            cap, crown, wart, glow = BLOOM["orchid"]
            m.ball(0.9, (0, 0, 0.45), STEM[0], subdiv=1, scale=(1, 1, 0.65))          # the egg, split
            m.cyl(0.6, 0.12, (0, 0, 0.95), glow, segs=7, glow=True)
            for k in range(6):
                a = k * math.tau / 6 + rng.uniform(-0.15, 0.15)
                L = rng.uniform(2.0, 2.8)
                pts = [Vector((math.cos(a) * 0.4, math.sin(a) * 0.4, 0.9))]
                for j in range(1, 6):
                    t = j / 5
                    d = 0.4 + L * t
                    pts.append(Vector((math.cos(a + t * 0.4) * d, math.sin(a + t * 0.4) * d, 0.9 + math.sin(t * math.pi) * 0.9 - t * 0.7)))
                tube(m, pts, [0.32, 0.36, 0.34, 0.28, 0.2, 0.08], cap, segs=5, colors=[cap, crown, crown, cap, cap])
                for j in (2, 4):                                            # black spore smear, lit pores along it
                    p = pts[j]
                    m.ball(0.14, (p.x, p.y, p.z + 0.25), glow, subdiv=0, glow=True)
                p = pts[-1]
                m.ball(0.16, (p.x, p.y, p.z + 0.05), glow, subdiv=0, glow=True)
            for k in range(5):
                a = rng.uniform(0, math.tau)
                lump(m, rng, (math.cos(a) * 1.1, math.sin(a) * 1.1, 0.0), (0.5, 0.4, 0.25), VMOSS[k % 3], n=7, flat=0.6)
        obj = m.build(r, rot_z=rng.uniform(0, math.tau))


def drowned_trunk(variants):
    """Peat scenery: trees that drowned standing, the Hive's bloom eating them: a snapped hollow with
    a pool of light in it, a forked one hung with moss and blisters, a hollow stump fruiting, a leaner."""
    for i in range(4):
        r = root("mirefall_drowned_trunk", i)
        rng = random.Random(4540 + i)
        m = Model(f"mirefall_drowned_trunk_{i}", 4540 + i)
        fs = []
        if i == 0:
            H, sr, lean = 5.0, 0.95, (0.4, 0.2)
        elif i == 1:
            H, sr, lean = 6.4, 0.6, (-0.6, 0.5)
        elif i == 2:
            H, sr, lean = 1.7, 1.35, (0.1, 0.0)
        else:
            H, sr, lean = 4.2, 0.65, (2.6, 0.6)
        pts = bend((0, 0, -0.3), (0, 0, H), lean, n=6)
        fs += tube(m, pts, [sr * 1.7, sr * 1.2, sr * 1.05, sr, sr * 0.95, sr * 0.9, sr * 0.9], DWOOD[0], segs=7,
                   colors=[DWOOD[k % 3] for k in range(6)])
        top = pts[-1]
        if i in (0, 2):                                                    # the hollow (a pool of light down in the first)
            m.cyl(sr * 0.72, 0.1, (top.x, top.y, top.z - 0.02), HOLLOW, segs=7)
            if i == 0:
                m.cyl(sr * 0.45, 0.08, (top.x, top.y, top.z + 0.02), ACID, segs=7, glow=True)
            for k in range(6):                                             # the broken rim, jagged
                a = k * math.tau / 6 + rng.uniform(-0.2, 0.2)
                m.box((0.4, 0.3, rng.uniform(0.4, 1.0) * (1.4 if i == 2 else 1)),
                      (top.x + math.cos(a) * sr * 0.8, top.y + math.sin(a) * sr * 0.8, top.z + 0.15), DWOOD_TOP,
                      rot=(math.sin(a) * 0.25, -math.cos(a) * 0.25, a), taper=0.3)
        if i == 2:                                                         # fruiting in the stump
            for k, (dx, dy, h, R, pal) in enumerate(((0.3, 0.2, 1.1, 0.6, "orchid"), (-0.4, -0.2, 0.7, 0.45, "lilac"))):
                m.cyl(0.1, h, (dx, dy, H - 0.2), STEM[k], segs=4)
                _bloomcap(m, rng, dx, dy, H - 0.2 + h, R, R * 0.5, pal, warts=2, lobes=7)
        if i in (1, 3):                                                    # limbs, bare and bowed, moss hanging off
            nb = 2 if i == 1 else 2
            for k in range(nb):
                p = pts[4 if k == 0 else 3]
                a = (0.4 if k == 0 else 2.9) + rng.uniform(-0.3, 0.3)
                L = 2.4 if i == 1 else 1.8
                q = Vector((p.x + math.cos(a) * L, p.y + math.sin(a) * L, p.z + L * 0.55))
                fs += tube(m, [p, p.lerp(q, 0.5) + Vector((0, 0, 0.25)), q], [0.3, 0.2, 0.08], DWOOD[1], segs=5)
                for j in range(2):
                    hp = p.lerp(q, 0.35 + j * 0.35)
                    _hang(m, rng, hp + Vector((0, 0, -0.1)), rng.uniform(0.8, 1.5), MOSS_HANG[j], width=0.3)
                m.ball(0.38, tuple(p.lerp(q, 0.55) + Vector((0, 0, 0.25))), SAC[k % 3], subdiv=0, scale=(1, 1, 0.8))
            m.cyl(sr * 0.6, 0.1, (top.x, top.y, top.z - 0.02), HOLLOW, segs=7)
        # the bloom: sacs swelling round the foot and up one side, lit pores, a dribble of light
        for k in range(5 if i != 2 else 6):
            a = rng.uniform(-0.9, 0.9) + 0.5
            t = k / 6
            p = pts[min(5, int(t * 4))]
            R = rng.uniform(0.35, 0.6) * (1.3 if k < 2 else 1)
            x, y = p.x + math.cos(a) * (sr * 1.1 + R * 0.4), p.y + math.sin(a) * (sr * 1.1 + R * 0.4)
            m.ball(R, (x, y, max(p.z, 0.2)), SAC[k % 3], subdiv=1, scale=(1, 1, 0.8))
            if k == 0:
                m.ball(R * 0.35, (x + math.cos(a) * R * 0.5, y + math.sin(a) * R * 0.5, max(p.z, 0.2) + R * 0.5), ACID,
                       subdiv=0, glow=True)
        for k in range(2):                                                 # bracket shelves on the shady side
            p = pts[2 + k * 2] if i != 2 else pts[3]
            a = 3.6 + k * 0.8
            R = 0.7 - k * 0.15
            m.cyl(R, 0.16, (p.x + math.cos(a) * sr, p.y + math.sin(a) * sr, p.z), BLOOM["lilac"][0], segs=7, r_top=R * 0.8)
            m.cyl(R * 0.85, 0.06, (p.x + math.cos(a) * sr, p.y + math.sin(a) * sr, p.z - 0.04), ACID, segs=7, glow=True)
        for k in range(4):                                                 # roots splayed into the peat
            a = k * math.tau / 4 + rng.uniform(-0.3, 0.3)
            fs += tube(m, [Vector((0, 0, 0.5)), Vector((math.cos(a) * sr * 1.4, math.sin(a) * sr * 1.4, 0.05)),
                           Vector((math.cos(a) * sr * 2.4, math.sin(a) * sr * 2.4, -0.2))], [sr * 0.35, sr * 0.25, 0.08],
                       DWOOD[k % 3], segs=4)
        _paint(m, fs, DWOOD_TOP, None, dot=0.85)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def pitcher(variants):
    """Peat scenery: pitcher plants, swollen violet jugs veined green, a little acid light pooled in
    each mouth and a lid held over it."""
    for i in range(3):
        r = root("mirefall_pitcher", i)
        rng = random.Random(4560 + i)
        m = Model(f"mirefall_pitcher_{i}", 4560 + i)
        spec = ([(0, 0, 2.2, 0.55), (1.0, 0.5, 1.6, 0.45), (-0.8, 0.7, 1.3, 0.4)] if i == 0 else
                [(0, 0, 1.8, 0.45), (0.9, 0.4, 1.4, 0.4), (-0.7, 0.8, 1.2, 0.36), (0.2, -1.0, 1.5, 0.42), (-1.0, -0.5, 0.9, 0.32)]
                if i == 1 else [(0, 0, 2.8, 0.8)])
        for k, (x, y, h, R) in enumerate(spec):
            a = math.atan2(y, x) if (x or y) else rng.uniform(0, math.tau)
            lx, ly = math.cos(a) * 0.3, math.sin(a) * 0.3
            pts = [Vector((x, y, -0.1)), Vector((x + lx * 0.3, y + ly * 0.3, h * 0.3)), Vector((x + lx * 0.6, y + ly * 0.6, h * 0.62)),
                   Vector((x + lx * 0.9, y + ly * 0.9, h * 0.88)), Vector((x + lx, y + ly, h))]
            col = PITCH[k % 3]
            tube(m, pts, [R * 0.6, R * 1.05, R * 1.0, R * 0.7, R * 0.85], col, segs=7,
                 colors=[col, PITCH_VEIN if k % 2 else col, col, PITCH[(k + 1) % 3]], cap=False)
            t = pts[-1]
            m.cyl(R * 0.98, 0.16, (t.x, t.y, t.z - 0.08), SAC_TOP, segs=8, r_top=R * 1.05)     # the lip, rolled
            m.cyl(R * 0.68, 0.1, (t.x, t.y, t.z - 0.18), ACID, segs=7, glow=True)              # what's pooled inside
            back = Vector((-math.cos(a), -math.sin(a), 0))
            m.box((R * 1.4, R * 1.1, 0.1), tuple(t + back * R * 0.9 + Vector((0, 0, R * 0.6))), PITCH[(k + 2) % 3],
                  rot=(math.sin(a) * 0.9, -math.cos(a) * 0.9, a + math.pi / 2))              # the lid, propped open
        for k in range(5):                                                  # strap leaves at the foot
            yaw = k * math.tau / 5 + rng.uniform(-0.2, 0.2)
            frond(m, (0, 0, 0), yaw, 1.4, 0.32, MOSS[k % 3], MOSS[(k + 1) % 3], rise=0.3, droop=0.7, n=4, serrate=0.0)
        obj = m.build(r, rot_z=rng.uniform(0, math.tau))
        sway(obj, f"mirefall_pitcher_{i}_sway_idle", amp=(0.03, 0.025), period=3.4 + i * 0.4, phase=i)


def stele(variants):
    """Temple scenery: carved stones with lit glyphs: a tall one, moss-capped; a fallen pair, one face
    up so its glyphs shine at the sky; a ring of stumps round a basin of light."""
    for i in range(3):
        r = root("mirefall_stele", i)
        rng = random.Random(4580 + i)
        m = Model(f"mirefall_stele_{i}", 4580 + i)
        fs = []
        if i == 0:
            fs += list(m.box((1.6, 0.8, 4.4), (0, 0, 2.0), TEMPLE[0], taper=0.8))
            fs += list(m.box((1.9, 1.1, 0.5), (0, 0, 0.1), TEMPLE[1]))
            for k in range(4):
                m.box((0.7 - (k % 2) * 0.25, 0.1, 0.32), (0, -0.42, 0.9 + k * 0.85), TEMPLE_GLOW if k % 2 else TEMPLE_GLOW2, glow=True)
            m.ball(0.9, (0.1, 0.0, 4.25), TEMPLE_MOSS[0], subdiv=1, scale=(1.1, 0.8, 0.35))
            _hang(m, rng, Vector((0.6, -0.35, 4.1)), 1.6, TEMPLE_MOSS[1], width=0.3)
        elif i == 1:
            fs += list(m.box((1.5, 0.75, 3.6), (-1.2, 0.3, 1.6), TEMPLE[1], rot=(0.25, -0.2, 0.2), taper=0.85))
            fs += list(m.box((1.6, 4.0, 0.8), (1.3, -0.3, 0.25), TEMPLE[2], rot=(0, 0.05, 0.3)))          # fallen, face up
            for k in range(4):
                y = -1.7 + k * 0.95
                m.box((0.7 - (k % 2) * 0.25, 0.32, 0.1), (1.3 + y * -0.3 * 0.3, -0.3 + y, 0.67), TEMPLE_GLOW if k % 2 else TEMPLE_GLOW2,
                      rot=(0, 0, 0.3), glow=True)
            for k in range(3):                                             # the bloom has found it
                m.ball(rng.uniform(0.35, 0.55), (2.2 + rng.uniform(-0.3, 0.3), -2.0 + k * 0.7, 0.55), SAC[k % 3], subdiv=1, scale=(1, 1, 0.8))
            m.ball(0.15, (2.5, -1.6, 0.95), ACID, subdiv=0, glow=True)
        else:
            m.cyl(1.4, 0.3, (0, 0, -0.1), TEMPLE[2], segs=8)                    # the basin
            m.cyl(1.1, 0.1, (0, 0, 0.15), TEMPLE_GLOW, segs=8, glow=True)
            for k in range(6):
                a = k * math.tau / 6 + rng.uniform(-0.1, 0.1)
                h = rng.uniform(0.9, 2.0) if k != 4 else 0.5
                x, y = math.cos(a) * 2.6, math.sin(a) * 2.6
                fs += list(m.box((0.8, 0.6, h), (x, y, h / 2 - 0.1), TEMPLE[k % 3], rot=(rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), a),
                                 taper=0.85))
                if k % 2 == 0:
                    m.box((0.12, 0.3, 0.3), (x - math.cos(a) * 0.32, y - math.sin(a) * 0.32, h * 0.6), TEMPLE_GLOW2,
                          rot=(0, 0, a), glow=True)
                if k == 3:
                    m.ball(0.5, (x, y, h + 0.05), TEMPLE_MOSS[0], subdiv=1, scale=(1, 1, 0.4))
        _paint(m, fs, TEMPLE_TOP[0], None, dot=0.8)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def brood_sac(variants):
    """Spore-vent scenery: the Hive's brood, swelling: a clutch on a fleshy mat, one great sac split
    and lit along its seam, sacs hung from an arching root, dripping."""
    for i in range(3):
        r = root("mirefall_brood_sac", i)
        rng = random.Random(4600 + i)
        m = Model(f"mirefall_brood_sac_{i}", 4600 + i)
        g = Model(f"mirefall_brood_sac_{i}_swell", 4610 + i)
        fs = []
        if i == 0:
            fs += lump(m, rng, (0, 0, -0.1), (2.2, 1.9, 0.35), FLESH[2], n=12, flat=0.7)
            for k, (x, y, R) in enumerate(((0, 0, 0.95), (1.2, 0.5, 0.7), (-0.9, 0.8, 0.65), (0.3, -1.1, 0.6), (-1.1, -0.6, 0.5))):
                tgt = g if k == 0 else m
                ox, oy = (0, 0) if k == 0 else (x, y)
                tgt.ball(R, (ox, oy, R * 0.75 if k else 0), SAC[k % 3], subdiv=1, scale=(1, 1, 0.85), jitter=0.04)
                tgt.ball(R * 0.4, (ox + R * 0.25, oy - R * 0.2, (R * 0.75 if k else 0) + R * 0.62), SAC_TOP, subdiv=0, scale=(1, 1, 0.5))
                for j in range(3):                                         # lit pores
                    a = rng.uniform(0, math.tau)
                    tgt.ball(0.11 * max(1, R), (ox + math.cos(a) * R * 0.6, oy + math.sin(a) * R * 0.6, (R * 0.75 if k else 0) + R * 0.5),
                             ACID, subdiv=0, glow=True)
            m.cyl(0.6, 0.04, (1.6, -1.0, 0.0), ACID, segs=7, glow=True)                       # a drip, pooled
            swell = (0, 0, 0.95 * 0.75)
        elif i == 1:
            for k in range(6):
                a = k * math.tau / 6
                tube(m, [Vector((math.cos(a) * 0.8, math.sin(a) * 0.8, 0.6)), Vector((math.cos(a) * 1.7, math.sin(a) * 1.7, 0.1)),
                         Vector((math.cos(a) * 2.4, math.sin(a) * 2.4, -0.2))], [0.3, 0.2, 0.06], FLESH[k % 3], segs=4)
            g.ball(1.5, (0, 0, 0), SAC[0], subdiv=1, scale=(1, 0.9, 1.0), jitter=0.06)
            g.box((0.26, 1.1, 0.3), (0, 0.1, 1.36), ACID, glow=True)          # the seam, splitting
            g.ball(0.6, (0.5, -0.4, 1.1), SAC_TOP, subdiv=0, scale=(1, 1, 0.5))
            for j in range(5):
                a = rng.uniform(0, math.tau)
                g.ball(0.16, (math.cos(a) * 1.3, math.sin(a) * 1.2, rng.uniform(-0.2, 0.8)), ACID, subdiv=0, glow=True)
            m.cyl(1.0, 0.04, (0.9, 1.2, 0.0), ACID, segs=8, glow=True)
            swell = (0, 0, 1.4)
        else:
            pts = [Vector((-2.2, 0, -0.2)), Vector((-1.6, 0.2, 1.8)), Vector((0, 0.1, 2.7)), Vector((1.6, -0.2, 1.8)), Vector((2.2, 0, -0.2))]
            tube(m, pts, [0.55, 0.42, 0.38, 0.42, 0.55], FLESH[0], segs=6, colors=[FLESH[0], FLESH[1], FLESH[1], FLESH[0]])
            for k, (x, z, R) in enumerate(((-0.9, 1.5, 0.55), (0.6, 1.6, 0.65), (1.4, 1.0, 0.45))):
                m.cyl(0.08, 2.4 - z, (x, 0.1, z), FLESH[2], segs=4)
                m.ball(R, (x, 0.1, z - R * 0.4), SAC[k % 3], subdiv=1, scale=(1, 1, 1.2))
                m.ball(0.14, (x, 0.1, z - R * 1.6), ACID, subdiv=0, scale=(1, 1, 1.6), glow=True)     # a drip, falling
                m.cyl(0.35, 0.04, (x, 0.1, 0.0), ACID, segs=6, glow=True)
            g.ball(0.75, (0, 0, 0), SAC[1], subdiv=1, scale=(1, 1, 0.8))
            g.ball(0.2, (0.3, -0.3, 0.45), ACID, subdiv=0, glow=True)
            swell = (-0.2, -1.4, 0.55)
        if fs:
            _paint(m, fs, FLESH_TOP, None, dot=0.85)
        m.build(r)
        obj = g.build(r, loc=swell)
        pulse(obj, f"mirefall_brood_sac_{i}_swell_idle", amp=0.08, period=2.2 + i * 0.5, axes=(1, 1, 0.8))


def crust(variants):
    """Spore-vent ground cover: fungal crust, plated like a dried bed, the light of the vents seeping
    up through the seams; one patch long, one with little chimneys starting."""
    for i in range(3):
        r = root("mirefall_crust", i)
        rng = random.Random(4620 + i)
        m = Model(f"mirefall_crust_{i}", 4620 + i)
        sx, sy = ((2.4, 2.2), (3.6, 1.6), (2.6, 2.6))[i]
        # the seep under it all
        m.cyl(1.0, 0.06, (0, 0, -0.02), "#2e7a40", segs=10)
        for v in m.bm.verts:
            v.co.x *= sx * 0.8
            v.co.y *= sy * 0.8
        m.bm.faces.ensure_lookup_table()
        idx = m._slot("#2e7a40", True)
        for f in m.bm.faces:
            f.material_index = idx
        cell = 0.95
        nx, ny = int(sx * 2 / cell) + 1, int(sy * 2 / cell) + 1
        for a in range(nx):
            for b in range(ny):
                cx = -sx + (a + 0.5) * cell + rng.uniform(-0.15, 0.15) + (b % 2) * cell * 0.5
                cy = -sy + (b + 0.5) * cell + rng.uniform(-0.15, 0.15)
                if (cx / sx) ** 2 + (cy / sy) ** 2 > 0.75 + rng.uniform(-0.1, 0.15):
                    continue
                n = rng.choice((5, 6, 6))
                rr = cell * 0.56
                pts = []
                for k in range(n):
                    t = k * math.tau / n + rng.uniform(-0.2, 0.2)
                    q = rr * rng.uniform(0.85, 1.05)
                    pts.append((cx + math.cos(t) * q, cy + math.sin(t) * q))
                h = rng.uniform(0.12, 0.3)
                top = [(cx + (px - cx) * 0.82, cy + (py - cy) * 0.82) for px, py in pts]
                col = CRUST[(a + b) % 3]
                m.slab(pts, -0.05, h, col, top=top)
                if rng.random() < 0.25:
                    m.slab(top, h, h + 0.04, CRUST_TOP)
        if i == 2:
            for k in range(3):                                               # chimneys starting
                a = k * math.tau / 3 + 0.4
                x, y = math.cos(a) * 1.1, math.sin(a) * 1.1
                h = rng.uniform(0.5, 0.9)
                m.cyl(0.32, h, (x, y, 0), CRUST[k % 3], segs=6, r_top=0.22)
                m.cyl(0.16, 0.05, (x, y, h), ACID, segs=6, glow=True)
        m.build(r, rot_z=rng.uniform(0, math.tau))



# --- the drowned temple, round 3: architecture you can name -----------------------------------

def _column(m, rng, x, y, h, R=0.55, broken=False):
    """A drum column on a square plinth, its capital (unless snapped off), slightly out of true."""
    fs = []
    fs += list(m.box((R * 2.6, R * 2.6, 0.5), (x, y, 0.0), TEMPLE[1]))
    n = max(2, int(h / 1.0))
    for k in range(n):
        z = 0.25 + k * (h - 0.6) / n
        fs += m.cyl(R, (h - 0.6) / n - 0.05, (x + rng.uniform(-0.04, 0.04), y + rng.uniform(-0.04, 0.04), z), TEMPLE[k % 3],
                    segs=8, rot=(0, 0, rng.uniform(0, 1)))
    if broken:
        for k in range(4):                                                 # the jagged break
            a = k * math.tau / 4 + rng.uniform(-0.3, 0.3)
            m.box((0.35, 0.3, rng.uniform(0.2, 0.5)), (x + math.cos(a) * R * 0.6, y + math.sin(a) * R * 0.6, h - 0.4), TEMPLE[2],
                  rot=(0, 0, a), taper=0.4)
    else:
        fs += list(m.box((R * 2.5, R * 2.5, 0.45), (x, y, h - 0.25), TEMPLE[2]))
    return list(fs)


def _bloom_on(m, rng, x, y, z, n=4, spread=0.8):
    """The Hive's bloom, taking stone back: violet sacs in a clutch and a lit pore or two."""
    for k in range(n):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0, spread)
        R = rng.uniform(0.3, 0.55)
        px, py = x + math.cos(a) * d, y + math.sin(a) * d
        m.ball(R, (px, py, z + R * 0.5), SAC[k % 3], subdiv=1, scale=(1, 1, 0.8))
        if k % 2 == 0:
            m.ball(R * 0.35, (px + R * 0.3, py, z + R * 1.0), ACID, subdiv=0, glow=True)


def colonnade(variants):
    """Temple scenery: colonnades: a row with a lintel left on two of them; a portico, roof half gone;
    an apse of columns curving round a basin of light. They stand in the shallows as well as on stone."""
    for i in range(3):
        r = root("mirefall_colonnade", i)
        rng = random.Random(4640 + i)
        m = Model(f"mirefall_colonnade_{i}", 4640 + i)
        fs = []
        if i == 0:
            hs = [4.6, 4.6, 2.2, 4.6, 1.2]
            for k, h in enumerate(hs):
                fs += _column(m, rng, -5.2 + k * 2.6, 0, h, broken=h < 4)
            fs += list(m.box((3.8, 1.3, 0.6), (-3.9, 0, 4.85), TEMPLE[0]))
            m.box((1.0, 0.1, 0.3), (-3.9, -0.66, 4.85), TEMPLE_GLOW, glow=True)
            for k in range(3):                                             # the fallen one, in drums
                fs += m.cyl(0.55, 0.9, (3.2 + k * 0.95, 1.8 + k * 0.25, 0.5), TEMPLE[k % 3], segs=8,
                            rot=(math.pi / 2, 0, 1.4 + k * 0.1))
            _bloom_on(m, rng, -0.1, 0.4, 0.2, n=4)
            m.ball(0.9, (-2.6, 0.1, 5.15), TEMPLE_MOSS[0], subdiv=1, scale=(1.4, 0.8, 0.3))
        elif i == 1:
            for a in range(3):
                for b in (-1, 1):
                    h = 4.4 if not (a == 2 and b == 1) else 2.0
                    fs += _column(m, rng, -2.8 + a * 2.8, b * 1.8, h, R=0.5, broken=h < 4)
            fs += list(m.box((6.6, 4.6, 0.5), (-1.4, 0, 4.65), TEMPLE[0]))            # the roof, what's left
            fs += list(m.box((6.8, 0.5, 0.35), (-1.4, -2.2, 4.2), TEMPLE[2]))
            for k in range(3):
                m.box((0.7, 0.1, 0.3), (-3.6 + k * 2.2, -2.47, 4.2), TEMPLE_GLOW2, glow=True)
            m.ball(1.4, (-2.0, 0.5, 5.0), TEMPLE_MOSS[1], subdiv=1, scale=(1.4, 1.0, 0.3))
            for k in range(3):                                             # roof slabs where they fell
                fs += list(m.box((2.0, 1.6, 0.4), (3.2 + rng.uniform(-0.5, 0.5), -1.5 + k * 1.5, 0.3), TEMPLE[k % 3],
                                 rot=(rng.uniform(-0.2, 0.2), rng.uniform(-0.3, 0.3), rng.uniform(0, 1))))
            _bloom_on(m, rng, 3.0, 1.6, 0.4, n=5, spread=1.0)
        else:
            m.cyl(2.0, 0.35, (0, 0, -0.15), TEMPLE[2], segs=10)
            m.cyl(1.6, 0.1, (0, 0, 0.2), TEMPLE_GLOW, segs=10, glow=True)
            for k in range(5):
                a = math.pi * (k / 4) + math.pi * 0.0
                h = (4.2, 4.6, 4.8, 3.0, 4.2)[k]
                fs += _column(m, rng, math.cos(a) * 4.0, math.sin(a) * 4.0, h, R=0.5, broken=h < 4)
            fs += list(m.box((2.8, 1.0, 0.5), (math.cos(0.4) * 4.0, math.sin(0.4) * 4.0 + 0.4, 4.5), TEMPLE[0], rot=(0, 0, 1.97)))
            _bloom_on(m, rng, 2.4, -1.2, 0.0, n=3)
        _paint(m, fs, TEMPLE_TOP[0], None, dot=0.8)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def stair_run(variants):
    """Temple scenery: a broad flight of steps up out of the swamp to nothing, balustraded, a glow at
    its head; the second broken off halfway, its blocks tumbled and the bloom in among them."""
    for i in range(2):
        r = root("mirefall_stair", i)
        rng = random.Random(4660 + i)
        m = Model(f"mirefall_stair_{i}", 4660 + i)
        fs = []
        n = 9 if i == 0 else 6
        for k in range(n):
            fs += list(m.box((4.2, 0.9, 0.35 + k * 0.38), (0, -3.6 + k * 0.85, (0.35 + k * 0.38) / 2 - 0.2),
                             TEMPLE_STEP[k % 2] if k % 3 else TEMPLE[k % 3]))
        top = -3.6 + (n - 1) * 0.85
        zt = 0.35 + (n - 1) * 0.38 - 0.2
        for sx in (-1, 1):                                                 # balustrades and their newels
            fs += list(m.box((0.55, n * 0.85, 0.5), (sx * 2.35, -3.6 + (n - 1) * 0.425, zt * 0.5 + 0.35), TEMPLE[1]))
            fs += list(m.box((0.9, 0.9, 1.6), (sx * 2.35, -4.0, 0.6), TEMPLE[2]))
            m.ball(0.3, (sx * 2.35, -4.0, 1.55), TEMPLE_GLOW2, subdiv=0, glow=True)
        if i == 0:
            fs += list(m.box((5.4, 2.4, zt + 0.4), (0, top + 1.6, zt / 2 - 0.1), TEMPLE[0]))            # the landing
            m.box((1.6, 1.6, 0.1), (0, top + 1.6, zt + 0.12), TEMPLE_GLOW, glow=True, rot=(0, 0, 0.785))
            for k in range(6):                                             # moss pouring down the steps
                m.ball(rng.uniform(0.5, 0.8), (rng.uniform(-1.6, 1.6), -3.0 + k * 1.1, 0.2 + k * 0.42), TEMPLE_MOSS[k % 2],
                       subdiv=1, scale=(1.4, 0.8, 0.3))
        else:
            for k in range(5):
                fs += list(m.box((rng.uniform(1.0, 1.8), rng.uniform(0.8, 1.2), rng.uniform(0.6, 1.0)),
                                 (rng.uniform(-2.0, 2.0), top + 1.5 + rng.uniform(0, 2.5), 0.3), TEMPLE[k % 3],
                                 rot=(rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), rng.uniform(0, 3))))
            _bloom_on(m, rng, 0.6, top + 2.4, 0.2, n=6, spread=1.4)
        _paint(m, fs, TEMPLE_TOP[0], None, dot=0.8)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def courtyard(variants):
    """Temple scenery: a sunken court: low walls with gaps for doors, a flagged floor stepped down,
    corner stumps, a pool of light in the middle that the bloom has come to drink from."""
    for i in range(2):
        r = root("mirefall_courtyard", i)
        rng = random.Random(4680 + i)
        m = Model(f"mirefall_courtyard_{i}", 4680 + i)
        fs = []
        W = 9.0 if i == 0 else 7.5
        for a in range(5):                                                 # the floor, flagged
            for b in range(5):
                x = -W / 2 + 0.9 + a * (W - 1.8) / 4
                y = -W / 2 + 0.9 + b * (W - 1.8) / 4
                fs += list(m.box(((W - 1.8) / 4 - 0.12, (W - 1.8) / 4 - 0.12, 0.25), (x, y, -0.15),
                                 TEMPLE_STEP[(a + b) % 2] if rng.random() > 0.15 else TEMPLE[2]))
        for sd in range(4):                                                # walls, a door in each
            a = sd * math.pi / 2
            ca, sa = math.cos(a), math.sin(a)
            for part in (-1, 1):
                L = W / 2 - 1.0
                cx = part * (0.9 + L / 2)
                h = rng.uniform(0.9, 1.4) if not (i == 1 and sd == 2 and part == 1) else 0.35
                px, py = ca * (W / 2) - sa * cx, sa * (W / 2) + ca * cx
                fs += list(m.box((0.7, L, h), (px, py, h / 2 - 0.1), TEMPLE[(sd + part) % 3], rot=(0, 0, a)))
            for c in (-1, 1):                                              # corner stumps
                px, py = ca * (W / 2) - sa * c * W / 2, sa * (W / 2) + ca * c * W / 2
                if sd % 2 == 0:
                    fs += list(m.box((1.1, 1.1, 2.0 if (sd + c) % 4 else 1.2), (px, py, 0.9 if (sd + c) % 4 else 0.5), TEMPLE[1]))
        m.cyl(1.8 if i == 0 else 1.4, 0.3, (0, 0, -0.1), TEMPLE[0], segs=10)
        m.cyl(1.45 if i == 0 else 1.1, 0.08, (0, 0, 0.18), TEMPLE_GLOW, segs=10, glow=True)
        _bloom_on(m, rng, 1.6, 1.4, 0.0, n=5, spread=0.9)
        for k in range(5):
            m.ball(rng.uniform(0.6, 1.0), (rng.uniform(-W / 2, W / 2), rng.uniform(-W / 2, W / 2), 0.1), TEMPLE_MOSS[k % 2],
                   subdiv=1, scale=(1.4, 1.0, 0.25))
        _paint(m, fs, TEMPLE_TOP[0], None, dot=0.8)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def idol_head(variants):
    """Temple hero: the head of a fallen idol, lying on its cheek in the swamp: brow, nose, a crown
    of fanned slabs, one eye up and still lit; the bloom swelling out of the other."""
    for i in range(2):
        r = root("mirefall_idol_head", i)
        rng = random.Random(4700 + i)
        m = Model(f"mirefall_idol_head_{i}", 4700 + i)
        fs = []
        # the head lies along x, face toward -y, tipped over so its right cheek is down
        fs += list(m.box((5.6, 4.4, 3.6), (0, 0, 1.4), TEMPLE[0], taper=0.85))
        fs += list(m.box((4.8, 0.9, 0.8), (0.2, -2.3, 2.5), TEMPLE[2]))                     # the brow
        fs += list(m.box((1.0, 1.4, 1.6), (0.6, -2.6, 1.6), TEMPLE[1], taper=0.6))           # the nose
        fs += list(m.box((2.6, 0.6, 0.5), (0.4, -2.4, 0.5), TEMPLE[1]))                      # lips
        m.box((1.2, 0.3, 0.35), (-1.2, -2.35, 2.05), TEMPLE_GLOW, glow=True)               # the lit eye
        m.box((1.2, 0.3, 0.35), (2.2, -2.35, 2.05), "#2a2230")                            # the dead one
        for k in range(7):                                                  # the crown: fanned slabs
            a = -0.9 + k * 0.3
            fs += list(m.box((1.3, 0.6, 2.4 if k % 2 else 1.8), (math.sin(a) * 3.2 - 0.2, 1.2 + math.cos(a) * 1.0, 3.2 + math.cos(a) * 0.4),
                             TEMPLE[k % 3], rot=(-0.5, a * 0.6, 0), taper=0.6))
            if k % 2 == 0:
                m.ball(0.22, (math.sin(a) * 3.2 - 0.2, 1.2 + math.cos(a) * 1.0 - 0.3, 4.3 + math.cos(a) * 0.4), TEMPLE_GLOW2, subdiv=0, glow=True)
        fs += list(m.box((3.6, 2.4, 1.2), (-0.3, 3.0, 0.3), TEMPLE[1], rot=(0, 0, 0.1)))     # the neck, broken
        m.cyl(1.0, 0.1, (-0.3, 4.25, 0.3), "#2a2230", segs=7, rot=(math.pi / 2, 0, 0))
        _bloom_on(m, rng, 2.4, -1.8, 1.6, n=6, spread=1.0)                                  # out of the dead eye
        _bloom_on(m, rng, 3.4, 1.0, 0.0, n=4, spread=1.2)
        for k in range(4):
            m.ball(rng.uniform(0.8, 1.2), (rng.uniform(-2.2, 1.6), rng.uniform(-1.4, 1.4), 3.25), TEMPLE_MOSS[k % 2], subdiv=1,
                   scale=(1.4, 1.0, 0.25))
        _hang(m, rng, Vector((-2.6, -2.1, 3.0)), 2.2, TEMPLE_MOSS[1], width=0.35)
        if i == 1:                                                          # a hand beside it, palm up, holding a light
            fs += list(m.box((2.6, 2.0, 0.8), (-5.4, -2.0, 0.2), TEMPLE[2], rot=(0, 0, 0.3)))
            for k in range(4):
                fs += list(m.box((0.5, 1.4, 0.55), (-6.4 + k * 0.6, -3.4, 0.45), TEMPLE[k % 3], rot=(0.3, 0, 0.3)))
            m.ball(0.5, (-5.4, -2.0, 0.9), TEMPLE_GLOW, subdiv=1, glow=True)
        _paint(m, fs, TEMPLE_TOP[0], None, dot=0.8)
        m.build(r, rot_z=rng.uniform(0, math.tau))


# --- the spore vents, round 3: a vent you can see from orbit -----------------------------------

def great_vent(variants):
    """Spore-vent hero: a great crusted chimney, its stepped crust like shelf fungus, side stacks, and
    a plume of lit spores standing over it; the second a twin stack leaning apart."""
    for i in range(2):
        r = root("mirefall_great_vent", i)
        rng = random.Random(4720 + i)
        m = Model(f"mirefall_great_vent_{i}", 4720 + i)
        fs = []
        stacks = [(0, 0, 5.4, 2.4, (0.5, 0.15))] if i == 0 else [(-1.6, 0, 5.0, 1.9, (-0.7, 0.2)), (1.8, 0.4, 4.2, 1.7, (0.8, -0.2))]
        mouths = []
        for k, (x, y, h, R, lean) in enumerate(stacks):
            pts = bend((x, y, -0.3), (x, y, h), lean, n=4)
            fs += tube(m, pts, [R * 1.25, R * 0.9, R * 0.68, R * 0.58, R * 0.55], VENT[k], segs=9,
                       colors=[VENT[0], VENT[1], VENT[2], VENT[1]])
            for j in range(5):                                             # crust shelves stepping up it
                p = pts[1 + j % 3]
                a = j * 1.3 + k
                fs += lump(m, rng, (p.x + math.cos(a) * R * 0.75, p.y + math.sin(a) * R * 0.75, p.z + (j // 3) * 0.5),
                           (R * 0.6, R * 0.5, 0.4), VENT[j % 3], n=9, flat=0.4)
            t = pts[-1]
            m.cyl(R * 0.62, 0.4, (t.x, t.y, t.z - 0.1), VENT_TOP, segs=9, r_top=R * 0.7)       # the lip
            m.cyl(R * 0.42, 0.1, (t.x, t.y, t.z + 0.28), "#1a0e1e", segs=9)
            mouths.append(Vector((t.x, t.y, t.z + 0.35)))
        for k in range(9):                                                 # the mound it stands in
            a = k * math.tau / 9 + rng.uniform(-0.2, 0.2)
            fs += lump(m, rng, (math.cos(a) * 3.4, math.sin(a) * 3.0, 0.1), (1.3, 1.0, 0.7), VENT[k % 3], n=9, flat=0.5)
        for k in range(3):                                                 # little side stacks, lit
            a = k * 2.1 + 0.6
            x, y = math.cos(a) * 3.2, math.sin(a) * 2.8
            h = rng.uniform(1.4, 2.2)
            tube(m, [Vector((x, y, -0.2)), Vector((x, y, h))], [0.7, 0.45], VENT[(k + 1) % 3], segs=6)
            m.cyl(0.5, 0.2, (x, y, h - 0.05), VENT_TOP, segs=6)
            m.cyl(0.28, 0.06, (x, y, h + 0.15), PORE, segs=6, glow=True)
        _paint(m, fs, VENT_TOP, None, dot=0.8)
        m.build(r)
        for k, mo in enumerate(mouths):                                    # the plume, paling as it rises
            g = Model(f"mirefall_great_vent_{i}_plume{k}", 4730 + i * 2 + k)
            for j, (dz, R, col) in enumerate(((0.1, 0.8, "#5ac860"), (0.9, 1.1, PORE), (1.8, 0.95, "#a8ff90"), (2.5, 0.55, PORE))):
                if mo.z + dz + R * 0.7 > 7.9:
                    continue
                g.ball(R, (0.15 * j, 0.08 * j, dz), col, subdiv=1, scale=(1, 1, 0.7), jitter=0.06, glow=True)
            obj = g.build(r, loc=tuple(mo))
            pulse(obj, f"mirefall_great_vent_{i}_{k}_breathe_idle", amp=0.1, period=2.8 + k * 0.5 + i * 0.3)



def vent_mound(variants):
    """Spore-vent landmark (blown up ~3x by the runtime): a squat crusted cone, terraced, a wide lit
    throat and a low plume; built small so it scales to a hill of a vent."""
    r = root("mirefall_vent_mound", 0)
    rng = random.Random(4740)
    m = Model("mirefall_vent_mound_0", 4740)
    fs = []
    for ring, (d, z, sz) in enumerate(((3.6, 0.2, 1.1), (2.5, 0.8, 0.9), (1.6, 1.4, 0.7))):
        n = 11 - ring * 2
        for k in range(n):
            a = k * math.tau / n + rng.uniform(-0.15, 0.15) + ring * 0.3
            fs += lump(m, rng, (math.cos(a) * d, math.sin(a) * d, z), (sz * 1.2, sz, sz * 0.8), VENT[(k + ring) % 3], n=9, flat=0.4)
    fs += tube(m, [Vector((0, 0, 0)), Vector((0, 0, 2.0))], [1.6, 1.2], VENT[1], segs=9)
    m.cyl(1.25, 0.3, (0, 0, 1.9), VENT_TOP, segs=9, r_top=1.35)
    m.cyl(0.9, 0.08, (0, 0, 2.18), "#1a0e1e", segs=9)
    for k in range(4):                                                     # little side mouths on the terraces
        a = k * math.tau / 4 + 0.5
        x, y = math.cos(a) * 2.6, math.sin(a) * 2.6
        m.cyl(0.35, 0.5, (x, y, 1.1), VENT_TOP, segs=6, r_top=0.3)
        m.cyl(0.2, 0.05, (x, y, 1.6), PORE, segs=6, glow=True)
    _paint(m, fs, VENT_TOP, None, dot=0.8)
    m.build(r)
    g = Model("mirefall_vent_mound_0_plume", 4741)
    for j, (dz, R, col) in enumerate(((0.0, 0.75, "#5ac860"), (0.55, 0.85, PORE), (1.0, 0.55, "#a8ff90"))):
        g.ball(R, (0.1 * j, 0.05 * j, dz), col, subdiv=1, scale=(1, 1, 0.6), jitter=0.04, glow=True)
    obj = g.build(r, loc=(0, 0, 2.25))
    pulse(obj, "mirefall_vent_mound_0_breathe_idle", amp=0.08, period=3.4)

def build():
    cap_gate(2)
    fallen_stalk(2)
    puffball(3)
    inkcap(3)
    drowned_roots(2)
    bog_beast(2)
    bog_lantern(3)
    hummock(3)
    causeway(2)
    ziggurat_ruin(2)
    pillar_gate(2)
    idol(2)
    rubble(3)
    spore_chimney(2)
    fungal_arch(2)
    vent_crater(1)
    spore_tube(3)
    moss_bed(3)
    lattice(3)
    drowned_trunk(4)
    pitcher(3)
    stele(3)
    brood_sac(3)
    crust(3)
    colonnade(3)
    stair_run(2)
    courtyard(2)
    idol_head(2)
    great_vent(2)
    vent_mound(1)
