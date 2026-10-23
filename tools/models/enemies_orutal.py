"""ORU-TAL's enemies, each its own model: the Hesk Poachers' scrap craft (a skiff, a trawler, a
battery behind a giant's skull, the turtle-backed thunderhide crawler) and the native beasts they
hunt (pterosaurs, the jade wyrm). Seeds 1000-1999.

Hesk hulls are gold-tan (a) with dark trim (b) so they stand off the jungle greens, hazard
striped and bolted on, with trophy tusks; the beasts carry the planet's own glow.
"""
from __future__ import annotations

import math

from kit import Model
from creatures_util import TAU, chain, flat, limb, osc, sample
from enemies_lib import (A, B, C, DARK, GLASS, both, fin, flame, hull, marker, mirror, named, pulse, rotor,
                         spin, tube)

BONE = "#ece2c6"        # tusks, teeth, trophies
BONE_D = "#b8ab8a"      # their shaded side
IRON = "#4a4844"        # bolted armour on the beasts, chains
HAZARD = "#f2c23a"      # the Hesk hazard yellow
EYE = "#ffd84a"         # the pterosaur's eye (its own c is a dark colour)


def _hazard(m: Model, x0, x1, y, z, depth, n, rot=(0, 0, 0)):
    """A row of n hazard blocks from x0 to x1, yellow and black."""
    w = (x1 - x0) / n
    for k in range(n):
        m.box((w * 0.98, depth, 0.06), (x0 + w * (k + 0.5), y, z), HAZARD if k % 2 == 0 else DARK, rot=rot)


def _tusk(m: Model, base, d, length, r, up=0.35, curl=0.0, color=BONE, segs=6):
    """A curved tusk from base along direction d (xy), rising and curling."""
    dx, dy = d
    n = math.hypot(dx, dy)
    dx, dy = dx / n, dy / n
    px, py = -dy, dx
    x, y, z = base
    pts = [(x, y, z)]
    for k in (1, 2, 3):
        t = k / 3
        bend = curl * t * t
        pts.append((x + dx * length * t + px * bend, y + dy * length * t + py * bend, z + up * t * t * length))
    chain(m, pts, [r, r * 0.8, r * 0.5, r * 0.08], color, segs=segs)


# --- Hesk Skiff: dart, ~2.2 ----------------------------------------------------------------------

def hesk_skiff():
    """A poacher's trimaran skiff: a pointed gold hull with tusks lashed to the bow as a ram, two
    pontoons on crossbeams (one patched, one with a net rack), a canvas sail panel, one big
    engine and a bow gun. Lunges like a boat skipping waves."""
    kind, clip, root = named("hesk_skiff", "dart", "mech", "fly", preview=("#c8a040", "#5a3a2a", "#ff6a3a"))
    T = 1.0
    b = Model(f"{kind}_body", seed=1001)
    hull_pts = [(0, 1.12), (-0.24, 0.7), (-0.36, 0.1), (-0.36, -0.6), (-0.28, -0.95), (0.28, -0.95), (0.36, -0.6),
                (0.36, 0.1), (0.24, 0.7)]
    hull(b, [(x * 1.08, y * 1.03) for x, y in hull_pts], -0.34, 0.08, B, inset=0.92)          # dark hull sides
    hull(b, [(x * 0.92, y * 0.97) for x, y in hull_pts], 0.0, 0.16, A, inset=0.85)             # gold topsides
    deck = [(0, 0.8), (-0.16, 0.52), (-0.24, 0.05), (-0.22, -0.78), (0.22, -0.78), (0.24, 0.05), (0.16, 0.52)]
    b.slab(deck, 0.14, 0.19, A.shade(1.2))                                                      # light deck
    for k in range(3):                                                                          # plank seams
        b.box((0.04, 0.9, 0.02), ((k - 1) * 0.13, -0.3, 0.2), A.shade(0.75))
    _hazard(b, -0.2, 0.2, 0.62, 0.2, 0.14, 5)                                                    # bow stripes
    b.box((0.34, 0.34, 0.12), (0, -0.05, 0.22), DARK)                                           # open cockpit
    b.ball(0.13, (0, -0.08, 0.32), A.shade(0.6), subdiv=1)                                       # pilot's helmet
    b.box((0.2, 0.08, 0.06), (0, 0.02, 0.36), C, glow=True)                                      # goggles
    b.box((0.4, 0.1, 0.12), (0, 0.16, 0.27), GLASS, rot=(0.5, 0, 0))                             # windscreen
    # ram tusks lashed to the bow, curling up and in
    for s in (1, -1):
        _tusk(b, (s * 0.18, 0.72, -0.02), (s * 0.35, 1.0), 0.62, 0.11, up=0.25, curl=-s * 0.12)
        b.box((0.16, 0.1, 0.16), (s * 0.19, 0.72, 0.0), DARK)                                    # lashing
    tube(b, 0.07, 0.8, 1.2, 0, 0.06, DARK, segs=5)                                               # bow gun
    b.box((0.18, 0.18, 0.14), (0, 0.78, 0.12), B)
    b.box((0.14, 0.08, 0.1), (0, 1.2, 0.06), C, glow=True)
    # crossbeams and pontoons
    for y in (0.3, -0.45):
        b.box((1.85, 0.14, 0.1), (0, y, 0.08), B)
    for s in (1, -1):
        x = s * 0.92
        tube(b, 0.2, -0.9, 0.62, x, 0.0, B, segs=6, r_end=0.12)                                 # dark pontoon
        b.box((0.16, 1.2, 0.08), (x, -0.18, 0.18), A.shade(1.1))                                  # gold top stripe
        b.box((0.24, 0.16, 0.1), (x, 0.58, 0.08), DARK)                                           # nose cap
        b.box((0.2, 0.22, 0.08), (x, 0.42, 0.22), C, glow=True)                                  # running light
        b.cyl(0.13, 0.06, (x, -0.92, 0.04), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)        # pontoon jet
    b.box((0.26, 0.42, 0.06), (0.93, -0.3, 0.24), A.shade(0.7), rot=(0, 0, 0.12))               # patch plate
    for k in range(3):                                                                          # net rack, left
        b.box((0.5, 0.07, 0.08), (-0.75, -0.0 - k * 0.17, 0.2), A.shade(1.2))
    # canvas sail panel between hull and the right pontoon: a big readable light shape
    flat(b, [(0.36, 0.25), (0.36, -0.4), (0.82, -0.4), (0.82, 0.1)], 0.18, 0.04, "#eadcb2")       # canvas
    flat(b, [(0.36, -0.06), (0.36, -0.2), (0.82, -0.2), (0.82, -0.06)], 0.21, 0.03, C, glow=True)  # clan stripe
    flat(b, [(-0.36, 0.25), (-0.82, 0.1), (-0.82, -0.4), (-0.36, -0.4)], 0.13, 0.04, B.shade(1.25))  # net bed
    # the big engine
    tube(b, 0.26, -0.55, -1.08, 0, 0.12, B, segs=8, r_end=0.23)
    tube(b, 0.2, -0.35, -0.6, 0, 0.12, A.shade(0.8), segs=8)
    b.cyl(0.2, 0.06, (0, -1.09, 0.12), C, segs=8, rot=(math.pi / 2, 0, 0), glow=True)
    b.box((0.08, 0.5, 0.06), (0, -0.82, 0.39), C, glow=True)                                     # heat strip
    fin(b, [(-0.65, 0.3), (-1.05, 0.3), (-1.12, 0.66), (-0.92, 0.66)], 0.04, 0.06, A)
    body = b.build(root)
    flame(body, f"{kind}_flame_0", (0, -1.12, 0.12), 0.18, 0.6, clip, T, k=4)
    for k, s in enumerate((1, -1)):
        flame(body, f"{kind}_flame_{k + 1}", (s * 0.92, -0.95, 0.04), 0.1, 0.35, clip, T, phase=0.3 + k * 0.3, k=5)
    marker(body, kind, "muzzle", (0, 1.25, 0.06))
    osc(body, clip, "location", T, (2, 0.06, 1, 0), (0, 0.03, 1, 0.25))
    osc(body, clip, "rotation_euler", T, (0, 0.06, 1, 0.2), (1, 0.07, 1, 0.45))


# --- Pterosaur: swarm, ~1.2 (span ~1.8) ----------------------------------------------------------

def pterosaur():
    """A crested pterosaur: rust body and a long pale beak, cream membranes with a rust trailing
    band over dark wing-arms, a long dark crest swept back with a cream blaze, gold eyes. The
    two-jointed wings beat with a whip, the outer half lagging."""
    kind, clip, root = named("pterosaur", "swarm", "beast", "flap", preview=("#d0703a", "#f0d8a0", "#5a2a22"))
    W = 1.25  # wings broad enough to read over the jungle
    T = 0.5
    b = Model(f"{kind}_body", seed=1010)
    b.ball(0.17, (0, -0.04, 0), A, subdiv=1, scale=(0.95, 1.55, 0.8))                             # body
    b.ball(0.15, (0, -0.04, -0.06), B, subdiv=1, scale=(0.85, 1.3, 0.6))                          # pale belly
    b.box((0.08, 0.3, 0.04), (0, -0.05, 0.13), C)                                                  # dark spine stripe
    b.ball(0.1, (0, 0.24, 0.04), A, subdiv=1, scale=(0.9, 1.0, 0.9))                              # neck
    b.ball(0.12, (0, 0.37, 0.07), A, subdiv=1, scale=(1.05, 1.2, 0.85))                           # head
    limb(b, (0, 0.44, 0.06), (0, 0.84, 0.0), 0.085, 0.01, B, segs=4)                              # beak (pale)
    limb(b, (0, 0.44, 0.02), (0, 0.76, -0.03), 0.06, 0.01, C, segs=4)                             # lower beak, dark
    # crest: a long blade lying back from the skull, canted up so it reads from above
    crest = [(0.0, 0.42), (-0.1, 0.32), (-0.07, 0.0), (-0.02, -0.28), (0.02, -0.28), (0.07, 0.0), (0.1, 0.32)]
    b.slab([(x, y) for x, y in crest], 0.13, 0.19, C, top=[(x * 0.7, y) for x, y in crest])
    b.slab([(0, 0.24), (-0.05, 0.12), (-0.03, -0.06), (0.03, -0.06), (0.05, 0.12)], 0.19, 0.22, B)  # blaze
    b.prism([(0, 0), (0.12, 0.0), (-0.3, 0.16), (-0.26, 0.08)], 0.05, (0, 0.34, 0.16), C, rot=(0, 0, math.pi / 2))
    for s in (1, -1):
        b.ball(0.055, (s * 0.1, 0.42, 0.11), EYE, subdiv=1, glow=True)
    limb(b, (0, -0.26, 0.0), (0, -0.52, 0.02), 0.055, 0.01, A, segs=4)                            # tail
    b.box((0.13, 0.13, 0.03), (0, -0.52, 0.02), C, rot=(0, 0, 0.785))                             # tail vane
    for s in (1, -1):                                                                             # tucked feet
        limb(b, (s * 0.07, -0.2, -0.06), (s * 0.13, -0.4, -0.08), 0.04, 0.02, C, segs=3)
    body = b.build(root)
    for k, s in enumerate((1, -1)):
        side = "r" if s > 0 else "l"

        def m(pts):
            pts = [(x * W, y * W) for x, y in pts]
            return pts if s > 0 else mirror(pts)
        w = Model(f"{kind}_wing_{side}", seed=1011 + k)
        flat(w, m([(0, 0.12), (0, -0.36), (0.18, -0.33), (0.36, -0.18), (0.38, 0.12)]), 0, 0.04, B)      # membrane
        flat(w, m([(0.0, -0.24), (0.0, -0.36), (0.18, -0.33), (0.36, -0.18), (0.36, -0.08)]), 0.02, 0.03, A)  # rust band
        limb(w, (0, 0.11 * W, 0.02), (s * 0.38 * W, 0.12 * W, 0.02), 0.07, 0.06, C, segs=4)            # arm
        wo = w.build(body, loc=(s * 0.12, 0.04, 0.03))
        t = Model(f"{kind}_tip_{side}", seed=1013 + k)
        flat(t, m([(0, 0.12), (0, -0.18), (0.16, -0.13), (0.3, -0.04), (0.4, 0.06), (0.37, 0.1)]), 0, 0.035, B)
        flat(t, m([(0, -0.08), (0, -0.18), (0.16, -0.13), (0.3, -0.04), (0.37, 0.04), (0.25, 0.0)]), 0.02, 0.03, A)
        limb(t, (0, 0.12 * W, 0.02), (s * 0.39 * W, 0.09 * W, 0.02), 0.06, 0.02, C, segs=4)             # wing finger
        limb(t, (0, 0.12 * W, 0.02), (s * 0.07 * W, 0.21 * W, 0.02), 0.035, 0.0, C, segs=3)            # claw
        to = t.build(wo, loc=(s * 0.38 * W, 0.0, 0.0))
        osc(wo, clip, "rotation_euler", T, (1, s * 0.6, 1, 0.0), (2, s * 0.08, 1, 0.25))
        osc(to, clip, "rotation_euler", T, (1, s * 0.45, 1, -0.1))
    marker(body, kind, "muzzle", (0, 0.86, 0.0))
    osc(body, clip, "location", T, (2, 0.07, 1, 0.5))
    osc(body, clip, "rotation_euler", T, (0, 0.06, 1, 0.75))


# --- Tusk Battery: turret, ~2.5, ground ----------------------------------------------------------

def tusk_battery():
    """A Hesk gun pit fenced with poached tusks; the gun hides inside a giant's skull, eye sockets
    lit, twin barrels out of its jaws, its own tusks sweeping forward like a gunsight."""
    kind, clip, root = named("tusk_battery", "turret", "mech", "scan", preview=("#d0a040", "#3a2a24", "#ff8a3a"),
                             ground=1)
    T = 3.0
    b = Model(f"{kind}_base", seed=1020)
    ring = [(math.cos(TAU * (k + 0.5) / 7) * 1.22, math.sin(TAU * (k + 0.5) / 7) * 1.22) for k in range(7)]
    hull(b, ring, 0, 0.35, B, inset=0.88)                                                        # dark earthwork
    b.cyl(0.95, 0.12, (0, 0, 0.3), A.shade(0.8), segs=7)                                         # plank floor
    for k in range(7):                                                                           # sandbags / scrap
        a = TAU * k / 7
        b.box((0.42, 0.26, 0.2), (math.cos(a) * 0.98, math.sin(a) * 0.98, 0.42), A if k % 2 else A.shade(0.7),
              rot=(0, 0, a + math.pi / 2))
    # the tusk palisade: tusks planted round the rim, leaning out and curling up
    for k in range(6):
        a = TAU * (k + 0.5) / 6 + 0.25
        c, s = math.cos(a), math.sin(a)
        _tusk(b, (c * 1.02, s * 1.02, 0.2), (c, s), 0.34, 0.13, up=1.6, curl=0.12 * (1 if k % 2 else -1))
        b.box((0.24, 0.24, 0.12), (c * 1.05, s * 1.05, 0.24), DARK)
    _hazard(b, -0.5, 0.5, -1.05, 0.4, 0.18, 5)
    for s in (1, -1):                                                                            # ammo crates
        b.box((0.36, 0.3, 0.26), (s * 0.68, -0.62, 0.5), A.shade(1.15), rot=(0, 0, s * 0.3))
        b.box((0.12, 0.12, 0.08), (s * 0.68, -0.62, 0.66), C, glow=True)
    base = b.build(root)
    mast = Model(f"{kind}_dish", seed=1021)                                                       # spinning dish
    mast.cyl(0.04, 0.4, (0, 0, -0.35), DARK, segs=4)
    mast.cyl(0.26, 0.06, (0, 0, 0.05), A.shade(1.2), segs=6, r_top=0.16, rot=(0.9, 0, 0))
    mast.box((0.1, 0.1, 0.1), (0, 0.1, 0.18), C, glow=True)
    dish = mast.build(base, loc=(-0.62, -0.68, 0.95))
    spin(dish, clip, T, 2)

    h = Model(f"{kind}_head", seed=1022)
    h.cyl(0.52, 0.18, (0, -0.1, 0.0), B, segs=7)                                                  # turntable
    h.ball(0.55, (0, -0.05, 0.42), BONE, subdiv=1, scale=(1.05, 1.0, 0.7), jitter=0.025)          # skull dome
    h.ball(0.4, (0, 0.38, 0.32), BONE, subdiv=1, scale=(0.9, 1.0, 0.6), jitter=0.02)              # muzzle of the skull
    h.ball(0.4, (0, -0.2, 0.33), BONE_D, subdiv=1, scale=(1.2, 0.8, 0.55))                        # cheek / neck frill
    h.box((0.62, 0.36, 0.08), (0, -0.2, 0.72), B)                                                 # bolted iron crown
    _hazard(h, -0.28, 0.28, -0.08, 0.77, 0.1, 4)
    for s in (1, -1):
        h.box((0.08, 0.08, 0.06), (s * 0.24, -0.32, 0.78), A.shade(1.3))                          # rivets
        h.ball(0.15, (s * 0.24, 0.3, 0.55), DARK, subdiv=1, scale=(1.1, 1.0, 0.6))                # eye sockets
        h.ball(0.09, (s * 0.24, 0.33, 0.6), C, subdiv=1, glow=True)                               # lit eyes
        _tusk(h, (s * 0.38, 0.35, 0.2), (s * 0.35, 1.0), 0.95, 0.14, up=0.35, curl=-s * 0.3)      # forward tusks
        tube(h, 0.12, 0.45, 1.45, s * 0.14, 0.2, DARK, segs=6)                                    # barrels
        tube(h, 0.16, 0.5, 0.85, s * 0.14, 0.2, A, segs=6)                                        # barrel jackets
        h.cyl(0.13, 0.06, (s * 0.14, 1.42, 0.2), C, segs=6, rot=(-math.pi / 2, 0, 0), glow=True)
    for k in range(4):                                                                            # skull teeth
        h.cyl(0.05, 0.16, ((k - 1.5) * 0.12, 0.68, 0.2), BONE, segs=4, r_top=0.0, rot=(math.pi, 0, 0))
    head = h.build(base, loc=(0, 0.08, 0.42), part="head")
    head.name = f"{kind}_head"
    e = Model(f"{kind}_sensor", seed=1023)
    e.ball(0.11, (0, 0, 0), C, subdiv=1, glow=True)
    sensor = e.build(head, loc=(0, 0.62, 0.48))
    pulse(sensor, clip, T, 0.35, harm=3)
    for k, s in enumerate((1, -1)):
        marker(head, kind, "muzzle", (s * 0.14, 1.5, 0.2), k)


# --- Hesk Trawler: gunship, ~4 -----------------------------------------------------------------

def hesk_trawler():
    """A flying poacher trawler: a gold boat hull with a dark keel, wheelhouse aft, twin deck guns
    on the bow, two net booms swung out with drag nets, a cage on the stern with something alive
    in it, and two big lift fans on outriggers."""
    kind, clip, root = named("hesk_trawler", "gunship", "mech", "hover", preview=("#c8a040", "#4a3a3a", "#ff5a2a"))
    T = 2.0
    b = Model(f"{kind}_body", seed=1030)
    hp = [(0, 2.0), (-0.5, 1.55), (-0.78, 0.8), (-0.82, -1.3), (-0.66, -1.75), (0.66, -1.75), (0.82, -1.3),
          (0.78, 0.8), (0.5, 1.55)]
    hull(b, [(x * 1.07, y * 1.03) for x, y in hp], -0.6, 0.22, B, inset=0.94)                   # dark hull sides
    hull(b, [(x * 0.93, y * 0.97) for x, y in hp], 0.1, 0.3, A, inset=0.9)                     # gold topsides
    deck = [(0, 1.7), (-0.42, 1.35), (-0.66, 0.75), (-0.68, -1.5), (0.68, -1.5), (0.66, 0.75), (0.42, 1.35)]
    b.slab(deck, 0.28, 0.34, A.shade(1.18))
    for k in range(4):                                                                           # deck seams
        b.box((0.05, 2.4, 0.02), ((k - 1.5) * 0.3, -0.2, 0.35), A.shade(0.8))
    b.box((1.5, 0.12, 0.12), (0, 1.0, 0.36), B)                                                  # bulwark lines
    _hazard(b, -0.5, 0.5, 1.28, 0.36, 0.2, 5)
    # bow guns on a ring
    b.cyl(0.42, 0.16, (0, 1.4, 0.34), B, segs=8)
    b.box((0.55, 0.45, 0.26), (0, 1.36, 0.55), A.shade(0.85))
    for s in (1, -1):
        tube(b, 0.09, 1.5, 2.25, s * 0.15, 0.56, DARK, segs=5)
        b.cyl(0.1, 0.05, (s * 0.15, 2.25, 0.56), C, segs=5, rot=(-math.pi / 2, 0, 0), glow=True)
    # wheelhouse aft
    b.box((1.0, 0.75, 0.55), (0, -0.55, 0.6), A)
    b.box((1.12, 0.88, 0.1), (0, -0.55, 0.92), A.shade(1.25))                                     # roof
    b.box((1.12, 0.12, 0.12), (0, -0.98, 0.94), B)
    b.box((0.85, 0.08, 0.22), (0, -0.16, 0.66), GLASS)                                           # windows
    b.box((0.6, 0.06, 0.08), (0, -0.12, 0.72), C, glow=True)
    b.cyl(0.13, 0.4, (0.3, -0.7, 0.96), DARK, segs=6)                                             # stack
    b.box((0.26, 0.26, 0.12), (-0.3, -0.62, 1.0), C, glow=True)                                  # searchlight
    for s in (1, -1):
        b.box((0.16, 0.3, 0.12), (s * 0.78, 0.9, 0.32), C, glow=True)                             # bow lamps
    # stern cage with a captive (glowing eyes in the dark)
    b.box((1.05, 0.6, 0.06), (0, -1.38, 0.38), DARK)
    b.ball(0.24, (0.05, -1.36, 0.5), "#6a4a3a", subdiv=1, scale=(1.3, 1.0, 0.8))
    for s in (1, -1):
        b.ball(0.06, (0.05 + s * 0.1, -1.18, 0.6), C, subdiv=0, glow=True)
    for k in range(5):
        b.box((0.07, 0.62, 0.4), (-0.48 + k * 0.24, -1.38, 0.6), A.shade(0.65))                  # bars
    b.box((1.1, 0.07, 0.07), (0, -1.08, 0.82), A.shade(0.65))
    b.box((1.1, 0.07, 0.07), (0, -1.68, 0.82), A.shade(0.65))
    # net booms swung out forward, drag nets slung under them back to the hull
    for s in (1, -1):
        b.plank_line((s * 0.55, 0.55, 0.5), (s * 1.8, 1.12, 0.7), 0.13, 0.13, DARK)
        b.cyl(0.11, 0.12, (s * 1.8, 1.12, 0.62), C, segs=6, glow=True)
        net = [(s * 0.78, 0.65), (s * 1.75, 1.02), (s * 1.5, 0.15), (s * 0.82, -0.05)]
        flat(b, net if s > 0 else net[::-1], 0.05, 0.04, B.shade(0.8))
        for k in range(3):
            t = (k + 1) / 4
            b.plank_line((s * (0.8 + 0.95 * t), 0.65 + 0.37 * t, 0.09), (s * (0.82 + 0.8 * t), -0.05 + 0.2 * t, 0.09),
                         0.06, 0.04, A.shade(1.25))
        b.plank_line((s * 0.8, 0.3, 0.09), (s * 1.68, 0.6, 0.09), 0.06, 0.04, A.shade(1.25))
    # outriggers and the lift fans
    for s in (1, -1):
        b.box((0.66, 0.4, 0.16), (s * 0.98, -0.95, 0.1), B)
        b.cyl(0.62, 0.32, (s * 1.5, -0.95, -0.12), A, segs=9)
        b.cyl(0.5, 0.04, (s * 1.5, -0.95, 0.2), DARK, segs=9)
        _hazard(b, s * 1.5 - 0.3, s * 1.5 + 0.3, -1.6, 0.18, 0.12, 4)
        tube(b, 0.2, -1.6, -1.95, s * 0.42, -0.1, DARK, segs=6)
        b.cyl(0.16, 0.05, (s * 0.42, -1.96, -0.1), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    b.box((0.4, 0.5, 0.08), (-0.35, 0.3, 0.38), A.shade(0.7), rot=(0, 0, 0.2))                    # patch
    b.box((0.4, 0.34, 0.24), (0.38, 0.45, 0.48), A.shade(1.3), rot=(0, 0, -0.15))                 # crate
    body = b.build(root)
    for k, s in enumerate((1, -1)):
        rotor(body, f"{kind}_fan_{k}", (s * 1.5, -0.95, 0.26), 0.5, 3, clip, T, s * 6, color=B, hub=C)
        flame(body, f"{kind}_flame_{k}", (s * 0.42, -1.98, -0.1), 0.15, 0.5, clip, T, phase=k * 0.4, k=4)
        marker(body, kind, "muzzle", (s * 0.15, 2.32, 0.56), k)
    osc(body, clip, "location", T, (2, 0.08, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.04, 1, 0.25), (0, 0.025, 1, 0))


# --- Jade Wyrm: serpent, 2.0 per segment ------------------------------------------------------

def _wyrm_spots(m, y0, y1, n, x, z):
    for k in range(n):
        y = y0 + (y1 - y0) * (k + 0.5) / n
        for s in (1, -1):
            m.ball(0.14, (s * x, y, z), C, subdiv=0, glow=True, scale=(1, 1.3, 0.7))


def jade_wyrm():
    """A sea dragon of the jade shallows: deep jade with a pale chevron ridge down its back, pale
    belly, rose-glowing spots down the flanks, a whiskered head with swept horns and a fan tail."""
    T = 1.2
    pv = ("#3f9a6a", "#d8e8a0", "#ff3a6a")
    # head
    kind, clip, root = named("jade_wyrm_head", "serpent", "beast", "bite", preview=pv, seg_length=2.0)
    h = Model(f"{kind}_body", seed=1040)
    h.ball(0.58, (0, -0.55, 0), A, subdiv=1, scale=(1.0, 1.0, 0.85))                              # neck, matches body
    h.ball(0.56, (0, 0.02, 0.05), A, subdiv=1, scale=(1.2, 1.05, 0.75))                           # skull
    h.ball(0.38, (0, 0.62, 0.0), A, subdiv=1, scale=(1.0, 1.5, 0.6))                              # snout
    h.ball(0.58, (0, -0.6, -0.18), A.shade(0.55), subdiv=1, scale=(1.12, 0.95, 0.65))            # dark rim
    h.ball(0.4, (0, -0.1, -0.18), B, subdiv=1, scale=(1.1, 1.6, 0.5))                             # pale throat
    for i, (y, z) in enumerate(((0.75, 0.22), (0.4, 0.32), (0.0, 0.42), (-0.45, 0.48))):          # pale ridge
        h.box((0.28 - i * 0.02, 0.28, 0.2), (0, y, z), B, rot=(0, 0, 0.785))
    for s in (1, -1):
        h.ball(0.16, (s * 0.32, 0.3, 0.26), C, subdiv=1, glow=True, scale=(1, 1.2, 0.8))           # eyes
        h.box((0.06, 0.16, 0.2), (s * 0.36, 0.36, 0.34), DARK)
        h.box((0.32, 0.3, 0.12), (s * 0.36, 0.08, 0.34), A.shade(0.7), rot=(0, s * 0.3, 0))       # brow
        _tusk(h, (s * 0.28, -0.05, 0.35), (s * 0.45, -1.0), 0.75, 0.13, up=0.4, curl=s * 0.12, color=B)  # horns
        chain(h, [(s * 0.22, 0.85, 0.0), (s * 0.55, 0.75, -0.02), (s * 0.85, 0.35, 0.0), (s * 0.95, -0.1, 0.04)],
              [0.08, 0.07, 0.05, 0.02], B.shade(0.85), segs=4)                                    # barbels
        flat(h, [(s * 0.45, -0.25), (s * 0.5, -0.85), (s * 0.95, -0.95), (s * 0.85, -0.55), (s * 1.0, -0.3)][:: s],
             0.05, 0.06, A.shade(0.65))                                                           # gill frills
        h.ball(0.1, (s * 0.8, -0.6, 0.1), C, subdiv=0, glow=True, scale=(1, 1, 0.6))
        h.box((0.08, 0.1, 0.06), (s * 0.1, 1.1, 0.12), DARK)                                       # nostrils
        for i in range(3):
            h.cyl(0.05, 0.16, (s * (0.22 - i * 0.03), 0.4 + i * 0.25, -0.1), BONE, segs=4, r_top=0.0,
                  rot=(math.pi, 0, 0))
    head = h.build(root)
    j = Model(f"{kind}_jaw", seed=1041)
    j.ball(0.3, (0, 0.5, -0.05), B, subdiv=1, scale=(1.0, 1.7, 0.4))
    j.box((0.42, 0.8, 0.05), (0, 0.5, 0.06), C, glow=True)                                        # glowing gullet
    jaw = j.build(head, loc=(0, 0.05, -0.16))
    osc(jaw, clip, "rotation_euler", T, (0, 0.22, 1, 0.0))
    osc(head, clip, "rotation_euler", T, (2, 0.06, 1, 0.25))
    marker(head, kind, "muzzle", (0, 1.25, 0))

    # body: tiles end to end (fat at the joints, chevrons on the back)
    kind, clip, root = named("jade_wyrm_body", "serpent", "beast", "swim", preview=pv, seg_length=2.0)
    g = Model(f"{kind}_body", seed=1042)
    tube(g, 0.44, -1.04, 1.04, 0, -0.08, A.shade(0.6), segs=8)                                  # the joints
    g.ball(0.62, (0, 0, -0.16), A.shade(0.55), subdiv=1, scale=(1.12, 1.72, 0.7))                 # dark flank rim
    g.ball(0.6, (0, 0, 0.02), A, subdiv=1, scale=(1.0, 1.66, 0.9))                                # back
    for i, y in enumerate((0.55, -0.15, -0.85)):                                                  # chevrons
        flat(g, [(0, y + 0.3), (-0.42, y - 0.05), (-0.42, y - 0.25), (0, y + 0.08), (0.42, y - 0.25), (0.42, y - 0.05)],
             0.58 - abs(y) * 0.05, 0.08, B)
    for i, y in enumerate((0.75, 0.05, -0.65)):
        g.box((0.2, 0.22, 0.2), (0, y, 0.6), A.shade(0.6), rot=(0, 0, 0.785))                     # dark spine nubs
    _wyrm_spots(g, -0.8, 0.8, 2, 0.6, 0.18)
    body = g.build(root)
    for k, s in enumerate((1, -1)):
        f = Model(f"{kind}_fin_{k}", seed=1043 + k)
        pts = [(0, 0.3), (0, -0.25), (0.4, -0.66), (0.52, -0.48), (0.36, 0.05)]
        flat(f, pts if s > 0 else mirror(pts), 0, 0.06, A.shade(0.7))
        rays = [(0.05, 0.12), (0.05, 0.0), (0.45, -0.52), (0.45, -0.42)]
        flat(f, rays if s > 0 else mirror(rays), 0.04, 0.04, B)
        obj = f.build(body, loc=(s * 0.58, 0.1, -0.05))
        osc(obj, clip, "rotation_euler", T, (1, s * 0.35, 1, 0), (2, s * 0.15, 1, 0.25))

    # tail: tapering, a broad fan fin with a glowing tip
    kind, clip, root = named("jade_wyrm_tail", "serpent", "beast", "swim", preview=pv, seg_length=2.0)
    t = Model(f"{kind}_body", seed=1045)
    chain(t, [(0, 1.02, 0), (0, 0.2, 0.0), (0, -0.6, 0.03)], [0.56, 0.38, 0.18], A, segs=8)
    t.ball(0.5, (0, 0.6, -0.15), A.shade(0.55), subdiv=1, scale=(1.15, 1.3, 0.6))                 # dark rim
    for y, w in ((0.6, 0.36), (0.0, 0.26)):
        flat(t, [(0, y + 0.26), (-w, y - 0.05), (-w, y - 0.2), (0, y + 0.06), (w, y - 0.2), (w, y - 0.05)],
             0.42 - (0.6 - y) * 0.2, 0.07, B)
    for s in (1, -1):
        t.ball(0.12, (s * 0.38, 0.45, 0.12), C, subdiv=0, glow=True, scale=(1, 1.3, 0.7))
    tail = t.build(root)
    f = Model(f"{kind}_fan", seed=1046)
    fan = [(0, 0.2), (-0.35, 0.05), (-0.85, -0.45), (-0.55, -0.6), (0, -0.4), (0.55, -0.6), (0.85, -0.45), (0.35, 0.05)]
    flat(f, fan, 0, 0.07, A.shade(0.7))
    for s in (1, -1):
        flat(f, [(0, 0.05), (0, -0.08), (s * 0.7, -0.52), (s * 0.75, -0.42)][:: s], 0.04, 0.05, B)
        f.ball(0.12, (s * 0.72, -0.5, 0.05), C, subdiv=0, glow=True, scale=(1, 1, 0.6))
    flat(f, [(0.04, 0.1), (-0.04, 0.1), (-0.04, -0.4), (0.04, -0.4)], 0.04, 0.05, B)
    fn = f.build(tail, loc=(0, -0.62, 0.03))
    osc(fn, clip, "rotation_euler", T, (2, 0.35, 1, 0.0))
    osc(tail, clip, "rotation_euler", T, (2, 0.1, 1, 0.25))


# --- Armoured Thunderhide: brute, ~6.5 ------------------------------------------------------------

def armoured_thunderhide():
    """Lodge Corve's war crawler, built in the shape of the giant it hunts: a low domed hull plated
    in bolted hex scutes, an armour skirt round the rim, a wedge cab for a head with a beaked ram and
    trophy tusks, two caged thunder-coils on the shoulders that drum (the guns), and four thruster
    pods on paddle pylons that row the air like flippers."""
    kind, clip, root = named("armoured_thunderhide", "brute", "mech", "row", preview=("#6a5a4a", "#a89070", "#ff8a2a"))
    T = 2.0
    b = Model(f"{kind}_body", seed=1050)
    RX, RY, RZ = 1.5, 1.9, 0.95
    # the belly pan and the dome over it
    hull(b, [(-0.9, 1.9), (-1.5, 1.2), (-1.6, -0.9), (-1.1, -1.9), (1.1, -1.9), (1.6, -0.9), (1.5, 1.2), (0.9, 1.9)],
         -0.6, -0.05, B.shade(0.55), inset=0.85)
    b.ball(1.0, (0, -0.1, -0.05), A.shade(0.8), subdiv=1, scale=(RX, RY, RZ))

    def dome(x, y):  # the dome's height over (x, y) and the tilt that sits a plate flat on it
        u = max(0.0, 1 - (x / RX) ** 2 - ((y + 0.1) / RY) ** 2)
        return RZ * math.sqrt(u) - 0.05, (-math.atan2(y + 0.1, RY * 1.4), math.atan2(x, RX * 1.4), 0)

    # the armour skirt: marginal plates round the rim, angled out, alternating light and dark
    n = 14
    for k in range(n):
        a = TAU * (k + 0.5) / n
        x, y = math.sin(a) * RX * 1.02, math.cos(a) * RY * 1.0 - 0.1
        if y > 1.3 and abs(x) < 0.8:
            continue                                                                                # the cab sits here
        b.box((0.75, 0.32, 0.34), (x, y, 0.05), B.shade(0.95) if k % 2 else A.shade(0.65), rot=(0.35, 0, -a))
    # hex scutes, bolted down: a spine of three, four a side, each with a darker rim
    scutes = [(0, 0.85, 0.42), (0, 0.0, 0.46), (0, -0.85, 0.42),
              (-0.82, 0.5, 0.36), (0.82, 0.5, 0.36), (-0.82, -0.45, 0.36), (0.82, -0.45, 0.36),
              (-0.55, -1.35, 0.3), (0.55, -1.35, 0.3)]
    for k, (x, y, r) in enumerate(scutes):
        z, rot = dome(x, y)
        b.cyl(r, 0.14, (x, y, z), A.shade(0.6), segs=6, rot=rot)
        b.cyl(r * 0.84, 0.2, (x, y, z + 0.02), B.shade(1.1) if x == 0 else B, segs=6, r_top=r * 0.7, rot=rot)
        if x == 0:
            b.box((0.12, 0.12, 0.08), (x, y, z + 0.24), DARK)                                     # rivet
    for y in (0.42, -0.42):                                                                         # hazard bands
        z, _ = dome(0, y)
        _hazard(b, -0.22, 0.22, y, z + 0.06, 0.16, 3)
    # the cab: a low wedge with a visor slit, a hazard brow, a beaked ram and trophy tusks
    b.slab([(-0.75, 1.45), (0.75, 1.45), (0.62, 2.4), (0, 2.65), (-0.62, 2.4)], -0.45, 0.35, A.shade(0.7),
           top=[(-0.6, 1.55), (0.6, 1.55), (0.45, 2.25), (0, 2.42), (-0.45, 2.25)])
    b.slab([(-0.52, 1.6), (0.52, 1.6), (0.4, 2.15), (-0.4, 2.15)], 0.3, 0.55, B,
           top=[(-0.42, 1.65), (0.42, 1.65), (0.32, 2.05), (-0.32, 2.05)])                          # roof plate
    b.box((0.8, 0.14, 0.12), (0, 2.18, 0.4), DARK)                                                  # visor slit
    for x in (-0.26, 0.0, 0.26):
        b.box((0.16, 0.08, 0.08), (x, 2.24, 0.42), C, glow=True)
    _hazard(b, -0.42, 0.42, 1.7, 0.58, 0.14, 5)
    b.prism([(0, 0), (0.75, -0.45), (0.0, -0.75)], 0.9, (0, 2.45, -0.05), IRON, rot=(0, 0, 0))     # the beak: a ram wedge
    b.slab([(-0.45, 2.45), (0.45, 2.45), (0, 3.25)], -0.55, -0.15, IRON,
           top=[(-0.3, 2.5), (0.3, 2.5), (0, 3.05)])
    for s in (1, -1):
        _tusk(b, (s * 0.4, 2.75, -0.35), (s * 0.7, 1.0), 0.7, 0.13, up=0.25, curl=-s * 0.2)
        b.box((0.22, 0.22, 0.22), (s * 0.4, 2.72, -0.35), IRON)                                     # tusk collar
    b.cyl(0.12, 0.5, (0, 2.95, -0.42), DARK, segs=5, rot=(-math.pi / 2, 0, 0))                      # chin gun
    # stern: a twin-nozzle engine block where the tail would be
    b.slab([(-0.75, -1.65), (0.75, -1.65), (0.6, -2.35), (-0.6, -2.35)], -0.45, 0.2, B.shade(0.7),
           top=[(-0.6, -1.7), (0.6, -1.7), (0.48, -2.25), (-0.48, -2.25)])
    for s in (1, -1):
        tube(b, 0.26, -2.2, -2.6, s * 0.36, -0.15, DARK, segs=7)
        b.cyl(0.2, 0.05, (s * 0.36, -2.61, -0.15), C, segs=7, rot=(math.pi / 2, 0, 0), glow=True)
    body = b.build(root)
    for s in (1, -1):
        flame(body, f"{kind}_flame_{'r' if s > 0 else 'l'}", (s * 0.36, -2.64, -0.15), 0.18, 0.6, clip, T,
              phase=0.3 * (s > 0), k=6)
    # the thunder-coils: glowing drums in iron cages on the shoulders, a stubby barrel out front
    n = 0
    for k, s in enumerate((1, -1)):
        coil = Model(f"{kind}_coil_{k}", seed=1052 + k)
        coil.cyl(0.36, 0.5, (0, 0, -0.25), C, segs=8, glow=True, rot=(-math.pi / 2, 0, 0))
        coil.ball(0.16, (0, 0.05, 0.22), "#ffd8a0", subdiv=0, glow=True)                            # hot core
        for j in range(3):                                                                          # cage bands
            coil.cyl(0.4, 0.08, (0, -0.22 + j * 0.2, 0), IRON, segs=8, rot=(-math.pi / 2, 0, 0))
        so = coil.build(body, loc=(s * 0.82, 1.1, 0.7))
        pulse(so, clip, T, 0.12, harm=2, phase=k * 0.5, axes=(0, 2))
    for s in (1, -1):
        g = Model(f"{kind}_gun_{'r' if s > 0 else 'l'}")
        g.box((0.4, 0.35, 0.3), (0, 0, 0), IRON)
        tube(g, 0.11, 0.15, 0.85, 0, 0.02, DARK, segs=6)
        g.box((0.28, 0.08, 0.1), (0, 0.86, 0.02), C, glow=True)
        g.build(body, loc=(s * 0.82, 1.55, 0.72))
        marker(body, kind, "muzzle", (s * 0.82, 2.45, 0.74), n)
        n += 1
    marker(body, kind, "muzzle", (0, 3.25, -0.42), n)
    # thruster pods on paddle pylons: the flippers, rowing
    for k, (y, span, chord, ph) in enumerate(((0.75, 1.55, 0.95, 0.0), (-1.0, 1.15, 0.7, 0.3))):
        for s in (1, -1):
            w = Model(f"{kind}_flipper_{k}_{'r' if s > 0 else 'l'}", seed=1060 + k * 2 + (s > 0))
            pts = [(0, chord * 0.4), (0, -chord * 0.4), (span * 0.7, -chord * 0.5), (span * 0.95, -chord * 0.2),
                   (span * 0.9, chord * 0.25), (span * 0.5, chord * 0.45)]
            flat(w, pts if s > 0 else mirror(pts), 0, 0.14, IRON)
            flat(w, [(p[0] * 0.8 + 0.08, p[1] * 0.6) for p in (pts if s > 0 else mirror(pts))], 0.09, 0.05,
                 B.shade(0.9))                                                                      # tan face plate
            x = s * span * 0.82
            tube(w, chord * 0.32, chord * 0.45, -chord * 0.55, x, 0.05, A.shade(0.6), segs=7)       # the pod
            tube(w, chord * 0.22, -chord * 0.55, -chord * 0.7, x, 0.05, DARK, segs=7)
            w.cyl(chord * 0.17, 0.04, (x, -chord * 0.71, 0.05), C, segs=7, rot=(math.pi / 2, 0, 0), glow=True)
            w.box((0.12, 0.12, 0.08), (x, chord * 0.3, 0.05 + chord * 0.32), HAZARD)
            obj = w.build(body, loc=(s * (RX - 0.2), y, -0.1))
            osc(obj, clip, "rotation_euler", T, (1, s * 0.3, 1, ph), (2, -s * 0.14, 1, ph + 0.25))
    osc(body, clip, "location", T, (2, 0.1, 1, 0.6))
    osc(body, clip, "rotation_euler", T, (1, 0.02, 1, 0.0), (0, 0.018, 1, 0.35))


def build():
    hesk_skiff()
    pterosaur()
    tusk_battery()
    hesk_trawler()
    jade_wyrm()
    armoured_thunderhide()
