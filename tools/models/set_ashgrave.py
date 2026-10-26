"""ASHGRAVE's set pieces: titans lying full length in the ash (one still reaching
up), a titan's spine and a titan's cannon propped across the field, fulgurite spires and a
starship fused into the glass, a scrap gantry hung with hooks and tarps, a scrap wall and a
crawler town, and in the white woods trees so big their crowns meet over you. Plus new
scenery: shacks and car hulks for the camps, glass blisters and spent shell casings
for the craters, moon-blue fungus for the woods."""
from __future__ import annotations

import math
import random

import bmesh

from mathutils import Vector
from kit import Model, animate, emitter, light
from props_a_lib import hull
from props_b_kit import M, collider, crystal, facet, flicker, jitter, limb, mark, new_faces, paint, root, xform
from props_b_ashgrave import (ASH, BONE_WOOD, CHAR, DIRT, EYE, EYE_PALE, FIRE, GLASS, GLASS_TIP, HAZARD, HULL,
                              HULL_DARK, RUST, STEEL, TARP, TARP_DARK, WAR_RED, IVORY, OXBLOOD, GUNMETAL,
                              HOST_YELLOW, BOTTLE, SEAM, SEAM_PALE, FUSED)

BRASS = ["#3a2e22", "#5e4a30", "#7e6640", "#a08a5a"]
MOON = "#7ad8ff"                     # the woods' fungus, lit like the moon
MOON_PALE = "#d0f4ff"
LAMP = "#ffc860"
GLASS_GLOW = ("#4aff8a", True)
BOTTLE_S = ["#0a1c14", "#123224", "#1c4a34", "#2e6a4a"]


# --- helpers ------------------------------------------------------------------------------

def _chunk(m, rng, lo, hi, cols, n=14, bias=0.0, noise=0.15):
    """A faceted lump filling the box lo..hi, painted by facing."""
    pts = []
    for _ in range(n):
        p = [rng.uniform(lo[i], hi[i]) for i in range(3)]
        k = rng.randrange(3)
        p[k] = lo[k] if rng.random() < 0.5 else hi[k]
        pts.append(p)
    for sx in (0, 1):
        for sy in (0, 1):
            pts.append([lo[0] + (hi[0] - lo[0]) * (0.15 + 0.7 * sx), lo[1] + (hi[1] - lo[1]) * (0.15 + 0.7 * sy), hi[2]])
            pts.append([lo[0] + (hi[0] - lo[0]) * (0.1 + 0.8 * sx), lo[1] + (hi[1] - lo[1]) * (0.1 + 0.8 * sy), lo[2]])
    f = hull(m, pts, cols[0])
    facet(m, f, cols, noise=noise, bias=bias)
    return f


def _column(m, rng, x, y, levels, cols, sides=6, lean=(0.0, 0.0), bias=0.0):
    pts = []
    ztop = levels[-1][0]
    for z, r in levels:
        t = z / ztop if ztop else 0
        a0 = rng.uniform(0, math.tau)
        for k in range(sides):
            a = a0 + k * math.tau / sides
            d = r * rng.uniform(0.85, 1.08)
            pts.append((x + lean[0] * t + math.cos(a) * d, y + lean[1] * t + math.sin(a) * d, z))
    f = hull(m, pts, cols[0])
    facet(m, f, cols, noise=0.16, bias=bias)
    return f


def _centre(m, r):
    """Shift a gate so its bounds are even about x = 0 (the runtime stands it by its half-width, so
    its outer column lands just past the field's edge whatever reaches out at the inner end)."""
    xs = [v.co.x for v in m.bm.verts]
    dx = -(min(xs) + max(xs)) / 2
    for v in m.bm.verts:
        v.co.x += dx
    for c in r.children:
        c.location.x += dx


def _trim(m, x):
    """Cut away everything past x on the -x side: a gate's outer end, so its outer column stands
    just past the field's edge (the runtime lines the gate's bounds up with it)."""
    bm = m.bm
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=(x, 0, 0),
                           plane_no=(-1, 0, 0), clear_outer=True)


def _plate(m, size, loc, rot, cols, taper=1.0):
    """An armour plate (a box) placed and turned, painted by facing."""
    st = mark(m)
    m.box(size, (0, 0, 0), cols[1], taper=taper)
    xform(m, st, M(loc, rot))
    facet(m, new_faces(m, st), cols, noise=0.1)
    return new_faces(m, st)


def _mound(m, rng, center, size, cols=DIRT):
    st = mark(m)
    m.ball(1.0, center, cols[1], subdiv=1, scale=size, jitter=0.12 * min(size))
    facet(m, new_faces(m, st), cols, noise=0.12)


def _chain(m, top, length, color="#2a2622", hook=True):
    """A chain hanging straight down from `top`, links alternating, a hook at the end."""
    x, y, z = top
    n = max(1, int(length / 0.7))
    for i in range(n):
        m.box((0.32, 0.12 if i % 2 else 0.32, 0.62), (x, y, z - 0.35 - i * 0.7), color)
    if hook:
        zb = z - n * 0.7
        m.box((0.4, 0.4, 0.8), (x, y, zb - 0.3), RUST[2])
        m.box((1.1, 0.35, 0.35), (x + 0.35, y, zb - 0.7), RUST[2])
        m.box((0.35, 0.35, 0.6), (x + 0.75, y, zb - 0.45), RUST[2])


def _tarp(m, rng, x0, x1, y, ztop, drop, color, sag=0.5):
    """A tarp hung from a line: a sheet with a ragged hem, sagging a little."""
    n = 4
    w = (x1 - x0) / n
    for i in range(n):
        h = drop * rng.uniform(0.7, 1.0)
        m.box((w + 0.05, 0.18, h), (x0 + w * (i + 0.5), y + rng.uniform(-0.1, 0.1), ztop - h / 2 - sag * math.sin((i + 0.5) / n * math.pi)),
              color, rot=(rng.uniform(-0.15, 0.15), 0, 0))


# --- the Titan Graveyard -------------------------------------------------------------------

def _titan_body(m, rng, back_up=True):
    """A titan lying along x, head at +x: torso, pelvis, head and legs. Returns nothing; the arms are
    the caller's."""
    H = HULL
    # torso: a great chest box, the back armour on top (face down) or the chest (on its back)
    _plate(m, (17, 12, 6.2), (2, 0, 2.6), (0, 0, 0), H, taper=0.86)
    _plate(m, (12, 9, 1.8), (2.5, 0, 6.2), (0, 0, 0), H, taper=0.8)
    # pelvis
    _plate(m, (6.5, 9.5, 5.0), (-9.5, 0, 2.0), (0, 0, 0), H, taper=0.8)
    # head, turned a little
    _plate(m, (5.8, 5.6, 4.6), (14, 0.6, 2.4), (0, 0, 0.2), H, taper=0.75)
    _plate(m, (1.2, 6.2, 1.4), (14, 0.6, 4.8), (0, 0, 0.2), H, taper=0.6)          # its crest
    # shoulder pauldrons
    for s in (-1, 1):
        st = mark(m)
        m.ball(1.0, (7.5, s * 7.2, 4.0), H[2], subdiv=1, scale=(4.2, 3.4, 2.8))
        facet(m, new_faces(m, st), H, noise=0.1)
        _plate(m, (6.0, 1.2, 0.9), (7.5, s * 7.4, 6.6), (s * 0.3, 0, 0), H)
    # legs: thighs and shins splayed, knees of dark joints, feet
    for s in (-1, 1):
        hip = Vector((-11, s * 3.6, 2.2))
        knee = Vector((-22, s * 5.4, 2.0))
        foot = Vector((-33, s * 6.6 + rng.uniform(-1, 1), 1.6))
        st = mark(m)
        limb(m, hip, knee, 2.6, 2.2, H[2], segs=6)
        limb(m, knee, foot, 2.2, 1.8, H[2], segs=6)
        facet(m, new_faces(m, st), H, noise=0.1)
        m.ball(2.4, tuple(knee), HULL_DARK, subdiv=1)
        _plate(m, (5.0, 3.6, 1.2), tuple((hip + knee) / 2 + Vector((0, 0, 2.3))), (0, 0, math.atan2(knee.y - hip.y, knee.x - hip.x)), H)
        _plate(m, (4.4, 4.6, 3.0), tuple(foot + Vector((-1.5, 0, 0))), (0, 0, s * 0.2), H, taper=0.8)
    # the scars of the fight that killed it
    m.box((2.0, 10.0, 0.3), (-1.0, 0, 5.75), WAR_RED, rot=(0, 0.1, 0.2))
    m.box((3.0, 3.0, 0.6), (-3.5, -3.5, 5.6), RUST[1], rot=(0.1, 0.1, 0.4))
    m.box((1.8, 1.8, 0.7), (-3.5, -3.5, 5.7), HULL_DARK, rot=(0.1, 0.1, 0.4))
    # ash piled against it
    for x, y, sx, sy in ((2, -7.5, 9, 3.5), (2, 7.5, 9, 3.5), (-22, 0, 7, 5), (14, -4, 4, 3)):
        _mound(m, rng, (x, y, -0.4), (sx, sy, 2.2))


def fallen_titan(v):
    """GIANT: a titan fallen full length, longer than a level is wide. v0 face down, the thrusters on
    its back cold but one reactor vent still green, its right arm raised from the ash, the hand
    open above the flight line. v1 on its back, chest cracked open on the reactor, one knee drawn
    up into the sky."""
    r = root("ashgrave_fallen_titan", v)
    rng = random.Random(2000 + v)
    m = Model(f"ashgrave_fallen_titan_{v}", 2000 + v)
    _titan_body(m, rng)
    H = HULL
    if v == 0:
        # the back: two thruster bells, a vent glowing green between them
        for y in (-2.8, 2.8):
            st = mark(m)
            m.cyl(1.9, 2.4, (-2.5, y, 5.8), H[1], segs=8, r_top=1.4)
            facet(m, new_faces(m, st), H, noise=0.08)
            m.cyl(1.1, 0.3, (-2.5, y, 8.1), HULL_DARK, segs=8)
        m.box((3.0, 2.0, 0.4), (4.5, 0, 7.15), EYE, glow=True)
        m.box((1.4, 1.0, 0.45), (4.5, 0, 7.2), EYE_PALE, glow=True)
        # the left arm lying alongside
        st = mark(m)
        limb(m, (7.5, 8, 2.5), (-3, 11, 1.6), 2.2, 1.9, H[2], segs=6)
        limb(m, (-3, 11, 1.6), (-12, 13, 1.2), 1.9, 1.6, H[2], segs=6)
        facet(m, new_faces(m, st), H, noise=0.1)
        _plate(m, (4, 4, 2.4), (-14.5, 13.5, 1.2), (0, 0, 0.3), H, taper=0.8)
        # the right arm, raised: elbow in the ash, the forearm up past the flight line, hand open
        sh, el, wr = Vector((7.5, -8.5, 3.6)), Vector((6.0, -13.0, 4.5)), Vector((5.5, -14.0, 20.5))
        st = mark(m)
        limb(m, sh, el, 2.2, 2.0, H[2], segs=6)
        limb(m, el, wr, 1.9, 1.6, H[2], segs=6)
        m.ball(2.2, tuple(el), HULL_DARK, subdiv=1)
        _plate(m, (3.0, 1.2, 9.0), (5.4, -12.4, 12.0), (0.06, 0, 0), H, taper=0.7)
        m.ball(1.4, tuple(wr), HULL_DARK, subdiv=1)
        m.box((3.6, 1.6, 3.0), (5.5, -14.0, 22.4), H[2], taper=0.9)                # the palm
        for k, dx in enumerate((-1.3, -0.45, 0.45, 1.3)):
            p = Vector((5.5 + dx, -14.0, 23.9))
            d = Vector((dx * 0.15, 0.25, 1)).normalized()
            for i, L in enumerate((1.6, 1.3, 1.0)):
                q = p + d * L
                limb(m, p, q, 0.5 * 0.88 ** i, 0.44 * 0.88 ** i, H[3], segs=5)
                p = q
                d = Vector((d.x, d.y + 0.45, d.z - 0.2)).normalized()
        limb(m, (3.8, -14.2, 22.0), (2.4, -14.0, 24.0), 0.55, 0.45, H[3], segs=5)
        facet(m, new_faces(m, st), H, noise=0.1)
        m.cyl(0.8, 0.4, (5.5, -12.2, 16.0), EYE, segs=6, rot=(math.pi / 2, 0, 0), glow=True)   # a lit joint
        # the arm crosses the flight line about here
        collider(r, 5.7, -13.6, 2.6)
        _mound(m, rng, (6, -13, 0.4), (4.5, 4.0, 3.2))
        light(r, (4.5, 0, 8.5), EYE, radius=12, intensity=1.2, flicker=0.3)
        light(r, (5.5, -12.0, 16.5), EYE, radius=6, intensity=0.7, flicker=0.5)
        # its eye, the side of the head still lit
        m.box((0.4, 2.0, 0.9), (16.95, 1.4, 2.6), EYE, rot=(0, 0, 0.2), glow=True)
    else:
        # the chest cracked open: torn plates folded back and the reactor's green core inside
        m.box((6.0, 5.0, 0.5), (3.0, 0, 7.2), "#141a16")
        m.cyl(2.2, 0.5, (3.0, 0, 7.2), EYE, segs=8, glow=True)
        m.cyl(1.1, 0.6, (3.0, 0, 7.3), EYE_PALE, segs=6, glow=True)
        for a in (0.3, 1.8, 3.6, 5.0):
            _plate(m, (3.4, 2.2, 0.4), (3.0 + math.cos(a) * 3.8, math.sin(a) * 3.4, 7.6), (math.sin(a) * 0.6, -math.cos(a) * 0.5, a), RUST)
        # its arms flung out
        for s, ang in ((-1, -0.5), (1, 0.4)):
            sh = Vector((7.5, s * 8.5, 3.6))
            el = sh + Vector((math.cos(ang) * 8, s * 7, -1.2))
            wr = el + Vector((math.cos(ang) * 6 + 4, s * 4, -0.6))
            st = mark(m)
            limb(m, sh, el, 2.2, 1.9, H[2], segs=6)
            limb(m, el, wr, 1.9, 1.6, H[2], segs=6)
            facet(m, new_faces(m, st), H, noise=0.1)
            m.ball(2.0, tuple(el), HULL_DARK, subdiv=1)
            _plate(m, (3.6, 3.6, 1.6), tuple(wr + Vector((1.5, 0, 0))), (0, 0, 0), H)
        # the knee drawn up past the flight line
        hip = Vector((-11, -3.6, 4.0))
        knee = Vector((-16.5, -5.0, 15.0))
        foot = Vector((-21.0, -6.0, 1.5))
        st = mark(m)
        limb(m, hip, knee, 2.5, 2.3, H[2], segs=6)
        limb(m, knee, foot, 2.3, 2.0, H[2], segs=6)
        m.ball(2.6, tuple(knee), HULL_DARK, subdiv=1)
        _plate(m, (3.0, 4.0, 5.0), tuple(knee + Vector((0.3, -1.0, 0.2))), (0.3, -0.35, 0), H, taper=0.7)   # the knee guard
        _plate(m, (4.4, 4.6, 3.0), tuple(foot + Vector((-0.5, -0.6, 0.6))), (0, 0, 0), H, taper=0.8)
        facet(m, new_faces(m, st), H, noise=0.1)
        m.box((0.4, 0.4, 0.4), (-16.5, -7.6, 16.2), "#ff3a2a", glow=True)
        collider(r, -14.2, -4.5, 3.1)
        collider(r, -18.2, -5.4, 3.0)
        light(r, (3, 0, 9), EYE, radius=14, intensity=1.4, flicker=0.2)
    m.build(r)
    return r


def titan_spine(v):
    """SPAN: a titan's spine propped across the field on its own ribs, vertebrae like bunkers, ribs
    and cables hanging under it (v0). A titan's cannon, its barrel thrown across on a wrecked
    turret at one end and a broken pylon at the other (v1)."""
    r = root("ashgrave_titan_spine", v)
    rng = random.Random(2020 + v)
    m = Model(f"ashgrave_titan_spine_{v}", 2020 + v)
    H = HULL
    if v == 0:
        # a Concord titan's spine: vertebrae like bunkers, each a drum with a fin raised over it and
        # wings out to the sides, discs between them (every third still lit), ribs curling down from
        # the wings, cables looping under; propped at each end on splayed ribs out past the field
        C = IVORY
        n = 12
        prev = None
        for i in range(n):
            x = -44 + i * 88 / (n - 1)
            z = 16.6 + 1.0 * math.cos(x / 44 * math.pi / 2)
            y = math.sin(x * 0.05) * 1.4
            yaw = rng.uniform(-0.08, 0.08)
            st = mark(m)
            m.cyl(2.3, 5.6, (x - 2.8, y, z), C[2], segs=7, r_top=2.0, rot=(0, math.pi / 2, yaw))   # the drum
            m.box((1.0, 3.0, 3.6), (x + 0.3, y, z + 2.6), C[3], rot=(0, 0.35, yaw), taper=0.35)   # the fin
            for sd in (-1, 1):                                                               # the wings
                m.box((2.2, 4.2, 1.0), (x, y + sd * 3.9, z + 0.4), C[2], rot=(sd * 0.18, 0, yaw), taper=0.7)
            facet(m, new_faces(m, st), C, noise=0.1)
            if i % 3 == 1:
                _plate(m, (3.4, 3.8, 0.6), (x, y, z + 2.2), (0, 0.1, yaw + 0.2), GUNMETAL)     # a Host plate bolted over
                m.box((3.0, 0.5, 0.2), (x, y - 1.0, z + 2.55), HOST_YELLOW, rot=(0, 0.1, yaw + 0.2))
            elif i % 3 == 2:
                m.box((0.7, 3.1, 0.7), (x + 0.9, y, z + 3.2), OXBLOOD, rot=(0, 0.35, yaw))      # the old paint on its fin
            if prev:                                                                         # the disc between
                lit = i % 3 == 0
                m.cyl(1.9, x - prev[0] - 5.2, (prev[0] + 2.6, (prev[1] + y) / 2, (prev[2] + z) / 2),
                      C[1], segs=7, rot=(0, math.pi / 2, 0))
                if lit:
                    m.cyl(1.85, 0.5, ((prev[0] + x) / 2, (prev[1] + y) / 2, (prev[2] + z) / 2), EYE, segs=7,
                          rot=(0, math.pi / 2, 0), glow=True)
            prev = (x, y, z)
            # ribs curling down from the wing tips, cut off above the flight line
            if 1 <= i <= n - 2:
                for sd in (-1, 1):
                    if rng.random() < 0.25:
                        continue
                    L = rng.uniform(0.7, 1.2)
                    a = Vector((x, y + sd * 5.8, z + 0.2))
                    b = Vector((x + rng.uniform(-1, 1), y + sd * 7.6 * L, z - 1.0 * L))
                    c = Vector((x + rng.uniform(-1.5, 1.5), y + sd * 8.4 * L, max(13.8, z - 2.6 * L)))
                    st = mark(m)
                    limb(m, a, b, 0.75, 0.62, C[2], segs=5)
                    m.ball(0.66, tuple(b), C[2], subdiv=0)
                    limb(m, b, c, 0.62, 0.3, C[3], segs=5)
                    facet(m, new_faces(m, st), C, noise=0.1)
            # cables looping under between the drums
            if i % 2 == 1 and i < n - 1:
                x2 = x + 88 / (n - 1)
                for k, dy in enumerate((-1.3, 1.1)):
                    lo = (x + x2) / 2
                    limb(m, (x + 1, y + dy, z - 1.8), (lo, y + dy + 0.3, 13.4 + k * 0.4), 0.22, 0.22, "#1a1e1c", segs=4)
                    limb(m, (lo, y + dy + 0.3, 13.4 + k * 0.4), (x2 - 1, y + dy, z - 1.8), 0.22, 0.22, "#1a1e1c", segs=4)
        # the ends rest on ribs splayed into the ash, out past the field
        for s in (-1, 1):
            for dy in (-4.5, 4.5):
                st = mark(m)
                limb(m, (s * 44, dy * 0.3, 16), (s * 43 + s * 2, dy, -3), 1.8, 1.4, C[3], segs=6)
                facet(m, new_faces(m, st), C, noise=0.1)
                collider(r, s * 44.5, dy * 0.6, 2.0)
            _mound(m, rng, (s * 45, 0, -1.0), (6, 7, 3))
        light(r, (-5, -3.6, 16), EYE, radius=8, intensity=0.6, flicker=0.4)
    else:
        # the barrel, tapering a little, banded, its muzzle brake at the right
        st = mark(m)
        limb(m, (-40, 0, 17.0), (44, 0, 15.6), 2.6, 2.2, H[2], segs=8)
        facet(m, new_faces(m, st), H, noise=0.08)
        for k in range(9):
            x = -34 + k * 9
            z = 17.0 - (x + 40) / 84 * 1.4
            st = mark(m)
            m.cyl(2.9, 1.2, (x, 0, z), H[1], segs=8, rot=(0, math.pi / 2, 0))
            facet(m, new_faces(m, st), H, noise=0.08)
        for k in range(4):
            m.box((0.6, 6.6, 1.2), (34 + k * 2.4, 0, 15.8 + (k % 2) * 0.3), H[3] if k % 2 else HULL_DARK)
        m.box((30, 0.4, 0.4), (-8, -2.45, 17.0), WAR_RED, rot=(0, -0.016, 0))
        # cables and a gun-crew platform hanging off it
        for x in (-20, -6, 12):
            limb(m, (x, 1.8, 15.8), (x + 1.0, 2.6, 13.4), 0.2, 0.2, "#1a1e1c", segs=4)
        _plate(m, (7, 3.4, 0.5), (2, -3.8, 14.0), (0.25, 0, 0), STEEL)
        # the wrecked turret at the breech end, out past the left edge
        _plate(m, (12, 14, 9), (-44, 0, 1.5), (0, 0, 0.1), H, taper=0.8)
        _plate(m, (8, 9, 5), (-44, 0, 8.0), (0, 0, 0.1), H, taper=0.7)
        _plate(m, (6, 7, 6), (-42, 0, 14.0), (0, 0.2, 0.1), H, taper=0.8)
        m.box((2.0, 4.0, 1.0), (-48, 4, 11.0), EYE, glow=True)
        collider(r, -44, 0, 6.0)
        # the broken pylon holding up the muzzle end
        st = mark(m)
        _column(m, rng, 43, 0, [(-3, 4.2), (6, 3.4), (12.8, 2.8)], STEEL, sides=6)
        for a in range(4):
            limb(m, (43, 0, 12.0), (43 + math.cos(a * 1.6) * 3, math.sin(a * 1.6) * 3, 14.0 + a * 0.3), 0.5, 0.3, RUST[2], segs=4)
        collider(r, 43, 0, 3.6)
        _mound(m, rng, (-45, 0, -1.0), (7, 8, 3))
        light(r, (-48, 4, 12), EYE, radius=8, intensity=0.8, flicker=0.4)
    m.build(r)
    return r


# --- the Glass Craters -----------------------------------------------------------------------

def fulgurite(v):
    """GATE: spires of fused glass where the big guns struck, dark green and glowing in their cracks,
    branching like frozen lightning, the innermost snapped off low; v1 has a sheet of glass flung
    between two crowns, to fly under."""
    r = root("ashgrave_fulgurite", v)
    rng = random.Random(2060 + v)
    m = Model(f"ashgrave_fulgurite_{v}", 2060 + v)
    if v == 0:
        cols = [(-19, 0, 1.8, 22), (-6, 1.5, 2.4, 27), (6.5, -1.0, 2.6, 19), (18.5, 0.5, 2.2, 7)]
    else:
        cols = [(-18, 0.5, 1.8, 20), (-4.6, -1.0, 2.4, 21), (7.4, 1.0, 2.4, 25), (19.8, -0.5, 2.2, 6.5)]
    for x, y, rr, h in cols:
        lean = (rng.uniform(-1.2, 1.2), rng.uniform(-0.8, 0.8))
        st = mark(m)
        stub = h < 9
        levels = [(-1.5, rr * 1.6), (4, rr * 1.15), (h, rr * 0.8)] if stub else \
            [(-1.5, rr * 1.6), (4, rr * 1.15), (10, rr), (h * 0.8, rr * 0.7), (h, rr * 0.2)]
        _column(m, rng, x, y, levels, GLASS[:3], sides=5, lean=lean)
        fs = new_faces(m, st)
        facet(m, fs, GLASS, noise=0.25, bias=-0.15)
        # forks branching off (low, and high above the flight line), glowing at the tips
        for zb, L in ((rng.uniform(1, 4), rng.uniform(4, 6)), (h * 0.65, rng.uniform(4, 7)), (h * 0.8, rng.uniform(3, 5))):
            a = rng.uniform(0, math.tau)
            d = (math.cos(a) * 0.8, math.sin(a) * 0.8, 1.0 if zb > 10 else 0.5)
            base = (x + lean[0] * zb / h, y + lean[1] * zb / h, zb)
            if zb < 10:
                L = min(L, 3.0)
            st = mark(m)
            crystal(m, base, d, rr * 0.45, L, rr * 0.9, GLASS[0], segs=4, twist=rng.uniform(0, 1))
            facet(m, new_faces(m, st), GLASS, noise=0.25, bias=-0.05)
        # a glowing crack spiralling up it
        for k in range(5):
            z = 2 + k * (h - 4) / 5
            a = k * 1.3 + rng.uniform(0, 0.5)
            rad = rr * (1.15 - 0.4 * z / h)
            m.box((0.5, rad * 1.1, 1.4), (x + lean[0] * z / h + math.cos(a) * rad * 0.8, y + lean[1] * z / h + math.sin(a) * rad * 0.8, z),
                  "#6affa0", rot=(0.3, 0, a), glow=True)
        # the glass pool it stands in
        m.cyl(rr * 2.6, 0.2, (x + (rr * 1.2 if x < -15 else 0), y, -0.1), GLASS[1], segs=8)
        m.cyl(rr * 1.9, 0.24, (x + 0.3 + (rr * 1.2 if x < -15 else 0), y - 0.2, -0.08), "#2a8a4a", segs=8, glow=True)
        if not stub:
            collider(r, x + lean[0] * 10 / h, y + lean[1] * 10 / h, rr + (0.5 if x < -15 else 0.2))
    if v == 1:
        # the glass sheet, splashed between two crowns and frozen there
        pts = []
        for k in range(14):
            t = k / 13
            x = -18 + t * 13.4 + rng.uniform(-0.5, 0.5)
            z = 15.5 + math.sin(t * math.pi) * 2.2 + rng.uniform(-0.3, 0.3)
            for s in (-1, 1):
                pts.append((x, s * rng.uniform(2.0, 3.6), z + rng.uniform(-0.2, 0.4)))
        f = hull(m, pts, GLASS[1])
        facet(m, f, GLASS, noise=0.2, bias=-0.1)
        for k in range(5):
            x = -15.5 + k * 2.4
            m.cyl(0.3, 1.2, (x, rng.uniform(-1.5, 1.5), 14.4), "#6affa0", segs=4, r_top=0, rot=(math.pi, 0, 0), glow=True)
    _trim(m, cols[0][0] - 2.4)
    _centre(m, r)
    m.build(r)
    light(r, (0, 0, 8), EYE, radius=14, intensity=0.8, halo=False)
    return r


def glass_ship(v):
    """GIANT: a starship shot down so hot it fused into the ground, its hull half sunk in a lake of
    green glass, the bridge tower snapped, one engine still faintly lit (v0). A wave of molten glass
    frozen mid-splash round the crater it came from (v1)."""
    r = root("ashgrave_glass_ship", v)
    rng = random.Random(2080 + v)
    m = Model(f"ashgrave_glass_ship_{v}", 2080 + v)
    # the glass lake: dark as a bottle, baked sand round its edge, light only in a seam and the cracks
    for k, (sx, sy, z, col, glow) in enumerate(((31, 19, -0.25, FUSED[2], False), (29, 17.5, -0.2, BOTTLE[0], False),
                                                 (24, 14, -0.1, BOTTLE[1], False), (17, 10, 0.0, BOTTLE[2], False))):
        pts = []
        for i in range(14):
            a = i / 14 * math.tau
            kk = 1 + rng.uniform(-0.08, 0.08) + 0.08 * math.sin(a * 3 + k)
            pts.append((math.cos(a) * sx * kk, math.sin(a) * sy * kk))
        m.slab(pts, z - 0.3, z + 0.12, col, glow=glow)
    for k in range(9):                                                       # cracks, lit from under
        a = rng.uniform(0, math.tau)
        d = rng.uniform(8, 20)
        m.box((rng.uniform(3, 6), 0.45, 0.1), (math.cos(a) * d, math.sin(a) * d * 0.6, 0.1), SEAM[0], rot=(0, 0, a + rng.uniform(-0.6, 0.6)), glow=True)
    if v == 0:
        # the hull: a long faceted wedge, nose buried, lying a little on its side, its plating in bands
        LIV = ["#2e3034", "#4a4c50", "#7a7a76", "#a8a69c", "#cfcbbe"]
        LIV2 = ["#2a2420", "#4a3628", "#6e4e34", "#9a6e44", "#b88a58"]   # bands of rust-red livery
        st = mark(m)
        pts = []
        for x, w, h in ((-22, 5.0, 4.0), (-14, 6.5, 6.0), (-2, 7.0, 6.6), (10, 6.0, 6.0), (19, 3.6, 4.0), (24, 1.0, 2.0)):
            for sd in (-1, 1):
                pts.append((x, sd * w, -1.5))
                pts.append((x, sd * w * 0.75, h * 0.7))
            pts.append((x, 0, h))
        f = hull(m, pts, STEEL[1])
        facet(m, f, LIV, noise=0.08)
        for fc in f:                                                          # the livery: every third band rust-red
            c = fc.calc_center_median()
            if int((c.x + 30) // 5) % 3 == 1 and fc.normal.z > 0.2:
                d = fc.normal.dot(Vector((-0.45, 0.35, 0.82)))
                fc.material_index = m._slot(LIV2[max(0, min(4, int((d + 1) / 2 * 5)))], False)
        # plating seams across the top
        for x in (-17, -12, -7, 9, 14, 18):
            m.box((0.35, 9.4, 0.3), (x, 0, 6.0 - abs(x) * 0.08), "#24262a")
        # the breach: plating burnt off amidships, the frames standing over the dark inside
        m.box((9.0, 7.6, 0.5), (1.0, 0, 6.15), "#141518")
        for k in range(5):
            x = -2.6 + k * 1.8
            st = mark(m)
            path_tube_ = [(x, -4.2, 4.6), (x, -2.4, 6.6), (x, 0, 7.1), (x, 2.4, 6.6), (x, 4.2, 4.6)]
            for i in range(4):
                if k == 2 and i == 2:
                    continue                                                 # one frame broken through
                limb(m, path_tube_[i], path_tube_[i + 1], 0.32, 0.32, STEEL[2], segs=4)
            facet(m, new_faces(m, st), STEEL, noise=0.1)
        m.box(( 8.0, 0.5, 0.5), (1.0, 0, 7.05), STEEL[1])                  # the keel beam over it
        m.box((1.6, 1.2, 0.3), (2.5, -1.6, 6.5), "#5affb0", glow=True)    # glass that ran into the hull, still lit
        # the dorsal spine aft, two turret rings on it, an antenna mast
        _plate(m, (12, 1.6, 1.0), (-14, 0, 6.3), (0, -0.04, 0), LIV, taper=0.8)
        for x in (-17, -11):
            m.cyl(1.4, 0.5, (x, 1.8, 5.7), LIV[1], segs=8)
            m.cyl(0.9, 0.55, (x, 1.8, 5.7), "#1a1c20", segs=8)
        limb(m, (-19, -1.0, 6.4), (-19.5, -1.4, 8.3), 0.18, 0.12, STEEL[1], segs=4)
        # the canopy at the bow, a dark wedge with a glint
        m.box((4.0, 3.2, 1.0), (16.5, 0, 4.4), "#14201c", rot=(0, 0.22, 0), taper=0.6)
        m.box((1.2, 1.4, 0.2), (16.0, -0.6, 5.0), SEAM_PALE[0], rot=(0, 0.22, 0), glow=True)
        m.box((8, 1.3, 0.3), (-4, -3.0, 6.0), HAZARD)
        # the bridge tower, snapped and lying across the flank in the glass
        _plate(m, (9, 3.4, 2.4), (2, 8.5, 1.6), (0.3, 0.2, 0.9), LIV[:4])
        m.box((3.0, 0.3, 0.6), (2.2, 7.0, 2.6), "#5affb0", glow=True, rot=(0.3, 0.2, 0.9))
        # engines at the tail on their pylons, one still glowing
        for y, lit in ((-4.2, True), (4.2, False)):
            st = mark(m)
            m.cyl(2.3, 5.0, (-20, y, 2.0), LIV[2], segs=8, rot=(0, -math.pi / 2, 0))
            m.cyl(2.5, 0.6, (-22.0, y, 2.0), LIV[1], segs=8, rot=(0, -math.pi / 2, 0))
            facet(m, new_faces(m, st), LIV, noise=0.08)
            m.cyl(1.7, 0.4, (-25.1, y, 2.0), "#ff8a3a" if lit else "#1a1a1e", segs=8, rot=(0, -math.pi / 2, 0), glow=lit)
            m.box((3.0, 2.0, 0.8), (-19, y * 0.6, 3.6), LIV[1])
        # glass welling up over the bow and along the flanks, set in drips
        for x, y in ((20, 0), (14, -6.5), (14, 6.5), (4, -7.5), (-8, 7.2), (-14, -7.0)):
            st = mark(m)
            _chunk(m, rng, (x - 3.0, y - 2.2, -1), (x + 3.0, y + 2.2, rng.uniform(2.0, 3.6)), BOTTLE, n=10)
            facet(m, new_faces(m, st), BOTTLE[1:] + [SEAM], noise=0.2, bias=-0.15)
        light(r, (-26, -3.6, 2), "#ff8a3a", radius=8, intensity=0.9, flicker=0.3)
        m.build(r).scale = (1, 1, 0.9)
        return r
    else:
        # the frozen splash: a curling crest of glass round half the crater, shards flung off it
        for k in range(16):
            a = -0.4 + k / 15 * math.pi * 1.3
            d = 19 + rng.uniform(-1, 1)
            h = 3.0 + 4.5 * math.sin(k / 15 * math.pi)
            x, y = math.cos(a) * d, math.sin(a) * d * 0.8
            st = mark(m)
            pts = [(x + math.cos(a) * dx - math.sin(a) * dy, y + math.sin(a) * dx + math.cos(a) * dy, z)
                   for dx, dy, z in ((-3, -2.5, -0.5), (-3, 2.5, -0.5), (3, -2.5, -0.5), (3, 2.5, -0.5),
                                     (-0.5, -2.2, h * 0.7), (-0.5, 2.2, h * 0.7), (-2.6, -1.6, h), (-2.6, 1.6, h),
                                     (-4.5, -1.0, h * 0.75), (-4.5, 1.0, h * 0.75))]
            f = hull(m, pts, GLASS[1])
            facet(m, f, GLASS, noise=0.25, bias=-0.1)
            if k % 3 == 0:
                m.cyl(0.4, 1.6, (x - math.cos(a) * 4.2, y - math.sin(a) * 3.4, h * 0.75 - 1.4), "#6affa0", segs=4, r_top=0,
                      rot=(math.pi, 0, 0), glow=True)
        # the crater's heart: shards standing up out of the glow
        for k in range(9):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(1, 8)
            st = mark(m)
            crystal(m, (math.cos(a) * d, math.sin(a) * d, -0.3), (math.cos(a) * 0.4, math.sin(a) * 0.4, 1), rng.uniform(0.6, 1.1),
                    rng.uniform(2.5, 6.0), 1.6, GLASS[0], segs=4, twist=rng.uniform(0, 1))
            facet(m, new_faces(m, st), GLASS, noise=0.2)
        light(r, (0, 0, 3), EYE, radius=18, intensity=1.2, flicker=0.1)
    m.build(r)
    return r


def glass_bubble(v):
    """Scenery: blisters in the glass, domes that cooled with gas inside, dark as bottles, sat on a
    skirt of baked sand; one cracked open, glowing."""
    r = root("ashgrave_glass_bubble", v)
    rng = random.Random(2100 + v)
    m = Model(f"ashgrave_glass_bubble_{v}", 2100 + v)
    spots = {0: [(0, 0, 1.3, False), (1.5, -0.6, 0.6, False)],
             1: [(0, 0, 1.0, True), (1.4, 0.7, 0.65, False), (-1.1, 1.0, 0.5, False), (-0.6, -1.2, 0.4, False)],
             2: [(0, 0, 1.6, True), (-1.8, 0.4, 0.55, False)]}[v]
    dark = [BOTTLE_S[0], BOTTLE_S[1], BOTTLE_S[2], BOTTLE_S[3]]
    for x, y, s, cracked in spots:
        m.cyl(s * 1.3, 0.12, (x, y, -0.05), "#5a5440", segs=8)
        st = mark(m)
        m.ball(s, (x, y, -s * 0.25), dark[1], subdiv=1, scale=(1, 1, 0.75), jitter=0.06 * s)
        fs = new_faces(m, st)
        if cracked:
            for f in list(fs):
                c = f.calc_center_median()
                if c.z > s * 0.25 and (c.x - x) > -s * 0.2:
                    m.bm.faces.remove(f)
            fs = new_faces(m, st)
            m.cyl(s * 0.72, 0.2, (x, y, 0), "#2ac070", segs=8, glow=True)
            m.cyl(s * 0.32, 0.25, (x, y, 0), "#c0ffd8", segs=6, glow=True)
        facet(m, fs, dark, noise=0.2, bias=0.05)
        m.ball(s * 0.22, (x - s * 0.4, y + s * 0.35, s * 0.42), "#8affb8", subdiv=0, glow=True)   # a glint
    m.build(r, rot_z=rng.uniform(0, math.tau))
    if v != 0:
        light(r, (0, 0, 1), EYE, radius=4, intensity=0.5, halo=False)
    return r


def shell_casing(v):
    """Scenery: spent shell casings from the titans' guns, brass gone brown, half sunk in the glass:
    lying on its side (v0), standing in a cluster (v1)."""
    r = root("ashgrave_shell_casing", v)
    rng = random.Random(2120 + v)
    m = Model(f"ashgrave_shell_casing_{v}", 2120 + v)
    if v == 0:
        st = mark(m)
        m.cyl(1.1, 5.0, (-2.5, 0, 0.6), BRASS[1], segs=8, rot=(0, math.pi / 2, 0))
        m.cyl(1.3, 0.4, (-2.7, 0, 0.6), BRASS[0], segs=8, rot=(0, math.pi / 2, 0))
        facet(m, new_faces(m, st), BRASS, noise=0.08)
        m.cyl(0.8, 0.1, (2.52, 0, 0.6), "#1a1410", segs=8, rot=(0, math.pi / 2, 0))
        m.cyl(1.8, 0.15, (0, 0, -0.05), GLASS[1], segs=8)
    else:
        for x, y, h in ((0, 0, 3.0), (1.6, 0.8, 2.4), (-1.2, 1.3, 2.0), (0.6, -1.6, 1.6)):
            st = mark(m)
            m.cyl(0.75, h, (x, y, -0.3), BRASS[1], segs=8)
            m.cyl(0.85, 0.3, (x, y, -0.3), BRASS[0], segs=8)
            facet(m, new_faces(m, st), BRASS, noise=0.1)
            m.cyl(0.55, 0.05, (x, y, h - 0.28), "#1a1410", segs=8)
        m.cyl(2.6, 0.15, (0, 0, -0.05), GLASS[1], segs=9)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


# --- the Scav Camp ---------------------------------------------------------------------------

def _stack(m, rng, x, y, top, w=6.0, d=5.0):
    """A tower of scrap: containers and plates piled up to `top`, a bit askew."""
    z = -1.0
    cols = [RUST[1], "#3e6a6a", HAZARD, RUST[2], "#6a3a3a", HULL[2], "#4a5a7a"]
    while z < top - 0.5:
        h = min(rng.uniform(2.2, 3.2), top - z)
        st = mark(m)
        c = rng.choice(cols)
        m.box((w * rng.uniform(0.85, 1.05), d * rng.uniform(0.85, 1.05), h), (0, 0, 0), c)
        # ribbing down the sides
        for k in range(3):
            m.box((w * 1.02, 0.25, h * 0.9), (0, -d / 2 + (k + 0.5) * d / 3, 0), c)
        xform(m, st, M((x + rng.uniform(-0.4, 0.4), y + rng.uniform(-0.4, 0.4), z + h / 2), (0, 0, rng.uniform(-0.12, 0.12))))
        facet(m, new_faces(m, st), [RUST[0], c, c, "#9a8a7a"], noise=0.1)
        z += h


def scrap_gantry(v):
    """SPAN: a gantry the clans built from scrap across the camp: girders welded into a truss on
    container towers, tarps and hooks on chains hanging from it, lamps strung along (v0). A line
    bridge, cables between two scrap towers, bunting and a hanging cage (v1)."""
    r = root("ashgrave_scrap_gantry", v)
    rng = random.Random(2160 + v)
    m = Model(f"ashgrave_scrap_gantry_{v}", 2160 + v)
    for s in (-1, 1):
        x = s * 43
        _stack(m, rng, x, 0, 22 if v == 1 else 18.5, w=7.0, d=7.0)
        collider(r, x, 0, 4.2)
        m.box((1.4, 1.4, 1.6), (x, 3.6, 19.6 if v == 0 else 23.0), FIRE[1], glow=True)
        light(r, (x, 3.6, 20 if v == 0 else 23.5), FIRE[1], radius=7, intensity=1.0, flicker=0.5)
        emitter(r, (x, 3.6, 21 if v == 0 else 24), "embers")
    if v == 0:
        # the truss: rusty chords, a zigzag of scrap, plates laid on top unevenly
        for y in (-3, 3):
            for z in (14.4, 18.0):
                limb(m, (-44, y, z + rng.uniform(-0.2, 0.2)), (44, y, z + rng.uniform(-0.2, 0.2)), 0.55, 0.55, RUST[1], segs=4)
            for i in range(22):
                x = -42 + i * 4
                limb(m, (x, y, 14.4), (x + 4, y, 18.0) if i % 2 else (x + 4, y, 14.4), 0.3, 0.3, RUST[2], segs=4)
                limb(m, (x, y, 14.4), (x, y, 18.0), 0.3, 0.3, RUST[0], segs=4)
        x = -40
        while x < 40:
            w = rng.uniform(3.5, 7)
            if rng.random() < 0.8:
                _plate(m, (w, rng.uniform(5.5, 7.5), 0.4), (x + w / 2, rng.uniform(-0.6, 0.6), 18.5), (rng.uniform(-0.06, 0.06), rng.uniform(-0.06, 0.06), rng.uniform(-0.1, 0.1)),
                       rng.choice((HULL, RUST, STEEL + ["#9a9aa0"])))
            x += w + rng.uniform(0, 2)
        # tarps hanging off the side, hooks and chains under it, lamps
        for x0, col in ((-30, TARP[0]), (-12, TARP[3]), (8, TARP[1]), (22, TARP[2])):
            _tarp(m, rng, x0, x0 + rng.uniform(5, 8), rng.choice((-3.3, 3.3)), 18.0, 4.4, col, sag=0.3)
        for x in (-24, -4, 15, 32):
            _chain(m, (x, 0, 14.2), 0.8)
        for x in range(-36, 37, 9):
            m.ball(0.45, (x, -3.4, 13.8), LAMP, subdiv=0, glow=True)
            limb(m, (x, -3, 14.3), (x, -3.4, 14.0), 0.1, 0.1, "#2a2622", segs=4)
            light(r, (x, -3.4, 13.6), LAMP, radius=5, intensity=0.6, flicker=0.25)
    else:
        sag = lambda x: 21.0 - 4.0 * (1 - (x / 43) ** 2)
        for y in (-2.4, 2.4):
            n = 16
            pts = [Vector((-43 + 86 * i / n, y, sag(-43 + 86 * i / n))) for i in range(n + 1)]
            for a, b in zip(pts, pts[1:]):
                limb(m, a, b, 0.3, 0.3, "#1e1a18", segs=4)
        # a walkway of planks and plates slung on the cables
        for i in range(-38, 39, 2):
            m.box((1.6, 5.4, 0.3), (i, 0, sag(i) - 0.3), rng.choice(("#6a5a42", "#5a4a36", RUST[2], "#7a6a4a")),
                  rot=(rng.uniform(-0.05, 0.05), 0, rng.uniform(-0.1, 0.1)))
        # bunting: a line of flags in every tarp colour
        for i in range(-40, 41, 2):
            z = sag(i) + 2.0 - 0.8 * (1 - (i / 43) ** 2)
            m.prism([(-0.6, 0), (0.6, 0), (0, -1.1)], 0.1, (i, 2.8, z), TARP[(i // 2) % 5], rot=(0, 0, 0))
        for i in range(-40, 41, 8):
            limb(m, (i, 2.6, sag(i)), (i, 2.8, sag(i) + 2.0 - 0.8 * (1 - (i / 43) ** 2)), 0.12, 0.12, "#2a2622", segs=4)
        # the hanging cage, a captive's
        cx = -9
        cz = sag(cx) - 0.6
        limb(m, (cx, 0, cz), (cx, 0, cz - 1.2), 0.15, 0.15, "#1e1a18", segs=4)
        for k in range(6):
            a = k / 6 * math.tau
            limb(m, (cx + math.cos(a) * 1.4, math.sin(a) * 1.4, cz - 1.2), (cx + math.cos(a) * 1.4, math.sin(a) * 1.4, 13.6), 0.15, 0.15, RUST[1], segs=4)
        m.cyl(1.6, 0.3, (cx, 0, 13.4), RUST[2], segs=6)
        m.cyl(1.4, 0.4, (cx, 0, cz - 1.4), RUST[1], segs=6, r_top=0.3)
        for x in (-28, 6, 24):
            m.ball(0.45, (x, -2.6, sag(x) - 1.0), LAMP, subdiv=0, glow=True)
            light(r, (x, -2.6, sag(x) - 1.2), LAMP, radius=5, intensity=0.6, flicker=0.3)
    m.build(r)
    return r


def scrap_wall(v):
    """GATE: the camp's wall, towers of scrap with narrow gaps between, spiked on top and hung with
    clan banners, chains slung between the tops (v0); wrecked haulers stood on end, a gun on the
    tallest (v1)."""
    r = root("ashgrave_scrap_wall", v)
    rng = random.Random(2180 + v)
    m = Model(f"ashgrave_scrap_wall_{v}", 2180 + v)
    if v == 0:
        towers = [(-20.25, 0, 17), (-6.75, 0.8, 20), (6.75, -0.6, 16), (20.25, 0.4, 19)]
        for x, y, h in towers:
            _stack(m, rng, x, y, h, w=3.0 if x < -15 else 4.2, d=4.2)
            for k in range(4):
                a = k / 4 * math.tau + 0.5
                limb(m, (x + math.cos(a) * 1.6, y + math.sin(a) * 1.6, h), (x + math.cos(a) * 2.6, y + math.sin(a) * 2.6, h + 2.6), 0.35, 0.05, RUST[2], segs=4)
            m.box((0.25, 3.0, 6.0), (x + 2.5, y, h - 4.0), rng.choice((TARP[2], TARP[0], WAR_RED)))         # a banner
            m.box((0.3, 3.0, 0.6), (x + 2.55, y, h - 3.0), "#e8d8a0")
            collider(r, x, y, 3.0 if x < -15 else 3.7)
        for (x0, y0, h0), (x1, y1, h1) in zip(towers, towers[1:]):
            n = 10
            for i in range(n + 1):
                t = i / n
                z = min(h0, h1) - 1.0 - math.sin(t * math.pi) * 2.0
                m.box((0.4, 0.3, 0.4), (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, max(13.4, z)), "#2a2622")
    else:
        towers = [(-20.25, 0, 18, 0.2), (-6.75, 0.6, 22, -0.1), (6.75, -0.6, 17, 0.15), (20.25, 0.5, 15, -0.2)]
        for x, y, h, tilt in towers:
            st = mark(m)
            m.box((3.2 if x < -15 else 4.4, 4.8, h + 1), (0, 0, (h + 1) / 2 - 1), HULL[2], taper=0.85)
            m.box((4.6, 1.6, h * 0.6), (0, -2.0, h * 0.35), RUST[2])
            m.box((3.6, 4.4, 2.0), (0, 0, h + 0.5), STEEL[1])
            xform(m, st, M((x, y, 0), (0, tilt * 0.15, rng.uniform(-0.3, 0.3))))
            facet(m, new_faces(m, st), HULL, noise=0.1)
            for zz in (3.0, 8.0):
                m.box((4.8, 0.4, 0.8), (x, y - 2.5, zz), HAZARD)
            # wheels still on, sticking out (low, and high)
            for zz in (2.0, h - 3.0):
                m.cyl(1.5, 0.8, (x + 2.3, y, zz), "#1e1e22", segs=8, rot=(0, math.pi / 2, 0))
            collider(r, x, y, 3.3 if x < -15 else 3.7)
        # a gun on the tallest, a lamp on each
        limb(m, (-6.75, 0.6, 23.5), (-6.75, -6, 24.5), 0.6, 0.5, STEEL[0], segs=6)
        m.box((3, 3, 1.6), (-6.75, 0.6, 23.4), HULL[1])
        for x, y, h, _ in towers:
            m.ball(0.6, (x, y - 2.2, h + 0.6), LAMP, subdiv=0, glow=True)
        # a crossbar between the middle two to fly under
        limb(m, (-6.75, 0.6, 16.5), (6.75, -0.6, 15.5), 0.9, 0.9, RUST[1], segs=5)
        for x in (-3, 0, 3):
            _chain(m, (x, 0, 15.6), 1.0)
    _trim(m, towers[0][0] - 2.6)
    _centre(m, r)
    m.build(r)
    light(r, (0, 0, 14), FIRE[1], radius=12, intensity=0.6, flicker=0.3, halo=False)
    return r


def crawler_town(v):
    """GIANT: a crawler town, a tracked rig the size of a village grinding through the ash, shacks
    and tarps on its deck, a forge glowing in its middle, a crane (v0); a bucket wheel at its
    front, ore heaped in its hopper (v1)."""
    r = root("ashgrave_crawler_town", v)
    rng = random.Random(2200 + v)
    m = Model(f"ashgrave_crawler_town_{v}", 2200 + v)
    L, W = 40, 22
    # the tracks
    for s in (-1, 1):
        st = mark(m)
        m.box((L, 5.0, 3.6), (0, s * (W / 2 - 2.5), 1.6), "#2a2624")
        for i in range(20):
            m.box((0.8, 5.3, 3.9), (-L / 2 + 1 + i * 2, s * (W / 2 - 2.5), 1.6), "#3a3430")
        facet(m, new_faces(m, st), ["#1a1614", "#2a2624", "#3a3430", "#4a443e"], noise=0.05)
        for x in (-14, -5, 5, 14):
            m.cyl(1.6, 0.4, (x, s * (W / 2 + 0.1), 1.6), RUST[2], segs=8, rot=(math.pi / 2, 0, 0))
    # the hull and deck
    _plate(m, (L - 2, W - 6, 3.0), (0, 0, 4.4), (0, 0, 0), HULL, taper=0.95)
    m.box((L, W, 0.5), (0, 0, 6.0), "#5a4a3a")
    for x in range(-18, 19, 3):
        m.box((0.3, W, 0.55), (x, 0, 6.05), "#4a3a2e")
    # shacks on the deck, in all the tarp colours
    spots = [(-14, -6, 5, 4), (-14, 1, 4, 4), (-8, 6, 5, 4), (8, -6, 6, 4), (14, 4, 4, 5), (2, 7, 4, 3)]
    if v == 1:
        spots = spots[:3] + [(14, 6, 4, 3)]
    for i, (x, y, w, d) in enumerate(spots):
        h = rng.uniform(1.6, 2.2)
        st = mark(m)
        m.box((w, d, h), (x, y, 6.2 + h / 2), rng.choice((RUST[2], "#6a5a42", HULL[3], "#4a5a7a")))
        facet(m, new_faces(m, st), [RUST[0], RUST[1], RUST[2], "#9a8a6a"], noise=0.1)
        m.gable((w + 0.4, d + 0.4, 0.6), (x, y, 6.2 + h), TARP[i % 5], overhang=0.1, thick=0.15)
        m.box((0.6, 0.12, 0.6), (x + w * 0.2, y - d / 2 - 0.05, 6.2 + h * 0.5), LAMP, glow=True)
    # the forge in the middle: a stack with fire in its mouth
    st = mark(m)
    m.cyl(2.2, 1.2, (-2, -1, 6.2), RUST[1], segs=8)
    m.cyl(0.9, 1.8, (-2, -1, 6.2), STEEL[0], segs=6, r_top=0.7)
    facet(m, new_faces(m, st), RUST, noise=0.1)
    m.cyl(1.7, 0.2, (-2, -1, 7.42), FIRE[1], segs=8, glow=True)
    m.cyl(0.9, 0.3, (-2, -1, 7.45), FIRE[2], segs=6, glow=True)
    emitter(r, (-2, -1, 8.2), "embers")
    emitter(r, (-2, -1, 8.0), "smoke")
    light(r, (-2, -1, 7.2), FIRE[1], radius=12, intensity=1.4, flicker=0.6)
    if v == 0:
        # a crane at the back, its jib lying low along the deck
        st = mark(m)
        m.box((2.6, 2.6, 1.4), (-17, 0, 6.9), HAZARD)
        limb(m, (-17, 0, 7.6), (6, -2, 8.2), 0.5, 0.4, HAZARD, segs=4)
        facet(m, new_faces(m, st), ["#6a5020", HAZARD, "#e0c060"], noise=0.05)
        _chain(m, (6, -2, 8.0), 1.0)
        # the cab at the front with headlights
        _plate(m, (5, 12, 3.0), (L / 2 - 2, 0, 7.4), (0, 0, 0), HULL, taper=0.85)
        m.box((0.3, 9, 0.9), (L / 2 + 0.55, 0, 7.6), LAMP, glow=True)
        light(r, (L / 2 + 2, 0, 6), LAMP, radius=10, intensity=1.0)
    else:
        # a bucket wheel at the front, turning, and the ore hopper behind it
        st = mark(m)
        m.box((10, 14, 4.0), (8, -1, 7.8), RUST[1], taper=0.8)
        facet(m, new_faces(m, st), RUST, noise=0.1)
        _mound(m, rng, (8, -1, 9.2), (4.0, 5.5, 0.8), ["#3a3028", "#5a4838", "#7a6248", "#9a7a5a"])
        limb(m, (12, 0, 6.4), (L / 2 + 4, 0, 5.4), 1.0, 0.9, HAZARD, segs=5)
        wm = Model(f"ashgrave_crawler_town_1_wheel")
        st = mark(wm)
        wm.cyl(4.8, 1.6, (0, -0.8, 0), RUST[2], segs=10, rot=(-math.pi / 2, 0, 0))
        facet(wm, new_faces(wm, st), RUST, noise=0.08)
        for k in range(8):
            a = k / 8 * math.tau
            wm.box((2.2, 2.4, 1.6), (math.cos(a) * 5.0, 0, math.sin(a) * 5.0), STEEL[0], rot=(0, -a, 0))
        o = wm.build(r, loc=(L / 2 + 4.5, 0, 2.2))
        o.scale = (1, 1, 0.8)
        animate(o, "ashgrave_crawler_town_1_wheel_idle", "rotation_euler", [(0, (0, 0, 0)), (4, (0, math.pi, 0)), (8, (0, math.tau, 0))])
    # (squashed a little, to pass under the flight line)
    m.build(r).scale = (1, 1, 0.82)
    return r


def shack(v):
    """Scenery: shacks of corrugated scrap, roofs patched in every colour the clans could find: a
    two-storey (v0), a row of three under one sagging roof (v1), one on stilts with a ladder (v2)."""
    r = root("ashgrave_shack", v)
    rng = random.Random(2220 + v)
    m = Model(f"ashgrave_shack_{v}", 2220 + v)
    walls = [RUST[2], "#6a5a42", HULL[3], "#4a5a7a", "#7a6a4a"]
    if v == 0:
        _plate(m, (3.6, 3.0, 2.2), (0, 0, 1.1), (0, 0, 0), [RUST[0], rng.choice(walls), "#9a8a6a", "#b8a888"])
        _plate(m, (2.6, 2.4, 1.6), (-0.3, 0.2, 3.0), (0, 0, 0.15), [RUST[0], rng.choice(walls), "#9a8a6a", "#b8a888"])
        m.gable((2.9, 2.7, 0.8), (-0.3, 0.2, 3.8), TARP[0], overhang=0.1, thick=0.14, rot=(0, 0, 0.15))
        m.box((3.9, 3.3, 0.18), (0, 0, 2.25), TARP[3])
        m.box((0.8, 0.12, 1.4), (0.8, -1.55, 0.7), TARP_DARK)
        m.box((0.6, 0.12, 0.5), (-0.6, -1.4, 3.1), LAMP, glow=True)
        limb(m, (1.4, 1.2, 2.2), (1.6, 1.3, 5.6), 0.1, 0.06, STEEL[1], segs=4)
        m.ball(0.2, (1.6, 1.3, 5.7), "#ff3a2a", subdiv=0, glow=True)
    elif v == 1:
        for i, x in enumerate((-2.4, 0, 2.4)):
            _plate(m, (2.3, 2.6, 1.8 + 0.2 * (i % 2)), (x, 0, 0.95), (0, 0, 0), [RUST[0], walls[i], "#9a8a6a", "#b8a888"])
            m.box((0.7, 0.12, 1.2), (x + 0.4, -1.32, 0.6), TARP_DARK)
        for i in range(10):
            m.box((0.75, 3.4, 0.12 if i % 2 else 0.2), (-3.4 + i * 0.75, 0, 2.15 - 0.15 * math.sin(i / 9 * math.pi)), TARP[[1, 3, 4, 0, 2][i % 5]] if i % 3 == 0 else "#7a7a7e",
                  rot=(0.12, 0, 0))
        m.box((0.4, 0.12, 0.4), (-1.6, -1.35, 1.4), LAMP, glow=True)
    else:
        for x in (-1.2, 1.2):
            for y in (-1.0, 1.0):
                limb(m, (x, y, 0), (x * 0.9, y * 0.9, 2.6), 0.15, 0.13, "#5a4a3a", segs=4)
        _plate(m, (3.0, 2.6, 1.8), (0, 0, 3.5), (0, 0, 0), [RUST[0], rng.choice(walls), "#9a8a6a", "#b8a888"])
        m.gable((3.3, 2.9, 0.8), (0, 0, 4.4), TARP[2], overhang=0.1, thick=0.14)
        for z in (0.4, 1.0, 1.6, 2.2):
            m.box((0.8, 0.12, 0.12), (0.3, -1.6, z), "#6a5a4a")
        limb(m, (-0.1, -1.6, 0), (-0.1, -1.6, 2.6), 0.08, 0.08, "#6a5a4a", segs=4)
        limb(m, (0.7, -1.6, 0), (0.7, -1.6, 2.6), 0.08, 0.08, "#6a5a4a", segs=4)
        m.box((0.5, 0.12, 0.5), (0.8, -1.32, 3.6), LAMP, glow=True)
    m.build(r, rot_z=rng.uniform(-0.5, 0.5))
    light(r, (0, -1.8, 2.5), LAMP, radius=4, intensity=0.6, flicker=0.2)
    return r


def junk_car(v):
    """Scenery: the hulk of a hauler stripped to its frame (v0), a buggy on blocks with its wheels gone
    (v1)."""
    r = root("ashgrave_junk_car", v)
    rng = random.Random(2240 + v)
    m = Model(f"ashgrave_junk_car_{v}", 2240 + v)
    col = rng.choice(("#3e6a6a", "#8a4a2e", HAZARD))
    if v == 0:
        _plate(m, (5.0, 2.4, 1.2), (0, 0, 0.9), (0, 0, 0), [RUST[0], RUST[1], RUST[2], RUST[3]])
        _plate(m, (1.8, 2.4, 1.4), (1.8, 0, 2.0), (0, 0, 0), [RUST[0], col, col, "#b8a888"])
        m.box((0.2, 2.0, 0.6), (2.75, 0, 2.2), "#1a1a1e")
        for x in (-1.6, 1.6):
            for y in (-1.3, 1.3):
                m.cyl(0.7, 0.5, (x, y, 0.6), "#1e1e22", segs=8, rot=(math.pi / 2, 0, 0))
        for x in (-1.8, -0.6, 0.6):
            m.box((0.2, 2.4, 0.8), (x, 0, 1.8), RUST[1])
    else:
        _plate(m, (3.4, 2.0, 0.9), (0, 0, 1.1), (0.05, 0.1, 0), [RUST[0], col, col, "#d8c8a0"])
        m.box((1.2, 1.8, 0.5), (-0.6, 0, 1.8), "#2a2622")
        for x in (-1.2, 1.2):
            for y in (-0.8, 0.8):
                m.box((0.6, 0.6, 0.65), (x, y, 0.33), "#5a5048")
        m.cyl(0.6, 0.4, (2.4, 1.6, 0.2), "#1e1e22", segs=8)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


# --- the Bone-White Woods ---------------------------------------------------------------------

def _bough(m, rng, a, d, length, rad, depth, color, floor=13.0, droop=0.0, spread=1.0):
    """A white branch that forks, keeping above `floor`."""
    b = a + d * length
    if b.z < floor + rad:
        b.z = floor + rad
    limb(m, a, b, rad, rad * 0.65, color, segs=6 if rad > 0.8 else 5)
    if rad > 0.5:
        m.ball(rad * 0.7, tuple(b), color, subdiv=0)
    if depth <= 0:
        return
    for k in range(rng.choice((2, 2, 3))):
        yaw = rng.uniform(-spread, spread)
        side = Vector((-d.y, d.x, 0)).normalized() if abs(d.z) < 0.95 else Vector((1, 0, 0))
        nd = (d + side * yaw + Vector((0, 0, rng.uniform(-0.2, 0.4) - droop))).normalized()
        _bough(m, rng, b, nd, length * rng.uniform(0.55, 0.75), rad * 0.62, depth - 1, color, floor, droop, spread)


def _trunk(m, rng, x, y, h, r0, color=BONE_WOOD[2], lean=(0, 0)):
    """A huge white trunk: tapering, flaring at the root, charred at the foot."""
    pts = [Vector((x, y, -2)), Vector((x + lean[0] * 0.3, y + lean[1] * 0.3, h * 0.35)), Vector((x + lean[0], y + lean[1], h))]
    limb(m, pts[0], pts[1], r0, r0 * 0.82, color, segs=7)
    limb(m, pts[1], pts[2], r0 * 0.82, r0 * 0.5, color, segs=7)
    m.ball(r0 * 0.82, tuple(pts[1]), color, subdiv=1)
    m.cyl(r0 * 1.15, 3.0, (x, y, -1.5), CHAR, segs=7, r_top=r0 * 0.9)
    for k in range(5):
        a = k / 5 * math.tau + rng.uniform(0, 0.6)
        limb(m, (x, y, 1.0), (x + math.cos(a) * r0 * 2.2, y + math.sin(a) * r0 * 2.2, -0.6), r0 * 0.4, r0 * 0.15, CHAR, segs=4)
    return pts[2]


def white_canopy(v):
    """SPAN: two white giants either side of the field whose crowns have grown together over it, a
    lattice of bone-pale boughs to fly under (v0). One giant fallen right across, its root plate
    standing up on one side and its broken crown on the other (v1)."""
    r = root("ashgrave_white_canopy", v)
    rng = random.Random(2280 + v)
    m = Model(f"ashgrave_white_canopy_{v}", 2280 + v)
    st = mark(m)
    if v == 0:
        for s in (-1, 1):
            x = s * 43
            top = _trunk(m, rng, x, rng.uniform(-2, 2), 19, 3.6, lean=(-s * 2.0, 0))
            collider(r, x - s * 0.6, 0, 3.4)
            # great limbs reaching across, high, forking into the other tree's
            for k in range(3):
                y = (k - 1) * 4.5 + rng.uniform(-1, 1)
                d = Vector((-s, (y - top.y) * 0.04, rng.uniform(0.02, 0.12))).normalized()
                _bough(m, rng, top + Vector((0, 0, -k * 1.2)), d, rng.uniform(17, 23), 1.6 - k * 0.2, 2, BONE_WOOD[2], floor=14.0,
                       droop=0.15, spread=0.55)
            _bough(m, rng, top, Vector((s * 0.3, 0.2, 1)).normalized(), 5, 1.2, 2, BONE_WOOD[2], floor=14.0)
        # ash lying along the high boughs
        for f in list(new_faces(m, st)):
            pass
    else:
        # the fallen trunk, lying across at the height of the flight line's top
        a, b = Vector((-42, 0, 16.0)), Vector((40, 3, 14.6))
        k1, k2 = Vector((-16, -2.2, 16.9)), Vector((14, 2.6, 15.8))
        limb(m, a, k1, 2.9, 2.5, BONE_WOOD[2], segs=8)
        m.ball(2.5, tuple(k1), BONE_WOOD[2], subdiv=1)
        limb(m, k1, k2, 2.5, 2.1, BONE_WOOD[2], segs=8)
        m.ball(2.1, tuple(k2), BONE_WOOD[2], subdiv=1)
        limb(m, k2, b, 2.1, 1.6, BONE_WOOD[2], segs=8)
        # bark split along its top, char in the cracks
        for x in (-30, -8, 22):
            m.box((7.0, 0.7, 0.5), (x, -1.0 if x < 0 else 2.0, 18.4 if x < 10 else 17.4), CHAR, rot=(0, 0, 0.05))
        # the root plate standing up, earth still in it
        st2 = mark(m)
        m.cyl(9.0, 3.0, (-45, 0, 12), DIRT[1], segs=9, rot=(0, math.pi / 2, 0))
        jitter(m, new_faces(m, st2), 0.6)
        facet(m, new_faces(m, st2), DIRT, noise=0.12)
        for k in range(10):
            ang = k / 10 * math.tau
            limb(m, (-44, math.cos(ang) * 5, 12 + math.sin(ang) * 5), (-43, math.cos(ang) * 10, max(-2.5, 12 + math.sin(ang) * 10)), 0.8, 0.2, CHAR, segs=4)
        collider(r, -45, 0, 6.0)
        # the crown, smashed against a boulder out past the right edge
        st2 = mark(m)
        _chunk(m, rng, (38, -6, -3), (50, 6, 11.5), ["#3a3a42", "#4a4a54", "#5a5a66", "#6a6a78"], n=14)
        collider(r, 44, 0, 5.5)
        for k in range(6):
            d = Vector((rng.uniform(-0.3, 0.6), rng.uniform(-1, 1), rng.uniform(0.1, 0.6))).normalized()
            _bough(m, rng, b, d, rng.uniform(5, 9), 1.1, 2, BONE_WOOD[2], floor=13.0)
        # broken stubs of branches all along the trunk, sticking up and out sideways
        for x in range(-34, 36, 6):
            t = (x + 42) / 82
            p = a.lerp(b, t) + Vector((0, -2.0 * math.sin(t * math.pi) + 2.6 * t, 1.0 * math.sin(t * math.pi)))
            s = rng.choice((-1, 1))
            _bough(m, rng, p + Vector((0, s * 1.5, 1)), Vector((rng.uniform(-0.3, 0.3), s * 0.7, 0.7)).normalized(), rng.uniform(3, 6), 0.7, 1,
                   BONE_WOOD[2], floor=14.0)
    facet(m, new_faces(m, st), BONE_WOOD, noise=0.12)
    # the moon fungus, shelves of it glowing on the trunks
    for f in list(m.bm.faces):
        c = f.calc_center_median()
        if 4 < c.z < 18 and f.normal.z > 0.5 and rng.random() < 0.05:
            f.material_index = m._slot(MOON, True)
    m.build(r)
    light(r, (0, 0, 15), MOON, radius=16, intensity=0.5, halo=False)
    return r


def white_trunks(v):
    """GATE: a stand of white giants, trunks too broad to shoot through, close enough to thread,
    their lowest boughs locking overhead, the innermost a snag broken off low; v1 has a strangling
    root grown across two of them."""
    r = root("ashgrave_white_trunks", v)
    rng = random.Random(2300 + v)
    m = Model(f"ashgrave_white_trunks_{v}", 2300 + v)
    st = mark(m)
    if v == 0:
        trunks = [(-19, 0, 1.8, 22), (-6, 1.5, 2.4, 25), (6.0, -1.0, 2.6, 21), (18, 0.6, 2.4, 6.5)]
    else:
        trunks = [(-18, 1.0, 1.8, 24), (-4.5, -0.8, 2.4, 20), (8.0, 0.6, 2.6, 25), (19.5, -0.5, 2.2, 6.5)]
    tops = []
    for x, y, rr, h in trunks:
        # the radius at the flight line is rr: the trunk tapers from rr/0.9 at its foot
        top = _trunk(m, rng, x, y, h, rr / 0.92 * 1.0, lean=(rng.uniform(-0.8, 0.8), rng.uniform(-0.6, 0.6)))
        if h < 9:
            # the snag: splintered at the top
            for k in range(4):
                a = k * 1.6
                limb(m, top, top + Vector((math.cos(a) * 0.6, math.sin(a) * 0.6, 1.0 + rng.uniform(0, 0.8))), 0.6, 0.1, BONE_WOOD[2], segs=4)
            continue
        tops.append(top)
        collider(r, x, y, rr + 0.3)
        for k in range(3):
            ang = rng.uniform(0, math.tau)
            d = Vector((math.cos(ang), math.sin(ang), rng.uniform(0.2, 0.7))).normalized()
            _bough(m, rng, top + Vector((0, 0, -rng.uniform(0, 4))), d, rng.uniform(5, 9), 1.0, 2, BONE_WOOD[2], floor=13.5, droop=0.1)
    for a, b in zip(tops, tops[1:]):
        mid = (a + b) / 2 + Vector((0, rng.uniform(-1, 1), 1.0))
        limb(m, a + Vector((0, 0, -3)), mid, 1.0, 0.7, BONE_WOOD[2], segs=5)
        limb(m, mid, b + Vector((0, 0, -2.5)), 0.7, 0.9, BONE_WOOD[2], segs=5)
    if v == 1:
        p0 = Vector((-17, 1.0, 15.5))
        p1 = Vector((-4.5, -0.8, 14.5))
        for k in range(3):
            mid = (p0 + p1) / 2 + Vector((0, k - 1, -1.2 + k * 0.6))
            limb(m, p0 + Vector((0, k - 1, k)), mid, 0.7, 0.6, CHAR, segs=5)
            limb(m, mid, p1 + Vector((0, k - 1, k)), 0.6, 0.7, CHAR, segs=5)
    facet(m, new_faces(m, st), BONE_WOOD, noise=0.12)
    for f in list(m.bm.faces):
        c = f.calc_center_median()
        if 2 < c.z < 20 and f.normal.z > 0.4 and rng.random() < 0.05:
            f.material_index = m._slot(MOON, True)
    # ash drifted round their feet
    for x, y, rr, h in trunks:
        _mound(m, rng, (x + 1, y - 1, -0.6), (rr * 2.4, rr * 2.0, 1.4), ASH + ["#bcbcc4", "#c8c8d0"])
    _trim(m, trunks[0][0] - 2.4)
    _centre(m, r)
    m.build(r)
    light(r, (0, 0, 8), MOON, radius=14, intensity=0.6, halo=False)
    return r


def overgrown_mech(v):
    """GIANT: a titan's torso lying in the woods so long the white trees have grown up through it,
    roots clamped over its plates, the moon fungus glowing in its seams (v0). A white giant long
    fallen and hollowed, lying along the ground, shelves of fungus on it (v1)."""
    r = root("ashgrave_overgrown_mech", v)
    rng = random.Random(2320 + v)
    m = Model(f"ashgrave_overgrown_mech_{v}", 2320 + v)
    if v == 0:
        H = HULL
        _plate(m, (20, 13, 6.0), (0, 0, 2.2), (0, 0, 0.1), H, taper=0.85)
        _plate(m, (12, 8, 1.6), (0.5, 0, 5.8), (0, 0, 0.1), H, taper=0.8)
        st = mark(m)
        m.ball(1.0, (11.5, 1.0, 2.4), H[2], subdiv=1, scale=(4.2, 4.0, 3.4))       # the head, fallen to one side
        m.ball(1.0, (-2, 9, 2.6), H[2], subdiv=1, scale=(5.0, 4.0, 3.2))            # a pauldron
        facet(m, new_faces(m, st), H, noise=0.1)
        m.box((0.6, 2.6, 0.9), (15.4, 1.6, 2.4), "#1a3a26")
        # an arm lying out, the hand open
        st = mark(m)
        limb(m, (-2, -8, 2.0), (-14, -13, 1.2), 2.2, 1.8, H[2], segs=6)
        facet(m, new_faces(m, st), H, noise=0.1)
        _plate(m, (4, 4.4, 1.6), (-16.5, -14, 1.0), (0, 0, 0.4), H)
        # trees grown up through it, roots gripping the plates
        st = mark(m)
        for x, y, h in ((-4, 1, 7.6), (5, -2, 7.0), (-14, 7, 6.5), (16, -8, 6.0)):
            base = Vector((x, y, 6.2 if abs(x) < 9 and abs(y) < 6 else 0))
            limb(m, base, base + Vector((0.3, 0.2, h - base.z)), 0.8, 0.4, BONE_WOOD[2], segs=5)
            for k in range(4):
                a = k / 4 * math.tau + rng.uniform(0, 0.5)
                limb(m, base + Vector((0, 0, 0.5)), base + Vector((math.cos(a) * 3.5, math.sin(a) * 3.5, -3.0 if base.z > 1 else -0.5)),
                     0.45, 0.15, BONE_WOOD[1], segs=4)
            for k in range(3):
                a = rng.uniform(0, math.tau)
                top = base + Vector((0.3, 0.2, h - base.z))
                limb(m, top - Vector((0, 0, 1.5)), top + Vector((math.cos(a) * 2.8, math.sin(a) * 2.8, -0.6)), 0.3, 0.1, BONE_WOOD[2], segs=4)
        facet(m, new_faces(m, st), BONE_WOOD, noise=0.12)
        for x, y in ((-6, -6.6), (2, 6.6), (8, -6.4), (-9, 3)):
            m.box((2.4, 0.4, 1.2), (x, y, 3.6 if abs(y) > 6 else 6.7), MOON, glow=True, rot=(0, 0, rng.uniform(-0.3, 0.3)))
        for x, y, sx, sy in ((0, -9, 10, 3), (0, 9, 8, 3), (-12, 0, 4, 6)):
            _mound(m, rng, (x, y, -0.6), (sx, sy, 2.0), ASH + ["#bcbcc4", "#c8c8d0"])
        light(r, (0, 0, 7), MOON, radius=14, intensity=0.8, halo=False)
    else:
        a, b = Vector((-22, 0, 2.8)), Vector((20, 2, 2.0))
        st = mark(m)
        limb(m, a, b, 3.6, 2.6, BONE_WOOD[2], segs=8)
        m.ball(3.4, tuple(a), BONE_WOOD[2], subdiv=1)
        for k in range(10):
            ang = k / 10 * math.tau
            limb(m, a + Vector((-1, 0, 0)), a + Vector((-3, math.cos(ang) * 7, min(6.5, max(-0.5, 2.8 + math.sin(ang) * 6)))), 0.9, 0.2, BONE_WOOD[1], segs=4)
        for k in range(5):
            d = Vector((rng.uniform(0.4, 1.0), rng.uniform(-1, 1), rng.uniform(-0.25, 0.05))).normalized()
            _bough(m, rng, b, d, rng.uniform(4, 7), 1.0, 2, BONE_WOOD[2], floor=0.3, droop=0.6)
        facet(m, new_faces(m, st), BONE_WOOD, noise=0.12)
        # the hollow end, dark, and the rot opening along its top
        m.cyl(2.6, 0.4, (b.x + 0.2, b.y, b.z), CHAR, segs=8, rot=(0, math.pi / 2, 0))
        for x in (-12, -3, 6):
            m.box((5.0, 1.6, 0.6), (x, 0.4, 6.0 - (x + 22) / 42 * 0.8), "#24242c", rot=(0, 0, 0.05))
        # fungus shelves, glowing
        for k in range(12):
            t = rng.uniform(0.05, 0.95)
            p = a.lerp(b, t)
            s = rng.choice((-1, 1))
            rad = 3.6 - 1.0 * t
            m.cyl(rng.uniform(0.8, 1.3), 0.25, (p.x, p.y + s * rad * 0.95, p.z + rng.uniform(-0.5, 1.6)), MOON, segs=6, glow=True)
        for x, y, sx, sy in ((-4, -4.5, 14, 2.5), (2, 5, 12, 2.5)):
            _mound(m, rng, (x, y, -0.6), (sx, sy, 1.6), ASH + ["#bcbcc4", "#c8c8d0"])
        light(r, (0, 0, 6), MOON, radius=14, intensity=0.8, halo=False)
    m.build(r)
    return r


def moon_fungus(v):
    """Scenery: a white stump with shelves of fungus glowing moon-blue (v0), a pair of broken stumps,
    one with a shelf (v1), a fungus-shelved snag (v2)."""
    r = root("ashgrave_moon_fungus", v)
    rng = random.Random(2340 + v)
    m = Model(f"ashgrave_moon_fungus_{v}", 2340 + v)
    if v in (0, 2):
        h = 1.4 if v == 0 else 3.6
        st = mark(m)
        m.cyl(0.8 if v == 0 else 0.6, h, (0, 0, -0.1), BONE_WOOD[2], segs=6, r_top=0.6 if v == 0 else 0.35)
        for k in range(4):
            a = k / 4 * math.tau + rng.uniform(0, 0.6)
            limb(m, (0, 0, 0.3), (math.cos(a) * 1.3, math.sin(a) * 1.3, -0.1), 0.3, 0.1, BONE_WOOD[1], segs=4)
        facet(m, new_faces(m, st), BONE_WOOD, noise=0.1)
        m.cyl(0.5 if v == 0 else 0.3, 0.06, (0, 0, h - 0.1), CHAR, segs=6)
        for k in range(2 if v == 0 else 1):
            a = rng.uniform(0, math.tau)
            z = rng.uniform(0.3, h - 0.2)
            rad = 0.75 if v == 0 else 0.55
            m.cyl(rng.uniform(0.35, 0.55), 0.14, (math.cos(a) * rad, math.sin(a) * rad, z), MOON, segs=6, glow=True)
    else:
        # a pair of broken stumps, a shelf glowing on the taller
        for x, y, h in ((-0.7, 0.2, 1.0), (0.8, -0.3, 1.7)):
            st = mark(m)
            m.cyl(0.5, h, (x, y, -0.1), BONE_WOOD[2], segs=6, r_top=0.4)
            facet(m, new_faces(m, st), BONE_WOOD, noise=0.1)
            m.cyl(0.35, 0.06, (x, y, h - 0.1), CHAR, segs=6)
            if h > 1.5:
                m.cyl(0.4, 0.14, (x + 0.45, y, h * 0.6), MOON, segs=6, glow=True)
    m.cyl(1.6, 0.08, (0, 0, -0.04), ASH[1], segs=8)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    light(r, (0, 0, 1), MOON, radius=3, intensity=0.4, halo=False)
    return r


def build():
    for v in range(2):
        fallen_titan(v)
        titan_spine(v)
        fulgurite(v)
        glass_ship(v)
        shell_casing(v)
        scrap_gantry(v)
        scrap_wall(v)
        crawler_town(v)
        junk_car(v)
        white_canopy(v)
        white_trunks(v)
        overgrown_mech(v)
    for v in range(3):
        glass_bubble(v)
        shack(v)
        moon_fungus(v)
    # the Titan Graveyard's titans, posed by the layout, and the clans' things (set_ashgrave_titans.py)
    import set_ashgrave_titans
    set_ashgrave_titans.build()
    # the Glass Craters' ejecta, spires, masts, convoy, cutters, barges and the gunship (set_ashgrave_glass.py)
    import set_ashgrave_glass
    set_ashgrave_glass.build()
    # the Scav Camp's crawlers, tents, berm, claims, stalls, banners, berth and forge (set_ashgrave_camp.py)
    import set_ashgrave_camp
    set_ashgrave_camp.build()
