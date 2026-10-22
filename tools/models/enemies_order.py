"""The faction foes' own models: the lattice (the old machine: precise white plates, slate, cyan light),
the wild (native beasts) and the bloom (Mirefall's fungal rot). Each one's shape tells what it does
(see src/sim/foes.ts and each FOES `tip` in src/sim/factions.ts). Built at the pre-scale size: the
runtime multiplies each by its FOES `scale`. Seeds 10000-10999.
"""
from __future__ import annotations

import math

from kit import Model
from creatures_util import TAU, chain, flat, limb, osc, sample, smooth_keys
from enemies_lib import A, B, C, DARK, both, eyes, fin, flame, hull, marker, mirror, mount, named, pulse, spin, tube, wing_pair

LATTICE = ("#e8ecf0", "#2a3448", "#4ae8ff")
WILD = ("#6a8a3a", "#e0d0a0", "#ff5a8a")
BLOOM = ("#6a3a8a", "#d8c0ff", "#b0ff4a")
BONE = "#ece4d0"


def ngon(r, n, phase=0.5, cx=0.0, cy=0.0, sx=1.0, sy=1.0):
    """A regular n-gon (counter-clockwise), a flat side facing +y when phase=0.5 and n is even."""
    return [(cx + math.cos(TAU * (k + phase) / n) * r * sx, cy + math.sin(TAU * (k + phase) / n) * r * sy)
            for k in range(n)]


def flare(m, outline, z0, z1, color, k=0.85):
    """A slab narrower at the bottom than the top: the underside of a hull."""
    cx = sum(p[0] for p in outline) / len(outline)
    cy = sum(p[1] for p in outline) / len(outline)
    lo = [(cx + (x - cx) * k, cy + (y - cy) * k) for x, y in outline]
    return m.slab(lo, z0, z1, color, top=outline)


def arc_pts(a0, a1, ri, ro, cy=0.0):
    return [(math.cos(a0) * ri, cy + math.sin(a0) * ri), (math.cos(a0) * ro, cy + math.sin(a0) * ro),
            (math.cos(a1) * ro, cy + math.sin(a1) * ro), (math.cos(a1) * ri, cy + math.sin(a1) * ri)]


def gem(m, r, up, down, loc, color, segs=6, glow=False, rot=(0, 0, 0)):
    """A bipyramid crystal: a cone up and a cone down from its girdle."""
    m.cyl(r, up, loc, color, segs=segs, r_top=0.0, glow=glow, rot=rot)
    m.cyl(r, down, loc, color, segs=segs, r_top=0.0, glow=glow, rot=(rot[0] + math.pi, rot[1], rot[2]))


# --- the lattice ----------------------------------------------------------------------------------

def warden():
    """A lattice gunship behind a wall: a broad curved shield of six white plates across the front,
    five needle guns poking through its glowing seams (the bar it fires), the slate body tucked
    behind. ~4 across."""
    kind, clip, root = named("warden", "gunship", "mech", "guard", preview=LATTICE)
    T = 3.0
    b = Model(f"{kind}_body", seed=10000)
    out = [(0.7, 0.75), (-0.7, 0.75), (-1.0, 0.2), (-1.0, -1.1), (-0.6, -1.85), (0.6, -1.85), (1.0, -1.1), (1.0, 0.2)]
    flare(b, out, -0.5, -0.05, B, k=0.8)
    hull(b, out, -0.05, 0.35, A, inset=0.86)
    b.box((0.36, 2.0, 0.1), (0, -0.55, 0.36), B)                                           # slate spine
    for s in (1, -1):
        b.box((0.42, 0.9, 0.08), (s * 0.55, -0.95, 0.33), A.shade(0.7), rot=(0, s * 0.2, 0))   # side plates
        b.box((0.16, 0.5, 0.06), (s * 0.55, -0.95, 0.39), C, glow=True)                    # their light slots
    b.cyl(0.42, 0.14, (0, 0.05, 0.3), B, segs=8)                                           # the core housing
    b.cyl(0.3, 0.12, (0, 0.05, 0.42), C, segs=8, glow=True)
    for s in (1, -1):  # engine pods astern
        tube(b, 0.3, -0.9, -2.15, s * 1.05, -0.1, B, segs=6, r_end=0.24)
        b.box((0.3, 0.7, 0.12), (s * 1.05, -1.45, 0.2), A)
        b.cyl(0.2, 0.05, (s * 1.05, -2.14, -0.1), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
        limb(b, (s * 0.6, 0.45, 0.0), (s * 1.15, 0.8, 0.0), 0.13, 0.11, B, segs=5)           # arms to the shield
    limb(b, (0, 0.6, 0.0), (0, 1.25, 0.0), 0.13, 0.11, B, segs=5)
    body = b.build(root)
    for k, s in enumerate((1, -1)):
        flame(body, f"{kind}_flame_{k}", (s * 1.05, -2.18, -0.1), 0.17, 0.55, clip, T, phase=k * 0.3, k=3)

    # the shield: six plates on an arc, seams of light between them, needles through the seams
    sh = Model(f"{kind}_shield", seed=10001)
    CY, RI, RO = -1.05, 2.05, 2.85
    n, span = 6, math.radians(56)
    edges = [math.pi / 2 - span + 2 * span * k / n for k in range(n + 1)]
    muzzles = []
    for k in range(n):
        a0, a1 = edges[k], edges[k + 1]
        g = (a1 - a0) * 0.07
        pts = arc_pts(a0 + g, a1 - g, RI, RO, CY)
        flare(sh, pts, -0.55, -0.15, B, k=0.92)
        # the face slopes down to the front; the back stands tall
        sh.slab(pts, -0.15, 0.7, A if k not in (1, 4) else A.shade(0.86), top=arc_pts(a0 + g * 1.4, a1 - g * 1.4, RI + 0.06, RO - 0.3, CY))
        am = (a0 + a1) / 2
        rm = (RI + RO) / 2
        sh.box((0.62, 0.2, 0.06), (math.cos(am) * (rm - 0.12), CY + math.sin(am) * (rm - 0.12), 0.71), B,
               rot=(0, 0, am + math.pi / 2))                                             # a slate stripe over each plate
    for k in range(1, n):  # the seams: glow between the plates, a needle gun through each
        a = edges[k]
        c, s_ = math.cos(a), math.sin(a)
        sh.box((0.75, 0.16, 0.55), (c * 2.45, CY + s_ * 2.45, 0.2), C, glow=True, rot=(0, 0, a))
        limb(sh, (c * 2.3, CY + s_ * 2.3, -0.05), (c * 3.2, CY + s_ * 3.2, -0.05), 0.11, 0.09, DARK, segs=5)
        sh.box((0.22, 0.22, 0.22), (c * 3.17, CY + s_ * 3.17, -0.05), C, glow=True, rot=(0, 0, a))
        muzzles.append((round(c * 3.3, 3), round(CY + s_ * 3.3, 3), -0.05))
    # a crack running down one plate (it can be broken)
    for (x, y, a, l) in ((0.62, 1.55, 0.6, 0.42), (0.5, 1.33, -0.5, 0.36), (0.6, 1.12, 0.7, 0.32), (0.8, 1.4, -1.2, 0.26)):
        sh.box((0.1, l, 0.05), (x, y, 0.69), DARK, rot=(0, 0, a))
    shield = sh.build(body, loc=(0, 0, 0))
    # it braces the wall forward between breaths, the seams brightening as it does
    osc(shield, clip, "location", T, (1, 0.07, 1, 0), (2, 0.04, 1, 0.25))
    for k, p in enumerate(muzzles):
        mount(body, kind, "muzzle", p, k)
    osc(body, clip, "location", T, (2, 0.08, 1, 0), (0, 0.04, 1, 0.25))
    osc(body, clip, "rotation_euler", T, (0, 0.025, 1, 0.5), (1, 0.02, 1, 0))


def prism():
    """A lattice lancer like a shut flower of mirror plates: six faceted petals closed round a cyan
    crystal. It breathes open a little (that's when it's soft) and shuts. ~3 across."""
    kind, clip, root = named("prism", "lancer", "mech", "breathe", preview=LATTICE)
    T = 4.0
    b = Model(f"{kind}_body", seed=10010)
    hx = ngon(1.0, 6, 0.0)
    flare(b, hx, -0.55, -0.2, B, k=0.7)
    hull(b, hx, -0.2, 0.0, A.shade(0.8), inset=0.85)
    for k in range(6):  # slate hinge blocks between the petals
        a = TAU * (k + 0.5) / 6 + math.pi / 2
        b.box((0.3, 0.26, 0.2), (math.cos(a) * 0.82, math.sin(a) * 0.82, -0.02), B, rot=(0, 0, a))
    # the projector lip at the front, where the beam leaves
    b.box((0.46, 0.4, 0.22), (0, 1.0, -0.2), B)
    b.box((0.3, 0.12, 0.16), (0, 1.22, -0.2), C, glow=True)
    body = b.build(root)

    cr = Model(f"{kind}_crystal", seed=10011)
    gem(cr, 0.48, 1.05, 0.55, (0, 0, 0), C, segs=6, glow=True)
    for k in range(3):  # three small shards round the big one
        a = TAU * k / 3 + 0.4
        gem(cr, 0.15, 0.4, 0.2, (math.cos(a) * 0.42, math.sin(a) * 0.42, 0.05), C, segs=4, glow=True)
    crystal = cr.build(body, loc=(0, 0, 0.05))
    spin(crystal, clip, T, 1)
    pulse(crystal, clip, T, 0.08, harm=2)

    petal = [(0, -0.24), (0.55, -0.52), (1.32, -0.14), (1.32, 0.14), (0.55, 0.52), (0, 0.24)]
    half = [(0.06, 0.0), (0.55, -0.44), (1.22, -0.1), (1.22, 0.0)]                       # the darker facet

    def breath(u):  # shut, ease open, hold, shut
        k = smooth_keys([(0, (0, 0, 0)), (0.25, (0, 0, 0)), (0.5, (1, 0, 0)), (0.7, (1, 0, 0)), (1, (0, 0, 0))])(u)[0]
        return (0, 0.38 * k, 0)

    for k in range(6):
        a = TAU * k / 6 + math.pi / 2
        p = Model(f"{kind}_petal_{k}", seed=10012 + k)
        p.slab([(x * 1.04, y * 1.08) for x, y in petal], -0.12, -0.04, B)
        hull(p, petal, -0.04, 0.12, A, inset=0.72)
        p.slab(half, 0.12, 0.15, A.shade(0.72))
        p.box((0.22, 0.24, 0.06), (1.12, 0.0, 0.13), C, glow=True)                         # a lit tip
        obj = p.build(body, loc=(math.cos(a) * 0.44, math.sin(a) * 0.44, 0.0), rot_z=a)
        obj.rotation_euler[1] = -0.62                                                      # closed: tipped up
        sample(obj, clip, "rotation_euler", T, breath)
    marker(body, kind, "emitter", (0, 1.25, -0.2))
    mount(body, kind, "muzzle", (0, 1.25, -0.2))
    osc(body, clip, "location", T, (2, 0.1, 1, 0))
    osc(body, clip, "rotation_euler", T, (0, 0.03, 1, 0.25), (1, 0.03, 2, 0))


def gatekeeper():
    """A lattice gate pylon on the ground: a tapering white obelisk on an octagonal plinth, a slate
    jamb down its +y face with a rail of light where the gate hangs, a floating capstone and the
    glowing node the gate springs from. ~2.5 across, ~3.4 tall."""
    kind, clip, root = named("gatekeeper", "turret", "mech", "hold", preview=LATTICE, ground=1)
    T = 3.0
    b = Model(f"{kind}_base", seed=10020)
    o8 = ngon(1.25, 8, 0.5)
    hull(b, o8, 0.0, 0.32, B, inset=0.88)
    hull(b, ngon(0.98, 8, 0.5), 0.32, 0.55, A, inset=0.86)
    for k in range(8):  # light at the plinth's corners
        a = TAU * (k + 0.5) / 8
        b.box((0.26, 0.14, 0.08), (math.cos(a) * 1.04, math.sin(a) * 1.04, 0.33), C, glow=True, rot=(0, 0, a))
    for s in (1, -1):  # buttresses either side
        fin(b, [(-0.35, 0.5), (0.35, 0.5), (0.18, 1.35), (-0.18, 1.35)], s * 0.58, 0.22, B)
        fin(b, [(-0.6, 0.0), (0.6, 0.0), (0.4, 0.5), (-0.4, 0.5)], s * 1.0, 0.3, B)
    q = (0, 0, math.pi / 4)
    b.cyl(0.62, 1.05, (0, 0, 0.55), A, segs=4, r_top=0.52, rot=q)                          # the obelisk, lower
    b.cyl(0.56, 0.16, (0, 0, 1.55), B, segs=4, rot=q)                                     # slate collar
    b.cyl(0.5, 1.1, (0, 0, 1.7), A, segs=4, r_top=0.36, rot=q)                             # upper
    b.cyl(0.36, 0.0, (0, 0, 2.8), A, segs=4, rot=q)
    b.cyl(0.38, 0.22, (0, 0, 2.8), A.shade(0.8), segs=4, r_top=0.1, rot=q)                 # pyramid top
    for s in (1, -1):  # light slots on the flanks
        b.box((0.06, 0.16, 0.7), (s * 0.42, 0.0, 1.1), C, glow=True, rot=(0, -s * 0.05, 0))
        b.box((0.06, 0.14, 0.6), (s * 0.33, 0.0, 2.2), C, glow=True, rot=(0, -s * 0.06, 0))
    # the jamb: a slate fin down the +y face, its edge a rail of light
    fin(b, [(0.2, 0.5), (1.05, 0.55), (1.05, 2.45), (0.25, 2.6)], 0, 0.34, B)
    fin(b, [(1.03, 0.65), (1.16, 0.7), (1.16, 2.4), (1.03, 2.4)], 0, 0.22, C, glow=True)
    # the arm the gate springs from, reaching towards its twin
    b.box((0.44, 1.3, 0.3), (0, 0.85, 2.6), A, taper=0.85)
    b.box((0.2, 0.9, 0.06), (0, 0.95, 2.77), C, glow=True)
    b.box((0.62, 0.5, 0.42), (0, 1.45, 2.6), B)                                            # the node's cradle
    for s in (1, -1):
        b.box((0.12, 0.42, 0.5), (s * 0.3, 1.58, 2.85), B)
    base = b.build(root)
    nd = Model(f"{kind}_node", seed=10021)
    nd.ball(0.32, (0, 0, 0), C, subdiv=1, glow=True)
    node = nd.build(base, loc=(0, 1.55, 3.0))
    pulse(node, clip, T, 0.2, harm=3)
    cap = Model(f"{kind}_cap", seed=10022)
    gem(cap, 0.3, 0.32, 0.26, (0, 0, 0), A, segs=4)
    cap.box((0.16, 0.16, 0.16), (0, 0, 0.0), C, glow=True)
    gem(cap, 0.16, 0.18, 0.14, (0, 0, 0), C, segs=4, glow=True, rot=(0, 0, math.pi / 4))
    capstone = cap.build(base, loc=(0, 0, 3.25))
    spin(capstone, clip, T, 1)
    osc(capstone, clip, "location", T, (2, 0.08, 1, 0))
    marker(base, kind, "emitter", (0, 1.55, 3.0))
    mount(base, kind, "muzzle", (0, 1.55, 3.0))


def rook():
    """A lattice dart carrier that is a chess rook seen from above: a square keep with crenellated
    walls and corner towers, a chequered deck, launch rails out to both sides with square darts
    docked on them and one at the bow. ~7 long."""
    kind, clip, root = named("rook", "carrier", "mech", "march", preview=LATTICE)
    T = 4.0
    W, F, R = 2.25, 2.5, -2.6                                                             # half width, bow, stern
    b = Model(f"{kind}_body", seed=10030)
    out = [(W - 0.35, F), (-W + 0.35, F), (-W, F - 0.35), (-W, R + 0.35), (-W + 0.35, R), (W - 0.35, R), (W, R + 0.35), (W, F - 0.35)]
    flare(b, out, -0.75, -0.15, B, k=0.85)
    b.slab(out, -0.15, 0.05, B.shade(0.8))
    # the chequered deck, 3 x 3
    tile = 1.12
    for i in range(3):
        for j in range(3):
            x, y = (i - 1) * tile, (j - 1) * tile - 0.05
            col = A.shade(0.82) if (i + j) % 2 == 0 else B.shade(1.25)
            b.box((tile * 0.94, tile * 0.94, 0.08), (x, y, 0.08), col)
    # walls round the deck: the crenellation, merlons between gaps
    th, zt = 0.5, 0.5
    for s in (1, -1):
        for y in (-1.15, 1.05):                                                           # side walls, split by the rails
            b.box((th, 1.45, zt + 0.15), (s * (W - th / 2), y, zt / 2 - 0.05), A)
            b.box((th + 0.04, 0.55, 0.22), (s * (W - th / 2), y, zt + 0.37), A)            # merlon
        b.box((1.6, th, zt + 0.15), (s * 1.0, F - th / 2, zt / 2 - 0.05), A)                 # bow wall, either side of the bow rail
        b.box((0.6, th + 0.04, 0.22), (s * 1.0, F - th / 2, zt + 0.37), A)
        b.box((1.7, th, zt + 0.15), (s * 0.95, R + th / 2, zt / 2 - 0.05), A)                # stern wall
        b.box((0.6, th + 0.04, 0.22), (s * 0.95, R + th / 2, zt + 0.37), A)
    for sx in (1, -1):  # corner towers, each with a light on top
        for sy, yy in ((1, F), (-1, R)):
            cx, cy = sx * (W - 0.4), yy - sy * 0.4
            b.box((0.95, 0.95, 1.2), (cx, cy, 0.3), A, taper=0.9)
            b.box((0.6, 0.6, 0.08), (cx, cy, 0.92), B)
            b.box((0.34, 0.34, 0.1), (cx, cy, 0.95), C, glow=True)
    # launch rails: slate beams out through the side gaps, and through the bow
    for s in (1, -1):
        b.box((2.0, 0.22, 0.12), (s * 2.15, -0.06, 0.18), DARK)
        b.box((0.2, 0.5, 0.2), (s * 3.05, -0.06, 0.18), C, glow=True)                     # rail tips
    b.box((0.22, 1.5, 0.12), (0, F + 0.05, 0.18), DARK)
    b.box((0.5, 0.2, 0.2), (0, F + 0.8, 0.18), C, glow=True)
    # engines astern: two square blocks
    for s in (1, -1):
        b.box((0.9, 0.8, 0.6), (s * 1.05, R - 0.3, -0.25), B)
        b.box((0.6, 0.1, 0.4), (s * 1.05, R - 0.72, -0.25), C, glow=True)
    body = b.build(root)
    for k, s in enumerate((1, -1)):
        flame(body, f"{kind}_flame_{k}", (s * 1.05, R - 0.75, -0.25), 0.26, 0.7, clip, T, phase=k * 0.4, k=4)

    def dart(name, seed):
        d = Model(name, seed=seed)
        d.box((0.62, 0.62, 0.3), (0, 0, 0), A)
        d.box((0.64, 0.18, 0.32), (0, -0.12, 0), B)                                         # slate band
        d.cyl(0.3, 0.42, (0, 0.3, 0), A.shade(0.85), segs=4, r_top=0.0, rot=(-math.pi / 2, math.pi / 4, 0))  # square nose
        d.box((0.3, 0.12, 0.2), (0, -0.33, 0), C, glow=True)                                # its light, astern
        d.box((0.22, 0.22, 0.06), (0, 0.06, 0.17), C, glow=True)
        return d

    def slide(dist, ph):  # step out on the rail, hold, step back: square, like it flies
        f = smooth_keys([(0, (0, 0, 0)), (0.15, (0, 0, 0)), (0.3, (0, dist, 0)), (0.65, (0, dist, 0)), (0.8, (0, 0, 0)), (1, (0, 0, 0))])
        return lambda u: f((u + ph) % 1.0)

    for k, (x, y, a) in enumerate(((0.65, -0.06, -math.pi / 2), (1.45, -0.06, -math.pi / 2),
                                   (-0.65, -0.06, math.pi / 2), (-1.45, -0.06, math.pi / 2), (0, 1.35, 0.0))):
        obj = dart(f"{kind}_dart_{k}", 10031 + k).build(body, loc=(x, y, 0.42), rot_z=a)
        if k in (1, 3, 4):
            sample(obj, clip, "location", T, (lambda f, a: lambda u: (lambda v: (-math.sin(a) * v[1], math.cos(a) * v[1], 0))(f(u)))(slide(0.3, 0.1 * k), a))
    # a scan bar that steps down the chequer, square by square
    sc = Model(f"{kind}_scan", seed=10040)
    sc.box((3.3, 0.14, 0.06), (0, 0, 0), C, glow=True)
    scan = sc.build(body, loc=(0, 1.0, 0.15))

    def steps(u):
        k = int(u * 4) % 4
        return (0, -[0.0, 1.12, 2.24, 1.12][k], 0)
    sample(scan, clip, "location", T, steps, step=1)
    marker(body, kind, "bay", (0, 0.0, 0.5))
    mount(body, kind, "muzzle", (0, F + 0.8, 0.2))
    osc(body, clip, "location", T, (2, 0.08, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.015, 1, 0.25))


def strongbox():
    """A bounty: a flying lattice vault. A heavy chamfered strongbox, a great round door on top
    with locking bolts, a wheel and a glowing dial whose tumblers click round; seams of light
    round its waist, little stabiliser thrusters at the corners. ~6.5 across."""
    kind, clip, root = named("strongbox", "carrier", "mech", "tumble", preview=LATTICE)
    T = 4.0
    H = 3.0
    b = Model(f"{kind}_body", seed=10050)
    out = [(H, -1.45), (H, 1.45), (1.45, H), (-1.45, H), (-H, 1.45), (-H, -1.45), (-1.45, -H), (1.45, -H)]
    flare(b, out, -1.1, -0.35, B, k=0.86)
    b.slab([(x * 1.01, y * 1.01) for x, y in out], -0.35, -0.2, C, glow=True)              # the seam of light at its waist
    hull(b, out, -0.2, 0.55, A, inset=0.93)
    for k in range(4):  # slate plates over the chamfers, a light slot on each
        a = TAU * k / 4 + math.pi / 4
        c, s = math.cos(a), math.sin(a)
        b.box((1.6, 0.5, 0.12), (c * 2.75, s * 2.75, 0.5), B, rot=(0, 0, a + math.pi / 2))
        b.box((0.9, 0.16, 0.08), (c * 2.8, s * 2.8, 0.57), C, glow=True, rot=(0, 0, a + math.pi / 2))
    for k in range(4):  # rivet strips along the flat sides
        a = TAU * k / 4
        c, s = math.cos(a), math.sin(a)
        b.box((0.24, 1.9, 0.08), (c * 2.55, s * 2.55, 0.55), A.shade(0.82), rot=(0, 0, a))
    # the door: a slate frame, a ring of light, the white door, bolts round it, hinges on one side
    b.cyl(2.25, 0.16, (0, 0, 0.5), B, segs=12)
    b.cyl(2.0, 0.2, (0, 0, 0.5), C, segs=12, glow=True)
    b.cyl(1.85, 0.3, (0, 0, 0.5), A.shade(0.9), segs=12)
    b.cyl(1.4, 0.08, (0, 0, 0.8), B.shade(1.2), segs=12)
    b.cyl(1.15, 0.12, (0, 0, 0.8), A, segs=12)
    for k in range(10):
        a = TAU * (k + 0.5) / 10
        b.box((0.4, 0.3, 0.16), (math.cos(a) * 2.15, math.sin(a) * 2.15, 0.7), A.shade(0.75), rot=(0, 0, a))
    for y in (0.85, -0.85):
        b.box((0.5, 0.6, 0.35), (-2.2, y, 0.65), B)
        b.cyl(0.14, 0.7, (-2.2, y - 0.35, 0.82), A.shade(0.7), segs=6, rot=(-math.pi / 2, 0, 0))
    # stabiliser thrusters at the corners, pointing down
    for sx in (1, -1):
        for sy in (1, -1):
            x, y = sx * 2.35, sy * 2.35
            b.cyl(0.42, 0.5, (x, y, -0.65), B, segs=6)
            b.cyl(0.32, 0.12, (x, y, -0.15), A.shade(0.8), segs=6)
            b.cyl(0.3, 0.06, (x, y, -0.7), C, segs=6, glow=True)
    body = b.build(root)
    for k, (sx, sy) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        f = Model(f"{kind}_jet_{k}", seed=10053 + k)
        f.cyl(0.24, 0.6, (0, 0, 0), C, segs=6, r_top=0.0, rot=(math.pi, 0, 0), glow=True)
        jet = f.build(body, loc=(sx * 2.35, sy * 2.35, -0.72))
        osc(jet, clip, "scale", T, (2, 0.35, 8, k * 0.25), (0, 0.12, 12, k * 0.2), (1, 0.12, 12, k * 0.2))

    # the wheel: four spokes with grips, turning in clicks
    wh = Model(f"{kind}_wheel", seed=10051)
    wh.cyl(0.42, 0.18, (0, 0, 0), B, segs=8)
    for k in range(4):
        a = TAU * k / 4
        c, s = math.cos(a), math.sin(a)
        wh.box((1.1, 0.24, 0.14), (c * 0.9, s * 0.9, 0.08), B, rot=(0, 0, a))
        wh.cyl(0.18, 0.28, (c * 1.5, s * 1.5, 0.0), A.shade(0.75), segs=6)
        wh.cyl(0.1, 0.06, (c * 1.5, s * 1.5, 0.28), C, segs=6, glow=True)
    wheel = wh.build(body, loc=(0, 0, 0.92))

    def clicks(n, turns):
        def f(u):
            k = u * n
            i = math.floor(k)
            e = min(1.0, (k - i) / 0.3)
            e = e * e * (3 - 2 * e)
            return (0, 0, TAU * turns * (i + e) / n)
        return f
    sample(wheel, clip, "rotation_euler", T, clicks(8, 0.5), step=1)
    dl = Model(f"{kind}_dial", seed=10052)
    dl.cyl(0.36, 0.14, (0, 0, 0), C, segs=8, glow=True)
    dl.box((0.12, 0.3, 0.06), (0, 0.18, 0.14), B)
    dial = dl.build(wheel, loc=(0, 0, 0.18))
    sample(dial, clip, "rotation_euler", T, clicks(4, -1.0), step=1)
    marker(body, kind, "bay", (0, 0, 1.0))
    osc(body, clip, "location", T, (2, 0.1, 1, 0))
    osc(body, clip, "rotation_euler", T, (0, 0.03, 1, 0.25), (1, 0.03, 1, 0))


# --- the wild -------------------------------------------------------------------------------------

def swooper():
    """A raptor: broad fingered wings, a hooked beak, a fanned tail, talons tucked, pink flash
    bands under the wing glow. Heavy, strong wingbeats. ~1.8 span, ~1.3 long."""
    kind, clip, root = named("swooper", "swarm", "beast", "beat", preview=WILD)
    T = 0.75
    b = Model(f"{kind}_body", seed=10100)
    b.ball(1.0, (0, 0.0, 0.0), A, subdiv=1, scale=(0.21, 0.42, 0.17))
    b.ball(1.0, (0, 0.02, -0.06), B, subdiv=1, scale=(0.17, 0.34, 0.12))                  # cream breast
    b.ball(1.0, (0, -0.05, 0.08), A.shade(0.62), subdiv=1, scale=(0.14, 0.3, 0.1))        # dark mantle
    b.ball(0.18, (0, 0.4, 0.06), B, subdiv=1, scale=(1, 1.1, 0.9))                         # the pale hood
    b.ball(0.15, (0, 0.27, 0.1), B, subdiv=1, scale=(1.1, 1.0, 0.7))                        # down the neck
    for s in (1, -1):
        b.ball(0.065, (s * 0.11, 0.48, 0.1), C, subdiv=1, glow=True)
        b.box((0.07, 0.15, 0.05), (s * 0.08, 0.47, 0.18), A.shade(0.45), rot=(0, 0, s * 0.45))  # a scowling brow
    limb(b, (0, 0.52, 0.07), (0, 0.7, 0.03), 0.08, 0.04, A.shade(0.45), segs=5)                # the hooked beak
    limb(b, (0, 0.7, 0.03), (0, 0.76, -0.07), 0.04, 0.0, DARK, segs=4)
    for s in (1, -1):  # crest swept back
        limb(b, (s * 0.04, 0.3, 0.16), (s * 0.1, 0.08, 0.24), 0.05, 0.0, B, segs=4)
        limb(b, (s * 0.07, -0.18, -0.12), (s * 0.08, -0.36, -0.16), 0.05, 0.03, DARK, segs=4)  # tucked legs
        b.box((0.08, 0.1, 0.05), (s * 0.08, -0.39, -0.17), BONE)                           # talons
    body = b.build(root)

    def wing(s):  # inner panel: cream leading edge, pink flash band
        w = Model(f"{kind}_wing_{'r' if s > 0 else 'l'}", seed=10101 + (s > 0))
        inner = [(0, 0.18), (0, -0.26), (0.45, -0.3), (0.45, 0.16)]
        hull(w, inner if s > 0 else mirror(inner), -0.03, 0.04, A, inset=0.9)
        lead = [(0.0, 0.18), (0.0, 0.08), (0.45, 0.06), (0.45, 0.16)]
        flat(w, lead if s > 0 else mirror(lead), 0.05, 0.03, B)
        band = [(0.1, -0.05), (0.1, -0.13), (0.45, -0.15), (0.45, -0.07)]
        flat(w, band if s > 0 else mirror(band), 0.05, 0.03, C, glow=True)
        trail = [(0.0, -0.18), (0.0, -0.27), (0.45, -0.31), (0.45, -0.22)]                  # dark trailing feathers
        flat(w, trail if s > 0 else mirror(trail), 0.045, 0.03, A.shade(0.5))
        return w

    def tip(s):  # outer panel and the fingered primaries
        w = Model(f"{kind}_tip_{'r' if s > 0 else 'l'}", seed=10103 + (s > 0))
        panel = [(0, 0.16), (0, -0.3), (0.22, -0.24), (0.3, 0.1)]
        hull(w, panel if s > 0 else mirror(panel), -0.03, 0.035, A, inset=0.9)
        lead = [(0.0, 0.16), (0.0, 0.06), (0.28, 0.03), (0.3, 0.1)]
        flat(w, lead if s > 0 else mirror(lead), 0.045, 0.03, B)
        for k, (dy, L) in enumerate(((0.06, 0.36), (-0.04, 0.38), (-0.13, 0.34), (-0.21, 0.28))):
            ang = 0.25 - k * 0.3
            x0, y0 = 0.2, dy
            x1, y1 = x0 + math.cos(ang) * L, y0 + math.sin(ang) * L
            limb(w, (s * x0, y0, 0.0), (s * x1, y1, 0.0), 0.065, 0.03, A.shade(0.42), segs=4)
        return w

    for s in (1, -1):
        wi = wing(s).build(body, loc=(s * 0.14, 0.04, 0.04))
        osc(wi, clip, "rotation_euler", T, (1, -s * 0.5, 1, 0.0))
        wo = tip(s).build(wi, loc=(s * 0.45, 0.0, 0.0))
        osc(wo, clip, "rotation_euler", T, (1, -s * 0.4, 1, -0.1), (2, s * 0.12, 1, 0.15))
    tl = Model(f"{kind}_tail", seed=10105)
    fan = [(-0.07, 0.0), (-0.24, -0.36), (-0.1, -0.44), (0.1, -0.44), (0.24, -0.36), (0.07, 0.0)]
    hull(tl, fan, -0.025, 0.03, A.shade(0.62), inset=0.85)
    flat(tl, [(-0.17, -0.3), (-0.12, -0.36), (0.12, -0.36), (0.17, -0.3)], 0.045, 0.03, B)  # a cream bar
    tail = tl.build(body, loc=(0, -0.32, 0.02))
    osc(tail, clip, "rotation_euler", T, (0, 0.15, 1, 0.3), (2, 0.08, 1, 0.1))
    marker(body, kind, "muzzle", (0, 0.72, 0.0))
    # it rises on each downstroke
    osc(body, clip, "location", T, (2, 0.06, 1, 0.5))
    osc(body, clip, "rotation_euler", T, (0, 0.06, 1, 0.75))


def burrower():
    """Erupting from below: a broad armoured head reared up, its round maw open to the sky (rings of
    teeth round a glowing throat), and a coil of plated body arching behind it, as if breaking out of
    the ground, chunks of rock flung off round it. ~3.2 long."""
    kind, clip, root = named("burrower", "serpent", "beast", "erupt", preview=WILD)
    T = 2.0
    body = Model(f"{kind}_core", seed=10110).build(root)
    # the coil, from the neck back: segments that each writhe a little after the one before
    path = [(0.0, 0.55, 0.15), (-0.35, 0.05, -0.05), (-0.65, -0.5, 0.15), (-0.45, -1.05, 0.35),
            (0.05, -1.3, 0.3), (0.5, -1.05, 0.1), (0.7, -0.55, -0.15)]
    radii = [0.5, 0.5, 0.48, 0.45, 0.42, 0.37, 0.3]
    dense, dr = [], []
    for i in range(len(path) - 1):  # a segment at every point and half way between: a continuous coil
        for t in (0.0, 0.5):
            dense.append(tuple(path[i][j] + (path[i + 1][j] - path[i][j]) * t for j in range(3)))
            dr.append(radii[i] + (radii[i + 1] - radii[i]) * t)
    dense.append(path[-1])
    dr.append(radii[-1])
    path, radii = dense, dr
    for k, ((x, y, z), r) in enumerate(zip(path, radii)):
        sg = Model(f"{kind}_seg_{k}", seed=10140 + k)
        nx, ny, nz = path[min(k + 1, len(path) - 1)]
        px, py, pz = path[max(k - 1, 0)]
        dx, dy = nx - px, ny - py
        a = math.atan2(dy, dx)
        sg.ball(r, (0, 0, 0), B.shade(0.85), subdiv=1, scale=(1.05, 1.05, 0.85))           # belly
        sg.ball(r * 0.98, (0, 0, r * 0.18), A, subdiv=1, scale=(1.0, 1.0, 0.8))             # armour
        # a dark-rimmed plate over the back, across the body
        sg.box((r * 0.55, r * 1.75, 0.16), (0, 0, r * 0.88), A.shade(0.55), rot=(0, 0, a))
        sg.box((r * 0.35, r * 1.45, 0.12), (0, 0, r * 0.96), A.shade(1.15), rot=(0, 0, a))
        if k % 3 == 1:
            for s in (1, -1):  # pink pores on the flanks
                sg.ball(0.1, (math.cos(a + s * math.pi / 2) * r * 0.85, math.sin(a + s * math.pi / 2) * r * 0.85, r * 0.3),
                        C, subdiv=0, glow=True)
        obj = sg.build(body, loc=(x, y, z))
        osc(obj, clip, "location", T, (0, 0.06, 1, -k * 0.06), (2, 0.07, 1, -k * 0.06 + 0.25))
    tp = Model(f"{kind}_tailtip", seed=10120)
    limb(tp, (0, 0, 0), (0.25, 0.35, -0.45), 0.24, 0.05, A.shade(0.55), segs=6)
    tail = tp.build(body, loc=(0.75, -0.4, -0.2))
    osc(tail, clip, "rotation_euler", T, (0, 0.2, 1, 0.1), (1, 0.15, 1, 0.3))

    # the head: reared up and tipped forward, the maw open upwards and ahead
    hd = Model(f"{kind}_head", seed=10121)
    hd.cyl(0.62, 0.5, (0, 0, -0.35), B.shade(0.85), segs=8, r_top=0.7)                    # throat collar
    hd.cyl(0.72, 0.22, (0, 0, 0.12), A, segs=8, r_top=0.66)                                # the lip ring
    for k in range(8):  # armour plates round the rim, alternating dark
        a = TAU * (k + 0.5) / 8
        hd.box((0.4, 0.26, 0.32), (math.cos(a) * 0.72, math.sin(a) * 0.72, 0.1), A.shade(0.55) if k % 2 else A,
               rot=(0, 0, a + math.pi / 2))
    hd.cyl(0.5, 0.08, (0, 0, 0.3), DARK, segs=8)                                           # the throat
    hd.cyl(0.3, 0.06, (0, 0, 0.32), C, segs=8, glow=True)                                 # glowing deep down
    for ring, (rr, n, h) in enumerate(((0.55, 10, 0.3), (0.34, 7, 0.22))):  # rings of teeth leaning in
        for k in range(n):
            a = TAU * (k + 0.5 * ring) / n
            c, s = math.cos(a), math.sin(a)
            limb(hd, (c * rr, s * rr, 0.3), (c * (rr - 0.18), s * (rr - 0.18), 0.3 + h), 0.07, 0.0, BONE, segs=4)
    for s in (1, -1):  # eyes on the outside of the rim, facing ahead
        hd.ball(0.11, (s * 0.42, 0.58, 0.05), C, subdiv=1, glow=True)
    head = hd.build(body, loc=(0, 1.15, 0.65))
    head.rotation_euler[0] = 0.55                                                           # tipped forward
    osc(head, clip, "rotation_euler", T, (0, 0.12, 1, 0.0), (2, 0.1, 1, 0.3))
    pulse(head, clip, T, 0.06, harm=2, axes=(0, 1))
    # rock chunks breaking off round it
    for k, (x, y, z, r) in enumerate(((1.0, 0.7, 0.3, 0.22), (-0.95, 0.95, 0.1, 0.18), (1.15, -1.25, 0.0, 0.2),
                                      (-1.1, -1.25, -0.1, 0.16))):
        rk = Model(f"{kind}_rock_{k}", seed=10125 + k)
        rk.ball(r, (0, 0, 0), "#6a5a48", subdiv=0, jitter=r * 0.25)
        rk.ball(r * 0.9, (0, 0, r * 0.25), "#9a8a70", subdiv=0, jitter=r * 0.2)
        obj = rk.build(body, loc=(x, y, z))
        osc(obj, clip, "location", T, (2, 0.18, 1, k * 0.25), (0, 0.05 * (1 if x > 0 else -1), 1, k * 0.25))
        spin(obj, clip, T, 1 if k % 2 else -1, axis=k % 3)
    marker(body, kind, "muzzle", (0, 1.4, 1.0))
    osc(body, clip, "location", T, (2, 0.06, 1, 0))


def spitter():
    """A squat plant-toad on the ground: splayed root-legs and frilled leaves, a broad warty body with
    a pale throat, a huge swelling acid sac on its back that glows, a fat spout pointing ahead.
    ~2.5 across."""
    kind, clip, root = named("spitter", "turret", "beast", "swell", preview=WILD, ground=1)
    T = 2.0
    b = Model(f"{kind}_body", seed=10130)
    for k in range(7):  # frilled leaves round the base, cream rims showing
        a = TAU * (k + 0.5) / 7 - math.pi / 2
        c, s = math.cos(a), math.sin(a)
        leaf = [(0.0, -0.22), (0.7, -0.3), (1.2, 0.0), (0.7, 0.3), (0.0, 0.22)]
        pts = [(c * x - s * y + c * 0.35, s * x + c * y + s * 0.35) for x, y in leaf]
        b.slab(pts, 0.0, 0.08, B)
        b.slab([(x * 0.94, y * 0.94) for x, y in pts], 0.08, 0.14, A.shade(0.55))
    for sx in (1, -1):  # splayed root-legs, the front pair forward like a toad's
        for sy in (1, -1):
            chain(b, [(sx * 0.5, sy * 0.3, 0.45), (sx * 1.0, sy * 0.62, 0.42), (sx * 1.18, sy * 0.88, 0.06)],
                  [0.24, 0.18, 0.12], A.shade(0.7), segs=5)
            b.ball(0.16, (sx * 1.2, sy * 0.92, 0.05), B, subdiv=0, scale=(1.3, 1.3, 0.6))
    RX, RY, RZ, CY, CZ = 0.98, 0.92, 0.5, 0.05, 0.6
    b.ball(1.0, (0, CY, CZ), A, subdiv=2, scale=(RX, RY, RZ), jitter=0.03)                   # the body
    b.ball(1.0, (0, 0.35, 0.48), B, subdiv=1, scale=(0.8, 0.72, 0.36))                      # pale throat
    for (x, y, r) in ((0.6, 0.35, 0.13), (-0.66, 0.2, 0.12), (0.72, -0.25, 0.1), (-0.5, -0.45, 0.1), (0.3, 0.68, 0.09),
                      (-0.32, 0.62, 0.09), (0.45, -0.6, 0.09)):
        q = 1 - (x / RX) ** 2 - ((y - CY) / RY) ** 2
        b.ball(r, (x, y, CZ + RZ * math.sqrt(max(0.0, q)) - 0.02), A.shade(0.6), subdiv=0)        # warts
    for s in (1, -1):  # bulging eyes up front
        b.ball(0.2, (s * 0.38, 0.55, 0.95), A, subdiv=1)
        b.ball(0.15, (s * 0.4, 0.62, 1.03), C, subdiv=1, glow=True)
        b.box((0.07, 0.07, 0.16), (s * 0.4, 0.76, 1.04), DARK)
    # the spout: short and fat, tipped up, a dark lip round the acid
    chain(b, [(0, 0.55, 0.68), (0, 0.95, 0.78), (0, 1.22, 0.93)], [0.44, 0.33, 0.29], A, segs=7)
    b.cyl(0.32, 0.14, (0, 1.25, 0.95), A.shade(0.5), segs=7, rot=(-0.9, 0, 0))
    b.cyl(0.21, 0.16, (0, 1.27, 0.97), C, segs=7, rot=(-0.9, 0, 0), glow=True)
    body = b.build(root)
    # the sac: a glowing bladder on its back, dark veins arching over it
    sc = Model(f"{kind}_sac", seed=10131)
    R = 0.6
    sc.ball(R, (0, 0, 0), C, subdiv=1, glow=True, scale=(1.0, 1.1, 0.85))
    for k in range(5):  # veins down from the crown, like the ribs of a bulb
        ph = TAU * k / 5 + 0.3
        pts = [(math.sin(t) * math.cos(ph) * R * 1.02, math.sin(t) * math.sin(ph) * R * 1.12, math.cos(t) * R * 0.87)
               for t in (0.25, 0.7, 1.15, 1.5)]
        chain(sc, pts, [0.05, 0.065, 0.06, 0.04], A.shade(0.5), segs=4)
    sc.cyl(0.14, 0.1, (0, 0, R * 0.82), A.shade(0.5), segs=6)                              # the knot at its crown
    sc.ball(0.32, (0, 0.0, -0.34), A, subdiv=1, scale=(1.5, 1.5, 0.6))
    sac = sc.build(body, loc=(0, -0.38, 1.02))

    def swell(u):  # fills slowly, then spits (a quick squeeze)
        k = u / 0.8 if u < 0.8 else 1 - (u - 0.8) / 0.2
        k = k * k * (3 - 2 * k)
        return (0.28 * k, 0.28 * k, 0.32 * k)
    sample(sac, clip, "scale", T, swell)
    osc(body, clip, "scale", T, (2, 0.04, 1, 0.0))
    mount(body, kind, "muzzle", (0, 1.35, 1.05))


# --- the bloom ------------------------------------------------------------------------------------

def puffball():
    """A drifting spore mine: a round purple pod bristling with fat lilac spikes tipped with light (a
    sea mine grown out of rot), a glowing core showing through its split crown, a dark frill and gills
    underneath. Swells and sinks like breathing. ~1.2 across."""
    kind, clip, root = named("puffball", "swarm", "beast", "swell", preview=BLOOM)
    T = 2.0
    b = Model(f"{kind}_body", seed=10200)
    b.ball(0.44, (0, 0, 0), A, subdiv=1, jitter=0.03, scale=(1, 1, 0.92))
    b.ball(0.4, (0, 0, -0.12), A.shade(0.6), subdiv=1, scale=(1, 1, 0.75))                 # dark underside
    for k in range(8):  # a short dark frill round the lower edge, gills underneath
        a = TAU * (k + 0.5) / 8
        c, s = math.cos(a), math.sin(a)
        flat(b, [(c * 0.3 - s * 0.14, s * 0.3 + c * 0.14), (c * 0.3 + s * 0.14, s * 0.3 - c * 0.14),
                 (c * 0.5 + s * 0.16, s * 0.5 - c * 0.16), (c * 0.55, s * 0.55), (c * 0.5 - s * 0.16, s * 0.5 + c * 0.16)][::-1],
             -0.24, 0.06, A.shade(0.45))
        b.box((0.06, 0.28, 0.14), (c * 0.22, s * 0.22, -0.42), DARK, rot=(0, 0, a + math.pi / 2))
    # spikes: five round the waist and three up top, fat, each tipped with a light
    spikes = [(TAU * (k + 0.25) / 5, 0.2) for k in range(5)] + [(TAU * (k + 0.5) / 3, 0.9) for k in range(3)]
    for a, el in spikes:
        d = (math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el))
        limb(b, tuple(v * 0.34 for v in d), tuple(v * 0.68 for v in d), 0.14, 0.04, B, segs=5)
        b.ball(0.085, tuple(v * 0.69 for v in d), C, subdiv=0, glow=True)
    for k in range(3):  # the split crown: three lips round an opening
        a = TAU * k / 3
        b.box((0.26, 0.13, 0.12), (math.cos(a) * 0.21, math.sin(a) * 0.21, 0.37), A.shade(0.55), rot=(0, 0, a + math.pi / 2))
    body = b.build(root)
    cr = Model(f"{kind}_core", seed=10201)
    cr.ball(0.22, (0, 0, 0), C, subdiv=1, glow=True)
    core = cr.build(body, loc=(0, 0, 0.34))
    pulse(core, clip, T, 0.3, harm=2)

    def swell(u):  # a slow breath with a little tremble at the top
        k = 0.5 - 0.5 * math.cos(TAU * u)
        t = 0.02 * math.sin(TAU * 6 * u) * k
        return (0.12 * k + t, 0.12 * k + t, 0.14 * k - t)
    sample(body, clip, "scale", T, swell)
    marker(body, kind, "muzzle", (0, 0.5, 0.0))
    osc(body, clip, "location", T, (2, 0.1, 1, 0.25), (0, 0.04, 1, 0))
    osc(body, clip, "rotation_euler", T, (2, 0.15, 1, 0))


def build():
    warden()
    prism()
    gatekeeper()
    rook()
    strongbox()
    swooper()
    burrower()
    spitter()
    puffball()
