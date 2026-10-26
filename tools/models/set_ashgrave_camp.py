"""ASHGRAVE, the Scav Camp (docs/level-design.md, its layout row): the Draw, where the clans' crawler-
barges have drawn up together on the ash, laid out by src/sim/layouts/scavcamp.ts. The Sankvi live on
their crawlers and roll between the wrecks; every line of the camp is a crawler's. Here:

- the crawler-barges themselves (SOLID at the cab tower): a family's barge, a workshop with its
  crane, a galley with its tanks, each on two tracks behind a dozer blade, a ramp let down aft;
- the clan tents and the long fire of a laager's commons;
- the berm the blades pushed up round the camp, and the gate towers in it (SOLID);
- the sort's claims, each one kind of salvage sorted by size inside its stakes, and the stakes;
- the row's stalls, facing the Chikta barges (set_ashgrave_glass.py's sail-barges and lanterns);
- the muster's banners, the clan rigs parked on their pads, and the head's berth (a giant);
- the forge: furnaces under chimneys of titan pipe (SOLID), crucibles, slag, ingots;
- the picket at the way out (SOLID).

The Sankvi's things are made of the war: titan plate in both sides' colours (ivory, gunmetal),
rust, patched tarps, the clan hand green on grey on everything. Blender +x is game +x, +y is up the
screen (the way you fly). Built into set_ashgrave (see its build())."""
from __future__ import annotations

import math
import random

from mathutils import Vector

from kit import Model, animate, light
from props_a_lib import hull
from props_b_kit import M, collider, facet, limb, mark, new_faces, root, sway, xform
from props_b_ashgrave import (FIRE, GUNMETAL, HAZARD, HOST_YELLOW, IVORY, OXBLOOD, RUST, STEEL, TARP, TARP_DARK,
                              WAR_RED)
from set_ashgrave_glass import _banner
from set_ashgrave_titans import ASH, CABLE, FRAME, HAND_GREEN, LAMP, _ash, _hand_sign, _plate

# a crawler's running gear: the tread, the road wheels, the blade's scraped edge
TREAD = ["#1a1816", "#26221e", "#34302a"]
BLADE = ["#4a2a1c", "#6a3a22", "#8a5232"]
EDGE = "#a8a49a"
# the camp's tarps, sun-faded and patched: most of them dull, one bright patch now and then
DULL = ["#6e5a44", "#5e5a46", "#74503e", "#4e5a5e", "#8a7a5e"]
# the camp's own ash, trodden and sooty
SOOT = ["#2a2622", "#3a3430", "#4e4640"]
WHITEWASH = "#c8c2b4"
WINDOW = "#ffb860"
# titan alloy: pale grey-green, a sheen like pewter
ALLOY = ["#5a6660", "#7a8a82", "#9cb0a6", "#c4d4ca"]
SLAG = ["#18100c", "#241812", "#33221a"]
MOLTEN = ("#ff7a2a", True)
MOLTEN_PALE = ("#ffc070", True)
# a fire's embers, banked low: dull and big, never a bright speck (those are shots)
EMBER = ["#7a2e16", "#a2441c", "#c0662a"]


def _tarps(m, rng, n=1):
    return [rng.choice(DULL) if rng.random() > 0.18 else rng.choice(TARP) for _ in range(n)]


def _hand_up(m, loc, s, rot=0.0, back=WHITEWASH, color=HAND_GREEN):
    """The clan hand on a whitewashed square, flat on a roof, where you see it from above."""
    x, y, z = loc
    m.box((2.3 * s, 2.3 * s, 0.06), (x, y, z), back, rot=(0, 0, rot))
    _hand_sign(m, (x, y, z + 0.05), s, color=color, rot=rot + math.pi / 2)


def _hand_face(m, loc, s, facing=-1.0):
    """The clan hand on a whitewashed board standing upright, its face toward -y (facing=-1) or +y."""
    st = mark(m)
    m.box((2.3 * s, 0.1, 2.3 * s), (0, 0, 0), WHITEWASH)
    st2 = mark(m)
    _hand_sign(m, (0, 0, 0), s, rot=math.pi / 2)
    xform(m, st2, M((0, facing * 0.08, 0), (math.pi / 2, 0, 0)))
    xform(m, st, M(loc))


# --- the crawler-barges --------------------------------------------------------------------------
# Along x, the bow +x: the blade at x 12-14, the cab tower at x 7, the deck from -11 to 4, the
# ramp let down aft to x -16. The tracks at y +-4.2. Under 8.5 but for the cab tower (to 15.5).

CAB_X = 7.0


def _tracks(m, rng):
    faces = set()
    for y in (-4.2, 4.2):
        st = mark(m)
        m.box((22.5, 2.4, 2.4), (0, y, 1.2), TREAD[1])
        # (the run of tread round its ends)
        m.cyl(1.2, 2.4, (11.2, y - 1.2, 1.2), TREAD[1], segs=7, rot=(-math.pi / 2, 0, 0))
        m.cyl(1.2, 2.4, (-11.2, y - 1.2, 1.2), TREAD[1], segs=7, rot=(-math.pi / 2, 0, 0))
        faces |= facet(m, new_faces(m, st), TREAD, noise=0.05)
        # the cleats across its top, and the road wheels on its outer face
        for k in range(15):
            m.box((0.35, 2.5, 0.16), (-10.5 + k * 1.5, y, 2.44), TREAD[2])
        sy = 1 if y > 0 else -1
        for k in range(6):
            m.cyl(0.85, 0.3, (-8.5 + k * 3.4, y + sy * 1.2, 1.0), STEEL[0], segs=7, rot=(-sy * math.pi / 2, 0, 0))
            m.cyl(0.3, 0.32, (-8.5 + k * 3.4, y + sy * 1.24, 1.0), RUST[1], segs=5, rot=(-sy * math.pi / 2, 0, 0))
        # a skirt of plate over the tracks, patched
        for k in range(5):
            cols = [IVORY, GUNMETAL, RUST][rng.randrange(3)]
            if cols is RUST:
                cols = [RUST[0], RUST[1], RUST[2], RUST[3]]
            faces |= _plate(m, (4.3, 0.3, 1.1), (-8.8 + k * 4.4, y + sy * 1.35, 2.25), (sy * 0.35, 0, rng.uniform(-0.03, 0.03)), cols)
    return faces


def _blade(m, rng):
    """The dozer blade across the bow: curved, rusted, its edge scraped bright, on two push arms."""
    st = mark(m)
    for k in range(5):
        a = -0.5 + k * 0.25
        m.box((0.5, 12.4, 0.75), (13.0 + math.sin(a) * 0.9, 0, 1.0 + k * 0.62), BLADE[1], rot=(0, a, 0))
    faces = facet(m, new_faces(m, st), BLADE, noise=0.1)
    m.box((0.6, 12.6, 0.3), (13.4, 0, 0.2), EDGE)
    for y in (-3.4, 3.4):
        limb(m, (11.0, y, 1.6), (12.8, y, 2.0), 0.35, 0.3, STEEL[0], segs=5)
    # the last wreck it pushed, still caught on it: a plate, scored
    if rng.random() < 0.6:
        _plate(m, (1.6, 3.0, 0.3), (14.0, rng.uniform(-4, 4), 1.4), (0, -0.9, rng.uniform(-0.3, 0.3)), IVORY)
    return faces


def _hull(m, rng):
    faces = set()
    st = mark(m)
    m.box((23.0, 7.0, 1.2), (0, 0, 2.95), RUST[1])
    faces |= facet(m, new_faces(m, st), [RUST[0], RUST[1], RUST[2]], noise=0.08)
    # the deck, in plates from both sides' titans and anything else flat
    for k in range(8):
        x = -10.0 + k * 2.9
        cols = [IVORY, GUNMETAL, STEEL + [STEEL[2]], RUST][rng.randrange(4)]
        faces |= _plate(m, (2.9, 6.6, 0.12), (x, rng.uniform(-0.2, 0.2), 3.6), (0, 0, rng.uniform(-0.03, 0.03)), cols)
    # rails along its sides
    for y in (-3.45, 3.45):
        m.box((21.0, 0.12, 0.12), (-0.5, y, 4.55), RUST[0])
        for k in range(8):
            m.box((0.12, 0.12, 0.9), (-10.5 + k * 3.0, y, 4.1), RUST[0])
    return faces


def _cab(m, r, rng, v):
    """The cab tower at the bow: the crawler's bridge, tall enough to see over a wreck, the hand on
    its roof. It's the one part past the flight line."""
    faces = set()
    x = CAB_X
    cols = [IVORY, GUNMETAL, IVORY][v]
    st = mark(m)
    m.box((4.6, 5.4, 6.0), (x, 0, 6.6), cols[2], taper=0.94)
    m.box((4.0, 4.6, 3.6), (x - 0.2, 0, 11.4), cols[2], taper=0.9)
    faces |= facet(m, new_faces(m, st), cols, noise=0.05)
    # the trim band, the bridge's windows all round, lit
    m.box((4.7, 5.5, 0.4), (x, 0, 9.4), [OXBLOOD, HOST_YELLOW, RUST[2]][v])
    m.box((3.7, 4.75, 0.8), (x - 0.2, 0, 12.0), "#1a1612")
    for dy in (-1.4, 0.0, 1.4):
        m.box((3.8, 0.9, 0.55), (x - 0.2, dy, 12.0), WINDOW, glow=True)
    # the roof: a lookout's rail, the antenna, the hand where you see it
    m.box((4.4, 5.0, 0.3), (x - 0.2, 0, 13.35), cols[1])
    _hand_up(m, (x - 0.2, 0, 13.55), 1.0, rot=0.0)
    limb(m, (x + 1.2, 1.8, 13.5), (x + 1.4, 2.0, 15.6), 0.07, 0.05, STEEL[0], segs=4)
    m.box((0.3, 0.3, 0.3), (x + 1.4, 2.0, 15.7), "#8a2a20")
    m.cyl(0.55, 0.25, (x - 1.6, -1.8, 13.5), STEEL[1], segs=6, r_top=0.8, rot=(0.5, 0, 0.6))
    # a ladder up its back, a hatch
    m.box((0.2, 1.0, 9.0), (x - 2.35, -1.6, 8.0), RUST[0])
    light(r, (x + 2.6, 0, 11.6), WINDOW, radius=6, intensity=0.6, flicker=0.05, halo=False)
    collider(r, x, 0, 2.7)
    # the engine's exhaust stacks behind the cab, sooted at their mouths
    for y in (-2.9, 2.9):
        m.cyl(0.45, 4.6, (x - 3.2, y, 3.6), RUST[0], segs=6)
        m.cyl(0.5, 0.5, (x - 3.2, y, 8.0), "#1a1614", segs=6)
    return faces


def _ramp(m, rng, down=True):
    """The ramp at the stern: let down to the ash (the crawler's door), or hauled up."""
    if down:
        st = mark(m)
        m.box((5.4, 4.6, 0.3), (-14.0, 0, 1.8), RUST[1], rot=(0, -0.62, 0))
        facet(m, new_faces(m, st), [RUST[0], RUST[1], RUST[2]], noise=0.1)
        for k in range(5):
            m.box((0.2, 4.4, 0.12), (-12.2 - k * 0.9, 0, 3.0 - k * 0.6), RUST[0], rot=(0, -0.62, 0))
        for y in (-2.3, 2.3):
            limb(m, (-11.4, y, 4.5), (-16.4, y, 1.0), 0.06, 0.06, RUST[0], segs=3)
    else:
        m.box((0.3, 4.6, 4.8), (-11.7, 0, 5.4), RUST[1], rot=(0, 0.12, 0))
        _hand_face(m, (-11.95, 0, 5.6), 0.9, facing=-1.0)


def _laundry(m, rng, a, b, n=5):
    a, b = Vector(a), Vector(b)
    limb(m, a, b, 0.03, 0.03, "#2a2622", segs=3)
    for k in range(n):
        p = a.lerp(b, (k + 0.6) / (n + 0.4))
        m.box((0.75, 0.08, rng.uniform(0.7, 1.1)), tuple(p - Vector((0, 0, 0.5))), rng.choice(DULL + [TARP[4], TARP[0]]), rot=(0, 0, math.atan2(b.y - a.y, b.x - a.x)))


def _shack(m, rng, x, y, w, d, h, roof=None):
    """A deck shack: walls of plate, a tin roof sloped and patched."""
    faces = set()
    cols = [IVORY, GUNMETAL][rng.randrange(2)]
    st = mark(m)
    m.box((w, d, h), (x, y, 3.7 + h / 2), cols[1])
    faces |= facet(m, new_faces(m, st), cols, noise=0.08)
    m.box((w + 0.5, d + 0.6, 0.2), (x, y, 3.7 + h + 0.15), roof or rng.choice([RUST[2], STEEL[1], RUST[1]]), rot=(rng.choice((-0.12, 0.12)), 0, 0))
    m.box((0.7, 0.1, 1.4), (x + rng.uniform(-w / 3, w / 3), y - d / 2 - 0.05, 4.4), "#1a1612")
    m.box((0.5, 0.1, 0.45), (x + w / 3, y - d / 2 - 0.06, 5.2), WINDOW, glow=True)
    return faces


def crawler(v):
    """SOLID (the cab tower): a clan's crawler-barge, its home: on two tracks behind a dozer blade,
    the cab tower at the bow, the ramp let down aft. v0 a family's (shacks, laundry, water drums),
    v1 a workshop's (a crane over the side, plates racked, a welding rig, its ramp up), v2 a galley's
    (two great tanks on cradles, a cookhouse aft, stovepipes)."""
    r = root("ashgrave_crawler", v)
    rng = random.Random(7000 + v)
    m = Model(f"ashgrave_crawler_{v}", 7000 + v)
    faces = set()
    faces |= _tracks(m, rng)
    faces |= _blade(m, rng)
    faces |= _hull(m, rng)
    faces |= _cab(m, r, rng, v)
    if v == 0:
        faces |= _shack(m, rng, 1.4, -1.0, 3.4, 4.2, 2.6)
        faces |= _shack(m, rng, -6.5, 1.0, 4.6, 4.0, 2.2)
        # the tarp awning between them, laundry across the deck
        _banner(m, [(-3.4, -3.2, 6.0), (-0.4, -3.2, 6.0), (-0.4, 3.0, 5.2), (-3.4, 3.0, 5.2)], _tarps(m, rng, 4), rng, 2, 2)
        _laundry(m, rng, (-9.5, -2.8, 6.0), (-2.0, -3.2, 6.2))
        for k in range(4):
            m.cyl(0.55, 1.2, (-9.6 + (k % 2) * 1.2, 2.4 - (k // 2) * 1.2, 3.7), [STEEL[1], RUST[2], "#3e4a3a", STEEL[0]][k], segs=7)
        m.cyl(0.25, 3.0, (-6.0, 2.4, 5.9), RUST[0], segs=5)
        _ramp(m, rng, True)
    elif v == 1:
        # the crane: a slewing base, its jib out over the side, a plate hanging off the hook
        m.cyl(1.4, 1.2, (-2.0, 0, 3.7), STEEL[1], segs=8)
        m.box((2.0, 2.0, 1.6), (-2.0, 0, 5.6), HAZARD)
        jib0 = Vector((-2.0, 0.6, 6.2))
        jib1 = Vector((-6.5, 7.6, 7.8))
        limb(m, jib0, jib1, 0.45, 0.3, HAZARD, segs=4)
        for k in range(5):
            p = jib0.lerp(jib1, (k + 0.5) / 5)
            m.box((0.2, 0.2, 0.7), tuple(p + Vector((0, 0, -0.3))), "#2a2622")
        limb(m, jib1, jib1 - Vector((0, 0, 3.2)), 0.04, 0.04, "#2a2622", segs=3)
        _plate(m, (2.4, 1.8, 0.3), tuple(jib1 - Vector((0, 0, 3.6))), (0.4, 0.2, 0.3), GUNMETAL)
        # plates racked aft, the welding rig and its cable reel
        for k in range(6):
            cols = [IVORY, GUNMETAL][k % 2]
            faces |= _plate(m, (0.35, 3.6, 2.4 - (k % 3) * 0.3), (-9.6 + k * 0.6, -1.0, 4.9), (0, 0.22, 0), cols)
        m.cyl(1.1, 1.0, (-5.5, 2.2, 3.7), CABLE[1], segs=8, rot=(math.pi / 2, 0, 0))
        m.box((1.2, 1.0, 1.0), (1.5, 2.2, 4.2), STEEL[0])
        m.box((0.3, 0.3, 0.3), (1.5, 1.6, 4.9), "#a8e0ff", glow=True)
        faces |= _shack(m, rng, 2.0, -1.4, 3.0, 3.2, 2.2)
        _ramp(m, rng, False)
    else:
        # the tanks: a titan's coolant tanks, lying on cradles
        for y in (-1.6, 1.6):
            st = mark(m)
            m.cyl(1.5, 9.0, (-5.5, y, 5.3), STEEL[1], segs=8, rot=(0, math.pi / 2, 0))
            faces |= facet(m, new_faces(m, st), [STEEL[0], STEEL[1], STEEL[2], "#a4a6aa"], noise=0.05)
            for k in range(3):
                m.box((0.4, 1.9, 0.8), (-8.5 + k * 3, y, 3.9), RUST[0])
            m.cyl(1.55, 0.4, (-5.5 + 1.5, y, 5.3), OXBLOOD if y < 0 else HOST_YELLOW, segs=8, rot=(0, math.pi / 2, 0))
        # the cookhouse at the bow's foot, its stovepipes smoking
        faces |= _shack(m, rng, 1.8, 0, 3.6, 5.6, 2.6, roof=RUST[2])
        for y in (-1.6, 0.4, 2.0):
            m.cyl(0.22, 2.4, (1.0, y, 6.4), "#2a2622", segs=5)
        _laundry(m, rng, (-10.5, 3.2, 5.8), (-1.0, 3.4, 6.0), 4)
        _ramp(m, rng, True)
    # a lamp aft, crates at the rail
    m.box((0.4, 0.4, 0.5), (-10.4, -3.0, 4.9), LAMP, glow=True)
    light(r, (-10.4, -3.0, 5.2), LAMP, radius=5, intensity=0.55, flicker=0.25, halo=False)
    for k in range(3):
        m.box((0.9, 0.9, 0.8), (-3.0 + k * 2.6 + rng.uniform(-0.4, 0.4), 2.8, 4.1), rng.choice([TARP_DARK, RUST[2], "#3e4a3a", STEEL[1]]), rot=(0, 0, rng.uniform(-0.3, 0.3)))
    _ash(m, faces, 0.22)
    m.build(r)
    return r


# --- the commons ---------------------------------------------------------------------------------


def tent(v):
    """A clan tent: patched tarps over a frame of titan ribs, long and low along x, its door flap
    open at +x, guy lines pegged out. v0 short, v1 long with a stovepipe, v2 a double (two ridges)."""
    r = root("ashgrave_tent", v)
    rng = random.Random(7100 + v)
    m = Model(f"ashgrave_tent_{v}", 7100 + v)
    L = [5.0, 7.0, 6.0][v]
    W = 3.6
    H = 2.4
    ridges = [0.0] if v < 2 else [-1.5, 1.5]
    for y0 in ridges:
        cols = _tarps(m, rng, 5)
        for sd in (-1, 1):
            _banner(m, [(-L / 2, y0, H), (L / 2, y0, H), (L / 2, y0 + sd * W / 2, 0.15), (-L / 2, y0 + sd * W / 2, 0.15)], cols, rng, 3, 2)
        # the ribs at the ends and the middle: a titan's, dark, showing through
        for x in (-L / 2 - 0.1, 0.0, L / 2 + 0.1):
            for sd in (-1, 1):
                limb(m, (x, y0, H + 0.25), (x, y0 + sd * (W / 2 + 0.3), 0.0), 0.16, 0.2, FRAME[1], segs=4)
        # the door open at +x: the dark inside, a lamp
        m.prism([(0, 0.1), (W * 0.32, 0.1), (0, H - 0.2)], 0.1, (L / 2 + 0.02, y0, 0), "#1a1612", rot=(0, 0, math.pi / 2))
    m.box((0.4, 0.4, 0.45), (L / 2 + 0.6, ridges[0] - 1.2, 0.25), LAMP, glow=True)
    light(r, (L / 2 + 0.8, ridges[0] - 1.2, 0.8), LAMP, radius=3.5, intensity=0.45, flicker=0.3, halo=False)
    if v == 1:
        m.cyl(0.18, 1.6, (-L / 4, 0.8, 1.8), "#2a2622", segs=5)
    # guy lines and pegs
    for x in (-L / 2 - 0.6, L / 2 + 0.6):
        for sd in (-1, 1):
            y = ridges[-1 if sd > 0 else 0] + sd * (W / 2 + 1.0)
            limb(m, (x * 0.85, y - sd * 1.0, H * 0.7), (x, y, 0.05), 0.03, 0.03, "#2a2622", segs=3)
            m.box((0.2, 0.2, 0.3), (x, y, 0.1), RUST[0])
    # things by the door
    for k in range(2):
        m.box((0.6, 0.6, 0.55), (L / 2 + rng.uniform(0.4, 1.4), rng.uniform(-1.2, 1.2), 0.28), rng.choice([RUST[1], "#3e4a3a", TARP_DARK]), rot=(0, 0, rng.uniform(0, 1)))
    m.build(r)
    return r


def longfire(v):
    """The commons' long fire: a trench of embers rimmed with plates, a spit over it on two tripods
    with the clan's pot, benches of plate on drums round it. Lit, flickering."""
    r = root("ashgrave_longfire", v)
    rng = random.Random(7150 + v)
    m = Model(f"ashgrave_longfire_{v}", 7150 + v)
    L = 5.5 + v
    st = mark(m)
    m.box((L, 1.6, 0.3), (0, 0, 0.05), SOOT[0])
    for k in range(int(L / 0.8)):
        x = -L / 2 + 0.4 + k * 0.8
        m.box((0.75, 1.3, 0.25), (x, rng.uniform(-0.15, 0.15), 0.25), EMBER[rng.randrange(3)], glow=True, rot=(0, 0, rng.uniform(-0.4, 0.4)))
        if rng.random() < 0.5:
            m.box((0.6, 0.5, 0.3), (x, rng.uniform(-0.3, 0.3), 0.42), SOOT[0], rot=(0.2, 0.3, rng.uniform(0, 1)))
    # the rim of plates either side, tipped in
    for sd in (-1, 1):
        for k in range(int(L / 1.4)):
            _plate(m, (1.4, 0.6, 0.5), (-L / 2 + 0.7 + k * 1.4, sd * 1.05, 0.3), (sd * 0.5, 0, rng.uniform(-0.1, 0.1)), [IVORY, GUNMETAL][rng.randrange(2)])
    # the spit and its pot
    for x in (-L / 2 + 0.3, L / 2 - 0.3):
        for a in (0.0, 2.1, 4.2):
            limb(m, (x + math.cos(a) * 0.7, math.sin(a) * 0.7, 0), (x, 0, 2.0), 0.06, 0.06, STEEL[0], segs=3)
    limb(m, (-L / 2 + 0.3, 0, 2.0), (L / 2 - 0.3, 0, 2.0), 0.07, 0.07, STEEL[0], segs=3)
    m.cyl(0.6, 0.8, (rng.uniform(-1, 1), 0, 0.9), "#1e1c1c", segs=7)
    # the benches all round
    for sd in (-1, 1):
        for k in range(2):
            x = (k - 0.5) * L * 0.55
            y = sd * 2.6
            _plate(m, (L * 0.45, 0.9, 0.2), (x, y, 0.75), (0, 0, rng.uniform(-0.1, 0.1)), [IVORY, GUNMETAL][rng.randrange(2)])
            for dx in (-L * 0.18, L * 0.18):
                m.cyl(0.32, 0.65, (x + dx, y, 0), rng.choice([RUST[1], STEEL[0]]), segs=6)
    light(r, (0, 0, 1.4), FIRE[1], radius=9, intensity=1.0, flicker=0.45, halo=True)
    m.build(r)
    return r


def clutter(v):
    """What gathers at a crawler's foot: v0 drums, some on their sides, v1 crates stacked with a tarp
    thrown over, v2 a spare road wheel, jerrycans and a coil of cable."""
    r = root("ashgrave_clutter", v)
    rng = random.Random(7170 + v)
    m = Model(f"ashgrave_clutter_{v}", 7170 + v)
    if v == 0:
        for k in range(5):
            a = k * 1.3
            d = 0.6 + (k % 2) * 0.7
            col = rng.choice([RUST[2], STEEL[1], "#3e4a3a", OXBLOOD])
            if k == 4:
                m.cyl(0.55, 1.2, (1.6, 0.2, 0.55), col, segs=7, rot=(math.pi / 2, 0, 0.4))
            else:
                m.cyl(0.55, 1.2, (math.cos(a) * d, math.sin(a) * d, 0), col, segs=7)
                m.cyl(0.56, 0.1, (math.cos(a) * d, math.sin(a) * d, 0.75), "#2a2622", segs=7)
    elif v == 1:
        for k, (x, y, z, w) in enumerate(((0, 0, 0.5, 1.2), (1.3, 0.2, 0.45, 1.0), (0.4, 0.1, 1.45, 0.9), (-1.1, -0.3, 0.4, 0.8))):
            m.box((w, w, w * 0.9), (x, y, z), rng.choice([RUST[2], "#5a4a32", "#3e4a3a", STEEL[1]]), rot=(0, 0, rng.uniform(-0.3, 0.3)))
        _banner(m, [(-0.4, -0.7, 1.95), (1.2, -0.6, 1.95), (1.4, 0.8, 0.8), (-0.6, 0.8, 1.6)], _tarps(m, rng, 2), rng, 2, 1)
    else:
        m.cyl(1.1, 0.7, (0, 0, 0.0), TREAD[1], segs=8)
        m.cyl(0.4, 0.75, (0, 0, 0.0), RUST[1], segs=6)
        for k in range(3):
            m.box((0.45, 0.25, 0.6), (1.5 + k * 0.5, -0.5, 0.3), [OXBLOOD, "#3e4a3a", RUST[2]][k])
        m.cyl(0.6, 0.35, (-1.3, 0.7, 0), CABLE[1], segs=8)
        m.cyl(0.25, 0.4, (-1.3, 0.7, 0), SOOT[0], segs=6)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def laundry(v):
    """A washing line between two poles, the clan's clothes and blankets on it, faded: 6 long."""
    r = root("ashgrave_laundry", v)
    rng = random.Random(7180 + v)
    m = Model(f"ashgrave_laundry_{v}", 7180 + v)
    for x in (-3.0, 3.0):
        limb(m, (x, 0, -0.1), (x, 0, 2.7), 0.09, 0.08, RUST[0], segs=4)
    _laundry(m, rng, (-3.0, 0, 2.6), (3.0, 0, 2.5), 6)
    m.build(r)
    return r


def hearth(v):
    """A family's fire: a ring of plate shards round banked embers, a tripod and its pot, a log or two
    of titan cable to sit on. Lit low and dull: the camp's light, never a shot's."""
    r = root("ashgrave_hearth", v)
    rng = random.Random(7160 + v)
    m = Model(f"ashgrave_hearth_{v}", 7160 + v)
    m.cyl(1.3, 0.12, (0, 0, -0.02), SOOT[0], segs=9)
    for k in range(7):
        a = k * math.tau / 7 + rng.uniform(-0.1, 0.1)
        _plate(m, (0.8, 0.45, 0.45), (math.cos(a) * 1.15, math.sin(a) * 1.15, 0.2), (0, 0.3, a), [IVORY, GUNMETAL, [SOOT[0], SOOT[1], SOOT[2]]][k % 3])
    for k in range(4):
        m.box((0.7, 0.5, 0.2), (rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), 0.15), EMBER[k % 3], glow=True, rot=(0, 0, rng.uniform(0, 3)))
    for a in (0.3, 2.4, 4.5):
        limb(m, (math.cos(a) * 1.0, math.sin(a) * 1.0, 0), (0, 0, 1.9), 0.06, 0.06, STEEL[0], segs=3)
    m.cyl(0.45, 0.55, (0, 0, 0.8), "#1e1c1c", segs=7)
    for k in range(2 + v):
        a = rng.uniform(0, math.tau)
        limb(m, (math.cos(a) * 2.0 - math.sin(a) * 0.9, math.sin(a) * 2.0 + math.cos(a) * 0.9, 0.25), (math.cos(a) * 2.0 + math.sin(a) * 0.9, math.sin(a) * 2.0 - math.cos(a) * 0.9, 0.25), 0.25, 0.25, CABLE[k % 3], segs=5)
    light(r, (0, 0, 1.2), EMBER[2], radius=6, intensity=0.8, flicker=0.4, halo=False)
    m.build(r)
    return r


# --- the berm and its gate -----------------------------------------------------------------------


def berm(v):
    """The camp's wall: a long heap of ash along x the crawlers' blades pushed up, the hulks it buried
    sticking out of it (a truck's cab, a wheel, plates on edge, drums, a girder). Under 6."""
    r = root("ashgrave_berm", v)
    rng = random.Random(7200 + v)
    m = Model(f"ashgrave_berm_{v}", 7200 + v)
    L = 16.0
    faces = set()
    # the ash heap: a long hull, its crest wandering
    pts = []
    for k in range(9):
        x = -L / 2 + k * L / 8
        w = 3.2 + rng.uniform(-0.5, 0.6)
        hgt = 2.4 + rng.uniform(-0.6, 0.6) if 0 < k < 8 else 0.6
        pts += [(x, -w, 0), (x, w, 0), (x, rng.uniform(-0.8, 0.8), hgt), (x + rng.uniform(-0.6, 0.6), rng.uniform(-1.5, 1.5), hgt * 0.75)]
    st = mark(m)
    hull(m, pts, "#6e665e")
    facet(m, new_faces(m, st), ["#4e4842", "#615a52", "#746c62", "#887e72"], noise=0.12)
    # the hulks it buried
    for k in range(7):
        x = -L / 2 + 1.2 + k * (L - 2.4) / 6 + rng.uniform(-0.6, 0.6)
        kind = (k + v) % 5 if rng.random() < 0.7 else rng.randrange(5)
        z = 2.2 + rng.uniform(0, 1.0)
        if kind == 0:
            # a truck's cab, nose down in it
            st = mark(m)
            m.box((3.4, 3.0, 2.6), (x, rng.uniform(-1, 1), z), rng.choice([RUST[2], "#4e5a48", GUNMETAL[3]]), rot=(rng.uniform(-0.4, 0.4), 0.5, rng.uniform(-0.5, 0.5)), taper=0.8)
            faces |= facet(m, new_faces(m, st), [RUST[0], RUST[1], RUST[2]], noise=0.15)
            m.box((1.6, 2.2, 0.6), (x + 0.2, 0, z + 0.7), "#1a1612", rot=(0, 0.5, 0))
        elif kind == 1:
            m.cyl(1.3, 0.9, (x, rng.uniform(-1, 1), z - 0.4), TREAD[1], segs=8, rot=(rng.uniform(1.0, 1.5), 0, rng.uniform(0, 3)))
            m.cyl(0.5, 1.0, (x, 0, z - 0.4), RUST[1], segs=6, rot=(1.2, 0, 0))
        elif kind == 2:
            faces |= _plate(m, (4.2, 0.45, 3.2), (x, rng.uniform(-1.2, 1.2), z + 0.4), (rng.uniform(-0.3, 0.3), 0, rng.uniform(-0.6, 0.6)), [IVORY, GUNMETAL][rng.randrange(2)])
        elif kind == 3:
            for j in range(3):
                m.cyl(0.55, 1.2, (x + j * 0.9 - 0.9, rng.uniform(-1.5, 1.5), z - 0.6), rng.choice([RUST[2], STEEL[1], "#3e4a3a"]), segs=7, rot=(rng.uniform(-0.8, 0.8), rng.uniform(-0.8, 0.8), 0))
        else:
            limb(m, (x - 2.0, rng.uniform(-1, 1), z - 0.6), (x + 2.2, rng.uniform(-2, 2), z + 1.2), 0.3, 0.3, RUST[0], segs=4)
    _ash(m, faces, 0.35)
    m.build(r)
    return r


def gate_tower(v):
    """SOLID: a gate tower in the berm, either side of the way in: a stack of crawler tread and drums
    under a column of titan pipe, the lookout's cage on top with a lamp and a junk gun, the clan's
    banner hung down its face toward you (-y). v0 square, v1 round."""
    r = root("ashgrave_gate_tower", v)
    rng = random.Random(7250 + v)
    m = Model(f"ashgrave_gate_tower_{v}", 7250 + v)
    faces = set()
    # the footing: tread sections and drums heaped
    for k in range(6):
        a = k * math.tau / 6 + rng.uniform(-0.2, 0.2)
        m.box((3.0, 1.4, 1.2), (math.cos(a) * 2.6, math.sin(a) * 2.6, 0.5), TREAD[1], rot=(0, 0, a + math.pi / 2))
    for k in range(5):
        a = rng.uniform(0, math.tau)
        m.cyl(0.55, 1.2, (math.cos(a) * 3.6, math.sin(a) * 3.6, 0), rng.choice([RUST[2], STEEL[1], "#3e4a3a"]), segs=7)
    # the column
    cols = [IVORY, GUNMETAL][v]
    st = mark(m)
    if v == 0:
        m.box((4.2, 4.2, 12.0), (0, 0, 6.0), cols[2], taper=0.82)
    else:
        m.cyl(2.3, 12.0, (0, 0, 0), cols[2], segs=8, r_top=1.9)
    faces |= facet(m, new_faces(m, st), cols, noise=0.06)
    for z in (3.0, 7.0):
        m.box((4.6 if v == 0 else 4.4, 4.6 if v == 0 else 4.4, 0.4), (0, 0, z), [OXBLOOD, HOST_YELLOW][v])
    # the cage: a platform wider than the column, its rail, the lamp, a junk gun
    m.box((5.6, 5.6, 0.4), (0, 0, 12.2), RUST[1])
    for x in (-2.6, 2.6):
        for y in (-2.6, 2.6):
            m.box((0.2, 0.2, 1.6), (x, y, 13.2), RUST[0])
    for a in range(4):
        rot = a * math.pi / 2
        m.box((5.4, 0.15, 0.15), (math.cos(rot) * 2.6, math.sin(rot) * 2.6, 13.9), RUST[0], rot=(0, 0, rot + math.pi / 2))
    m.box((2.0, 2.0, 1.6), (0.8, 0.8, 13.2), STEEL[0])
    _hand_up(m, (0.8, 0.8, 14.05), 0.6)
    limb(m, (-0.8, -0.8, 13.0), (-1.6, -3.4, 13.6), 0.22, 0.18, "#2a2622", segs=5)
    m.box((0.6, 0.6, 0.7), (-1.9, 1.9, 13.0), LAMP, glow=True)
    light(r, (-1.9, 1.9, 13.6), LAMP, radius=7, intensity=0.7, flicker=0.2, halo=False)
    # the banner down its face, toward you
    m.box((3.2, 0.15, 5.4), (0, -2.45 if v == 0 else -2.3, 8.6), "#5e5a54")
    m.box((3.2, 0.16, 0.5), (0, -2.47 if v == 0 else -2.32, 6.0), "#3a3430")
    st = mark(m)
    _hand_sign(m, (0, 0, 0), 1.2, rot=math.pi / 2)
    xform(m, st, M((0, -2.62 if v == 0 else -2.47, 9.0), (math.pi / 2, 0, 0)))
    collider(r, 0, 0, 2.4)
    _ash(m, faces, 0.25)
    m.build(r)
    return r


# --- the sort ------------------------------------------------------------------------------------
# A claim is 8 x 8 (x, y +-4): what one clan dug, one kind, sorted by size, inside its four stakes.

BRASS = ["#4a3c22", "#6a5630", "#8a7444"]
CLAIM_KINDS = ("plates", "barrels", "casings", "engines", "drums", "fingers")


def _stake(m, rng, x, y, hand=False):
    limb(m, (x, y, -0.2), (x + rng.uniform(-0.1, 0.1), y + rng.uniform(-0.1, 0.1), 2.2), 0.12, 0.1, RUST[0], segs=4)
    m.box((0.5, 0.1, 0.9), (x + 0.2, y, 1.7), rng.choice(DULL + [TARP[0]]), rot=(0, 0.1, rng.uniform(0, math.tau)))
    if hand:
        _hand_face(m, (x, y - 0.2, 2.6), 0.55)


def claim(v):
    """A clan's claim in the sort: a square of scraped ash inside four stakes and a rope, the clan's
    hand on the front stake, and inside it one kind of salvage sorted by size: v0 plates in stacks,
    v1 gun barrels racked by bore, v2 shell casings in pyramids, v3 servo blocks in a grid, v4 cable
    drums in rows, v5 a titan's finger joints laid out in order. Under 3."""
    r = root("ashgrave_claim", v)
    rng = random.Random(7300 + v)
    m = Model(f"ashgrave_claim_{v}", 7300 + v)
    faces = set()
    m.box((8.2, 8.2, 0.12), (0, 0, 0.0), SOOT[2])
    for x, y in ((-4, -4), (4, -4), (4, 4), (-4, 4)):
        _stake(m, rng, x, y, hand=(x, y) == (-4, -4))
    for a, b in (((-4, -4), (4, -4)), ((4, -4), (4, 4)), ((4, 4), (-4, 4)), ((-4, 4), (-4, -4))):
        limb(m, (a[0], a[1], 1.5), (b[0], b[1], 1.5), 0.03, 0.03, "#2a2622", segs=3)
    kind = CLAIM_KINDS[v]
    if kind == "plates":
        for k, (x, w) in enumerate(((-2.0, 3.4), (1.1, 2.6), (3.0, 1.6))):
            for j in range(4 - k):
                cols = [IVORY, GUNMETAL][(j + k) % 2]
                faces |= _plate(m, (w, w * 1.6, 0.4), (x, rng.uniform(-0.2, 0.2), 0.3 + j * 0.42), (0, 0, rng.uniform(-0.08, 0.08)), cols)
    elif kind == "barrels":
        for y in (-2.6, 2.6):
            m.box((7.4, 0.5, 0.4), (0, y, 0.25), RUST[0])
        for k in range(6):
            rad = 0.62 - k * 0.07
            y = -2.9 + k * 1.1
            st = mark(m)
            m.cyl(rad, 6.8, (-3.4, 0, 0.45 + rad), GUNMETAL[2] if k % 2 else STEEL[1], segs=7, rot=(0, math.pi / 2, 0))
            faces |= xform(m, st, M((0, 0, 0), (0, 0, math.pi / 2)) @ M((0, -y, 0)))
            m.cyl(rad * 0.55, 0.1, (-y, -3.45, 0.45 + rad), "#121212", segs=6, rot=(math.pi / 2, 0, 0))
    elif kind == "casings":
        for k, (x, y, n) in enumerate(((-1.8, -1.6, 4), (1.6, -1.6, 3), (-1.6, 1.8, 3), (1.8, 1.8, 2))):
            rad = 0.42 - k * 0.04
            for row in range(n):
                for c in range(n - row):
                    m.cyl(rad, rad * 0.4, (x - (n - row - 1) * rad + c * rad * 2, y, 0.1 + row * rad * 1.7 + rad), BRASS[2 - row % 2], segs=7, rot=(math.pi / 2, 0, 0))
                    m.cyl(rad, 1.6, (x - (n - row - 1) * rad + c * rad * 2, y - 0.8, 0.1 + row * rad * 1.7 + rad), BRASS[1], segs=7, rot=(-math.pi / 2, 0, 0))
    elif kind == "engines":
        for i in range(3):
            for j in range(2):
                x, y = -2.6 + i * 2.6, -1.6 + j * 3.2
                s = 1.0 - i * 0.15
                cols = [GUNMETAL, IVORY][j]
                faces |= _plate(m, (2.0 * s, 2.0 * s, 1.4 * s), (x, y, 0.7 * s + 0.1), (0, 0, rng.uniform(-0.2, 0.2)), cols)
                m.cyl(0.7 * s, 1.0 * s, (x, y, 1.5 * s), STEEL[0], segs=7)
                m.box((2.1 * s, 0.25, 0.25), (x, y, 1.0 * s), [OXBLOOD, HOST_YELLOW][j])
    elif kind == "drums":
        for i in range(3):
            for j in range(2):
                rad = 1.2 - i * 0.2
                x, y = -2.4 + i * 2.5, -1.7 + j * 3.4
                m.cyl(rad, 1.6, (x, y - 0.8, rad), RUST[1], segs=8, rot=(-math.pi / 2, 0, 0))
                m.cyl(rad * 0.85, 1.7, (x, y - 0.85, rad), CABLE[(i + j) % 3], segs=8, rot=(-math.pi / 2, 0, 0))
                m.cyl(0.3, 1.8, (x, y - 0.9, rad), STEEL[2], segs=5, rot=(-math.pi / 2, 0, 0))
    else:
        # a finger's joints, sorted: knuckle shells in a row, biggest at the back
        for j in range(3):
            for i in range(4 - j):
                s = 1.15 - j * 0.25
                x, y = -2.7 + i * 1.9 * s + j * 0.6, 2.2 - j * 2.4
                st = mark(m)
                m.ball(0.9 * s, (x, y, 0.55 * s), IVORY[3], subdiv=1, scale=(1.0, 1.25, 0.7))
                faces |= facet(m, new_faces(m, st), IVORY[1:], noise=0.05)
                m.box((1.5 * s, 0.25, 0.25), (x, y - 0.6 * s, 0.75 * s), OXBLOOD)
    _ash(m, faces, 0.2)
    m.build(r)
    return r


# --- the row --------------------------------------------------------------------------------------


def stall(v):
    """A Sankvi stall, its front toward -y: a counter of plate on drums, a patched tarp awning on four
    poles sloping down over it, its goods: v0 food (the pot, bowls, a lamp), v1 parts (a rack of them
    hung up, a crate of bolts), v2 lamps (a dozen lanterns hung, all lit: the lamp-seller)."""
    r = root("ashgrave_stall", v)
    rng = random.Random(7400 + v)
    m = Model(f"ashgrave_stall_{v}", 7400 + v)
    W = 5.0
    faces = set()
    for x in (-W / 2, W / 2):
        limb(m, (x, 1.6, 0), (x, 1.6, 3.4), 0.1, 0.1, RUST[0], segs=4)
        limb(m, (x, -2.2, 0), (x, -2.2, 2.5), 0.1, 0.1, RUST[0], segs=4)
    # the awning: a striped market tarp, sloping down to the front, its scalloped edge hanging
    stripe = ["#b0703a", "#4a6a80", "#9a4a36"][v]
    for k in range(5):
        x0 = -W / 2 - 0.3 + k * (W + 0.6) / 5
        x1 = x0 + (W + 0.6) / 5
        col = stripe if k % 2 == 0 else "#c8bca0"
        _banner(m, [(x0, 1.9, 3.5), (x1, 1.9, 3.5), (x1, -2.6, 2.4), (x0, -2.6, 2.4)], [col], rng, 1, 1)
        m.box((x1 - x0 - 0.1, 0.08, 0.5), ((x0 + x1) / 2, -2.65, 2.15), col)
    # the counter
    faces |= _plate(m, (W - 0.4, 1.2, 0.2), (0, -1.4, 1.1), (0, 0, 0), [IVORY, GUNMETAL][v % 2])
    for x in (-1.6, 1.6):
        m.cyl(0.45, 1.0, (x, -1.4, 0), rng.choice([RUST[1], STEEL[0]]), segs=7)
    if v == 0:
        m.cyl(0.7, 0.7, (-1.0, -1.4, 1.2), "#1e1c1c", segs=7)
        m.cyl(0.6, 0.06, (-1.0, -1.4, 1.9), "#8a7a5a", segs=7)
        for k in range(3):
            m.cyl(0.28, 0.2, (0.4 + k * 0.6, -1.4, 1.2), TARP[4], segs=6)
        m.box((1.6, 1.0, 0.8), (1.2, 0.8, 0.4), TARP_DARK)
    elif v == 1:
        limb(m, (-W / 2, 0.6, 2.6), (W / 2, 0.6, 2.6), 0.05, 0.05, RUST[0], segs=3)
        for k in range(6):
            x = -2.0 + k * 0.8
            m.box((0.5, 0.2, 0.6), (x, 0.6, 2.1), rng.choice([STEEL[1], STEEL[2], RUST[2], IVORY[3]]), rot=(0, rng.uniform(-0.3, 0.3), 0))
        m.box((1.2, 0.9, 0.5), (0.8, -1.4, 1.45), RUST[1])
        for k in range(4):
            m.box((0.3, 0.3, 0.2), (0.5 + k * 0.2, -1.4, 1.8), STEEL[2])
    else:
        for k in range(8):
            x = -2.0 + (k % 4) * 1.3
            y = 0.8 if k < 4 else -0.6
            m.box((0.38, 0.38, 0.5), (x, y, 2.2 - (k % 2) * 0.3), [LAMP, WINDOW, "#ffd890"][k % 3], glow=True)
        light(r, (0, 0, 2.2), LAMP, radius=6, intensity=0.75, flicker=0.15, halo=True)
    # crates behind
    for k in range(2):
        m.box((0.9, 0.9, 0.8), (rng.uniform(-2, 2), rng.uniform(0.6, 1.4), 0.4), rng.choice([RUST[2], "#3e4a3a", TARP_DARK]), rot=(0, 0, rng.uniform(-0.4, 0.4)))
    m.build(r)
    return r


# --- the muster -----------------------------------------------------------------------------------

CLAN = ("hand", "spine", "eye", "kneel")


def banner(v):
    """A clan's banner at the muster: a gun barrel stood on end, a crossbar, the banner hung from it
    toward you (-y), blowing back so its face shows from above: whitewashed grey, the hand green on
    it, the clan's own mark under: v0 the Hand, v1 the Spine (a column of bars), v2 the Eye (a ring),
    v3 the Kneel (a chevron). Under 8."""
    r = root("ashgrave_banner", v)
    rng = random.Random(7500 + v)
    m = Model(f"ashgrave_banner_{v}", 7500 + v)
    limb(m, (0, 0, -0.2), (0, 0, 7.6), 0.22, 0.16, GUNMETAL[1], segs=6)
    m.cyl(0.55, 0.5, (0, 0, -0.1), RUST[0], segs=6)
    m.box((3.4, 0.2, 0.2), (0, -0.25, 7.3), RUST[0])
    m.box((0.35, 0.35, 0.35), (0, 0, 7.75), HAND_GREEN)
    # the cloth, built flat with its face up and hanging toward -y, then stood up and blown back
    cloth = Model(f"ashgrave_banner_cloth_{v}", 7500 + v)
    field = ["#8a857c", "#7e7c7a", "#8e867a", "#84807a"][v]
    cloth.box((3.0, 3.8, 0.1), (0, -1.9, 0), field)
    cloth.box((3.0, 0.4, 0.12), (0, -3.7, 0.01), "#3a3430")
    cloth.box((3.0, 0.25, 0.12), (0, -0.2, 0.01), [OXBLOOD, "#3a3430", HOST_YELLOW, "#3a3430"][v])
    _hand_sign(cloth, (0, -1.55, 0.07), 1.0, rot=math.pi / 2)
    mk = "#3e5a48"
    if v == 1:
        for k in range(3):
            cloth.box((1.1 - k * 0.25, 0.22, 0.06), (0, -2.55 - k * 0.32, 0.08), mk)
    elif v == 2:
        for k in range(8):
            a = k * math.tau / 8
            cloth.box((0.24, 0.24, 0.06), (math.cos(a) * 0.45, -2.85 + math.sin(a) * 0.45, 0.08), mk)
    elif v == 3:
        for sd in (-1, 1):
            cloth.box((0.85, 0.24, 0.06), (sd * 0.33, -2.85, 0.08), mk, rot=(0, 0, -sd * 0.6))
    else:
        cloth.box((1.4, 0.22, 0.06), (0, -2.7, 0.08), mk)
    tilt = 0.55
    xform(cloth, set(), M((0, 0, 0), (math.pi / 2 - tilt, 0, 0)))
    c = cloth.build(r, loc=(0, -0.3, 7.25))
    sway(c, f"ashgrave_banner_{v}_blow_idle", amp=0.05, period=2.6 + v * 0.3, phase=v * 0.4)
    m.build(r)
    return r


def rig(v):
    """A clan rig parked on its pad, cold, under its tarps: a scrap gunship on skids, a tarp over its
    cockpit and another over its gun, chocks, a fuel drum and a ladder. Dull on purpose: a rig that
    can fly at you is a foe, this one's asleep. Nose +y."""
    r = root("ashgrave_rig", v)
    rng = random.Random(7550 + v)
    m = Model(f"ashgrave_rig_{v}", 7550 + v)
    faces = set()
    # the pad: plates laid in a square, a ring painted on it
    for i in range(4):
        for j in range(4):
            m.box((1.95, 1.95, 0.1), (-3.0 + i * 2.0, -3.0 + j * 2.0, 0.0), ["#7a7468", "#6e6a62", "#86806f"][(i * 3 + j) % 3])
    for k in range(8):
        a = k * math.tau / 8
        m.box((1.6, 0.35, 0.06), (math.cos(a) * 3.2, math.sin(a) * 3.2, 0.08), "#c8b890", rot=(0, 0, a + math.pi / 2))
    for x in (-1.4, 1.4):
        m.box((0.3, 5.0, 0.3), (x, 0, 0.3), STEEL[0])
    cols = [RUST[0], RUST[1], RUST[2], RUST[3]] if v == 0 else GUNMETAL
    st = mark(m)
    hull(m, [(x * s, y, z) for x, y, z in ((-1.2, -2.4, 0.6), (1.2, -2.4, 0.6), (-1.0, 2.6, 0.8), (1.0, 2.6, 0.8), (-1.1, -2.2, 2.0), (1.1, -2.2, 2.0), (-0.6, 2.4, 1.7), (0.6, 2.4, 1.7), (0, 3.4, 1.0)) for s in (1,)], cols[1])
    faces |= facet(m, new_faces(m, st), cols, noise=0.08)
    # stub wings, two thruster pods (cold), a tarp thrown over the cockpit and one over the gun
    for sd in (-1, 1):
        faces |= _plate(m, (2.6, 1.6, 0.25), (sd * 2.2, -0.4, 1.5), (0, sd * 0.15, sd * 0.15), cols)
        m.cyl(0.6, 2.0, (sd * 3.3, -1.6, 1.4), STEEL[0], segs=7, rot=(math.pi / 2, 0, 0))
        m.cyl(0.4, 0.1, (sd * 3.3, -2.7, 1.4), "#121212", segs=7, rot=(math.pi / 2, 0, 0))
    _banner(m, [(-1.3, 1.0, 2.2), (1.3, 1.0, 2.2), (1.5, 2.9, 1.0), (-1.5, 2.9, 1.0)], _tarps(m, rng, 3), rng, 2, 2)
    _banner(m, [(-0.8, -1.8, 2.4), (0.8, -1.8, 2.4), (1.0, -0.2, 2.1), (-1.0, -0.2, 2.1)], [TARP_DARK, DULL[0]], rng, 2, 1)
    _hand_up(m, (0, -1.0, 2.5), 0.4)
    m.cyl(0.5, 1.1, (3.0, 2.6, 0), rng.choice([RUST[2], "#3e4a3a"]), segs=7)
    limb(m, (-2.6, 1.6, 0), (-1.4, 1.0, 2.0), 0.08, 0.08, RUST[0], segs=3)
    _ash(m, faces, 0.25)
    m.build(r)
    return r


def berth(v):
    """GIANT: the head's berth, where *Unbending*'s head sets down when it isn't flying: a great round
    pad of plate, the warlord's hand painted huge on it in gold, four low cradle arms round it holding
    nothing, the gangway tower at its back (SOLID) with Khet's banner, the cables snaking in from the
    plant he wired its eye into, fuel drums in a file, landing lamps round its rim. 34 across; under 6
    but the tower."""
    r = root("ashgrave_berth", v)
    rng = random.Random(7600 + v)
    m = Model(f"ashgrave_berth_{v}", 7600 + v)
    faces = set()
    # the pad: rings of plates, the hand big in the middle
    m.cyl(11.5, 0.3, (0, 0, -0.1), "#4a4440", segs=16)
    for ring_r, n in ((10.0, 16), (7.0, 12), (4.0, 8)):
        for k in range(n):
            a = (k + 0.5) * math.tau / n
            m.box((ring_r * math.tau / n * 0.92, 2.8, 0.12), (math.cos(a) * ring_r, math.sin(a) * ring_r, 0.22), ["#6e6860", "#625c56", "#7a746a"][k % 3], rot=(0, 0, a + math.pi / 2))
    m.cyl(2.6, 0.12, (0, 0, 0.2), "#6e6860", segs=10)
    _hand_sign(m, (0.4, 0, 0.32), 5.0, color="#c89a3a", rot=math.pi / 2)
    # the cradle arms: four low curved ribs at the corners, rising toward a head that isn't there
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        cx, cy = math.cos(a), math.sin(a)
        pts = [Vector((cx * (12.0 - t * 4.0), cy * (12.0 - t * 4.0), 0.2 + 4.2 * math.sin(t * 1.3))) for t in (0, 0.25, 0.5, 0.75, 1.0)]
        for j in range(len(pts) - 1):
            limb(m, pts[j], pts[j + 1], 0.75, 0.6, HAZARD if j % 2 else RUST[1], segs=6)
        st = mark(m)
        m.box((2.4, 1.6, 0.5), tuple(pts[-1] + Vector((0, 0, 0.3))), "#2a2622", rot=(0, 0, a))
        faces |= new_faces(m, st)
        m.box((1.6, 1.0, 0.4), tuple(pts[-1] + Vector((0, 0, 0.7))), "#3a3430", rot=(0, 0, a))
    # the gangway tower at its back, the banner on it
    tx, ty = 0.0, 14.0
    for x in (-1.8, 1.8):
        for y in (-1.8, 1.8):
            limb(m, (tx + x, ty + y, 0), (tx + x * 0.8, ty + y * 0.8, 15.0), 0.3, 0.25, RUST[1], segs=5)
    for z in (3.0, 6.5, 10.0, 13.5):
        m.box((3.8, 3.8, 0.35), (tx, ty, z), RUST[2])
    m.box((2.2, 7.0, 0.35), (tx, ty - 5.0, 13.5), RUST[2])
    for x in (-1.0, 1.0):
        m.box((0.12, 7.0, 0.12), (tx + x, ty - 5.0, 14.4), RUST[0])
    m.box((3.0, 0.15, 4.6), (tx, ty - 1.95, 10.8), "#4a4642")
    st = mark(m)
    _hand_sign(m, (0, 0, 0), 1.2, color="#c89a3a", rot=math.pi / 2)
    xform(m, st, M((tx, ty - 2.05, 11.2), (math.pi / 2, 0, 0)))
    m.box((0.6, 0.6, 0.6), (tx + 1.6, ty - 1.6, 15.2), "#8a2a20")
    collider(r, tx, ty, 2.4)
    # the plant (off at -x) and its cables snaking in to the pad
    st = mark(m)
    m.box((4.0, 3.0, 2.6), (-16.0, -5.0, 1.3), GUNMETAL[2])
    faces |= facet(m, new_faces(m, st), GUNMETAL, noise=0.05)
    m.box((1.2, 1.2, 0.5), (-16.0, -5.0, 2.8), LAMP, glow=True)
    for k in range(3):
        p = Vector((-14.0, -5.6 + k * 0.6, 0.4))
        a = rng.uniform(-0.3, 0.3)
        for i in range(4):
            a += rng.uniform(-0.5, 0.5)
            q = Vector((p.x + 1.4 + math.cos(a) * 0.6, p.y + math.sin(a) * 1.2 + 0.6, 0.4))
            limb(m, p, q, 0.3, 0.3, CABLE[k], segs=4)
            p = q
    # fuel drums in a file, the landing lamps round its rim
    for k in range(6):
        m.cyl(0.6, 1.3, (14.5, -7.0 + k * 1.4, 0), [RUST[2], "#3e4a3a"][k % 2], segs=7)
    for k in range(12):
        a = k * math.tau / 12
        m.box((0.9, 0.9, 0.35), (math.cos(a) * 12.0, math.sin(a) * 12.0, 0.2), "#d8c8a0")
    light(r, (0, 0, 6), LAMP, radius=14, intensity=0.5, flicker=0.05, halo=False)
    _ash(m, faces, 0.15)
    m.build(r)
    return r


# --- the forge ------------------------------------------------------------------------------------


def furnace(v):
    """SOLID (the chimney): a furnace for titan alloy: a squat body of stacked plate with its mouth
    lit toward -y, under a chimney of titan leg-pipe in sections, banded, taller than you fly; the
    tuyeres' pipes, a heap of fuel. v0 one chimney, v1 a pair."""
    r = root("ashgrave_furnace", v)
    rng = random.Random(7700 + v)
    m = Model(f"ashgrave_furnace_{v}", 7700 + v)
    faces = set()
    st = mark(m)
    m.box((7.0, 6.0, 4.2), (0, 0, 2.1), SOOT[1], taper=0.8)
    faces |= facet(m, new_faces(m, st), [SOOT[0], SOOT[1], SOOT[2], "#5e5650"], noise=0.1)
    for k in range(5):
        faces |= _plate(m, (2.4, 0.4, 1.4), (-2.8 + k * 1.4, -3.0, 1.2 + (k % 2) * 1.2), (0.25, 0, rng.uniform(-0.1, 0.1)), [IVORY, GUNMETAL][k % 2])
    m.box((2.4, 0.4, 1.6), (0, -3.2, 0.9), MOLTEN[0], glow=True)
    m.box((1.4, 0.3, 0.8), (0, -3.35, 0.6), MOLTEN_PALE[0], glow=True)
    xs = (0.0,) if v == 0 else (-1.8, 1.8)
    for x in xs:
        st = mark(m)
        for k in range(4):
            m.cyl(1.5 - k * 0.08, 3.4, (x, 0.6, 4.0 + k * 3.2), IVORY[2] if k % 2 else GUNMETAL[2], segs=8)
        faces |= facet(m, new_faces(m, st), [SOOT[1], IVORY[1], IVORY[2], IVORY[3]], noise=0.05)
        for k in range(4):
            m.cyl(1.6, 0.4, (x, 0.6, 4.0 + k * 3.2), [OXBLOOD, HOST_YELLOW][k % 2], segs=8)
        m.cyl(1.25, 0.2, (x, 0.6, 16.85), "#120e0c", segs=8)
        collider(r, x, 0.6, 1.6)
    for sd in (-1, 1):
        limb(m, (sd * 4.6, -1.0, 0.6), (sd * 3.3, -1.0, 2.0), 0.35, 0.35, RUST[1], segs=5)
    for k in range(6):
        m.box((0.9, 0.9, 0.7), (3.6 + rng.uniform(0, 1.5), 1.6 + rng.uniform(-1.4, 1.4), 0.3 + (k % 2) * 0.5), SOOT[0], rot=(0, 0, rng.uniform(0, 1)))
    light(r, (0, -4.2, 1.2), MOLTEN[0], radius=7, intensity=0.9, flicker=0.3, halo=True)
    _ash(m, faces, 0.15)
    m.build(r)
    return r


def crucible(v):
    """A crucible on its tilting frame by the furnace, the alloy glowing in it, a row of ingot moulds
    before it, one filled and cooling."""
    r = root("ashgrave_crucible", v)
    rng = random.Random(7750 + v)
    m = Model(f"ashgrave_crucible_{v}", 7750 + v)
    for x in (-1.6, 1.6):
        m.box((0.4, 0.4, 2.8), (x, 0, 1.4), STEEL[0])
    m.box((3.6, 0.3, 0.3), (0, 0, 2.7), STEEL[0])
    st = mark(m)
    m.cyl(1.0, 1.6, (0, 0, 1.0), SOOT[1], segs=8, r_top=1.25, rot=(0.25 * (1 if v else -1), 0, 0))
    facet(m, new_faces(m, st), SOOT, noise=0.06)
    m.cyl(1.0, 0.1, (0, 0.15 * (1 if v else -1), 2.55), MOLTEN[0], segs=8, glow=True)
    for k in range(4):
        x = -2.4 + k * 1.6
        m.box((1.2, 0.8, 0.35), (x, -2.4, 0.18), SOOT[0])
        m.box((0.9, 0.5, 0.06), (x, -2.4, 0.36), MOLTEN[0] if k == 0 else (ALLOY[2] if k == 1 else SOOT[1]), glow=k == 0)
    light(r, (0, 0, 3.2), MOLTEN[0], radius=4, intensity=0.7, flicker=0.3, halo=False)
    m.build(r)
    return r


def ingots(v):
    """Titan alloy, cast and stacked to trade: ingots in crossed tiers, pale and pewter-green. v0 a
    tall stack, v1 a long low one."""
    r = root("ashgrave_ingots", v)
    m = Model(f"ashgrave_ingots_{v}", 7800 + v)
    faces = set()
    tiers = 5 if v == 0 else 3
    n = 3 if v == 0 else 5
    for t in range(tiers):
        for k in range(n):
            off = (k - (n - 1) / 2) * 0.75
            loc = (off, 0, 0.18 + t * 0.36) if t % 2 == 0 else (0, off, 0.18 + t * 0.36)
            size = (0.6, 2.2, 0.32) if t % 2 == 0 else (2.2, 0.6, 0.32)
            if v == 1:
                size = (0.6, 3.6, 0.32) if t % 2 == 0 else (3.6, 0.6, 0.32)
            st = mark(m)
            m.box(size, loc, ALLOY[2], taper=0.9)
            faces |= facet(m, new_faces(m, st), ALLOY, noise=0.05)
    _hand_up(m, (0, 0, 0.36 * tiers + 0.06), 0.35)
    m.build(r)
    return r


def slag(v):
    """Slag run out of a furnace's tap in a tongue toward +y, set dark, its cracks still lit at the
    thick end, cooling. Flat."""
    r = root("ashgrave_slag", v)
    rng = random.Random(7850 + v)
    m = Model(f"ashgrave_slag_{v}", 7850 + v)
    L = 6.0 + v * 1.2
    pts = []
    for k in range(12):
        a = k * math.tau / 12
        rr = 1.0 + rng.uniform(-0.15, 0.2)
        pts.append((math.cos(a) * 1.6 * rr * (1.0 - 0.35 * max(0, math.sin(a))), math.sin(a) * L / 2 * rr))
    m.slab(pts, -0.05, 0.25, SLAG[1], top=[(x * 0.9, y * 0.95) for x, y in pts])
    for k in range(5):
        m.box((rng.uniform(0.8, 1.6), 0.6, 0.3), (rng.uniform(-0.8, 0.8), -L / 2 + 1.0 + k * L / 6, 0.2), SLAG[2], rot=(0, 0, rng.uniform(-0.3, 0.3)))
    # the cracks still glowing, at the thick near end only
    for k in range(4):
        m.box((rng.uniform(0.6, 1.4), 0.12, 0.06), (rng.uniform(-0.6, 0.6), -L / 2 + 0.6 + k * 0.5, 0.29), MOLTEN[0], glow=True, rot=(0, 0, rng.uniform(-0.8, 0.8)))
    m.build(r)
    return r


def build():
    for v in range(3):
        crawler(v)
        tent(v)
        berm(v)
        stall(v)
        slag(v)
        clutter(v)
    for v in range(2):
        longfire(v)
        gate_tower(v)
        hearth(v)
        laundry(v)
        rig(v)
        furnace(v)
        crucible(v)
        ingots(v)
    for v in range(4):
        banner(v)
    for v in range(len(CLAIM_KINDS)):
        claim(v)
    berth(0)
