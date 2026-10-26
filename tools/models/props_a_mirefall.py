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
CAPS = {                                            # (the old names, kept for the set pieces) the Hive's colours; the light's pale and
    # cool, never lime or hot pink: those are the brood sacs' and the Hive's fire
    "violet": ("#5a2e8a", "#7a4ab0", "#cfc4f4"),    # cap, crown, glow
    "teal": ("#3a3a8a", "#5a56b4", "#b0dcf0"),
    "magenta": ("#8a2a78", "#b04a98", "#f0cdf0"),
    "amber": ("#9a7ac8", "#c4a8e8", "#cce4f2"),
}
CORAL = [("#c04aa0", "#ff8aff"), ("#6a4ab0", "#a8e8ff"), ("#a88ad0", "#b8a4ff")]
REED = ["#7a8a3a", "#94a04a", "#6a7a3a", "#a89a5a"]
RUSH = "#4a2a3a"
SPORE = "#9ab0ff"
WOOD = ["#5a5048", "#6a6058", "#4e4640"]
WOOD_TOP = "#8a8078"
HOLLOW = "#1a161c"
MOSS_HANG = ["#7a8a5a", "#6a7a4a"]
PAD = ["#3a6a3a", "#4a7a4a", "#2e5a34"]
PAD_RIM = "#5a4048"
FLOWER = "#e0a0ff"
# the temple's stone: pale, weathered, a lilac cast (the ziggurat, shared with other planets, keeps ZIG)
TEMPLE = ["#b0a2b4", "#a093a8", "#bcafbe"]
TEMPLE_TOP = ("#ddd0dc", "#cdbfcd")
TEMPLE_STEP = ("#d4c6d0", "#c2b4c2")
TEMPLE_MOSS = ["#5a8a3a", "#6a9a40"]
ZIG = ["#6a7062", "#5e6458", "#767c6a"]
ZIG_TOP = ("#8e9480", "#7c826e")
# (warm, a kept hearth: lime is the bloom's fire)
TEMPLE_GLOW = "#ffc27a"
TEMPLE_GLOW2 = "#c08aff"
VENT = ["#7a5a80", "#8a6a90", "#6a4a70"]
VENT_TOP = "#b898c0"


def _cap(m, x, y, z, R, H, pal, shape="dome", spots=6, rng=None):
    """A mushroom cap seated at (x, y, z): its top, a pale rim, the glowing gills under it and spots."""
    cap, rim, glow = pal
    if shape == "dome":
        lobes = max(7, min(13, int(R * 2.2)))
        _shell(m, x, y, z, [(R, -H * 0.12, cap), (R * 0.96, H * 0.3, cap), (R * 0.78, H * 0.68, cap),
                            (R * 0.5, H * 0.9, rim), (R * 0.22, H * 0.99, rim), (0, H, rim)],
               lobes * 2, lobes, 0.07, under=glow, under_z=H * 0.15, twist=0.08)
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
        for k in range(spots):                                             # pale spots on top, dull: lit specks are danger
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.2, 0.75) * R
            if shape == "dome":
                hz = z + H * math.sqrt(max(0.0, 1 - (d / R) ** 2))
            elif shape == "cone":
                hz = z + H * (1 - d / R) * 0.95
            else:
                hz = z + H
            m.ball(rng.uniform(0.24, 0.38) * max(1, R / 2.5), (x + math.cos(a) * d, y + math.sin(a) * d, hz - 0.05),
                   rim, subdiv=0, scale=(1, 1, 0.5))
    return top


# the Hive's bloom: violet and acid green, with an orchid and a pale lilac for contrast between neighbours
BLOOM = {
    "violet": ("#7a48b8", "#a87ade", "#d8c0f4", "#cfc4f4"),     # cap, crown (the lit top), wart, glow
    "orchid": ("#8e48a8", "#c07cd6", "#dcc4ee", "#f0cdf0"),     # (plum, off pink: the shots are pink)
    "indigo": ("#5a5ac0", "#8a8ae4", "#c8c8f8", "#b0dcf0"),
    "lilac": ("#b49ae2", "#e4d4ff", "#d4c8f0", "#cce4f2"),
}


def _shell(m, x, y, z, profile, segs, lobes=0, wob=0.0, under=None, under_z=0.0, twist=0.0):
    """A faceted cap from a profile of rings [(radius, height, colour), ...] up to an apex (radius 0),
    its hem waved into `lobes` scallops by `wob`; closed underneath in `under` (lit gills)."""
    bm = m.bm
    rings = []
    n = len(profile)
    for j, (rad, hz, col) in enumerate(profile):
        k_w = wob * max(0.0, 1 - j / max(1, n - 2))
        if rad <= 1e-6:
            rings.append([bm.verts.new((x, y, z + hz))])
            continue
        ring = []
        for k in range(segs):
            a = k * math.tau / segs + twist * j
            rr = rad * (1 + k_w * math.cos(a * lobes)) if lobes else rad
            ring.append(bm.verts.new((x + math.cos(a) * rr, y + math.sin(a) * rr, z + hz)))
        rings.append(ring)
    faces = []
    for j in range(n - 1):
        a, b = rings[j], rings[j + 1]
        idx = m._slot(profile[j + 1][2], False)
        for k in range(segs):
            k2 = (k + 1) % segs
            f = bm.faces.new((a[k], a[k2], b[0]) if len(b) == 1 else (a[k], a[k2], b[k2], b[k]))
            f.material_index = idx
            faces.append(f)
    if under:
        c = bm.verts.new((x, y, z + under_z))
        idx = m._slot(under, True)
        for k in range(segs):
            f = bm.faces.new((rings[0][(k + 1) % segs], rings[0][k], c))
            f.material_index = idx
            faces.append(f)
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return faces


def _bloomcap(m, rng, x, y, z, R, H, pal, style="dome", warts=6, lobes=9):
    """A cap seated at (x, y, z): a scalloped dome (or a frilled bell), a lighter crown, pale warts and
    glowing gills underneath (seen when it leans, or as you pass)."""
    cap, crown, wart, glow = BLOOM[pal]
    segs = lobes * 2
    if style == "bell":
        prof = [(R, -H * 0.3, cap), (R * 0.82, -H * 0.05, cap), (R * 0.66, H * 0.4, cap), (R * 0.5, H * 0.75, crown),
                (R * 0.28, H * 0.95, crown), (0, H, crown)]
        _shell(m, x, y, z, prof, segs, lobes, 0.12, under=glow, under_z=H * 0.2)
        for k in range(0, segs, 3):                                      # drips of light off the hem
            a = k * math.tau / segs
            m.box((0.22, 0.22, rng.uniform(0.5, 1.0)), (x + math.cos(a) * R * 0.92, y + math.sin(a) * R * 0.92,
                  z - H * 0.3 - 0.4), glow, glow=True)
        return z + H
    prof = [(R, -H * 0.12, cap), (R * 0.96, H * 0.3, cap), (R * 0.78, H * 0.68, cap), (R * 0.5, H * 0.9, crown),
            (R * 0.22, H * 0.99, crown), (0, H, crown)]
    _shell(m, x, y, z, prof, segs, lobes, 0.07, under=glow, under_z=H * 0.15, twist=0.08)
    for k in range(warts):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.3, 0.75) * R
        hz = z + H * math.sqrt(max(0.0, 1 - (d / R) ** 2)) * 0.97
        # (none lit: small lit specks are danger's; the cap's light is its gills and its glow)
        m.ball(rng.uniform(0.22, 0.32) * max(1.0, R / 2.2), (x + math.cos(a) * d, y + math.sin(a) * d, hz),
               wart, subdiv=0, scale=(1, 1, 0.5))
    return z + H


def _stem(m, rng, x, y, h, lean, sr, col, skirt=None):
    pts = bend((x, y, -0.1), (x, y, h), lean, n=5)
    tube(m, pts, [sr * 1.7, sr * 1.15, sr, sr * 0.92, sr * 0.9, sr * 0.95], col, segs=6)
    if skirt:                                                            # the ring (annulus), drooping
        p = pts[3]
        m.cyl(sr * 2.0, 0.35, (p.x, p.y, p.z - 0.35), skirt, segs=7, r_top=sr * 1.05)
    return pts[-1]


def glowcap(variants):
    """Mushrooms 3-7 tall in the Hive's colours: a lone parasol, a family, a stand of dripping bells,
    a tiered one; pale stems, scalloped caps with warts, lit gills."""
    for i in range(5):
        rng = random.Random(800 + i)
        m = Model(f"glowcap_{i}_stems", 800 + i)
        c = Model(f"glowcap_{i}_cap", 810 + i)
        if i == 0:                                                       # a lone parasol
            h = 6.2
            r = root("glowcap", i, height=h + 1.2)
            top = _stem(m, rng, 0, 0, h, (0.5, 0.3), 0.5, STEM[0], skirt=STEM[2])
            _bloomcap(c, rng, 0, 0, 0, 2.9, 1.15, "violet", warts=11, lobes=12)
            main = c.build(r, loc=tuple(top))
        elif i == 1:                                                     # a family, three ages
            r = root("glowcap", i, height=7.0)
            top = _stem(m, rng, 0, 0, 5.8, (-0.5, 0.4), 0.36, STEM[0], skirt=STEM[2])
            _bloomcap(c, rng, 0, 0, 0, 2.4, 1.1, "orchid", warts=9, lobes=10)
            main = c.build(r, loc=tuple(top))
            for (x, y, hh, R, lean, pal) in ((2.2, -0.9, 4.0, 1.7, (0.6, -0.3), "orchid"),
                                             (-1.5, -1.7, 2.6, 1.15, (-0.3, -0.5), "lilac")):
                t = _stem(m, rng, x, y, hh, lean, 0.18 + R * 0.1, STEM[1])
                _bloomcap(m, rng, t.x, t.y, t.z, R, R * 0.55, pal, warts=3, lobes=7)
        elif i == 2:                                                     # a stand of bells, dripping
            r = root("glowcap", i, height=6.0)
            main = None
            for k, (x, y, hh, R) in enumerate(((0, 0, 4.8, 1.6), (1.9, 0.9, 3.6, 1.3), (-1.6, 1.1, 3.0, 1.15),
                                               (0.5, -1.8, 2.2, 0.95))):
                a = math.atan2(y, x) if k else 0.6
                t = _stem(m, rng, x, y, hh, (math.cos(a) * 0.5, math.sin(a) * 0.5), 0.2, STEM[k % 3])
                if k == 0:
                    _bloomcap(c, rng, 0, 0, 0, R, 1.9, "indigo", style="bell", lobes=9)
                    main = c.build(r, loc=tuple(t))
                else:
                    _bloomcap(m, rng, t.x, t.y, t.z, R, 1.5 * R, "indigo", style="bell", lobes=7)
        elif i == 4:                                                     # a mass: caps grown into one canopy
            r = root("glowcap", i, height=7.4)
            main = None
            spec = ((0, 0, 6.2, 2.3, "lilac"), (2.4, 0.8, 5.0, 2.0, "violet"), (-2.2, 1.0, 4.4, 1.9, "orchid"),
                    (0.6, -2.3, 3.6, 1.7, "violet"), (-1.0, -1.6, 2.6, 1.3, "lilac"))
            for k, (x, y, hh, R, pal) in enumerate(spec):
                a = math.atan2(y, x) if k else 0.3
                t = _stem(m, rng, x * 0.5, y * 0.5, hh, (x * 0.5 + math.cos(a) * 0.3, y * 0.5 + math.sin(a) * 0.3),
                          0.24 + R * 0.08, STEM[k % 3])
                if k == 0:
                    _bloomcap(c, rng, 0, 0, 0, R, R * 0.45, pal, warts=7, lobes=10)
                    main = c.build(r, loc=tuple(t))
                else:
                    _bloomcap(m, rng, t.x, t.y, t.z, R, R * 0.45, pal, warts=4, lobes=9)
        else:                                                            # tiered: shelves up one fat stem
            r = root("glowcap", i, height=6.4)
            pts = bend((0, 0, -0.1), (0, 0, 5.4), (0.3, -0.25), n=5)
            tube(m, pts, [0.85, 0.6, 0.52, 0.46, 0.42, 0.4], STEM[1], segs=7)
            for k, (t, R, pal) in enumerate(((0.42, 2.4, "indigo"), (0.7, 1.75, "violet"))):
                p = bend((0, 0, -0.1), (0, 0, 5.4), (0.3, -0.25), n=20)[int(t * 20)]
                cap, crown, wart, glow = BLOOM[pal]
                _shell(m, p.x, p.y, p.z, [(R, -0.15, cap), (R * 0.8, 0.25, cap), (R * 0.45, 0.45, crown), (0, 0.5, crown)],
                       14, 7, 0.1, under=glow, under_z=0.05, twist=0.2)
                for j in range(4):
                    a = j * math.tau / 4 + k
                    m.ball(0.24, (p.x + math.cos(a) * R * 0.62, p.y + math.sin(a) * R * 0.62, p.z + 0.22), wart,
                           subdiv=0, scale=(1, 1, 0.5))
            _bloomcap(c, rng, 0, 0, 0, 1.25, 0.95, "lilac", warts=4, lobes=7)
            main = c.build(r, loc=tuple(pts[-1]))
        for k in range(3 + (i % 2)):                                     # buttons at the foot
            a = rng.uniform(0, math.tau)
            d = rng.uniform(1.0, 1.8)
            x, y = math.cos(a) * d, math.sin(a) * d
            m.cyl(0.12, 0.35, (x, y, 0), STEM[k % 3], segs=5)
            m.ball(0.3, (x, y, 0.42), BLOOM[("violet", "orchid", "indigo", "lilac")[(i + k) % 4]][1], subdiv=0,
                   scale=(1, 1, 0.6))
            m.ball(0.12, (x, y, 0.58), BLOOM["violet"][3], subdiv=0, glow=True)
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


def _pad(m, x, y, z, R, col, rim, notch, cup=0.0, segs=12, inner=0.8):
    """A pad: a disc with its notch cut out (a wedge), the rim a shade darker and turned up by `cup`."""
    bm = m.bm
    gap = 0.55
    pts = []
    for k in range(segs + 1):
        a = notch + gap / 2 + (math.tau - gap) * k / segs
        pts.append((math.cos(a), math.sin(a)))
    c_top = bm.verts.new((x, y, z + 0.06))
    c_bot = bm.verts.new((x, y, z))
    ring_in = [bm.verts.new((x + px * R * inner, y + py * R * inner, z + 0.06 + cup * 0.4)) for px, py in pts]
    ring_out = [bm.verts.new((x + px * R, y + py * R, z + 0.06 + cup)) for px, py in pts]
    ring_bot = [bm.verts.new((x + px * R, y + py * R, z)) for px, py in pts]
    fs_in, fs_rim = [], []
    for k in range(segs):
        fs_in.append(bm.faces.new((c_top, ring_in[k], ring_in[k + 1])))
        fs_rim.append(bm.faces.new((ring_in[k], ring_out[k], ring_out[k + 1], ring_in[k + 1])))
        fs_rim.append(bm.faces.new((ring_out[k], ring_bot[k], ring_bot[k + 1], ring_out[k + 1])))
        fs_rim.append(bm.faces.new((c_bot, ring_bot[k + 1], ring_bot[k])))
    for e in (0, segs):                                                  # the notch's cut faces
        fs_rim.append(bm.faces.new((c_top, c_bot, ring_bot[e], ring_out[e], ring_in[e])))
    bmesh.ops.recalc_face_normals(bm, faces=fs_in + fs_rim)
    i1, i2 = m._slot(col, False), m._slot(rim, False)
    for f in fs_in:
        f.material_index = i1
    for f in fs_rim:
        f.material_index = i2


def _flower(m, fx, fy, z, R=0.2):
    for k in range(6):
        a = k * math.tau / 6
        m.box((R * 1.8, R * 0.75, 0.08), (fx + math.cos(a) * R * 0.9, fy + math.sin(a) * R * 0.9, z + 0.18), FLOWER,
              rot=(0, -0.6, a), glow=True)
    m.ball(R * 0.6, (fx, fy, z + 0.22), "#fff0a0", subdiv=0, glow=True)


def lily_pad(variants):
    """Pads on the black water (z = 0): a raft of notched pads, a great cupped one with its ribs and a
    bud, a drifting line of them round a lit spike. Flowers glow violet."""
    for i in range(3):
        r = root("lily_pad", i)
        rng = random.Random(910 + i)
        m = Model(f"lily_pad_{i}", 910 + i)
        if i == 0:
            placed = []
            for k in range(9):
                for _ in range(12):
                    a = rng.uniform(0, math.tau)
                    d = rng.uniform(0.0, 1.9)
                    R = rng.uniform(0.4, 0.95)
                    cx, cy = math.cos(a) * d, math.sin(a) * d
                    if all(math.hypot(cx - px, cy - py) > (R + pr) * 0.8 for px, py, pr in placed):
                        break
                placed.append((cx, cy, R))
                _pad(m, cx, cy, 0.02 * (k % 3), R, PAD[k % 3], PAD[(k + 2) % 3], rng.uniform(0, math.tau), segs=9)
            fx, fy, _ = placed[1]
            _flower(m, fx, fy, 0.06)
        elif i == 1:
            _pad(m, 0, 0, 0, 1.7, PAD[1], PAD_RIM, rng.uniform(0, math.tau), cup=0.22, segs=16, inner=0.9)
            for k in range(7):                                             # the ribs
                a = k * math.tau / 7 + 0.3
                m.box((1.25, 0.12, 0.04), (math.cos(a) * 0.7, math.sin(a) * 0.7, 0.08), PAD[2], rot=(0, 0, a))
            for k in range(4):
                a = k * 1.7 + 0.5
                _pad(m, math.cos(a) * 2.3, math.sin(a) * 2.3, 0, rng.uniform(0.4, 0.6), PAD[k % 3], PAD[2],
                     rng.uniform(0, math.tau), segs=8)
            _flower(m, 2.2, -1.1, 0.0, 0.24)
            m.cyl(0.05, 0.6, (-2.0, 1.2, 0), PAD[2], segs=4)                   # a bud on its stalk, still shut
            m.ball(0.2, (-2.0, 1.2, 0.7), FLOWER, subdiv=0, scale=(1, 1, 1.5), glow=True)
        else:
            for k in range(6):
                t = k / 5
                cx, cy = -2.4 + t * 4.8, math.sin(t * 3.0) * 0.7
                _pad(m, cx, cy, 0, 0.5 + 0.35 * math.sin(t * math.pi), PAD[k % 3], PAD[(k + 1) % 3],
                     rng.uniform(0, math.tau), segs=9)
            m.cyl(0.06, 1.2, (0.3, 0.55, 0), PAD[2], segs=4)                   # a spike of little lit flowers
            for k in range(4):
                m.ball(0.17 - k * 0.025, (0.3, 0.55, 0.55 + k * 0.28), FLOWER if k % 2 else "#fff0a0", subdiv=0, glow=True)
            _flower(m, -1.4, 0.1, 0.05, 0.2)
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
            fs += list(m.box((w, w, step), (0, 0, z0 + step / 2), ZIG[k % 3]))
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
            m.plank_line((s * 1.35, y0 - 0.3, base + 0.3), (s * 1.35, y1 - 0.3, z1 + 0.3), 0.35, 0.35, ZIG[1])
        # the shrine on top: a little house with a glowing doorway, and a glow pool before it
        tz = base + tiers * step
        fs += list(m.box((2.4, 2.2, 1.6), (0, 0.3, tz + 0.8), ZIG[0]))
        fs += list(m.box((2.9, 2.7, 0.35), (0, 0.3, tz + 1.75), ZIG[2]))
        m.box((0.9, 0.1, 1.1), (0, -0.82, tz + 0.6), TEMPLE_GLOW, glow=True)
        m.box((1.0, 1.0, 0.12), (0, 0.3, tz + 1.95), TEMPLE_GLOW, glow=True, rot=(0, 0, 0.785))
        for f in fs:
            f.normal_update()
        recolor(m, fs, lambda f: ZIG_TOP[int(round((f.calc_center_median().z - base) / step)) % 2] if f.normal.z > 0.9 else None)
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
            m.box((1.6, 1.4, 1.3), (6.8, 6.0, 0.3), ZIG[1], rot=(0.4, 0.3, 0.5))
            m.box((1.4, 1.2, 1.1), (-7.8, 2.5, 0.1), ZIG[0], rot=(0.2, -0.5, 0.2))
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
    """Where the ground breathes: a crusted mound round a lit throat, a stand of chimneys, a fissure
    with blisters along it. The light sits down in the mouths, small and hot; the spores do the rest."""
    for i in range(3):
        r = root("spore_vent", i)
        rng = random.Random(970 + i)
        m = Model(f"spore_vent_{i}", 970 + i)
        mouths = []
        fs = []
        if i == 0:
            for k in range(9):                                             # the crusted mound, a ring of lumps
                a = k * math.tau / 9 + rng.uniform(-0.15, 0.15)
                fs += lump(m, rng, (math.cos(a) * 1.6, math.sin(a) * 1.6, 0.35), (1.0, 0.8, 0.85), VENT[k % 3], n=10, flat=0.5)
            _ring_glow(m, 0, 0, 0.55, 1.05, 0.75)
            mouths.append((0, 0, 0.6, 0.7))
            for k in range(4):                                             # fresh spore crust spilling down one side
                a = 0.6 + k * 0.35
                m.ball(0.45, (math.cos(a) * (2.4 + k * 0.3), math.sin(a) * (2.4 + k * 0.3), 0.1), VENT_TOP, subdiv=0,
                       scale=(1.3, 1, 0.35))
        elif i == 1:
            for k, (x, y, h) in enumerate(((0, 0, 2.8), (1.4, 0.6, 1.8), (-1.0, 1.1, 1.3), (0.5, -1.3, 1.0))):
                rr = 0.85 - k * 0.13
                fs += tube(m, [Vector((x, y, -0.2)), Vector((x, y, h * 0.55)), Vector((x + 0.12, y, h))],
                           [rr * 1.25, rr, rr * 0.8], VENT[k % 3], segs=7, colors=[VENT[k % 3], VENT[(k + 1) % 3]])
                m.cyl(rr * 0.95, 0.22, (x + 0.12, y, h - 0.05), VENT_TOP, segs=7, r_top=rr * 1.05)   # the lip
                m.cyl(rr * 0.6, 0.1, (x + 0.12, y, h + 0.12), "#1a0e1e", segs=7)                     # the throat
                mouths.append((x + 0.12, y, h + 0.2, rr * 0.45))
            for k in range(5):
                a = rng.uniform(0, math.tau)
                fs += lump(m, rng, (math.cos(a) * 1.9, math.sin(a) * 1.9, 0.1), (0.55, 0.45, 0.35), VENT[k % 3], n=8, flat=0.5)
        elif i == 3:
            # the hero: a great crusted chimney, its plume of lit spores standing over it
            pts = [Vector((0, 0, -0.3)), Vector((0.1, 0, 1.6)), Vector((0.3, 0.1, 3.4)), Vector((0.4, 0.1, 5.0))]
            fs += tube(m, pts, [2.1, 1.5, 1.15, 1.0], VENT[0], segs=8, colors=[VENT[0], VENT[1], VENT[2]])
            for k in range(4):                                             # crust bands, stepped like shelf fungus
                p = pts[1] if k < 2 else pts[2]
                a = k * 1.7
                fs += lump(m, rng, (p.x + math.cos(a) * 1.3, p.y + math.sin(a) * 1.3, p.z + (k % 2) * 0.6), (1.0, 0.8, 0.45),
                           VENT[k % 3], n=9, flat=0.4)
            m.cyl(1.15, 0.35, (0.4, 0.1, 4.9), VENT_TOP, segs=8, r_top=1.25)              # the lip
            m.cyl(0.75, 0.1, (0.4, 0.1, 5.25), "#1a0e1e", segs=8)
            for k, (x, y, h) in enumerate(((2.2, 1.0, 2.2), (-1.9, 1.4, 1.6))):
                tube(m, [Vector((x, y, -0.2)), Vector((x, y, h))], [0.75, 0.5], VENT[(k + 1) % 3], segs=6)
                m.cyl(0.55, 0.2, (x, y, h - 0.05), VENT_TOP, segs=6)
                m.cyl(0.3, 0.06, (x, y, h + 0.15), SPORE, segs=6, glow=True)
            for k in range(7):
                a = k * math.tau / 7 + rng.uniform(-0.2, 0.2)
                fs += lump(m, rng, (math.cos(a) * 2.6, math.sin(a) * 2.6, 0.1), (0.8, 0.6, 0.45), VENT[k % 3], n=8, flat=0.5)
            mouths.append((0.4, 0.1, 5.3, 0.6))
        else:
            # a fissure: a split in the ground, lit along its length, blisters swelling either side
            L = 5.0
            for k in range(7):
                t = k / 6 - 0.5
                x, y = t * L, math.sin(t * 2.4) * 0.5
                for sd in (-1, 1):
                    fs += lump(m, rng, (x + rng.uniform(-0.2, 0.2), y + sd * 0.75, 0.15), (0.7, 0.55, 0.45), VENT[(k + sd) % 3],
                               n=8, flat=0.5)
            ts = [-0.5, -0.36, -0.22, -0.08, 0.06, 0.2, 0.34, 0.5]
            seam = [Vector((t * L, math.sin(t * 2.4) * 0.5 + (0.22 if j % 2 else -0.22) * (0 < j < 7), 0.02))
                    for j, t in enumerate(ts)]
            tube(m, seam, [0.04, 0.12, 0.16, 0.2, 0.18, 0.15, 0.1, 0.04], "#5ac860", segs=4, glow=True)
            for j in (2, 5):
                p = seam[j]
                m.ball(0.45, (p.x, p.y, 0.2), VENT[j % 3], subdiv=0, scale=(1.2, 1.0, 0.5))
            for k in range(3):                                             # blisters, one burst
                x = -1.6 + k * 1.6
                y = (1.4 if k % 2 else -1.3)
                m.ball(0.65 - k * 0.1, (x, y, 0.35), VENT[1], subdiv=1, scale=(1, 1, 0.75))
                if k == 1:
                    m.cyl(0.3, 0.08, (x, y, 0.8), SPORE, segs=6, glow=True)
            mouths.append((0.0, 0.0, 0.25, 0.35))
        if fs:
            for f in fs:
                if f.is_valid:
                    f.normal_update()
            recolor(m, [f for f in fs if f.is_valid], lambda f: VENT_TOP if f.normal.z > 0.8 else None)
        m.build(r)
        g = Model(f"spore_vent_{i}_glow", 980 + i)
        mx, my, mz, _ = mouths[0]                                          # pivot on the main mouth: it swells in place
        for x, y, z, R in mouths:
            g.cyl(R * 0.8, 0.14, (x - mx, y - my, z - mz - 0.1), SPORE, segs=7, glow=True)
        if i == 3:                                                         # the plume, paling as it rises
            for k, (dz, R, col) in enumerate(((0.4, 0.6, "#5ac860"), (1.1, 0.8, SPORE), (1.9, 0.65, "#7ae070"), (2.5, 0.4, SPORE))):
                g.ball(R, (0.1 * k, 0.05 * k, dz), col, subdiv=1, scale=(1, 1, 0.7), jitter=0.06, glow=True)
        obj = g.build(r, loc=(mx, my, mz))
        pulse(obj, f"spore_vent_{i}_breathe_idle", amp=0.18 if i != 3 else 0.1, period=2.4 + i * 0.6)


def _ring_glow(m, x, y, z, R, r_in):
    """A sunken mouth: a dark throat ringed with lit crust."""
    m.cyl(R, 0.15, (x, y, z - 0.08), "#3a8a4a", segs=10)
    m.cyl(r_in, 0.12, (x, y, z), "#1a0e1e", segs=10)


def build():
    glowcap(5)
    glowcap_tall(2)
    fungus_coral(3)
    reed_clump(2)
    dead_tree(3)
    lily_pad(3)
    ziggurat(2)
    vine_pillar(3)
    spore_vent(3)
