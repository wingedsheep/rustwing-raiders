"""ORU-TAL, the Cradle: fern jungle, black basalt over lava, crystal cliffs, a jade sea."""
from __future__ import annotations

import math
import random

from mathutils import Vector

from kit import Model
from props_a_lib import (bands, collider, crystal, frond, hull, lump, recolor, ribbon, root, splinter, sway,
                         pulse, tube, bend, arc)

# fern jungle: the ground is mid-green (#3f7f2e), so fronds go yellower and brighter, trunks dark
FROND = [("#86c040", "#679e30"), ("#79b43a", "#5a922c"), ("#94c84a", "#73a636")]
FROND_OLD = ("#a08a3a", "#806a2c")
FIDDLE = "#c8e070"
FERN_BARK = ["#4a3024", "#5a3a2a", "#3e281e"]
FERN_STUB = "#6a4a30"
CYCAD_LEAF = [("#2f7a5a", "#245f46"), ("#3a8a62", "#2a6a4c")]
CYCAD_BARK = ["#6e5636", "#85693f"]
CYCAD_CONE = ["#e8922a", "#c8701e"]
GIANT = [("#a8cc4a", "#86ac38"), ("#9ac040", "#7aa032"), ("#c87a3a", "#a85a2c")]   # last: red new growth
ROCK = ["#7a7068", "#857a70", "#6e655e"]
ROCK_TOP = ["#a09486", "#aa9e90", "#968a7e"]
ROCK_FOOT = "#5a524c"
MOSS = "#5a7a3a"
# basalt
BASALT = ["#232129", "#2d2b34", "#1e1c24"]
BASALT_TOP = ["#77737f", "#86818e", "#6c6876"]
LAVA = "#ff6a1a"
LAVA_HOT = "#ffc23a"
LAVA_DEEP = "#e8401a"
CRUST = ["#2a2024", "#3a2c2c", "#1e1a1e"]
CRUST_TOP = "#4a3c3c"
OBSIDIAN = ["#16121c", "#221a2a", "#1a1620"]
OBSIDIAN_GLINT = ["#5e4a86", "#7a68a8"]
CHAR = ["#1e1a1a", "#2a2422"]
ASH = "#8a8480"
EMBER = "#ff5a1a"
# crystal
CRYSTAL_ROCK = ["#4a3a5a", "#5a4a6a", "#3e3050"]
CRYSTAL_ROCK_TOP = "#7a6a8a"
MAGENTA = ("#ff6ae6", "#c83ab8", "#ffc8f6")   # light face, dark face, tip
CYAN = ("#6af0ff", "#24a8d0", "#d8fcff")
LILAC = ("#f0e0ff", "#b8a0e0", "#ffffff")
# jade sea
STACK = ["#7a6a5a", "#8a7a66", "#6a5a4c", "#94846e"]
STACK_TOP = "#3a6e2a"
STACK_TOP2 = "#4a8a32"
GUANO = "#b8ac92"


def two_tone(m, faces, light, dark, glow=False, lean=(-0.55, -0.35, 0.75)):
    L = Vector(lean).normalized()
    for f in faces:
        f.normal_update()
    recolor(m, faces, lambda f: (light if f.normal.dot(L) > 0.15 else dark, glow))


# --- fernwood ---------------------------------------------------------------------------------

def fern_crown(m, rng, base, n, length, width, palette=FROND, droop=1.0, old=2, fiddle=True):
    bx, by, bz = base
    turn = rng.uniform(0, math.tau)
    for k in range(n):
        yaw = turn + k * math.tau / n + rng.uniform(-0.2, 0.2)
        c1, c2 = palette[k % len(palette)]
        L = length * rng.uniform(0.85, 1.1)
        frond(m, (bx, by, bz), yaw, L, width, c1, c2, rise=rng.uniform(0.45, 0.75), droop=droop * rng.uniform(0.8, 1.1))
    for k in range(old):                                                   # older fronds hanging dead under the crown
        yaw = turn + (k + 0.5) * math.tau / max(old, 1) + rng.uniform(-0.3, 0.3)
        frond(m, (bx, by, bz - 0.15), yaw, length * 0.7, width * 0.7, *FROND_OLD, rise=-0.2, droop=0.9)
    if fiddle:
        for k in range(3):                                                 # curled fiddleheads in the heart
            a = turn + k * math.tau / 3
            m.ball(0.16, (bx + math.cos(a) * 0.18, by + math.sin(a) * 0.18, bz + 0.28), FIDDLE, subdiv=1,
                   scale=(1, 1, 0.8))


def tree_fern(variants):
    shapes = [  # height, lean, fronds, frond length
        (3.6, (0.3, 0.2), 10, 2.6),
        (5.0, (-0.6, 0.4), 11, 2.9),
        (2.6, (0.2, -0.3), 9, 2.3),
    ]
    for i, (h, lean, n, L) in enumerate(shapes):
        r = root("tree_fern", i, height=round(h + 0.8, 2))
        rng = random.Random(10 + i)
        m = Model(f"tree_fern_{i}_trunk", 10 + i)
        pts = bend((0, 0, 0), (0, 0, h), lean, n=6)
        tube(m, pts, [0.42, 0.3, 0.27, 0.26, 0.25, 0.26, 0.3], FERN_BARK[0], segs=6, twist=0.3,
             colors=[FERN_BARK[k % 3] for k in range(6)])
        for k in range(5):                                                 # old frond bases, knobbly up the trunk
            t = rng.uniform(0.3, 0.9)
            p = Vector(pts[int(t * 6)])
            a = rng.uniform(0, math.tau)
            m.box((0.18, 0.18, 0.3), (p.x + math.cos(a) * 0.25, p.y + math.sin(a) * 0.25, p.z), FERN_STUB,
                  rot=(math.sin(a) * 0.8, -math.cos(a) * 0.8, 0), taper=0.4)
        for k in range(4):                                                 # root mat
            a = k * math.tau / 4 + rng.uniform(-0.3, 0.3)
            m.plank_line((0, 0, 0.5), (math.cos(a) * 0.65, math.sin(a) * 0.65, -0.05), 0.14, 0.14, FERN_BARK[2])
        m.build(r)
        top = pts[-1]
        c = Model(f"tree_fern_{i}_crown", 20 + i)
        fern_crown(c, rng, (0, 0, 0), n, L, 0.42)
        crown = c.build(r, loc=tuple(top))
        sway(crown, f"tree_fern_{i}_sway_idle", amp=(0.05, 0.045), period=3.2 + i * 0.4, phase=i)


def cycad(variants):
    shapes = [  # trunks: (x, y, height, lean); fronds per crown
        ([(0, 0, 1.3, (0.1, 0.05))], 12),
        ([(0, 0, 0.6, (0, 0))], 14),
        ([(-0.5, 0, 2.0, (-0.35, 0.1)), (0.55, 0.2, 1.1, (0.3, 0.1))], 10),
    ]
    for i, (trunks, n) in enumerate(shapes):
        r = root("cycad", i, height=round(max(t[2] for t in trunks) + 1.4, 2))
        rng = random.Random(30 + i)
        m = Model(f"cycad_{i}", 30 + i)
        for j, (x, y, h, lean) in enumerate(trunks):
            pts = bend((x, y, 0), (x, y, h), lean, n=max(2, int(h / 0.3)))
            ns = len(pts) - 1
            tube(m, pts, [0.52] + [0.46 - 0.06 * k / ns for k in range(ns)], CYCAD_BARK[0], segs=7, twist=0.45,
                 colors=[CYCAD_BARK[k % 2] for k in range(ns)])
            tp = pts[-1]
            turn = rng.uniform(0, math.tau)
            for k in range(n):
                yaw = turn + k * math.tau / n
                c1, c2 = CYCAD_LEAF[k % 2]
                frond(m, (tp.x, tp.y, tp.z), yaw, rng.uniform(1.7, 2.1), 0.3, c1, c2, rise=0.9, droop=0.65,
                      serrate=0.5, fold=0.5, n=5)
            for k in range(6):                                             # an inner ring, upright
                yaw = turn + (k + 0.5) * math.tau / 6
                c1, c2 = CYCAD_LEAF[(k + 1) % 2]
                frond(m, (tp.x, tp.y, tp.z), yaw, 1.3, 0.24, c1, c2, rise=1.6, droop=1.0, serrate=0.5, fold=0.5, n=5)
            # the cone in the middle: big, orange, the crown's eye from above
            m.ball(0.34, (tp.x, tp.y, tp.z + 0.3), CYCAD_CONE[j % 2], subdiv=1, scale=(1, 1, 1.3))
            m.cyl(0.2, 0.3, (tp.x, tp.y, tp.z + 0.62), CYCAD_CONE[(j + 1) % 2], segs=6, r_top=0.03)
        m.build(r)


def giant_fern(variants):
    shapes = [(9, 3.0, 0.62, 0), (11, 3.4, 0.55, 1), (7, 2.6, 0.6, 2)]
    for i, (n, L, w, pal) in enumerate(shapes):
        r = root("giant_fern", i, height=2.6)
        rng = random.Random(50 + i)
        c = Model(f"giant_fern_{i}", 50 + i)
        turn = rng.uniform(0, math.tau)
        palette = [GIANT[0], GIANT[1]] if pal < 2 else [GIANT[0], GIANT[2], GIANT[1]]
        if pal == 1:
            palette = [GIANT[1], GIANT[0]]
        for k in range(n):
            yaw = turn + k * math.tau / n + rng.uniform(-0.15, 0.15)
            c1, c2 = palette[k % len(palette)]
            frond(c, (0, 0, 0.1), yaw, L * rng.uniform(0.85, 1.1), w, c1, c2, rise=rng.uniform(1.3, 1.7),
                  droop=rng.uniform(1.3, 1.6), n=8)
        for k in range(4):                                                 # fiddleheads unrolling in the middle
            a = turn + k * math.tau / 4
            c.cyl(0.07, 0.8, (math.cos(a) * 0.2, math.sin(a) * 0.2, 0), "#6a9a30", segs=5)
            c.ball(0.17, (math.cos(a) * 0.28, math.sin(a) * 0.28, 0.85), FIDDLE, subdiv=1)
        obj = c.build(r)
        sway(obj, f"giant_fern_{i}_sway_idle", amp=(0.035, 0.03), period=2.8 + i * 0.3, phase=i * 2)


def boulder(variants):
    """Generic boulders, neutral grey-brown, shared by many planets."""
    for i in range(4):
        r = root("boulder", i)
        rng = random.Random(70 + i)
        m = Model(f"boulder_{i}", 70 + i)
        if i == 0:
            fs = lump(m, rng, (0, 0, 0.55), (1.3, 1.05, 0.95), ROCK[0], n=16, flat=0.5)
        elif i == 1:
            fs = lump(m, rng, (0, 0, 0.35), (1.6, 1.2, 0.6), ROCK[1], n=14, flat=0.5)        # a low slab
        elif i == 2:
            fs = lump(m, rng, (0, 0, 0.8), (0.9, 0.85, 1.25), ROCK[2], n=14, flat=0.5)       # standing
            fs += lump(m, rng, (0.95, -0.3, 0.3), (0.55, 0.5, 0.45), ROCK[0], n=10, flat=0.5)
        else:                                                              # a tumble of three
            fs = []
            for k, (x, y, s) in enumerate(((-0.6, 0.1, 0.9), (0.7, 0.3, 0.75), (0.1, -0.75, 0.55))):
                fs += lump(m, rng, (x, y, s * 0.55), (s * 1.1, s, s * 0.85), ROCK[k], n=12, flat=0.5)
        for f in fs:
            f.normal_update()
        tops = ROCK_TOP[i % 3]
        recolor(m, fs, lambda f: tops if f.normal.z > 0.6 else (ROCK_FOOT if f.calc_center_median().z < 0.18 else None))
        m.build(r, rot_z=rng.uniform(0, math.tau))


# --- basalt steps -----------------------------------------------------------------------------

def hex_cells(rings, rad):
    """Centres of a hex packing of columns (radius rad), `rings` rings out from the middle."""
    w = rad * math.sqrt(3) * 1.0
    out = []
    for q in range(-rings, rings + 1):
        for s in range(-rings, rings + 1):
            if abs(q + s) > rings:
                continue
            x = w * (q + s / 2)
            y = w * s * math.sqrt(3) / 2
            out.append((x, y))
    return out


def basalt_columns(variants):
    shapes = [  # rings, column radius, peak height, slope (how fast heights fall off), lava seep
        (2, 0.55, 5.5, 1.3, False),
        (1, 0.65, 3.4, 0.9, True),
        (2, 0.5, 4.2, 0.6, True),
    ]
    for i, (rings, rad, peak, slope, seep) in enumerate(shapes):
        r = root("basalt_columns", i, height=peak)
        rng = random.Random(90 + i)
        m = Model(f"basalt_columns_{i}", 90 + i)
        tilt = rng.uniform(0, math.tau)
        for k, (x, y) in enumerate(hex_cells(rings, rad)):
            d = math.hypot(x, y)
            # a slanting stair: tallest on one side, stepping down
            side = (x * math.cos(tilt) + y * math.sin(tilt)) / max(rad * rings * 2, 1)
            h = peak - d * slope - side * peak * 0.4 + rng.uniform(-0.5, 0.3)
            if rng.random() < 0.18 and k:                                  # a gap where one fell
                if seep:                                                   # and lava welling up in it
                    m.cyl(rad * 0.9, 0.3, (x, y, -0.1), LAVA, segs=6, rot=(0, 0, math.pi / 6), glow=True)
                    m.cyl(rad * 0.45, 0.32, (x, y, -0.1), LAVA_HOT, segs=6, glow=True)
                continue
            h = max(0.5, h)
            col = BASALT[k % 3]
            fs = list(m.cyl(rad * 0.98, h, (x, y, -0.2), col, segs=6, rot=(0, 0, math.pi / 6)))
            recolor(m, fs, lambda f: BASALT_TOP[(k + 1) % 3] if f.calc_center_median().z > h - 0.25 and f.normal.z > 0.9 else None)
        for k in range(2):                                                 # a fallen column or two
            a = rng.uniform(0, math.tau)
            d = rad * (rings + 1.6)
            L = rng.uniform(1.4, 2.2)
            fs = m.cyl(rad * 0.9, L, (math.cos(a) * d, math.sin(a) * d, rad * 0.8), BASALT[k], segs=6,
                       rot=(math.pi / 2, 0, a + rng.uniform(-0.5, 0.5)))
        if seep:                                                           # lava glowing up between the feet
            for k in range(3):
                a = rng.uniform(0, math.tau)
                d = rad * (rings + 1.3)
                m.box((rng.uniform(1.4, 2.2), 0.4, 0.3), (math.cos(a) * d, math.sin(a) * d, 0.0), LAVA,
                      rot=(0, 0, a + math.pi / 2 + rng.uniform(-0.4, 0.4)), glow=True)
        m.build(r)


def lava_vent(variants):
    for i in range(2):
        r = root("lava_vent", i, height=1.6)
        rng = random.Random(110 + i)
        m = Model(f"lava_vent_{i}", 110 + i)
        if i == 0:
            # a spatter cone: a crusted ring of rock round a glowing pool
            fs = []
            for k in range(9):
                a = k * math.tau / 9
                fs += lump(m, rng, (math.cos(a) * 1.6, math.sin(a) * 1.6, 0.5),
                           (0.85, 0.75, 0.75 + rng.uniform(0, 0.35)), CRUST[k % 3], n=10, flat=0.5)
            for f in fs:
                f.normal_update()
            recolor(m, fs, lambda f: CRUST_TOP if f.normal.z > 0.7 else None)
            for k in range(4):                                             # glowing runnels down the outside
                a = rng.uniform(0, math.tau)
                pts = [Vector((math.cos(a) * d, math.sin(a) * d, 1.1 - (d - 1.4) * 0.9)) for d in (1.4, 1.9, 2.4, 2.8)]
                for p in pts:
                    p.z = max(p.z, 0.05)
                ribbon(m, pts, [0.2, 0.17, 0.14, 0.08], LAVA, LAVA_DEEP, fold=0.1, thick=0.06, glow=True)
            m.cyl(1.35, 0.3, (0, 0, 0.0), LAVA_DEEP, segs=9, glow=True)
            m.build(r)
            p = Model(f"lava_vent_{i}_pool", 120 + i)
            p.cyl(1.25, 0.5, (0, 0, -0.25), LAVA, segs=9, glow=True)
            p.cyl(0.7, 0.55, (0.15, 0.1, -0.25), LAVA_HOT, segs=7, glow=True)
            pool = p.build(r, loc=(0, 0, 0.55))
            pulse(pool, f"lava_vent_{i}_pulse_idle", amp=0.1, period=1.8, axes=(0.6, 0.6, 1.4))
        else:
            # a fissure: two black lips with lava welling up between, and spatter heaps
            fs = []
            for s in (-1, 1):
                for k in range(4):
                    x = -2.4 + k * 1.6
                    fs += lump(m, rng, (x, s * (0.85 + rng.uniform(0, 0.25)), 0.35),
                               (0.95, 0.6, 0.55 + rng.uniform(0, 0.25)), CRUST[(k + s) % 3], n=9, flat=0.5)
            fs += lump(m, rng, (3.3, 0.2, 0.6), (0.8, 0.8, 0.9), CRUST[0], n=10, flat=0.5)
            for f in fs:
                f.normal_update()
            recolor(m, fs, lambda f: CRUST_TOP if f.normal.z > 0.7 else None)
            m.build(r)
            p = Model(f"lava_vent_{i}_pool", 120 + i)
            p.box((5.6, 1.0, 0.4), (0, 0, -0.1), LAVA, glow=True, taper=0.9)
            for k in range(3):
                p.box((1.2, 0.5, 0.42), (-1.8 + k * 1.7, rng.uniform(-0.1, 0.1), -0.08), LAVA_HOT, glow=True)
            p.cyl(0.5, 0.4, (3.3, 0.2, 0.9), LAVA, segs=6, glow=True)
            pool = p.build(r, loc=(0, 0, 0.12))
            pulse(pool, f"lava_vent_{i}_pulse_idle", amp=0.1, period=2.2, axes=(0.15, 0.6, 1.6))


def obsidian_rock(variants):
    for i in range(3):
        r = root("obsidian_rock", i)
        rng = random.Random(130 + i)
        m = Model(f"obsidian_rock_{i}", 130 + i)
        fs = []
        if i == 0:
            fs += splinter(m, rng, (0, 0, -0.2), 0.9, 2.2, (0.4, 0.3), OBSIDIAN[0], sides=5)
            fs += splinter(m, rng, (0.8, -0.4, -0.2), 0.6, 1.3, (0.4, -0.2), OBSIDIAN[1], sides=4)
        elif i == 1:
            fs += lump(m, rng, (0, 0, 0.4), (1.4, 1.0, 0.7), OBSIDIAN[1], n=9, flat=0.5)       # a glassy slab
            fs += splinter(m, rng, (-0.6, 0.5, 0.2), 0.45, 1.4, (-0.3, 0.2), OBSIDIAN[0], sides=4)
        else:
            for k in range(4):
                a = k * math.tau / 4 + rng.uniform(-0.3, 0.3)
                fs += splinter(m, rng, (math.cos(a) * 0.5, math.sin(a) * 0.5, -0.2), 0.5, rng.uniform(0.9, 2.0),
                               (math.cos(a) * 0.6, math.sin(a) * 0.6), OBSIDIAN[k % 3], sides=4)
        for f in fs:
            f.normal_update()
        # glassy: faces turned to the sky glint violet, the rest near black
        L = Vector((-0.5, -0.4, 0.75)).normalized()
        recolor(m, fs, lambda f: OBSIDIAN_GLINT[1] if f.normal.dot(L) > 0.8 else (OBSIDIAN_GLINT[0] if f.normal.dot(L) > 0.5 else None))
        for v in m.bm.verts:
            v.co *= 1.35
        m.build(r, rot_z=rng.uniform(0, math.tau))


def charred_cycad(variants):
    for i in range(2):
        h = (1.6, 2.4)[i]
        r = root("charred_cycad", i, height=h + 0.6)
        rng = random.Random(150 + i)
        m = Model(f"charred_cycad_{i}", 150 + i)
        pts = bend((0, 0, 0), (0, 0, h), (0.2 * (1 - 2 * i), 0.15), n=max(3, int(h / 0.3)))
        ns = len(pts) - 1
        tube(m, pts, [0.55] + [0.48 - 0.1 * k / ns for k in range(ns)], CHAR[0], segs=7, twist=0.45,
             colors=[CHAR[k % 2] for k in range(ns)])
        for k in range(6):                                                 # embers still glowing in the scales
            p = pts[rng.randrange(1, ns)]
            a = rng.uniform(0, math.tau)
            m.box((0.22, 0.12, 0.14), (p.x + math.cos(a) * 0.42, p.y + math.sin(a) * 0.42, p.z), EMBER,
                  rot=(0, 0, a), glow=True)
        tp = pts[-1]
        turn = rng.uniform(0, math.tau)
        for k in range(9):                                                 # burnt frond stubs, ash at the tips
            yaw = turn + k * math.tau / 9
            L = rng.uniform(0.5, 1.2)
            pts2 = arc((tp.x, tp.y, tp.z), yaw, L, 0.7, 0.4, n=3)
            ribbon(m, pts2, [0.07, 0.06, 0.05, 0.04], CHAR[1], fold=0.0, thick=0.08)
            e = pts2[-1]
            m.box((0.12, 0.12, 0.1), tuple(e), ASH)
        if i == 1:                                                         # two dead fronds hanging on
            for k in range(2):
                frond(m, (tp.x, tp.y, tp.z), turn + k * 2.5, 1.7, 0.22, "#5a3e26", "#4a3220", rise=0.1,
                      droop=1.2, serrate=0.6)
        m.cyl(0.32, 0.2, (tp.x, tp.y, tp.z - 0.05), EMBER, segs=7, glow=True)   # its heart still smoulders
        m.cyl(0.42, 0.12, (tp.x, tp.y, tp.z + 0.05), CHAR[0], segs=7, r_top=0.36)
        m.build(r)


# --- prism cliffs -----------------------------------------------------------------------------

def _crystals(m, rng, items, tones, base_rock=True, rock_r=1.0):
    """items: (x, y, tilt_x, tilt_y, radius, length)."""
    light, dark, tipc = tones
    for x, y, tx, ty, rad, L in items:
        fs = crystal(m, (x, y, -0.3), (tx, ty, 1), rad, L, light, sides=6, tip=0.3, spin=rng.uniform(0, 1))
        two_tone(m, fs[:len(fs)], light, dark, glow=True)
        # the point brighter still
        for f in fs:
            if f.calc_center_median().z > (L * 0.75):
                pass
    if base_rock:
        rs = []
        for k in range(5):
            a = k * math.tau / 5 + rng.uniform(-0.3, 0.3)
            rs += lump(m, rng, (math.cos(a) * rock_r, math.sin(a) * rock_r, 0.2), (0.75, 0.65, 0.5),
                       CRYSTAL_ROCK[k % 3], n=9, flat=0.5)
        for f in rs:
            f.normal_update()
        recolor(m, rs, lambda f: CRYSTAL_ROCK_TOP if f.normal.z > 0.7 else None)


def crystal_cluster(variants):
    palettes = [MAGENTA, CYAN, None]
    for i in range(3):
        r = root("crystal_cluster", i, height=4.0)
        rng = random.Random(170 + i)
        m = Model(f"crystal_cluster_{i}", 170 + i)
        items = []
        n = (7, 6, 8)[i]
        for k in range(n):
            a = k * math.tau / n + rng.uniform(-0.3, 0.3)
            d = rng.uniform(0.1, 0.7) if k else 0
            lean = rng.uniform(0.2, 0.7) if k else 0.08
            L = rng.uniform(1.6, 3.8) if k else 4.0
            items.append((math.cos(a) * d, math.sin(a) * d, math.cos(a) * lean, math.sin(a) * lean,
                          rng.uniform(0.28, 0.45) if k else 0.55, L))
        if palettes[i]:
            _crystals(m, rng, items, palettes[i], rock_r=1.1)
        else:                                                              # mixed: pale crystals, coloured hearts
            for k, it in enumerate(items):
                _crystals(m, rng, [it], (MAGENTA, CYAN, LILAC)[k % 3], base_rock=(k == 0), rock_r=1.1)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def crystal_spire(variants):
    """Obstacles: crystal grown taller than you fly. A collider on every column that reaches 10."""
    shapes = [  # main length, palette, secondaries (angle, distance, lean, length)
        (17.0, LILAC, MAGENTA, [(0.4, 1.4, 0.18, 11.0), (2.6, 1.3, 0.2, 8.0), (4.4, 1.2, 0.3, 5.5)]),
        (15.0, CYAN, LILAC, [(1.2, 1.3, 0.22, 12.0), (3.6, 1.2, 0.3, 6.0), (5.4, 1.1, 0.35, 4.0)]),
    ]
    for i, (Lmain, main, accent, secs) in enumerate(shapes):
        r = root("crystal_spire", i, height=Lmain, obstacle=1)
        rng = random.Random(190 + i)
        m = Model(f"crystal_spire_{i}", 190 + i)
        lean = (0.05, 0.04)
        fs = crystal(m, (0, 0, -0.5), (lean[0], lean[1], 1), 1.3, Lmain + 0.5, main[0], sides=6, tip=0.22)
        two_tone(m, fs, main[0], main[1], glow=(main is CYAN))
        # glowing veins up the big one
        for k in range(3):
            z = 3 + k * 4
            m.box((0.3, 2.75, 0.5), (lean[0] * z, lean[1] * z, z), accent[0] if main is not CYAN else LILAC[2],
                  rot=(0.2, 0, k * 1.1), glow=True)
        collider(r, 0, 0, 1.5)
        for a, d, ln, L in secs:
            bx, by = math.cos(a) * d, math.sin(a) * d
            dirv = Vector((math.cos(a) * ln, math.sin(a) * ln, 1)).normalized()
            fs = crystal(m, (bx, by, -0.3), dirv, 0.8 if L > 7 else 0.55, L, accent[0], sides=6, tip=0.28,
                         spin=rng.uniform(0, 1))
            two_tone(m, fs, accent[0], accent[1], glow=True)
            top = Vector((bx, by, -0.3)) + dirv * L
            if top.z >= 10:                                                # tall enough to hit: where it crosses 10
                p = Vector((bx, by, -0.3)) + dirv * ((10.3) / dirv.z)
                collider(r, p.x, p.y, 0.9)
        # small shards and a rock foot
        for k in range(7):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(1.6, 2.6)
            fs = crystal(m, (math.cos(a) * d, math.sin(a) * d, -0.2), (math.cos(a) * 0.6, math.sin(a) * 0.6, 1),
                         rng.uniform(0.25, 0.4), rng.uniform(1.0, 2.4), accent[0], tip=0.35)
            two_tone(m, fs, accent[0], accent[1], glow=True)
        rs = []
        for k in range(6):
            a = k * math.tau / 6 + rng.uniform(-0.3, 0.3)
            rs += lump(m, rng, (math.cos(a) * 2.0, math.sin(a) * 2.0, 0.3), (1.1, 0.9, 0.8), CRYSTAL_ROCK[k % 3],
                       n=9, flat=0.5)
        for f in rs:
            f.normal_update()
        recolor(m, rs, lambda f: CRYSTAL_ROCK_TOP if f.normal.z > 0.7 else None)
        m.build(r)


# --- jade shallows ----------------------------------------------------------------------------

def strata(m, rng, x, y, layers, sides=8, jit=0.15, drift=(0.0, 0.0), top=None, colors=None):
    """A stack of faceted drums: layers = [(z0, z1, r0, r1), ...]; each a hull with a jittered rim,
    drifting by `drift` per layer so the pillar wanders. Returns all faces."""
    fs = []
    cx, cy = x, y
    for j, (z0, z1, r0, r1) in enumerate(layers):
        pts = []
        off = rng.uniform(0, math.tau)
        nx, ny = cx + drift[0] + rng.uniform(-0.1, 0.1), cy + drift[1] + rng.uniform(-0.1, 0.1)
        for k in range(sides):
            a = off + k * math.tau / sides
            j0 = 1 + rng.uniform(-jit, jit)
            j1 = 1 + rng.uniform(-jit, jit)
            pts.append((cx + math.cos(a) * r0 * j0, cy + math.sin(a) * r0 * j0, z0))
            pts.append((nx + math.cos(a + 0.2) * r1 * j1, ny + math.sin(a + 0.2) * r1 * j1, z1))
        col = (colors or STACK)[j % len(colors or STACK)]
        fs += hull(m, pts, col)
        cx, cy = nx, ny
    return fs, (cx, cy)


def sea_stack(variants):
    """Obstacles: pillars of rock out of the jade sea with jungle on their heads."""
    shapes = [(15.0, 2.6, (0.12, 0.05)), (17.0, 2.2, (-0.1, 0.12))]
    for i, (H, R, drift) in enumerate(shapes):
        r = root("sea_stack", i, height=H + 1.5, obstacle=1)
        rng = random.Random(210 + i)
        m = Model(f"sea_stack_{i}", 210 + i)
        n = 6
        layers = []
        z = -1.0
        for k in range(n):
            z1 = -1.0 + (H + 1.0) * (k + 1) / n
            r0 = R * (1.25 - 0.25 * k / n) * (1.08 if k % 2 else 0.98)
            r1 = R * (1.2 - 0.25 * (k + 1) / n) * (0.98 if k % 2 else 1.08)
            if k == n - 1:
                r1 = R * 1.12                                              # an overhanging lip under the jungle
            layers.append((z, z1, r0, r1))
            z = z1
        fs, (tx, ty) = strata(m, rng, 0, 0, layers, sides=8, drift=drift)
        for f in fs:
            f.normal_update()
        # streaks of guano on the sunny shelves, green moss on the top ledges
        recolor(m, fs, lambda f: (STACK_TOP2 if f.calc_center_median().z > H - 1.2 else GUANO) if f.normal.z > 0.6 else None)
        # a cap of jungle: a mound of green and tree ferns standing on it
        m.cyl(R * 1.1, 0.7, (tx, ty, H - 0.2), STACK_TOP, segs=8, r_top=R * 0.8)
        m.ball(R * 0.8, (tx + 0.3, ty - 0.2, H + 0.4), STACK_TOP2, subdiv=1, scale=(1, 1, 0.45), jitter=0.12)
        for k in range(2 + i):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.3, R * 0.6)
            fx, fy = tx + math.cos(a) * d, ty + math.sin(a) * d
            h = rng.uniform(1.2, 2.0)
            m.cyl(0.18, h, (fx, fy, H), FERN_BARK[0], segs=5, r_top=0.14)
            fern_crown(m, rng, (fx, fy, H + h), 8, 1.6, 0.32, old=0, fiddle=False)
        for k in range(5):                                                 # fern fringe hanging over the lip
            a = k * math.tau / 5 + rng.uniform(-0.2, 0.2)
            frond(m, (tx + math.cos(a) * R * 0.95, ty + math.sin(a) * R * 0.95, H + 0.3), a, 1.6, 0.35,
                  *FROND[k % 3], rise=0.2, droop=1.4)
        # fallen blocks at its foot
        for k in range(3):
            a = rng.uniform(0, math.tau)
            lump(m, rng, (math.cos(a) * R * 1.5, math.sin(a) * R * 1.5, 0.2), (0.9, 0.8, 0.7), STACK[k], n=9, flat=0.5)
        collider(r, 0, 0, R * 1.15)
        m.build(r)


def build():
    tree_fern(3)
    cycad(3)
    giant_fern(3)
    boulder(4)
    basalt_columns(3)
    lava_vent(2)
    obsidian_rock(3)
    charred_cycad(2)
    crystal_cluster(3)
    crystal_spire(2)
    sea_stack(2)
