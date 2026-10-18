"""ASHGRAVE, where the titans fell: an old war's graveyard. Mech heads and torsos sunk like hills,
arms clawing out of the ash, craters of green glass that still glow, scavenger camps round
barrel fires, and a dead forest bleached bone-white under a blue moon."""
from __future__ import annotations

import math
import random

from mathutils import Vector
from kit import Model, animate, emitter, light
from props_b_kit import (M, crystal, facet, flicker, jitter, limb, mark, new_faces, paint, root, xform)

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
BONE_WOOD = ["#8e909c", "#b8b8c0", "#dcdad8", "#f4f2ec"]
CHAR = "#34343c"
ASH = ["#8a8a92", "#a4a4ac"]


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
    else:
        s0 = mark(m)
        st = mark(m)
        m.box((6.4, 4.2, 4.4), (0, 0, 0.6), HULL[2], taper=0.82)               # the chest
        m.box((5.0, 1.2, 2.2), (0, -2.3, 1.6), HULL[2], taper=0.7)             # breastplate
        m.box((2.2, 2.4, 1.2), (0, 0.4, 3.2), HULL[1], taper=0.6)              # collar
        m.ball(2.3, (-4.0, 0.2, 2.2), HULL[2], subdiv=1, scale=(1.0, 1.1, 0.75))    # pauldron
        m.box((1.0, 3.6, 0.8), (-4.1, 0.2, 3.6), HULL[3], taper=0.5)           # its ridge
        limb(m, (-4.0, 0.2, 1.0), (-5.6, -0.8, -1.0), 1.4, 1.2, HULL[1], segs=6)   # the arm, gone into the ground
        for x in (-1.6, 1.6):
            limb(m, (x, 2.0, 2.0), (x * 1.1, 3.0, 4.4), 0.55, 0.5, HULL[1], segs=6)   # exhaust stacks
        facet(m, new_faces(m, st), HULL, noise=0.1)
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
        m.box((2.2, 0.35, 0.35), (-1.6, -2.6, 3.1), WAR_RED, rot=(0.6, 0, 0))
        tilt = M((0, 0, 0.2), (-0.28, 0.12, 0))
        xform(m, s0, tilt)
        _mound(m, 4.6, 1.4, sx=1.1, sy=0.85)
        _rubble(m, rng, 10, 4.6, HULL[1:4] + RUST[1:3])
        light(r, tuple(tilt @ Vector((0, -3.3, 1.9))), EYE, radius=8, intensity=1.1, flicker=0.15)
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
    """Spikes of green glass where the big guns hit: dark glass, faces that catch the light glow."""
    r = root("glass_shard", v)
    rng = random.Random(360 + v)
    m = Model(f"glass_shard_{v}", 360 + v)
    st = mark(m)
    m.cyl(2.2 if v != 1 else 1.8, 0.14, (0, 0, -0.04), GLASS[1], segs=9)
    jitter(m, new_faces(m, st), 0.15, z=False)
    m.cyl(1.0, 0.16, (0.2, -0.2, -0.04), "#2a8a4a", segs=7, glow=True)
    shards = []
    if v == 0:
        for k in range(6):
            a = k / 6 * math.tau + rng.uniform(-0.3, 0.3)
            t = rng.uniform(0.2, 0.6)
            shards.append(((math.cos(a) * 0.3, math.sin(a) * 0.3, -0.2), (math.cos(a) * math.sin(t), math.sin(a) * math.sin(t), math.cos(t)),
                           rng.uniform(0.35, 0.55), rng.uniform(1.8, 3.2)))
    elif v == 1:
        shards.append(((0, 0, -0.3), (0.35, -0.2, 1), 0.7, 3.8))
        for k in range(3):
            a = k * 2.1 + 0.5
            shards.append(((math.cos(a) * 0.8, math.sin(a) * 0.8, -0.2), (math.cos(a) * 0.8, math.sin(a) * 0.8, 1), 0.35, rng.uniform(1.0, 1.6)))
    else:
        for k in range(9):
            a = k / 9 * math.tau + rng.uniform(-0.15, 0.15)
            shards.append(((math.cos(a) * 1.7, math.sin(a) * 1.7, -0.2), (math.cos(a) * 0.7, math.sin(a) * 0.7, 1),
                           rng.uniform(0.3, 0.45), rng.uniform(1.0, 2.2)))
        m.cyl(1.4, 0.18, (0, 0, -0.02), "#4aff8a", segs=9, glow=True)
    for base, d, rad, L in shards:
        s2 = mark(m)
        crystal(m, base, d, rad, L, rad * 2.6, GLASS[0], segs=4, twist=rng.uniform(0, 1))
        facet(m, new_faces(m, s2), GLASS, noise=0.2, bias=-0.05)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    light(r, (0, 0, 1.5), EYE, radius=6, intensity=0.8)
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
        cols = [TARP[0], TARP[1], TARP[2], TARP[0], TARP[3], TARP[1], TARP[4], TARP[2]]
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

def _branch(m, rng, a, d, length, rad, depth, cols):
    b = a + d * length
    limb(m, a, b, rad, rad * 0.62, cols, segs=5 if rad > 0.15 else 4)
    if depth <= 0:
        return
    n = rng.choice((2, 3, 3))
    yaw0 = rng.uniform(0, math.tau)
    for k in range(n):
        yaw = yaw0 + k * math.tau / n + rng.uniform(-0.5, 0.5)
        bend = rng.uniform(0.35, 0.75)
        side = Vector((math.cos(yaw), math.sin(yaw), 0))
        nd = (d * math.cos(bend) + side * math.sin(bend))
        nd.z += 0.25
        nd.normalize()
        _branch(m, rng, b - d * length * rng.uniform(0, 0.15), nd, length * rng.uniform(0.6, 0.8), rad * 0.66,
                depth - 1, cols)


def white_tree(v):
    """A dead tree, bleached bone-white, charred at the foot, ash drifted round it."""
    r = root("white_tree", v)
    rng = random.Random(420 + v)
    m = Model(f"white_tree_{v}", 420 + v)
    st = mark(m)
    if v == 0:
        _branch(m, rng, Vector((0, 0, -0.2)), Vector((0.05, 0, 1)).normalized(), 2.6, 0.45, 3, BONE_WOOD[2])
    elif v == 1:
        _branch(m, rng, Vector((0, 0, -0.2)), Vector((0.3, -0.2, 1)).normalized(), 2.4, 0.4, 3, BONE_WOOD[2])
        _branch(m, rng, Vector((0.6, -0.3, 1.6)), Vector((-0.7, 0.1, 0.6)).normalized(), 2.0, 0.25, 2, BONE_WOOD[2])
    else:
        # a snag snapped at the top, and the top lying beside it
        limb(m, (0, 0, -0.2), (0.1, 0, 2.6), 0.5, 0.38, BONE_WOOD[2], segs=6)
        for k in range(4):
            a = k * 1.6
            limb(m, (0.1, 0, 2.5), (0.1 + math.cos(a) * 0.25, math.sin(a) * 0.25, 2.9 + rng.uniform(0, 0.6)), 0.18, 0.04, BONE_WOOD[2], segs=4)
        _branch(m, rng, Vector((0.05, 0, 1.6)), Vector((-0.8, 0.3, 0.5)).normalized(), 1.2, 0.18, 1, BONE_WOOD[2])
        limb(m, (0.8, -0.6, 0.3), (4.0, -1.6, 0.2), 0.36, 0.25, BONE_WOOD[2], segs=6)
        _branch(m, rng, Vector((2.8, -1.3, 0.3)), Vector((0.2, -0.7, 0.4)).normalized(), 1.0, 0.16, 1, BONE_WOOD[2])
    facet(m, new_faces(m, st), BONE_WOOD, noise=0.12)
    # charred at the foot, roots flaring into an ash drift
    m.cyl(0.62, 0.7, (0, 0, -0.1), CHAR, segs=6, r_top=0.42)
    for k in range(4):
        a = k * math.tau / 4 + rng.uniform(0, 0.8)
        limb(m, (0, 0, 0.3), (math.cos(a) * 1.1, math.sin(a) * 1.1, -0.1), 0.24, 0.12, CHAR, segs=4)
    s2 = mark(m)
    m.ball(1.3, (0.2, 0.1, -0.35), ASH[0], subdiv=1, scale=(1.3, 1.0, 0.4), jitter=0.12)
    facet(m, new_faces(m, s2), ASH + ["#bcbcc4"], noise=0.1)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def build():
    for v in range(2):
        mech_wreck(v)
        mech_arm(v)
        bonfire(v)
    for v in range(3):
        scrap_pile(v)
        glass_shard(v)
        scav_tent(v)
        white_tree(v)
