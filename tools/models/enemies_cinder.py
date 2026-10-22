"""Cinder Orchard's roster: Vantorr Security, the company's own fleet. One house style so the six
read as one corporation: clean machined hulls, the Vantorr chevron (a Λ) stamped on every top,
twin livery stripes, a glowing visor bar across the front and paired running lights.
Each still has its own outline: the drone *is* the chevron, the sentry a pole camera on a pad, the
interceptor a forward-swept hammerhead, the tender a long rack of docked drones, the cutter rig a
fork with a spinning cutting ring, the crop duster a straight-winged twin-boom sprayer.
Seeds 8000-8999.
"""
from __future__ import annotations

import math

from kit import Model
from creatures_util import TAU, flat, limb, osc, sample
from enemies_lib import A, B, C, DARK, GLASS, both, fin, flame, hull, marker, mirror, named, pulse, spin, tube

PAL = {
    "drone": ("#e8e8e0", "#d08a3a", "#4ae8ff"),
    "sentry": ("#d08a3a", "#3a3a3a", "#ff3a3a"),
    "interceptor": ("#e8e8e0", "#3a3a4a", "#ff3a3a"),
    "tender": ("#e8e8e0", "#d08a3a", "#4ae8ff"),
    "cutter": ("#d08a3a", "#2a2a2a", "#ff3a3a"),
    "duster": ("#a8b84a", "#3a3a3a", "#b04aff"),
}


# --- house style ----------------------------------------------------------------------------

def chevron(m: Model, x, y, z, w, h, t, color, thick=0.05, glow=False):
    """The Vantorr mark: a Λ pointing +y, w wide, h tall, arms t thick, centred on (x, y)."""
    right = [(0, h / 2), (0, h / 2 - t * 1.5), (w / 2 - t, -h / 2), (w / 2, -h / 2)]
    for pts in (right, mirror(right)):
        flat(m, [(x + px, y + py) for px, py in pts], z, thick, color, glow=glow)


def stripes(m: Model, x, y, z, w, color, gap=0.16, t=0.09, rot=0.0):
    """Twin livery stripes across a top (along x), centred on (x, y)."""
    for d in (-gap / 2, gap / 2):
        m.box((w, t, 0.04), (x - math.sin(rot) * d, y + math.cos(rot) * d, z), color, rot=(0, 0, rot))


def visor(m: Model, y, z, w, tilt=0.3):
    """The glowing visor bar across the front."""
    m.box((w, 0.12, 0.08), (0, y, z), C, rot=(tilt, 0, 0), glow=True)


# --- Security Drone: the chevron itself, a flying company logo with one big eye --------------

def security_drone():
    kind, clip, root = named("security_drone", "dart", "mech", "patrol", preview=PAL["drone"])
    T = 2.0
    b = Model(f"{kind}_body", seed=8001)
    arm = [(0, 1.0), (0, -0.25), (0.9, -1.12), (1.12, -0.95)]
    for pts in both(arm):
        b.slab(pts, -0.16, 0.06, B.shade(0.55))                                      # dark belly rim
        hull(b, [(px * 0.97, py * 0.97 + 0.02) for px, py in pts], 0.06, 0.2, A, inset=0.8)
    for s in (1, -1):
        # orange livery stripe down each arm, a white highlight on the leading edge
        flat(b, [(s * 0.2, 0.55), (s * 0.32, 0.38), (s * 0.98, -0.82), (s * 0.86, -0.98)][::s], 0.22, 0.04, B)
        tube(b, 0.13, -0.72, -1.15, s * 0.98, 0.0, DARK, segs=6, r_end=0.11)          # tip thrusters
        b.cyl(0.11, 0.05, (s * 0.98, -1.16, 0.0), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
        b.box((0.14, 0.22, 0.08), (s * 1.02, -0.86, 0.17), C, glow=True)              # running lights
    # the eye pod: a white egg on the apex with a dark cowl
    b.ball(0.32, (0, 0.45, 0.16), A.shade(1.1), subdiv=1, scale=(0.95, 1.35, 0.7))
    b.box((0.36, 0.2, 0.1), (0, 0.72, 0.3), DARK, taper=0.7)                          # eye cowl
    chevron(b, 0, 0.02, 0.24, 0.62, 0.42, 0.12, B)                                   # the mark
    body = b.build(root)
    e = Model(f"{kind}_eye")
    e.ball(0.2, (0, 0.0, 0), DARK, subdiv=1, scale=(1.2, 0.9, 0.9))
    e.ball(0.16, (0, 0.12, 0.02), C, subdiv=1, glow=True)
    e.box((0.42, 0.08, 0.08), (0, 0.05, 0.16), C, glow=True)
    eye = e.build(body, loc=(0, 0.88, 0.2))
    osc(eye, clip, "rotation_euler", T, (2, 0.45, 1, 0))                             # the eye sweeps
    for k, s in enumerate((1, -1)):
        flame(body, f"{kind}_flame_{k}", (s * 0.98, -1.18, 0.0), 0.1, 0.4, clip, T, phase=k * 0.5, k=6)
    marker(body, kind, "muzzle", (0, 1.15, 0.2))
    osc(body, clip, "location", T, (2, 0.06, 1, 0), (0, 0.05, 1, 0.25))
    osc(body, clip, "rotation_euler", T, (1, 0.1, 1, 0.25))


# --- Orchard Sentry: a company pole camera on a fenced pad, a gun slung under the lens -------

def orchard_sentry():
    kind, clip, root = named("orchard_sentry", "turret", "mech", "scan", preview=PAL["sentry"], ground=1)
    T = 4.0
    b = Model(f"{kind}_base", seed=8010)
    sq = [(1.1, 0.7), (0.7, 1.1), (-0.7, 1.1), (-1.1, 0.7), (-1.1, -0.7), (-0.7, -1.1), (0.7, -1.1), (1.1, -0.7)]
    hull(b, sq, 0, 0.3, B, inset=0.92)                                              # dark pad
    hull(b, [(x * 0.82, y * 0.82) for x, y in sq], 0.3, 0.4, A, inset=0.95)           # orange deck
    for k in range(4):                                                               # dark hazard chevrons on the deck
        a = TAU * k / 4
        cx, cy = math.cos(a) * 0.62, math.sin(a) * 0.62
        b.box((0.42, 0.12, 0.04), (cx, cy, 0.42), B, rot=(0, 0, a + math.pi / 2))
    for sx in (1, -1):
        for sy in (1, -1):                                                           # corner bollards with red caps
            b.cyl(0.14, 0.55, (sx * 0.86, sy * 0.86, 0.3), A.shade(0.6), segs=6)
            b.cyl(0.15, 0.12, (sx * 0.86, sy * 0.86, 0.85), C, segs=6, glow=True)
    b.cyl(0.36, 0.25, (0, 0, 0.4), B, segs=8)                                        # mast collar
    b.cyl(0.18, 0.75, (0, 0, 0.6), A.shade(0.75), segs=6)                            # the pole
    b.box((0.5, 0.5, 0.3), (-0.5, -0.45, 0.55), B.shade(1.4), taper=0.8)             # junction box
    b.box((0.3, 0.06, 0.04), (-0.5, -0.19, 0.6), C, glow=True)
    base = b.build(root)
    h = Model(f"{kind}_head", seed=8011)
    # camera housing: a long orange box with a sun hood, the red lens up front
    h.box((0.62, 1.2, 0.46), (0, 0.1, 0.3), A, taper=0.85)
    h.box((0.74, 0.95, 0.07), (0, 0.22, 0.56), A.shade(1.25))                         # sun hood
    stripes(h, 0, -0.12, 0.61, 0.74, B, gap=0.18, t=0.1)
    chevron(h, 0, 0.38, 0.61, 0.46, 0.34, 0.1, B)
    h.box((0.56, 0.3, 0.4), (0, -0.6, 0.28), B)                                       # back pack
    tube(h, 0.27, 0.62, 0.8, 0, 0.3, DARK, segs=8)                                    # lens barrel
    h.ball(0.23, (0, 0.82, 0.3), C, subdiv=1, scale=(1, 0.7, 1), glow=True)          # the red eye
    h.box((0.3, 0.5, 0.25), (0, 0.0, 0.0), B)                                         # yoke
    for s in (1, -1):                                                                # gun pods either side
        h.box((0.24, 0.75, 0.28), (s * 0.45, 0.1, 0.2), B)
        h.box((0.1, 0.4, 0.05), (s * 0.45, 0.05, 0.35), A.shade(0.7))
        tube(h, 0.11, 0.45, 1.35, s * 0.45, 0.2, DARK, segs=6)
        tube(h, 0.15, 0.45, 0.8, s * 0.45, 0.2, A.shade(0.7), segs=6)                # recoil shroud
        h.box((0.24, 0.14, 0.24), (s * 0.45, 1.3, 0.2), C, glow=True)
    head = h.build(base, loc=(0, 0, 1.35), part="head")
    head.name = f"{kind}_head"
    osc(head, clip, "rotation_euler", T, (2, 0.6, 1, 0), (0, 0.06, 2, 0))           # slow suspicious sweep
    l = Model(f"{kind}_lamp")
    l.box((0.5, 0.1, 0.06), (0, 0, 0), C, glow=True)
    lamp = l.build(head, loc=(0, -0.71, 0.4))
    pulse(lamp, clip, T, 0.5, harm=4, axes=(0, 2))
    for k, s in enumerate((1, -1)):
        marker(head, kind, "muzzle", (s * 0.45, 1.42, 0.2), k)


# --- Vantorr Interceptor: forward-swept hammerhead with buried lift fans and long cannons ----

def vantorr_interceptor():
    kind, clip, root = named("vantorr_interceptor", "gunship", "mech", "hover", preview=PAL["interceptor"])
    T = 2.0
    b = Model(f"{kind}_body", seed=8020)
    fus = [(0, 1.7), (-0.42, 1.2), (-0.5, -0.9), (-0.38, -1.6), (0.38, -1.6), (0.5, -0.9), (0.42, 1.2)]
    b.slab(fus, -0.32, -0.08, B)
    hull(b, fus, -0.08, 0.3, A, inset=0.72)
    b.box((0.5, 0.75, 0.22), (0, 0.85, 0.3), GLASS, taper=0.75)                      # canopy
    visor(b, 1.25, 0.25, 0.6)
    b.box((0.24, 1.0, 0.1), (0, -0.55, 0.32), B)                                       # dorsal spine
    chevron(b, 0, 0.15, 0.33, 0.6, 0.45, 0.11, B)
    for pts in both([(0.4, 0.6), (0.45, -0.5), (1.7, 0.15), (1.95, 0.75), (1.75, 1.05)]):
        b.slab(pts, -0.2, -0.04, B)                                                  # wing, dark under
        hull(b, pts, -0.04, 0.1, A, inset=0.88)
    for s in (1, -1):
        stripes(b, s * 1.15, 0.38, 0.13, 0.9, B, gap=0.17, t=0.09, rot=s * 0.45)
        # the buried lift fan in each wing root
        b.cyl(0.45, 0.06, (s * 0.95, -0.05, 0.08), DARK, segs=10)
        b.cyl(0.52, 0.1, (s * 0.95, -0.05, 0.04), B, segs=10)
        # wingtip gun pods, cannons reaching forward: the hammerhead
        tube(b, 0.22, -0.2, 1.4, s * 1.85, 0.0, A, segs=7, r_end=0.18)
        tube(b, 0.24, -0.2, 0.25, s * 1.85, 0.0, B, segs=7)
        tube(b, 0.09, 1.4, 2.05, s * 1.85, 0.02, DARK, segs=5)
        b.box((0.3, 0.12, 0.12), (s * 1.85, 2.05, 0.02), C, glow=True)
        b.box((0.12, 0.45, 0.07), (s * 1.85, 0.6, 0.22), C, glow=True)                # running light
        fin(b, [(-0.9, 0.2), (-1.55, 0.2), (-1.7, 0.75), (-1.35, 0.75)], s * 0.3, 0.07, B, )
        tube(b, 0.17, -1.4, -1.7, s * 0.22, -0.08, DARK, segs=6)
        b.cyl(0.14, 0.05, (s * 0.22, -1.71, -0.08), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    body = b.build(root)
    for k, s in enumerate((1, -1)):
        f = Model(f"{kind}_fan_{k}")
        for j in range(5):
            a = TAU * j / 5
            f.box((0.4, 0.13, 0.03), (math.cos(a) * 0.2, math.sin(a) * 0.2, 0), A.shade(0.8), rot=(0.25, 0, a))
        f.cyl(0.12, 0.06, (0, 0, 0), C, segs=6, glow=True)
        fan = f.build(body, loc=(s * 0.95, -0.05, 0.12))
        spin(fan, clip, T, s * 8)
        flame(body, f"{kind}_flame_{k}", (s * 0.22, -1.73, -0.08), 0.13, 0.45, clip, T, phase=k * 0.4, k=4)
        marker(body, kind, "muzzle", (s * 1.85, 2.15, 0.02), k)
    osc(body, clip, "location", T, (2, 0.08, 1, 0), (0, 0.06, 1, 0.25))
    osc(body, clip, "rotation_euler", T, (1, 0.06, 1, 0.25), (0, 0.02, 1, 0))


# --- Drone Tender: a long white spine racked with docked security drones ---------------------

def _mini_drone(m: Model, x, y, z, s=0.55):
    arm = [(0, 0.9), (0, -0.3), (0.85, -1.05), (1.05, -0.9)]
    for pts in both(arm):
        m.slab([(x + px * s, y + py * s) for px, py in pts], z, z + 0.14, A)
    m.ball(0.16, (x, y + 0.45 * s, z + 0.16), C, subdiv=0, glow=True)


def drone_tender():
    kind, clip, root = named("drone_tender", "carrier", "mech", "patrol", preview=PAL["tender"])
    T = 4.0
    b = Model(f"{kind}_body", seed=8030)
    spine = [(0, 3.5), (-0.7, 3.0), (-0.95, 2.0), (-0.95, -2.9), (-0.7, -3.5), (0.7, -3.5), (0.95, -2.9), (0.95, 2.0), (0.7, 3.0)]
    b.slab(spine, -0.55, -0.15, B.shade(0.5))
    hull(b, spine, -0.15, 0.45, A, inset=0.85)
    # bridge up front, the visor across it
    b.box((1.1, 0.9, 0.35), (0, 2.45, 0.55), A.shade(1.1), taper=0.8)
    b.box((0.9, 0.3, 0.2), (0, 2.9, 0.55), GLASS, rot=(0.3, 0, 0))
    visor(b, 3.0, 0.62, 0.8)
    chevron(b, 0, 1.55, 0.47, 1.0, 0.7, 0.17, B)
    for s in (1, -1):                                                                # orange pinstripes down the deck
        b.box((0.1, 4.6, 0.04), (s * 0.72, -0.4, 0.46), B)
    chevron(b, 0, -2.6, 0.47, 0.8, 0.5, 0.14, B)
    # the launch well amidships: a dark hatch ringed with lights
    b.box((0.95, 1.5, 0.08), (0, -0.55, 0.45), DARK)
    for s in (1, -1):
        b.box((0.12, 1.5, 0.12), (s * 0.55, -0.55, 0.48), B)
    # racks: three cradles a side, booms reaching out, a drone docked on each
    for s in (1, -1):
        for k, y in enumerate((1.25, -0.25, -1.75)):
            b.box((1.5, 0.28, 0.16), (s * 1.6, y, 0.05), B.shade(0.8))                  # boom
            b.box((0.24, 0.9, 0.3), (s * 2.3, y - 0.05, 0.05), B)                       # clamp
            b.box((0.1, 0.16, 0.08), (s * 2.45, y + 0.4, 0.22), C, glow=True)
        tube(b, 0.36, -2.4, -3.3, s * 0.5, -0.1, B.shade(0.6), segs=7)
        b.cyl(0.3, 0.05, (s * 0.5, -3.31, -0.1), C, segs=7, rot=(math.pi / 2, 0, 0), glow=True)
        fin(b, [(-2.3, 0.4), (-3.3, 0.4), (-3.45, 1.0), (-3.0, 1.0)], s * 0.62, 0.08, B)
    body = b.build(root)
    # the docked drones bob in their clamps
    n = 0
    for s in (1, -1):
        for k, y in enumerate((1.25, -0.25, -1.75)):
            d = Model(f"{kind}_drone_{n}")
            _mini_drone(d, 0, 0, 0)
            obj = d.build(body, loc=(s * 1.75, y + 0.05, 0.15))
            osc(obj, clip, "location", T, (2, 0.05, 2, n / 6))
            n += 1
    # hatch lights chase towards the stern
    for k in range(4):
        for s in (1, -1):
            l = Model(f"{kind}_light_{k}{'l' if s < 0 else 'r'}")
            l.box((0.14, 0.2, 0.1), (0, 0, 0), C, glow=True)
            obj = l.build(body, loc=(s * 0.55, 0.05 - k * 0.4, 0.58))
            sample(obj, clip, "scale", T, lambda u, k=k: (-0.6,) * 3 if ((u * 4 - k / 4) % 1.0) > 0.3 else (0.4,) * 3)
    r = Model(f"{kind}_dish")
    r.box((0.9, 0.12, 0.3), (0, 0, 0.15), A, rot=(0.35, 0, 0))
    r.box((0.2, 0.1, 0.1), (0, 0.08, 0.25), C, glow=True)
    r.cyl(0.06, 0.2, (0, 0, -0.1), DARK, segs=4)
    dish = r.build(body, loc=(0, 2.35, 0.9))
    spin(dish, clip, T, 1)
    for k, s in enumerate((1, -1)):
        flame(body, f"{kind}_flame_{k}", (s * 0.5, -3.33, -0.1), 0.3, 0.6, clip, T, phase=k * 0.5, k=8)
        marker(body, kind, "muzzle", (s * 0.6, 3.2, 0.3), k)
    marker(body, kind, "bay", (0, -0.55, 0.55))
    osc(body, clip, "location", T, (2, 0.06, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.015, 1, 0.25))


# --- Cutter Rig: an orchard felling rig, a heavy fork holding a spinning cutting ring --------

def cutter_rig():
    kind, clip, root = named("cutter_rig", "lancer", "mech", "charge", preview=PAL["cutter"])
    T = 1.0
    b = Model(f"{kind}_body", seed=8040)
    core = [(-0.55, 0.2), (-0.7, -0.6), (-0.5, -1.4), (0.5, -1.4), (0.7, -0.6), (0.55, 0.2)]
    b.slab(core, -0.3, -0.05, B)
    hull(b, core, -0.05, 0.32, A, inset=0.75)
    b.box((0.5, 0.45, 0.18), (0, -0.05, 0.38), GLASS, taper=0.8)
    stripes(b, 0, -0.75, 0.34, 0.8, B, gap=0.2, t=0.1)
    chevron(b, 0, -1.1, 0.3, 0.55, 0.3, 0.1, B)
    for s in (1, -1):
        # the fork prongs: dark armoured arms with orange hazard chevrons
        prong = [(s * 0.35, 0.1), (s * 0.7, -0.3), (s * 0.95, 0.7), (s * 0.75, 1.35), (s * 0.5, 1.3)]
        prong = prong if s > 0 else prong[::-1]
        hull(b, prong, -0.18, 0.2, B, inset=0.8)
        for k in range(2):
            b.box((0.3, 0.1, 0.04), (s * 0.73, 0.35 + k * 0.35, 0.22), A, rot=(0, 0, s * 0.5))
        b.box((0.16, 0.3, 0.1), (s * 0.68, 1.28, 0.1), C, glow=True)                   # prong tip lights
        # radiator fins aft, red-hot slits
        b.box((0.32, 0.8, 0.14), (s * 0.75, -0.9, 0.05), B)
        for k in range(3):
            b.box((0.3, 0.07, 0.04), (s * 0.75, -0.65 - k * 0.22, 0.13), C, glow=True)
        tube(b, 0.16, -1.3, -1.6, s * 0.28, -0.05, DARK, segs=6)
        b.cyl(0.13, 0.05, (s * 0.28, -1.61, -0.05), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    body = b.build(root)
    # the cutting disc: a flat saw spinning between the prongs, teeth red-hot, the beam lens at its hub
    ring = Model(f"{kind}_saw")
    ring.cyl(0.5, 0.08, (0, 0, -0.04), B.shade(2.2), segs=8)
    ring.cyl(0.3, 0.1, (0, 0, -0.03), DARK, segs=8)
    for j in range(8):
        a = TAU * j / 8
        ring.prism([(0, -0.05), (0.2, -0.05), (0.0, 0.05)], 0.1, (math.cos(a) * 0.48, math.sin(a) * 0.48, 0.0), C,
                   rot=(math.pi / 2, 0, a + math.pi / 2), glow=True)
    for j in range(3):
        a = TAU * j / 3
        ring.box((0.38, 0.08, 0.04), (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.05), A, rot=(0, 0, a))
    ring_obj = ring.build(body, loc=(0, 0.85, 0.05))
    spin(ring_obj, clip, T, -3)
    tip = Model(f"{kind}_core")
    tip.ball(0.17, (0, 0, 0), C, subdiv=1, glow=True)
    tip_obj = tip.build(body, loc=(0, 0.85, 0.16))
    pulse(tip_obj, clip, T, 0.3, harm=2)
    marker(body, kind, "emitter", (0, 1.4, 0.1))
    osc(body, clip, "location", T, (2, 0.04, 1, 0))


# --- Crop Duster: a straight-winged twin-boom sprayer with a violet tank and a spray bar ----

def crop_duster():
    kind, clip, root = named("crop_duster", "bomber", "mech", "fly", preview=PAL["duster"])
    T = 2.0
    b = Model(f"{kind}_body", seed=8050)
    fus = [(0, 1.45), (-0.32, 1.1), (-0.38, -0.3), (-0.22, -0.9), (0.22, -0.9), (0.38, -0.3), (0.32, 1.1)]
    b.slab(fus, -0.3, -0.05, B)
    hull(b, fus, -0.05, 0.25, A, inset=0.7)
    b.ball(0.2, (0, 0.65, 0.28), GLASS, subdiv=1, scale=(1, 1.4, 0.7))
    b.box((0.5, 0.42, 0.2), (0, 1.15, 0.12), B, taper=0.75)                         # engine cowl, dark
    b.box((0.08, 0.3, 0.04), (0, 1.15, 0.23), A.shade(1.2))
    # the wing: long and straight, dark leading edge, lighter top, livery stripes near the tips
    b.slab([(-2.3, -0.2), (2.3, -0.2), (2.3, 0.6), (-2.3, 0.6)], -0.1, 0.0, B)
    hull(b, [(-2.2, -0.15), (2.2, -0.15), (2.2, 0.5), (-2.2, 0.5)], 0.0, 0.1, A.shade(1.15), inset=0.97)
    b.box((4.5, 0.16, 0.08), (0, 0.55, 0.05), B)                                     # leading edge
    for s in (1, -1):
        stripes(b, s * 1.85, 0.18, 0.12, 0.08, B, gap=0.0, t=0.6, rot=0)
        b.box((0.14, 0.62, 0.06), (s * 1.7, 0.18, 0.12), B)
        b.box((0.14, 0.62, 0.06), (s * 1.95, 0.18, 0.12), B)
        b.box((0.2, 0.35, 0.1), (s * 2.25, 0.3, 0.07), C, glow=True)                     # wingtip lights
        chevron(b, s * 1.1, 0.18, 0.12, 0.5, 0.36, 0.1, B)
        b.box((0.55, 0.62, 0.05), (s * 0.55, 0.18, 0.12), A.shade(0.7))              # darker root panel
        # twin booms back to an H tail
        tube(b, 0.14, 0.1, -1.95, s * 0.85, 0.0, B, segs=6)
        b.box((0.1, 1.5, 0.05), (s * 0.85, -1.0, 0.14), A)
        fin(b, [(-1.5, 0.0), (-2.0, 0.0), (-2.05, 0.5), (-1.8, 0.5)], s * 0.85, 0.07, B)
        # spray nozzles along the bar under the trailing edge
        for k in range(3):
            x = s * (0.6 + k * 0.6)
            b.ball(0.13, (x, -0.28, -0.12), C, subdiv=0, glow=True)
    b.box((4.0, 0.12, 0.1), (0, -0.25, -0.1), DARK)                                   # spray bar
    b.box((1.95, 0.42, 0.08), (0, -1.88, 0.14), A.shade(1.15))                        # tailplane
    b.box((2.0, 0.1, 0.1), (0, -2.1, 0.12), B)
    body = b.build(root)
    # the tank: a violet glass drum on the back, sloshing
    t = Model(f"{kind}_tank")
    tube(t, 0.36, -0.5, 0.5, 0, 0, B, segs=8)
    tube(t, 0.31, -0.45, 0.45, 0, 0.1, C, segs=8, glow=True)
    for y in (-0.22, 0.22):
        tube(t, 0.38, y - 0.05, y + 0.05, 0, 0.02, B, segs=8)
    tank = t.build(body, loc=(0, -0.1, 0.4))
    pulse(tank, clip, T, 0.06, harm=2, axes=(0, 2))
    p = Model(f"{kind}_prop")
    for j in range(2):
        a = math.pi * j
        p.box((0.16, 0.05, 0.7), (math.sin(a) * 0.35, 0, math.cos(a) * 0.35), B.shade(1.5), rot=(0, a, 0))
    p.ball(0.13, (0, 0.05, 0), C, subdiv=0, glow=True)
    prop = p.build(body, loc=(0, 1.5, 0.05))
    spin(prop, clip, T, 8, axis=1)
    marker(body, kind, "muzzle", (0, -0.3, -0.25))
    osc(body, clip, "location", T, (2, 0.06, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.05, 1, 0.25))


def build():
    security_drone()
    orchard_sentry()
    vantorr_interceptor()
    drone_tender()
    cutter_rig()
    crop_duster()
