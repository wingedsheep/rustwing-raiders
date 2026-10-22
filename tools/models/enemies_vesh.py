"""VESH, the Low Tide: the Reef Pirates' roster, each its own model (seeds 7000-7999).

Reef Glider (a flying-fish sailplane), Reef Eel (a banded moray), Shrimp Kite (a shrimp under a
two-tone kite), Pirate Junk (a junk with fan sails splayed like wings), Clam Battery (a giant clam
on a reef rock, a glowing mantle and a pearl cannon) and Crab Dreadnought (a barnacled war crab with
one huge crusher claw).
"""
from __future__ import annotations

import math

from kit import Model
from creatures_util import TAU, chain, flat, limb, osc, sample
from enemies_lib import A, B, C, DARK, GLASS, both, eyes, fin, flame, hull, marker, mirror, named, pulse, spin, tube, wing_pair

BONE = "#f2ead8"     # teeth, pearl sheen
SEG = 2.0


def _ccw(pts):
    """The outline counter-clockwise (slab wants it so), whichever way it was written."""
    area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]))
    return pts if area > 0 else list(reversed(pts))


def _side(pts, s):
    pts = _ccw(pts)
    return pts if s > 0 else mirror(pts)


# --- Reef Glider: dart, mech, ~2.2 ----------------------------------------------------------------

def reef_glider():
    """A pirate sailplane cut like a flying fish: a slim blue hull, two big ribbed pectoral-fin wings
    with scalloped trailing edges, a forked tail, a pink nose lamp and a pusher jet."""
    kind, clip, root = named("reef_glider", "dart", "mech", "glide", preview=("#f0e0c0", "#2a7aa0", "#ff4a6a"))
    T = 1.0
    b = Model(f"{kind}_body", seed=7001)
    hull(b, _ccw([(0, 1.12), (-0.2, 0.75), (-0.27, 0.05), (-0.22, -0.65), (-0.12, -0.95), (0.12, -0.95), (0.22, -0.65),
                  (0.27, 0.05), (0.2, 0.75)]), -0.16, 0.12, B, inset=0.62)
    b.slab(_ccw([(0, 0.98), (-0.13, 0.6), (-0.15, -0.7), (0.15, -0.7), (0.13, 0.6)]), 0.1, 0.17, A.shade(1.05))  # cream spine
    b.slab(_ccw([(-0.09, 0.85), (-0.1, 0.62), (0.1, 0.62), (0.09, 0.85)]), 0.16, 0.2, C)          # pink nose band
    b.ball(0.15, (0, 0.18, 0.24), GLASS, subdiv=1, scale=(1, 1.9, 0.75))                       # canopy
    b.box((0.07, 0.3, 0.05), (0, 0.24, 0.34), A.shade(1.2))                                     # glint
    b.ball(0.15, (0, 0.96, 0.04), C, subdiv=1, glow=True, scale=(1, 1.0, 0.8))                # nose lamp
    for s in (1, -1):
        b.ball(0.09, (s * 0.17, 0.78, 0.07), BONE, subdiv=1)                                    # painted fish eye
        b.box((0.06, 0.06, 0.06), (s * 0.2, 0.82, 0.12), DARK)
        flat(b, _side([(0.18, -0.3), (0.2, -0.55), (0.55, -0.82), (0.5, -0.55)], s), -0.08, 0.05, B.shade(0.8))  # pelvic fins
    fin(b, [(-0.2, 0.15), (-0.75, 0.15), (-0.85, 0.48), (-0.55, 0.42)], 0, 0.06, B)               # dorsal fin
    b.box((0.06, 0.18, 0.08), (0, -0.62, 0.47), C, glow=True)
    tube(b, 0.12, -0.85, -1.05, 0, -0.02, DARK, segs=6)
    b.cyl(0.1, 0.04, (0, -1.06, -0.02), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    body = b.build(root)

    # forked flying-fish tail, wagging
    t = Model(f"{kind}_tail", seed=7002)
    for s in (1, -1):
        flat(t, _side([(0.04, 0.05), (0.15, -0.05), (0.62, -0.42), (0.5, -0.5), (0.05, -0.15)], s), 0.0, 0.06, B)
        flat(t, _side([(0.38, -0.3), (0.62, -0.42), (0.5, -0.5), (0.34, -0.38)], s), 0.04, 0.04, A)
    t.box((0.1, 0.12, 0.08), (0, -0.05, 0.02), B.shade(0.8))
    tail = t.build(body, loc=(0, -0.88, 0.02))
    osc(tail, clip, "rotation_euler", T, (2, 0.18, 1, 0.0))

    # the pectoral-fin wings: cream membrane, blue fin rays fanning out past a scalloped edge
    WS = 0.86  # wing scale
    tips = [(1.22, -0.32), (0.95, -0.56), (0.7, -0.7), (0.42, -0.74)]
    wing = [(0, 0.22), (0.5, 0.1), (1.05, -0.12), (1.22, -0.32), (1.0, -0.42), (0.95, -0.56), (0.78, -0.55),
            (0.7, -0.7), (0.52, -0.6), (0.42, -0.74), (0.22, -0.52), (0, -0.42)]

    def rays(w, s):
        for k, (x, y) in enumerate(tips):
            limb(w, (s * 0.04, 0.0, 0.04), (s * x * WS, y * WS, 0.04), 0.07, 0.045, B, segs=4)
        limb(w, (s * 0.02, 0.2, 0.05), (s * 1.12 * WS, -0.2 * WS, 0.05), 0.09, 0.06, B, segs=4)    # leading spar
        flat(w, _side([(0.22, -0.04), (0.65, -0.21), (0.6, -0.33), (0.19, -0.18)], s), 0.045, 0.03, C)  # pink stripe
        w.box((0.24, 0.22, 0.08), (s * 1.14 * WS, -0.3 * WS, 0.05), C, glow=True)              # wingtip lights
    wing_pair(body, f"{kind}_wing", (0.22, 0.25, 0.02), _ccw([(x * WS, y * WS) for x, y in wing]), 0.05, A, clip, T, 0.1,
              dihedral=0.08,
              extra=rays)
    flame(body, f"{kind}_flame", (0, -1.08, -0.02), 0.1, 0.4, clip, T, k=4)
    marker(body, kind, "muzzle", (0, 1.2, 0.0))
    osc(body, clip, "location", T, (2, 0.05, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.07, 1, 0.25))


# --- Shrimp Kite: swarm, beast, ~1.2 ---------------------------------------------------------------

def shrimp_kite():
    """A shrimp that flies under its own kite: two diamond fins split into coral and peach panels,
    dark kite spars, a banded tail flicking its fan, long antennae trailing like kite tails."""
    kind, clip, root = named("shrimp_kite", "swarm", "beast", "flap", preview=("#ff7a6a", "#ffd0b0", "#2a2a2a"))
    T = 0.5
    b = Model(f"{kind}_body", seed=7020)
    b.ball(0.2, (0, 0.2, 0.02), A, subdiv=1, scale=(1.0, 1.45, 0.85))                         # carapace
    b.ball(0.15, (0, 0.18, 0.1), A.shade(1.18), subdiv=1, scale=(0.8, 1.4, 0.6))
    limb(b, (0, 0.45, 0.08), (0, 0.72, 0.16), 0.07, 0.0, A.shade(1.18), segs=4)                # rostrum
    for k, (y, r) in enumerate(((-0.08, 0.17), (-0.22, 0.155), (-0.35, 0.135), (-0.46, 0.11))):   # banded tail
        b.ball(r, (0, y, 0.0 - k * 0.02), A if k % 2 == 0 else B, subdiv=1, scale=(1.05, 0.75, 0.85))
        b.box((r * 1.3, 0.05, 0.05), (0, y + 0.02, r * 0.8 - k * 0.02), C)                     # dark band seams
    for s in (1, -1):
        limb(b, (s * 0.07, 0.4, 0.1), (s * 0.14, 0.48, 0.16), 0.04, 0.035, A, segs=4)           # eye stalks
        b.ball(0.085, (s * 0.15, 0.49, 0.17), C, subdiv=1)                                      # dark eyes
        b.ball(0.03, (s * 0.17, 0.53, 0.22), BONE, subdiv=0)
        for k in range(3):  # walking legs tucked under
            limb(b, (s * 0.1, 0.25 - k * 0.1, -0.1), (s * 0.22, 0.3 - k * 0.12, -0.22), 0.03, 0.015, A.shade(0.7), segs=3)
    body = b.build(root)

    # tail fan, flicking
    f = Model(f"{kind}_fan", seed=7021)
    for k, a in enumerate((-0.7, -0.3, 0.0, 0.3, 0.7)):
        r = 0.2 if k != 2 else 0.24
        f.ball(1.0, (math.sin(a) * r * 0.6, -math.cos(a) * r * 0.6, 0), A.shade(1.15) if k % 2 else B, subdiv=1,
               scale=(0.07, r * 0.6, 0.03), rot=(0, 0, -a))
        f.ball(0.04, (math.sin(a) * r * 1.05, -math.cos(a) * r * 1.05, 0.02), C, subdiv=0)
    fan = f.build(body, loc=(0, -0.53, -0.04))
    osc(fan, clip, "rotation_euler", T, (0, 0.3, 1, 0.1))

    # the kite: a diamond each side, four panels, crossed dark spars
    hinge = (0.12, 0.14, 0.1)
    inner, front, outer, back = (0.0, 0.0), (0.3, 0.32), (0.62, 0.0), (0.26, -0.42)
    mid = (0.3, -0.02)
    for k, s in enumerate((1, -1)):
        w = Model(f"{kind}_kite_{k}", seed=7022 + k)
        for j, (p, q) in enumerate(((inner, front), (front, outer), (outer, back), (back, inner))):
            flat(w, _side([mid, p, q], s), 0.0, 0.035, A.shade(1.08) if j % 2 == 0 else B)
        for p, q in ((inner, outer), (front, back)):
            limb(w, (s * p[0], p[1], 0.03), (s * q[0], q[1], 0.03), 0.03, 0.03, C, segs=4)
        for p, q in ((inner, front), (front, outer), (outer, back), (back, inner)):
            limb(w, (s * p[0], p[1], 0.02), (s * q[0], q[1], 0.02), 0.025, 0.025, A.shade(0.65), segs=3)
        obj = w.build(body, loc=(s * hinge[0], hinge[1], hinge[2]))
        obj.rotation_euler[1] = -s * 0.15
        osc(obj, clip, "rotation_euler", T, (1, s * 0.55, 1, 0.0))

    # antennae: streaming back past the kite like kite tails, with dark bows
    for k, s in enumerate((1, -1)):
        a = Model(f"{kind}_feeler_{k}", seed=7024 + k)
        pts = [(0, 0, 0), (s * 0.12, 0.1, -0.06), (s * 0.24, -0.2, -0.16), (s * 0.4, -0.65, -0.18), (s * 0.34, -1.05, -0.14)]
        chain(a, pts, [0.035, 0.03, 0.028, 0.024, 0.015], A.shade(0.8), segs=4)
        for (x, y) in ((0.4, -0.66), (0.36, -0.95)):
            a.box((0.16, 0.07, 0.05), (s * x, y, -0.17), C, rot=(0, 0, 0.6 * s))
            a.box((0.16, 0.07, 0.05), (s * x, y, -0.17), C, rot=(0, 0, -0.6 * s))
        obj = a.build(body, loc=(s * 0.06, 0.48, 0.08))
        osc(obj, clip, "rotation_euler", T, (2, s * 0.12, 1, 0.25 + k * 0.1))
    marker(body, kind, "muzzle", (0, 0.72, 0.1))
    osc(body, clip, "location", T, (2, 0.07, 1, 0.5))
    osc(body, clip, "rotation_euler", T, (0, 0.06, 1, 0.75))


# --- Pirate Junk: gunship, mech, ~4 ----------------------------------------------------------------

def _fan_sail(m, s, R, n=5, a0=0.5, a1=-0.6, y_in=0.28, cloth=B, rib=None, pink=-1):
    """A junk's battened sail laid out flat as a wing: n panels fanning out from the mast, dark
    battens between them sticking out a little past the cloth."""
    rib = rib or A.shade(0.45)
    outer = [(R * (1.0 + 0.06 * ((k % 2) - 0.5)) * math.cos(a0 + (a1 - a0) * k / n),
              R * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n + 1)]
    inner = [(0.0, y_in - 2 * y_in * k / n) for k in range(n + 1)]
    for k in range(n):
        col = C if k == pink else (cloth if k % 2 == 0 else A.shade(1.35))
        flat(m, _side([inner[k], inner[k + 1], outer[k + 1], outer[k]], s), 0.0, 0.05, col)
    for k in range(n + 1):
        ox, oy = outer[k]
        limb(m, (s * inner[k][0], inner[k][1], 0.04), (s * ox * 1.06, oy * 1.06, 0.04), 0.055, 0.045, rib, segs=4)
    limb(m, (0, y_in, 0.05), (0, -y_in, 0.05), 0.08, 0.08, rib, segs=5)                         # the yard


def pirate_junk():
    """A flying junk: a high-sterned wooden hull with oculus eyes on the bow, two fan sails a mast
    splayed out like wings, bow chasers forward, broadside guns, pink lanterns and lift jets."""
    kind, clip, root = named("pirate_junk", "gunship", "mech", "sail", preview=("#a06a4a", "#f0e0c0", "#ff4a6a"))
    T = 2.0
    b = Model(f"{kind}_body", seed=7040)
    outline = _ccw([(0, 2.0), (-0.42, 1.65), (-0.72, 0.9), (-0.8, -0.5), (-0.74, -1.45), (-0.62, -1.9), (0.62, -1.9),
                    (0.74, -1.45), (0.8, -0.5), (0.72, 0.9), (0.42, 1.65)])
    b.slab([(x * 0.62, y * 0.9) for x, y in outline], -0.62, -0.02, A.shade(0.55), top=outline)     # dark keel
    hull(b, [(x * 1.04, y * 1.01) for x, y in outline], -0.06, 0.14, A.shade(0.42), inset=0.97)     # dark gunwale rim
    deck = [(x * 0.86, y * 0.92) for x, y in outline]
    b.slab(deck, 0.1, 0.18, A.shade(1.25))                                                     # planked deck
    for k in range(6):  # deck seams across
        y = 1.3 - k * 0.5
        w = 0.62 if -1.0 < y < 1.0 else 0.45
        b.box((w * 2, 0.05, 0.03), (0, y, 0.19), A.shade(0.85))
    # foredeck and stern castle
    b.slab(_ccw([(0, 1.85), (-0.38, 1.5), (-0.55, 1.1), (0.55, 1.1), (0.38, 1.5)]), 0.14, 0.32, A.shade(0.9))
    castle = _ccw([(-0.66, -1.05), (-0.62, -1.75), (-0.5, -2.05), (0.5, -2.05), (0.62, -1.75), (0.66, -1.05)])
    b.slab(castle, 0.1, 0.62, A.shade(0.75))
    hull(b, [(x * 1.08, y * 1.0 - 0.02) for x, y in castle], 0.6, 0.8, A.shade(0.5), inset=0.7)      # dark roof
    for s in (1, -1):
        b.box((0.12, 0.9, 0.08), (s * 0.5, -1.55, 0.68), B)                                     # cream eaves
    for s in (1, -1):
        # oculus on the bow: cream eye, glowing pink iris
        b.ball(0.17, (s * 0.42, 1.5, 0.08), B, subdiv=1, scale=(0.7, 1.2, 0.9))
        b.ball(0.11, (s * 0.47, 1.56, 0.1), C, subdiv=1, glow=True)
        # bow chasers
        b.box((0.3, 0.42, 0.18), (s * 0.3, 1.25, 0.4), A.shade(0.5))
        tube(b, 0.1, 1.2, 2.05, s * 0.3, 0.45, DARK, segs=6)
        b.cyl(0.13, 0.12, (s * 0.3, 1.95, 0.45), A.shade(0.4), segs=6, rot=(-math.pi / 2, 0, 0))
        b.cyl(0.08, 0.04, (s * 0.3, 2.07, 0.45), C, segs=6, rot=(-math.pi / 2, 0, 0), glow=True)
        # broadside guns poking out
        for y in (0.45, -0.25, -0.95):
            b.cyl(0.09, 0.32, (s * 0.72, y, 0.02), DARK, segs=6, rot=(0, s * math.pi / 2, 0))
        # stern lanterns
        b.cyl(0.04, 0.35, (s * 0.55, -1.95, 0.75), A.shade(0.4), segs=4)
        b.ball(0.16, (s * 0.55, -1.95, 1.12), C, subdiv=1, glow=True, scale=(1, 1, 1.25))
        b.box((0.2, 0.2, 0.05), (s * 0.55, -1.95, 1.33), A.shade(0.4))
        # lift jets under the stern
        tube(b, 0.17, -1.6, -2.05, s * 0.32, -0.32, A.shade(0.4), segs=6)
        b.cyl(0.13, 0.04, (s * 0.32, -2.06, -0.32), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    # cargo: a pile of plunder off to one side, a crate on the other
    b.box((0.38, 0.38, 0.3), (0.32, -0.62, 0.33), B.shade(0.75), rot=(0, 0, 0.2))
    b.box((0.3, 0.3, 0.26), (-0.36, -0.75, 0.31), A.shade(0.7), rot=(0, 0, -0.3))
    b.ball(0.16, (0.33, -0.62, 0.53), C, subdiv=0, glow=True)                                    # loot glinting
    for y, h in ((1.15, 1.1), (-0.35, 1.4)):  # masts
        b.cyl(0.08, h, (0, y, 0.18), A.shade(0.45), segs=6, r_top=0.05)
    body = b.build(root)

    # the sails, splayed like wings and breathing with the wind
    for j, (y, z, R, ph) in enumerate(((1.15, 0.95, 1.05, 0.0), (-0.35, 1.15, 1.55, 0.15))):
        for k, s in enumerate((1, -1)):
            m = Model(f"{kind}_sail_{j}_{k}", seed=7041 + j * 2 + k)
            _fan_sail(m, s, R, n=4, a0=0.36, a1=-0.44, y_in=0.2, pink=(1 if j == 1 else -1))
            obj = m.build(body, loc=(s * 0.06, y, z))
            obj.rotation_euler[1] = -s * 0.28
            osc(obj, clip, "rotation_euler", T, (1, -s * 0.07, 1, ph), (2, s * 0.04, 1, ph + 0.25))
    # pennant on the mainmast
    p = Model(f"{kind}_pennant", seed=7046)
    flat(p, _ccw([(0, 0.0), (0, -0.14), (-0.1, -0.7), (0.08, -0.62)]), 0, 0.04, C)
    pen = p.build(body, loc=(0, -0.35, 1.6))
    osc(pen, clip, "rotation_euler", T, (2, 0.3, 2, 0.0))
    for k, s in enumerate((1, -1)):
        flame(body, f"{kind}_flame_{k}", (s * 0.32, -2.08, -0.32), 0.13, 0.5, clip, T, phase=k * 0.4, k=4)
        marker(body, kind, "muzzle", (s * 0.3, 2.12, 0.45), k)
    osc(body, clip, "location", T, (2, 0.1, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.05, 1, 0.25), (0, 0.025, 1, 0))


# --- Clam Battery: turret, beast, ground, ~2.5 ------------------------------------------------------

def clam_battery():
    """A giant clam set on a reef rock: fluted pink shells, a glowing cyan mantle frilled between
    them, and in its mouth a pearl cannon on a fleshy siphon. It gapes, breathes and snaps."""
    kind, clip, root = named("clam_battery", "turret", "beast", "gape", preview=("#d88a98", "#f0e8d0", "#4affff"),
                             ground=1)
    T = 3.0
    b = Model(f"{kind}_base", seed=7060)
    b.cyl(1.22, 0.2, (0, 0, 0.0), A.shade(0.42), segs=9)                                      # dark foot
    b.ball(1.0, (0, -0.05, 0.18), A.shade(0.55), subdiv=1, scale=(1.15, 1.1, 0.42), jitter=0.07)  # reef rock
    b.ball(0.8, (0.1, -0.1, 0.38), A.shade(0.68), subdiv=1, scale=(1.0, 0.95, 0.3), jitter=0.06)
    for k, (a, r) in enumerate(((0.4, 0.2), (1.5, 0.16), (2.6, 0.22), (3.5, 0.17), (4.4, 0.2), (5.4, 0.15))):  # barnacles
        x, y = math.cos(a) * 1.0, math.sin(a) * 0.95
        b.cyl(r, r * 1.1, (x, y, 0.12), B, segs=6, r_top=r * 0.55)
        b.cyl(r * 0.5, 0.04, (x, y, 0.12 + r * 1.1), DARK, segs=6)
    base = b.build(root)

    h = Model(f"{kind}_head", seed=7061)
    ribs = [(phi, B if k % 2 == 0 else A.shade(1.12)) for k, phi in enumerate((-1.0, -0.5, 0.0, 0.5, 1.0))]
    with_hinge = (0, -0.7)
    # lower shell (offset so its hinge is at y = -0.7)
    for phi, col in ribs:
        d = (-math.sin(phi), math.cos(phi))
        h.ball(1.0, (d[0] * 0.78, -0.7 + d[1] * 0.78, 0.18), col, subdiv=1, scale=(0.3, 0.86, 0.22), rot=(0, 0, phi))
    h.ball(1.0, (0, -0.15, 0.08), A.shade(0.6), subdiv=1, scale=(1.05, 0.85, 0.2))             # dark belly under it
    # the mantle: a glowing frilled lip all round the gape
    lip = []
    for k in range(15):
        a = math.pi * (0.06 + 0.88 * k / 14)
        r = 1.42 + (0.1 if k % 2 else -0.04)
        lip.append((math.cos(a) * r * 0.92, -0.7 + math.sin(a) * r))
    lip += [(-0.55, -0.55), (0.55, -0.55)]
    h.slab(_ccw(lip), 0.3, 0.4, C, glow=True)
    h.slab(_ccw([(x * 0.8, -0.7 + (y + 0.7) * 0.8) for x, y in lip]), 0.38, 0.44, A.shade(0.5))     # its dark throat
    for (x, y) in ((-0.85, 0.15), (0.85, 0.15), (-0.5, 0.55), (0.5, 0.55)):
        h.ball(0.09, (x, y, 0.42), BONE, subdiv=0)                                             # eye spots on the mantle
    # the pearl cannon on its siphon
    limb(h, (0, 0.1, 0.42), (0, 0.95, 0.5), 0.22, 0.17, B, segs=7)
    h.cyl(0.2, 0.1, (0, 0.95, 0.5), A.shade(0.5), segs=7, rot=(-math.pi / 2, 0, 0))
    h.cyl(0.13, 0.08, (0, 1.02, 0.5), C, segs=7, rot=(-math.pi / 2, 0, 0), glow=True)
    h.ball(0.26, (0, 0.2, 0.5), BONE, subdiv=1)                                                # the pearl
    h.ball(0.14, (0.06, 0.27, 0.62), C, subdiv=1, glow=True)
    head = h.build(base, loc=(0, 0, 0.55), part="head")
    head.name = f"{kind}_head"

    # top shell, hinged at the back, gaping open and snapping half shut
    u = Model(f"{kind}_lid", seed=7062)
    for phi, col in ribs:
        d = (-math.sin(phi), math.cos(phi))
        u.ball(1.0, (d[0] * 0.78, d[1] * 0.78, 0.12), col, subdiv=1, scale=(0.3, 0.86, 0.24), rot=(0, 0, phi))
    for phi in (-0.75, -0.25, 0.25, 0.75):  # cream ridges between the ribs
        d = (-math.sin(phi), math.cos(phi))
        limb(u, (d[0] * 0.25, d[1] * 0.25, 0.3), (d[0] * 1.35, d[1] * 1.35, 0.22), 0.08, 0.06, A.shade(0.75), segs=4)
    u.ball(0.22, (0, 0.05, 0.12), A.shade(0.6), subdiv=1, scale=(1.5, 1, 0.8))                 # hinge boss
    lid = u.build(head, loc=(with_hinge[0], with_hinge[1], 0.36))

    def gape(t):  # open wide, a quick snap half shut (the shot), ease back open
        snap = math.exp(-((t - 0.55) / 0.05) ** 2)
        return (0.62 + 0.12 * math.sin(TAU * t) - 0.4 * snap, 0, 0)
    sample(lid, clip, "rotation_euler", T, gape, step=1)
    pearl = Model(f"{kind}_glow")
    pearl.ball(0.13, (0, 0, 0), C, subdiv=1, glow=True)
    pg = pearl.build(head, loc=(0, 1.06, 0.5))
    pulse(pg, clip, T, 0.3, harm=3)
    marker(head, kind, "muzzle", (0, 1.15, 0.5))


# --- Crab Dreadnought: brute, beast, ~6 --------------------------------------------------------------

def crab_dreadnought():
    """A war crab grown into a battleship: a broad spiked carapace mottled pale, barnacle cones on
    its back that spit fire, glowing eyes on stalks, one enormous crusher claw and one cutter."""
    kind, clip, root = named("crab_dreadnought", "brute", "beast", "scuttle", preview=("#d04a3a", "#f0c0a0", "#ffe04a"))
    T = 2.0
    b = Model(f"{kind}_body", seed=7080)
    b.ball(1.0, (0, -0.05, -0.25), A.shade(0.45), subdiv=1, scale=(1.85, 1.35, 0.45))           # dark underside
    shell = _ccw([(0, 1.45), (-0.75, 1.42), (-1.35, 1.15), (-1.95, 0.45), (-1.9, -0.35), (-1.4, -1.15), (-0.6, -1.5),
                  (0.6, -1.5), (1.4, -1.15), (1.9, -0.35), (1.95, 0.45), (1.35, 1.15), (0.75, 1.42)])
    hull(b, shell, -0.3, 0.4, A.shade(0.78), inset=0.82)
    b.ball(1.0, (0, -0.02, 0.32), A, subdiv=2, scale=(1.55, 1.18, 0.42))                       # the domed back
    for (x, y, sc) in ((0, 0.55, (0.55, 0.45, 0.2)), (0.85, -0.1, (0.5, 0.6, 0.18)), (-0.85, -0.1, (0.5, 0.6, 0.18)),
                       (0, -0.55, (0.5, 0.4, 0.18))):  # raised regions of the shell
        b.ball(1.0, (x, y, 0.62), A.shade(1.15), subdiv=1, scale=sc)
    for (x, y, r) in ((0.35, 0.95, 0.2), (-0.5, 0.85, 0.16), (1.25, 0.45, 0.22), (-1.3, 0.3, 0.2), (1.2, -0.65, 0.17),
                      (-1.05, -0.75, 0.22), (0.2, -1.05, 0.18), (-0.3, 0.1, 0.15)):  # pale mottling
        b.ball(r, (x, y, 0.52 + 0.2 * (1 - (x * x / 3.6 + y * y / 2.0))), B, subdiv=0, scale=(1.2, 1.0, 0.35))
    for s in (1, -1):  # spikes round the rim
        for (x, y, dx, dy) in ((1.35, 1.15, 0.35, 0.3), (1.9, 0.45, 0.45, 0.1), (1.9, -0.35, 0.4, -0.15), (1.4, -1.15, 0.3, -0.3)):
            limb(b, (s * x, y, 0.15), (s * (x + dx), y + dy, 0.25), 0.17, 0.0, B.shade(0.95), segs=4)
    for x in (-0.45, -0.15, 0.15, 0.45):  # front teeth between the eyes
        limb(b, (x, 1.35, 0.25), (x * 1.1, 1.65, 0.22), 0.1, 0.0, B, segs=4)
    for s in (1, -1):  # eyes on stalks, glowing yellow
        limb(b, (s * 0.55, 1.25, 0.35), (s * 0.68, 1.6, 0.75), 0.11, 0.08, A.shade(0.8), segs=5)
        b.ball(0.2, (s * 0.68, 1.62, 0.82), C, subdiv=1, glow=True)
        b.box((0.08, 0.1, 0.22), (s * 0.68, 1.8, 0.86), DARK)
    # barnacle batteries on the back: pale cones with glowing mouths
    for (x, y, r) in ((0.72, -0.35, 0.36), (-0.72, -0.35, 0.36), (0.0, -0.95, 0.28), (0.25, 0.3, 0.22)):
        z = 0.62
        b.cyl(r, r * 1.2, (x, y, z), B, segs=7, r_top=r * 0.62)
        b.cyl(r * 0.55, 0.05, (x, y, z + r * 1.2), C, segs=7, glow=True)
        for j in range(3):
            a = TAU * j / 3 + x
            b.cyl(r * 0.32, r * 0.5, (x + math.cos(a) * r * 1.05, y + math.sin(a) * r * 1.05, z - 0.05), B.shade(0.85),
                  segs=5, r_top=r * 0.18)
    body = b.build(root)

    # legs: four a side, scuttling in an alternating rhythm
    for s in (1, -1):
        for k, (y, dy) in enumerate(((0.75, 0.35), (0.15, 0.05), (-0.45, -0.25), (-1.0, -0.55))):
            g = Model(f"{kind}_leg_{'r' if s > 0 else 'l'}{k}", seed=7081 + k + (0 if s > 0 else 4))
            pts = [(0, 0, 0), (s * 0.85, dy * 0.6, 0.45), (s * 1.55, dy, -0.45)]
            chain(g, pts, [0.21, 0.17, 0.05], A.shade(0.85), segs=6)
            g.ball(0.19, pts[1], B, subdiv=1)                                                   # pale knee
            limb(g, pts[1], (s * 1.2, dy * 0.8, 0.0), 0.15, 0.12, A, segs=5)
            obj = g.build(body, loc=(s * 1.55, y, -0.05))
            ph = (k % 2) * 0.5 + (0.25 if s < 0 else 0)
            osc(obj, clip, "rotation_euler", T, (2, 0.14, 2, ph), (1, -s * 0.1, 2, ph + 0.25))

    # claws: the arm sways, the moving finger snaps
    claws = (("crusher", 1, (1.25, 1.15, 0.05), 1.1, 0.0), ("cutter", -1, (1.15, 1.2, 0.05), 0.72, 0.35))
    for k, (name, s, at, sz, ph) in enumerate(claws):
        c = Model(f"{kind}_{name}", seed=7090 + k)
        chain(c, [(0, 0, 0), (s * 0.55 * sz, 0.55 * sz, 0.15), (s * 0.7 * sz, 1.05 * sz, 0.12)],
              [0.28 * sz + 0.04, 0.24 * sz + 0.03, 0.26 * sz], A.shade(0.85), segs=6)
        palm = (s * 0.75 * sz, 1.65 * sz, 0.12)
        c.ball(1.0, palm, A, subdiv=2, scale=(0.62 * sz, 0.75 * sz, 0.42 * sz))
        c.ball(1.0, (palm[0] - s * 0.1 * sz, palm[1] + 0.05, palm[2] + 0.2 * sz), A.shade(1.18), subdiv=1,
               scale=(0.36 * sz, 0.5 * sz, 0.25 * sz))
        for (dx, dy) in ((0.2, -0.3), (-0.25, 0.2)):
            c.ball(0.14 * sz + 0.04, (palm[0] + s * dx * sz, palm[1] + dy * sz, palm[2] + 0.3 * sz), B, subdiv=0,
                   scale=(1.2, 1, 0.4))
        # fixed finger (inner side), pale-tipped, with a glowing seam
        f0 = (palm[0] - s * 0.22 * sz, palm[1] + 0.55 * sz, palm[2])
        chain(c, [f0, (f0[0] - s * 0.1 * sz, f0[1] + 0.6 * sz, f0[2]), (f0[0] + s * 0.1 * sz, f0[1] + 1.15 * sz, f0[2])],
              [0.27 * sz, 0.2 * sz, 0.03], A.shade(0.9), segs=5)
        limb(c, (f0[0] - s * 0.1 * sz, f0[1] + 0.6 * sz, f0[2]), (f0[0] + s * 0.1 * sz, f0[1] + 1.15 * sz, f0[2]), 0.2 * sz, 0.03, B, segs=5)
        c.ball(0.2 * sz, (palm[0] + s * 0.05 * sz, palm[1] + 0.55 * sz, palm[2] + 0.05), C, subdiv=1, glow=True)  # glow in the gape
        arm = c.build(body, loc=(s * at[0], at[1], at[2]))
        osc(arm, clip, "rotation_euler", T, (2, -s * 0.07, 1, ph), (0, 0.04, 1, ph + 0.25))
        d = Model(f"{kind}_{name}_finger", seed=7092 + k)
        chain(d, [(0, 0, 0), (s * 0.15 * sz, 0.65 * sz, 0.02), (-s * 0.1 * sz, 1.25 * sz, 0.0)],
              [0.28 * sz, 0.21 * sz, 0.03], A, segs=5)
        limb(d, (s * 0.15 * sz, 0.65 * sz, 0.02), (-s * 0.1 * sz, 1.25 * sz, 0.0), 0.21 * sz, 0.03, B, segs=5)
        d.ball(0.1 * sz + 0.03, (s * 0.1 * sz, 0.6 * sz, 0.2 * sz), B, subdiv=0)
        hinge = (palm[0] + s * 0.28 * sz, palm[1] + 0.5 * sz, palm[2] + 0.02)
        fing = d.build(arm, loc=hinge)

        sample(fing, clip, "rotation_euler", T, lambda t, s=s, ph=ph: (0, 0, s * (0.5 - 0.52 * math.exp(-(((t + ph) % 1.0 - 0.5) / 0.07) ** 2))), step=1)
        marker(body, kind, "muzzle", (s * at[0] + palm[0] - s * 0.05, at[1] + palm[1] + 1.4 * sz, at[2] + palm[2]), k)
    for k, (x, y, r) in enumerate(((0.72, -0.35, 0.36), (-0.72, -0.35, 0.36))):
        marker(body, kind, "muzzle", (x, y, 0.62 + r * 1.25), 2 + k)
    osc(body, clip, "location", T, (2, 0.06, 2, 0), (0, 0.05, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.025, 1, 0.25))


# --- Reef Eel: serpent, beast, 2.0 a segment ---------------------------------------------------------

def _eel_frill(name, parent, s, y0, y1, w0, w1, clip, T, ph, col):
    """A ribbon fin along one flank from y0 to y1, w0..w1 wide, rippling."""
    f = Model(name)
    n = 4
    pts_out, pts_in = [], []
    for k in range(n + 1):
        y = y0 + (y1 - y0) * k / n
        w = w0 + (w1 - w0) * k / n
        pts_out.append((w * (1.0 if k % 2 == 0 else 0.82), y))
        pts_in.append((0.0, y))
    flat(f, _side(pts_in + list(reversed(pts_out)), s), 0.0, 0.06, col)
    obj = f.build(parent, loc=(s * 0.4, 0, -0.06))
    osc(obj, clip, "rotation_euler", T, (1, -s * 0.14, 1, ph))
    return obj


def reef_eel():
    """A moray of the reef: blue, with bold pink saddles across its back (one a segment, so the
    chained eel is banded), a pink crest and flank ribbons, a gaping toothy head, yellow eyes and
    glowing yellow photophores down its sides."""
    T = 1.2
    cols = ("#2a6a8a", "#ffb0c0", "#ffe04a")
    R = 0.52

    # head
    kind, clip, root = named("reef_eel_head", "serpent", "beast", "bite", preview=cols, seg_length=SEG)
    h = Model(f"{kind}_body", seed=7100)
    tube(h, R, -1.0, -0.4, 0, 0, A, segs=8)
    tube(h, R * 0.95, -1.0, -0.4, 0, -0.14, A.shade(0.55), segs=8)
    h.ball(0.74, (0, -0.15, 0.04), A, subdiv=1, scale=(1.0, 1.1, 0.66))                          # broad skull
    h.ball(0.5, (0, 0.55, 0.08), A, subdiv=1, scale=(0.92, 1.15, 0.5))                         # blunt snout
    h.ball(0.6, (0, 0.3, -0.06), A.shade(0.55), subdiv=1, scale=(1.0, 1.4, 0.4))               # dark lip line
    h.ball(1.0, (0, -0.35, 0.36), B, subdiv=1, scale=(0.5, 0.52, 0.2))                          # pink saddle on the nape
    h.ball(1.0, (0, 0.5, 0.26), B, subdiv=1, scale=(0.2, 0.42, 0.12))                           # blaze down the snout
    for s in (1, -1):
        h.ball(0.19, (s * 0.36, 0.3, 0.3), C, subdiv=1, glow=True)                             # eyes
        h.box((0.07, 0.12, 0.26), (s * 0.38, 0.4, 0.36), DARK)
        limb(h, (s * 0.16, 0.95, 0.18), (s * 0.2, 1.08, 0.28), 0.07, 0.05, B, segs=4)           # nostril tubes
        for i in range(4):  # fangs hanging from the upper jaw
            h.cyl(0.075, 0.26, (s * (0.4 - i * 0.05), 0.1 + i * 0.24, -0.12), BONE, segs=4, r_top=0.0,
                  rot=(math.pi, 0, 0))
        h.ball(0.12, (s * 0.42, -0.8, 0.28), C, subdiv=0, glow=True)                           # first photophores
    fin(h, [(-0.5, 0.42), (-1.0, 0.45), (-1.0, 0.72), (-0.7, 0.62)], 0, 0.07, B.shade(0.85))       # crest begins
    head = h.build(root)
    j = Model(f"{kind}_jaw", seed=7101)
    j.ball(0.45, (0, 0.78, -0.02), A.shade(0.65), subdiv=1, scale=(0.95, 1.65, 0.36))          # the lower jaw, jutting
    j.slab(_ccw([(0, 1.42), (-0.24, 1.2), (-0.3, 0.5), (0.3, 0.5), (0.24, 1.2)]), 0.04, 0.12, C, glow=True)  # gullet
    for s in (1, -1):
        for i in range(4):
            j.cyl(0.075, 0.26, (s * (0.32 - i * 0.04), 0.55 + i * 0.25, 0.06), BONE, segs=4, r_top=0.0)
    jaw = j.build(head, loc=(0, -0.05, -0.2))
    sample(jaw, clip, "rotation_euler", T, lambda u: (-0.12 - 0.16 * (1 + math.sin(TAU * u)), 0, 0))
    for k, s in enumerate((1, -1)):
        _eel_frill(f"{kind}_frill_{k}", head, s, -0.95, -0.35, 0.5, 0.2, clip, T, 0.25 * k, B.shade(0.9))
    marker(head, kind, "muzzle", (0, 1.45, -0.1))
    osc(head, clip, "rotation_euler", T, (2, 0.08, 1, 0.25))

    # body: tiles end to end
    kind, clip, root = named("reef_eel_body", "serpent", "beast", "swim", preview=cols, seg_length=SEG)
    g = Model(f"{kind}_body", seed=7102)
    tube(g, R, -1.0, 1.0, 0, 0, A, segs=8)
    tube(g, R * 0.95, -1.0, 1.0, 0, -0.14, A.shade(0.55), segs=8)                              # dark belly
    g.ball(1.0, (0, 0.0, 0.3), B, subdiv=1, scale=(0.56, 0.68, 0.3))                           # the pink saddle
    for (x, y) in ((0.22, 0.88), (-0.24, -0.86)):                                                 # loose spots
        g.ball(0.15, (x, y, 0.45), B, subdiv=0, scale=(1.2, 1, 0.5))
    for s in (1, -1):
        for y in (-0.7, 0.7):
            g.ball(0.12, (s * 0.45, y, 0.33), C, subdiv=0, glow=True)                          # photophores
    fin(g, [(1.0, 0.45), (-1.0, 0.45), (-1.0, 0.72), (1.0, 0.72)], 0, 0.07, B.shade(0.85))        # continuous crest
    body = g.build(root)
    for k, s in enumerate((1, -1)):
        _eel_frill(f"{kind}_frill_{k}", body, s, -1.0, 1.0, 0.46, 0.46, clip, T, 0.25 * k + 0.5, B.shade(0.9))
    osc(body, clip, "rotation_euler", T, (1, 0.05, 1, 0.0))

    # tail: tapering into a pink paddle
    kind, clip, root = named("reef_eel_tail", "serpent", "beast", "swim", preview=cols, seg_length=SEG)
    t = Model(f"{kind}_body", seed=7103)
    tube(t, R, 1.0, -0.6, 0, 0, A, segs=8, r_end=0.26)
    tube(t, R * 0.95, 1.0, -0.6, 0, -0.14, A.shade(0.55), segs=8, r_end=0.2)
    t.ball(1.0, (0, 0.35, 0.25), B, subdiv=1, scale=(0.5, 0.55, 0.3))
    for s in (1, -1):
        t.ball(0.11, (s * 0.38, 0.85, 0.32), C, subdiv=0, glow=True)
    fin(t, [(1.0, 0.45), (-0.4, 0.3), (-0.4, 0.5), (1.0, 0.72)], 0, 0.07, B.shade(0.85))
    tail = t.build(root)
    for k, s in enumerate((1, -1)):
        _eel_frill(f"{kind}_frill_{k}", tail, s, -0.5, 1.0, 0.22, 0.46, clip, T, 0.25 * k + 0.5, B.shade(0.9))
    p = Model(f"{kind}_paddle", seed=7104)
    flat(p, _ccw([(0, 0.25), (-0.42, 0.0), (-0.5, -0.45), (-0.25, -0.85), (0, -1.0), (0.25, -0.85), (0.5, -0.45),
                  (0.42, 0.0)]), 0.0, 0.07, B)
    flat(p, _ccw([(0, 0.0), (-0.22, -0.4), (0, -0.8), (0.22, -0.4)]), 0.05, 0.04, B.shade(0.8))
    p.ball(0.17, (0, -0.6, 0.09), C, subdiv=0, glow=True, scale=(1, 1.4, 0.5))
    pad = p.build(tail, loc=(0, -0.55, 0.0))
    osc(pad, clip, "rotation_euler", T, (2, 0.4, 1, 0.0))
    osc(tail, clip, "rotation_euler", T, (2, 0.12, 1, 0.25))


def build():
    reef_glider()
    shrimp_kite()
    pirate_junk()
    clam_battery()
    crab_dreadnought()
    reef_eel()
