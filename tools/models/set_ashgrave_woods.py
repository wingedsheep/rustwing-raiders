"""ASHGRAVE, the Bone-White Woods (docs/level-design.md, its layout row): the woods at the edge of
the Glassing, laid out by src/sim/layouts/whitewood.ts. In 244 L the fire plan's last salvos burst
over them to deny the Uukhvar the cover; the firestorm killed every tree where it stood, and as
nothing rots on Ashgrave, 166 years have bleached them bone-white. Ash falls on them like snow,
under a blue moon; the moon fungus glowing in the dark hollows is all that lives here, that and the
crows. The Sankvi come for the bone-wood, which burns hot enough for the forge. Here:

- the poles: trees under an airburst, stripped of every bough and still standing, burnt black on
  the side that faced the flash (-x);
- the felled: trees the same blast threw down, root plate torn up on end at the origin, the
  trunk lying along +x, away from the flash, its crown smashed flat at the far end;
- the burnt: the fire's last edge, where it went out: charred black snags and stumps;
- the colliers' things: cut stumps, cordwood ricks, charcoal clamps (burning, opened, being built),
  their huts and their drag-sleds of sacks;
- the crowns of trees buried to their boughs in the drifts;
- the elders: the woods' oldest, too broad to fly through (SOLID at the trunk), their crowns over
  you; one hollow at the foot with the fungus glowing out of it, one split, one broken off high.

Blender +x is game +x, +y is up the screen (the way you fly). Built into set_ashgrave (see its
build())."""
from __future__ import annotations

import math
import random

from mathutils import Vector

from kit import Model, light
from props_a_lib import lump
from props_b_kit import M, collider, facet, jitter, limb, mark, new_faces, root, xform
from props_b_ashgrave import BONE_WOOD, DIRT, GUNMETAL, IVORY, RUST, SNOW_ASH, STEEL, TARP_DARK
from set_ashgrave_titans import _plate

# burnt wood, alligatored black, a little blue in the moon
CHARRED = ["#18181e", "#24242c", "#32323c", "#44444e"]
# the inside of bone-wood, where a saw or an axe has opened it: paler than the weathered outside
HEART = ["#c8bca0", "#e2d6ba", "#f2e8d0"]
RINGS = "#8a7656"
# a clamp's turf and the earth under the ash
TURF = ["#3a342e", "#4a433b", "#5c5349", "#6e6458"]
# charcoal, fresh from a clamp: black with a dull sheen
COAL = ["#0e0d0c", "#171513", "#221f1c"]
# a clamp's vents, banked: dull and big, never a bright speck (those are shots)
EMBER = [("#5e2412", True), ("#7a3216", True)]
SACK = ["#3a3026", "#4e4232", "#625440"]
LAMP = "#ffb860"
MOON = ("#7ad8ff", True)
MOON_PALE = ("#d0f4ff", True)


def _ash_tops(m, faces, up=0.7, col=SNOW_ASH[3], amt=1.0):
    """Ash lying on whatever faces up."""
    i = m._slot(col, False)
    for f in faces:
        if not f.is_valid:
            continue
        f.normal_update()
        if f.normal.z > up and m.rng.random() < amt:
            f.material_index = i


def _char(m, faces, d=(-1.0, 0.0), top=99.0, dot=0.3, cols=CHARRED):
    """Burnt on the side that faced the fire: the faces turned toward d (x, y), below `top`."""
    idx = [m._slot(c, False) for c in cols]
    dv = Vector((d[0], d[1], 0)).normalized()
    for f in faces:
        if not f.is_valid:
            continue
        f.normal_update()
        n = f.normal
        c = f.calc_center_median()
        if c.z < top + m.rng.uniform(-0.6, 0.6) and n.x * dv.x + n.y * dv.y > dot + m.rng.uniform(-0.15, 0.15):
            f.material_index = idx[m.rng.randrange(len(idx))]


def _drift(m, rng, loc, size, n=12):
    """A drift of ash, pale as snow, faceted."""
    st = mark(m)
    lump(m, rng, loc, size, SNOW_ASH[1], n=n, flat=0.55)
    return facet(m, new_faces(m, st), SNOW_ASH, noise=0.08)


def _roots(m, rng, r, n=4, z=0.3, col=BONE_WOOD[1], thick=0.3):
    for k in range(n):
        a = k / n * math.tau + rng.uniform(0, 0.7)
        limb(m, (math.cos(a) * r * 0.3, math.sin(a) * r * 0.3, z), (math.cos(a) * r, math.sin(a) * r, -0.15), thick, thick * 0.45, col, segs=4)


def _stub(m, rng, p, d, L, r0, col=BONE_WOOD[2]):
    """A bough burnt back to a stub: short, blunt, snapped."""
    p = Vector(p)
    q = p + Vector(d).normalized() * L
    limb(m, p, q, r0, r0 * 0.7, col, segs=4)
    return q


# --- the flash: poles and the felled ----------------------------------------------------------


def pole(v):
    """A tree under an airburst: every bough stripped, the trunk left standing, burnt black on the
    side that faced the flash (-x), its top snapped. v0: tall, splintered. v1: a stub of a bough or
    two left on the lee side. v2: broken at half its height, the top lying at its foot, away."""
    r = root("ashgrave_woods_pole", v)
    rng = random.Random(9100 + v)
    m = Model(f"ashgrave_woods_pole_{v}", 9100 + v)
    H = (7.4, 6.3, 3.9)[v]
    lean = Vector((rng.uniform(0.02, 0.1), rng.uniform(-0.05, 0.05), 1)).normalized()
    st = mark(m)
    mid = lean * (H * 0.5)
    top = lean * H
    limb(m, (0, 0, -0.3), tuple(mid), 0.62, 0.46, BONE_WOOD[2], segs=6)
    limb(m, tuple(mid), tuple(top), 0.46, 0.3, BONE_WOOD[2], segs=6)
    m.ball(0.5, tuple(mid), BONE_WOOD[2], subdiv=0, scale=(1, 1, 0.6))
    # the snapped top: splinters, the longest on the lee side
    for k in range(5):
        a = k / 5 * math.tau + rng.uniform(-0.3, 0.3)
        lee = 0.5 + 0.5 * math.cos(a)
        limb(m, tuple(top + Vector((math.cos(a) * 0.18, math.sin(a) * 0.18, -0.2))),
             tuple(top + Vector((math.cos(a) * 0.32, math.sin(a) * 0.32, 0.25 + lee * rng.uniform(0.4, 0.9)))), 0.17, 0.04, BONE_WOOD[3], segs=4)
    if v == 1:
        # a stub or two, on the lee (+x) side only: the flash took the rest
        _stub(m, rng, lean * (H * 0.62), (1, 0.3, 0.45), 1.3, 0.24)
        _stub(m, rng, lean * (H * 0.8), (0.8, -0.5, 0.6), 0.9, 0.2)
    faces = new_faces(m, st)
    facet(m, faces, BONE_WOOD, noise=0.1)
    _char(m, faces, (-1, 0), top=H * 0.85, dot=0.25)
    _ash_tops(m, faces, 0.6)
    if v == 2:
        # the top it lost, lying at its foot, thrown away from the flash
        st = mark(m)
        limb(m, (0.9, 0.3, 0.3), (4.2, 0.9, 0.25), 0.38, 0.26, BONE_WOOD[2], segs=6)
        for k in range(3):
            a = rng.uniform(-0.8, 0.8)
            limb(m, (0.8, 0.3, 0.32), (0.55, 0.3 + math.sin(a) * 0.5, 0.45), 0.3, 0.06, BONE_WOOD[3], segs=4)
        faces = new_faces(m, st)
        facet(m, faces, BONE_WOOD, noise=0.1)
        _char(m, faces, (-1, 0), dot=0.3)
        _ash_tops(m, faces, 0.6)
    # roots, charred on the flash side; ash heaped in its lee
    st = mark(m)
    _roots(m, rng, 1.4, n=5, thick=0.3)
    faces = new_faces(m, st)
    facet(m, faces, BONE_WOOD[:3], noise=0.1)
    _char(m, faces, (-1, 0), dot=0.0)
    _drift(m, rng, (0.9, 0.1, -0.2), (1.4, 0.9, 0.45), n=10)
    m.build(r)
    return r


def felled(v):
    """A tree the blast threw down: its root plate torn up on end at the origin, the earth in it
    facing the flash (-x), the hole it tore in front; the trunk lying along +x, its crown smashed
    flat at the far end, the boughs broken off and splayed on the ground. Three lengths."""
    r = root("ashgrave_woods_felled", v)
    rng = random.Random(9120 + v)
    m = Model(f"ashgrave_woods_felled_{v}", 9120 + v)
    L = (8.5, 11.5, 14.5)[v]
    R = (1.6, 1.9, 2.2)[v]
    rad = (0.5, 0.6, 0.7)[v]
    # the hole it tore, dark, and the root plate standing up out of it
    m.cyl(R * 0.95, 0.06, (-0.9, 0, -0.02), "#1a1a20", segs=8)
    st = mark(m)
    m.cyl(R, 0.6, (0.0, 0, R * 0.85), TURF[2], segs=8, rot=(0, math.pi / 2, 0))
    jitter(m, new_faces(m, st), 0.12)
    facet(m, new_faces(m, st), TURF, noise=0.1)
    # the roots snapped off round the plate's edge, bleached
    st = mark(m)
    for k in range(9):
        a = k / 9 * math.tau + rng.uniform(-0.2, 0.2)
        c, s = math.cos(a), math.sin(a)
        p0 = (0.15, c * R * 0.8, R * 0.85 + s * R * 0.8)
        p1 = (-0.5 - rng.uniform(0, 0.4), c * (R + 0.9), max(0.05, R * 0.85 + s * (R + 0.9)))
        limb(m, p0, p1, 0.2, 0.07, BONE_WOOD[1], segs=4)
    facet(m, new_faces(m, st), BONE_WOOD[:3], noise=0.1)
    # the trunk, lying, sagging a little where it struck
    st = mark(m)
    a = Vector((0.3, 0, R * 0.55))
    k1 = Vector((L * 0.45, rng.uniform(-0.3, 0.3), rad * 0.9))
    b = Vector((L, rng.uniform(-0.6, 0.6), rad * 0.7))
    limb(m, a, k1, rad * 1.15, rad, BONE_WOOD[2], segs=6)
    m.ball(rad, tuple(k1), BONE_WOOD[2], subdiv=0)
    limb(m, k1, b, rad, rad * 0.62, BONE_WOOD[2], segs=6)
    # the crown smashed flat: boughs splayed out on the ground round the top, all broken short
    for k in range(5 + v):
        t = rng.uniform(0.55, 0.98)
        p = k1.lerp(b, (t - 0.45) / 0.55) if t > 0.45 else a.lerp(k1, t / 0.45)
        sd = 1 if k % 2 else -1
        d = Vector((rng.uniform(0.2, 0.9), sd * rng.uniform(0.6, 1.0), rng.uniform(-0.05, 0.12))).normalized()
        q = p + d * rng.uniform(1.4, 2.6 + v * 0.4)
        q.z = max(q.z, 0.15)
        limb(m, p, q, rad * 0.55, rad * 0.3, BONE_WOOD[2], segs=4)
        if rng.random() < 0.6:
            d2 = (d + Vector((0.5, 0, 0.1))).normalized()
            q2 = q + d2 * rng.uniform(0.8, 1.4)
            q2.z = max(q2.z, 0.1)
            limb(m, q, q2, rad * 0.3, rad * 0.18, BONE_WOOD[3], segs=4)
    # a bough or two still stuck up off the trunk's top side
    for k in range(1 + v):
        p = a.lerp(b, rng.uniform(0.3, 0.75))
        _stub(m, rng, p + Vector((0, 0, rad * 0.6)), (rng.uniform(0.2, 0.7), rng.uniform(-0.5, 0.5), 1), rng.uniform(1.0, 1.8), rad * 0.42)
    faces = new_faces(m, st)
    facet(m, faces, BONE_WOOD, noise=0.1)
    # burnt on the side the flash came from, ash along its back
    _char(m, faces, (-1, 0), dot=0.45)
    _ash_tops(m, faces, 0.72, amt=0.8)
    # ash drifted in its lee, along the trunk
    _drift(m, rng, (L * 0.5, -rad * 1.6, -0.2), (L * 0.32, 0.7, 0.35), n=10)
    m.build(r)
    return r


# --- the burn line ---------------------------------------------------------------------------


def burnt(v):
    """The fire's last edge: v0 a stump burnt out to a ring of black, v1 a tall charred snag, its
    surface cracked in black squares, v2 two snags and a black log between."""
    r = root("ashgrave_woods_burnt", v)
    rng = random.Random(9140 + v)
    m = Model(f"ashgrave_woods_burnt_{v}", 9140 + v)
    st = mark(m)
    if v == 0:
        for k in range(7):
            a = k / 7 * math.tau + rng.uniform(-0.15, 0.15)
            h = rng.uniform(0.7, 1.6)
            m.box((0.4, 0.42, h), (math.cos(a) * 0.62, math.sin(a) * 0.62, h / 2 - 0.1), CHARRED[2], rot=(0, rng.uniform(-0.1, 0.1), a), taper=0.7)
        m.cyl(0.62, 0.3, (0, 0, -0.05), "#101014", segs=7)
        _roots(m, rng, 1.6, n=5, col=CHARRED[1], thick=0.28)
    elif v == 1:
        lean = Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), 1)).normalized()
        H = 5.2
        limb(m, (0, 0, -0.3), tuple(lean * H * 0.55), 0.6, 0.44, CHARRED[2], segs=6)
        limb(m, tuple(lean * H * 0.55), tuple(lean * H), 0.44, 0.14, CHARRED[2], segs=5)
        for k in range(3):
            p = lean * (H * (0.35 + 0.2 * k))
            a = rng.uniform(0, math.tau)
            _stub(m, rng, p, (math.cos(a), math.sin(a), 0.2), 0.8 - 0.15 * k, 0.2, col=CHARRED[2])
        _roots(m, rng, 1.5, n=5, col=CHARRED[1], thick=0.3)
    else:
        for x, y, H in ((-1.4, 0.4, 3.6), (1.5, -0.3, 2.4)):
            limb(m, (x, y, -0.3), (x + 0.15, y, H), 0.5, 0.2, CHARRED[2], segs=5)
            for k in range(3):
                a = k * 2.1 + rng.uniform(0, 0.5)
                limb(m, (x + math.cos(a) * 0.2, y + math.sin(a) * 0.2, 0.3), (x + math.cos(a) * 1.0, y + math.sin(a) * 1.0, -0.1), 0.24, 0.1, CHARRED[1], segs=4)
        limb(m, (-1.0, -1.1, 0.3), (2.6, -1.6, 0.25), 0.38, 0.3, CHARRED[2], segs=6)
    faces = new_faces(m, st)
    facet(m, faces, CHARRED, noise=0.12)
    # the cracked char's squares: lighter flecks where the bark split
    for f in faces:
        if f.is_valid and m.rng.random() < 0.12:
            f.material_index = m._slot(CHARRED[3], False)
    _ash_tops(m, faces, 0.7, col=SNOW_ASH[2], amt=0.9)
    _drift(m, rng, (0.4, -0.6, -0.25), (1.6, 1.0, 0.4), n=10)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


# --- the colliers ----------------------------------------------------------------------------


def _cut(m, x, y, r, h, lean=(0, 0)):
    """A stump sawn flat: weathered white round its sides, its cut face pale with a ring or two."""
    st = mark(m)
    m.cyl(r, h, (x, y, -0.15), BONE_WOOD[2], segs=7, r_top=r * 0.92)
    jitter(m, new_faces(m, st), 0.04)
    facet(m, new_faces(m, st), BONE_WOOD, noise=0.08)
    # the bark's dark rim round the cut, so it reads sawn from above, not a stone
    m.cyl(r * 0.97, 0.05, (x, y, h - 0.16), CHARRED[2], segs=7)
    m.cyl(r * 0.8, 0.05, (x, y, h - 0.13), HEART[2], segs=7)
    m.cyl(r * 0.52, 0.05, (x, y, h - 0.1), RINGS, segs=7)
    m.cyl(r * 0.44, 0.05, (x, y, h - 0.07), HEART[2], segs=7)
    m.cyl(r * 0.12, 0.05, (x, y, h - 0.04), RINGS, segs=5)


def stump(v):
    """Where the colliers felled: v0 a broad stump sawn flat, roots gripping the ash; v1 two stumps
    and a sawn round lying by them; v2 a stump with the axe still in it, chips round its foot."""
    r = root("ashgrave_woods_stump", v)
    rng = random.Random(9160 + v)
    m = Model(f"ashgrave_woods_stump_{v}", 9160 + v)
    if v == 0:
        _cut(m, 0, 0, 0.8, 0.75)
        st = mark(m)
        _roots(m, rng, 1.2, n=5, thick=0.3)
        facet(m, new_faces(m, st), BONE_WOOD[:3], noise=0.1)
    elif v == 1:
        _cut(m, -0.7, 0.2, 0.62, 0.6)
        _cut(m, 0.75, -0.4, 0.5, 0.85)
        # the round, lying on its side
        st = mark(m)
        m.cyl(0.55, 0.6, (0.2, 0.95, 0.5), BONE_WOOD[2], segs=7, rot=(math.pi / 2, 0, 0.4))
        facet(m, new_faces(m, st), BONE_WOOD, noise=0.08)
        st = mark(m)
        _roots(m, rng, 1.2, n=4, thick=0.24)
        facet(m, new_faces(m, st), BONE_WOOD[:3], noise=0.1)
    else:
        _cut(m, 0, 0, 0.7, 0.7)
        # the axe: a haft of old pipe, a head of titan plate
        limb(m, (0.15, 0.1, 0.62), (0.9, 0.6, 1.35), 0.07, 0.06, RUST[1], segs=4)
        m.box((0.42, 0.12, 0.34), (0.15, 0.1, 0.62), STEEL[1], rot=(0, 0, 0.6))
        for k in range(7):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.9, 1.6)
            m.box((0.3, 0.16, 0.08), (math.cos(a) * d, math.sin(a) * d, 0.0), HEART[rng.randrange(3)], rot=(0, 0, rng.uniform(0, math.pi)))
        st = mark(m)
        _roots(m, rng, 1.4, n=4, thick=0.26)
        facet(m, new_faces(m, st), BONE_WOOD[:3], noise=0.1)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def cordwood(v):
    """A rick of cordwood: billets laid across, ends out, stacked between stakes along x, the top
    row's rounded backs a ribbed stripe from above. v0 short, v1 long, v2 long and roofed with a
    sheet of titan plate weighed down with stones."""
    r = root("ashgrave_woods_cordwood", v)
    rng = random.Random(9180 + v)
    m = Model(f"ashgrave_woods_cordwood_{v}", 9180 + v)
    L = (5.0, 8.0, 8.0)[v]
    D = 1.3
    n = int(L / 0.46)
    for row in range(3):
        z = 0.24 + row * 0.42
        for k in range(n - row % 2):
            x = -L / 2 + 0.25 + (k + 0.5 * (row % 2)) * (L - 0.5) / (n - 1)
            rr = rng.uniform(0.18, 0.24)
            st = mark(m)
            m.cyl(rr, D + rng.uniform(-0.12, 0.12), (x, -D / 2, z), BONE_WOOD[2], segs=6, rot=(-math.pi / 2, 0, rng.uniform(-0.04, 0.04)))
            facet(m, new_faces(m, st), BONE_WOOD[1:], noise=0.1)
            # the end grain toward the camera, paler
            m.cyl(rr * 0.8, 0.04, (x, -D / 2 - 0.02, z), HEART[rng.randrange(3)], segs=6, rot=(math.pi / 2, 0, 0))
    # the stakes at each end, and a cross-tie
    for x in (-L / 2 - 0.1, L / 2 + 0.1):
        for y in (-D / 2, D / 2):
            limb(m, (x, y, -0.2), (x, y, 1.65), 0.1, 0.08, BONE_WOOD[1], segs=4)
    if v == 2:
        _plate(m, (L + 0.6, D + 0.8, 0.12), (0, 0, 1.45), (0.04, 0, 0), IVORY if rng.random() < 0.5 else GUNMETAL)
        for k in range(4):
            m.ball(0.22, (-L / 2 + 0.8 + k * (L - 1.6) / 3, rng.uniform(-0.3, 0.3), 1.62), TURF[3], subdiv=0)
    else:
        st = mark(m)
        lump(m, rng, (0, 0, 1.1), (L * 0.45, D * 0.4, 0.2), SNOW_ASH[2], n=10, flat=0.7)
        facet(m, new_faces(m, st), SNOW_ASH[1:], noise=0.08)
    # bark and chips trodden round it
    m.box((L + 1.6, D + 1.6, 0.04), (0, 0, -0.03), DIRT[1])
    m.build(r)
    return r


def clamp(v):
    """A charcoal clamp: bone-wood stacked round a pole and sealed under turf and ash to burn slow.
    v0 burning: a low dome breathing smoke from its vents, which glow dull red; a ladder against it.
    v1 opened: raked out to a black heap of charcoal, the turf shovelled aside, sacks filled.
    v2 being built: the billets stood on end round the pole in a cone, the turf heaped by it."""
    r = root("ashgrave_woods_clamp", v)
    rng = random.Random(9200 + v)
    m = Model(f"ashgrave_woods_clamp_{v}", 9200 + v)
    R = 3.2
    if v == 0:
        st = mark(m)
        m.ball(1.0, (0, 0, -0.2), TURF[2], subdiv=1, scale=(R, R, 2.1), jitter=0.06)
        faces = new_faces(m, st)
        # (cut flat under the ground)
        for vv in {vv for f in faces for vv in f.verts}:
            vv.co.z = max(vv.co.z, -0.2)
        facet(m, faces, TURF, noise=0.12)
        _ash_tops(m, faces, 0.82, col=SNOW_ASH[1], amt=0.5)
        # the vents in a ring, glowing dull, and the crown's dark mouth
        for k in range(8):
            a = k / 8 * math.tau + rng.uniform(-0.15, 0.15)
            m.ball(0.22, (math.cos(a) * R * 0.78, math.sin(a) * R * 0.78, 1.0), EMBER[k % 2][0], subdiv=0, glow=True, scale=(1, 1, 0.6))
        m.cyl(0.42, 0.2, (0, 0, 1.82), "#0c0c10", segs=7)
        m.cyl(0.26, 0.1, (0, 0, 1.92), EMBER[1][0], segs=6, glow=True)
        # the ladder up its side
        for s in (-0.3, 0.3):
            limb(m, (R + 0.6, s, -0.1), (0.9, s, 2.0), 0.07, 0.07, BONE_WOOD[1], segs=4)
        for k in range(4):
            t = (k + 1) / 5
            m.box((0.08, 0.7, 0.07), (R + 0.6 - (R - 0.3) * t, 0, -0.1 + 2.1 * t), BONE_WOOD[1])
        light(r, (0, 0, 1.6), "#ff7a3a", radius=4.5, intensity=0.5, flicker=0.15, halo=False)
    elif v == 1:
        # the turf shovelled out in a ring, the charcoal heaped black in the middle
        for k in range(7):
            a = k / 7 * math.tau + rng.uniform(-0.2, 0.2)
            st = mark(m)
            lump(m, rng, (math.cos(a) * R * 1.05, math.sin(a) * R * 1.05, -0.1), (1.1, 0.8, 0.55), TURF[2], n=9, flat=0.5)
            facet(m, new_faces(m, st), TURF, noise=0.1)
        st = mark(m)
        lump(m, rng, (0, 0, -0.2), (R * 0.8, R * 0.75, 1.2), COAL[1], n=16, flat=0.5)
        faces = new_faces(m, st)
        facet(m, faces, COAL, noise=0.15)
        # a few billets not burnt through, white among the black
        for k in range(5):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.3, 1.8)
            limb(m, (math.cos(a) * d, math.sin(a) * d, 0.6), (math.cos(a) * d + 0.8, math.sin(a) * d + 0.3, 0.5), 0.14, 0.12, HEART[0], segs=4)
        # the sacks filled, in a row, and the rake
        for k in range(4):
            st = mark(m)
            m.ball(0.45, (R + 1.4, -1.5 + k * 1.0, 0.3), SACK[1], subdiv=1, scale=(1, 0.85, 1.1), jitter=0.04)
            facet(m, new_faces(m, st), SACK, noise=0.1)
            m.cyl(0.28, 0.08, (R + 1.4, -1.5 + k * 1.0, 0.78), COAL[0], segs=6)
        limb(m, (-R - 0.5, -1.0, 0.05), (-0.6, 1.4, 0.4), 0.06, 0.06, BONE_WOOD[1], segs=4)
        m.box((0.2, 1.0, 0.25), (-0.6, 1.4, 0.4), RUST[1], rot=(0, 0, -0.75))
        m.cyl(R * 1.25, 0.04, (0, 0, -0.03), "#16161a", segs=10)
    else:
        # the billets stood on end round the pole, a cone of white
        limb(m, (0, 0, -0.2), (0, 0, 3.2), 0.16, 0.12, BONE_WOOD[1], segs=5)
        for ring_ in range(3):
            rr = 0.5 + ring_ * 0.85
            n = 8 + ring_ * 6
            hh = 2.6 - ring_ * 0.55
            for k in range(n):
                a = k / n * math.tau + rng.uniform(-0.08, 0.08) + ring_ * 0.2
                b0 = (math.cos(a) * rr, math.sin(a) * rr, -0.15)
                b1 = (math.cos(a) * (rr - 0.45), math.sin(a) * (rr - 0.45), hh + rng.uniform(-0.2, 0.15))
                st = mark(m)
                limb(m, b0, b1, 0.2, 0.17, BONE_WOOD[2], segs=5)
                facet(m, new_faces(m, st), BONE_WOOD[1:], noise=0.12)
                m.cyl(0.15, 0.04, b1, HEART[1], segs=5)
        # the turf cut and heaped ready beside it, a wheelbarrow of plate
        st = mark(m)
        lump(m, rng, (R + 1.2, 0.8, -0.1), (1.4, 1.0, 0.6), TURF[2], n=10, flat=0.5)
        facet(m, new_faces(m, st), TURF, noise=0.1)
        _plate(m, (1.2, 0.8, 0.45), (R + 0.9, -1.3, 0.35), (0, 0, 0.3), GUNMETAL)
        m.cyl(R * 1.1, 0.04, (0, 0, -0.03), DIRT[0], segs=10)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def hut(v):
    """A collier's hut, where they sit out a burn: v0 a cone of poles under turf, a door, a stove pipe
    and a lamp; v1 a lean-to of titan plate against a fallen trunk, a tarp across, a hearth."""
    r = root("ashgrave_woods_hut", v)
    rng = random.Random(9220 + v)
    m = Model(f"ashgrave_woods_hut_{v}", 9220 + v)
    if v == 0:
        R = 1.9
        st = mark(m)
        m.cyl(R, 3.2, (0, 0, -0.1), TURF[2], segs=8, r_top=0.15)
        jitter(m, new_faces(m, st), 0.06)
        faces = new_faces(m, st)
        facet(m, faces, TURF, noise=0.1)
        _ash_tops(m, faces, 0.5, col=SNOW_ASH[1], amt=0.4)
        # the pole ends crossed out of its top
        for k in range(5):
            a = k / 5 * math.tau
            limb(m, (0, 0, 2.7), (math.cos(a) * 0.45, math.sin(a) * 0.45, 3.7), 0.08, 0.06, BONE_WOOD[2], segs=4)
        # the door toward the camera, lit inside
        m.box((0.9, 0.3, 1.3), (0, -R * 0.78, 0.55), "#100e0c", rot=(-0.5, 0, 0))
        m.box((0.6, 0.12, 0.8), (0, -R * 0.82, 0.45), LAMP, glow=True, rot=(-0.5, 0, 0))
        limb(m, (0.7, 0.4, 2.0), (0.9, 0.5, 3.3), 0.12, 0.12, RUST[1], segs=5)
        # a hearth before it, its ring of stones, dull embers
        for k in range(6):
            a = k / 6 * math.tau
            m.ball(0.2, (math.cos(a) * 0.6, -R - 1.3 + math.sin(a) * 0.6, 0.05), TURF[3], subdiv=0)
        m.cyl(0.4, 0.1, (0, -R - 1.3, 0), EMBER[0][0], segs=6, glow=True)
        light(r, (0, -R - 0.8, 1.0), LAMP, radius=4, intensity=0.5, flicker=0.2, halo=False)
    else:
        st = mark(m)
        limb(m, (-2.6, 0.9, 0.4), (2.8, 1.1, 0.35), 0.45, 0.4, BONE_WOOD[2], segs=6)
        facet(m, new_faces(m, st), BONE_WOOD, noise=0.1)
        for k in range(3):
            _plate(m, (1.6, 2.2, 0.1), (-1.6 + k * 1.6, 0.1, 0.9), (-0.6, 0, rng.uniform(-0.05, 0.05)), [IVORY, GUNMETAL, IVORY][k])
        m.box((1.8, 1.2, 0.05), (2.0, -0.4, 1.05), TARP_DARK, rot=(-0.5, 0.1, 0))
        for k in range(5):
            a = k / 5 * math.tau
            m.ball(0.18, (0.3 + math.cos(a) * 0.5, -1.6 + math.sin(a) * 0.5, 0.05), TURF[3], subdiv=0)
        m.cyl(0.35, 0.1, (0.3, -1.6, 0), EMBER[0][0], segs=6, glow=True)
        light(r, (0.3, -1.4, 1.0), LAMP, radius=3.5, intensity=0.45, flicker=0.2, halo=False)
    m.cyl(3.0, 0.04, (0, -0.6, -0.03), DIRT[0], segs=9)
    m.build(r)
    return r


def sled(v):
    """A drag-sled the colliers haul charcoal out on: two runners of bone-wood, a deck, the sacks
    lashed on; v1 empty but for a coil of rope and a shovel, a drum of water."""
    r = root("ashgrave_woods_sled", v)
    rng = random.Random(9240 + v)
    m = Model(f"ashgrave_woods_sled_{v}", 9240 + v)
    for y in (-0.8, 0.8):
        limb(m, (-2.0, y, 0.15), (1.8, y, 0.15), 0.14, 0.14, BONE_WOOD[2], segs=5)
        limb(m, (1.8, y, 0.15), (2.4, y, 0.5), 0.14, 0.1, BONE_WOOD[2], segs=5)
    for k in range(6):
        m.box((0.4, 1.9, 0.08), (-1.7 + k * 0.68, 0, 0.32), BONE_WOOD[1 + k % 2])
    limb(m, (2.4, -0.8, 0.5), (3.6, 0, 0.5), 0.06, 0.06, BONE_WOOD[1], segs=4)
    limb(m, (2.4, 0.8, 0.5), (3.6, 0, 0.5), 0.06, 0.06, BONE_WOOD[1], segs=4)
    if v == 0:
        for k in range(5):
            x = -1.4 + (k % 3) * 1.1
            y = -0.4 + (k // 3) * 0.8
            st = mark(m)
            m.ball(0.42, (x, y, 0.75 + (0.3 if k > 2 else 0)), SACK[1], subdiv=1, scale=(1.1, 0.85, 0.9), jitter=0.04)
            facet(m, new_faces(m, st), SACK, noise=0.1)
            m.cyl(0.25, 0.06, (x, y, 1.12 + (0.3 if k > 2 else 0)), COAL[0], segs=6)
    else:
        m.cyl(0.4, 0.9, (-1.2, 0, 0.35), RUST[1], segs=7)
        m.cyl(0.32, 0.04, (-1.2, 0, 1.26), "#1a2a34", segs=7)
        m.cyl(0.35, 0.2, (0.4, 0.2, 0.42), SACK[0], segs=8)
        limb(m, (0.8, -0.6, 0.4), (1.8, 0.4, 0.5), 0.05, 0.05, BONE_WOOD[1], segs=4)
        m.box((0.3, 0.4, 0.06), (1.85, 0.45, 0.5), STEEL[1], rot=(0, 0, 0.8))
    m.build(r)
    return r


# --- the drifts ----------------------------------------------------------------------------


def crown(v):
    """A tree buried to its crown in a drift: the drift laid long along +x (downwind), the boughs
    standing up out of its windward end. v0 a candelabra, v1 a fork of two, v2 a ring of tines."""
    r = root("ashgrave_woods_crown", v)
    rng = random.Random(9260 + v)
    m = Model(f"ashgrave_woods_crown_{v}", 9260 + v)
    _drift(m, rng, (1.0, 0, -0.3), (3.4, 1.7, 0.9), n=14)
    _drift(m, rng, (3.4, 0.3, -0.3), (2.0, 1.1, 0.6), n=10)
    st = mark(m)
    if v == 0:
        for k in range(3):
            a = k / 3 * math.tau + rng.uniform(-0.3, 0.3)
            p = Vector((math.cos(a) * 0.7, math.sin(a) * 0.7, 0.3))
            q = p + Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, 2.0 + rng.uniform(-0.3, 0.4)))
            limb(m, p, q, 0.32, 0.22, BONE_WOOD[2], segs=5)
            for s in (-1, 1):
                limb(m, q, q + Vector((math.cos(a + s * 0.9) * 0.6, math.sin(a + s * 0.9) * 0.6, 0.8)), 0.18, 0.08, BONE_WOOD[3], segs=4)
    elif v == 1:
        for s in (-1, 1):
            p = Vector((0, s * 0.3, 0.3))
            q = p + Vector((s * 0.4, s * 0.9, 2.6))
            limb(m, p, q, 0.36, 0.2, BONE_WOOD[2], segs=5)
            limb(m, q, q + Vector((0.6, s * 0.4, 0.9)), 0.18, 0.08, BONE_WOOD[3], segs=4)
            limb(m, p.lerp(q, 0.55), p.lerp(q, 0.55) + Vector((-0.9, s * 0.3, 0.7)), 0.16, 0.07, BONE_WOOD[3], segs=4)
    else:
        for k in range(6):
            a = k / 6 * math.tau + rng.uniform(-0.2, 0.2)
            p = Vector((math.cos(a) * 0.9, math.sin(a) * 0.9, 0.2))
            limb(m, p, p + Vector((math.cos(a) * 0.6, math.sin(a) * 0.6, rng.uniform(1.2, 1.9))), 0.22, 0.08, BONE_WOOD[2], segs=4)
    faces = new_faces(m, st)
    facet(m, faces, BONE_WOOD, noise=0.1)
    _ash_tops(m, faces, 0.6)
    m.build(r)
    return r


# --- the elders ------------------------------------------------------------------------------


def elder(v):
    """The woods' oldest, too broad to fly through: a trunk that holds its girth up past the flight
    line (SOLID), snapped off high where the firestorm took its crown, great splinters standing up
    round the break; buttress roots charred at the foot, ash heaped between them, a bough or two
    left low down. v0 hollow at the foot, the fungus glowing out of the dark; v1 split into two
    trunks from the root, both broken; v2 broken lower, shelves of fungus up the stub."""
    r = root("ashgrave_woods_elder", v)
    rng = random.Random(9280 + v)
    m = Model(f"ashgrave_woods_elder_{v}", 9280 + v)
    st = mark(m)

    def snapped(top, rad):
        # great splinters round the break, the longest on one side
        for k in range(7):
            a = k / 7 * math.tau + rng.uniform(-0.2, 0.2)
            tall = rng.uniform(0.6, 1.4) + (2.2 if k == 2 else 0)
            limb(m, top + Vector((math.cos(a) * rad * 0.7, math.sin(a) * rad * 0.7, -0.8)),
                 top + Vector((math.cos(a) * rad * 0.85, math.sin(a) * rad * 0.85, tall)), rad * 0.32, 0.06, BONE_WOOD[3], segs=4)
        m.cyl(rad * 0.62, 0.2, tuple(top + Vector((0, 0, -0.5))), "#18181e", segs=7)

    if v == 1:
        for s_ in (-1, 1):
            base = Vector((s_ * 1.0, 0, -1.0))
            mid = Vector((s_ * 1.9, s_ * 0.2, 9.0))
            top = Vector((s_ * 2.5, s_ * 0.3, 13.5 + s_ * 1.2))
            limb(m, base, mid, 1.55, 1.3, BONE_WOOD[2], segs=7)
            m.ball(1.3, tuple(mid), BONE_WOOD[2], subdiv=1)
            limb(m, mid, top, 1.3, 1.05, BONE_WOOD[2], segs=7)
            snapped(top, 1.05)
            # (the column where it crosses the flight line: x at z 10)
            collider(r, s_ * 2.0, s_ * 0.22, 1.45)
            _stub(m, rng, mid + Vector((s_ * 0.9, 0, -2.5)), (s_ * 1, rng.uniform(-0.4, 0.4), 0.45), 2.4, 0.5)
    else:
        H = 16.0 if v == 0 else 13.0
        base = Vector((0, 0, -1.0))
        mid = Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), 8.0))
        top = Vector((mid.x * 1.5, mid.y * 1.5, H))
        limb(m, base, mid, 2.5, 2.15, BONE_WOOD[2], segs=8)
        m.ball(2.15, tuple(mid), BONE_WOOD[2], subdiv=1)
        limb(m, mid, top, 2.15, 1.75, BONE_WOOD[2], segs=8)
        snapped(top, 1.75)
        collider(r, mid.x * 1.2, mid.y * 1.2, 2.2)
        # a great bough or two left low down, under the flight line, burnt back
        for k in range(2):
            a = rng.uniform(0, math.tau)
            _stub(m, rng, Vector((math.cos(a) * 1.6, math.sin(a) * 1.6, 5.5 + k * 1.4)), (math.cos(a), math.sin(a), 0.3), 2.8, 0.6)
    # buttress roots flaring out
    for k in range(6):
        a = k / 6 * math.tau + rng.uniform(-0.2, 0.2)
        limb(m, (math.cos(a) * 1.2, math.sin(a) * 1.2, 2.6), (math.cos(a) * 4.6, math.sin(a) * 4.6, -0.4), 0.95, 0.35, BONE_WOOD[2], segs=5)
    faces = new_faces(m, st)
    facet(m, faces, BONE_WOOD, noise=0.1)
    _ash_tops(m, faces, 0.72, amt=0.7)
    # charred at the foot: the roots and the first few metres of trunk all round; and in long
    # strips up the trunk where the fire ran up the bark
    strips = [rng.uniform(0, math.tau) for _ in range(2)]
    for f in faces:
        if not f.is_valid:
            continue
        c = f.calc_center_median()
        ang = math.atan2(c.y, c.x)
        strip = any(abs((ang - a0 + math.pi) % math.tau - math.pi) < 0.35 for a0 in strips) and c.z < 11
        if c.z < 2.4 + rng.uniform(-0.8, 0.8) or strip:
            f.material_index = m._slot(CHARRED[1 + rng.randrange(3)], False)
    # ash heaped round its foot, between the roots
    for k in range(4):
        a = k / 4 * math.tau + 0.4
        _drift(m, rng, (math.cos(a) * 3.4, math.sin(a) * 3.4, -0.3), (1.8, 1.4, 0.75), n=10)
    if v == 0:
        # the hollow: a dark mouth toward the camera, the fungus glowing out of it
        m.box((1.9, 1.2, 3.0), (0, -2.0, 1.1), "#0c0e14", rot=(0, 0, 0), taper=0.6)
        for k, (x, z) in enumerate(((-0.4, 0.4), (0.45, 0.9), (-0.1, 1.6))):
            m.cyl(0.38 - k * 0.06, 0.12, (x, -2.35, z), MOON[0], segs=6, glow=True)
        m.cyl(0.55, 0.14, (0, -3.0, 0.0), MOON_PALE[0], segs=6, glow=True)
        light(r, (0, -3.2, 1.2), MOON[0], radius=6, intensity=0.8, flicker=0.08, halo=False)
    if v == 2:
        for k in range(4):
            a = rng.uniform(0, math.tau)
            z = rng.uniform(3.5, 11.0)
            m.cyl(rng.uniform(0.6, 0.9), 0.2, (math.cos(a) * 1.9, math.sin(a) * 1.9, z), MOON[0], segs=6, glow=True)
        light(r, (0, -2.5, 6), MOON[0], radius=6, intensity=0.6, halo=False)
    m.build(r, rot_z=0.0)
    return r


def build():
    for v in range(3):
        pole(v)
        felled(v)
        burnt(v)
        stump(v)
        cordwood(v)
        clamp(v)
        crown(v)
        elder(v)
    for v in range(2):
        hut(v)
        sled(v)
