"""MIREFALL, the Drowned Temple: the Tonkva's grow-house on Morang (docs/level-design.md, its layout
row). The Tonkva raised their white mould here, in ziggurats of the ceramic it lays down, and laid
everything out the way they kept their books: exact, level, a lamp at every station (they were
moth-like, and gathered round warmth like moths round a lamp). Then the Engine stopped, the swamp
rose over the lower courts, the mould went wild and violet, and the grow-heart tore itself out of
the temple's crown. The Rang live on its steps now, in reed huts on stilts, and pole their punts
between the drowned columns.

So two hands again: the Tonkva's pale ceramic, square and true, and the bloom's violet curves
taking it back; and the Rang's warm little lights. Built into set_mirefall (see its build())."""
from __future__ import annotations

import math
import random

from mathutils import Vector

from kit import Model, light
from props_a_lib import collider, lump, recolor, root, tube

# the grown ceramic: bone-white, a little warm, glazed; its shade lilac under the giant's light
CER = ["#d2c8be", "#c4bab2", "#dcd3c8"]
CER_TOP = "#eee6dc"
CER_DARK = "#8a8090"
# a band of grown glass let into it, celadon, dull (never a lit speck)
GLAZE = "#7aa89a"
GLAZE_DARK = "#4e7a70"
# the Tonkva's lamps: a warm hearth, low
HEARTH = "#ffc27a"
EMBER = "#e08a4a"
SOOT = "#3a3036"
# the bloom: violet sponge, lilac where it's lit, swollen sacs
BLOOM = ["#4e3070", "#5c3a82", "#44295e"]
BLOOM_TOP = "#8a68b8"
SAC = ["#7a3a8a", "#8e4a9e"]
SAC_TOP = "#c07ad0"
# a root of it torn: violet skin, a pale core
ROOT = ["#5a3a78", "#4a2e66", "#6a4888"]
CORE = "#e8dcf0"
# old moss on the stone
MOSS = ["#5e7448", "#6a8250"]
MOSS_TOP = "#8ea468"
# the Rang's things: reed thatch, dark wood, cloth dyed with bloom-rust
THATCH = ["#a08a5e", "#907c54", "#ac9668"]
THATCH_TOP = "#cdb684"
WOOD = ["#5a4636", "#6a5442", "#4c3a2e"]
WOOD_TOP = "#8a7058"
CLOTH = ["#a85a44", "#8a4e7a", "#c08a4a"]
LAMP = "#ffb86a"
# greened bronze
BRONZE = ["#4a7a68", "#3e6a5a", "#568876"]
BRONZE_TOP = "#86b49e"
BRONZE_DARK = "#24403a"


def _shade(m, faces, top, dark=None, dot=0.7, sun=(-0.4, -0.5, 0.3), dark_dot=-0.35):
    """The tops lit, the faces turned from the light in shade."""
    L = Vector(sun).normalized()
    for f in faces:
        if f.is_valid:
            f.normal_update()

    def fn(f):
        if top and f.normal.z > dot:
            return top
        if dark and f.normal.dot(L) < dark_dot:
            return dark
        return None
    recolor(m, faces, fn)


def _drum_column(m, rng, x, y, h, R=0.55, capital=True, lean=(0.0, 0.0)):
    """A column of ceramic drums on a square plinth, a band of glaze under its capital."""
    fs = list(m.box((R * 2.7, R * 2.7, 0.45), (x, y, 0.2), CER[1]))
    n = max(1, int(h / 0.95))
    top = h - (0.5 if capital else 0.0)
    for k in range(n):
        z0 = 0.42 + k * (top - 0.42) / n
        dz = (top - 0.42) / n
        t = (k + 0.5) / n
        fs += m.cyl(R * (1.0 - 0.06 * t), dz - 0.06, (x + lean[0] * t * h, y + lean[1] * t * h, z0), CER[k % 3], segs=8,
                    rot=(0, 0, rng.uniform(0, 1)))
    cx, cy = x + lean[0] * h, y + lean[1] * h
    if capital:
        m.cyl(R * 1.05, 0.16, (cx, cy, top - 0.1), GLAZE, segs=8)
        fs += list(m.box((R * 2.6, R * 2.6, 0.42), (cx, cy, top + 0.21), CER[2]))
        fs += list(m.box((R * 2.0, R * 2.0, 0.2), (cx, cy, top + 0.5), CER[0]))
    else:
        for k in range(4):                                                 # the snapped end
            a = k * math.tau / 4 + rng.uniform(-0.4, 0.4)
            m.box((0.34, 0.3, rng.uniform(0.15, 0.4)), (cx + math.cos(a) * R * 0.55, cy + math.sin(a) * R * 0.55, top + 0.05),
                  CER[k % 3], rot=(0, 0, a), taper=0.5)
    return fs


def _blooms(m, rng, x, y, z, n=4, spread=0.8, sacs=True):
    """The bloom taking hold: a clutch of violet sponge, a sac or two swelling out of it."""
    fs = []
    for k in range(n):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0, spread)
        R = rng.uniform(0.35, 0.6)
        fs += list(m.ball(R, (x + math.cos(a) * d, y + math.sin(a) * d, z + R * 0.3), BLOOM[k % 3], subdiv=1,
                          scale=(1.2, 1.0, 0.6), jitter=0.05))
    _shade(m, fs, BLOOM_TOP, None, dot=0.75)
    if sacs:
        for k in range(max(1, n // 3)):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0, spread * 0.7)
            R = rng.uniform(0.28, 0.4)
            sf = m.ball(R, (x + math.cos(a) * d, y + math.sin(a) * d, z + R * 0.9), SAC[k % 2], subdiv=1, scale=(1, 1, 0.9))
            _shade(m, sf, SAC_TOP, None, dot=0.8)


def _moss(m, rng, x, y, z, R):
    fs = m.ball(R, (x, y, z), MOSS[rng.randrange(2)], subdiv=1, scale=(1.3, 1.0, 0.28), jitter=0.04)
    _shade(m, fs, MOSS_TOP, None, dot=0.85)


def _antenna(m, side, base, length, rise, width, color, comb=5):
    """A Tonkva crest: a feathered moth's antenna in ceramic, sweeping up and out to one side:
    a curved spine with a comb of flat teeth along its outer edge."""
    bx, by, bz = base
    pts = []
    for k in range(6):
        t = k / 5
        pts.append(Vector((bx + side * length * t, by - 0.15 * length * t * t, bz + rise * math.sin(t * math.pi * 0.62))))
    fs = tube(m, pts, [width * (1 - 0.45 * k / 5) for k in range(6)], color, segs=5)
    for k in range(comb):
        t = (k + 1) / (comb + 1)
        i = min(4, int(t * 5))
        p = pts[i].lerp(pts[i + 1], t * 5 - i)
        tooth = width * (1.9 - 0.9 * t)
        fs += list(m.box((0.16, tooth * 2.2, 0.16 + tooth * 0.9), (p.x + side * 0.05, p.y + tooth * 0.9, p.z + tooth * 0.35), color,
                         rot=(0.5, 0, side * 0.2)))
    return fs


# --- the lamps --------------------------------------------------------------------------------

def hearth_lamp(variants):
    """A Tonkva hearth-lamp, one to every station of the way: a square shaft on a plinth, a bowl at
    its head where the warmth was kept, and two feathered crests sweeping up from it like a moth's
    antennae. Lit (the Rang keep a few burning), dark, or snapped off with its head in the mud."""
    for i in range(variants):
        rng = random.Random(7100 + i)
        r = root("mirefall_hearth_lamp", i)
        m = Model(f"mirefall_hearth_lamp_{i}", 7100 + i)
        fs = []
        fs += list(m.box((1.6, 1.6, 0.5), (0, 0, 0.2), CER[1]))
        fs += list(m.box((1.25, 1.25, 0.35), (0, 0, 0.6), CER[0]))
        if i < 2:
            fs += list(m.box((0.72, 0.72, 3.4), (0, 0, 2.4), CER[2], taper=0.8))
            m.box((0.78, 0.78, 0.22), (0, 0, 1.6), GLAZE)
            m.box((0.66, 0.66, 0.2), (0, 0, 3.4), GLAZE)
            fs += m.cyl(0.42, 0.35, (0, 0, 4.05), CER[1], segs=6, r_top=0.7)
            fs += m.cyl(0.85, 0.3, (0, 0, 4.4), CER[0], segs=8, r_top=0.95)
            for s in (-1, 1):
                fs += _antenna(m, s, (s * 0.5, 0.2, 4.5), 1.6, 1.2, 0.17, CER[2])
            if i == 0:
                m.cyl(0.72, 0.08, (0, 0, 4.66), HEARTH, segs=8, glow=True)
                m.cyl(0.4, 0.1, (0, 0, 4.7), "#fff0c8", segs=6, glow=True)
                light(r, (0, 0, 5.4), HEARTH, radius=5.0, intensity=0.8, flicker=0.15)
            else:
                m.cyl(0.72, 0.06, (0, 0, 4.66), SOOT, segs=8)
                _blooms(m, rng, 0.3, -0.2, 4.6, n=3, spread=0.4, sacs=False)
            _moss(m, rng, 0.4, 0.3, 0.75, 0.6)
        else:
            # snapped at the glaze band; the head lies beside it, a crest in the air
            fs += list(m.box((0.72, 0.72, 1.5), (0, 0, 1.45), CER[2]))
            for k in range(3):
                a = k * math.tau / 3 + 0.4
                m.box((0.3, 0.3, 0.3), (math.cos(a) * 0.25, math.sin(a) * 0.25, 2.25), CER[k], rot=(0, 0, a), taper=0.4)
            fs += list(m.box((0.7, 2.0, 0.7), (1.6, 0.4, 0.35), CER[0], rot=(0, 0, 0.3)))
            fs += m.cyl(0.85, 0.3, (2.2, 2.0, 0.4), CER[1], segs=8, r_top=0.95, rot=(1.2, 0, 0.4))
            fs += _antenna(m, 1, (2.4, 2.3, 0.5), 1.5, 0.9, 0.17, CER[2])
            _blooms(m, rng, 0.9, -0.6, 0.6, n=5, spread=0.9)
        _shade(m, fs, CER_TOP, CER_DARK)
        m.build(r)


def lamp_pylon(variants):
    """The water-gate: two great hearth-lamps either side of the way in, taller than you fly, their
    crests spread wide above you. One kept lit by the Rang; one gone dark, the bloom up its shaft."""
    for i in range(variants):
        rng = random.Random(7150 + i)
        r = root("mirefall_lamp_pylon", i)
        m = Model(f"mirefall_lamp_pylon_{i}", 7150 + i)
        fs = []
        fs += list(m.box((4.2, 4.2, 1.4), (0, 0, -0.2), CER[1]))
        fs += list(m.box((3.2, 3.2, 0.8), (0, 0, 0.9), CER[0]))
        for k in range(4):                                                 # the shaft, in courses
            w = 2.0 - k * 0.22
            fs += list(m.box((w, w, 2.6), (0, 0, 1.3 + 2.7 * k + 1.3), CER[k % 3], taper=0.93))
            m.box((w + 0.1, w + 0.1, 0.25), (0, 0, 1.3 + 2.7 * k + 2.65), GLAZE)
        fs += m.cyl(0.9, 0.8, (0, 0, 12.1), CER[1], segs=6, r_top=1.5)
        fs += m.cyl(1.8, 0.6, (0, 0, 12.9), CER[0], segs=8, r_top=2.0)
        for s in (-1, 1):
            fs += _antenna(m, s, (s * 1.0, 0.4, 13.2), 4.4, 3.4, 0.4, CER[2], comb=7)
        if i == 0:
            m.cyl(1.6, 0.1, (0, 0, 13.45), HEARTH, segs=8, glow=True)
            m.cyl(0.9, 0.14, (0, 0, 13.5), "#fff0c8", segs=6, glow=True)
            light(r, (0, 0, 14.5), HEARTH, radius=9.0, intensity=1.0, flicker=0.12)
            for k in range(3):                                             # the Rang's offerings on the plinth
                a = k * 2.0 + 0.5
                m.cyl(0.25, 0.4, (math.cos(a) * 1.4, math.sin(a) * 1.4, 1.3), CLOTH[k], segs=5)
        else:
            m.cyl(1.6, 0.1, (0, 0, 13.45), SOOT, segs=8)
            for k in range(5):                                             # the bloom climbing it
                _blooms(m, rng, rng.uniform(-0.9, 0.9), -1.1, 1.5 + k * 2.0, n=3, spread=0.5, sacs=k % 2 == 0)
        _moss(m, rng, 1.2, 1.0, 1.35, 1.0)
        _shade(m, fs, CER_TOP, CER_DARK)
        m.build(r)
        collider(r, 0, 0, 1.2)


# --- the stones -------------------------------------------------------------------------------

def column(variants):
    """A column of the old halls: whole to its capital; broken at a drum; a stump, its drums lying
    by it; fallen in a line of drums, its capital at the end (lying along +x)."""
    for i in range(variants):
        rng = random.Random(7200 + i)
        r = root("mirefall_column", i)
        m = Model(f"mirefall_column_{i}", 7200 + i)
        fs = []
        if i == 0:
            fs += _drum_column(m, rng, 0, 0, 4.8)
            _moss(m, rng, 0.2, 0.1, 5.4, 0.55)
        elif i == 1:
            fs += _drum_column(m, rng, 0, 0, 2.7, capital=False)
            fs += m.cyl(0.55, 0.85, (1.2, 0.5, 0.55), CER[0], segs=8, rot=(math.pi / 2, 0, 0.7))
            _blooms(m, rng, -0.5, -0.6, 0.4, n=3, spread=0.5)
        elif i == 2:
            fs += _drum_column(m, rng, 0, 0, 1.2, capital=False)
            for k in range(2):
                fs += m.cyl(0.55, 0.85, (1.0 + k * 1.0, -0.6 + k * 0.5, 0.55), CER[k % 3], segs=8, rot=(math.pi / 2, 0, 1.2 + k * 0.6))
            _moss(m, rng, -0.4, 0.6, 0.4, 0.7)
        else:
            fs += list(m.box((1.5, 1.5, 0.45), (0, 0, 0.2), CER[1]))
            for k in range(4):
                fs += m.cyl(0.55, 0.85, (0.9 + k * 0.95, rng.uniform(-0.08, 0.08), 0.5), CER[k % 3], segs=8,
                            rot=(0, math.pi / 2, rng.uniform(0, 1)))
            fs += list(m.box((1.45, 1.45, 0.42), (4.9, 0.1, 0.65), CER[2], rot=(0, 1.3, 0.2)))
            _blooms(m, rng, 2.4, 0.7, 0.2, n=4, spread=0.7)
        _shade(m, fs, CER_TOP, CER_DARK)
        m.build(r)


def shrine(variants):
    """A hearth-shrine at a terrace's corner, open to the sky: a stepped platform, two walls meeting
    at the corner with a cornice of glaze, a column at each free end, and in the corner the hearth
    in its bowl, a crest over it (the Rang keep one lit). The corner points to -x, -y; it opens to
    +x, +y."""
    for i in range(variants):
        rng = random.Random(7250 + i)
        r = root("mirefall_shrine", i)
        m = Model(f"mirefall_shrine_{i}", 7250 + i)
        fs = []
        for k in range(2):                                                 # the platform, two steps
            w = 5.2 - k * 0.8
            fs += list(m.box((w, w, 0.3), (0.5 - k * 0.4 + 0.4, 0.5 - k * 0.4 + 0.4, 0.15 + k * 0.3), CER[k]))
        hw = 2.2 if i == 0 else 1.2
        for (sx, sy, lx, ly) in ((0.3, -1.4, 4.2, 0.8), (-1.4, 0.3, 0.8, 4.2)):
            fs += list(m.box((lx, ly, hw), (sx, sy, 0.6 + hw / 2), CER[2]))
            if i == 0:
                fs += list(m.box((lx + 0.3, ly + 0.3, 0.3), (sx, sy, 0.6 + hw + 0.15), CER[0]))
                m.box((lx + 0.1, ly + 0.1, 0.16), (sx, sy, 0.6 + hw - 0.2), GLAZE)
        if i == 0:
            for (x, y) in ((2.2, -1.4), (-1.4, 2.2)):
                fs += _drum_column(m, rng, x, y, 2.6, R=0.42)
        else:
            fs += _drum_column(m, rng, 2.2, -1.4, 1.6, R=0.42, capital=False)
            for k in range(3):
                fs += list(m.box((1.1, 0.9, 0.55), (-1.0 + k * 0.6, 1.6 + k * 0.7, 0.8), CER[k], rot=(0.25, 0.1, k)))
            _blooms(m, rng, 1.2, 1.4, 0.6, n=5, spread=1.0)
        # the hearth in the corner: its bowl, the crest over it
        fs += m.cyl(0.45, 0.8, (0.4, 0.4, 0.6), CER[1], segs=6, r_top=0.6)
        fs += m.cyl(0.6, 0.35, (0.4, 0.4, 1.4), CER[0], segs=6, r_top=0.9)
        if i == 0:
            m.cyl(0.78, 0.08, (0.4, 0.4, 1.76), HEARTH, segs=6, glow=True)
            m.cyl(0.38, 0.1, (0.4, 0.4, 1.8), "#fff0c8", segs=6, glow=True)
            light(r, (0.4, 0.4, 2.6), HEARTH, radius=3.5, intensity=0.6, flicker=0.2)
        else:
            m.cyl(0.78, 0.06, (0.4, 0.4, 1.76), SOOT, segs=6)
        fs += _antenna(m, 1, (-1.0, -1.2, 0.6 + hw + 0.3), 1.2, 0.7, 0.15, CER[2], comb=4)
        _moss(m, rng, 1.6, 1.2, 0.65, 0.7)
        _shade(m, fs, CER_TOP, CER_DARK)
        m.build(r)


def sluice(variants):
    """A sluice where a grow-bed lets its water down to the next: two ceramic cheeks with a slot
    between, a weir-board half up, a lip of glaze. Water runs along +y."""
    for i in range(variants):
        rng = random.Random(7300 + i)
        r = root("mirefall_sluice", i)
        m = Model(f"mirefall_sluice_{i}", 7300 + i)
        fs = []
        for s in (-1, 1):
            fs += list(m.box((0.9, 1.6, 1.1), (s * 1.1, 0, 0.45), CER[1 + s]))
            fs += list(m.box((0.7, 0.7, 0.35), (s * 1.1, 0, 1.15), CER[0]))
        m.box((1.4, 0.3, 0.12), (0, 0.6, 0.0), GLAZE)
        if i == 0:
            m.box((1.3, 0.18, 0.55), (0, -0.2, 0.2), WOOD[0])
        else:
            _blooms(m, rng, 0.0, -0.6, 0.0, n=3, spread=0.4, sacs=False)
        _shade(m, fs, CER_TOP, CER_DARK)
        m.build(r)


def socket_root(variants):
    """The roots the grow-heart tore loose when she pulled free of the temple's crown: thick violet
    ropes arching up out of the socket's lip and snapped off, their pale cores showing. Arch outward
    along +x."""
    for i in range(variants):
        rng = random.Random(7350 + i)
        r = root("mirefall_socket_root", i)
        m = Model(f"mirefall_socket_root_{i}", 7350 + i)
        for k in range(2 + (i % 2)):
            y = (k - 0.5) * 1.4 + rng.uniform(-0.3, 0.3)
            L = rng.uniform(3.0, 4.6)
            H = rng.uniform(1.4, 2.4)
            R = rng.uniform(0.35, 0.55)
            pts = [Vector((-0.6, y, -0.3))]
            for j in range(1, 6):
                t = j / 5
                pts.append(Vector((L * t, y + math.sin(t * 3 + k) * 0.4, -0.3 + H * math.sin(t * math.pi * 0.85))))
            rad = [R * 1.4, R * 1.2, R, R * 0.95, R * 0.9, R * 0.85]
            fs = tube(m, pts, rad, ROOT[k % 3], segs=6, cap=False)
            _shade(m, fs, BLOOM_TOP, None, dot=0.7)
            end = pts[-1]
            d = (pts[-1] - pts[-2]).normalized()
            m.cyl(R * 0.85, 0.1, tuple(end), CORE, segs=6, rot=Vector((0, 0, 1)).rotation_difference(d).to_euler())
            m.cyl(R * 0.4, 0.14, tuple(end + d * 0.02), "#b8a8d0", segs=5, rot=Vector((0, 0, 1)).rotation_difference(d).to_euler())
            for j in range(3):                                             # hair roots hanging off it
                p = pts[2 + j]
                tube(m, [p, p + Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), -p.z - 0.2))], [0.12, 0.05], ROOT[1], segs=4)
        if i == 2:
            # a shard of the capstone still caught in them
            fs = list(m.box((1.8, 1.4, 0.8), (2.0, 0.2, 1.9), CER[0], rot=(0.3, 0.5, 0.4)))
            _shade(m, fs, CER_TOP, CER_DARK)
        m.build(r)


def bell(variants):
    """The temple's bell, fallen from the crown when the grow-heart tore loose, lying on its side in
    the shallows: greened bronze, its mouth to the side, the bloom on its shoulder. Its mouth along +x."""
    for i in range(variants):
        rng = random.Random(7400 + i)
        r = root("mirefall_bell", i)
        m = Model(f"mirefall_bell_{i}", 7400 + i)
        # a bell's profile, lathed along +x (mouth at +x), lying on its side, tipped a little up
        prof = [(-3.4, 0.0), (-3.4, 0.7), (-3.0, 1.0), (-2.6, 1.35), (-1.6, 1.55), (-0.4, 1.75), (0.6, 2.15), (1.2, 2.55), (1.45, 2.6)]
        tip = 0.18
        pts = [Vector((x, 0, 2.2 + x * tip)) for x, _ in prof]
        fs = tube(m, pts, [r_ for _, r_ in prof], BRONZE[0], segs=10,
                  colors=[BRONZE[k % 3] for k in range(len(prof) - 1)])
        m.cyl(2.3, 0.2, (1.42, 0, 2.2 + 1.42 * tip), BRONZE_DARK, segs=10, rot=(0, math.pi / 2 - tip, 0))
        fs += m.cyl(0.5, 0.9, (-3.4, 0, 2.2 - 3.4 * tip), BRONZE[2], segs=6, rot=(0, -math.pi / 2 - tip, 0))  # the crown's loop
        for k in range(4):                                                 # Tonkva tallies round its waist
            a = -0.9 + k * 0.6
            m.box((0.5, 0.22, 0.22), (-0.6, math.sin(a) * 1.78, 2.1 + math.cos(a) * 1.78), GLAZE, rot=(-a, 0, 0))
        _shade(m, fs, BRONZE_TOP, BRONZE_DARK)
        _blooms(m, rng, -1.4, 0.6, 3.4, n=5, spread=0.9)
        _moss(m, rng, -2.2, -0.4, 3.0, 0.7)
        m.build(r)


# --- the Rang ---------------------------------------------------------------------------------

def _hut(m, rng, x, y, L, W, h, lit=True, stilts=1.2, turn=0.0):
    """A Rang long-house: woven walls under a steep gabled reed roof (its ridge along x, so from above
    it's two slopes, one lit, one in shade, a dark ridge between and crossed poles at each end), on a
    plank deck on stilts, a lamp at its door. Door to -y."""
    fs = []
    c, sn = math.cos(turn), math.sin(turn)
    at = lambda u, v: (x + u * c - v * sn, y + u * sn + v * c)           # noqa: E731
    D = (L + 1.4, W + 1.6)
    for k in range(8):                                                     # stilts at the deck's edge
        u = (-0.5 + (k % 4) / 3) * (D[0] - 0.3)
        v = (-0.5 if k < 4 else 0.5) * (D[1] - 0.3)
        m.cyl(0.13, stilts + 0.6, (*at(u, v), -0.6), WOOD[k % 3], segs=4)
    for k in range(int(D[0] / 0.45)):                                      # the deck, plank by plank
        u = -D[0] / 2 + 0.225 + k * 0.45
        fs += list(m.box((0.42, D[1], 0.18), (*at(u, rng.uniform(-0.08, 0.08)), stilts), WOOD[k % 3], rot=(0, 0, turn)))
    m.box((L, W, h), (*at(0, 0), stilts + 0.1 + h / 2), THATCH[1], rot=(0, 0, turn))
    m.box((0.6, 0.1, h * 0.8), (*at(-L * 0.15, -W / 2 - 0.02), stilts + 0.1 + h * 0.4), SOOT, rot=(0, 0, turn))
    H = W * 0.75
    roof = m.gable((L + 0.5, W, H), (*at(0, 0), stilts + 0.1 + h), THATCH[0], overhang=0.45, rot=(0, 0, turn), thick=0.22)
    sun = Vector((-0.4, -0.5, 0.3)).normalized()
    for f in roof:
        f.normal_update()
    recolor(m, roof, lambda f: ("#e6d29e" if f.normal.dot(sun) > 0.2 else "#9a8458") if f.normal.z > 0.3 else None)
    top = stilts + 0.1 + h + H
    m.box((L + 0.6, 0.3, 0.2), (*at(0, 0), top + 0.05), WOOD[2], rot=(0, 0, turn))         # the ridge, bound
    m.box((0.5, 0.5, 0.25), (*at(L * 0.2, 0), top + 0.15), SOOT, rot=(0, 0, turn))          # the smoke hole
    for e in (-1, 1):                                                      # crossed poles over each gable
        for t in (-1, 1):
            p0 = Vector((*at(e * (L / 2 + 0.25), 0), top - 0.3))
            u2, v2 = e * (L / 2 + 0.45), t * 0.55
            p1 = Vector((*at(u2, v2), top + 0.75))
            m.plank_line(p0, p1, 0.1, 0.1, WOOD[2])
    if lit:
        m.cyl(0.06, 1.2, (*at(L * 0.35, -D[1] / 2 + 0.2), stilts), WOOD[2], segs=4)
        m.ball(0.22, (*at(L * 0.35, -D[1] / 2 + 0.2), stilts + 1.3), LAMP, subdiv=0, glow=True)
    return fs


def rang_hut(variants):
    """Where the Rang live, on the temple's steps and in its shallows: a reed long-house on stilts, a
    lamp at its door; one with a rack of bloom drying beside it; two joined by a plank walk. Doors to -y."""
    for i in range(variants):
        rng = random.Random(7450 + i)
        r = root("mirefall_rang_hut", i)
        m = Model(f"mirefall_rang_hut_{i}", 7450 + i)
        fs = []
        if i == 0:
            fs += _hut(m, rng, 0, 0, 2.8, 1.9, 1.1)
            for k in range(3):                                             # a ladder down to the water
                m.box((0.9, 0.12, 0.1), (-0.6, -1.9 - k * 0.2, 1.0 - k * 0.45), WOOD[1])
        elif i == 1:
            fs += _hut(m, rng, -0.9, 0, 2.4, 1.8, 1.0)
            for s in (-1, 1):                                              # the drying rack
                m.cyl(0.1, 2.0, (2.2, s * 1.2, 0), WOOD[2], segs=4)
            m.box((0.12, 2.6, 0.12), (2.2, 0, 2.0), WOOD[1])
            for k in range(5):
                m.box((0.35, 0.18, 0.9), (2.2, -1.0 + k * 0.5, 1.5), (BLOOM[k % 3], CLOTH[1])[k % 4 == 1])
        else:
            fs += _hut(m, rng, -2.0, 0.3, 2.4, 1.8, 1.0, turn=0.0)
            fs += _hut(m, rng, 2.1, -0.5, 1.8, 1.5, 0.9, lit=False, stilts=1.0, turn=math.pi / 2)
            fs += list(m.box((1.4, 0.6, 0.12), (0.1, -0.1, 1.15), WOOD[1], rot=(0, 0.05, -0.25)))
            for k in range(3):                                             # baskets by the door
                m.cyl(0.25, 0.35, (-2.6 + k * 0.45, -1.6, 1.3), THATCH[k], segs=5)
        _shade(m, fs, WOOD_TOP, None, dot=0.8)
        m.build(r)


def punt(variants):
    """A Rang punt, moored or drifting: a long flat boat of dark wood, a pole along it, baskets of
    bloom, a lamp on a post at the stern; the second with a reed-mat awning. Bow to +y."""
    for i in range(variants):
        rng = random.Random(7500 + i)
        r = root("mirefall_punt", i)
        m = Model(f"mirefall_punt_{i}", 7500 + i)
        fs = []
        fs += list(m.box((1.2, 3.8, 0.35), (0, 0, 0.05), WOOD[0]))
        fs += list(m.box((0.9, 0.9, 0.3), (0, 2.2, 0.15), WOOD[1], taper=0.5))
        for s in (-1, 1):
            m.box((0.12, 3.8, 0.2), (s * 0.62, 0, 0.25), WOOD[2])
        m.box((0.08, 5.2, 0.08), (0.35, 0.2, 0.45), WOOD[1], rot=(0, 0, 0.06))
        for k in range(2):
            m.cyl(0.3, 0.4, (-0.2, 0.6 - k * 0.8, 0.2), THATCH[k], segs=6)
            m.ball(0.25, (-0.2, 0.6 - k * 0.8, 0.6), BLOOM[k], subdiv=0, scale=(1, 1, 0.6))
        m.cyl(0.06, 1.1, (0, -1.7, 0.2), WOOD[2], segs=4)
        m.ball(0.16, (0, -1.7, 1.35), LAMP, subdiv=0, glow=True)
        if i == 1:
            aw = m.gable((1.6, 1.4, 0.7), (0, -0.6, 0.35), THATCH[2], overhang=0.1, rot=(0, 0, math.pi / 2), thick=0.12)
            _shade(m, aw, THATCH_TOP, None, dot=0.4)
        _shade(m, fs, WOOD_TOP, None, dot=0.8)
        m.build(r)


# --- the bloom --------------------------------------------------------------------------------

def bloom_row(variants):
    """What grows in the old grow-beds: the mould in the rows the Tonkva taught it, gone violet and
    wild, a ridge of sponge along the furrow (along x); since the Waking, one grown back exact, cube
    on cube; one gone to sacs."""
    for i in range(variants):
        rng = random.Random(7550 + i)
        r = root("mirefall_bloom_row", i)
        m = Model(f"mirefall_bloom_row_{i}", 7550 + i)
        fs = []
        if i == 1:
            for k in range(7):
                s = 0.7 if k % 2 else 0.85
                fs += list(m.box((s, s, s * 0.8), (-3.0 + k * 1.0, 0, s * 0.4), BLOOM[k % 3]))
            _shade(m, fs, BLOOM_TOP, None, dot=0.75)
        else:
            for k in range(8):
                x = -3.2 + k * 0.92 + rng.uniform(-0.15, 0.15)
                R = rng.uniform(0.45, 0.7) * (1 - 0.3 * abs(x) / 3.5)
                fs += list(m.ball(R, (x, rng.uniform(-0.15, 0.15), R * 0.35), BLOOM[k % 3], subdiv=1, scale=(1.3, 1.0, 0.75), jitter=0.06))
            _shade(m, fs, BLOOM_TOP, None, dot=0.75)
            if i == 2:
                for k in range(4):
                    sf = m.ball(rng.uniform(0.3, 0.42), (-2.4 + k * 1.6, rng.uniform(-0.2, 0.2), 0.75), SAC[k % 2], subdiv=1, scale=(1, 1, 0.9))
                    _shade(m, sf, SAC_TOP, None, dot=0.8)
        m.build(r)


def bloom_mat(variants):
    """The bloom pouring down the temple's steps and over its courts: a flat lobed mat of violet
    sponge, its edge in curls, a few sacs swelling on it."""
    for i in range(variants):
        rng = random.Random(7600 + i)
        r = root("mirefall_bloom_mat", i)
        m = Model(f"mirefall_bloom_mat_{i}", 7600 + i)
        fs = []
        for k in range(7 + i * 2):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0, 1.8 + i * 0.3)
            fs += list(m.ball(rng.uniform(0.8, 1.2), (math.cos(a) * d, math.sin(a) * d, -0.05), BLOOM[k % 3], subdiv=1,
                              scale=(1.2, 1.0, 0.22), jitter=0.06))
        _shade(m, fs, BLOOM_TOP, None, dot=0.85)
        for k in range(2 + i):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.3, 1.6)
            sf = m.ball(rng.uniform(0.28, 0.4), (math.cos(a) * d, math.sin(a) * d, 0.3), SAC[k % 2], subdiv=1, scale=(1, 1, 0.85))
            _shade(m, sf, SAC_TOP, None, dot=0.8)
        m.build(r)


def build():
    hearth_lamp(3)
    lamp_pylon(2)
    column(4)
    shrine(2)
    sluice(2)
    socket_root(3)
    bell(1)
    rang_hut(3)
    punt(2)
    bloom_row(3)
    bloom_mat(3)
