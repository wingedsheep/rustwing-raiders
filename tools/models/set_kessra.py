"""KESSRA's set pieces: a leviathan's bones on the salt, bridges over the mesa run,
the henges and the fallen colossus of the vanished people, the oasis's crawler and aqueduct; and
the scenery that keeps each place from being one prop repeated (salt crystals, hoodoos, glyph slabs,
fan palms, market stalls)."""
from __future__ import annotations

import math
import random

from mathutils import Vector

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
            # grown at the lip of a little brine pool
            deep, shallow = BRINE[0]
            m.cyl(2.6, 0.8, (3.0, 0.4, -0.4), SALT[1], segs=9, r_top=2.3)
            m.cyl(2.0, 0.12, (3.0, 0.4, 0.36), shallow, segs=9)
            m.cyl(1.2, 0.1, (3.0, 0.4, 0.42), deep, segs=8)
        m.build(r, rot_z=rng.uniform(0, math.tau))


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
    and lamps, rusted to the colour of the rock."""
    r = root("kessra_race_gantry", 0)
    rng = random.Random(3240)
    m = Model("kessra_race_gantry_0", 3240)
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
    m.box((84, 2.6, 0.2), (0, 0, 18.8), IRON[0])                          # a catwalk on top
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
        m.ball(0.42, (x, -2.1, 13.5), ("#ff3a2a", LAMP, "#4aff6a")[k % 3], subdiv=1, glow=True)
    for k in range(12):                                                    # tattered banners
        x = -38 + k * 6.9
        if abs(x) < 8:
            continue
        m.prism([(-0.9, 0), (0.9, 0), (0.6, -1.0), (0, -0.6), (-0.6, -1.0)], 0.1, (x, 2.0, 14.0), FLAGS[k % 4])
    m.build(r)


def hoodoo(variants):
    """Scenery: hoodoo stacks, thin necks of soft rock under hard caps (under the flight line)."""
    for i in range(3):
        r = root("kessra_hoodoo", i)
        rng = random.Random(3260 + i)
        m = Model(f"kessra_hoodoo_{i}", 3260 + i)
        fs = []
        spots = [(0, 0, 6.4)] if i == 0 else ([(0, 0, 5.2), (2.0, 0.8, 3.8), (-1.2, 1.6, 2.8)] if i == 1 else
                                            [(0, 0, 4.8), (1.6, -0.4, 6.0)])
        for k, (x, y, h) in enumerate(spots):
            n = 5
            layers = []
            z = -0.3
            for j in range(n):
                z1 = -0.3 + (h - 0.8) * (j + 1) / n
                w0 = 1.2 - 0.12 * j + 0.25 * (j % 2)
                w1 = 1.1 - 0.12 * (j + 1)
                layers.append((z, z1, w0 * (0.9 + 0.1 * k), w1 * (0.9 + 0.1 * k)))
                z = z1
            f, top = _stack(m, rng, x, y, layers, sides=7, jit=0.16, drift=(0.06, 0.04), colors=MESA)
            fs += f
            cap, _ = _stack(m, rng, top[0], top[1], [(h - 0.8, h - 0.1, 1.0, 1.5), (h - 0.1, h + 0.4, 1.5, 1.2)], sides=7,
                            jit=0.15, colors=["#7a5a4a", "#8a6a54"])
            fs += cap
        _bands(m, fs, -0.3, 0.7, MESA, top=MESA_TOP)
        for k in range(4):
            a = rng.uniform(0, math.tau)
            t = lump(m, rng, (math.cos(a) * 2.0, math.sin(a) * 2.0, 0.1), (0.7, 0.6, 0.5), MESA[k % 5], n=8, flat=0.5)
            _paint(m, t, MESA_TOP)
        m.build(r, rot_z=rng.uniform(0, math.tau))


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


def _palm(m, c, rng, base, top_pts_n, lean, R, fronds, L, W, leaf=PALM_LEAF, rise=0.3, droop=0.6):
    pts = bend(base, (base[0], base[1], base[2] + top_pts_n), lean, n=8)
    tube(m, pts, [R * (1.3 - 0.4 * k / 8) for k in range(9)], PALM_BARK[0], segs=7,
         colors=[PALM_BARK[k % 3] for k in range(8)])
    top = pts[-1]
    turn = rng.uniform(0, math.tau)
    for k in range(fronds):
        yaw = turn + k * math.tau / fronds + rng.uniform(-0.15, 0.15)
        c1, c2 = leaf[k % len(leaf)]
        frond(c, tuple(top), yaw, L * rng.uniform(0.85, 1.05), W, c1, c2, rise=rise, droop=droop, n=8, serrate=0.55,
              fold=0.45)
    for k in range(6):
        a = turn + k * math.tau / 6
        c.ball(R * 0.45, (top.x + math.cos(a) * R * 0.8, top.y + math.sin(a) * R * 0.8, top.z - R * 0.7), DATES, subdiv=0)
    c.ball(R * 0.9, tuple(top), PALM_BARK[1], subdiv=1)
    return top


def palm_canopy(variants):
    """Span: giant blue palms leaning in from both banks, their crowns meeting over the field, a
    string of lanterns slung between them. Fronds kept over 13."""
    for i in range(2):
        r = root("kessra_palm_canopy", i)
        rng = random.Random(3420 + i)
        m = Model(f"kessra_palm_canopy_{i}_trunks", 3420 + i)
        c = Model(f"kessra_palm_canopy_{i}_crowns", 3430 + i)
        palms = [(-42, 0, 17.5, (20, -1.0)), (42, 1.0, 17.0, (-20, 1.5))]
        if i == 1:
            palms = [(-43, -3.0, 16.5, (14, 2.0)), (-40, 4.0, 18.0, (30, -3.0)), (43, -1.0, 17.0, (-18, 3.0))]
        tops = []
        for x, y, h, lean in palms:
            tops.append(_palm(m, c, rng, (x, y, -2.0), h + 2.0, lean, 1.5, 11, 13.0, 1.8, rise=0.22, droop=0.5))
            m.cyl(2.4, 1.2, (x, y, -2.2), PALM_BARK[2], segs=7, r_top=1.8)
            collider(r, x, y, 2.0)
            for k in range(5):                                             # roots
                a = k * math.tau / 5
                tube(m, [Vector((x, y, 0.5)), Vector((x + math.cos(a) * 2.6, y + math.sin(a) * 2.6, -0.5))], [0.6, 0.2],
                     PALM_BARK[2], segs=5)
        # lanterns on a rope from crown to crown
        for a, b in zip(tops, tops[1:]):
            pts = []
            for k in range(13):
                t = k / 12
                p = a.lerp(b, t)
                p.z -= 2.0 * math.sin(math.pi * t) + 0.6
                pts.append(p)
            tube(c, pts, [0.14] * 13, ROPE, segs=4)
            for k in range(1, 12, 2):
                p = pts[k]
                c.box((0.12, 0.12, 0.5), (p.x, p.y, p.z - 0.3), ROPE)
                c.ball(0.5, (p.x, p.y, p.z - 0.8), (LAMP, "#ff7a4a", POOL_GLOW)[k % 3], subdiv=1, glow=True,
                       scale=(1, 1, 1.3))
        m.build(r)
        crowns = c.build(r)
        # (a tiny sway: they're big, and pivot on the origin)
        sway(crowns, f"kessra_palm_canopy_{i}_sway_idle", amp=(0.004, 0.004), period=4.0, phase=i)


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


def fan_palm(variants):
    """Scenery: fan palms, green-teal against the blue ones, and a cluster of young date palms."""
    for i in range(3):
        r = root("kessra_fan_palm", i)
        rng = random.Random(3460 + i)
        m = Model(f"kessra_fan_palm_{i}", 3460 + i)
        if i < 2:
            trunks = [(0, 0, 4.2, (0.6, 0.2))] if i == 0 else [(0, 0, 4.6, (0.9, 0.3)), (0.8, 0.6, 3.2, (-0.6, 1.0)),
                                                           (-0.7, 0.5, 2.4, (-0.9, -0.6))]
            for x, y, h, lean in trunks:
                pts = bend((x, y, 0), (x, y, h), lean, n=5)
                tube(m, pts, [0.4, 0.34, 0.3, 0.3, 0.3, 0.32], PALM_BARK[1], segs=6, colors=[PALM_BARK[k % 3] for k in range(5)])
                top = pts[-1]
                n = 9
                turn = rng.uniform(0, math.tau)
                for k in range(n):
                    yaw = turn + k * math.tau / n
                    # a fan: a stiff stalk out, then a wide pleated blade
                    p0 = Vector(top)
                    p1 = p0 + Vector((math.cos(yaw) * 0.9, math.sin(yaw) * 0.9, 0.5))
                    p2 = p1 + Vector((math.cos(yaw) * 1.6, math.sin(yaw) * 1.6, -0.1))
                    p3 = p2 + Vector((math.cos(yaw) * 0.6, math.sin(yaw) * 0.6, -0.5))
                    c1, c2 = FAN_LEAF[k % 2]
                    ribbon(m, [p0, p1, p2, p3], [0.08, 0.32, 0.5, 0.12], c1, c2, fold=0.5, thick=0.06)
                m.ball(0.42, tuple(top), PALM_BARK[2], subdiv=0)
        else:
            # a squat bush of palm, with a hang of orange fruit
            for k in range(14):
                yaw = k * math.tau / 14 + rng.uniform(-0.2, 0.2)
                c1, c2 = FAN_LEAF[k % 2]
                frond(m, (0, 0, 0.3), yaw, rng.uniform(1.8, 2.6), 0.4, c1, c2, rise=1.1, droop=1.2, n=6, serrate=0.5)
            for k in range(5):
                a = rng.uniform(0, math.tau)
                m.ball(0.22, (math.cos(a) * 0.4, math.sin(a) * 0.4, 0.6), DATES, subdiv=0)
        obj = m.build(r, rot_z=rng.uniform(0, math.tau))
        sway(obj, f"kessra_fan_palm_{i}_sway_idle", amp=(0.04, 0.03), period=3.2 + i * 0.3, phase=i)


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


def build():
    leviathan(2)
    salt_arch(2)
    salt_crystal(3)
    rock_bridge(2)
    rope_bridge(2)
    race_gantry(1)
    hoodoo(3)
    colossus(2)
    henge(2)
    obelisk_span(2)
    glyph_slab(3)
    sandcrawler(2)
    palm_canopy(2)
    aqueduct(2)
    fan_palm(3)
    market_stall(3)
