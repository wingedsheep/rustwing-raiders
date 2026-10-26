"""ORU-TAL, the Cradle: fern jungle, black basalt over lava, crystal cliffs, a jade sea."""
from __future__ import annotations

import math
import random

from mathutils import Vector

from kit import Model
from props_a_lib import (UP, bands, collider, crystal, frond, hull, lump, recolor, ribbon, root, splinter, sway,
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
STACK = ["#a89880", "#bcac90", "#9a8a72", "#c8b898"]   # pale banded limestone
WEED = "#3a6a5a"
VINE_GREEN = "#3e7a34"
STACK_TOP = "#3a6e2a"
STACK_TOP2 = "#4a8a32"
GUANO = "#b8ac92"


def two_tone(m, faces, light, dark, glow=False, lean=(-0.55, -0.35, 0.75)):
    L = Vector(lean).normalized()
    for f in faces:
        f.normal_update()
    recolor(m, faces, lambda f: (light if f.normal.dot(L) > 0.15 else dark, glow))


# --- fernwood ---------------------------------------------------------------------------------
# Three canopy tones so a grove isn't one green: lime (the young), emerald (the shade-grown), bronze
# (the old and sun-scorched); rust for new growth unrolling. The ground is mid-green (#3f7f2e).
LIME = [("#8cc43e", "#6a9e2e"), ("#80b838", "#5e922a")]
EMERALD = [("#3f9e62", "#2a7648"), ("#4aac6a", "#33804e")]
BRONZE = [("#b8b046", "#8c8832"), ("#a8a240", "#7e7a2e")]
RUST = ("#cc6c34", "#9a4a26")


def _face_to(f, nrm, up=True):
    f.normal_update()
    if (f.normal.dot(nrm) > 0) != up:
        f.normal_flip()


def leaf(m, pts, widths, color, color2=None, fold=0.35, glow=False):
    """A lean ribbon: a V-folded top over a flat underside, no edges (half a ribbon()'s faces).
    For the many fronds of scattered plants, where tris add up."""
    bm = m.bm
    n = len(pts)
    rows, nrms = [], []
    for i, c in enumerate(pts):
        c = Vector(c)
        t = (Vector(pts[min(i + 1, n - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        s = t.cross(UP)
        if s.length < 1e-4:
            s = Vector((1, 0, 0))
        s.normalize()
        nrm = s.cross(t).normalized()
        if nrm.z < 0:
            nrm = -nrm
        w = max(widths[i], 0.01)
        rows.append([bm.verts.new(p) for p in (c - s * w, c + nrm * fold * w, c + s * w)])
        nrms.append(nrm)
    i1 = m._slot(color, glow)
    i2 = m._slot(color2 or color, glow)
    out = []
    for i in range(n - 1):
        a, b = rows[i], rows[i + 1]
        nrm = (nrms[i] + nrms[i + 1]).normalized()
        fa = bm.faces.new((a[0], a[1], b[1], b[0]))
        fb = bm.faces.new((a[1], a[2], b[2], b[1]))
        fu = bm.faces.new((a[0], b[0], b[2], a[2]))
        _face_to(fa, nrm)
        _face_to(fb, nrm)
        _face_to(fu, nrm, up=False)
        fa.material_index = i1
        fb.material_index = i2
        fu.material_index = i2
        out += [fa, fb, fu]
    return out


def lfrond(m, base, yaw, length, width, color, color2=None, rise=0.6, droop=0.9, n=5, serrate=0.35, fold=0.35, tip=0.15):
    """frond(), built with leaf(): the same arching, toothed blade at half the cost."""
    pts = arc(base, yaw, length, rise, droop, n)
    ws = []
    for i in range(n + 1):
        t = i / n
        w = width * max(tip, math.sin(math.pi * min(1.0, t * 0.85 + 0.08)))
        if serrate and 0 < i < n:
            w *= (1 - serrate) if i % 2 else 1.0
        ws.append(w if i else width * 0.25)
    ws[-1] = width * 0.08
    return leaf(m, pts, ws, color, color2, fold=fold)


def fern_crown(m, rng, base, n, length, width, palette=FROND, droop=1.0, old=2, fiddle=True, accent=None):
    """A tree fern's crown: n arching fronds, `old` dead ones hanging under, fiddleheads in the heart.
    `accent` (a colour pair) paints a couple of fronds as new growth."""
    bx, by, bz = base
    turn = rng.uniform(0, math.tau)
    seg = 7 if length > 4 else 5
    for k in range(n):
        yaw = turn + k * math.tau / n + rng.uniform(-0.2, 0.2)
        c1, c2 = palette[k % len(palette)]
        if accent and k % max(3, n // 2) == 1:
            c1, c2 = accent
        L = length * rng.uniform(0.82, 1.1)
        lfrond(m, (bx, by, bz), yaw, L, width, c1, c2, rise=rng.uniform(0.45, 0.75),
               droop=droop * rng.uniform(0.8, 1.15), n=seg)
    for k in range(old):                                                   # older fronds hanging dead under the crown
        yaw = turn + (k + 0.5) * math.tau / max(old, 1) + rng.uniform(-0.3, 0.3)
        lfrond(m, (bx, by, bz - 0.15), yaw, length * 0.75, width * 0.75, *FROND_OLD, rise=-0.15, droop=0.9, n=4)
    if fiddle:
        for k in range(3):                                                 # curled fiddleheads in the heart
            a = turn + k * math.tau / 3
            m.ball(0.17, (bx + math.cos(a) * 0.18, by + math.sin(a) * 0.18, bz + 0.26),
                   accent[0] if accent else FIDDLE, subdiv=1, scale=(1, 1, 0.8))


def _fern_trunk(m, rng, pts, r0=0.4, r1=0.26, knobs=5, roots=4):
    tube(m, pts, [r0, r1 * 1.15, r1 * 1.04, r1, r1 * 0.97, r1, r1 * 1.12][:len(pts)] + [r1] * max(0, len(pts) - 7),
         FERN_BARK[0], segs=6, twist=0.3, colors=[FERN_BARK[k % 3] for k in range(len(pts) - 1)])
    for k in range(knobs):                                                 # old frond bases, knobbly up the trunk
        p = Vector(pts[rng.randrange(2, len(pts) - 1)])
        a = rng.uniform(0, math.tau)
        m.box((0.2, 0.2, 0.3), (p.x + math.cos(a) * r1, p.y + math.sin(a) * r1, p.z), FERN_STUB,
              rot=(math.sin(a) * 0.8, -math.cos(a) * 0.8, 0), taper=0.4)
    for k in range(roots):                                                 # root mat
        a = k * math.tau / roots + rng.uniform(-0.3, 0.3)
        b = Vector(pts[0])
        m.plank_line((b.x, b.y, 0.5), (b.x + math.cos(a) * 0.7, b.y + math.sin(a) * 0.7, -0.05), 0.16, 0.14, FERN_BARK[2])


def tree_fern(variants):
    """The canopy's workhorse. Five personalities: a young lime one, an old emerald giant in a skirt of
    dead fronds, a short bronze one, a forked pair, and one something big has been eating."""
    shapes = [  # trunks (x, y, h, lean); fronds, frond length, palette, dead fronds, accent
        ([(0, 0, 3.2, (0.3, 0.2))], 9, 2.0, LIME, 2, None),
        ([(0, 0, 4.6, (-0.7, 0.4))], 10, 2.2, EMERALD, 6, None),
        ([(0, 0, 2.2, (0.2, -0.3))], 8, 1.7, BRONZE, 1, RUST),
        ([(0, 0, 4.0, (0.7, 0.3)), (0.2, 0.1, 2.8, (-0.8, -0.4))], 8, 1.8, LIME, 2, None),
        ([(0, 0, 3.8, (0.4, -0.5))], 9, 2.0, EMERALD, 2, None),
    ]
    for i, (trunks, n, L, pal, old, accent) in enumerate(shapes):
        r = root("tree_fern", i, height=round(max(t[2] for t in trunks) + 0.8, 2))
        rng = random.Random(10 + i)
        m = Model(f"tree_fern_{i}_trunk", 10 + i)
        tops = []
        for j, (x, y, h, lean) in enumerate(trunks):
            pts = bend((x, y, 0), (x, y, h), lean, n=6)
            _fern_trunk(m, rng, pts, r0=0.4 if j == 0 else 0.3, r1=0.26 if j == 0 else 0.21, roots=4 if j == 0 else 0)
            tops.append(pts[-1])
        m.build(r)
        for j, top in enumerate(tops):
            c = Model(f"tree_fern_{i}_crown{j}", 20 + i * 3 + j)
            if i == 4:                                                     # browsed: half the crown bitten to stubs
                turn = rng.uniform(0, math.tau)
                for k in range(n):
                    yaw = turn + k * math.tau / n + rng.uniform(-0.15, 0.15)
                    if k < n // 2 + 1:
                        c1, c2 = pal[k % 2]
                        lfrond(c, (0, 0, 0), yaw, L * rng.uniform(0.85, 1.1), 0.42, c1, c2, rise=0.6, droop=1.0)
                    else:                                                  # torn stubs, yellowing where they were bitten
                        lfrond(c, (0, 0, 0), yaw, L * rng.uniform(0.3, 0.45), 0.3, "#c8b45a", "#9a8a40", rise=0.7,
                               droop=0.6, n=3, serrate=0.0)
                c.ball(0.2, (0, 0, 0.22), FIDDLE, subdiv=1, scale=(1, 1, 0.8))
                lfrond(c, (0, 0, -0.15), turn + 2.0, L * 0.8, 0.3, *FROND_OLD, rise=-0.2, droop=0.9, n=4)
            else:
                fern_crown(c, rng, (0, 0, 0), n - j * 2, L * (1 - 0.15 * j), 0.42, palette=pal if j == 0 else EMERALD,
                           old=old if j == 0 else 1, accent=accent)
            crown = c.build(r, loc=tuple(top))
            sway(crown, f"tree_fern_{i}_crown{j}_sway_idle", amp=(0.05, 0.045), period=3.2 + i * 0.4 + j * 0.5, phase=i + j)


def cycad(variants):
    """Stiff-leaved, cone-hearted, older than the ferns. A squat one, a clump of pups, a tall pair,
    and a female ringed with red seed."""
    shapes = [  # trunks (x, y, height, lean, fronds, frond length); leaf palette; heart
        ([(0, 0, 1.1, (0.1, 0.05), 11, 1.8)], 0, "cone"),
        ([(0, 0, 0.3, (0, 0), 8, 1.2), (1.1, 0.4, 0.15, (0, 0), 7, 1.0), (0.3, -1.0, 0.2, (0, 0), 6, 0.9)], 1, None),
        ([(-0.5, 0, 2.0, (-0.35, 0.1), 10, 1.7), (0.55, 0.2, 1.1, (0.3, 0.1), 9, 1.5)], 0, "cone"),
        ([(0, 0, 0.9, (0.0, 0.1), 12, 1.9)], 2, "seed"),
    ]
    leaves = [[("#2f7a5a", "#245f46"), ("#3a8a62", "#2a6a4c")],
              [("#4a9a5a", "#357a44"), ("#5aa862", "#3f844a")],
              [("#6a8a3e", "#4e6c2e"), ("#7a9a46", "#5a7a34")]]
    for i, (trunks, pal, heart) in enumerate(shapes):
        r = root("cycad", i, height=round(max(t[2] for t in trunks) + 1.4, 2))
        rng = random.Random(30 + i)
        m = Model(f"cycad_{i}", 30 + i)
        for j, (x, y, h, lean, n, L) in enumerate(trunks):
            if h > 0.35:
                pts = bend((x, y, 0), (x, y, h), lean, n=max(2, int(h / 0.3)))
                ns = len(pts) - 1
                tube(m, pts, [0.5] + [0.44 - 0.06 * k / ns for k in range(ns)], CYCAD_BARK[0], segs=7, twist=0.45,
                     colors=[CYCAD_BARK[k % 2] for k in range(ns)])
                tp = pts[-1]
            else:
                tp = Vector((x, y, h))
                m.cyl(0.4, h + 0.1, (x, y, -0.05), CYCAD_BARK[1], segs=6, r_top=0.3)
            turn = rng.uniform(0, math.tau)
            for k in range(n):
                yaw = turn + k * math.tau / n + rng.uniform(-0.1, 0.1)
                c1, c2 = leaves[pal][k % 2]
                lfrond(m, (tp.x, tp.y, tp.z), yaw, L * rng.uniform(0.9, 1.12), 0.3, c1, c2, rise=0.95, droop=0.7,
                       serrate=0.5, fold=0.5, n=4)
            if heart == "cone":                                            # the cone: big, orange, the crown's eye
                m.ball(0.32, (tp.x, tp.y, tp.z + 0.28), CYCAD_CONE[j % 2], subdiv=1, scale=(1, 1, 1.3))
                m.cyl(0.18, 0.3, (tp.x, tp.y, tp.z + 0.58), CYCAD_CONE[(j + 1) % 2], segs=6, r_top=0.03)
            elif heart == "seed":                                          # a ring of fat red seeds in a woolly nest
                m.cyl(0.5, 0.25, (tp.x, tp.y, tp.z), "#c8a870", segs=7, r_top=0.42)
                for k in range(7):
                    a = turn + k * math.tau / 7
                    m.ball(0.17, (tp.x + math.cos(a) * 0.36, tp.y + math.sin(a) * 0.36, tp.z + 0.3), "#d8402a",
                           subdiv=0, scale=(1, 1, 1.2))
            else:                                                          # pups: a lime shoot in the heart
                m.ball(0.16, (tp.x, tp.y, tp.z + 0.2), FIDDLE, subdiv=0)
        m.build(r)


def giant_fern(variants):
    """Ground ferns as tall as a man: a lime shuttlecock, one flushed red with new growth, a low dark spread."""
    shapes = [  # fronds, length, width, rise, droop, palette
        (9, 2.1, 0.5, 1.5, 1.4, LIME),
        (8, 1.9, 0.48, 1.4, 1.4, [LIME[0], RUST, LIME[1], BRONZE[0]]),
        (7, 2.3, 0.55, 0.55, 0.8, EMERALD),
    ]
    for i, (n, L, w, rise, droop, palette) in enumerate(shapes):
        r = root("giant_fern", i, height=2.2)
        rng = random.Random(50 + i)
        c = Model(f"giant_fern_{i}", 50 + i)
        turn = rng.uniform(0, math.tau)
        for k in range(n):
            yaw = turn + k * math.tau / n + rng.uniform(-0.15, 0.15)
            c1, c2 = palette[k % len(palette)]
            lfrond(c, (0, 0, 0.1), yaw, L * rng.uniform(0.85, 1.1), w, c1, c2, rise=rise * rng.uniform(0.9, 1.1),
                   droop=droop * rng.uniform(0.9, 1.1), n=6)
        for k in range(3):                                                 # fiddleheads unrolling in the middle
            a = turn + k * math.tau / 3
            c.cyl(0.08, 0.7, (math.cos(a) * 0.2, math.sin(a) * 0.2, 0), "#6a9a30", segs=5)
            c.ball(0.18, (math.cos(a) * 0.26, math.sin(a) * 0.26, 0.75), RUST[0] if i == 1 else FIDDLE, subdiv=1)
        obj = c.build(r)
        sway(obj, f"giant_fern_{i}_sway_idle", amp=(0.035, 0.03), period=2.8 + i * 0.3, phase=i * 2)


def bracken(variants):
    """Ground cover: a bed of little ferns round a mossy hump, in mixed greens."""
    tones = [(LIME + EMERALD, FIDDLE, None), (BRONZE + LIME, RUST[0], None), (EMERALD + [("#5aa848", "#3e8436")], FIDDLE, "#e8922a")]
    for i, (pal, fid, fungus) in enumerate(tones):
        r = root("orutal_bracken", i, height=1.0)
        rng = random.Random(60 + i)
        m = Model(f"orutal_bracken_{i}", 60 + i)
        fs = lump(m, rng, (rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), 0.0), (1.0, 0.8, 0.45), MOSS, n=10, flat=0.0)
        recolor(m, fs, lambda f: "#6a8c40" if f.normal.z > 0.6 else None)
        spots = [(0, 0, 1.2)] + [(math.cos(a) * d, math.sin(a) * d, s) for a, d, s in
                                 [(rng.uniform(0, math.tau), rng.uniform(1.0, 1.8), rng.uniform(0.7, 1.0)) for _ in range(4 + i % 2)]]
        for k, (x, y, s) in enumerate(spots):
            turn = rng.uniform(0, math.tau)
            nf = 5
            for f in range(nf):
                c1, c2 = pal[(k + f) % len(pal)]
                lfrond(m, (x, y, 0.05), turn + f * math.tau / nf + rng.uniform(-0.2, 0.2), s * rng.uniform(0.9, 1.15),
                       0.3 * s + 0.05, c1, c2, rise=0.9, droop=1.1, n=4)
            if k % 2 == 0:
                m.ball(0.14, (x, y, 0.35 * s), fid, subdiv=0)
        if fungus:
            for k in range(3):
                a = rng.uniform(0, math.tau)
                m.cyl(0.3, 0.1, (math.cos(a) * 0.7, math.sin(a) * 0.7, 0.25 + k * 0.08), fungus, segs=6, r_top=0.24)
        m.build(r, rot_z=rng.uniform(0, math.tau))


SCALE_BARK = ["#5e6644", "#6e7650", "#545a3c"]
SCALE_TUFT = [("#2a6a46", "#5aaa5e"), ("#24603e", "#68b85e"), ("#33743e", "#7ab850")]   # (body, sunlit top)
SCALE_CONE = "#c89a3a"


def _tuft(m, rng, p, R, tone):
    """A scale tree's pompom of grassy leaves: a dark core bristling with leaf spikes, the upward ones
    sunlit, a cone hanging under."""
    body, top = tone
    m.ball(R * 0.55, (p.x, p.y, p.z + R * 0.15), body, subdiv=1, scale=(1, 1, 0.75), jitter=R * 0.08)
    n = 13
    for k in range(n):
        u = (k + 0.5) / n                                                  # spread over the upper dome
        el = math.radians(-20 + 100 * u ** 0.8)
        a = k * 2.4 + rng.uniform(-0.2, 0.2)
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
        L = R * rng.uniform(0.95, 1.25)
        tube(m, [p + d * R * 0.2, p + d * L], [0.2 * R, 0.0], top if el > 0.6 else body, segs=4)
    m.cyl(0.13, 0.5, (p.x + 0.2, p.y - 0.1, p.z - R * 0.4), SCALE_CONE, segs=5, r_top=0.04, rot=(math.pi, 0, 0))


def scale_tree(variants):
    """Hero trees of the basin: tall poles of diamond-scaled bark that fork and end in dark pompoms of
    grassy leaves. From above, a scatter of round dark tufts among the fern stars."""
    shapes = [  # trunk height, lean, forks (levels), tuft size
        (3.2, (0.3, 0.1), 2, 1.1),
        (4.4, (-0.2, 0.3), 0, 1.4),
        (3.4, (0.5, -0.4), 1, 1.15),
    ]
    for i, (h, lean, forks, R) in enumerate(shapes):
        rng = random.Random(80 + i)
        r = root("orutal_scale_tree", i, height=round(h + 1.6 * forks + R * 1.6, 2))
        m = Model(f"orutal_scale_tree_{i}", 80 + i)
        pts = bend((0, 0, 0), (0, 0, h), lean, n=6)
        tube(m, pts, [0.55, 0.42, 0.36, 0.33, 0.31, 0.29, 0.27], SCALE_BARK[0], segs=6, twist=0.5,
             colors=[SCALE_BARK[k % 3] for k in range(6)])
        for k in range(5):                                                 # buttress roots
            a = k * math.tau / 5 + rng.uniform(-0.3, 0.3)
            m.plank_line((0, 0, 0.7), (math.cos(a) * 0.9, math.sin(a) * 0.9, -0.05), 0.22, 0.18, SCALE_BARK[2])
        tips = [(Vector(pts[-1]), Vector(pts[-1]) - Vector(pts[-2]), 0.27)]
        for lvl in range(forks):
            nxt = []
            for p, d, rad in tips:
                d = d.normalized()
                side = d.cross(UP)
                if side.length < 1e-3:
                    side = Vector((1, 0, 0))
                side.normalize()
                spin = rng.uniform(0, math.pi)
                side = side * math.cos(spin) + d.cross(side) * math.sin(spin)
                for s in (-1, 1):
                    dd = (d + side * s * rng.uniform(0.7, 1.0)).normalized()
                    L = rng.uniform(1.1, 1.5) * (0.85 ** lvl)
                    q = p + dd * L + Vector((0, 0, 0.05))
                    tube(m, [p, p.lerp(q, 0.5) + Vector((0, 0, 0.1)), q], [rad, rad * 0.85, rad * 0.75],
                         SCALE_BARK[lvl % 3], segs=5)
                    nxt.append((q, dd, rad * 0.75))
            tips = nxt
        for k, (p, d, rad) in enumerate(tips):
            _tuft(m, rng, p, R * rng.uniform(0.85, 1.1), SCALE_TUFT[(k + i) % 3])
        if forks == 0:                                                     # a young pole: a skirt of leaves below its one tuft
            p = tips[0][0]
            for k in range(7):
                a = k * math.tau / 7
                lfrond(m, (p.x, p.y, p.z - 0.3), a, 1.3, 0.22, *SCALE_TUFT[1][::-1], rise=0.2, droop=1.2, n=3, serrate=0)
        m.build(r, rot_z=rng.uniform(0, math.tau))


# broadleaf canopy: the basin's other trees, nothing like a Terran one: crowns that never unrolled,
# rosettes held up flat as tables, cups of water, shelves of pads. They knit the jungle together
# between the fern stars, and from above each reads by its shape: spirals, stars, rings, plates.
BROAD = [("#24502a", "#3e7a30", "#68a43c"), ("#1e4a44", "#2e6e60", "#4e9a80"), ("#5a3020", "#8a4626", "#c0703a"),
         ("#2e5a2a", "#4a8034", "#7ab048")]   # (shade, body, sunlit) per tone: olive, teal, rust, bright
BROAD_BARK = ["#4a3a2e", "#5a4636", "#3e3026"]
FRUIT = ["#e8742a", "#d8402a", "#f0b03a"]
SPORE = "#f6e07a"                                                          # glowing seed beads and buds
POOL = "#5af0c0"                                                           # rainwater gone jade in a cup


def crozier(m, rng, p, yaw, L, R, tone, bud=SPORE, thick=1.0):
    """A limb that rises out of the trunk and rolls up at its end into a fiddlehead as big as a cart,
    never to unroll: a tapering tube along a log spiral, leaflets bristling off its back. `thick`
    scales its girth, for the giants."""
    shade, body, lit = tone
    h = Vector((math.cos(yaw), math.sin(yaw), 0))
    side = h.cross(UP) * rng.choice((-1, 1))
    up = (UP * 0.55 + side * 0.85).normalized()                            # the coil lies tipped over, so it shows from above
    p = Vector(p)
    p1 = p + h * L * 0.6 + UP * L * 0.7
    pts = [p, p.lerp(p1, 0.5) + UP * L * 0.12 - h * L * 0.05, p1]
    rads = [0.34 * thick, 0.3 * thick, 0.3 * thick]
    c = p1 + h * R
    turns, grow = 1.5, 0.24
    for k in range(1, int(turns * 10) + 1):
        a = k / 10 * math.tau
        r = R * math.exp(-grow * a)
        phi = math.pi - a
        pts.append(c + (h * math.cos(phi) + up * math.sin(phi)) * r)
        rads.append(max(0.07, 0.3 * thick * math.exp(-grow * a * 0.75)))
    n = len(pts) - 1
    tube(m, pts, rads, body, segs=6, colors=[BROAD_BARK[1]] * 2 + [(lit if k % 2 else body) for k in range(n - 2)])
    nrm = h.cross(up)
    for k in range(3, n - 3):                                              # leaflets bristling off the coil's back
        q = pts[k]
        out = (q - c)
        out = (out - nrm * out.dot(nrm)).normalized()
        for s in (-1, 1):
            d = (out + nrm * s * 0.9).normalized()
            tube(m, [q + d * rads[k] * 0.8, q + d * (rads[k] + 0.3 * thick)], [0.09 * thick, 0.0], shade if k % 2 else lit,
                 segs=3)
    m.ball(0.2 * thick, tuple(pts[-1]), bud, subdiv=1, glow=True)


def parasol_crown(m, rng, p, R, tone, beads=4):
    """A rosette held up flat as a table: two rings of broad ribbed blades round a squat hub, the top
    ring sunlit, the under one in shade, strings of glowing seed beads hanging off the rim."""
    shade, body, lit = tone
    turn = rng.uniform(0, math.tau)
    n = 13 if R > 1.6 else 11
    for k in range(n):                                                     # the under ring, half a step round
        yaw = turn + (k + 0.5) * math.tau / n + rng.uniform(-0.08, 0.08)
        lfrond(m, (p.x, p.y, p.z - 0.18), yaw, R * rng.uniform(0.82, 0.95), R * 0.24, shade, body,
               rise=0.05, droop=0.35, n=4, serrate=0.3, fold=0.25)
    for k in range(n):
        yaw = turn + k * math.tau / n + rng.uniform(-0.08, 0.08)
        lfrond(m, (p.x, p.y, p.z), yaw, R * rng.uniform(0.92, 1.05), R * 0.26, lit if k % 2 else body, body,
               rise=0.14, droop=0.3, n=4, serrate=0.3, fold=0.3)
    m.cyl(R * 0.2, 0.3, (p.x, p.y, p.z - 0.05), body, segs=6, r_top=R * 0.08)
    m.ball(0.14, (p.x, p.y, p.z + 0.3), SPORE, subdiv=0, glow=True)
    for k in range(beads):                                                 # bead strings swinging off the rim
        a = turn + (k + 0.25) * math.tau / beads + rng.uniform(-0.2, 0.2)
        d = R * rng.uniform(0.6, 0.8)
        x, y = p.x + math.cos(a) * d, p.y + math.sin(a) * d
        z = p.z - 0.05 - R * 0.12
        drop = rng.randint(2, 4)
        tube(m, [(x, y, z), (x, y, z - 0.32 * drop)], [0.03, 0.03], shade, segs=3, cap=False)
        for j in range(drop):
            m.ball(0.1 - j * 0.012, (x, y, z - 0.3 * (j + 1)), SPORE if j == drop - 1 else FRUIT[2], subdiv=0,
                   glow=j == drop - 1)


def cup_crown(m, rng, p, R, tone):
    """A vase of stiff tongues standing up round a pool of rainwater gone jade and faintly lit, an
    inner ring of young tongues still closed. From above: a red ring with a green eye."""
    shade, body, lit = tone
    turn = rng.uniform(0, math.tau)
    n = 9
    for k in range(n):
        yaw = turn + k * math.tau / n + rng.uniform(-0.1, 0.1)
        L = R * rng.uniform(0.95, 1.15)
        lfrond(m, (p.x + math.cos(yaw) * R * 0.25, p.y + math.sin(yaw) * R * 0.25, p.z), yaw, L, R * 0.3,
               lit if k % 2 else body, shade, rise=1.5, droop=0.95, n=5, serrate=0.0, fold=0.45, tip=0.25)
    for k in range(5):                                                     # young tongues, nearly upright
        yaw = turn + (k + 0.5) * math.tau / 5
        lfrond(m, (p.x + math.cos(yaw) * R * 0.32, p.y + math.sin(yaw) * R * 0.32, p.z + 0.05), yaw + 0.3,
               R * 0.55, R * 0.16, body, shade, rise=2.6, droop=0.6, n=3, serrate=0.0, fold=0.5)
    m.cyl(R * 0.42, 0.35, (p.x, p.y, p.z - 0.2), shade, segs=8, r_top=R * 0.4)
    m.cyl(R * 0.36, 0.06, (p.x, p.y, p.z + 0.15), POOL, segs=8, glow=True)


def broadleaf(variants):
    """The basin's broad trees, nothing that grows anywhere else: a coil tree whose crown never
    unrolled, a teal parasol with bead strings, a bottle-trunked cup tree holding a jade pool, and
    a leaning shelf tree stacked with pads, a lantern hanging under its top."""
    for i in range(4):
        rng = random.Random(260 + i)
        m = Model(f"orutal_broadleaf_{i}", 260 + i)
        tone = BROAD[i]
        if i == 0:                                                         # coil tree
            h = 2.4
            pts = bend((0, 0, 0), (0, 0, h), (0.3, 0.2), n=4)
            tube(m, pts, [0.7, 0.5, 0.44, 0.46, 0.52], BROAD_BARK[0], segs=7, twist=0.4, colors=BROAD_BARK)
            tp = Vector(pts[-1])
            turn = rng.uniform(0, math.tau)
            top = 0
            for k in range(4):
                yaw = turn + k * math.tau / 4 + rng.uniform(-0.25, 0.25)
                L, R = rng.uniform(1.3, 1.7) * (0.75 if k == 3 else 1.0), rng.uniform(1.0, 1.25)
                crozier(m, rng, tp, yaw, L, R, tone)
                top = max(top, tp.z + L * 0.7 + R)
            crozier(m, rng, tp, turn + 0.5, 0.5, 0.5, BROAD[3])                 # a young one coiled tight in the heart
            for k in range(4):                                             # buttress roots
                a = k * math.tau / 4 + rng.uniform(-0.3, 0.3)
                m.plank_line((0, 0, 0.6), (math.cos(a) * 0.8, math.sin(a) * 0.8, -0.05), 0.2, 0.16, BROAD_BARK[2])
        elif i == 1:                                                       # parasol, with a smaller one under
            h = 4.8
            pts = bend((0, 0, 0), (0, 0, h), (-0.4, 0.25), n=5)
            tube(m, pts, [0.42, 0.3, 0.26, 0.24, 0.22, 0.24], BROAD_BARK[0], segs=6, twist=0.6,
                 colors=[BROAD_BARK[k % 3] for k in range(5)])
            for k in range(3):                                             # rings where old rosettes fell off
                q = Vector(pts[k + 1])
                m.cyl(0.32, 0.08, (q.x, q.y, q.z), BROAD_BARK[2], segs=6)
            parasol_crown(m, rng, Vector(pts[-1]), 2.3, tone, beads=5)
            q = Vector(pts[3]) + Vector((1.2, -0.5, 0.2))
            tube(m, [Vector(pts[3]), Vector(pts[3]).lerp(q, 0.5) + Vector((0, 0, 0.3)), q], [0.16, 0.13, 0.11],
                 BROAD_BARK[1], segs=5)
            parasol_crown(m, rng, q, 1.2, tone, beads=2)
            top = h + 0.5
        elif i == 2:                                                       # cup tree on a bottle trunk
            h = 2.3
            pts = bend((0, 0, 0), (0, 0, h), (0.15, -0.2), n=5)
            tube(m, pts, [0.6, 0.85, 0.9, 0.72, 0.48, 0.4], BROAD_BARK[0], segs=7, twist=0.5,
                 colors=[BROAD_BARK[k % 3] for k in range(5)])
            cup_crown(m, rng, Vector(pts[-1]), 1.7, tone)
            for k in range(2):                                             # pups budding off the bottle
                a = rng.uniform(0, math.tau)
                q = Vector((math.cos(a) * 0.85, math.sin(a) * 0.85, 0.9 + k * 0.4))
                cup_crown(m, rng, q, 0.5, tone)
            top = h + 1.7 * 1.2
        else:                                                              # shelf tree
            h = 5.4
            pts = bend((0, 0, 0), (0, 0, h), (0.9, 0.3), n=6)
            tube(m, pts, [0.4, 0.32, 0.27, 0.24, 0.2, 0.16, 0.12], BROAD_BARK[0], segs=6, twist=0.3,
                 colors=[BROAD_BARK[k % 3] for k in range(6)])
            turn = rng.uniform(0, math.tau)
            for k, (j, R) in enumerate(((2, 1.2), (3, 1.0), (4, 0.85), (5, 0.7), (6, 0.75))):
                b = Vector(pts[j])
                a = turn + k * 2.4
                d = 0 if j == 6 else R * 0.95
                q = b + Vector((math.cos(a) * d, math.sin(a) * d, 0.25))
                if d:
                    tube(m, [b, q], [0.12, 0.09], BROAD_BARK[1], segs=4)
                fs = list(m.cyl(R, 0.3, (q.x, q.y, q.z), tone[1], segs=6, r_top=R * 0.7))
                for f in fs:
                    f.normal_update()
                lid = tone[2] if k % 2 else "#a8c858"                      # pads ripen paler as they age
                recolor(m, fs, lambda f: lid if f.normal.z > 0.6 else (tone[0] if f.normal.z < 0.2 else None))
                for s in range(3):                                         # leaf lips curling off the pad's rim
                    aa = a + s * math.tau / 3 + 0.4
                    lfrond(m, (q.x + math.cos(aa) * R * 0.8, q.y + math.sin(aa) * R * 0.8, q.z + 0.15), aa, R * 0.5,
                           R * 0.22, tone[2], tone[1], rise=0.3, droop=1.0, n=3, serrate=0.0)
            tp = Vector(pts[-1])
            tube(m, [tp, tp - Vector((0, 0, 0.5))], [0.03, 0.03], BROAD_BARK[2], segs=3, cap=False)
            m.ball(0.28, (tp.x, tp.y, tp.z - 0.8), SPORE, subdiv=1, scale=(1, 1, 1.35), glow=True)
            top = h + 0.5
        r = root("orutal_broadleaf", i, height=round(top, 2))
        m.build(r, rot_z=rng.uniform(0, math.tau))


def thicket(variants):
    """A knot of jungle: parasols, cup trees and tree ferns grown into one another, crowns overlapping,
    ferns and pups at the edge. The canopy masses the basin is made of."""
    layouts = [
        [("dome", -1.6, 0.4, 3.6, 1.7, 0), ("fern", 1.2, 0.8, 4.4, 2.0, 0), ("dome", 0.6, -1.6, 2.8, 1.4, 3), ("fern", -0.4, 2.2, 3.0, 1.7, 1)],
        [("dome", 0.0, 0.0, 4.4, 2.1, 1), ("fern", 2.0, -1.0, 3.4, 1.9, 1), ("fern", -2.0, -0.6, 4.0, 2.0, 0),
         ("tuft", -0.4, 2.2, 4.0, 1.1, 0)],
        [("dome", -1.8, -0.5, 3.0, 1.6, 2), ("dome", 1.4, 0.6, 3.8, 1.8, 0), ("fern", -0.2, 1.8, 4.6, 2.1, 0),
         ("tuft", 0.4, -2.0, 3.4, 1.0, 1), ("fern", 2.6, -1.6, 2.4, 1.6, 2)],
    ]
    for i, items in enumerate(layouts):
        rng = random.Random(280 + i)
        m = Model(f"orutal_thicket_{i}", 280 + i)
        top = 0
        for kind, x, y, h, R, t in items:
            pts = bend((x, y, 0), (x, y, h), (rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4)), n=4)
            if kind == "fern":
                _fern_trunk(m, rng, pts + [pts[-1]], r0=0.36, r1=0.24, knobs=2, roots=2)
                fern_crown(m, rng, tuple(pts[-1]), 8, R, 0.4, palette=(LIME, EMERALD, BRONZE)[t], old=1)
                top = max(top, h + 0.6)
            else:
                tube(m, pts, [0.42, 0.32, 0.28, 0.26, 0.24], (SCALE_BARK if kind == "tuft" else BROAD_BARK)[0], segs=6)
                tp = Vector(pts[-1])
                if kind == "tuft":
                    _tuft(m, rng, tp, R, SCALE_TUFT[t])
                    top = max(top, h + R)
                elif t == 2:
                    cup_crown(m, rng, tp, R * 0.8, BROAD[t])
                    top = max(top, h + R)
                elif t == 0:
                    turn = rng.uniform(0, math.tau)
                    for k in range(3):
                        crozier(m, rng, tp, turn + k * math.tau / 3, R * 0.6, R * 0.55, BROAD[t])
                    top = max(top, h + R)
                else:
                    parasol_crown(m, rng, tp, R * 1.15, BROAD[t], beads=3)
                    top = max(top, h + 0.4)
        for k in range(6):                                                 # understory round the edge
            a = k * math.tau / 6 + rng.uniform(-0.3, 0.3)
            d = rng.uniform(2.6, 3.4)
            x, y = math.cos(a) * d, math.sin(a) * d
            turn = rng.uniform(0, math.tau)
            for f in range(5):
                c1, c2 = (LIME + EMERALD)[(k + f) % 4]
                lfrond(m, (x, y, 0.05), turn + f * math.tau / 5, rng.uniform(0.9, 1.3), 0.32, c1, c2, rise=0.9, droop=1.1, n=4)
        fs = lump(m, rng, (0, 0, 0), (2.4, 2.0, 0.5), MOSS, n=10)                 # the mossy root mound
        recolor(m, fs, lambda f: "#4e7a34" if f.normal.z > 0.6 else None)
        r = root("orutal_thicket", i, height=round(top, 2))
        m.build(r, rot_z=rng.uniform(0, math.tau))


EGG = ["#efe6cc", "#d8e6d6", "#f0dcc0"]
NEST = ["#7a6040", "#8a7048", "#6a5236"]
NEST_TOP = "#b0a060"


def nest(variants):
    """A beast's ground nest: a ring of scraped earth and torn fronds, a clutch of big pale eggs."""
    for i in range(3):
        r = root("orutal_nest", i, height=1.0)
        rng = random.Random(100 + i)
        m = Model(f"orutal_nest_{i}", 100 + i)
        R = (1.1, 1.4, 1.2)[i]
        fs = []
        for k in range(9):
            a = k * math.tau / 9 + rng.uniform(-0.15, 0.15)
            fs += lump(m, rng, (math.cos(a) * R, math.sin(a) * R, 0.1), (0.6, 0.5, 0.35 + rng.uniform(0, 0.12)), NEST[k % 3],
                       n=8, flat=0.3)
        for f in fs:
            f.normal_update()
        recolor(m, fs, lambda f: NEST_TOP if f.normal.z > 0.7 else None)
        m.cyl(R * 0.9, 0.12, (0, 0, -0.02), "#5a4430", segs=8)
        for k in range(5):                                                 # torn fronds laid round the rim
            a = rng.uniform(0, math.tau)
            lfrond(m, (math.cos(a) * R * 0.9, math.sin(a) * R * 0.9, 0.35), a + rng.uniform(-0.6, 0.6), 1.0, 0.24,
                   *(FROND_OLD if k % 2 else LIME[0]), rise=0.1, droop=0.5, n=3)
        eggs = (4, 6, 2)[i]
        for k in range(eggs):
            a = k * math.tau / eggs + rng.uniform(-0.2, 0.2)
            d = 0.0 if (eggs == 6 and k == 0) else rng.uniform(0.3, 0.55)
            m.ball(0.3, (math.cos(a) * d, math.sin(a) * d, 0.32), EGG[k % 3], subdiv=1, scale=(1, 1, 1.3),
                   rot=(rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), 0))
        if i == 2:                                                         # hatched: broken shells, a cup tipped over
            for k in range(3):
                a = rng.uniform(0, math.tau)
                d = rng.uniform(0.5, 1.6)
                m.cyl(0.26, 0.24, (math.cos(a) * d, math.sin(a) * d, 0.05), EGG[k % 3], segs=6, r_top=0.32,
                      rot=(rng.uniform(-1.2, 1.2), rng.uniform(-1.2, 1.2), 0))
        m.build(r, rot_z=rng.uniform(0, math.tau))


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


HEX_RIM = ["#3c3a48", "#45424f", "#36343f"]
HEX_CAP = ["#646a7e", "#767c90", "#5a5e70"]       # cool slate: reads against the warm ground and the lava
SULFUR = ["#e8d040", "#d0b030", "#f4e878"]
ASH_CAP = "#a8a0a0"


def hexcol(m, x, y, z0, h, rad, k, cap=None, rot=None):
    """A basalt column: near-black sides, a dark rim round a raised slate cap, so every hex reads
    crisp from above. `cap` overrides the cap colour (sulphur, ash); `rot` lays it over."""
    side = BASALT[k % 3]
    if rot is None:
        fs = list(m.cyl(rad, h - z0, (x, y, z0), side, segs=6, rot=(0, 0, math.pi / 6)))
        recolor(m, fs, lambda f: HEX_RIM[k % 3] if f.normal.z > 0.9 else None)
        m.cyl(rad * 0.74, 0.1, (x, y, h - 0.02), cap or HEX_CAP[k % 3], segs=6, rot=(0, 0, math.pi / 6))
        return fs
    fs = list(m.cyl(rad, h, (x, y, z0), side, segs=6, rot=rot))
    for f in fs:
        f.normal_update()
    recolor(m, fs, lambda f: HEX_CAP[k % 3] if f.normal.z > 0.75 else None)
    return fs


def basalt_columns(variants):
    """Clusters of black hex columns, the lava world's trees: a stair, a ring round a lava pool, a
    stand of organ pipes, and a raft of columns that fell over."""
    for i in range(4):
        rng = random.Random(90 + i)
        m = Model(f"basalt_columns_{i}", 90 + i)
        peak = 0
        if i in (0, 2):                                                    # a stair / organ pipes
            rings, rad = ((2, 0.8), (1, 0.9))[i // 2]
            tilt = rng.uniform(0, math.tau)
            for k, (x, y) in enumerate(hex_cells(rings, rad)):
                side = (x * math.cos(tilt) + y * math.sin(tilt)) / max(rad * rings * 2, 1)
                if i == 0:
                    h = 4.6 - math.hypot(x, y) * 0.5 - side * 2.6 + rng.uniform(-0.4, 0.3)
                else:
                    h = rng.uniform(3.6, 5.6)
                if k and rng.random() < 0.12:                              # one fell: lava wells in the hole
                    m.cyl(rad * 0.9, 0.3, (x, y, -0.1), LAVA, segs=6, rot=(0, 0, math.pi / 6), glow=True)
                    continue
                h = max(0.7, h)
                peak = max(peak, h)
                cap = SULFUR[k % 3] if rng.random() < 0.05 else (ASH_CAP if rng.random() < 0.1 else None)
                hexcol(m, x, y, -0.3, h, rad * 0.97, k, cap=cap)
            if i == 2:                                                     # one snapped and leaning on its neighbours
                a = rng.uniform(0, math.tau)
                hexcol(m, math.cos(a) * 2.2, math.sin(a) * 2.2, 0.0, 3.4, rad * 0.9, 1,
                       rot=(0.9 * math.sin(a), -0.9 * math.cos(a), 0))
        elif i == 1:                                                       # a ring of columns round a lava pool
            rad = 0.75
            for k, (x, y) in enumerate(hex_cells(3, rad)):
                d = math.hypot(x, y)
                if d < rad * 2.2:
                    continue
                if d > rad * 4.9 and rng.random() < 0.55:
                    continue
                h = 1.0 + (d - rad * 2.2) * 0.75 + rng.uniform(-0.4, 0.5)
                peak = max(peak, h)
                hexcol(m, x, y, -0.3, h, rad * 0.97, k, cap=SULFUR[k % 3] if rng.random() < 0.06 else None)
            fs = m.cyl(rad * 2.6, 0.45, (0, 0, -0.3), CRUST[0], segs=9)            # a pool gone to crust
            recolor(m, fs, lambda f: CRUST_TOP if f.normal.z > 0.9 else None)
            m.box((rad * 3.2, 0.22, 0.5), (0.1, 0, -0.3), LAVA, rot=(0, 0, 0.5), glow=True)   # still glowing in one crack
            m.box((rad * 1.4, 0.18, 0.52), (0.5, 0.5, -0.3), LAVA_HOT, rot=(0, 0, 1.6), glow=True)
        else:                                                              # a raft of fallen columns, stumps behind
            rad = 0.7
            yaw = rng.uniform(0, math.tau)
            ax, ay = math.cos(yaw), math.sin(yaw)
            for k in range(5):
                off = (k - 2) * rad * 1.75
                L = rng.uniform(3.0, 4.6)
                x0, y0 = -ay * off - ax * 1.6, ax * off - ay * 1.6
                hexcol(m, x0, y0, rad * 0.85 + rng.uniform(-0.1, 0.25), L, rad, k,
                       rot=(math.pi / 2 + rng.uniform(-0.08, 0.08), 0, yaw - math.pi / 2))
            for k in range(4):
                off = (k - 1.5) * rad * 1.75
                h = rng.uniform(1.2, 2.6)
                peak = max(peak, h)
                hexcol(m, -ay * off - ax * 2.6, ax * off - ay * 2.6, -0.3, h, rad, k + 1)
            m.cyl(1.3, 0.3, (ax * 2.6, ay * 2.6, -0.1), LAVA, segs=7, glow=True)  # the pool it fell into
            m.cyl(0.6, 0.32, (ax * 2.7, ay * 2.5, -0.1), LAVA_HOT, segs=6, glow=True)
            peak = max(peak, 1.6)
        for k in range(3):                                                 # rubble of broken column ends round the foot
            a = rng.uniform(0, math.tau)
            d = rng.uniform(2.6, 3.4)
            hexcol(m, math.cos(a) * d, math.sin(a) * d, -0.2, rng.uniform(0.3, 0.6), rng.uniform(0.4, 0.55), k + 2)
        r = root("basalt_columns", i, height=round(peak, 2))
        m.build(r)


def fumarole(variants):
    """Where the ground breathes: crusts of yellow sulphur round a glowing throat, stained rust at the edge."""
    for i in range(3):
        r = root("orutal_fumarole", i, height=(1.4, 1.0, 2.4)[i])
        rng = random.Random(140 + i)
        m = Model(f"orutal_fumarole_{i}", 140 + i)
        for tx, ty, R in ([(0, 0, 1.9)] if i != 1 else [(-1.4, 0.1, 1.3), (0.2, -0.1, 1.2), (1.6, 0.2, 1.3)]):   # the stain
            pts = [(tx + math.cos(a) * R * rng.uniform(0.75, 1.1), ty + math.sin(a) * R * rng.uniform(0.75, 1.1), z)
                   for a in [k * math.tau / 9 for k in range(9)] for z in (-0.05, 0.04)]
            hull(m, pts, "#7a3a22")
        throats = [(0, 0)] if i != 1 else [(-1.4, 0.1), (0.2, -0.1), (1.6, 0.2)]
        fs = []
        for tx, ty in throats:
            R = (1.3, 0.8, 0.9)[i]
            for k in range(7):
                a = k * math.tau / 7 + rng.uniform(-0.2, 0.2)
                fs += lump(m, rng, (tx + math.cos(a) * R, ty + math.sin(a) * R, 0.25), (0.7, 0.6, (0.6, 0.45, 0.5)[i]),
                           SULFUR[1], n=8, flat=0.4)
            m.cyl(R * 0.62, 0.45, (tx, ty, -0.1), LAVA, segs=7, glow=True)
            m.cyl(R * 0.3, 0.5, (tx, ty, -0.1), LAVA_HOT, segs=6, glow=True)
        if i == 2:                                                         # a chimney of crust, glowing at the mouth
            pts = bend((0, 0, 0), (0, 0, 2.2), (0.3, 0.2), n=3)
            tube(m, pts, [1.0, 0.8, 0.62, 0.55], SULFUR[1], segs=7, colors=[SULFUR[1], "#b89a30", SULFUR[0]])
            m.cyl(0.42, 0.2, tuple(pts[-1]), LAVA_HOT, segs=7, glow=True)
        for f in fs:
            f.normal_update()
        recolor(m, fs, lambda f: SULFUR[2] if f.normal.z > 0.7 else (SULFUR[0] if f.normal.z > 0.2 else "#a88a2a"))
        for k in range(6):                                                 # sulphur needles
            a = rng.uniform(0, math.tau)
            d = rng.uniform(1.3, 2.0)
            m.cyl(0.18, rng.uniform(0.35, 0.6), (math.cos(a) * d, math.sin(a) * d, 0), SULFUR[2], segs=4, r_top=0.0,
                  rot=(rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), 0))
        m.build(r, rot_z=rng.uniform(0, math.tau))


ASHFERN = [("#b4482a", "#86321e"), ("#cc6a34", "#9a4a24"), ("#8e3a2a", "#6a2a20")]


def ash_fern(variants):
    """The first life back on fresh rock: little rust-red ferns in the cracks, ember-bright where they unroll."""
    for i in range(3):
        r = root("orutal_ash_fern", i, height=1.0)
        rng = random.Random(160 + i)
        m = Model(f"orutal_ash_fern_{i}", 160 + i)
        if i == 2:
            spots = [(x, 0.3 * math.sin(x), rng.uniform(0.6, 0.9)) for x in (-1.8, -0.6, 0.6, 1.8)]
            m.box((4.8, 0.3, 0.1), (0, 0, 0.0), LAVA_DEEP, glow=True, taper=0.7)          # the crack they grow along
        else:
            n = (5, 2)[i]
            spots = [(0, 0, 1.2 if i == 1 else 1.0)] + [(math.cos(a) * rng.uniform(1.2, 2.0), math.sin(a) * rng.uniform(1.2, 2.0), rng.uniform(0.7, 1.0))
                                                         for a in [rng.uniform(0, math.tau) for _ in range(n)]]
        for k, (x, y, s) in enumerate(spots):
            fs = lump(m, rng, (x, y, 0.0), (0.5 * s + 0.2, 0.45 * s + 0.2, 0.3), CRUST[k % 3], n=8, flat=0.0)
            recolor(m, fs, lambda f: CRUST_TOP if f.normal.z > 0.6 else None)
            turn = rng.uniform(0, math.tau)
            nf = 6
            for f in range(nf):
                c1, c2 = ASHFERN[(k + f) % 3]
                lfrond(m, (x, y, 0.15), turn + f * math.tau / nf + rng.uniform(-0.2, 0.2), s * rng.uniform(0.9, 1.2),
                       0.28 * s + 0.06, c1, c2, rise=1.0, droop=1.1, n=4)
            m.ball(0.15, (x, y, 0.4 * s + 0.1), EMBER, subdiv=0, glow=True)
        m.build(r, rot_z=rng.uniform(0, math.tau))


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


CITRINE = ("#ffc850", "#c8781e", "#fff0b0")
SMOKY = ("#6a5a8a", "#3a2e52", "#8a5ad0")
PALE = [LILAC, ("#d8faff", "#9ad8ec", "#ffffff"), ("#ffe0f4", "#e0a8d0", "#ffffff")]


def _gem_tip(m, rng, base, d, rad, L, tones, sides=6):
    """A dark crystal lit only at its point (smoky quartz with a glowing heart)."""
    fs = crystal(m, base, d, rad, L, tones[0], sides=sides, tip=0.3, spin=rng.uniform(0, 1))
    two_tone(m, fs, tones[0], tones[1])
    b, dn = Vector(base), Vector(d).normalized()
    recolor(m, fs, lambda f: (tones[2], True) if (f.calc_center_median() - b).dot(dn) > L * 0.8 else None)


def crystal_cluster(variants):
    """Crystal growing out of the canyon floor, five habits: a magenta spray, a cyan king with his court,
    a mixed bed, golden citrine leaning out like a hand, and smoky quartz lit only at the tips."""
    for i in range(5):
        r = root("crystal_cluster", i, height=4.2)
        rng = random.Random(170 + i)
        m = Model(f"crystal_cluster_{i}", 170 + i)
        items = []
        if i == 1:                                                         # one tall, a ring of small round it
            items.append((0, 0, 0.05, 0.03, 0.62, 4.1))
            for k in range(7):
                a = k * math.tau / 7 + rng.uniform(-0.2, 0.2)
                items.append((math.cos(a) * 0.9, math.sin(a) * 0.9, math.cos(a) * 0.7, math.sin(a) * 0.7,
                              rng.uniform(0.25, 0.32), rng.uniform(1.0, 1.7)))
        elif i == 3:                                                       # a fan leaning one way
            for k in range(7):
                a = (k - 3) * 0.42 + rng.uniform(-0.15, 0.15)
                o = (k - 3) * 0.32
                items.append((-0.5 + rng.uniform(-0.2, 0.2), o, math.cos(a) * rng.uniform(0.4, 0.9), math.sin(a) * 0.8,
                              rng.uniform(0.3, 0.48), rng.uniform(1.6, 3.6) * (1.0 if k % 2 else 0.75)))
        else:
            n = (7, 0, 8, 0, 6)[i]
            for k in range(n):
                a = k * math.tau / n + rng.uniform(-0.3, 0.3)
                d = rng.uniform(0.1, 0.7) if k else 0
                lean = rng.uniform(0.2, 0.7) if k else 0.08
                L = rng.uniform(1.6, 3.6) if k else 3.9
                items.append((math.cos(a) * d, math.sin(a) * d, math.cos(a) * lean, math.sin(a) * lean,
                              rng.uniform(0.3, 0.45) if k else 0.55, L))
        if i == 4:
            for x, y, tx, ty, rad, L in items:
                _gem_tip(m, rng, (x, y, -0.3), (tx * 1.4, ty * 1.4, 1), rad * 1.1, L, SMOKY)
            _crystals(m, rng, [], SMOKY, rock_r=1.1)
        elif i == 2:                                                       # mixed: pale crystals, coloured hearts
            for k, it in enumerate(items):
                _crystals(m, rng, [it], (MAGENTA, CYAN, LILAC)[k % 3], base_rock=(k == 0), rock_r=1.1)
        else:
            _crystals(m, rng, items, (MAGENTA, CYAN, None, CITRINE)[i], rock_r=1.1)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def needle_field(variants):
    """Ground cover: tufts of thin pale needles on a slab of lilac rock, frosting the canyon floor."""
    for i in range(3):
        r = root("orutal_needle_field", i, height=1.6)
        rng = random.Random(180 + i)
        m = Model(f"orutal_needle_field_{i}", 180 + i)
        tones = PALE[i]
        rs = lump(m, rng, (0, 0, 0.0), (2.0, 1.6, 0.35), CRYSTAL_ROCK[i], n=10, flat=0.0)
        recolor(m, rs, lambda f: CRYSTAL_ROCK_TOP if f.normal.z > 0.6 else None)
        for t in range(4):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.2, 1.6) if t else 0
            cx, cy = math.cos(a) * d, math.sin(a) * d
            for k in range(rng.randint(4, 6)):
                b = rng.uniform(0, math.tau)
                lean = rng.uniform(0.15, 0.7)
                fs = crystal(m, (cx + math.cos(b) * 0.2, cy + math.sin(b) * 0.2, 0.1),
                             (math.cos(b) * lean, math.sin(b) * lean, 1), rng.uniform(0.17, 0.24), rng.uniform(0.6, 1.5),
                             tones[0], sides=4, tip=0.4, spin=rng.uniform(0, 1))
                two_tone(m, fs, tones[0], tones[1], glow=(k % 3 == 0))
        m.build(r, rot_z=rng.uniform(0, math.tau))


GEODE_ROCK = ["#3a2e4a", "#463858", "#2e2440"]


def geode_stone(variants):
    """A boulder split open on its glowing heart of crystal: one magenta, one cyan, one gold, and one
    broken right in two."""
    for i in range(3):
        r = root("orutal_geode_stone", i, height=1.6)
        rng = random.Random(200 + i)
        m = Model(f"orutal_geode_stone_{i}", 200 + i)
        tones = (MAGENTA, CYAN, CITRINE)[i]
        halves = [(0, 0)] if i < 2 else [(-0.9, 0.2), (1.0, -0.2)]
        for hx, hy in halves:
            R = 1.25 if i < 2 else 0.95
            fs = []
            for k in range(8):                                             # a rim of rock, the shell
                a = k * math.tau / 8
                fs += lump(m, rng, (hx + math.cos(a) * R, hy + math.sin(a) * R, 0.35), (0.6, 0.55, 0.55 + rng.uniform(0, 0.2)),
                           GEODE_ROCK[k % 3], n=8, flat=0.4)
            for f in fs:
                f.normal_update()
            recolor(m, fs, lambda f: "#6a5a7a" if f.normal.z > 0.75 else None)
            m.cyl(R * 0.85, 0.35, (hx, hy, 0.0), tones[1], segs=8, glow=True)   # the lining
            for k in range(7):                                             # teeth of crystal inside, pointing in and up
                a = k * math.tau / 7 + rng.uniform(-0.2, 0.2)
                d = R * 0.6
                fs = crystal(m, (hx + math.cos(a) * d, hy + math.sin(a) * d, 0.2), (-math.cos(a) * 0.7, -math.sin(a) * 0.7, 1),
                             rng.uniform(0.2, 0.28), rng.uniform(0.7, 1.1), tones[0], sides=4, tip=0.4)
                two_tone(m, fs, tones[0], tones[1], glow=True)
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
        d0 = Vector((lean[0], lean[1], 1)).normalized()
        collider(r, d0.x / d0.z * 10.5, d0.y / d0.z * 10.5, 1.5, z=10.0, lean=(d0.x / d0.z, d0.y / d0.z), top=(Lmain - 0.5) * d0.z)
        for a, d, ln, L in secs:
            bx, by = math.cos(a) * d, math.sin(a) * d
            dirv = Vector((math.cos(a) * ln, math.sin(a) * ln, 1)).normalized()
            fs = crystal(m, (bx, by, -0.3), dirv, 0.8 if L > 7 else 0.55, L, accent[0], sides=6, tip=0.28,
                         spin=rng.uniform(0, 1))
            two_tone(m, fs, accent[0], accent[1], glow=True)
            # (every one: raised on a terrace, even a short one reaches the flight line; where it
            # crosses 10, its lean and its top, so the game finds where it crosses wherever it stands)
            top = Vector((bx, by, -0.3)) + dirv * L
            p = Vector((bx, by, -0.3)) + dirv * ((10.3) / dirv.z)
            collider(r, p.x, p.y, 0.9 if L > 7 else 0.65, z=10.0, lean=(dirv.x / dirv.z, dirv.y / dirv.z), top=top.z - 0.4)
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


def stack_pillar(m, rng, x, y, H, R, drift, sides=8, z0=-1.0):
    """A limestone pillar: banded drums wandering up, undercut where the sea gnaws its foot, dark with
    weed at the waterline. Returns its top (x, y) and faces."""
    n = max(6, int((H - z0) / 3.2))
    layers = []
    z = z0
    for k in range(n):
        z1 = z0 + (H - z0) * (k + 1) / n
        r0 = R * (1.2 - 0.25 * k / n) * (1.08 if k % 2 else 0.98)
        r1 = R * (1.15 - 0.25 * (k + 1) / n) * (0.98 if k % 2 else 1.08)
        if k == 0:
            r0, r1 = R * 0.95, R * 0.9                                     # the notch the waves cut
        if k == n - 1:
            r1 = R * 1.12                                                  # an overhanging lip under the jungle
        layers.append((z, z1, r0, r1))
        z = z1
    fs, top = strata(m, rng, x, y, layers, sides=sides, jit=0.2, drift=drift)
    for f in fs:
        f.normal_update()
    recolor(m, fs, lambda f: WEED if f.calc_center_median().z < 2.8 else
            ((STACK_TOP2 if f.calc_center_median().z > H - 1.2 else GUANO) if f.normal.z > 0.6 else None))
    return top


def jungle_cap(m, rng, tx, ty, H, R, ferns):
    """A hat of jungle on a stack: lumpy canopy in mixed greens, a tree fern or two, vines down the sides."""
    m.cyl(R * 1.12, 0.7, (tx, ty, H - 0.2), STACK_TOP, segs=8, r_top=R * 0.85)
    tones = [STACK_TOP2, EMERALD[0][0], LIME[1][1], "#5a9a3a"]
    for k in range(4):
        a = k * math.tau / 4 + rng.uniform(-0.4, 0.4)
        d = R * rng.uniform(0.3, 0.6)
        m.ball(R * rng.uniform(0.45, 0.6), (tx + math.cos(a) * d, ty + math.sin(a) * d, H + 0.4), tones[k], subdiv=1,
               scale=(1, 1, 0.5), jitter=0.12)
    for k in range(ferns):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.2, R * 0.5)
        fx, fy = tx + math.cos(a) * d, ty + math.sin(a) * d
        h = rng.uniform(1.0, 1.8)
        m.cyl(0.18, h, (fx, fy, H), FERN_BARK[0], segs=5, r_top=0.14)
        fern_crown(m, rng, (fx, fy, H + h), 8, 1.5, 0.34, palette=(LIME, EMERALD)[k % 2], old=0, fiddle=False)
    for k in range(6):                                                     # vines and ferns spilling over the lip
        a = k * math.tau / 6 + rng.uniform(-0.2, 0.2)
        ex, ey = math.cos(a), math.sin(a)
        if k % 2:
            lfrond(m, (tx + ex * R * 0.95, ty + ey * R * 0.95, H + 0.3), a, 1.6, 0.36, *FROND[k % 3], rise=0.2, droop=1.4)
        else:
            L = rng.uniform(3.0, 6.0)
            pts = [Vector((tx + ex * R * (1.12 + 0.05 * j), ty + ey * R * (1.12 + 0.05 * j), H + 0.2 - L * j / 3)) for j in range(4)]
            tube(m, pts, [0.3, 0.26, 0.22, 0.12], VINE_GREEN, segs=4)


def sea_stack(variants):
    """Obstacles: pillars of pale limestone out of the jade sea, jungle on their heads, vines down
    their sides. The third is two pillars grown together."""
    shapes = [  # pillars (x, y, H, R, drift); tree ferns on top
        ([(0, 0, 15.0, 2.6, (0.12, 0.05))], 2),
        ([(0, 0, 17.0, 2.2, (-0.1, 0.12))], 1),
        ([(-1.2, 0, 16.0, 2.0, (0.06, 0.08)), (1.6, 0.4, 13.5, 1.8, (-0.08, 0.04))], 1),
    ]
    for i, (pillars, ferns) in enumerate(shapes):
        r = root("sea_stack", i, height=max(p[2] for p in pillars) + 1.5, obstacle=1)
        rng = random.Random(210 + i)
        m = Model(f"sea_stack_{i}", 210 + i)
        for x, y, H, R, drift in pillars:
            tx, ty = stack_pillar(m, rng, x, y, H, R, drift)
            jungle_cap(m, rng, tx, ty, H, R, ferns)
            collider(r, x, y, R * 1.15)
            for k in range(3):                                             # fallen blocks at its foot, weedy
                a = rng.uniform(0, math.tau)
                fs = lump(m, rng, (x + math.cos(a) * R * 1.5, y + math.sin(a) * R * 1.5, 0.2), (0.9, 0.8, 0.7), STACK[k], n=9,
                          flat=0.5)
                recolor(m, fs, lambda f: WEED if f.calc_center_median().z < 0.3 else None)
        m.build(r)


SHELL_COL = [("#f0e0c8", "#d8a878"), ("#f4d8d0", "#c88a7a"), ("#e8e4d0", "#a8a088")]


def _coil(m, x, y, z, R0, turns, colors, yaw=0.0, tilt=0.0):
    """A little ammonite lying on its side: a tube along a log spiral, banded."""
    grow = 0.2
    steps = int(turns * 9)
    pts, rads = [], []
    for k in range(steps + 1):
        a = k / 9 * math.tau
        rr = R0 * math.exp(grow * a)
        c = Vector((math.cos(a + yaw) * rr, math.sin(a + yaw) * rr, rr * 0.4 * (1 - tilt)))
        pts.append(c + Vector((x, y, z)))
        rads.append(rr * 0.45)
    tube(m, pts, rads, colors[0], segs=6, colors=[colors[k % 2] for k in range(len(pts) - 1)])


def shell_drift(variants):
    """Beach clutter: coiled shells and spiral cones washed up and half sunk in the sand, a rib or two."""
    for i in range(3):
        r = root("orutal_shell_drift", i, height=0.8)
        rng = random.Random(230 + i)
        m = Model(f"orutal_shell_drift_{i}", 230 + i)
        n = (3, 2, 4)[i]
        for k in range(n):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.6, 1.8) if k else 0
            _coil(m, math.cos(a) * d, math.sin(a) * d, -0.1, rng.uniform(0.08, 0.11) * (1.5 if k == 0 else 1), 1.8,
                  SHELL_COL[(k + i) % 3], yaw=rng.uniform(0, math.tau))
        for k in range((2, 4, 1)[i]):                                      # spiral cones
            a = rng.uniform(0, math.tau)
            d = rng.uniform(1.0, 2.0)
            c1, c2 = SHELL_COL[(k + 1) % 3]
            pts = [Vector((math.cos(a) * d, math.sin(a) * d, 0.15)) + Vector((math.cos(a + 1) * t, math.sin(a + 1) * t, 0.08 * t))
                   for t in (0, 0.35, 0.7, 1.0)]
            tube(m, pts, [0.3, 0.24, 0.14, 0.0], c1, segs=6, twist=0.6, colors=[c1, c2, c1])
        if i == 1:                                                         # a beast's ribs, bleached
            for k in range(3):
                b = Vector((-1.6 + k * 0.7, -1.4, 0))
                tube(m, [b, b + Vector((0.3, 0.6, 0.6)), b + Vector((0.6, 1.4, 0.3))], [0.14, 0.13, 0.08], "#e8dcc0", segs=4)
        for k in range(4):                                                 # weed washed up round them
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.5, 1.8)
            leaf(m, [Vector((math.cos(a) * d + t * math.cos(a + 1.4), math.sin(a) * d + t * math.sin(a + 1.4), 0.04)) for t in (0, 0.5, 1.0)],
                 [0.2, 0.25, 0.1], WEED, "#2e5a48", fold=0.2)
        m.build(r, rot_z=rng.uniform(0, math.tau))


REEF_TOP = ["#5a9a4a", "#6aa848", "#4e8a52"]


def reef_rock(variants):
    """Shore rocks the sea has worn round: pale limestone, green with weed on top, ringed dark at the waterline."""
    for i in range(3):
        r = root("orutal_reef_rock", i, height=1.6)
        rng = random.Random(250 + i)
        m = Model(f"orutal_reef_rock_{i}", 250 + i)
        fs = []
        lumps = [(0, 0, 1.4, 1.1, 0.9)] if i == 0 else ([(-0.8, 0, 1.0, 0.9, 0.8), (0.9, 0.4, 1.2, 1.0, 1.1)] if i == 1 else
                                                       [(-1.2, 0.3, 0.8, 0.7, 0.6), (0.2, -0.3, 1.1, 0.9, 0.8), (1.4, 0.5, 0.7, 0.6, 0.5)])
        for k, (x, y, sx, sy, sz) in enumerate(lumps):
            fs += lump(m, rng, (x, y, sz * 0.5), (sx, sy, sz), STACK[(k + i) % 4], n=12, flat=0.5)
        for f in fs:
            f.normal_update()
        recolor(m, fs, lambda f: REEF_TOP[i] if f.normal.z > 0.7 else (WEED if f.calc_center_median().z < 0.3 else None))
        for k in range(2):                                                 # a tuft of shore fern in a crack
            x, y = lumps[k % len(lumps)][:2]
            for f in range(4):
                lfrond(m, (x + 0.2, y - 0.1, lumps[k % len(lumps)][4] * 1.3), f * math.tau / 4 + k, 0.9, 0.26, *LIME[f % 2],
                       rise=0.8, droop=1.2, n=3)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def build():
    tree_fern(5)
    cycad(4)
    giant_fern(3)
    bracken(3)
    scale_tree(3)
    nest(3)
    broadleaf(4)
    thicket(3)
    boulder(4)
    basalt_columns(4)
    fumarole(3)
    ash_fern(3)
    lava_vent(2)
    obsidian_rock(3)
    charred_cycad(2)
    crystal_cluster(5)
    needle_field(3)
    geode_stone(3)
    crystal_spire(2)
    sea_stack(3)
    shell_drift(3)
    reef_rock(3)
