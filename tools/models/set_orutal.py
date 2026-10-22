"""ORU-TAL's set pieces and the scenery that goes with them: colossal fallen tree ferns
and the bones of the giants that ate them, arches and gates of black hex columns over lava, crystal
grown right across the canyon, sea arches and spiral shells in the jade sea."""
from __future__ import annotations

import math
import random

from mathutils import Vector

from kit import Model
from props_a_lib import (arc, bend, collider, crystal, frond, hull, lump, recolor, ribbon, root, splinter, sway,
                         pulse, tube)
from props_a_orutal import (BASALT, BASALT_TOP, CRUST, CRUST_TOP, CRYSTAL_ROCK, CRYSTAL_ROCK_TOP, CYAN, FERN_BARK,
                            FERN_STUB, FIDDLE, FROND, FROND_OLD, GUANO, LAVA, LAVA_DEEP, LAVA_HOT, LILAC, MAGENTA,
                            MOSS, OBSIDIAN, OBSIDIAN_GLINT, STACK, STACK_TOP, STACK_TOP2, fern_crown, hex_cells,
                            BRONZE, EMERALD, LIME, crozier,
                            strata, two_tone, hexcol, stack_pillar, jungle_cap)

MOSS_LIT = "#8cbc44"
MOSS_DARK = "#4a6a30"
EARTH = ["#5a4030", "#6a4c34", "#4a3426"]
ROOT = ["#3e2a1e", "#4e3424", "#5e4230"]
BONE = ["#e8dcc0", "#d8caa8", "#c8b894"]
BONE_DARK = "#8a7a5a"
SOCKET = "#2a2018"
HORSETAIL = [("#7a9a3a", "#5a7a2a"), ("#8aa848", "#6a8a34")]
HORSE_RING = "#3a3020"
FUNGUS = ["#e8922a", "#d8b04a", "#c8602a"]


def squash(m, k):
    """Press a model down to k of its height (giants keep low, so they're never shrunk to fit)."""
    for v in m.bm.verts:
        v.co.z *= k


def faces_up(m, faces, top, side=None, under=None, dot=0.55):
    """Colour faces by which way they face: up (top), down (under), the rest (side, or left be)."""
    for f in faces:
        f.normal_update()
    recolor(m, faces, lambda f: top if f.normal.z > dot else (under if under and f.normal.z < -0.45 else side))


# --- fernwood ---------------------------------------------------------------------------------

def _trunk(m, rng, pts, r0, r1, stubs=40, moss=True):
    """A fallen tree-fern trunk along `pts`: banded bark, old frond bases knobbly over its back,
    moss along the top."""
    n = len(pts)
    radii = [r0 + (r1 - r0) * k / (n - 1) for k in range(n)]
    tube(m, pts, radii, FERN_BARK[0], segs=7, twist=0.2, colors=[FERN_BARK[k % 3] for k in range(n - 1)])
    for k in range(stubs):
        t = rng.uniform(0.02, 0.98)
        i = min(int(t * (n - 1)), n - 2)
        u = t * (n - 1) - i
        p = pts[i].lerp(pts[i + 1], u)
        rad = radii[i] + (radii[i + 1] - radii[i]) * u
        a = rng.uniform(-0.6, math.pi + 0.6)                               # over its back and sides, not under
        d = Vector((0, math.cos(a), math.sin(a)))
        sz = rad * 0.42
        m.box((sz, sz, sz * 1.5), tuple(p + d * (rad + sz * 0.3)), FERN_STUB if k % 3 else FERN_BARK[2],
              rot=(a - math.pi / 2, 0, rng.uniform(-0.4, 0.4)), taper=0.35)
    if moss:                                                               # cushions of moss, here and there
        for k in range(int(n * 1.6)):
            t = rng.uniform(0.05, 0.95)
            i = min(int(t * (n - 1)), n - 2)
            p = pts[i].lerp(pts[i + 1], t * (n - 1) - i)
            rad = radii[i]
            a = rng.uniform(0.9, 2.2)
            c = p + Vector((0, math.cos(a) * rad * 0.8, math.sin(a) * rad * 0.8))
            m.ball(rad * rng.uniform(0.45, 0.7), tuple(c), (MOSS_LIT, MOSS, MOSS_DARK)[k % 3], subdiv=1,
                   scale=(rng.uniform(1.4, 2.4), 1.0, 0.45), jitter=rad * 0.06)


def _root_plate(m, rng, x, y, z, R, face=-1):
    """The torn-up root ball of a fallen giant: a ragged disc of earth stood on edge, roots
    sticking out all round, a mound under it."""
    pts = []
    for k in range(16):
        a = k * math.tau / 16 + rng.uniform(-0.15, 0.15)
        d = R * rng.uniform(0.8, 1.05)
        for s in (-1, 1):
            pts.append((x + s * rng.uniform(1.0, 1.8), y + math.cos(a) * d, z + math.sin(a) * d))
    fs = hull(m, pts, EARTH[0])
    faces_up(m, fs, EARTH[1], EARTH[0], EARTH[2], dot=0.7)
    for k in range(22):                                                    # roots, out past the rim
        a = k * math.tau / 14 + rng.uniform(-0.2, 0.2)
        L = R * rng.uniform(1.15, 1.55)
        p0 = Vector((x + face * 0.8, y + math.cos(a) * R * 0.3, z + math.sin(a) * R * 0.3))
        p2 = Vector((x + face * rng.uniform(1.5, 3.5), y + math.cos(a) * L, z + math.sin(a) * L))
        p1 = p0.lerp(p2, 0.55) + Vector((face * 1.2, 0, 0))
        if p2.z < -2:
            p2.z = -2
        tube(m, [p0, p1, p2], [0.8 if k % 2 else 0.5, 0.4, 0.08], ROOT[k % 3], segs=5)
    for k in range(5):                                                     # rootlets dangling off the bottom
        a = rng.uniform(-2.4, -0.7)
        p0 = Vector((x + face * 1.5, y + math.cos(a) * R * 0.8, z + math.sin(a) * R * 0.8))
        tube(m, [p0, p0 + Vector((face * 0.6, rng.uniform(-0.8, 0.8), -2.5))], [0.22, 0.04], ROOT[2], segs=4)
    # the mound it tore out of, and the hole
    for k in range(5):
        lump(m, rng, (x - face * rng.uniform(0, 4), y + rng.uniform(-R * 0.7, R * 0.7), z - R - 0.5),
             (3.0, 2.6, 2.4), EARTH[k % 3], n=12, flat=0.4)


def _crown_down(m, rng, base, n, L, w):
    """A fallen tree fern's crown: fronds splayed flat on the ground, some still green."""
    bx, by, bz = base
    for k in range(n):
        yaw = k * math.tau / n + rng.uniform(-0.2, 0.2)
        old = k % 3 == 0
        c1, c2 = FROND_OLD if old else FROND[k % 3]
        frond(m, (bx, by, bz), yaw, L * rng.uniform(0.85, 1.1), w, c1, c2, rise=rng.uniform(0.0, 0.25),
              droop=rng.uniform(0.9, 1.5), n=8)


def fern_log(variants):
    """Span: a colossal tree fern, fallen right across the jungle. v0 lies whole from its torn-up
    roots to its crown; v1 snapped and fell across a stump in the middle (slip past either side)."""
    for i in range(2):
        r = root("orutal_fern_log", i)
        rng = random.Random(1000 + i)
        m = Model(f"orutal_fern_log_{i}", 1000 + i)
        if i == 0:
            xs = list(range(-44, 48, 6))
            pts = [Vector((x, 1.6 * math.sin(x * 0.05 + 0.5), 16.8 + 0.6 * math.sin(x * 0.08) - 0.012 * x))
                   for x in xs]
            _trunk(m, rng, pts, 3.1, 2.3, stubs=50)
            _root_plate(m, rng, -46.5, pts[0].y, 12.5, 6.8, face=-1)
            collider(r, -45, pts[0].y, 4.5)
            tip = pts[-1]
            _crown_down(m, rng, (tip.x + 1.5, tip.y, tip.z), 13, 10.5, 1.9)
            for k in range(6):                                             # boulders it came down on
                lump(m, rng, (43 + rng.uniform(-2, 3), rng.uniform(-3, 3), 4 + k * 1.6), (3.2, 3.0, 3.4),
                     ["#7a7068", "#6e655e", "#857a70"][k % 3], n=12, flat=0.3)
            collider(r, 44, 0, 4.0)
            lean = [(-20, 1), (6, -1), (28, 1)]
        else:
            left = [Vector((x, -1.8 + 0.02 * x, 15.4 + (x + 44) * 0.03)) for x in range(-44, 12, 7)]
            right = [Vector((x, 2.0 + 0.03 * x, 17.6 - (x + 6) * 0.034)) for x in range(-6, 50, 7)]
            _trunk(m, rng, left, 2.4, 2.1, stubs=26)
            _trunk(m, rng, right, 2.3, 1.8, stubs=26)
            for p, d in ((left[-1], 1), (right[0], -1)):                    # splintered ends
                for k in range(7):
                    a = k * math.tau / 7
                    b = p + Vector((0, math.cos(a) * 1.5, math.sin(a) * 1.5))
                    splinter(m, rng, tuple(b), 0.5, rng.uniform(1.2, 2.6), (d * 2.2, 0), FERN_STUB, sides=4)
            _root_plate(m, rng, -46.5, left[0].y, 13.0, 6.5, face=-1)
            collider(r, -45, left[0].y, 4.5)
            # the stump it broke over: the old trunk's base, jagged at the top, moss on its shoulders
            sx = 2.0
            fs = tube(m, [Vector((sx, 0, -3)), Vector((sx + 0.3, 0.2, 6)), Vector((sx + 0.4, 0.2, 13.2))],
                      [3.4, 2.7, 2.5], FERN_BARK[0], segs=8, colors=FERN_BARK)
            for k in range(8):
                a = k * math.tau / 8
                splinter(m, rng, (sx + 0.4 + math.cos(a) * 2.0, 0.2 + math.sin(a) * 2.0, 12.6), 0.7,
                         rng.uniform(0.8, 2.2), (math.cos(a) * 0.4, math.sin(a) * 0.4), FERN_STUB, sides=4)
            for k in range(5):                                             # buttress roots
                a = k * math.tau / 5 + 0.3
                tube(m, [Vector((sx, 0, 3)), Vector((sx + math.cos(a) * 3.6, math.sin(a) * 3.6, 0)),
                         Vector((sx + math.cos(a) * 5.2, math.sin(a) * 5.2, -1.5))], [1.0, 0.7, 0.2], ROOT[k % 3], segs=5)
            collider(r, sx + 0.3, 0.1, 3.2)
            tip = right[-1]
            _crown_down(m, rng, (tip.x + 1.0, tip.y, tip.z), 12, 10.0, 1.8)
            for k in range(5):
                lump(m, rng, (44 + rng.uniform(-2, 3), 2 + rng.uniform(-3, 3), 3.5 + k * 1.7), (3.2, 3.0, 3.2),
                     ["#7a7068", "#6e655e", "#857a70"][k % 3], n=12, flat=0.3)
            collider(r, 45, 2, 4.0)
            pts = left + right
            lean = [(-24, 1), (-10, -1), (20, 1), (32, -1)]
        # ferns and fiddleheads sprouting along its back
        for x, s in lean:
            p = min(pts, key=lambda q: abs(q.x - x))
            fern_crown(m, rng, (p.x, p.y + s * 0.6, p.z + 2.3), 7, 2.4, 0.45, old=0, fiddle=True)
        # lianas off the ends, down to the jungle (out past the field)
        for x in (-38, -40, 38, 40):
            p = min(pts, key=lambda q: abs(q.x - x))
            for s in (-1, 1):
                q = p + Vector((rng.uniform(-1, 1), s * 2.0, -1.5))
                tube(m, [q, q + Vector((rng.uniform(-1, 1), s * 0.8, -6)), q + Vector((rng.uniform(-1, 1), s * 0.4, -13.5))],
                     [0.18, 0.15, 0.12], MOSS_DARK, segs=4)
        m.build(r)


def _bone(m, a, b, r, color=None, knob=1.7):
    """A long bone with knobbly ends."""
    a, b = Vector(a), Vector(b)
    tube(m, [a, a.lerp(b, 0.15), a.lerp(b, 0.85), b], [r * knob, r, r, r * knob], color or BONE[0], segs=6)
    m.ball(r * knob * 1.1, tuple(a), BONE[1], subdiv=0)
    m.ball(r * knob * 1.1, tuple(b), BONE[1], subdiv=0)


def _spine(m, rng, pts, sizes, spines=True, moss=0.2):
    """Vertebrae along `pts` (centres), each `sizes[i]` across, with a dorsal spine up off each."""
    for i, (p, s) in enumerate(zip(pts, sizes)):
        q = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
        yaw = math.atan2(q.y, q.x)
        fs = m.box((s * 0.8, s, s * 0.8), tuple(p), BONE[i % 2], rot=(0, 0, yaw))
        if spines and s > 0.6:
            fs |= m.box((s * 0.35, s * 0.25, s * 0.8), (p.x, p.y, p.z + s * 0.6), BONE[2], rot=(0, rng.uniform(-0.2, 0.2), yaw),
                        taper=0.4)
            for sd in (-1, 1):                                             # side processes
                fs |= m.box((s * 0.25, s * 0.9, s * 0.22), (p.x - math.sin(yaw) * sd * s * 0.7,
                                                             p.y + math.cos(yaw) * sd * s * 0.7, p.z), BONE[1],
                            rot=(sd * 0.3, 0, yaw))
        if rng.random() < moss:
            faces_up(m, list(fs), MOSS, None, dot=0.8)


def _ribs(m, rng, spine, side_pts, ys, height, broken=0.25, r=0.42, lift=1.0):
    """Ribs arching off the spine on both sides, down into the ground."""
    for k, p in enumerate(side_pts):
        for s in (-1, 1):
            if rng.random() < broken * 0.5:
                continue
            w = ys[k]
            top = Vector((p.x, p.y, p.z))
            pts = [top]
            n = 6
            cut = n if rng.random() > broken else rng.randint(3, 5)
            for j in range(1, cut + 1):
                t = j / n
                a = t * math.pi * 0.62
                pts.append(Vector((p.x + rng.uniform(-0.1, 0.1) + t * 0.8, p.y + s * math.sin(a) * w,
                                   p.z + (height * lift) * (math.cos(a) - 1) * 1.05 + 0.6 * math.sin(a * 1.6))))
            rr = [r * (1 - 0.35 * j / n) for j in range(len(pts))]
            tube(m, pts, rr, BONE[(k + (s > 0)) % 3], segs=5)


def _skull(m, rng, p, yaw, size=1.0):
    c, s = math.cos(yaw), math.sin(yaw)

    def at(x, y, z):
        return (p.x + (x * c - y * s) * size, p.y + (x * s + y * c) * size, p.z + z * size)
    pts = [at(x, y, z) for x, y, z in ((-1.6, -1.2, 0), (-1.6, 1.2, 0), (-1.4, 0, 2.0), (-1.8, -1, 1.4), (-1.8, 1, 1.4),
                                       (1.0, -0.9, 0.0), (1.0, 0.9, 0.0), (1.2, 0, 1.4), (2.6, -0.6, 0.2), (2.6, 0.6, 0.2),
                                       (2.8, 0, 0.9))]
    fs = hull(m, pts, BONE[0])
    faces_up(m, fs, BONE[0], BONE[1], BONE_DARK)
    for sd in (-1, 1):                                                     # eye sockets, nostril, teeth
        m.box((0.9 * size, 0.6 * size, 0.6 * size), at(-0.4, sd * 0.85, 1.2), SOCKET, rot=(0, 0, yaw))
        m.box((0.5 * size, 0.35 * size, 0.35 * size), at(1.6, sd * 0.45, 1.0), SOCKET, rot=(0, 0, yaw))
        for k in range(4):
            m.box((0.25 * size, 0.2 * size, 0.5 * size), at(0.6 + k * 0.6, sd * 0.75, -0.1), BONE[2], rot=(0, 0, yaw))
    # the lower jaw, fallen open
    m.box((3.4 * size, 0.4 * size, 0.4 * size), at(0.9, -1.6, -0.2), BONE[1], rot=(0, 0, yaw - 0.25))
    m.box((3.4 * size, 0.4 * size, 0.4 * size), at(0.9, 1.6, -0.2), BONE[1], rot=(0, 0, yaw + 0.25))


def sauropod_bones(variants):
    """Giant: the skeleton of one of the long-necked grazers, picked clean where it fell, the
    jungle growing up through its ribs. v0 lies stretched out; v1 curled round on itself."""
    for i in range(2):
        r = root("orutal_sauropod_bones", i)
        rng = random.Random(1100 + i)
        m = Model(f"orutal_sauropod_bones_{i}", 1100 + i)
        if i == 0:
            # tail tip .. hips .. shoulders .. neck .. head, in plan, with heights
            ctrl = [(-30, 6, 0.6), (-24, 3.5, 1.6), (-16, 0.5, 3.4), (-8, 0, 5.0), (0, 0, 5.4), (8, -0.5, 5.1),
                    (14, -2, 4.6), (19, -5, 3.4), (23, -9, 2.4), (25, -14, 1.8)]
        else:
            ctrl = [(14, 12, 0.6), (8, 13, 1.6), (0, 12, 3.2), (-7, 7, 4.9), (-8, 0, 5.3), (-4, -6, 5.1),
                    (3, -9, 4.6), (10, -9, 3.4), (15, -5, 2.4), (16, 1, 1.8)]
        # a smooth spine through them
        pts = []
        for a, b in zip(ctrl, ctrl[1:]):
            for k in range(3):
                t = k / 3
                pts.append(Vector(a).lerp(Vector(b), t))
        pts.append(Vector(ctrl[-1]))
        sizes = [0.7 + 2.2 * math.sin(math.pi * min(1, (k / len(pts)) * 1.15)) ** 0.7 for k in range(len(pts))]
        sizes = [max(0.5, s) for s in sizes]
        _spine(m, rng, pts, sizes, moss=0.25)
        # ribs: along the body, between hips and shoulders
        body = [p for p in pts if p.z > 4.3]
        ribs = [a.lerp(b, t) for a, b in zip(body, body[1:]) for t in (0.0, 0.5)][1:]
        depth = [7.0 + 2.0 * math.sin(math.pi * k / max(len(ribs) - 1, 1)) for k in range(len(ribs))]
        _ribs(m, rng, pts, ribs, depth, 5.6, broken=0.3 if i == 0 else 0.45, r=0.75)
        # pelvis and shoulder blades: broad plates
        hip, sh = body[0], body[-1]
        for p, w in ((hip, 3.4), (sh, 2.8)):
            for s in (-1, 1):
                pl = [(p.x + dx, p.y + s * (1.2 + dy), p.z + dz) for dx, dy, dz in
                      ((-w * 0.6, 0, 0.4), (w * 0.6, 0, 0.4), (0, w * 0.9, -1.6), (-w * 0.4, w * 0.6, -2.6),
                       (w * 0.5, w * 0.6, -2.4), (0, 0.3, 1.0))]
                fs = hull(m, pl, BONE[1])
                faces_up(m, fs, BONE[0], BONE[2], BONE_DARK)
        # the legs, splayed out flat where they fell
        for p, sgn in ((hip, 1), (sh, -1)):
            for s in (-1, 1):
                a = Vector((p.x, p.y + s * 3.0, 1.0))
                b = a + Vector((sgn * rng.uniform(1, 3), s * 5.5, -0.4))
                c = b + Vector((sgn * rng.uniform(-2, 2), s * 4.0, -0.2))
                _bone(m, a, b, 0.55)
                _bone(m, b, c, 0.45)
                for k in range(4):                                         # toes
                    t = c + Vector((math.cos(k * 0.5 - 0.7 + s) * 1.3, s * math.sin(k * 0.5 + 0.4) * 1.3, 0))
                    m.box((1.0, 0.35, 0.3), tuple((c + t) / 2), BONE[2], rot=(0, 0, k * 0.5 - 0.7 + s))
        head = pts[-1]
        q = pts[-1] - pts[-3]
        _skull(m, rng, head + q.normalized() * 2.2, math.atan2(q.y, q.x), size=1.3)
        # jungle growing up through it: ferns between the ribs, moss in the hollows
        for k in range(5 + i):
            p = rng.choice(body)
            fern_crown(m, rng, (p.x + rng.uniform(-2, 2), p.y + rng.choice((-1, 1)) * rng.uniform(1.5, 3.5), 0.4), 8, 2.6,
                       0.55, old=1, fiddle=False)
        for k in range(10):
            p = rng.choice(pts)
            lump(m, rng, (p.x + rng.uniform(-6, 6), p.y + rng.uniform(-6, 6), -0.1), (rng.uniform(1.5, 3), rng.uniform(1.2, 2.4), 0.5),
                 [MOSS, MOSS_DARK, "#6a7a3a"][k % 3], n=9, flat=0.6)
        if i == 1:                                                         # a tree fern grown out of its chest
            p = body[len(body) // 2]
            tp = bend((p.x, p.y, 0), (p.x + 0.4, p.y + 0.3, 6.4), (0.5, 0.3), n=5)
            tube(m, tp, [0.6, 0.5, 0.45, 0.42, 0.4, 0.42], FERN_BARK[0], segs=6, colors=FERN_BARK)
            fern_crown(m, rng, tuple(tp[-1]), 11, 3.4, 0.6, old=2)
        squash(m, 0.78)
        m.build(r)


HEART = [("#6a2e1a", "#a4482a", "#d47436"), ("#5a3a1e", "#8a5a2a", "#c08a3a")]   # rust and ochre: growth that never unrolled


def _old_heart(m, rng, s, k):
    """What grows out of an old fern's heart instead of new fronds: fiddleheads the size of a house,
    tipped over and rolled up for good, buds lit at their centres."""
    turn = rng.uniform(0, math.tau)
    for j in range(3):
        crozier(m, rng, (0, 0, -0.1 * s), turn + j * math.tau / 3, s * 0.9, s * 0.62, HEART[(k + j) % 2], thick=s * 0.55)


def titan_ferns(variants):
    """Gate: tree ferns of the old forest, grown far taller than you fly, their crowns meeting
    overhead. Slip between the trunks, under the canopy."""
    shapes = [
        [(-18, 0.5, 24, 1.9), (-6, -1.0, 19, 1.6), (6, 0.8, 22, 1.8), (18, -0.5, 17, 1.5)],
        [(-14, -0.5, 21, 2.0), (-2, 1.0, 26, 2.2), (11, -0.8, 18, 1.7)],
    ]
    for i, trunks in enumerate(shapes):
        r = root("orutal_titan_ferns", i)
        rng = random.Random(1200 + i)
        m = Model(f"orutal_titan_ferns_{i}", 1200 + i)
        crowns = []
        for k, (x, y, h, rad) in enumerate(trunks):
            lean = (rng.uniform(-0.8, 0.8), rng.uniform(-0.8, 0.8))
            pts = bend((x, y, -3), (x, y, h), lean, n=8)
            radii = [rad * 1.5, rad * 1.15] + [rad * (1 - 0.12 * j / 6) for j in range(7)]
            tube(m, pts, radii, FERN_BARK[0], segs=7, twist=0.25, colors=[FERN_BARK[j % 3] for j in range(8)])
            for j in range(22):                                            # frond bases all the way up
                t = rng.uniform(0.15, 0.95)
                p = Vector(pts[int(t * 8)])
                a = rng.uniform(0, math.tau)
                m.box((0.6, 0.6, 1.0), (p.x + math.cos(a) * rad, p.y + math.sin(a) * rad, p.z), FERN_STUB,
                      rot=(math.sin(a) * 0.9, -math.cos(a) * 0.9, 0), taper=0.35)
            for j in range(4):                                             # buttress roots
                a = j * math.tau / 4 + rng.uniform(-0.3, 0.3)
                tube(m, [Vector((x, y, 2.5)), Vector((x + math.cos(a) * rad * 1.8, y + math.sin(a) * rad * 1.8, 0)),
                         Vector((x + math.cos(a) * rad * 2.6, y + math.sin(a) * rad * 2.6, -1.5))], [rad * 0.6, rad * 0.4, 0.15],
                     ROOT[j % 3], segs=5)
            # a vine wound up it, moss on the windward side
            vine = [Vector(pts[j]) + Vector((math.cos(j * 1.3) * rad * 1.05, math.sin(j * 1.3) * rad * 1.05, 0)) for j in range(9)]
            tube(m, vine, [0.2] * 9, MOSS_DARK, segs=4)
            top = Vector(pts[-1])
            collider(r, x + lean[0] * 0.25, y + lean[1] * 0.25, rad * 1.05)
            crowns.append((top, h))
        m.build(r)
        for k, (top, h) in enumerate(crowns):
            c = Model(f"orutal_titan_ferns_{i}_crown{k}", 1210 + i * 10 + k)
            fern_crown(c, rng, (0, 0, 0), 12, 9.0, 1.5, palette=(EMERALD, LIME, BRONZE)[k % 3], old=3, fiddle=False)
            _old_heart(c, rng, 3.4, k)
            obj = c.build(r, loc=tuple(top))
            sway(obj, f"orutal_titan_ferns_{i}_crown{k}_sway_idle", amp=(0.025, 0.02), period=4.5 + k * 0.6, phase=k)


def horsetail(variants):
    """Clumps of giant horsetail: jointed green stalks with dark collars, whorls of needles."""
    shapes = [(7, 5.0, 1.4), (5, 6.6, 1.0), (11, 3.6, 1.8)]
    for i, (n, H, spread) in enumerate(shapes):
        r = root("orutal_horsetail", i, height=H)
        rng = random.Random(1400 + i)
        m = Model(f"orutal_horsetail_{i}", 1400 + i)
        for k in range(n):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0, spread)
            x, y = math.cos(a) * d, math.sin(a) * d
            h = H * rng.uniform(0.6, 1.0)
            lean = (math.cos(a) * rng.uniform(0.2, 0.8), math.sin(a) * rng.uniform(0.2, 0.8))
            pts = bend((x, y, 0), (x, y, h), lean, n=5)
            c1, c2 = HORSETAIL[k % 2]
            tube(m, pts, [0.22, 0.2, 0.19, 0.17, 0.15, 0.08], c1, segs=6, colors=[c1, c2])
            for j in range(1, 5):                                          # collars and whorls of needles
                p = Vector(pts[j])
                m.cyl(0.26, 0.14, (p.x, p.y, p.z - 0.07), HORSE_RING, segs=6)
                for w in range(6):
                    b = w * math.tau / 6 + j
                    L = 0.9 - j * 0.12
                    m.plank_line(tuple(p), (p.x + math.cos(b) * L, p.y + math.sin(b) * L, p.z - 0.25), 0.12, 0.1, c2)
            tp = Vector(pts[-1])                                           # the cone at the tip
            m.cyl(0.2, 0.55, (tp.x, tp.y, tp.z), "#a88a3a", segs=6, r_top=0.05)
        m.build(r)


def fern_grove(variants):
    """Hero scenery: an old tree fern towering over a younger one, cycads at their feet."""
    for i in range(2):
        r = root("orutal_fern_grove", i, height=7.6)
        rng = random.Random(1500 + i)
        m = Model(f"orutal_fern_grove_{i}_trunks", 1500 + i)
        trees = [(0, 0, 6.6, (0.6, 0.3), 3.6), (2.6, 1.4, 4.2, (0.9, 0.5), 2.8)] if i == 0 else \
            [(0, 0, 6.2, (-0.5, 0.4), 3.4), (-2.4, -1.5, 3.4, (-0.8, -0.5), 2.4), (2.2, -1.2, 4.8, (0.7, -0.4), 3.0)]
        tops = []
        for k, (x, y, h, lean, L) in enumerate(trees):
            pts = bend((x, y, 0), (x, y, h), lean, n=6)
            tube(m, pts, [0.6, 0.42, 0.38, 0.36, 0.35, 0.36, 0.4], FERN_BARK[0], segs=6, twist=0.3,
                 colors=[FERN_BARK[j % 3] for j in range(6)])
            for j in range(4):
                a = j * math.tau / 4 + rng.uniform(-0.3, 0.3)
                m.plank_line((x, y, 0.7), (x + math.cos(a) * 1.0, y + math.sin(a) * 1.0, -0.05), 0.2, 0.2, FERN_BARK[2])
            tops.append((pts[-1], L))
        for k in range(3):                                                 # cycads and young ferns at their feet
            a = k * math.tau / 3 + 0.5
            fern_crown(m, rng, (math.cos(a) * 2.2, math.sin(a) * 2.2, 0.3), 8, 1.8, 0.4, old=0, fiddle=False)
        m.build(r)
        for k, (tp, L) in enumerate(tops):
            c = Model(f"orutal_fern_grove_{i}_crown{k}", 1510 + i * 4 + k)
            fern_crown(c, rng, (0, 0, 0), 12, L, 0.6, palette=(EMERALD, LIME)[k % 2], old=2, fiddle=k > 0)
            if k == 0:
                _old_heart(c, rng, L * 0.4, k)
            obj = c.build(r, loc=tuple(tp))
            sway(obj, f"orutal_fern_grove_{i}_crown{k}_sway_idle", amp=(0.045, 0.04), period=3.4 + k * 0.5, phase=k)


def mossy_log(variants):
    """A fallen fern trunk on the jungle floor, shelf fungus on its side, a fern on its back."""
    for i in range(2):
        r = root("orutal_mossy_log", i, height=2.0)
        rng = random.Random(1600 + i)
        m = Model(f"orutal_mossy_log_{i}", 1600 + i)
        L = (7.0, 5.0)[i]
        pts = [Vector((x, 0.25 * math.sin(x), 0.55 + (0.1 * x if i else 0))) for x in [-L / 2 + L * k / 5 for k in range(6)]]
        _trunk(m, rng, pts, 0.62, 0.5, stubs=10)
        for k in range(5):
            p = pts[rng.randrange(1, 5)]
            s = rng.choice((-1, 1))
            m.cyl(0.5, 0.12, (p.x + rng.uniform(-0.4, 0.4), p.y + s * 0.6, p.z + rng.uniform(-0.1, 0.3)), FUNGUS[k % 3], segs=6,
                  r_top=0.42)
        fern_crown(m, rng, (pts[2].x, pts[2].y, 1.1), 7, 1.5, 0.32, old=0, fiddle=False)
        if i == 1:                                                         # its root end, torn out
            for k in range(7):
                a = k * math.tau / 7
                p0 = pts[0]
                tube(m, [p0, p0 + Vector((-0.8, math.cos(a) * 1.3, max(-0.4, math.sin(a) * 1.3)))], [0.2, 0.05], ROOT[k % 3],
                     segs=4)
        m.build(r, rot_z=rng.uniform(0, math.tau))


# --- basalt steps -----------------------------------------------------------------------------

LAVA_GLOW = [LAVA, LAVA_HOT, LAVA_DEEP]


def _column(m, x, y, z0, z1, rad, k, top_lit=True):
    """One hex column of basalt from z0 up to z1, its top face lighter."""
    fs = list(m.cyl(rad * 0.97, z1 - z0, (x, y, z0), BASALT[k % 3], segs=6, rot=(0, 0, math.pi / 6)))
    if top_lit:
        recolor(m, fs, lambda f: BASALT_TOP[(k + 1) % 3] if f.normal.z > 0.9 and f.calc_center_median().z > z1 - 0.1 else None)
    return fs


def _pillar(m, rng, x, y, rings, rad, z0, peak, fall=1.2, seed_k=0):
    """A pillar of packed hex columns, tallest in its heart, stepping down to the rim."""
    for k, (cx, cy) in enumerate(hex_cells(rings, rad)):
        d = math.hypot(cx, cy) / max(rad * 1.73, 1e-3)
        h = peak - d * fall * rng.uniform(0.6, 1.4) - rng.uniform(0, 0.8)
        _column(m, x + cx, y + cy, z0, h, rad, k + seed_k)
    return rad * (rings * 1.73 + 1)


def basalt_arch(variants):
    """Span: a bridge of black hex columns over the lava, the tops of its columns stepping like a
    stair, holes where some have fallen through. v1 sags onto a pillar in the middle."""
    for i in range(2):
        r = root("orutal_basalt_arch", i)
        rng = random.Random(2000 + i)
        m = Model(f"orutal_basalt_arch_{i}", 2000 + i)
        legs = [-43, 43] if i == 0 else [-43, -3, 43]
        for j, lx in enumerate(legs):
            mid = lx != legs[0] and lx != legs[-1]
            rings = 1 if mid else 2
            rad = 1.25 if mid else 1.2
            reach = _pillar(m, rng, lx, rng.uniform(-0.6, 0.6), rings, rad, -3.0, 19.5 + rng.uniform(-1, 1.5), fall=1.0,
                            seed_k=j)
            collider(r, lx, 0, reach * 0.95)
            for k in range(6):                                             # fallen drums at its foot
                a = rng.uniform(0, math.tau)
                d = reach + rng.uniform(0.5, 2.5)
                m.cyl(1.0, rng.uniform(1.6, 2.6), (lx + math.cos(a) * d, math.sin(a) * d, 0.6), BASALT[k % 3], segs=6,
                      rot=(math.pi / 2, 0, a + rng.uniform(-0.6, 0.6)))
        # the deck: short columns packed between the legs, ragged above and below
        rad = 1.25
        w = rad * math.sqrt(3)
        holes = [rng.uniform(-28, 28) for _ in range(3)]
        for q in range(-26, 27):
            for row in range(-2, 3):
                x = w * (q + (row % 2) * 0.5)
                y = row * w * math.sqrt(3) / 2
                if abs(x) > 41:
                    continue
                if any(abs(x - h) < 2.2 and abs(y) < 2.5 for h in holes) and abs(row) < 2:
                    continue
                edge = abs(row) / 2
                top = 17.3 + 1.4 * math.cos(x / 44 * math.pi / 2) - edge * 1.6 + rng.uniform(-1.2, 0.6) * (1 + 0.6 * math.sin(x * 0.3))
                bot = 13.4 + edge * 0.6 + rng.uniform(0, 1.2)
                for lx in legs:                                            # haunches down into the legs
                    d = abs(x - lx)
                    if d < 9:
                        bot = min(bot, 13.4 - (9 - d) * 1.6)
                if i == 1 and abs(x + 3) < 20:                             # sagging onto the middle pillar
                    top -= 1.2 * (1 - abs(x + 3) / 20)
                _column(m, x, y, bot, top, rad, q + row)
                if rng.random() < 0.12:                                    # a drip of old glassy rock under it
                    splinter(m, rng, (x, y, bot + 0.3), 0.6, -0.9, (0, 0), OBSIDIAN[0], sides=4)
        m.build(r)


def hex_gate(variants):
    """Gate: great pillars of hex columns, tall as towers, lava pooled round their feet. v1 has a
    fallen column lying across two of them."""
    shapes = [
        [(-17.5, 0.6, 24), (-6, -0.8, 18), (5.5, 0.4, 27), (17, -0.4, 16.5)],
        [(-14.5, -0.5, 21), (0, 0.8, 26), (14.5, -0.3, 19)],
    ]
    for i, pillars in enumerate(shapes):
        r = root("orutal_hex_gate", i)
        rng = random.Random(2100 + i)
        m = Model(f"orutal_hex_gate_{i}", 2100 + i)
        rad = 1.0 if i == 0 else 1.25
        for j, (x, y, h) in enumerate(pillars):
            reach = _pillar(m, rng, x, y, 1, rad, -3.0, h, fall=2.2, seed_k=j)
            collider(r, x, y, reach * 0.95)
            # a glowing moat where the lava laps at its feet
            m.cyl(reach + 1.6, 0.4, (x, y, -0.15), LAVA, segs=9, glow=True)
            m.cyl(reach + 0.6, 0.45, (x, y, -0.12), LAVA_HOT, segs=9, glow=True)
            for k in range(5):
                a = rng.uniform(0, math.tau)
                d = reach + rng.uniform(1.5, 3)
                m.cyl(rad * 0.95, rng.uniform(0.6, 2.2), (x + math.cos(a) * d, y + math.sin(a) * d, -0.5), BASALT[k % 3], segs=6,
                      rot=(0, 0, math.pi / 6))
        if i == 1:
            # the lintel: a fallen column, broken in two, wedged between the tops
            a, b = Vector((-14.5, -0.5, 19.5)), Vector((0.5, 0.8, 21.5))
            for k, (p, q) in enumerate(((a + Vector((-2, 0, 0.4)), a.lerp(b, 0.55)), (a.lerp(b, 0.58), b + Vector((2.0, 0, 0.5))))):
                d = q - p
                m.cyl(1.4, d.length, tuple(p), BASALT[k], segs=6,
                      rot=Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler())
            m.cyl(1.0, 1.4, (14.5, -0.3, 19), BASALT[2], segs=6, rot=(0.3, 1.2, 0))
        m.build(r)


def caldera(variants):
    """Giant: v0 a crater of spatter round a lake of lava, crusted plates drifting on it; v1 the
    long roof of a lava tube, fallen in here and there over the river glowing inside it."""
    for i in range(2):
        r = root("orutal_caldera", i)
        rng = random.Random(2200 + i)
        m = Model(f"orutal_caldera_{i}", 2200 + i)
        if i == 0:
            R = 17.0
            fs = []
            for k in range(26):                                            # the rim, ragged
                a = k * math.tau / 26 + rng.uniform(-0.05, 0.05)
                d = R + rng.uniform(-1.2, 1.2)
                h = rng.uniform(4.0, 7.6) if k % 7 else 2.0                 # notches where it spilled over
                fs += lump(m, rng, (math.cos(a) * d, math.sin(a) * d, h * 0.45), (3.4, 3.0, h * 0.6), CRUST[k % 3], n=10, flat=0.4)
                fs += lump(m, rng, (math.cos(a) * (d + 4), math.sin(a) * (d + 4), 1.0), (3.6, 3.2, 1.6), CRUST[(k + 1) % 3], n=9,
                           flat=0.5)
            faces_up(m, fs, CRUST_TOP, None, dot=0.7)
            for k in range(4):                                             # where it spilled: glowing tongues outward
                a = k * math.tau / 4 + 0.4
                pts = [Vector((math.cos(a) * d, math.sin(a) * d, max(0.1, 3.0 - (d - R) * 0.5))) for d in (R - 2, R + 1, R + 4, R + 8)]
                ribbon(m, pts, [1.4, 1.2, 1.0, 0.5], LAVA, LAVA_DEEP, fold=0.1, thick=0.2, glow=True)
            m.cyl(R - 1.0, 0.6, (0, 0, 0.6), LAVA_DEEP, segs=16, glow=True)
            squash(m, 0.8)
            m.build(r)
            lake = Model("orutal_caldera_0_lake", 2210)
            for k in range(7):                                             # hot seams
                a = rng.uniform(0, math.tau)
                lake.box((rng.uniform(8, 16), 0.9, 0.2), (math.cos(a) * 3, math.sin(a) * 3, 1.25), LAVA_HOT,
                         rot=(0, 0, a + 1.4), glow=True)
            plates = Model("orutal_caldera_0_crust", 2211)
            for k in range(34):                                            # crust plates drifting on it
                a = rng.uniform(0, math.tau)
                d = rng.uniform(2, R - 5)
                cx, cy = math.cos(a) * d, math.sin(a) * d
                s0 = rng.uniform(1.6, 3.6)
                pts = [(cx + math.cos(b) * s0 * rng.uniform(0.7, 1.1), cy + math.sin(b) * s0 * rng.uniform(0.7, 1.1))
                       for b in [j * math.tau / 6 + rng.uniform(-0.2, 0.2) for j in range(6)]]
                plates.slab(pts, 1.0, 1.55, CRUST[k % 3], top=[(cx + (x - cx) * 0.85, cy + (y - cy) * 0.85) for x, y in pts])
            squash(lake, 0.8)
            squash(plates, 0.8)
            lake.build(r)
            crust = plates.build(r)
            from props_a_lib import spin
            spin(crust, "orutal_caldera_0_drift_idle", period=40.0)
            cone = Model("orutal_caldera_0_cone", 2212)
            for k in range(7):
                a = k * math.tau / 7
                cone.ball(1.4, (math.cos(a) * 2.0, math.sin(a) * 2.0, 1.6), CRUST[k % 3], subdiv=0, scale=(1, 1, 1.2), jitter=0.3)
            cone.cyl(1.6, 0.6, (0, 0, 2.2), LAVA_HOT, segs=7, glow=True)
            squash(cone, 0.8)
            c = cone.build(r, loc=(4, -3, 0))
            pulse(c, "orutal_caldera_0_pulse_idle", amp=0.08, period=1.9, axes=(1, 1, 0.6))
        else:
            L = 64
            n = 16
            path = [Vector((-L / 2 + L * k / n, 5 * math.sin(k / n * math.pi * 1.3), 0)) for k in range(n + 1)]
            skylights = {4, 5, 10, 13}
            fs = []
            frames = []
            for k, p in enumerate(path):
                q = path[min(k + 1, n)] - path[max(k - 1, 0)]
                yaw = math.atan2(q.y, q.x)
                frames.append((p, -math.sin(yaw), math.cos(yaw), 6.2 + 0.9 * math.sin(k * 1.7)))
            for k in range(n):
                if k in skylights:                                         # fallen in: the river shows, rubble round it
                    p, nx, ny, R = frames[k]
                    for s in (-1, 1):
                        fs += lump(m, rng, (p.x + nx * s * R * 0.95, p.y + ny * s * R * 0.95, 1.4), (2.6, 2.2, 2.2), CRUST[k % 3],
                                   n=9, flat=0.4)
                    continue
                pts = []
                for p, nx, ny, R in frames[k:k + 2]:                       # the roof: a ragged half-ring, segment by segment
                    for j in range(7):
                        a = math.pi * j / 6
                        rr = R * rng.uniform(0.92, 1.05)
                        pts.append((p.x + nx * math.cos(a) * rr, p.y + ny * math.cos(a) * rr, max(-0.5, math.sin(a) * rr * 0.9 - 0.5)))
                fs += hull(m, pts, CRUST[k % 3])
                for j in range(2):                                         # pressure ridges and spatter on its back
                    p, nx, ny, R = frames[k]
                    lump(m, rng, (p.x + rng.uniform(-1, 1), p.y + rng.uniform(-2, 2), R * 0.85), (1.4, 1.2, 0.8), CRUST[(k + j) % 3],
                         n=8, flat=0.5)
            faces_up(m, fs, CRUST_TOP, None, dot=0.75)
            for k in range(n):                                             # the river inside, glowing up through the holes
                a, b = path[k], path[k + 1]
                d = b - a
                yaw = math.atan2(d.y, d.x)
                m.box((d.length + 0.4, 6.0, 0.4), tuple((a + b) / 2 + Vector((0, 0, 0.3))), LAVA, rot=(0, 0, yaw), glow=True)
                if k in skylights or k + 1 in skylights:
                    m.box((d.length * 0.7, 2.4, 0.42), tuple((a + b) / 2 + Vector((0, 0, 0.35))), LAVA_HOT, rot=(0, 0, yaw), glow=True)
            end = path[-1]                                                 # the mouth, spilling out in a fan
            for k in range(5):
                yaw = -0.6 + k * 0.3
                pts = [end + Vector((math.cos(yaw) * d, math.sin(yaw) * d, 0.25)) for d in (0, 3, 6, 8)]
                ribbon(m, pts, [1.6, 1.4, 1.0, 0.3], LAVA, LAVA_DEEP, fold=0.05, thick=0.2, glow=True)
            squash(m, 0.85)
            m.build(r)


def cinder_cone(variants):
    """A little spatter cone, cinders heaped round a glowing throat."""
    for i in range(2):
        r = root("orutal_cinder_cone", i, height=3.0)
        rng = random.Random(2400 + i)
        m = Model(f"orutal_cinder_cone_{i}", 2400 + i)
        R = (2.6, 3.6)[i]
        fs = []
        for k in range(10):
            a = k * math.tau / 10
            fs += lump(m, rng, (math.cos(a) * R, math.sin(a) * R, 0.9), (1.5, 1.3, 1.2 + rng.uniform(0, 0.8)), CRUST[k % 3], n=9, flat=0.4)
        faces_up(m, fs, "#5a3c34", None, dot=0.7)
        m.cyl(R - 0.6, 0.8, (0, 0, 0.2), LAVA_DEEP, segs=9, glow=True)
        m.cyl(R * 0.45, 0.85, (0.2, 0.1, 0.2), LAVA_HOT, segs=7, glow=True)
        for k in range(2 + i):                                             # runnels down the outside
            a = rng.uniform(0, math.tau)
            pts = [Vector((math.cos(a) * d, math.sin(a) * d, max(0.1, 2.2 - (d - R + 0.5) * 1.1))) for d in (R - 0.5, R + 0.6, R + 1.6, R + 2.6)]
            ribbon(m, pts, [0.4, 0.35, 0.3, 0.12], LAVA, LAVA_DEEP, fold=0.1, thick=0.08, glow=True)
        m.build(r)


def hex_pad(variants):
    """Low terraces of hex column tops, pale with ash, lava in the seams between them."""
    for i in range(3):
        r = root("orutal_hex_pad", i, height=1.8)
        rng = random.Random(2500 + i)
        m = Model(f"orutal_hex_pad_{i}", 2500 + i)
        rad = (0.75, 0.9, 0.65)[i]
        rings = (2, 2, 3)[i]
        tilt = rng.uniform(0, math.tau)
        for k, (x, y) in enumerate(hex_cells(rings, rad)):
            if rng.random() < 0.15 and k:
                continue
            side = (x * math.cos(tilt) + y * math.sin(tilt)) / (rad * rings * 2)
            h = 0.9 + side * 0.9 + rng.uniform(-0.2, 0.2)
            cap = "#a8a0a0" if rng.random() < 0.15 else ("#e8d040" if rng.random() < 0.06 else None)
            hexcol(m, x, y, -0.4, h, rad * 0.92, k, cap=cap)
        for k in range(2):                                                 # lava in a seam along its foot
            a = tilt + math.pi + rng.uniform(-0.6, 0.6)
            d = rad * (rings + 0.9)
            m.box((rng.uniform(1.6, 2.6), 0.3, 0.3), (math.cos(a) * d, math.sin(a) * d, 0.0), LAVA,
                  rot=(0, 0, a + math.pi / 2), glow=True)
        m.build(r, rot_z=rng.uniform(0, math.tau))


# --- prism cliffs -----------------------------------------------------------------------------

def _gem(m, rng, base, direction, rad, length, tones, tip=0.25, sides=6, glow=True):
    """A crystal in two tones: its faces to the light pale, the rest deep. glow="tip" lights only
    its point (and keeps the body's facets), for the big ones."""
    fs = crystal(m, base, direction, rad, length, tones[0], sides=sides, tip=tip, spin=rng.uniform(0, 1))
    if glow == "tip":
        L = Vector((-0.55, -0.35, 0.75)).normalized()
        deep = _darker(tones[1], 0.62)
        for f in fs:
            f.normal_update()
        recolor(m, fs, lambda f: tones[0] if f.normal.dot(L) > 0.7 else (tones[1] if f.normal.dot(L) > 0.15 else deep))
        b = Vector(base)
        d = Vector(direction).normalized()
        recolor(m, fs, lambda f: (tones[2], True) if (f.calc_center_median() - b).dot(d) > length * (1 - tip) - 0.05 else None)
        return fs
    two_tone(m, fs, tones[0], tones[1], glow=glow)
    return fs


def _darker(hex_, k):
    h = hex_.lstrip("#")
    return "#" + "".join(f"{int(int(h[i:i + 2], 16) * k):02x}" for i in (0, 2, 4))


def _seams(m, rng, base, direction, rad, length, color, n=3):
    """Bright seams glowing round a big crystal, so it's lit from within where the rest isn't."""
    b = Vector(base)
    d = Vector(direction).normalized()
    yaw = math.atan2(d.y, d.x)
    pitch = math.asin(max(-1, min(1, d.z)))
    for k in range(n):
        p = b + d * length * rng.uniform(0.15, 0.75)
        m.box((rad * 0.5, rad * 2.1, rad * 2.1), tuple(p), color, rot=(0, -pitch, yaw), glow=True)


def _druse(m, rng, cx, cy, cz, n, r0, r1, L0, L1, tones, spread=1.2, up=1.0, out=None):
    """A spray of crystals growing out of one spot."""
    for k in range(n):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0, spread)
        lean = rng.uniform(0.2, 0.8)
        dx, dy = math.cos(a) * lean, math.sin(a) * lean
        if out is not None:
            dx, dy = dx * 0.4 + out[0], dy * 0.4 + out[1]
        _gem(m, rng, (cx + math.cos(a) * d, cy + math.sin(a) * d, cz), (dx, dy, up), rng.uniform(r0, r1), rng.uniform(L0, L1),
             tones[k % len(tones)])


def _rock_foot(m, rng, cx, cy, R, n=7, h=1.4):
    rs = []
    for k in range(n):
        a = k * math.tau / n + rng.uniform(-0.3, 0.3)
        rs += lump(m, rng, (cx + math.cos(a) * R, cy + math.sin(a) * R, h * 0.4), (R * 0.6, R * 0.5, h), CRYSTAL_ROCK[k % 3], n=9,
                   flat=0.5)
    faces_up(m, rs, CRYSTAL_ROCK_TOP, None, dot=0.7)


def crystal_bridge(variants):
    """Span: crystal grown right across the canyon. v0 two great prisms out of the walls, crossing
    overhead; v1 a fallen spire lying wall to wall, broken in three, shards spraying from the breaks."""
    for i in range(2):
        r = root("orutal_crystal_bridge", i)
        rng = random.Random(3000 + i)
        m = Model(f"orutal_crystal_bridge_{i}", 3000 + i)
        if i == 0:
            for s, tones in ((-1, MAGENTA), (1, CYAN)):
                base = Vector((s * 45, s * -1.5, 5.5))
                tipp = Vector((-s * 8, s * 1.2, 18.5))
                d = tipp - base
                _gem(m, rng, tuple(base), tuple(d), 2.2, d.length, tones, tip=0.18, glow="tip")
                _seams(m, rng, tuple(base), tuple(d), 2.2, d.length, tones[0], n=3)
                for k in range(3):                                         # a thinner one alongside
                    b2 = base + Vector((0, rng.uniform(-3, 3), rng.uniform(-2, 1)))
                    d2 = (tipp + Vector((s * rng.uniform(10, 22), rng.uniform(-4, 4), rng.uniform(-2.5, 0.5)))) - b2
                    _gem(m, rng, tuple(b2), tuple(d2), rng.uniform(0.9, 1.3), d2.length, LILAC if k % 2 else tones, tip=0.25, glow="tip")
                for k in range(4):                                         # sisters along its back, and hanging under
                    t = rng.uniform(0.15, 0.7)
                    p = base + d * t
                    _gem(m, rng, tuple(p + Vector((0, 0, 1.5))), (s * -0.3 + rng.uniform(-0.3, 0.3), rng.uniform(-0.6, 0.6), 1),
                         rng.uniform(0.6, 1.0), rng.uniform(2.5, 5.0), LILAC if k % 2 else tones, tip=0.35)
                _druse(m, rng, s * 44, 0, -2.0, 9, 0.9, 1.8, 6, 16, [tones, LILAC], spread=4.0, out=(-s * 0.4, 0))
                _rock_foot(m, rng, s * 44, 0, 5.0, h=3.0)
                collider(r, s * 43, 0, 4.5)
        else:
            pieces = [(-46, -14), (-13.5, 9), (9.5, 44)]
            for k, (x0, x1) in enumerate(pieces):
                y0 = (k - 1) * 0.9
                z0 = 16.0 + k * 0.6
                rot = rng.uniform(-0.04, 0.04)
                d0 = (x1 - x0, rot * (x1 - x0), (-0.6 if k == 1 else 0.4))
                _gem(m, rng, (x0, y0, z0), d0, 2.0, x1 - x0, (MAGENTA, CYAN, MAGENTA)[k], tip=0.0 if k < 2 else 0.2,
                     glow=False if k < 2 else "tip")
                _seams(m, rng, (x0, y0, z0), d0, 2.0, x1 - x0, (MAGENTA, CYAN, MAGENTA)[k][0], n=2)
                for j in range(3):                                         # sisters on its back
                    t = rng.uniform(0.15, 0.85)
                    _gem(m, rng, (x0 + (x1 - x0) * t, y0 + rng.uniform(-1, 1), z0 + 1.6), (rng.uniform(-0.5, 0.5), rng.uniform(-0.6, 0.6), 1),
                         rng.uniform(0.5, 0.9), rng.uniform(2.0, 4.0), LILAC, tip=0.35, glow="tip")
            for x in (-14, 9.5):                                           # shards spraying from the breaks
                for k in range(5):
                    _gem(m, rng, (x + rng.uniform(-1, 1), rng.uniform(-1.5, 1.5), 15.5), (rng.uniform(-1, 1), rng.uniform(-1, 1), 0.8),
                         0.45, rng.uniform(1.5, 3.0), MAGENTA, tip=0.4)
            for s in (-1, 1):
                _druse(m, rng, s * 44, 0, -2.0, 7, 0.9, 1.6, 6, 15, [LILAC, MAGENTA], spread=3.5, out=(-s * 0.4, 0))
                _rock_foot(m, rng, s * 44, 0, 5.0, h=3.0)
                collider(r, s * 43, 0, 4.5)
        m.build(r)


def geode(variants):
    """Giant: a geode as big as a hill, cracked open, crystal lining its bowl. v1 broken in half,
    its other half lying in pieces."""
    for i in range(2):
        r = root("orutal_geode", i)
        rng = random.Random(3100 + i)
        m = Model(f"orutal_geode_{i}", 3100 + i)
        R = 15.0
        arcs = (0, math.tau) if i == 0 else (-0.3, math.pi + 0.5)
        n = 22
        rs = []
        for k in range(n):
            a = arcs[0] + (arcs[1] - arcs[0]) * (k + 0.5) / n
            h = rng.uniform(5.0, 7.2)
            rs += lump(m, rng, (math.cos(a) * R, math.sin(a) * R, h * 0.4), (3.8, 3.4, h * 0.6), CRYSTAL_ROCK[k % 3], n=10, flat=0.4)
            rs += lump(m, rng, (math.cos(a) * (R + 4), math.sin(a) * (R + 4), 1.0), (3.6, 3.2, 1.8), CRYSTAL_ROCK[(k + 1) % 3], n=9,
                       flat=0.5)
            # the lining: crystals pointing in and up off the inside of the rim
            for j in range(2):
                b = a + rng.uniform(-0.14, 0.14)
                d = R - 2.6 + rng.uniform(-0.8, 0.6)
                tones = rng.choice((MAGENTA, MAGENTA, LILAC, CYAN) if i else (MAGENTA, LILAC, LILAC))
                _gem(m, rng, (math.cos(b) * d, math.sin(b) * d, rng.uniform(0.5, 3.5)),
                     (-math.cos(b) * rng.uniform(0.3, 0.9), -math.sin(b) * rng.uniform(0.3, 0.9), 1), rng.uniform(0.7, 1.4),
                     rng.uniform(2.5, 6.5), tones, tip=0.3, glow="tip")
        faces_up(m, rs, CRYSTAL_ROCK_TOP, None, dot=0.7)
        m.slab([(math.cos(a) * (R - 2), math.sin(a) * (R - 2)) for a in [k * math.tau / 14 for k in range(14)]], -0.3, 0.3, "#3a2a50")
        # the floor: a bed of small points, a great cluster in the heart
        _druse(m, rng, 0, 0, 0, 18, 0.5, 1.0, 1.5, 3.4, [MAGENTA, CYAN, LILAC], spread=R - 4)
        _druse(m, rng, 1, -1, 0, 7, 1.0, 1.6, 4.5, 7.6, [CYAN, LILAC] if i == 0 else [MAGENTA, CYAN], spread=2.0)
        if i == 1:                                                         # the other half, in pieces
            for k in range(5):
                a = rng.uniform(math.pi + 0.8, math.tau - 0.6)
                d = R + rng.uniform(2, 10)
                cx, cy = math.cos(a) * d, math.sin(a) * d
                fs = lump(m, rng, (cx, cy, 1.2), (3.2, 2.8, 2.0), CRYSTAL_ROCK[k % 3], n=10, flat=0.5)
                faces_up(m, fs, CRYSTAL_ROCK_TOP, None, dot=0.7)
                _druse(m, rng, cx, cy, 2.0, 4, 0.5, 0.9, 1.5, 3.5, [MAGENTA, LILAC], spread=1.5)
        squash(m, 0.76)
        m.build(r)


def crystal_fan(variants):
    """Blades of crystal fanned out flat over the ground, like a split geode's teeth."""
    for i in range(3):
        r = root("orutal_crystal_fan", i, height=2.6)
        rng = random.Random(3300 + i)
        m = Model(f"orutal_crystal_fan_{i}", 3300 + i)
        tones = (MAGENTA, CYAN, LILAC)[i]
        n = (7, 9, 6)[i]
        turn = rng.uniform(0, math.tau)
        width = (2.2, 3.0, math.tau)[i]
        for k in range(n):
            a = turn + width * (k / max(n - 1, 1) - 0.5)
            L = rng.uniform(2.5, 4.5)
            _gem(m, rng, (0, 0, 0), (math.cos(a), math.sin(a), rng.uniform(0.25, 0.6)), rng.uniform(0.35, 0.55), L, tones, sides=4,
                 tip=0.35)
        _rock_foot(m, rng, 0, 0, 0.8, n=4, h=0.7)
        m.build(r)


def prism_shelf(variants):
    """A low shelf of lilac rock with a seam of crystal glowing through it."""
    for i in range(2):
        r = root("orutal_prism_shelf", i, height=1.8)
        rng = random.Random(3400 + i)
        m = Model(f"orutal_prism_shelf_{i}", 3400 + i)
        rs = []
        for k in range(4 + i):
            rs += lump(m, rng, (-2.5 + k * 1.7, rng.uniform(-0.6, 0.6), 0.5), (1.4, 1.5, 0.9), CRYSTAL_ROCK[k % 3], n=10, flat=0.5)
        faces_up(m, rs, CRYSTAL_ROCK_TOP, None, dot=0.7)
        pts = [Vector((-3.0 + k * 1.4, 0.3 * math.sin(k * 1.3), 1.15)) for k in range(5 + i)]
        ribbon(m, pts, [0.25, 0.4, 0.45, 0.4, 0.3, 0.2][:len(pts)], CYAN[0] if i else MAGENTA[0], CYAN[1] if i else MAGENTA[1],
               fold=0.2, thick=0.4, glow=True)
        for k in range(4):
            p = rng.choice(pts)
            _gem(m, rng, tuple(p), (rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), 1), rng.uniform(0.3, 0.45), rng.uniform(1.0, 2.0),
                 CYAN if i else MAGENTA, tip=0.35)
        m.build(r, rot_z=rng.uniform(0, math.tau))


# --- jade shallows ----------------------------------------------------------------------------

JUNGLE = [STACK_TOP, STACK_TOP2, "#5a9a3a"]
VINE = "#3a6a2a"
SHELL = ["#e8d8b8", "#d8b890", "#c89a6a", "#b87a4a"]
SHELL_IN = "#f4e8e0"
NACRE = ("#c8f0e0", "#e8d0f0")


def _stack(m, rng, x, y, H, R, drift=(0.08, 0.05), cap=True):
    """A sea stack, as the scattered ones (props_a_orutal): banded limestone wandering up from the
    sea bed, weed at the waterline, a hat of jungle and vines down its sides."""
    tx, ty = stack_pillar(m, rng, x, y, H, R, drift, z0=-3.0)
    if cap:
        jungle_cap(m, rng, tx, ty, H, R, 1)
    return tx, ty


def sea_arch(variants):
    """Span: an arch of rock out of the jade sea, jungle on its back, vines hanging from it. v1
    has a stack in the middle holding up two arches."""
    for i in range(2):
        r = root("orutal_sea_arch", i)
        rng = random.Random(4000 + i)
        m = Model(f"orutal_sea_arch_{i}", 4000 + i)
        legs = [(-43, 0, 5.2), (43, 0.5, 5.0)] if i == 0 else [(-43, 0, 4.8), (-3, -0.5, 3.4), (43, 0.5, 4.6)]
        for x, y, R in legs:
            _stack(m, rng, x, y, 17.5, R, cap=False)
            collider(r, x, y, R * 1.15)
        # the arch: drums of rock leaning together into a band, thick at the haunches, wandering
        def yc(x):
            return 2.2 * math.sin(x * 0.06 + i * 2) + 0.8 * math.sin(x * 0.17)
        xs = list(range(-42, 43, 4))
        fs = []
        bare = []
        for x in xs:
            near = min(abs(x - lx) for lx, _, _ in legs)
            bot = 13.5 + rng.uniform(0, 0.8) + max(0, 6 - near) * -1.8
            if near > 6:
                bot += 0.8 * math.sin(x * 0.2)
            top = 18.2 + rng.uniform(-0.6, 0.7) - (0.8 if i == 1 and abs(x + 3) < 8 else 0)
            w = 3.6 + 1.2 * math.sin(x * 0.11 + i) + rng.uniform(-0.3, 0.4) + max(0, 8 - near) * 0.4
            pts = []
            for dx in (-2.4, 2.4):
                for a in range(8):
                    b = a * math.tau / 8
                    zz = bot + (top - bot) * (0.5 + 0.5 * math.sin(b))
                    pts.append((x + dx + rng.uniform(-0.3, 0.3), yc(x + dx) + math.cos(b) * w * rng.uniform(0.9, 1.1), zz))
            seg = hull(m, pts, STACK[(x // 4) % 4])
            fs += seg
            if rng.random() < 0.35:
                bare += seg
        for f in fs:
            f.normal_update()
        bare = set(bare)
        recolor(m, fs, lambda f: (("#a8987c" if f in bare else JUNGLE[0]) if f.normal.z > 0.75 else ("#5a4a3c" if f.normal.z < -0.5 else None)))
        # jungle on its back in clumps, a few tree ferns, ferns tumbling over the sides
        x = -40.0
        k = 0
        while x < 40:
            if rng.random() < 0.7:
                p = (x, yc(x) + rng.uniform(-1.2, 1.2), 18.3)
                m.ball(rng.uniform(1.5, 3.2), p, JUNGLE[k % 3], subdiv=1, scale=(1.5, 1.2, 0.45), jitter=0.25)
                if rng.random() < 0.4:
                    fern_crown(m, rng, (p[0], p[1], 19.0), 8, 2.6, 0.5, old=0, fiddle=False)
            x += rng.uniform(2.5, 6.5)
            k += 1
        for x in rng.sample(range(-30, 31, 6), 3):
            base = (x, yc(x), 18.0)
            tp = bend(base, (x, yc(x), 21.8), (rng.uniform(-0.8, 0.8), rng.uniform(-0.8, 0.8)), n=4)
            tube(m, tp, [0.42, 0.34, 0.3, 0.3, 0.32], FERN_BARK[0], segs=6, colors=FERN_BARK)
            fern_crown(m, rng, tuple(tp[-1]), 10, 3.0, 0.55, old=1)
        for k in range(12):
            x = rng.uniform(-38, 38)
            sd = rng.choice((-1, 1))
            frond(m, (x, yc(x) + sd * 3.4, 18.0), sd * math.pi / 2 + rng.uniform(-0.5, 0.5), rng.uniform(2.6, 3.8), 0.6, *FROND[k % 3],
                  rise=0.1, droop=1.2)
        for k in range(16):                                                # vines hanging from it, kept above the flight line
            x = rng.uniform(-36, 36)
            y = yc(x) + rng.choice((-1, 1)) * rng.uniform(3.0, 4.0)
            near = min(abs(x - lx) for lx, _, _ in legs)
            if near < 6:
                continue
            L = rng.uniform(0.6, 1.4)
            tube(m, [Vector((x, y, 15.5)), Vector((x + 0.2, y, 14.0)), Vector((x, y, 14.0 - L))], [0.22, 0.18, 0.08], VINE, segs=4)
        m.build(r)


def stack_gate(variants):
    """Gate: sea stacks close enough to touch, a poachers' rope bridge slung between two of them,
    a lookout with a lamp on top."""
    shapes = [
        [(-17.5, 0.5, 22, 3.0), (-5, -0.8, 17, 2.4), (7.5, 0.6, 24, 3.2), (19.5, -0.4, 15.5, 2.0)],
        [(-14, -0.4, 19, 3.2), (0, 0.7, 25, 3.0), (13.5, -0.5, 17, 2.6)],
    ]
    for i, stacks in enumerate(shapes):
        r = root("orutal_stack_gate", i)
        rng = random.Random(4100 + i)
        m = Model(f"orutal_stack_gate_{i}", 4100 + i)
        tops = []
        for k, (x, y, H, R) in enumerate(stacks):
            tx, ty = _stack(m, rng, x, y, H, R)
            collider(r, x, y, R * 1.15)
            tops.append(Vector((tx, ty, H)))
            for j in range(3):
                lump(m, rng, (x + rng.uniform(-R * 1.6, R * 1.6), y + rng.uniform(-R * 1.6, R * 1.6), 0.2), (1.2, 1.0, 0.9), STACK[j], n=9,
                     flat=0.5)
        # the rope bridge, sagging between the first two tops (high over the gap)
        a, b = tops[0], tops[1]
        za, zb = a.z + 0.6, b.z + 0.6
        planks = 14
        prev = None
        for k in range(planks + 1):
            t = k / planks
            p = a.lerp(b, t)
            p.z = za + (zb - za) * t - math.sin(t * math.pi) * 2.0
            if 0 < k < planks:
                m.box((1.0, 1.6, 0.18), tuple(p), ("#8a6a42", "#7a5a38")[k % 2], rot=(0, 0, math.atan2(b.y - a.y, b.x - a.x)))
            if prev is not None:
                for sd in (-0.85, 0.85):
                    m.plank_line(tuple(prev + Vector((0, sd, 0.8))), tuple(p + Vector((0, sd, 0.8))), 0.08, 0.08, "#5a4a30")
            prev = p
        # the lookout: a platform of lashed poles, a hide roof, a lamp
        t = tops[2]
        m.box((3.0, 3.0, 0.3), (t.x, t.y, t.z + 0.9), "#7a5a38")
        for dx in (-1.3, 1.3):
            for dy in (-1.3, 1.3):
                m.plank_line((t.x + dx, t.y + dy, t.z + 0.9), (t.x + dx * 0.8, t.y + dy * 0.8, t.z + 2.8), 0.15, 0.15, "#5a4030")
        m.box((3.4, 3.2, 0.25), (t.x, t.y, t.z + 2.9), "#c8a040", rot=(0.15, 0, 0))     # Hesk ochre
        m.ball(0.4, (t.x + 1.4, t.y - 1.4, t.z + 2.4), "#ff8a3a", subdiv=1, glow=True)
        m.build(r)


def _whorl(m, rng, turns, R0, grow, z0, colors, chambers=False, cut=0.0):
    """An ammonite's spiral lying flat: ribbed rings of shell along a log spiral, growing outward."""
    steps = int(turns * 26)
    prev = None
    for k in range(steps):
        t = k / 26
        if t < cut:
            continue
        a = t * math.tau
        rr = R0 * math.exp(grow * a)                                         # distance from the centre
        tr = rr * 0.42                                                       # the tube's radius there
        c = Vector((math.cos(a) * rr, math.sin(a) * rr, z0 + tr * 0.35))
        if prev is not None:
            pc, ptr = prev
            col = colors[(k // 2) % len(colors)]
            tube(m, [pc, c], [ptr, tr], col, segs=8)
            if k % 2 == 0:                                                   # ribs
                d = (c - pc).normalized()
                tube(m, [c - d * 0.25, c + d * 0.25], [tr * 1.1, tr * 1.1], SHELL[3] if k % 4 else SHELL[2], segs=8)
        prev = (c, tr)
    return prev


def ammonite(variants):
    """Giant: a coiled shell bigger than a house, half sunk in the shallows. v1 is broken open,
    its pearly chambers showing."""
    for i in range(2):
        r = root("orutal_ammonite", i)
        rng = random.Random(4200 + i)
        m = Model(f"orutal_ammonite_{i}", 4200 + i)
        grow = 0.19
        R0 = 0.5
        end = _whorl(m, rng, 3.0, R0, grow, 0.0, SHELL[:3] if i == 0 else [SHELL[0], SHELL[1]])
        c, tr = end
        # the opening, a great dark mouth with a pearly lip
        a = math.atan2(c.y, c.x)
        d = Vector((-math.sin(a), math.cos(a), 0))
        tube(m, [c, c + d * 0.6], [tr * 1.15, tr * 1.15], SHELL_IN, segs=8)
        m.cyl(tr * 0.85, 0.4, tuple(c + d * 0.6), "#2a3a3a", segs=8, rot=(math.pi / 2, 0, a))
        if i == 1:
            # smashed open on one side: the chambers inside, walls of nacre
            for k in range(7):
                b = 1.4 + k * 0.45
                rr = R0 * math.exp(grow * (b + math.tau * 2))
                p = Vector((math.cos(b) * rr, math.sin(b) * rr, rr * 0.5))
                m.box((rr * 0.75, 0.5, rr * 0.75), tuple(p), NACRE[k % 2], rot=(0, 0, b))
            for k in range(8):
                p = Vector((rng.uniform(-6, 10), rng.uniform(-14, -4), 0.1))
                lump(m, rng, tuple(p), (2.0, 1.5, 1.6), SHELL[k % 4], n=8, flat=0.5)
        for v in m.bm.verts:                                               # pressed flat, half sunk
            v.co.z = v.co.z * 0.6 - 0.8
        # weed and barnacles round the waterline
        for k in range(14):
            b = rng.uniform(0, math.tau)
            rr = rng.uniform(4, 13)
            m.ball(rng.uniform(0.5, 1.0), (math.cos(b) * rr, math.sin(b) * rr, rng.uniform(0.2, 1.0)), ("#3a7a4a", "#4a8a3a", "#6a6a4a")[k % 3],
                   subdiv=0, scale=(1.6, 1.2, 0.5))
        m.build(r, rot_z=rng.uniform(0, math.tau))


def build():
    fern_log(2)
    sauropod_bones(2)
    titan_ferns(2)
    horsetail(3)
    fern_grove(2)
    mossy_log(2)
    basalt_arch(2)
    hex_gate(2)
    caldera(2)
    cinder_cone(2)
    hex_pad(3)
    crystal_bridge(2)
    geode(2)
    crystal_fan(3)
    prism_shelf(2)
    sea_arch(2)
    stack_gate(2)
    ammonite(2)
