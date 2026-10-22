"""The scrap clans' own fighters (src/sim/factions.ts FOES, faction 'scrap'): the pirate clans'
signature craft, worn in the scrap palette (tan hull, soot trim, red glow) leaning to the planet's.
One family: rusty patched plates, yellow-and-soot hazard stripes, bolted-on junk, red engine glow
(their telegraph: engines flare red, then they commit). Each one's shape says how it fights:
    ramjack      a battering ram with engines: the spiked prow is half the ship
    rattler      a lean chaser: bare rails, an exposed engine, junk strapped on, a rattle for a tail
    pirate_ace   the flashy rival: swept wings, shark mouth, racing stripe, kill marks, twin tails
    hookjaw      a gunship that is a harpoon gun on a winch, flanked by hooked jaws
    torpedo_rig  a wide bomber with fat red-nosed torpedoes on its wings and a lock-on dish
    flakker      a sandbagged flak pit with a quad-barrel gun (the whole model turns to aim)
    loot_runner  a glowing treasure chest between two oversized engines
    iron_crate   a flying riveted strongbox, a thruster on each corner, a glowing padlock seal
Seeds 9000-9999.
"""
from __future__ import annotations

import math

from kit import Model
from creatures_util import TAU, chain, flat, limb, osc, sample
from enemies_lib import A, B, C, DARK, GLASS, both, fin, flame, hull, marker, mirror, named, pulse, rotor, spin, tube

PAL = ("#a88a4a", "#2e2a2e", "#ff3a3a")
YEL = A.shade(1.45)       # hazard yellow (the hull colour, bleached)
RUST = A.shade(0.6)       # rust patches
LITE = A.shade(1.3)       # sun-bleached plates
BONE = "#ece6d6"          # teeth, kill marks


# --- private helpers --------------------------------------------------------------------------

def _tf(cx, cy, rot, pts):
    c, s = math.cos(rot), math.sin(rot)
    return [(cx + x * c - y * s, cy + x * s + y * c) for x, y in pts]


def _stripes(m, cx, cy, z, w, h, n=4, rot=0.0, thick=0.04, dark=B):
    """A hazard band: a soot plate w x h with n slanted yellow stripes, turned by rot about z."""
    m.slab(_tf(cx, cy, rot, [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]), z, z + thick, dark)
    k = h * 0.7
    p = (w - k) / n
    for i in range(n):
        x0 = -w / 2 + i * p + p / 4
        m.slab(_tf(cx, cy, rot, [(x0, -h / 2), (x0 + p / 2, -h / 2), (x0 + p / 2 + k, h / 2), (x0 + k, h / 2)]),
               z, z + thick * 1.6, YEL)


def _patch(m, x, y, z, sx, sy, rot=0.0, col=RUST, h=0.05):
    m.box((sx, sy, h), (x, y, z), col, rot=(0, 0, rot))


def _fin(m, pts, x, thick, color, cant=0.0):
    """An upright fin (profile in (y, z)) leaning out by `cant`."""
    return m.prism(pts, thick, (x, 0, 0), color, rot=(cant, 0, math.pi / 2))


def _nozzle(m, x, y, z, r, ring=B):
    """A rear-facing engine bell: a dark ring with a glowing core."""
    m.cyl(r * 1.15, 0.12, (x, y + 0.02, z), ring, segs=8, rot=(math.pi / 2, 0, 0))
    m.cyl(r, 0.06, (x, y - 0.1, z), C, segs=8, rot=(math.pi / 2, 0, 0), glow=True)


# --- Ramjack: a battering ram with engines ----------------------------------------------------

def ramjack():
    kind, clip, root = named("ramjack", "dart", "mech", "fly", preview=PAL)
    T = 1.0
    b = Model(f"{kind}_body", seed=9001)
    # squat body
    hull(b, [(0.46, -0.78), (0.52, 0.22), (-0.52, 0.22), (-0.46, -0.78)], -0.2, 0.24, A, inset=0.78)
    _stripes(b, 0, 0.02, 0.24, 0.66, 0.24, n=4)
    _patch(b, 0.16, -0.42, 0.25, 0.26, 0.3, 0.2)
    b.ball(0.17, (-0.08, -0.36, 0.27), GLASS, subdiv=1, scale=(1.1, 1.4, 0.7))          # hunched canopy
    b.box((0.22, 0.08, 0.05), (-0.08, -0.2, 0.36), C, glow=True)
    # the ram: a heavy iron wedge, half the ship
    ram = [(0.66, 0.16), (0.26, 0.86), (0, 1.02), (-0.26, 0.86), (-0.66, 0.16)]
    hull(b, ram, -0.24, 0.2, B, inset=0.55)
    for s in (1, -1):  # bright beaten-steel leading edges
        b.plank_line((s * 0.64, 0.2, 0.06), (s * 0.04, 1.0, 0.06), 0.16, 0.1, LITE)
        b.box((0.16, 0.16, 0.16), (s * 0.34, 0.42, 0.16), DARK, rot=(0, 0, 0.6))      # bolt heads
        limb(b, (s * 0.5, 0.4, 0.0), (s * 0.66, 0.9, 0.0), 0.12, 0.0, BONE, segs=5)   # side spikes
    limb(b, (0, 0.88, 0.02), (0, 1.32, 0.02), 0.17, 0.0, BONE, segs=6)                # the big spike
    b.box((0.3, 0.2, 0.1), (0, 0.6, 0.2), C, glow=True)                                 # glowing slit eye
    # heavy rear engines, side by side
    for s in (1, -1):
        tube(b, 0.31, -1.0, -0.12, s * 0.44, 0.02, B, segs=8, r_end=0.27)
        tube(b, 0.33, -0.55, -0.4, s * 0.44, 0.02, LITE, segs=8)                       # band
        b.box((0.2, 0.36, 0.12), (s * 0.44, -0.2, 0.3), DARK)                           # intake scoop
        _nozzle(b, s * 0.44, -1.0, 0.02, 0.24)
        flat(b, [(s * 0.62, -0.62), (s * 0.98, -0.82), (s * 0.98, -0.6), (s * 0.62, -0.25)][::s], 0.0, 0.08,
             A.shade(0.8))                                                              # stub fins
        b.box((0.12, 0.2, 0.08), (s * 0.96, -0.72, 0.06), C, glow=True)
    body = b.build(root)
    for k, s in enumerate((1, -1)):
        flame(body, f"{kind}_flame_{k}", (s * 0.44, -1.1, 0.02), 0.22, 0.7, clip, T, phase=k * 0.4, k=4)
    marker(body, kind, "muzzle", (0, 1.3, 0.0))
    # straining against the lock: rocks back and forth, nose dipping
    osc(body, clip, "location", T, (2, 0.05, 1, 0), (1, 0.06, 1, 0.25))
    osc(body, clip, "rotation_euler", T, (0, 0.05, 1, 0.5), (1, 0.03, 2, 0))


# --- Rattler: a lean, bolted-together chaser --------------------------------------------------

def rattler():
    kind, clip, root = named("rattler", "dart", "mech", "fly", preview=PAL)
    T = 1.0
    b = Model(f"{kind}_body", seed=9101)
    # bare spine: two rails and a narrow keel
    hull(b, [(0.17, -0.86), (0.2, 0.4), (0.1, 0.98), (-0.1, 0.98), (-0.2, 0.4), (-0.17, -0.86)], -0.12, 0.12, A,
         inset=0.7)
    for s in (1, -1):
        tube(b, 0.07, -0.9, 0.7, s * 0.2, 0.12, B, segs=5)
    b.ball(0.14, (0, 0.5, 0.17), GLASS, subdiv=1, scale=(1.0, 1.5, 0.8))                # cramped canopy
    b.box((0.16, 0.16, 0.08), (0, 0.96, 0.08), C, glow=True)                            # headlamp
    _stripes(b, 0, 0.8, 0.1, 0.24, 0.2, n=2)
    # the exposed engine: a V of pistons over a glowing crankcase
    b.box((0.44, 0.7, 0.16), (0, -0.32, 0.18), B)
    b.box((0.14, 0.6, 0.06), (0, -0.32, 0.29), C, glow=True)
    for s in (1, -1):
        for k in range(3):
            y = -0.08 - k * 0.22
            b.cyl(0.1, 0.22, (s * 0.15, y, 0.22), LITE, segs=6, rot=(0, s * 0.6, 0))
            b.cyl(0.07, 0.04, (s * 0.28, y, 0.4), DARK, segs=6, rot=(0, s * 0.6, 0))
        tube(b, 0.075, -0.4, -0.95, s * 0.32, 0.26, DARK, segs=5)                        # exhaust stacks
        b.ball(0.1, (s * 0.32, -0.96, 0.26), C, subdiv=0, glow=True)
    # mismatched wings: a long thin one, a short patched one with a barrel strapped on
    flat(b, [(0.18, 0.12), (0.2, -0.26), (1.16, -0.5), (1.2, -0.3)], 0.0, 0.07, A.shade(0.85))
    b.box((0.14, 0.22, 0.08), (1.16, -0.4, 0.05), C, glow=True)
    flat(b, mirror([(0.18, 0.2), (0.2, -0.4), (0.6, -0.46), (0.64, -0.02)]), 0.0, 0.08, A.shade(0.9))
    _patch(b, -0.4, -0.15, 0.06, 0.3, 0.3, 0.3, col=LITE)
    tube(b, 0.15, 0.12, -0.38, 0.62, 0.15, RUST, segs=6)                                 # strapped barrel
    b.box((0.36, 0.06, 0.08), (0.62, -0.06, 0.24), DARK)
    b.box((0.36, 0.06, 0.08), (0.62, -0.26, 0.24), DARK)
    b.box((0.26, 0.24, 0.2), (-0.36, -0.62, 0.12), A.shade(0.75), rot=(0, 0, 0.35))     # tied-on crate
    for s in (1, -1):
        _nozzle(b, s * 0.12, -0.86, 0.0, 0.1)
    body = b.build(root)
    # a loose wing panel that flaps
    lp = Model(f"{kind}_panel", seed=9102)
    lp.box((0.3, 0.2, 0.04), (-0.15, 0, 0), YEL)
    lp.box((0.1, 0.2, 0.05), (-0.08, 0, 0.01), B)
    panel = lp.build(body, loc=(-0.6, -0.28, 0.05))
    osc(panel, clip, "rotation_euler", T, (1, 0.35, 4, 0), (1, 0.12, 7, 0.3))
    # the rattle: stacked loose plates on a tail stalk, shaking side to side
    rt = Model(f"{kind}_rattle", seed=9103)
    limb(rt, (0, 0.05, 0.04), (0, -0.15, 0.08), 0.06, 0.06, DARK, segs=4)
    for k, (y, r) in enumerate(((-0.12, 0.22), (-0.27, 0.2), (-0.41, 0.17), (-0.53, 0.13))):
        rt.ball(r, (0, y, 0.08), YEL if k % 2 == 0 else B, subdiv=1, scale=(1.0, 0.55, 0.6))
    rattle = rt.build(body, loc=(0, -0.8, 0.04))
    osc(rattle, clip, "rotation_euler", T, (2, 0.35, 6, 0), (0, 0.08, 3, 0))
    for k, s in enumerate((1, -1)):
        flame(body, f"{kind}_flame_{k}", (s * 0.12, -0.96, 0.0), 0.09, 0.4, clip, T, phase=k * 0.5, k=5)
    marker(body, kind, "muzzle", (0, 1.05, 0.0))
    # rattly: high-frequency shiver over a slow weave
    osc(body, clip, "location", T, (2, 0.04, 1, 0), (0, 0.02, 5, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.05, 1, 0.25), (1, 0.025, 6, 0), (0, 0.02, 5, 0.3))


# --- Pirate Ace: the flashy rival -------------------------------------------------------------

def pirate_ace():
    kind, clip, root = named("pirate_ace", "dart", "mech", "fly", preview=PAL)
    T = 2.0
    b = Model(f"{kind}_body", seed=9201)
    fuse = [(0, 1.12), (-0.15, 0.72), (-0.21, 0.1), (-0.2, -0.82), (0.2, -0.82), (0.21, 0.1), (0.15, 0.72)]
    hull(b, fuse, -0.12, 0.17, LITE, inset=0.66)
    # shark mouth on the nose: a dark grin, red gums, bone teeth, a mean eye each side
    grin = [(0.16, 0.6), (0.06, 0.74), (0, 0.8), (-0.06, 0.74), (-0.16, 0.6), (-0.12, 0.66), (0, 0.69), (0.12, 0.66)]
    b.slab(grin, 0.12, 0.2, DARK)
    b.slab([(0.13, 0.63), (0, 0.74), (-0.13, 0.63), (0, 0.7)], 0.13, 0.21, C)
    for x in (-0.09, -0.03, 0.03, 0.09):
        b.slab([(x - 0.03, 0.73 - abs(x) * 0.9), (x + 0.03, 0.73 - abs(x) * 0.9), (x, 0.66 - abs(x) * 0.9)],
               0.13, 0.22, BONE)
    for s in (1, -1):
        b.box((0.08, 0.1, 0.06), (s * 0.1, 0.84, 0.15), BONE)
        b.box((0.04, 0.05, 0.07), (s * 0.1, 0.86, 0.16), DARK)
    # racing stripe down the spine
    b.box((0.09, 1.2, 0.04), (0, -0.25, 0.18), C)
    b.ball(0.15, (0, 0.22, 0.2), GLASS, subdiv=1, scale=(0.9, 2.0, 0.75))              # bubble canopy
    b.box((0.06, 0.3, 0.05), (0, 0.3, 0.31), BONE)
    # swept wings with soot leading edges and a red band
    for s in (1, -1):
        w = [(0.19, 0.4), (0.2, -0.3), (1.08, -0.78), (1.12, -0.58)]
        hull(b, w if s > 0 else mirror(w), -0.06, 0.06, LITE, inset=0.9)
        b.plank_line((s * 0.2, 0.42, 0.06), (s * 1.1, -0.56, 0.06), 0.12, 0.06, B)
        band = [(0.62, 0.0), (0.66, -0.4), (0.8, -0.5), (0.78, -0.08)]
        b.slab(band if s > 0 else mirror(band), 0.04, 0.09, C)
        b.box((0.12, 0.24, 0.08), (s * 1.1, -0.68, 0.04), C, glow=True)               # wingtip lights
        # twin tails, canted out, checkered tips
        _fin(b, [(-0.4, 0.1), (-0.84, 0.1), (-0.92, 0.55), (-0.7, 0.55)], s * 0.2, 0.07, B, cant=s * 0.35)
        tube(b, 0.1, 0.0, -0.6, s * 0.3, -0.04, B, segs=6)                              # wing-root intakes
        b.cyl(0.08, 0.04, (s * 0.3, 0.01, -0.04), DARK, segs=6, rot=(-math.pi / 2, 0, 0))
    # kill marks: a row of bone ticks on the left wing root
    for k in range(5):
        b.box((0.07, 0.17, 0.05), (-0.34 - k * 0.1, -0.08 - k * 0.055, 0.08), BONE, rot=(0, 0, 0.5))
    b.box((0.06, 0.3, 0.05), (-0.85, -0.38, 0.08), BONE, rot=(0, 0, -0.9))               # struck through
    _nozzle(b, 0, -0.82, 0.02, 0.15)
    body = b.build(root)
    for k, s in enumerate((1, -1)):  # chequered tail caps (their own little objects: they wag)
        t = Model(f"{kind}_tailcap_{k}", seed=9202 + k)
        t.box((0.08, 0.22, 0.12), (0, 0, 0), YEL)
        t.box((0.09, 0.11, 0.06), (0, -0.05, 0.03), B)
        cap = t.build(body, loc=(s * 0.39, -0.8, 0.52))
        osc(cap, clip, "rotation_euler", T, (2, 0.06, 2, k * 0.5))
    flame(body, f"{kind}_flame", (0, -0.93, 0.02), 0.14, 0.6, clip, T, k=6)
    marker(body, kind, "muzzle", (0, 1.15, 0.0))
    # showing off: lazy rolls side to side
    osc(body, clip, "location", T, (2, 0.05, 1, 0), (0, 0.06, 1, 0.25))
    osc(body, clip, "rotation_euler", T, (1, 0.32, 1, 0), (2, 0.04, 1, 0.25))


# --- Hookjaw: a harpoon gun on a winch, with hooked jaws -------------------------------------

def hookjaw():
    kind, clip, root = named("hookjaw", "gunship", "mech", "hover", preview=PAL)
    T = 2.0
    b = Model(f"{kind}_body", seed=9301)
    hull(b, [(0.62, -1.7), (0.86, -1.1), (0.86, 0.5), (0.6, 0.95), (-0.6, 0.95), (-0.86, 0.5), (-0.86, -1.1),
             (-0.62, -1.7)], -0.38, 0.32, A, inset=0.8)
    # dark skirts along the flanks (a soot rim round the hull)
    for s in (1, -1):
        b.box((0.22, 2.1, 0.3), (s * 0.84, -0.45, -0.08), B)
        b.box((0.08, 0.5, 0.08), (s * 0.94, 0.25, 0.08), C, glow=True)
    # the cable spool's cradle on the back deck
    for x in (-0.55, 0.55):
        b.box((0.16, 0.6, 0.34), (x, -0.85, 0.42), B)
    _patch(b, 0.42, 0.1, 0.33, 0.34, 0.4, 0.25)
    _patch(b, -0.5, -1.35, 0.3, 0.3, 0.26, -0.3, col=LITE)
    _stripes(b, 0, 0.55, 0.3, 1.0, 0.24, n=5)
    b.box((0.5, 0.3, 0.2), (-0.35, 0.25, 0.4), GLASS, rot=(0.3, 0, 0))                  # off-side cab
    b.box((0.4, 0.06, 0.05), (-0.35, 0.36, 0.5), C, glow=True, rot=(0.3, 0, 0))
    # side fan ducts
    for s in (1, -1):
        b.box((0.7, 0.7, 0.18), (s * 1.05, -0.85, -0.02), B)
        b.cyl(0.62, 0.34, (s * 1.45, -0.85, -0.18), A.shade(0.85), segs=10)
        b.cyl(0.5, 0.04, (s * 1.45, -0.85, 0.15), DARK, segs=10)
        b.box((0.14, 0.24, 0.1), (s * 2.05, -0.85, 0.1), C, glow=True)
        _nozzle(b, s * 0.42, -1.7, -0.06, 0.17)
    # harpoon gun riding over the nose: barrel, sleeve, and the barbed head (glowing: that's the hit)
    tube(b, 0.2, 0.2, 1.05, 0, 0.62, B, segs=7)
    tube(b, 0.13, 1.05, 1.95, 0, 0.62, DARK, segs=6)
    b.box((0.36, 0.5, 0.2), (0, 0.55, 0.82), LITE)                                       # breech
    b.box((0.12, 0.3, 0.06), (0, 0.5, 0.94), C, glow=True)
    head = [(0, 2.4), (-0.3, 1.98), (-0.14, 2.02), (-0.16, 1.88), (0.16, 1.88), (0.14, 2.02), (0.3, 1.98)]
    b.slab(head, 0.56, 0.7, C, glow=True)
    b.slab([(0, 2.28), (-0.08, 2.0), (0.08, 2.0)], 0.7, 0.76, BONE)
    limb(b, (0, 1.9, 0.5), (0, 1.25, 0.32), 0.05, 0.05, DARK, segs=4)                    # line to the drum
    body = b.build(root)
    # the winch drum across the nose (turns), wound with cable, hazard-banded flanges
    d = Model(f"{kind}_drum", seed=9302)
    d.cyl(0.36, 1.1, (-0.55, 0, 0), DARK, segs=8, rot=(0, math.pi / 2, 0))
    for x in (-0.62, 0.5):
        d.cyl(0.48, 0.12, (x, 0, 0), B, segs=8, rot=(0, math.pi / 2, 0))
        d.box((0.13, 0.2, 0.98), (x + 0.06, 0, 0), YEL)
    d.box((1.0, 0.16, 0.1), (0, 0, 0.36), LITE)
    drum = d.build(body, loc=(0, 1.22, 0.3))
    spin(drum, clip, T, 1, axis=0)
    # the spare cable spool, turning the other way
    sp = Model(f"{kind}_spool", seed=9305)
    sp.cyl(0.3, 0.9, (-0.45, 0, 0), DARK, segs=8, rot=(0, math.pi / 2, 0))
    for x in (-0.47, 0.37):
        sp.cyl(0.42, 0.1, (x, 0, 0), A.shade(0.8), segs=8, rot=(0, math.pi / 2, 0))
    sp.box((0.86, 0.14, 0.08), (0, 0, 0.3), YEL)
    spool = sp.build(body, loc=(0, -0.85, 0.62))
    spin(spool, clip, T, -1, axis=0)
    # hooked jaws either side of the drum: snap shut and open
    for k, s in enumerate((1, -1)):
        j = Model(f"{kind}_jaw_{k}", seed=9303 + k)
        pts = [(0, 0, 0), (s * 0.18, 0.55, 0), (s * 0.05, 1.05, 0), (-s * 0.28, 1.25, 0)]
        chain(j, pts, [0.22, 0.18, 0.14, 0.06], B, segs=6)
        limb(j, (s * 0.05, 1.05, 0.02), (-s * 0.3, 1.27, 0.02), 0.12, 0.02, LITE, segs=5)  # bright hook
        j.box((0.2, 0.22, 0.08), (s * 0.12, 0.4, 0.17), C, glow=True)
        jaw = j.build(body, loc=(s * 0.78, 0.75, 0.0))
        osc(jaw, clip, "rotation_euler", T, (2, -s * 0.18, 2, 0))
    for k, s in enumerate((1, -1)):
        rotor(body, f"{kind}_fan_{k}", (s * 1.45, -0.85, 0.22), 0.5, 3, clip, T, s * 6, color=B, hub=C)
        flame(body, f"{kind}_flame_{k}", (s * 0.42, -1.82, -0.06), 0.15, 0.5, clip, T, phase=k * 0.4, k=4)
    marker(body, kind, "muzzle", (0, 2.4, 0.62))
    osc(body, clip, "location", T, (2, 0.08, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.04, 1, 0.25), (0, 0.02, 1, 0))


# --- Torpedo Rig: fat torpedoes on the wings, a lock-on dish ---------------------------------

def _torpedo(m, x, y0, y1, z, r):
    tube(m, r, y0, y1, x, z, B, segs=8)
    tube(m, r * 1.04, y1 - 0.5, y1 - 0.35, x, z, YEL, segs=8)                           # warning band
    m.cyl(r, 0.42, (x, y1, z), C, segs=8, r_top=0.03, rot=(-math.pi / 2, 0, 0), glow=True)  # red warhead
    for a in (0, math.pi / 2):
        m.box((r * 3.0, 0.32, 0.06), (x, y0 + 0.12, z), DARK, rot=(0, a, 0))             # cross fins


def torpedo_rig():
    kind, clip, root = named("torpedo_rig", "bomber", "mech", "fly", preview=PAL)
    T = 2.0
    b = Model(f"{kind}_body", seed=9401)
    hull(b, [(0, 1.5), (-0.5, 1.05), (-0.55, -1.3), (-0.35, -1.7), (0.35, -1.7), (0.55, -1.3), (0.5, 1.05)],
         -0.32, 0.3, A, inset=0.7)
    b.box((0.6, 0.4, 0.18), (0, 1.0, 0.28), GLASS, rot=(0.3, 0, 0))
    b.box((0.5, 0.07, 0.05), (0, 1.12, 0.38), C, glow=True, rot=(0.3, 0, 0))
    _stripes(b, 0, -1.05, 0.28, 0.6, 0.28, n=3, rot=math.pi / 2)
    _patch(b, 0.12, -0.55, 0.29, 0.28, 0.34, 0.3)
    # broad straight wings (soot trailing edges, bleached tips)
    for s in (1, -1):
        w = [(0.5, 0.6), (0.5, -0.4), (2.25, -0.3), (2.25, 0.3)]
        hull(b, w if s > 0 else mirror(w), -0.08, 0.1, A, inset=0.94)
        te = [(0.55, -0.15), (0.55, -0.38), (2.2, -0.28), (2.2, -0.08)]
        flat(b, te if s > 0 else mirror(te), 0.1, 0.04, B)
        b.box((0.3, 0.6, 0.06), (s * 2.12, 0.0, 0.12), LITE)
        b.box((0.14, 0.24, 0.08), (s * 2.2, 0.22, 0.12), C, glow=True)
        _fin(b, [(-1.0, 0.25), (-1.6, 0.25), (-1.7, 0.8), (-1.4, 0.8)], s * 0.42, 0.08, B, cant=-s * 0.2)
        _nozzle(b, s * 0.26, -1.7, -0.05, 0.15)
        b.box((0.24, 0.3, 0.14), (s * 0.75, 0.8, 0.0), DARK)                              # rack clamps
    body = b.build(root)
    # the torpedoes: one object a side, swaying on their racks
    for k, s in enumerate((1, -1)):
        tp = Model(f"{kind}_torps_{k}", seed=9402 + k)
        for x in (0.95, 1.7):
            _torpedo(tp, s * x, -0.95, 1.05, 0.0, 0.24)
        torps = tp.build(body, loc=(0, 0, -0.06))
        osc(torps, clip, "location", T, (2, 0.03, 2, k * 0.5))
        osc(torps, clip, "rotation_euler", T, (1, 0.03, 1, k * 0.5))
        for j, x in enumerate((0.95, 1.7)):
            marker(body, kind, "muzzle", (s * x, 1.5, -0.06), k * 2 + j)
    # the lock-on dish on its mast: sweeps, its feed glowing
    mast = Model(f"{kind}_mast", seed=9404)
    mast.cyl(0.18, 0.3, (0, 0, 0), B, segs=6)
    mast.cyl(0.3, 0.08, (0, 0, -0.02), LITE, segs=8)
    mast_o = mast.build(body, loc=(0, 0.15, 0.3))
    dm = Model(f"{kind}_dish", seed=9405)
    dm.cyl(0.12, 0.22, (0, 0, 0), LITE, segs=10, r_top=0.6, rot=(-1.1, 0, 0))
    dm.cyl(0.5, 0.03, (0, 0.21, 0.11), B, segs=10, rot=(-1.1, 0, 0))
    limb(dm, (0, 0.12, 0.06), (0, 0.5, 0.3), 0.04, 0.04, DARK, segs=4)
    dm.ball(0.12, (0, 0.5, 0.3), C, subdiv=1, glow=True)
    dish = dm.build(mast_o, loc=(0, 0, 0.3))
    osc(dish, clip, "rotation_euler", T, (2, 0.7, 1, 0))
    for k, s in enumerate((1, -1)):
        flame(body, f"{kind}_flame_{k}", (s * 0.26, -1.82, -0.05), 0.13, 0.5, clip, T, phase=k * 0.3, k=4)
    osc(body, clip, "location", T, (2, 0.06, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.03, 1, 0.25))


# --- Flakker: a sandbagged flak pit (ground; the whole model turns to aim) --------------------

def flakker():
    kind, clip, root = named("flakker", "turret", "mech", "scan", preview=PAL, ground=1)
    T = 2.0
    b = Model(f"{kind}_base", seed=9501)
    oct8 = [(math.cos(TAU * (k + 0.5) / 8) * 1.12, math.sin(TAU * (k + 0.5) / 8) * 1.12) for k in range(8)]
    hull(b, oct8, 0, 0.18, B, inset=0.92)
    apron = [(math.cos(TAU * (k + 0.5) / 8) * 1.3, math.sin(TAU * (k + 0.5) / 8) * 1.3) for k in range(8)]
    b.slab(apron, 0, 0.06, B)                                                            # scorched trench
    # two rows of sandbags round the pit, a gap at the back for the crew
    n = 14
    for row, (rad, z) in enumerate(((1.06, 0.12), (1.0, 0.32))):
        for k in range(n):
            a = TAU * (k + row * 0.5) / n + math.pi / 2
            if abs(math.atan2(math.sin(a + math.pi / 2), math.cos(a + math.pi / 2))) < 0.35:
                continue
            col = (LITE if (k + row) % 3 else A.shade(1.05)) if row else (A.shade(0.8) if k % 2 else A.shade(0.68))
            b.box((0.46, 0.28, 0.22), (math.cos(a) * rad, math.sin(a) * rad, z), col,
                  rot=(b.rng.uniform(-0.08, 0.08), 0, a + math.pi / 2 + b.rng.uniform(-0.12, 0.12)), taper=0.78)
    # ammo crates and a shell rack inside the ring
    for s in (1, -1):
        b.box((0.36, 0.3, 0.26), (s * 0.62, -0.5, 0.3), A.shade(0.75), rot=(0, 0, s * 0.3))
        b.box((0.3, 0.06, 0.06), (s * 0.62, -0.5, 0.45), YEL, rot=(0, 0, s * 0.3))
        for j in range(3):
            b.cyl(0.06, 0.16, (s * 0.62 + (j - 1) * 0.1, -0.24, 0.44), C, segs=5, glow=True)
    # turntable and the gun carriage
    b.cyl(0.62, 0.14, (0, 0, 0.18), A.shade(0.8), segs=8)
    _stripes(b, 0, -0.62, 0.42, 0.7, 0.2, n=4)
    b.box((1.0, 0.7, 0.36), (0, -0.05, 0.42), A)                                         # carriage
    b.box((0.7, 0.4, 0.08), (0, -0.2, 0.64), RUST)
    for s in (1, -1):  # armour cheeks and ammo drums
        b.box((0.2, 0.9, 0.56), (s * 0.58, 0.05, 0.52), B, taper=0.85)
        b.cyl(0.22, 0.2, (s * 0.8, -0.2, 0.62), DARK, segs=7, rot=(0, math.pi / 2, 0))
        b.cyl(0.1, 0.22, (s * 0.8, -0.2, 0.62), C, segs=6, rot=(0, math.pi / 2, 0), glow=True)
    # front shield plate, hazard-striped
    b.box((1.1, 0.12, 0.45), (0, 0.5, 0.48), B, rot=(-0.35, 0, 0))
    _stripes(b, 0, 0.47, 0.71, 1.0, 0.16, n=5)
    base = b.build(root)
    # quad barrels, elevated, in two recoiling pairs
    el = 0.55
    dy, dz = math.cos(el), math.sin(el)
    for k, (zo, xs) in enumerate(((0.18, 0.15), (0.0, 0.32))):
        g = Model(f"{kind}_guns_{k}", seed=9502 + k)
        for s in (1, -1):
            x = s * (0.14 if k == 0 else 0.4)
            g.cyl(0.16, 0.55, (x, 0, 0), B, segs=6, rot=(-(math.pi / 2 - el), 0, 0))
            g.cyl(0.11, 1.3, (x, 0, 0), DARK, segs=6, rot=(-(math.pi / 2 - el), 0, 0))
            g.cyl(0.15, 0.18, (x, 1.18 * dy, 1.18 * dz), C, segs=6, rot=(-(math.pi / 2 - el), 0, 0), glow=True)
        guns = g.build(base, loc=(0, 0.2, 0.72 + zo))

        def recoil(u, k=k):
            ph = (u * 2 + k * 0.5) % 1.0
            r = -0.16 * math.exp(-ph * 9) if ph < 0.6 else 0.0
            return (0.0, r * dy, r * dz)
        sample(guns, clip, "location", T, recoil, step=1)
        for j, s in enumerate((1, -1)):
            x = s * (0.14 if k == 0 else 0.4)
            marker(base, kind, "muzzle", (x, 0.2 + 1.36 * dy, 0.72 + zo + 1.36 * dz), k * 2 + j)
    # a little rangefinder dish at the back, spinning
    r = Model(f"{kind}_radar", seed=9504)
    r.box((0.5, 0.1, 0.28), (0, 0, 0.14), LITE, rot=(0.3, 0, 0))
    r.box((0.12, 0.06, 0.12), (0, 0.06, 0.16), C, glow=True)
    radar = r.build(base, loc=(0, -0.85, 0.5))
    spin(radar, clip, T, 1)


# --- Loot Runner: a glowing chest between two oversized engines -------------------------------

def loot_runner():
    kind, clip, root = named("loot_runner", "bomber", "mech", "fly", preview=PAL)
    T = 1.0
    b = Model(f"{kind}_body", seed=9601)
    # spine frame and a little cab up front
    hull(b, [(0.5, -1.45), (0.55, 0.8), (0.3, 1.25), (-0.3, 1.25), (-0.55, 0.8), (-0.5, -1.45)], -0.3, 0.12, B,
         inset=0.85)
    hull(b, [(0.32, 0.75), (0.3, 1.2), (0, 1.55), (-0.3, 1.2), (-0.32, 0.75)], -0.2, 0.28, A, inset=0.7)
    b.box((0.4, 0.26, 0.14), (0, 1.12, 0.3), GLASS, rot=(0.35, 0, 0))
    b.box((0.36, 0.06, 0.05), (0, 1.2, 0.38), C, glow=True, rot=(0.35, 0, 0))
    b.box((0.5, 0.36, 0.14), (0, -1.3, 0.1), DARK)                                       # mine chute
    _stripes(b, 0, -1.3, 0.17, 0.5, 0.2, n=3)
    # outriggers to the oversized engines
    for s in (1, -1):
        w = [(0.45, 0.2), (0.45, -0.75), (1.4, -0.6), (1.4, 0.0)]
        hull(b, w if s > 0 else mirror(w), -0.1, 0.08, A.shade(0.85), inset=0.9)
        x = s * 1.62
        tube(b, 0.52, -1.35, 0.55, x, 0.0, A, segs=8, r_end=0.46)
        tube(b, 0.47, 0.55, 0.9, x, 0.0, A.shade(0.8), segs=8, r_end=0.4)
        b.cyl(0.36, 0.06, (x, 0.9, 0.0), DARK, segs=8, rot=(-math.pi / 2, 0, 0))         # intake
        tube(b, 0.55, -0.2, -0.45, x, 0.0, B, segs=8)                                    # band
        b.box((0.4, 0.7, 0.08), (x, 0.15, 0.48), LITE)                                   # bleached top plate
        _patch(b, x + s * 0.12, -0.85, 0.44, 0.26, 0.3, 0.3)
        _nozzle(b, x, -1.38, 0.0, 0.42)
        _fin(b, [(-0.7, 0.4), (-1.3, 0.4), (-1.35, 0.85), (-1.05, 0.85)], x, 0.08, B, cant=-s * 0.25)
    body = b.build(root)
    # the loot: an iron-banded chest, lid cracked open, glowing hoard heaped out of it; it jostles
    ch = Model(f"{kind}_chest", seed=9602)
    ch.box((1.0, 1.15, 0.5), (0, 0, 0.25), A.shade(0.75))
    for y in (-0.32, 0.32):
        ch.box((1.06, 0.16, 0.54), (0, y, 0.25), B)
        ch.box((0.16, 0.18, 0.16), (0, y, 0.55), YEL)                                    # buckles
    ch.box((0.9, 1.0, 0.08), (0, 0, 0.5), C, glow=True)                                  # the glow inside
    for k in range(9):
        a = TAU * k / 9 + 0.3
        rr = 0.18 + 0.2 * (k % 3) / 2
        ch.ball(0.14 + 0.04 * (k % 2), (math.cos(a) * rr, math.sin(a) * rr * 1.2, 0.58 + 0.06 * (k % 3)),
                C if k % 3 == 0 else YEL, subdiv=0, glow=(k % 3 == 0), jitter=0.02)
    ch.ball(0.2, (0.05, 0.05, 0.72), YEL, subdiv=0)
    ch.box((1.0, 0.3, 0.12), (0, -0.62, 0.86), A.shade(0.75), rot=(-1.0, 0, 0))          # flung-back lid
    chest = ch.build(body, loc=(0, -0.3, 0.1))
    osc(chest, clip, "rotation_euler", T, (1, 0.05, 2, 0), (0, 0.04, 3, 0.2))
    osc(chest, clip, "location", T, (2, 0.03, 4, 0))
    for k, s in enumerate((1, -1)):
        flame(body, f"{kind}_flame_{k}", (s * 1.62, -1.5, 0.0), 0.38, 1.0, clip, T, phase=k * 0.35, k=4)
    marker(body, kind, "muzzle", (0, -1.4, -0.1))
    # skittish: a quick jink-ready sway
    osc(body, clip, "location", T, (2, 0.06, 1, 0), (0, 0.05, 2, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.08, 1, 0.25), (2, 0.03, 2, 0))


# --- Iron Crate: a flying riveted strongbox ---------------------------------------------------

def iron_crate():
    kind, clip, root = named("iron_crate", "bomber", "mech", "fly", preview=PAL)
    T = 2.0
    b = Model(f"{kind}_body", seed=9701)
    h = 1.36
    b.box((2.7, 2.7, 1.1), (0, 0, 0), A.shade(0.85))
    b.box((2.6, 2.6, 0.1), (0, 0, 0.58), A)                                              # lid
    for q, (sx, sy) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):                  # lid quarters
        b.box((1.0, 1.0, 0.06), (sx * 0.72, sy * 0.72, 0.64), LITE if q % 2 == 0 else A)
    _patch(b, 0.6, -0.85, 0.68, 0.5, 0.42, 0.25)
    _patch(b, -0.9, 0.5, 0.68, 0.34, 0.4, -0.4)
    # iron edge bands and a cross strap over the lid
    for s in (1, -1):
        b.box((2.86, 0.24, 1.24), (0, s * h, 0), B)
        b.box((0.24, 2.86, 1.24), (s * h, 0, 0), B)
    b.box((0.4, 2.8, 0.14), (0, 0, 0.66), B)
    b.box((2.8, 0.4, 0.14), (0, 0, 0.66), B)
    for k in range(-3, 4):  # rivets along the straps and rims (bleached studs on soot iron)
        if k == 0:
            continue
        t = k * 0.38
        for at in ((t, 0), (0, t), (t, h), (t, -h), (h, t), (-h, t)):
            b.box((0.13, 0.13, 0.06), (at[0], at[1], 0.74 if abs(at[0]) < 1 and abs(at[1]) < 1 else 0.64), LITE)
    # hazard chevrons on the corners
    for k in range(4):
        a = TAU * k / 4 + math.pi / 4
        _stripes(b, math.cos(a) * 1.02, math.sin(a) * 1.02, 0.68, 0.56, 0.3, n=2, rot=a + math.pi / 2)
    # the glowing seal line round the lid seam
    for s in (1, -1):
        b.box((2.9, 0.05, 0.1), (0, s * 1.48, 0.3), C, glow=True)
        b.box((0.05, 2.9, 0.1), (s * 1.48, 0, 0.3), C, glow=True)
    # corner thruster pods
    for k in range(4):
        a = TAU * k / 4 + math.pi / 4
        x, y = math.cos(a) * 2.25, math.sin(a) * 2.25
        b.box((0.8, 0.32, 0.3), (math.cos(a) * 1.8, math.sin(a) * 1.8, 0.1), B, rot=(0, 0, a))
        b.cyl(0.38, 0.6, (x, y, -0.3), A, segs=7)
        b.cyl(0.4, 0.12, (x, y, 0.1), B, segs=7)
        b.cyl(0.24, 0.06, (x, y, 0.3), DARK, segs=7)
    body = b.build(root)
    for k in range(4):  # thruster glows, flickering
        a = TAU * k / 4 + math.pi / 4
        g = Model(f"{kind}_jet_{k}", seed=9702 + k)
        g.cyl(0.2, 0.08, (0, 0, 0), C, segs=7, glow=True)
        g.cyl(0.26, 0.5, (0, 0, -0.35), C, segs=7, r_top=0.0, rot=(math.pi, 0, 0), glow=True)
        jet = g.build(body, loc=(math.cos(a) * 2.25, math.sin(a) * 2.25, 0.34))
        pulse(jet, clip, T, 0.2, harm=4, phase=k * 0.25)
    # the padlock where the straps cross: iron body, shackle, glowing seal
    p = Model(f"{kind}_lock", seed=9706)
    p.box((0.72, 0.52, 0.36), (0, 0, 0.18), DARK)
    p.box((0.62, 0.42, 0.06), (0, 0, 0.37), YEL)
    for s in (1, -1):
        limb(p, (s * 0.22, 0.26, 0.2), (s * 0.22, 0.5, 0.32), 0.07, 0.07, B, segs=5)
    limb(p, (-0.22, 0.5, 0.32), (0.22, 0.5, 0.32), 0.07, 0.07, B, segs=5)
    p.cyl(0.16, 0.06, (0, -0.02, 0.4), C, segs=8, glow=True)
    lock = p.build(body, loc=(0, -0.05, 0.72))
    pulse(lock, clip, T, 0.06, harm=2)
    osc(body, clip, "location", T, (2, 0.1, 1, 0))
    osc(body, clip, "rotation_euler", T, (0, 0.04, 1, 0), (1, 0.04, 1, 0.25))


def build():
    ramjack()
    rattler()
    pirate_ace()
    hookjaw()
    torpedo_rig()
    flakker()
    loot_runner()
    iron_crate()
