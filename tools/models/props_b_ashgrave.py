"""ASHGRAVE, where the titans fell: an old war's graveyard. Mech heads and torsos sunk like hills,
arms clawing out of the ash, craters of green glass that still glow, scavenger camps round
barrel fires, and a dead forest bleached bone-white under a blue moon."""
from __future__ import annotations

import math
import random

from mathutils import Vector
from kit import Model, animate, emitter, light
from props_a_lib import hull, lump
from props_b_kit import (M, crystal, facet, flicker, jitter, limb, mark, new_faces, paint, path_tube, ring, root, xform)

# titan hull: weathered olive-grey armour, dark to light
HULL = ["#2a302c", "#3e4840", "#56625a", "#6e7c70", "#8c9a8c"]
HULL_DARK = "#23262a"
RUST = ["#5a3020", "#7a4428", "#9a5a32", "#b87a42"]
EYE = "#4aff8a"
EYE_PALE = "#c0ffd8"
WAR_RED = "#8a3428"                   # an old faction's paint, nearly gone
HAZARD = "#c8a03a"
DIRT = ["#3a322c", "#4a4038", "#5a5048", "#6a6058"]
STEEL = ["#4a4a50", "#6a6a70", "#8a8a8e"]
# glass craters
GLASS = ["#0c2418", "#16402a", "#24603e", ("#4aff8a", True)]
GLASS_TIP = ("#c0ffd8", True)
# the scav camps
TARP = ["#c8742e", "#7a7a3a", "#a8442e", "#3e6a8a", "#d8c8a0"]
TARP_DARK = "#2e2622"
FIRE = ["#ff4a14", "#ff8a24", "#ffd85a"]
# the white woods
BONE_WOOD = ["#8e887c", "#bab2a2", "#ddd6c6", "#f6f0e2"]
CHAR = "#34343c"
ASH = ["#8a8a92", "#a4a4ac"]
# the old war had two sides, and their titans still wear their colours: the Concord's ivory with
# oxblood, the Host's gunmetal with hazard yellow (neighbours in the graveyard read apart)
IVORY = ["#4e483e", "#72695a", "#968b76", "#bcb098", "#ddd3ba"]
OXBLOOD = "#7e2a22"
GUNMETAL = ["#22262e", "#323844", "#465060", "#5e6a7a", "#7c8a9c"]
HOST_YELLOW = "#d6a632"
ASHFALL = ["#4a4642", "#5e5a54", "#77726a", "#8e8a80"]
# the glass craters: glass gone dark as a bottle, lit only where it's cracked or thin
BOTTLE = ["#10301f", "#1a4630", "#286044", "#3a805c"]
SEAM = ("#48f088", True)
SEAM_PALE = ("#b8ffd4", True)
FUSED = ["#3a3628", "#5a5440", "#7e765a", "#a49a78"]   # sand crust baked round a fulgurite
# the woods
SNOW_ASH = ["#8e8a84", "#aca8a0", "#cac6bc", "#e8e4da"]
MOON = ("#7ad8ff", True)


def _mound(m, r, h, cols=DIRT, loc=(0, 0, -0.15), segs=9, sx=1.0, sy=1.0):
    st = mark(m)
    m.cyl(r, h, loc, cols[1], segs=segs, r_top=r * 0.55)
    xform(m, st, M(scale=(sx, sy, 1)))
    jitter(m, new_faces(m, st), 0.2)
    facet(m, new_faces(m, st), cols, noise=0.15)


def _rubble(m, rng, n, rad, cols, size=(0.4, 0.9)):
    for _ in range(n):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(rad * 0.6, rad)
        s = rng.uniform(*size)
        st = mark(m)
        m.box((s, s * rng.uniform(0.5, 1.2), s * 0.3), (0, 0, 0), rng.choice(cols))
        xform(m, st, M((math.cos(a) * d, math.sin(a) * d, s * 0.1),
                       (rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(0, 3))))


# --- the Titan Graveyard ------------------------------------------------------------------

def mech_wreck(v):
    """A titan sunk to its shoulders in the ash: a great head with one eye still lit (v0), or a
    headless torso, its reactor glowing green in its chest (v1)."""
    r = root("mech_wreck", v)
    rng = random.Random(300 + v)
    m = Model(f"mech_wreck_{v}", 300 + v)
    if v == 0:
        s0 = mark(m)
        st = mark(m)
        m.ball(3.0, (0, 0.4, 0.2), HULL[2], subdiv=1, scale=(0.95, 1.1, 0.8))      # the helmet dome
        m.box((4.6, 4.4, 2.6), (0, 0.2, -0.6), HULL[2], taper=0.9)             # the skull under it
        m.box((1.1, 5.6, 1.2), (0, 0.5, 2.3), HULL[3], taper=0.5)             # the crest
        m.box((4.4, 1.6, 3.0), (0, -2.5, -0.3), HULL[2], taper=0.8)           # the face plate
        m.box((2.4, 1.6, 1.6), (0, -3.2, -1.3), HULL[1], taper=0.7)           # the jaw grille
        for side in (-1, 1):
            m.cyl(1.25, 0.9, (side * 2.6, 0.2, -0.2), HULL[3], segs=7, rot=(0, side * math.pi / 2, 0))   # ear discs
            m.cyl(0.7, 1.0, (side * 2.6, 0.2, -0.2), HULL[1], segs=7, rot=(0, side * math.pi / 2, 0))
        facet(m, new_faces(m, st), HULL, noise=0.1)
        m.box((3.8, 0.5, 0.8), (0, -3.3, 0.35), HULL_DARK)                   # the visor slot
        m.cyl(0.7, 0.3, (1.0, -3.4, 0.35), EYE, segs=8, rot=(math.pi / 2, 0, 0), glow=True)
        m.cyl(0.32, 0.32, (1.0, -3.45, 0.35), EYE_PALE, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
        m.box((1.3, 0.4, 0.55), (-1.0, -3.45, 0.35), "#1a3a26")                # the dead eye
        for x in (-0.8, 0, 0.8):
            m.box((0.3, 0.3, 1.2), (x, -4.0, -1.3), HULL_DARK)                 # grille bars
        m.box((0.8, 4.8, 0.3), (1.4, 0.4, 2.0), WAR_RED, rot=(0, 0.35, 0))      # an old stripe over the dome
        m.box((1.8, 1.8, 0.6), (-1.3, 1.4, 1.7), RUST[1], rot=(0.25, -0.3, 0.3))   # a shell hole, rusted
        m.box((1.1, 1.1, 0.7), (-1.3, 1.4, 1.75), HULL_DARK, rot=(0.25, -0.3, 0.3))
        limb(m, (1.8, 1.8, 1.4), (2.6, 2.8, 3.8), 0.22, 0.14, STEEL[1], segs=5)   # a bent antenna
        limb(m, (2.6, 2.8, 3.8), (3.5, 3.2, 4.0), 0.14, 0.12, STEEL[1], segs=5)
        xform_head = M((0.2, 0.4, 1.1), (-0.5, 0.22, 0.35), (1.25, 1.25, 1.25))
        xform(m, s0, xform_head)
        _mound(m, 4.8, 1.5, sx=1.0, sy=0.95)
        _rubble(m, rng, 9, 4.4, HULL[1:4] + RUST[1:3])
        eye = xform_head @ Vector((1.0, -3.8, 0.35))
        light(r, tuple(eye), EYE, radius=7, intensity=1.0, flicker=0.35)
    elif v == 1:
        C = GUNMETAL
        s0 = mark(m)
        st = mark(m)
        m.box((6.4, 4.2, 4.4), (0, 0, 0.6), C[2], taper=0.82)               # the chest
        m.box((5.0, 1.2, 2.2), (0, -2.3, 1.6), C[2], taper=0.7)             # breastplate
        m.box((2.2, 2.4, 1.2), (0, 0.4, 3.2), C[1], taper=0.6)              # collar
        m.ball(2.3, (-4.0, 0.2, 2.2), C[2], subdiv=1, scale=(1.0, 1.1, 0.75))    # pauldron
        m.box((1.0, 3.6, 0.8), (-4.1, 0.2, 3.6), C[3], taper=0.5)           # its ridge
        limb(m, (-4.0, 0.2, 1.0), (-5.6, -0.8, -1.0), 1.4, 1.2, C[1], segs=6)   # the arm, gone into the ground
        for x in (-1.6, 1.6):
            limb(m, (x, 2.0, 2.0), (x * 1.1, 3.0, 4.4), 0.55, 0.5, C[1], segs=6)   # exhaust stacks
        facet(m, new_faces(m, st), C, noise=0.1)
        for x in (-1.76, 1.76):
            m.cyl(0.38, 0.1, (x, 3.05, 4.4), HULL_DARK, segs=6)
        # the other shoulder torn off: its frame sticking out, rusted
        for a, b in (((3.0, -1.0, 2.2), (5.0, -0.6, 3.2)), ((3.0, 1.0, 2.0), (4.6, 1.8, 3.6)),
                     ((3.0, 0.0, 1.0), (5.2, 0.6, 0.6)), ((4.6, 1.8, 3.6), (5.0, -0.6, 3.2))):
            limb(m, a, b, 0.32, 0.26, RUST[2], segs=4)
        m.box((0.9, 3.0, 2.6), (3.2, 0, 1.6), RUST[1])
        m.cyl(0.8, 0.5, (0, 0.4, 3.75), HULL_DARK, segs=6)                    # the neck stump
        for k in range(4):
            a = k * math.pi / 2 + 0.4
            limb(m, (math.cos(a) * 0.4, 0.4 + math.sin(a) * 0.4, 4.1),
                 (math.cos(a) * 1.4, 0.4 + math.sin(a) * 1.3, 4.0 + rng.uniform(-0.6, 0.2)), 0.18, 0.14, "#1e1e22", segs=4)
        # the reactor, still awake
        m.cyl(1.25, 0.5, (0, -2.75, 1.8), HULL_DARK, segs=8, rot=(math.pi / 2 - 0.5, 0, 0))
        m.cyl(0.95, 0.56, (0, -2.75, 1.8), EYE, segs=8, rot=(math.pi / 2 - 0.5, 0, 0), glow=True)
        m.cyl(0.45, 0.62, (0, -2.75, 1.8), EYE_PALE, segs=6, rot=(math.pi / 2 - 0.5, 0, 0), glow=True)
        m.box((2.2, 0.35, 0.35), (-1.6, -2.6, 3.1), HOST_YELLOW, rot=(0.6, 0, 0))
        tilt = M((0, 0, 0.2), (-0.28, 0.12, 0))
        xform(m, s0, tilt)
        _mound(m, 4.6, 1.4, sx=1.1, sy=0.85)
        _rubble(m, rng, 10, 4.6, C[1:4] + RUST[1:3])
        light(r, tuple(tilt @ Vector((0, -3.3, 1.9))), EYE, radius=8, intensity=1.1, flicker=0.15)
    else:
        # a Concord helm rolled onto its back, the face turned to the sky, both eyes dark; a crew
        # hatch in its brow blown open
        C = IVORY
        s0 = mark(m)
        st = mark(m)
        m.ball(2.6, (0, 0.6, 0), C[2], subdiv=1, scale=(1.0, 1.15, 0.85))          # the dome, lying back
        m.box((4.2, 3.6, 2.2), (0, -0.9, 0.9), C[2], taper=0.85)                 # the face, looking up
        m.box((3.4, 2.0, 1.0), (0, -2.6, 1.0), C[1], taper=0.7)                  # the chin
        m.box((1.0, 5.4, 1.1), (0, 0.8, 2.15), C[3], rot=(0.25, 0, 0), taper=0.5)   # the crest, over the brow
        for side in (-1, 1):
            m.box((1.1, 2.6, 2.4), (side * 2.4, -0.6, 0.6), C[3], taper=0.7)        # cheek guards
        facet(m, new_faces(m, st), C, noise=0.1)
        m.box((3.2, 0.9, 0.3), (0, -1.0, 2.05), "#1c1a18")                      # the visor
        for x in (-0.85, 0.85):
            m.cyl(0.42, 0.12, (x, -1.0, 2.22), "#3a2a22", segs=7)                 # its dead eyes
        for x in (-0.9, 0, 0.9):
            m.box((0.3, 1.2, 0.3), (x, -2.6, 1.55), "#2a2622")                   # the breather grille
        m.box((0.7, 3.8, 0.24), (-1.3, 0.2, 2.15), OXBLOOD, rot=(0.15, -0.3, 0))   # old paint down one side
        m.cyl(0.9, 0.3, (1.2, 1.4, 1.95), "#1c1a18", segs=7, rot=(0.3, 0.3, 0))     # the blown hatch
        st = mark(m)
        m.box((1.4, 1.4, 0.24), (2.3, 2.2, 2.4), C[3], rot=(0.9, 0.5, 0.4))         # its lid, hanging
        facet(m, new_faces(m, st), C, noise=0.1)
        xform(m, s0, M((0, 0, 0.6), (0.1, 0.12, 0.2), (1.1, 1.1, 1.1)))
        _mound(m, 4.4, 1.2, sx=1.05, sy=1.0)
        _rubble(m, rng, 8, 4.4, C[1:4] + RUST[1:3] + [OXBLOOD])
    m.build(r)
    return r


def _finger(m, base, segs, r, color, curl=0.35, spread=0.0, axis=(0, 0, 1)):
    """A finger: a chain of segments curling towards -y, from base."""
    p = Vector(base)
    d = Vector(axis).normalized()
    ang = 0.0
    for i, L in enumerate(segs):
        ang += curl
        dd = Vector((d.x + spread, d.y - math.sin(ang) * 1.2, d.z * math.cos(ang))).normalized()
        q = p + dd * L
        limb(m, p, q, r, r * 0.85, color, segs=5)
        m.ball(r * 1.05, tuple(q), HULL_DARK if i < len(segs) - 1 else color, subdiv=0)
        p = q
        r *= 0.85
    return p


def mech_arm(v):
    """A titan's arm out of the ground. v0: the forearm reaching for the sky, hand open, one finger
    that still twitches. v1: the arm arched over like a bridge, its hand flat on the ash."""
    r = root("mech_arm", v)
    rng = random.Random(320 + v)
    m = Model(f"mech_arm_{v}", 320 + v)
    if v == 0:
        tilt = M((0, 0.6, 0), (0.5, 0, 0.2))                 # lean towards the camera, palm up
        st = mark(m)
        limb(m, (0, 0, -1.2), (0, 0, 3.8), 1.05, 0.85, HULL[2], segs=7)      # forearm
        m.box((1.0, 1.5, 3.4), (0, 0.85, 1.6), HULL[3], taper=0.7)          # a plate down its back
        m.ball(0.85, (0, 0, 3.9), HULL_DARK, subdiv=1)                       # wrist
        m.box((2.3, 1.0, 1.9), (0, 0, 5.0), HULL[2], taper=0.9)             # palm
        for x, h in ((-0.82, (1.0, 0.8, 0.6)), (0.82, (0.9, 0.7, 0.5))):
            _finger(m, (x, 0, 5.95), h, 0.33, HULL[3], curl=0.32, spread=x * 0.15)
        _finger(m, (-1.2, -0.2, 4.6), (0.8, 0.7), 0.36, HULL[3], curl=0.25, axis=(-1, -0.3, 0.8))   # thumb
        for x in (-0.55, 0.55):                                              # hydraulics
            limb(m, (x * 1.6, -0.9, -0.5), (x * 1.3, -0.75, 3.3), 0.24, 0.24, STEEL[2], segs=5)
        facet(m, new_faces(m, st), HULL, noise=0.1)
        m.cyl(0.5, 0.3, (0, -1.0, 3.9), EYE, segs=6, rot=(math.pi / 2, 0, 0), glow=True)   # a lit joint
        xform(m, st, tilt)
        _mound(m, 2.8, 0.9, sx=1.2)
        _rubble(m, rng, 6, 3.2, DIRT[1:] + RUST[1:2])
        m.build(r)
        # the twitching finger, pivoted at its knuckle
        fm = Model(f"mech_arm_{v}_finger")
        s2 = mark(fm)
        _finger(fm, (0, 0, 0), (1.1, 0.9, 0.7), 0.34, HULL[3], curl=0.3)
        facet(fm, new_faces(fm, s2), HULL, noise=0.1)
        knuckle = tilt @ Vector((-0.27, 0, 5.95))
        o = fm.build(r, loc=tuple(knuckle))
        o.rotation_euler = tilt.to_euler()
        animate(o, "mech_arm_0_twitch_idle", "rotation_euler",
                [(0, 0), (2.2, 0), (2.32, (0.35, 0, 0)), (2.45, (0.1, 0, 0)), (2.55, (0.3, 0, 0)), (2.9, 0), (4.0, 0)])
        light(r, tuple(tilt @ Vector((0, -1.2, 3.9))), EYE, radius=5, intensity=0.7, flicker=0.5)
        return r
    # v1: an arm arched over, hand flat on the ground
    st = mark(m)
    sh, el, wr = Vector((-4.2, 0, -0.6)), Vector((-1.4, 0.3, 4.6)), Vector((2.0, 0, 1.0))
    limb(m, sh, el, 1.25, 1.05, HULL[2], segs=7)
    limb(m, el, wr, 1.0, 0.85, HULL[2], segs=7)
    m.ball(1.25, tuple(el), HULL_DARK, subdiv=1)
    m.box((1.2, 1.4, 2.8), tuple((el + wr) / 2 + Vector((0, 0, 0.9))), HULL[3], rot=(0, 0.95, 0), taper=0.7)
    m.ball(0.8, tuple(wr), HULL_DARK, subdiv=1)
    # the hand: palm down, fingers splayed forward and pressing into the ash
    m.box((1.8, 2.2, 0.9), (3.0, 0, 0.55), HULL[2], rot=(0, 0.25, 0))
    for k, y in enumerate((-0.8, -0.27, 0.27, 0.8)):
        p = Vector((3.8, y, 0.5))
        L = (1.1, 0.9, 0.7) if k in (1, 2) else (0.9, 0.7, 0.6)
        d = Vector((1, y * 0.35, 0.1)).normalized()
        for i, l in enumerate(L):
            q = p + d * l
            limb(m, p, q, 0.32 * 0.88 ** i, 0.28 * 0.88 ** i, HULL[3], segs=5)
            m.ball(0.3 * 0.88 ** i, tuple(q), HULL_DARK, subdiv=0)
            p = q
            d = Vector((d.x, d.y, d.z - 0.45)).normalized()
    limb(m, (2.6, -1.0, 0.6), (3.1, -2.0, 0.3), 0.36, 0.32, HULL[3], segs=5)          # thumb
    limb(m, (3.1, -2.0, 0.3), (3.8, -2.4, 0.1), 0.32, 0.28, HULL[3], segs=5)
    for a, b in (((-3.6, -1.0, 0.4), (-1.6, -0.8, 4.0)), ((-1.0, -0.8, 4.0), (1.6, -0.7, 1.4))):
        limb(m, a, b, 0.24, 0.24, STEEL[2], segs=5)
    facet(m, new_faces(m, st), HULL, noise=0.1)
    m.box((2.0, 0.3, 0.3), (-2.8, -1.15, 2.2), WAR_RED, rot=(0, -1.0, 0))
    m.cyl(0.55, 0.3, (-1.4, -1.25, 4.6), EYE, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    _mound(m, 2.2, 0.9, loc=(-4.0, 0, -0.2))
    _mound(m, 1.8, 0.5, loc=(4.3, 0, -0.2))
    _rubble(m, rng, 6, 4.0, DIRT[1:])
    m.build(r)
    light(r, (-1.4, -1.6, 4.6), EYE, radius=5, intensity=0.7, flicker=0.5)
    return r


def scrap_pile(v):
    r = root("scrap_pile", v)
    rng = random.Random(340 + v)
    m = Model(f"scrap_pile_{v}", 340 + v)
    if v == 0:
        _mound(m, 2.2, 0.9, cols=RUST[:2] + DIRT[2:], segs=8)
        for _ in range(8):                                               # armour plates
            st = mark(m)
            m.box((rng.uniform(1.0, 1.6), rng.uniform(0.7, 1.1), 0.18), (0, 0, 0), rng.choice(HULL[2:] + RUST[1:] + [HAZARD]))
            a, d = rng.uniform(0, math.tau), rng.uniform(0, 1.6)
            xform(m, st, M((math.cos(a) * d, math.sin(a) * d, 0.9 - d * 0.4),
                           (rng.uniform(-0.7, 0.7), rng.uniform(-0.7, 0.7), rng.uniform(0, 3))))
        for _ in range(3):                                               # girders
            a = rng.uniform(0, math.tau)
            limb(m, (math.cos(a) * 1.8, math.sin(a) * 1.8, 0), (math.cos(a + 2.4) * 0.6, math.sin(a + 2.4) * 0.6, 1.9),
                 0.18, 0.18, RUST[2], segs=4)
        m.cyl(0.6, 0.35, (1.6, -1.0, 0.6), "#2a2a2e", segs=8, rot=(1.2, 0, 0.4))   # a wheel
        m.cyl(0.3, 0.38, (1.6, -1.0, 0.6), STEEL[1], segs=6, rot=(1.2, 0, 0.4))
    elif v == 1:
        # barrels and crates, half sorted
        _mound(m, 2.0, 0.3, segs=8)
        cols = [RUST[2], "#3e6a6a", HAZARD, RUST[1], "#6a3a3a"]
        for i, (x, y) in enumerate(((-0.9, 0.4), (-0.1, 0.6), (0.7, 0.3), (-0.5, -0.4), (0.4, -0.5))):
            m.cyl(0.42, 1.0, (x, y, 0.1), cols[i], segs=8)
            m.cyl(0.32, 0.04, (x, y, 1.1), "#2a2622", segs=8)
            m.cyl(0.44, 0.1, (x, y, 0.55), "#2a2622", segs=8)
        m.cyl(0.42, 1.0, (1.8, -0.6, 0.42), cols[0], segs=8, rot=(math.pi / 2, 0, 1.0))   # one rolled away
        for i, (x, y, s) in enumerate(((-1.8, -0.6, 0.9), (-1.7, 0.7, 0.8), (-1.75, 0.05, 0.6))):
            st = mark(m)
            m.box((s, s, s), (0, 0, 0), "#7a6a4a")
            m.box((s * 1.02, s * 0.25, s * 1.02), (0, 0, 0), "#5a4a34")
            xform(m, st, M((x, y, s / 2 + (0.9 if i == 2 else 0)), (0, 0, rng.uniform(-0.3, 0.3))))
    else:
        # a wing torn off some gunship, nose-down in the dirt, its nacelle cold
        _mound(m, 2.0, 0.6, segs=8, loc=(-1.5, 0, -0.15))
        st = mark(m)
        m.prism([(-3.0, -0.12), (2.0, -0.12), (2.6, 0.12), (-2.8, 0.12)], 1.9, (0, 0, 0), HULL[3])
        m.box((4.0, 0.6, 0.3), (0.0, -0.6, 0.18), WAR_RED)
        m.box((1.0, 1.0, 0.3), (1.4, 0.3, 0.18), HAZARD)
        m.cyl(0.65, 2.4, (0.6, 1.0, -0.1), HULL[2], segs=7, rot=(-math.pi / 2, 0, 0))
        m.cyl(0.45, 0.2, (0.6, 3.4, -0.1), "#1e1e22", segs=7, rot=(-math.pi / 2, 0, 0))
        facet(m, new_faces(m, st), HULL, noise=0.1)
        xform(m, st, M((0.4, 0, 1.0), (0.15, 0.35, 0.3)))
        _rubble(m, rng, 5, 2.6, RUST[1:] + HULL[2:4])
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


# --- the Glass Craters -------------------------------------------------------------------

def glass_shard(v):
    """Spikes of glass where the big guns hit, thrown up as it cooled: dark as a bottle, lit only at
    their tips and in the crack they burst from."""
    r = root("glass_shard", v)
    rng = random.Random(360 + v)
    m = Model(f"glass_shard_{v}", 360 + v)
    st = mark(m)
    m.cyl(2.0 if v != 1 else 1.6, 0.16, (0, 0, -0.04), BOTTLE[1], segs=9)
    jitter(m, new_faces(m, st), 0.2, z=False)
    facet(m, new_faces(m, st), BOTTLE, noise=0.1)
    shards = []
    if v == 0:
        # a burst: a crown of blades leaning out
        for k in range(6):
            a = k / 6 * math.tau + rng.uniform(-0.3, 0.3)
            t = rng.uniform(0.25, 0.6)
            shards.append(((math.cos(a) * 0.3, math.sin(a) * 0.3, -0.2), (math.cos(a) * math.sin(t), math.sin(a) * math.sin(t), math.cos(t)),
                           rng.uniform(0.38, 0.55), rng.uniform(1.6, 2.8)))
        m.cyl(0.7, 0.2, (0, 0, -0.02), SEAM[0], segs=6, glow=True)
    elif v == 1:
        # one great blade, cracked off and leaning, two small ones at its foot
        shards.append(((0, 0, -0.3), (0.45, -0.25, 1), 0.75, 3.4))
        for k in range(2):
            a = k * 2.6 + 0.9
            shards.append(((math.cos(a) * 0.8, math.sin(a) * 0.8, -0.2), (math.cos(a) * 0.7, math.sin(a) * 0.7, 1), 0.38, rng.uniform(0.9, 1.4)))
        for k in range(3):                                           # cracks running out from its foot
            a = rng.uniform(0, math.tau)
            m.box((1.5, 0.28, 0.1), (math.cos(a) * 1.0, math.sin(a) * 1.0, 0.08), SEAM[0], rot=(0, 0, a), glow=True)
    else:
        # a ring of short teeth round a pool that glows
        for k in range(8):
            a = k / 8 * math.tau + rng.uniform(-0.15, 0.15)
            shards.append(((math.cos(a) * 1.5, math.sin(a) * 1.5, -0.2), (math.cos(a) * 0.6, math.sin(a) * 0.6, 1),
                           rng.uniform(0.32, 0.45), rng.uniform(0.8, 1.9)))
        m.cyl(1.15, 0.2, (0, 0, -0.02), "#1e8a4e", segs=9, glow=True)
        m.cyl(0.55, 0.22, (0.15, -0.1, -0.02), SEAM[0], segs=7, glow=True)
    for base, d, rad, L in shards:
        s2 = mark(m)
        crystal(m, base, d, rad, L, rad * 2.4, BOTTLE[0], segs=4, twist=rng.uniform(0, 1))
        facet(m, new_faces(m, s2), BOTTLE, noise=0.2, bias=0.05)
        dd = Vector(d).normalized()
        tip = Vector(base) + dd * (L + rad * 0.9)
        crystal(m, tuple(tip), d, rad * 0.62, 0.05, rad * 1.5, SEAM[0], segs=4, glow=True)   # a lit tip
    m.build(r, rot_z=rng.uniform(0, math.tau))
    light(r, (0, 0, 1.2), EYE, radius=5, intensity=0.5, halo=False)
    return r


# --- the Scav Camp -----------------------------------------------------------------------

def scav_tent(v):
    r = root("scav_tent", v)
    rng = random.Random(380 + v)
    m = Model(f"scav_tent_{v}", 380 + v)
    if v == 0:
        # an A-frame of patched tarps, a ridge pole, crates by the door, a lamp
        m.gable((3.6, 2.8, 1.9), (0, 0, 0), TARP[0], overhang=0.15, thick=0.16)
        m.gable((1.1, 2.86, 1.94), (0.7, 0, 0.02), TARP[1], overhang=0.17, thick=0.16)   # a patch
        m.gable((0.7, 2.86, 1.94), (-1.1, 0, 0.02), TARP[4], overhang=0.17, thick=0.16)
        for x in (-1.8, 1.8):
            m.prism([(-1.4, 0), (1.4, 0), (0, 1.85)], 0.1, (x, 0, 0), TARP_DARK, rot=(0, 0, math.pi / 2))
        m.prism([(-0.6, 0), (0.6, 0), (0, 1.3)], 0.12, (1.86, 0, 0), "#1a1614", rot=(0, 0, math.pi / 2))
        limb(m, (-2.3, 0, 2.05), (2.3, 0, 2.05), 0.1, 0.1, "#5a4a3a", segs=4)
        for y, s in ((-0.9, 0.7), (-1.6, 0.55)):
            m.box((s, s, s), (2.6, y, s / 2), "#7a6a4a", rot=(0, 0, 0.3))
        m.ball(0.22, (2.25, 0.9, 1.5), "#ffd06a", subdiv=0, glow=True)
        light(r, (2.4, 0.9, 1.5), "#ffb050", radius=5, intensity=0.8, flicker=0.2)
    elif v == 1:
        # a lean-to: a corrugated roof against a wall of armour scrap
        for i, x in enumerate((-1.6, -0.5, 0.6, 1.6)):
            st = mark(m)
            m.box((1.15, 0.3, 2.4 + 0.3 * (i % 2)), (0, 0, 0), [HULL[3], RUST[2], HULL[2], RUST[1]][i])
            xform(m, st, M((x, 1.3, 1.1), (rng.uniform(-0.1, 0.1), 0, rng.uniform(-0.1, 0.1))))
        st = mark(m)
        for i in range(8):
            m.box((0.46, 2.8, 0.12 if i % 2 else 0.2), (-1.75 + i * 0.5, 0, 0), TARP[3] if i % 2 else "#4e7a9a")
        xform(m, st, M((0, 0.0, 1.8), (-0.35, 0, 0)))
        for x in (-1.8, 1.8):
            limb(m, (x, -1.3, 0), (x, -1.3, 1.35), 0.1, 0.1, "#5a4a3a", segs=4)
        for x, c in ((-0.9, TARP[0]), (0.3, TARP[1])):
            m.cyl(0.3, 1.6, (x, 0.6, 0.3), c, segs=6, rot=(math.pi / 2, 0, 0))
        m.box((0.7, 0.7, 0.7), (1.2, -0.3, 0.35), "#7a6a4a")
        m.cyl(0.25, 0.25, (1.2, -0.3, 0.7), "#ffd06a", segs=6, glow=True)
        light(r, (1.2, -0.3, 1.1), "#ffb050", radius=4, intensity=0.7, flicker=0.2)
    else:
        # a round tent like a yurt, panels of every tarp in camp, a radio mast with a red light
        m.cyl(1.9, 1.2, (0, 0, 0), TARP[4], segs=8)
        st = mark(m)
        m.cyl(2.2, 1.5, (0, 0, 1.2), TARP[0], segs=8, r_top=0.4)
        cols = [TARP[4], TARP[4], TARP[1], TARP[4], TARP[4], TARP[0], TARP[4], TARP[4]]   # felt, patched
        paint(m, new_faces(m, st), lambda f: cols[int((math.atan2(f.calc_center_median().y, f.calc_center_median().x) + math.pi) / math.tau * 8) % 8]
              if abs(f.normal.z) < 0.95 else "#1a1614")
        m.box((0.9, 0.2, 1.0), (0, -1.9, 0.5), TARP_DARK)
        limb(m, (1.6, 1.0, 0), (1.7, 1.1, 4.2), 0.12, 0.08, STEEL[1], segs=4)
        m.ball(0.22, (1.7, 1.1, 4.3), "#ff3a2a", subdiv=0, glow=True)
        emitter(r, (0, 0, 2.8), "smoke")
    m.build(r, rot_z=rng.uniform(-0.4, 0.4))
    return r


def bonfire(v):
    """A fire to gather round (v0) or a burning oil drum (v1). The flame licks (scale flicker)."""
    r = root("bonfire", v)
    rng = random.Random(400 + v)
    m = Model(f"bonfire_{v}", 400 + v)
    if v == 0:
        m.cyl(1.1, 0.06, (0, 0, 0), "#1e1a1a", segs=8)
        for k in range(9):
            a = k / 9 * math.tau + rng.uniform(-0.1, 0.1)
            st = mark(m)
            if k % 3 == 0:
                m.box((0.5, 0.35, 0.35), (0, 0, 0), RUST[2])
            else:
                m.ball(0.3, (0, 0, 0), DIRT[3], subdiv=0, scale=(1, 0.8, 0.7))
            xform(m, st, M((math.cos(a) * 1.15, math.sin(a) * 1.15, 0.15), (0, 0, a)))
        for t in (0.4, 2.5, 4.6):
            limb(m, (math.cos(t) * 0.9, math.sin(t) * 0.9, 0.05), (-math.cos(t) * 0.2, -math.sin(t) * 0.2, 0.75), 0.13, 0.1, "#2a2020", segs=5)
        for x, y, t in ((0, 2.0, 0.1), (-1.9, -0.6, 1.9)):
            m.cyl(0.25, 1.6, (x - math.cos(t) * 0.8, y - math.sin(t) * 0.8, 0.25), "#5a4636", segs=6, rot=(0, math.pi / 2, t))
        m.box((0.7, 0.7, 0.6), (1.6, -1.2, 0.3), RUST[1], rot=(0, 0, 0.5))
        fz, fs = 0.05, 1.0
    else:
        m.cyl(0.6, 1.2, (0, 0, 0), RUST[2], segs=8)
        m.cyl(0.62, 0.14, (0, 0, 0.35), RUST[0], segs=8)
        m.cyl(0.62, 0.14, (0, 0, 0.85), RUST[0], segs=8)
        m.cyl(0.5, 0.05, (0, 0, 1.2), "#1a1210", segs=8)
        for k in range(4):                                          # holes punched in the side, glowing
            a = k / 4 * math.tau + 0.4
            m.box((0.12, 0.25, 0.25), (math.cos(a) * 0.58, math.sin(a) * 0.58, 0.25), FIRE[1], rot=(0, 0, a), glow=True)
        m.box((0.7, 0.7, 0.55), (1.1, 0.4, 0.27), "#7a6a4a", rot=(0, 0, 0.4))
        m.cyl(0.35, 0.9, (-0.6, -1.0, 0.35), "#3e6a6a", segs=7, rot=(math.pi / 2, 0, 0.8))
        fz, fs = 1.2, 0.8
    m.build(r)
    f = Model(f"bonfire_{v}_flame")
    f.cyl(0.75 * fs, 1.4 * fs, (0, 0, 0), FIRE[0], segs=6, r_top=0.05, glow=True)
    f.cyl(0.52 * fs, 1.15 * fs, (0.06, -0.05, 0), FIRE[1], segs=5, r_top=0.04, glow=True, rot=(0, 0, 0.5))
    f.cyl(0.3 * fs, 0.8 * fs, (-0.05, 0.04, 0), FIRE[2], segs=5, r_top=0.03, glow=True)
    o = f.build(r, loc=(0, 0, fz))
    flicker(o, f"bonfire_{v}_flicker_idle", amp=0.22, seed=v, period=1.2)
    light(r, (0, 0, fz + 1.0), FIRE[1], radius=8, intensity=1.4, flicker=0.6)
    emitter(r, (0, 0, fz + 1.2), "embers")
    return r


# --- the Bone-White Woods ----------------------------------------------------------------

def _bough(m, rng, a, d, length, rad, depth, spread=(0.4, 0.7), n=(2, 3), up=0.3):
    """A chunky dead bough that forks, knuckled at the joints; nothing thinner than reads."""
    b = a + d * length
    r1 = max(rad * 0.72, 0.2)
    limb(m, a, b, rad, r1, BONE_WOOD[2], segs=5 if rad > 0.2 else 4)
    if depth <= 0 or r1 < 0.24:
        # a snapped tip, or a short tine
        return
    m.ball(r1 * 1.12, tuple(b), BONE_WOOD[2], subdiv=0)
    k = rng.choice(n) if isinstance(n, tuple) else n
    yaw0 = rng.uniform(0, math.tau)
    for i in range(k):
        yaw = yaw0 + i * math.tau / k + rng.uniform(-0.4, 0.4)
        bend = rng.uniform(*spread)
        side = Vector((math.cos(yaw), math.sin(yaw), 0))
        nd = d * math.cos(bend) + side * math.sin(bend)
        nd.z += up
        nd.normalize()
        _bough(m, rng, b, nd, length * rng.uniform(0.55, 0.75), r1, depth - 1, spread, n, up)


def _ash_foot(m, rng, r=1.2):
    """Charred at the foot, roots flaring into a drift of ash."""
    m.cyl(r * 0.5, 0.75, (0, 0, -0.1), CHAR, segs=6, r_top=r * 0.36)
    for k in range(4):
        a = k * math.tau / 4 + rng.uniform(0, 0.8)
        limb(m, (0, 0, 0.3), (math.cos(a) * r, math.sin(a) * r, -0.1), 0.26, 0.14, CHAR, segs=4)
    st = mark(m)
    m.ball(r * 1.15, (0.2, 0.1, -0.4), ASH[0], subdiv=1, scale=(1.3, 1.0, 0.4), jitter=0.12)
    facet(m, new_faces(m, st), SNOW_ASH, noise=0.1)


def white_tree(v):
    """A dead tree, bleached bone-white, charred at the foot, ash lying on its boughs like snow.
    v0: a candelabra, three great boughs turned up. v1: a leaner, its crown swept one way like
    antlers. v2: a snag snapped off, its top lying beside it. v3: twin trunks forking from one foot,
    a shelf of moon fungus in the crotch."""
    r = root("white_tree", v)
    rng = random.Random(420 + v)
    m = Model(f"white_tree_{v}", 420 + v)
    st = mark(m)
    glow = None
    if v == 0:
        # a candelabra: three great boughs turned up, each ending in a knuckle and two short tines
        limb(m, (0, 0, -0.2), (0.1, 0, 2.0), 0.72, 0.58, BONE_WOOD[2], segs=6)
        m.ball(0.66, (0.1, 0, 2.0), BONE_WOOD[2], subdiv=0)
        for k in range(3):
            a = k / 3 * math.tau + rng.uniform(-0.3, 0.3)
            d = Vector((math.cos(a) * 0.85, math.sin(a) * 0.85, 0.55)).normalized()
            p = Vector((0.1, 0, 2.0)) + d * 1.5
            limb(m, (0.1, 0, 2.0), tuple(p), 0.52, 0.44, BONE_WOOD[2], segs=5)
            m.ball(0.48, tuple(p), BONE_WOOD[2], subdiv=0)
            _bough(m, rng, p, Vector((d.x * 0.3, d.y * 0.3, 1)).normalized(), 1.5, 0.42, 1, spread=(0.35, 0.6), n=2, up=0.5)
    elif v == 1:
        # a leaner, its crown swept one way like antlers
        lean = Vector((0.45, -0.1, 1)).normalized()
        limb(m, (0, 0, -0.2), tuple(lean * 2.8), 0.66, 0.5, BONE_WOOD[2], segs=6)
        top = lean * 2.8
        m.ball(0.55, tuple(top), BONE_WOOD[2], subdiv=0)
        for k, yaw in enumerate((-0.6, 0.1, 0.8)):
            d = Vector((math.cos(yaw), math.sin(yaw), 0.35 + 0.2 * k)).normalized()
            _bough(m, rng, top, d, 1.8 - 0.25 * k, 0.44, 1, spread=(0.4, 0.6), n=2, up=0.3)
        _bough(m, rng, lean * 1.5, Vector((-0.8, 0.3, 0.5)).normalized(), 1.3, 0.36, 0)
    elif v == 2:
        limb(m, (0, 0, -0.2), (0.1, 0, 2.7), 0.68, 0.52, BONE_WOOD[2], segs=6)
        for k in range(4):                                         # the splintered top
            a = k * 1.6 + rng.uniform(0, 0.4)
            limb(m, (0.1 + math.cos(a) * 0.25, math.sin(a) * 0.25, 2.6), (0.1 + math.cos(a) * 0.4, math.sin(a) * 0.4, 3.1 + rng.uniform(0, 0.6)),
                 0.28, 0.1, BONE_WOOD[3], segs=4)
        _bough(m, rng, Vector((0.05, 0, 1.6)), Vector((-0.8, 0.3, 0.5)).normalized(), 1.4, 0.38, 1, n=2)
        limb(m, (0.8, -0.6, 0.35), (4.4, -1.8, 0.3), 0.52, 0.38, BONE_WOOD[2], segs=6)   # the top, fallen
        _bough(m, rng, Vector((3.0, -1.35, 0.35)), Vector((0.2, -0.8, 0.45)).normalized(), 1.2, 0.34, 0)
    else:
        # twin trunks forking from one foot
        for side in (-1, 1):
            d = Vector((side * 0.38, side * 0.1, 1)).normalized()
            L = 2.8 if side < 0 else 2.2
            limb(m, (0, 0, -0.2), tuple(d * L), 0.56, 0.42, BONE_WOOD[2], segs=6)
            m.ball(0.44, tuple(d * L), BONE_WOOD[2], subdiv=0)
            _bough(m, rng, d * L, Vector((d.x * 1.4, d.y, 0.8)).normalized(), 1.4, 0.38, 1, n=2, up=0.4)
        glow = (0, 0.0, 0.9)
    facet(m, new_faces(m, st), BONE_WOOD, noise=0.12)
    # ash lies on whatever faces up: lighten the tops a step
    for f in new_faces(m, st):
        f.normal_update()
        if f.normal.z > 0.75:
            f.material_index = m._slot(SNOW_ASH[3], False)
    if glow:
        for k, (dx, dz) in enumerate(((0.35, 0.0), (-0.3, 0.35))):
            m.cyl(0.42 - k * 0.08, 0.14, (glow[0] + dx, glow[1] - 0.3, glow[2] + dz), MOON[0], segs=6, glow=True)
        light(r, (0, -0.5, 1.0), MOON[0], radius=3.5, intensity=0.4, halo=False)
    _ash_foot(m, rng, 1.2)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def pale_spire(v):
    """The woods' second kind: a tall narrow snag, its boughs burnt to stubs that hang down in whorls,
    bark blackened in strips. v0: straight and tall. v1: forked near the top. v2: broken at half
    height, the stub crowned with moon fungus."""
    r = root("ashgrave_pale_spire", v)
    rng = random.Random(3300 + v)
    m = Model(f"ashgrave_pale_spire_{v}", 3300 + v)
    H = (6.4, 5.6, 3.4)[v]
    lean = Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), 1)).normalized()
    st = mark(m)
    top = lean * H
    limb(m, (0, 0, -0.2), tuple(lean * (H * 0.55)), 0.48, 0.34, BONE_WOOD[2], segs=6)
    limb(m, tuple(lean * (H * 0.55)), tuple(top), 0.34, 0.12 if v != 2 else 0.3, BONE_WOOD[2], segs=5)
    if v == 1:
        fk = lean * (H * 0.72)
        limb(m, tuple(fk), tuple(fk + Vector((0.8, 0.3, 1.6))), 0.24, 0.12, BONE_WOOD[2], segs=4)
    # whorls of hanging stubs
    nw = 4 if v != 2 else 2
    for w in range(nw):
        z = H * (0.3 + 0.6 * w / max(1, nw - 1)) if v != 2 else H * (0.45 + 0.35 * w)
        p = lean * z
        L = 1.4 * (1 - 0.55 * (z / H))
        for k in range(3):
            a = k / 3 * math.tau + w * 0.9 + rng.uniform(-0.3, 0.3)
            limb(m, tuple(p), tuple(p + Vector((math.cos(a) * L, math.sin(a) * L, -0.45 * L))), 0.18, 0.13, BONE_WOOD[2], segs=4)
    facet(m, new_faces(m, st), BONE_WOOD, noise=0.12)
    for k in range(2):                                     # burnt strips up one side
        z0 = rng.uniform(0.6, H * 0.4)
        m.box((0.2, 0.62, 1.6), tuple(lean * (z0 + 0.8) + Vector((0.32, 0, 0))), CHAR, rot=(0, 0.05, rng.uniform(-0.3, 0.3) + k * 2.6))
    if v == 2:
        m.cyl(0.3, 0.08, tuple(top), CHAR, segs=6)
        for k in range(3):
            a = k * 2.1 + 0.3
            m.cyl(0.42 - k * 0.07, 0.14, tuple(lean * (H - 0.5 - k * 0.6) + Vector((math.cos(a) * 0.35, math.sin(a) * 0.35, 0))), MOON[0], segs=6, glow=True)
        light(r, tuple(top), MOON[0], radius=3.5, intensity=0.45, halo=False)
    _ash_foot(m, rng, 1.0)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def fallen_log(v):
    """A trunk that came down, its root plate torn up on end (v0), or broken in two where it burnt
    through, the break still black (v1). Ash along its back."""
    r = root("ashgrave_fallen_log", v)
    rng = random.Random(3320 + v)
    m = Model(f"ashgrave_fallen_log_{v}", 3320 + v)
    st = mark(m)
    if v == 0:
        limb(m, (-2.6, 0, 0.45), (3.4, 0.3, 0.3), 0.5, 0.34, BONE_WOOD[2], segs=6)
        m.cyl(1.5, 0.5, (-2.9, 0, 0.9), BONE_WOOD[1], segs=7, rot=(0, math.pi / 2, 0))      # the root plate, on end
        for k in range(6):
            a = k / 6 * math.tau + rng.uniform(-0.2, 0.2)
            limb(m, (-3.1, 0, 0.9), (-3.4, math.cos(a) * 2.1, 0.9 + math.sin(a) * 1.7), 0.22, 0.12, BONE_WOOD[1], segs=4)
        _bough(m, rng, Vector((0.6, 0.15, 0.6)), Vector((0.2, -0.8, 0.5)).normalized(), 1.2, 0.24, 1, n=2, up=0.1)
        _bough(m, rng, Vector((1.8, 0.2, 0.5)), Vector((0.3, 0.9, 0.3)).normalized(), 1.0, 0.22, 0)
        facet(m, new_faces(m, st), BONE_WOOD, noise=0.12)
        m.cyl(1.55, 0.08, (-3.0, 0, 0.9), DIRT[1], segs=7, rot=(0, math.pi / 2, 0))
        m.cyl(1.3, 0.06, (-3.6, 0, -0.03), "#2a2a32", segs=7)                               # the hole it tore
    else:
        limb(m, (-3.2, -0.2, 0.35), (-0.3, 0, 0.45), 0.5, 0.45, BONE_WOOD[2], segs=6)
        limb(m, (0.4, 0.4, 0.4), (3.2, 1.2, 0.3), 0.44, 0.32, BONE_WOOD[2], segs=6)
        _bough(m, rng, Vector((2.0, 0.85, 0.5)), Vector((0.4, -0.7, 0.6)).normalized(), 1.1, 0.24, 1, n=2)
        facet(m, new_faces(m, st), BONE_WOOD, noise=0.12)
        for x, y in ((-0.3, 0.0), (0.4, 0.4)):
            m.ball(0.5, (x, y, 0.45), CHAR, subdiv=0, scale=(0.6, 1, 1))
        m.ball(0.2, (0.05, 0.2, 0.5), FIRE[0], subdiv=0, glow=True)
    for f in new_faces(m, st):
        f.normal_update()
        if f.normal.z > 0.75:
            f.material_index = m._slot(SNOW_ASH[3], False)
    s2 = mark(m)
    lump(m, rng, (0.4, -0.6, -0.2), (2.4, 0.8, 0.35), SNOW_ASH[1], n=10, flat=0.5)
    facet(m, new_faces(m, s2), SNOW_ASH, noise=0.1)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def ash_drift(v):
    """Ground cover: ash blown into drifts, pale as snow. v0: a long drift, burnt sticks poking out.
    v1: two mounds and a bleached root arching between. v2: a ring of ash round a burnt-out stump,
    a tuft of moon fungus in the hollow."""
    r = root("ashgrave_ash_drift", v)
    rng = random.Random(3340 + v)
    m = Model(f"ashgrave_ash_drift_{v}", 3340 + v)
    if v == 0:
        st = mark(m)
        lump(m, rng, (0, 0, -0.2), (2.8, 1.2, 0.6), SNOW_ASH[1], n=14, flat=0.5)
        lump(m, rng, (1.9, 0.6, -0.2), (1.2, 0.8, 0.45), SNOW_ASH[1], n=10, flat=0.5)
        facet(m, new_faces(m, st), SNOW_ASH, noise=0.1)
        for x, y, a in ((-1.0, 0.3, 0.5), (0.6, -0.4, -0.4), (1.8, 0.7, 0.2)):
            limb(m, (x, y, 0.1), (x + math.sin(a) * 0.5, y + 0.2, 0.9 + rng.uniform(0, 0.4)), 0.17, 0.12, CHAR, segs=4)
    elif v == 1:
        st = mark(m)
        lump(m, rng, (-1.6, 0, -0.2), (1.3, 1.0, 0.55), SNOW_ASH[1], n=10, flat=0.5)
        lump(m, rng, (1.6, 0.3, -0.2), (1.1, 0.9, 0.45), SNOW_ASH[1], n=10, flat=0.5)
        facet(m, new_faces(m, st), SNOW_ASH, noise=0.1)
        st = mark(m)
        path_tube(m, [(-1.4, 0, 0.2), (-0.6, 0.1, 1.0), (0.5, 0.2, 0.9), (1.4, 0.3, 0.2)], [0.3, 0.26, 0.24, 0.22], BONE_WOOD[2], segs=5)
        facet(m, new_faces(m, st), BONE_WOOD, noise=0.1)
    else:
        st = mark(m)
        m.cyl(2.0, 0.4, (0, 0, -0.1), SNOW_ASH[1], segs=9, r_top=1.2)
        jitter(m, new_faces(m, st), 0.15)
        facet(m, new_faces(m, st), SNOW_ASH, noise=0.1)
        st = mark(m)
        for k in range(6):                                                  # the stump's burnt-out rim
            a = k / 6 * math.tau + rng.uniform(-0.15, 0.15)
            m.box((0.45, 0.3, rng.uniform(0.5, 1.0)), (math.cos(a) * 0.6, math.sin(a) * 0.6, 0.4), CHAR, rot=(0, 0, a))
        m.cyl(0.55, 0.42, (0, 0, 0), "#1a1a22", segs=7)
        m.cyl(0.32, 0.12, (0.1, 0, 0.42), MOON[0], segs=6, glow=True)
        light(r, (0, 0, 0.8), MOON[0], radius=3, intensity=0.4, halo=False)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def hollow_giant(v):
    """The woods' hero: the burnt-out shell of a tree far older than the rest, open to the sky, the
    moon fungus that grows in the dark of it glowing up out of the hollow. v0: a broken ring of
    trunk, jagged. v1: split down one side, a great bough still standing off it."""
    r = root("ashgrave_hollow_giant", v)
    rng = random.Random(3360 + v)
    m = Model(f"ashgrave_hollow_giant_{v}", 3360 + v)
    R = 2.0
    n = 9
    st = mark(m)
    for k in range(n):
        if v == 1 and k in (0, 1):
            continue                                                     # the split
        a = k / n * math.tau
        h = rng.uniform(2.2, 4.8) if v == 0 else (4.8 - abs(k - 5) * 0.6) + rng.uniform(-0.3, 0.3)
        seg = 2 * R * math.tan(math.pi / n) + 0.1
        s2 = mark(m)
        m.box((0.6, seg, h), (0, 0, h / 2 - 0.2), BONE_WOOD[2], taper=0.8)
        xform(m, s2, M((math.cos(a) * R, math.sin(a) * R, 0), (0, rng.uniform(-0.06, 0.02), a)))
        if rng.random() < 0.5:
            m.box((0.66, seg * 0.7, 0.8), (math.cos(a) * R, math.sin(a) * R, h - 0.6), CHAR, rot=(0, 0, a))
    for k in range(6):                                                   # the roots
        a = k / 6 * math.tau + 0.3
        limb(m, (math.cos(a) * R, math.sin(a) * R, 0.6), (math.cos(a) * (R + 1.6), math.sin(a) * (R + 1.6), -0.1), 0.45, 0.2, BONE_WOOD[1], segs=5)
    if v == 1:
        _bough(m, rng, Vector((math.cos(4.2) * R, math.sin(4.2) * R, 3.6)), Vector((-0.6, -0.5, 0.6)).normalized(), 2.0, 0.4, 2, n=2, up=0.3)
    facet(m, new_faces(m, st), BONE_WOOD, noise=0.12)
    for f in new_faces(m, st):
        f.normal_update()
        if f.normal.z > 0.75:
            f.material_index = m._slot(SNOW_ASH[3], False)
    m.cyl(R - 0.25, 0.3, (0, 0, -0.1), "#141820", segs=9)                 # the dark inside
    for k in range(5):                                                   # fungus on the floor and up the walls
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.3, 1.2)
        m.cyl(rng.uniform(0.3, 0.5), 0.14, (math.cos(a) * d, math.sin(a) * d, 0.2 + (k % 2) * rng.uniform(0.5, 1.8)), MOON[0], segs=6, glow=True)
    m.cyl(0.5, 0.18, (0.1, 0.1, 0.2), "#d0f4ff", segs=6, glow=True)
    light(r, (0, 0, 1.5), MOON[0], radius=7, intensity=0.9, flicker=0.1)
    _ashbed(m, rng, R + 1.4, 1.0, 1.0, 0.5)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r

# --- the Titan Graveyard: the bits of them strewn between ---------------------------------

def _ashbed(m, rng, r, sx=1.0, sy=1.0, h=0.5, loc=(0, 0), n=12):
    """A low drift of ash a thing has sunk into."""
    st = mark(m)
    lump(m, rng, (loc[0], loc[1], -0.25), (r * sx, r * sy, h), ASHFALL[1], n=n, flat=0.5)
    facet(m, new_faces(m, st), ASHFALL, noise=0.12)


def _plates(m, rng, n, rad, cols, size=(0.5, 1.0), z=0.05):
    """Chunky armour flakes scattered round a wreck (none thinner than reads)."""
    for _ in range(n):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(rad * 0.55, rad)
        s = rng.uniform(*size)
        st = mark(m)
        m.box((s, s * rng.uniform(0.6, 1.1), 0.28), (0, 0, 0), rng.choice(cols))
        xform(m, st, M((math.cos(a) * d, math.sin(a) * d, z + s * 0.12),
                       (rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), rng.uniform(0, 3))))


def titan_leg(v):
    """A titan's leg, torn off at the hip and left where it fell. v0: a Concord boot still standing,
    snapped off at the shin, its rebar and pipes bristling. v1: a Host leg lying full length, knee
    bent, the foot tipped up on its heel. v2: a Concord knee breaking the ash, thigh and shin buried. v3: a Host foot
    left standing alone."""
    r = root("ashgrave_titan_leg", v)
    rng = random.Random(3000 + v)
    m = Model(f"ashgrave_titan_leg_{v}", 3000 + v)
    if v == 0:
        C = IVORY
        _ashbed(m, rng, 3.0, 1.0, 1.15, 0.6)
        st = mark(m)
        m.box((2.8, 3.4, 1.3), (0, 0.2, 0.55), C[2], taper=0.82)               # the foot
        m.box((2.6, 1.6, 1.0), (0, 2.3, 0.45), C[3], taper=0.6)                # the toe cap
        m.box((2.2, 1.4, 1.1), (0, -1.7, 0.6), C[1], taper=0.7)                # the heel
        m.ball(1.05, (0, -0.2, 1.6), C[1], subdiv=1, scale=(1.1, 1.0, 0.8))      # the ankle
        limb(m, (0, -0.25, 1.6), (0.15, -0.55, 3.6), 1.15, 1.0, C[2], segs=7)  # the shin
        m.box((1.9, 0.7, 2.2), (0.05, 0.55, 2.7), C[3], rot=(-0.15, 0, 0), taper=0.8)   # its greave
        facet(m, new_faces(m, st), C, noise=0.1)
        m.box((1.95, 0.72, 0.42), (0.05, 0.6, 2.3), OXBLOOD, rot=(-0.15, 0, 0))   # a band of old paint
        m.cyl(0.85, 0.2, (0.15, -0.55, 3.62), HULL_DARK, segs=7)                # the snapped end
        for k in range(5):                                                       # rebar and pipes
            a = k / 5 * math.tau + rng.uniform(-0.3, 0.3)
            b = (0.15 + math.cos(a) * 0.55, -0.55 + math.sin(a) * 0.55, 3.6)
            limb(m, b, (b[0] + math.cos(a) * 0.5, b[1] + math.sin(a) * 0.5, 3.6 + rng.uniform(0.6, 1.3)),
                 0.17, 0.12, rng.choice((RUST[2], RUST[1], "#1e1e22")), segs=4)
        st = mark(m)
        limb(m, (0.6, -0.6, 3.5), (2.2, -1.2, 1.6), 0.24, 0.2, "#1e1e22", segs=4)   # a cable hanging to the ash
        limb(m, (2.2, -1.2, 1.6), (2.9, -1.6, 0.1), 0.2, 0.2, "#1e1e22", segs=4)
        _plates(m, rng, 5, 3.4, C[1:4] + [OXBLOOD])
    elif v == 1:
        C = GUNMETAL
        _ashbed(m, rng, 2.2, 1.2, 1.0, 0.6, loc=(-4.0, 0))
        _ashbed(m, rng, 1.6, 1.0, 1.0, 0.4, loc=(4.2, 0))
        st = mark(m)
        hip, knee, ank = Vector((-4.2, 0.1, 0.6)), Vector((-0.6, 0.6, 1.5)), Vector((3.4, -0.2, 1.1))
        m.ball(1.4, tuple(hip), C[1], subdiv=1)
        limb(m, hip, knee, 1.35, 1.15, C[2], segs=7)                           # the thigh
        limb(m, knee, ank, 1.1, 0.9, C[2], segs=7)                             # the shin
        m.box((2.6, 1.8, 1.0), (-2.4, 0.35, 2.0), C[3], rot=(0, -0.22, 0), taper=0.75)   # thigh plate
        m.ball(1.2, tuple(knee), C[1], subdiv=1)
        m.box((1.6, 1.6, 0.9), tuple(knee + Vector((0.1, 0, 0.95))), C[3], taper=0.6)    # the knee cap
        m.box((1.0, 3.0, 3.6), (4.3, -0.2, 1.6), C[2], rot=(0, -0.25, 0), taper=0.8)    # the foot, on its heel
        m.box((1.2, 2.6, 0.9), (4.6, -0.2, 3.5), C[3], rot=(0, -0.25, 0), taper=0.7)
        facet(m, new_faces(m, st), C, noise=0.1)
        for k in range(3):                                                      # hazard chevrons on the knee
            m.box((0.38, 1.7, 0.2), (knee.x - 0.5 + k * 0.5, knee.y, knee.z + 1.42), HOST_YELLOW if k != 1 else "#1a1a1e")
        for y in (-0.9, 0.9):                                                   # the pistons
            limb(m, (-3.6, y, 1.3), (-0.9, y + 0.4, 2.2), 0.26, 0.26, STEEL[2], segs=5)
        m.box((0.5, 0.5, 0.3), (-2.4, -0.7, 2.4), RUST[1])
        m.cyl(0.42, 0.25, (-1.5, -0.8, 2.25), EYE, segs=6, glow=True)            # a joint motor, still lit
        _plates(m, rng, 6, 4.8, C[1:4] + [HOST_YELLOW])
        light(r, (-1.5, -0.8, 2.6), EYE, radius=4, intensity=0.5, flicker=0.5)
    elif v == 2:
        C = IVORY
        _ashbed(m, rng, 2.0, 1.1, 1.0, 0.5, loc=(-2.6, 0.2))
        _ashbed(m, rng, 1.8, 1.0, 1.1, 0.5, loc=(2.6, -0.3))
        st = mark(m)
        knee = Vector((0, 0, 2.6))
        limb(m, (-3.2, 0.3, -0.6), knee, 1.3, 1.1, C[2], segs=7)
        limb(m, knee, (3.0, -0.4, -0.6), 1.05, 0.95, C[2], segs=7)
        m.ball(1.15, tuple(knee), C[1], subdiv=1)
        m.box((1.7, 2.0, 1.1), (0.15, 0, 3.4), C[3], taper=0.55)                 # the knee cap
        m.box((2.4, 1.5, 0.8), (-1.7, 0.2, 2.3), C[3], rot=(0, -0.7, 0), taper=0.8)
        m.box((2.0, 1.3, 0.7), (1.6, -0.25, 2.1), C[3], rot=(0, 0.75, 0), taper=0.8)
        facet(m, new_faces(m, st), C, noise=0.1)
        m.box((0.5, 1.55, 0.3), (-1.75, 0.2, 2.72), OXBLOOD, rot=(0, -0.7, 0))
        limb(m, (-2.2, -1.0, 0.4), (-0.5, -1.0, 2.6), 0.24, 0.24, STEEL[2], segs=5)
        limb(m, (-0.5, -1.0, 2.6), (1.0, -0.9, 3.2), 0.22, 0.22, "#1e1e22", segs=4)
        _plates(m, rng, 5, 3.6, C[1:4] + RUST[1:3])
    else:
        # a Host foot, stamped down and left standing alone: three blunt toes, a heel spur, the
        # ankle socket open to the sky, the ash thrown up round it
        C = GUNMETAL
        _ashbed(m, rng, 3.6, 1.0, 1.1, 0.7)
        st = mark(m)
        m.box((3.6, 3.0, 1.6), (0, -0.4, 0.7), C[2], taper=0.85)                   # the instep
        for k, x in enumerate((-1.25, 0, 1.25)):                                     # toes
            m.box((1.05, 2.0, 1.1), (x, 1.9 + (0.3 if k == 1 else 0), 0.45), C[3], taper=0.7)
            m.box((1.1, 0.7, 0.6), (x, 3.0 + (0.3 if k == 1 else 0), 0.25), C[1], taper=0.8)
        m.box((1.6, 1.6, 1.0), (0, -2.5, 0.45), C[1], taper=0.6)                   # the heel spur
        m.cyl(1.4, 1.0, (0, -0.6, 1.3), C[1], segs=8, r_top=1.2)                     # the ankle ring
        facet(m, new_faces(m, st), C, noise=0.1)
        m.cyl(0.95, 0.12, (0, -0.6, 2.25), "#141418", segs=8)                       # the socket, empty
        m.cyl(0.4, 0.14, (0.2, -0.4, 2.27), EYE, segs=6, glow=True)
        for k in range(3):
            m.box((0.36, 1.6, 0.14), (-1.1 + k * 0.5, -0.4, 1.53), HOST_YELLOW if k != 1 else "#1a1a1e", rot=(0, 0, 0.5))
        for k in range(3):                                                           # cut cables
            a = k * 2.1 + 0.6
            limb(m, (math.cos(a) * 0.7, -0.6 + math.sin(a) * 0.7, 2.2), (math.cos(a) * 1.4, -0.6 + math.sin(a) * 1.4, 2.8), 0.17, 0.14, "#1e1e22", segs=4)
        _plates(m, rng, 6, 4.4, C[1:4] + [HOST_YELLOW] + RUST[1:2])
        light(r, (0.2, -0.4, 2.6), EYE, radius=4, intensity=0.4, flicker=0.5)
    xform(m, set(), M(scale=(1.15, 1.15, 1.15)))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def armor_plate(v):
    """Ground cover in the graveyard: armour shed by the titans, sunk in the ash. v0: a Concord
    pauldron, curved, a shell hole through it. v1: Host slabs stacked where they slid. v2: a plate
    standing on its edge with a torn strip lying by it."""
    r = root("ashgrave_armor_plate", v)
    rng = random.Random(3020 + v)
    m = Model(f"ashgrave_armor_plate_{v}", 3020 + v)
    if v == 0:
        _ashbed(m, rng, 2.0, 1.2, 0.9, 0.3)
        st = mark(m)
        m.ball(1.8, (0, 0, -0.55), IVORY[2], subdiv=1, scale=(1.3, 1.0, 0.75))
        m.box((2.8, 0.9, 0.5), (0, 0.75, 0.55), IVORY[3], rot=(-0.4, 0, 0), taper=0.8)   # its rim
        facet(m, new_faces(m, st), IVORY, noise=0.1)
        m.box((0.6, 2.2, 0.3), (0.9, 0, 0.75), OXBLOOD, rot=(0, 0.35, 0))
        m.cyl(0.42, 0.2, (-0.7, -0.3, 0.72), "#1a1816", segs=6, rot=(0.25, -0.35, 0))      # the hole
        m.cyl(0.62, 0.12, (-0.7, -0.3, 0.66), RUST[1], segs=7, rot=(0.25, -0.35, 0))
    elif v == 1:
        _ashbed(m, rng, 1.8, 1.3, 0.9, 0.25)
        for k, (x, y, rz, tilt) in enumerate(((-0.4, 0, 0.1, 0.05), (0.5, 0.2, 0.5, 0.18), (0.1, -0.5, -0.4, 0.3))):
            st = mark(m)
            m.box((2.4 - k * 0.3, 1.6 - k * 0.15, 0.32), (0, 0, 0), GUNMETAL[2 + (k % 2)], taper=0.9)
            xform(m, st, M((x, y, 0.2 + k * 0.32), (tilt, -tilt * 0.6, rz)))
            facet(m, new_faces(m, st), GUNMETAL, noise=0.1, bias=0.1)
        st = mark(m)
        for k in range(3):
            m.box((0.34, 1.0, 0.1), (-0.6 + k * 0.55, 0, 0), HOST_YELLOW if k % 2 == 0 else "#1a1a1e", rot=(0, 0, 0.5))
        xform(m, st, M((0.1, -0.5, 0.97), (0.3, -0.18, -0.4)))
    else:
        _ashbed(m, rng, 1.6, 1.2, 1.0, 0.3)
        st = mark(m)
        m.box((2.6, 0.4, 1.9), (0, 0, 0.6), HULL[3], taper=0.85)
        m.box((0.4, 0.45, 1.2), (-1.1, 0, 1.4), HULL[2])
        xform(m, st, M((0, 0.3, 0), (0.25, 0.1, 0)))
        facet(m, new_faces(m, st), HULL, noise=0.1)
        m.box((0.42, 0.44, 0.4), (0.9, 0.42, 1.6), RUST[2], rot=(0.25, 0.1, 0))
        st = mark(m)
        m.box((1.8, 0.8, 0.26), (0.4, -1.1, 0.15), RUST[1], rot=(0.1, -0.12, 0.4))
        m.box((0.9, 0.7, 0.26), (-0.9, -1.2, 0.12), HULL[2], rot=(-0.1, 0.12, -0.3))
    xform(m, set(), M(scale=(1.3, 1.3, 1.25)))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def shell_crater(v):
    """Ground cover: where a titan's shell came down. A scorched bowl with an ash rim (v0); a dud,
    nose-down, its fins and a hazard band showing, the ash round it still smoking (v1)."""
    r = root("ashgrave_shell_crater", v)
    rng = random.Random(3040 + v)
    m = Model(f"ashgrave_shell_crater_{v}", 3040 + v)
    R = 2.6 if v == 0 else 2.0
    # the thrown-up rim: a ring of soft ash, lit on its outer slope, the inner one in shadow
    st = mark(m)
    m.cyl(R + 0.9, 0.55, (0, 0, -0.1), ASHFALL[2], segs=11, r_top=R + 0.1)
    jitter(m, new_faces(m, st), 0.18)
    facet(m, new_faces(m, st), ASHFALL, noise=0.12, bias=0.1)
    m.cyl(R + 0.15, 0.47, (0, 0, -0.05), "#5a5048", segs=11)              # the bowl's scorched slope
    m.cyl(R * 0.78, 0.5, (0.1, -0.05, -0.05), "#463c36", segs=10)
    m.cyl(R * 0.45, 0.52, (0.2, -0.1, -0.05), "#342c2a", segs=8)            # and the burnt heart of it
    for k in range(5):                                                   # clods thrown out of it
        a = rng.uniform(0, math.tau)
        st = mark(m)
        lump(m, rng, (math.cos(a) * (R + 1.3), math.sin(a) * (R + 1.3), 0), (0.45, 0.35, 0.3), ASHFALL[1], n=8, flat=0.4)
        facet(m, new_faces(m, st), ASHFALL, noise=0.1)
    if v == 1:
        st = mark(m)
        m.cyl(0.75, 2.0, (0, 0, -0.6), BRASS_DUD[1], segs=8)              # the dud's tail
        m.cyl(0.8, 0.4, (0, 0, 0.5), HAZARD, segs=8)
        for k in range(4):
            a = k * math.pi / 2 + 0.3
            m.box((0.24, 1.1, 1.0), (math.cos(a) * 0.9, math.sin(a) * 0.9, 1.1), BRASS_DUD[2], rot=(0, 0, a + math.pi / 2))
        xform(m, st, M((0.2, 0.1, 0), (0.35, -0.2, 0)))
        facet(m, new_faces(m, st), BRASS_DUD, noise=0.08)
        for k in range(3):                                               # embers in the scorch
            a = k * 2.1 + 0.4
            m.box((0.5, 0.3, 0.12), (math.cos(a) * 1.2, math.sin(a) * 1.2, 0.04), FIRE[0], rot=(0, 0, a), glow=True)
        light(r, (0, 0, 0.6), FIRE[0], radius=3.5, intensity=0.5, flicker=0.6, halo=False)
        emitter(r, (0.4, 0.2, 0.4), "smoulder")
    else:
        _plates(m, rng, 4, 1.4, ["#2e2a28", RUST[0], HULL[1]], size=(0.4, 0.7), z=0.0)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


BRASS_DUD = ["#3a2e22", "#5e4a30", "#7e6640", "#a08a5a"]


# --- the Glass Craters: what the guns left behind ------------------------------------------

def glass_crust(v):
    """Ground cover: the crater floor baked to a skin of dark glass, crazed, light welling up in
    its cracks. v0: a splash, flung one way. v1: a pane shattered into plates. v2: rings frozen
    round where it last bubbled."""
    r = root("ashgrave_glass_crust", v)
    rng = random.Random(3100 + v)
    m = Model(f"ashgrave_glass_crust_{v}", 3100 + v)
    if v == 0:
        pts = []
        n = 11
        for k in range(n):
            a = k / n * math.tau
            d = (1.6 + 1.6 * max(0, math.cos(a)) ** 2) * rng.uniform(0.8, 1.15)
            pts.append((math.cos(a) * d, math.sin(a) * d * 0.75))
        m.slab([(x * 1.08, y * 1.08) for x, y in pts], -0.1, 0.06, FUSED[2])                 # a crust of baked sand round it
        st = mark(m)
        m.slab(pts, -0.1, 0.16, BOTTLE[1], top=[(x * 0.96, y * 0.96) for x, y in pts])
        facet(m, new_faces(m, st), BOTTLE, noise=0.2, bias=0.2)
        for k in range(4):                                                         # cracks, lit
            a = rng.uniform(-0.6, 0.6)
            L = rng.uniform(1.6, 2.6)
            m.box((L, 0.26, 0.06), (0.6 + math.cos(a) * L * 0.4, math.sin(a) * L * 0.4, 0.17), SEAM[0], rot=(0, 0, a), glow=True)
        for k in range(4):                                                         # droplets flung ahead
            st = mark(m)
            x = 3.6 + k * 0.7 + rng.uniform(-0.2, 0.2)
            m.ball(0.45 - k * 0.06, (x, rng.uniform(-0.9, 0.9), 0.02), BOTTLE[2], subdiv=0, scale=(1.3, 1, 0.5))
            facet(m, new_faces(m, st), BOTTLE, noise=0.1, bias=0.2)
    elif v == 1:
        m.cyl(1.7, 0.08, (0.3, 0.2, -0.04), "#1e8a4e", segs=9, glow=True)            # the light under the pane
        n = 5
        cuts = sorted(rng.uniform(0, math.tau) for _ in range(n))
        for k in range(n):
            a0 = cuts[k] + 0.05
            a1 = (cuts[(k + 1) % n] + (math.tau if k == n - 1 else 0)) - 0.05
            R = rng.uniform(1.5, 2.3)
            g = 0.17
            c0 = (rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6))
            pts = [(0.6 + math.cos((a0 + a1) / 2) * g * 2, 0.3 + math.sin((a0 + a1) / 2) * g * 2)]
            for t in (0, 0.5, 1):
                a = a0 + (a1 - a0) * t + (0.06 if t == 0 else -0.06 if t == 1 else 0)
                d = R * (0.9 if t == 0.5 else 1)
                pts.append((math.cos(a) * d, math.sin(a) * d))
            st = mark(m)
            m.slab(pts, -0.1, 0.2, BOTTLE[1])
            tilt = rng.uniform(-0.1, 0.14)
            c = (math.cos((a0 + a1) / 2), math.sin((a0 + a1) / 2))
            xform(m, st, M((0, 0, rng.uniform(0, 0.12)), (c[1] * tilt, -c[0] * tilt, 0)))
            facet(m, new_faces(m, st), BOTTLE, noise=0.25, bias=0.25)
    else:
        for k, (R, h) in enumerate(((2.6, 0.12), (1.9, 0.22), (1.2, 0.32))):
            st = mark(m)
            m.cyl(R, h, (0, 0, -0.06), BOTTLE[1 + k % 2], segs=10, r_top=R - 0.3)
            jitter(m, new_faces(m, st), 0.1, z=False)
            facet(m, new_faces(m, st), BOTTLE, noise=0.15, bias=0.15)
            if k == 1:                                                              # a seam, half round
                a0 = rng.uniform(0, math.tau)
                for i in range(4):
                    a = a0 + i * 0.55
                    m.box((0.62, 0.22, 0.06), (math.cos(a) * (R - 0.15), math.sin(a) * (R - 0.15), h - 0.04), SEAM[0], rot=(0, 0, a + math.pi / 2), glow=True)
        st = mark(m)
        m.ball(0.65, (0.1, 0, 0.25), BOTTLE[2], subdiv=1, scale=(1, 1, 0.7))
        facet(m, new_faces(m, st), BOTTLE, noise=0.1, bias=0.2)
        m.cyl(0.3, 0.1, (0.2, -0.05, 0.68), SEAM_PALE[0], segs=6, glow=True)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def _tube(m, rng, pts, r0, r1, mouth=True):
    """A fulgurite tube: sand fused round the path of a bolt, crusted, its open end lit inside."""
    st = mark(m)
    n = len(pts)
    path_tube(m, pts, [r0 + (r1 - r0) * i / (n - 1) for i in range(n)], FUSED[1], segs=5)
    jitter(m, new_faces(m, st), 0.05)
    facet(m, new_faces(m, st), FUSED, noise=0.18, bias=0.05)
    if mouth:
        a, b = Vector(pts[-2]), Vector(pts[-1])
        d = (b - a).normalized()
        limb(m, b - d * 0.05, b + d * 0.12, r1 * 0.7, r1 * 0.7, SEAM[0], segs=5, glow=True)


def fulgurite_root(v):
    """Where a shot's heat ran down into the sand: tubes of fused glass dug out by the wind, crusted
    sand outside, glowing inside. v0: roots crawling out from a scorched knot. v1: a cluster of
    chimneys standing up like organ pipes. v2: one long one snaking over the ground."""
    r = root("ashgrave_fulgurite_root", v)
    rng = random.Random(3120 + v)
    m = Model(f"ashgrave_fulgurite_root_{v}", 3120 + v)
    m.cyl(1.3, 0.06, (0, 0, -0.02), "#1c2a22", segs=8)
    if v == 0:
        st = mark(m)
        lump(m, rng, (0, 0, 0.3), (0.9, 0.8, 0.7), FUSED[1], n=10, flat=0.3)
        facet(m, new_faces(m, st), FUSED, noise=0.15)
        for k in range(4):
            a = k / 4 * math.tau + rng.uniform(-0.4, 0.4)
            L = rng.uniform(1.8, 2.8)
            pts = [(math.cos(a) * 0.5, math.sin(a) * 0.5, 0.5)]
            for i in range(1, 4):
                aa = a + rng.uniform(-0.35, 0.35)
                pts.append((math.cos(aa) * (0.5 + L * i / 3), math.sin(aa) * (0.5 + L * i / 3), 0.5 - i * 0.12 + (0.5 if i == 3 and k == 0 else 0)))
            _tube(m, rng, pts, 0.4, 0.28)
        m.cyl(0.42, 0.1, (0, 0, 0.98), SEAM[0], segs=6, glow=True)
    elif v == 1:
        for x, y, h, rad in ((0, 0, 2.6, 0.5), (0.9, 0.3, 1.8, 0.4), (-0.6, 0.7, 1.4, 0.38), (0.3, -0.85, 1.1, 0.34), (-0.8, -0.4, 2.0, 0.42)):
            lx, ly = rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3)
            _tube(m, rng, [(x, y, -0.2), (x + lx * 0.5, y + ly * 0.5, h * 0.55), (x + lx, y + ly, h)], rad * 1.15, rad)
        st = mark(m)
        lump(m, rng, (0, 0, 0), (1.3, 1.2, 0.4), FUSED[1], n=10, flat=0.5)
        facet(m, new_faces(m, st), FUSED, noise=0.15)
        light(r, (0, 0, 2.4), EYE, radius=4, intensity=0.5, halo=False)
    else:
        pts = []
        for i in range(6):
            x = -3.0 + i * 1.2
            pts.append((x, math.sin(i * 1.3) * 0.9, 0.25 + (0.25 if i in (2, 3) else 0)))
        _tube(m, rng, pts, 0.42, 0.3)
        _tube(m, rng, [pts[2], (pts[2][0] + 0.5, pts[2][1] + 1.2, 0.3), (pts[2][0] + 0.7, pts[2][1] + 2.1, 0.2)], 0.3, 0.22)
        _tube(m, rng, [pts[4], (pts[4][0] + 0.2, pts[4][1] - 1.1, 0.25), (pts[4][0] - 0.2, pts[4][1] - 1.9, 0.15)], 0.28, 0.22)
        m.cyl(0.5, 0.1, (pts[0][0] - 0.3, pts[0][1], 0.0), SEAM[0], segs=6, glow=True)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def fused_wreck(v):
    """The craters' hero pieces: titan parts caught when the ground turned to glass, sunk in it like
    flies in amber. v0: a Host helm, glass run over it and set in drips. v1: a Concord hand, palm up,
    a lump of the glass still glowing in its fingers."""
    r = root("ashgrave_fused_wreck", v)
    rng = random.Random(3140 + v)
    m = Model(f"ashgrave_fused_wreck_{v}", 3140 + v)
    # the pool it's sunk in: dark glass, a rim of baked sand, a lit seam round the part
    pts = []
    for k in range(12):
        a = k / 12 * math.tau
        d = rng.uniform(3.2, 3.9)
        pts.append((math.cos(a) * d * 1.1, math.sin(a) * d * 0.9))
    m.slab([(x * 1.07, y * 1.07) for x, y in pts], -0.1, 0.08, FUSED[2])
    st = mark(m)
    m.slab(pts, -0.1, 0.2, BOTTLE[1], top=[(x * 0.95, y * 0.95) for x, y in pts])
    facet(m, new_faces(m, st), BOTTLE, noise=0.2, bias=0.2)
    if v == 0:
        C = GUNMETAL
        s0 = mark(m)
        st = mark(m)
        m.ball(2.2, (0, 0.3, 0.2), C[2], subdiv=1, scale=(0.95, 1.1, 0.75))
        m.box((3.6, 1.4, 2.2), (0, -2.0, 0.0), C[2], taper=0.8)                 # the face plate
        m.box((0.9, 4.2, 0.9), (0, 0.4, 1.75), C[3], taper=0.5)                 # the crest
        facet(m, new_faces(m, st), C, noise=0.1)
        m.box((3.0, 0.4, 0.6), (0, -2.75, 0.45), "#141418")                     # the visor, dark
        m.box((0.5, 3.6, 0.22), (1.1, 0.3, 1.62), HOST_YELLOW, rot=(0, 0.45, 0))
        xform(m, s0, M((0.2, 0, 0.3), (-0.35, 0.3, 0.6)))
        # glass run over it and set: lumps down its flank, drips hanging off the face
        for k in range(6):
            a = rng.uniform(-1.2, 1.6)
            st = mark(m)
            lump(m, rng, (math.cos(a) * 1.9, math.sin(a) * 1.9, rng.uniform(0.4, 1.3)), (0.7, 0.6, 0.5), BOTTLE[2], n=8)
            facet(m, new_faces(m, st), BOTTLE[1:] + [SEAM], noise=0.15, bias=-0.1)
        ring(m, 2.7, 0.35, 0.2, SEAM[0], n=10, h=0.08, glow=True)
    else:
        C = IVORY
        s0 = mark(m)
        st = mark(m)
        m.box((2.8, 3.0, 1.0), (0, -0.4, 0.5), C[2], taper=0.85)                 # the palm
        limb(m, (0, -2.0, 0.3), (0.2, -3.8, -0.2), 1.0, 0.95, C[2], segs=7)      # the wrist, into the glass
        for k, x in enumerate((-1.0, -0.33, 0.33, 1.0)):
            L = (0.9, 0.8, 0.6) if k in (1, 2) else (0.8, 0.7, 0.5)
            p = Vector((x, 1.0, 0.8))
            d = Vector((x * 0.1, 1, 0.5)).normalized()
            for i, l in enumerate(L):
                q = p + d * l
                limb(m, p, q, 0.34 * 0.9 ** i, 0.3 * 0.9 ** i, C[3], segs=5)
                m.ball(0.3 * 0.9 ** i, tuple(q), C[1], subdiv=0)
                p = q
                d = Vector((d.x, d.y - 0.55, d.z + 0.2)).normalized()
        limb(m, (-1.4, -0.6, 0.7), (-2.0, 0.5, 1.4), 0.38, 0.32, C[3], segs=5)   # the thumb
        limb(m, (-2.0, 0.5, 1.4), (-1.5, 1.2, 1.7), 0.32, 0.28, C[3], segs=5)
        facet(m, new_faces(m, st), C, noise=0.1)
        m.box((2.85, 0.5, 0.2), (0, -1.4, 1.02), OXBLOOD)
        st = mark(m)
        lump(m, rng, (0, 0.2, 1.3), (0.85, 0.8, 0.7), BOTTLE[2], n=10)              # the glass it caught
        facet(m, new_faces(m, st), [BOTTLE[2], BOTTLE[3], SEAM, SEAM_PALE], noise=0.2, bias=0.1)
        xform(m, s0, M((0.3, 0.6, 0.1), (0.2, 0, 0.3)))
        light(r, (0.3, 0.8, 1.8), EYE, radius=6, intensity=0.8, flicker=0.2)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


# --- the Scav Camp: places, not piles -------------------------------------------------------

CLAN = "#c8482a"          # the clan's colour, on every flag and banner
CLAN_MARK = "#e8c45a"
WOOD = ["#3e3228", "#5a4a3a", "#76624a"]
SHEET = ["#6a5444", "#8a6a4e", "#5e6a64", "#9a8a6a", "#4e5a62"]   # corrugated scrap, every shade of it


def _a_tent(m, rng, loc, rz, size=(2.2, 1.8, 1.3), col=None, patch=None):
    """A small ridge tent, its door at +x (local), a patch on its roof."""
    st = mark(m)
    L, W, H = size
    col = col or rng.choice(TARP[:3] + [TARP[4]])
    m.gable((L, W, H), (0, 0, 0), col, overhang=0.12, thick=0.16)
    if patch:
        m.gable((L * 0.3, W * 1.02, H * 1.02), (rng.uniform(-0.3, 0.3) * L, 0, 0.01), patch, overhang=0.13, thick=0.16)
    m.prism([(-W / 2, 0), (W / 2, 0), (0, H * 0.95)], 0.1, (-L / 2, 0, 0), TARP_DARK, rot=(0, 0, math.pi / 2))
    m.prism([(-W * 0.3, 0), (W * 0.3, 0), (0, H * 0.7)], 0.1, (L / 2, 0, 0), "#1a1614", rot=(0, 0, math.pi / 2))
    xform(m, st, M((loc[0], loc[1], 0), (0, 0, rz)))


def _sheet_wall(m, rng, a, b, h=1.7, lean=0.08):
    """A fence of corrugated sheets between two points, on posts, every sheet its own scrap."""
    a, b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    d = b - a
    n = max(1, round(d.length / 1.1))
    ang = math.atan2(d.y, d.x)
    for i in range(n):
        t = (i + 0.5) / n
        p = a + d * t
        st = mark(m)
        hh = h * rng.uniform(0.82, 1.1)
        c = rng.choice(SHEET)
        m.box((d.length / n + 0.12, 0.16, hh), (0, 0, hh / 2), c)
        m.box((d.length / n * 0.4, 0.2, hh * 0.92), (0, 0, hh / 2), c)      # the corrugation, a rib
        xform(m, st, M((p.x, p.y, -0.1), (rng.uniform(-lean, lean), 0, ang + rng.uniform(-0.06, 0.06))))
    for i in range(n + 1):
        p = a + d * (i / n)
        limb(m, (p.x, p.y, -0.1), (p.x, p.y, h + 0.25), 0.13, 0.11, WOOD[1], segs=4)


def camp(v):
    """The scav camps' hearths: what makes a scatter of tents a camp. v0: tents in a ring round a
    fire, a windbreak of sheets at their backs, washing on a line. v1: a market row, stalls under
    clan awnings against a scrap wall, crates in front. v2: a salvage pit, a derrick hoisting a
    titan's finger out of it, a winch and a lamp."""
    r = root("ashgrave_camp", v)
    rng = random.Random(3200 + v)
    m = Model(f"ashgrave_camp_{v}", 3200 + v)
    m.cyl(4.2 if v != 1 else 3.6, 0.06, (0, 0, -0.03), "#7a6248", segs=10)        # the ground, trodden bare
    if v == 0:
        # the fire, ringed with stones
        for k in range(7):
            a = k / 7 * math.tau
            m.ball(0.3, (math.cos(a) * 0.75, math.sin(a) * 0.75, 0.1), DIRT[3], subdiv=0, scale=(1, 0.8, 0.7))
        m.cyl(0.6, 0.06, (0, 0, 0.02), "#1e1a1a", segs=7)
        for k, a in enumerate((0.5, 2.3, 4.2)):                                         # the tents, doors in
            _a_tent(m, rng, (math.cos(a) * 3.0, math.sin(a) * 3.0), a + math.pi, col=TARP[k % 3],
                    patch=TARP[(k + 2) % 5])
        for a in (1.4, 3.3, 5.3):                                                       # log seats
            m.cyl(0.26, 1.3, (math.cos(a) * 1.7 - math.sin(a) * 0.65, math.sin(a) * 1.7 + math.cos(a) * 0.65, 0.22),
                  WOOD[1], segs=6, rot=(math.pi / 2, 0, a))
        # the windbreak behind, an arc of sheets
        pts = [(math.cos(a) * 4.4, math.sin(a) * 4.4) for a in (5.4, 5.9, 0.4, 0.95)]
        for i in range(3):
            _sheet_wall(m, rng, pts[i], pts[i + 1], h=1.6)
        # a washing line between two poles
        p0, p1 = (-1.0, -3.8), (2.2, -3.4)
        for p in (p0, p1):
            limb(m, (p[0], p[1], -0.1), (p[0], p[1], 1.9), 0.1, 0.08, WOOD[1], segs=4)
        limb(m, (*p0, 1.85), (*p1, 1.85), 0.05, 0.05, "#2a2420", segs=3)
        for k in range(4):
            t = (k + 0.5) / 4
            m.box((0.55, 0.12, 0.7), (p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, 1.45),
                  [CLAN, TARP[4], TARP[1], TARP[3]][k], rot=(0, 0, math.atan2(p1[1] - p0[1], p1[0] - p0[0])))
        m.box((0.7, 0.7, 0.6), (-2.5, 1.0, 0.3), "#7a6a4a", rot=(0, 0, 0.3))
        m.cyl(0.4, 0.9, (-2.8, 0.1, 0.0), RUST[2], segs=7)
        fz, fs = 0.05, 0.8
    elif v == 1:
        # the back wall, the stalls along it, their awnings slanting out
        _sheet_wall(m, rng, (-4.0, 1.4), (4.0, 1.6), h=2.2, lean=0.04)
        for i, x in enumerate((-2.7, 0.0, 2.7)):
            col = rng.choice((CLAN, TARP[1], TARP[0], TARP[3]))
            alt = rng.choice((col, TARP[4], SHEET[3]))
            st = mark(m)
            for k in range(5):
                m.box((0.5, 2.3, 0.12), (-1.0 + k * 0.5, 0, 0), col if k % 2 == 0 else alt)
            xform(m, st, M((x, 0.3, 1.7), (-0.32, 0, rng.uniform(-0.05, 0.05))))
            for dx in (-1.1, 1.1):
                limb(m, (x + dx, -0.75, -0.1), (x + dx, -0.75, 1.4), 0.09, 0.08, WOOD[1], segs=4)
            m.box((2.2, 0.8, 0.9), (x, 0.4, 0.45), WOOD[2])                           # the counter
            for k in range(3):                                                           # wares on it
                m.box((0.4, 0.4, 0.35), (x - 0.6 + k * 0.6, 0.4, 1.05), rng.choice((HAZARD, STEEL[2], RUST[2], "#3e6a6a")))
        for x, y in ((-3.4, -1.8), (-2.6, -2.2), (1.6, -2.0), (3.5, -1.6)):            # crates and drums out front
            if rng.random() < 0.5:
                m.box((0.75, 0.75, 0.7), (x, y, 0.35), "#7a6a4a", rot=(0, 0, rng.uniform(-0.4, 0.4)))
            else:
                m.cyl(0.38, 0.95, (x, y, 0), rng.choice((RUST[2], "#3e6a6a", HAZARD)), segs=7)
        for k in range(5):                                                               # a string of lamps
            x = -3.6 + k * 1.8
            m.ball(0.2, (x, -0.95, 1.55 - 0.12 * (k % 2)), "#ffd06a", subdiv=0, glow=True)
        limb(m, (-3.6, -0.95, 1.6), (3.6, -0.95, 1.6), 0.04, 0.04, "#2a2420", segs=3)
        light(r, (0, -1.2, 1.8), "#ffb050", radius=6, intensity=0.8, flicker=0.15)
        fz = None
    else:
        # the pit, the derrick over it, the finger coming up out of it
        st = mark(m)
        m.cyl(2.5, 0.4, (0, 0, -0.1), DIRT[2], segs=10, r_top=2.0)                     # the spoil heaped round
        jitter(m, new_faces(m, st), 0.15)
        facet(m, new_faces(m, st), DIRT, noise=0.1)
        m.cyl(1.9, 0.42, (0, 0, -0.1), "#1a1614", segs=9)                               # the pit
        apex = Vector((0, 0, 5.0))
        for k in range(3):
            a = k / 3 * math.tau + 0.3
            limb(m, (math.cos(a) * 2.9, math.sin(a) * 2.9, -0.1), tuple(apex), 0.17, 0.13, RUST[2], segs=4)
        m.box((0.6, 0.6, 0.4), tuple(apex), "#2a2622")
        limb(m, tuple(apex), (0, 0, 3.2), 0.06, 0.06, "#1e1e22", segs=3)               # the chain
        st = mark(m)
        _finger(m, (0, 0, 3.1), (0.9, 0.8, 0.6), 0.42, IVORY[3], curl=0.25, axis=(0.1, 0.05, -1))   # a titan's finger
        facet(m, new_faces(m, st), IVORY, noise=0.1)
        m.box((1.0, 0.8, 0.8), (2.8, -1.4, 0.4), HAZARD, rot=(0, 0, 0.4))               # the winch
        m.cyl(0.35, 0.9, (2.8, -1.4, 0.95), "#2a2622", segs=6, rot=(math.pi / 2, 0, 0.4))
        limb(m, (2.6, -1.3, 1.0), tuple(apex), 0.04, 0.04, "#1e1e22", segs=3)
        for x, y, c in ((-3.1, 1.2, IVORY[2]), (-2.6, 2.2, GUNMETAL[3]), (3.0, 1.6, IVORY[1])):   # salvaged plates, sorted
            st = mark(m)
            m.box((1.3, 1.0, 0.25), (0, 0, 0), c)
            xform(m, st, M((x, y, 0.2), (0.15, 0.1, rng.uniform(0, 3))))
        limb(m, (-1.6, -2.8, -0.1), (-1.6, -2.8, 2.2), 0.08, 0.07, WOOD[1], segs=4)       # a work lamp
        m.ball(0.28, (-1.6, -2.8, 2.3), "#ffd06a", subdiv=0, glow=True)
        light(r, (-1.6, -2.8, 2.5), "#ffb050", radius=6, intensity=0.9, flicker=0.2)
        fz = None
    m.build(r)
    if fz is not None:
        f = Model(f"ashgrave_camp_{v}_flame")
        f.cyl(0.55 * fs, 1.1 * fs, (0, 0, 0), FIRE[0], segs=6, r_top=0.05, glow=True)
        f.cyl(0.36 * fs, 0.9 * fs, (0.05, -0.04, 0), FIRE[1], segs=5, r_top=0.04, glow=True, rot=(0, 0, 0.5))
        f.cyl(0.2 * fs, 0.6 * fs, (-0.04, 0.03, 0), FIRE[2], segs=5, r_top=0.03, glow=True)
        o = f.build(r, loc=(0, 0, fz))
        flicker(o, f"ashgrave_camp_{v}_flicker_idle", amp=0.22, seed=10 + v, period=1.3)
        light(r, (0, 0, fz + 1.0), FIRE[1], radius=8, intensity=1.3, flicker=0.6)
        emitter(r, (0, 0, fz + 1.0), "embers")
    return r


def scrap_fence(v):
    """The camps' walls, run up from whatever came off the titans. v0: a straight run of sheets. v1: a
    corner with a gate, two tall posts and the clan's banner over it. v2: a barricade of girder
    hedgehogs, a Concord helm stuck on a pole as a warning."""
    r = root("ashgrave_scrap_fence", v)
    rng = random.Random(3220 + v)
    m = Model(f"ashgrave_scrap_fence_{v}", 3220 + v)
    if v == 0:
        _sheet_wall(m, rng, (-4.2, 0.0), (0.4, 0.3))
        _sheet_wall(m, rng, (0.4, 0.3), (4.0, -0.6))
        m.box((0.7, 0.7, 0.6), (1.6, -0.8, 0.3), "#7a6a4a", rot=(0, 0, 0.3))
        m.cyl(0.38, 0.9, (-2.0, -0.7, 0), RUST[2], segs=7)
    elif v == 1:
        _sheet_wall(m, rng, (-4.0, 0.0), (-1.3, 0.0), h=2.0)
        _sheet_wall(m, rng, (1.3, 0.0), (3.0, 0.0), h=2.0)
        _sheet_wall(m, rng, (3.0, 0.0), (3.2, 3.0), h=2.0)
        for x in (-1.3, 1.3):                                                        # the gate posts
            st = mark(m)
            m.box((0.5, 0.5, 3.4), (x, 0, 1.6), GUNMETAL[2], taper=0.85)
            facet(m, new_faces(m, st), GUNMETAL, noise=0.1)
            m.ball(0.22, (x, -0.3, 3.0), "#ffd06a", subdiv=0, glow=True)
        m.box((3.2, 0.4, 0.45), (0, 0, 3.2), RUST[2])                                 # the lintel
        st = mark(m)
        m.box((1.6, 0.12, 1.6), (0, -0.28, 2.15), CLAN)                                # the banner
        m.prism([(-0.8, 0), (0.8, 0), (0, -0.5)], 0.12, (0, -0.28, 1.35), CLAN)
        xform(m, st, M(rot=(0.1, 0, 0)))
        m.box((0.7, 0.14, 0.7), (0, -0.37, 2.2), CLAN_MARK, rot=(0, math.pi / 4, 0))   # its mark
        light(r, (0, -0.6, 3.0), "#ffb050", radius=5, intensity=0.6, flicker=0.2)
    else:
        _sheet_wall(m, rng, (-4.0, 0.6), (-1.0, 0.8), h=1.5)
        for k, x in enumerate((2.0,)):
            st = mark(m)
            for a in (0, 2.1, 4.2):                                                    # a hedgehog of girders
                limb(m, (x + math.cos(a) * 0.9, math.sin(a) * 0.9, -0.1), (x - math.cos(a) * 0.9, -math.sin(a) * 0.9, 1.5),
                     0.17, 0.17, RUST[k % 2 + 1], segs=4)
            xform(m, st, M(rot=(0, 0, 0)))
        limb(m, (0.05, 0.6, -0.1), (0.05, 0.6, 3.0), 0.11, 0.09, WOOD[1], segs=4)       # the warning
        st = mark(m)
        m.ball(0.75, (0.05, 0.6, 3.2), IVORY[2], subdiv=1, scale=(0.9, 1.0, 0.85))
        m.box((1.0, 0.5, 0.6), (0.05, 0.05, 3.0), IVORY[3], taper=0.8)
        facet(m, new_faces(m, st), IVORY, noise=0.1)
        m.box((0.9, 0.2, 0.22), (0.05, -0.2, 3.15), "#1a1614")
        for x in (-0.18, 0.28):
            m.box((0.2, 0.1, 0.16), (x, -0.25, 3.15), FIRE[1], glow=True)              # lit from inside, to scare
        m.box((0.8, 0.12, 0.6), (0.05, 0.6, 2.2), CLAN)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def watchtower(v):
    """A clan lookout over the camp. v0: four legs of pipe up to a sheet-roofed platform, a ladder, a
    lamp and a flag. v1: a titan's forearm stood on end for a post, the crow's nest built in its
    open hand."""
    r = root("ashgrave_watchtower", v)
    rng = random.Random(3240 + v)
    m = Model(f"ashgrave_watchtower_{v}", 3240 + v)
    if v == 0:
        z = 4.2
        for sx in (-1, 1):
            for sy in (-1, 1):
                limb(m, (sx * 1.4, sy * 1.4, -0.1), (sx * 0.95, sy * 0.95, z), 0.15, 0.13, RUST[2], segs=4)
        for zz in (1.5, 3.0):                                                           # cross bracing
            limb(m, (-1.25, -1.25, zz), (1.25, -1.25, zz + 0.8), 0.08, 0.08, RUST[1], segs=3)
            limb(m, (1.25, 1.25, zz), (-1.25, 1.25, zz + 0.8), 0.08, 0.08, RUST[1], segs=3)
        m.box((2.4, 2.4, 0.25), (0, 0, z), WOOD[2])
        for k, (x, y, rz) in enumerate(((0, -1.15, 0), (0, 1.15, 0), (-1.15, 0, math.pi / 2), (1.15, 0, math.pi / 2))):
            m.box((2.3, 0.12, 0.8), (x, y, z + 0.5), SHEET[k], rot=(0, 0, rz))
        st = mark(m)
        for k in range(5):
            m.box((0.55, 2.8, 0.12 if k % 2 else 0.2), (-1.1 + k * 0.55, 0, 0), SHEET[(k + 1) % 5])
        xform(m, st, M((0, 0, z + 1.8), (0.25, 0, 0)))
        for sx in (-1, 1):
            for sy in (-1, 1):
                limb(m, (sx * 1.05, sy * 1.05, z), (sx * 1.05, sy * 1.05, z + 1.6 + sy * 0.3), 0.07, 0.07, WOOD[0], segs=3)
        for x in (-0.25, 0.25):                                                          # the ladder
            limb(m, (x, -1.9, -0.1), (x, -1.2, z), 0.06, 0.06, WOOD[1], segs=3)
        m.ball(0.25, (0.9, -1.2, z + 1.2), "#ffd06a", subdiv=0, glow=True)
        light(r, (0.9, -1.4, z + 1.2), "#ffb050", radius=6, intensity=0.8, flicker=0.2)
        limb(m, (-1.05, 1.05, z + 1.8), (-1.05, 1.05, z + 3.0), 0.06, 0.06, WOOD[0], segs=3)
        m.box((0.9, 0.08, 0.55), (-0.55, 1.05, z + 2.7), CLAN, rot=(0, 0, 0.2))
    else:
        st = mark(m)
        limb(m, (0, 0, -0.3), (0.1, 0.1, 4.0), 0.9, 0.75, GUNMETAL[2], segs=7)
        m.box((0.9, 1.3, 3.0), (0, 0.75, 1.6), GUNMETAL[3], taper=0.7)
        m.ball(0.7, (0.1, 0.1, 4.1), GUNMETAL[1], subdiv=1)
        m.box((2.2, 1.8, 0.7), (0.1, 0.1, 4.7), GUNMETAL[2], taper=0.9)                 # the palm, flat to the sky
        for k, x in enumerate((-0.75, -0.25, 0.25, 0.75)):                               # fingers, bent up as a railing
            limb(m, (x + 0.1, 1.0, 4.9), (x + 0.1, 1.2, 6.0 - 0.15 * abs(k - 1.5)), 0.22, 0.18, GUNMETAL[3], segs=5)
        limb(m, (-1.0, -0.4, 4.8), (-1.3, -0.6, 5.6), 0.24, 0.2, GUNMETAL[3], segs=5)      # the thumb
        facet(m, new_faces(m, st), GUNMETAL, noise=0.1)
        for k in range(3):
            m.box((0.34, 1.3, 0.1), (-0.6 + k * 0.5, 0.75, 2.0), HOST_YELLOW if k != 1 else "#1a1a1e", rot=(0, 0, 0.5))
        m.box((1.8, 1.4, 0.2), (0.1, -0.05, 5.1), WOOD[2])                               # boards across the palm
        st = mark(m)
        m.gable((1.6, 1.4, 0.7), (0, 0, 0), TARP[0], overhang=0.1, thick=0.14)
        xform(m, st, M((0.1, -0.1, 5.9)))
        for x in (-0.6, 0.8):
            limb(m, (x, -0.6, 5.1), (x, -0.6, 5.95), 0.06, 0.06, WOOD[0], segs=3)
        for k in range(6):                                                               # rungs up the forearm
            m.box((0.6, 0.18, 0.12), (0.05, -0.85, 0.6 + k * 0.6), STEEL[1])
        m.ball(0.25, (1.1, -0.6, 5.5), "#ffd06a", subdiv=0, glow=True)
        light(r, (1.1, -0.8, 5.5), "#ffb050", radius=6, intensity=0.8, flicker=0.2)
        limb(m, (-0.7, 0.4, 6.4), (-0.7, 0.4, 7.4), 0.06, 0.06, WOOD[0], segs=3)
        m.box((0.9, 0.08, 0.55), (-0.25, 0.4, 7.1), CLAN, rot=(0, 0, 0.2))
        _ashbed(m, rng, 1.6, 1.1, 1.0, 0.4)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def build():
    for v in range(3):
        mech_wreck(v)
    for v in range(2):
        mech_arm(v)
        bonfire(v)
    for v in range(4):
        white_tree(v)
        titan_leg(v)
    for v in range(3):
        scrap_pile(v)
        glass_shard(v)
        scav_tent(v)
        pale_spire(v)
        ash_drift(v)
        armor_plate(v)
        glass_crust(v)
        fulgurite_root(v)
    for v in range(2):
        shell_crater(v)
        fused_wreck(v)
        watchtower(v)
        fallen_log(v)
        hollow_giant(v)
    for v in range(3):
        camp(v)
        scrap_fence(v)
