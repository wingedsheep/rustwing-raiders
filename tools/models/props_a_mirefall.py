"""MIREFALL, moon of the Violet Giant: glowing mushroom forests, peat bog, a drowned temple, spore vents."""
from __future__ import annotations

import math
import random

import bmesh
from mathutils import Matrix, Vector

from kit import Model
from props_a_lib import (arc, bend, collider, frond, lump, pulse, recolor, ribbon, root, sway, tube)

# the ground is dusk violet and moss (#3a4a3a, #4a3a5a): stems go pale, caps go rich, the light glows
STEM = ["#d8d0e8", "#c4bcd8", "#e4dcf0"]
CAPS = {
    "violet": ("#6a3a9a", "#8a5ab8", "#8aff8a"),    # cap, cap rim, glow
    "teal": ("#1e6a78", "#2e8a94", "#6affff"),
    "magenta": ("#8a2a7a", "#aa4a98", "#ff6aff"),
    "amber": ("#8a5a2a", "#a8783a", "#ffd04a"),
}
CORAL = [("#e86a8a", "#ffb0d0"), ("#3ab0a8", "#8affff"), ("#e8903a", "#ffe08a")]
REED = ["#7a8a3a", "#94a04a", "#6a7a3a", "#a89a5a"]
RUSH = "#4a2a3a"
SPORE = "#8aff8a"
WOOD = ["#5a5048", "#6a6058", "#4e4640"]
WOOD_TOP = "#8a8078"
HOLLOW = "#1a161c"
MOSS_HANG = ["#7a8a5a", "#6a7a4a"]
PAD = ["#3a6a3a", "#4a7a4a", "#2e5a34"]
PAD_RIM = "#7a4a5a"
FLOWER = "#e0a0ff"
TEMPLE = ["#6a7062", "#5e6458", "#767c6a"]
TEMPLE_TOP = ("#8e9480", "#7c826e")
TEMPLE_MOSS = ["#4a6a3a", "#5a7a3a"]
TEMPLE_GLOW = "#8aff8a"
TEMPLE_GLOW2 = "#c08aff"
VENT = ["#5a3a5a", "#6a4a6a", "#4a2e4a"]
VENT_TOP = "#8a6a8a"


def _cap(m, x, y, z, R, H, pal, shape="dome", spots=6, rng=None):
    """A mushroom cap seated at (x, y, z): its top, a pale rim, the glowing gills under it and spots."""
    cap, rim, glow = pal
    if shape == "dome":
        m.ball(R, (x, y, z), cap, subdiv=1, scale=(1, 1, H / R))
        m.cyl(R * 0.98, 0.25, (x, y, z - 0.12), rim, segs=12)
        m.cyl(R * 0.94, 0.12, (x, y, z - 0.24), glow, segs=12, r_top=R * 0.94, glow=True)   # gill ring
        m.cyl(R * 0.6, 0.12, (x, y, z - 0.3), glow, segs=10, glow=True)
        top = z + H
    elif shape == "cone":
        m.cyl(R, H, (x, y, z), cap, segs=9, r_top=R * 0.08)
        m.cyl(R * 1.02, 0.2, (x, y, z - 0.1), rim, segs=9)
        m.cyl(R * 0.95, 0.12, (x, y, z - 0.22), glow, segs=9, glow=True)
        top = z + H
    else:                                                                  # flat plate
        m.cyl(R, H, (x, y, z), cap, segs=11, r_top=R * 0.85)
        m.cyl(R * 1.03, 0.14, (x, y, z), glow, segs=11, glow=True)
        top = z + H
    if rng:
        for k in range(spots):                                             # glowing spots on top
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.2, 0.75) * R
            if shape == "dome":
                hz = z + H * math.sqrt(max(0.0, 1 - (d / R) ** 2))
            elif shape == "cone":
                hz = z + H * (1 - d / R) * 0.95
            else:
                hz = z + H
            m.ball(rng.uniform(0.18, 0.3) * max(1, R / 2.5), (x + math.cos(a) * d, y + math.sin(a) * d, hz - 0.05),
                   glow, subdiv=0, scale=(1, 1, 0.5), glow=True)
    return top


def glowcap(variants):
    """Mushrooms 3-7 tall: pale stems, rich caps freckled with light, gills glowing underneath."""
    specs = [
        [(0, 0, 6.0, 2.2, 1.1, (0.5, 0.3), "dome")],
        [(0, 0, 7.0, 2.0, 0.9, (-0.6, 0.4), "dome"), (1.6, -0.6, 4.4, 1.5, 0.7, (0.6, -0.3), "dome"),
         (-1.2, -1.2, 3.0, 1.1, 0.55, (-0.3, -0.5), "dome")],
        [(0, 0, 5.0, 1.8, 2.4, (0.3, -0.2), "cone"), (1.4, 0.8, 3.2, 1.2, 1.6, (0.4, 0.3), "cone")],
        [(0, 0, 4.0, 2.6, 0.35, (0.2, 0.2), "plate"), (-1.6, 0.4, 5.6, 1.9, 0.3, (-0.6, 0.1), "plate"),
         (1.0, 1.4, 3.0, 1.4, 0.3, (0.3, 0.5), "plate")],
    ]
    pals = ["violet", "teal", "magenta", "amber"]
    for i, spec in enumerate(specs):
        r = root("glowcap", i, height=round(max(s[2] for s in spec) + 1.2, 2))
        rng = random.Random(800 + i)
        m = Model(f"glowcap_{i}_stems", 800 + i)
        pal = CAPS[pals[i]]
        main = None
        for k, (x, y, h, R, H, lean, shape) in enumerate(spec):
            pts = bend((x, y, 0), (x, y, h), lean, n=5)
            sr = 0.22 + R * 0.12
            tube(m, pts, [sr * 1.6, sr * 1.15, sr, sr * 0.95, sr * 0.92, sr * 0.95], STEM[k % 3], segs=7)
            if shape == "dome" and k == 0:                                 # a skirt (annulus) on the big one
                p = pts[3]
                m.cyl(sr * 2.2, 0.25, (p.x, p.y, p.z - 0.3), STEM[2], segs=8, r_top=sr * 1.05)
            top = pts[-1]
            if k == 0:
                c = Model(f"glowcap_{i}_cap", 810 + i)
                _cap(c, 0, 0, 0, R, H, pal, shape, spots=7, rng=rng)
                main = c.build(r, loc=tuple(top))
            else:
                _cap(m, top.x, top.y, top.z, R, H, pal, shape, spots=4, rng=rng)
        for k in range(4):                                                 # buttons at the foot
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.9, 1.6)
            x, y = math.cos(a) * d, math.sin(a) * d
            m.cyl(0.1, 0.4, (x, y, 0), STEM[k % 3], segs=5)
            m.ball(0.28, (x, y, 0.45), pal[2], subdiv=0, scale=(1, 1, 0.55), glow=True)
        m.build(r)
        pulse(main, f"glowcap_{i}_breathe_idle", amp=0.05, period=3.0 + i * 0.4, axes=(1, 1, 0.6))


def glowcap_tall(variants):
    """Obstacles: mushrooms the size of towers, caps above where you fly. Collider on the stem."""
    specs = [
        [(0, 0, 14.5, 5.0, 2.2, (0.9, 0.5), "violet")],
        [(-1.2, 0, 15.5, 4.2, 1.8, (-1.4, 0.6), "teal"), (1.6, 0.6, 13.2, 3.4, 1.5, (1.3, -0.4), "magenta")],
    ]
    for i, spec in enumerate(specs):
        r = root("glowcap_tall", i, height=round(max(s[2] + s[4] for s in spec), 2), obstacle=1)
        rng = random.Random(830 + i)
        m = Model(f"glowcap_tall_{i}", 830 + i)
        for k, (x, y, h, R, H, lean, pal) in enumerate(spec):
            pts = bend((x, y, 0), (x, y, h), lean, n=8)
            sr = 0.95 if k == 0 else 0.8
            tube(m, pts, [sr * 1.9, sr * 1.3, sr * 1.1, sr, sr, sr * 0.95, sr * 0.95, sr, sr * 1.1], STEM[k], segs=8,
                 colors=[STEM[(k + j // 3) % 3] for j in range(8)])
            p = pts[5]
            m.cyl(sr * 2.6, 0.4, (p.x, p.y, p.z - 0.4), STEM[2], segs=10, r_top=sr * 1.1)    # the skirt
            m.cyl(sr * 2.4, 0.2, (p.x, p.y, p.z - 0.55), CAPS[pal][2], segs=10, glow=True)
            top = pts[-1]
            _cap(m, top.x, top.y, top.z, R, H, CAPS[pal], "dome", spots=10, rng=rng)
            # where the stem crosses flight height
            t = 10.0 / h
            collider(r, x + lean[0] * t * t, y + lean[1] * t * t, sr * 1.4)
        for k in range(5):                                                 # a ring of small ones at the foot
            a = rng.uniform(0, math.tau)
            d = rng.uniform(2.0, 3.0)
            x, y = math.cos(a) * d, math.sin(a) * d
            h = rng.uniform(0.8, 1.8)
            m.cyl(0.15, h, (x, y, 0), STEM[k % 3], segs=5)
            _cap(m, x, y, h, rng.uniform(0.5, 0.8), 0.35, CAPS[("violet", "teal", "magenta")[k % 3]], "dome", spots=0)
        m.build(r)


def _branch(m, rng, p, d, L, r, depth, col, tip):
    q = p + d * L
    tube(m, [p, p.lerp(q, 0.5) + Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), 0)), q], [r, r * 0.85, r * 0.7], col, segs=5)
    if depth == 0:
        m.ball(r * 1.5, tuple(q), tip, subdiv=0, glow=True)
        return
    for k in range(2 if depth > 1 else rng.choice((2, 3))):
        a = rng.uniform(0, math.tau)
        nd = (d * 1.0 + Vector((math.cos(a), math.sin(a), 0)) * 0.7).normalized()
        nd.z = max(nd.z, 0.35)
        _branch(m, rng, q, nd.normalized(), L * 0.7, r * 0.7, depth - 1, col, tip)


def fungus_coral(variants):
    for i in range(3):
        r = root("fungus_coral", i)
        rng = random.Random(850 + i)
        m = Model(f"fungus_coral_{i}", 850 + i)
        if i < 2:
            col, tip = CORAL[i]
            for k in range(3 + i):
                a = k * math.tau / (3 + i) + rng.uniform(-0.3, 0.3)
                base = Vector((math.cos(a) * 0.35, math.sin(a) * 0.35, -0.1))
                d = Vector((math.cos(a) * 0.4, math.sin(a) * 0.4, 1)).normalized()
                _branch(m, rng, base, d, rng.uniform(1.0, 1.4), 0.22, 2, col, tip)
            for v in m.bm.verts:
                v.co *= 1.6
        else:
            # shelves of bracket fungus stacked up a rotten stump, glowing at the edges
            col, tip = CORAL[2]
            m.cyl(0.55, 2.6, (0, 0, 0), WOOD[0], segs=6, r_top=0.4)
            m.cyl(0.42, 0.1, (0, 0, 2.6), HOLLOW, segs=6)
            for k in range(5):
                a = rng.uniform(0, math.tau)
                z = 0.5 + k * 0.45
                R = rng.uniform(0.6, 0.95)
                cx, cy = math.cos(a) * 0.55, math.sin(a) * 0.55
                m.cyl(R, 0.18, (cx, cy, z), col, segs=9, r_top=R * 0.85)
                m.cyl(R * 1.05, 0.08, (cx, cy, z), tip, segs=9, glow=True)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def reed_clump(variants):
    for i in range(2):
        r = root("reed_clump", i)
        rng = random.Random(870 + i)
        m = Model(f"reed_clump_{i}", 870 + i)
        n = 22 if i == 0 else 32
        spread = 0.5 if i == 0 else 0.8
        for k in range(n):
            x, y = rng.gauss(0, spread), rng.gauss(0, spread)
            h = rng.uniform(1.2, 2.2)
            a = math.atan2(y, x)
            pts = arc((x, y, -0.2), a, h * 0.5, 2.6, 1.0, n=3)
            ribbon(m, pts, [0.14, 0.12, 0.08, 0.02], REED[k % 4], fold=0.3, thick=0.05)
        for k in range(4 + 2 * i):
            x, y = rng.gauss(0, spread * 0.6), rng.gauss(0, spread * 0.6)
            h = rng.uniform(1.6, 2.4)
            m.cyl(0.04, h, (x, y, -0.2), REED[0], segs=4)
            m.cyl(0.11, 0.42, (x, y, h - 0.55), RUSH, segs=6)
            if k % 2 == 0:
                m.ball(0.1, (x, y, h - 0.05), SPORE, subdiv=0, glow=True)    # a spore light at the tip
        obj = m.build(r)
        sway(obj, f"reed_clump_{i}_sway_idle", amp=(0.05, 0.04), period=2.6 + i * 0.5, phase=i)


def dead_tree(variants):
    shapes = [(5.5, (0.6, 0.3), 3), (7.0, (-0.8, 0.6), 4), (3.2, (0.3, -0.2), 2)]
    for i, (H, lean, nb) in enumerate(shapes):
        r = root("dead_tree", i, height=H)
        rng = random.Random(890 + i)
        m = Model(f"dead_tree_{i}", 890 + i)
        pts = bend((0, 0, -0.3), (0, 0, H), lean, n=6)
        tube(m, pts, [0.75, 0.55, 0.45, 0.42, 0.4, 0.38, 0.42], WOOD[0], segs=7,
             colors=[WOOD[k % 3] for k in range(6)])
        top = pts[-1]
        m.cyl(0.32, 0.12, (top.x, top.y, top.z - 0.05), HOLLOW, segs=7)      # hollow at the top, snapped off
        for k in range(4):                                                 # splinters round the break
            a = k * math.tau / 4 + rng.uniform(-0.3, 0.3)
            m.box((0.16, 0.12, rng.uniform(0.4, 0.8)), (top.x + math.cos(a) * 0.32, top.y + math.sin(a) * 0.32, top.z + 0.2),
                  WOOD_TOP, rot=(math.sin(a) * 0.3, -math.cos(a) * 0.3, a), taper=0.3)
        for k in range(nb):                                                # bare branches reaching out
            t = rng.uniform(0.45, 0.85)
            p = pts[int(t * 6)]
            a = rng.uniform(0, math.tau)
            L = rng.uniform(1.6, 2.6) * (H / 5.5)
            q = Vector((p.x + math.cos(a) * L, p.y + math.sin(a) * L, p.z + L * 0.5))
            tube(m, [p, p.lerp(q, 0.5) + Vector((0, 0, 0.2)), q], [0.2, 0.14, 0.05], WOOD[1], segs=5)
            a2 = a + rng.uniform(-0.9, 0.9)
            mid = p.lerp(q, 0.6)
            tube(m, [mid, Vector((mid.x + math.cos(a2) * 0.9, mid.y + math.sin(a2) * 0.9, mid.z + 0.7))], [0.09, 0.03],
                 WOOD[2], segs=4)
            for j in range(2):                                             # moss hanging off it
                hp = p.lerp(q, 0.4 + j * 0.35)
                ribbon(m, [hp, hp + Vector((0.05, 0.05, -0.6)), hp + Vector((0.0, 0.1, -1.3))], [0.16, 0.12, 0.04],
                       MOSS_HANG[j], fold=0.0, thick=0.06, side=(math.cos(a + 1.57), math.sin(a + 1.57), 0))
        for k in range(3):                                                 # little glowing shelf fungi on the trunk
            p = pts[rng.randrange(1, 5)]
            a = rng.uniform(0, math.tau)
            m.cyl(0.26, 0.08, (p.x + math.cos(a) * 0.45, p.y + math.sin(a) * 0.45, p.z), SPORE, segs=6, glow=True)
        for k in range(4):                                                 # roots in the peat
            a = k * math.tau / 4 + rng.uniform(-0.3, 0.3)
            tube(m, [Vector((0, 0, 0.6)), Vector((math.cos(a) * 1.0, math.sin(a) * 1.0, 0.1)),
                     Vector((math.cos(a) * 1.6, math.sin(a) * 1.6, -0.2))], [0.3, 0.2, 0.08], WOOD[k % 3], segs=5)
        m.build(r)


def lily_pad(variants):
    """Pads on the black water (z = 0), a violet flower glowing on some."""
    for i in range(2):
        r = root("lily_pad", i)
        rng = random.Random(910 + i)
        m = Model(f"lily_pad_{i}", 910 + i)
        if i == 0:
            for k in range(6):
                a = rng.uniform(0, math.tau)
                d = rng.uniform(0.2, 1.5)
                R = rng.uniform(0.45, 0.8)
                cx, cy = math.cos(a) * d, math.sin(a) * d
                m.cyl(R, 0.06, (cx, cy, 0.0), PAD[k % 3], segs=9)
                b = rng.uniform(0, math.tau)                               # the notch
                m.box((R * 0.9, 0.12, 0.08), (cx + math.cos(b) * R * 0.55, cy + math.sin(b) * R * 0.55, 0.04), "#2a3a2a",
                      rot=(0, 0, b))
            fl = [(0.3, 0.2)]
            flz = [0.0]
        else:
            # one giant pad with a turned-up rim, and a few small ones
            m.cyl(1.8, 0.08, (0, 0, 0.0), PAD[1], segs=14)
            m.cyl(1.9, 0.22, (0, 0, 0.0), PAD_RIM, segs=14, r_top=2.05)
            m.cyl(1.8, 0.1, (0, 0, 0.18), PAD[0], segs=14)
            for k in range(6):                                             # the ribs
                a = k * math.tau / 6
                m.box((1.6, 0.14, 0.05), (math.cos(a) * 0.8, math.sin(a) * 0.8, 0.29), PAD[2], rot=(0, 0, a))
            for k in range(3):
                a = rng.uniform(0, math.tau)
                m.cyl(0.5, 0.06, (math.cos(a) * 2.5, math.sin(a) * 2.5, 0.0), PAD[k % 3], segs=8)
            fl = [(2.4, -1.0), (-0.4, 0.5)]
            flz = [0.0, 0.18]
        for (fx, fy), dz in zip(fl, flz):
            for k in range(6):
                a = k * math.tau / 6
                m.box((0.34, 0.14, 0.08), (fx + math.cos(a) * 0.17, fy + math.sin(a) * 0.17, 0.18 + dz), FLOWER,
                      rot=(0, -0.6, a), glow=True)
            m.ball(0.12, (fx, fy, 0.2 + dz), "#fff0a0", subdiv=0, glow=True)
        m.build(r)


def ziggurat(variants):
    """A stepped temple, sinking: under 8 above the swamp, its shrine still lit."""
    for i in range(2):
        r = root("ziggurat", i)
        rng = random.Random(930 + i)
        m = Model(f"ziggurat_{i}", 930 + i)
        tiers = 5
        step = 1.45
        base = -1.6
        fs = []
        for k in range(tiers):
            w = 14 - k * 2.6
            z0 = base + k * step
            fs += list(m.box((w, w, step), (0, 0, z0 + step / 2), TEMPLE[k % 3]))
            if k >= 1:                                                     # a lit band under each lip
                for s in (-1, 1):
                    if i == 1 and s == 1 and k == 2:
                        continue                                           # broken there
                    m.box((w * 0.6, 0.12, 0.18), (0, s * (w / 2 + 0.04), z0 + step * 0.45), TEMPLE_GLOW2, glow=True)
        # the stair up the camera side, from the swamp to the shrine
        y0, y1 = -7.0, -(14 - 2.6 * (tiers - 1)) / 2
        z1 = base + tiers * step
        n = 16
        for k in range(n):
            t = (k + 0.5) / n
            m.box((2.4, 0.75, 0.55), (0, y0 + (y1 - y0) * t - 0.3, base + (z1 - base) * t), ("#8a9080", "#7a8070")[k % 2])
        for s in (-1, 1):                                                  # balustrades
            mid = Vector((s * 1.35, (y0 + y1) / 2 - 0.3, (base + z1) / 2 + 0.2))
            m.plank_line((s * 1.35, y0 - 0.3, base + 0.3), (s * 1.35, y1 - 0.3, z1 + 0.3), 0.35, 0.35, TEMPLE[1])
        # the shrine on top: a little house with a glowing doorway, and a glow pool before it
        tz = base + tiers * step
        fs += list(m.box((2.4, 2.2, 1.6), (0, 0.3, tz + 0.8), TEMPLE[0]))
        fs += list(m.box((2.9, 2.7, 0.35), (0, 0.3, tz + 1.75), TEMPLE[2]))
        m.box((0.9, 0.1, 1.1), (0, -0.82, tz + 0.6), TEMPLE_GLOW, glow=True)
        m.box((1.0, 1.0, 0.12), (0, 0.3, tz + 1.95), TEMPLE_GLOW, glow=True, rot=(0, 0, 0.785))
        for f in fs:
            f.normal_update()
        recolor(m, fs, lambda f: TEMPLE_TOP[int(round((f.calc_center_median().z - base) / step)) % 2] if f.normal.z > 0.9 else None)
        # moss creeping over the steps and vines down the faces
        for k in range(22):
            t = rng.randrange(tiers - 1)
            w = 14 - t * 2.6
            zt = base + (t + 1) * step
            a = rng.uniform(-1, 1)
            side = rng.randrange(4)
            along = a * (w / 2 - 1.3)
            edge = w / 2 - 0.65
            x, y = [(along, edge), (along, -edge), (edge, along), (-edge, along)][side]
            if side == 1 and abs(x) < 1.6:
                continue
            m.ball(rng.uniform(0.8, 1.3), (x, y, zt), TEMPLE_MOSS[k % 2], subdiv=1, scale=(1.4, 1.0, 0.3), jitter=0.1)
        for k in range(6):
            a = k * math.tau / 6 + rng.uniform(-0.2, 0.2)
            x, y = math.cos(a) * 6.9, math.sin(a) * 6.9
            x, y = max(-7.05, min(7.05, x)), max(-7.05, min(7.05, y))
            ribbon(m, [Vector((x, y, base + step * 1.9)), Vector((x * 1.01, y * 1.01, base + 1.0)),
                       Vector((x * 1.02, y * 1.02, -0.2))], [0.25, 0.2, 0.12], TEMPLE_MOSS[k % 2], fold=0.0,
                   thick=0.08, side=(-math.sin(a), math.cos(a), 0))
        if i == 1:
            # this one is going under on one corner, a block fallen off the top
            bmesh.ops.rotate(m.bm, verts=list(m.bm.verts), cent=(0, 0, 0), matrix=Matrix.Rotation(0.09, 3, "X") @ Matrix.Rotation(-0.07, 3, "Y"))
            bmesh.ops.translate(m.bm, verts=list(m.bm.verts), vec=(0, 0, -0.5))
            m.box((1.6, 1.4, 1.3), (6.8, 6.0, 0.3), TEMPLE[1], rot=(0.4, 0.3, 0.5))
            m.box((1.4, 1.2, 1.1), (-7.8, 2.5, 0.1), TEMPLE[0], rot=(0.2, -0.5, 0.2))
        m.build(r)


def vine_pillar(variants):
    for i in range(3):
        r = root("vine_pillar", i)
        rng = random.Random(950 + i)
        m = Model(f"vine_pillar_{i}", 950 + i)
        cols = [(0, 0, 5.0)] if i == 0 else ([(0, 0, 2.6)] if i == 1 else [(-1.8, 0, 5.2), (1.8, 0, 5.2)])
        for x, y, h in cols:
            m.box((1.5, 1.5, 0.5), (x, y, 0.1), TEMPLE[1])
            n = max(2, int(h / 1.1))
            for k in range(n):                                             # drums, a little out of true
                z = 0.35 + k * (h - 0.6) / n
                m.cyl(0.55, (h - 0.6) / n - 0.04, (x + rng.uniform(-0.05, 0.05), y, z), TEMPLE[k % 3], segs=8,
                      rot=(0, 0, rng.uniform(0, 1)))
            if i != 1:
                m.box((1.5, 1.5, 0.45), (x, y, h - 0.05), TEMPLE[2])
                m.box((0.5, 0.12, 0.3), (x, y - 0.76, h - 0.05), TEMPLE_GLOW, glow=True)       # a lit glyph
            else:
                for k in range(3):                                         # the rest of it, fallen
                    m.cyl(0.55, 0.9, (1.0 + k * 0.95, 0.5 + k * 0.2, 0.55), TEMPLE[k % 3], segs=8,
                          rot=(math.pi / 2, 0, 1.4 + k * 0.1))
            # a vine spiralling up, flowering with light
            pts = []
            turns = 2.2
            for k in range(25):
                t = k / 24
                a = t * turns * math.tau + rng.uniform(0, 0.2)
                pts.append(Vector((x + math.cos(a) * 0.62, y + math.sin(a) * 0.62, 0.1 + t * (h - 0.2))))
            tube(m, pts, [0.11] * 25, TEMPLE_MOSS[0], segs=4)
            for k in range(2, 25, 3):
                p = pts[k]
                a = math.atan2(p.y - y, p.x - x)
                frond(m, (p.x, p.y, p.z), a + rng.uniform(-0.5, 0.5), 0.6, 0.18, *TEMPLE_MOSS, rise=0.3, droop=0.8,
                      n=3, serrate=0.0)
                if k % 2:
                    m.ball(0.14, (p.x + math.cos(a) * 0.18, p.y + math.sin(a) * 0.18, p.z + 0.05),
                           ("#ff6aff", TEMPLE_GLOW)[k % 4 == 1], subdiv=0, glow=True)
        if i == 2:                                                         # a lintel across, mossy on top
            m.box((5.6, 1.4, 0.8), (0, 0, 5.55), TEMPLE[0])
            m.ball(1.0, (0.8, 0, 5.95), TEMPLE_MOSS[1], subdiv=1, scale=(1.8, 0.7, 0.3), jitter=0.06)
            m.box((1.2, 0.12, 0.4), (0, -0.72, 5.55), TEMPLE_GLOW, glow=True)
        m.build(r, rot_z=rng.uniform(-0.3, 0.3))


def spore_vent(variants):
    for i in range(2):
        r = root("spore_vent", i)
        rng = random.Random(970 + i)
        m = Model(f"spore_vent_{i}", 970 + i)
        mouths = []
        if i == 0:
            # a crater mound with a glowing green pool
            fs = []
            for k in range(8):
                a = k * math.tau / 8
                fs += lump(m, rng, (math.cos(a) * 1.7, math.sin(a) * 1.7, 0.5), (0.95, 0.8, 0.8), VENT[k % 3], n=10, flat=0.5)
            for f in fs:
                f.normal_update()
            recolor(m, fs, lambda f: VENT_TOP if f.normal.z > 0.75 else None)
            mouths.append((0, 0, 0.55, 1.4))
        else:
            # chimneys: three puffball stacks with lit throats
            for k, (x, y, h) in enumerate(((0, 0, 2.6), (1.3, 0.5, 1.7), (-0.9, 1.0, 1.2))):
                tube(m, [Vector((x, y, -0.2)), Vector((x, y, h * 0.5)), Vector((x + 0.1, y, h))],
                     [0.9 - k * 0.15, 0.7 - k * 0.1, 0.55 - k * 0.08], VENT[k % 3], segs=7, colors=[VENT[k % 3], VENT[(k + 1) % 3]])
                m.ball(0.75 - k * 0.12, (x + 0.1, y, h - 0.05), VENT[(k + 2) % 3], subdiv=1, scale=(1, 1, 0.5))
                mouths.append((x + 0.1, y, h + 0.25, 0.4 - k * 0.05))
            for k in range(5):
                a = rng.uniform(0, math.tau)
                lump(m, rng, (math.cos(a) * 1.8, math.sin(a) * 1.8, 0.1), (0.5, 0.45, 0.35), VENT[k % 3], n=8, flat=0.5)
        for k in range(6):                                                 # spore puffs, green spots on the ground round it
            a = rng.uniform(0, math.tau)
            d = rng.uniform(2.3, 3.0)
            m.ball(0.22, (math.cos(a) * d, math.sin(a) * d, 0.05), SPORE, subdiv=0, scale=(1, 1, 0.5), glow=True)
        m.build(r)
        g = Model(f"spore_vent_{i}_glow", 980 + i)
        mx, my, mz, _ = mouths[0]                                          # pivot on the main mouth: it swells in place
        for x, y, z, R in mouths:
            g.cyl(R, 0.3, (x - mx, y - my, z - mz - 0.15), SPORE, segs=8, glow=True)
            g.ball(R * 0.6, (x - mx, y - my, z - mz + 0.1), "#e0ffd0", subdiv=1, scale=(1, 1, 0.6), glow=True)
        obj = g.build(r, loc=(mx, my, mz))
        pulse(obj, f"spore_vent_{i}_breathe_idle", amp=0.18, period=2.4 + i * 0.6)


def build():
    glowcap(4)
    glowcap_tall(2)
    fungus_coral(3)
    reed_clump(2)
    dead_tree(3)
    lily_pad(2)
    ziggurat(2)
    vine_pillar(3)
    spore_vent(2)
