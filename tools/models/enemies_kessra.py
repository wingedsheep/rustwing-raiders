"""Kessra, the Rust Sea: the Dune Cartel's scrap-clan craft and the beasts of the iron desert.

The hulls wear sand colours, so every model here leans on a dark keel / rim under a light deck,
dark trim and big glowing accents to stay readable over salt pans, red mesas and dunes.
Seeds 3000-3999.
"""
from __future__ import annotations

import math

from kit import Model
from creatures_util import TAU, chain, flat, limb, osc, sample
from enemies_lib import A, B, C, DARK, GLASS, named, hull, tube, fin, flame, rotor, wing_pair, marker, both, \
    mirror, spin, pulse

BONE = "#ece2c8"


def _ngon(r, n, phase=0.5, cx=0.0, cy=0.0, sx=1.0, sy=1.0):
    return [(cx + math.cos(TAU * (k + phase) / n) * r * sx, cy + math.sin(TAU * (k + phase) / n) * r * sy)
            for k in range(n)]


def _scale(pts, kx, ky=None, cx=0.0, cy=0.0):
    ky = kx if ky is None else ky
    return [(cx + (x - cx) * kx, cy + (y - cy) * ky) for x, y in pts]


def _hazard(m, x0, x1, y, z, depth=0.2, n=4, rot=(0, 0, 0)):
    """A hazard band along x: alternating hot (C, no glow) and dark blocks."""
    w = (x1 - x0) / n
    for k in range(n):
        m.box((w * 0.98, depth, 0.05), (x0 + w * (k + 0.5), y, z), C if k % 2 == 0 else DARK, rot=rot)


# --- Sand Skimmer: a twin-ski desert airboat racer, ~2.2 -------------------------------------------

def sand_skimmer():
    kind, clip, root = named("sand_skimmer", "dart", "mech", "skim", preview=("#d0a060", "#5a2a1a", "#ff3a2a"))
    T = 1.0
    b = Model(f"{kind}_body", seed=3001)
    pod = [(0, 1.1), (-0.22, 0.7), (-0.3, 0.0), (-0.27, -0.65), (0.27, -0.65), (0.3, 0.0), (0.22, 0.7)]
    hull(b, _scale(pod, 1.2, 1.05), -0.26, -0.06, B, inset=0.85)                 # dark keel
    hull(b, pod, -0.08, 0.2, A, inset=0.62)                                       # sand deck
    b.box((0.26, 0.16, 0.05), (0, 0.72, 0.2), C)                                   # hazard nose
    b.box((0.3, 0.14, 0.05), (0, 0.56, 0.2), DARK)
    b.box((0.32, 0.14, 0.05), (0, 0.42, 0.2), C)
    b.ball(0.18, (0, 0.08, 0.24), GLASS, subdiv=1, scale=(1, 1.7, 0.7))           # canopy
    b.box((0.1, 0.3, 0.05), (0, 0.12, 0.36), C, glow=True)
    b.box((0.36, 0.3, 0.06), (0, -0.42, 0.22), A.shade(0.7))                       # patched engine plate
    for s in (1, -1):
        x = s * 0.7
        ski = [(x, 1.08), (x - 0.13, 0.88), (x - 0.15, -1.0), (x + 0.15, -1.0), (x + 0.13, 0.88)]
        hull(b, ski, -0.32, -0.1, B, inset=0.85)                                   # dark ski hulls
        flat(b, _scale(ski, 0.6, 0.85, x, 0), -0.08, 0.06, A.shade(1.12))          # light ski decks
        b.box((0.26, 0.24, 0.1), (x, 0.92, -0.08), C, glow=True)                   # running lights on the tips
        b.box((0.2, 0.18, 0.08), (x, -0.98, -0.18), DARK)
        b.cyl(0.1, 0.05, (x, -1.0, -0.2), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
        for y in (0.35, -0.5):                                                     # cross beams
            b.box((0.55, 0.16, 0.1), (s * 0.45, y, -0.06), B)
        limb(b, (s * 0.22, -0.55, 0.15), (s * 0.3, -0.92, 0.55), 0.05, 0.05, DARK, segs=4)   # duct struts
        b.box((0.06, 0.22, 0.06), (x - s * 0.1, 0.3, 0.0), DARK)                   # bolted ram spar
    # the upright fan duct behind the pod: an airboat cage
    duct = Model(f"{kind}_duct", seed=3002)
    for k in range(10):
        a = TAU * k / 10
        duct.box((0.32, 0.16, 0.14), (math.cos(a) * 0.46, 0, math.sin(a) * 0.46), B if k % 5 else C,
                 rot=(0, -a + math.pi / 2, 0), glow=not k % 5)
    duct.box((0.34, 0.22, 0.12), (0, 0, 0.52), C, glow=True)                       # beacon on top of the cage
    duct.box((0.9, 0.06, 0.06), (0, -0.04, 0), DARK)                               # guard bars
    duct.box((0.06, 0.06, 0.9), (0, -0.04, 0), DARK)
    body = b.build(root)
    duct.build(body, loc=(0, -0.95, 0.42))
    p = Model(f"{kind}_prop")
    for j in range(3):
        a = TAU * j / 3
        p.box((0.12, 0.04, 0.4), (math.sin(a) * 0.2, 0, math.cos(a) * 0.2), A.shade(0.85), rot=(0, a, 0))
    p.ball(0.11, (0, 0.02, 0), C, subdiv=0, glow=True)
    spin(p.build(body, loc=(0, -0.9, 0.42)), clip, T, 8, axis=1)
    for k, s in enumerate((1, -1)):
        flame(body, f"{kind}_flame_{k}", (s * 0.7, -1.03, -0.2), 0.1, 0.42, clip, T, phase=k * 0.3, k=4)
    marker(body, kind, "muzzle", (0, 1.2, 0.0))
    osc(body, clip, "location", T, (2, 0.05, 1, 0), (0, 0.04, 1, 0.25))
    osc(body, clip, "rotation_euler", T, (1, 0.09, 1, 0.25), (0, 0.03, 2, 0))


# --- Dune Mortar: a sandbagged mortar pit, ~2.5 ------------------------------------------------------

def dune_mortar():
    kind, clip, root = named("dune_mortar", "turret", "mech", "lob", preview=("#b4482a", "#3a2a1a", "#ffaa2a"),
                             ground=1)
    T = 2.0
    b = Model(f"{kind}_base", seed=3010)
    hull(b, _ngon(1.2, 10), 0, 0.14, B.shade(0.8), inset=0.92)                     # dug-in pad
    b.cyl(0.9, 0.06, (0, 0, 0.12), A.shade(0.7), segs=10)                          # trampled floor
    for course, (r, z, n) in enumerate(((1.02, 0.24, 12), (0.96, 0.43, 12))):
        for k in range(n):
            if course == 1 and k in (2, 3):                                        # a firing gap at the front
                continue
            a = TAU * (k + 0.5 * course) / n
            col = B if (k + course) % 2 else B.shade(2.6)                         # light and dark bags: a crisp ring on the sand
            b.ball(0.2, (math.cos(a) * r, math.sin(a) * r, z), col, subdiv=1, scale=(1.4, 0.95, 0.7),
                   rot=(0, 0, a + math.pi / 2), jitter=0.025)
    # shell crate behind, lid off: a bed of hot shell tips
    b.box((0.62, 0.42, 0.3), (0.45, -1.15, 0.2), A)
    b.box((0.66, 0.08, 0.34), (0.45, -0.95, 0.2), DARK)
    b.box((0.48, 0.28, 0.06), (0.45, -1.17, 0.36), C, glow=True)
    b.box((0.4, 0.3, 0.26), (-0.55, -1.05, 0.2), A.shade(0.8), rot=(0, 0, 0.3))    # spare crate, skewed
    _hazard(b, -0.72, -0.38, -1.05, 0.35, depth=0.3, n=3, rot=(0, 0, 0.3))
    limb(b, (-0.95, -0.55, 0.2), (-0.95, -0.55, 1.35), 0.05, 0.04, DARK, segs=4)    # flag pole
    base = b.build(root)
    f = Model(f"{kind}_flag")
    flat(f, [(0, 0.0), (0, -0.22), (0.5, -0.16), (0.42, -0.02)], 0, 0.04, C)
    f.box((0.12, 0.12, 0.05), (0.18, -0.1, 0.02), DARK)
    flag = f.build(base, loc=(-0.95, -0.55, 1.33))
    flag.rotation_euler = (0.5, 0, 0.6)
    osc(flag, clip, "rotation_euler", T, (2, 0.35, 2, 0), (0, 0.1, 3, 0.2))
    # the aiming head: turntable, cheeks and the fat tube
    h = Model(f"{kind}_head", seed=3011)
    h.cyl(0.6, 0.16, (0, 0, 0), B, segs=8)
    h.cyl(0.5, 0.08, (0, 0, 0.16), A.shade(0.8), segs=8)
    for s in (1, -1):
        h.box((0.26, 0.72, 0.5), (s * 0.42, -0.02, 0.45), A)                        # trunnion cheeks
        h.box((0.2, 0.3, 0.1), (s * 0.38, -0.18, 0.74), B)
        h.box((0.3, 0.26, 0.08), (s * 0.42, 0.18, 0.72), C)                         # hazard caps
    h.box((0.5, 0.36, 0.3), (0, -0.4, 0.3), B.shade(1.4))                          # breech block
    h.box((0.2, 0.2, 0.22), (0.45, -0.45, 0.35), DARK)                             # spotting scope
    h.box((0.26, 0.14, 0.14), (0.45, -0.35, 0.5), C, glow=True)
    head = h.build(base, loc=(0, 0, 0.14), part="head")
    head.name = f"{kind}_head"
    tilt = 0.72
    m = Model(f"{kind}_tube", seed=3012)
    tube(m, 0.34, -0.38, 0.92, 0, 0, A, segs=8)
    tube(m, 0.38, -0.1, 0.12, 0, 0, DARK, segs=8)                                  # bands
    tube(m, 0.37, 0.5, 0.64, 0, 0, B, segs=8)
    tube(m, 0.4, 0.86, 0.98, 0, 0, C, segs=8, glow=True)                           # hot muzzle ring
    tube(m, 0.24, 0.9, 1.0, 0, 0, DARK, segs=8)                                    # bore
    m.ball(0.36, (0, -0.38, 0), B, subdiv=1, scale=(1, 0.8, 1))
    barrel = m.build(head, loc=(0, 0, 0.5))
    barrel.rotation_euler = (tilt, 0, 0)
    ax = (0.0, math.cos(tilt), math.sin(tilt))

    def kick(u):
        d = 0.24 * (u / 0.04) if u < 0.04 else 0.24 * math.exp(-(u - 0.04) * 7.5) * (1 - u) / 0.96
        return [-d * c for c in ax]
    sample(barrel, clip, "location", T, kick, step=1)
    tip = 0.98
    marker(head, kind, "muzzle", (0, tip * ax[1], 0.5 + tip * ax[2]))


# --- Rust Worm: a segmented iron-sand worm with a lamprey maw, 2.0 a segment ----------------------

SEG = 2.0


def _worm_ring(m, k, r, glow_x):
    """One armoured ring about the origin: rust bulge, pale scute on top, a dark spine, glowing pores."""
    tube(m, 0.75 * r, -0.42 * r, 0.0, 0, 0, A, segs=8, r_end=r)
    tube(m, r, 0.0, 0.42 * r, 0, 0, A, segs=8, r_end=0.75 * r)
    m.ball(0.5 * r / 0.8, (0, 0.04, 0.6 * r / 0.8), B, subdiv=1, scale=(1.0, 0.72, 0.36))
    limb(m, (0, 0.05, 0.75 * r / 0.8), (0, -0.25 * r, 1.02 * r / 0.8), 0.12 * r / 0.8, 0.0, A.shade(0.45), segs=4)
    for s in (1, -1):
        m.ball(0.15 * r / 0.8, (s * glow_x, 0.0, 0.2 * r / 0.8), C, subdiv=0, glow=True)
        limb(m, (s * 0.6 * r / 0.8, -0.3 * r, -0.05), (s * 0.92 * r / 0.8, -0.5 * r, -0.1), 0.1 * r / 0.8, 0.0,
             A.shade(0.4), segs=4)                                                 # dark side spines


def rust_worm():
    pv = ("#8a4a3a", "#d0a080", "#ffe04a")
    T = 1.2
    # head: a heavy armoured skull, an upturned ring of teeth round a glowing gullet, two pale mandibles
    kind, clip, root = named("rust_worm_head", "serpent", "beast", "bite", preview=pv, seg_length=SEG)
    h = Model(f"{kind}_body", seed=3020)
    tube(h, 0.56, -1.0, -0.3, 0, 0, A.shade(0.5), segs=8)                          # neck (matches the joint)
    h.ball(0.8, (0, -0.15, 0.0), A, subdiv=1, scale=(1.02, 1.1, 0.8))              # skull
    h.ball(0.62, (0, -0.2, 0.4), B, subdiv=1, scale=(1.0, 1.25, 0.38))             # pale hood
    for i in range(3):                                                             # dark hood ridges
        h.box((0.18, 0.26, 0.2), (0, 0.15 - i * 0.38, 0.65 - i * 0.03), A.shade(0.45), rot=(0.785, 0, 0))
    for s in (1, -1):
        for i, y in enumerate((0.15, -0.35)):
            h.ball(0.14, (s * (0.36 + i * 0.05), y, 0.52 - i * 0.04), C, subdiv=0, glow=True)  # sense pits
        h.ball(0.3, (s * 0.62, -0.5, 0.1), A.shade(0.7), subdiv=1, scale=(0.8, 1.3, 0.8))     # jowl plates
    cz, cy = 0.12, 0.62
    n = (0.0, 0.8, 0.6)
    v = (0.0, 0.6, -0.8)
    rot_m = (-(math.pi / 2 - math.atan2(n[2], n[1])), 0, 0)
    h.cyl(0.6, 0.18, (0, cy - 0.12, cz - 0.09), A.shade(0.65), segs=10, rot=rot_m)      # lip ring
    h.cyl(0.44, 0.06, (0, cy + 0.02, cz + 0.02), C, segs=10, rot=rot_m, glow=True)       # gullet
    h.cyl(0.18, 0.08, (0, cy + 0.04, cz + 0.04), DARK, segs=6, rot=rot_m)
    for k in range(10):
        a = TAU * (k + 0.5) / 10
        p = (math.cos(a) * 0.5, cy + 0.06 + math.sin(a) * 0.5 * v[1], cz + 0.04 + math.sin(a) * 0.5 * v[2])
        q = (p[0] * 0.55, p[1] + n[1] * 0.18 - math.sin(a) * 0.22 * v[1], p[2] + n[2] * 0.18 - math.sin(a) * 0.22 * v[2])
        limb(h, p, q, 0.08, 0.0, BONE, segs=4)
    head = h.build(root)
    for k, s in enumerate((1, -1)):
        j = Model(f"{kind}_mandible_{k}", seed=3021 + k)
        chain(j, [(0, 0, 0), (s * 0.32, 0.45, 0.02), (s * 0.12, 0.95, 0.0)], [0.2, 0.15, 0.03], B, segs=6)
        j.ball(0.16, (0, 0, 0.02), A.shade(0.5), subdiv=1)
        for i in range(3):
            limb(j, (s * (0.2 - i * 0.04), 0.28 + i * 0.22, 0.0), (s * (0.02 - i * 0.04), 0.36 + i * 0.22, 0.0),
                 0.06, 0.0, BONE, segs=4)
        limb(j, (s * 0.12, 0.92, 0), (s * 0.02, 1.1, 0), 0.05, 0.0, A.shade(0.45), segs=4)
        obj = j.build(head, loc=(s * 0.55, 0.5, -0.08))
        osc(obj, clip, "rotation_euler", T, (2, s * 0.32, 1, 0))
    marker(head, kind, "muzzle", (0, 1.15, 0.3))
    osc(head, clip, "rotation_euler", T, (0, 0.06, 1, 0.25))

    # body: two armoured rings on a dark core, each swelling in turn (peristalsis)
    kind, clip, root = named("rust_worm_body", "serpent", "beast", "swim", preview=pv, seg_length=SEG)
    g = Model(f"{kind}_core", seed=3023)
    tube(g, 0.56, -1.0, 1.0, 0, 0, A.shade(0.5), segs=8)
    for s in (1, -1):                                                              # dark belly skirts
        g.box((0.25, 1.9, 0.3), (s * 0.45, 0, -0.35), A.shade(0.4))
    body = g.build(root)
    for k, y in enumerate((0.5, -0.5)):
        r = Model(f"{kind}_ring_{k}", seed=3024 + k)
        _worm_ring(r, k, 0.8, 0.74)
        obj = r.build(body, loc=(0, y, 0))
        pulse(obj, clip, T, 0.07, harm=1, phase=k * 0.5, axes=(0, 2))

    # tail: shrinking rings, a hooked barb and a glowing lure
    kind, clip, root = named("rust_worm_tail", "serpent", "beast", "swim", preview=pv, seg_length=SEG)
    t = Model(f"{kind}_core", seed=3026)
    tube(t, 0.56, 1.0, -0.2, 0, 0, A.shade(0.5), segs=8, r_end=0.34)
    r = Model(f"{kind}_ring", seed=3027)
    _worm_ring(r, 0, 0.72, 0.66)
    tail = t.build(root)
    ring = r.build(tail, loc=(0, 0.5, 0))
    pulse(ring, clip, T, 0.07, harm=1, phase=0.0, axes=(0, 2))
    e = Model(f"{kind}_end", seed=3028)
    tube(e, 0.36, 0.1, -0.35, 0, 0, A, segs=8, r_end=0.42)
    tube(e, 0.42, -0.35, -0.7, 0, 0, A, segs=8, r_end=0.2)
    e.ball(0.3, (0, -0.3, 0.3), B, subdiv=1, scale=(1, 1.2, 0.5))
    chain(e, [(0, -0.55, 0.05), (0, -1.05, 0.25), (0, -1.3, 0.6)], [0.26, 0.14, 0.0], A.shade(0.45), segs=6)  # barb
    e.ball(0.2, (0, -0.95, 0.42), C, subdiv=1, glow=True)                          # lure bulb
    for s in (1, -1):
        e.ball(0.17, (s * 0.38, -0.45, 0.12), C, subdiv=0, glow=True)               # lure pores
        flat(e, [(0, 0), (0, -0.35), (0.55, -0.6), (0.45, -0.15)] if s > 0 else
             mirror([(0, 0), (0, -0.35), (0.55, -0.6), (0.45, -0.15)]), 0.0, 0.07, B)
    end = e.build(tail, loc=(0, -0.25, 0))
    osc(end, clip, "rotation_euler", T, (2, 0.3, 1, 0.25), (0, 0.08, 1, 0))


# --- Cartel Hauler: a patched quad-fan cargo truck with door guns, ~4 ------------------------------

def cartel_hauler():
    kind, clip, root = named("cartel_hauler", "gunship", "mech", "haul", preview=("#d0a060", "#3a2a2a", "#ff5a2a"))
    T = 2.0
    b = Model(f"{kind}_body", seed=3030)
    out = [(-0.6, 1.9), (-0.85, 1.55), (-0.92, -1.6), (-0.78, -1.85), (0.78, -1.85), (0.92, -1.6), (0.85, 1.55), (0.6, 1.9)]
    hull(b, _scale(out, 1.08, 1.03), -0.6, -0.26, B, inset=0.9)                     # dark skirt
    hull(b, out, -0.3, 0.2, A, inset=0.88)
    # cab
    hull(b, [(-0.55, 1.85), (-0.72, 1.55), (-0.72, 0.95), (0.72, 0.95), (0.72, 1.55), (0.55, 1.85)], 0.18, 0.62,
         A.shade(1.1), inset=0.82)
    b.box((0.9, 0.3, 0.26), (0, 1.62, 0.5), GLASS, rot=(0.55, 0, 0))               # windscreen
    b.box((0.85, 0.4, 0.08), (0, 1.2, 0.64), B)                                     # roof plate
    b.box((0.7, 0.16, 0.1), (0, 1.32, 0.7), C, glow=True)                          # roof light bar
    for s in (1, -1):
        b.box((0.28, 0.16, 0.16), (s * 0.45, 1.92, 0.05), C, glow=True)            # headlights
    _hazard(b, -0.72, 0.72, 0.98, 0.64, depth=0.18, n=6)
    # cargo bed
    b.box((1.62, 2.6, 0.1), (0, -0.55, 0.23), B.shade(1.25))
    for s in (1, -1):
        b.box((0.14, 2.75, 0.24), (s * 0.86, -0.5, 0.3), B)                         # side rails
    b.box((0.82, 1.05, 0.55), (-0.32, -0.12, 0.55), A.shade(0.82))                 # cargo container
    for k in range(3):
        b.box((0.86, 0.1, 0.06), (-0.32, -0.5 + k * 0.38, 0.84), B)
    b.box((0.3, 0.3, 0.04), (-0.48, 0.15, 0.85), A.shade(0.6))                      # patch
    b.box((0.5, 0.5, 0.36), (0.42, 0.22, 0.46), DARK)                              # strapped power cell
    b.box((0.36, 0.36, 0.1), (0.42, 0.22, 0.66), C, glow=True)
    b.ball(0.45, (0.38, -1.12, 0.38), "#5e6038", subdiv=1, scale=(1.0, 1.25, 0.6), jitter=0.05)   # tarp heap
    b.box((0.1, 1.0, 0.08), (0.38, -1.12, 0.62), DARK, rot=(0, 0, 0.2))           # tie-down
    for (x, y) in ((-0.5, -1.0), (-0.5, -1.45)):                                   # fuel drums
        b.cyl(0.2, 0.42, (x, y, 0.28), A.shade(0.6), segs=7)
        b.cyl(0.12, 0.04, (x, y, 0.7), C, segs=6, glow=True)
    _hazard(b, -0.85, 0.85, -1.88, 0.24, depth=0.16, n=6)                          # tailgate stripes
    for s in (1, -1):
        b.cyl(0.13, 0.65, (s * 0.62, -1.68, 0.25), DARK, segs=6)                   # exhaust stacks
        b.cyl(0.15, 0.06, (s * 0.62, -1.68, 0.88), C, segs=6, glow=True)
        # door gun pods on the cab flanks
        b.cyl(0.24, 0.3, (s * 0.98, 1.3, -0.05), B, segs=7)
        b.box((0.26, 0.3, 0.12), (s * 0.98, 1.3, 0.27), A.shade(0.9))
        for d in (-0.08, 0.08):
            tube(b, 0.07, 1.45, 2.15, s * 0.98 + d, 0.1, DARK, segs=5)
        b.box((0.34, 0.12, 0.14), (s * 0.98, 2.15, 0.1), C, glow=True)
    # four ducted fans on outriggers
    fans = [(1, 1.0), (-1, 1.0), (1, -1.15), (-1, -1.15)]
    for s, y in fans:
        x = s * 1.42
        b.box((0.6, 0.3, 0.14), (s * 1.05, y, -0.1), B)
        b.cyl(0.52, 0.3, (x, y, -0.28), B, segs=10)
        b.cyl(0.43, 0.04, (x, y, 0.03), DARK, segs=10)
        b.box((0.14, 0.26, 0.1), (s * 1.95, y, -0.08), C, glow=True)               # nav lights
    body = b.build(root)
    for k, (s, y) in enumerate(fans):
        rotor(body, f"{kind}_fan_{k}", (s * 1.42, y, 0.1), 0.42, 3, clip, T, s * (6 + k % 2), color=A, hub=C)
    for k, s in enumerate((1, -1)):
        flame(body, f"{kind}_flame_{k}", (s * 0.42, -1.9, -0.4), 0.15, 0.5, clip, T, phase=k * 0.4, k=4)
        marker(body, kind, "muzzle", (s * 0.98, 2.25, 0.1), k)
    osc(body, clip, "location", T, (2, 0.08, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.035, 1, 0.25), (0, 0.025, 1, 0))


# --- Glass Lancer: a burning-glass sun lance, ~3 ---------------------------------------------------

def glass_lancer():
    kind, clip, root = named("glass_lancer", "lancer", "mech", "focus", preview=("#e8e0d0", "#8a3a2a", "#4affe0"))
    T = 2.0
    b = Model(f"{kind}_body", seed=3040)
    fus = [(0, 0.45), (-0.26, 0.15), (-0.34, -0.85), (-0.22, -1.42), (0.22, -1.42), (0.34, -0.85), (0.26, 0.15)]
    hull(b, _scale(fus, 1.25, 1.04), -0.32, -0.08, B, inset=0.85)                   # rust keel
    hull(b, fus, -0.1, 0.2, A, inset=0.6)                                           # white deck
    b.box((0.2, 1.1, 0.05), (0, -0.55, 0.2), B)                                     # rust spine stripe
    b.ball(0.17, (0, -0.05, 0.24), GLASS, subdiv=1, scale=(1, 1.6, 0.7))
    for s in (1, -1):
        tube(b, 0.14, -1.0, -1.45, s * 0.2, -0.12, DARK, segs=6)
        b.cyl(0.12, 0.05, (s * 0.2, -1.46, -0.12), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
        # yoke arms up to the lens
        limb(b, (s * 0.25, 0.1, 0.0), (s * 0.74, 0.62, 0.22), 0.09, 0.08, B, segs=5)
        b.box((0.16, 0.16, 0.16), (s * 0.74, 0.62, 0.22), A)
    # focal prong forward to the hot point
    limb(b, (0, 0.45, 0.0), (0, 1.62, 0.05), 0.08, 0.05, B, segs=5)
    body = b.build(root)
    for k, s in enumerate((1, -1)):                                                # dark solar collector wings
        w = Model(f"{kind}_panel_{k}", seed=3041 + k)
        frame = [(0.0, 0.25), (0.0, -0.55), (1.15, -0.72), (1.22, 0.05)]
        pane = [(0.1, 0.16), (0.1, -0.46), (1.05, -0.6), (1.1, 0.0)]
        flat(w, frame if s > 0 else mirror(frame), 0, 0.08, B)
        flat(w, pane if s > 0 else mirror(pane), 0.05, 0.04, GLASS)
        w.box((0.05, 0.62, 0.04), (s * 0.58, -0.2, 0.08), A)                        # pane divider
        w.box((0.24, 0.6, 0.06), (s * 1.12, -0.33, 0.06), C, glow=True)             # edge glow
        obj = w.build(body, loc=(s * 0.32, -0.6, 0.0))
        osc(obj, clip, "rotation_euler", T, (1, -s * 0.12, 1, 0))
    # the great lens, tilted forward-up to catch the sun
    tilt = -0.95
    ring = Model(f"{kind}_ring", seed=3043)
    for k in range(12):
        a = TAU * (k + 0.5) / 12
        ring.box((0.42, 0.2, 0.16), (math.cos(a) * 0.68, math.sin(a) * 0.68, 0), B if k % 3 else A,
                 rot=(0, 0, a + math.pi / 2))
    ring.box((0.3, 0.2, 0.18), (0, -0.7, -0.05), DARK)
    lens_frame = ring.build(body, loc=(0, 0.78, 0.25))
    lens_frame.rotation_euler = (tilt, 0, 0)
    g = Model(f"{kind}_lens", seed=3044)
    g.cyl(0.58, 0.05, (0, 0, -0.025), C, segs=12, glow=True)
    g.ball(0.18, (0, 0, 0.03), "#f4fffc", subdiv=1, scale=(1, 1, 0.4), glow=True)
    for k in range(3):                                                              # iris vanes
        a = TAU * k / 3
        g.box((0.08, 0.5, 0.05), (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.04), DARK, rot=(0, 0, a + math.pi / 2))
    lens = g.build(lens_frame, loc=(0, 0, 0))
    spin(lens, clip, T, 1, axis=2)
    hot = Model(f"{kind}_focus")
    hot.ball(0.2, (0, 0, 0), C, subdiv=0, scale=(1, 1.3, 1), glow=True)
    for k in range(4):
        a = TAU * k / 4
        hot.box((0.08, 0.3, 0.08), (math.cos(a) * 0.2, -0.05, math.sin(a) * 0.2), A, rot=(0, -a, 0))
    focus = hot.build(body, loc=(0, 1.66, 0.06))
    pulse(focus, clip, T, 0.25, harm=4)
    marker(body, kind, "emitter", (0, 1.85, 0.06))
    osc(body, clip, "location", T, (2, 0.06, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.03, 1, 0.25))


# --- Scarab Bomber: a sun-scarab rolling a glowing bomb, ~4.5 wide -----------------------------------

def scarab_bomber():
    kind, clip, root = named("scarab_bomber", "bomber", "beast", "buzz", preview=("#3a6a8a", "#d0a040", "#4affe0"))
    T = 1.0
    b = Model(f"{kind}_body", seed=3050)
    b.ball(0.8, (0, -0.45, -0.12), A.shade(0.5), subdiv=1, scale=(1.0, 1.35, 0.55))   # dark underbody
    b.ball(0.74, (0, 0.55, 0.1), B, subdiv=1, scale=(1.14, 0.76, 0.48))              # gold-rimmed pronotum
    b.ball(0.7, (0, 0.53, 0.17), A, subdiv=1, scale=(1.08, 0.72, 0.5))
    b.cyl(0.22, 0.06, (0, 0.55, 0.5), C, segs=8, glow=True)                          # sun-disc glyph
    for s in (1, -1):
        b.box((0.3, 0.08, 0.05), (s * 0.4, 0.55, 0.5), B, rot=(0, 0, s * 0.2))        # glyph rays
    b.ball(0.4, (0, 1.12, 0.0), A.shade(0.7), subdiv=1, scale=(1.25, 0.8, 0.5))      # head
    for i in range(5):                                                               # toothed digging shovel
        x = (i - 2) * 0.2
        limb(b, (x, 1.3, 0.0), (x * 1.25, 1.62 - abs(i - 2) * 0.06, 0.02), 0.09, 0.0, B, segs=4)
    limb(b, (0, 1.05, 0.2), (0, 1.35, 0.62), 0.13, 0.0, B, segs=5)                   # horn
    for s in (1, -1):
        b.ball(0.15, (s * 0.38, 1.18, 0.12), C, subdiv=1, glow=True)                 # eyes
        # legs: toothed fore legs, mid legs, hind legs gripping the bomb
        chain(b, [(s * 0.55, 0.8, -0.1), (s * 1.0, 1.15, -0.05), (s * 1.0, 1.55, -0.1)], [0.09, 0.07, 0.04],
              A.shade(0.4), segs=5)
        limb(b, (s * 1.0, 1.3, -0.07), (s * 1.18, 1.32, -0.07), 0.05, 0.0, B, segs=4)
        chain(b, [(s * 0.6, 0.15, -0.15), (s * 1.15, 0.0, -0.1), (s * 1.3, -0.4, -0.2)], [0.08, 0.06, 0.03],
              A.shade(0.4), segs=5)
        chain(b, [(s * 0.45, -1.1, -0.15), (s * 0.85, -1.35, -0.05), (s * 0.5, -1.8, -0.05)], [0.08, 0.07, 0.04],
              A.shade(0.4), segs=5)
    body = b.build(root)
    # membrane wings under the shells: dark, fast, glowing tip-spots
    def veins(w, s):
        limb(w, (0, 0.18, 0.04), (s * 1.9, -0.05, 0.04), 0.06, 0.03, B.shade(0.8), segs=3)
        w.box((0.34, 0.3, 0.06), (s * 1.75, -0.12, 0.04), C, glow=True)
    wing_pair(body, f"{kind}_wing", (0.35, -0.05, 0.12),
              [(0, 0.25), (0, -0.28), (0.9, -0.5), (1.85, -0.35), (2.05, -0.05), (1.3, 0.28)], 0.05, A.shade(0.55),
              clip, T, 0.35, harm=4, dihedral=0.08, extra=veins)
    # the elytra: wing cases lifted and flared open, gold-banded, an eye-spot each
    for k, s in enumerate((1, -1)):
        e = Model(f"{kind}_elytron_{k}", seed=3051 + k)
        e.ball(0.5, (s * 0.36, -0.8, -0.04), B, subdiv=1, scale=(1.0, 1.95, 0.42))
        e.ball(0.5, (s * 0.36, -0.78, 0.02), A, subdiv=1, scale=(0.94, 1.88, 0.48))
        e.box((0.14, 1.2, 0.06), (s * 0.12, -0.75, 0.22), B)                       # seam band
        e.box((0.4, 0.14, 0.06), (s * 0.4, -0.3, 0.22), B, rot=(0, 0, -s * 0.25))  # glyph bars
        e.box((0.4, 0.14, 0.06), (s * 0.42, -1.3, 0.2), B, rot=(0, 0, s * 0.25))
        e.ball(0.17, (s * 0.44, -0.82, 0.22), C, subdiv=1, scale=(1, 1.2, 0.6), glow=True)
        obj = e.build(body, loc=(s * 0.1, 0.25, 0.28), rot_z=s * 0.4)
        obj.rotation_euler[1] = -s * 0.25
        osc(obj, clip, "rotation_euler", T, (1, -s * 0.06, 2, 0), (2, s * 0.04, 1, 0.25))
    # the bomb: a glowing ball of fire-sand held in the hind legs
    o = Model(f"{kind}_orb", seed=3053)
    o.ball(0.44, (0, 0, 0), C, subdiv=1, glow=True, jitter=0.03)
    for a in (0.0, math.pi / 2):
        o.cyl(0.47, 0.08, (0, 0, -0.04), B, segs=8, rot=(math.pi / 2, 0, a))       # gold bands
    orb = o.build(body, loc=(0, -1.85, -0.02))
    pulse(orb, clip, T, 0.08, harm=2)
    spin(orb, clip, T, -1, axis=0)
    marker(body, kind, "muzzle", (0, -1.85, -0.4))
    osc(body, clip, "location", T, (2, 0.08, 1, 0.5))
    osc(body, clip, "rotation_euler", T, (1, 0.03, 1, 0))


def build():
    sand_skimmer()
    dune_mortar()
    rust_worm()
    cartel_hauler()
    glass_lancer()
    scarab_bomber()
