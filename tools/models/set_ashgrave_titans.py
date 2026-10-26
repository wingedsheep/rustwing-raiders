"""ASHGRAVE, the Titan Graveyard (docs/level-design.md, its layout row): the Five Mouths, where the
Toll War's titans fought for nine days and fell, and the Sankvi live in their shade.

The titans come as a kit the layout poses limb by limb (src/sim/layouts/titans.ts), so each one lies
where it fell its own way: a body (chest and pelvis, face down, on its back, or stripped to the frame
by a clan), a head, arm and leg segments, hands and feet, built along +x (the body's head end, a
limb's far end), lying in the ash. Two sides, read apart by their shapes as much as their paint:

- the Compact's: rounded ivory carapace in overlapping bands, oxblood trim, a smooth helm with one
  visor slit;
- the Uukhvar's: slab-sided gunmetal, chevron plates, hazard-yellow stripes, exhaust stacks, a
  wedge head with a crest and three eye slits.

Each kind's variants go Compact, Uukhvar, Compact, Uukhvar...: variant % 2 is the side. And the
things only this ground has: a hand curled up out of the ash past the flight line (its fingers the
colliders), an arm and a knee raised, a titan's great gun thrown out, the clan's boundary plates,
their lean-tos and plate stacks, cables spilling out of the joints, and the Kneel, a titan that died
kneeling, bowed over the way out.

Built into set_ashgrave (see its build())."""
from __future__ import annotations

import math
import random

from mathutils import Vector

from kit import Model, animate, light
from props_a_lib import hull
from props_b_kit import M, collider, facet, limb, mark, new_faces, root, xform
from props_b_ashgrave import (EYE, EYE_PALE, GUNMETAL, HOST_YELLOW, IVORY, OXBLOOD, RUST, STEEL, TARP, TARP_DARK)

# the ash that has settled on everything for 166 years: on the tops, in the joints
ASH = ["#94908a", "#a8a49c", "#bab6ae"]
# inside a titan: the frame, the cable runs, the dark of the cavities
FRAME = ["#2a2826", "#3c3834", "#524c46", "#6a6258"]
INNER = "#1c1a1a"
CABLE = ["#2a2422", "#3a302a", "#5a3a2a"]
# the Sankvi: the clan hand, green on grey; their lamps and tarps
HAND_GREEN = "#5aa070"
LAMP = "#ffc070"
SIDES = (
    # (armour dark..light, trim, the joints' dark)
    (IVORY, OXBLOOD, "#5a5248"),
    (GUNMETAL, HOST_YELLOW, "#1a1d22"),
)


def side(v):
    return SIDES[v % 2]


# --- helpers ------------------------------------------------------------------------------------


def _ash(m, faces, amt=0.3, up=0.78):
    """Ash settled on the tops: most upward faces dusted pale, unevenly."""
    idx = [m._slot(c, False) for c in ASH]
    for f in faces:
        if not f.is_valid:
            continue
        f.normal_update()
        if f.normal.z > up and m.rng.random() < amt:
            f.material_index = idx[m.rng.randrange(len(idx))]


def _plate(m, size, loc, rot, cols, taper=1.0, noise=0.04):
    st = mark(m)
    m.box(size, (0, 0, 0), cols[1], taper=taper)
    xform(m, st, M(loc, rot))
    return facet(m, new_faces(m, st), cols, noise=noise)


def _lump(m, pts, cols, noise=0.03, bias=0.0):
    f = hull(m, pts, cols[1])
    return set(facet(m, f, cols, noise=noise, bias=bias))


def _ellipse(cx, cy, z, rx, ry, n=10, a0=0.0, squash=None):
    out = []
    for k in range(n):
        a = a0 + k * math.tau / n
        out.append((cx + math.cos(a) * rx, cy + math.sin(a) * ry, z))
    return out


def _seg(m, rng, a, b, r0, r1, cols, segs=7):
    st = mark(m)
    limb(m, a, b, r0, r1, cols[1], segs=segs)
    return facet(m, new_faces(m, st), cols, noise=0.04)


def _band(m, x, r, w, color, z, segs=8):
    """A trim ring round a limb lying along x at height z."""
    m.cyl(r, w, (x - w / 2, 0, z), color, segs=segs, rot=(0, math.pi / 2, 0))


def _hand_sign(m, loc, s, color=HAND_GREEN, rot=0.0, z_up=True):
    """The clan's sign painted flat: a palm and five fingers, the five lanes of the junction."""
    x, y, z = loc
    c, sn = math.cos(rot), math.sin(rot)

    def at(u, v):
        return (x + u * c - v * sn, y + u * sn + v * c, z)
    m.box((1.1 * s, 1.0 * s, 0.06), at(0, 0), color, rot=(0, 0, rot))
    for k, (du, dv, L) in enumerate(((0.75, -0.42, 0.7), (0.85, -0.14, 0.85), (0.85, 0.14, 0.8), (0.75, 0.42, 0.65))):
        m.box((L * s, 0.2 * s, 0.06), at((du + L / 2 - 0.2) * s, dv * s), color, rot=(0, 0, rot))
    m.box((0.6 * s, 0.22 * s, 0.06), at(-0.1 * s, -0.7 * s), color, rot=(0, 0, rot - 0.7))


# --- the body ----------------------------------------------------------------------------------
# Along x: the pelvis from -14 to -7 (the hips at (-11.5, ±4.2)), the chest from -6 to 8 (the
# shoulders at (5, ±7.6)), the neck at 9.5. Under 7 tall.

HIP = (-11.5, 4.2)
SHOULDER = (5.0, 7.6)
NECK = 9.5


def _compact_back(m, rng, cols, trim):
    """The Compact's back: a rounded carapace in overlapping bands, a ridge of vertebra plates."""
    faces = set()
    # the chest: an ovoid, broad at the shoulders
    pts = []
    for x, rx, h in ((-6, 5.4, 4.6), (-2, 6.0, 5.6), (2, 6.6, 6.0), (6, 6.4, 5.6), (8.6, 4.6, 4.2)):
        for k in range(9):
            a = -math.pi / 2 + k * math.pi / 8
            pts.append((x, math.sin(a) * rx, 0.4 + max(0.0, math.cos(a)) * h))
        pts.append((x, 0, -0.2))
    faces |= _lump(m, pts, cols)
    # the bands over it: three overlapping shells, each a little proud of the last
    for k, (x, w) in enumerate(((-3.5, 4.2), (0.6, 4.4), (4.8, 4.0))):
        st = mark(m)
        sh = []
        for j in range(9):
            a = -math.pi / 2 + j * math.pi / 8
            for dx in (-w / 2, w / 2):
                sh.append((x + dx, math.sin(a) * (6.3 + k * 0.15), 0.6 + max(0.0, math.cos(a)) * (5.9 + k * 0.12)))
        hull(m, sh, cols[2])
        f = facet(m, new_faces(m, st), cols, noise=0.03, bias=0.05)
        faces |= f
        # an oxblood edge on each band's leading lip
        m.box((0.35, 6.0, 0.25), (x + w / 2 - 0.1, 0, 6.0 + k * 0.12), trim)
    # the vertebra ridge
    for k in range(6):
        x = -5 + k * 2.4
        faces |= _plate(m, (1.4, 1.3, 0.8), (x, 0, 6.3 - abs(x - 1.5) * 0.06), (0, 0.2, 0), cols, taper=0.6)
    # two thruster bells, low on the back, dark mouths
    for y in (-2.6, 2.6):
        st = mark(m)
        m.cyl(1.3, 0.9, (-5.2, y, 4.6), cols[1], segs=7, r_top=1.0)
        faces |= facet(m, new_faces(m, st), cols)
        m.cyl(0.75, 0.2, (-5.2, y, 5.45), INNER, segs=7)
    return faces


def _uukhvar_back(m, rng, cols, trim):
    """The Uukhvar's back: slab-sided, a chamfered box with chevron plates and two stacks."""
    faces = set()
    pts = []
    for x, w, h in ((-6, 5.2, 4.6), (-1, 6.4, 5.4), (6, 6.4, 5.4), (8.6, 4.2, 4.0)):
        for y, z in ((-w, 0.3), (-w, h - 1.6), (-w + 1.6, h), (w - 1.6, h), (w, h - 1.6), (w, 0.3)):
            pts.append((x, y, z))
        pts.append((x, 0, -0.2))
    faces |= _lump(m, pts, cols, noise=0.06)
    # chevron plates down the back, pointing at the head
    for k in range(4):
        x = -4.5 + k * 3.2
        for s in (-1, 1):
            faces |= _plate(m, (3.2, 3.6, 0.5), (x, s * 1.9, 5.55), (0, 0, s * 0.5), cols, noise=0.06)
        if k % 2 == 0:
            m.box((0.5, 5.2, 0.12), (x + 0.6, 0, 5.84), trim, rot=(0, 0, 0))
    # the hazard stripes on the shoulder slabs
    for s in (-1, 1):
        for j in range(3):
            m.box((0.45, 1.6, 0.1), (3.6 + j * 1.0, s * 5.4, 4.05), trim if j % 2 == 0 else cols[0], rot=(s * 0.55, 0, 0.5))
    # two exhaust stacks, raked back
    for y in (-2.2, 2.2):
        st = mark(m)
        m.box((1.4, 1.2, 2.2), (-5.6, y, 5.6), cols[1], rot=(0, -0.35, 0), taper=0.8)
        faces |= facet(m, new_faces(m, st), cols)
        m.box((0.9, 0.8, 0.2), (-6.0, y, 6.6), INNER, rot=(0, -0.35, 0))
    return faces


def _front(m, rng, cols, trim, compact):
    """On its back: the chest plate cracked open on the core, torn plates folded back. Returns faces."""
    faces = set()
    pts = []
    for x, w, h in ((-6, 5.4, 4.0), (-1, 6.2, 5.0), (5, 6.4, 5.0), (8.6, 4.4, 3.6)):
        if compact:
            for k in range(9):
                a = -math.pi / 2 + k * math.pi / 8
                pts.append((x, math.sin(a) * w, 0.4 + max(0.0, math.cos(a)) * h))
        else:
            for y, z in ((-w, 0.3), (-w, h - 1.4), (-w + 1.4, h), (w - 1.4, h), (w, h - 1.4), (w, 0.3)):
                pts.append((x, y, z))
        pts.append((x, 0, -0.2))
    faces |= _lump(m, pts, cols, noise=0.03)
    # the hole, the core in it (still lit: every core is listening)
    m.box((6.0, 5.2, 0.4), (1.6, 0, 5.0), INNER)
    m.cyl(2.0, 0.5, (1.6, 0, 4.9), EYE, segs=8, glow=True)
    m.cyl(1.0, 0.6, (1.6, 0, 5.0), EYE_PALE, segs=6, glow=True)
    # the frame's ribs across the hole
    for x in (-0.6, 3.8):
        _seg(m, rng, (x, -2.8, 5.1), (x + 0.2, 2.8, 5.1), 0.35, 0.35, FRAME, segs=5)
    # torn plates folded back off it
    for a in (0.5, 1.9, 3.5, 4.9):
        faces |= _plate(m, (3.2, 2.4, 0.4), (1.6 + math.cos(a) * 4.0, math.sin(a) * 3.6, 5.3), (math.sin(a) * 0.7, -math.cos(a) * 0.6, a), cols)
    # the trim: a band each side, or the hazard chevrons
    for s in (-1, 1):
        m.box((9.0, 0.5, 0.2), (1.0, s * 5.3, 4.2 if compact else 4.5), trim, rot=(s * 0.5, 0, 0))
    return faces


def _stripped(m, rng, cols, trim, compact):
    """Stripped by a clan to the frame: ribs over a spine beam, the cable runs, a few plates left."""
    faces = set()
    # the spine beam and the floor of the cavity
    faces |= _lump(m, [p for x in (-6, 8.5) for p in ((x, -1.2, 0.0), (x, 1.2, 0.0), (x, -1.0, 2.2), (x, 1.0, 2.2))], FRAME)
    m.box((14, 9.5, 0.4), (1.2, 0, 0.3), INNER)
    # the ribs, arched over, one every 1.9
    for k in range(8):
        x = -5.5 + k * 1.9
        w = 6.0 - abs(x - 1.8) * 0.12
        st = mark(m)
        for s in (-1, 1):
            limb(m, (x, s * 0.6, 2.0), (x, s * w * 0.75, 4.6), 0.38, 0.34, FRAME[2], segs=5)
            limb(m, (x, s * w * 0.75, 4.6), (x, s * w, 1.6), 0.34, 0.3, FRAME[2], segs=5)
            limb(m, (x, s * w, 1.6), (x, s * w * 0.95, -0.2), 0.3, 0.3, FRAME[1], segs=5)
        faces |= facet(m, new_faces(m, st), FRAME, noise=0.1)
    # cable runs along inside, sagging
    for y, c in ((-2.4, CABLE[0]), (-1.6, CABLE[2]), (2.0, CABLE[1]), (2.8, CABLE[0])):
        for k in range(4):
            x0 = -5.5 + k * 3.6
            limb(m, (x0, y, 2.6), (x0 + 1.8, y + 0.2, 1.3), 0.26, 0.26, c, segs=4)
            limb(m, (x0 + 1.8, y + 0.2, 1.3), (x0 + 3.6, y, 2.6), 0.26, 0.26, c, segs=4)
    # what they're cutting down to: the core in its housing on the cavity floor, still lit, chained
    # ready for the gantry's hoist (and still guarded: its welders sleep round it)
    m.cyl(1.9, 1.3, (2.05, 0, 0.5), FRAME[0], segs=8)
    m.cyl(1.35, 0.4, (2.05, 0, 1.75), EYE, segs=8, glow=True)
    m.cyl(0.65, 0.4, (2.05, 0, 1.85), EYE_PALE, segs=6, glow=True)
    for a in (0.6, 2.2, 3.8, 5.4):
        limb(m, (2.05 + math.cos(a) * 1.7, math.sin(a) * 1.7, 1.7), (2.05 + math.cos(a) * 0.4, math.sin(a) * 0.4, 4.4), 0.12, 0.12, CABLE[0], segs=4)
    # the plates they haven't got to yet: the neck end still whole
    for s in (-1, 1):
        faces |= _plate(m, (3.4, 4.2, 0.6), (7.2, s * 3.6, 4.0), (s * 0.5, 0.15, 0), cols)
    faces |= _plate(m, (2.6, 6.0, 0.6), (8.4, 0, 4.4), (0, 0.25, 0), cols)
    # the clan's tally where they've counted the plates off, and their sign
    for k in range(5):
        m.box((0.18, 0.9, 0.08), (6.2 + k * 0.32, 0, 4.86), HAND_GREEN, rot=(0, 0.25, 0.2 if k == 4 else 0))
    return faces


def _pelvis(m, rng, cols, trim, compact, up):
    faces = set()
    pts = []
    for x, w, h in ((-14, 3.6, 2.8), (-12, 5.2, 4.2), (-8.5, 5.0, 4.2), (-6.5, 3.6, 3.2)):
        if compact:
            for k in range(7):
                a = -math.pi / 2 + k * math.pi / 6
                pts.append((x, math.sin(a) * w, 0.3 + max(0.0, math.cos(a)) * h))
        else:
            for y, z in ((-w, 0.3), (-w, h - 1.2), (-w + 1.2, h), (w - 1.2, h), (w, h - 1.2), (w, 0.3)):
                pts.append((x, y, z))
        pts.append((x, 0, -0.2))
    faces |= _lump(m, pts, cols, noise=0.03)
    # the waist: dark coupling between pelvis and chest
    st = mark(m)
    m.cyl(3.6, 2.2, (-7.6, 0, 2.3), SIDES[0 if compact else 1][2], segs=7, rot=(0, math.pi / 2, 0))
    faces |= new_faces(m, st)
    # the hip joints, dark balls
    for s in (-1, 1):
        m.ball(2.4, (HIP[0], s * HIP[1], 2.3), side(0 if compact else 1)[2], subdiv=1)
    # a plate or the hazard stripe over the pelvis
    if compact:
        faces |= _plate(m, (4.4, 6.6, 0.5), (-10.8, 0, 4.4 if up else 4.2), (0, -0.08, 0), cols)
        m.box((0.4, 6.2, 0.2), (-8.6, 0, 4.5), trim)
    else:
        for j in range(4):
            m.box((0.5, 7.0, 0.1), (-12.4 + j * 1.1, 0, 4.32), trim if j % 2 == 0 else cols[0])
    return faces


def _shoulders(m, rng, cols, trim, compact):
    faces = set()
    for s in (-1, 1):
        if compact:
            st = mark(m)
            m.ball(1.0, (SHOULDER[0], s * SHOULDER[1], 3.3), cols[2], subdiv=1, scale=(3.8, 3.0, 3.0))
            faces |= facet(m, new_faces(m, st), cols, noise=0.03)
            m.box((5.6, 0.4, 0.3), (SHOULDER[0], s * (SHOULDER[1] + 1.4), 5.4), trim, rot=(s * 0.55, 0, 0))
        else:
            faces |= _lump(m, [(SHOULDER[0] + dx, s * (SHOULDER[1] + dy), z) for dx in (-3, 3) for dy, z in ((-2.4, 0.4), (-2.4, 5.0), (0.6, 5.6), (2.8, 3.4), (2.8, 0.4))], cols, noise=0.06)
            for j in range(3):
                m.box((0.5, 2.4, 0.1), (SHOULDER[0] - 1.4 + j * 1.2, s * (SHOULDER[1] - 0.6), 5.42), trim if j % 2 == 0 else cols[0], rot=(0, 0, 0.5))
    # the neck coupling
    m.cyl(2.2, 2.0, (NECK - 1.2, 0, 2.4), side(0 if compact else 1)[2], segs=7, rot=(0, math.pi / 2, 0))
    return faces


def titan_body(v):
    """The chest and pelvis. v0/v1 face down (the back up), v2/v3 on its back (the chest cracked
    open on its core), v4/v5 stripped by a clan to the frame (the yard's)."""
    r = root("ashgrave_titan_body", v)
    rng = random.Random(4100 + v)
    m = Model(f"ashgrave_titan_body_{v}", 4100 + v)
    cols, trim, _ = side(v)
    compact = v % 2 == 0
    pose = v // 2
    if pose == 0:
        faces = _compact_back(m, rng, cols, trim) if compact else _uukhvar_back(m, rng, cols, trim)
    elif pose == 1:
        faces = _front(m, rng, cols, trim, compact)
        light(r, (1.6, 0, 6.5), EYE, radius=9, intensity=1.0, flicker=0.3)
    else:
        faces = _stripped(m, rng, cols, trim, compact)
        light(r, (2.05, 0, 3.6), EYE, radius=7, intensity=0.8, flicker=0.3)
    faces |= _pelvis(m, rng, cols, trim, compact, pose == 1)
    faces |= _shoulders(m, rng, cols, trim, compact)
    _ash(m, faces, 0.28 if pose != 2 else 0.15)
    m.build(r)
    return r


# --- the head -----------------------------------------------------------------------------------


def titan_head(v):
    """A head, lying (its neck at -x). v0 the Compact's helm, v1 the Uukhvar's wedge; v2/v3 the same
    with an eye still lit: listening."""
    r = root("ashgrave_titan_head", v)
    rng = random.Random(4200 + v)
    m = Model(f"ashgrave_titan_head_{v}", 4200 + v)
    cols, trim, dark = side(v)
    lit = v >= 2
    eye = (EYE, True) if lit else (INNER, False)
    faces = set()
    if v % 2 == 0:
        # a smooth helm, a crest down its middle, one visor slit across the front
        st = mark(m)
        m.ball(1.0, (0.2, 0, 2.4), cols[2], subdiv=2, scale=(3.4, 3.0, 2.5))
        faces |= facet(m, new_faces(m, st), cols, noise=0.06)
        faces |= _plate(m, (6.0, 0.9, 0.8), (0.1, 0, 4.7), (0, 0.05, 0), cols, taper=0.6)
        m.box((0.5, 4.2, 0.8), (3.25, 0, 2.6), eye[0], glow=eye[1])
        m.box((2.4, 0.3, 0.2), (-0.4, 1.0, 4.6), trim)
        # the jaw guard
        faces |= _plate(m, (2.2, 4.4, 1.6), (2.4, 0, 1.0), (0, 0.3, 0), cols)
    else:
        # a wedge, a tall crest fin, three eye slits in a row
        faces |= _lump(m, [(-2.6, -2.8, 0.2), (-2.6, 2.8, 0.2), (-2.6, -2.4, 4.0), (-2.6, 2.4, 4.0), (3.6, -1.8, 0.4), (3.6, 1.8, 0.4),
                           (3.0, -1.6, 2.8), (3.0, 1.6, 2.8), (0.5, 0, 4.6)], cols, noise=0.05)
        faces |= _plate(m, (5.0, 0.6, 2.0), (-0.6, 0, 4.8), (0, 0.15, 0), cols, taper=0.4)
        for y in (-1.1, 0, 1.1):
            m.box((0.5, 0.6, 0.4), (3.35, y, 2.0), eye[0], rot=(0, 0.2, 0), glow=eye[1])
        for j in range(3):
            m.box((0.4, 0.62, 0.1), (-2.0 + j * 0.9, 0, 5.75), trim if j % 2 == 0 else cols[0])
    m.cyl(1.8, 1.4, (-3.4, 0, 2.0), dark, segs=7, rot=(0, math.pi / 2, 0))
    _ash(m, faces, 0.25)
    m.build(r)
    if lit:
        light(r, (3.6, 0, 2.5), EYE, radius=6, intensity=0.8, flicker=0.4)
    return r


# --- limbs --------------------------------------------------------------------------------------
# Each centred on the origin along x, its near joint at -L/2 and its far one (the elbow, the knee,
# the wrist, the ankle) at +L/2, lying: its axis at the height of its radius, a little sunk.

ARM = {"upper": (11.0, 2.2, 2.5), "fore": (10.0, 2.0, 1.7)}
LEG = {"thigh": (12.0, 2.7, 2.8), "shin": (12.0, 2.4, 2.1)}


def _limb(m, rng, v, L, rad, joint, armour):
    cols, trim, dark = side(v)
    compact = v % 2 == 0
    faces = set()
    z = rad * 0.85
    st = mark(m)
    limb(m, (-L / 2, 0, z), (L / 2, 0, z), rad * 0.85, rad * 0.78, dark, segs=7)
    faces |= new_faces(m, st)
    # the armour sleeve over its top: round shells or slabs
    if compact:
        for k in range(armour):
            x = -L / 2 + (k + 0.6) * L / (armour + 0.3)
            st = mark(m)
            pts = []
            w = L / (armour + 0.3) * 0.62
            for j in range(7):
                a = -math.pi * 0.62 + j * math.pi * 1.24 / 6
                for dx in (-w, w):
                    pts.append((x + dx, math.sin(a) * rad * 1.1, z + math.cos(a) * rad * 1.1))
            hull(m, pts, cols[2])
            faces |= facet(m, new_faces(m, st), cols, noise=0.03)
        _band(m, -L / 2 + 0.9, rad * 1.02, 0.5, trim, z)
    else:
        for k in range(armour):
            x = -L / 2 + (k + 0.6) * L / (armour + 0.3)
            w = L / (armour + 0.3) * 1.15
            faces |= _plate(m, (w, rad * 1.9, rad * 0.9), (x, 0, z + rad * 0.55), (0, 0, 0), cols, taper=0.75, noise=0.06)
            m.box((0.45, rad * 1.5, 0.1), (x - w * 0.3, 0, z + rad + 0.04), trim)
    # the far joint
    st = mark(m)
    m.ball(joint, (L / 2, 0, z * 0.95), dark, subdiv=1)
    faces |= new_faces(m, st)
    if compact:
        faces |= _plate(m, (joint * 1.1, joint * 1.5, 0.5), (L / 2, 0, z + joint * 0.85), (0, 0.1, 0), cols, taper=0.7)
    else:
        faces |= _plate(m, (joint * 1.0, joint * 1.2, joint * 0.8), (L / 2 + 0.2, 0, z + joint * 0.55), (0, 0.2, 0), cols, taper=0.6)
    _ash(m, faces, 0.25)
    return faces


def titan_arm(v):
    """v0/v1 the upper arm (the elbow at +x), v2/v3 the forearm (the wrist at +x)."""
    r = root("ashgrave_titan_arm", v)
    m = Model(f"ashgrave_titan_arm_{v}", 4300 + v)
    L, rad, joint = ARM["upper" if v < 2 else "fore"]
    _limb(m, random.Random(4300 + v), v, L, rad, joint, 2 if v < 2 else 3)
    m.build(r)
    return r


def titan_leg(v):
    """v0/v1 the thigh (the knee at +x), v2/v3 the shin (the ankle at +x)."""
    r = root("ashgrave_titan_legpart", v)
    m = Model(f"ashgrave_titan_legpart_{v}", 4320 + v)
    L, rad, joint = LEG["thigh" if v < 2 else "shin"]
    _limb(m, random.Random(4320 + v), v, L, rad, joint, 3)
    m.build(r)
    return r


def titan_hand(v):
    """A hand lying (its wrist at -x): v0/v1 open, palm down, the fingers splayed; v2/v3 a fist."""
    r = root("ashgrave_titan_hand", v)
    rng = random.Random(4340 + v)
    m = Model(f"ashgrave_titan_hand_{v}", 4340 + v)
    cols, trim, dark = side(v)
    faces = set()
    if v < 2:
        faces |= _plate(m, (5.0, 5.4, 2.0), (0.6, 0, 1.0), (0, 0, 0), cols, taper=0.85)
        for k, (dy, ang, L) in enumerate(((-2.0, -0.32, 4.2), (-0.7, -0.1, 4.8), (0.6, 0.08, 4.6), (1.9, 0.28, 3.8))):
            p = Vector((3.0, dy, 1.0))
            d = Vector((math.cos(ang), math.sin(ang), 0))
            for i, l in enumerate((L * 0.45, L * 0.33, L * 0.25)):
                q = p + d * l + Vector((0, 0, -0.12 * i))
                faces |= _seg(m, rng, p, q, 0.68 * 0.9 ** i, 0.6 * 0.9 ** i, cols, segs=6)
                p = q
                d = Vector((d.x, d.y, 0)).normalized()
        # the thumb, out to the side
        faces |= _seg(m, rng, (-0.4, -2.6, 1.0), (1.6, -4.6, 0.8), 0.8, 0.7, cols)
        faces |= _seg(m, rng, (1.6, -4.6, 0.8), (3.4, -5.4, 0.6), 0.7, 0.6, cols)
    else:
        faces |= _lump(m, [(-2.2, y, z) for y in (-2.6, 2.6) for z in (0.0, 3.6)] + [(3.2, y, z) for y in (-2.4, 2.4) for z in (0.2, 3.4)] + [(4.0, 0, 1.8)], cols, noise=0.06)
        for k in range(4):
            st = mark(m)
            m.ball(0.85, (3.4, -1.8 + k * 1.2, 3.0), cols[2], subdiv=1, scale=(1.0, 0.9, 0.8))
            faces |= facet(m, new_faces(m, st), cols)
        faces |= _seg(m, rng, (0.0, -2.8, 1.6), (2.6, -2.9, 2.4), 0.9, 0.8, cols)
        m.box((0.4, 4.6, 0.12), (1.2, 0, 3.66), trim)
    m.cyl(1.5, 1.4, (-3.0, 0, 1.4), dark, segs=7, rot=(0, math.pi / 2, 0))
    _ash(m, faces, 0.28)
    m.build(r)
    return r


def titan_foot(v):
    """A foot lying on its side (its ankle at -x): the Compact's rounded boot, the Uukhvar's slab."""
    r = root("ashgrave_titan_foot", v)
    rng = random.Random(4360 + v)
    m = Model(f"ashgrave_titan_foot_{v}", 4360 + v)
    cols, trim, dark = side(v)
    faces = set()
    if v % 2 == 0:
        faces |= _lump(m, [(-2.4, y, z) for y in (-2.4, 2.4) for z in (0.0, 3.6)] + [(4.2, y, z) for y in (-2.0, 2.0) for z in (0.0, 2.0)] + [(1.0, 0, 4.0), (5.0, 0, 0.8)], cols, noise=0.07)
        faces |= _plate(m, (3.2, 3.4, 0.6), (2.6, 0, 2.4), (0, 0.35, 0), cols, taper=0.7)
        m.box((0.4, 3.6, 0.2), (0.4, 0, 3.6), trim)
    else:
        faces |= _lump(m, [(-2.4, y, z) for y in (-2.6, 2.6) for z in (0.0, 3.4)] + [(4.6, y, z) for y in (-2.6, 2.6) for z in (0.0, 1.6)], cols, noise=0.04)
        for j in range(3):
            m.box((0.5, 4.4, 0.1), (1.4 + j * 1.1, 0, 2.62 - j * 0.42), trim if j % 2 == 0 else cols[0], rot=(0, 0.42, 0))
    # the sole's treads to the side
    for k in range(3):
        m.box((1.2, 0.4, 2.0), (-0.8 + k * 1.9, -2.6, 0.9), dark)
    _ash(m, faces, 0.28)
    m.build(r)
    return r


# --- what stands up past the flight line ------------------------------------------------------


def _finger(m, rng, base, ang, rise, lengths, rad, cols, curl=0.55):
    """A finger rising from its knuckle at `base`, heading `ang`, curling back over. Returns the
    joints (base first)."""
    p = Vector(base)
    pitch = rise
    joints = [p.copy()]
    for i, L in enumerate(lengths):
        d = Vector((math.cos(ang) * math.cos(pitch), math.sin(ang) * math.cos(pitch), math.sin(pitch)))
        q = p + d * L
        _seg(m, rng, p, q, rad * 0.9 ** i, rad * 0.9 ** (i + 1), cols, segs=6)
        m.ball(rad * 0.9 ** (i + 1) * 1.08, tuple(q), cols[1], subdiv=1)
        joints.append(q.copy())
        p = q
        pitch -= curl * (1.4 if i else 1.0)
    return joints


def titan_reach(v):
    """GATE-LIKE SOLID: a titan's hand curled up out of the ash past the flight line, palm up, the
    wrist at -x (its forearm lies off that way, a segment the layout puts down). The four fingers
    stand along +y as a wall of knuckles to frame the way; the thumb apart. v0 the Compact's, v1 the
    Uukhvar's. The index finger twitches now and then: some of them still twitch. A clan lives in the
    palm: a tarp strung between the fingers, a lamp, a ladder up the wrist."""
    r = root("ashgrave_titan_reach", v)
    rng = random.Random(4400 + v)
    m = Model(f"ashgrave_titan_reach_{v}", 4400 + v)
    cols, trim, dark = side(v)
    S = 1.9      # a titan's hand at the size the reach needs: bigger than a ship, framing the way
    # the palm, tilted up a little toward the fingers, its heel in the ash
    _lump(m, [(-4 * S, y * S, 0.0) for y in (-2.8, 2.8)] + [(-3.6 * S, y * S, 2.2 * S) for y in (-2.6, 2.6)]
          + [(2.6 * S, y * S, 0.6 * S) for y in (-3.2, 3.2)] + [(2.8 * S, y * S, 2.6 * S) for y in (-3.0, 3.0)], cols, noise=0.06)
    m.cyl(1.8 * S, 1.4 * S, (-5.2 * S, 0, 1.6 * S), dark, segs=7, rot=(0, math.pi / 2, 0))
    # the fingers: standing up along the palm's far edge, curling back over it
    tips = []
    finger_objs = []
    for k, dy in enumerate((-2.5, -0.85, 0.85, 2.5)):
        L = (1.0, 1.12, 1.05, 0.86)[k]
        base = (2.8 * S, dy * S, 2.0 * S)
        if k == 1:
            # the index (from the thumb's side) is its own part, so it can twitch
            fm = Model(f"ashgrave_titan_reach_{v}_finger", 4410 + v)
            j = _finger(fm, rng, (0, 0, 0), 0.0, 1.35, [3.2 * S * L, 2.6 * S * L, 2.0 * S * L], 0.95 * S, cols)
            o = fm.build(r, loc=base)
            finger_objs.append(o)
            tips.append([Vector(base) + q for q in j])
        else:
            tips.append(_finger(m, rng, base, 0.0, 1.35, [3.2 * S * L, 2.6 * S * L, 2.0 * S * L], 0.95 * S, cols))
    # the thumb, apart, rising from the palm's side and curling in
    tj = _finger(m, rng, (-0.6 * S, -3.4 * S, 1.6 * S), -1.25, 1.1, [3.0 * S, 2.4 * S], 1.05 * S, cols, curl=0.7)
    # knuckle plates
    for k, dy in enumerate((-2.5, -0.85, 0.85, 2.5)):
        _plate(m, (1.6 * S, 1.4 * S, 0.5 * S), (2.6 * S, dy * S, 2.9 * S), (0, -0.4, 0), cols, taper=0.7)
    m.box((0.5 * S, 6.4 * S, 0.12), (1.8 * S, 0, 2.62 * S), trim, rot=(0, -0.2, 0))
    # where each finger crosses the flight line: a column of the gate (no gap between them a ship
    # could take: they frame the way, they don't open on it)
    for js in tips + [tj]:
        for a, b in zip(js, js[1:]):
            if (a.z - 10) * (b.z - 10) <= 0 and a.z != b.z:
                t = (10 - a.z) / (b.z - a.z)
                p = a.lerp(b, t)
                collider(r, p.x, p.y, 0.95 * S)
                break
    # the Hand clan's: a tarp strung between the fingers' feet, a lamp, a ladder up the wrist
    for k in range(3):
        y0 = (-2.5 + k * 1.67) * S
        m.box((0.2, 1.67 * S, 2.4), (2.2 * S, y0 + 0.83 * S, 2.5 * S), TARP[[0, 3, 1][k]], rot=(0, -0.25, 0))
    m.box((0.5, 0.5, 2.6), (-1.0 * S, 1.6 * S, 2.4 * S), TARP_DARK)
    m.box((0.7, 0.7, 0.6), (-1.0 * S, 1.6 * S, 2.4 * S + 1.6), LAMP, glow=True)
    light(r, (-1.0 * S, 1.6 * S, 2.4 * S + 2.0), LAMP, radius=6, intensity=0.8, flicker=0.3)
    for k in range(6):
        m.box((0.18, 1.6, 0.18), (-4.6 * S + k * 0.7, 2.2 * S, 0.3 + k * 0.62), RUST[2])
    _hand_sign(m, (-1.6 * S, -0.6 * S, 2.38 * S), 1.9, rot=0.3)
    _ash(m, set(m.bm.faces), 0.35)
    m.build(r)
    # the twitch: still, still, then the index finger jerks in and settles
    for o in finger_objs:
        animate(o, f"ashgrave_titan_reach_{v}_twitch_idle", "rotation_euler",
                [(0, (0, 0, 0)), (3.4, (0, 0, 0)), (3.5, (0, 0.16, 0.03)), (3.62, (0, 0.05, 0)), (3.74, (0, 0.11, -0.02)), (4.3, (0, 0, 0)), (7.0, (0, 0, 0))])
    return r


def titan_arm_up(v):
    """SOLID: a forearm raised from the elbow (at the origin, in the ash) past the flight line, the
    hand open at the top. The upper arm lies off along -x (a segment the layout puts down)."""
    r = root("ashgrave_titan_arm_up", v)
    rng = random.Random(4420 + v)
    m = Model(f"ashgrave_titan_arm_up_{v}", 4420 + v)
    cols, trim, dark = side(v)
    el = Vector((0, 0, 2.0))
    wr = Vector((1.6, 0.6, 17.5))
    m.ball(2.6, tuple(el), dark, subdiv=1)
    _seg(m, rng, el, wr, 2.1, 1.8, cols)
    for t in (0.3, 0.62):
        p = el.lerp(wr, t)
        if v % 2 == 0:
            st = mark(m)
            m.ball(1.0, tuple(p), cols[2], subdiv=1, scale=(2.5, 2.5, 2.6))
            facet(m, new_faces(m, st), cols)
        else:
            _plate(m, (4.2, 4.2, 3.6), tuple(p), (0.05, -0.1, 0.3), cols, taper=0.8)
    m.box((0.5, 4.4, 0.6), tuple(el.lerp(wr, 0.46)), trim, rot=(0.05, -0.1, 0))
    m.ball(1.6, tuple(wr), dark, subdiv=1)
    # the hand, open, fingers spread up and curling
    _plate(m, (3.6, 1.8, 3.2), tuple(wr + Vector((0.2, 0, 2.2))), (0, 0.05, 0), cols)
    for k, dx in enumerate((-1.4, -0.46, 0.46, 1.4)):
        _finger(m, rng, wr + Vector((dx, 0, 3.6)), math.pi / 2 + dx * 0.25, 1.25, [1.8, 1.4, 1.0], 0.5, cols, curl=0.4)
    _finger(m, rng, wr + Vector((-1.9, 0, 2.0)), math.pi * 0.95, 0.7, [1.6, 1.2], 0.55, cols, curl=0.3)
    # the joint's light: something in it still holds charge
    m.cyl(0.7, 0.4, tuple(el.lerp(wr, 0.78) + Vector((0, -1.8, 0))), EYE, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    light(r, tuple(el.lerp(wr, 0.78) + Vector((0, -2.4, 0))), EYE, radius=6, intensity=0.6, flicker=0.5)
    p = el.lerp(wr, (10 - el.z) / (wr.z - el.z))
    collider(r, p.x, p.y, 2.3)
    # ash heaped round the elbow
    st = mark(m)
    m.ball(1.0, (0.2, 0, 0.2), ASH[0], subdiv=1, scale=(4.2, 3.8, 1.8), jitter=0.4)
    facet(m, new_faces(m, st), ["#6e6a62", ASH[0], ASH[1]])
    _ash(m, set(m.bm.faces), 0.3)
    m.build(r)
    return r


def titan_knee_up(v):
    """SOLID: a leg drawn up past the flight line, the hip at the origin, the thigh rising to the
    knee and the shin coming back down to the foot at +x."""
    r = root("ashgrave_titan_knee_up", v)
    rng = random.Random(4440 + v)
    m = Model(f"ashgrave_titan_knee_up_{v}", 4440 + v)
    cols, trim, dark = side(v)
    hip = Vector((0, 0, 2.2))
    knee = Vector((6.4, 0.6, 15.5))
    ankle = Vector((13.5, 1.2, 2.2))
    _seg(m, rng, hip, knee, 2.7, 2.4, cols)
    _seg(m, rng, knee, ankle, 2.4, 2.0, cols)
    m.ball(2.9, tuple(knee), dark, subdiv=1)
    _plate(m, (3.6, 4.4, 4.6), tuple(knee + Vector((0.6, 0, 0.6))), (0, 0.4, 0), cols, taper=0.7)
    m.box((4.0, 0.4, 0.4), tuple(hip.lerp(knee, 0.5) + Vector((0, -2.6, 0))), trim, rot=(0, -1.1, 0))
    # the foot, sole down
    _lump(m, [(ankle.x + dx, ankle.y + dy, z) for dx in (-2.0, 4.0) for dy in (-2.2, 2.2) for z in (0.0, 2.6 if dx < 0 else 1.4)], cols, noise=0.06)
    # one collider round both where they cross the flight line: they're close, a ship can't pass between
    a = hip.lerp(knee, (10 - hip.z) / (knee.z - hip.z))
    b = knee.lerp(ankle, (knee.z - 10) / (knee.z - ankle.z))
    collider(r, (a.x + b.x) / 2, (a.y + b.y) / 2, (b.x - a.x) / 2 + 2.3)
    st = mark(m)
    m.ball(1.0, (13.5, 1.2, 0.2), ASH[0], subdiv=1, scale=(4.0, 3.6, 1.6), jitter=0.4)
    facet(m, new_faces(m, st), ["#6e6a62", ASH[0], ASH[1]])
    _ash(m, set(m.bm.faces), 0.35)
    m.build(r)
    return r


# --- what the war left lying ------------------------------------------------------------------


def titan_gun(v):
    """A titan's great gun, torn off and thrown out, lying in the ash: v0 the Compact's long rail,
    v1 the Uukhvar's three-barrelled cannon. About 20 long, the breech at -x."""
    r = root("ashgrave_titan_gun", v)
    rng = random.Random(4460 + v)
    m = Model(f"ashgrave_titan_gun_{v}", 4460 + v)
    cols, trim, dark = side(v)
    faces = set()
    if v % 2 == 0:
        faces |= _plate(m, (6.0, 4.2, 3.4), (-7.0, 0, 1.6), (0, 0, 0), cols, taper=0.85)
        for y in (-0.9, 0.9):
            faces |= _seg(m, rng, (-4.0, y, 1.5), (12.0, y, 1.2), 0.75, 0.7, STEEL, segs=6)
        for k in range(5):
            x = -2.5 + k * 3.2
            faces |= _plate(m, (0.8, 3.4, 2.6), (x, 0, 1.4), (0, 0, 0), cols, taper=0.8)
            if k % 2:
                m.box((0.82, 3.42, 0.3), (x, 0, 2.55), trim)
        m.box((1.2, 3.0, 1.6), (12.4, 0, 1.2), dark)
    else:
        faces |= _lump(m, [(-9, y, z) for y in (-2.8, 2.8) for z in (0, 3.6)] + [(-3, y, z) for y in (-2.8, 2.8) for z in (0, 3.6)], cols, noise=0.05)
        for k in range(3):
            a = k * math.tau / 3 + 0.3
            y, z = math.cos(a) * 1.0, 1.8 + math.sin(a) * 1.0
            faces |= _seg(m, rng, (-3, y, z), (11, y, z), 0.6, 0.55, STEEL, segs=6)
        for x in (1.0, 6.0, 10.4):
            st = mark(m)
            m.cyl(1.9, 0.9, (x, 0, 1.8), cols[1], segs=6, rot=(0, math.pi / 2, 0))
            faces |= facet(m, new_faces(m, st), cols)
        for j in range(3):
            m.box((0.5, 5.7, 0.1), (-7.6 + j * 1.2, 0, 3.62), trim if j % 2 == 0 else cols[0])
    # torn cables out of its breech
    for k in range(3):
        y = -1.2 + k * 1.2
        limb(m, (-10.0, y, 1.2), (-11.6, y + rng.uniform(-1.2, 1.2), 0.2), 0.3, 0.26, CABLE[k], segs=4)
    _ash(m, faces, 0.3)
    m.build(r, rot_z=0)
    return r


def cable_spill(v):
    """Cables spilling out of a torn joint onto the ash, looping, a broken coupling among them."""
    r = root("ashgrave_cable_spill", v)
    rng = random.Random(4480 + v)
    m = Model(f"ashgrave_cable_spill_{v}", 4480 + v)
    for k in range(4 + v):
        p = Vector((0, rng.uniform(-0.8, 0.8), 0.9))
        a = rng.uniform(-0.8, 0.8)
        c = CABLE[k % len(CABLE)]
        rad = rng.uniform(0.22, 0.36)
        for i in range(4):
            a += rng.uniform(-0.9, 0.9)
            q = Vector((p.x + math.cos(a) * 1.6, p.y + math.sin(a) * 1.6, 0.25))
            limb(m, p, q, rad, rad, c, segs=4)
            p = q
    st = mark(m)
    m.cyl(0.9, 0.7, (0.4, 0, 0.0), FRAME[2], segs=6, rot=(0, 1.2, 0.3))
    facet(m, new_faces(m, st), FRAME)
    m.build(r)
    return r


def plate_stack(v):
    """The clans' stacks, plates sorted by size: v0 great back plates in a stepped pile, v1 plates
    racked on edge in a frame, v2 pauldron shells nested. Tally marks and the hand on them."""
    r = root("ashgrave_plate_stack", v)
    rng = random.Random(4500 + v)
    m = Model(f"ashgrave_plate_stack_{v}", 4500 + v)
    faces = set()
    if v == 0:
        for k in range(6):
            cols = SIDES[rng.randrange(2)][0]
            w = 6.0 - k * 0.7
            faces |= _plate(m, (w, w * 0.75, 0.55), (rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), 0.3 + k * 0.58), (0, 0, rng.uniform(-0.15, 0.15)), cols, taper=0.95)
        _hand_sign(m, (0, 0, 3.8), 1.0, rot=0.2)
    elif v == 1:
        for x in (-3.4, 3.4):
            m.box((0.4, 0.4, 3.6), (x, -1.4, 1.8), RUST[1])
            m.box((0.4, 0.4, 3.6), (x, 1.4, 1.8), RUST[1])
        m.box((7.2, 0.3, 0.3), (0, -1.4, 3.5), RUST[2])
        m.box((7.2, 0.3, 0.3), (0, 1.4, 3.5), RUST[2])
        for k in range(9):
            cols = SIDES[k % 3 == 0][0]
            faces |= _plate(m, (0.4, 2.6, 3.0 - (k % 3) * 0.3), (-3.0 + k * 0.75, 0, 1.6), (0, 0.18, 0), cols)
        for k in range(4):
            m.box((0.15, 0.7, 0.06), (-1.0 + k * 0.3, -1.5, 3.68), HAND_GREEN)
    else:
        for k in range(4):
            cols = SIDES[k % 2][0]
            st = mark(m)
            m.ball(1.0, (rng.uniform(-0.2, 0.2), 0, 0.4 + k * 0.7), cols[2], subdiv=1, scale=(2.6 - k * 0.3, 2.2 - k * 0.25, 1.2))
            faces |= facet(m, new_faces(m, st), cols)
        m.box((0.2, 3.0, 0.2), (1.0, 0, 2.9), SIDES[0][1], rot=(0, 0, 0.3))
    _ash(m, faces, 0.3)
    m.build(r)
    return r


def lean_to(v):
    """A Sankvi lean-to tucked against a titan (it leans on -y, the body's side): armour plates
    leant on a frame of pipe, a tarp door, a stove pipe, a lamp, the hand painted on its roof."""
    r = root("ashgrave_lean_to", v)
    rng = random.Random(4520 + v)
    m = Model(f"ashgrave_lean_to_{v}", 4520 + v)
    W = 6.0 if v == 0 else 4.4
    faces = set()
    for k in range(int(W / 1.5)):
        cols = SIDES[rng.randrange(2)][0]
        x = -W / 2 + 0.75 + k * 1.5
        faces |= _plate(m, (1.6, 3.6, 0.3), (x, -0.6, 1.6), (0.95, 0, rng.uniform(-0.08, 0.08)), cols)
    m.box((W, 0.25, 0.25), (0, -2.0, 3.0), RUST[1])
    m.box((1.4, 0.15, 1.8), (rng.uniform(-1, 1), 0.85, 0.9), TARP[rng.randrange(4)])
    m.cyl(0.25, 1.6, (W / 2 - 0.8, -0.8, 2.2), RUST[0], segs=5)
    m.box((0.5, 0.4, 0.5), (-W / 2 + 0.6, 0.9, 1.9), LAMP, glow=True)
    light(r, (-W / 2 + 0.6, 1.4, 2.2), LAMP, radius=4, intensity=0.6, flicker=0.4)
    _hand_sign(m, (0.0, -0.4, 2.12), 0.9, rot=0.0)
    # odds and ends round its door
    for k in range(3):
        m.box((0.6, 0.6, 0.7), (rng.uniform(-W / 2, W / 2), rng.uniform(1.2, 2.0), 0.35), [RUST[1], "#3a4a3a", TARP[4]][k], rot=(0, 0, rng.uniform(0, 1)))
    _ash(m, faces, 0.3)
    m.build(r)
    return r


def boundary_plate(v):
    """SOLID: a clan's boundary: a titan's armour plate stood on end in the ash, taller than you fly,
    the green hand painted on its face (toward you as you come in), a cairn of bolts at its foot,
    rags tied on. v0 the Compact's ivory, v1 the Uukhvar's gunmetal."""
    r = root("ashgrave_boundary_plate", v)
    rng = random.Random(4540 + v)
    m = Model(f"ashgrave_boundary_plate_{v}", 4540 + v)
    cols, trim, dark = side(v)
    st = mark(m)
    if v == 0:
        pts = [(x, y, z) for x in (-2.6, 2.6) for y in (-0.7, 0.7) for z in (0.0,)] + [(x * 0.9, y, 15.0) for x in (-2.4, 2.4) for y in (-0.6, 0.6)] + [(0, y, 16.6) for y in (-0.5, 0.5)]
    else:
        pts = [(x, y, z) for x in (-2.8, 2.8) for y in (-0.7, 0.7) for z in (0.0, 14.6)] + [(-1.4, y, 16.4) for y in (-0.6, 0.6)]
    hull(m, pts, cols[2])
    facet(m, new_faces(m, st), cols, noise=0.06)
    xform(m, st, M((0, 0, 0), (rng.uniform(-0.05, 0.05), rng.uniform(-0.06, 0.06), 0)))
    # the trim, and the hand big on its face
    m.box((5.0, 0.2, 0.5), (0, -0.78, 11.2), trim)
    # the face toward you whitewashed, the hand big on it, up where it shows over the collider
    m.box((4.4, 0.1, 4.6), (0, -0.74, 13.6), "#c8c2b4")
    st = mark(m)
    _hand_sign(m, (0, 0, 0), 2.0, rot=math.pi / 2)
    xform(m, st, M((0, -0.82, 13.4), (math.pi / 2, 0, 0)))
    # rags tied round it, a cairn of bolts and plates at its foot
    for k, c in enumerate((TARP[0], TARP[3], TARP[4])):
        m.box((5.2, 1.6, 0.3), (0, 0, 4.0 + k * 0.6), c, rot=(0, 0, rng.uniform(-0.1, 0.1)))
    for k in range(7):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(2.0, 3.4)
        m.box((0.9, 0.9, 0.7), (math.cos(a) * d, math.sin(a) * d, 0.35 + (k % 3) * 0.5), [RUST[1], STEEL[1], cols[1]][k % 3], rot=(0, 0, a))
    collider(r, 0, 0, 2.8)
    m.build(r)
    return r


def kneel(v):
    """GIANT: the Kneel, a titan that died kneeling, bowed over the way out. Its knees in the ash out
    past -x (shins lying back), its back arching high over the field, its head hung, its two fists
    planted on the ground at +x either side of y. You fly out under it. The Kneel clan painted the
    hand on its back, and live round its knees. v0 the Compact's, v1 the Uukhvar's."""
    r = root("ashgrave_kneel", v)
    rng = random.Random(4560 + v)
    m = Model(f"ashgrave_kneel_{v}", 4560 + v)
    cols, trim, dark = side(v)
    compact = v == 0
    faces = set()
    for s in (-1, 1):
        knee = Vector((-34.0, s * 6.0, 2.6))
        foot = Vector((-47.0, s * 7.0, 1.8))
        hip = Vector((-28.5, s * 5.0, 15.5))
        faces |= _seg(m, rng, knee, foot, 3.0, 2.6, cols)
        faces |= _seg(m, rng, knee, hip, 3.2, 3.2, cols)
        p = knee.lerp(hip, (10 - knee.z) / (hip.z - knee.z))
        collider(r, p.x, p.y, 3.4)
        m.ball(3.6, tuple(knee), dark, subdiv=1)
        faces |= _plate(m, (4.2, 5.2, 5.0), tuple(knee + Vector((1.2, 0, 1.8))), (0, -0.5, 0), cols, taper=0.7)
        faces |= _lump(m, [(foot.x + dx, foot.y + dy, z) for dx in (-3, 3) for dy in (-2.8, 2.8) for z in (0, 4.0)], cols)
    # the pelvis and the back, arching forward over the field, bowed
    faces |= _lump(m, [(x, y, z) for x in (-33, -24) for y in (-6.5, 6.5) for z in (13.2, 18.2)], cols)
    back = []
    for x, z0, z1, w in ((-24, 13.8, 18.6, 6.6), (-12, 14.0, 19.8, 7.6), (0, 14.0, 20.0, 8.0), (9, 13.8, 19.2, 7.6), (14, 13.6, 17.8, 5.8)):
        for k in range(9):
            a = -math.pi / 2 + k * math.pi / 8
            if compact:
                back.append((x, math.sin(a) * w, z0 + max(0.0, math.cos(a)) * (z1 - z0)))
            else:
                back.append((x, max(-w, min(w, math.sin(a) * w * 1.3)), z0 + min(1.0, max(0.0, math.cos(a)) * 1.3) * (z1 - z0)))
        back.append((x, 0, z0 - 0.6))
    faces |= _lump(m, back, cols)
    # the bands or chevrons on its back, the hand painted big over them
    for k in range(5):
        x = -20 + k * 7.5
        m.box((1.0, 12.0 - abs(x + 4) * 0.15, 0.4), (x, 0, 19.8 - abs(x + 4) * 0.05), trim if (k % 2 == 0) == compact else cols[1], rot=(0, 0.08, 0))
    _hand_sign(m, (-5.0, 0, 20.3), 4.2, rot=0.0)
    # the head hung low past the shoulders
    hd = Vector((18.0, 0, 16.2))
    m.cyl(2.4, 4.0, (13.0, 0, 16.8), dark, segs=7, rot=(0, math.pi / 2 + 0.4, 0))
    if compact:
        st = mark(m)
        m.ball(1.0, tuple(hd), cols[2], subdiv=2, scale=(3.8, 4.0, 3.0))
        faces |= facet(m, new_faces(m, st), cols, noise=0.03)
        m.box((0.6, 4.4, 0.8), tuple(hd + Vector((3.2, 0, -0.8))), EYE, glow=True)
    else:
        faces |= _lump(m, [(hd.x + dx, dy, hd.z + dz) for dx in (-3.6, 3.6) for dy in (-3.2, 3.2) for dz in (-2.8, 2.8)], cols)
        for y in (-1.3, 0, 1.3):
            m.box((0.7, 0.8, 0.6), (hd.x + 3.65, y, hd.z - 0.4), EYE, glow=True)
    light(r, tuple(hd + Vector((4, 0, -3))), EYE, radius=12, intensity=1.0, flicker=0.3)
    # the arms, down from the shoulders to the fists planted in the ash
    for s in (-1, 1):
        sh = Vector((9.0, s * 9.4, 17.0))
        el = Vector((18.5, s * 11.0, 10.8))
        fist = Vector((26.0, s * 10.4, 3.0))
        st = mark(m)
        m.ball(3.8, tuple(sh), cols[2], subdiv=1, scale=(1.2, 1.0, 0.85))
        faces |= facet(m, new_faces(m, st), cols, noise=0.03)
        faces |= _seg(m, rng, sh, el, 2.8, 2.6, cols)
        faces |= _seg(m, rng, el, fist, 2.6, 2.4, cols)
        m.ball(3.0, tuple(el), dark, subdiv=1)
        faces |= _lump(m, [(fist.x + dx, fist.y + dy, z) for dx in (-3.2, 3.2) for dy in (-3.2, 3.2) for z in (0.0, 5.2)], cols)
        # where the arm crosses the flight line
        p = el.lerp(fist, (el.z - 10) / (el.z - fist.z))
        collider(r, p.x, p.y, 3.0)
        # ash heaped round the fist
        st = mark(m)
        m.ball(1.0, (fist.x, fist.y, 0.3), ASH[0], subdiv=1, scale=(5.6, 5.6, 2.0), jitter=0.5)
        facet(m, new_faces(m, st), ["#6e6a62", ASH[0], ASH[1]])
    # the clan round its knees: lean-tos, a fire's ring
    for s in (-1, 1):
        for k in range(3):
            m.box((2.4, 2.0, 1.6), (-40 + k * 3.0, s * 13.0, 0.8), TARP[(k + (s > 0)) % 4], rot=(0, 0, rng.uniform(-0.3, 0.3)))
    _ash(m, faces, 0.3)
    m.build(r)
    return r


def shed_plate(v):
    """Scenery: an armour plate a titan shed as it fell, lying half in the ash in its side's colours:
    v0/v2 the Compact's curved shells (one with its oxblood band), v1/v3 the Uukhvar's slabs (one
    chevroned)."""
    r = root("ashgrave_shed_plate", v)
    rng = random.Random(4600 + v)
    m = Model(f"ashgrave_shed_plate_{v}", 4600 + v)
    cols, trim, dark = side(v)
    faces = set()
    if v % 2 == 0:
        w, d = (3.6, 2.8) if v == 0 else (2.6, 2.2)
        pts = []
        for j in range(7):
            a = -math.pi * 0.45 + j * math.pi * 0.9 / 6
            for dx in (-w / 2, w / 2):
                pts.append((dx, math.sin(a) * d, 0.2 + math.cos(a) * 1.0))
                pts.append((dx * 0.96, math.sin(a) * d * 0.94, math.cos(a) * 1.0 - 0.15))
        faces |= _lump(m, pts, cols)
        if v == 0:
            m.box((0.4, d * 1.7, 0.2), (w * 0.3, 0, 1.15), trim)
    else:
        w, d = (3.8, 2.6) if v == 1 else (2.8, 2.0)
        faces |= _plate(m, (w, d, 0.5), (0, 0, 0.35), (rng.uniform(-0.2, 0.2), rng.uniform(-0.25, 0.25), 0), cols, taper=0.9)
        if v == 3:
            for j in range(3):
                m.box((0.4, d * 0.8, 0.08), (-w * 0.25 + j * 0.7, 0, 0.64), trim if j % 2 == 0 else cols[0], rot=(0, 0, 0.5))
    # its bolts torn out, a heap of ash on its low side
    for k in range(3):
        m.box((0.3, 0.3, 0.3), (rng.uniform(-w / 2, w / 2), rng.uniform(-1, 1), 0.85 if v % 2 == 0 else 0.62), dark)
    st = mark(m)
    m.ball(1.0, (rng.uniform(-0.6, 0.6), -d * 0.6, 0.0), ASH[0], subdiv=1, scale=(w * 0.5, 1.2, 0.5), jitter=0.15)
    facet(m, new_faces(m, st), ["#7a766e", ASH[0], ASH[1]])
    _ash(m, faces, 0.25)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def titan_shell(v):
    """Scenery: a titan gun's spent shell casings, brass gone brown, in the ash: v0 one lying, v1
    three standing where they were dropped, v2 two lying crossed."""
    r = root("ashgrave_titan_shell", v)
    rng = random.Random(4620 + v)
    m = Model(f"ashgrave_titan_shell_{v}", 4620 + v)
    BRASS = ["#4a3a26", "#6e5634", "#8e7444", "#ae9460"]

    def lying(x, y, a, L=4.2, rad=0.95):
        st = mark(m)
        c, sn = math.cos(a), math.sin(a)
        limb(m, (x - c * L / 2, y - sn * L / 2, rad * 0.8), (x + c * L / 2, y + sn * L / 2, rad * 0.8), rad, rad, BRASS[1], segs=8)
        limb(m, (x - c * L / 2, y - sn * L / 2, rad * 0.8), (x - c * (L / 2 + 0.3), y - sn * (L / 2 + 0.3), rad * 0.8), rad * 1.15, rad * 1.15, BRASS[0], segs=8)
        facet(m, new_faces(m, st), BRASS, noise=0.04)
        m.cyl(rad * 0.7, 0.1, (x + c * (L / 2 + 0.02), y + sn * (L / 2 + 0.02), rad * 0.8), "#1a1410", segs=8, rot=(0, math.pi / 2, a))
    if v == 0:
        lying(0, 0, 0.3)
    elif v == 1:
        for x, y, h in ((0, 0, 2.8), (1.5, 0.7, 2.3), (-1.1, 1.2, 1.9)):
            st = mark(m)
            m.cyl(0.75, h, (x, y, -0.3), BRASS[1], segs=8)
            m.cyl(0.85, 0.3, (x, y, -0.3), BRASS[0], segs=8)
            facet(m, new_faces(m, st), BRASS, noise=0.04)
            m.cyl(0.55, 0.05, (x, y, h - 0.28), "#1a1410", segs=8)
    else:
        lying(0, -0.6, 0.2)
        lying(0.4, 0.8, 1.1, L=3.6, rad=0.85)
    st = mark(m)
    m.ball(1.0, (0, 0, -0.1), ASH[0], subdiv=1, scale=(2.6, 2.2, 0.35), jitter=0.15)
    facet(m, new_faces(m, st), ["#7a766e", ASH[0], ASH[1]])
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def build():
    for v in range(6):
        titan_body(v)
    for v in range(4):
        titan_head(v)
        titan_arm(v)
        titan_leg(v)
        titan_hand(v)
    for v in range(2):
        titan_foot(v)
        titan_reach(v)
        titan_arm_up(v)
        titan_knee_up(v)
        titan_gun(v)
        lean_to(v)
        boundary_plate(v)
        kneel(v)
    for v in range(3):
        cable_spill(v)
        plate_stack(v)
        titan_shell(v)
    for v in range(4):
        shed_plate(v)
