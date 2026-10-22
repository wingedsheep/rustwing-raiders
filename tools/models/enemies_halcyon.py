"""HALCYON's roster, each its own model: the Port Authority's clean, machined harbour craft (white and
slate hulls, rubbing strakes of dark fender round every lower edge so they lift off the blue water and
the sandy flats) and the lantern jellies of the kelp. Seeds 2000-2999.
"""
from __future__ import annotations

import math

from kit import Model, group
from creatures_util import TAU, chain, flat, limb, osc, sample
from enemies_lib import (A, B, C, DARK, GLASS, both, fin, flame, hull, marker, mirror, named, pulse, rotor, spin,
                         tube)


def _grow(pts, k, dx=0.0, dy=0.0):
    """An outline scaled about its centre (and nudged): the fender strake under a hull."""
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    return [(cx + (x - cx) * k + dx, cy + (y - cy) * k + dy) for x, y in pts]


def _blink(obj, clip, T, rate, on=0.5, phase=0.0, low=-0.75):
    """A light that flashes: full size while on, shrunk almost away while off."""
    sample(obj, clip, "scale", T, lambda u: (0.0,) * 3 if ((u * rate + phase) % 1.0) < on else (low,) * 3, step=1)


def _light(parent, name, size, loc, clip, T, rate, on=0.5, phase=0.0):
    m = Model(name)
    m.box(size, (0, 0, 0), C, glow=True)
    obj = m.build(parent, loc=loc)
    _blink(obj, clip, T, rate, on, phase)
    return obj


# --- Patrol Cutter: the harbour police interceptor, ~2.2 ----------------------------------------------

def patrol_cutter():
    """A narrow white hydrofoil hull in Authority livery: a navy stripe and nose chevron, a light bar
    flashing behind the canopy, swept foils with dropped tips, one big jet and two little ones."""
    kind, clip, root = named("patrol_cutter", "dart", "mech", "fly", preview=("#e8e0d0", "#2a4a7a", "#4ae8ff"))
    T = 1.0
    b = Model(f"{kind}_body", seed=2001)
    out = [(0, 1.2), (-0.17, 0.78), (-0.3, 0.1), (-0.33, -0.6), (-0.25, -0.98), (0.25, -0.98), (0.33, -0.6),
           (0.3, 0.1), (0.17, 0.78)]
    b.slab(_grow(out, 1.12, dy=-0.02), -0.22, -0.08, B.shade(0.75))                      # dark fender strake
    hull(b, out, -0.12, 0.2, A, inset=0.62)
    b.box((0.13, 1.25, 0.05), (0, -0.25, 0.2), B)                                         # livery stripe
    for s in (1, -1):                                                                     # nose chevron
        b.box((0.09, 0.42, 0.05), (s * 0.07, 0.72, 0.15), B, rot=(0.28, 0, s * 0.5))
    b.ball(0.16, (0, 0.28, 0.24), GLASS, subdiv=1, scale=(1, 2.0, 0.7))                   # canopy
    b.box((0.56, 0.16, 0.08), (0, -0.12, 0.27), DARK)                                     # light bar
    # swept foils: dark under-plate, white top, navy tip band, a foil dropping off each tip
    wing = [(0.24, 0.05), (0.3, -0.55), (1.05, -0.92), (1.08, -0.68)]
    for s in (1, -1):
        w = wing if s > 0 else mirror(wing)
        flat(b, _grow(w, 1.1), -0.04, 0.06, B.shade(0.75))
        flat(b, w, 0.02, 0.07, A)
        tip = [(0.82, -0.6), (0.86, -0.82), (1.08, -0.94), (1.1, -0.66)]
        flat(b, tip if s > 0 else mirror(tip), 0.07, 0.04, B)
        fin(b, [(-0.55, 0.0), (-0.95, 0.0), (-0.98, -0.42), (-0.78, -0.42)], s * 1.08, 0.06, B)
        b.box((0.08, 0.2, 0.08), (s * 1.1, -0.62, 0.06), C, glow=True)                    # tip lights
        flat(b, [(0.16, 0.62), (0.2, 0.42), (0.5, 0.3), (0.5, 0.42)] if s > 0 else
             mirror([(0.16, 0.62), (0.2, 0.42), (0.5, 0.3), (0.5, 0.42)]), 0.0, 0.05, A)  # canards
        tube(b, 0.11, -0.4, -1.0, s * 0.42, -0.02, B, segs=6)                              # side jets
        b.cyl(0.08, 0.05, (s * 0.42, -1.01, -0.02), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    fin(b, [(-0.45, 0.18), (-0.92, 0.18), (-0.98, 0.52), (-0.78, 0.52)], 0, 0.06, B)      # dorsal fin
    tube(b, 0.17, -0.7, -1.06, 0, 0.0, B.shade(0.8), segs=7)                              # main jet
    b.cyl(0.14, 0.05, (0, -1.07, 0.0), C, segs=7, rot=(math.pi / 2, 0, 0), glow=True)
    body = b.build(root)
    # the light bar: two lamps flashing turn about, like a harbour police launch
    for k, s in enumerate((1, -1)):
        _light(body, f"{kind}_lamp_{k}", (0.24, 0.17, 0.12), (s * 0.15, -0.12, 0.33), clip, T, 4, phase=k * 0.5)
    flame(body, f"{kind}_flame_0", (0, -1.08, 0.0), 0.14, 0.55, clip, T, k=4)
    for k, s in enumerate((1, -1)):
        flame(body, f"{kind}_flame_{k + 1}", (s * 0.42, -1.03, -0.02), 0.08, 0.32, clip, T, phase=0.3 + k * 0.3, k=5)
        marker(body, kind, "muzzle", (s * 0.2, 1.0, 0.0), k)
    osc(body, clip, "location", T, (2, 0.04, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.06, 1, 0.25))


# --- Toll Barge: a fat customs barge with a boom gate, ~4 -------------------------------------------

def toll_barge():
    """A square-ended hover barge: corner lift fans in round sponsons, hazard paint at the bow, a toll
    booth with a turning beacon, impounded crates, and a striped boom gate across the bow that lifts."""
    kind, clip, root = named("toll_barge", "gunship", "mech", "hover", preview=("#d0c8b0", "#3a3a4a", "#ffd04a"))
    T = 2.0
    b = Model(f"{kind}_body", seed=2101)
    out = [(-0.95, 1.4), (-1.2, 1.15), (-1.2, -1.35), (-0.95, -1.6), (0.95, -1.6), (1.2, -1.35), (1.2, 1.15),
           (0.95, 1.4)]
    b.slab(_grow(out, 1.08), -0.45, -0.22, B)                                             # fender skirt
    hull(b, out, -0.32, 0.22, A, inset=0.9)
    b.box((1.7, 2.3, 0.04), (0, -0.2, 0.22), A.shade(0.85))                               # deck plating
    for k in range(3):                                                                    # deck seams
        b.box((1.7, 0.06, 0.05), (0, 0.5 - k * 0.75, 0.24), B.shade(1.3))
    for k in range(7):                                                                    # bow hazard paint
        x = -0.9 + k * 0.3
        b.box((0.17, 0.3, 0.05), (x, 1.15, 0.23), C if k % 2 == 0 else B, rot=(0, 0, 0.6))
    # corner sponsons with lift fans (rotors added below), dark rims, yellow running lights
    fans = []
    for sx in (1, -1):
        for sy, y in ((1, 0.95), (-1, -1.15)):
            x = sx * 1.22
            b.cyl(0.55, 0.42, (x, y, -0.36), B, segs=8)
            b.cyl(0.5, 0.06, (x, y, 0.06), A.shade(1.1), segs=8)
            b.cyl(0.4, 0.04, (x, y, 0.1), DARK, segs=8)
            b.box((0.14, 0.24, 0.08), (x + sx * 0.5, y, 0.0), C, glow=True)
            fans.append((x, y))
    # toll booth: slate base, white walls, glass band, roof beacon (turning, below)
    b.box((0.95, 0.85, 0.5), (-0.35, -0.75, 0.47), B)
    b.box((0.85, 0.75, 0.32), (-0.35, -0.75, 0.86), A.shade(1.12))
    b.box((0.9, 0.8, 0.12), (-0.35, -0.75, 0.8), GLASS)
    b.box((0.98, 0.9, 0.08), (-0.35, -0.75, 1.04), B)
    b.box((0.8, 0.72, 0.06), (-0.35, -0.75, 1.1), A.shade(1.15))
    b.box((0.6, 0.12, 0.06), (-0.35, -0.3, 0.82), C, glow=True)                           # booth window lamp
    # impounded cargo: crates stacked to starboard, one knocked askew
    b.box((0.55, 0.55, 0.42), (0.6, -0.95, 0.42), B.shade(1.4))
    b.box((0.5, 0.5, 0.36), (0.58, -0.45, 0.4), A.shade(0.7), rot=(0, 0, 0.18))
    b.box((0.45, 0.45, 0.32), (0.62, -0.9, 0.79), A.shade(1.1), rot=(0, 0, -0.12))
    b.box((0.47, 0.1, 0.06), (0.62, -0.9, 0.96), C)                                       # tag on the top crate
    # twin bow guns under the boom
    for s in (1, -1):
        b.box((0.42, 0.55, 0.3), (s * 0.55, 0.85, 0.36), B)
        b.cyl(0.18, 0.12, (s * 0.55, 0.8, 0.5), A.shade(1.1), segs=6)
        for d in (-0.08, 0.08):
            tube(b, 0.07, 1.05, 1.85, s * 0.55 + d, 0.36, DARK, segs=5)
        b.box((0.3, 0.1, 0.12), (s * 0.55, 1.86, 0.36), C, glow=True)
    # stern: two jets
    for s in (1, -1):
        tube(b, 0.2, -1.5, -1.8, s * 0.5, -0.05, DARK, segs=6)
        b.cyl(0.16, 0.05, (s * 0.5, -1.81, -0.05), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    # boom-gate post at the port bow corner
    b.box((0.32, 0.32, 0.55), (-1.05, 1.45, 0.45), B)
    b.box((0.24, 0.24, 0.14), (-1.05, 1.45, 0.78), C, glow=True)
    body = b.build(root)
    for k, (x, y) in enumerate(fans):
        rotor(body, f"{kind}_fan_{k}", (x, y, 0.13), 0.4, 3, clip, T, (1 if x * y > 0 else -1) * 8, color=A.shade(0.8),
              hub=C)
    # the boom: a striped arm hinged on the post, reaching out past the starboard side; lifts and drops
    g = Model(f"{kind}_boom", seed=2102)
    n = 8
    for k in range(n):
        g.box((0.34, 0.2, 0.2), (0.17 + k * 0.34, 0, 0), C if k % 2 == 0 else B, glow=(k % 2 == 0))
    g.box((0.14, 0.14, 0.26), (n * 0.34, 0, -0.06), B)                                    # tip weight
    g.box((0.4, 0.3, 0.3), (-0.12, 0, 0), B.shade(1.3))                                   # counterweight
    boom = g.build(body, loc=(-1.05, 1.45, 0.62))

    def lift(u):
        a = 0.5 - 0.5 * math.cos(TAU * u)
        a = a * a * (3 - 2 * a)
        return (0.0, -0.75 * a, 0.0)
    sample(boom, clip, "rotation_euler", T, lift, step=1)
    # roof beacon: a yellow lamp with a turning dark shade
    bc = Model(f"{kind}_beacon", seed=2103)
    bc.cyl(0.17, 0.2, (0, 0, 0), C, segs=6, glow=True)
    bc.box((0.42, 0.1, 0.24), (0, 0, 0.1), DARK)
    beacon = bc.build(body, loc=(-0.35, -0.75, 1.13))
    spin(beacon, clip, T, 2)
    for k, s in enumerate((1, -1)):
        flame(body, f"{kind}_flame_{k}", (s * 0.5, -1.83, -0.05), 0.15, 0.45, clip, T, phase=k * 0.4, k=4)
        marker(body, kind, "muzzle", (s * 0.55, 1.95, 0.36), k)
    osc(body, clip, "location", T, (2, 0.07, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.025, 1, 0.25), (0, 0.02, 1, 0))


# --- Lantern Jelly: a kelp jelly lit from within, ~1.2 ----------------------------------------------

def lantern_jelly():
    """A pink bell with a glowing lantern core and spots, a dark frilled rim, pale oral arms and glowing
    tipped tentacles trailing behind; the bell squeezes and the tentacles ripple."""
    kind, clip, root = named("lantern_jelly", "swarm", "beast", "pulse", preview=("#ff8ac8", "#ffe0f0", "#8affff"))
    T = 2.0
    b = Model(f"{kind}_bell", seed=2501)
    b.cyl(0.5, 0.1, (0, 0, -0.16), A.shade(0.45), segs=10, r_top=0.46)                    # dark rim skirt
    b.ball(0.45, (0, 0, -0.08), A.shade(0.6), subdiv=1, scale=(1, 1, 0.6))                # dark grooves
    for k in range(8):                                                                    # pink lobes
        a = TAU * (k + 0.5) / 8
        b.ball(0.2, (math.cos(a) * 0.27, math.sin(a) * 0.27, 0.0), A, subdiv=1, scale=(1.25, 0.72, 0.75),
               rot=(0, 0, a))
    for k in range(8):                                                                    # pale scallops round the rim
        a = TAU * k / 8
        b.ball(0.1, (math.cos(a) * 0.45, math.sin(a) * 0.45, -0.1), B, subdiv=0, scale=(1, 1, 0.6))
    b.ball(0.2, (0, 0, 0.12), B, subdiv=1, scale=(1, 1, 0.8))                             # pale crown
    for k in range(4):                                                                    # glowing spots
        a = TAU * k / 4 + 0.4
        b.ball(0.07, (math.cos(a) * 0.33, math.sin(a) * 0.33, 0.06), C, subdiv=0, glow=True)
    bell = b.build(root)
    core = Model(f"{kind}_core", seed=2502)
    core.ball(0.15, (0, 0, 0), C, subdiv=1, glow=True, scale=(1, 1, 0.9))
    core_obj = core.build(bell, loc=(0, 0, 0.22))
    pulse(core_obj, clip, T, 0.22, harm=2, phase=0.25)
    # the squeeze: wider and flatter, then tall and narrow, twice a loop
    osc(bell, clip, "scale", T, (0, 0.09, 2, 0), (1, 0.09, 2, 0), (2, -0.14, 2, 0))
    osc(bell, clip, "location", T, (2, 0.06, 2, 0.15), (0, 0.03, 1, 0))
    # oral arms: four pale frilly ribbons; tentacles: six dark threads with glowing tips
    arms = []
    for k, x in enumerate((-0.11, 0.11)):
        arms.append((f"arm_{k}", (x, -0.05, -0.18), [(0, 0, 0), (x * 0.4, -0.25, -0.12), (x * 0.8, -0.5, -0.16)],
                     [0.09, 0.07, 0.03], B, False))
    for k in range(6):
        x = (k - 2.5) * 0.15
        L = 0.5 + 0.08 * (1 - abs(k - 2.5) / 2.5)
        arms.append((f"tentacle_{k}", (x, -0.22, -0.16), [(0, 0, 0), (x * 0.3, -L * 0.5, -0.12), (x * 0.5, -L, -0.1)],
                     [0.045, 0.035, 0.02], A.shade(0.55), True))
    for k, (name, at, pts, radii, col, tip) in enumerate(arms):
        t = Model(f"{kind}_{name}", seed=2510 + k)
        chain(t, pts, radii, col, segs=4)
        if tip:
            t.ball(0.075, pts[-1], C, subdiv=0, glow=True)
        else:
            for j in range(3):
                t.ball(0.06, (pts[1][0] + (j - 1) * 0.03, -0.18 - j * 0.15, -0.08 - j * 0.03), B.shade(0.9), subdiv=0)
        obj = t.build(bell, loc=at)
        ph = k * 0.13
        osc(obj, clip, "rotation_euler", T, (2, 0.22, 1, ph), (0, 0.18, 2, ph + 0.4))
    marker(bell, kind, "muzzle", (0, 0.4, 0.0))


# --- Harbour Lancer: the lighthouse that shoots, ~3 ---------------------------------------------------

def harbour_lancer():
    """A white hull banded like a lighthouse, its lamp room on top turning; the beam fires from a lens
    held between two long slate prongs, studs charging tip-ward along each prong."""
    kind, clip, root = named("harbour_lancer", "lancer", "mech", "charge", preview=("#e8e0d0", "#2a2a3a", "#ff3a5a"))
    T = 1.0
    b = Model(f"{kind}_body", seed=2401)
    out = [(-0.3, 0.45), (-0.5, 0.1), (-0.52, -0.9), (-0.32, -1.35), (0.32, -1.35), (0.52, -0.9), (0.5, 0.1),
           (0.3, 0.45)]
    b.slab(_grow(out, 1.1), -0.3, -0.14, B)                                               # fender strake
    hull(b, out, -0.2, 0.24, A, inset=0.72)
    for y in (-0.15, -0.95):                                                              # lighthouse bands
        b.box((0.72, 0.22, 0.06), (0, y, 0.24), B)
    # the prongs: slate beams with white top plates, charge studs along them
    for s in (1, -1):
        x = s * 0.33
        b.box((0.26, 1.55, 0.26), (x, 1.05, -0.02), B, taper=0.85)
        b.box((0.18, 1.3, 0.06), (x, 0.95, 0.13), A.shade(1.05))
        b.box((0.3, 0.3, 0.32), (x, 1.82, -0.02), B.shade(1.4))                           # prong heads
        b.box((0.16, 0.08, 0.1), (x - s * 0.1, 1.95, -0.02), C, glow=True)
    b.box((0.5, 0.2, 0.14), (0, 0.45, -0.05), B)                                          # yoke between prongs
    b.box((0.75, 0.16, 0.12), (0, 1.62, -0.12), B.shade(0.8))                             # lens cradle
    # wings: low white deltas with a slate leading edge and red tip lights
    wing = [(0.45, -0.1), (0.5, -1.0), (1.35, -1.45), (1.38, -1.1)]
    for s in (1, -1):
        w = wing if s > 0 else mirror(wing)
        flat(b, _grow(w, 1.1), -0.06, 0.06, B)
        flat(b, w, 0.0, 0.07, A)
        edge = [(0.46, -0.1), (0.5, -0.32), (1.38, -1.18), (1.38, -1.08)]
        flat(b, edge if s > 0 else mirror(edge), 0.05, 0.04, B)
        b.box((0.14, 0.28, 0.1), (s * 1.36, -1.3, 0.06), C, glow=True)
        fin(b, [(-0.9, 0.2), (-1.4, 0.2), (-1.45, 0.62), (-1.2, 0.62)], s * 0.32, 0.06, B)
        tube(b, 0.15, -1.1, -1.5, s * 0.22, 0.0, DARK, segs=6)
        b.cyl(0.12, 0.05, (s * 0.22, -1.51, 0.0), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    # lamp room: slate gallery, glass drum, the lamp turning on top
    b.cyl(0.36, 0.1, (0, -0.55, 0.22), B, segs=8)
    b.cyl(0.26, 0.2, (0, -0.55, 0.3), A.shade(1.05), segs=8, r_top=0.23)
    b.cyl(0.24, 0.12, (0, -0.55, 0.48), GLASS, segs=8)
    b.cyl(0.28, 0.04, (0, -0.55, 0.6), B, segs=8)
    body = b.build(root)
    lamp = Model(f"{kind}_lamp", seed=2402)
    lamp.cyl(0.17, 0.16, (0, 0, 0), C, segs=6, glow=True)
    lamp.box((0.14, 0.7, 0.1), (0, 0.2, 0.08), C, glow=True)                              # the turning lens beam
    lamp.box((0.2, 0.2, 0.1), (0, -0.12, 0.1), B)                                         # its shade
    lamp_obj = lamp.build(body, loc=(0, -0.55, 0.62))
    spin(lamp_obj, clip, T, 1)
    for s in (1, -1):                                                                     # studs charging to the tip
        for k in range(3):
            _light(body, f"{kind}_stud_{'l' if s < 0 else 'r'}{k}", (0.18, 0.2, 0.08), (s * 0.33, 0.6 + k * 0.42, 0.18),
                   clip, T, 2, on=0.45, phase=-k * 0.17)
    lens = Model(f"{kind}_lens", seed=2403)
    lens.ball(0.24, (0, 0, 0), C, subdiv=1, scale=(1, 0.75, 1), glow=True)
    lens_obj = lens.build(body, loc=(0, 1.75, -0.02))
    pulse(lens_obj, clip, T, 0.25, harm=2)
    for k, s in enumerate((1, -1)):
        flame(body, f"{kind}_flame_{k}", (s * 0.22, -1.53, 0.0), 0.12, 0.4, clip, T, phase=k * 0.35, k=4)
    marker(body, kind, "emitter", (0, 2.0, -0.02))
    osc(body, clip, "location", T, (2, 0.04, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.03, 1, 0.25))


# --- Customs Tender: a twin-hulled cutter mothership, ~7 ----------------------------------------------

def customs_tender():
    """Two long hulls joined fore and aft round an open dock: cutters launch from the slot, a gantry
    crane runs its length. A bridge tower with a sweeping searchlight, a radar, cyan running lights."""
    kind, clip, root = named("customs_tender", "carrier", "mech", "patrol", preview=("#b0b0a0", "#3a4a5a", "#4ae8ff"))
    T = 3.0
    b = Model(f"{kind}_body", seed=2201)
    for s in (1, -1):
        x = s * 1.15
        h = [(x - 0.25, 3.45), (x - 0.55, 2.7), (x - 0.58, -2.95), (x - 0.45, -3.3), (x + 0.45, -3.3), (x + 0.58, -2.95),
             (x + 0.55, 2.7), (x + 0.25, 3.45)]
        b.slab(_grow(h, 1.05), -0.62, -0.36, B)                                           # fender strake
        hull(b, h, -0.5, 0.3, A, inset=0.85)
        b.box((0.12, 4.0, 0.06), (x - s * 0.32, -0.45, 0.3), B)                            # inner deck edge
        for k in range(5):                                                                # cyan running lights
            b.box((0.12, 0.24, 0.1), (x + s * 0.5, 2.0 - k * 1.05, 0.05), C, glow=True)
        for k in range(2):
            tube(b, 0.22, -3.2, -3.55, x + (k - 0.5) * 0.5, -0.15, DARK, segs=6)
            b.cyl(0.17, 0.05, (x + (k - 0.5) * 0.5, -3.56, -0.15), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    # fore deck bridging the hulls, and the aft deck
    b.slab([(-0.75, 2.85), (-0.75, 1.35), (0.75, 1.35), (0.75, 2.85)], -0.3, 0.26, A.shade(0.9))
    b.slab([(-0.75, -2.45), (-0.75, -3.2), (0.75, -3.2), (0.75, -2.45)], -0.3, 0.26, A.shade(0.9))
    b.box((1.5, 0.24, 0.42), (0, 1.32, 0.12), B)                                          # bay lips
    b.box((1.5, 0.24, 0.42), (0, -2.42, 0.12), B)
    # bay header lights facing into the dock
    for x in (-0.45, 0, 0.45):
        b.box((0.2, 0.12, 0.1), (x, 1.2, 0.3), C, glow=True)
        b.box((0.2, 0.12, 0.1), (x, -2.3, 0.3), C, glow=True)
    # bridge tower on the fore deck, offset to port; searchlight and radar added below
    b.box((1.1, 1.1, 0.6), (-0.35, 2.05, 0.55), B, taper=0.9)
    b.box((0.95, 0.9, 0.45), (-0.35, 2.0, 1.05), A.shade(1.12), taper=0.85)
    b.box((0.9, 0.16, 0.18), (-0.35, 2.45, 1.05), GLASS)
    b.box((0.75, 0.08, 0.08), (-0.35, 2.55, 1.0), C, glow=True)
    b.box((0.4, 0.4, 0.18), (0.45, 2.3, 0.35), A.shade(0.7))                              # deck locker
    # a cutter riding in the cradle at the head of the dock
    b.box((0.08, 0.5, 0.08), (0, 0.75, 0.0), DARK)
    hull(b, [(0, 1.15), (-0.28, 0.6), (-0.3, -0.05), (0.3, -0.05), (0.28, 0.6)], -0.15, 0.08, A.shade(1.15), inset=0.6)
    b.box((0.1, 0.9, 0.04), (0, 0.5, 0.08), B)
    b.box((0.18, 0.18, 0.1), (0, 0.0, 0.05), C, glow=True)
    # stern deck: helipad ring
    b.cyl(0.42, 0.04, (0, -2.82, 0.26), B.shade(1.3), segs=8)
    b.cyl(0.3, 0.05, (0, -2.82, 0.27), A.shade(0.9), segs=8)
    # seized containers on the starboard hull, hatches down the port hull
    for k, (y, c, tw) in enumerate(((0.9, B.shade(1.3), 0.05), (0.1, A.shade(0.72), -0.04), (-0.75, B.shade(1.3), 0.0),
                                    (-1.55, "#c86a3a", 0.08))):
        b.box((0.62, 0.7, 0.36), (1.18, y, 0.48), c, rot=(0, 0, tw))
        b.box((0.5, 0.08, 0.04), (1.18, y + 0.2, 0.67), DARK, rot=(0, 0, tw))
    for k in range(4):
        y = 0.9 - k * 0.85
        b.box((0.5, 0.5, 0.08), (-1.15, y, 0.33), B)
        b.box((0.34, 0.34, 0.06), (-1.15, y, 0.38), A.shade(1.12))
    # bow guns
    for s in (1, -1):
        b.box((0.36, 0.4, 0.26), (s * 1.15, 2.95, 0.4), B)
        tube(b, 0.08, 3.0, 3.75, s * 1.15, 0.42, DARK, segs=5)
        b.box((0.2, 0.1, 0.12), (s * 1.15, 3.76, 0.42), C, glow=True)
    body = b.build(root)
    # gantry crane: a bridge on rails along the hull edges, a hook block, running fore and aft
    g = Model(f"{kind}_gantry", seed=2202)
    g.box((2.6, 0.3, 0.16), (0, 0, 0.62), B.shade(1.3))
    g.box((2.6, 0.08, 0.08), (0, 0.18, 0.66), C, glow=True)
    for s in (1, -1):
        g.box((0.22, 0.4, 0.36), (s * 1.2, 0, 0.42), B)
    g.box((0.4, 0.4, 0.26), (0.2, 0, 0.5), A.shade(1.1))
    g.box((0.08, 0.08, 0.5), (0.2, 0, 0.15), DARK)
    gantry = g.build(body, loc=(0, -0.6, 0.0))
    sample(gantry, clip, "location", T, lambda u: (0.0, 1.2 * math.sin(TAU * u), 0.0))
    sl = Model(f"{kind}_searchlight", seed=2203)
    sl.cyl(0.14, 0.18, (0, 0, -0.05), B, segs=6)
    sl.box((0.32, 0.26, 0.26), (0, 0.12, 0.1), B.shade(1.3))
    sl.box((0.28, 0.08, 0.22), (0, 0.27, 0.1), C, glow=True)
    light = sl.build(body, loc=(-0.35, 2.15, 1.3))
    osc(light, clip, "rotation_euler", T, (2, 0.9, 1, 0))
    r = Model(f"{kind}_radar", seed=2204)
    r.box((0.9, 0.14, 0.3), (0, 0, 0.18), A.shade(1.1), rot=(0.35, 0, 0))
    r.box((0.3, 0.06, 0.1), (0, 0.06, 0.2), C, glow=True, rot=(0.35, 0, 0))
    r.cyl(0.06, 0.2, (0, 0, -0.1), DARK, segs=4)
    radar = r.build(body, loc=(-0.35, 1.7, 1.38))
    spin(radar, clip, T, 2)
    k = 0
    for s in (1, -1):
        for j in range(2):
            flame(body, f"{kind}_flame_{k}", (s * 1.15 + (j - 0.5) * 0.5, -3.58, -0.15), 0.18, 0.55, clip, T,
                  phase=k * 0.25, k=6)
            k += 1
    marker(body, kind, "bay", (0, -0.55, 0.0))
    for k, s in enumerate((1, -1)):
        marker(body, kind, "muzzle", (s * 1.15, 3.85, 0.42), k)
    osc(body, clip, "location", T, (2, 0.06, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.012, 1, 0.25))


# --- Depth Charger: a seaplane minelayer, ~4.5 span ---------------------------------------------------

def depth_charger():
    """A boat-hulled seaplane on a straight wing with tip floats: a revolving drum magazine of depth
    charges on its back, more charges racked on the wings, tractor props, a twin-finned tail."""
    kind, clip, root = named("depth_charger", "bomber", "mech", "fly", preview=("#e0d4b0", "#2a4a7a", "#ffa03a"))
    T = 2.0
    b = Model(f"{kind}_body", seed=2301)
    out = [(0, 1.55), (-0.32, 1.35), (-0.48, 0.7), (-0.46, -1.0), (-0.24, -1.75), (0.24, -1.75), (0.46, -1.0),
           (0.48, 0.7), (0.32, 1.35)]
    b.slab(_grow(out, 1.1), -0.42, -0.26, B)                                              # dark keel strake
    hull(b, out, -0.32, 0.28, A.shade(1.2), inset=0.7)
    b.box((0.5, 0.38, 0.16), (0, 1.12, 0.28), GLASS, rot=(0.35, 0, 0))                    # cockpit
    b.box((0.4, 0.07, 0.06), (0, 1.27, 0.37), C, glow=True, rot=(0.35, 0, 0))
    b.box((0.18, 1.0, 0.05), (0, -1.15, 0.28), B)                                         # spine stripe
    # the wing: light top, dark under-plate and leading edge, orange tip lights
    wing = [(0.42, 0.45), (0.42, -0.45), (2.25, -0.35), (2.3, 0.2)]
    for s in (1, -1):
        w = wing if s > 0 else mirror(wing)
        flat(b, _grow(w, 1.05), -0.02, 0.08, B)
        hull(b, w, 0.0, 0.12, A.shade(1.15), inset=0.94)
        edge = [(0.45, 0.45), (0.45, 0.3), (2.28, 0.08), (2.3, 0.2)]
        flat(b, edge if s > 0 else mirror(edge), 0.12, 0.04, B)
        b.box((0.16, 0.3, 0.08), (s * 2.3, -0.08, 0.1), C, glow=True)
        # tip floats on struts
        limb(b, (s * 1.95, -0.05, 0.0), (s * 1.95, -0.05, -0.32), 0.05, 0.05, DARK, segs=4)
        tube(b, 0.2, 0.75, -0.85, s * 1.95, -0.42, B, segs=6, r_end=0.12)
        b.box((0.3, 0.9, 0.06), (s * 1.95, -0.05, -0.24), A.shade(0.9))
        # engine nacelles, tractor props at the front (added below)
        tube(b, 0.22, 0.72, -0.75, s * 1.05, 0.12, B, segs=7, r_end=0.16)
        b.box((0.2, 0.5, 0.08), (s * 1.05, -0.1, 0.32), A.shade(0.8))
        b.cyl(0.12, 0.06, (s * 1.05, -0.76, 0.12), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
        # racked depth charges on the wing: dark drums standing in a rack, glowing bands
        b.box((0.42, 0.8, 0.06), (s * 1.5, -0.03, 0.14), DARK)
        for j in range(2):
            y = 0.17 - j * 0.38
            b.cyl(0.16, 0.26, (s * 1.5, y, 0.14), B.shade(1.2), segs=7)
            b.cyl(0.165, 0.07, (s * 1.5, y, 0.26), C, segs=7, glow=True)
            b.cyl(0.09, 0.04, (s * 1.5, y, 0.4), DARK, segs=6)
    # twin-finned tail
    tail = [(0.18, -1.45), (0.2, -1.75), (1.05, -1.85), (1.05, -1.55)]
    for s in (1, -1):
        t = tail if s > 0 else mirror(tail)
        flat(b, _grow(t, 1.08), 0.13, 0.05, B)
        flat(b, t, 0.18, 0.06, A.shade(1.15))
        fin(b, [(-1.45, 0.15), (-1.9, 0.15), (-1.95, 0.7), (-1.65, 0.7)], s * 1.0, 0.08, B)
        b.box((0.1, 0.22, 0.08), (s * 1.0, -1.65, 0.72), C, glow=True)
    # magazine turntable
    b.cyl(0.52, 0.12, (0, -0.25, 0.26), B, segs=8)
    body = b.build(root)
    drum = Model(f"{kind}_drum", seed=2302)
    drum.cyl(0.45, 0.08, (0, 0, 0), A.shade(0.8), segs=8)
    for j in range(6):                                                                    # six charges standing in a ring
        a = TAU * j / 6
        x, y = math.cos(a) * 0.3, math.sin(a) * 0.3
        drum.cyl(0.14, 0.28, (x, y, 0.06), B.shade(1.2), segs=7)
        drum.cyl(0.145, 0.07, (x, y, 0.2), C, segs=7, glow=True)
        drum.cyl(0.08, 0.04, (x, y, 0.34), DARK, segs=6)
    drum.cyl(0.12, 0.3, (0, 0, 0.06), C, segs=6, glow=True)
    drum_obj = drum.build(body, loc=(0, -0.25, 0.36))
    spin(drum_obj, clip, T, 1)
    for k, s in enumerate((1, -1)):
        p = Model(f"{kind}_prop_{k}", seed=2310 + k)
        for j in range(3):
            a = TAU * j / 3
            p.box((0.13, 0.05, 0.62), (math.sin(a) * 0.3, 0, math.cos(a) * 0.3), A.shade(1.2), rot=(0, a, 0))
        p.ball(0.11, (0, 0.04, 0), C, subdiv=0, glow=True)
        obj = p.build(body, loc=(s * 1.05, 0.8, 0.12))
        spin(obj, clip, T, s * 8, axis=1)
    marker(body, kind, "muzzle", (0, -0.6, -0.45))
    osc(body, clip, "location", T, (2, 0.06, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.03, 1, 0.25), (0, 0.015, 1, 0))


def build():
    patrol_cutter()
    toll_barge()
    lantern_jelly()
    harbour_lancer()
    customs_tender()
    depth_charger()
