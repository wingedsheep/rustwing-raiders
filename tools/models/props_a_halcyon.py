"""HALCYON, the Long Evening: lantern kelp, a smugglers' port on stilts, wrecked colony arks."""
from __future__ import annotations

import math
import random

from mathutils import Vector

from kit import Model
from props_a_lib import (bend, bob, collider, hull, lump, pulse, recolor, ribbon, root, spin, sway, tube, arc)

# the sea is deep evening blue (#1f5a7a): kelp goes amber and olive, its lanterns warm gold
KELP = ["#7a5a22", "#664a1c", "#8a6a28"]
KELP_LEAF = [("#9a7a2e", "#765a22"), ("#7e7a32", "#5e5a24"), ("#a8823a", "#80602a")]
LANTERN = "#ffc24a"
LANTERN_HOT = "#fff0a0"
BULB = {"amber": ("#ffb84a", "#fff0a0"), "pink": ("#ff7ac0", "#ffe0f0"), "cyan": ("#6af4ff", "#e0ffff")}
# the port: sun-bleached boards, tin roofs in faded colours, neon
DECK = ["#6a4c36", "#7a5a40", "#5e4230"]
STILT = "#3e2e26"
STILT_WET = "#2a3a3a"
WALL = ["#5a6a7a", "#8a5a3a", "#4a7a78", "#b8a890", "#6a5a7a"]
ROOF = [("#a8483a", "#c05a42"), ("#3a7a78", "#4a8c88"), ("#7a7a80", "#8e8e94"), ("#c09040", "#d0a250")]
WINDOW = "#ffc860"
NEON_PINK = "#ff4aa0"
NEON_CYAN = "#4ae8ff"
NEON_YELLOW = "#ffe04a"
NEON_GREEN = "#6aff8a"
SIGN_BACK = "#2a2238"
IRON = "#3a3438"
BARREL = ["#3a5a8a", "#a03a2a", "#d0a030"]
CONTAINER = ["#a8422c", "#2a7a7a", "#d0a030", "#2e5a9a", "#d8d0b8", "#6a8a3a"]
CRANE = "#e0a830"
CRANE_DARK = "#a87a22"
CONCRETE = ["#6a6a6e", "#7a7a7e"]
WARN = "#ff3a3a"
# the arks: rust, and the last of their white paint
RUST = ["#8a4a2a", "#6e3a24", "#a85a32", "#5a3020"]
PAINT = ["#c8c0a8", "#b0a890"]
STRIPE = "#3a7a8a"
DARK = "#1a1418"
MOSS = ["#6a8a3a", "#5a7a34", "#8a9a48"]


def _lanterns(m, rng, pts, every=2, r=0.22):
    for k, p in enumerate(pts):
        if k and k % every == 0:
            m.ball(r * rng.uniform(0.8, 1.2), (p.x + rng.uniform(-0.15, 0.15), p.y + rng.uniform(-0.15, 0.15), p.z),
                   LANTERN, subdiv=1, glow=True)


# the kelp's species, each in its own colours: wine-red, olive, bronze, sea-green
KELP_SP = {
    "wine": ("#7a2e2e", ("#a8443a", "#7a2c28")),
    "olive": ("#5a6424", ("#7e8a32", "#5a6424")),
    "bronze": ("#7a5a22", ("#a8823a", "#7e5e26")),
    "sea": ("#3a6a50", ("#5aa878", "#3e7a58")),
}
BUD_PINK = "#ff8ab0"


def _blade(m, base, yaw, L, w, cols, rise=0.25, droop=1.0, n=4, thick=0.05, fold=0.2):
    """One kelp blade: out from `base` along `yaw`, widest past the middle, a ragged tip."""
    pts = arc(base, yaw, L, rise, droop, n=n)
    ws = [w * 0.25] + [w * math.sin(math.pi * min(1.0, 0.2 + 0.8 * j / n)) for j in range(1, n)] + [w * 0.12]
    ribbon(m, pts, ws, cols[0], cols[1], fold=fold, thick=thick)


def _float_beads(m, rng, pts, color, r=0.2, every=1):
    for k, p in enumerate(pts):
        if k % every == 0:
            m.ball(r * rng.uniform(0.8, 1.2), (p.x, p.y, p.z + 0.06), color, subdiv=1, scale=(1, 1, 0.7), glow=True)


def kelp_tower(variants):
    """Kelp in the water (z = 0): four species, not one tree. v0 lantern stalks, a stand of three
    slender wine-red stalks strung with gold bladders; v1 crown kelp, one thick olive stalk opening
    into a star of broad blades with its lanterns in the heart; v2 sprouts, a low thicket of young
    stalks each with one bud; v3 fan kelp, broad bronze paddles fanned out on the surface round a
    knot of floats, two blades curling up."""
    for i in range(4):
        H = (4.6, 3.4, 2.2, 1.6)[i]
        r = root("kelp_tower", i, height=round(H + 0.6, 2))
        rng = random.Random(300 + i)
        mat = Model(f"kelp_tower_{i}_mat", 300 + i)                       # what lies on the water doesn't sway
        m = Model(f"kelp_tower_{i}", 310 + i)
        if i == 0:
            stem, leaf = KELP_SP["wine"]
            for k, (h, a, d) in enumerate(((4.6, 0.3, 0.3), (3.6, 2.4, 0.7), (2.7, 4.3, 0.8))):
                base = (math.cos(a) * d, math.sin(a) * d, -1.0)
                lean = (math.cos(a) * rng.uniform(0.5, 0.9), math.sin(a) * rng.uniform(0.5, 0.9))
                pts = bend(base, (base[0], base[1], h), lean, n=6)
                tube(m, pts, [0.17, 0.16, 0.15, 0.13, 0.12, 0.1, 0.06], stem, segs=5)
                for j in (2, 4):
                    p = pts[j]
                    _blade(m, (p.x, p.y, p.z), rng.uniform(0, math.tau), rng.uniform(1.1, 1.5), 0.24,
                           leaf if (j + k) % 2 else KELP_SP["bronze"][1], droop=1.1)
                for j in (3, 5):
                    p = pts[j]
                    m.ball(0.24, (p.x + 0.18, p.y - 0.1, p.z - 0.1), LANTERN, subdiv=1, scale=(1, 1, 1.3), glow=True)
                tp = pts[-1]
                m.ball(0.36, (tp.x, tp.y, tp.z + 0.12), LANTERN, subdiv=1, scale=(1, 1, 1.25), glow=True)
                m.ball(0.18, (tp.x, tp.y, tp.z + 0.42), LANTERN_HOT, subdiv=1, glow=True)
            for k in range(5):
                _blade(mat, (0, 0, 0.05), k * math.tau / 5 + rng.uniform(-0.3, 0.3), rng.uniform(1.2, 1.8), 0.28,
                       KELP_SP["wine"][1] if k % 2 else KELP_SP["bronze"][1], rise=0.0, droop=0.0, thick=0.04, fold=0.1)
        elif i == 1:
            stem, leaf = KELP_SP["olive"]
            pts = bend((0, 0, -1.0), (0, 0, H - 0.4), (0.4, 0.2), n=5)
            tube(m, pts, [0.3, 0.28, 0.25, 0.22, 0.2, 0.22], stem, segs=6)
            tp = pts[-1]
            n = 6
            for k in range(n):                                           # the star of blades, ragged
                yaw = k * math.tau / n + rng.uniform(-0.3, 0.3)
                cols = (leaf, KELP_SP["bronze"][1], leaf, KELP_SP["wine"][1], KELP_SP["bronze"][1], leaf)[k]
                _blade(m, (tp.x, tp.y, tp.z), yaw, rng.uniform(1.3, 2.3), rng.uniform(0.38, 0.5), cols, rise=0.15, droop=0.7, n=5)
            for k in range(3):
                a = k * math.tau / 3 + 0.5
                m.ball(0.3, (tp.x + math.cos(a) * 0.32, tp.y + math.sin(a) * 0.32, tp.z + 0.22), LANTERN, subdiv=1,
                       scale=(1, 1, 1.2), glow=True)
            m.ball(0.22, (tp.x, tp.y, tp.z + 0.5), LANTERN_HOT, subdiv=1, glow=True)
            ring = [Vector((math.cos(a) * 1.2, math.sin(a) * 1.2, 0.02)) for a in [k * math.tau / 6 + 0.3 for k in range(6)]]
            _float_beads(mat, rng, ring, BLADDER_GOLD, r=0.18, every=2)
            for k in range(3):
                _blade(mat, (0, 0, 0.04), rng.uniform(0, math.tau), rng.uniform(1.0, 1.4), 0.24, leaf, rise=0.0, droop=0.0,
                       thick=0.04, fold=0.1)
        elif i == 2:
            stem, leaf = KELP_SP["sea"]
            for k in range(7):
                a = k * 2.4 + rng.uniform(-0.3, 0.3)
                d = 0.25 + 0.5 * math.sqrt(k + 0.5) * rng.uniform(0.85, 1.15)
                x, y = math.cos(a) * d, math.sin(a) * d
                h = rng.uniform(1.0, 2.2) * (1.0 if k < 3 else 0.8)
                pts = bend((x, y, -0.6), (x, y, h), (math.cos(a) * 0.3, math.sin(a) * 0.3), n=3)
                tube(m, pts, [0.17, 0.16, 0.13, 0.1], stem if k % 3 else KELP_SP["olive"][0], segs=5)
                for p, da in ((pts[1], 2.0), (pts[2], 0.0)):
                    _blade(m, (p.x, p.y, p.z), a + da + rng.uniform(-0.5, 0.5), rng.uniform(0.8, 1.1), 0.3,
                           leaf if k % 2 else KELP_SP["olive"][1], droop=1.2, n=3)
                tp = pts[-1]
                m.ball(0.24, (tp.x, tp.y, tp.z + 0.1), (LANTERN, BUD_PINK, LANTERN)[k % 3], subdiv=1, scale=(1, 1, 1.3), glow=True)
            for k in range(4):
                _blade(mat, (0, 0, 0.04), k * math.tau / 4 + 0.6, rng.uniform(1.0, 1.4), 0.22, leaf, rise=0.0, droop=0.0, thick=0.04,
                       fold=0.1)
        else:
            stem, leaf = KELP_SP["bronze"]
            for k in range(6):                                           # the fan, lying on the water
                yaw = -1.3 + k * 0.52 + rng.uniform(-0.1, 0.1)
                _blade(mat, (0, 0, 0.06), yaw, rng.uniform(2.0, 2.6), rng.uniform(0.48, 0.58),
                       leaf if k % 2 else KELP_SP["olive"][1], rise=0.04, droop=0.04, n=5, thick=0.05, fold=0.12)
            knot = [Vector((rng.uniform(-0.5, 0.2), rng.uniform(-0.4, 0.4), 0.05)) for _ in range(5)]
            _float_beads(mat, rng, knot, BLADDER_GOLD, r=0.26)
            for k in range(2):                                           # two blades curling up out of it
                pts = bend((-0.2, (k - 0.5) * 0.5, -0.4), (-0.3, (k - 0.5) * 0.7, H), (-0.5, (k - 0.5) * 0.6), n=3)
                tube(m, pts, [0.1, 0.09, 0.07, 0.05], stem, segs=5)
                p = pts[-1]
                _blade(m, (p.x, p.y, p.z), math.pi + (k - 0.5) * 0.9, 1.2, 0.3, leaf, rise=0.1, droop=1.2)
                m.ball(0.2, (p.x, p.y, p.z + 0.1), LANTERN, subdiv=1, glow=True)
        mat.build(r)
        obj = m.build(r)
        sway(obj, f"kelp_tower_{i}_sway_idle", amp=(0.05, 0.04), period=4.0 + i * 0.5, phase=i)


BLADDER_GOLD = "#ffb84a"


def glow_bulb(variants):
    """What floats at the surface: rafts of glowing bladders roped together by tendrils (amber,
    pink, cyan), and v3 a dark mat of drift-weed with only a few beads lit, the ground cover."""
    tints = ["amber", "pink", "cyan"]
    for i, tint in enumerate(tints):
        r = root("glow_bulb", i)
        rng = random.Random(330 + i)
        m = Model(f"glow_bulb_{i}_weed", 330 + i)
        main, hot = BULB[tint]
        spots = [(0, 0, 0.5)]
        for k in range(4 + i):
            a = k * math.tau / (4 + i) + rng.uniform(-0.3, 0.3)
            d = rng.uniform(0.7, 1.3)
            spots.append((math.cos(a) * d, math.sin(a) * d, rng.uniform(0.22, 0.38)))
        for k, (x, y, s) in enumerate(spots[1:]):                           # tendrils between them
            pts = [Vector((0, 0, 0.05)), Vector((x * 0.5, y * 0.5 + 0.1, 0.08)), Vector((x, y, 0.05))]
            ribbon(m, pts, [0.08, 0.1, 0.06], KELP_SP["olive"][0], fold=0.1, thick=0.05)
        for k in range(5):
            _blade(m, (0, 0, 0.04), rng.uniform(0, math.tau), rng.uniform(1.0, 1.6), 0.24,
                   (KELP_SP["wine"][1], KELP_SP["olive"][1], KELP_SP["sea"][1])[(k + i) % 3], rise=0.0, droop=0.0, thick=0.04, fold=0.1)
        m.build(r)
        g = Model(f"glow_bulb_{i}", 340 + i)
        for x, y, s in spots:
            g.ball(s, (x, y, s * 0.35), main, subdiv=1, scale=(1, 1, 0.9), glow=True)
            g.ball(s * 0.45, (x - s * 0.25, y - s * 0.25, s * 0.85), hot, subdiv=1, glow=True)
        obj = g.build(r)
        pulse(obj, f"glow_bulb_{i}_pulse_idle", amp=0.1, period=2.0 + i * 0.4)
    # v3: drift-weed, a ragged mat of blades in three colours, a few beads lit
    r = root("glow_bulb", 3)
    rng = random.Random(333)
    m = Model("glow_bulb_3", 333)
    for k in range(11):
        a = k * math.tau / 11 + rng.uniform(-0.2, 0.2)
        d = rng.uniform(0.0, 0.9)
        _blade(m, (math.cos(a) * d, math.sin(a) * d * 0.7, 0.04), a + rng.uniform(-0.5, 0.5), rng.uniform(1.2, 2.0), rng.uniform(0.22, 0.32),
               (KELP_SP["wine"][1], KELP_SP["olive"][1], KELP_SP["bronze"][1], KELP_SP["sea"][1])[k % 4], rise=0.0, droop=0.0, thick=0.04,
               fold=0.12)
    for k in range(4):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.6, 1.6)
        m.ball(0.17, (math.cos(a) * d, math.sin(a) * d * 0.7, 0.1), (LANTERN, BUD_PINK)[k % 2], subdiv=1, scale=(1, 1, 0.7), glow=True)
    m.build(r)


def buoy(variants):
    for i in range(2):
        r = root("buoy", i)
        rng = random.Random(360 + i)
        m = Model(f"buoy_{i}", 360 + i)
        if i == 0:
            # a navigation buoy: a fat red float, a white band, a cage and its lamp
            m.cyl(0.8, 0.9, (0, 0, -0.5), "#b8402e", segs=8, r_top=0.7)
            m.cyl(0.72, 0.18, (0, 0, 0.25), "#e8e0d0", segs=8)
            m.cyl(0.7, 0.1, (0, 0, 0.43), "#8a3a2a", segs=8, r_top=0.5)
            for k in range(4):
                a = k * math.tau / 4 + math.pi / 4
                m.plank_line((math.cos(a) * 0.45, math.sin(a) * 0.45, 0.45), (math.cos(a) * 0.12, math.sin(a) * 0.12, 1.9),
                             0.08, 0.08, "#b8402e")
            m.cyl(0.32, 0.12, (0, 0, 1.25), "#e8e0d0", segs=6)
            m.box((0.7, 0.7, 0.08), (0, 0, 0.43), "#6a2a20")
            lamp = m
            lamp.ball(0.24, (0, 0, 2.0), "#ff6a4a", subdiv=1, glow=True)
            lamp.cyl(0.18, 0.08, (0, 0, 2.18), IRON, segs=6)
            bobber = m.build(r)
        else:
            # a smuggler's float: drums lashed to a pallet, an orange float, a flag on a stick
            m.box((1.8, 1.4, 0.2), (0, 0, 0.1), DECK[1])
            for k, (x, y) in enumerate(((-0.45, -0.35), (0.45, -0.35), (-0.45, 0.35), (0.45, 0.35))):
                m.cyl(0.4, 0.75, (x, y, 0.15), BARREL[k % 3], segs=7)
                m.cyl(0.41, 0.06, (x, y, 0.6), "#2a2a2a", segs=7)
            m.ball(0.38, (1.1, 0.2, 0.15), "#ff7a2a", subdiv=1)
            m.plank_line((-0.8, 0.6, 0.2), (-0.8, 0.6, 2.0), 0.07, 0.07, "#5a4a3a")
            m.box((0.05, 0.6, 0.38), (-0.8, 0.9, 1.75), "#3a8ab0")
            m.ball(0.16, (-0.8, 0.6, 2.05), NEON_YELLOW, subdiv=1, glow=True)
            bobber = m.build(r)
        bob(bobber, f"buoy_{i}_bob_idle", amp=0.1, period=2.6 + i * 0.5, tilt=0.06)
    # v2: a storm spar, the Authority's tall marker, banded red and white, a strobe on its head
    r = root("buoy", 2)
    m = Model("buoy_2", 362)
    m.cyl(0.6, 0.7, (0, 0, -0.4), "#3a4048", segs=7, r_top=0.5)
    for k in range(4):
        m.cyl(0.32 - k * 0.04, 0.8, (0, 0, 0.3 + k * 0.8), ("#d83a2a", "#e8e0d0")[k % 2], segs=6)
    for k in range(3):
        a = k * math.tau / 3
        m.box((0.6, 0.12, 0.12), (math.cos(a) * 0.45, math.sin(a) * 0.45, 3.2), IRON, rot=(0, 0, a))
    m.ball(0.3, (0, 0, 3.6), "#c8f0ff", subdiv=1, glow=True)
    bob(m.build(r), "buoy_2_bob_idle", amp=0.12, period=3.4, tilt=0.09)


# --- stiltport --------------------------------------------------------------------------------

def tin_roof(m, cx, cy, z, sx, sy, pal, pitch=0.12, rot=0.0, neon=None, patch=True, rng=None):
    """A ribbed tin roof sloping along y: stripes of two tones, a rust patch, an optional neon edge."""
    a, b = pal
    n = max(3, int(sx / 0.42))
    w = sx / n
    c, s = math.cos(rot), math.sin(rot)

    def at(x, y):
        return (cx + x * c - y * s, cy + x * s + y * c)
    for k in range(n):
        x = -sx / 2 + w * (k + 0.5)
        px, py = at(x, 0)
        m.box((w * 1.02, sy, 0.14), (px, py, z), a if k % 2 else b, rot=(pitch, 0, rot))
    if patch and rng:
        x = rng.uniform(-sx / 3, sx / 3)
        y = rng.uniform(-sy / 4, sy / 4)
        px, py = at(x, y)
        m.box((sx * 0.28, sy * 0.3, 0.16), (px, py, z + 0.03 - y * math.tan(pitch)), "#8a5a3a", rot=(pitch, 0, rot))
    if neon:
        for sgn in (-1, 1):
            px, py = at(0, sgn * (sy / 2 + 0.04))
            m.box((sx, 0.12, 0.12), (px, py, z - sgn * sy / 2 * math.tan(pitch) - 0.1), neon, rot=(0, 0, rot), glow=True)


def stilts(m, rng, cx, cy, sx, sy, z, rot=0.0):
    c, s = math.cos(rot), math.sin(rot)
    for x in (-sx / 2 + 0.2, 0, sx / 2 - 0.2) if sx > 2.6 else (-sx / 2 + 0.2, sx / 2 - 0.2):
        for y in (-sy / 2 + 0.2, sy / 2 - 0.2):
            px, py = cx + x * c - y * s, cy + x * s + y * c
            m.cyl(0.13, z, (px, py, -0.3), STILT, segs=5)
            m.cyl(0.15, 0.6, (px, py, -0.3), STILT_WET, segs=5)
    for y in (-sy / 2 + 0.2, sy / 2 - 0.2):                                # a cross brace
        a = (cx + (-sx / 2 + 0.2) * c - y * s, cy + (-sx / 2 + 0.2) * s + y * c, 0.3)
        b = (cx + (sx / 2 - 0.2) * c - y * s, cy + (sx / 2 - 0.2) * s + y * c, z - 0.3)
        m.plank_line(a, b, 0.08, 0.08, STILT)


def deck(m, cx, cy, sx, sy, z, rot=0.0):
    n = max(3, int(sy / 0.4))
    c, s = math.cos(rot), math.sin(rot)
    for k in range(n):
        y = -sy / 2 + (k + 0.5) * sy / n
        m.box((sx, sy / n * 0.92, 0.16), (cx - y * s, cy + y * c, z), DECK[k % 3], rot=(0, 0, rot))


def shack(m, rng, cx, cy, z, sx, sy, h, wall, roof, neon=None, rot=0.0, door=True):
    m.box((sx, sy, h), (cx, cy, z + h / 2), wall, rot=(0, 0, rot))
    c, s = math.cos(rot), math.sin(rot)
    for k in range(max(1, int(sx / 1.3))):                                 # lit windows on the camera side (-y)
        x = -sx / 2 + (k + 0.5) * sx / max(1, int(sx / 1.3))
        if door and k == 0:
            px, py = cx + x * c + (sy / 2 + 0.01) * s, cy + x * s - (sy / 2 + 0.01) * c
            m.box((0.5, 0.06, h * 0.7), (px, py, z + h * 0.35), "#3a2a22", rot=(0, 0, rot))
            continue
        px, py = cx + x * c + (sy / 2 + 0.01) * s, cy + x * s - (sy / 2 + 0.01) * c
        m.box((0.5, 0.06, 0.4), (px, py, z + h * 0.6), WINDOW, rot=(0, 0, rot), glow=True)
    for k in range(max(1, int(sy / 1.3))):                                 # and on the side
        y = -sy / 2 + (k + 0.5) * sy / max(1, int(sy / 1.3))
        px, py = cx + (sx / 2 + 0.01) * c - y * s, cy + (sx / 2 + 0.01) * s + y * c
        m.box((0.06, 0.45, 0.38), (px, py, z + h * 0.6), WINDOW, rot=(0, 0, rot), glow=True)
    tin_roof(m, cx, cy, z + h + 0.12, sx + 0.5, sy + 0.5, roof, rot=rot, neon=neon, rng=rng)


def _boardwalk(m, x0, x1, y, w, z, posts=True):
    """A plank walk along x on posts, its planks across it, a rail of rope on one side."""
    n = max(2, int((x1 - x0) / 0.5))
    for k in range(n):
        x = x0 + (k + 0.5) * (x1 - x0) / n
        m.box(((x1 - x0) / n * 0.9, w, 0.14), (x, y, z), DECK[k % 3])
    if posts:
        for x in [x0 + 0.2 + j * 2.0 for j in range(int((x1 - x0) / 2.0) + 1)]:
            for sy in (-1, 1):
                m.cyl(0.11, z + 0.3, (x, y + sy * (w / 2 - 0.1), -0.3), STILT, segs=5)


def _lamp_post(m, x, y, z, h=1.8, color=WINDOW):
    m.plank_line((x, y, z), (x, y, z + h), 0.1, 0.1, IRON)
    m.box((0.5, 0.08, 0.08), (x + 0.2, y, z + h), IRON)
    m.ball(0.2, (x + 0.42, y, z + h - 0.2), color, subdiv=1, glow=True)


def _string_lights(m, a, b, n, colors, sag=0.3):
    a, b = Vector(a), Vector(b)
    pts = []
    for k in range(n + 1):
        t = k / n
        p = a.lerp(b, t)
        p.z -= sag * 4 * t * (1 - t)
        pts.append(p)
    for p, q in zip(pts, pts[1:]):
        m.plank_line(tuple(p), tuple(q), 0.04, 0.04, "#1e1a20")
    for k, p in enumerate(pts[1:-1]):
        m.ball(0.17, (p.x, p.y, p.z - 0.15), colors[k % len(colors)], subdiv=1, scale=(1, 1, 1.25), glow=True)


def _reflection(m, rng, x, y, color):
    """Light lying on the evening water: a few broken flecks of it, trailing off."""
    for k in range(4):
        w = rng.uniform(0.3, 0.55) * (1 - k * 0.18)
        m.box((w, w * 0.7, 0.03), (x + rng.uniform(-0.4, 0.4), y - k * 0.55, 0.03), color, glow=True, rot=(0, 0, rng.uniform(0, 1.5)))


def _moored(m, x, y, yaw, k, L=3.6):
    """A little boat tied up: a hull, a canvas hood, a lamp."""
    c, s = math.cos(yaw), math.sin(yaw)

    def at(u, v, z):
        return (x + u * c - v * s, y + u * s + v * c, z)
    m.box((L, 1.1, 0.5), at(0, 0, 0.1), DECK[k % 3], rot=(0, 0, yaw), taper=0.9)
    m.box((L * 0.25, 0.6, 0.6), at(L * 0.5, 0, 0.2), DECK[(k + 1) % 3], rot=(0, 0, yaw), taper=0.4)
    m.ball(0.55, at(-0.2, 0, 0.4), ("#c8b890", "#3a6a7a", "#a8483a")[k % 3], subdiv=1, scale=(L * 0.3 / 0.55, 0.95, 0.7), rot=(0, 0, yaw))
    m.ball(0.14, at(L * 0.42, 0, 0.75), ("#ff5a3a", "#ffb43a")[k % 2], subdiv=1, glow=True)


def stilt_house(variants):
    """The port, in pieces that fit together into a town: not single shacks dropped about but
    composed lots, each its own size. v0 a street, houses both sides of a boardwalk with lights
    strung over it; v1 a tower house, two storeys and a tank; v2 a long house with a walkway to its
    store; v3 a noodle stall on a platform; v4 a jetty run out over the water, a boat tied up and a
    hut at the end; v5 a godown on its wharf, a saw-tooth roof, crates and bollards; v6 a fisher's
    hut on tall stilts with nets hung to dry."""
    Z = 1.8
    for i in range(7):
        r = root("stilt_house", i)
        rng = random.Random(400 + i)
        m = Model(f"stilt_house_{i}", 400 + i)
        if i == 0:
            L = 11.0
            _boardwalk(m, -L / 2, L / 2, 0, 1.8, Z)
            for k, (x, w, sd) in enumerate(((-3.6, 3.2, 1), (0.2, 2.6, 1), (3.8, 3.0, 1), (-2.6, 3.8, -1), (2.6, 3.4, -1))):
                y = sd * 2.4
                stilts(m, rng, x, y, w, 2.6, Z)
                deck(m, x, y, w + 0.2, 2.8, Z)
                h = rng.uniform(1.4, 2.0)
                shack(m, rng, x, y + sd * 0.15, Z + 0.08, w - 0.4, 2.2, h, WALL[(k * 2) % 5], ROOF[(k + 1) % 4],
                      neon=(NEON_PINK, None, NEON_CYAN, None, NEON_YELLOW)[k], rot=0 if sd > 0 else math.pi, door=True)
            for k in range(3):
                x = -4 + k * 4
                _string_lights(m, (x - 1.8, 1.2, Z + 2.5), (x + 1.8, -1.2, Z + 2.5), 5, (NEON_PINK, LANTERN, "#ff5a3a"), sag=0.4)
            for k in range(3):
                m.cyl(0.3, 0.6, (-4.8 + k * 0.6, -0.5, Z + 0.08), BARREL[k], segs=7)
        elif i == 1:
            stilts(m, rng, 0, 0, 4.0, 3.4, Z)
            deck(m, 0, 0, 4.2, 3.6, Z)
            shack(m, rng, 0, 0.2, Z + 0.08, 3.4, 2.8, 1.5, WALL[2], ROOF[2], door=True)
            shack(m, rng, 0.4, 0.4, Z + 1.75, 2.0, 1.8, 1.3, WALL[1], ROOF[0], neon=NEON_CYAN, rot=0.25, door=False)
            m.cyl(0.45, 0.9, (-1.1, 0.8, Z + 1.75), "#5a7a8a", segs=8)
            m.cyl(0.47, 0.1, (-1.1, 0.8, Z + 2.65), "#3a4a5a", segs=8)
            m.plank_line((1.4, -1.0, Z + 1.7), (1.4, -1.0, Z + 4.3), 0.06, 0.06, IRON)
            m.ball(0.12, (1.4, -1.0, Z + 4.35), WARN, subdiv=1, glow=True)
            _moored(m, -0.6, -2.6, 0.1, 1)
        elif i == 2:
            stilts(m, rng, -1.0, 0, 4.6, 2.8, Z)
            deck(m, -1.0, 0, 4.8, 3.0, Z)
            shack(m, rng, -1.2, 0.2, Z + 0.08, 4.0, 2.2, 1.5, WALL[3], ROOF[1], neon=NEON_PINK)
            stilts(m, rng, 3.0, 0.3, 1.8, 1.8, Z)
            deck(m, 3.0, 0.3, 2.0, 2.0, Z)
            shack(m, rng, 3.0, 0.4, Z + 0.08, 1.5, 1.4, 1.2, WALL[4], ROOF[3], door=False)
            deck(m, 1.6, 0.0, 1.2, 0.8, Z - 0.02)
            m.ball(0.5, (-2.6, 0.6, Z + 2.0), "#c8c8c0", subdiv=1, scale=(1, 1, 0.45), rot=(0.6, 0, 0))
            m.cyl(0.06, 0.5, (-2.6, 0.6, Z + 1.55), IRON, segs=4)
        elif i == 3:
            stilts(m, rng, 0, 0, 3.4, 3.2, Z)
            deck(m, 0, 0, 3.6, 3.4, Z)
            shack(m, rng, 0, 0.6, Z + 0.08, 3.0, 1.6, 1.7, WALL[1], ROOF[3], neon=NEON_CYAN, door=False)
            for k in range(5):
                m.box((0.62, 1.3, 0.1), (-1.25 + k * 0.62, -0.75, Z + 1.75), ("#e8e0d0", "#c83a3a")[k % 2], rot=(-0.3, 0, 0))
            m.box((2.6, 0.6, 0.8), (0, -0.4, Z + 0.48), "#5a3a2a")
            for k in range(5):
                m.ball(0.14, (-1.4 + k * 0.7, -1.5, Z + 1.55), (NEON_PINK, NEON_YELLOW)[k % 2], subdiv=1, glow=True)
            m.box((1.6, 0.1, 0.5), (0, 1.48, Z + 2.25), SIGN_BACK)
            m.box((1.3, 0.12, 0.22), (0, 1.48, Z + 2.25), NEON_PINK, glow=True)
            for k in range(3):                                             # stools and a little float of boats
                m.cyl(0.2, 0.5, (-1.0 + k * 1.0, -1.25, Z + 0.08), "#8a6a42", segs=6)
            _moored(m, 3.0, -1.0, 1.5, 2, L=3.2)
        elif i == 4:
            _boardwalk(m, -5.0, 5.0, 0, 1.4, Z - 0.6)
            stilts(m, rng, 6.0, 0, 2.4, 2.4, Z)
            deck(m, 6.0, 0, 2.6, 2.6, Z)
            shack(m, rng, 6.1, 0.1, Z + 0.08, 1.9, 1.8, 1.4, WALL[0], ROOF[3], neon=NEON_YELLOW, door=False)
            for x in (-3.0, 1.0, 4.6):
                _lamp_post(m, x, 0.6, Z - 0.5, h=1.6, color=(LANTERN, WINDOW, "#ff5a3a")[int(x) % 3])
            _moored(m, -1.8, -1.5, 0.05, 0, L=4.0)
            _moored(m, 2.2, 1.6, math.pi - 0.1, 2, L=3.4)
            for k in range(3):
                m.box((0.7, 0.7, 0.6), (-4.2 + k * 0.75, 0.2, Z - 0.23), ("#8a6a42", "#a87a4a", "#6a5a3a")[k], rot=(0, 0, k * 0.3))
        elif i == 5:
            stilts(m, rng, 0, 0.6, 7.4, 4.6, Z - 0.2)
            deck(m, 0, 0, 8.6, 6.6, Z - 0.2)
            m.box((7.2, 4.2, 2.2), (0, 0.9, Z + 1.0), WALL[3])
            for k in range(3):                                             # saw-tooth roof, the glass faces lit
                x = -2.4 + k * 2.4
                m.box((2.4, 4.6, 0.18), (x, 0.9, Z + 2.55), ROOF[k % 2 + 1][k % 2], rot=(0, 0.35, 0))
                m.box((0.12, 4.4, 0.7), (x + 1.12, 0.9, Z + 2.6), WINDOW, glow=True)
            m.box((2.4, 0.08, 1.6), (-1.0, -1.22, Z + 0.8), "#3a2a22")       # the big door
            m.box((3.0, 0.1, 0.5), (1.8, -1.24, Z + 1.85), SIGN_BACK)
            m.box((2.6, 0.12, 0.25), (1.8, -1.3, Z + 1.85), NEON_GREEN, glow=True)
            container(m, 1.6, -2.4, Z - 0.1, CONTAINER[1], L=2.8, W=1.1, H=1.0)
            for k in range(4):
                m.box((0.8, 0.8, 0.7), (-3.4 + (k % 2) * 0.85, -2.3 + (k // 2) * 0.85, Z - 0.1 + 0.35), ("#8a6a42", "#a87a4a")[k % 2])
            for x in (-3.8, 0, 3.8):
                m.cyl(0.22, 0.4, (x, -3.1, Z - 0.1), IRON, segs=6)
            _lamp_post(m, 4.0, -2.8, Z - 0.1, h=1.8)
        else:
            Zh = 2.8
            stilts(m, rng, 0, 0, 2.2, 2.0, Zh)
            deck(m, 0, 0, 2.6, 2.4, Zh)
            shack(m, rng, 0, 0.1, Zh + 0.08, 1.8, 1.6, 1.3, WALL[4], ROOF[(i + 1) % 4], door=True)
            m.plank_line((0.8, -1.1, Zh), (0.4, -1.8, 0.0), 0.3, 0.1, STILT)                     # a ladder
            for k in range(2):                                             # nets on poles
                x = 2.2 + k * 1.6
                m.plank_line((x, -0.8, 0), (x, -0.8, 2.6), 0.1, 0.1, STILT)
                m.plank_line((x, 0.9, 0), (x, 0.9, 2.6), 0.1, 0.1, STILT)
                m.box((0.06, 1.7, 1.4), (x, 0.05, 1.9), ("#4a6a5a", "#6a5a3a")[k], rot=(0, 0.15, 0))
                m.ball(0.12, (x, -0.8, 2.7), ("#ff5a3a", LANTERN)[k], subdiv=1, glow=True)
            _moored(m, -0.5, -2.4, -0.2, 1, L=3.0)
        # extra light where each lot is dark, and its lights smeared on the water below it
        extra = {1: [((-2.0, -1.8, Z + 1.7), (2.0, -1.8, Z + 1.5))], 2: [((-3.4, -1.6, Z + 1.8), (3.6, -0.8, Z + 1.6))],
                 5: [((-4.2, -3.3, Z + 1.6), (4.2, -3.3, Z + 1.6))], 6: [((-1.2, -1.3, Zh + 1.4), (3.8, -0.9, 2.4))] if i == 6 else []}
        for a, b in extra.get(i, []):
            _string_lights(m, a, b, 6, (LANTERN, NEON_PINK, "#ff5a3a"), sag=0.35)
        spots = {0: [(-4.5, -4.0), (-0.5, -3.9), (3.5, -4.1), (0.0, 0.0)], 1: [(-1.5, -2.2), (1.5, -2.0)],
                 2: [(-2.5, -1.8), (0.5, -1.7), (3.0, -1.3)], 3: [(-1.0, -2.0), (1.0, -2.1)],
                 4: [(-3.0, 0.3), (1.0, 0.3), (4.6, 0.3), (6.0, -1.6)], 5: [(-3.0, -3.8), (0.0, -3.9), (3.5, -3.8)],
                 6: [(-0.4, -1.5), (2.4, -1.2)]}[i]
        for k, (x, y) in enumerate(spots):
            _reflection(m, rng, x, y, (LANTERN, NEON_PINK, NEON_CYAN, "#ff7a3a")[(k + i) % 4])
        m.build(r)


def container(m, x, y, z, color, rot=0.0, L=3.0, W=1.2, H=1.2):
    m.box((L, W, H), (x, y, z + H / 2), color, rot=(0, 0, rot))
    c, s = math.cos(rot), math.sin(rot)
    dark = {"#a8422c": "#7e2e1e", "#2a7a7a": "#1e5a5a", "#d0a030": "#a07a20", "#2e5a9a": "#1e4070",
            "#d8d0b8": "#a8a090", "#6a8a3a": "#4a6a2a"}[color]
    for k in range(6):                                                     # ribs down the long sides
        u = -L / 2 + (k + 0.5) * L / 6
        for sgn in (-1, 1):
            px, py = x + u * c - sgn * (W / 2 + 0.03) * s, y + u * s + sgn * (W / 2 + 0.03) * c
            m.box((0.16, 0.07, H * 0.9), (px, py, z + H / 2), dark, rot=(0, 0, rot))
    for sgn in (-1, 1):                                                    # door ends and a roof rim
        px, py = x + sgn * (L / 2 + 0.03) * c, y + sgn * (L / 2 + 0.03) * s
        m.box((0.07, W * 0.95, H * 0.95), (px, py, z + H / 2), dark, rot=(0, 0, rot))
    m.box((L * 0.9, W * 0.6, 0.04), (x, y, z + H + 0.01), dark, rot=(0, 0, rot))


def container_stack(variants):
    layouts = [
        [(0, -0.65, 0, 0, 0), (0, 0.65, 0, 1, 0), (0.2, 0, 1, 2, 0.08)],
        [(-0.6, -1.3, 0, 3, 0), (-0.6, 0, 0, 0, 0), (-0.6, 1.3, 0, 4, 0), (-0.6, -0.65, 1, 1, 0.03),
         (-0.6, 0.65, 1, 2, -0.04), (-0.4, 0, 2, 5, 0.1)],
        [(-0.4, -0.3, 0, 2, 0.15), (1.8, 1.4, 0, 3, 1.4), (-0.6, -0.2, 1, 1, -0.1)],
    ]
    for i, lay in enumerate(layouts):
        r = root("container_stack", i)
        m = Model(f"container_stack_{i}", 430 + i)
        for x, y, lvl, col, rot in lay:
            container(m, x, y, lvl * 1.22, CONTAINER[col], rot=rot)
        m.build(r)


def crane(variants):
    """Obstacle: a harbour crane. The tower is the collider; the jib slews round overhead."""
    H = 13.0
    r = root("crane", 0, height=16.6, obstacle=1)
    m = Model("crane_tower", 460)
    m.box((3.2, 3.2, 0.6), (0, 0, 0.3), CONCRETE[0])
    for x in (-1.4, 1.4):
        for y in (-1.4, 1.4):
            m.box((0.5, 0.5, 0.5), (x, y, 0.85), CONCRETE[1])
    s = 0.9
    for x in (-s, s):
        for y in (-s, s):
            m.box((0.26, 0.26, H - 0.6), (x, y, 0.6 + (H - 0.6) / 2), CRANE)
    steps = 8
    for k in range(steps):                                                 # zig-zag bracing on all four faces
        z0 = 0.6 + (H - 0.6) * k / steps
        z1 = 0.6 + (H - 0.6) * (k + 1) / steps
        for (ax, ay), (bx, by) in (((-s, -s), (s, -s)), ((s, -s), (s, s)), ((s, s), (-s, s)), ((-s, s), (-s, -s))):
            if k % 2:
                ax, ay, bx, by = bx, by, ax, ay
            m.plank_line((ax, ay, z0), (bx, by, z1), 0.12, 0.12, CRANE_DARK)
        m.box((2 * s + 0.2, 2 * s + 0.2, 0.12), (0, 0, z1), CRANE_DARK)
    m.build(r)
    collider(r, 0, 0, 1.4)
    # the slewing part: cab, jib, counter-jib, the trolley and a container hanging off the hook
    j = Model("crane_jib", 461)
    j.cyl(1.2, 0.5, (0, 0, 0), IRON, segs=8)
    j.box((1.6, 1.6, 1.4), (0.9, -1.2, 0.9), "#d8d0c0")                     # the cab
    j.box((1.62, 0.1, 0.7), (0.9, -2.02, 1.1), WINDOW, glow=True)
    L1, L2 = 11.0, 4.5
    for y in (-0.5, 0.5):                                                  # the jib: two chords and lacing
        j.box((L1, 0.18, 0.18), (L1 / 2, y, 1.2), CRANE)
        j.box((L2, 0.18, 0.18), (-L2 / 2, y, 1.2), CRANE)
    j.box((L1, 0.18, 0.18), (L1 / 2 - 0.5, 0, 2.2), CRANE)
    for k in range(10):
        x0 = k * L1 / 10
        j.plank_line((x0, 0, 1.2), (x0 + L1 / 20, 0, 2.2), 0.1, 0.1, CRANE_DARK)
        j.plank_line((x0 + L1 / 20, 0, 2.2), (x0 + L1 / 10, 0, 1.2), 0.1, 0.1, CRANE_DARK)
        j.box((0.1, 1.0, 0.1), (x0, 0, 1.2), CRANE_DARK)
    j.box((L1, 1.0, 0.08), (L1 / 2, 0, 1.2), "#4a4448")                    # the walkway along it (seen from above)
    for k in range(3):                                                     # the counterweights
        j.box((0.9, 1.5, 0.9), (-L2 + 0.6 + k * 1.0, 0, 0.75), ("#4a4a4e", "#5a5a5e")[k % 2])
    j.plank_line((0, 0, 1.2), (0, 0, 3.6), 0.3, 0.3, CRANE)                 # the A-frame and its stays
    j.plank_line((0, 0, 3.6), (L1 - 0.5, 0, 2.2), 0.06, 0.06, IRON)
    j.plank_line((0, 0, 3.6), (-L2 + 0.4, 0, 1.3), 0.06, 0.06, IRON)
    j.ball(0.18, (0, 0, 3.75), WARN, subdiv=1, glow=True)
    j.ball(0.18, (L1, 0, 1.3), WARN, subdiv=1, glow=True)
    tx = 7.8
    j.box((0.8, 1.2, 0.3), (tx, 0, 1.0), "#5a5a5e")                        # the trolley
    j.plank_line((tx, 0, 0.9), (tx, 0, -6.0), 0.06, 0.06, IRON)
    j.box((0.5, 0.5, 0.4), (tx, 0, -6.1), CRANE)
    container(j, tx, 0, -7.6, CONTAINER[1], rot=0.4)
    jib = j.build(r, loc=(0, 0, H))
    spin(jib, "crane_slew_idle", period=16.0, swing=0.7)


def neon_sign(variants):
    """Signs tilted back to the sky so they read from above; the neon pulses."""
    for i in range(3):
        r = root("neon_sign", i)
        m = Model(f"neon_sign_{i}_frame", 480 + i)
        tilt = 0.75                                                        # leaning back, face to -y and up
        for x in (-1.0, 1.0):
            m.plank_line((x, 0.3, 0), (x, 0.3, 2.2), 0.14, 0.14, IRON)
            m.plank_line((x, 1.1, 0), (x, 0.3, 2.0), 0.1, 0.1, IRON)
        m.build(r)
        back = Model(f"neon_sign_{i}_back", 490 + i)
        neon = Model(f"neon_sign_{i}_neon", 495 + i)
        # both are drawn flat in the XY plane, then tipped up by the root's tilt
        if i == 0:
            # a fish: pink body outline, cyan eye and tail
            back.box((3.4, 1.8, 0.12), (0, 0, 0), SIGN_BACK)
            pts = [(-1.2, 0), (-0.5, 0.65), (0.6, 0.55), (1.1, 0), (0.6, -0.55), (-0.5, -0.65)]
            for k in range(len(pts)):
                a, b = pts[k], pts[(k + 1) % len(pts)]
                neon.plank_line((a[0], a[1], 0.1), (b[0], b[1], 0.1), 0.16, 0.12, NEON_PINK)
            neon.ball(0.17, (0.6, 0.15, 0.12), NEON_CYAN, subdiv=0, glow=True)
            for a, b in (((1.1, 0), (1.55, 0.5)), ((1.55, 0.5), (1.55, -0.5)), ((1.55, -0.5), (1.1, 0))):
                neon.plank_line((a[0], a[1], 0.1), (b[0], b[1], 0.1), 0.16, 0.12, NEON_CYAN)
        elif i == 1:
            # a column of glyphs: blocks in three colours on a long board
            back.box((1.3, 3.8, 0.12), (0, 0, 0), SIGN_BACK)
            cols = [NEON_PINK, NEON_CYAN, NEON_YELLOW, NEON_PINK]
            for k in range(4):
                y = 1.35 - k * 0.9
                neon.box((0.8, 0.14, 0.12), (0, y + 0.25, 0.1), cols[k])
                neon.box((0.14, 0.6, 0.12), (-0.2 + (k % 2) * 0.4, y, 0.1), cols[k])
                neon.box((0.6, 0.14, 0.12), (0.05, y - 0.2, 0.1), cols[k])
            neon.box((1.42, 0.12, 0.12), (0, 1.95, 0.1), NEON_CYAN)
            neon.box((1.42, 0.12, 0.12), (0, -1.95, 0.1), NEON_CYAN)
        else:
            # a cocktail glass and an arrow pointing at the door
            back.box((3.6, 1.9, 0.12), (0, 0, 0), SIGN_BACK)
            for a, b in (((-1.5, 0.6), (-0.5, 0.6)), ((-0.5, 0.6), (-1.0, 0.0)), ((-1.0, 0.0), (-1.5, 0.6)),
                         ((-1.0, 0.0), (-1.0, -0.55)), ((-1.3, -0.6), (-0.7, -0.6))):
                neon.plank_line((a[0], a[1], 0.1), (b[0], b[1], 0.1), 0.15, 0.12, NEON_PINK)
            neon.ball(0.12, (-0.7, 0.75, 0.12), NEON_GREEN, subdiv=0, glow=True)
            for a, b in (((0.0, 0.0), (1.4, 0.0)), ((1.4, 0.0), (0.95, 0.45)), ((1.4, 0.0), (0.95, -0.45))):
                neon.plank_line((a[0], a[1], 0.1), (b[0], b[1], 0.1), 0.17, 0.12, NEON_YELLOW)
        _glowify(neon)                                                     # every tube of it glows
        b = back.build(r, loc=(0, 0.7, 2.3))
        b.rotation_euler = (tilt, 0, 0)
        n = neon.build(b, loc=(0, 0, 0))
        pulse(n, f"neon_sign_{i}_flicker_idle", amp=0.06, period=0.9 + i * 0.35, axes=(1, 1, 3))


def _glowify(m):
    """Every colour in this model becomes its glowing twin."""
    from kit import material
    m.mats = [material("#" + mat.name[2:], glow=True) if mat.name.startswith("c_") else mat for mat in m.mats]


# --- colony bones -----------------------------------------------------------------------------

def _shell(m, rng, x0, x1, R, cz, a0, a1, colors, n=8, gap=0.06, plate=1.5):
    """Hull plating: plates round an arc (angles a0..a1 in the YZ plane) along x, ragged where torn."""
    xs = []
    x = x0
    while x < x1 - 0.2:
        w = min(plate * rng.uniform(0.8, 1.2), x1 - x)
        xs.append((x, x + w))
        x += w
    for j, (xa, xb) in enumerate(xs):
        # each ring of plates is torn off at a different angle
        top = a1 - rng.uniform(0, (a1 - a0) * 0.45) * (j % 3 != 0)
        pts = [Vector(((xa + xb) / 2, math.cos(a) * R, cz + math.sin(a) * R))
               for a in [a0 + (top - a0) * k / n for k in range(n + 1)]]
        ribbon(m, pts, [(xb - xa) / 2 - gap] * len(pts), colors[j % len(colors)], fold=0.0, thick=0.14,
               side=(1, 0, 0))


def _rib(m, x, R, cz, a0, a1, color, r=0.16, n=10):
    pts = [Vector((x, math.cos(a) * R, cz + math.sin(a) * R)) for a in [a0 + (a1 - a0) * k / n for k in range(n + 1)]]
    tube(m, pts, [r] * len(pts), color, segs=5)


def wreck_hull(variants):
    for i in range(3):
        r = root("wreck_hull", i)
        rng = random.Random(520 + i)
        m = Model(f"wreck_hull_{i}", 520 + i)
        if i == 0:
            # a section of an ark's hull, lying on its side, the far half of its plating gone
            R, cz, L = 4.0, 2.4, 12.0
            _shell(m, rng, -L / 2, L / 2, R, cz, -0.7, 2.0, [PAINT[0], PAINT[1], RUST[2], PAINT[0], STRIPE, PAINT[1]])
            for k in range(5):                                             # the marsh taking it back
                lump(m, rng, (rng.uniform(-L / 2, L / 2), rng.uniform(1.0, 3.0), rng.uniform(4.6, 5.6)), (1.0, 0.8, 0.35), MOSS[k % 3], n=8, flat=0.5)
            for k in range(7):
                _rib(m, -L / 2 + k * L / 6, R + 0.1, cz, -0.6, math.pi + 0.5 - (k % 2) * 0.8, RUST[3], r=0.2)
            m.box((L, 0.6, 0.5), (0, -2.0, 0.2), RUST[3])                  # a deck spar inside
            for k in range(3):                                             # a white band with the ark's stripe
                pass
            pts = [Vector((0, math.cos(a) * (R + 0.08), cz + math.sin(a) * (R + 0.08))) for a in (0.3, 0.6, 0.9, 1.2)]
            ribbon(m, pts, [L * 0.3] * 4, STRIPE, fold=0.0, thick=0.05, side=(1, 0, 0))
            m.build(r, rot_z=0.3)
        elif i == 1:
            # the bow, nose up out of the marsh, a row of dead windows
            bow = Model(f"wreck_hull_{i}_bow", 521)
            pts = [Vector((0, 0, -1.0)), Vector((0, 1.5, 1.2)), Vector((0, 3.0, 3.2)), Vector((0, 4.1, 5.0)),
                   Vector((0, 4.8, 6.4)), Vector((0, 5.1, 7.2))]
            tube(bow, pts, [3.2, 3.1, 2.8, 2.2, 1.4, 0.0], RUST[0], segs=8,
                 colors=[RUST[3], PAINT[1], STRIPE, PAINT[0], RUST[2]])
            for k in range(5):                                             # windows facing the sky
                t = 0.35 + k * 0.1
                p = Vector((0, 1.5 + 3.1 * t, 1.2 + 4.5 * t))
                bow.box((0.5, 0.35, 0.2), (-1.6 + k * 0.8, p.y - 0.6, p.z + 1.3 - k * 0.0), DARK, rot=(-0.9, 0, 0))
            bow.box((2.4, 1.6, 0.3), (0, 2.0, 3.6), STRIPE, rot=(-0.9, 0, 0))
            for k in range(4):                                             # torn plates at the break
                a = k * math.tau / 4 + 0.4
                bow.box((0.9, 0.2, 1.4), (math.cos(a) * 2.8, -0.6 + math.sin(a) * 0.4, 0.2 + math.sin(a) * 1.5),
                        RUST[k % 3], rot=(0.4, 0.3 * k, a))
            bow.build(r, rot_z=-0.5)
            for k in range(4):
                lump(m, rng, (rng.uniform(-3, 3), rng.uniform(-3.5, -1.5), 0.1), (0.6, 0.5, 0.35), RUST[k % 4], n=8, flat=0.5)
            m.build(r)
        else:
            # the engine block: three great bells, on their sides, half sunk
            m.box((5.6, 3.0, 3.0), (0, 1.8, 1.2), "#8a8c86")
            m.box((5.0, 2.6, 0.2), (0, 1.8, 2.8), PAINT[1])
            m.box((1.2, 2.7, 0.22), (-1.6, 1.8, 2.82), STRIPE)
            for k, x in enumerate((-1.8, 0, 1.8)):
                m.cyl(1.0, 3.6, (x, 0.3, 1.4), RUST[k % 3], segs=8, r_top=0.45, rot=(math.pi / 2 + 0.1, 0, 0))
                m.cyl(0.8, 3.0, (x, 0.0, 1.4), DARK, segs=8, r_top=0.3, rot=(math.pi / 2 + 0.1, 0, 0))
            for k in range(3):
                m.plank_line((-2.5 + k * 2.5, 3.3, 2.6), (-2.0 + k * 2.2, 5.0, 0.1), 0.25, 0.25, RUST[3])
            m.build(r, rot_z=0.4)


def wreck_mast(variants):
    for i in range(3):
        r = root("wreck_mast", i)
        rng = random.Random(560 + i)
        m = Model(f"wreck_mast_{i}", 560 + i)
        if i == 0:
            # a comms mast, leaning, two yards and a dish
            top = (1.6, 0.8, 7.0)
            m.plank_line((0, 0, -1), top, 0.55, 0.55, RUST[0])
            for t, w in ((0.55, 2.4), (0.8, 1.6)):
                p = Vector(top) * t
                m.box((w * 1.3, 0.3, 0.3), (p.x, p.y, p.z), RUST[2], rot=(0, -0.2, 0.3))
            p = Vector(top) * 0.7
            m.ball(1.0, (p.x + 0.6, p.y - 0.4, p.z), PAINT[0], subdiv=1, scale=(1, 1, 0.35), rot=(0.9, 0.3, 0))
            m.ball(0.3, top, "#ff5a3a", subdiv=1, glow=True)
            m.cyl(0.6, 0.6, (0, 0, -0.3), RUST[3], segs=6, r_top=0.4)
        elif i == 1:
            # a lattice tower, bent over at half height
            pts = [Vector((0, 0, -1)), Vector((0, 0, 3.5)), Vector((1.5, 0.4, 5.6)), Vector((3.6, 0.8, 6.4))]
            for dx, dy in ((-0.35, -0.35), (0.35, -0.35), (0.35, 0.35), (-0.35, 0.35)):
                for a, b in zip(pts, pts[1:]):
                    m.plank_line((a.x + dx, a.y + dy, a.z), (b.x + dx, b.y + dy, b.z), 0.22, 0.22, RUST[(int(dx > 0))])
            for a, b in zip(pts, pts[1:]):
                for k in range(3):
                    p = a.lerp(b, (k + 0.5) / 3)
                    q = a.lerp(b, (k + 1.0) / 3)
                    m.plank_line((p.x - 0.35, p.y - 0.35, p.z), (q.x + 0.35, q.y - 0.35, q.z), 0.08, 0.08, RUST[2])
                    m.plank_line((p.x - 0.35, p.y + 0.35, p.z), (q.x + 0.35, q.y + 0.35, q.z), 0.08, 0.08, RUST[2])
            m.ball(0.22, (3.7, 0.8, 6.5), "#ff5a3a", subdiv=1, glow=True)
        else:
            # a stub of a sensor mast with its radar still on top, and a torn sail of hull plate
            m.cyl(0.65, 6.0, (0, 0, -1), RUST[1], segs=6, r_top=0.45)
            m.box((3.6, 0.7, 1.2), (0, 0, 5.3), PAINT[0], rot=(0.2, 0, 0.5))
            m.box((2.8, 0.72, 0.3), (0, 0, 5.05), STRIPE, rot=(0.2, 0, 0.5))
            m.box((2.4, 0.25, 3.4), (0.9, -1.0, 1.0), RUST[2], rot=(0.3, 0.2, 0.9))
            m.ball(0.25, (0, 0, 6.0), "#ff5a3a", subdiv=1, glow=True)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def build():
    kelp_tower(4)
    glow_bulb(4)
    buoy(2)
    stilt_house(7)
    container_stack(3)
    crane(1)
    neon_sign(3)
    wreck_hull(3)
    wreck_mast(3)
