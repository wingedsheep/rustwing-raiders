"""ASHGRAVE, the Glass Craters (docs/level-design.md, its layout row): the Glassing's fire plan, laid
out by src/sim/layouts/glass.ts. The bowls are terrain; these are the things round them:

- ejecta: slabs of baked crust the shots threw out and tipped up round every rim (outward +x, the
  lifted inner edge showing the glass under the crust);
- spires and needles: blades of fused glass where the heat ran deepest (the needles past the
  flight line, solid);
- the Compact's ranging masts at the edge of the fire zone, and the dud that never went off;
- the Sankvi's warning stakes, the convoy's burnt road posts;
- the Uukhvar convoy fused where it stood, sunk in puddles of its own glass;
- the cutters' lens-glass blocks and their derrick, the Chikta's sail-barges and lantern poles;
- the gunship that glassed it all, shot down and sunk in a lake of its own glass (a giant).

Blender +x is game +x, +y is up the screen. Built into set_ashgrave (see its build())."""
from __future__ import annotations

import math
import random

from mathutils import Vector

from kit import Model, light
from props_a_lib import collider as lean_collider
from props_a_lib import hull
from props_b_kit import M, collider, facet, jitter, limb, mark, new_faces, paint, root, xform
from props_b_ashgrave import (BOTTLE, FUSED, GUNMETAL, HAZARD, HOST_YELLOW, IVORY, OXBLOOD, RUST, SEAM, SEAM_PALE,
                              STEEL, TARP, TARP_DARK, WAR_RED)
from set_ashgrave_titans import _hand_sign

# the crust the heat baked the sand to: dark, a little warm
CRUST = ["#211f1a", "#2e2c25", "#3e3b32", "#524e42"]
# the grey ash blowing in over it from the graveyard
ASHC = ["#7e7a72", "#8e8a82", "#a29e94"]
# glass, darkest to the lit facet (no glow): the glow is only in its seams
GL = ["#0c2418", "#123422", BOTTLE[1], BOTTLE[2], BOTTLE[3]]
GLOW = SEAM[0]
SAND = ["#8a7e66", "#a39678", "#b8ab90"]
CHARRED = ["#141416", "#1e1e22", "#2a2a2e"]
LAMP = "#ffb050"
ENGINE = "#c8783a"


def _dust(m, faces, amt=0.35, up=0.7):
    """Ash settled on the tops."""
    for f in faces:
        if not f.is_valid:
            continue
        f.normal_update()
        if f.normal.z > up and m.rng.random() < amt:
            f.material_index = m._slot(ASHC[m.rng.randrange(len(ASHC))], False)


def _crust_glass(m, faces, rng):
    """Crust on top, the glass under it where it broke and lifted: by which way each face looks."""
    def fn(f):
        n = f.normal
        # (ash lies on the tops, paler than the ground, so a slab reads as the world, not a foe)
        if n.z > 0.45:
            return ASHC[1 if n.dot(Vector((-0.45, 0.35, 0.82))) > 0.75 else 0]
        if n.x < -0.25 or n.z < -0.3:
            return GL[2 + (1 if n.x < -0.6 else 0)]
        return CRUST[3] if rng.random() < 0.7 else CRUST[2]
    paint(m, faces, fn)
    _dust(m, faces, 0.25, 0.8)


def _slab_pts(rng, L, W, T, taper=1.0):
    """A rough slab's corners (x along L, centred), a little irregular."""
    pts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            w = W / 2 * (taper if sx > 0 else 1)
            for sz in (0, 1):
                pts.append((sx * L / 2 * rng.uniform(0.85, 1.0), sy * w * rng.uniform(0.8, 1.0), sz * T * (rng.uniform(0.85, 1.1) if sz else 1)))
    for k in range(3):
        pts.append((rng.uniform(-L / 2, L / 2), rng.choice((-1, 1)) * W / 2 * rng.uniform(0.9, 1.1), T * rng.uniform(0.3, 1.0)))
    return pts


def _tipped(m, rng, L, W, T, tilt, at=(0, 0, 0), yaw=0.0, taper=1.0, seam=True):
    """A slab tipped up on its inner (-x) edge, its outer (+x) edge dug in; the seam along the break."""
    st = mark(m)
    hull(m, _slab_pts(rng, L, W, T, taper), CRUST[2])
    # (lift the inner edge: turn about y, then sink the outer edge in)
    sink = -0.15
    xform(m, st, M((at[0], at[1], at[2] + L / 2 * math.sin(tilt) + sink), (0, tilt, yaw)))
    _crust_glass(m, new_faces(m, st), rng)
    if seam:
        # the glass the crust broke off, lit in its crack along the lifted edge's underside
        ex = at[0] - math.cos(yaw) * L / 2 * math.cos(tilt) * 0.92
        ey = at[1] - math.sin(yaw) * L / 2 * math.cos(tilt) * 0.92
        ez = at[2] + max(0.12, L * math.sin(tilt) * 0.55)
        m.box((0.12, W * 0.7, 0.14), (ex, ey, ez), GLOW, rot=(0, tilt, yaw), glow=True)


def _crumbs(m, rng, x0, x1, n, size=0.35):
    for k in range(n):
        st = mark(m)
        m.ball(size * rng.uniform(0.6, 1.1), (rng.uniform(x0, x1), rng.uniform(-0.8, 0.8), 0.02), CRUST[1], subdiv=0, scale=(1.2, 1, 0.6))
        facet(m, new_faces(m, st), CRUST[:3], noise=0.2)


def ejecta(v):
    """Scenery: crust the shot threw out of its bowl and tipped up, outward +x. v0 a slab, v1 a slab
    broken in two, v2 a wedge, v3 two stacked, v4 a curled flap, v5 a rubbly heap."""
    r = root("ashgrave_glass_ejecta", v)
    rng = random.Random(5100 + v)
    m = Model(f"ashgrave_glass_ejecta_{v}", 5100 + v)
    if v == 0:
        _tipped(m, rng, 2.2, 1.5, 0.42, 0.42)
        _crumbs(m, rng, 0.9, 1.6, 3)
    elif v == 1:
        _tipped(m, rng, 1.3, 1.4, 0.4, 0.55, at=(-0.55, 0, 0))
        _tipped(m, rng, 1.1, 1.3, 0.36, 0.22, at=(0.85, 0.12, -0.05), yaw=0.25, seam=False)
        _crumbs(m, rng, 1.3, 1.8, 2)
    elif v == 2:
        _tipped(m, rng, 1.9, 1.7, 0.75, 0.38, taper=0.45)
        _crumbs(m, rng, 0.7, 1.4, 3, 0.3)
    elif v == 3:
        _tipped(m, rng, 2.4, 1.6, 0.35, 0.12, seam=False)
        _tipped(m, rng, 1.6, 1.2, 0.34, 0.5, at=(-0.2, 0.1, 0.32), yaw=-0.2)
    elif v == 4:
        # a flap of crust curled back as it was thrown: three pieces, each steeper
        for k, (x, a) in enumerate(((0.75, 0.12), (0.0, 0.5), (-0.55, 1.0))):
            _tipped(m, rng, 0.9, 1.5 - k * 0.15, 0.24, a, at=(x, 0, 0.0 + k * 0.18), seam=(k == 2))
    else:
        for k in range(5):
            st = mark(m)
            x = rng.uniform(-0.9, 0.8)
            m.ball(rng.uniform(0.35, 0.6), (x, rng.uniform(-0.6, 0.6), rng.uniform(0.1, 0.35)), CRUST[2], subdiv=0, jitter=0.08, scale=(1.3, 1, 0.75))
            _crust_glass(m, new_faces(m, st), rng)
        st = mark(m)
        m.ball(0.42, (-0.6, 0.1, 0.45), GL[2], subdiv=0, scale=(1, 0.8, 0.9))
        facet(m, new_faces(m, st), GL[1:], noise=0.15)
        m.box((0.1, 0.4, 0.1), (-0.85, 0.1, 0.5), GLOW, glow=True)
    m.build(r)
    return r


def _blade(m, rng, base, d, length, w, t, cols=GL, seam=True):
    """A blade of fused glass from base along d: flat-ish, narrowing to an edge, faceted dark."""
    d = Vector(d).normalized()
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 0.1:
        side = Vector((1, 0, 0))
    side.normalize()
    side = side @ M((0, 0, 0), (0, 0, rng.uniform(-1.2, 1.2))).to_3x3()
    thick = d.cross(side).normalized()
    b = Vector(base)
    pts = []
    for k, (u, ww, tt) in enumerate(((0.0, 1.0, 1.0), (0.45, 0.8, 0.85), (0.8, 0.45, 0.5), (1.0, 0.05, 0.1))):
        c = b + d * length * u
        for s1 in (-1, 1):
            for s2 in (-1, 1):
                j = rng.uniform(0.85, 1.1)
                pts.append(tuple(c + side * s1 * w * ww * j + thick * s2 * t * tt * j))
    st = mark(m)
    hull(m, pts, cols[2])
    f = new_faces(m, st)
    facet(m, f, cols, noise=0.22, bias=-0.1)
    if seam:
        # the heat still in it: a lit crack up its face, from low to two-thirds up
        a = b + d * length * 0.15 + thick * t * 0.95
        e = b + d * length * 0.62 + thick * t * 0.5
        limb(m, a, e, w * 0.16, w * 0.08, GLOW, segs=4, glow=True)
    return f


def _collar(m, rng, R, h=0.6):
    """The crust heaped round a spire's foot, ash on its top."""
    st = mark(m)
    pts = []
    for k in range(9):
        a = k / 9 * math.tau + rng.uniform(-0.2, 0.2)
        d = R * rng.uniform(0.85, 1.15)
        pts.append((math.cos(a) * d, math.sin(a) * d, -0.1))
        pts.append((math.cos(a) * d * 0.6, math.sin(a) * d * 0.6, h * rng.uniform(0.7, 1.1)))
    hull(m, pts, CRUST[2])
    f = new_faces(m, st)
    facet(m, f, CRUST, noise=0.15)
    _dust(m, f, 0.4)


def spire(v):
    """Scenery: blades of fused glass standing where the heat ran deepest, leaning out from their
    middle, lit in their cracks; a collar of crust at the foot. 2.5 to 6 tall."""
    r = root("ashgrave_glass_spire", v)
    rng = random.Random(5200 + v)
    m = Model(f"ashgrave_glass_spire_{v}", 5200 + v)
    n = (1, 3, 4, 2)[v]
    tallest = (5.6, 4.8, 3.6, 6.0)[v]
    a0 = rng.uniform(0, math.tau)
    for k in range(n):
        a = a0 + k / n * math.tau + rng.uniform(-0.4, 0.4)
        out = 0 if (k == 0 and n > 1) or n == 1 else rng.uniform(0.35, 0.6)
        L = tallest * (1 if k == 0 else rng.uniform(0.5, 0.8))
        d = (math.cos(a) * (0.12 if k == 0 else out), math.sin(a) * (0.12 if k == 0 else out), 1)
        base = (math.cos(a) * (0 if k == 0 else 0.35), math.sin(a) * (0 if k == 0 else 0.35), -0.2)
        _blade(m, rng, base, d, L, 0.55 if k == 0 else 0.42, 0.28, seam=(k == 0 or rng.random() < 0.4))
    _collar(m, rng, 1.1 + n * 0.15)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def needle(v):
    """SOLID: the spires' family grown past the flight line: 2 or 3 great blades, 14 to 18 tall,
    dark and heavy, a sleeve of crust up their feet; colliders where each crosses the flight line."""
    r = root("ashgrave_glass_needle", v)
    rng = random.Random(5300 + v)
    m = Model(f"ashgrave_glass_needle_{v}", 5300 + v)
    n = (2, 3, 3)[v]
    a0 = rng.uniform(0, math.tau)
    for k in range(n):
        a = a0 + k / n * math.tau + rng.uniform(-0.3, 0.3)
        H = (rng.uniform(16, 18) if k == 0 else rng.uniform(13.5, 15.5))
        lean = 0.04 if k == 0 else rng.uniform(0.12, 0.18)
        bx = math.cos(a) * (0.3 if k == 0 else 1.0)
        by = math.sin(a) * (0.3 if k == 0 else 1.0)
        d = Vector((math.cos(a) * lean, math.sin(a) * lean, 1)).normalized()
        L = H / d.z
        w = 1.25 if k == 0 else 1.0
        _blade(m, rng, (bx, by, -0.3), d, L, w, w * 0.62)
        # a second lit crack, high up, so it reads as glass and not rock from above
        top = Vector((bx, by, -0.3)) + d * L * 0.85
        m.box((0.18, 0.18, 1.6), tuple(top - d * 1.4), SEAM_PALE[0], rot=(0, math.atan2(math.hypot(d.x, d.y), d.z), a), glow=True)
        # where it crosses the flight line: (x, y) there, its radius, its lean, its top
        z10 = 10.3
        t10 = (z10 + 0.3) / d.z
        u = t10 / L
        rad = w * (0.8 - 0.35 * (u - 0.45) / 0.35) if u > 0.45 else w * (1 - 0.2 * u / 0.45)
        lean_collider(r, bx + d.x * t10, by + d.y * t10, max(0.55, rad * 0.95), z=z10, lean=(d.x / d.z, d.y / d.z), top=H * 0.97)
    _collar(m, rng, 2.4, 1.6)
    # shards fallen round it
    for k in range(4):
        st = mark(m)
        a = rng.uniform(0, math.tau)
        x, y = math.cos(a) * rng.uniform(2.4, 3.4), math.sin(a) * rng.uniform(2.4, 3.4)
        hull(m, [(x + rng.uniform(-0.6, 0.6), y + rng.uniform(-0.4, 0.4), rng.uniform(0, 0.5)) for _ in range(7)], GL[2])
        facet(m, new_faces(m, st), GL, noise=0.2)
    m.build(r)
    return r


# block digits, 3 × 5: a cell each where there's paint
DIGITS = {
    "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "011", "001", "111"],
    "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"],
    "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
}


def _digits(m, text, cell, color):
    """Block numerals on the plane z = 0, centred, reading along +x with their tops toward +y."""
    W = len(text) * 4 - 1
    for i, ch in enumerate(text):
        for row, bits in enumerate(DIGITS[ch]):
            for col, b in enumerate(bits):
                if b == "1":
                    m.box((cell * 1.02, cell * 1.02, 0.08), ((i * 4 + col - W / 2 + 0.5) * cell, (2 - row) * cell, 0), color)


def mast(v):
    """SOLID: the Compact's ranging mast at the edge of the fire zone: a lattice tower, ivory banded
    oxblood, its range plate tipped back near the top with the range in block numerals, a dead lamp,
    the glass pooled round its foot. v1 its top bent over by the heat."""
    r = root("ashgrave_glass_mast", v)
    rng = random.Random(5400 + v)
    m = Model(f"ashgrave_glass_mast_{v}", 5400 + v)
    H = 16.5
    bend = 11.5 if v == 1 else None

    def at(x, y, z):
        """A point on the mast, bent over past `bend` (v1)."""
        p = Vector((x, y, z))
        if bend is None or z <= bend:
            return p
        k = (z - bend) / (H - bend)
        a = 1.25 * k
        rel = Vector((x, y, z - bend))
        rel = M((0, 0, 0), (0, a, 0)).to_3x3() @ rel
        return Vector((0, 0, bend)) + rel + Vector((0.6 * k, 0, 0))

    def half(z):
        return 1.15 - 0.75 * z / H

    levels = [i * H / 10 for i in range(11)]
    corners = [(1, 1), (1, -1), (-1, -1), (-1, 1)]
    for i in range(10):
        z0, z1 = levels[i], levels[i + 1]
        band = i in (3, 6, 9)
        col = OXBLOOD if band else IVORY[3 if i % 2 else 2]
        for cx, cy in corners:
            limb(m, at(cx * half(z0), cy * half(z0), z0), at(cx * half(z1), cy * half(z1), z1), 0.16, 0.15, col, segs=4)
        # braces: an X on two faces, a ring each level
        for k in range(4):
            ax, ay = corners[k]
            bx, by = corners[(k + 1) % 4]
            limb(m, at(ax * half(z0), ay * half(z0), z0), at(bx * half(z1), by * half(z1), z1), 0.08, 0.08, IVORY[1], segs=4)
            limb(m, at(ax * half(z1), ay * half(z1), z1), at(bx * half(z1), by * half(z1), z1), 0.09, 0.09, IVORY[2] if not band else OXBLOOD, segs=4)
    # the range plate, near the top, tipped back so its face shows from above
    st = mark(m)
    m.box((2.8, 2.0, 0.18), (0, 0, 0), IVORY[4])
    m.box((3.0, 0.22, 0.24), (0, 1.05, 0.02), OXBLOOD)
    m.box((3.0, 0.22, 0.24), (0, -1.05, 0.02), OXBLOOD)
    sd = mark(m)
    _digits(m, ("24", "31")[v], 0.24, "#2a2420")
    xform(m, sd, M((0, 0, 0.12)))
    xform(m, st, M((0, 0, 0), (-0.95, 0, 0)))
    zp = H - 3.2
    pl = at(0, -half(zp) - 0.3, zp)
    xform(m, st, M(tuple(pl), (0, 1.25 * ((zp - bend) / (H - bend)) if bend and zp > bend else 0, 0)))
    # the dead lamp on top, its lens dark
    top = at(0, 0, H)
    m.cyl(0.55, 0.7, tuple(top), IVORY[2], segs=6)
    m.cyl(0.4, 0.3, tuple(top + Vector((0, 0, 0.7))), "#1c2420", segs=6)
    # its footing: a concrete pad, the glass run round it in a pool, lit only in one crack
    m.box((3.2, 3.2, 0.5), (0, 0, 0.0), "#6a665c")
    pts = []
    for k in range(12):
        a = k / 12 * math.tau
        d = rng.uniform(3.4, 4.4)
        pts.append((math.cos(a) * d, math.sin(a) * d))
    m.slab([(x * 1.12, y * 1.12) for x, y in pts], -0.1, 0.05, FUSED[1])
    st = mark(m)
    m.slab(pts, -0.1, 0.14, GL[2], top=[(x * 0.95, y * 0.95) for x, y in pts])
    facet(m, new_faces(m, st), GL[1:], noise=0.2)
    a = rng.uniform(0, math.tau)
    m.box((2.2, 0.18, 0.06), (math.cos(a) * 2.6, math.sin(a) * 2.6, 0.16), GLOW, rot=(0, 0, a + 0.5), glow=True)
    collider(r, 0, 0, 1.2)
    m.build(r)
    return r


def _shell(m, L=3.5, R=0.5):
    """A Compact shell along +z, base at 0: ivory, an oxblood band, a copper driving band, scorched."""
    m.cyl(R, L * 0.62, (0, 0, 0), IVORY[3], segs=8)
    m.cyl(R * 1.04, 0.22, (0, 0, 0.3), "#8a5a34", segs=8)
    m.cyl(R * 1.02, 0.3, (0, 0, L * 0.5), OXBLOOD, segs=8)
    m.cyl(R, L * 0.38, (0, 0, L * 0.62), IVORY[3], segs=8, r_top=0.08)
    # stencil marks and scorch
    m.box((0.08, 0.5, 0.6), (R * 0.98, 0, L * 0.3), "#2a2420")
    m.box((0.08, 0.3, 0.3), (R * 0.98, 0, L * 0.18), "#2a2420")
    m.box((0.5, 0.08, 0.9), (0, R * 0.98, L * 0.35), CHARRED[1])


def dud(v):
    """Scenery: a Compact shell that never went off, standing where it fell: v0 nose down, half
    buried at a tilt, its base up; v1 on its side, half sunk. A ring of pale sand round it."""
    r = root("ashgrave_glass_dud", v)
    rng = random.Random(5500 + v)
    m = Model(f"ashgrave_glass_dud_{v}", 5500 + v)
    st = mark(m)
    _shell(m)
    if v == 0:
        xform(m, st, M((0, 0, 0), (math.pi - 0.45, 0, 0.3)))
        xform(m, st, M((0, 0, 2.3)))
    else:
        xform(m, st, M((-1.75, 0, 0.22), (0, math.pi / 2, 0.2)))
    # the sand it kept from the heat, pale, a lip round it
    pts = [(math.cos(k / 10 * math.tau) * rng.uniform(1.6, 2.0) * (1.4 if v else 1), math.sin(k / 10 * math.tau) * rng.uniform(1.4, 1.8)) for k in range(10)]
    st = mark(m)
    m.slab(pts, -0.1, 0.06, SAND[1], top=[(x * 0.9, y * 0.9) for x, y in pts])
    facet(m, new_faces(m, st), SAND, noise=0.2)
    m.build(r)
    return r


def stake(v):
    """Scenery: v0 a Sankvi warning stake round a dud: a pipe with a red rag and a little plate with
    the clan's green hand. v1 a convoy road's marker post burnt to a charred stump."""
    r = root("ashgrave_glass_stake", v)
    rng = random.Random(5600 + v)
    m = Model(f"ashgrave_glass_stake_{v}", 5600 + v)
    if v == 0:
        m.cyl(0.13, 1.7, (0, 0, -0.1), RUST[1], segs=5, rot=(rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), 0))
        m.box((0.7, 0.08, 0.45), (0.38, 0, 1.3), WAR_RED, rot=(0, 0.25, 0.3))
        m.box((0.55, 0.55, 0.06), (0, 0, 1.75), "#c8c2b4", rot=(0.5, 0, 0))
        st = mark(m)
        _hand_sign(m, (0, 0, 0), 0.32)
        xform(m, st, M((0, -0.03, 1.8), (0.5, 0, 0)))
        m.cyl(0.35, 0.2, (0, 0, -0.05), CRUST[2], segs=6)
    else:
        st = mark(m)
        hull(m, [(x, y, z) for x in (-0.28, 0.28) for y in (-0.28, 0.28) for z in (0.0,)] + [(rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), rng.uniform(0.8, 1.25)) for _ in range(4)], CHARRED[1])
        facet(m, new_faces(m, st), CHARRED, noise=0.25)
        m.cyl(0.42, 0.15, (0, 0, -0.05), CRUST[0], segs=6)
    m.build(r)
    return r


def _glass_runs(m, rng, pts, n, size=0.45):
    """Glass run over a hull and set: lumps, dark, a few lit."""
    for k in range(n):
        p = rng.choice(pts)
        st = mark(m)
        m.ball(size * rng.uniform(0.7, 1.3), p, GL[2], subdiv=0, jitter=0.06, scale=(1.2, 1.0, 0.75))
        facet(m, new_faces(m, st), GL[1:], noise=0.2, bias=0.05)


def _puddle(m, rng, rx, ry):
    """The lip of glass run up round a sunk thing: a ring a little proud of the sheet, its crack lit."""
    pts = []
    for k in range(14):
        a = k / 14 * math.tau
        kk = rng.uniform(0.92, 1.08)
        pts.append((math.cos(a) * rx * kk, math.sin(a) * ry * kk))
    st = mark(m)
    m.slab(pts, -0.2, 0.12, GL[2], top=[(x * 0.93, y * 0.93) for x, y in pts])
    facet(m, new_faces(m, st), GL, noise=0.2)
    a = rng.uniform(0, math.tau)
    m.box((rx * 0.6, 0.16, 0.06), (math.cos(a) * rx * 0.75, math.sin(a) * ry * 0.75, 0.13), GLOW, rot=(0, 0, a + 1.3), glow=True)


def _wheels(m, ys, x, sink, r=0.55, w=0.45):
    """A row of wheels down one flank, sunk half in the glass, hubs showing."""
    for y in ys:
        m.cyl(r, w, (x, y, sink + r * 0.8), "#16181c", segs=8, rot=(0, math.pi / 2, 0))
        m.cyl(r * 0.45, w + 0.06, (x, y, sink + r * 0.8), GUNMETAL[2], segs=6, rot=(0, math.pi / 2, 0))


def _cab(m, y, sink, G):
    """A cab-over cab at y, nose +y: its windscreen, the hazard bumper, mirrors, a light bar, the
    stack behind it; its roof's yellow chevron, the convoy's mark from above."""
    body = set()
    body |= m.box((2.3, 1.9, 2.0), (0, y, sink + 1.2), G[2], taper=0.92)
    m.box((2.0, 0.12, 0.7), (0, y + 0.96, sink + 1.6), "#0e1416")
    # the bumper in hazard stripes
    m.box((2.5, 0.35, 0.45), (0, y + 1.1, sink + 0.55), "#16181c")
    for k in range(5):
        m.box((0.22, 0.38, 0.47), (-1.0 + k * 0.5, y + 1.1, sink + 0.55), HOST_YELLOW, rot=(0, 0.5, 0))
    for k in (-1, 1):
        m.box((0.12, 0.35, 0.5), (k * 1.32, y + 0.7, sink + 1.7), "#16181c")
    m.box((1.6, 0.14, 0.12), (0, y + 0.75, sink + 2.24), G[1])
    # the chevron on the roof, pointing the way it was going
    for k in (-1, 1):
        m.box((0.9, 0.26, 0.05), (k * 0.3, y - 0.1, sink + 2.22), HOST_YELLOW, rot=(0, 0, -k * 0.7))
    m.cyl(0.13, 1.6, (1.05, y - 1.05, sink + 2.0), "#1a1a1c", segs=6)
    return body


def convoy(v):
    """WATERBORNE (z 0 the glass): an Uukhvar truck fused where it stood, nose +y, sunk to its axles
    in the glass (the layout's own puddle round it): gunmetal and hazard yellow, burnt, glass run
    over it. v0 a cab-over hauler, its tarp burnt off the bows and its crates showing; v1 a
    half-track gun carrier, its twin gun slewed to the side it fired at; v2 a tanker, split along a
    seam and bled glass."""
    r = root("ashgrave_glass_convoy", v)
    rng = random.Random(5700 + v)
    m = Model(f"ashgrave_glass_convoy_{v}", 5700 + v)
    G = GUNMETAL
    sink = -0.4
    body = set()
    tops = []
    if v in (0, 2):
        body |= _cab(m, 2.9, sink, G)
        tops.append((0, 2.9, sink + 2.2))
        for x in (-1.2, 1.2):
            _wheels(m, (3.0, -1.0, -2.4, -3.5), x, sink)
        if v == 0:
            # the bed, and the tarp bows over it, the tarp burnt to a few flaps
            body |= m.box((2.5, 5.2, 0.5), (0, -0.9, sink + 0.85), G[1])
            for y in (-3.2, -2.1, -1.0, 0.1, 1.2):
                m.box((2.5, 0.12, 0.12), (0, y, sink + 2.5), G[3])
                for k in (-1, 1):
                    m.box((0.12, 0.12, 1.4), (k * 1.22, y, sink + 1.8), G[3])
            m.box((0.12, 4.6, 0.12), (0, -1.0, sink + 2.56), G[3])
            for y0, y1, x in ((0.0, 1.3, -0.6), (-3.3, -2.3, 0.5)):
                m.box((1.4, y1 - y0, 0.06), (x, (y0 + y1) / 2, sink + 2.5), TARP[1], rot=(0, -0.12 if x < 0 else 0.12, 0))
            m.box((0.08, 1.4, 1.0), (1.26, -2.0, sink + 1.7), TARP[1])
            # the load: crates in the bed, one split, one tipped against the bows
            for (cx, cy, cs, cc) in ((-0.55, -2.7, 0.9, RUST[1]), (0.5, -2.6, 0.85, G[2]), (-0.5, -1.5, 0.95, RUST[2]),
                                     (0.45, -0.3, 0.9, RUST[1]), (-0.5, 0.6, 0.8, G[3])):
                st = mark(m)
                m.box((cs, cs, cs * 0.8), (cx, cy, sink + 1.1 + cs * 0.4), cc, rot=(0, 0, rng.uniform(-0.25, 0.25)))
                facet(m, new_faces(m, st), [cc, CHARRED[2]], noise=0.1)
                m.box((cs * 1.02, 0.1, 0.08), (cx, cy, sink + 1.12 + cs * 0.8), HOST_YELLOW if cc != G[3] else "#c8c0a8", rot=(0, 0, rng.uniform(-0.25, 0.25)))
            m.box((0.9, 0.9, 0.72), (0.45, 1.25, sink + 1.4), RUST[2], rot=(0.5, 0.2, 0.3))
            tops += [(0, -0.9, sink + 1.6), (0.8, -2.6, sink + 2.0), (-0.7, 0.6, sink + 1.8)]
        else:
            # the tank: walkway and rail on top, two hatches, the ladder; split down one seam
            body |= m.box((2.0, 0.6, 1.2), (0, 1.7, sink + 0.9), G[1])
            st = mark(m)
            m.cyl(1.15, 5.0, (0, -0.9, sink + 1.45), G[3], segs=10, rot=(math.pi / 2, 0, 0))
            facet(m, new_faces(m, st), G[2:], noise=0.06)
            for y in (1.55, -3.35):
                m.cyl(1.2, 0.18, (0, y, sink + 1.45), G[1], segs=10, rot=(math.pi / 2, 0, 0))
            for y in (0.2, -2.0):
                m.cyl(1.2, 0.35, (0, y, sink + 1.45), HOST_YELLOW, segs=10, rot=(math.pi / 2, 0, 0))
            m.box((0.5, 4.6, 0.06), (-0.25, -0.9, sink + 2.63), "#2a2e34")
            for y in (-0.4, -2.6):
                m.cyl(0.32, 0.22, (0.3, y, sink + 2.65), G[1], segs=8)
                m.cyl(0.2, 0.06, (0.3, y, sink + 2.78), "#16181c", segs=8)
            m.box((0.1, 0.1, 1.6), (-0.6, -3.5, sink + 1.6), G[2], rot=(0.2, 0, 0))
            # the seam it split along, glass bled out of it and down its side in a sheet
            m.box((0.16, 2.6, 0.12), (1.0, -1.2, sink + 2.15), GLOW, rot=(0, 0.75, 0), glow=True)
            st = mark(m)
            m.slab([(1.0, -2.6), (2.3, -2.9), (2.7, -1.0), (2.2, 0.4), (1.0, 0.2)], sink - 0.05, sink + 0.35, GL[2],
                   top=[(1.0, -2.4), (2.0, -2.6), (2.3, -1.0), (1.9, 0.2), (1.0, 0.0)])
            facet(m, new_faces(m, st), GL[1:], noise=0.15)
            tops += [(0, -1.0, sink + 2.6), (0.5, -3.0, sink + 2.4), (0.9, -0.5, sink + 2.2)]
    else:
        # the half-track: a low armoured hull, the tracks with their road wheels, the gun tub
        # behind a ring of sandbags, its twin gun slewed hard to starboard where it last fired
        st = mark(m)
        hull(m, [(x, y, z) for x in (-1.0, 1.0) for y in (-2.6, 1.5) for z in (sink, sink + 1.4)] + [(x, 2.6, sink + 0.9) for x in (-0.8, 0.8)] + [(x, 2.4, sink) for x in (-0.9, 0.9)], G[2])
        facet(m, new_faces(m, st), G[1:], noise=0.06)
        m.box((1.4, 0.3, 0.1), (0, 1.95, sink + 1.42), "#0e1416")
        for k in (-1, 1):
            m.box((0.6, 3.4, 0.7), (k * 1.3, -1.0, sink + 0.5), "#1a1c20")
            for y in (-2.3, -1.45, -0.6, 0.25):
                m.cyl(0.32, 0.64, (k * 1.3, y, sink + 0.55), G[1], segs=6, rot=(0, math.pi / 2, 0))
            m.box((0.66, 3.5, 0.08), (k * 1.3, -1.0, sink + 0.9), G[3])
            _wheels(m, (1.9,), k * 1.15, sink, 0.5, 0.4)
        m.box((2.04, 0.25, 0.25), (0, 0.9, sink + 1.42), HOST_YELLOW)
        for k in range(9):
            a = k / 9 * math.tau
            st = mark(m)
            m.ball(0.3, (math.cos(a) * 1.0, -0.9 + math.sin(a) * 1.0, sink + 1.6), TARP[4], subdiv=0, scale=(1.3, 0.9, 0.6), rot=(0, 0, a))
            facet(m, new_faces(m, st), [TARP[4], "#b8a888", "#8a7c66"], noise=0.15)
        m.cyl(0.7, 0.5, (0, -0.9, sink + 1.7), G[1], segs=8)
        for k in (-1, 1):
            limb(m, (0.2, -0.9 + k * 0.18, sink + 1.95), (2.7, -1.6 + k * 0.18, sink + 2.2), 0.13, 0.1, "#1a1c20", segs=5)
        m.box((0.45, 0.6, 0.35), (0.4, -1.05, sink + 2.0), G[3])
        for k in range(5):
            m.cyl(0.08, 0.5, (-0.5 + rng.uniform(-0.3, 0.3), -2.2 + rng.uniform(-0.3, 0.3), sink + 1.5), HAZARD, segs=5, rot=(math.pi / 2, 0, rng.uniform(0, math.tau)))
        tops += [(0, -0.8, sink + 2.0), (0.6, 1.4, sink + 1.5)]
    facet(m, body, G[1:], noise=0.06)
    # burnt patches, the glass run over it in lumps down its flanks and in drips off its edges
    if v in (0, 2):
        m.box((0.6, 0.7, 0.06), (rng.choice((-0.75, 0.75)), rng.uniform(2.3, 2.6), sink + 2.22), CHARRED[1])
    flank = [(s * rng.uniform(1.2, 1.5), rng.uniform(-3.2, 3.2), rng.uniform(0.0, 0.5)) for s in (-1, 1) for _ in range(5)]
    _glass_runs(m, rng, flank, 7, 0.5)
    _glass_runs(m, rng, tops, 2, 0.35)
    m.build(r)
    return r


def _block(m, rng, size, loc, rot=(0, 0, 0), lit=False):
    """A cut lens-glass block: dark glass, the cut faces paler, maybe one glowing edge."""
    st = mark(m)
    m.box(size, (0, 0, 0), GL[3])
    jitter(m, new_faces(m, st), 0.03)
    xform(m, st, M(loc, rot))
    facet(m, new_faces(m, st), GL[1:] + ["#5a9a7a"], noise=0.12, bias=0.15)
    if lit:
        st = mark(m)
        m.box((size[0] * 0.95, 0.1, 0.1), (0, -size[1] / 2, size[2] / 2), GLOW, glow=True)
        xform(m, st, M(loc, rot))


def block(v):
    """Scenery: the cutters' lens-glass, long side along y. v0 a stack on a sledge, lashed; v1 two
    big slabs on edge in a rack; v2 a row of three cut blocks, curing."""
    r = root("ashgrave_glass_block", v)
    rng = random.Random(5800 + v)
    m = Model(f"ashgrave_glass_block_{v}", 5800 + v)
    if v == 0:
        for k in (-1, 1):
            m.box((0.22, 3.4, 0.25), (k * 0.85, 0, 0.12), RUST[1])
            m.box((0.22, 0.6, 0.25), (k * 0.85, 1.85, 0.3), RUST[1], rot=(0.6, 0, 0))
        for y in (-1.2, 0, 1.2):
            m.box((2.0, 0.3, 0.12), (0, y, 0.3), STEEL[0])
        n = 0
        for layer in range(2):
            for i in range(2):
                for j in range(2 if layer else 1 + 1):
                    if layer and rng.random() < 0.35:
                        continue
                    _block(m, rng, (0.85, 1.35, 0.62), ((i - 0.5) * 0.9, (j - 0.5) * 1.42, 0.68 + layer * 0.65), lit=(n == 1))
                    n += 1
        m.box((2.1, 0.12, 0.08), (0, 0.4, 1.66), TARP[0])
    elif v == 1:
        for k in (-1, 1):
            limb(m, (k * 1.0, -1.4, 0), (0, -1.4, 2.2), 0.1, 0.1, STEEL[1], segs=4)
            limb(m, (k * 1.0, 1.4, 0), (0, 1.4, 2.2), 0.1, 0.1, STEEL[1], segs=4)
        limb(m, (0, -1.5, 2.2), (0, 1.5, 2.2), 0.1, 0.1, STEEL[0], segs=4)
        _block(m, rng, (0.36, 2.6, 1.9), (-0.32, 0, 1.0), rot=(0, -0.15, 0), lit=True)
        _block(m, rng, (0.36, 2.5, 1.8), (0.32, 0.05, 0.95), rot=(0, 0.15, 0))
    else:
        for k, (y, s) in enumerate(((-1.25, 0.95), (0, 1.1), (1.2, 0.85))):
            _block(m, rng, (1.3 * s, 1.0 * s, 0.9 * s), (rng.uniform(-0.2, 0.2), y, 0.45 * s), rot=(0, 0, rng.uniform(-0.15, 0.15)), lit=(k == 1))
    m.build(r)
    return r


def derrick(v):
    """Scenery: the cutters' shear legs of scavenged titan girders astride a cut, leaning out over it
    (+x), a stay back to its anchor, a chain down to a lens-block in a sling, the winch under a tarp."""
    r = root("ashgrave_glass_derrick", v)
    rng = random.Random(5900 + v)
    m = Model(f"ashgrave_glass_derrick_{v}", 5900 + v)
    apex = Vector((2.2, 0, 6.9))
    for k in (-1, 1):
        foot = Vector((-0.6, k * 2.4, 0))
        limb(m, foot, apex + Vector((0, k * 0.2, 0)), 0.3, 0.24, IVORY[2], segs=4)
        # the girder's flanges and its oxblood band, a titan's still
        limb(m, foot + Vector((0, 0, 2.2)) * 1, foot.lerp(apex, 0.42), 0.34, 0.33, OXBLOOD, segs=4)
        m.box((1.0, 1.0, 0.5), tuple(foot + Vector((0, 0, 0.2))), CRUST[2])
    m.box((0.7, 0.9, 0.5), tuple(apex), STEEL[1])
    # the stay back to its anchor, the winch under its tarp
    limb(m, apex, (-4.2, 0, 0.3), 0.07, 0.07, "#2a2622", segs=4)
    m.box((1.0, 1.0, 0.6), (-4.2, 0, 0.3), CRUST[1])
    m.box((1.4, 1.2, 0.9), (-2.4, 0.2, 0.45), STEEL[0])
    m.box((1.8, 1.6, 0.12), (-2.4, 0.2, 0.98), TARP[1], rot=(0.15, 0.1, 0.1))
    limb(m, (-2.4, 0.2, 0.7), apex, 0.05, 0.05, "#2a2622", segs=4)
    # the chain down, the block in its sling
    limb(m, apex, apex - Vector((0, 0, 4.2)), 0.09, 0.09, STEEL[0], segs=4)
    _block(m, rng, (1.3, 0.9, 0.8), tuple(apex - Vector((0, 0, 4.9))), rot=(0.1, 0.05, 0.3), lit=True)
    for k in (-1, 1):
        limb(m, apex - Vector((0, 0, 4.2)), apex - Vector((k * 0.6, 0, 4.6)), 0.05, 0.05, STEEL[0], segs=4)
    light(r, (2.2, 0, 1.5), SEAM_PALE[0], radius=3, intensity=0.4, halo=False)
    m.build(r)
    return r


def _banner(m, corners, cols, rng, nu=3, nv=3):
    """A patched sail between four corners (a, b, c, d around): a grid of patches, each its own banner."""
    a, b, c, d = (Vector(p) for p in corners)
    faces = set()
    for i in range(nu):
        for j in range(nv):
            u0, u1, v0, v1 = i / nu, (i + 1) / nu, j / nv, (j + 1) / nv

            def at(u, w):
                return (a.lerp(b, u)).lerp(d.lerp(c, u), w)
            pts = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]
            n = (pts[1] - pts[0]).cross(pts[3] - pts[0]).normalized() * 0.05
            col = rng.choice(cols)
            vs = [m.bm.verts.new(tuple(p - n)) for p in pts] + [m.bm.verts.new(tuple(p + n)) for p in pts]
            fs = [m.bm.faces.new(vs[:4][::-1]), m.bm.faces.new(vs[4:])]
            for k in range(4):
                k2 = (k + 1) % 4
                fs.append(m.bm.faces.new((vs[k], vs[k2], vs[4 + k2], vs[4 + k])))
            idx = m._slot(col, False)
            for f in fs:
                f.material_index = idx
            faces |= set(fs)
    return faces


def sail_barge(v):
    """WATERBORNE (z 0 the glass): a Chikta sail-barge, home of a family: a long low skate hull on three
    runners, nose +y, crates and a deckhouse of a titan's knuckle, a mast with a patched sail of old war
    banners (v0 furled on its boom, v1 set and raked), lanterns in the rigging."""
    r = root("ashgrave_sail_barge", v)
    rng = random.Random(6000 + v)
    m = Model(f"ashgrave_sail_barge_{v}", 6000 + v)
    # the runners: one steering at the bow, two outriggers aft on a crossbeam
    for x, y, L in ((0, 3.0, 2.4), (-2.0, -2.4, 3.0), (2.0, -2.4, 3.0)):
        m.box((0.18, L, 0.3), (x, y, 0.15), STEEL[1])
        m.box((0.18, 0.6, 0.3), (x, y + L / 2 + 0.2, 0.3), STEEL[1], rot=(0.6, 0, 0))
        m.box((0.3, 0.3, 0.6), (x, y, 0.55), RUST[1])
    m.box((4.4, 0.45, 0.3), (0, -2.4, 0.85), RUST[2])
    # the hull: long, low, pointed at the bow
    pts = [(0, 4.2), (0.9, 3.0), (1.35, 1.0), (1.4, -2.0), (1.1, -3.6), (-1.1, -3.6), (-1.4, -2.0), (-1.35, 1.0), (-0.9, 3.0)]
    st = mark(m)
    m.slab(pts, 0.55, 1.15, RUST[1], top=[(x * 1.06, y * 1.03) for x, y in pts])
    facet(m, new_faces(m, st), [RUST[0], RUST[1], RUST[2]], noise=0.1)
    # the deck, in mismatched plates
    for k, y in enumerate((2.4, 1.0, -0.4, -1.8, -3.0)):
        w = 1.0 if k == 0 else 1.25
        m.box((w * 2, 1.3, 0.08), (rng.uniform(-0.05, 0.05), y, 1.18), [IVORY[2], GUNMETAL[2], RUST[2], IVORY[1], STEEL[1]][k], rot=(0, 0, rng.uniform(-0.05, 0.05)))
    # the deckhouse aft: a titan's knuckle, its shell
    st = mark(m)
    m.ball(1.1, (0, -2.6, 1.3), IVORY[2], subdiv=1, scale=(1.05, 0.9, 0.85))
    facet(m, new_faces(m, st), IVORY[1:], noise=0.06)
    m.box((2.0, 0.25, 0.3), (0, -2.0, 1.95), OXBLOOD)
    m.box((0.6, 0.1, 0.55), (0, -1.7, 1.55), "#1a1612")
    # crates forward
    for k in range(3):
        m.box((0.7, 0.7, 0.55), (rng.uniform(-0.7, 0.7), rng.uniform(1.6, 2.8), 1.47), [TARP[1], RUST[2], STEEL[1]][k], rot=(0, 0, rng.uniform(-0.4, 0.4)))
    # the mast and boom; the sail
    mast_at = Vector((0, 0.6, 1.15))
    H = 6.6
    limb(m, mast_at, mast_at + Vector((0, 0, H - 1.15)), 0.14, 0.11, STEEL[0], segs=5)
    banners = [IVORY[3], OXBLOOD, GUNMETAL[2], HOST_YELLOW, RUST[2], IVORY[2], WAR_RED]
    if v == 0:
        boom0 = mast_at + Vector((0, 0, 1.0))
        boom1 = boom0 + Vector((0, -3.8, 0.1))
        limb(m, boom0, boom1, 0.09, 0.08, STEEL[0], segs=4)
        for k in range(5):
            p = boom0.lerp(boom1, (k + 0.5) / 5)
            m.ball(0.36, tuple(p + Vector((0, 0, 0.18))), banners[k % len(banners)], subdiv=0, scale=(1, 1.7, 0.9))
    else:
        # set, and raked well over (the wind on its quarter), so it shows from above
        top = mast_at + Vector((0.0, 0, H - 1.15))
        boom0 = mast_at + Vector((0, 0, 0.9))
        clew = boom0 + Vector((2.6, -3.0, 0.4))
        head = top + Vector((1.2, -0.3, -0.4))
        _banner(m, [boom0, clew, head, top], banners, rng, 3, 3)
        limb(m, boom0, clew, 0.08, 0.07, STEEL[0], segs=4)
        # the clan's hand on it, big, where it catches the eye
        st = mark(m)
        _hand_sign(m, (0, 0, 0), 0.7, color="#c8c2b4")
        xform(m, st, M(tuple(boom0.lerp(head, 0.5).lerp(clew, 0.35) + Vector((0.2, 0.2, 0.1))), (0.35, -0.75, -0.6)))
    # stays, and the lanterns hung on them
    for end in ((0, 4.2, 1.2), (0, -3.6, 1.2)):
        limb(m, mast_at + Vector((0, 0, H - 1.3)), end, 0.035, 0.035, "#2a2622", segs=3)
    for k, t in enumerate((0.45, 0.7)):
        p = (mast_at + Vector((0, 0, H - 1.3))).lerp(Vector((0, 4.2, 1.2)), t)
        m.box((0.3, 0.3, 0.4), tuple(p - Vector((0, 0, 0.3))), LAMP, glow=True)
    m.box((0.3, 0.3, 0.4), (0.9, -2.4, 2.0), LAMP, glow=True)
    light(r, (0, 2.2, 3.4), LAMP, radius=5, intensity=0.6, flicker=0.15, halo=False)
    m.build(r)
    return r


def lantern_pole(v):
    """Scenery: a pole by the barges' landing, an amber lantern hung off its crook. v0 a pipe; v1 a
    titan's cable, stood up stiff, two lanterns."""
    r = root("ashgrave_lantern_pole", v)
    rng = random.Random(6100 + v)
    m = Model(f"ashgrave_lantern_pole_{v}", 6100 + v)
    if v == 0:
        limb(m, (0, 0, -0.1), (0, 0, 3.0), 0.1, 0.09, RUST[1], segs=5)
        limb(m, (0, 0, 3.0), (0.7, 0, 3.25), 0.08, 0.08, RUST[1], segs=4)
        limb(m, (0.7, 0, 3.25), (0.7, 0, 2.7), 0.03, 0.03, "#2a2622", segs=3)
        m.box((0.36, 0.36, 0.46), (0.7, 0, 2.45), LAMP, glow=True)
        m.box((0.44, 0.44, 0.08), (0.7, 0, 2.72), "#2a2622")
        light(r, (0.7, 0, 2.4), LAMP, radius=4, intensity=0.6, flicker=0.2, halo=False)
    else:
        pts = [(0, 0, -0.1), (0.1, 0.05, 1.2), (0.0, 0.1, 2.4), (0.25, 0, 3.2), (0.8, 0, 3.4)]
        for i in range(len(pts) - 1):
            limb(m, pts[i], pts[i + 1], 0.2, 0.18, ["#2a2422", "#3a302a"][i % 2], segs=5)
        for k, (x, z) in enumerate(((0.8, 2.85), (-0.4, 1.9))):
            m.box((0.34, 0.34, 0.42), (x, 0, z), LAMP, glow=True)
            if k:
                limb(m, (-0.05, 0, 2.2), (-0.4, 0, 2.2), 0.05, 0.05, "#2a2622", segs=3)
        light(r, (0.2, 0, 2.6), LAMP, radius=4.5, intensity=0.65, flicker=0.2, halo=False)
    m.cyl(0.45, 0.2, (0, 0, -0.05), CRUST[1], segs=6)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def _section(x, w, h, z0):
    """A hull's cross-section at x: an octagon of half width w, from z0 up to z0 + h."""
    return [(x, y * w, z0 + zz * h) for y, zz in ((-1, 0.3), (-0.75, 0.0), (0.75, 0.0), (1, 0.3), (0.95, 0.75), (0.5, 1.0), (-0.5, 1.0), (-0.95, 0.75))]


def gunship(v):
    """GIANT: the Compact gunship that glassed the plain, shot down at the end of its run and sunk in
    a lake of its own glass: ivory banded oxblood, nose +x, the battery of glassing guns along its
    spine, the engines aft (-x) still faintly warm, its right wing snapped off and lying apart, the glass
    run up over its flanks. Under 8.5 everywhere."""
    r = root("ashgrave_glass_gunship", v)
    rng = random.Random(6200 + v)
    m = Model(f"ashgrave_glass_gunship_{v}", 6200 + v)
    # (the lake it lies in is the ground's own glass, dug by the layout: here only the crust it
    # heaved up round its flanks as it slid in, and the glass run up over it)
    for k in range(9):
        x = -20 + k * 5 + rng.uniform(-1.5, 1.5)
        for sd in (-1, 1):
            if rng.random() < 0.35:
                continue
            st = mark(m)
            m.box((rng.uniform(1.6, 4.2), rng.uniform(1.0, 2.2), rng.uniform(0.5, 1.2)), (x, sd * rng.uniform(6.2, 8.4), -0.2), CRUST[2], rot=(sd * rng.uniform(0.2, 0.5), rng.uniform(-0.2, 0.2), rng.uniform(-0.7, 0.7)), taper=rng.uniform(0.5, 0.85))
            facet(m, new_faces(m, st), CRUST[1:], noise=0.12)
    sink = -0.6
    # the hull: sections from the engines (-x) to the nose (+x)
    secs = [(-21, 4.6, 5.2), (-16, 5.6, 6.0), (-8, 6.0, 6.4), (2, 5.6, 6.2), (10, 4.4, 5.2), (16, 3.0, 4.0), (21, 1.2, 2.4)]
    hullf = set()
    for i in range(len(secs) - 1):
        st = mark(m)
        a, b = secs[i], secs[i + 1]
        hull(m, _section(a[0], a[1], a[2], sink) + _section(b[0], b[1], b[2], sink), IVORY[3])
        hullf |= new_faces(m, st)
    facet(m, hullf, IVORY[1:], noise=0.05)
    _dust(m, hullf, 0.18, 0.85)
    # its oxblood bands round the hull, and the long stripe down its spine
    for x in (-18.5, -4, 12.5):
        sec = min(secs, key=lambda s: abs(s[0] - x))
        st = mark(m)
        hull(m, _section(x - 0.7, sec[1] * 1.03, sec[2] * 1.02, sink) + _section(x + 0.7, sec[1] * 1.03, sec[2] * 1.02, sink), OXBLOOD)
    m.box((34, 1.2, 0.2), (-2, 0, sink + 6.45), OXBLOOD)
    # the canopy at the nose, dark glass
    st = mark(m)
    m.ball(1.6, (15.5, 0, sink + 3.9), "#14201c", subdiv=1, scale=(1.8, 1.0, 0.6))
    facet(m, new_faces(m, st), ["#0a1210", "#14201c", "#2a4038"], noise=0.1)
    # the glassing battery along its spine: five turrets, twin barrels laid forward and down
    for k, x in enumerate((-13, -7, -1, 5)):
        tz = sink + 6.4
        st = mark(m)
        m.cyl(1.7, 0.9, (x, 0, tz), IVORY[2], segs=7)
        m.box((2.4, 2.2, 0.8), (x + 0.4, 0, tz + 1.0), IVORY[3], taper=0.8)
        facet(m, new_faces(m, st), IVORY[1:], noise=0.05)
        yaw = rng.uniform(-0.5, 0.5) * (0 if k == 1 else 1)
        for s in (-0.45, 0.45):
            a = Vector((x + 1.0, s, tz + 1.0))
            d = Vector((math.cos(yaw), math.sin(yaw), -0.02))
            limb(m, a, a + d * 5.5, 0.28, 0.24, GUNMETAL[2], segs=6)
            m.cyl(0.32, 0.4, tuple(a + d * 5.5), "#1a1c20", segs=6, rot=(0, math.pi / 2, yaw))
    # the engines aft: three nozzles, their throats still faintly warm
    for y in (-2.6, 0, 2.6):
        limb(m, (-20.5, y, sink + 2.8), (-23.5, y, sink + 2.8), 1.25, 1.45, GUNMETAL[1], segs=8)
        limb(m, (-23.4, y, sink + 2.8), (-23.6, y, sink + 2.8), 0.95, 0.95, ENGINE, segs=8, glow=True)
    light(r, (-24, 0, 3), ENGINE, radius=7, intensity=0.4, flicker=0.1, halo=False)
    # its left wing still on, low, swept; the right one snapped off, lying apart in the glass
    def wing(root_pts, tip, at, rot, z):
        st = mark(m)
        pts = [(px, py, z) for px, py in root_pts] + [(px, py, z + 0.6) for px, py in root_pts] + [(tip[0], tip[1], z), (tip[0], tip[1], z + 0.3)]
        hull(m, pts, IVORY[3])
        f = new_faces(m, st)
        xform(m, st, M(at, rot))
        facet(m, f, IVORY[1:], noise=0.06)
        return f
    wing([(-12, 5.4), (2, 5.0)], (-14, 15.5), (0, 0, 0), (0, 0, 0), sink + 1.6)
    m.box((3.0, 1.0, 0.15), (-12.6, 13.4, sink + 2.3), OXBLOOD, rot=(0, 0, -0.35))
    # the right wing: snapped off at its root and thrown clear, lying tilted half in the glass
    st = mark(m)
    wf = wing([(-12, -5.4), (2, -5.0)], (-14, -15.5), (0, 0, 0), (0, 0, 0), sink + 1.6)
    m.box((3.0, 1.0, 0.15), (-12.6, -13.4, sink + 2.3), OXBLOOD, rot=(0, 0, 0.35))
    for k in range(5):
        x = -12 + k * 3.2 + rng.uniform(-0.6, 0.6)
        m.box((rng.uniform(1.4, 2.4), 0.9, rng.uniform(0.7, 1.1)), (x, -5.2 - 0.12 * k, sink + 1.9), CHARRED[rng.randrange(3)], rot=(0, 0, rng.uniform(-0.3, 0.3)))
    limb(m, (-8, -9.5, sink + 1.4), (-3, -9.5, sink + 1.4), 0.9, 0.8, GUNMETAL[1], segs=7)
    limb(m, (-8.2, -9.5, sink + 1.4), (-8.5, -9.5, sink + 1.4), 0.7, 0.7, "#141416", segs=7)
    xform(m, st, M((-1, -9.5, -0.35), (-0.09, 0.0, -0.62)))
    # plating: panel lines across its back, a hatch, its registry stencilled on the spine
    for x in (-14, -10, -2, 3, 8):
        sec = min(secs, key=lambda q: abs(q[0] - x))
        m.box((0.18, sec[1] * 1.0, 0.1), (x, -sec[1] * 0.5, sink + sec[2] + 0.02), IVORY[1])
        m.box((0.18, sec[1] * 1.0, 0.1), (x, sec[1] * 0.5, sink + sec[2] + 0.02), IVORY[1])
    m.box((2.0, 1.6, 0.14), (9.0, 2.2, sink + 5.25), IVORY[2])
    sd = mark(m)
    _digits(m, "71", 0.42, OXBLOOD)
    xform(m, sd, M((0.5, -1.9, sink + 6.3)))
    # the hole that brought it down: punched through the stern, burnt round, its ribs showing
    st = mark(m)
    m.cyl(3.0, 0.3, (-15.5, 1.6, sink + 5.9), CHARRED[0], segs=9)
    for k in range(5):
        a = k / 5 * math.tau + rng.uniform(-0.2, 0.2)
        limb(m, (-15.5 + math.cos(a) * 1.0, 1.6 + math.sin(a) * 1.0, sink + 5.6), (-15.5 + math.cos(a) * 3.4, 1.6 + math.sin(a) * 3.4, sink + 6.4), 0.18, 0.12, GUNMETAL[0], segs=4)
    for k in range(7):
        a = rng.uniform(0, math.tau)
        m.box((rng.uniform(0.8, 1.6), rng.uniform(0.5, 0.9), 0.3), (-15.5 + math.cos(a) * 3.2, 1.6 + math.sin(a) * 3.2, sink + 6.1), CHARRED[1 + rng.randrange(2)], rot=(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), a))
    m.cyl(1.2, 0.2, (-15.5, 1.6, sink + 5.95), ENGINE, segs=7, glow=True)
    # the stub where it broke, ragged and burnt
    for k in range(4):
        m.box((rng.uniform(1.0, 2.0), 1.0, rng.uniform(0.6, 1.2)), (rng.uniform(-10, 0), -5.6, sink + 2.0 + rng.uniform(-0.3, 0.3)), CHARRED[rng.randrange(3)], rot=(0, 0, rng.uniform(-0.4, 0.4)))
    # holes punched through its back, burnt round
    for k in range(3):
        x = rng.uniform(-16, 8)
        m.box((2.2, 1.8, 0.2), (x, rng.choice((-2.4, 2.4)), sink + 5.9), CHARRED[0], rot=(0, 0, rng.uniform(0, 1)))
    # the glass run up over its flanks in lumps
    flank = [(x, s * rng.uniform(4.6, 6.0), rng.uniform(0.0, 1.2)) for s in (-1, 1) for x in range(-20, 14, 3)]
    _glass_runs(m, rng, flank, 16, 1.1)
    m.build(r)
    return r


def build():
    for v in range(6):
        ejecta(v)
    for v in range(4):
        spire(v)
    for v in range(3):
        needle(v)
        convoy(v)
        block(v)
    for v in range(2):
        mast(v)
        dud(v)
        stake(v)
        sail_barge(v)
        lantern_pole(v)
    derrick(0)
    gunship(0)
