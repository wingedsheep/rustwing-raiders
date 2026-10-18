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


def _lanterns(m, rng, pts, every=2, r=0.22):
    for k, p in enumerate(pts):
        if k and k % every == 0:
            m.ball(r * rng.uniform(0.8, 1.2), (p.x + rng.uniform(-0.15, 0.15), p.y + rng.uniform(-0.15, 0.15), p.z),
                   LANTERN, subdiv=1, glow=True)


def kelp_tower(variants):
    """Kelp rising out of the water (z = 0), lit from within by gold lantern bladders."""
    shapes = [(4, 5.5), (5, 6.5), (3, 4.2)]
    for i, (n, H) in enumerate(shapes):
        r = root("kelp_tower", i, height=round(H + 0.6, 2))
        rng = random.Random(300 + i)
        # the surface mat doesn't sway
        mat = Model(f"kelp_tower_{i}_mat", 300 + i)
        for k in range(7):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.8, 2.0)
            L = rng.uniform(1.2, 2.0)
            p0 = (math.cos(a) * d * 0.4, math.sin(a) * d * 0.4, 0.04)
            b = a + rng.uniform(-0.6, 0.6)
            pts = [Vector(p0) + Vector((math.cos(b) * L * t, math.sin(b) * L * t, 0.0)) for t in (0, 0.33, 0.66, 1)]
            ribbon(mat, pts, [0.12, 0.3, 0.26, 0.08], *KELP_LEAF[k % 3], fold=0.15, thick=0.04)
        for k in range(4):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(1.0, 2.0)
            mat.ball(0.2, (math.cos(a) * d, math.sin(a) * d, 0.05), LANTERN, subdiv=1, scale=(1, 1, 0.6), glow=True)
        mat.build(r)
        m = Model(f"kelp_tower_{i}", 310 + i)
        for k in range(n):
            a = k * math.tau / n + rng.uniform(-0.3, 0.3)
            d = rng.uniform(0.2, 0.6)
            h = H * rng.uniform(0.7, 1.0)
            base = (math.cos(a) * d, math.sin(a) * d, -1.0)
            lean = (math.cos(a) * rng.uniform(0.4, 1.0), math.sin(a) * rng.uniform(0.4, 1.0))
            pts = bend(base, (base[0], base[1], h), lean, n=7)
            tube(m, pts, [0.16, 0.15, 0.14, 0.13, 0.12, 0.11, 0.1, 0.06], KELP[k % 3], segs=5)
            # blades streaming off the stalk, drooping
            for j in range(2, 8):
                p = pts[j]
                yaw = rng.uniform(0, math.tau)
                c1, c2 = KELP_LEAF[(j + k) % 3]
                bl = arc((p.x, p.y, p.z), yaw, rng.uniform(0.8, 1.4), 0.3, 1.2, n=4)
                ribbon(m, bl, [0.06, 0.2, 0.22, 0.16, 0.04], c1, c2, fold=0.2, thick=0.04)
            _lanterns(m, rng, pts, every=2)
            tp = pts[-1]
            m.ball(0.34, (tp.x, tp.y, tp.z + 0.15), LANTERN, subdiv=1, scale=(1, 1, 1.25), glow=True)
            m.ball(0.17, (tp.x, tp.y, tp.z + 0.42), LANTERN_HOT, subdiv=1, glow=True)
        obj = m.build(r)
        sway(obj, f"kelp_tower_{i}_sway_idle", amp=(0.05, 0.04), period=4.0 + i * 0.5, phase=i)


def glow_bulb(variants):
    """A raft of glowing bladders floating at the surface, roped together by tendrils."""
    tints = ["amber", "pink", "cyan"]
    for i, tint in enumerate(tints):
        r = root("glow_bulb", i)
        rng = random.Random(330 + i)
        m = Model(f"glow_bulb_{i}_weed", 330 + i)
        main, hot = BULB[tint]
        spots = [(0, 0, 0.55)]
        for k in range(4 + i):
            a = k * math.tau / (4 + i) + rng.uniform(-0.3, 0.3)
            d = rng.uniform(0.7, 1.3)
            spots.append((math.cos(a) * d, math.sin(a) * d, rng.uniform(0.22, 0.4)))
        for k, (x, y, s) in enumerate(spots[1:]):                           # tendrils between them
            pts = [Vector((0, 0, 0.05)), Vector((x * 0.5, y * 0.5 + 0.1, 0.08)), Vector((x, y, 0.05))]
            ribbon(m, pts, [0.08, 0.1, 0.06], KELP[k % 3], fold=0.1, thick=0.05)
        for k in range(5):
            a = rng.uniform(0, math.tau)
            b = a + rng.uniform(-0.5, 0.5)
            L = rng.uniform(0.9, 1.5)
            pts = [Vector((math.cos(a) * 0.4 + math.cos(b) * L * t, math.sin(a) * 0.4 + math.sin(b) * L * t, 0.03))
                   for t in (0, 0.5, 1)]
            ribbon(m, pts, [0.1, 0.24, 0.06], *KELP_LEAF[k % 3], fold=0.15, thick=0.04)
        m.build(r)
        g = Model(f"glow_bulb_{i}", 340 + i)
        for x, y, s in spots:
            g.ball(s, (x, y, s * 0.35), main, subdiv=1, scale=(1, 1, 0.9), glow=True)
            g.ball(s * 0.45, (x - s * 0.25, y - s * 0.25, s * 0.85), hot, subdiv=1, glow=True)
        obj = g.build(r)
        pulse(obj, f"glow_bulb_{i}_pulse_idle", amp=0.1, period=2.0 + i * 0.4)


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


def stilt_house(variants):
    for i in range(4):
        r = root("stilt_house", i)
        rng = random.Random(400 + i)
        m = Model(f"stilt_house_{i}", 400 + i)
        Z = 1.8
        if i == 0:
            stilts(m, rng, 0, 0, 3.6, 3.0, Z)
            deck(m, 0, 0, 3.8, 3.2, Z)
            shack(m, rng, 0.2, 0.3, Z + 0.08, 2.8, 2.2, 1.6, WALL[0], ROOF[0], neon=NEON_PINK)
            for k in range(2):
                m.cyl(0.28, 0.6, (-1.5 + k * 0.6, -1.25, Z + 0.08), BARREL[k], segs=7)
        elif i == 1:
            # two storeys, the top one smaller and turned, a water tank on the roof
            stilts(m, rng, 0, 0, 4.0, 3.4, Z)
            deck(m, 0, 0, 4.2, 3.6, Z)
            shack(m, rng, 0, 0.2, Z + 0.08, 3.4, 2.8, 1.5, WALL[2], ROOF[2], door=True)
            shack(m, rng, 0.4, 0.4, Z + 1.75, 2.0, 1.8, 1.3, WALL[1], ROOF[0], neon=NEON_CYAN, rot=0.25, door=False)
            m.cyl(0.45, 0.9, (-1.1, 0.8, Z + 1.75), "#5a7a8a", segs=8)
            m.cyl(0.47, 0.1, (-1.1, 0.8, Z + 2.65), "#3a4a5a", segs=8)
            m.plank_line((1.4, -1.0, Z + 1.7), (1.4, -1.0, Z + 4.3), 0.06, 0.06, IRON)            # antenna
            m.ball(0.12, (1.4, -1.0, Z + 4.35), WARN, subdiv=1, glow=True)
        elif i == 2:
            # a long house with a walkway out to a little store and a dish
            stilts(m, rng, -1.0, 0, 4.6, 2.8, Z)
            deck(m, -1.0, 0, 4.8, 3.0, Z)
            shack(m, rng, -1.2, 0.2, Z + 0.08, 4.0, 2.2, 1.5, WALL[3], ROOF[1], neon=NEON_PINK)
            stilts(m, rng, 3.0, 0.3, 1.8, 1.8, Z)
            deck(m, 3.0, 0.3, 2.0, 2.0, Z)
            shack(m, rng, 3.0, 0.4, Z + 0.08, 1.5, 1.4, 1.2, WALL[4], ROOF[3], door=False)
            deck(m, 1.6, 0.0, 1.2, 0.8, Z - 0.02)                                                  # the walkway
            m.ball(0.5, (-2.6, 0.6, Z + 2.0), "#c8c8c0", subdiv=1, scale=(1, 1, 0.45), rot=(0.6, 0, 0))   # dish
            m.cyl(0.06, 0.5, (-2.6, 0.6, Z + 1.55), IRON, segs=4)
        else:
            # a noodle stall: an open front under a striped awning, lanterns strung across
            stilts(m, rng, 0, 0, 3.4, 3.2, Z)
            deck(m, 0, 0, 3.6, 3.4, Z)
            shack(m, rng, 0, 0.6, Z + 0.08, 3.0, 1.6, 1.7, WALL[1], ROOF[3], neon=NEON_CYAN, door=False)
            for k in range(5):
                m.box((0.62, 1.3, 0.1), (-1.25 + k * 0.62, -0.75, Z + 1.75), ("#e8e0d0", "#c83a3a")[k % 2], rot=(-0.3, 0, 0))
            m.box((2.6, 0.6, 0.8), (0, -0.4, Z + 0.48), "#5a3a2a")                                 # the counter
            for k in range(5):
                m.ball(0.14, (-1.4 + k * 0.7, -1.5, Z + 1.55), (NEON_PINK, NEON_YELLOW)[k % 2], subdiv=1, glow=True)
            m.box((1.6, 0.1, 0.5), (0, 1.48, Z + 2.25), SIGN_BACK)                                 # a small sign on top
            m.box((1.3, 0.12, 0.22), (0, 1.48, Z + 2.25), NEON_PINK, glow=True)
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
            _shell(m, rng, -L / 2, L / 2, R, cz, -0.7, 2.0, RUST[:3] + [PAINT[0]])
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
                 colors=[RUST[3], RUST[0], PAINT[0], PAINT[1], RUST[2]])
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
            m.box((5.6, 3.0, 3.0), (0, 1.8, 1.2), RUST[1])
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
    kelp_tower(3)
    glow_bulb(3)
    buoy(2)
    stilt_house(4)
    container_stack(3)
    crane(1)
    neon_sign(3)
    wreck_hull(3)
    wreck_mast(3)
