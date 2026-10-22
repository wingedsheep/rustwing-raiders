"""KESSRA, the Rust Sea: salt pans, red mesa race canyon, monoliths of a vanished people, blue oasis."""
from __future__ import annotations

import math
import random

import bmesh
from mathutils import Matrix, Vector

from kit import Model
from props_a_lib import (arc, bend, collider, frond, hull, lump, recolor, ribbon, root, sway, tube, pulse)
from props_a_orutal import strata

# salt: white tops against white pans, so the sides go cool and the feet rust-stained
SALT_TOP = "#fbf8f0"
SALT = ["#e6dccf", "#d8ccbe", "#efe6da"]
SALT_SHADE = "#b8aab8"
SALT_RUST = "#c8906a"
BONE = ["#eadcbc", "#dccaa4"]
BONE_DARK = "#a8906a"
SOCKET = "#3a2a24"
# red rock: banded, the tops sun-bleached
MESA = ["#8a3a2a", "#a84a30", "#c0683a", "#9a4430", "#b85a36"]
MESA_TOP = "#e0a070"
SCRUB = ["#8a8a40", "#6e7a38"]
SAND = ["#d89a68", "#e0aa78"]
# the vanished people: dark violet stone, cyan light
STONE = ["#3e3448", "#4a4054", "#352c3e"]
STONE_TOP = "#6a5e78"
GLYPH = "#4affe0"
GLYPH_HOT = "#c8fff4"
# the oasis
PALM_BARK = ["#8a6a4a", "#a8845a"]
PALM_LEAF = [("#3a8ac8", "#2a6a9e"), ("#4aa0d8", "#2e78ae"), ("#2e7ab8", "#22608e")]
DATES = "#e88a3a"
GRASS = ["#c8a850", "#a8903e", "#8a8a48", "#d8b860"]
CLOTH = {"red": ("#b0342a", "#d8a040"), "indigo": ("#3a4a9a", "#e8dcc0"), "teal": ("#2a8a8a", "#1e6a6a")}
RUG = ["#a83a3a", "#3a4a8a", "#d89a3a"]
POLE = "#5a3e2a"
LAMP = "#ffc04a"


def _top_light(m, faces, top, dot=0.7):
    for f in faces:
        f.normal_update()
    recolor(m, faces, lambda f: top if f.normal.z > dot else None)


# --- salt pans --------------------------------------------------------------------------------

def salt_pillar(variants):
    for i in range(3):
        r = root("salt_pillar", i)
        rng = random.Random(600 + i)
        m = Model(f"salt_pillar_{i}", 600 + i)
        fs = []
        if i == 0:
            # a hoodoo: a stalk of salt with a wide crusted cap
            f, top = strata(m, rng, 0, 0, [(-0.2, 1.2, 1.1, 0.8), (1.2, 2.8, 0.8, 0.65), (2.8, 3.6, 0.65, 0.9)],
                            sides=6, jit=0.12, colors=SALT)
            fs += f
            f, _ = strata(m, rng, top[0], top[1], [(3.6, 4.1, 1.5, 1.5), (4.1, 4.5, 1.5, 1.1)], sides=7, jit=0.15,
                          colors=[SALT[2], SALT[0]])
            fs += f
        elif i == 1:
            # three hexagonal stalks, like crystals of it
            for k, (x, y, h) in enumerate(((0, 0, 5.2), (1.0, 0.5, 3.4), (-0.6, 0.9, 2.4))):
                fs += m.cyl(0.62, h, (x, y, -0.2), SALT[k % 3], segs=6, r_top=0.5, rot=(0, 0, k * 0.4))
                fs += m.cyl(0.5, 0.4, (x, y, h - 0.2), SALT[2], segs=6, r_top=0.15, rot=(0, 0, k * 0.4))
        else:
            # a broken tier: low, wide, stepped
            f, _ = strata(m, rng, 0, 0, [(-0.2, 0.8, 2.0, 1.8), (0.8, 1.6, 1.6, 1.3), (1.6, 2.2, 1.0, 0.7)],
                          sides=7, jit=0.2, drift=(0.3, 0.1), colors=SALT)
            fs += f
        L = Vector((-0.5, -0.4, 0.2)).normalized()
        for f in fs:
            f.normal_update()

        def paint(f):
            c = f.calc_center_median()
            if f.normal.z > 0.65:
                return SALT_TOP
            if c.z < 0.5:
                return SALT_RUST
            if f.normal.dot(L) < -0.35:
                return SALT_SHADE
            return None
        recolor(m, fs, paint)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def skeleton_ribs(variants):
    for i in range(2):
        r = root("skeleton_ribs", i)
        rng = random.Random(620 + i)
        m = Model(f"skeleton_ribs_{i}", 620 + i)
        L = 7.0 if i == 0 else 4.5
        n = 7 if i == 0 else 4
        # the spine, half buried, running along x
        spine = [Vector((-L / 2 + L * k / 10, 0, 0.35 + 0.25 * math.sin(k / 10 * math.pi))) for k in range(11)]
        for k, p in enumerate(spine):
            m.ball(0.32, tuple(p), BONE[k % 2], subdiv=0, scale=(0.8, 1, 0.9))
            m.box((0.14, 0.12, 0.45), (p.x, p.y, p.z + 0.35), BONE[1])
        for k in range(n):
            x = -L / 2 + 0.6 + k * (L - 1.2) / max(n - 1, 1)
            h = 3.2 * (1 - abs(k - n * 0.4) / n) + 0.6
            for s in (-1, 1):
                if i == 1 and s == 1 and k % 2:
                    continue                                               # some have fallen
                pts = []
                for j in range(7):
                    t = j / 6
                    a = t * math.pi * 0.85
                    pts.append(Vector((x + t * 0.4, s * (math.sin(a) * 1.9 + 0.2), 0.4 + h * math.sin(a * 0.9 + 0.3) * (1 - t * 0.4))))
                tube(m, pts, [0.2, 0.19, 0.17, 0.15, 0.13, 0.1, 0.05], BONE[k % 2], segs=5)
        if i == 0:
            # the skull, nose in the salt, sockets dark, a tusk
            sk = (L / 2 + 1.2, 0.0, 0.6)
            hull(m, [(sk[0] + dx * 1.3, sk[1] + dy * 0.9, sk[2] + dz * 0.8) for dx, dy, dz in
                     ((-1, -1, -0.7), (-1, 1, -0.7), (-1, -1, 1), (-1, 1, 1), (0.4, -0.8, 1.1), (0.4, 0.8, 1.1),
                      (1.6, -0.5, 0.2), (1.6, 0.5, 0.2), (1.2, -0.7, -0.7), (1.2, 0.7, -0.7))], BONE[0])
            for s in (-1, 1):
                m.box((0.5, 0.25, 0.4), (sk[0] + 0.2, s * 0.62, sk[2] + 0.75), SOCKET, rot=(0, 0, 0))
                tube(m, [Vector((sk[0] + 1.6, s * 0.45, sk[2])), Vector((sk[0] + 2.6, s * 0.9, sk[2] + 0.2)),
                         Vector((sk[0] + 3.2, s * 0.8, sk[2] + 1.0))], [0.18, 0.14, 0.0], BONE[1], segs=5)
        for k in range(4):                                                 # salt drifted against it
            a = rng.uniform(0, math.tau)
            lump(m, rng, (rng.uniform(-L / 2, L / 2), math.sin(a) * 1.4, 0.0), (0.8, 0.6, 0.3), SALT[k % 3], n=8, flat=0.5)
        m.build(r, rot_z=rng.uniform(0, math.tau))


# --- red mesa run -----------------------------------------------------------------------------

def _mesa_layers(H, R, n=6, base=-0.5):
    layers = []
    z = base
    for k in range(n):
        z1 = base + (H - base) * (k + 1) / n
        r0 = R * (1.0 + 0.12 * (k % 2)) * (1.15 - 0.15 * k / n)
        r1 = R * (1.0 + 0.12 * ((k + 1) % 2 == 0)) * (1.15 - 0.15 * (k + 1) / n)
        layers.append((z, z1, r0, r1 * 0.95))
        z = z1
    return layers


def mesa(variants):
    """Obstacles: flat-topped buttes, banded red, taller than you fly."""
    shapes = [(15.0, 5.0, 1.0), (14.0, 4.2, 1.7)]
    for i, (H, R, stretch) in enumerate(shapes):
        r = root("mesa", i, height=H, obstacle=1)
        rng = random.Random(640 + i)
        m = Model(f"mesa_{i}", 640 + i)
        fs, _ = strata(m, rng, 0, 0, _mesa_layers(H, R), sides=10, jit=0.14, colors=MESA)
        for v in m.bm.verts:
            v.co.x *= stretch
        # the caprock: a pale lid with an overhang, scrub on top
        cap, _ = strata(m, rng, 0, 0, [(H - 0.2, H + 0.6, R * 1.0, R * 0.95)], sides=10, jit=0.1, colors=[MESA[2]])
        for v in {v for f in cap for v in f.verts}:
            v.co.x *= stretch
        fs += cap
        _top_light(m, fs, MESA_TOP, 0.75)
        for k in range(7):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0, R * 0.6)
            m.ball(rng.uniform(0.35, 0.6), (math.cos(a) * d * stretch, math.sin(a) * d, H + 0.6), SCRUB[k % 2], subdiv=0,
                   scale=(1, 1, 0.6))
        for k in range(4):                                                 # cracks and loose rock up top
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.2, R * 0.5)
            m.box((rng.uniform(1.5, 3.0) * stretch, 0.45, 0.1), (math.cos(a) * d * stretch, math.sin(a) * d, H + 0.6),
                  "#a8583a", rot=(0, 0, rng.uniform(0, math.pi)))
            t = lump(m, rng, (math.cos(a + 2) * d * stretch, math.sin(a + 2) * d, H + 0.6), (0.7, 0.6, 0.45),
                     MESA[(k + 2) % 5], n=8, flat=0.5)
            _top_light(m, t, "#d08a5a")
        for k in range(7):                                                 # talus at the foot
            a = rng.uniform(0, math.tau)
            d = R * rng.uniform(1.2, 1.45)
            t = lump(m, rng, (math.cos(a) * d * stretch, math.sin(a) * d, 0.2), (1.0, 0.9, 0.8), MESA[k % 5], n=9, flat=0.5)
            _top_light(m, t, MESA_TOP)
        if stretch > 1:
            for x in (-R * 0.9, 0, R * 0.9):
                collider(r, x * stretch * 0.75, 0, R * 1.05)
        else:
            collider(r, 0, 0, R * 1.08)
        m.build(r)


def arch(variants):
    """Obstacles: natural arches over the race course. Colliders on the legs only: fly through."""
    shapes = [(5.5, 15.5, 1.9), (6.5, 16.5, 1.7)]
    for i, (half, top, thick) in enumerate(shapes):
        r = root("arch", i, height=top + thick, obstacle=1, span=round(half * 2, 2))
        rng = random.Random(660 + i)
        m = Model(f"arch_{i}", 660 + i)
        fs = []
        leg_top = top - 3.2
        for s in (-1, 1):
            f, _ = strata(m, rng, s * half, 0, _mesa_layers(leg_top, 2.0, n=5), sides=8, jit=0.12, colors=MESA)
            fs += f
            collider(r, s * half, 0, 2.3)
        # the span: a thick banded beam bowing up between the leg tops, its underside clear of 12
        n = 10
        pts = []
        for k in range(n + 1):
            t = k / n
            x = -half * 1.05 + 2 * half * 1.05 * t
            z = leg_top - 0.6 + (top - leg_top + 0.6) * math.sin(math.pi * t) ** 0.6
            pts.append(Vector((x, 0, z)))
        radii = [thick * (1.5 - 0.5 * math.sin(math.pi * k / n)) for k in range(n + 1)]
        fs += tube(m, pts, radii, MESA[1], segs=7, colors=[MESA[(k // 2) % 5] for k in range(n)])
        # flatten it a little across y so it reads as a slab of rock
        for v in m.bm.verts:
            if v.co.z > leg_top - 1:
                v.co.y *= 1.15
        for f in fs:
            f.normal_update()
        recolor(m, fs, lambda f: (MESA_TOP, "#d08a5a")[int(f.calc_center_median().x // 3.2) % 2] if f.normal.z > 0.7 else None)
        for k in range(6):
            a = rng.uniform(0, math.tau)
            sx = rng.choice((-1, 1)) * half
            t = lump(m, rng, (sx + math.cos(a) * 3.0, math.sin(a) * 3.0, 0.2), (0.9, 0.8, 0.7), MESA[k % 5], n=9, flat=0.5)
            _top_light(m, t, MESA_TOP)
        for k in range(3):
            m.ball(0.4, (rng.uniform(-1.5, 1.5), rng.uniform(-0.5, 0.5), top + thick * 0.6), SCRUB[k % 2], subdiv=0,
                   scale=(1, 1, 0.6))
        m.build(r)


def dune_grass(variants):
    for i in range(3):
        r = root("dune_grass", i)
        rng = random.Random(680 + i)
        if i == 2:
            hump = Model("dune_grass_2_hump", 682)
            hump.ball(1.4, (0, 0, -0.5), SAND[0], subdiv=1, scale=(1.3, 1, 0.55), jitter=0.08)
            hump.build(r)
        m = Model(f"dune_grass_{i}", 680 + i)
        tufts = [(0, 0)] if i == 0 else [(0, 0), (0.9, 0.4), (-0.7, 0.6)]
        z0 = 0.15 if i == 2 else 0.0
        for k, (tx, ty) in enumerate(tufts):
            for j in range(9):
                a = rng.uniform(0, math.tau)
                L = rng.uniform(0.8, 1.4)
                pts = arc((tx, ty, z0 + (0.25 if i == 2 and k == 0 else 0)), a, L, 1.6, 1.2, n=3)
                ribbon(m, pts, [0.07, 0.07, 0.05, 0.02], GRASS[(j + k) % 4], fold=0.0, thick=0.06)
            for j in range(2):                                             # a seed head or two
                a = rng.uniform(0, math.tau)
                p = (tx + math.cos(a) * 0.3, ty + math.sin(a) * 0.3, z0 + 1.2)
                m.plank_line((tx, ty, z0), p, 0.05, 0.05, GRASS[1])
                m.box((0.12, 0.12, 0.35), (p[0], p[1], p[2] + 0.15), GRASS[3])
        obj = m.build(r)
        sway(obj, f"dune_grass_{i}_sway_idle", amp=(0.07, 0.06), period=2.2 + i * 0.3, phase=i)


# --- monolith field ---------------------------------------------------------------------------

def _glyphs(m, rng, x0, x1, z0, z1, y, rows, color=GLYPH, slope=0.0):
    """Carved glyphs on a face at y (facing -y), in rows: little glowing marks of a few shapes.
    `slope`: how much the face draws in (y shrinks towards 0) per unit up, for tapered stones."""
    dz = (z1 - z0) / rows
    y0 = y
    for k in range(rows):
        z = z0 + (k + 0.5) * dz
        y = y0 - math.copysign(slope * z, y0)
        shrink = 1 - slope * z / max(abs(y0), 1e-3)
        x0k, x1k = x0 * shrink, x1 * shrink
        kind = rng.randrange(4)
        cx = (x0k + x1k) / 2 + rng.uniform(-0.05, 0.05)
        w = (x1k - x0k) * 0.5
        if kind == 0:
            m.box((w, 0.1, 0.18), (cx, y, z), color, glow=True)
            m.box((0.18, 0.1, dz * 0.55), (cx, y, z), color, glow=True)
        elif kind == 1:
            m.box((w, 0.1, 0.16), (cx, y, z + dz * 0.2), color, glow=True)
            m.box((w, 0.1, 0.16), (cx, y, z - dz * 0.2), color, glow=True)
        elif kind == 2:
            m.box((0.3, 0.1, 0.3), (cx, y, z), color, glow=True, rot=(0, 0.785, 0))
        else:
            m.box((0.16, 0.1, dz * 0.6), (cx - w * 0.35, y, z), color, glow=True)
            m.box((0.16, 0.1, dz * 0.6), (cx + w * 0.35, y, z), color, glow=True)
            m.box((w * 0.8, 0.1, 0.14), (cx, y, z + dz * 0.25), color, glow=True)


def _drift(m, rng, R, n=6):
    for k in range(n):
        a = k * math.tau / n + rng.uniform(-0.3, 0.3)
        lump(m, rng, (math.cos(a) * R, math.sin(a) * R, 0.0), (1.4, 1.1, 0.6), SAND[k % 2], n=9, flat=0.5)


def monolith(variants):
    """Obstacles (about 14): standing stones of the vanished people, glyphs still lit."""
    shapes = [(14.0, "slab"), (14.5, "obelisk"), (13.5, "broken")]
    for i, (H, form) in enumerate(shapes):
        r = root("monolith", i, height=H, obstacle=1)
        rng = random.Random(700 + i)
        m = Model(f"monolith_{i}", 700 + i)
        if form == "slab":
            fs = list(m.box((2.6, 1.3, H), (0, 0, H / 2 - 0.3), STONE[0]))
            fs += m.box((2.4, 1.2, 0.5), (0, 0, H - 0.05), STONE[1], taper=0.8)
            _glyphs(m, rng, -0.9, 0.9, 2.0, H - 1.5, -0.62, 7)
            _glyphs(m, rng, -0.9, 0.9, 2.0, H - 1.5, 0.62, 7)
            # an eye on the top, for the ones who look down
            m.box((1.3, 0.55, 0.12), (0, 0, H + 0.24), GLYPH, glow=True)
            m.box((0.45, 0.45, 0.16), (0, 0, H + 0.26), GLYPH_HOT, glow=True, rot=(0, 0, 0.785))
            collider(r, 0, 0, 1.5)
        elif form == "obelisk":
            fs = list(m.box((2.0, 2.0, H - 1.6), (0, 0, (H - 1.6) / 2 - 0.3), STONE[1], taper=0.65))
            fs += m.box((2.4, 2.4, 0.8), (0, 0, 0.1), STONE[2])
            p = m.cyl(0.93, 1.9, (0, 0, H - 1.95), GLYPH, segs=4, r_top=0.0, rot=(0, 0, math.pi / 4), glow=True)
            sl = 0.35 / (H - 1.6)                                          # the faces draw in as it rises
            for s in (-1, 1):
                _glyphs(m, rng, -0.55, 0.55, 2.0, H - 3.5, s * 1.02, 6, slope=sl)
            for s in (-1, 1):
                for k in range(5):
                    z = 2.5 + k * 2.0
                    m.box((0.12, 0.5, 0.18), (s * (1.02 - sl * (z + 0.3)), 0, z), GLYPH, glow=True)
            collider(r, 0, 0, 1.4)
        else:
            # leaning, its top broken off and lying at its foot
            fs = list(m.box((2.4, 1.2, H), (0, 0, H / 2 - 0.4), STONE[2], taper=0.9))
            _glyphs(m, rng, -0.8, 0.8, 2.0, H - 1.0, -0.62, 6)
            # break the top: drop the corner verts at random to a jagged slant
            for v in m.bm.verts:
                if v.co.z > H - 1:
                    v.co.z -= (v.co.x + 1.2) * 0.6 + rng.uniform(0, 0.3)
            bmesh.ops.rotate(m.bm, verts=list(m.bm.verts), cent=(0, 0, 0), matrix=Matrix.Rotation(0.12, 3, "X"))
            fs = list(m.bm.faces)
            chunk = m.box((2.2, 1.1, 2.2), (2.6, -1.5, 0.6), STONE[0], rot=(0.3, 1.2, 0.4))
            _glyphs(m, rng, 2.0, 3.0, 0.3, 1.2, -2.15, 1)
            collider(r, 0, -0.6, 1.5)
        _top_light(m, [f for f in m.bm.faces if f.material_index < len(m.mats) and not m.mats[f.material_index].name.startswith("glow")],
                   STONE_TOP, 0.8)
        _drift(m, rng, 1.6)
        m.build(r)


def statue_head(variants):
    """Half-buried heads of the vanished people's giants, eyes still lit. Under 8."""
    for i in range(2):
        r = root("statue_head", i)
        rng = random.Random(720 + i)
        m = Model(f"statue_head_{i}", 720 + i)
        # the head, built upright facing -y, chin at z = 0
        fs = list(m.box((3.2, 3.0, 4.4), (0, 0, 2.2), STONE[1], taper=0.88))
        fs += m.box((3.5, 0.8, 0.5), (0, -1.35, 3.0), STONE[0])                           # the brow
        fs += m.box((0.75, 0.9, 1.5), (0, -1.75, 2.1), STONE[2], taper=0.5)               # the nose
        fs += m.box((1.5, 0.4, 0.35), (0, -1.55, 0.85), STONE[0])                         # the lips
        for s in (-1, 1):
            m.box((0.9, 0.2, 0.45), (s * 0.85, -1.52, 2.6), "#1a1420")                   # sockets
            m.box((0.6, 0.22, 0.24), (s * 0.85, -1.56, 2.6), GLYPH, glow=True)           # and the light in them
            fs += m.box((0.4, 1.4, 1.6), (s * 1.7, 0, 2.3), STONE[2])                     # ears
        # a headdress: a flat crown, banded, with a lit gem in the middle (for those above)
        fs += m.box((3.8, 3.4, 0.6), (0, 0.1, 4.7), STONE[0], taper=0.9)
        fs += m.box((3.0, 2.8, 0.5), (0, 0.1, 5.2), STONE[1], taper=0.8)
        m.box((0.7, 0.7, 0.2), (0, 0.1, 5.5), GLYPH, glow=True, rot=(0, 0, 0.785))
        for k in range(4):
            m.box((0.2, 0.2, 0.18), (-1.2 + k * 0.8, -1.45, 4.85), GLYPH, glow=True)
        if i == 0:
            # buried to the chin, tipped forward a touch
            bmesh.ops.rotate(m.bm, verts=list(m.bm.verts), cent=(0, 0, 0), matrix=Matrix.Rotation(-0.12, 3, "X"))
            bmesh.ops.translate(m.bm, verts=list(m.bm.verts), vec=(0, 0, -0.6))
        else:
            # toppled on its back, face to the sky, half sunk in the dune
            bmesh.ops.rotate(m.bm, verts=list(m.bm.verts), cent=(0, 0, 0), matrix=Matrix.Rotation(-1.45, 3, "X"))
            bmesh.ops.rotate(m.bm, verts=list(m.bm.verts), cent=(0, 0, 0), matrix=Matrix.Rotation(0.2, 3, "Y"))
            bmesh.ops.translate(m.bm, verts=list(m.bm.verts), vec=(0, -2.0, 0.6))
        _top_light(m, [f for f in m.bm.faces if not m.mats[f.material_index].name.startswith("glow")], STONE_TOP, 0.85)
        _drift(m, rng, 2.2, n=7)
        m.build(r)


# --- bluepalm oasis ---------------------------------------------------------------------------

def nomad_tent(variants):
    for i in range(3):
        r = root("nomad_tent", i)
        rng = random.Random(760 + i)
        m = Model(f"nomad_tent_{i}", 760 + i)
        if i == 0:
            # a round tent with a striped cone roof and a smoke hole
            a, b = CLOTH["red"]
            m.cyl(2.0, 1.3, (0, 0, 0), b, segs=10)
            fs = list(m.cyl(2.3, 1.7, (0, 0, 1.3), a, segs=10, r_top=0.35))
            for f in fs:
                f.normal_update()
            recolor(m, fs, lambda f: b if f.normal.z < 0.95 and round((math.atan2(f.calc_center_median().y, f.calc_center_median().x) + math.pi) / (math.tau / 10)) % 2 else None)
            m.cyl(0.36, 0.25, (0, 0, 3.0), "#3a2a20", segs=8)
            m.box((0.9, 0.08, 1.0), (0, -2.0, 0.5), "#3a2a20")              # the door flap open
            m.box((2.4, 1.6, 0.06), (0, -2.8, 0.03), RUG[0])
            m.box((2.0, 1.2, 0.07), (0, -2.8, 0.04), RUG[2])
        elif i == 1:
            # a market awning: striped cloth on poles, rugs, crates and a lamp
            a, b = CLOTH["indigo"]
            for x in (-2.2, 2.2):
                for y in (-1.4, 1.4):
                    m.cyl(0.08, 2.4, (x, y, 0), POLE, segs=5)
            for k in range(7):
                m.box((0.66, 3.2, 0.1), (-2.0 + k * 0.66, 0, 2.4), a if k % 2 else b, rot=(0.12, 0, 0))
            m.box((4.6, 0.12, 0.4), (0, -1.6, 2.15), a)
            for k, (x, y) in enumerate(((-1.2, 0.2), (0.3, -0.3), (1.5, 0.4))):
                m.box((1.4, 1.0, 0.05), (x, y, 0.03), RUG[k])
            for k in range(3):
                m.box((0.6, 0.6, 0.6), (-1.6 + k * 0.7, 1.0, 0.3), ("#8a6a3a", "#a07a44")[k % 2])
            for k in range(3):
                m.cyl(0.25, 0.5, (1.2 + k * 0.45, -0.6, 0.0), "#b8603a", segs=6, r_top=0.12)
            m.ball(0.2, (0, -1.3, 1.9), LAMP, subdiv=1, glow=True)
        else:
            # a lean-to of teal cloth, patched, a fire glowing in front
            a, b = CLOTH["teal"]
            m.gable((3.6, 2.8, 1.8), (0, 0, 0), a, overhang=0.1)
            m.prism([(-1.4, 0), (1.4, 0), (0, 1.8)], 0.05, (1.8, 0, 0), b, rot=(0, 0, math.pi / 2))
            m.box((0.9, 0.7, 0.1), (-0.6, 0.6, 1.0), "#d8a040", rot=(0.6, 0, 0))     # a patch
            m.box((0.7, 0.6, 0.1), (0.9, -0.7, 1.05), "#b0342a", rot=(-0.6, 0, 0))
            for k in range(6):                                             # the fire ring
                ang = k * math.tau / 6
                m.ball(0.17, (math.cos(ang) * 0.45, -2.4 + math.sin(ang) * 0.45, 0.08), "#6a5a50", subdiv=0)
            m.cyl(0.28, 0.25, (0, -2.4, 0), "#ff7a2a", segs=6, r_top=0.08, glow=True)
            m.box((0.8, 0.5, 0.5), (1.9, -1.0, 0.25), "#8a5a3a")             # saddle bags
            m.box((0.8, 0.5, 0.5), (1.9, -1.6, 0.25), "#a83a3a")
        m.build(r, rot_z=rng.uniform(-0.3, 0.3))


def build():
    salt_pillar(3)
    skeleton_ribs(2)
    mesa(2)
    arch(2)
    dune_grass(3)
    monolith(3)
    statue_head(2)
    nomad_tent(3)
