"""VESH, the Low Tide: a reef world half drained. Coral in orange, violet and gold over pink flats,
mangroves in a turquoise lagoon, islands made of the bones of something enormous, and caves the
tide hollowed out. Water props have z = 0 at the waterline."""
from __future__ import annotations

import math
import random

from mathutils import Vector
from kit import Model, light
from props_a_lib import lump, tube
from props_b_kit import (M, collider, facet, jitter, limb, mark, new_faces, paint, path_tube, root, sway, xform)

V = Vector

# coral, dark to light
C_ORANGE = ["#b8482a", "#e0683a", "#ff8c4a", "#ffb878"]
C_VIOLET = ["#4a1e6a", "#6a2e8a", "#9048b0", "#c078d8"]
C_MAGENTA = ["#8a1e5a", "#b8307a", "#e05a9a", "#ff9ac8"]
C_GOLD = ["#b07a1a", "#d8a030", "#f0c850", "#fff0a0"]
C_TEAL = ["#1a6a6a", "#2a9a90", "#4ac8b8"]
BIOLUM = "#5affe8"
# the lagoon
LEAF = ["#2a6a40", "#3a8a50", "#4aa060", "#7ac880"]
MANGROVE_BARK = ["#4a3a30", "#6a5040", "#8a6a50"]
SAND = ["#d8c8a0", "#f0e2c0", "#f8f0d8"]
REEF_ROCK = ["#6a4a50", "#8a6266", "#a87a78", "#c89a90"]
BARNACLE = "#ffb0b8"
WEED = ["#2a5a40", "#3a7a50"]
TIDE_POOL = "#3ad0e0"
# bone, weathered
BONE = ["#8a8270", "#b0a890", "#d8d0b8", "#f4ecd8"]
BONE_DARK = "#3a3438"


# --- the Coral Flats ---------------------------------------------------------------------

def _fan(m, rng, base, yaw, tilt, w, h, cols):
    """A sea fan: a flat scalloped blade with raised veins, leaning out so you see it from above."""
    pts = [(0, 0)]
    n = 7
    for i in range(n + 1):
        a = math.pi * (0.1 + 0.8 * i / n)
        rr = h * rng.uniform(0.82, 1.0)
        pts.append((math.cos(a) * w * rr / h, math.sin(a) * rr))
    pts = [(x, z) for x, z in pts]
    st = mark(m)
    m.prism([(-x, z) for x, z in pts], 0.16, (0, 0, 0), cols[1])
    paint(m, new_faces(m, st), lambda f: cols[2] if abs(f.normal.y) > 0.7 else cols[1])
    for i in range(5):                                       # veins on both faces
        a = math.pi * (0.2 + 0.6 * i / 4)
        for y in (-0.1, 0.1):
            limb(m, (0, y, 0.1), (math.cos(a) * w * 0.85, y, math.sin(a) * h * 0.85), 0.09, 0.06, cols[3], segs=4)
    m.ball(0.25, (0, 0, 0.1), cols[0], subdiv=0)
    xform(m, st, M(base, (tilt, 0, yaw)))


def coral_fan(v):
    r = root("coral_fan", v)
    rng = random.Random(500 + v)
    m = Model(f"coral_fan_{v}", 500 + v)
    if v == 0:
        for k, cols in enumerate((C_MAGENTA, C_VIOLET, C_MAGENTA)):
            yaw = k * 2.1 + rng.uniform(-0.3, 0.3)
            _fan(m, rng, (0, 0, 0), yaw, rng.uniform(0.6, 0.9), rng.uniform(1.6, 2.0), rng.uniform(2.4, 3.0), cols)
    elif v == 1:
        for k in range(5):
            yaw = k * math.tau / 5 + rng.uniform(-0.2, 0.2)
            cols = C_ORANGE if k % 2 else C_GOLD
            _fan(m, rng, (math.cos(yaw + 1.57) * 0.3, math.sin(yaw + 1.57) * 0.3, 0), yaw, rng.uniform(0.7, 1.0),
                 rng.uniform(1.1, 1.4), rng.uniform(1.6, 2.2), cols)
    else:
        # staghorn: violet antlers with glowing tips
        def stag(a, d, L, rad, depth):
            b = a + d * L
            limb(m, a, b, rad, rad * 0.8, C_VIOLET[2], segs=5)
            if depth == 0:
                m.ball(rad * 1.5, tuple(b), BIOLUM, subdiv=0, glow=True)
                return
            for k in range(2):
                yaw = rng.uniform(0, math.tau)
                nd = (d + Vector((math.cos(yaw), math.sin(yaw), 0)) * rng.uniform(0.5, 0.9)).normalized()
                nd.z = max(nd.z, 0.25)
                stag(b, nd.normalized(), L * 0.75, rad * 0.78, depth - 1)
        st = mark(m)
        for k in range(4):
            yaw = k * math.tau / 4 + rng.uniform(-0.3, 0.3)
            stag(Vector((0, 0, -0.1)), Vector((math.cos(yaw) * 0.7, math.sin(yaw) * 0.7, 1)).normalized(), 1.1, 0.28, 2)
        facet(m, {f for f in new_faces(m, st) if f.material_index != m._slot(BIOLUM, True)}, C_VIOLET[1:], noise=0.1)
        light(r, (0, 0, 1.5), BIOLUM, radius=4, intensity=0.5, halo=False)
    st = mark(m)
    m.ball(0.9, (0, 0, -0.2), REEF_ROCK[1], subdiv=1, scale=(1.2, 1.0, 0.5), jitter=0.12)
    facet(m, new_faces(m, st), REEF_ROCK[:3], noise=0.1)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def coral_brain(v):
    """Brain coral: a low dome wound round with raised meandering ridges."""
    r = root("coral_brain", v)
    rng = random.Random(520 + v)
    m = Model(f"coral_brain_{v}", 520 + v)
    spec = {0: [((0, 0), 1.6, C_ORANGE)],
            1: [((0, 0), 1.2, C_GOLD), ((1.6, 0.7), 0.8, C_GOLD), ((-1.0, 1.3), 0.7, C_ORANGE)],
            2: [((0, 0), 1.9, C_VIOLET)]}[v]
    for (x, y), s, cols in spec:
        st = mark(m)
        sq = 0.62
        m.ball(s, (x, y, 0), cols[1], subdiv=1, scale=(1.05, 1.0, sq), jitter=0.03 * s)
        facet(m, new_faces(m, st), cols[:3], noise=0.08, bias=-0.2)
        # ridges: wavy rings over the dome, like the folds of a brain
        ph = rng.uniform(0, 6)
        for k, rho in enumerate((0.3, 0.55, 0.8) if s > 1 else (0.35, 0.72)):
            pts = []
            n = 10 + 5 * k
            for i in range(n + 1):
                th = i / n * math.tau
                rr = rho + 0.09 * math.sin(th * (4 + 2 * k) + ph + k)
                px, py = math.cos(th) * rr * s * 1.05, math.sin(th) * rr * s
                pz = s * sq * math.sqrt(max(0.0, 1 - rr * rr)) + 0.02
                pts.append(Vector((x + px, y + py, pz)))
            for i in range(n):
                limb(m, pts[i], pts[i + 1], 0.15 * s, 0.15 * s, cols[3], segs=4)
        if v == 2:
            for i in range(9):                                              # glowing polyps in the folds
                th = rng.uniform(0, math.tau)
                rr = rng.choice((0.42, 0.68))
                m.ball(0.14 * s, (x + math.cos(th) * rr * s, y + math.sin(th) * rr * s,
                                  s * sq * math.sqrt(1 - rr * rr) + 0.05), BIOLUM, subdiv=0, glow=True)
    if v == 2:
        light(r, (0, 0, 1.6), BIOLUM, radius=5, intensity=0.5, halo=False)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def coral_tube(v):
    """Tube sponges: open pipes with glowing throats."""
    r = root("coral_tube", v)
    rng = random.Random(540 + v)
    m = Model(f"coral_tube_{v}", 540 + v)
    if v == 0:
        cols, inner, n, spread, hr = C_VIOLET, BIOLUM, 7, 1.1, (1.0, 2.8)
    elif v == 1:
        cols, inner, n, spread, hr = C_ORANGE, "#ffe070", 9, 0.7, (0.8, 2.0)
    else:
        cols, inner, n, spread, hr = C_GOLD, "#ff6a9a", 5, 1.3, (1.6, 3.4)
    tubes = [(0, 0, hr[1], 0.55)]
    for k in range(n - 1):
        a = k / (n - 1) * math.tau + rng.uniform(-0.3, 0.3)
        d = spread * rng.uniform(0.7, 1.1)
        tubes.append((math.cos(a) * d, math.sin(a) * d, rng.uniform(*hr), rng.uniform(0.35, 0.5)))
    for x, y, h, rad in tubes:
        lean = (rng.uniform(-0.15, 0.15) + y * 0.08, -x * 0.08 + rng.uniform(-0.15, 0.15), 0)
        st = mark(m)
        m.cyl(rad, h, (0, 0, -0.1), cols[1], segs=7, r_top=rad * 1.25)
        facet(m, new_faces(m, st), cols, noise=0.1, bias=-0.3)
        m.cyl(rad * 1.3, 0.12, (0, 0, h - 0.12), cols[3], segs=7)               # the lip
        m.cyl(rad * 0.95, 0.08, (0, 0, h - 0.02), inner, segs=7, glow=True)     # the throat
        xform(m, st, M((x, y, 0), lean))
    st = mark(m)
    m.ball(spread + 0.4, (0, 0, -0.3), REEF_ROCK[1], subdiv=1, scale=(1.1, 1.0, 0.4), jitter=0.12)
    facet(m, new_faces(m, st), REEF_ROCK[:3], noise=0.1)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    light(r, (0, 0, hr[1] + 0.4), inner, radius=4, intensity=0.5, halo=False)
    return r


# --- the Sky-Whale Lagoon ------------------------------------------------------------------

MANG = (["#173a30", "#1f5440", "#2d7050", "#4f9460"],            # old growth, deep and blue-green
        ["#163e42", "#1e5a56", "#2c7a6a", "#58a88a"],            # sea-green, salt on the leaves
        ["#2a5426", "#3e7a30", "#62a040", "#a8d060"])            # new growth, lime
MANG_NEW = "#c8703a"                                                  # bronze young leaves
PROPAGULE = "#cfe0a0"


def _canopy(c, rng, ctr, rad, cols, lobes=4, squash=0.4, tips=2):
    """A mangrove crown seen from above: a flat, broken mat of leaf, not a ball. A low dome with
    lobes pushed out unevenly round its rim (some a little lower), so the outline is ragged and
    the sun catches separate planes."""
    x, y, z = ctr
    st = mark(c)
    c.ball(rad, (x, y, z), cols[1], subdiv=1, scale=(1.1, 0.95, squash), jitter=0.16 * rad)
    a0 = rng.uniform(0, math.tau)
    for k in range(lobes):
        a = a0 + k / lobes * math.tau + rng.uniform(-0.45, 0.45)
        d = rad * rng.uniform(0.75, 1.05)
        lr = rad * rng.uniform(0.5, 0.7)
        c.ball(lr, (x + math.cos(a) * d, y + math.sin(a) * d, z - rad * squash * rng.uniform(0.0, 0.5)), cols[1],
               subdiv=1 if lr > 0.9 else 0, scale=(1.1, 1.0, squash * 1.1), jitter=0.14 * lr, rot=(0, 0, a))
    facet(c, new_faces(c, st), cols, noise=0.18, bias=0.05)
    for k in range(tips):                                                  # bronze new leaves or pale propagules
        a = rng.uniform(0, math.tau)
        d = rad * rng.uniform(0.2, 0.8)
        c.ball(rng.uniform(0.26, 0.34), (x + math.cos(a) * d, y + math.sin(a) * d, z + rad * squash * 0.85),
               MANG_NEW if cols is MANG[2] else PROPAGULE, subdiv=0, scale=(1.2, 1, 0.5))


def _stilts(m, rng, base, n, out, s, z0=0.9):
    """Prop roots: arching out and down from the trunk into the mud, each a little different."""
    bx, by, bz = base
    for k in range(n):
        a = k / n * math.tau + rng.uniform(-0.35, 0.35)
        o = out * rng.uniform(0.75, 1.15)
        hz = bz + rng.uniform(-0.2, 0.5) * s
        tube(m, [V((bx, by, hz)), V((bx + math.cos(a) * o * 0.45, by + math.sin(a) * o * 0.45, z0 * s + rng.uniform(0.2, 0.5))),
                 V((bx + math.cos(a) * o, by + math.sin(a) * o, -0.35))],
             [0.17 * s, 0.14 * s, 0.11 * s], MANGROVE_BARK[1], segs=5)


def mangrove(v):
    """A mangrove in the shallows: a cage of prop roots, a short trunk splitting into boughs, and
    flat ragged leaf-mats rather than a ball on a stick. v0 an old thicket spreading wide and low,
    v1 a tall one with a tiered crown and roots dropping from its boughs, v2 a nursery of saplings."""
    r = root("mangrove", v)
    rng = random.Random(560 + v)
    m = Model(f"mangrove_{v}", 560 + v)
    cols = MANG[v]
    crowns = []                                                       # (centre, radius, lobes)
    st = mark(m)
    if v == 0:
        top = V((0.2, -0.1, 2.3))
        tube(m, [V((0, 0, 0.6)), V((0.1, 0, 1.5)), top], [0.38, 0.33, 0.3], MANGROVE_BARK[1], segs=6)
        _stilts(m, rng, (0, 0, 1.3), 8, 2.3, 1.0)
        for k, (a, d, z, rad) in enumerate(((0.3, 1.7, 3.3, 1.55), (2.4, 1.6, 3.0, 1.35), (4.3, 1.5, 3.5, 1.25))):
            a += rng.uniform(-0.2, 0.2)
            end = V((math.cos(a) * d, math.sin(a) * d, z - 0.3))
            tube(m, [top, top.lerp(end, 0.5) + V((0, 0, 0.5)), end], [0.24, 0.18, 0.13], MANGROVE_BARK[1], segs=5)
            if k != 1:                                                    # an aerial root dropping from the bough
                drop = top.lerp(end, 0.7)
                tube(m, [drop, V((drop.x * 1.1, drop.y * 1.1, 0.8)), V((drop.x * 1.15, drop.y * 1.15, -0.3))],
                     [0.12, 0.11, 0.14], MANGROVE_BARK[0], segs=4)
            crowns.append(((end.x, end.y, z), rad, 4))
    elif v == 1:
        for (x, y), h, s in (((-0.7, 0.2), 4.0, 1.0), ((1.0, -0.4), 3.0, 0.8)):
            top = V((x + 0.3 * s, y + 0.1, h))
            tube(m, [V((x, y, 0.7 * s)), V((x + 0.2, y, h * 0.55)), top], [0.32 * s, 0.27 * s, 0.22 * s], MANGROVE_BARK[1], segs=6)
            _stilts(m, rng, (x, y, 1.3 * s), 6, 1.9 * s, s)
            crowns.append(((top.x, top.y, h + 0.4 * s), 1.45 * s, 4))
            a = rng.uniform(0, math.tau)                                 # a lower tier on one bough
            low = V((x + math.cos(a) * 1.5 * s, y + math.sin(a) * 1.5 * s, h * 0.68))
            tube(m, [V((x + 0.1, y, h * 0.5)), low], [0.18 * s, 0.12 * s], MANGROVE_BARK[1], segs=5)
            tube(m, [low, V((low.x * 1.05, low.y * 1.05, -0.3))], [0.11, 0.13], MANGROVE_BARK[0], segs=4)
            crowns.append(((low.x, low.y, low.z + 0.3), 1.0 * s, 3))
    else:
        for k, ((x, y), h) in enumerate((((0, 0), 2.4), ((1.4, 0.7), 1.7), ((-1.1, 1.0), 1.4), ((0.3, -1.4), 1.9))):
            x += rng.uniform(-0.2, 0.2)
            tube(m, [V((x, y, 0.3)), V((x + rng.uniform(-0.3, 0.3), y + rng.uniform(-0.3, 0.3), h))], [0.17, 0.12],
                 MANGROVE_BARK[1], segs=5)
            _stilts(m, rng, (x, y, 0.7), 4, 0.8, 0.6, z0=0.6)
            crowns.append(((x, y, h + 0.25), rng.uniform(0.75, 0.95) * (1.1 if k == 0 else 1), 3))
    facet(m, new_faces(m, st), MANGROVE_BARK, noise=0.12)
    # the mud bank the roots have caught, wet at the waterline, a heron's worth of weed on it
    st = mark(m)
    R = {0: 2.9, 1: 3.0, 2: 2.3}[v]
    m.cyl(R, 0.35, (0, 0, -0.3), SAND[0], segs=9, r_top=R * 0.72)
    jitter(m, new_faces(m, st), 0.22, z=False)
    xform(m, st, M(scale=(1.0, 0.85, 1.0)))
    facet(m, new_faces(m, st), ["#6a5a40", "#8a7a5a", SAND[0]], noise=0.12)
    for k in range(5):
        a = rng.uniform(0, math.tau)
        d = R * rng.uniform(0.75, 0.95)
        m.ball(rng.uniform(0.28, 0.4), (math.cos(a) * d, math.sin(a) * d * 0.85, 0.0), rng.choice((WEED[0], WEED[1], BARNACLE)),
               subdiv=0, scale=(1.3, 1, 0.5))
    m.build(r)
    for i, (ctr, rad, lobes) in enumerate(crowns):
        c = Model(f"mangrove_{v}_crown{i}", 570 + v * 7 + i)
        _canopy(c, rng, (0, 0, 0), rad, cols, lobes=lobes, tips=1)
        o = c.build(r, loc=ctr)
        sway(o, f"mangrove_{v}_crown{i}_sway_idle", amp=0.03, period=5.0 + i * 0.4, phase=i * 1.7)
    return r


def tide_rock(v):
    """Reef rock worn by the tide: banded, crusted pink and weedy at the waterline. v0 a mushroom
    the sea has undercut, a cap of turf and gulls' crust on it; v1 a stepped stack with a pool on
    top; v2 a low scatter of worn slabs; v3 a split boulder, starfish in the crack."""
    r = root("tide_rock", v)
    rng = random.Random(580 + v)
    m = Model(f"tide_rock_{v}", 580 + v)
    foot = 1.6
    if v in (0, 1):
        layers = [(1.3, 0.8), (1.9, 0.8), (2.2, 0.6), (1.8, 0.35)] if v == 0 else [(1.6, 1.0), (1.5, 1.2), (1.3, 1.1), (1.05, 0.9), (0.85, 0.5)]
        z = -0.5
        for i, (rad, h) in enumerate(layers):
            st = mark(m)
            nxt = layers[i + 1][0] if i + 1 < len(layers) else rad * 0.8
            m.cyl(rad, h, (rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), z), REEF_ROCK[1], segs=7, r_top=nxt, rot=(0, 0, rng.uniform(0, 1)))
            jitter(m, new_faces(m, st), 0.14)
            facet(m, new_faces(m, st), REEF_ROCK if i % 2 else REEF_ROCK[1:] + ["#e0b0a0"], noise=0.12)
            z += h
        top_r = layers[-1][0] * 0.8
        foot = layers[0][0]
        if v == 0:                                                       # a cap of salt turf, a few shells
            st = mark(m)
            m.ball(top_r * 1.15, (0.1, 0, z - 0.05), WEED[1], subdiv=1, scale=(1.1, 1, 0.28), jitter=0.12)
            facet(m, new_faces(m, st), [WEED[0], WEED[1], "#5a9a5a"], noise=0.15)
            for k in range(3):
                a = rng.uniform(0, math.tau)
                m.ball(0.26, (math.cos(a) * top_r * 0.6, math.sin(a) * top_r * 0.6, z + 0.2), ("#f0e0c8", "#ff9a7a")[k % 2], subdiv=0)
        else:                                                            # a pool, dark and deep, one glint
            m.cyl(top_r * 0.75, 0.1, (0.1, 0.1, z - 0.02), "#e8c8b8", segs=7)
            m.cyl(top_r * 0.6, 0.1, (0.1, 0.1, z), "#1f8a9a", segs=7)
            m.ball(0.22, (0.3, -0.1, z + 0.08), TIDE_POOL, subdiv=0, glow=True)
            m.ball(0.3, (top_r * 0.5, -top_r * 0.6, z), "#ff7a90", subdiv=0)
    elif v == 2:
        for (x, y, s) in ((0, 0, 1.4), (1.8, 0.8, 0.9), (-1.4, 1.2, 0.8), (0.6, -1.6, 0.7)):
            st = mark(m)
            m.cyl(s, 0.6 * s, (x, y, -0.4), REEF_ROCK[1], segs=6, r_top=s * 0.8, rot=(rng.uniform(-0.15, 0.15), 0, rng.uniform(0, 1)))
            jitter(m, new_faces(m, st), 0.14 * s)
            facet(m, new_faces(m, st), REEF_ROCK[1:] + ["#e0b0a0"], noise=0.12)
        m.cyl(0.55, 0.06, (0.1, 0.1, 0.45), "#1f8a9a", segs=6)
    else:
        for side in (-1, 1):                                             # two halves of one boulder
            st = mark(m)
            lump(m, rng, (side * 0.75, 0, 0.5), (1.1, 1.7, 1.3), REEF_ROCK[1], n=14, flat=0.5)
            xform(m, st, M(rot=(0, side * 0.12, rng.uniform(-0.1, 0.1))))
            facet(m, new_faces(m, st), REEF_ROCK, noise=0.12)
        m.ball(0.55, (0, 0.2, 0.4), C_ORANGE[2], subdiv=0, scale=(1, 1, 0.4))     # a starfish wedged in the crack
        m.ball(0.3, (0, 0.2, 0.55), C_ORANGE[3], subdiv=0)
        foot = 1.8
    # a crust of barnacles and pink coral at the waterline, and some weed
    for k in range(9):
        a = rng.uniform(0, math.tau)
        d = foot * rng.uniform(0.9, 1.15)
        m.ball(rng.uniform(0.25, 0.4), (math.cos(a) * d, math.sin(a) * d, rng.uniform(-0.1, 0.3)),
               rng.choice((BARNACLE, "#ff7a90", WEED[0], WEED[1])), subdiv=0)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


# --- the Bone Archipelago ----------------------------------------------------------------

def giant_rib(v):
    """OBSTACLE: one rib of something colossal, arching out of the sea. Both feet are solid (one
    collider each); you fly under the span."""
    r = root("giant_rib", v)
    rng = random.Random(600 + v)
    m = Model(f"giant_rib_{v}", 600 + v)
    W, H, bend = (7.0, 14.6, 2.6) if v == 0 else (7.6, 15.0, -3.0)
    pts, radii = [], []
    n = 16
    for i in range(n + 1):
        t = i / n
        th = math.pi * t
        c, s = math.cos(th), math.sin(th)
        x = W * math.copysign(abs(c) ** 0.8, c) + (0.8 * s * (1 - t) if v else -0.6 * s * t)
        z = H * abs(s) ** 0.75 - 0.6
        y = bend * s
        pts.append(Vector((x, y, z)))
        # the head end (t=0) is a heavy knuckle; the far end tapers
        radii.append(1.45 - 0.85 * t if v == 0 else 1.35 - 0.75 * t)
    st = mark(m)
    path_tube(m, pts, radii, BONE[2], segs=7)
    m.ball(1.9, tuple(pts[0] + Vector((-0.4, 0, 0.8))), BONE[2], subdiv=1, scale=(1.0, 1.1, 1.3), jitter=0.12)   # the knuckle
    facet(m, new_faces(m, st), BONE, noise=0.1)
    # a dark groove along the top of the arch, worn cracks
    for i in range(3, n - 2, 2):
        a, b = pts[i], pts[i + 1]
        m.box((0.35, 0.35, (b - a).length * 0.7), tuple((a + b) / 2 + Vector((0, 0, radii[i] * 0.9))), BONE[1],
              rot=(0, -math.atan2(b.z - a.z, b.x - a.x) + math.pi / 2, 0))
    # where it meets the sea: weed, barnacles, pink coral
    for foot in (pts[0], pts[-1]):
        for k in range(9):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(1.2, 2.2)
            m.ball(rng.uniform(0.3, 0.55), (foot.x + math.cos(a) * d, foot.y + math.sin(a) * d, rng.uniform(-0.2, 0.5)),
                   rng.choice((WEED[0], WEED[1], BARNACLE, "#ff7a90", BONE[1])), subdiv=0)
        st = mark(m)
        m.cyl(2.4, 0.5, (foot.x, foot.y, -0.4), REEF_ROCK[1], segs=8, r_top=1.6)
        jitter(m, new_faces(m, st), 0.2)
        facet(m, new_faces(m, st), REEF_ROCK, noise=0.1)
    m.build(r)
    # the legs: where the rib passes flight height, each foot is solid
    for leg in (pts[: n // 2 + 1], pts[n // 2:]):
        tall = [p for p in leg if 8.0 < p.z < 12.5]   # the part of this leg a ship at height 10 could hit
        lo = min(tall, key=lambda p: p.z)
        hi = max(tall, key=lambda p: p.z)
        mid = (lo + hi) / 2
        rad = max((Vector((p.x - mid.x, p.y - mid.y, 0))).length for p in tall) + 1.4
        collider(r, round(mid.x, 2), round(mid.y, 2), round(rad, 2))
        print(f"giant_rib_{v} collider at ({mid.x:.2f}, {mid.y:.2f}) r {rad:.2f}")
    return r


def skull_isle(v):
    """An island that is a skull: a sandbar round its jaw, mangroves sprouting from its crown, the
    tide washing through its eyes."""
    r = root("skull_isle", v)
    rng = random.Random(620 + v)
    m = Model(f"skull_isle_{v}", 620 + v)
    s0 = mark(m)
    st = mark(m)
    m.ball(3.6, (0, 1.2, 1.8), BONE[2], subdiv=2, scale=(1.0, 1.15, 0.85), jitter=0.08)    # the cranium
    m.box((4.6, 3.6, 2.6), (0, -2.2, 0.4), BONE[2], taper=0.75)                          # the face
    m.box((3.0, 3.4, 1.8), (0, -4.4, -0.2), BONE[2], taper=0.7)                          # the snout
    for side in (-1, 1):
        m.ball(1.3, (side * 2.6, -1.0, 2.0), BONE[2], subdiv=1, scale=(0.9, 1.4, 0.7))     # brow ridges
        m.box((1.2, 3.4, 1.4), (side * 3.0, 0.4, 0.2), BONE[2], rot=(0, 0, side * 0.15))  # cheekbones
    facet(m, new_faces(m, st), BONE, noise=0.08)
    for side in (-1, 1):
        m.ball(1.45, (side * 1.55, -2.6, 1.8), BONE_DARK, subdiv=1, scale=(1.0, 0.9, 0.85))  # eye sockets
        m.cyl(0.7, 0.1, (side * 1.55, -3.1, 1.0), BIOLUM, segs=7, glow=True, rot=(0.6, 0, 0))
    m.ball(0.7, (0, -5.2, 0.4), BONE_DARK, subdiv=1, scale=(1.2, 0.8, 0.7))               # the nose
    for k in range(7):                                                                    # teeth at the waterline
        x = (k - 3) * 0.55
        m.cyl(0.24, 0.9, (x, -5.6 + abs(x) * 0.35, -0.6), BONE[3], segs=4, r_top=0.05)
    for k in range(3):                                                                    # cracks over the dome
        a = 0.4 + k * 0.9
        m.box((0.25, 2.2, 0.25), (math.cos(a) * 1.4, 1.4 + math.sin(a) * 0.8, 4.65 - k * 0.15), BONE[0],
              rot=(0.15, 0, a))
    xform(m, s0, M((0, 0.4, 0.2), (-0.12, 0, 0), (1.2, 1.2, 1.2)))
    # the reef it lies on, crusted with barnacles and coral
    st = mark(m)
    m.cyl(7.0, 0.9, (0, 0.2, -0.6), REEF_ROCK[1], segs=11, r_top=6.0)
    jitter(m, new_faces(m, st), 0.35)
    xform(m, st, M(scale=(1.0, 1.2, 1.0)))
    facet(m, new_faces(m, st), REEF_ROCK, noise=0.15)
    for k in range(12):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(6.0, 7.0)
        m.ball(rng.uniform(0.4, 0.65), (math.cos(a) * d, math.sin(a) * d * 1.15 + 0.2, -0.1),
               rng.choice((BARNACLE, "#ff7a90", WEED[0], C_ORANGE[2])), subdiv=0)
    # green has taken the crown
    for k in range(7):
        a = k / 7 * math.tau + rng.uniform(-0.3, 0.3)
        d = rng.uniform(0.5, 2.3)
        st = mark(m)
        m.ball(rng.uniform(0.9, 1.2), (math.cos(a) * d * 1.2, 2.2 + math.sin(a) * d * 1.2, 5.6 - d * 0.45), LEAF[1], subdiv=1,
               scale=(1, 1, 0.7), jitter=0.12)
        facet(m, new_faces(m, st), LEAF, noise=0.12)
    m.build(r)
    light(r, (0, -3.2, 1.6), BIOLUM, radius=6, intensity=0.6, halo=False)
    return r


def build():
    for v in range(3):
        coral_fan(v)
        coral_brain(v)
        coral_tube(v)
        mangrove(v)
    for v in range(4):
        tide_rock(v)
    for v in range(2):
        giant_rib(v)
    skull_isle(0)
