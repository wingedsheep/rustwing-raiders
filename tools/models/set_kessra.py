"""KESSRA's set pieces: a leviathan's bones on the salt, bridges over the mesa run,
the henges and the fallen colossus of the vanished people, the oasis's crawler and aqueduct; and
the scenery that keeps each place from being one prop repeated (salt crystals, hoodoos, glyph slabs,
fan palms, market stalls)."""
from __future__ import annotations

import math
import random

from mathutils import Matrix, Vector

from kit import Model
from props_a_lib import (arc, bend, collider, frond, hull, lump, recolor, ribbon, root, sway, tube)

SALT_TOP = "#fbf8f0"
SALT = ["#e6dccf", "#d8ccbe", "#efe6da"]
SALT_SHADE = "#b8aab8"
SALT_RUST = "#c8906a"
SALT_PINK = "#e8b8b0"
BRINE = [("#d89098", "#f0c8c0"), ("#5aa8a8", "#b0e0d8"), ("#c8a068", "#ecdcb0")]
BONE = ["#eadcbc", "#dccaa4", "#f2e8d0"]
BONE_DARK = "#a8906a"
SOCKET = "#3a2a24"
MESA = ["#8a3a2a", "#a84a30", "#c0683a", "#9a4430", "#b85a36"]
MESA_TOP = "#e0a070"
MESA_TOP2 = "#d08a5a"
SCRUB = ["#8a8a40", "#6e7a38"]
SAND = ["#d89a68", "#e0aa78", "#e8b888"]
STONE = ["#5a4e66", "#665a72", "#4e4458"]
STONE_TOP = "#9a8aa8"
STONE_DARK = "#2e2636"
GLYPH = "#4affe0"
GLYPH_HOT = "#c8fff4"
WOOD = ["#6a4a30", "#8a6a44", "#5a3e2a"]
ROPE = "#c8a870"
IRON = ["#4a3a34", "#6a4a3a", "#8a5a3a"]
CHECK = ("#f0e8d8", "#2a2228")
FLAGS = ["#e83a2a", "#f0c040", "#3ab0c0", "#f0e8d8"]
PALM_BARK = ["#8a6a4a", "#a8845a", "#6e5238"]
PALM_LEAF = [("#3a8ac8", "#2a6a9e"), ("#4aa0d8", "#2e78ae"), ("#2e7ab8", "#22608e")]
FAN_LEAF = [("#3aa88a", "#2a7a6a"), ("#4ab89a", "#2e8a74")]
DATES = "#e88a3a"
CLOTH = [("#b0342a", "#d8a040"), ("#3a4a9a", "#e8dcc0"), ("#2a8a8a", "#e8dcc0"), ("#d86a2a", "#f0e0b0")]
RUG = ["#a83a3a", "#3a4a8a", "#d89a3a", "#2a8a8a"]
TILE = ["#e8e0d0", "#3a8ab8", "#d8c8a8"]
POOL = "#2ad8d0"
POOL_GLOW = "#6af0e8"
LAMP = "#ffc04a"
POT = ["#b8603a", "#c87a4a", "#8a4a30"]
SPICE = ["#e8a030", "#c83a2a", "#d8d040", "#8a3a6a"]


# --- helpers ----------------------------------------------------------------------------------

def _stack(m, rng, x, y, layers, sides=8, jit=0.15, drift=(0.0, 0.0), colors=MESA):
    """Faceted drums piled up: layers = [(z0, z1, r0, r1), ...]. Returns faces and the top centre."""
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
        fs += hull(m, pts, colors[j % len(colors)])
        cx, cy = nx, ny
    return fs, (cx, cy)


def _beam(m, a, b, w0, h0, color, w1=None, h1=None, rng=None, jit=0.0):
    """A squared beam from a to b: w across (horizontal), h up, tapering to w1, h1 at b."""
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
            j = Vector((rng.uniform(-jit, jit), rng.uniform(-jit, jit), rng.uniform(-jit, jit))) if rng else Vector()
            pts.append(p + s * sx * w / 2 + u * sz * h / 2 + j)
    return hull(m, pts, color)


def _paint(m, faces, top=None, shade=None, low=None, low_z=0.5, dot=0.7, sun=(-0.5, -0.4, 0.2), shade_dot=-0.35):
    """Tops light, the faces turned from the sun shaded, the feet stained."""
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
    recolor(m, faces, fn)


def _bands(m, faces, z0, step, colors, top=None, dot=0.75):
    """Banded by height (strata), tops picked out."""
    for f in faces:
        f.normal_update()

    def fn(f):
        if top and f.normal.z > dot:
            return top
        return colors[int((f.calc_center_median().z - z0) // step) % len(colors)]
    recolor(m, faces, fn)


def _glyph(m, rng, x, y, z, size, color=GLYPH, up=True):
    """One carved mark lying on an upward face (or on a face looking -y with up=False)."""
    kind = rng.randrange(5)
    t = 0.12
    if up:
        def bx(w, d, dx=0.0, dy=0.0, rot=0.0):
            m.box((w, d, t), (x + dx, y + dy, z), color, glow=True, rot=(0, 0, rot))
    else:
        def bx(w, d, dx=0.0, dy=0.0, rot=0.0):
            m.box((w, t, d), (x + dx, y, z + dy), color, glow=True, rot=(0, rot, 0))
    s = size
    if kind == 0:
        bx(s, s * 0.22)
        bx(s * 0.22, s)
    elif kind == 1:
        bx(s, s * 0.2, dy=s * 0.25)
        bx(s, s * 0.2, dy=-s * 0.25)
    elif kind == 2:
        bx(s * 0.6, s * 0.6, rot=0.785)
    elif kind == 3:
        bx(s * 0.2, s, dx=-s * 0.35)
        bx(s * 0.2, s, dx=s * 0.35)
        bx(s * 0.9, s * 0.2, dy=s * 0.3)
    else:
        bx(s * 0.8, s * 0.2, rot=0.6)
        bx(s * 0.8, s * 0.2, rot=-0.6)


def _drift(m, rng, cx, cy, R, n=6, size=(1.6, 1.2, 0.6), z=0.0):
    for k in range(n):
        a = k * math.tau / n + rng.uniform(-0.3, 0.3)
        lump(m, rng, (cx + math.cos(a) * R, cy + math.sin(a) * R, z), size, SAND[k % 3], n=9, flat=0.5)


def _salt_drift(m, rng, cx, cy, R, n=6, size=(1.4, 1.0, 0.45)):
    for k in range(n):
        a = k * math.tau / n + rng.uniform(-0.3, 0.3)
        fs = lump(m, rng, (cx + math.cos(a) * R, cy + math.sin(a) * R, 0.0), size, SALT[k % 3], n=9, flat=0.5)
        _paint(m, fs, SALT_TOP, SALT_SHADE)


# --- the salt pans ----------------------------------------------------------------------------

def leviathan(variants):
    """Giant: the bones of a sand-leviathan, beached when this was a sea. Under 8.5."""
    for i in range(2):
        r = root("kessra_leviathan", i)
        rng = random.Random(3100 + i)
        m = Model(f"kessra_leviathan_{i}", 3100 + i)
        if i == 0:
            # lying straight, a lazy S down the pan: tail at -x, skull at +x
            spine = [Vector((-34 + k * 2.2, 3.0 * math.sin(k * 0.18), 1.2 + 0.9 * math.sin(k / 26 * math.pi))) for k in range(27)]
        else:
            # curled round on itself, the skull tucked into the curl
            spine = []
            for k in range(27):
                a = -0.6 + k * 0.165
                rad = 19 - k * 0.32
                spine.append(Vector((math.cos(a) * rad, math.sin(a) * rad, 1.0 + 0.8 * math.sin(k / 26 * math.pi))))
        n = len(spine)
        fs = []
        for k, p in enumerate(spine):
            t = k / (n - 1)
            size = 0.5 + 1.1 * math.sin(min(1, t * 1.3) * math.pi * 0.9) ** 0.7
            fs += m.ball(size, tuple(p), BONE[k % 2], subdiv=1, scale=(0.8, 1.2, 0.8))
            # the dorsal blade of each vertebra
            d = (spine[min(k + 1, n - 1)] - spine[max(k - 1, 0)]).normalized()
            fs += _beam(m, p, p + Vector((0, 0, size * 1.6 + 0.5)) - d * 0.6, size * 0.4, size * 0.9, BONE[(k + 1) % 2],
                        w1=size * 0.15, h1=size * 0.3)
        # ribs: arching up out of the salt and back down, the cage wide in the middle
        for k in range(5, 21):
            if k % 4 == 3:
                continue
            p = spine[k]
            d = (spine[k + 1] - spine[k - 1]).normalized()
            side = d.cross(Vector((0, 0, 1))).normalized()
            t = (k - 5) / 15
            reach = 6.0 + 4.0 * math.sin(t * math.pi)
            h = 3.4 + 2.8 * math.sin(t * math.pi)
            for s in (-1, 1):
                broken = rng.random() < 0.22
                if i == 1 and s == 1 and k % 3 == 0:
                    continue                                               # some long gone
                pts = []
                steps = 8 if not broken else rng.randint(3, 5)
                for j in range(steps + 1):
                    u = j / 8
                    a = u * math.pi * 0.95
                    out = side * s * (math.sin(a * 0.75) * reach + 0.6)
                    up = h * math.sin(a) ** 0.8 - u * 1.2
                    pts.append(p + out + Vector((0, 0, up)) - d * (1.2 * u + 3.0 * u * u))
                radii = [0.85 - 0.45 * j / steps for j in range(steps + 1)]
                if broken:
                    radii[-1] = 0.0
                fs += tube(m, pts, radii, BONE[(k + s) % 3], segs=6)
        # the skull
        hd = spine[-1]
        d = (spine[-1] - spine[-3]).normalized()
        side = d.cross(Vector((0, 0, 1))).normalized()
        U = Vector((0, 0, 1))

        def at(f, s, u):
            return hd + d * f + side * s + U * u
        sk = [at(-1, -3.6, -0.6), at(-1, 3.6, -0.6), at(-1, -3.0, 4.2), at(-1, 3.0, 4.2), at(4, -3.4, 5.0), at(4, 3.4, 5.0),
              at(9, -2.0, 3.0), at(9, 2.0, 3.0), at(12, -1.2, 1.2), at(12, 1.2, 1.2), at(11, -1.6, -0.6), at(11, 1.6, -0.6),
              at(4, -4.2, -0.6), at(4, 4.2, -0.6)]
        fs += hull(m, sk, BONE[2])
        for s in (-1, 1):
            m.box((2.2, 1.6, 1.2), tuple(at(3.6, s * 2.6, 3.9)), SOCKET, rot=(0, 0, math.atan2(d.y, d.x)))
            m.box((1.2, 0.8, 0.8), tuple(at(9.6, s * 0.9, 2.6)), SOCKET, rot=(0, 0, math.atan2(d.y, d.x)))
            # horns sweeping back off the brow
            fs += tube(m, [at(2.5, s * 2.6, 4.4), at(-1.5, s * 4.8, 5.8), at(-5.5, s * 6.0, 6.6), at(-8.0, s * 6.2, 6.2)],
                       [0.9, 0.7, 0.4, 0.0], BONE[1], segs=6)
        # the lower jaw, fallen open beside it, its teeth up
        jaw = [at(-0.5, -2.8, 0.0), at(12.5, -1.2, 0.0)]
        off = side * -5.5
        for s in (-1, 1):
            fs += _beam(m, at(0, s * 2.6, 0.3) + off, at(12, s * 0.8, 0.3) + off, 1.2, 1.1, BONE[0], w1=0.8, h1=0.8)
            for k in range(6):
                p = (at(2 + k * 1.8, s * (2.4 - k * 0.27), 0.7) + off)
                m.cyl(0.32, 1.3, tuple(p), BONE[2], segs=5, r_top=0.0)
        for k in range(7):                                                 # teeth along the upper jaw
            for s in (-1, 1):
                p = at(5.5 + k, s * (2.3 - k * 0.15), -0.2)
                m.cyl(0.3, 0.9, tuple(p), BONE[2], segs=5, r_top=0.0, rot=(math.pi, 0, 0))
        _paint(m, fs, BONE[2], BONE_DARK, dot=0.75)
        # salt drifted against it, crusting its feet
        for k in range(16):
            p = spine[rng.randrange(n)]
            a = rng.uniform(0, math.tau)
            q = p + Vector((math.cos(a) * rng.uniform(2, 7), math.sin(a) * rng.uniform(2, 7), 0))
            t = lump(m, rng, (q.x, q.y, 0.0), (rng.uniform(1.4, 2.6), rng.uniform(1.0, 1.8), 0.6), SALT[k % 3], n=9, flat=0.5)
            _paint(m, t, SALT_TOP, SALT_SHADE)
        m.build(r)


def salt_arch(variants):
    """Span: a crust of salt bridged right over the pan, white on top, its underside dripping."""
    for i in range(2):
        r = root("kessra_salt_arch", i)
        rng = random.Random(3120 + i)
        m = Model(f"kessra_salt_arch_{i}", 3120 + i)
        fs = []
        legs = [-41.0, 41.0] + ([0.0] if i == 1 else [])
        for x in legs:
            R = 4.2 if x else 3.0
            top = 15.0 if x else 13.4
            layers = []
            z = -3.0
            nl = 6
            for k in range(nl):
                z1 = -3.0 + (top + 3.0) * (k + 1) / nl
                r0 = R * (1.25 - 0.4 * k / nl) * (1.0 + 0.1 * (k % 2))
                r1 = R * (1.25 - 0.4 * (k + 1) / nl)
                layers.append((z, z1, r0, r1))
                z = z1
            # it flares out at the top to carry the deck
            layers.append((top, top + 1.2, R * 0.9, R * 1.5))
            f, _ = _stack(m, rng, x, 0, layers, sides=8, jit=0.14, colors=SALT)
            fs += f
            collider(r, x, 0, R * 1.05)
        # the deck: slabs of crust, sagging and lumpy, some narrow and holed
        n = 12
        x0, x1 = -46.0, 46.0
        for k in range(n):
            xa = x0 + (x1 - x0) * k / n
            xb = x0 + (x1 - x0) * (k + 1) / n
            mid = (xa + xb) / 2
            if i == 0:
                bow = 1.6 * math.cos(mid / 46 * math.pi / 2)
            else:
                bow = 1.4 * abs(math.sin(mid / 46 * math.pi))
            under = 13.6 + bow
            deep = rng.uniform(5.0, 8.0)
            if k in (3, 8):
                deep = 2.6                                                  # worn thin: the land shows through
            thick = rng.uniform(1.6, 2.6)
            pts = []
            for xx in (xa - 0.4, xb + 0.4):
                for sy in (-1, 1):
                    yy = sy * deep / 2 + rng.uniform(-0.6, 0.6)
                    pts.append((xx, yy, under + rng.uniform(0, 0.3)))
                    pts.append((xx, yy * 0.85, under + thick + rng.uniform(-0.2, 0.4)))
            pts.append((mid, rng.uniform(-1, 1), under + thick + rng.uniform(0.4, 1.2)))
            fs += hull(m, pts, SALT[k % 3])
            # hex crust plates on top
            for j in range(2):
                px = rng.uniform(xa, xb)
                py = rng.uniform(-deep * 0.3, deep * 0.3)
                fs += m.cyl(rng.uniform(1.0, 1.6), 0.35, (px, py, under + thick - 0.1), SALT[2], segs=6, r_top=0.9,
                            rot=(0, 0, rng.uniform(0, 1)))
            # salt drips hanging off its underside (never below 12.5)
            for j in range(3):
                px = rng.uniform(xa, xb)
                py = rng.uniform(-deep * 0.4, deep * 0.4)
                m.cyl(rng.uniform(0.35, 0.6), min(0.9, under - 12.6), (px, py, under + 0.1), SALT_SHADE, segs=5, r_top=0.0,
                      rot=(math.pi, 0, 0))
        # crystals grown on the crown
        for k in range(10):
            px = rng.uniform(-38, 38)
            py = rng.uniform(-1.5, 1.5)
            bow = 1.6 * math.cos(px / 46 * math.pi / 2) if i == 0 else 1.4 * abs(math.sin(px / 46 * math.pi))
            z = 13.6 + bow + 1.8
            for j in range(3):
                a = rng.uniform(0, math.tau)
                tilt = rng.uniform(0.2, 0.6)
                L = rng.uniform(1.2, 2.6)
                fs += m.cyl(0.4, L, (px + math.cos(a) * 0.4, py + math.sin(a) * 0.4, z), (SALT_PINK, SALT[2])[j % 2], segs=6,
                            r_top=0.05, rot=(math.cos(a) * tilt, math.sin(a) * tilt, 0))
        _paint(m, fs, SALT_TOP, SALT_SHADE, low=SALT_RUST, low_z=1.0, dot=0.7)
        _salt_drift(m, rng, legs[0], 0, 5.5, n=6, size=(2.0, 1.4, 0.7))
        _salt_drift(m, rng, legs[1], 0, 5.5, n=6, size=(2.0, 1.4, 0.7))
        if i == 1:
            _salt_drift(m, rng, 0, 0, 5.0, n=5, size=(1.8, 1.3, 0.6))
        m.build(r)


def salt_crystal(variants):
    """Scenery: clusters of salt crystal, pinkish, a head taller than the pillars' crust."""
    for i in range(3):
        r = root("kessra_salt_crystal", i)
        rng = random.Random(3160 + i)
        m = Model(f"kessra_salt_crystal_{i}", 3160 + i)
        fs = []
        n = (5, 8, 3)[i]
        for k in range(n):
            a = k * math.tau / n + rng.uniform(-0.3, 0.3)
            d = 0 if k == 0 else rng.uniform(0.6, 1.4) * (1.4 if i == 1 else 1)
            tilt = 0 if k == 0 else rng.uniform(0.3, 0.7)
            L = (rng.uniform(3.0, 5.0) if k == 0 else rng.uniform(1.5, 3.2)) * (1.3 if i == 2 else 1)
            rr = rng.uniform(0.35, 0.6) * (1.6 if i == 2 else 1)
            c = (SALT_PINK, SALT[0], SALT[2], "#f0d0c8")[k % 4]
            fs += m.cyl(rr, L * 0.8, (math.cos(a) * d, math.sin(a) * d, -0.2), c, segs=6, r_top=rr,
                        rot=(-math.sin(a) * tilt, math.cos(a) * tilt, 0))
            tip_z = -0.2 + L * 0.8 * math.cos(tilt)
            off = L * 0.8 * math.sin(tilt)
            fs += m.cyl(rr, L * 0.25, (math.cos(a) * (d + off), math.sin(a) * (d + off), tip_z), SALT_TOP, segs=6,
                        r_top=0.0, rot=(-math.sin(a) * tilt, math.cos(a) * tilt, 0))
        _paint(m, fs, None, SALT_SHADE)
        _salt_drift(m, rng, 0, 0, 1.2, n=4, size=(0.8, 0.6, 0.3))
        if i == 2:
            # grown at the lip of a little brine pool (the eyes' blue: a pink disc reads as a marker)
            deep, shallow = BRINE[1]
            m.cyl(2.6, 0.8, (3.0, 0.4, -0.4), SALT[1], segs=9, r_top=2.3)
            m.cyl(2.0, 0.12, (3.0, 0.4, 0.36), shallow, segs=9)
            m.cyl(1.2, 0.1, (3.0, 0.4, 0.42), deep, segs=8)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def salt_ridge(variants):
    """Ground cover: pressure ridges where the crust buckled up along its hex cracks, a pink brine
    eye in one, a skin of crust plates in another."""
    for i in range(3):
        r = root("kessra_salt_ridge", i)
        rng = random.Random(3180 + i)
        m = Model(f"kessra_salt_ridge_{i}", 3180 + i)
        fs = []
        if i < 2:
            # a buckled hex: ridges along a few of its sides, tented up
            n = 6
            R = 2.6 if i == 0 else 2.0
            corners = [(math.cos(k * math.tau / n + 0.2) * R * rng.uniform(0.85, 1.1),
                        math.sin(k * math.tau / n + 0.2) * R * rng.uniform(0.85, 1.1)) for k in range(n)]
            for k in range(n if i == 0 else 4):
                a, b = Vector((*corners[k], 0)), Vector((*corners[(k + 1) % n], 0))
                d = b - a
                mid = (a + b) / 2
                h = rng.uniform(0.35, 0.7)
                fs += hull(m, [a + Vector((0, 0, -0.1)), b + Vector((0, 0, -0.1)),
                               mid + d.cross(Vector((0, 0, 1))).normalized() * 0.4 + Vector((0, 0, -0.1)),
                               mid - d.cross(Vector((0, 0, 1))).normalized() * 0.4 + Vector((0, 0, -0.1)),
                               a.lerp(b, 0.3) + Vector((0, 0, h)), a.lerp(b, 0.7) + Vector((0, 0, h * 0.8))], SALT[k % 3])
            if i == 1:
                deep, shallow = BRINE[0]
                m.cyl(1.1, 0.06, (0, 0, -0.02), shallow, segs=7)
                m.cyl(0.6, 0.06, (0.1, 0, 0.0), deep, segs=6)
        else:
            # crust plates heaved and tilted like broken tiles
            for k in range(6):
                a = rng.uniform(0, math.tau)
                d = rng.uniform(0, 1.6)
                pts = [(math.cos(a) * d + math.cos(b) * 0.8, math.sin(a) * d + math.sin(b) * 0.8)
                       for b in [j * math.tau / 6 + rng.uniform(-0.2, 0.2) for j in range(6)]]
                f = m.slab(pts, -0.1, 0.12, SALT[k % 3])
                tilt = Matrix.Rotation(rng.uniform(-0.3, 0.3), 3, "X") @ Matrix.Rotation(rng.uniform(-0.3, 0.3), 3, "Y")
                vs = list({v for fc in f for v in fc.verts})
                c = sum((v.co for v in vs), Vector()) / len(vs)
                for v in vs:
                    v.co = c + tilt @ (v.co - c)
                fs += list(f)
        _paint(m, fs, SALT_TOP, SALT_SHADE)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def salt_cache(variants):
    """Scenery: the cartel's salt-cutters: cut blocks stacked under a tarp, a rusty rake-sled, a
    claim post with a red rag; a cutter's sledge with its blocks spilled."""
    for i in range(2):
        r = root("kessra_salt_cache", i)
        rng = random.Random(3200 + i)
        m = Model(f"kessra_salt_cache_{i}", 3200 + i)
        fs = []
        if i == 0:
            for lx in range(3):
                for ly in range(2):
                    for lz in range(2 if lx < 2 else 1):
                        fs += list(m.box((0.95, 0.75, 0.6), (lx * 1.0 - 1.0, ly * 0.8 - 0.4, 0.3 + lz * 0.62), SALT[(lx + ly + lz) % 3],
                                         rot=(0, 0, rng.uniform(-0.05, 0.05))))
            m.box((2.3, 1.9, 0.08), (-0.5, 0, 1.28), "#b0342a", rot=(0.05, -0.04, 0))    # the tarp
            m.box((0.12, 0.12, 2.6), (1.8, 1.2, 1.3), WOOD[2])
            m.prism([(0, 0), (0.9, -0.15), (0, -0.5)], 0.06, (1.85, 1.2, 2.5), "#e83a2a")
            m.box((2.4, 0.9, 0.3), (0.4, -1.9, 0.15), IRON[1], rot=(0, 0, 0.2))           # the rake-sled
            for k in range(6):
                m.box((0.1, 0.5, 0.35), (-0.6 + k * 0.4, -2.45, 0.15), IRON[0], rot=(0, 0, 0.2))
            m.box((1.6, 0.1, 0.1), (1.9, -1.4, 0.5), WOOD[1], rot=(0, 0.2, 0.8))
        else:
            m.box((3.0, 1.4, 0.3), (0, 0, 0.3), WOOD[1])
            for s in (-1, 1):
                m.box((3.4, 0.15, 0.15), (0.1, s * 0.6, 0.1), IRON[0], rot=(0, 0.05, 0))
            for k in range(3):
                fs += list(m.box((0.95, 0.75, 0.6), (-0.9 + k * 1.0, 0, 0.75), SALT[k % 3]))
            for k in range(4):
                fs += list(m.box((0.95, 0.75, 0.6), (rng.uniform(1.5, 3.5), rng.uniform(-1.6, 1.6), 0.2), SALT[k % 3],
                                 rot=(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0, 3))))
            m.box((1.5, 0.12, 0.12), (-2.2, 0.2, 0.3), ROPE, rot=(0, 0, 0.3))
        _paint(m, fs, SALT_TOP, SALT_SHADE)
        _salt_drift(m, rng, 0, 0, 2.4, n=3, size=(0.8, 0.6, 0.3))
        m.build(r, rot_z=rng.uniform(0, math.tau))


def land_yacht(variants):
    """Scenery, rare: a wrecked sand-yacht of the Rust Sea, rusted to the colour of the planet,
    its mast snapped, its striped sail spread on the salt."""
    for i in range(2):
        r = root("kessra_land_yacht", i)
        rng = random.Random(3220 + i)
        m = Model(f"kessra_land_yacht_{i}", 3220 + i)
        hullp = [(-2.8, -0.5, 0.3), (-2.8, 0.5, 0.3), (-2.6, -0.4, 1.0), (-2.6, 0.4, 1.0), (1.6, -0.8, 0.25),
                 (1.6, 0.8, 0.25), (1.6, -0.75, 1.0), (1.6, 0.75, 1.0), (3.2, 0, 0.5), (3.0, 0, 1.0)]
        fs = hull(m, hullp, IRON[1])
        _paint(m, fs, "#a8603a", IRON[0], dot=0.7)
        m.box((3.6, 1.2, 0.1), (-0.3, 0, 1.02), "#7a5a3a")                      # deck boards
        m.box((5.2, 0.25, 0.25), (0.2, 0, 0.2), IRON[0], rot=(0, 0, 1.57))       # the cross-axle
        for s in (-1, 1):
            m.cyl(0.55, 0.3, (0.2, s * 2.5, 0.55), "#3a2a24", segs=8, rot=(math.pi / 2, 0, 0))
        m.cyl(0.55, 0.3, (3.0, 0, 0.55), "#3a2a24", segs=8, rot=(math.pi / 2, 0, 0))
        if i == 0:
            m.cyl(0.2, 2.2, (0.6, 0, 1.0), WOOD[2], segs=5)                        # the stump
            m.box((5.5, 0.25, 0.25), (-2.0, 2.6, 0.15), WOOD[2], rot=(0, 0, 0.5))   # the snapped mast
            m.prism([(0, 0), (4.6, 0), (0.5, 3.2)], 0.08, (-4.2, 1.2, 0.08), "#e8dcc0", rot=(math.pi / 2, 0, 0.5))
            m.prism([(0.4, 0.3), (2.2, 0.3), (0.6, 1.6)], 0.09, (-4.2, 1.2, 0.1), "#c83a2a", rot=(math.pi / 2, 0, 0.5))
        else:
            # keeled over on its side, half buried, the wheel up
            for v in m.bm.verts:
                v.co = Matrix.Rotation(1.2, 3, "X") @ v.co
                v.co.z -= 0.3
            m.cyl(0.18, 4.5, (0.5, 0.8, 0.3), WOOD[2], segs=5, rot=(-1.4, 0, 0))
            m.prism([(0, 0), (3.6, 0), (0.2, 2.6)], 0.08, (0.5, -2.0, 0.08), "#3ab0c0", rot=(math.pi / 2, 0, -0.2))
        _salt_drift(m, rng, 0, 0, 2.8, n=5, size=(1.2, 0.9, 0.45))
        m.build(r, rot_z=rng.uniform(0, math.tau))


# --- the salt pans, laid out (sim/layouts/saltpans.ts) ----------------------------------------

SALT_COOL = "#c8c4dc"
SALT_FOOT = "#d8d0c4"
SALT_STAIN = "#e0b8a8"


def _salt_block(m, rng, cx, cy, z0, w, d, h, turn, jit=0.12):
    """One block of grown salt: a squared lump, its corners knocked about, a little skewed."""
    c, s = math.cos(turn), math.sin(turn)
    pts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz, k in ((0, 1.0), (1, rng.uniform(0.82, 0.96))):
                x = sx * w / 2 * k + rng.uniform(-jit, jit) * w
                y = sy * d / 2 * k + rng.uniform(-jit, jit) * d
                pts.append((cx + x * c - y * s, cy + x * s + y * c, z0 + sz * h + rng.uniform(-0.08, 0.08) * h))
    # (a knob on the top now and then, so the tops aren't all flat)
    if rng.random() < 0.5:
        pts.append((cx + rng.uniform(-0.2, 0.2) * w, cy + rng.uniform(-0.2, 0.2) * d, z0 + h * rng.uniform(1.05, 1.15)))
    return hull(m, pts, SALT[rng.randrange(3)])


def _salt_column(m, rng, x, y, H, W, lean=(0.0, 0.0)):
    """Blocks of salt piled up from the brine: wide and crusted at the foot, narrowing, each tier
    shifted off the last; chunks stuck on the sides. Returns its faces and its top."""
    fs = []
    z = -0.15
    cx, cy = x, y
    w = W
    turn = rng.uniform(0, math.tau)
    while z < H - 0.3:
        h = min(rng.uniform(0.9, 1.6) * (W / 2.2) ** 0.4, H - z)
        dw = rng.uniform(0.82, 1.08)
        fs += _salt_block(m, rng, cx, cy, z, w, w * rng.uniform(0.75, 1.0), h + 0.1, turn)
        # a chunk grown on its side, now and then
        if rng.random() < 0.45 and w > 1.0:
            a = rng.uniform(0, math.tau)
            cw = w * rng.uniform(0.35, 0.55)
            fs += _salt_block(m, rng, cx + math.cos(a) * w * 0.45, cy + math.sin(a) * w * 0.45, z + rng.uniform(-0.3, 0.2) * h, cw, cw, h * rng.uniform(0.6, 1.0), turn + rng.uniform(-0.5, 0.5))
        z += h
        w = max(0.6, w * dw * rng.uniform(0.86, 0.98))
        cx += lean[0] * h + rng.uniform(-0.12, 0.12) * w
        cy += lean[1] * h + rng.uniform(-0.12, 0.12) * w
        turn += rng.uniform(-0.35, 0.35)
    return fs, (cx, cy, z)


def _salt_skirt(m, rng, R, n=7):
    """The crust heaped round a stack's foot, a lip of it, broken blocks fallen off."""
    fs = []
    for k in range(n):
        a = k * math.tau / n + rng.uniform(-0.3, 0.3)
        d = R * rng.uniform(0.75, 1.05)
        fs += lump(m, rng, (math.cos(a) * d, math.sin(a) * d, 0.0), (R * 0.45, R * 0.35, 0.35), SALT_FOOT, n=8, flat=0.6)
    for k in range(rng.randrange(0, 2)):
        a = rng.uniform(0, math.tau)
        d = R * rng.uniform(1.0, 1.3)
        b = rng.uniform(0.3, 0.6)
        fs += _salt_block(m, rng, math.cos(a) * d, math.sin(a) * d, -0.05, b, b * 0.8, b * 0.7, rng.uniform(0, 3))
    return fs


def salt_stack(variants):
    """Scenery: salt grown up in stacks where the brine wells through the crust, blocky, white on
    top, cornflower in the shade; one alone, a pair, a stand of three. All under the flight line."""
    for i in range(variants):
        r = root("kessra_salt_stack", i)
        rng = random.Random(5300 + i)
        m = Model(f"kessra_salt_stack_{i}", 5300 + i)
        fs = []
        if i < 3:
            H, W = ((6.0, 2.4), (4.4, 2.0), (7.2, 2.7))[i]
            f, _ = _salt_column(m, rng, 0, 0, H, W, (rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05)))
            fs += f
            fs += _salt_skirt(m, rng, W * 0.75)
        else:
            # a stand: the tall one and its smaller ones grown against it
            n = (2, 3, 3)[i - 3]
            for k in range(n):
                a = k * math.tau / n + rng.uniform(-0.4, 0.4)
                d = 0 if k == 0 else rng.uniform(1.7, 2.3)
                H = (6.5 if k == 0 else rng.uniform(2.6, 4.4)) * (1.1 if i == 5 else 1)
                W = 2.3 if k == 0 else rng.uniform(1.3, 1.8)
                f, _ = _salt_column(m, rng, math.cos(a) * d, math.sin(a) * d, H, W)
                fs += f
            fs += _salt_skirt(m, rng, 2.4, n=9)
        _paint(m, fs, SALT_TOP, SALT_COOL, low=SALT_FOOT, low_z=0.25, dot=0.6, shade_dot=-0.1)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def salt_tower(variants):
    """An obstacle: salt grown taller than you fly, where the crust's shoved up most; a column of
    blocks leaning a little, crusted heavy at the foot, a crown of crystals. Fly round it."""
    for i in range(variants):
        r = root("kessra_salt_tower", i)
        rng = random.Random(5320 + i)
        m = Model(f"kessra_salt_tower_{i}", 5320 + i)
        H = (16.5, 15.0, 18.0)[i % 3]
        W = (3.6, 3.2, 4.0)[i % 3]
        lean = (rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04))
        fs, top = _salt_column(m, rng, 0, 0, H, W, lean)
        # a shorter one grown against it
        a = rng.uniform(0, math.tau)
        f2, _ = _salt_column(m, rng, math.cos(a) * W * 0.75, math.sin(a) * W * 0.75, H * rng.uniform(0.35, 0.55), W * 0.7)
        fs += f2
        # (a band of rose where the spice came up with the brine)
        for f in fs:
            f.normal_update()
        band = rng.uniform(0.3, 0.55) * H
        recolor(m, fs, lambda f: SALT_STAIN if abs(f.calc_center_median().z - band) < 0.7 and f.normal.z < 0.5 else None)
        # crystals on its crown
        for k in range(3):
            b = rng.uniform(0, math.tau)
            fs += m.cyl(0.35, rng.uniform(0.8, 1.5), (top[0] + math.cos(b) * 0.5, top[1] + math.sin(b) * 0.5, top[2] - 0.2), SALT_TOP, segs=5, r_top=0.0,
                        rot=(rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), 0))
        fs += _salt_skirt(m, rng, W * 0.85, n=9)
        _paint(m, fs, SALT_TOP, SALT_COOL, low=SALT_FOOT, low_z=0.25, dot=0.6, shade_dot=-0.1)
        collider(r, lean[0] * H * 0.3, lean[1] * H * 0.3, W * 0.62)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def salt_cone(variants):
    """Scenery: salt raked up into a cone on a harvested pond to drain, in rows; one fresh and
    sharp, one slumped, one half shovelled away."""
    for i in range(variants):
        r = root("kessra_salt_cone", i)
        rng = random.Random(5340 + i)
        m = Model(f"kessra_salt_cone_{i}", 5340 + i)
        R = rng.uniform(0.85, 1.0)
        Hc = (1.9, 1.4, 1.6)[i % 3]
        pts = [(0, 0, Hc)]
        n = 9
        for k in range(n):
            a = k * math.tau / n + rng.uniform(-0.1, 0.1)
            rr = R * rng.uniform(0.92, 1.08)
            pts.append((math.cos(a) * rr, math.sin(a) * rr, -0.05))
            pts.append((math.cos(a) * rr * 0.55, math.sin(a) * rr * 0.55, Hc * rng.uniform(0.5, 0.58)))
        if i == 2:
            # (a bite out of it, where it's been shovelled into a cart)
            pts = [p for p in pts if not (p[0] > 0.2 and p[2] > 0.3)] + [(0.3, 0, 0.35), (0.3, 0.5, 0.3), (0.3, -0.5, 0.3)]
        fs = hull(m, pts, SALT_TOP)
        _paint(m, fs, SALT_TOP, SALT_COOL, dot=0.3, shade_dot=-0.3)
        # (its wet foot, a ring a shade darker where it drains)
        m.cyl(R * 1.12, 0.04, (0, 0, -0.03), "#e4dcd0", segs=9)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def salt_blocks(variants):
    """Scenery: salt cut from the crust in blocks, stacked for the caravans; a neat stack, a
    stack with a tarp and a pole, blocks spilt."""
    for i in range(variants):
        r = root("kessra_salt_blocks", i)
        rng = random.Random(5360 + i)
        m = Model(f"kessra_salt_blocks_{i}", 5360 + i)
        fs = []
        if i < 2:
            for lz in range(3):
                for lx in range(3 - lz):
                    for ly in range(2):
                        fs += list(m.box((0.9, 0.7, 0.5), (lx * 0.95 - 0.95 + lz * 0.47, ly * 0.75 - 0.37, 0.25 + lz * 0.52), SALT[(lx + ly + lz) % 3],
                                         rot=(0, 0, rng.uniform(-0.06, 0.06))))
            if i == 1:
                m.box((1.9, 1.8, 0.07), (-0.3, 0, 1.12), "#b0342a", rot=(0.06, -0.08, 0.1))
                m.box((0.12, 0.12, 2.4), (1.5, 0.9, 1.2), WOOD[2])
                m.prism([(0, 0), (0.8, -0.15), (0, -0.45)], 0.05, (1.55, 0.9, 2.3), "#3ab0c0")
        else:
            for k in range(7):
                fs += list(m.box((0.9, 0.7, 0.5), (rng.uniform(-1.6, 1.6), rng.uniform(-1.2, 1.2), 0.2), SALT[k % 3],
                                 rot=(rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), rng.uniform(0, 3))))
        _paint(m, fs, SALT_TOP, SALT_COOL)
        m.build(r, rot_z=rng.uniform(0, math.tau))


KEHX = ["#6e8a80", "#7e968a", "#627a72"]
KEHX_RIM = "#b08a5a"
KEHX_DARK = "#3a4440"
RUST = ["#8a4a30", "#a85a36", "#6e3a28"]
TIN = ["#9a8a7a", "#b0a090", "#7a6a60"]
CHAR = ["#2a2224", "#3a2c28", "#4a3630"]


def kehx_vent(variants):
    """Scenery: a vent of a Kehx counting-house under the salt, in ranks over the hall: a square
    plinth of dressed stone set in the crust, a bronze grille over it in the ledger's cross, a
    capped chimney in verdigris at its middle; one with its grille gone to salt, one broken in."""
    STONE_KX = ["#d8c4a4", "#ccb898", "#e2d0b2"]
    for i in range(variants):
        r = root("kessra_kehx_vent", i)
        rng = random.Random(5380 + i)
        m = Model(f"kessra_kehx_vent_{i}", 5380 + i)
        fs = list(m.box((2.4, 2.4, 0.45), (0, 0, 0.12), STONE_KX[0], taper=0.9))
        # the corner stones, a step up
        for sx in (-1, 1):
            for sy in (-1, 1):
                fs += list(m.box((0.55, 0.55, 0.3), (sx * 0.95, sy * 0.95, 0.48), STONE_KX[2]))
        _paint(m, fs, None, "#b8a488")
        if i < 2:
            # the grille: bars in a cross and a frame, bronze, worn bright on top
            for k in (-1, 0, 1):
                m.box((1.7, 0.16, 0.12), (0, k * 0.55, 0.42), KEHX_RIM)
                m.box((0.16, 1.7, 0.12), (k * 0.55, 0, 0.42), KEHX_RIM)
            m.cyl(0.42, 0.55, (0, 0, 0.4), KEHX[0], segs=6, r_top=0.32)
            m.cyl(0.55, 0.12, (0, 0, 0.95), KEHX[1], segs=6, r_top=0.2)
            if i == 1:
                # (salt grown over half of it)
                f = hull(m, [(x, y, 0.3) for x in (-1.1, 0.2) for y in (-1.1, 1.1)] + [(-0.6, 0.0, 0.75), (-0.2, 0.6, 0.6)], SALT[2])
                _paint(m, f, SALT_TOP, SALT_COOL, dot=0.5)
        else:
            # broken in: stones tipped, salt drifted over the gap
            for k in range(3):
                a = rng.uniform(0, math.tau)
                m.box((0.7, 0.5, 0.3), (math.cos(a) * 0.5, math.sin(a) * 0.5, 0.45), STONE_KX[k % 3], rot=(rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), a))
            f = hull(m, [(math.cos(a) * 0.9, math.sin(a) * 0.9, 0.35) for a in [k * 1.05 for k in range(6)]] + [(0, 0, 0.6)], SALT[1])
            _paint(m, f, SALT_TOP, SALT_COOL, dot=0.5)
            m.box((1.0, 0.14, 0.1), (0.6, -0.7, 0.4), KEHX_RIM, rot=(0, 0.3, 0.7))
        m.build(r, rot_z=0.0)


def brine_pump(variants):
    """A set of the works: a wind-pump on a lattice tower lifting brine from the pan into the
    first ponds, its rusted tank on legs, a tarp over a platform, the pipe out to the pond."""
    for i in range(variants):
        r = root("kessra_brine_pump", i)
        rng = random.Random(5400 + i)
        m = Model(f"kessra_brine_pump_{i}", 5400 + i)
        # the tower: four legs leaning in, cross-braced
        H = 6.6
        for sx in (-1, 1):
            for sy in (-1, 1):
                _beam(m, (sx * 1.0, sy * 1.0, 0), (sx * 0.3, sy * 0.3, H), 0.16, 0.16, IRON[0])
        for z in (1.8, 3.6, 5.2):
            k = 1.0 - (z / H) * 0.7
            for a, b in (((-k, -k), (k, -k)), ((k, -k), (k, k)), ((k, k), (-k, k)), ((-k, k), (-k, -k))):
                _beam(m, (a[0], a[1], z), (b[0], b[1], z), 0.1, 0.1, IRON[1])
        # its wheel: blades in a ring, turned to the wind, and its tail vane
        m.cyl(0.3, 0.5, (0, -0.3, H), IRON[2], segs=6, rot=(math.pi / 2, 0, 0))
        for k in range(10):
            a = k * math.tau / 10
            m.box((0.32, 0.05, 1.3), (math.cos(a) * 1.0, -0.55, H + 0.25 + math.sin(a) * 1.0), TIN[k % 2], rot=(0, -a + math.pi / 2, 0))
        m.box((0.06, 1.8, 0.9), (0, 1.1, H + 0.3), RUST[0])
        # the tank, on its stand, banded
        tx, ty = 2.6, 0.4
        for sx in (-1, 1):
            for sy in (-1, 1):
                m.box((0.16, 0.16, 1.6), (tx + sx * 0.9, ty + sy * 0.9, 0.8), IRON[0])
        m.cyl(1.3, 2.0, (tx, ty, 1.6), RUST[1], segs=9)
        for z in (2.0, 2.9, 3.5):
            m.cyl(1.34, 0.12, (tx, ty, z), RUST[2], segs=9)
        m.cyl(1.3, 0.35, (tx, ty, 3.6), RUST[0], segs=9, r_top=0.4)
        # the platform and its tarp
        m.box((2.4, 2.2, 0.15), (-2.4, -0.6, 1.2), WOOD[1])
        for sx in (-1, 1):
            for sy in (-1, 1):
                m.box((0.12, 0.12, 2.8), (-2.4 + sx * 1.1, -0.6 + sy * 1.0, 1.4), WOOD[2])
        m.box((2.8, 2.6, 0.08), (-2.4, -0.6, 2.85), "#b0342a", rot=(0.12, 0.05, 0))
        m.box((0.7, 0.7, 0.7), (-2.0, -0.2, 1.6), WOOD[0])
        m.cyl(0.35, 0.8, (-2.9, -1.1, 1.3), RUST[1], segs=7)
        # the pipe out to the pond, on blocks
        _beam(m, (tx - 0.2, ty - 1.2, 0.8), (tx - 0.2, ty - 5.5, 0.3), 0.3, 0.3, IRON[2])
        for k in range(2):
            fs = _salt_block(m, rng, tx - 0.2, ty - 2.5 - k * 1.8, -0.05, 0.6, 0.5, 0.45, 0)
            _paint(m, fs, SALT_TOP, SALT_COOL)
        m.build(r, rot_z=0.0)


def sluice(variants):
    """Scenery: a sluice in a dyke of the works, letting the brine on to the next pond: two posts,
    a gate of rusted tin between them, its wheel on top; one shut, one lifted, the brine running."""
    for i in range(variants):
        r = root("kessra_sluice", i)
        rng = random.Random(5410 + i)
        m = Model(f"kessra_sluice_{i}", 5410 + i)
        for sx in (-1, 1):
            m.box((0.22, 0.22, 1.2), (sx * 0.6, 0, 0.5), WOOD[1])
        m.box((1.5, 0.18, 0.16), (0, 0, 1.1), WOOD[1])
        lift = 0.45 if i == 1 else 0.0
        m.box((1.0, 0.08, 0.6), (0, 0, 0.3 + lift), RUST[1])
        m.box((1.0, 0.1, 0.08), (0, 0, 0.6 + lift), RUST[2])
        m.cyl(0.26, 0.06, (0, 0, 1.25), RUST[1], segs=8)
        m.box((0.5, 0.05, 0.05), (0, 0, 1.3), TIN[1], rot=(0, 0, 0.6))
        # the dyke's salt heaped against it
        for sx in (-1, 1):
            f = _salt_block(m, rng, sx * 1.05, 0, -0.05, 0.6, 0.9, 0.5, 0)
            _paint(m, f, SALT_TOP, SALT_COOL, dot=0.5)
        m.build(r, rot_z=0.0)


def works_shed(variants):
    """A set of the works: the cutters' shed by the causeway, long and low, its walls laid in
    courses of cut salt, its roof corrugated tin rusted red and patched; a lean-to at one end,
    cut blocks stacked by the door, barrels, a cart of salt."""
    for i in range(variants):
        r = root("kessra_works_shed", i)
        rng = random.Random(5420 + i)
        m = Model(f"kessra_works_shed_{i}", 5420 + i)
        L = 7.5 if i == 0 else 6.0
        W, Hw = 3.4, 2.0
        # the walls: courses of blocks, each a shade off the next, a doorway dark in the front
        fs = []
        for c in range(4):
            z = c * 0.5
            x = -L / 2 + (0.5 if c % 2 else 0)
            fs += list(m.box((L, W, 0.5), (0, 0, z + 0.25), SALT[c % 3]))
            while x < L / 2 - 0.3:
                w = rng.uniform(0.9, 1.4)
                fs += list(m.box((min(w, L / 2 - x) - 0.06, 0.05, 0.44), (x + min(w, L / 2 - x) / 2, -W / 2 - 0.02, z + 0.25), SALT[rng.randrange(3)]))
                x += w
        _paint(m, fs, None, SALT_COOL, low=SALT_FOOT, low_z=0.3)
        m.box((1.1, 0.1, 1.5), (L * 0.15, -W / 2 - 0.06, 0.75), CHAR[0])
        m.box((0.5, 0.1, 0.4), (-L * 0.3, -W / 2 - 0.06, 1.3), CHAR[1])
        # the roof: corrugated, rusted red, its ribs down the slope, patched with bare tin
        H = 1.0
        angle = math.atan2(H, W / 2 + 0.3)
        ROOF = ["#d4703e", "#e08450", "#bc5c34"]
        m.gable((L + 0.6, W + 0.6, H), (0, 0, Hw), ROOF[1], overhang=0.25)
        run = (W + 0.6) / 2 + 0.25
        for side in (-1, 1):
            n = int((L + 0.6) / 0.42)
            for k in range(n):
                x = -(L + 0.6) / 2 + (k + 0.5) * (L + 0.6) / n
                m.box((0.12, run / math.cos(angle), 0.05), (x, side * run / 2, Hw + H - run / 2 * math.tan(angle) + 0.2), ROOF[k % 3] if rng.random() < 0.8 else RUST[1],
                      rot=(-side * angle, 0, 0))
            for k in range(rng.randrange(2, 4)):
                w = rng.uniform(0.9, 1.6)
                d = rng.uniform(0.8, 1.3)
                x = rng.uniform(-L / 2 + 1, L / 2 - 1)
                y = side * rng.uniform(0.5, run - d / 2 - 0.1)
                m.box((w, d, 0.06), (x, y, Hw + H - abs(y) * math.tan(angle) + 0.26), ("#c8bcae", "#a89888", "#eca070")[k % 3], rot=(-side * angle, 0, rng.uniform(-0.06, 0.06)))
        # the lean-to at one end: posts, a slope of tin, crates under it
        lx = L / 2 + 1.1
        m.box((2.0, W + 0.4, 0.07), (lx, 0, 1.75), TIN[1], rot=(0, 0.25, 0))
        for sy in (-1, 1):
            m.box((0.12, 0.12, 1.5), (lx + 0.8, sy * (W / 2 + 0.05), 0.75), WOOD[2])
        for k in range(3):
            m.box((0.6, 0.6, 0.6), (lx + rng.uniform(-0.4, 0.4), rng.uniform(-1.2, 1.2), 0.3), WOOD[k % 3], rot=(0, 0, rng.uniform(0, 1)))
        # cut blocks stacked by the door, barrels, a cart of salt
        bx = -L * 0.15
        for lz in range(2):
            for lx2 in range(3 - lz):
                for ly in range(2):
                    f = list(m.box((0.7, 0.55, 0.42), (bx + lx2 * 0.75 - 0.75 + lz * 0.37, -W / 2 - 1.0 - ly * 0.6, 0.21 + lz * 0.44), SALT[(lx2 + ly + lz) % 3], rot=(0, 0, rng.uniform(-0.08, 0.08))))
                    _paint(m, f, SALT_TOP, SALT_COOL)
        for k in range(3):
            m.cyl(0.3, 0.8, (L * 0.38 + k * 0.62, -W / 2 - 0.6 - (k % 2) * 0.4, 0.4), RUST[k % 3] if k != 1 else "#3a8a9a", segs=7)
        cx = L * 0.15 + 0.2
        m.box((1.5, 0.9, 0.45), (cx, -W / 2 - 2.2, 0.55), WOOD[1])
        f = hull(m, [(cx + x, -W / 2 - 2.2 + y, 0.75) for x in (-0.65, 0.65) for y in (-0.35, 0.35)] + [(cx, -W / 2 - 2.2, 1.25)], SALT[0])
        _paint(m, f, SALT_TOP, SALT_COOL, dot=0.5)
        for sx in (-1, 1):
            m.cyl(0.28, 0.12, (cx + sx * 0.45, -W / 2 - 1.7, 0.28), IRON[0], segs=6, rot=(math.pi / 2, 0, 0))
        m.build(r, rot_z=0.0)


def caravan_wreck(variants):
    """Scenery: a wagon of a free salt-caravan the cartel caught on the track: its bed burnt to the
    irons, its canopy in rags, its load of cut salt spilt and blackened; one on its side."""
    for i in range(variants):
        r = root("kessra_caravan_wreck", i)
        rng = random.Random(5440 + i)
        m = Model(f"kessra_caravan_wreck_{i}", 5440 + i)
        tip = i == 2
        rot = (0.0, 1.2 if tip else 0.0, 0.0)
        oz = 0.9 if tip else 0.0
        # (the burn on the salt under it)
        m.cyl(2.6, 0.04, (0, 0, -0.02), "#6a5a54", segs=9)
        m.cyl(1.7, 0.05, (0.2, 0.1, -0.01), CHAR[1], segs=8)
        # the bed and runners
        m.box((4.2, 1.9, 0.25), (0, 0, 0.55 + oz), CHAR[1], rot=rot)
        for sy in (-1, 1):
            m.box((4.8, 0.18, 0.2), (0, sy * 0.85, 0.2 + oz * (1 + sy * 0.4)), IRON[0], rot=rot)
        # ribs of the canopy, its rags
        for k in range(4):
            x = -1.5 + k * 1.0
            if not tip:
                m.box((0.12, 2.0, 0.12), (x, 0, 1.9), IRON[0], rot=(0, 0, 0))
                for sy in (-1, 1):
                    m.box((0.12, 0.12, 1.3), (x, sy * 0.95, 1.25), IRON[0] if k % 2 else CHAR[0], rot=(sy * 0.1, 0, 0))
        if not tip:
            m.box((1.4, 1.2, 0.06), (-1.0, 0.4, 1.95), "#2a8a8a", rot=(0.1, 0.1, 0.2))
        else:
            m.box((1.8, 1.2, 0.06), (-0.4, 1.8, 0.05), "#2a8a8a", rot=(0, 0, 0.4))
        # the load: blocks, blackened, spilt off the side
        for k in range(6 if i != 1 else 4):
            on = k < 3 and not tip
            fs = list(m.box((0.85, 0.65, 0.5), ((-1.2 + k * 0.9) if on else rng.uniform(-2.0, 2.2), 0 if on else rng.uniform(1.4, 2.6) * (1 if k % 2 else -1),
                                                 0.95 if on else 0.2), SALT[k % 3] if k % 3 else CHAR[2],
                            rot=(0, 0, rng.uniform(-0.2, 0.2)) if on else (rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0, 3))))
            _paint(m, fs, SALT_TOP if k % 3 else None, SALT_COOL if k % 3 else None)
        # a wheel off it, the hitch
        m.cyl(0.65, 0.18, (2.8, -1.6, 0.1), CHAR[0], segs=8)
        _beam(m, (2.1, 0, 0.4), (3.6, 0.3, 0.2), 0.14, 0.14, CHAR[2])
        m.build(r, rot_z=0.0)


def toll_hut(variants):
    """A set of the buckle: the cartel's toll on the track, a tin booth on blocks, its arm up for
    whoever's paid, a red flag on a pole, drums of whatever they took."""
    for i in range(variants):
        r = root("kessra_toll_hut", i)
        rng = random.Random(5460 + i)
        m = Model(f"kessra_toll_hut_{i}", 5460 + i)
        m.box((2.6, 2.2, 0.3), (0, 0, 0.15), SALT[1])
        m.box((2.2, 1.8, 2.2), (0, 0, 1.4), TIN[1])
        m.box((2.6, 2.3, 0.15), (0, -0.1, 2.6), RUST[1], rot=(0.08, 0, 0))
        m.box((1.4, 0.1, 0.7), (0, -0.92, 1.7), CHAR[0])
        # the arm, up
        m.box((0.3, 0.3, 1.1), (-1.6, -1.4, 0.55), IRON[0])
        for k in range(5):
            m.box((0.85, 0.16, 0.16), (-1.6 + math.cos(1.1) * (0.45 + k * 0.85), -1.4, 1.1 + math.sin(1.1) * (0.45 + k * 0.85)), "#e83a2a" if k % 2 else "#f0e8d8", rot=(0, -1.1, 0))
        # the flag
        m.box((0.1, 0.1, 4.2), (1.1, 1.0, 2.1), WOOD[2])
        m.prism([(0, 0), (1.2, -0.2), (0, -0.6)], 0.05, (1.15, 1.0, 4.1), "#c83a2a")
        for k in range(3):
            m.cyl(0.32, 0.8, (1.4 + rng.uniform(-0.3, 0.3), -0.8 + k * 0.6, 0.0), RUST[k % 3], segs=7)
        m.build(r, rot_z=0.0)


# --- the mesa run -----------------------------------------------------------------------------

def _cliff_leg(m, rng, r, x, top, R, colors=MESA):
    layers = []
    z = -3.0
    nl = 7
    for k in range(nl):
        z1 = -3.0 + (top + 3.0) * (k + 1) / nl
        r0 = R * (1.2 - 0.25 * k / nl) * (1 + 0.12 * (k % 2))
        r1 = R * (1.2 - 0.25 * (k + 1) / nl)
        layers.append((z, z1, r0, r1))
        z = z1
    fs, _ = _stack(m, rng, x, 0, layers, sides=9, jit=0.14, colors=colors)
    collider(r, x, 0, R * 1.05)
    return fs


def rock_bridge(variants):
    """Span: a natural bridge of banded red rock over the gorge; the second one is holed through."""
    for i in range(2):
        r = root("kessra_rock_bridge", i)
        rng = random.Random(3200 + i)
        m = Model(f"kessra_rock_bridge_{i}", 3200 + i)
        fs = []
        for s in (-1, 1):
            fs += _cliff_leg(m, rng, r, s * 42, 17.0, 5.0)
        n = 14
        beams = [(0.0, 7.0)] if i == 0 else [(-3.2, 3.4), (3.4, 2.8)]
        for (yc, deep) in beams:
            for k in range(n):
                t0, t1 = k / n, (k + 1) / n
                xa, xb = -44 + 88 * t0, -44 + 88 * t1
                um = lambda t: 13.5 + 3.0 * math.sin(math.pi * t) ** 0.7       # the underside arches up
                tm = lambda t: 19.5 + 1.2 * math.sin(math.pi * t) - 0.8 * (i == 1)
                pts = []
                for t, xx in ((t0, xa - 0.3), (t1, xb + 0.3)):
                    for sy in (-1, 1):
                        w = deep / 2 * (1.0 + 0.4 * (1 - math.sin(math.pi * t))) + rng.uniform(-0.4, 0.4)
                        pts.append((xx, yc + sy * w, um(t) + rng.uniform(0, 0.3)))
                        pts.append((xx, yc + sy * w * 0.85, tm(t) + rng.uniform(-0.3, 0.3)))
                fs += hull(m, pts, MESA[k % 5])
                # knobs of rock hanging from the underside
                if rng.random() < 0.5:
                    px = rng.uniform(xa, xb)
                    u = um((px + 44) / 88)
                    fs += m.cyl(rng.uniform(0.7, 1.2), min(1.0, u - 12.7), (px, yc + rng.uniform(-1, 1), u + 0.2), MESA[0],
                                segs=5, r_top=0.0, rot=(math.pi, 0, 0))
        if i == 1:
            # cross slabs tying the two beams, the holes between
            for xc in (-24, -6, 14, 30):
                t = (xc + 44) / 88
                z = 13.5 + 3.0 * math.sin(math.pi * t) ** 0.7
                fs += _beam(m, (xc, -3.6, z + 2.6), (xc, 3.6, z + 2.4), 3.6, 2.8, MESA[2], rng=rng, jit=0.3)
        _bands(m, fs, -3.0, 1.3, MESA, top=MESA_TOP)
        recolor(m, fs, lambda f: MESA_TOP2 if f.normal.z > 0.75 and int(f.calc_center_median().x // 5) % 2 else None)
        for k in range(14):                                                # scrub and loose rock along the top
            px = rng.uniform(-40, 40)
            t = (px + 44) / 88
            z = 19.5 + 1.2 * math.sin(math.pi * t) - 0.8 * (i == 1)
            py = rng.uniform(-2, 2) + (rng.choice((-3.2, 3.4)) if i == 1 else 0)
            m.ball(rng.uniform(0.5, 0.9), (px, py, z + 0.1), SCRUB[k % 2], subdiv=0, scale=(1, 1, 0.6))
        m.build(r)


def rope_bridge(variants):
    """Span: a rope-and-plank bridge slung across the gorge between two rock stumps, race pennants
    strung under it. The second has lost half its planks."""
    for i in range(2):
        r = root("kessra_rope_bridge", i)
        rng = random.Random(3220 + i)
        m = Model(f"kessra_rope_bridge_{i}", 3220 + i)
        fs = []
        for s in (-1, 1):
            fs += _cliff_leg(m, rng, r, s * 42, 14.5, 4.2)
        _bands(m, fs, -3.0, 1.4, MESA, top=MESA_TOP)
        W = 4.4
        sag = 2.4 if i == 0 else 3.0
        dz = lambda x: 16.6 - sag * (1 - (x / 39) ** 2)                    # the deck's height along it
        for s in (-1, 1):
            # posts on the stumps, lashed
            for sy in (-1, 1):
                m.box((0.7, 0.7, 5.2), (s * 39.5, sy * W / 2, 17.0), WOOD[2])
                m.box((1.0, 1.0, 0.5), (s * 39.5, sy * W / 2, 19.7), WOOD[1])
            m.box((0.5, W + 0.8, 0.5), (s * 39.5, 0, 19.0), WOOD[0])
            m.ball(0.5, (s * 39.5, 0, 19.6), LAMP, subdiv=1, glow=True)
        # the planks
        x = -38.5
        k = 0
        while x < 38.5:
            w = rng.uniform(0.9, 1.3)
            gone = rng.random() < (0.08 if i == 0 else 0.4) and abs(x) < 34
            if not gone:
                z = dz(x)
                skew = rng.uniform(-0.12, 0.12)
                m.box((w, W + rng.uniform(-0.3, 0.3), 0.3), (x + w / 2, rng.uniform(-0.15, 0.15), z), WOOD[k % 3],
                      rot=(0, 0, skew))
            x += w + rng.uniform(0.15, 0.5)
            k += 1
        # the ropes: two under the planks, two handrails above, ties between
        for sy in (-1, 1):
            for hz in (-0.2, 1.4):
                pts = [Vector((x, sy * (W / 2 + 0.15), dz(x) + hz + (0.3 if hz > 0 else 0) * (x / 39) ** 2)) for x in
                       [-39.5 + 79 * k / 16 for k in range(17)]]
                tube(m, pts, [0.16] * 17, ROPE, segs=4)
            for k in range(1, 16):
                x = -39.5 + 79 * k / 16
                m.box((0.12, 0.12, 1.5), (x, sy * (W / 2 + 0.15), dz(x) + 0.6), ROPE)
        # pennants hanging off the handrails, the old race colours (none lower than 13)
        for sy in (-1, 1):
            for k in range(22):
                x = -36 + k * 72 / 21 + rng.uniform(-0.4, 0.4)
                z = dz(x) + 1.3
                h = min(1.4, z - 13.2)
                if h < 0.5:
                    continue
                m.prism([(-0.45, 0), (0.45, 0), (0, -h)], 0.1, (x, sy * (W / 2 + 0.3), z), FLAGS[k % 4])
        # a section hanging loose where a plank row gave way
        if i == 1:
            for k in range(4):
                x = -8 + k * 1.3
                m.box((1.1, W * 0.6, 0.3), (x, -W * 0.3, dz(x) - 0.4 - k * 0.15), WOOD[k % 3], rot=(0.5, 0, 0))
        m.build(r)


def race_gantry(variants):
    """Span: the old race's start gantry, an iron truss over the gorge hung with chequered boards
    and lamps, rusted to the colour of the rock; and the finish (variant 1), hung with one wide
    chequered band from tower to tower."""
    for i in range(variants):
        _gantry(i)


def _gantry(i):
    r = root("kessra_race_gantry", i)
    rng = random.Random(3240 + i)
    m = Model(f"kessra_race_gantry_{i}", 3240 + i)
    fs = []
    for s in (-1, 1):
        fs += _cliff_leg(m, rng, r, s * 43, 6.0, 4.6)
        # a lattice tower on the rock
        for sx in (-1, 1):
            for sy in (-1, 1):
                m.plank_line((s * 43 + sx * 2.2, sy * 2.2, 5.5), (s * 43 + sx * 1.4, sy * 1.4, 19.5), 0.5, 0.5, IRON[0])
        for z in (8.5, 12, 15.5, 19):
            for sy in (-1, 1):
                m.box((3.4, 0.35, 0.35), (s * 43, sy * 1.6, z), IRON[1])
                m.box((0.35, 3.4, 0.35), (s * 43 + sy * 1.6, 0, z), IRON[1])
        m.box((4.0, 4.0, 0.6), (s * 43, 0, 19.6), IRON[2])
    _bands(m, fs, -3.0, 1.2, MESA, top=MESA_TOP)
    # the truss: top and bottom chords, zig-zag webs
    for sy in (-1, 1):
        for z in (14.2, 18.4):
            m.box((88, 0.6, 0.6), (0, sy * 1.6, z), IRON[1])
        for k in range(22):
            x0 = -42 + k * 4
            m.plank_line((x0, sy * 1.6, 14.2), (x0 + 4, sy * 1.6, 18.4) if k % 2 == 0 else (x0 + 4, sy * 1.6, 14.2), 0.35,
                         0.35, IRON[0])
            if k % 2:
                m.plank_line((x0, sy * 1.6, 18.4), (x0 + 4, sy * 1.6, 14.2), 0.35, 0.35, IRON[0])
    for k in range(23):
        m.box((0.4, 3.6, 0.4), (-42 + k * 4, 0, 18.4), IRON[2])
    # a catwalk on top, its plates rusted to the rock's colour, lit (what's seen from up there)
    for k in range(21):
        m.box((3.9, 2.2, 0.2), (-40 + k * 4, 0, 18.8), ("#a85a36", "#9a4e30", "#b86a40")[k % 3])
    if i == 1:
        # the finish: a chequered band the width of the gorge, both faces, three rows deep
        for k in range(40):
            for j in range(3):
                x = -30 + k * 1.5 + 0.75
                m.box((1.5, 0.2, 1.2), (x, -1.95, 17.6 - j * 1.2), CHECK[(k + j) % 2])
                m.box((1.5, 0.2, 1.2), (x, 1.95, 17.6 - j * 1.2), CHECK[(k + j + 1) % 2])
        for k in range(10):
            m.prism([(-0.9, 0), (0.9, 0), (0.6, -1.0), (0, -0.6), (-0.6, -1.0)], 0.1, (-36 + k * 8, -2.0, 14.0), FLAGS[k % 4])
        m.build(r)
        return
    # chequered boards hung off its middle, both faces, and a big lamp row
    for k in range(10):
        for j in range(2):
            c = CHECK[(k + j) % 2]
            m.box((1.4, 0.2, 1.4), (-7 + k * 1.4 + 0.7, -1.95, 16.4 + j * 1.4 - 0.7), c)
            m.box((1.4, 0.2, 1.4), (-7 + k * 1.4 + 0.7, 1.95, 16.4 + j * 1.4 - 0.7), CHECK[(k + j + 1) % 2])
    for k in range(8):
        x = -30 + k * (60 / 7)
        if abs(x) < 8:
            continue
        m.box((1.0, 0.5, 0.6), (x, -1.9, 13.9), IRON[0])
        # (dead since the last race: a lit coloured speck would read as fire)
        m.ball(0.42, (x, -2.1, 13.5), ("#6a3a30", "#7a6a50", "#3a4a3a")[k % 3], subdiv=1)
    for k in range(12):                                                    # tattered banners
        x = -38 + k * 6.9
        if abs(x) < 8:
            continue
        m.prism([(-0.9, 0), (0.9, 0), (0.6, -1.0), (0, -0.6), (-0.6, -1.0)], 0.1, (x, 2.0, 14.0), FLAGS[k % 4])
    m.build(r)


HOODOO_BANDS = ["#e8c49a", "#b8502e", "#d8925a", "#8a3424", "#f0d8b0", "#c06a3a"]
CAPROCK = ["#8a4a34", "#9a5a3e", "#7a3e2e"]
CAP_TOP = "#e8b07a"
SCRUB_IRON = ["#5a2a24", "#4a2420", "#6a3a2a"]
SCRUB_LEAF = ["#7a7a3a", "#5e6a34", "#8a6a3a"]


def _hoodoo_one(m, rng, x, y, h, w, cap_r, tilt=0.0):
    """One hoodoo: a flared foot, a banded neck pinched under a wide dark caprock."""
    fs = []
    prof = [(-0.3, 1.9), (0.3, 1.45), (0.25 * h, 1.0), (0.5 * h, 0.85), (0.72 * h, 0.95), (0.86 * h, 0.62), (h, 0.72)]
    layers = [(prof[k][0], prof[k + 1][0], prof[k][1] * w, prof[k + 1][1] * w) for k in range(len(prof) - 1)]
    f, top = _stack(m, rng, x, y, layers, sides=7, jit=0.12, drift=(0.04, 0.03), colors=MESA)
    fs += f
    cap, _ = _stack(m, rng, top[0], top[1], [(h - 0.1, h + 0.45, cap_r * 0.9, cap_r), (h + 0.45, h + 0.85, cap_r, cap_r * 0.85)],
                    sides=7, jit=0.18, colors=CAPROCK)
    if tilt:
        for v in {v for fc in cap for v in fc.verts}:
            v.co.z += (v.co.x - top[0]) * tilt
    _bands(m, fs, -0.3, 0.55, HOODOO_BANDS, top=HOODOO_BANDS[4])
    _paint(m, cap, CAP_TOP, CAPROCK[2], dot=0.75)
    return top


def hoodoo(variants):
    """Scenery: hoodoos, pale banded necks under dark caprock (the caps are what you see from up
    there): a lone tall one, a family, a fin, a balanced rock. Under the flight line."""
    for i in range(4):
        r = root("kessra_hoodoo", i)
        rng = random.Random(3260 + i)
        m = Model(f"kessra_hoodoo_{i}", 3260 + i)
        if i == 0:
            _hoodoo_one(m, rng, 0, 0, 6.2, 0.8, 1.45, tilt=0.12)
        elif i == 1:
            for x, y, h, w, cr in ((0, 0, 5.0, 0.75, 1.25), (2.3, 0.9, 3.6, 0.65, 1.05), (-1.4, 1.9, 2.6, 0.6, 0.9), (1.0, -1.8, 1.8, 0.55, 0.75)):
                _hoodoo_one(m, rng, x, y, h, w, cr, tilt=rng.uniform(-0.1, 0.1))
        elif i == 2:
            # a fin: a narrow wall of the soft rock, notched, a cap left on each tooth
            fs = []
            for k, (x, h) in enumerate(((-2.6, 2.6), (-1.0, 3.8), (0.7, 3.2), (2.4, 4.4))):
                f, top = _stack(m, rng, x, 0, [(-0.3, h * 0.5, 1.3, 1.0), (h * 0.5, h, 1.0, 0.75)], sides=6, jit=0.12,
                                colors=MESA)
                fs += f
                for v in {v for fc in f for v in fc.verts}:
                    v.co.y = v.co.y * 0.6
                cap, _ = _stack(m, rng, top[0], 0, [(h - 0.1, h + 0.5, 1.0, 1.15)], sides=6, jit=0.15, colors=CAPROCK)
                _paint(m, cap, CAP_TOP, None, dot=0.75)
            _bands(m, fs, -0.3, 0.5, HOODOO_BANDS, top=HOODOO_BANDS[4])
        else:
            # a balanced rock: a dark boulder on a thin pale stalk
            fs, top = _stack(m, rng, 0, 0, [(-0.3, 0.6, 1.5, 1.0), (0.6, 2.2, 0.75, 0.5), (2.2, 3.0, 0.5, 0.6)], sides=7,
                             jit=0.12, colors=MESA)
            _bands(m, fs, -0.3, 0.5, HOODOO_BANDS, top=HOODOO_BANDS[4])
            b = lump(m, rng, (top[0] + 0.4, top[1], 4.0), (1.9, 1.5, 1.2), CAPROCK[1], n=14, flat=0.2)
            _paint(m, b, CAP_TOP, CAPROCK[2], dot=0.7)
        for k in range(5):                                                 # fallen caprock and spalls
            a = rng.uniform(0, math.tau)
            d = rng.uniform(2.0, 3.2)
            t = lump(m, rng, (math.cos(a) * d, math.sin(a) * d, 0.1), (0.6, 0.5, 0.4), (CAPROCK[k % 3], MESA[k % 5])[k % 2],
                     n=8, flat=0.5)
            _paint(m, t, (CAP_TOP, MESA_TOP)[k % 2])
        m.build(r, rot_z=rng.uniform(0, math.tau))


def ironscrub(variants):
    """Ground cover: wiry iron-dark scrub, olive leaf-tufts, a few red berries; and a rust lichen."""
    for i in range(3):
        r = root("kessra_ironscrub", i)
        rng = random.Random(3280 + i)
        m = Model(f"kessra_ironscrub_{i}", 3280 + i)
        if i < 2:
            n = 6 if i == 0 else 4
            spots = [(0, 0)] if i == 0 else [(0, 0), (1.4, 0.6)]
            for sx, sy in spots:
                turn = rng.uniform(0, math.tau)
                for k in range(n):
                    a = turn + k * math.tau / n + rng.uniform(-0.3, 0.3)
                    L = rng.uniform(0.8, 1.3)
                    pts = arc((sx, sy, 0), a, L, 1.3, 1.0, n=3)
                    tube(m, pts, [0.13, 0.1, 0.08, 0.05], SCRUB_IRON[k % 3], segs=4)
                    tip = pts[-1]
                    f = m.ball(rng.uniform(0.3, 0.42), (tip.x, tip.y, tip.z + 0.1), SCRUB_LEAF[k % 3], subdiv=0,
                               scale=(1, 1, 0.6), rot=(0, 0, rng.uniform(0, 3)))
                    if k % 3 == 0:
                        m.ball(0.15, (tip.x, tip.y, tip.z + 0.35), "#d8402a", subdiv=0)
        else:
            for k in range(5):
                a = rng.uniform(0, math.tau)
                d = rng.uniform(0, 1.4)
                lump(m, rng, (math.cos(a) * d, math.sin(a) * d, 0.0), (0.7, 0.55, 0.15), ("#8a3a24", "#9a6a34", "#6a4a2a")[k % 3],
                     n=8, flat=0.6)
            for k in range(3):
                a = rng.uniform(0, math.tau)
                lump(m, rng, (math.cos(a) * 1.8, math.sin(a) * 1.8, 0.0), (0.4, 0.35, 0.3), MESA[k % 5], n=7, flat=0.5)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def race_debris(variants):
    """Scenery: what's left of the old race course: a racer nosed into the sand, barrel barriers,
    a checkered course pylon, its lamp long dead."""
    for i in range(3):
        r = root("kessra_race_debris", i)
        rng = random.Random(3290 + i)
        m = Model(f"kessra_race_debris_{i}", 3290 + i)
        if i == 0:
            # a crashed racer: a long nose, one fin, its checkers on top, the furrow it ploughed
            body = [(-2.4, -0.6, 0.0), (-2.4, 0.6, 0.0), (-2.2, -0.5, 0.9), (-2.2, 0.5, 0.9), (1.4, -0.7, 0.0),
                    (1.4, 0.7, 0.0), (1.2, -0.45, 0.8), (1.2, 0.45, 0.8), (2.8, 0.0, 0.2), (2.6, 0.0, 0.5)]
            fs = hull(m, body, "#c8a060")
            _paint(m, fs, "#e0b870", "#8a6a40", dot=0.7)
            for k in range(6):                                             # checkers along the spine
                m.box((0.5, 0.5, 0.06), (-1.9 + k * 0.55, (k % 2 - 0.5) * 0.5, 0.92 - 0.02 * k), CHECK[k % 2])
            m.box((0.9, 0.5, 0.25), (0.4, 0, 0.9), "#3ab0c0")                # the canopy
            m.prism([(-0.6, 0), (0.6, 0), (-0.4, 1.4)], 0.15, (-1.9, 0, 0.8), "#c83a2a")
            m.cyl(0.35, 0.8, (-2.6, 0.4, 0.3), IRON[0], segs=6, rot=(0, math.pi / 2, 0))
            bmesh_rot = 0.18
            for v in m.bm.verts:                                           # nosed in
                v.co.z -= max(0.0, v.co.x) * bmesh_rot
            m.box((5.0, 1.2, 0.08), (-4.6, 0, 0.02), "#7a3a24")             # the furrow
            for k in range(4):
                a = rng.uniform(0, math.tau)
                lump(m, rng, (-3 + math.cos(a) * 2, math.sin(a) * 1.6, 0.0), (0.4, 0.3, 0.2), "#8a8070", n=6, flat=0.5)
            m.cyl(0.45, 0.5, (-4.2, 1.6, 0), IRON[0], segs=6, rot=(1.2, 0, 0.4))   # the torn-off pod
        elif i == 1:
            # barrel barrier: a row of painted drums, one knocked over
            for k in range(6):
                x = -2.5 + k * 1.0
                col = ("#e83a2a", "#f0e8d8")[k % 2]
                if k == 4:
                    m.cyl(0.42, 1.1, (x, 0.9, 0.42), col, segs=8, rot=(math.pi / 2, 0, 0.6))
                    continue
                m.cyl(0.42, 1.1, (x, rng.uniform(-0.1, 0.1), 0), col, segs=8)
                m.cyl(0.44, 0.15, (x, 0, 0.5), "#3a2a24", segs=8)
                m.cyl(0.38, 0.05, (x, 0, 1.1), ("#a8302a", "#c8c0b0")[k % 2], segs=8)
        else:
            # a checkered pylon, leaning, lamp lit, a torn pennant
            pts = bend((0, 0, 0), (0, 0, 3.2), (0.4, 0.2), n=4)
            tube(m, pts, [0.32, 0.3, 0.27, 0.24, 0.2], CHECK[0], segs=6, colors=[CHECK[k % 2] for k in range(4)])
            m.cyl(0.8, 0.4, (0, 0, -0.1), IRON[0], segs=6, r_top=0.6)
            top = pts[-1]
            m.ball(0.35, (top.x, top.y, top.z + 0.2), "#7a4a3a", subdiv=1)              # its lamp long dead
            m.prism([(0, 0), (1.6, -0.3), (0, -0.9)], 0.08, (top.x, top.y, top.z - 0.3), "#f0c040")
            m.box((2.6, 0.6, 0.08), (1.3, -1.2, 0.03), "#e8dcc0", rot=(0, 0, 0.3))      # a fallen banner
            m.box((0.8, 0.62, 0.09), (0.6, -1.4, 0.04), "#c83a2a", rot=(0, 0, 0.3))
        m.build(r, rot_z=rng.uniform(0, math.tau))


# --- red mesa run: the ground's own pieces -----------------------------------------------------

SCREE = ["#9a4430", "#b85a36", "#a84a30", "#c0683a"]
SCREE_TOP = ["#e8a874", "#dc9866"]
SCREE_SHADE = "#6a2a24"
# (dark and dusty, so a clump reads against the floor from up there, as in the painting)
SAGE = ["#566034", "#4a5430", "#626c3c"]
SAGE_TOP = ["#8e9a5a", "#848e52"]
SAGE_DARK = "#2a2e22"
RUSTBRUSH = ["#7a3424", "#8a4228", "#6a2e22"]
RUSTBRUSH_TOP = ["#b8643a", "#a85a34"]
BLOOM = ["#f0c040", "#e87a3a"]
DEADWOOD = ["#a8968a", "#988478"]
DEADWOOD_DARK = "#7a6458"


def _block(m, rng, x, y, z, w, d, h, tilt=0.0, turn=0.0):
    """A squared block of the red rock: flat top lit, banded sides, the sides away from the sun deep."""
    c, s = math.cos(turn), math.sin(turn)
    pts = []
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        for sz, k in ((0, 1.0), (1, 0.88)):
            px = sx * w / 2 * k * rng.uniform(0.9, 1.08)
            py = sy * d / 2 * k * rng.uniform(0.9, 1.08)
            # (no two corners the same height: a split rock, not a crate)
            pz = z + sz * h * rng.uniform(0.75, 1.1) + px * tilt
            pts.append((x + px * c - py * s, y + px * s + py * c, pz))
    fs = hull(m, pts, SCREE[rng.randrange(len(SCREE))])
    _paint(m, fs, SCREE_TOP[rng.randrange(2)], SCREE_SHADE, dot=0.72)
    return fs


def scree(variants):
    """Scenery: the red rock fallen from the cliffs, squared off the way it splits: one big block
    with its spalls, a heap, a slab leaning on its fellows, a spill of chips. Flat lit tops (what's
    seen from up there), deep sides."""
    for i in range(4):
        r = root("kessra_scree", i)
        rng = random.Random(3400 + i)
        m = Model(f"kessra_scree_{i}", 3400 + i)
        if i == 0:
            _block(m, rng, 0, 0, -0.2, 2.8, 2.2, 1.2, tilt=0.12, turn=0.2)
            _block(m, rng, 1.9, -1.0, -0.2, 1.1, 0.9, 0.7, turn=0.9)
            _block(m, rng, -1.6, 1.2, -0.2, 0.8, 0.9, 0.5, turn=-0.4)
        elif i == 1:
            for x, y, w, h, t in ((0, 0, 2.0, 1.2, 0.1), (1.6, 0.6, 1.4, 0.9, 0.8), (-1.3, 0.8, 1.5, 0.8, -0.5),
                                  (0.3, -1.4, 1.2, 0.7, 1.3), (0.4, 0.4, 1.1, 0.7, 0.4)):
                _block(m, rng, x, y, -0.2 if (x, y) != (0.4, 0.4) else 1.0, w, w * 0.8, h, turn=t)
        elif i == 2:
            _block(m, rng, -0.8, 0, -0.2, 1.6, 1.4, 1.2, turn=0.3)
            _block(m, rng, 0.9, 0.2, -0.2, 1.2, 1.3, 0.9, turn=-0.2)
            _block(m, rng, 0.2, -0.2, 0.6, 3.2, 1.0, 0.45, tilt=0.35, turn=0.1)      # the slab leaning across
        else:
            for k in range(8):
                a = rng.uniform(0, math.tau)
                d = rng.uniform(0.2, 2.0)
                sz = rng.uniform(0.35, 0.7)
                _block(m, rng, math.cos(a) * d, math.sin(a) * d, -0.15, sz * 1.3, sz, sz * 0.6, turn=rng.uniform(0, 3))
        m.build(r, rot_z=rng.uniform(0, math.tau))


def _bush(m, rng, x, y, R, h):
    """One clump of desert brush: a cushion of faceted lobes, lit on top, dark at its foot."""
    fs = []
    for k in range(5):
        a = k * math.tau / 5 + rng.uniform(-0.4, 0.4)
        d = R * (0.45 if k else 0.0)
        rr = R * rng.uniform(0.55, 0.7)
        fs += m.ball(rr, (x + math.cos(a) * d, y + math.sin(a) * d, h * 0.45), SAGE[k % 3], subdiv=1,
                     scale=(1, 1, h / rr * 0.55), jitter=0.06)
    fs += m.ball(R * 0.95, (x, y, 0.12), SAGE_DARK, subdiv=0, scale=(1, 1, 0.25))
    _paint(m, fs, SAGE_TOP[rng.randrange(2)], None, dot=0.6)
    return fs


def brush(variants):
    """Ground cover: desert brush, dusty sage cushions that hold the wash's banks and the ledges:
    one round clump, three together, a low spread starred with yellow bloom, a sprawl of rust brush."""
    for i in range(4):
        r = root("kessra_brush", i)
        rng = random.Random(3420 + i)
        m = Model(f"kessra_brush_{i}", 3420 + i)
        if i == 0:
            _bush(m, rng, 0, 0, 1.0, 1.0)
        elif i == 3:
            # rust brush: the red dry kind, in a low sprawl, its twigs showing through
            for x, y, R in ((0, 0, 0.95), (1.3, 0.3, 0.7), (-0.5, 1.1, 0.6)):
                fs = _bush(m, rng, x, y, R, 0.7)
                recolor(m, fs, lambda f: RUSTBRUSH_TOP[rng.randrange(2)] if f.normal.z > 0.6 else RUSTBRUSH[rng.randrange(3)])
        elif i == 1:
            _bush(m, rng, 0, 0, 1.0, 1.05)
            _bush(m, rng, 1.5, 0.5, 0.7, 0.75)
            _bush(m, rng, -0.6, 1.3, 0.55, 0.6)
        else:
            for x, y, R in ((0, 0, 0.8), (1.1, -0.4, 0.6), (-0.9, 0.5, 0.65), (0.3, 1.0, 0.5)):
                _bush(m, rng, x, y, R, 0.45)
            for k in range(9):
                a = rng.uniform(0, math.tau)
                d = rng.uniform(0.2, 1.3)
                m.ball(0.13, (math.cos(a) * d, math.sin(a) * d, 0.5), BLOOM[k % 2], subdiv=0)
        for k in range(3):                                                 # a few dry twigs poking out
            a = rng.uniform(0, math.tau)
            pts = arc((0, 0, 0.3), a, rng.uniform(0.9, 1.4), 0.7, 0.4, n=3)
            tube(m, pts, [0.06, 0.05, 0.035, 0.02], DEADWOOD_DARK, segs=3)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def deadwood(variants):
    """Scenery: a dead tree bleached pale, twisted, its limbs thrown out wide (what's seen from up
    there): on the ledges and the tops, now and then by the wash."""
    for i in range(2):
        r = root("kessra_deadwood", i)
        rng = random.Random(3440 + i)
        m = Model(f"kessra_deadwood_{i}", 3440 + i)
        H = 2.4 if i == 0 else 1.6
        trunk = bend((0, 0, 0), (0.3, 0.2, H), (0.5, -0.3), n=4)
        tube(m, trunk, [0.4, 0.32, 0.26, 0.2, 0.15], DEADWOOD[0], segs=5)
        top = trunk[-1]
        for k in range(4 if i == 0 else 3):
            a = k * math.tau / (4 if i == 0 else 3) + rng.uniform(-0.4, 0.4)
            L = rng.uniform(1.6, 2.4) * (1 if i == 0 else 0.8)
            base = trunk[2 + k % 2]
            pts = arc((base.x, base.y, base.z), a, L, 0.6, 0.5, n=4, tip_curl=0.3)
            tube(m, pts, [0.2, 0.16, 0.12, 0.08, 0.05], DEADWOOD[k % 2], segs=4)
            tip = pts[-2]
            twig = arc((tip.x, tip.y, tip.z), a + 0.9, 0.7, 0.3, 0.1, n=2)
            tube(m, twig, [0.05, 0.03, 0.02], DEADWOOD[1], segs=3)
        lump(m, rng, (0, 0, 0), (0.7, 0.6, 0.2), DEADWOOD_DARK, n=8, flat=0.5)   # its roots in the sand
        m.build(r, rot_z=rng.uniform(0, math.tau))


def spire(variants):
    """Obstacles: pinnacles of the soft red rock, taller than you fly, banded, a dark caprock
    keeping the rain off: a lone needle, a pair grown from one foot, a broken one. They stand in
    the hoodoo fields and at the gorge's mouths; weave between them. Colliders on each column."""
    for i in range(3):
        H = (17.0, 15.5, 14.0)[i]
        r = root("kessra_spire", i, height=H + 1, obstacle=1)
        rng = random.Random(3480 + i)
        m = Model(f"kessra_spire_{i}", 3480 + i)
        cols = [(0, 0, 1.6, H)] if i != 1 else [(-1.3, 0, 1.4, H), (1.5, 0.4, 1.2, H * 0.82)]
        if i == 2:
            cols = [(0, 0, 1.8, H)]
        for x, y, R, h in cols:
            # drums of the rock, each its own width, stepped (not a smooth taper), leaning a little
            fs = []
            z0 = -0.3
            cx, cy = x, y
            n = 7
            lean = (rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12))
            for k in range(n):
                z1 = z0 + (h + 0.3) / n
                rk = R * (1.5 - 0.55 * k / n) * rng.uniform(0.85, 1.12)
                f, (cx, cy) = _stack(m, rng, cx, cy, [(z0, z1, rk, rk * rng.uniform(0.86, 0.98))], sides=6, jit=0.2,
                                     drift=lean, colors=[MESA[(k * 3 + i) % 5]])
                fs += f
                z0 = z1
            top = (cx, cy)
            _paint(m, fs, MESA_TOP, None, dot=0.7)
            if i == 2:
                # its top broken off: a jagged stump, the piece lying at its foot
                for k in range(4):
                    a = k * math.tau / 4 + rng.uniform(-0.3, 0.3)
                    t = lump(m, rng, (top[0] + math.cos(a) * R * 0.5, top[1] + math.sin(a) * R * 0.5, h + rng.uniform(0.2, 1.0)),
                             (0.6, 0.5, 0.9), MESA[k % 5], n=8)
                    _paint(m, t, MESA_TOP, CAPROCK[2])
                _block(m, rng, x + 3.4, y - 1.0, -0.2, 3.2, 1.6, 1.4, turn=0.6)
            else:
                cap = _block(m, rng, top[0], top[1], h - 0.1, R * 2.4, R * 2.0, 0.9, turn=rng.uniform(0, 3))
                _paint(m, cap, CAP_TOP, CAPROCK[2], dot=0.7)
            collider(r, x, y, R * 1.2)
        for k in range(6):                                                 # spalls at the foot
            a = rng.uniform(0, math.tau)
            d = rng.uniform(2.6, 3.8)
            _block(m, rng, math.cos(a) * d, math.sin(a) * d, -0.15, rng.uniform(0.5, 1.0), rng.uniform(0.4, 0.8), 0.45,
                   turn=rng.uniform(0, 3))
        m.build(r, rot_z=rng.uniform(0, math.tau))


def depot(variants):
    """Scenery: a raiders' depot at the back of a bay in the gorge: a sun-sheet strung off the rock
    over crates and drums, a fuel bladder, a racer under a tarp, a work lamp still lit. Its back
    (+y) goes to the wall. Under the flight line."""
    for i in range(2):
        r = root("kessra_depot", i)
        rng = random.Random(3460 + i)
        m = Model(f"kessra_depot_{i}", 3460 + i)
        # the sun-sheet: poles out front, its back edge up on the rock
        for x in (-3.6, 0.2, 3.8):
            m.cyl(0.12, 3.2, (x, 0.4, 0), WOOD[2], segs=5)
        _sheet(m, (-4.2, 0.2, 3.1), (4.4, 0.2, 3.0), (-4.4, 3.2, 4.2), (4.6, 3.2, 4.1), 0.3,
                       [CLOTH[i][0], CLOTH[(i + 3) % 4][1]], nu=6, nv=3, tatter=[0.2, 0.45, 0.1, 0.3])
        # crates, stacked, against the back
        for x, y, z, w in ((-2.8, -0.4, 0, 1.3), (-1.4, -0.6, 0, 1.2), (-2.2, -0.5, 1.25, 1.1), (2.6, -0.8, 0, 1.4),
                           (3.6, -2.0, 0, 1.0), (2.7, -0.8, 1.4, 1.0)):
            m.box((w, w, w), (x, y, z + w / 2), WOOD[rng.randrange(3)], rot=(0, 0, rng.uniform(-0.2, 0.2)))
            m.box((w * 1.02, 0.12, w * 1.02), (x, y - w / 2, z + w / 2), "#4a3424")
        # drums: rust and teal, one on its side
        for k, (x, y) in enumerate(((0.0, -0.6), (0.9, -0.8), (0.4, -1.6), (-0.6, -2.6), (1.6, -2.8))):
            col = ("#a83a2a", "#2a8a8a", "#c8a050")[k % 3]
            if k == 3:
                m.cyl(0.45, 1.2, (x, y, 0.45), col, segs=8, rot=(math.pi / 2, 0, 0.8))
            else:
                m.cyl(0.45, 1.2, (x, y, 0), col, segs=8)
                m.cyl(0.47, 0.12, (x, y, 0.55), "#3a2a24", segs=8)
        # the fuel bladder, slumped
        m.ball(1.3, (-2.6, -2.4, 0.45), "#3a3a34", subdiv=1, scale=(1.3, 0.9, 0.42))
        m.ball(0.2, (-2.6, -2.4, 1.0), "#c8a050", subdiv=0)
        if i == 0:
            # a racer under a tarp, its nose out
            m.ball(1.1, (0.6, 1.6, 0.5), "#8a8070", subdiv=1, scale=(2.0, 0.95, 0.5))
            m.box((0.9, 0.8, 0.5), (2.6, 1.6, 0.35), "#c8a060", rot=(0, 0, 0.1))
            m.box((0.4, 0.4, 0.06), (2.7, 1.6, 0.62), CHECK[1])
        else:
            # a workbench and a cable spool
            m.box((2.4, 0.9, 0.12), (1.0, -0.6, 1.0), WOOD[1])
            for x in (0.0, 2.0):
                m.box((0.12, 0.8, 1.0), (x, -0.6, 0.5), WOOD[2])
            m.cyl(0.7, 0.6, (-0.4, -2.0, 0), "#6a4a30", segs=8)
        # a work lamp on a pole, lit
        m.cyl(0.06, 2.6, (-4.0, -2.0, 0), IRON[0], segs=4)
        m.ball(0.28, (-4.0, -2.0, 2.7), LAMP, subdiv=1, glow=True)
        for k in range(5):                                                 # spill, tracks, footprints
            m.box((rng.uniform(0.6, 1.4), 0.3, 0.04), (rng.uniform(-3, 3), rng.uniform(-3.4, -2.6), 0.02), "#7a3a24",
                  rot=(0, 0, rng.uniform(-0.4, 0.4)))
        m.build(r)


BOULDER_BANDS = ["#9a4430", "#b0522f", "#a84a30", "#c0683a", "#8a3a2a"]
BOULDER_TOP = ["#e0a070", "#d4925e", "#e8ac7a"]
BOULDER_SHADE = "#5a2420"


def _rock(m, rng, x, y, z, w, d, h, turn=0.0, tilt=(0.0, 0.0), cut=0.22):
    """A block of the red sandstone as it splits: squared, its corners knocked off (each by its own
    amount), its top a bedding plane, near flat; banded up its sides, the top lit, the far side deep."""
    c, s = math.cos(turn), math.sin(turn)
    pts = []
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        k = rng.uniform(cut * 0.4, cut)
        for zz, shrink in ((0.0, 1.0), (rng.uniform(0.55, 0.8), rng.uniform(0.93, 1.02)), (1.0, rng.uniform(0.82, 0.95))):
            # each corner cut back to two points, so it's a chamfer, not a box corner
            for ax in (0, 1):
                px = sx * w / 2 * shrink * (1 - k * ax)
                py = sy * d / 2 * shrink * (1 - k * (1 - ax))
                pz = z + zz * h * (1 + rng.uniform(-0.1, 0.1)) + px * tilt[0] + py * tilt[1]
                # (and every point off true a little: weathered, not sawn)
                px += rng.uniform(-0.07, 0.07) * w
                py += rng.uniform(-0.07, 0.07) * d
                pts.append((x + px * c - py * s, y + px * s + py * c, pz))
    fs = hull(m, pts, BOULDER_BANDS[0])
    _bands(m, fs, z + rng.uniform(-0.2, 0.2), rng.uniform(0.35, 0.55), BOULDER_BANDS[rng.randrange(5):] + BOULDER_BANDS)
    _paint(m, fs, BOULDER_TOP[rng.randrange(3)], BOULDER_SHADE, dot=0.7, shade_dot=-0.45)
    return fs


def _chips(m, rng, cx, cy, R0, R1, n, size=0.5):
    for k in range(n):
        a = rng.uniform(0, math.tau)
        dd = rng.uniform(R0, R1)
        sz = rng.uniform(0.6, 1.0) * size
        _rock(m, rng, cx + math.cos(a) * dd, cy + math.sin(a) * dd, -0.1, sz * 1.4, sz, sz * 0.6, turn=rng.uniform(0, 3),
              cut=0.35)


def boulder(variants):
    """Scenery, the mid-sized forms the cliffs' feet are made of: blocks of the red sandstone that
    fell and split, generated so no two are the same (a lone block, one split in two, a pile, a
    slab stood on end, a toppled drum, a block with its lid slid off), each with its chips round it.
    Under the flight line."""
    for i in range(variants):
        r = root("kessra_boulder", i)
        rng = random.Random(3500 + i)
        m = Model(f"kessra_boulder_{i}", 3500 + i)
        kind = i % 6
        W = rng.uniform(2.6, 3.4)
        if kind == 0:
            _rock(m, rng, 0, 0, -0.2, W, W * rng.uniform(0.7, 0.85), rng.uniform(1.5, 2.0), tilt=(0.06, -0.04))
            _chips(m, rng, 0, 0, W * 0.65, W * 0.95, 6)
        elif kind == 1:
            # split down the middle, the halves fallen apart
            for sx in (-1, 1):
                _rock(m, rng, sx * (W * 0.29 + 0.25), rng.uniform(-0.2, 0.2), -0.2, W * 0.48, W * 0.8, rng.uniform(1.4, 1.8),
                      tilt=(sx * 0.12, 0.0), turn=sx * rng.uniform(0.05, 0.15))
            _chips(m, rng, 0, 0, W * 0.7, W, 5)
        elif kind == 2:
            # a pile: two on the ground, one come to rest across them
            _rock(m, rng, -0.9, 0.2, -0.2, 1.8, 1.6, 1.3, turn=0.3)
            _rock(m, rng, 1.0, -0.3, -0.2, 1.7, 1.5, 1.1, turn=-0.4)
            _rock(m, rng, 0.1, 0.0, 0.9, 2.6, 1.3, 0.8, turn=0.15, tilt=(0.12, 0.0))
            _chips(m, rng, 0, 0, 2.0, 2.8, 6)
        elif kind == 3:
            # a slab stood on end where it landed
            _rock(m, rng, 0, 0, -0.3, W * 0.85, 0.9, 2.6, turn=rng.uniform(0, 1), tilt=(0.0, 0.25))
            _rock(m, rng, 0.8, 1.3, -0.2, 1.3, 1.1, 0.8, turn=0.7)
            _chips(m, rng, 0, 0, 1.6, 2.6, 5)
        elif kind == 4:
            # an old one, worn round by the wind, its bands showing, a smaller one leant on it
            fs = lump(m, rng, (0, 0, 0.6), (W * 0.55, W * 0.45, 1.3), BOULDER_BANDS[0], n=18, flat=0.45)
            _bands(m, fs, -0.2, 0.4, BOULDER_BANDS)
            _paint(m, fs, BOULDER_TOP[1], BOULDER_SHADE, dot=0.72, shade_dot=-0.45)
            _rock(m, rng, W * 0.55, -0.6, -0.2, 1.3, 1.1, 0.9, turn=0.5, tilt=(0.2, 0.0))
            _chips(m, rng, 0, 0, W * 0.7, W, 5)
        else:
            # a block, its top layer slid half off
            _rock(m, rng, 0, 0, -0.2, W, W * 0.8, 1.2)
            _rock(m, rng, 0.7, 0.3, 0.95, W * 0.8, W * 0.7, 0.55, turn=0.25, tilt=(-0.08, 0.0), cut=0.15)
            _chips(m, rng, 0, 0, W * 0.7, W, 5)
        m.build(r, rot_z=rng.uniform(0, math.tau))


TYRE = ["#2a2426", "#332c2c", "#241e20"]
TYRE_IN = "#141012"
# (faded by the sun: a bright red speck would read as fire)
TYRE_PAINT = ["#a8584a", "#d8ccb4"]


def _tyres(m, rng, x, y, n, paint=None):
    """A stack of old tyres, a little askew, the top one's hole dark; painted bands now and then."""
    for k in range(n):
        ox, oy = rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1)
        col = paint if (paint and k % 2 == 1) else TYRE[rng.randrange(3)]
        m.cyl(0.62, 0.38, (x + ox, y + oy, k * 0.4), col, segs=8)
    m.cyl(0.3, 0.06, (x, y, n * 0.4 - 0.02), TYRE_IN, segs=7)


def tyre_wall(variants):
    """Scenery: the old course's crash barriers, tyre stacks strung round the outside of a bend in
    the wash (painted red and cream for the racers to aim by), one bowled over; a straight run with
    a fallen board. Under the flight line."""
    for i in range(2):
        r = root("kessra_tyre_wall", i)
        rng = random.Random(3520 + i)
        m = Model(f"kessra_tyre_wall_{i}", 3520 + i)
        n = 9 if i == 0 else 7
        for k in range(n):
            t = k / (n - 1) - 0.5
            if i == 0:
                # round the outside of a bend: an arc, its middle towards +y
                a = t * 1.6
                x, y = math.sin(a) * 6.0, math.cos(a) * 6.0 - 6.0
            else:
                x, y = t * 8.4, rng.uniform(-0.12, 0.12)
            if k == n // 2 + 1:
                # one bowled over, its tyres rolled off
                for j in range(3):
                    m.cyl(0.62, 0.38, (x + rng.uniform(-0.9, 0.9), y - 1.2 - j * 0.6, 0.0), TYRE[j % 3], segs=8,
                          rot=(rng.uniform(1.2, 1.6), 0, rng.uniform(0, 3)))
                continue
            _tyres(m, rng, x, y, rng.choice((2, 3, 3)), TYRE_PAINT[k % 2])
        if i == 1:
            m.box((3.0, 1.1, 0.1), (1.2, -1.6, 0.05), TYRE_PAINT[1], rot=(0, 0, 0.25))
            for k in range(3):
                m.prism([(-0.35, -0.4), (0.05, 0), (-0.35, 0.4), (-0.05, 0.4), (0.35, 0), (-0.05, -0.4)], 0.12,
                        (0.3 + k * 0.85, -1.4, 0.12), TYRE_PAINT[0], rot=(math.pi / 2, 0, 0.25))
        m.build(r)


def turn_board(variants):
    """Scenery: a course board at a bend, red chevrons on cream leaned back on two posts so a
    racer coming down the gorge could read it, pointing the way the course turns (+x); one
    standing, one fallen. On the ledges and at the cliffs' feet."""
    for i in range(2):
        r = root("kessra_turn_board", i)
        rng = random.Random(3540 + i)
        m = Model(f"kessra_turn_board_{i}", 3540 + i)
        lean = 0.95 if i == 0 else 1.5                                    # leaned back from upright (radians)
        z = 1.4 if i == 0 else 0.15
        W = 4.2
        for sx in (-1, 1):
            m.box((0.22, 0.22, z + 0.6), (sx * (W / 2 - 0.5), 0.3, (z + 0.6) / 2 - 0.1), IRON[0] if i else WOOD[2],
                  rot=(0, 0, rng.uniform(-0.1, 0.1)))
        m.box((W, 0.16, 1.5), (0, 0, z), TYRE_PAINT[1], rot=(lean, 0, 0))
        m.box((W + 0.2, 0.12, 0.2), (0, -math.sin(lean) * 0.0 - 0.02, z + math.cos(lean) * 0.72), "#3a2a24", rot=(lean, 0, 0))
        # (the chevrons in the board's plane, leaned with it, through both its faces)
        for k in range(3):
            m.prism([(-0.4, -0.55), (0.1, 0), (-0.4, 0.55), (-0.05, 0.55), (0.45, 0), (-0.05, -0.55)], 0.24,
                    (-1.2 + k * 1.2, 0, z), TYRE_PAINT[0], rot=(lean, 0, 0))
        m.build(r)


def grandstand(variants):
    """Rim dressing: the old race's stands, dug into a cliff top over the finish: stepped benches
    of rusted iron and plank, a torn awning in the race colours, flag poles. Seen from above: the
    stripes of the steps and the awning. Its front (-y) looks over the gorge."""
    for i in range(2):
        r = root("kessra_grandstand", i)
        rng = random.Random(3560 + i)
        m = Model(f"kessra_grandstand_{i}", 3560 + i)
        W = 11.0 if i == 0 else 8.0
        steps = 4
        for k in range(steps):
            y = -1.8 + k * 1.2
            zt = 0.5 + k * 0.6
            m.box((W, 1.2, zt), (0, y, zt / 2 - 0.2), IRON[k % 2] if k % 2 else "#7a5a44")
            # benches, gaps where they rotted
            x = -W / 2 + 0.3
            while x < W / 2 - 0.8:
                L = rng.uniform(1.4, 2.6)
                if rng.random() > 0.2:
                    m.box((min(L, W / 2 - x - 0.3), 0.45, 0.14), (x + L / 2, y - 0.2, zt - 0.1 + 0.12), WOOD[rng.randrange(3)])
                x += L + rng.uniform(0.2, 0.6)
        # the awning over the back rows on poles, striped, torn at one end
        yb = -1.8 + (steps - 1) * 1.2
        for x in (-W / 2 + 0.4, 0, W / 2 - 0.4):
            m.cyl(0.12, 3.2, (x, yb + 0.6, 0), IRON[0], segs=5)
        nstripe = int(W / 1.1)
        for k in range(nstripe):
            if i == 1 and k > nstripe - 3:
                continue
            x = -W / 2 + (k + 0.5) * W / nstripe
            m.box((W / nstripe, 3.0, 0.08), (x, yb - 0.6, 3.25), FLAGS[0] if k % 2 else FLAGS[3], rot=(-0.25, 0, 0))
        for k, x in enumerate((-W / 2 - 0.6, W / 2 + 0.6)):
            m.cyl(0.08, 4.6, (x, yb, 0), IRON[1], segs=4)
            m.prism([(0, 0), (1.4, -0.35), (0, -0.8)], 0.08, (x, yb, 4.5), FLAGS[k * 2 + 1])
        for k in range(4):                                                 # litter, a fallen sheet
            m.box((rng.uniform(0.5, 1.0), rng.uniform(0.4, 0.8), 0.05), (rng.uniform(-W / 2, W / 2), -3.0 - rng.uniform(0, 1), 0.03),
                  ("#c8b8a0", "#8a6a44")[k % 2], rot=(0, 0, rng.uniform(0, 3)))
        m.build(r)


# --- the monolith field -----------------------------------------------------------------------

def colossus(variants):
    """Giant: a colossus of the vanished people, fallen on its back, eyes to the sky; and the
    second, its great hand and forearm, palm up, a light still held in it. Under 8.5."""
    for i in range(2):
        r = root("kessra_colossus", i)
        rng = random.Random(3300 + i)
        m = Model(f"kessra_colossus_{i}", 3300 + i)
        fs = []
        if i == 0:
            # lying along x, head at +x, face up
            fs += list(m.box((18, 12, 5.0), (-2, 0, 2.0), STONE[1], taper=0.85))          # chest
            fs += list(m.box((10, 9.5, 4.0), (-14, 0, 1.6), STONE[0], taper=0.85))        # hips
            fs += list(m.box((3.0, 4.0, 2.6), (8.5, 0, 2.6), STONE[2]))                    # neck
            # the head: a block with a brow, a nose, a crown
            fs += list(m.box((8.0, 7.6, 6.0), (13.5, 0, 3.0), STONE[1], taper=0.9))
            fs += list(m.box((1.8, 7.8, 1.0), (12.5, 0, 6.3), STONE[0]))                   # brow ridge
            fs += list(m.box((2.6, 1.6, 1.3), (14.6, 0, 6.5), STONE[2], taper=0.6))        # nose
            fs += list(m.box((1.2, 3.2, 0.6), (16.6, 0, 6.2), STONE[0]))                   # lips
            for s in (-1, 1):
                m.box((1.6, 2.0, 0.4), (12.9, s * 1.9, 6.25), STONE_DARK)
                m.box((1.0, 1.4, 0.5), (12.9, s * 1.9, 6.35), GLYPH, glow=True)
                fs += list(m.box((3.0, 1.2, 3.0), (13.0, s * 4.2, 3.5), STONE[2]))          # ears
            fs += list(m.box((2.6, 10.0, 6.4), (18.4, 0, 3.0), STONE[0], taper=0.85))       # the crown behind
            for k in range(5):
                m.box((0.6, 1.0, 0.3), (19.0, -4 + k * 2, 6.3), GLYPH, glow=True)
            # arms: one along its side, one flung out
            fs += _beam(m, (4, -7.2, 2.0), (-10, -8.0, 1.6), 3.6, 3.4, STONE[2], w1=3.0, h1=3.0)
            fs += list(m.box((4.0, 3.6, 2.6), (-12.5, -8.6, 1.3), STONE[1]))                 # its fist
            fs += _beam(m, (4, 7.2, 2.0), (4, 18, 1.6), 3.6, 3.4, STONE[2], w1=3.0, h1=3.0)
            fs += _beam(m, (4, 18, 1.6), (-4, 26, 1.4), 3.0, 3.0, STONE[0], w1=2.6, h1=2.6)
            fs += list(m.box((4.4, 3.6, 1.6), (-6, 28, 0.9), STONE[1], rot=(0, 0, 0.8)))      # open hand
            for k in range(4):
                fs += _beam(m, (-6 + 1.2 * k - 2, 29.0, 0.9), (-8.0 + 1.3 * k - 2, 31.5, 0.7), 0.9, 0.9, STONE[2])
            # legs, broken off at the thigh, the shins lying apart
            for s in (-1, 1):
                fs += _beam(m, (-18, s * 2.6, 1.6), (-26, s * 3.2, 1.4), 4.2, 3.6, STONE[1], w1=3.8, h1=3.2)
            fs += _beam(m, (-31, -6.0, 1.2), (-40, -9.0, 1.0), 3.4, 3.0, STONE[2], rng=rng, jit=0.3)
            fs += list(m.box((3.6, 5.0, 2.4), (-41.5, -10.0, 1.0), STONE[0], rot=(0, 0, 0.3)))
            # glyph bands on chest and belt, seen from above
            for k in range(7):
                _glyph(m, rng, -8 + k * 2.4, 0, 4.55, 1.3)
            for k in range(4):
                _glyph(m, rng, -14, -3 + k * 2, 3.65, 1.1)
            m.box((1.4, 1.4, 0.3), (2.0, 0, 4.6), GLYPH_HOT, glow=True, rot=(0, 0, 0.785))  # the heart
            drifts = [(-2, 6, 3), (-14, -5, 3), (13, 4, 4), (-26, 0, 4), (6, -9, 3)]
        else:
            # the forearm lies along x; the hand cupped at +x, fingers curled up round a light
            fs += _beam(m, (-24, 0, 1.0), (2, 0, 1.6), 7.0, 6.0, STONE[1], w1=8.0, h1=6.6)
            fs += _beam(m, (-29, 0.6, 0.6), (-24, 0, 1.0), 5.6, 4.8, STONE[0], rng=rng, jit=0.6)   # broken end
            m.box((4.4, 4.0, 0.4), (-29.5, 0.6, 3.0), STONE_DARK)
            for k in range(3):                                             # wrist bands, lit
                x = -4 - k * 2.2
                m.box((0.7, 8.6, 0.5), (x, 0, 4.9), STONE[2])
                m.box((0.4, 8.8, 0.3), (x, 0, 5.2), GLYPH, glow=True)
            fs += list(m.box((11, 11, 4.0), (8.5, 0, 1.6), STONE[1], taper=0.92))          # the palm
            m.cyl(2.6, 0.4, (9.0, 0, 3.6), STONE_DARK, segs=10)
            m.ball(2.0, (9.0, 0, 4.4), GLYPH, subdiv=1, glow=True, scale=(1, 1, 0.8))
            m.ball(1.0, (9.0, 0, 5.4), GLYPH_HOT, subdiv=1, glow=True)
            for k in range(4):                                             # fingers, curling up
                y = -4.2 + k * 2.8
                a = Vector((14.0, y, 2.4))
                b = Vector((19.0, y * 1.05, 4.0))
                c = Vector((20.5, y * 1.1, 6.2))
                d = Vector((18.2, y * 1.1, 7.2))
                fs += _beam(m, a, b, 2.2, 2.2, STONE[k % 3])
                fs += _beam(m, b, c, 2.0, 2.0, STONE[(k + 1) % 3])
                fs += _beam(m, c, d, 1.8, 1.8, STONE[(k + 2) % 3])
            fs += _beam(m, (6, -6.0, 2.0), (10, -10.0, 4.0), 2.8, 2.8, STONE[0])               # the thumb
            fs += _beam(m, (10, -10.0, 4.0), (13, -8.5, 6.2), 2.4, 2.4, STONE[2])
            for k in range(6):
                _glyph(m, rng, -20 + k * 3.0, 0, 5.0, 1.6)
            # pieces of its face broken off and lying near: an eye, still lit
            fs += hull(m, [(-6 + dx, 14 + dy, dz) for dx, dy, dz in ((-5, -4, 0), (5, -4, 0), (5, 4, 0), (-5, 4, 0), (-4, -3, 4),
                                                                      (4, -3, 4.6), (3, 3, 3.6), (-3, 3, 4))], STONE[1])
            m.box((2.6, 1.6, 0.5), (-6, 13.6, 4.4), STONE_DARK)
            m.box((1.8, 1.0, 0.4), (-6, 13.6, 4.6), GLYPH, glow=True)
            fs += list(m.box((5, 6, 3.4), (-14, -12, 1.2), STONE[0], rot=(0.2, 0.3, 0.5)))
            drifts = [(-14, 4, 3.5), (8, 7, 3), (-6, -6, 3), (-30, -4, 3)]
        _paint(m, [f for f in fs if f.is_valid], STONE_TOP, STONE_DARK, dot=0.8, shade_dot=-0.55)
        for x, y, R in drifts:
            _drift(m, rng, x, y, R, n=6, size=(3.0, 2.2, 1.2))
        m.build(r)


def henge(variants):
    """Gate: standing stones taller than you fly, glyphs lit, lintels you fly under; the second is
    three obelisks with a ring of light hung between two of them."""
    for i in range(2):
        r = root("kessra_henge", i)
        rng = random.Random(3320 + i)
        m = Model(f"kessra_henge_{i}", 3320 + i)
        fs = []
        if i == 0:
            xs = [-15.75, -5.25, 5.25, 15.75]
            H = [22.0, 23.5, 21.0, 22.5]
            for k, (x, h) in enumerate(zip(xs, H)):
                fs += list(m.box((3.2, 2.6, h), (x, 0, h / 2 - 1.0), STONE[k % 3], taper=0.9))
                for z in range(3, int(h) - 3, 2):
                    _glyph(m, rng, x, -1.25 + 0.06 * z / h, z, 1.1, up=False)
                m.box((0.4, 0.2, h - 6), (x - 1.2, -1.32, h / 2), GLYPH, glow=True)
                collider(r, x, 0, 1.75)
            # trilithon lintels over the outer pairs, a higher one across the middle
            for a, b, z in ((0, 1, 22.6), (2, 3, 22.6)):
                fs += list(m.box((xs[b] - xs[a] + 4.2, 3.0, 2.0), ((xs[a] + xs[b]) / 2, 0, z), STONE[1]))
                m.box((xs[b] - xs[a] - 2.0, 0.3, 0.4), ((xs[a] + xs[b]) / 2, -1.55, z - 0.4), GLYPH, glow=True)
                m.box((xs[b] - xs[a] - 3.2, 2.0, 0.3), ((xs[a] + xs[b]) / 2, 0, z - 1.1), GLYPH, glow=True)
            fs += list(m.box((xs[2] - xs[1] + 4.6, 3.2, 2.2), (0, 0, 25.0), STONE[0]))
            for k in range(3):
                _glyph(m, rng, -3 + k * 3, 0, 26.15, 1.4)
            # a lintel fallen at the outer foot, broken in two
            fs += list(m.box((7, 3, 2), (-21, 2.5, 0.6), STONE[1], rot=(0.1, 0.2, 0.4)))
            fs += list(m.box((5, 3, 2), (-21.5, -3.6, 0.4), STONE[2], rot=(0.2, -0.1, -0.3)))
        else:
            xs = [-14.0, -3.0, 9.5]
            H = [17.0, 27.0, 21.5]
            W = [3.2, 3.6, 3.4]
            for k, (x, h, w) in enumerate(zip(xs, H, W)):
                fs += list(m.box((w, w, h - 2.0), (x, 0, (h - 2.0) / 2 - 0.5), STONE[k % 3], taper=0.62))
                fs += list(m.box((w + 0.8, w + 0.8, 1.2), (x, 0, 0.1), STONE[2]))
                m.cyl(w * 0.62 * 0.71, 2.6, (x, 0, h - 2.5), GLYPH, segs=4, r_top=0.0,
                      rot=(0, 0, math.pi / 4), glow=True)
                for z in range(3, int(h) - 4, 3):
                    shrink = 1 - 0.38 * z / (h - 2)
                    m.box((0.3, 0.2, 1.6), (x, -(w / 2) * shrink - 0.05, z), GLYPH, glow=True)
                    m.box((0.2, 0.3, 1.6), (x - (w / 2) * shrink - 0.05, 0, z + 1.4), GLYPH, glow=True)
                collider(r, x, 0, w * 0.48)
            # the ring of light hung between the tall two: fly through it
            cx, cz, R = (xs[1] + xs[2]) / 2, 19.5, 4.6
            seg = 14
            for k in range(seg):
                a0 = k * math.tau / seg
                a1 = (k + 1) * math.tau / seg
                p0 = (cx + math.cos(a0) * R, 0, cz + math.sin(a0) * R)
                p1 = (cx + math.cos(a1) * R, 0, cz + math.sin(a1) * R)
                fs += _beam(m, p0, p1, 1.0, 1.0, STONE[1])
                m.ball(0.35, (cx + math.cos(a0) * R, -0.6, cz + math.sin(a0) * R), GLYPH, subdiv=0, glow=True)
            for s in (-1, 1):                                              # the arms that hold it
                x = xs[1] if s < 0 else xs[2]
                fs += _beam(m, (x, 0, cz), (cx + s * R, 0, cz), 1.4, 1.4, STONE[0])
            # broken stones round the foot
            for k in range(5):
                a = rng.uniform(0, math.tau)
                x = rng.choice(xs) + math.cos(a) * 4.5
                fs += list(m.box((2.4, 1.6, 1.4), (x, math.sin(a) * 4.5, 0.4), STONE[k % 3],
                                 rot=(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0, 3))))
        _paint(m, [f for f in fs if f.is_valid], STONE_TOP, STONE_DARK, dot=0.8, shade_dot=-0.55)
        for x in xs:
            _drift(m, rng, x, 0, 3.0, n=5, size=(2.0, 1.4, 0.8))
        m.build(r)


def obelisk_span(variants):
    """Span: a great obelisk, toppled across the field onto two stone stumps (the second broke in
    the fall, its halves meeting over a third stone in the middle)."""
    for i in range(2):
        r = root("kessra_obelisk_span", i)
        rng = random.Random(3340 + i)
        m = Model(f"kessra_obelisk_span_{i}", 3340 + i)
        fs = []
        stumps = [(-40.0, 13.2), (40.0, 13.6)] + ([(0.0, 14.6)] if i == 1 else [])
        for x, top in stumps:
            fs += list(m.box((6.0, 6.0, top + 3.0), (x, 0, (top - 3.0) / 2), STONE[2], taper=0.85))
            fs += list(m.box((6.6, 6.6, 1.2), (x, 0, top - 0.4), STONE[0]))
            for z in range(1, int(top) - 1, 3):
                m.box((2.6, 0.2, 0.4), (x, -3.0 + 0.2 * z / top, z), GLYPH, glow=True)
            collider(r, x, 0, 3.2)
        if i == 0:
            parts = [((-45, 13.4 + 2.4), (39, 13.8 + 1.6), 5.0, 4.6, 3.4, 3.0)]
            tips = [(39, 13.8 + 1.6, 1)]
        else:
            parts = [((-45, 13.4 + 2.2), (0.5, 15.0 + 1.9), 4.8, 4.4, 3.8, 3.6),
                     ((0.5, 15.6 + 1.7), (39, 13.8 + 1.5), 3.6, 3.4, 3.0, 2.8)]
            tips = [(39, 13.8 + 1.5, 1)]
        for (xa, za), (xb, zb), w0, h0, w1, h1 in parts:
            fs += _beam(m, (xa, 0, za), (xb, 0, zb), w0, h0, STONE[1], w1=w1, h1=h1)
            # glyph rows on its upturned face
            n = int((xb - xa) / 2.6)
            for k in range(n):
                t = (k + 0.5) / n
                x = xa + (xb - xa) * t
                z = za + (zb - za) * t + (h0 + (h1 - h0) * t) / 2 + 0.02
                _glyph(m, rng, x, 0, z, 1.2)
            # a lit seam along each side
            m.box((xb - xa - 2, 0.25, 0.3), ((xa + xb) / 2, -(w0 + w1) / 4 - 0.05, (za + zb) / 2), GLYPH, glow=True,
                  rot=(0, -math.atan2(zb - za, xb - xa), 0))
        for x, z, s in tips:                                              # the pyramidion, its cap of light
            m.cyl(2.2, 3.4, (x, 0, z), GLYPH, segs=4, r_top=0.0, rot=(0, math.pi / 2, math.pi / 4), glow=True)
        if i == 1:
            # shards from the break
            for k in range(5):
                fs += list(m.box((1.4, 1.2, 1.0), (rng.uniform(-3, 3), rng.uniform(-3, 3), 17.6 + rng.uniform(0, 0.6)), STONE[k % 3],
                                 rot=(rng.uniform(0, 1), rng.uniform(0, 1), rng.uniform(0, 3))))
        # the root end, raw where it snapped from its base
        m.box((0.4, 4.0, 3.6), (-45.2, 0, 15.8), STONE_DARK)
        _paint(m, [f for f in fs if f.is_valid], STONE_TOP, STONE_DARK, dot=0.8, shade_dot=-0.55)
        for x, _ in stumps:
            _drift(m, rng, x, 0, 4.0, n=6, size=(2.4, 1.6, 0.9))
        m.build(r)


def _face(m, x, y, z, s, facing=-1):
    """A carved face on a stone's side looking along y: brow, lit eyes, a nose."""
    yy = y + facing * 0.02
    m.box((1.3 * s, 0.25, 0.25 * s), (x, yy, z + 0.45 * s), STONE[0])
    for sx in (-1, 1):
        m.box((0.36 * s, 0.22, 0.2 * s), (x + sx * 0.35 * s, yy, z + 0.2 * s), GLYPH, glow=True)
    m.box((0.28 * s, 0.4, 0.6 * s), (x, yy + facing * 0.1, z - 0.2 * s), STONE[2], taper=0.6)


def stele(variants):
    """Scenery: the vanished people's smaller stones: a stele with a face, a little trilithon, a
    ring of stones round a lit disc, a leaning pair half drowned in sand. Under the flight line."""
    for i in range(4):
        r = root("kessra_stele", i)
        rng = random.Random(3380 + i)
        m = Model(f"kessra_stele_{i}", 3380 + i)
        fs = []
        if i == 0:
            fs += list(m.box((1.6, 1.0, 5.2), (0, 0, 2.4), STONE[1], taper=0.8))
            fs += list(m.box((1.5, 1.0, 0.5), (0, 0, 5.1), STONE[0], taper=0.7))
            _face(m, 0, -0.5, 3.8, 1.0)
            m.box((0.5, 0.5, 0.12), (0, 0, 5.38), GLYPH, glow=True, rot=(0, 0, 0.785))
            for k in range(3):
                m.box((0.7, 0.12, 0.16), (0, -0.48, 1.2 + k * 0.6), GLYPH, glow=True)
        elif i == 1:
            for sx in (-1.4, 1.4):
                fs += list(m.box((1.1, 1.1, 3.4), (sx, 0, 1.6), STONE[2], taper=0.85))
            fs += list(m.box((4.4, 1.3, 0.8), (0, 0, 3.6), STONE[1]))
            for k in range(3):
                _glyph(m, rng, -1.4 + k * 1.4, 0, 4.05, 0.7)
        elif i == 2:
            n = 7
            for k in range(n):
                a = k * math.tau / n + rng.uniform(-0.1, 0.1)
                h = rng.uniform(1.4, 2.6) if k % 3 else 0.6
                fs += list(m.box((0.8, 0.6, h), (math.cos(a) * 2.6, math.sin(a) * 2.6, h / 2 - 0.2), STONE[k % 3],
                                 rot=(rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), a)))
                if k % 2 == 0:
                    m.box((0.3, 0.3, 0.1), (math.cos(a) * 2.6, math.sin(a) * 2.6, h - 0.15), GLYPH, glow=True)
            m.cyl(1.4, 0.2, (0, 0, -0.05), STONE[0], segs=8)
            m.cyl(1.0, 0.1, (0, 0, 0.12), GLYPH, segs=8, glow=True)
            m.cyl(0.6, 0.1, (0, 0, 0.16), STONE[1], segs=8)
        else:
            fs += list(m.box((1.4, 0.9, 4.0), (-0.8, 0, 1.6), STONE[0], rot=(0, 0.35, 0)))
            fs += list(m.box((1.2, 0.8, 3.0), (1.0, 0.3, 1.2), STONE[2], rot=(0.1, -0.25, 0.2)))
            _face(m, -0.95, -0.46, 2.4, 0.8)
        _paint(m, fs, STONE_TOP, STONE_DARK, dot=0.8, shade_dot=-0.55)
        _drift(m, rng, 0, 0, 2.0, n=4, size=(1.2, 0.9, 0.5))
        m.build(r, rot_z=rng.uniform(0, math.tau))


def lattice_node(variants):
    """Scenery: a machine of the vanished people, still running: a stepped hex plinth, a lit core,
    stone conduits glowing their way off into the sand."""
    for i in range(2):
        r = root("kessra_lattice_node", i)
        rng = random.Random(3400 + i)
        m = Model(f"kessra_lattice_node_{i}", 3400 + i)
        fs = []
        fs += list(m.cyl(2.2, 0.6, (0, 0, -0.2), STONE[0], segs=6))
        fs += list(m.cyl(1.6, 0.6, (0, 0, 0.4), STONE[1], segs=6, rot=(0, 0, 0.52)))
        if i == 0:
            fs += list(m.cyl(0.9, 0.5, (0, 0, 1.0), STONE[2], segs=6))
            m.cyl(0.6, 1.4, (0, 0, 1.5), GLYPH, segs=4, r_top=0.0, glow=True, rot=(0, 0, 0.785))
            for k in range(3):                                             # three claws holding it
                a = k * math.tau / 3
                fs += list(m.box((0.35, 0.35, 1.8), (math.cos(a) * 0.95, math.sin(a) * 0.95, 1.7), STONE[1],
                                 rot=(-math.sin(a) * 0.3, math.cos(a) * 0.3, 0)))
        else:
            # cracked open, the core dimmed to a ring, one claw fallen
            m.cyl(0.85, 0.15, (0, 0, 1.0), GLYPH, segs=6, glow=True)
            m.cyl(0.55, 0.2, (0, 0, 1.02), STONE_DARK, segs=6)
            fs += list(m.box((0.35, 0.35, 1.8), (1.9, 1.2, 0.2), STONE[1], rot=(1.4, 0, 0.6)))
        for k in range(3):                                                 # conduits into the sand
            a = k * math.tau / 3 + 0.5 + rng.uniform(-0.2, 0.2)
            L = rng.uniform(2.4, 3.4)
            c = (math.cos(a) * (2.2 + L / 2), math.sin(a) * (2.2 + L / 2), 0.05)
            fs += list(m.box((L, 0.7, 0.4), c, STONE[2], rot=(0, 0, a)))
            m.box((L * 0.9, 0.22, 0.1), (c[0], c[1], 0.27), GLYPH, glow=True, rot=(0, 0, a))
        _paint(m, fs, STONE_TOP, STONE_DARK, dot=0.8, shade_dot=-0.55)
        _drift(m, rng, 0, 0, 2.6, n=5, size=(1.3, 1.0, 0.5))
        m.build(r, rot_z=rng.uniform(0, math.tau))


def glyph_slab(variants):
    """Scenery: slabs of the vanished people lying in the sand, glyphs still lit, half drifted over."""
    for i in range(3):
        r = root("kessra_glyph_slab", i)
        rng = random.Random(3360 + i)
        m = Model(f"kessra_glyph_slab_{i}", 3360 + i)
        fs = []
        if i == 0:
            fs += list(m.box((5.0, 2.6, 1.0), (0, 0, 0.3), STONE[1], rot=(0, 0.08, 0)))
            for k in range(3):
                _glyph(m, rng, -1.6 + k * 1.6, 0, 0.95, 1.0)
        elif i == 1:
            # a broken column, its drums rolled apart
            for k in range(3):
                fs += m.cyl(1.2, 1.8, (-2.4 + k * 2.3, k * 0.5, 1.2), STONE[k % 3], segs=8, rot=(math.pi / 2, 0, 0.3 * k + 1.4))
                m.box((0.3, 0.3, 0.3), (-2.4 + k * 2.3, k * 0.5, 2.45), GLYPH, glow=True)
        else:
            # two slabs fallen across each other, one lit along its edge
            fs += list(m.box((4.6, 2.0, 0.8), (0, 0, 0.2), STONE[0], rot=(0, 0, 0.3)))
            fs += list(m.box((4.0, 1.8, 0.8), (0.4, 0.2, 0.9), STONE[2], rot=(0.12, 0, -0.5)))
            m.box((3.4, 0.2, 0.2), (0.4, 0.2, 1.38), GLYPH, glow=True, rot=(0.12, 0, -0.5))
            _glyph(m, rng, -1.4, -0.6, 0.65, 0.9)
        _paint(m, fs, STONE_TOP, STONE_DARK, dot=0.8, shade_dot=-0.55)
        _drift(m, rng, 0, 0, 2.4, n=4, size=(1.4, 1.0, 0.6))
        m.build(r, rot_z=rng.uniform(0, math.tau))


# --- the oasis --------------------------------------------------------------------------------

def sandcrawler(variants):
    """Giant: a caravan's sand-crawler, parked by the water, awnings out and lamps lit; the second,
    a land-train of three wagons on great wheels. Under 8.5."""
    for i in range(2):
        r = root("kessra_sandcrawler", i)
        rng = random.Random(3400 + i)
        m = Model(f"kessra_sandcrawler_{i}", 3400 + i)
        fs = []
        if i == 0:
            # two track units
            for s in (-1, 1):
                fs += list(m.box((30, 5.0, 3.0), (0, s * 7.0, 1.3), IRON[0]))
                for k in range(15):
                    m.box((1.2, 5.3, 0.4), (-14 + k * 2.0, s * 7.0, 2.85), IRON[1])
                for k in range(5):
                    m.cyl(1.4, 5.4, (-12 + k * 6, s * 7.0 - 2.7, 1.4), IRON[2], segs=8, rot=(-math.pi / 2, 0, 0))
            # the hull: stepped decks, each with its own life
            fs += list(m.box((28, 11, 2.4), (0, 0, 3.8), WOOD[1]))
            fs += list(m.box((14, 9, 2.2), (-6, 0, 6.1), WOOD[0]))
            fs += list(m.box((6, 6, 1.6), (-8, 0, 7.9), "#c8b088"))                   # the bridge cabin
            for k in range(4):
                m.box((0.9, 0.12, 0.6), (-10 + k * 1.4, -3.05, 8.0), LAMP, glow=True)
            # striped awnings over the front deck, a market under them
            for k in range(3):
                a, b = CLOTH[k]
                x = 6 + k * 4.2
                for j in range(6):
                    m.box((3.8, 1.6, 0.18), (x, -4.0 + j * 1.6, 7.0 - abs(j - 2.5) * 0.25), (a, b)[j % 2], rot=(0.1, 0, 0))
                for sy in (-1, 1):
                    m.cyl(0.12, 2.0, (x - 1.8, sy * 4.6, 5.0), WOOD[2], segs=4)
            for k in range(5):
                m.box((1.4, 1.0, 0.06), (5 + k * 2.2, rng.uniform(-3, 3), 5.03), RUG[k % 4])
                m.box((0.8, 0.8, 0.8), (6 + k * 2.0, 4.2, 5.4), ("#8a6a3a", "#a07a44")[k % 2])
            # water tanks, teal, and a chimney
            for k in range(3):
                fs += m.cyl(1.2, 2.2, (-12 + k * 2.8, 4.0, 5.0), "#2a8a8a", segs=8)
                m.cyl(1.25, 0.2, (-12 + k * 2.8, 4.0, 7.2), "#6ac8c0", segs=8)
            fs += m.cyl(0.7, 1.2, (-2, -3.6, 7.2), IRON[1], segs=6, r_top=0.5)
            m.cyl(0.55, 0.2, (-2, -3.6, 8.3), "#ff7a2a", segs=6, glow=True)
            # the ramp down at the back, a rug and crates on the sand
            fs += _beam(m, (-14, 0, 3.0), (-20, 0, 0.0), 5.0, 0.4, WOOD[2])
            m.box((4.0, 3.0, 0.06), (-23, 0, 0.03), RUG[0])
            m.box((3.0, 2.0, 0.07), (-23, 0, 0.05), RUG[2])
            for k in range(4):
                m.box((1.0, 1.0, 1.0), (-22 + k * 1.3, 3.6 + (k % 2) * 0.4, 0.5), ("#8a6a3a", "#a07a44")[k % 2])
            for k in range(6):                                             # lamps along the rails
                m.ball(0.38, (-12 + k * 5, -5.7, 5.4), LAMP, subdiv=1, glow=True)
            # cloth banners hung over the side
            for k in range(4):
                a, _ = CLOTH[k]
                m.box((1.6, 0.12, 2.0), (-10 + k * 6, -5.6, 3.8), a)
        else:
            # three wagons, linked, each on four great wheels, tent-roofed
            for w in range(3):
                x = -18 + w * 18
                L = 13 if w != 1 else 15
                rot = (w - 1) * 0.12
                fs += list(m.box((L, 8, 2.6), (x, (w - 1) * 1.2, 3.0), WOOD[w % 3]))
                for sx in (-1, 1):
                    for sy in (-1, 1):
                        p = (x + sx * (L / 2 - 2.4), (w - 1) * 1.2 + sy * 4.4, 0)
                        fs += m.cyl(2.6, 1.0, (p[0], p[1] - 0.5, 2.6), IRON[1], segs=10, rot=(-math.pi / 2, 0, 0))
                        m.cyl(0.9, 1.1, (p[0], p[1] - 0.55, 2.6), WOOD[2], segs=6, rot=(-math.pi / 2, 0, 0))
                a, b = CLOTH[w + 1]
                fs += list(m.gable((L - 1, 7.6, 3.2), (x, (w - 1) * 1.2, 4.3), a, overhang=0.4))
                for k in range(int(L) // 2):
                    m.box((0.5, 8.4, 0.12), (x - L / 2 + 1.5 + k * 2, (w - 1) * 1.2, 6.0), b)
                m.box((1.2, 1.2, 0.2), (x, (w - 1) * 1.2, 7.55), LAMP, glow=True)
                if w < 2:
                    m.box((5, 1.0, 0.6), (x + L / 2 + 2.5, (w - 0.5) * 1.2, 2.2), IRON[0])
            # the beast-engine at the front: a boiler on wheels, its firebox glowing
            fs += m.cyl(3.0, 8.0, (22, 1.2, 4.0), IRON[2], segs=10, rot=(0, math.pi / 2, 0))
            m.cyl(2.2, 0.4, (30.0, 1.2, 4.0), "#ff7a2a", segs=10, rot=(0, math.pi / 2, 0), glow=True)
            fs += m.cyl(0.8, 3.0, (26, 1.2, 6.5), IRON[0], segs=6, r_top=1.1)
            for s in (-1, 1):
                fs += m.cyl(2.8, 1.0, (24, 1.2 + s * 3.6 - 0.5, 2.8), IRON[1], segs=10, rot=(-math.pi / 2, 0, 0))
            for k in range(6):                                             # bundles roped on top
                m.box((1.4, 1.0, 0.9), (-22 + k * 7.5, 0.0, 7.3 - 0.5 * (k % 2)), ("#8a6a3a", "#c8a870")[k % 2])
        _paint(m, [f for f in fs if f.is_valid], None, "#4a3428", dot=0.85, shade_dot=-0.6)
        _drift(m, rng, 0, 0, 16, n=8, size=(2.4, 1.8, 0.8))
        m.build(r)


def _sheet(m, p00, p10, p01, p11, sag, colors, nu=6, nv=3, thick=0.1, tatter=None):
    """A sheet of cloth from four corners, bellied down by `sag`, striped along u. Both faces
    are built (the underside is what a ship sees against the sky)."""
    p00, p10, p01, p11 = (Vector(p) for p in (p00, p10, p01, p11))
    grid = []
    for i in range(nu + 1):
        u = i / nu
        row = []
        for j in range(nv + 1):
            v = j / nv
            p = p00.lerp(p10, u).lerp(p01.lerp(p11, u), v)
            p.z -= sag * math.sin(math.pi * u) * math.sin(math.pi * v)
            if tatter and j == nv and 0 < i < nu:
                p.z -= tatter[i % len(tatter)]
            row.append(p)
        grid.append(row)
    bm = m.bm
    top = [[bm.verts.new(p) for p in row] for row in grid]
    bot = [[bm.verts.new(p - Vector((0, 0, thick))) for p in row] for row in grid]
    out = []
    for i in range(nu):
        idx = m._slot(colors[i % len(colors)], False)
        for j in range(nv):
            a = bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]))
            b = bm.faces.new((bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j], bot[i][j]))
            a.material_index = b.material_index = idx
            out += [a, b]
    for f in out:
        f.normal_update()
    return out


def _rope(m, a, b, sag, r=0.16, n=12, color=ROPE):
    a, b = Vector(a), Vector(b)
    pts = []
    for k in range(n + 1):
        t = k / n
        p = a.lerp(b, t)
        p.z -= sag * math.sin(math.pi * t)
        pts.append(p)
    tube(m, pts, [r] * (n + 1), color, segs=4)
    return pts


def _mast(m, rng, r, x, y, H, R=0.85):
    """A salvaged iron mast: tapered, banded, a yard and a lamp at the top, guyed outward."""
    tube(m, [Vector((x, y, -3.0)), Vector((x, y, H * 0.5)), Vector((x, y, H))], [R * 1.1, R * 0.85, R * 0.6], IRON[1],
         segs=8, colors=[IRON[1], IRON[2]])
    for z in (2.0, H * 0.45, H * 0.8):
        m.cyl(R * 1.05, 0.5, (x, y, z), IRON[0], segs=8)
    m.cyl(R * 1.6, 0.8, (x, y, -1.0), IRON[0], segs=8, r_top=R * 1.2)
    m.box((0.5, 5.0, 0.5), (x, y, H - 0.6), IRON[2])
    m.ball(0.55, (x, y, H + 0.4), LAMP, subdiv=1, glow=True)
    side = 1 if x > 0 else -1
    for dy in (-3.0, 3.0):
        _rope(m, (x, y, H - 1.0), (x + side * 7.0, y + dy, -0.5), 0.3, r=0.1, n=4)
    m.box((1.6, 1.6, 0.8), (x + side * 7.0, y, -0.4), "#6a5a4a")
    collider(r, x, y, R * 1.05)


def sunsails(variants):
    """Span: the market's shade, sails of striped cloth slung on ropes between salvaged masts
    right across the field (all of it above 15). The second has a mast in the middle."""
    for i in range(2):
        r = root("kessra_sunsails", i)
        rng = random.Random(3620 + i)
        m = Model(f"kessra_sunsails_{i}", 3620 + i)
        c = Model(f"kessra_sunsails_{i}_cloth", 3630 + i)
        D = 5.0 if i == 0 else 6.0
        H = 23.0
        xs = [-42.0, 42.0]
        for x in xs:
            for y in (-D, D):
                _mast(m, rng, r, x + rng.uniform(-0.6, 0.6), y, H)
        if i == 1:
            _mast(m, rng, r, 0.0, 0.0, H + 1.5, R=1.0)
        # the two long ropes the sails hang from, and lantern strings
        ropes = {}
        for y in (-D, D):
            if i == 0:
                ropes[y] = _rope(m, (-42, y, H - 1.2), (42, y, H - 1.2), 4.0, n=16)
            else:
                ropes[y] = _rope(m, (-42, y, H - 1.2), (0, 0, H), 2.0, n=8)[:-1] + _rope(m, (0, 0, H), (42, y, H - 1.2), 2.0, n=8)

        def at(y, x):
            pts = ropes[y]
            best = min(pts, key=lambda p: abs(p.x - x))
            return Vector((x, best.y, best.z - 0.3))
        # sails: different widths, gaps between, some skewed, one torn
        x = -40.0
        k = 0
        while x < 38:
            w = rng.uniform(9.0, 14.0)
            x1 = min(x + w, 40.5)
            a, b = CLOTH[k % len(CLOTH)]
            skew = rng.uniform(-1.5, 1.5)
            tat = [0.0, 0.8, 0.3, 1.2] if k == 2 else None
            _sheet(c, at(-D, x), at(-D, x1), at(D, x + skew), at(D, x1 + skew), rng.uniform(0.8, 1.6),
                   [a, b] if k % 2 == 0 else [b, a, a], nu=6, nv=3, tatter=tat)
            # a lantern hung under each sail's middle, well above the flight line
            mid = at(-D, (x + x1) / 2).lerp(at(D, (x + x1) / 2), 0.5)
            tube(c, [mid, mid - Vector((0, 0, 1.4))], [0.06, 0.06], ROPE, segs=4)
            c.ball(0.5, tuple(mid - Vector((0, 0, 1.9))), (LAMP, "#ff7a4a", POOL_GLOW)[k % 3], subdiv=1, glow=True,
                   scale=(1, 1, 1.3))
            x = x1 + rng.uniform(2.5, 5.0)
            k += 1
        # pennant strings along the outer ropes
        for y in (-D, D):
            pts = ropes[y]
            for j in range(1, len(pts) - 1, 2):
                p = pts[j]
                c.prism([(-0.5, 0), (0.5, 0), (0, -1.3)], 0.06, (p.x, p.y + (0.1 if y > 0 else -0.1), p.z - 0.15),
                        FLAGS[j % len(FLAGS)])
        m.build(r)
        cl = c.build(r)
        sway(cl, f"kessra_sunsails_{i}_sway_idle", amp=(0.004, 0.006), period=4.0, phase=i)


def aqueduct(variants):
    """Span: the oasis's aqueduct, tiled and arched, water running turquoise along its top and
    spilling off the ends; the second has a pier in the middle of the field."""
    for i in range(2):
        r = root("kessra_aqueduct", i)
        rng = random.Random(3440 + i)
        m = Model(f"kessra_aqueduct_{i}", 3440 + i)
        fs = []
        piers = [-41.0, 41.0] + ([0.0] if i == 1 else [])
        for x in piers:
            fs += list(m.box((5.0, 5.0, 19.0), (x, 0, 6.5), TILE[2], taper=0.9))
            fs += list(m.box((6.2, 6.2, 1.2), (x, 0, -2.0), SAND[0]))
            for z in (3.0, 9.0, 15.0):
                m.box((5.1, 5.1, 0.6), (x, 0, z), TILE[1])
            collider(r, x, 0, 2.7)
        # the channel: deck with an arcade cut under it (the arches' crowns are the deck's underside)
        D = 5.0
        fs += list(m.box((92, D, 2.4), (0, 0, 17.4), TILE[0]))
        n = 10
        for k in range(n + 1):
            x = -45 + 90 * k / n
            if any(abs(x - p) < 3 for p in piers):
                continue
            # pendant pier-ends hanging between the arches (down to 13.2)
            fs += list(m.box((1.8, D, 3.0), (x, 0, 14.7), TILE[2], taper=1.25))
        for k in range(n):
            xa = -45 + 90 * k / n
            xb = xa + 9
            for j in range(5):                                             # the arch's curve, stepped
                t = (j + 0.5) / 5
                xx = xa + 0.9 + (xb - xa - 1.8) * t
                h = 1.6 * math.sin(math.pi * t)
                m.box(((xb - xa - 1.8) / 5 + 0.02, D + 0.1, 0.5), (xx, 0, 16.0 - h * 0.4 - 0.2), TILE[2])
            m.box((xb - xa - 2.4, 0.2, 0.4), ((xa + xb) / 2, -D / 2 - 0.05, 17.6), TILE[1])        # a blue tile band
        # walls of the channel and the water in it
        for sy in (-1, 1):
            fs += list(m.box((92, 0.8, 1.0), (0, sy * (D / 2 - 0.4), 19.1), TILE[2]))
        m.box((92, D - 1.6, 0.2), (0, 0, 18.75), "#1e9aa8")
        for k in range(14):                                               # glints
            m.box((rng.uniform(1.5, 3.0), 0.3, 0.1), (rng.uniform(-44, 44), rng.uniform(-1.2, 1.2), 18.9), POOL_GLOW, glow=True)
        # pots of flowers along the walls
        for k in range(12):
            x = rng.uniform(-40, 40)
            sy = rng.choice((-1, 1))
            m.cyl(0.6, 0.8, (x, sy * (D / 2 - 0.4), 19.6), POT[k % 3], segs=6, r_top=0.8)
            m.ball(0.75, (x, sy * (D / 2 - 0.4), 20.6), ("#e83a6a", "#f0c040", "#4aa060")[k % 3], subdiv=0)
        # the spill at each end, falling to the ground outside the field
        for s in (-1, 1):
            x = s * 46.5
            m.box((1.2, 2.6, 21.0), (x, 0, 8.5), POOL, glow=True)
            m.cyl(3.0, 0.4, (x, 0, -0.5), POOL_GLOW, segs=8, glow=True)
            for k in range(5):
                m.box((0.4, 2.0, rng.uniform(3, 7)), (x + s * 0.3, rng.uniform(-0.8, 0.8), rng.uniform(2, 16)), "#e0fff8",
                      glow=True)
        _paint(m, [f for f in fs if f.is_valid], None, "#a89878", dot=0.9, shade_dot=-0.55)
        m.build(r)


# --- the oasis's flora --------------------------------------------------------------------------
# Nothing here is a palm. Round Kessra's iron-salt seeps grow halophytes that drink brine and keep
# the salt: blue leaf-pads with crusted white tips, jointed reeds, water-bladders and cupped
# rosettes that hold the dew. Iron in the water stains the woody parts rust. The few trees, the
# bluecrowns, are squat bottle trunks under flat parasols of stiff blue pads: the "blue palms" the
# caravans named the place for.

CROWN = [("#2f74b0", "#215a8c"), ("#3d8cc8", "#2a6aa0"), ("#2a68a0", "#1d4e7c")]
CROWN_TOP = ["#6ab8e8", "#82c8f0"]
IRONBARK = ["#7a3a26", "#94482c", "#5e2c1e", "#a85a34"]
BARK_RING = "#c8784a"
TEAL = ["#2a9a94", "#3ab0a4", "#1e7a78", "#48c0b0"]
TEAL_TOP = "#7ad8c4"
REED = ["#3a8a96", "#2a6a78", "#5aa8a8"]
SALT_TIP = "#f6f2e6"
AMBER = "#f0a040"
EMBER = "#ffb84a"
BEAD = ["#d8604a", "#e88a6a", "#c84a3a"]
ROSETTE = [("#5a8aa8", "#3e6e8c"), ("#6a9ab4", "#4a7a98")]
ROSETTE_IN = ("#8ab8cc", "#6a9ab4")
POOL_DEEP = "#1a9aa8"
CRUST = ["#f0ece0", "#e4dccc", "#f8f4ea"]


def _crown(m, rng, c, R, blades=10, dome=6, lift=0.7):
    """A bluecrown's parasol: a low dome of stiff leaf-pads and a rim of spiky blades fanning
    out and down, their tips crusted with salt. Read from above: a star round a cobbled boss."""
    cx, cy, cz = c
    pads = []
    for k in range(dome):
        if k == 0:
            a, d, z = 0.0, 0.0, cz + lift * 0.55
        else:
            a = k * math.tau / (dome - 1) + rng.uniform(-0.3, 0.3)
            d = R * rng.uniform(0.32, 0.45)
            z = cz + lift * 0.2
        rr = R * rng.uniform(0.38, 0.48)
        pads += m.ball(rr, (cx + math.cos(a) * d, cy + math.sin(a) * d, z), CROWN[k % 3][0], subdiv=0,
                       scale=(1, 1, 0.5), jitter=0.05, rot=(0, 0, rng.uniform(0, math.tau)))
    _paint(m, pads, CROWN_TOP[rng.randrange(2)], None, dot=0.8)
    turn = rng.uniform(0, math.tau)
    for k in range(blades):
        yaw = turn + k * math.tau / blades + rng.uniform(-0.12, 0.12)
        L = R * rng.uniform(0.85, 1.1)
        b = (cx + math.cos(yaw) * R * 0.25, cy + math.sin(yaw) * R * 0.25, cz + 0.15)
        pts = arc(b, yaw, L, 0.3, 0.75, n=3)
        c1, c2 = CROWN[k % 3]
        ribbon(m, pts, [0.26, 0.42, 0.3, 0.06], c1, CROWN_TOP[0] if k % 2 else c1, fold=0.3, thick=0.07)
        if k % 3 == 0:                                                     # a salt-white tip
            m.ball(0.17, tuple(pts[-1]), SALT_TIP, subdiv=0)


def _bottle(m, rng, base, h, r, lean=(0.0, 0.0), bark=None, ring=None):
    """A bluecrown trunk: swollen with water low down, ringed with old leaf scars, iron-red (or
    `bark`, a dead one's grey)."""
    bark = bark or IRONBARK
    pts = bend(base, (base[0], base[1], base[2] + h), lean, n=5)
    radii = [r * 1.3, r * 1.45, r * 1.25, r * 1.0, r * 0.8, r * 0.7]
    tube(m, pts, radii, bark[0], segs=7, colors=[bark[(k * 3 + 1) % 4] for k in range(5)])
    for k in range(1, 5, 2):                                               # scar rings
        p = pts[k]
        m.cyl(radii[k] * 1.06, 0.14, (p.x, p.y, p.z - 0.07), ring or BARK_RING, segs=7)
    for k in range(4):                                                     # root flare
        a = k * math.tau / 4 + rng.uniform(-0.4, 0.4)
        x, y = base[0], base[1]
        tube(m, [Vector((x, y, 0.45)), Vector((x + math.cos(a) * r * 2.4, y + math.sin(a) * r * 2.4, -0.1))],
             [r * 0.55, r * 0.2], bark[2], segs=4)
    return pts[-1]


def _limb(m, a, b, r0, r1):
    a, b = Vector(a), Vector(b)
    mid = a.lerp(b, 0.5) + Vector((0, 0, (b - a).length * 0.12))
    tube(m, [a, mid, b], [r0, (r0 + r1) / 2, r1], IRONBARK[1], segs=5, colors=[IRONBARK[1], IRONBARK[3]])


def bluecrown(variants):
    """Hero scenery: the oasis's trees, standing out of their own thicket. 5-6 tall, crowns 5-7
    across: two ships or so."""
    for i in range(3):
        r = root("kessra_bluecrown", i)
        rng = random.Random(3500 + i)
        m = Model(f"kessra_bluecrown_{i}", 3500 + i)
        if i == 0:
            top = _bottle(m, rng, (0, 0, 0), 2.9, 0.48, (0.3, 0.1))
            c = (top.x + 0.1, top.y, top.z + 1.2)
            _limb(m, top, c, 0.34, 0.24)
            _crown(m, rng, c, 2.8, blades=10, dome=7)
        elif i == 1:
            top = _bottle(m, rng, (0, 0, 0), 2.2, 0.55)
            for k, (a, d, z, R) in enumerate(((0.3, 1.8, 4.6, 2.0), (2.4, 1.7, 4.0, 1.8), (4.3, 1.6, 3.5, 1.5))):
                c = (top.x + math.cos(a) * d, top.y + math.sin(a) * d, z)
                _limb(m, top, c, 0.34, 0.2)
                _crown(m, rng, c, R, blades=8, dome=5, lift=0.6)
        else:
            for k, (x, y, h, lean, R) in enumerate(((0, 0, 3.0, (-1.0, 0.3), 2.0), (0.8, 0.3, 2.2, (1.1, 0.5), 1.6))):
                top = _bottle(m, rng, (x, y, 0), h, 0.34 - 0.05 * k, lean)
                c = (top.x + lean[0] * 0.3, top.y + lean[1] * 0.3, top.z + 0.8)
                _limb(m, top, c, 0.24, 0.17)
                _crown(m, rng, c, R, blades=8, dome=5, lift=0.6)
        _thicket(m, rng, 0.3, 0.2, 2.2, n=5)
        m.build(r, rot_z=rng.uniform(0, math.tau))

def _reeds(m, rng, x, y, n, h=(1.2, 2.1), spread=0.55):
    """A clump of brine-reed: jointed teal rods, a few crowned with salt crystal, a few with rust
    seed heads, strap leaves round the foot."""
    turn = rng.uniform(0, math.tau)
    for k in range(n):
        a = turn + k * math.tau / n + rng.uniform(-0.3, 0.3)
        d = spread * (0.3 if k == 0 else rng.uniform(0.5, 1.0))
        H = rng.uniform(*h) * (1.15 if k == 0 else 1)
        bx, by = x + math.cos(a) * d, y + math.sin(a) * d
        pts = bend((bx, by, -0.05), (bx, by, H), (math.cos(a) * 0.25 * H, math.sin(a) * 0.25 * H), n=4)
        tube(m, pts, [0.14, 0.13, 0.12, 0.1, 0.07], REED[0], segs=4, colors=[REED[(j + k) % 2] for j in range(4)])
        tip = pts[-1]
        if k % 3 == 0:
            m.cyl(0.17, 0.45, (tip.x, tip.y, tip.z - 0.05), SALT_TIP, segs=5, r_top=0.0)
        elif k % 3 == 1:
            m.cyl(0.18, 0.55, (tip.x, tip.y, tip.z - 0.35), BEAD[2], segs=5, r_top=0.12)
    for k in range(3):
        a = turn + k * math.tau / 3 + 0.3
        pts = arc((x, y, 0.05), a, rng.uniform(0.8, 1.1), 0.9, 1.1, n=2)
        ribbon(m, pts, [0.12, 0.17, 0.12, 0.03], TEAL[k % 2], TEAL[2], fold=0.4, thick=0.05)


def _cushion(m, rng, x, y, R, beads=None):
    """A brine-mat: a low cushion of beaded succulent, its bead tips stained red by the iron."""
    fs = []
    for k in range(3):
        a = k * math.tau / 3 + rng.uniform(-0.4, 0.4)
        d = R * 0.35
        fs += lump(m, rng, (x + math.cos(a) * d, y + math.sin(a) * d, 0.0), (R * 0.8, R * 0.7, R * 0.36),
                   TEAL[k % 3], n=7, flat=0.6)
    _paint(m, fs, TEAL_TOP if rng.random() < 0.5 else TEAL[3], None, dot=0.75)
    nb = beads if beads is not None else min(4, max(2, int(R * 3)))
    a0 = rng.uniform(0, math.tau)                                          # beads in one red patch, not confetti
    for k in range(nb):
        a = a0 + rng.uniform(-0.6, 0.6)
        d = R * rng.uniform(0.2, 0.5)
        m.ball(rng.uniform(0.2, 0.26), (x + math.cos(a) * d, y + math.sin(a) * d, R * 0.36), BEAD[k % 3], subdiv=0)


def _puddle(m, rng, x, y, R, n=9, z=0.04, deep=True, crust=True):
    """A brine puddle: turquoise in a white crust."""
    pts = []
    for k in range(n):
        a = k * math.tau / n
        d = R * rng.uniform(0.82, 1.12)
        pts.append((x + math.cos(a) * d, y + math.sin(a) * d * 0.85))
    if crust:
        m.slab([(x + (px - x) * 1.22, y + (py - y) * 1.22) for px, py in pts], -0.1, z - 0.02, CRUST[0])
    m.slab(pts, -0.1, z, POOL)
    if deep:
        m.slab([(x + (px - x) * 0.55, y + (py - y) * 0.55) for px, py in pts], -0.1, z + 0.02, POOL_DEEP)


def _grow_all(m, k):
    """Scale everything built so far in the model about the origin."""
    for v in m.bm.verts:
        v.co *= k


def _thicket(m, rng, x, y, R, n=None):
    """Brine-mat knitted into one mass: overlapping cushions over a disc of radius R."""
    n = n or max(3, int(R * 2.2))
    for k in range(n):
        a = k * math.tau / n + rng.uniform(-0.3, 0.3)
        d = 0 if k == 0 else R * rng.uniform(0.45, 0.8)
        _cushion(m, rng, x + math.cos(a) * d, y + math.sin(a) * d, rng.uniform(0.85, 1.25), beads=2 if k % 2 else 0)


def brine_reed(variants):
    """Mid scenery: brine-reed at the pools' lips, and sword-leaf."""
    for i in range(3):
        r = root("kessra_brine_reed", i)
        rng = random.Random(3520 + i)
        m = Model(f"kessra_brine_reed_{i}", 3520 + i)
        if i == 0:
            _reeds(m, rng, 0, 0, 9)
            _reeds(m, rng, 1.3, 0.6, 5, h=(0.9, 1.5), spread=0.4)
        elif i == 1:
            # sword-leaf: stiff blue-teal blades fanned, rust flower stalks out of it
            turn = rng.uniform(0, math.tau)
            for k in range(11):
                a = turn + k * math.tau / 11 + rng.uniform(-0.2, 0.2)
                pts = arc((math.cos(a) * 0.2, math.sin(a) * 0.2, 0), a, rng.uniform(1.4, 2.0), 1.6, 1.2, n=3)
                c = (REED[k % 3], CROWN[1][1])[k % 4 == 0]
                ribbon(m, pts, [0.12, 0.2, 0.14, 0.03], c, TEAL[2], fold=0.5, thick=0.05)
            for k in range(2):
                a = turn + k * 2.6
                top = Vector((math.cos(a) * 0.6, math.sin(a) * 0.6, 2.6 - k * 0.5))
                tube(m, [Vector((0, 0, 0.2)), Vector((top.x * 0.5, top.y * 0.5, top.z * 0.6)), top], [0.09, 0.08, 0.06],
                     IRONBARK[1], segs=4)
                for j in range(3):
                    m.ball(0.2, (top.x * (1 - j * 0.08), top.y * (1 - j * 0.08), top.z - j * 0.32), (AMBER, BEAD[0])[j % 2],
                           subdiv=0)
        else:
            # reeds standing in a puddle of their own
            _puddle(m, rng, 0.6, -0.3, 1.5)
            _reeds(m, rng, 0, 0.3, 7)
            _reeds(m, rng, 1.6, -0.9, 4, h=(0.8, 1.3), spread=0.35)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def brine_mat(variants):
    """Ground cover: brine-mat carpets, knitted into masses three or four across, so a thicket
    reads as one sheet of teal; one grown round a dried white crust."""
    for i in range(3):
        r = root("kessra_brine_mat", i)
        rng = random.Random(3540 + i)
        m = Model(f"kessra_brine_mat_{i}", 3540 + i)
        if i == 0:
            _thicket(m, rng, 0, 0, 1.9, n=6)
        elif i == 1:
            _thicket(m, rng, 0, 0, 1.6, n=5)
            _thicket(m, rng, 2.4, 0.8, 1.2, n=4)
            _rosette(m, rng, 1.0, -1.2, 0.7, n=8)
        else:
            pts = []
            for k in range(9):
                a = k * math.tau / 9
                pts.append((math.cos(a) * rng.uniform(1.3, 1.7), math.sin(a) * rng.uniform(1.1, 1.4)))
            m.slab(pts, -0.1, 0.05, CRUST[0])
            m.slab([(x * 0.6, y * 0.6) for x, y in pts], -0.1, 0.07, CRUST[1])
            for k in range(7):
                a = k * math.tau / 7 + rng.uniform(-0.2, 0.2)
                _cushion(m, rng, math.cos(a) * 2.0, math.sin(a) * 1.7, rng.uniform(0.8, 1.05), beads=2 if k % 2 else 0)
        m.build(r, rot_z=rng.uniform(0, math.tau))

def bladder_bush(variants):
    """Mid scenery: shrubs of fat water-bladders on rust stems, and a stacked pad-plant."""
    for i in range(3):
        r = root("kessra_bladder_bush", i)
        rng = random.Random(3560 + i)
        m = Model(f"kessra_bladder_bush_{i}", 3560 + i)
        fs = []
        if i == 0:
            # a mound
            for k in range(4):
                a = k * math.tau / 4 + rng.uniform(-0.3, 0.3)
                tube(m, [Vector((0, 0, 0)), Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, 0.6))], [0.14, 0.1], IRONBARK[2], segs=4)
            for k in range(11):
                if k == 0:
                    a, d, z = 0, 0, 1.25
                else:
                    a = k * math.tau / 10 + rng.uniform(-0.25, 0.25)
                    d = rng.uniform(0.65, 1.1)
                    z = 0.95 - d * 0.35 + rng.uniform(-0.1, 0.15)
                rr = rng.uniform(0.42, 0.6)
                fs += m.ball(rr, (math.cos(a) * d, math.sin(a) * d, z), TEAL[k % 3], subdiv=0, scale=(1, 1, 0.85),
                             rot=(0, 0, rng.uniform(0, 1)))
            for k in range(4):
                a = rng.uniform(0, math.tau)
                m.ball(0.2, (math.cos(a) * 0.5, math.sin(a) * 0.5, 1.6), AMBER, subdiv=0)
        elif i == 1:
            # sprawling: arching stems, a bunch of bladders at each tip
            turn = rng.uniform(0, math.tau)
            for k in range(5):
                a = turn + k * math.tau / 5 + rng.uniform(-0.2, 0.2)
                L = rng.uniform(1.2, 1.7)
                pts = arc((0, 0, 0.1), a, L, 1.1, 1.0, n=3)
                tube(m, pts, [0.14, 0.12, 0.1, 0.08], IRONBARK[k % 2], segs=4)
                tip = pts[-1]
                for j in range(3):
                    b = a + (j - 1) * 0.9
                    fs += m.ball(rng.uniform(0.32, 0.42), (tip.x + math.cos(b) * 0.3, tip.y + math.sin(b) * 0.3, tip.z + 0.1),
                                 TEAL[(k + j) % 4], subdiv=0, scale=(1, 1, 0.8))
                if k % 2:
                    m.ball(0.18, (tip.x, tip.y, tip.z + 0.45), AMBER, subdiv=0)
            fs += m.ball(0.5, (0, 0, 0.45), TEAL[2], subdiv=0, scale=(1, 1, 0.7))
        else:
            # pad-plant: flat oval pads stacked edge on edge, fruit on the rims
            def pad(c, yaw, s, col):
                return m.ball(0.62 * s, c, col, subdiv=1, scale=(1, 0.32, 1.15), rot=(0, 0, yaw))
            P = [((0, 0, 0.6), 0.3, 1.0), ((0.45, 0.1, 1.55), 0.9, 0.85), ((-0.4, -0.1, 1.5), -0.5, 0.8),
                 ((0.8, 0.3, 2.3), 1.4, 0.65), ((-0.65, 0.1, 2.25), -0.1, 0.6), ((0.1, -0.2, 2.35), 2.0, 0.55)]
            for k, (c, yaw, s) in enumerate(P):
                fs += pad(c, yaw + rng.uniform(-0.2, 0.2), s, (TEAL[0], TEAL[1], CROWN[1][0])[k % 3])
            for k in range(5):
                c, yaw, s = P[3 + k % 3]
                m.ball(0.17, (c[0] + rng.uniform(-0.2, 0.2), c[1] + rng.uniform(-0.2, 0.2), c[2] + 0.62 * s * 1.1),
                       (AMBER, BEAD[0])[k % 2], subdiv=0)
            _cushion(m, rng, 0.9, -0.9, 0.5, beads=2)
        _paint(m, fs, TEAL_TOP, None, dot=0.8)
        _thicket(m, rng, 0.0, 0.0, 1.8, n=3)                               # sat in its own mat
        _grow_all(m, 1.3)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def _rosette(m, rng, x, y, s=1.0, n=9):
    turn = rng.uniform(0, math.tau)
    for k in range(n):
        a = turn + k * math.tau / n + rng.uniform(-0.1, 0.1)
        pts = arc((x, y, 0.05), a, 1.35 * s * rng.uniform(0.9, 1.1), 1.2, 0.95, n=3)
        c1, c2 = ROSETTE[k % 2]
        ribbon(m, pts, [0.16 * s, 0.38 * s, 0.34 * s, 0.05 * s], c1, c2, fold=0.7, thick=0.08)
    for k in range(4):
        a = turn + (k + 0.5) * math.tau / 4
        pts = arc((x, y, 0.15), a, 0.8 * s, 1.9, 1.3, n=3)
        ribbon(m, pts, [0.14 * s, 0.26 * s, 0.2 * s, 0.04 * s], ROSETTE_IN[0], ROSETTE_IN[1], fold=0.7, thick=0.07)
    m.cyl(0.42 * s, 0.1, (x, y, 0.42 * s), POOL, segs=7)                     # the dew it keeps


def cistern_rosette(variants):
    """Mid scenery: cup-leaved rosettes that keep a sip of water at the heart; one throws up a
    flower spike with glowing florets."""
    for i in range(3):
        r = root("kessra_cistern_rosette", i)
        rng = random.Random(3580 + i)
        m = Model(f"kessra_cistern_rosette_{i}", 3580 + i)
        if i == 0:
            _rosette(m, rng, 0, 0, 1.1, n=10)
        elif i == 1:
            _rosette(m, rng, 0, 0, 1.0)
            spike = [Vector((0.05, 0, 0.3)), Vector((0.2, 0.05, 1.6)), Vector((0.35, 0.1, 2.8)), Vector((0.4, 0.1, 3.4))]
            tube(m, spike, [0.16, 0.13, 0.1, 0.06], IRONBARK[3], segs=5)
            for j in range(6):
                p = spike[2].lerp(spike[3], j / 5)
                a = j * 2.2
                m.box((0.3, 0.3, 0.26), (p.x + math.cos(a) * 0.22, p.y + math.sin(a) * 0.22, p.z - 0.4 + j * 0.05),
                      EMBER, glow=True, rot=(0.3, 0.2, a))
        else:
            for k, (x, y, s) in enumerate(((0, 0, 0.75), (1.4, 0.5, 0.6), (0.5, -1.2, 0.5))):
                _rosette(m, rng, x, y, s, n=8)
            _cushion(m, rng, -1.0, -0.8, 0.5, beads=3)
        _grow_all(m, 1.2)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def seep(variants):
    """Scenery, rarer: a spring, a pool two or three ships across, everything that grows here
    crowded round its lip: reeds, mat, bladders, a bluecrown."""
    for i in range(2):
        r = root("kessra_seep", i)
        rng = random.Random(3600 + i)
        m = Model(f"kessra_seep_{i}", 3600 + i)
        if i == 0:
            _puddle(m, rng, 0, 0, 3.4, n=12)
            for k in range(7):
                a = k * math.tau / 7 + rng.uniform(-0.2, 0.2)
                _cushion(m, rng, math.cos(a) * 4.4, math.sin(a) * 3.9, rng.uniform(0.9, 1.2), beads=2 if k % 3 == 0 else 0)
            for a in (0.4, 2.4, 4.4):
                _reeds(m, rng, math.cos(a) * 3.3, math.sin(a) * 2.8, 6)
            _rosette(m, rng, -4.6, -1.6, 0.9)
            _rosette(m, rng, 1.6, -4.4, 0.8)
            top = _bottle(m, rng, (4.6, 2.2, 0), 2.4, 0.4, (0.3, 0.2))
            c = (top.x, top.y, top.z + 1.0)
            _limb(m, top, c, 0.28, 0.2)
            _crown(m, rng, c, 2.3, blades=9, dome=6)
        else:
            for k, (x, y, R) in enumerate(((-2.4, 0, 2.2), (0.9, 0.6, 2.6), (3.8, -0.3, 1.8))):
                _puddle(m, rng, x, y, R, n=10)
            for k in range(3):
                lump(m, rng, (-0.7 + k * 1.5, -0.1 + 0.4 * (k % 2), 0.0), (0.5, 0.42, 0.22), "#8a7a6a", n=7, flat=0.5)
            m.box((1.0, 1.0, 1.4), (-5.4, 0.8, 0.7), IRON[1])
            m.box((0.6, 0.6, 0.7), (-5.4, 0.8, 1.75), IRON[2])
            m.box((1.6, 0.2, 0.2), (-5.1, 0.8, 2.2), IRON[0], rot=(0, 0.35, 0))
            m.box((2.4, 1.0, 0.6), (-5.2, -0.9, 0.3), IRON[2])
            m.box((2.1, 0.7, 0.1), (-5.2, -0.9, 0.58), POOL)
            for k in range(6):
                a = k * math.tau / 6 + 0.3
                _cushion(m, rng, 0.5 + math.cos(a) * 5.4, math.sin(a) * 3.4, rng.uniform(0.85, 1.15), beads=2 if k % 3 == 0 else 0)
            _reeds(m, rng, 1.2, 2.8, 6)
            _reeds(m, rng, 4.8, -1.8, 5)
            _rosette(m, rng, -1.4, 3.0, 0.8)
            _cushion(m, rng, 5.8, 1.4, 1.0)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def oasis_grove(variants):
    """Landmark (the runtime scales it up about 1.3-1.7): a pool among bluecrowns, the thicket
    knitted round it, and a little market at its edge. Built small so it lands in scale."""
    for i in range(variants):
        r = root("kessra_oasis_grove", i)
        rng = random.Random(3640 + i)
        m = Model(f"kessra_oasis_grove_{i}", 3640 + i)
        _puddle(m, rng, 0, 0, 4.0, n=13)
        for k in range(9):
            a = k * math.tau / 9 + rng.uniform(-0.15, 0.15)
            _cushion(m, rng, math.cos(a) * 5.0, math.sin(a) * 4.5, rng.uniform(0.8, 1.1), beads=2 if k % 4 == 0 else 0)
        for a in (0.2, 2.3, 4.4):
            _reeds(m, rng, math.cos(a) * 3.9, math.sin(a) * 3.4, 5, h=(0.9, 1.5), spread=0.45)
        trees = ((0.9, 6.2, 1.5), (2.4, 6.0, 1.3), (3.9, 6.4, 1.6)) if i == 0 else ((0.6, 6.0, 1.4), (2.2, 6.4, 1.6), (5.2, 6.0, 1.3), (3.8, 6.6, 1.2))
        for a, d, R in trees:
            x, y = math.cos(a) * d, math.sin(a) * d
            _thicket(m, rng, x, y, 1.2, n=2)
            top = _bottle(m, rng, (x, y, 0), 1.8, 0.28, (rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3)))
            c = (top.x, top.y, top.z + 0.6)
            _limb(m, top, c, 0.2, 0.15)
            _crown(m, rng, c, R, blades=7, dome=4, lift=0.45)
        # a stall and its rugs at the open side
        a0 = 5.0 if i == 0 else 1.5
        sx, sy = math.cos(a0) * 6.6, math.sin(a0) * 6.6
        ca, cb = CLOTH[i]
        for dx in (-1.1, 1.1):
            for dy in (-0.8, 0.8):
                m.cyl(0.08, 1.5, (sx + dx, sy + dy, 0), WOOD[2], segs=4)
        for k in range(4):
            m.box((0.6, 1.9, 0.08), (sx - 0.9 + k * 0.6, sy, 1.5), (ca, cb)[k % 2])
        for k in range(3):
            m.box((1.0, 0.8, 0.05), (sx - 1.6 + k * 1.2, sy - 1.6, 0.03), RUG[k])
            m.ball(0.25, (sx - 1.6 + k * 1.2, sy - 1.6, 0.15), SPICE[k], subdiv=0, scale=(1, 1, 0.6))
        m.build(r, rot_z=rng.uniform(0, math.tau))

def market_stall(variants):
    """Scenery: the market: a spice stall under striped cloth, a potter's ring of jars, a well."""
    for i in range(3):
        r = root("kessra_market_stall", i)
        rng = random.Random(3480 + i)
        m = Model(f"kessra_market_stall_{i}", 3480 + i)
        if i == 0:
            a, b = CLOTH[3]
            for x in (-1.8, 1.8):
                for y in (-1.2, 1.2):
                    m.cyl(0.08, 2.2, (x, y, 0), WOOD[2], segs=4)
            for k in range(6):
                m.box((0.66, 2.9, 0.1), (-1.65 + k * 0.66, 0, 2.2 + 0.1 * (k % 2)), (a, b)[k % 2])
            m.box((3.6, 1.2, 0.8), (0, -0.6, 0.4), WOOD[1])
            for k in range(5):                                             # heaps of spice, bright
                m.cyl(0.32, 0.25, (-1.4 + k * 0.7, -0.6, 0.8), "#8a6a3a", segs=6)
                m.ball(0.3, (-1.4 + k * 0.7, -0.6, 1.08), SPICE[k % 4], subdiv=0, scale=(1, 1, 0.7))
            for k in range(3):
                m.cyl(0.45, 0.7, (-1.2 + k * 1.2, 0.8, 0.0), ("#c8a870", "#a88a50")[k % 2], segs=7, r_top=0.4)
                m.ball(0.42, (-1.2 + k * 1.2, 0.8, 0.72), SPICE[(k + 2) % 4], subdiv=0, scale=(1, 1, 0.5))
        elif i == 1:
            for k in range(9):
                ang = k * math.tau / 9
                d = 1.4 + 0.3 * (k % 2)
                h = rng.uniform(0.8, 1.4)
                m.cyl(0.35, h * 0.6, (math.cos(ang) * d, math.sin(ang) * d, 0), POT[k % 3], segs=7, r_top=0.48)
                m.cyl(0.48, h * 0.4, (math.cos(ang) * d, math.sin(ang) * d, h * 0.6), POT[k % 3], segs=7, r_top=0.22)
            m.box((2.0, 1.4, 0.05), (0, 0, 0.03), RUG[1])
            m.box((1.4, 0.9, 0.06), (0, 0, 0.05), RUG[2])
            m.cyl(0.25, 0.4, (0, 0, 0.05), POT[2], segs=6)
        else:
            # a well: a tiled ring round turquoise water, a lifting beam over it
            m.cyl(1.6, 0.9, (0, 0, -0.1), TILE[2], segs=10)
            m.cyl(1.65, 0.25, (0, 0, 0.8), TILE[1], segs=10)
            m.cyl(1.2, 0.1, (0, 0, 0.75), POOL, segs=10, glow=True)
            for s in (-1, 1):
                m.box((0.3, 0.3, 2.6), (s * 1.3, 0, 1.3), WOOD[2])
            m.box((3.0, 0.3, 0.3), (0, 0, 2.6), WOOD[0])
            m.cyl(0.3, 0.6, (0.4, 0, 1.6), WOOD[1], segs=6)
            for k in range(3):
                m.cyl(0.35, 0.6, (2.3 + k * 0.2, -0.8 + k * 0.8, 0), POT[k], segs=6, r_top=0.25)
        m.build(r, rot_z=rng.uniform(0, math.tau))


# --- the oasis laid out (sim/layouts/oasis.ts) ------------------------------------------------
# Everything at Bluepalm is there because of the water: the qanats that bring it under the erg,
# the noria that lifts it, the bunds and walls of the gardens it's shared out to, the cistern that
# keeps it cool, the market and the caravanserai where the road meets it. Mud brick, iron-red
# spoil, frond fences, blue tile.

MUD = ["#b87a52", "#a86c48", "#c48a5e"]
MUD_TOP = "#dcae7e"
MUD_SHADE = "#8a5438"
MUD_DARK = "#4a2a20"
SPOIL = ["#9a4e34", "#8a422e", "#a85c3c", "#b46a44"]
SPOIL_TOP = "#c88058"
SHAFT = "#22140f"
FROND = ["#b89a6a", "#a68456", "#c8aa78", "#94744a"]
DEAD = ["#8a7a68", "#9a8a74", "#6e6254", "#a89a84"]
DEAD_LEAF = ["#a8977c", "#8e7e66", "#bcae94"]
SACK = ["#c8a870", "#b08a58", "#d8bc88"]
DUNE = ["#d8b078", "#c89a68", "#e2c08c"]
DOOR = "#2a6a8a"


def _mud_box(m, size, loc, rng, jit=0.06, taper=1.0):
    """A block of mud brick, its top a shade lighter, its shaded faces darker, a little uneven."""
    w, d, h = size
    fs = list(m.box((w + rng.uniform(-jit, jit), d + rng.uniform(-jit, jit), h + rng.uniform(-jit, jit) * 2), loc,
                    MUD[rng.randrange(3)], taper=taper))
    _paint(m, fs, MUD_TOP, MUD_SHADE, dot=0.8)
    return fs


def _mound(m, rng, x, y, sx, sy, h, colors=None, top=None):
    """A smooth low heap (sand drifted, spoil tipped): a squashed ball half sunk in the ground."""
    colors = colors or SAND
    fs = list(m.ball(1.0, (x, y, 0.0), colors[rng.randrange(len(colors))], subdiv=1, scale=(sx, sy, h),
                     rot=(0, 0, rng.uniform(0, math.tau)), jitter=0.06 * min(sx, sy)))
    _paint(m, fs, top or colors[-1], None, dot=0.85)
    return fs


def _hole(m, x, y, z, w, h, facing=-1):
    """A dark opening on a wall's face (facing -y by default: towards the camera)."""
    m.box((w, 0.12, h), (x, y + facing * 0.02, z), MUD_DARK)


def qanat_shaft(variants):
    """Scenery, in dotted lines across the erg: a qanat's access shaft, the spoil dug out of it
    heaped in a ring round the dark hole, iron-red on the pale sand. The second has a windlass
    over it (they're cleaning it), the third is an old one slumped and drifted half full, the
    fourth the mother well, kerbed."""
    for i in range(variants):
        r = root("kessra_qanat_shaft", i)
        rng = random.Random(3700 + i)
        m = Model(f"kessra_qanat_shaft_{i}", 3700 + i)
        old = i == 2
        R = 1.25 if not old else 1.4
        n = 7
        a0 = rng.uniform(0, math.tau)
        cols = SAND if old else SPOIL[:3]
        for k in range(n):
            a = a0 + k * math.tau / n + rng.uniform(-0.12, 0.12)
            _mound(m, rng, math.cos(a) * R, math.sin(a) * R, rng.uniform(0.85, 1.0), rng.uniform(0.7, 0.85),
                   (0.38 if old else 0.62) * rng.uniform(0.85, 1.1), cols, SAND[2] if old else SPOIL_TOP)
        # the spoil tipped outwards on one side, a tongue of it
        _mound(m, rng, math.cos(a0) * (R + 1.2), math.sin(a0) * (R + 1.2), 1.0, 0.75, 0.3, cols, SAND[2] if old else SPOIL[3])
        hole = 0.6 if not old else 0.42
        m.cyl(hole + 0.2, 0.3, (0, 0, -0.05), SPOIL[1] if not old else SAND[0], segs=8)
        m.cyl(hole, 0.06, (0, 0, 0.22), SHAFT, segs=8)
        if i == 1:
            # a windlass: two forked posts, the drum across, a rope and a leather bucket
            for sd in (-1, 1):
                tube(m, [Vector((sd * 1.0, 0, 0.1)), Vector((sd * 0.95, 0, 1.6))], [0.12, 0.1], WOOD[2], segs=4)
                m.box((0.14, 0.32, 0.32), (sd * 0.95, 0, 1.65), WOOD[0])
            m.cyl(0.2, 2.1, (-1.05, 0, 1.6), WOOD[1], segs=6, rot=(0, math.pi / 2, 0))
            m.cyl(0.27, 0.6, (-0.3, 0, 1.6), ROPE, segs=6, rot=(0, math.pi / 2, 0))
            tube(m, [Vector((0, 0, 1.45)), Vector((0, 0, 0.55))], [0.05, 0.05], ROPE, segs=3)
            m.cyl(0.26, 0.32, (0, 0, 0.3), "#6a3a24", segs=6, r_top=0.3)
            m.cyl(0.38, 0.3, (1.5, -1.0, 0.05), FROND[1], segs=7, r_top=0.44)       # a basket of spoil
            m.ball(0.36, (1.5, -1.0, 0.38), SPOIL[2], subdiv=0, scale=(1, 1, 0.5))
        elif i == 2:
            m.box((1.3, 0.5, 0.18), (0.1, 0.1, 0.25), MUD[1], rot=(0.1, 0.05, 0.6))   # a lintel half over it
        elif i == 3:
            # the mother well, where the qanat's dug from: a kerb of brick, a tiled lip, a marker
            fs = list(m.cyl(1.25, 0.6, (0, 0, 0), MUD[1], segs=10, r_top=1.15))
            _paint(m, fs, None, MUD_SHADE)
            m.cyl(1.2, 0.12, (0, 0, 0.6), TILE[1], segs=10)
            m.cyl(0.7, 0.06, (0, 0, 0.68), SHAFT, segs=8)
            for sd in (-1, 1):
                m.box((0.2, 0.2, 1.3), (sd * 0.95, 0, 1.25), WOOD[2])
            m.box((2.2, 0.22, 0.22), (0, 0, 1.95), WOOD[0])
            m.cyl(0.05, 1.6, (2.0, 1.2, 0), WOOD[2], segs=4)
            m.prism([(0, 0), (0.8, -0.15), (0, -0.4)], 0.04, (2.0, 1.2, 1.6), FLAGS[2])
        m.build(r, rot_z=rng.uniform(0, math.tau))


def sand_fence(variants):
    """Scenery, in rows on the erg's edge: fences of palm frond to stop the dunes walking in, sand
    heaped against their windward side; one gapped and leaning where the sand's winning. Long
    along +y (about 6)."""
    for i in range(variants):
        r = root("kessra_sand_fence", i)
        rng = random.Random(3720 + i)
        m = Model(f"kessra_sand_fence_{i}", 3720 + i)
        L = 6.0
        lean = 0.12 if i == 0 else 0.3
        y = -L / 2
        while y < L / 2 - 0.1:
            w = rng.uniform(0.28, 0.42)
            if i == 1 and rng.random() < 0.18:                             # gaps where it's broken
                y += w + 0.15
                continue
            h = rng.uniform(1.1, 1.6) * (1 if i == 0 else rng.uniform(0.6, 1.0))
            c = FROND[rng.randrange(4)]
            tilt = lean + rng.uniform(-0.08, 0.08)
            m.box((0.1, w, h), (math.sin(tilt) * h / 2, y + w / 2, math.cos(tilt) * h / 2), c, rot=(0, tilt, rng.uniform(-0.06, 0.06)))
            y += w + rng.uniform(0.0, 0.06)
        # posts and the rail they're tied to
        for k in range(4):
            py = -L / 2 + 0.2 + k * (L - 0.4) / 3
            tube(m, [Vector((-0.1, py, -0.1)), Vector((math.sin(lean) * 1.5 - 0.1, py, 1.5))], [0.09, 0.07], WOOD[2], segs=4)
        tube(m, [Vector((math.sin(lean) * 1.0 - 0.15, -L / 2, 1.0)), Vector((math.sin(lean) * 1.0 - 0.15, L / 2, 1.0))],
             [0.05, 0.05], ROPE, segs=3)
        # sand heaped on the windward side (-x), up to half its height
        for k in range(4):
            py = -L / 2 + 0.9 + k * (L - 1.8) / 3 + rng.uniform(-0.3, 0.3)
            _mound(m, rng, -0.75, py, 1.0, 1.1, 0.5 + 0.25 * (i == 1), DUNE)
        m.build(r)


def garden_wall(variants):
    """A garden's mud-brick wall, 8 long along +y: buttressed, its top uneven and capped, palm
    frond laid along it against the sun. The second has its gate (a blue door ajar), the third has
    slumped and the sand's drifting over it."""
    for i in range(variants):
        r = root("kessra_garden_wall", i)
        rng = random.Random(3740 + i)
        m = Model(f"kessra_garden_wall_{i}", 3740 + i)
        L = 8.0
        T = 0.6
        n = 8
        for k in range(n):
            y0 = -L / 2 + k * L / n
            if i == 1 and 3 <= k <= 4:
                continue                                                   # the gateway
            h = 1.15 + rng.uniform(-0.08, 0.08)
            if i == 2:
                h *= (1.0, 0.95, 0.75, 0.42, 0.28, 0.5, 0.85, 1.0)[k]
            _mud_box(m, (T, L / n + 0.02, h), (0, y0 + L / n / 2, h / 2), rng, jit=0.04)
            m.box((T + 0.12, L / n + 0.04, 0.12), (0, y0 + L / n / 2, h + 0.04), MUD_TOP)
        for y in (-2.9, 2.9) if i != 1 else (-3.4, 3.4):                   # buttresses
            _mud_box(m, (0.5, 0.6, 0.9), (0.5, y, 0.45), rng, taper=0.6)
        if i == 0:
            # fronds laid along the top
            for k in range(9):
                y = -3.6 + k * 0.85 + rng.uniform(-0.1, 0.1)
                m.box((0.95, 0.75, 0.08), (rng.uniform(-0.1, 0.1), y, 1.28), FROND[k % 4], rot=(0, rng.uniform(-0.1, 0.1), rng.uniform(-0.25, 0.25)))
        if i == 1:
            for s in (-1, 1):                                              # gateposts and the door
                _mud_box(m, (0.85, 0.85, 1.9), (0, s * 1.25, 0.95), rng)
                m.cyl(0.3, 0.3, (0, s * 1.25, 1.9), MUD_TOP, segs=6, r_top=0.05)
            m.box((0.08, 1.0, 1.4), (-0.4, -0.35, 0.72), DOOR, rot=(0, 0, 0.9))
            m.box((0.08, 1.0, 1.4), (0, 0.55, 0.72), DOOR)
            m.box((0.1, 0.25, 0.25), (-0.05, 0.4, 0.9), "#d8a040")
        if i == 2:
            for k in range(6):                                             # its fallen brick and the sand
                y = rng.uniform(-0.8, 1.6)
                m.box((0.45, 0.35, 0.3), (rng.uniform(0.5, 1.3) * rng.choice((-1, 1)), y, 0.12), MUD[k % 3],
                      rot=(rng.uniform(-0.3, 0.3), 0, rng.uniform(0, 3)))
            _mound(m, rng, -1.0, 0.6, 1.6, 2.6, 0.75, DUNE)
            _mound(m, rng, -0.8, 3.0, 1.2, 1.4, 0.5, DUNE)
        m.build(r)


def garden_tower(variants):
    """A garden's corner tower: the dovecote, round and tapering, a crown of little turrets on
    top, rows of nest holes, white streaks from the birds; and a square watchtower with a frond
    shade and a lamp. About 6.5 tall: under you, but the tallest thing in the gardens."""
    for i in range(variants):
        r = root("kessra_garden_tower", i)
        rng = random.Random(3760 + i)
        m = Model(f"kessra_garden_tower_{i}", 3760 + i)
        if i == 0:
            fs = list(m.cyl(1.9, 4.6, (0, 0, 0), MUD[0], segs=10, r_top=1.45))
            fs += list(m.cyl(1.45, 0.4, (0, 0, 4.6), MUD[2], segs=10, r_top=1.6))
            _paint(m, fs, MUD_TOP, MUD_SHADE, dot=0.8)
            for row, z in enumerate((2.2, 3.3)):                           # nest holes, in rows
                for k in range(10):
                    a = (k + 0.5 * row) * math.tau / 10
                    R = 1.9 - (1.9 - 1.45) * z / 4.6
                    m.box((0.22, 0.12, 0.3), (math.cos(a) * R, math.sin(a) * R, z), MUD_DARK, rot=(0, 0, a + math.pi / 2))
            m.cyl(1.94, 0.18, (0, 0, 1.5), "#e8dcc4", segs=10, r_top=1.88)    # the whitewash band
            m.cyl(1.55, 0.06, (0, 0, 5.0), MUD_TOP, segs=10)
            for k in range(6):                                             # the crown of turrets
                a = k * math.tau / 6
                x, y = math.cos(a) * 1.15, math.sin(a) * 1.15
                t = list(m.cyl(0.36, 0.9, (x, y, 5.0), MUD[k % 3], segs=6, r_top=0.3))
                t += list(m.cyl(0.32, 0.4, (x, y, 5.9), MUD[2], segs=6, r_top=0.02))
                _paint(m, t, MUD_TOP, MUD_SHADE)
                m.box((0.14, 0.12, 0.2), (x * 1.25, y * 1.25, 5.45), MUD_DARK, rot=(0, 0, a + math.pi / 2))
            m.ball(0.75, (0, 0, 5.2), MUD_TOP, subdiv=1, scale=(1, 1, 0.7))
            for k in range(5):                                             # the birds' droppings, white streaks
                a = rng.uniform(0, math.tau)
                m.box((0.16, 0.08, 0.7), (math.cos(a) * 1.62, math.sin(a) * 1.62, 3.5), "#f2ece0", rot=(0, 0, a + math.pi / 2))
            for k in range(4):                                             # birds on the turrets
                a = (k + 0.3) * math.tau / 6 * 1.4
                m.ball(0.16, (math.cos(a) * 1.15, math.sin(a) * 1.15, 6.4), ("#e8e0d0", "#6a6a78")[k % 2], subdiv=0,
                       scale=(1.4, 0.8, 0.8))
        else:
            fs = _mud_box(m, (2.6, 2.6, 4.8), (0, 0, 2.4), rng, taper=0.82)
            for sx in (-1, 1):
                for sy in (-1, 1):
                    _mud_box(m, (0.55, 0.55, 0.7), (sx * 1.05, sy * 1.05, 5.15), rng)
            m.box((2.2, 2.2, 0.1), (0, 0, 4.85), MUD_TOP)
            _hole(m, 0, -1.12, 3.6, 0.4, 0.8)
            _hole(m, 0, -1.25, 0.8, 0.9, 1.5)
            m.box((0.16, 0.9, 1.5), (-0.4, -1.35, 0.8), DOOR, rot=(0, 0, 0.5))
            # a frond shade on poles over the top, a lamp hung under it
            for sx in (-1, 1):
                for sy in (-1, 1):
                    m.cyl(0.06, 1.6, (sx * 0.8, sy * 0.8, 4.9), WOOD[2], segs=4)
            for k in range(5):
                m.box((2.5, 0.42, 0.06), (0, -1.0 + k * 0.5, 6.5), FROND[k % 4], rot=(0, 0, rng.uniform(-0.06, 0.06)))
            m.ball(0.22, (0.5, 0.4, 6.1), LAMP, subdiv=0, glow=True)
            for k in range(3):                                             # sacks and a jar at its foot
                m.ball(0.42, (1.8, -0.6 + k * 0.6, 0.3), SACK[k], subdiv=0, scale=(1, 0.8, 0.75), jitter=0.04)
            m.cyl(0.32, 0.8, (-1.8, -1.2, 0), POT[0], segs=6, r_top=0.2)
        m.build(r, rot_z=rng.uniform(0, math.tau) if i == 0 else 0.0)


def windcatcher(variants):
    """Landmark, an obstacle: the cistern in the market square, a dome over cold water deep
    underground, and its windcatcher towers standing up over it (14 tall: you fly round them, not
    over), slatted near the top to catch the wind and send it down to the water. A tiled portal,
    steps going down into the dark."""
    for i in range(variants):
        r = root("kessra_windcatcher", i)
        rng = random.Random(3780 + i)
        m = Model(f"kessra_windcatcher_{i}", 3780 + i)
        # the dome, on a low drum, in rings of brick, a tiled finial
        fs = list(m.cyl(4.6, 1.2, (0, 0, 0), MUD[1], segs=14, r_top=4.5))
        fs += list(m.ball(4.4, (0, 0, 1.0), MUD[0], subdiv=2, scale=(1, 1, 0.78)))
        _paint(m, fs, None, MUD_SHADE, dot=0.9)
        m.cyl(4.62, 0.3, (0, 0, 1.1), TILE[1], segs=14)
        m.cyl(0.7, 0.5, (0, 0, 4.3), TILE[1], segs=8, r_top=0.4)
        m.ball(0.4, (0, 0, 4.95), TILE[0], subdiv=0)
        # the portal: a tall gateway with a pointed niche, tiled, steps down into the dark
        _mud_box(m, (3.4, 1.6, 4.6), (0, -4.3, 2.3), rng)
        m.box((3.5, 1.7, 0.3), (0, -4.3, 4.7), TILE[2])
        m.box((3.0, 0.2, 0.35), (0, -5.15, 4.2), TILE[1])
        m.prism([(-0.9, 0), (0.9, 0), (0.9, 2.4), (0, 3.3), (-0.9, 2.4)], 0.3, (0, -5.0, 0.1), MUD_DARK)
        for k in range(4):
            m.box((2.0 - k * 0.15, 0.5, 0.2), (0, -5.6 - k * 0.45, 0.1 + (3 - k) * 0.05), STONE_TOP if k % 2 else TILE[2])
        # the towers: tall, square, slatted at the top, tile banded; on the dome's shoulders
        spots = ((-3.2, 2.2, 14.0), (3.2, 2.2, 13.4), (-3.4, -1.6, 13.0), (3.4, -1.6, 14.4)) if i == 0 else \
                ((-2.6, 1.8, 14.6), (3.0, 0.6, 13.2))
        for k, (x, y, H) in enumerate(spots):
            W = 1.9 if i == 0 else 2.3
            t = list(m.box((W, W, H), (x, y, H / 2), MUD[k % 3], taper=0.9))
            _paint(m, t, MUD_TOP, MUD_SHADE, dot=0.8)
            top = H
            w2 = W * 0.9
            for s in range(3):                                             # the slats, dark, on every face
                off = (s - 1) * w2 * 0.3
                for f, (dx, dy, rot) in enumerate(((0, -1, 0), (0, 1, 0), (-1, 0, math.pi / 2), (1, 0, math.pi / 2))):
                    m.box((w2 * 0.16, 0.12, 2.0), (x + dx * w2 / 2 + (off if dy else 0), y + dy * w2 / 2 + (off if dx else 0), top - 1.6),
                          MUD_DARK, rot=(0, 0, rot))
            m.box((w2 + 0.4, w2 + 0.4, 0.35), (x, y, top + 0.15), MUD_TOP)
            m.box((w2 + 0.15, w2 + 0.15, 0.3), (x, y, top - 3.0), TILE[1])
            m.box((w2 + 0.1, w2 + 0.1, 0.22), (x, y, top - 3.4), TILE[0])
            for sx in (-1, 1):                                             # little pinnacles
                for sy in (-1, 1):
                    m.cyl(0.14, 0.5, (x + sx * w2 * 0.45, y + sy * w2 * 0.45, top + 0.3), MUD_TOP, segs=4, r_top=0.02)
            collider(r, x, y, W * 0.75)
        # water jars and a trough by the steps, people come here to fill up
        for k in range(5):
            m.cyl(0.3, 0.7, (-2.6 + k * 0.4, -6.4 - (k % 2) * 0.4, 0), POT[k % 3], segs=6, r_top=0.2)
        m.box((2.0, 0.7, 0.5), (2.6, -6.2, 0.25), STONE[1])
        m.box((1.7, 0.45, 0.08), (2.6, -6.2, 0.52), POOL)
        m.build(r)


def noria(variants):
    """Landmark, at the mother pool's lip: a great wheel of wood turned by the water, pots on its
    rim lifting it up into a trough on a brick pier that carries it off to the gardens. The wheel
    turns (its own object, pivoted on the axle)."""
    for i in range(variants):
        r = root("kessra_noria", i)
        rng = random.Random(3800 + i)
        m = Model(f"kessra_noria_{i}", 3800 + i)
        w = Model(f"kessra_noria_{i}_wheel", 3810 + i)
        R = 3.4
        AX = 3.0
        # the wheel, in the xz plane (its face towards you), built round its own axle: two rims
        # with paddles between them, six spokes, a pot on every paddle
        for side in (-0.5, 0.5):
            for k in range(14):
                a0 = k * math.tau / 14
                a1 = (k + 1) * math.tau / 14
                tube(w, [Vector((math.cos(a0) * R, side, math.sin(a0) * R)), Vector((math.cos(a1) * R, side, math.sin(a1) * R))],
                     [0.2, 0.2], WOOD[1], segs=4)
            for k in range(6):
                a = k * math.tau / 6
                tube(w, [Vector((0, side, 0)), Vector((math.cos(a) * R, side, math.sin(a) * R))], [0.16, 0.13], WOOD[2], segs=4)
        for k in range(14):
            a = (k + 0.5) * math.tau / 14
            x, z = math.cos(a) * R, math.sin(a) * R
            w.box((0.5, 1.2, 0.12), (x, 0, z), WOOD[0], rot=(0, -a, 0))
            w.cyl(0.26, 0.6, (math.cos(a) * (R + 0.35), 0, math.sin(a) * (R + 0.35) - 0.3), POT[k % 3], segs=6, r_top=0.18)
        w.cyl(0.45, 1.6, (0, 0.8, 0), WOOD[0], segs=6, rot=(math.pi / 2, 0, 0))
        # the piers it turns on and the trough it spills into, off along +x on brick arches
        for side in (-1, 1):
            _mud_box(m, (0.8, 0.6, AX + 0.4), (0, side * 1.05, (AX + 0.4) / 2), rng)
        m.box((0.9, 2.8, 0.3), (0, 0, AX + 0.5), WOOD[1])
        span = 9.0
        for k in range(3):
            x = 2.4 + k * span / 3
            _mud_box(m, (0.9, 1.2, AX + 0.6), (x + 1.2, 0, (AX + 0.6) / 2), rng)
        m.box((span + 0.6, 1.3, 0.6), (2.0 + span / 2, 0, AX + 0.9), MUD[2])
        m.box((span + 0.6, 0.8, 0.12), (2.0 + span / 2, 0, AX + 1.22), POOL)
        for s in (-1, 1):
            m.box((span + 0.6, 0.22, 0.25), (2.0 + span / 2, s * 0.55, AX + 1.3), MUD_TOP)
        m.box((1.4, 1.3, 0.5), (1.4, 0, AX + 1.0), "#1e9aa8")
        m.build(r)
        wheel = w.build(r, loc=(0, 0, AX))
        from kit import animate, _CLIPS
        clip = f"kessra_noria_{i}_turn_idle"
        T = 12.0
        animate(wheel, clip, "rotation_euler", [(T * k / 12, (0, -math.tau * k / 12, 0)) for k in range(13)])
        for fc in _fcurves(_CLIPS[clip]):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"


def _fcurves(act):
    """Every fcurve in an action (slotted or not)."""
    try:
        return list(act.fcurves)
    except AttributeError:
        out = []
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    out += list(bag.fcurves)
        return out


def dead_crown(variants):
    """Scenery, in the dry garden: a bluecrown dead where it stood when its water stopped, the
    trunk gone grey, its blades hanging dead round it; and one snapped, its crown on the sand."""
    for i in range(variants):
        r = root("kessra_dead_crown", i)
        rng = random.Random(3820 + i)
        m = Model(f"kessra_dead_crown_{i}", 3820 + i)
        if i == 0:
            top = _bottle(m, rng, (0, 0, 0), 2.7, 0.44, (0.4, -0.1), bark=DEAD, ring=DEAD[3])
            c = top + Vector((0.1, 0, 0.8))
            _limb(m, top, c, 0.3, 0.2)
            turn = rng.uniform(0, math.tau)
            for k in range(9):
                yaw = turn + k * math.tau / 9 + rng.uniform(-0.2, 0.2)
                pts = arc(tuple(c), yaw, rng.uniform(1.6, 2.4), -0.2, 1.6, n=3)    # hanging down
                ribbon(m, pts, [0.2, 0.3, 0.2, 0.04], DEAD_LEAF[k % 3], DEAD_LEAF[(k + 1) % 3], fold=0.3, thick=0.06)
            m.ball(0.55, tuple(c), DEAD[1], subdiv=0, scale=(1, 1, 0.6))
        else:
            top = _bottle(m, rng, (0, 0, 0), 1.3, 0.46, (0.2, 0.1), bark=DEAD, ring=DEAD[3])
            for k in range(4):                                             # the splintered break
                a = k * math.tau / 4 + rng.uniform(-0.3, 0.3)
                m.cyl(0.14, rng.uniform(0.3, 0.6), (top.x + math.cos(a) * 0.25, top.y + math.sin(a) * 0.25, top.z - 0.1),
                      DEAD[3], segs=4, r_top=0.0)
            # the fallen top, lying on the sand with its crown
            tube(m, [Vector((0.8, 0.3, 0.35)), Vector((2.6, 1.2, 0.4)), Vector((3.6, 1.6, 0.35))], [0.38, 0.32, 0.26],
                 DEAD[0], segs=6, colors=[DEAD[1], DEAD[0]])
            for k in range(7):
                yaw = k * math.tau / 7
                pts = arc((4.0, 1.8, 0.3), yaw, rng.uniform(1.2, 1.8), 0.05, 0.3, n=2)
                ribbon(m, pts, [0.2, 0.28, 0.18, 0.04], DEAD_LEAF[k % 3], DEAD_LEAF[(k + 2) % 3], fold=0.25, thick=0.05)
            _mound(m, rng, 2.2, 0.6, 1.4, 0.8, 0.3, DUNE)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def mud_house(variants):
    """Scenery, behind the market's stalls: flat-roofed mud houses, their roofs the living room:
    rugs laid out to air, jars, a frond shade, a stair up; one with a little windcatcher of its
    own. About 5 across, 3 tall."""
    for i in range(variants):
        r = root("kessra_mud_house", i)
        rng = random.Random(3840 + i)
        m = Model(f"kessra_mud_house_{i}", 3840 + i)
        H = 2.8 + 0.3 * (i == 2)
        W, D = (4.6, 4.2) if i != 1 else (5.6, 3.6)
        _mud_box(m, (W, D, H), (0, 0, H / 2), rng)
        for (sx, sy, w, d) in ((0, -1, W, 0.3), (0, 1, W, 0.3), (-1, 0, 0.3, D), (1, 0, 0.3, D)):  # the parapet
            m.box((w + 0.05, d + 0.05, 0.45), (sx * (W / 2 - 0.15), sy * (D / 2 - 0.15), H + 0.2), MUD_TOP if sy != 1 else MUD[2])
        m.box((W - 0.5, D - 0.5, 0.06), (0, 0, H + 0.02), "#cc9a6c")       # the roof floor
        _hole(m, -W * 0.22, -D / 2 - 0.04, 1.0, 0.95, 1.9)                    # a door
        m.box((0.9, 0.1, 1.8), (-W * 0.22, -D / 2 - 0.1, 0.95), DOOR if i != 1 else "#a83a2a")
        _hole(m, W * 0.25, -D / 2 - 0.04, 1.9, 0.5, 0.5)
        if i == 0:
            for k in range(2):
                m.box((1.5, 1.0, 0.05), (-0.8 + k * 1.7, 0.4 - k * 0.5, H + 0.08), RUG[k * 2], rot=(0, 0, rng.uniform(-0.2, 0.2)))
                m.box((1.1, 0.12, 0.06), (-0.8 + k * 1.7, 0.4 - k * 0.5, H + 0.1), RUG[(k * 2 + 1) % 4])
            for k in range(3):
                m.cyl(0.25, 0.55, (1.6, 1.3 - k * 0.5, H), POT[k], segs=6, r_top=0.15)
        elif i == 1:
            # a second storey on half of it, a stair up, a frond shade over the low roof
            _mud_box(m, (2.4, D, 1.9), (W / 2 - 1.2, 0, H + 0.95), rng)
            m.box((2.5, D + 0.05, 0.3), (W / 2 - 1.2, 0, H + 1.95), MUD_TOP)
            for k in range(5):
                m.box((0.7, 0.4, 0.3), (-W / 2 - 0.35, -D / 2 + 0.4 + k * 0.45, 0.3 + k * 0.55), MUD[2])
            for k in range(6):
                m.box((0.4, 2.4, 0.06), (-W / 2 + 0.6 + k * 0.42, 0, H + 1.4), FROND[k % 4])
            for sx in (-W / 2 + 0.4, -W / 2 + 2.6):
                for sy in (-1, 1):
                    m.cyl(0.05, 1.4, (sx, sy * 1.05, H), WOOD[2], segs=4)
            m.box((0.9, 0.7, 0.05), (W / 2 - 1.2, 0.5, H + 2.15), RUG[1])
        else:
            # its own small windcatcher, and a blue-tiled band over the door
            t = list(m.box((1.1, 1.1, 2.4), (W / 2 - 0.8, D / 2 - 0.8, H + 1.2), MUD[0]))
            _paint(m, t, MUD_TOP, MUD_SHADE)
            for f in ((0, -1), (-1, 0)):
                m.box((0.7 if f[1] else 0.12, 0.12 if f[1] else 0.7, 0.9),
                      (W / 2 - 0.8 + f[0] * 0.56, D / 2 - 0.8 + f[1] * 0.56, H + 1.9), MUD_DARK)
            m.box((1.3, 1.3, 0.2), (W / 2 - 0.8, D / 2 - 0.8, H + 2.45), MUD_TOP)
            m.box((1.4, 0.14, 0.3), (-W * 0.22, -D / 2 - 0.08, 2.1), TILE[1])
            m.box((1.2, 1.4, 0.05), (-0.8, -0.3, H + 0.08), RUG[3])
            for k in range(4):                                             # sacks of spice drying, bright
                m.ball(0.3, (0.6 + (k % 2) * 0.7, -0.9 + (k // 2) * 0.7, H + 0.15), SPICE[k], subdiv=0, scale=(1, 1, 0.45))
        m.build(r)


def _house(m, rng, x, y, W, D, H, roof="plain", door=True):
    """One flat-roofed mud house in a block: walls, a parapet, the roof floor and what's on it."""
    _mud_box(m, (W, D, H), (x, y, H / 2), rng, jit=0.04)
    m.box((W - 0.4, D - 0.4, 0.06), (x, y, H + 0.02), "#cc9a6c")
    for (sx, sy, w, d) in ((0, -1, W, 0.28), (0, 1, W, 0.28), (-1, 0, 0.28, D), (1, 0, 0.28, D)):
        m.box((w + 0.04, d + 0.04, 0.4), (x + sx * (W / 2 - 0.14), y + sy * (D / 2 - 0.14), H + 0.18), MUD_TOP)
    if door:
        _hole(m, x - W * 0.2, y - D / 2 - 0.04, 0.95, 0.9, 1.8)
        m.box((0.85, 0.1, 1.75), (x - W * 0.2, y - D / 2 - 0.1, 0.9), (DOOR, "#a83a2a", "#3a6a4a")[rng.randrange(3)])
    _hole(m, x + W * 0.22, y - D / 2 - 0.04, H * 0.66, 0.45, 0.45)
    if roof == "rugs":
        for k in range(2):
            m.box((min(1.5, W * 0.4), 0.95, 0.05), (x - W * 0.2 + k * W * 0.38, y + (k - 0.5) * 0.7, H + 0.08), RUG[rng.randrange(4)],
                  rot=(0, 0, rng.uniform(-0.2, 0.2)))
    elif roof == "jars":
        for k in range(3):
            m.cyl(0.24, 0.5, (x + W / 2 - 0.6, y - D / 2 + 0.7 + k * 0.5, H), POT[k], segs=6, r_top=0.14)
        m.box((1.0, 1.2, 0.05), (x - 0.4, y, H + 0.08), RUG[rng.randrange(4)])
    elif roof == "shade":
        for k in range(5):
            m.box((min(2.4, W - 0.6), 0.4, 0.06), (x, y - 0.9 + k * 0.45, H + 1.35), FROND[k % 4])
        for sx in (-1, 1):
            for sy in (-1, 1):
                m.cyl(0.05, 1.35, (x + sx * 1.0, y + sy * 0.95, H), WOOD[2], segs=4)
    elif roof == "spice":
        for k in range(4):
            m.ball(0.3, (x - 0.4 + (k % 2) * 0.7, y - 0.4 + (k // 2) * 0.7, H + 0.15), SPICE[k], subdiv=0, scale=(1, 1, 0.45))
    elif roof == "wind":
        bx, by = x + W / 2 - 0.75, y + D / 2 - 0.75
        t = list(m.box((1.0, 1.0, 2.2), (bx, by, H + 1.1), MUD[0]))
        _paint(m, t, MUD_TOP, MUD_SHADE)
        m.box((0.65, 0.12, 0.8), (bx, by - 0.51, H + 1.7), MUD_DARK)
        m.box((0.12, 0.65, 0.8), (bx - 0.51, by, H + 1.7), MUD_DARK)
        m.box((1.2, 1.2, 0.2), (bx, by, H + 2.25), MUD_TOP)


def house_block(variants):
    """Scenery, the town's fabric behind the market's stalls: a block of mud houses built wall to
    wall, each its own height, round a little court (one with a bluecrown in it), the roofs lived
    on. About 10 across: one prop, a whole corner of the town."""
    plans = [
        # (x, y, W, D, H, roof)
        [(-2.6, -2.2, 4.6, 4.2, 2.8, "rugs"), (2.4, -2.4, 5.0, 3.8, 3.4, "wind"), (-2.9, 2.2, 4.0, 4.6, 3.6, "shade"),
         (2.6, 2.5, 4.4, 3.6, 2.6, "jars")],
        [(-3.0, -1.8, 4.0, 5.2, 3.0, "spice"), (1.0, -3.0, 4.0, 2.8, 2.5, "plain"), (3.4, 0.2, 3.0, 7.2, 3.8, "wind"),
         (-2.4, 3.0, 5.2, 3.0, 2.7, "rugs"), (0.8, 3.4, 2.2, 2.2, 2.2, "jars")],
        [(-3.2, 0.0, 3.6, 9.0, 3.2, "shade"), (1.6, -3.0, 5.6, 3.0, 2.6, "rugs"), (3.0, 1.4, 2.8, 3.6, 3.6, "spice"),
         (0.4, 3.6, 3.0, 2.0, 2.4, "plain")],
    ]
    for i in range(min(variants, len(plans))):
        r = root("kessra_house_block", i)
        rng = random.Random(3900 + i)
        m = Model(f"kessra_house_block_{i}", 3900 + i)
        for k, (x, y, W, D, H, roof) in enumerate(plans[i]):
            _house(m, rng, x, y, W, D, H, roof, door=y < 0 or k == 0)
        # the court between them: beaten earth, a well, a tree or a stair
        m.box((2.4, 2.4, 0.06), (0.0 if i != 2 else 0.4, 0.0 if i != 2 else 0.2, 0.03), "#c49a6c")
        if i == 0:
            top = _bottle(m, rng, (0.1, 0.1, 0), 1.6, 0.26, (0.1, 0.1))
            c = (top.x, top.y, top.z + 0.5)
            _limb(m, top, c, 0.18, 0.14)
            _crown(m, rng, c, 1.6, blades=8, dome=4, lift=0.45)
        elif i == 1:
            m.cyl(0.6, 0.6, (-0.8, 0.6, 0), TILE[2], segs=8)
            m.cyl(0.45, 0.08, (-0.8, 0.6, 0.58), POOL, segs=8)
        else:
            for k in range(4):
                m.box((0.7, 0.45, 0.3), (0.6, -1.1 + k * 0.45, 0.25 + k * 0.5), MUD[2])
        m.build(r)


def wagon(variants):
    """Scenery, in the camp's rings: a caravan's wagon, long along +x, on big iron-shod wheels,
    its hood of striped cloth on hoops (the second open, piled with cargo), the shafts the
    striders are put to lying on the sand."""
    for i in range(variants):
        r = root("kessra_wagon", i)
        rng = random.Random(3920 + i)
        m = Model(f"kessra_wagon_{i}", 3920 + i)
        L, W = 4.2, 1.8
        m.box((L, W, 0.35), (0, 0, 0.95), WOOD[1])
        for sy in (-1, 1):
            m.box((L, 0.14, 0.5), (0, sy * W / 2, 1.3), WOOD[0])
            for sx in (-1, 1):
                m.cyl(0.75, 0.22, (sx * 1.3, sy * (W / 2 + 0.2), 0.75), WOOD[2], segs=10, rot=(math.pi / 2, 0, 0))
                m.cyl(0.2, 0.3, (sx * 1.3, sy * (W / 2 + 0.25), 0.75), IRON[0], segs=6, rot=(math.pi / 2, 0, 0))
        for sy in (-0.45, 0.45):                                           # the shafts, down on the sand
            tube(m, [Vector((L / 2, sy, 0.9)), Vector((L / 2 + 2.4, sy * 0.7, 0.1))], [0.08, 0.07], WOOD[0], segs=4)
        if i < 2:
            a, b = CLOTH[(1, 0)[i]]
            n = 7
            for k in range(n):
                x = -L / 2 + 0.3 + k * (L - 0.6) / (n - 1)
                for j in range(6):                                         # a hood: a half-round of panels
                    t0 = math.pi * j / 6
                    t1 = math.pi * (j + 1) / 6
                    R = W / 2 + 0.1
                    p0 = (x, -math.cos(t0) * R, 1.45 + math.sin(t0) * R)
                    p1 = (x, -math.cos(t1) * R, 1.45 + math.sin(t1) * R)
                    mid = ((p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2)
                    ang = math.atan2(p1[2] - p0[2], p1[1] - p0[1])
                    m.box(((L - 0.6) / (n - 1) + 0.02, math.dist(p0[1:], p1[1:]) + 0.04, 0.08), (x, mid[0], mid[1]),
                          (a, b)[k % 2], rot=(ang, 0, 0))
            m.cyl(0.9, 0.08, (-L / 2 + 0.25, 0, 1.45), MUD_DARK, segs=8, rot=(0, math.pi / 2, 0))
        else:
            for k in range(5):
                m.ball(0.42, (-1.4 + k * 0.7, rng.uniform(-0.35, 0.35), 1.45), SACK[k % 3], subdiv=0, scale=(1, 0.8, 0.7), jitter=0.04)
            for k in range(2):
                m.cyl(0.3, 1.5, (-0.9 + k * 1.6, 0.0, 1.95), RUG[k + 1], segs=6, rot=(math.pi / 2, 0, 0))
            m.cyl(0.32, 0.8, (1.5, 0.4, 1.1), POT[0], segs=6, r_top=0.2)
        m.build(r)


def caravanserai(variants):
    """Landmark: the caravanserai, where the caravans put up: a square of rooms round a courtyard
    with a pool and a tree in it, a tall portal on the road side, round towers at the corners,
    the roofs piled with cargo. 18 across, 6 at the portal's top."""
    for i in range(variants):
        r = root("kessra_caravanserai", i)
        rng = random.Random(3860 + i)
        m = Model(f"kessra_caravanserai_{i}", 3860 + i)
        S = 18.0
        T = 3.6
        H = 3.4
        # the four ranges of rooms (the front one either side of the portal)
        for (x, y, w, d) in ((0, S / 2 - T / 2, S, T), (-(S / 2 - T / 2), 0, T, S - 2 * T), (S / 2 - T / 2, 0, T, S - 2 * T)):
            _mud_box(m, (w, d, H), (x, y, H / 2), rng)
            m.box((w - 0.4, d - 0.4, 0.06), (x, y, H + 0.02), "#cc9a6c")
        for s in (-1, 1):
            w = S / 2 - 2.0
            _mud_box(m, (w, T, H), (s * (1.9 + w / 2), -(S / 2 - T / 2), H / 2), rng)
            m.box((w - 0.4, T - 0.4, 0.06), (s * (1.9 + w / 2), -(S / 2 - T / 2), H + 0.02), "#cc9a6c")
        # parapets, outer and inner
        for k in range(4):
            a = k * math.pi / 2
            for (R, c) in ((S / 2 - 0.1, MUD_TOP), (S / 2 - T + 0.1, MUD[2])):
                L = 2 * R
                cx, cy = math.cos(a) * R, math.sin(a) * R
                m.box((0.25 if k % 2 == 0 else L, L if k % 2 == 0 else 0.25, 0.4), (cx, cy, H + 0.2), c)
        # the arcade round the courtyard: dark arched doorways on each inner face
        inner = S / 2 - T
        for k in range(4):
            a = k * math.pi / 2
            nx, ny = math.cos(a), math.sin(a)
            for j in range(-2, 3):
                if k == 3 and j == 0:
                    continue
                t = j * 2.2
                x = nx * (inner + 0.03) - ny * t
                y = ny * (inner + 0.03) + nx * t
                m.box((1.2 if ny else 0.12, 0.12 if ny else 1.2, 1.8), (x, y, 1.0), MUD_DARK)
        # the courtyard: paving, a pool, a bluecrown, striders' troughs, cargo
        m.box((2 * inner, 2 * inner, 0.08), (0, 0, 0.04), "#d8b88a")
        for k in range(8):
            a = k * math.tau / 8
            m.box((0.9, 0.5, 0.35), (math.cos(a) * 1.9, math.sin(a) * 1.9, 0.18), TILE[2], rot=(0, 0, a + math.pi / 2))
        m.cyl(1.7, 0.12, (0, 0, 0.2), POOL, segs=8)
        m.cyl(1.0, 0.13, (0, 0, 0.22), POOL_DEEP, segs=8)
        top = _bottle(m, rng, (2.6, 2.4, 0), 1.9, 0.3, (0.2, 0.1))
        c = (top.x, top.y, top.z + 0.6)
        _limb(m, top, c, 0.2, 0.15)
        _crown(m, rng, c, 1.9, blades=8, dome=5, lift=0.5)
        for k in range(4):
            m.ball(0.45, (-3.0 + (k % 2) * 0.8, 2.6 - (k // 2) * 0.7, 0.35), SACK[k % 3], subdiv=0, scale=(1, 0.8, 0.7), jitter=0.04)
        for k in range(3):
            m.cyl(0.32, 1.6, (-3.2, -1.6 + k * 0.7, 0.35), RUG[k], segs=6, rot=(0, math.pi / 2, 0))
        # cargo on the roofs, rugs airing
        for k in range(6):
            a = rng.uniform(0, math.tau)
            R = S / 2 - T / 2
            side = rng.randrange(4)
            t = rng.uniform(-S / 2 + 2.5, S / 2 - 2.5)
            x, y = [(R, t), (-R, t), (t, R), (t, -R)][side]
            if side == 3 and abs(t) < 3:
                continue
            if k % 2:
                m.box((1.4, 1.0, 0.05), (x, y, H + 0.08), RUG[k % 4], rot=(0, 0, rng.uniform(-0.3, 0.3)))
            else:
                for j in range(3):
                    m.ball(0.38, (x + (j - 1) * 0.6, y, H + 0.3), SACK[j], subdiv=0, scale=(1, 0.8, 0.7))
        # the corner towers
        for sx in (-1, 1):
            for sy in (-1, 1):
                t = list(m.cyl(1.3, H + 1.0, (sx * S / 2, sy * S / 2, 0), MUD[1], segs=9, r_top=1.15))
                _paint(m, t, MUD_TOP, MUD_SHADE)
                m.cyl(1.25, 0.3, (sx * S / 2, sy * S / 2, H + 1.0), MUD_TOP, segs=9)
        # the portal, tall, tiled, its pointed arch dark, on the road side (-y)
        _mud_box(m, (5.4, 2.6, 6.0), (0, -S / 2 + 0.6, 3.0), rng)
        m.box((5.5, 2.7, 0.35), (0, -S / 2 + 0.6, 6.1), MUD_TOP)
        m.box((4.6, 0.2, 0.5), (0, -S / 2 - 0.75, 5.4), TILE[1])
        m.box((4.2, 0.2, 0.25), (0, -S / 2 - 0.75, 4.95), TILE[0])
        m.prism([(-1.3, 0), (1.3, 0), (1.3, 3.0), (0, 4.2), (-1.3, 3.0)], 0.3, (0, -S / 2 - 0.65, 0.05), MUD_DARK)
        m.box((1.2, 0.1, 2.8), (-0.65, -S / 2 - 0.85, 1.45), DOOR, rot=(0, 0, 0.6))
        m.build(r)


def bales(variants):
    """Detail, round the stalls and in the camp: a caravan's cargo set down: sacks, rolled rugs,
    jars in straw, a crate or two."""
    for i in range(variants):
        r = root("kessra_bales", i)
        rng = random.Random(3880 + i)
        m = Model(f"kessra_bales_{i}", 3880 + i)
        if i == 0:
            for k in range(6):
                x, y = (k % 3) * 0.8 - 0.8, (k // 3) * 0.75 - 0.35
                m.ball(0.48, (x, y, 0.38), SACK[k % 3], subdiv=0, scale=(1, 0.8, 0.75), jitter=0.04)
            for k in range(2):
                m.ball(0.45, (-0.4 + k * 0.8, 0, 0.98), SACK[(k + 1) % 3], subdiv=0, scale=(1, 0.8, 0.7), jitter=0.04)
        elif i == 1:
            for k in range(4):
                m.cyl(0.36, 2.0, (-1.0, -0.8 + k * 0.6, 0.36), RUG[k], segs=6, rot=(0, math.pi / 2, 0))
            for k in range(2):
                m.cyl(0.34, 1.8, (-0.9, -0.5 + k * 0.6, 1.0), RUG[(k + 2) % 4], segs=6, rot=(0, math.pi / 2, 0))
            m.box((1.0, 1.0, 0.8), (1.6, 0.2, 0.4), WOOD[1])
            m.box((1.02, 0.15, 0.82), (1.6, 0.2, 0.4), WOOD[2])
        else:
            for k in range(7):
                a = k * math.tau / 7
                d = 0.0 if k == 0 else 0.85
                h = rng.uniform(0.8, 1.1)
                x, y = math.cos(a) * d, math.sin(a) * d
                m.cyl(0.35, h * 0.6, (x, y, 0), POT[k % 3], segs=7, r_top=0.46)
                m.cyl(0.46, h * 0.4, (x, y, h * 0.6), POT[k % 3], segs=7, r_top=0.2)
            for k in range(5):
                a = k * math.tau / 5 + 0.3
                m.ball(0.35, (math.cos(a) * 1.5, math.sin(a) * 1.5, 0.12), FROND[k % 4], subdiv=0, scale=(1.4, 1, 0.35))
        m.build(r, rot_z=rng.uniform(0, math.tau))


def build():
    leviathan(2)
    salt_arch(2)
    salt_crystal(3)
    salt_ridge(3)
    salt_cache(2)
    land_yacht(2)
    rock_bridge(2)
    rope_bridge(2)
    race_gantry(2)
    hoodoo(4)
    ironscrub(3)
    race_debris(3)
    scree(4)
    brush(4)
    deadwood(2)
    spire(3)
    depot(2)
    boulder(8)
    tyre_wall(2)
    turn_board(2)
    grandstand(2)
    colossus(2)
    henge(2)
    obelisk_span(2)
    glyph_slab(3)
    stele(4)
    lattice_node(2)
    sandcrawler(2)
    sunsails(2)
    aqueduct(2)
    bluecrown(3)
    brine_reed(3)
    brine_mat(4)
    bladder_bush(3)
    cistern_rosette(3)
    seep(2)
    oasis_grove(1)
    market_stall(3)
    salt_stack(6)
    salt_tower(3)
    salt_cone(3)
    salt_blocks(3)
    kehx_vent(3)
    brine_pump(1)
    sluice(2)
    works_shed(2)
    caravan_wreck(3)
    toll_hut(1)
    qanat_shaft(4)
    sand_fence(2)
    garden_wall(3)
    garden_tower(2)
    windcatcher(2)
    noria(1)
    dead_crown(2)
    mud_house(3)
    house_block(3)
    caravanserai(1)
    wagon(3)
    bales(3)
    # the Monolith Field's beacons, faces and counts (set_kessra_monoliths.py)
    import set_kessra_monoliths
    set_kessra_monoliths.build()
