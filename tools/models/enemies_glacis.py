"""Glacis, the White Furnace: the Waking Engine's machines (white/slate lattice tech round orange
furnace light, an ancient precision under the ice) and the tundra's tusked bull. Seeds 5000-5999.

    frost_wisp    dart     an ice-shard arrowhead round a furnace core, shard streamers trailing
    engine_eye    turret   a great furnace eye on a hex plinth in the ice; underslung twin guns
    pylon_warden  lancer   a flying pylon: a tuning fork of two prongs, the beam forms between them
    tusked_bull   brute    a shaggy mammoth bull, huge sweeping tusks, ears that flap it along
    hail_layer    bomber   a broad white flying wing, dark lattice spars, a hopper drum of cyan hail
    engine_hive   carrier  a long hex hive with a honeycomb deck: the open cells glow and launch
"""
from __future__ import annotations

import math

from kit import Model
from creatures_util import TAU, chain, flat, limb, osc, sample
from enemies_lib import A, B, C, DARK, GLASS, both, fin, flame, hull, marker, mirror, named, pulse, spin, tube, wing_pair

ICE = "#eaf4ff"     # frost crusts that never change colour


def _ring(r, n, rot=0.0, sx=1.0, sy=1.0):
    return [(math.cos(TAU * k / n + rot) * r * sx, math.sin(TAU * k / n + rot) * r * sy) for k in range(n)]


def _scale(pts, k, cx=0.0, cy=0.0):
    return [(cx + (x - cx) * k, cy + (y - cy) * k) for x, y in pts]


def _bar(m, a, b, w, h, z, color, glow=False):
    """A flat strut from (x, y) a to b at height z: lattice frames."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    m.box((w, L, h), ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z), color, rot=(0, 0, math.atan2(-dx, dy)), glow=glow)


def _sym(half):
    """A closed outline from its +x half listed from the tail (x = 0) round to the nose (x = 0)."""
    return half + [(-x, y) for x, y in reversed(half[1:-1])]


# --- Frost Wisp: dart, ~2.2 ------------------------------------------------------------------------

def frost_wisp():
    kind, clip, root = named("frost_wisp", "dart", "mech", "drift", preview=("#e8f0ff", "#4a6aa0", "#ff8a2a"))
    T = 1.5
    b = Model(f"{kind}_body", seed=5001)
    # the dark lattice keel under everything: it outlines the white shards on snow
    keel = _sym([(0, -0.55), (0.42, -0.2), (0.5, 0.2), (0.16, 1.0), (0, 1.22)])
    hull(b, keel, -0.22, 0.02, B.shade(0.8), inset=0.85)
    # the arrowhead: a big white shard, split down the middle by a dark spine
    for pts in both([(0.04, 1.16), (0.04, 0.25), (0.46, 0.05), (0.36, 0.42)]):
        hull(b, pts, 0.0, 0.2, A, inset=0.8)
    b.box((0.12, 0.95, 0.08), (0, 0.66, 0.2), B)
    # swept side shards, a darker rim plate under each so they never melt into the snow
    for s, pts in ((1, [(0.32, 0.1), (0.42, -0.25), (1.1, -0.72), (0.8, -0.12)]),):
        for p in (pts, mirror(pts)):
            flat(b, _scale(p, 1.12, (p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2), -0.04, 0.08, B)
            hull(b, p, 0.0, 0.14, A.shade(1.05), inset=0.75)
    for sx in (1, -1):  # bent tips: one shard a touch longer, hand-cut
        b.box((0.24, 0.26, 0.12), (sx * (1.0 if sx > 0 else 0.96), -0.64, 0.08), C, glow=True, rot=(0, 0, sx * 0.6))
    # the furnace core: a dark lattice cage round an orange heart
    b.ball(0.36, (0, -0.12, 0.08), B.shade(0.7), subdiv=0, scale=(1.0, 1.15, 0.8))
    b.ball(0.26, (0, -0.12, 0.26), C, subdiv=0, glow=True)
    body = b.build(root)
    cage = Model(f"{kind}_cage", seed=5002)
    pts = _ring(0.42, 6)
    for k in range(6):
        _bar(cage, pts[k], pts[(k + 1) % 6], 0.11, 0.1, 0.0, B.shade(0.6))
    for k in range(0, 6, 2):
        cage.box((0.14, 0.14, 0.14), (pts[k][0], pts[k][1], 0.04), A.shade(1.1))
    cobj = cage.build(body, loc=(0, -0.12, 0.3))
    spin(cobj, clip, T, 1)
    # three shard streamers trail behind and swish like a wisp's tail
    for k, (x, L, w) in enumerate(((0.0, 0.75, 0.24), (0.3, 0.6, 0.18), (-0.3, 0.55, 0.18))):
        t = Model(f"{kind}_trail_{k}", seed=5003 + k)
        flat(t, [(0, 0.1), (-w * 1.25, -0.2), (0, -L), (w * 1.25, -0.2)], -0.02, 0.08, B)
        flat(t, [(0, 0.05), (-w, -0.2), (0, -L + 0.12), (w, -0.2)], 0.04, 0.08, A.shade(0.95))
        t.box((0.12, 0.18, 0.08), (0, -L + 0.2, 0.1), C, glow=True)
        obj = t.build(body, loc=(x, -0.42, 0.0))
        obj.rotation_euler[2] = -x * 0.6
        osc(obj, clip, "rotation_euler", T, (2, 0.22, 1, k * 0.18), (0, 0.08, 2, k * 0.1))
    marker(body, kind, "muzzle", (0, 1.25, 0.05))
    osc(body, clip, "location", T, (2, 0.06, 1, 0), (0, 0.05, 1, 0.25))
    osc(body, clip, "rotation_euler", T, (1, 0.09, 1, 0.25))


# --- Engine Eye: turret, ~2.5 ----------------------------------------------------------------------

def engine_eye():
    kind, clip, root = named("engine_eye", "turret", "mech", "watch", ground=1,
                             preview=("#5a6a7a", "#2a3040", "#ff8a2a"))
    T = 3.0
    b = Model(f"{kind}_base", seed=5010)
    hexo = _ring(1.25, 6, math.pi / 6)
    hull(b, hexo, 0, 0.42, B, inset=0.86)
    hull(b, _ring(0.98, 6, math.pi / 6), 0.42, 0.56, A, inset=0.9)
    for k in range(6):  # furnace slits in the plinth's faces, lattice ribs across the top
        a = TAU * k / 6
        b.box((0.5, 0.16, 0.16), (math.cos(a) * 1.04, math.sin(a) * 1.04, 0.22), C, glow=True, rot=(0, 0, a + math.pi / 2))
        p, q = hexo[k], hexo[(k + 1) % 6]
        _bar(b, (p[0] * 0.78, p[1] * 0.78), (q[0] * 0.78, q[1] * 0.78), 0.12, 0.08, 0.58, B.shade(0.8))
    for x, y, r in ((-1.05, 0.55, 0.38), (0.95, -0.75, 0.32), (-0.55, -1.0, 0.26)):  # half-buried in ice
        b.ball(r, (x, y, 0.1), ICE, subdiv=0, scale=(1.2, 1.0, 0.7), jitter=0.05)
    base = b.build(root)
    g = Model(f"{kind}_gimbal", seed=5011)  # a lattice ring that turns round the eye's foot
    gp = _ring(0.8, 8)
    for k in range(8):
        _bar(g, gp[k], gp[(k + 1) % 8], 0.14, 0.12, 0.0, B.shade(0.7))
        if k % 2 == 0:
            g.box((0.18, 0.18, 0.12), (gp[k][0], gp[k][1], 0.06), C, glow=True)
    gobj = g.build(base, loc=(0, 0, 0.62))
    spin(gobj, clip, T, -1)
    # the head: a big armoured eyeball, its furnace iris staring up and out; guns under its cheeks
    E = 1.0                                                    # the lens looks this far up from level
    d = (0, math.cos(E), math.sin(E))
    tilt = (-(math.pi / 2 - E), 0, 0)
    c0 = (0, 0.05, 0.55)
    h = Model(f"{kind}_head", seed=5012)
    h.ball(0.68, c0, A, subdiv=1, scale=(1, 1, 0.85))
    h.ball(0.6, (0, -0.42, 0.6), B, subdiv=1, scale=(1.1, 0.75, 0.75))                  # dark hood behind
    h.box((0.2, 0.7, 0.2), (0, -0.62, 0.95), A.shade(1.3), rot=(0.4, 0, 0))                # a pale spine on the hood
    h.cyl(0.62, 0.12, (0, c0[1] + d[1] * 0.36, c0[2] + d[2] * 0.36), B.shade(0.6), segs=8, rot=tilt)  # socket rim
    h.cyl(0.52, 0.1, (0, c0[1] + d[1] * 0.44, c0[2] + d[2] * 0.44), DARK, segs=8, rot=tilt)
    for s in (1, -1):
        h.box((0.32, 0.75, 0.3), (s * 0.6, 0.15, 0.22), B)                                  # cheek mounts
        tube(h, 0.12, 0.3, 1.35, s * 0.6, 0.22, DARK, segs=6)
        tube(h, 0.17, 0.3, 0.8, s * 0.6, 0.22, A.shade(0.8), segs=6)
        h.cyl(0.14, 0.06, (s * 0.6, 1.33, 0.22), C, segs=6, rot=(-math.pi / 2, 0, 0), glow=True)
    head = h.build(base, loc=(0, 0, 0.6), part="head")
    head.name = f"{kind}_head"
    iris = Model(f"{kind}_iris", seed=5013)
    iris.cyl(0.44, 0.08, (0, 0, 0), C, segs=8, glow=True)
    iris.cyl(0.26, 0.06, (0, 0, 0.07), C.shade(1.2), segs=8, glow=True)
    iris.box((0.13, 0.5, 0.06), (0, 0, 0.12), DARK)                                         # slit pupil
    iobj = iris.build(head, loc=(0, c0[1] + d[1] * 0.5, c0[2] + d[2] * 0.5))
    iobj.rotation_euler = tilt
    # it dilates as it hunts and blinks once a loop
    sample(iobj, clip, "scale", T, lambda u: (0.12 * math.sin(TAU * 2 * u), -0.85 if 0.47 < u < 0.53 else 0.12 * math.sin(TAU * 2 * u), 0), step=1)
    osc(head, clip, "rotation_euler", T, (2, 0.35, 1, 0))
    for k, s in enumerate((1, -1)):
        marker(head, kind, "muzzle", (s * 0.55, 1.4, 0.22), k)


# --- Pylon Warden: lancer, ~3 ----------------------------------------------------------------------

def pylon_warden():
    kind, clip, root = named("pylon_warden", "lancer", "mech", "charge", preview=("#8a9aaa", "#2a3040", "#ff6a1a"))
    T = 1.0
    b = Model(f"{kind}_body", seed=5020)
    # the stock: a machined hex block, dark under, light slate on top, a furnace grill set in it
    stock = _ring(0.62, 6, 0, 1.0, 1.25)
    stock = [(x, y - 0.95) for x, y in stock]
    hull(b, stock, -0.32, 0.12, B, inset=0.88)
    hull(b, _scale(stock, 0.85, 0, -0.95), 0.12, 0.32, A, inset=0.8)
    for k in range(3):
        b.box((0.42, 0.1, 0.06), (0, -0.75 - k * 0.2, 0.34), C, glow=True)
    b.box((0.12, 0.8, 0.08), (0.3, -1.0, 0.34), B.shade(0.8))
    b.box((0.12, 0.8, 0.08), (-0.3, -1.0, 0.34), B.shade(0.8))
    # the tuning fork: two long prongs, dark with a light slate cap; glowing inner faces
    for s in (1, -1):
        prong = [(s * 0.3, -0.55), (s * 0.62, -0.4), (s * 0.5, 1.5), (s * 0.32, 1.3)]
        if s < 0:
            prong = list(reversed(prong))
        hull(b, prong, -0.22, 0.14, B, inset=0.85)
        b.box((0.16, 1.6, 0.08), (s * 0.48, 0.45, 0.16), A.shade(1.15), rot=(0, 0, s * 0.06))
        b.box((0.1, 1.55, 0.16), (s * 0.31, 0.5, -0.02), C, glow=True, rot=(0, 0, -s * 0.03))
        b.ball(0.16, (s * 0.42, 1.5, -0.04), C, subdiv=0, glow=True)                         # prong tips
        fin(b, [(-0.7, 0.1), (-1.45, 0.1), (-1.55, 0.6), (-1.15, 0.55)], s * 0.45, 0.07, A.shade(0.85))
        tube(b, 0.14, -1.4, -1.6, s * 0.22, -0.08, DARK, segs=6)
        b.cyl(0.11, 0.05, (s * 0.22, -1.61, -0.08), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    body = b.build(root)
    # a slate halo round the stock, turning: the pylon's crown
    hal = Model(f"{kind}_halo", seed=5021)
    hp = _ring(0.82, 8)
    for k in range(8):
        _bar(hal, hp[k], hp[(k + 1) % 8], 0.14, 0.1, 0.0, A.shade(0.75) if k % 2 else B.shade(0.9))
    for k in range(0, 8, 2):
        hal.box((0.2, 0.2, 0.14), (hp[k][0], hp[k][1], 0.04), C, glow=True)
    hobj = hal.build(body, loc=(0, -0.95, 0.12))
    spin(hobj, clip, T, 1)
    # arcs strung between the prongs, chasing forward to the emitter
    for k in range(4):
        a = Model(f"{kind}_arc_{k}")
        a.box((0.5, 0.14, 0.1), (0, 0, 0), C, glow=True, rot=(0, 0, 0.25 if k % 2 else -0.25))
        obj = a.build(body, loc=(0, -0.15 + k * 0.42, -0.02))
        sample(obj, clip, "scale", T, lambda u, k=k: (0.6 * math.sin(TAU * (u - k / 4)) - 0.2, 0, 0))
    tip = Model(f"{kind}_tip")
    tip.ball(0.2, (0, 0, 0), C, subdiv=1, glow=True)
    tobj = tip.build(body, loc=(0, 1.4, -0.02))
    pulse(tobj, clip, T, 0.35, harm=2)
    marker(body, kind, "emitter", (0, 1.55, -0.02))
    osc(body, clip, "location", T, (2, 0.05, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.03, 1, 0.25))


# --- Tusked Bull: brute beast, ~6 ------------------------------------------------------------------

def tusked_bull():
    kind, clip, root = named("tusked_bull", "brute", "beast", "charge", preview=("#7a5a4a", "#e8e0d0", "#ff8a2a"))
    T = 1.2
    b = Model(f"{kind}_body", seed=5030)
    def top(y):  # the height of the back at y (the bulk and the shoulder hump)
        t1 = 0.95 * math.sqrt(max(0.0, 1 - ((y + 0.5) / 1.75) ** 2))
        t2 = 0.5 + 0.9 * math.sqrt(max(0.0, 1 - ((y - 0.55) / 0.95) ** 2))
        return max(t1, t2)
    b.ball(1.0, (0, -0.45, -0.3), A.shade(0.5), subdiv=1, scale=(1.3, 1.7, 0.75))         # dark belly fur
    b.ball(1.0, (0, -0.5, 0.0), A, subdiv=2, scale=(1.4, 1.75, 0.95), jitter=0.04)        # the bulk
    b.ball(1.0, (0, 0.55, 0.5), A.shade(1.1), subdiv=1, scale=(1.25, 0.95, 0.9), jitter=0.04)   # shoulder hump
    for s in (1, -1):  # a shaggy skirt of darker fur hanging round the flanks: the dark rim from above
        for k, y in enumerate((0.7, -0.1, -0.9, -1.6)):
            w = 1.35 if k < 3 else 1.05
            b.ball(0.5, (s * w, y + 0.1 * s, -0.25), A.shade(0.68), subdiv=1, scale=(0.8, 1.3, 1.0), jitter=0.06)
    # a frosted mane down the spine: pale shag in tufts, proud of the back
    for k in range(6):
        y = 1.0 - k * 0.55
        b.ball(0.34 - k * 0.025, (0.07 * (-1) ** k, y, top(y) + 0.02), B, subdiv=0, scale=(1.25, 1.2, 0.6), jitter=0.04)
    # the furnace scar: the Engine's brand burnt across the hump, glowing
    for k, (x, y, r) in enumerate(((0.62, 0.35, 0.55), (-0.68, -0.05, -0.5), (0.55, -0.85, 0.45))):
        b.box((0.5, 0.24, 0.14), (x, y, top(y) * 0.93 - 0.08), C, glow=True, rot=(0, 0.35 * (1 if x > 0 else -1), r))
    # the head: a tall domed skull, low and forward, eyes glowing, the brand on its brow
    b.ball(0.8, (0, 1.75, 0.2), A.shade(0.88), subdiv=1, scale=(1.0, 0.9, 0.9), jitter=0.03)
    b.ball(0.55, (0, 1.72, 0.75), A.shade(1.15), subdiv=1, scale=(1.05, 0.85, 0.7))        # domed crown
    b.box((0.36, 0.22, 0.12), (0, 2.12, 0.78), C, glow=True, rot=(0.6, 0, 0))
    for s in (1, -1):
        b.ball(0.18, (s * 0.5, 2.22, 0.4), C, subdiv=1, glow=True)
        b.box((0.34, 0.16, 0.12), (s * 0.5, 2.27, 0.58), DARK, rot=(0.3, 0, s * 0.3))      # heavy brows
        b.ball(0.3, (s * 0.42, 2.25, -0.25), B.shade(0.8), subdiv=0)                      # tusk sockets
        chain(b, [(s * 0.42, 2.3, -0.3), (s * 1.05, 3.0, -0.45), (s * 1.5, 3.6, -0.1), (s * 1.2, 4.0, 0.45)],
              [0.3, 0.24, 0.16, 0.05], B, segs=6)                                          # the great tusks
        b.cyl(0.27, 0.12, (s * 1.0, 2.95, -0.45), B.shade(0.7), segs=6, rot=(-0.9, 0, -s * 0.7))   # a worn band
    limb(b, (0, -2.0, 0.1), (0.12, -2.45, -0.1), 0.16, 0.07, A.shade(0.6), segs=5)        # tail
    b.ball(0.2, (0.13, -2.5, -0.12), B.shade(0.9), subdiv=0)
    body = b.build(root)
    # trunk: hangs between the tusks and swings as it runs
    t = Model(f"{kind}_trunk", seed=5031)
    chain(t, [(0, 0, 0), (0, 0.4, -0.25), (0.05, 0.85, -0.3), (0.0, 1.15, -0.05)], [0.24, 0.18, 0.13, 0.1], A.shade(0.75), segs=6)
    t.ball(0.12, (0.0, 1.2, 0.0), C, subdiv=0, glow=True)                                # steaming breath
    tobj = t.build(body, loc=(0, 2.35, -0.05))
    osc(tobj, clip, "rotation_euler", T, (2, 0.3, 1, 0), (0, 0.15, 2, 0.1))
    # great ears: it flaps along on them
    def inner(w, s):
        pts = [(0.15, 0.3), (0.15, -0.35), (0.7, -0.6), (1.2, -0.35), (1.25, 0.1)]
        flat(w, pts if s > 0 else mirror(pts), 0.07, 0.05, A.shade(1.3))
    wing_pair(body, f"{kind}_ear", (0.62, 1.55, 0.4),
              [(0, 0.45), (0, -0.5), (0.7, -0.85), (1.4, -0.6), (1.6, 0.05), (1.05, 0.55)], 0.1, A.shade(0.65),
              clip, T, 0.45, dihedral=0.15, extra=inner)
    # four stumpy legs galloping underneath
    for k, (x, y) in enumerate(((0.8, 0.7), (-0.8, 0.7), (0.8, -1.3), (-0.8, -1.3))):
        lg = Model(f"{kind}_leg_{k}")
        limb(lg, (0, 0, 0), (0, 0.05, -0.85), 0.34, 0.26, A.shade(0.6), segs=6)
        lg.cyl(0.28, 0.16, (0, 0.05, -1.0), DARK, segs=6)
        obj = lg.build(body, loc=(x, y, -0.3))
        osc(obj, clip, "rotation_euler", T, (0, 0.5, 1, (0.0 if k in (0, 3) else 0.5)))
    for k, s in enumerate((1, -1)):
        marker(body, kind, "muzzle", (s * 1.0, 4.0, 0.35), k)
    osc(body, clip, "location", T, (2, 0.12, 2, 0))
    osc(body, clip, "rotation_euler", T, (0, 0.04, 2, 0.25), (1, 0.03, 1, 0))


# --- Hail Layer: bomber, ~4.5 wide -----------------------------------------------------------------

def hail_layer():
    kind, clip, root = named("hail_layer", "bomber", "mech", "fly", preview=("#c8d8e8", "#4a5a6a", "#4ae8ff"))
    T = 2.0
    b = Model(f"{kind}_body", seed=5040)
    half = [(0, -0.7), (0.38, -1.0), (0.75, -0.55), (1.2, -0.85), (1.6, -0.5), (2.25, -0.78), (2.28, -0.36),
            (1.05, 0.72), (0.4, 0.95), (0, 1.15)]
    wing = _sym(half)
    hull(b, wing, -0.2, 0.04, B, inset=0.95)                                             # the dark under-wing
    top = _sym([(0, -0.5), (0.38, -0.8), (0.75, -0.38), (1.2, -0.66), (1.6, -0.34), (2.08, -0.55),
                (2.1, -0.3), (1.0, 0.6), (0.38, 0.82), (0, 1.0)])
    hull(b, top, 0.04, 0.16, A, inset=0.97)                                              # the white top skin
    # lattice spars across the wing: a dark triangle truss
    for s in (1, -1):
        pts = [(0.55, 0.45), (1.0, -0.35), (1.45, 0.05), (1.85, -0.38), (2.05, -0.3)]
        for p, q in zip(pts, pts[1:]):
            _bar(b, (s * p[0], p[1]), (s * q[0], q[1]), 0.13, 0.08, 0.18, B.shade(0.85))
        _bar(b, (s * 0.55, 0.45), (s * 2.05, -0.3), 0.13, 0.08, 0.18, B.shade(0.85))
        b.box((0.3, 0.2, 0.1), (s * 2.1, -0.52, 0.16), C, glow=True)                       # wingtip lights
        for k, x in enumerate((0.75, 1.6)):  # vents on the trailing edge
            b.box((0.32, 0.16, 0.1), (s * x, -0.48 if k == 0 else -0.42, 0.06), C, glow=True)
        b.ball(0.24, (s * 1.3, 0.05, -0.28), DARK, subdiv=0)                               # hail pods underneath
        b.ball(0.13, (s * 1.3, 0.12, -0.12), C, subdiv=0, glow=True)
    # the nose: a dark sensor brow with a cyan visor
    b.box((0.8, 0.35, 0.18), (0, 0.85, 0.18), B, taper=0.8)
    b.box((0.6, 0.12, 0.08), (0, 0.98, 0.26), C, glow=True)
    # the hopper: a raised dark drum housing in the middle
    b.cyl(0.62, 0.3, (0, -0.1, 0.1), B, segs=8)
    b.cyl(0.66, 0.06, (0, -0.1, 0.38), A.shade(0.8), segs=8)
    body = b.build(root)
    d = Model(f"{kind}_drum", seed=5041)  # the turning magazine of hail: cyan balls round a dark hub
    d.cyl(0.5, 0.08, (0, 0, 0), DARK, segs=8)
    for k in range(6):
        a = TAU * k / 6
        d.ball(0.16, (math.cos(a) * 0.32, math.sin(a) * 0.32, 0.1), C, subdiv=0, glow=True)
    d.cyl(0.13, 0.16, (0, 0, 0.02), A, segs=6)
    dobj = d.build(body, loc=(0, -0.1, 0.42))
    spin(dobj, clip, T, 1)
    marker(body, kind, "muzzle", (0, -0.1, -0.35))
    osc(body, clip, "location", T, (2, 0.06, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.05, 1, 0.25), (0, 0.02, 1, 0))


# --- Engine Hive: carrier, ~7 ----------------------------------------------------------------------

def engine_hive():
    kind, clip, root = named("engine_hive", "carrier", "mech", "hum", preview=("#5a6a7a", "#2a3040", "#ff8a2a"))
    T = 3.0
    b = Model(f"{kind}_body", seed=5050)
    outline = [(0, -3.4), (1.6, -3.0), (2.15, -1.2), (2.15, 1.4), (1.3, 3.1), (0, 3.5),
               (-1.3, 3.1), (-2.15, 1.4), (-2.15, -1.2), (-1.6, -3.0)]
    hull(b, outline, -0.7, 0.2, B, inset=0.92)
    deck = _scale(outline, 0.86, 0, 0.05)
    hull(b, deck, 0.2, 0.5, A, inset=0.95)
    # the honeycomb deck: hex cells, dark rims; the closed ones lidded slate, the open ones glow
    r, cells, bays = 0.4, [], []
    for col in range(-2, 3):
        for row in range(-3, 3):
            x = col * 0.66
            y = row * 0.76 + (0.38 if col % 2 else 0.0)
            if y > 2.0 - abs(x) * 0.6 or y < -2.6 + abs(x) * 0.15:
                continue
            cells.append((x, y))
    opened = {(0, -0.76), (0.66, 0.38), (-0.66, -1.14), (0.0, 0.76), (-0.66, 0.38)}
    for x, y in cells:
        b.cyl(r + 0.04, 0.08, (x, y, 0.48), B.shade(0.7), segs=6)
        key = (round(x, 2), round(y, 2))
        if key in {(round(a, 2), round(c, 2)) for a, c in opened}:
            bays.append((x, y))
        else:
            b.cyl(r - 0.06, 0.1, (x, y, 0.5), A.shade(1.35 if (x + y) % 1.3 > 0.6 else 1.05), segs=6)
            b.box((0.12, 0.12, 0.06), (x, y, 0.62), B.shade(0.8))
    for x, y in bays:
        b.cyl(r - 0.04, 0.06, (x, y, 0.52), C, segs=6, glow=True)
    # the furnace prow: a raised brow with three glowing slits and twin guns
    b.box((2.2, 0.7, 0.4), (0, 2.75, 0.45), B, taper=0.75)
    for k in range(3):
        b.box((0.42, 0.16, 0.1), ((k - 1) * 0.6, 2.95, 0.66), C, glow=True)
    for s in (1, -1):
        tube(b, 0.12, 2.9, 3.75, s * 0.75, 0.15, DARK, segs=6)
        tube(b, 0.18, 2.9, 3.3, s * 0.75, 0.15, A.shade(0.8), segs=6)
        b.box((0.24, 0.1, 0.12), (s * 0.75, 3.75, 0.15), C, glow=True)
    # lattice outriggers: truss arms out to thruster pods, two each side
    for s in (1, -1):
        for y in (1.1, -1.6):
            for dy in (-0.3, 0.3):
                _bar(b, (s * 1.9, y + dy), (s * 2.65, y), 0.13, 0.12, 0.15, B.shade(0.8))
            b.ball(0.42, (s * 2.75, y, 0.1), A.shade(0.9), subdiv=0, scale=(1, 1.2, 0.8))
            b.cyl(0.24, 0.08, (s * 2.75, y, 0.38), C, segs=6, glow=True)
    # three furnace exhausts at the stern
    for k in range(3):
        x = (k - 1) * 0.8
        tube(b, 0.3, -3.0, -3.55, x, -0.15, DARK, segs=6)
        b.cyl(0.24, 0.05, (x, -3.56, -0.15), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    # a ridge spine of stubby vanes down the middle of the stern
    b.box((0.3, 0.9, 0.3), (0, -2.85, 0.55), B)
    body = b.build(root)
    # each open bay: an iris that breathes, out of step, as drones hatch
    for k, (x, y) in enumerate(bays):
        ir = Model(f"{kind}_iris_{k}")
        ir.cyl(0.26, 0.06, (0, 0, 0), DARK, segs=6)                                        # the shutter
        obj = ir.build(body, loc=(x, y, 0.585))
        sample(obj, clip, "scale", T, lambda u, k=k: (0.5 * math.sin(TAU * (u + k / 5)) - 0.3,) * 2 + (0,))
    # a little shard drone sat ready on one closed cell
    dr = Model(f"{kind}_drone", seed=5051)
    hull(dr, [(0, 0.45), (-0.3, -0.25), (0, -0.12), (0.3, -0.25)], 0, 0.12, ICE, inset=0.8)
    dr.ball(0.1, (0, -0.05, 0.14), C, subdiv=0, glow=True)
    dobj = dr.build(body, loc=(0.66, -1.14, 0.62))
    osc(dobj, clip, "location", T, (2, 0.06, 2, 0))
    # pod lights that throb round the hull
    for k, (s, y) in enumerate(((1, 1.1), (-1, -1.6), (1, -1.6), (-1, 1.1))):
        pl = Model(f"{kind}_podlight_{k}")
        pl.ball(0.16, (0, 0, 0), C, subdiv=0, glow=True)
        obj = pl.build(body, loc=(s * 2.75, y, 0.45))
        pulse(obj, clip, T, 0.4, harm=1, phase=k / 4)
    for k in range(3):
        flame(body, f"{kind}_flame_{k}", ((k - 1) * 0.8, -3.58, -0.15), 0.22, 0.6, clip, T, phase=k * 0.33, k=6)
    marker(body, kind, "bay", (0.0, -0.76, 0.6))
    for k, s in enumerate((1, -1)):
        marker(body, kind, "muzzle", (s * 0.75, 3.8, 0.15), k)
    osc(body, clip, "location", T, (2, 0.07, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.015, 1, 0.25), (0, 0.01, 1, 0))


def build():
    frost_wisp()
    engine_eye()
    pylon_warden()
    tusked_bull()
    hail_layer()
    engine_hive()
