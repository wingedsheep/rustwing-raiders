"""Ambient wildlife you fly over. Not enemies: the runtime moves each template along a heading and
plays its one looping clip. Every creature faces +y; z = 0 is the ground (the waterline for the
plesiosaur). The fliers (pterosaur_flock, moth_swarm, sky_whale, jellyfish) are built at their own
height above z = 0.

Templates (kind: clip):
    sauropod         sauropod_walk_idle
    raptor_pack      raptor_pack_run_idle
    plesiosaur       plesiosaur_swim_idle
    pterosaur_flock  pterosaur_flock_flap_idle
    jellyfish        jellyfish_0_pulse_idle, jellyfish_1_pulse_idle   (variants 0, 1)
    sandworm         sandworm_breach_idle
    camel_strider    camel_strider_walk_idle
    beetle           beetle_crawl_idle
    moth_swarm       moth_swarm_flutter_idle
    mammoth          mammoth_walk_idle
    crawler          crawler_walk_idle
    sky_whale        sky_whale_swim_idle

The root is never animated (the runtime owns it); a `<kind>_body` child (or several) moves.
"""
from __future__ import annotations

import math

from kit import Model, group
from creatures_util import TAU, chain, flat, limb, linearize, osc, sample, smooth_keys

INK = "#1e1a1c"


def _band(m: Model, y, rx, ry, rz, z0, color, grow=0.05, width=0.2):
    """A stripe round an ellipsoid body (radii rx, ry, rz centred at z0), at y."""
    c = math.sqrt(max(0.0, 1 - (y / ry) ** 2))
    m.ball(1.0, (0, y, z0), color, subdiv=1, scale=(rx * c + grow, width, rz * c + grow))


def _top(y, ry, rz, z0=0.0):
    """Height of the top of an ellipsoid at y."""
    return z0 + rz * math.sqrt(max(0.0, 1 - (y / ry) ** 2))


def _eyes(m: Model, x, y, z, size=0.14, color=INK, glow=False):
    for s in (1, -1):
        m.box((size, size, size), (s * x, y, z), color, glow=glow)


# --- Oru-Tal ---------------------------------------------------------------------------------

def sauropod():
    """A long-necked grazer of the fern jungle: olive with dark bands and an orange crest."""
    K, clip, T = "sauropod", "sauropod_walk_idle", 2.0
    SKIN, DARK, BELLY, CREST, FOOT = "#7f9150", "#4a5a30", "#c8b98a", "#e07a3a", "#5a4a38"
    root = group(K, kind=K)
    RX, RY, RZ = 1.05, 1.45, 0.9
    b = Model(f"{K}_body", seed=1)
    b.ball(1.0, (0, 0, 0), SKIN, subdiv=2, scale=(RX, RY, RZ))
    b.ball(1.0, (0, 0, -0.3), BELLY, subdiv=1, scale=(RX * 0.9, RY * 0.9, RZ * 0.65))
    for y in (-0.95, -0.4, 0.15, 0.7):
        _band(b, y, RX, RY, RZ, 0, DARK, grow=0.12, width=0.24)
    for i in range(6):
        y = -1.2 + i * 0.5
        b.box((0.3, 0.3, 0.3), (0, y, _top(y, RY, RZ) + 0.02), CREST, rot=(0.785, 0, 0))
    body = b.build(root, loc=(0, 0, 2.2))
    legs = {}
    for tag, x, y in (("fl", 0.7, 0.85), ("fr", -0.7, 0.85), ("bl", 0.7, -0.85), ("br", -0.7, -0.85)):
        g = Model(f"{K}_leg_{tag}")
        limb(g, (0, 0, 0.3), (0, 0, -1.95), 0.36, 0.3, SKIN)
        g.cyl(0.38, 0.22, (0, 0.04, -1.95), FOOT, segs=6)
        legs[tag] = g.build(body, loc=(x, y, -0.25))
    n = Model(f"{K}_neck")
    pts = [(0, 0, 0), (0, 0.85, 0.75), (0, 1.55, 1.45), (0, 2.2, 1.85)]
    chain(n, pts, [0.52, 0.42, 0.32, 0.27], SKIN)
    for k in range(4):
        p = [pts[1], pts[2], pts[2], pts[3]][k]
        n.box((0.24, 0.24, 0.24), (0, p[1] - 0.2 * (k % 2), p[2] + 0.3 - 0.03 * k), CREST, rot=(0.785, 0, 0))
    n.ball(0.36, (0, 2.45, 1.92), SKIN, subdiv=1, scale=(0.85, 1.3, 0.72))
    n.ball(0.3, (0, 2.6, 1.8), BELLY, subdiv=1, scale=(0.8, 1.1, 0.5))
    _eyes(n, 0.26, 2.5, 2.02, 0.13)
    neck = n.build(body, loc=(0, 1.25, 0.3))
    t = Model(f"{K}_tail")
    chain(t, [(0, 0, 0), (0, -0.9, -0.3), (0, -1.8, -0.5), (0, -2.6, -0.45)], [0.52, 0.36, 0.18, 0.05], SKIN)
    t.box((0.2, 0.2, 0.2), (0, -0.7, 0.3), CREST, rot=(0.785, 0, 0))
    tail = t.build(body, loc=(0, -1.3, 0.05))

    for tag, ph in (("fl", 0), ("br", 0), ("fr", 0.5), ("bl", 0.5)):
        osc(legs[tag], clip, "rotation_euler", T, (0, 0.32, 1, ph))
    osc(body, clip, "location", T, (2, 0.06, 2, 0.25))
    osc(body, clip, "rotation_euler", T, (1, 0.025, 1, 0), (2, 0.02, 1, 0.25))
    osc(neck, clip, "rotation_euler", T, (0, 0.06, 2, 0), (2, 0.14, 1, 0.1))
    osc(tail, clip, "rotation_euler", T, (2, 0.2, 1, 0.6), (0, 0.04, 2, 0))


def _raptor(root, i, at, phase, T, clip):
    SKIN, STRIPE, BELLY, CREST = "#d8843a", "#3a2a22", "#f0d8a8", "#3ab8c8"
    b = Model(f"raptor_{i}_body", seed=10 + i)
    b.ball(0.32, (0, 0, 0), SKIN, subdiv=1, scale=(0.8, 1.35, 0.85))
    b.ball(0.27, (0, 0.05, -0.1), BELLY, subdiv=1, scale=(0.8, 1.3, 0.7))
    for y in (-0.2, 0.1):
        b.ball(0.32, (0, y, 0.04), STRIPE, subdiv=1, scale=(0.84, 0.25, 0.86))
    chain(b, [(0, 0.3, 0.05), (0, 0.5, 0.3), (0, 0.62, 0.38)], [0.17, 0.13, 0.12], SKIN, segs=5)
    b.ball(0.18, (0, 0.78, 0.4), SKIN, subdiv=1, scale=(0.8, 1.6, 0.75))                     # head
    b.box((0.08, 0.5, 0.18), (0, 0.6, 0.6), CREST, rot=(0.4, 0, 0))                         # crest
    _eyes(b, 0.11, 0.84, 0.47, 0.08)
    for s in (1, -1):
        limb(b, (s * 0.18, 0.28, -0.05), (s * 0.22, 0.45, -0.22), 0.06, 0.04, SKIN, segs=4)  # little arms
    body = b.build(root, loc=(at[0], at[1], 0.82))
    t = Model(f"raptor_{i}_tail")
    chain(t, [(0, 0, 0), (0, -0.5, 0.05), (0, -1.1, 0.15)], [0.18, 0.11, 0.03], SKIN, segs=5)
    t.ball(0.12, (0, -0.55, 0.07), STRIPE, subdiv=1, scale=(1, 0.6, 1))
    tail = t.build(body, loc=(0, -0.35, 0.02))
    for s, ph in ((1, 0.0), (-1, 0.5)):
        g = Model(f"raptor_{i}_leg_{'l' if s > 0 else 'r'}")
        limb(g, (0, 0, 0.05), (0, -0.12, -0.42), 0.13, 0.07, SKIN, segs=5)
        limb(g, (0, -0.12, -0.42), (0, 0.0, -0.78), 0.06, 0.05, STRIPE, segs=4)
        g.box((0.14, 0.26, 0.06), (0, 0.08, -0.79), STRIPE)
        leg = g.build(body, loc=(s * 0.17, 0.0, -0.05))
        osc(leg, clip, "rotation_euler", T, (0, 0.85, 1, phase + ph))
    osc(body, clip, "location", T, (2, 0.07, 2, phase), (0, 0.05, 1, phase * 0.5))
    osc(body, clip, "rotation_euler", T, (0, 0.06, 2, phase + 0.25), (2, 0.06, 1, phase))
    osc(tail, clip, "rotation_euler", T, (2, 0.2, 1, phase + 0.3), (0, 0.08, 2, phase))


def raptor_pack():
    """Three or four small raptors running together, orange with dark stripes and teal crests."""
    K, clip, T = "raptor_pack", "raptor_pack_run_idle", 0.5
    root = group(K, kind=K)
    for i, (at, ph) in enumerate((((0.0, 1.4), 0.0), ((-1.3, 0.2), 0.3), ((1.25, -0.1), 0.65), ((-0.2, -1.5), 0.15))):
        _raptor(root, i, at, ph, T, clip)


def plesiosaur():
    """Back and neck breaking the jade sea; z = 0 is the waterline. A ring of foam where it cuts."""
    K, clip, T = "plesiosaur", "plesiosaur_swim_idle", 3.0
    SKIN, DARK, BELLY, SPOT, FOAM = "#3f7a84", "#2a5260", "#b8d8c0", "#9ad0c0", "#d8f0e8"
    root = group(K, kind=K)
    b = Model(f"{K}_body", seed=3)
    RX, RY, RZ = 1.15, 1.9, 0.62
    b.ball(1.0, (0, 0, 0), SKIN, subdiv=2, scale=(RX, RY, RZ))
    b.ball(1.0, (0, 0, -0.15), BELLY, subdiv=1, scale=(RX * 0.95, RY * 0.95, RZ * 0.7))
    for k in range(7):  # pale spots on the back
        y = -1.3 + k * 0.42
        x = (0.35 if k % 2 else -0.35) * (1 - abs(y) / 2.2)
        b.ball(0.2, (x, y, _top(y, RY, RZ) - 0.06), SPOT, subdiv=0, scale=(1.2, 1.2, 0.5))
    for y in (-0.5, 0.4):
        b.box((0.24, 0.3, 0.2), (0, y, _top(y, RY, RZ)), DARK, rot=(0.785, 0, 0))
    chain(b, [(0, -1.6, -0.05), (0, -2.4, -0.15), (0, -3.0, -0.25)], [0.4, 0.22, 0.06], SKIN)  # tail, just awash
    body = b.build(root, loc=(0, 0, -0.25))
    n = Model(f"{K}_neck")
    pts = [(0, 0, 0), (0, 0.7, 0.75), (0, 1.15, 1.65), (0, 1.6, 2.2), (0, 2.15, 2.35)]
    chain(n, pts, [0.42, 0.34, 0.28, 0.24, 0.22], SKIN)
    for p in pts[1:4]:
        n.ball(0.12, (0, p[1] - 0.12, p[2] + 0.2), SPOT, subdiv=0)
    n.ball(0.3, (0, 2.4, 2.32), SKIN, subdiv=1, scale=(0.85, 1.5, 0.7), rot=(-0.25, 0, 0))
    n.box((0.32, 0.4, 0.1), (0, 2.55, 2.18), BELLY, rot=(-0.25, 0, 0))
    _eyes(n, 0.22, 2.35, 2.42, 0.12)
    neck = n.build(body, loc=(0, 1.55, 0.25))
    flips = []
    for tag, x, y, sx in (("fl", 1.0, 0.8, 1), ("fr", -1.0, 0.8, -1), ("bl", 0.95, -0.9, 1), ("br", -0.95, -0.9, -1)):
        f = Model(f"{K}_flipper_{tag}")
        flat(f, [(0, -0.25), (sx * 1.3, -0.45), (sx * 1.45, -0.3), (0, 0.25)][:: sx], 0, 0.1, DARK)
        flips.append((f.build(body, loc=(x, y, 0.12)), sx, 0.0 if tag[0] == "f" else 0.3))
    fm = Model(f"{K}_foam", seed=4)  # foam on the water round the back and at the neck
    ring = [(math.cos(TAU * k / 16) * 1.12, math.sin(TAU * k / 16) * 1.8 - 0.05) for k in range(16)]
    flat(fm, [(x * 1.12, y * 1.07) for x, y in ring], 0, 0.04, FOAM)               # a thin collar of foam
    for k in range(5):
        a = TAU * k / 5 + 0.3
        fm.ball(0.17, (math.cos(a) * 0.45, 1.55 + math.sin(a) * 0.42, 0.0), FOAM, subdiv=0, scale=(1.3, 1.3, 0.3))
    for k in range(3):  # a broken V of wake
        for s in (1, -1):
            fm.box((0.26 - 0.05 * k, 0.45, 0.05), (s * (0.55 + 0.4 * k), -2.0 - 0.75 * k, 0.0), FOAM if k < 1 else "#b8e0d8",
                   rot=(0, 0, s * 0.5))
    foam = fm.build(root, loc=(0, 0, 0.02))

    osc(body, clip, "location", T, (2, 0.07, 1, 0))
    osc(body, clip, "rotation_euler", T, (0, 0.03, 1, 0.25), (1, 0.03, 1, 0))
    osc(neck, clip, "rotation_euler", T, (0, 0.12, 1, 0.1), (2, 0.12, 1, 0.35))
    for obj, sx, ph in flips:
        osc(obj, clip, "rotation_euler", T, (1, sx * 0.35, 2, ph), (2, 0.25, 2, ph + 0.25))
    osc(foam, clip, "scale", T, (0, 0.05, 2, 0), (1, 0.05, 2, 0))


def _pterosaur(root, i, at, phase, T, clip):
    BODY, WING, BONE, CREST, BELLY = "#e6c690", "#b8583a", "#5a2e22", "#e8402a", "#f4e4c0"
    b = Model(f"pterosaur_{i}_body", seed=20 + i)
    b.ball(0.24, (0, 0, 0), BODY, subdiv=1, scale=(0.85, 1.9, 0.8))
    b.ball(0.2, (0, 0.5, 0.08), BODY, subdiv=1, scale=(0.8, 1.2, 0.8))                       # head
    limb(b, (0, 0.65, 0.05), (0, 1.25, -0.02), 0.09, 0.01, BONE, segs=4)                    # beak
    b.prism([(0, 0), (0.28, 0), (-0.5, 0.42)], 0.07, (0, 0.5, 0.18), CREST, rot=(0, 0, math.pi / 2))  # crest
    _eyes(b, 0.13, 0.55, 0.14, 0.07)
    limb(b, (0, -0.35, 0), (0, -0.75, 0.02), 0.07, 0.01, BODY, segs=4)
    body = b.build(root, loc=(at[0], at[1], at[2]))
    for s in (1, -1):
        w = Model(f"pterosaur_{i}_wing_{'l' if s < 0 else 'r'}")
        flat(w, [(0, 0.22), (0, -0.3), (s * 0.85, -0.38), (s * 0.85, 0.2)][:: s], 0, 0.06, WING)
        limb(w, (0, 0.2, 0.02), (s * 0.85, 0.2, 0.02), 0.07, 0.05, BONE, segs=4)
        inner = w.build(body, loc=(s * 0.15, 0.1, 0.02))
        o = Model(f"pterosaur_{i}_tip_{'l' if s < 0 else 'r'}")
        flat(o, [(0, 0.2), (0, -0.38), (s * 1.0, 0.05), (s * 1.1, 0.12)][:: s], 0, 0.05, WING)
        limb(o, (0, 0.2, 0.02), (s * 1.1, 0.12, 0.02), 0.05, 0.02, BONE, segs=4)
        tip = o.build(inner, loc=(s * 0.85, 0, 0))
        osc(inner, clip, "rotation_euler", T, (1, s * 0.55, 1, phase))
        osc(tip, clip, "rotation_euler", T, (1, s * 0.4, 1, phase - 0.08))
    osc(body, clip, "location", T, (2, 0.14, 1, phase + 0.5), (0, 0.1, 1, phase * 0.3))
    osc(body, clip, "rotation_euler", T, (0, 0.06, 1, phase + 0.25))


def pterosaur_flock():
    """Four pterosaurs in a loose V, flying at about height 5: rust wings, bright red crests."""
    K, clip, T = "pterosaur_flock", "pterosaur_flock_flap_idle", 1.0
    root = group(K, kind=K)
    for i, (at, ph) in enumerate((((0, 1.6, 5.2), 0.0), ((-2.4, 0.0, 4.8), 0.22), ((2.5, -0.2, 5.0), 0.55),
                                  ((0.6, -2.0, 5.5), 0.8))):
        _pterosaur(root, i, at, ph, T, clip)


# --- Halcyon ---------------------------------------------------------------------------------

def jellyfish(variant: int):
    """A lantern jelly drifting up through the kelp light: a glowing bell that pulses."""
    K = "jellyfish"
    clip, T = f"{K}_{variant}_pulse_idle", 2.0
    if variant == 0:
        BELL, MARK, RIM, ARM = "#ff7ac0", "#8affff", "#9a3a8a", "#ffd0f0"
        R, H, lobes = 1.0, 0.75, 10
    else:
        BELL, MARK, RIM, ARM = "#5ae0ff", "#fff07a", "#2a5a9a", "#c0f8ff"
        R, H, lobes = 0.75, 1.1, 8
    root = group(f"{K}_{variant}", kind=K, variant=variant)
    b = Model(f"{K}_{variant}_bell", seed=30 + variant)
    b.ball(R, (0, 0, 0), BELL, subdiv=2, scale=(1, 1, H), glow=True)
    b.cyl(R * 1.02, 0.12, (0, 0, -0.06), RIM, segs=lobes)
    for k in range(lobes):  # scalloped rim
        a = TAU * (k + 0.5) / lobes
        b.ball(R * 0.22, (math.cos(a) * R * 0.98, math.sin(a) * R * 0.98, -0.02), RIM, subdiv=0, scale=(1, 1, 0.6))
    if variant == 0:  # four-leaf mark on top
        for k in range(4):
            a = TAU * k / 4 + 0.785
            b.ball(0.26, (math.cos(a) * 0.32, math.sin(a) * 0.32, R * H * 0.9), MARK, subdiv=1, scale=(1, 1, 0.45), glow=True)
    else:  # glowing meridian stripes
        for k in range(6):
            a = TAU * k / 6
            b.box((0.16, R * 0.8, 0.12), (math.cos(a) * R * 0.45, math.sin(a) * R * 0.45, R * H * 0.82), MARK,
                  rot=(0.0, 0.0, a + math.pi / 2), glow=True)
        b.ball(0.2, (0, 0, R * H), MARK, subdiv=1, glow=True)
    bell = b.build(root, loc=(0, 0, 3.0))
    arms = []
    n = 4 if variant == 0 else 6
    for k in range(n):
        a = TAU * k / n
        t = Model(f"{K}_{variant}_arm_{k}", seed=k)
        L = 1.6 if variant == 0 else 2.2
        for j in range(4):
            z = -j * L / 4
            t.box((0.22 - j * 0.03, 0.22 - j * 0.03, L / 4 + 0.05), (math.sin(j * 1.7) * 0.1, 0, z - L / 8),
                  ARM if j % 2 == 0 else BELL, glow=(j % 2 == 1))
        arms.append(t.build(bell, loc=(math.cos(a) * R * 0.45, math.sin(a) * R * 0.45, -0.05), rot_z=a))
    tent = Model(f"{K}_{variant}_tentacles")
    for k in range(lobes):
        a = TAU * k / lobes
        limb(tent, (math.cos(a) * R * 0.9, math.sin(a) * R * 0.9, 0), (math.cos(a) * R * 1.0, math.sin(a) * R * 1.0, -1.3),
             0.06, 0.03, ARM, segs=3)
    tents = tent.build(bell, loc=(0, 0, -0.05))

    def pulse(u):  # a quick squeeze, a slow relax
        p = max(0.0, math.sin(TAU * u)) ** 2
        return (-0.16 * p + 0.04, -0.16 * p + 0.04, 0.2 * p - 0.05)
    sample(bell, clip, "scale", T, pulse)
    sample(bell, clip, "location", T, lambda u: (0, 0, 0.3 * math.sin(TAU * (u - 0.1))))
    for k, arm in enumerate(arms):
        osc(arm, clip, "rotation_euler", T, (0, 0.18, 1, k / len(arms)), (1, 0.12, 1, 0.2 + k / len(arms)))
    sample(tents, clip, "scale", T, lambda u: (0.15 * max(0.0, math.sin(TAU * (u - 0.08))) ** 2,) * 2 + (-0.15 * math.sin(TAU * u),))


# --- Kessra ----------------------------------------------------------------------------------

def sandworm():
    """The rust worm: bursts from a sand crater, rears up maw-first, arcs over and dives back in."""
    K, clip, T = "sandworm", "sandworm_breach_idle", 6.0
    BODY, RING, DARK, TOOTH, THROAT, SAND, SAND_D, HOLE = (
        "#8a4a36", "#c88a62", "#5a2a20", "#f2e6c8", "#ffc83a", "#d8aa6a", "#b08048", "#3a2418")
    root = group(K, kind=K)
    N, STEP = 9, 0.62
    BASE = (0, -1.8, 0)
    s = Model(f"{K}_sand", seed=5)  # crater where it bursts out, and a smaller one where it dives
    for (cx, cy, r, n) in ((0, -1.8, 1.25, 11), (0, 1.8, 0.95, 9)):
        s.cyl(r * 0.8, 0.05, (cx, cy, 0.0), HOLE, segs=n)
        for k in range(n):
            a = TAU * k / n + s.rng.uniform(-0.15, 0.15)
            s.ball(r * 0.42, (cx + math.cos(a) * r, cy + math.sin(a) * r, 0.05), SAND if k % 3 else SAND_D,
                   subdiv=0, scale=(1.2, 1.2, 0.55), jitter=0.06)
    s.build(root)
    segs = []
    parent = root
    for i in range(N):
        r = 0.62 - 0.02 * i if i < N - 1 else 0.78
        g = Model(f"{K}_seg_{i}", seed=50 + i)
        if i < N - 1:
            g.cyl(r, STEP, (0, 0, 0), BODY, segs=8)
            g.cyl(r + 0.07, 0.16, (0, 0, STEP * 0.55), RING, segs=8)
            for k in range(3):  # dark plates on the back (the -y side faces back, +y forward)
                g.box((0.32, 0.18, STEP * 0.6), (0.0, -r + 0.02, STEP * 0.3), DARK)
        else:  # the head: a round maw of teeth, a throat that glows
            g.cyl(r, 0.5, (0, 0, 0), BODY, segs=10, r_top=r * 1.15)
            g.cyl(r * 1.18, 0.16, (0, 0, 0.42), DARK, segs=10)
            g.cyl(r * 0.7, 0.14, (0, 0, 0.5), THROAT, segs=10, glow=True)
            for k in range(10):
                a = TAU * k / 10
                limb(g, (math.cos(a) * r * 1.05, math.sin(a) * r * 1.05, 0.5), (math.cos(a) * r * 0.5, math.sin(a) * r * 0.5, 0.95),
                     0.14, 0.0, TOOTH, segs=4)
        obj = g.build(parent, loc=BASE if i == 0 else (0, 0, STEP))
        segs.append(obj)
        parent = obj
    base = segs[0]
    hidden = -(N - 1) * STEP - 1.8

    # base height over the loop, and how far each joint bends forward (radians, toward +y)
    lift = smooth_keys([(0.0, (0, 0, hidden)), (0.12, (0, 0, hidden)), (0.32, (0, 0, 0)), (0.55, (0, 0, 0)),
                        (0.68, (0, 0, -0.6)), (0.85, (0, 0, -3.5)), (1.0, (0, 0, hidden))])
    bend = smooth_keys([(0.0, (0, 0, 0)), (0.12, (0, 0, 0)), (0.3, (0.12, 0, 0)), (0.42, (0.1, 0, 0)),
                        (0.5, (-0.05, 0, 0)), (0.66, (-math.pi / (N - 1) * 1.05, 0, 0)),
                        (0.85, (-math.pi / (N - 1) * 1.05, 0, 0)), (1.0, (0, 0, 0))])
    sway = lambda u: 0.05 * math.sin(TAU * 3 * u)
    sample(base, clip, "location", T, lift)
    for i, seg in enumerate(segs):
        if i == 0:
            sample(seg, clip, "rotation_euler", T, lambda u: (bend(u)[0] * 0.5, sway(u), 0))
        else:
            sample(seg, clip, "rotation_euler", T, lambda u, i=i: (bend(u)[0] + (0.06 if i > N - 3 else 0) *
                                                                    math.sin(TAU * 2 * u), sway(u + i * 0.05), 0))


def camel_strider():
    """A tall-legged desert beast with a hump, loaded with a striped blanket, bags and a rolled rug."""
    K, clip, T = "camel_strider", "camel_strider_walk_idle", 2.0
    HIDE, DARK, BELLY, BLANKET, STRIPE, BAG, RUG, RUG2, BRASS = (
        "#d0a26a", "#8a643e", "#ecd2a0", "#b8343a", "#f0d050", "#2f6aa8", "#e8e0c8", "#2fa098", "#e0b040")
    root = group(K, kind=K)
    b = Model(f"{K}_body", seed=6)
    b.ball(0.75, (0, 0, 0), HIDE, subdiv=2, scale=(0.85, 1.45, 0.7))
    b.ball(0.55, (0, -0.1, 0.45), HIDE, subdiv=1, scale=(0.9, 1.1, 0.8))                        # hump
    b.box((1.45, 1.0, 0.1), (0, -0.1, 0.62), BLANKET, rot=(0, 0, 0))                           # saddle blanket
    for x in (-0.45, 0, 0.45):
        b.box((0.12, 1.02, 0.12), (x, -0.1, 0.64), STRIPE)
    for s in (1, -1):  # bags slung down each flank
        b.box((0.4, 0.75, 0.7), (s * 0.82, -0.05, 0.1), BAG, rot=(0, s * 0.15, 0))
        b.box((0.42, 0.2, 0.15), (s * 0.84, -0.05, 0.42), BRASS)
        b.box((0.3, 0.45, 0.45), (s * 0.78, 0.65, 0.05), RUG2, rot=(0, s * 0.15, 0))
    limb(b, (-0.75, -0.55, 0.85), (0.75, -0.55, 0.85), 0.24, 0.24, RUG, segs=7)                  # rolled rug
    for x in (-0.4, 0.4):
        limb(b, (x - 0.06, -0.55, 0.85), (x + 0.06, -0.55, 0.85), 0.26, 0.26, BLANKET, segs=7)
    b.cyl(0.18, 0.4, (0.2, 0.35, 0.65), BRASS, segs=6, r_top=0.1)                               # a jar
    limb(b, (0, -0.95, 0.1), (0, -1.35, -0.35), 0.12, 0.04, DARK, segs=4)                       # tail
    body = b.build(root, loc=(0, 0, 3.2))
    for tag, x, y, ph in (("fl", 0.42, 0.75, 0.0), ("fr", -0.42, 0.75, 0.5), ("bl", 0.42, -0.75, 0.5), ("br", -0.42, -0.75, 0.0)):
        u = Model(f"{K}_thigh_{tag}")
        limb(u, (0, 0, 0.1), (0, 0.15, -1.55), 0.2, 0.12, HIDE if y > 0 else DARK, segs=5)
        u.ball(0.15, (0, 0.15, -1.55), DARK, subdiv=0)
        thigh = u.build(body, loc=(x, y, -0.3))
        l = Model(f"{K}_shin_{tag}")
        limb(l, (0, 0, 0), (0, -0.05, -1.3), 0.1, 0.08, DARK, segs=5)
        l.cyl(0.22, 0.12, (0, 0.02, -1.38), DARK, segs=6)
        shin = l.build(thigh, loc=(0, 0.15, -1.55))
        osc(thigh, clip, "rotation_euler", T, (0, 0.3, 1, ph))
        sample(shin, clip, "rotation_euler", T, lambda v, ph=ph: (-0.45 * max(0.0, math.sin(TAU * (v + ph + 0.25))), 0, 0))
    n = Model(f"{K}_neck")
    chain(n, [(0, 0, 0), (0, 0.55, 0.65), (0, 0.75, 1.3)], [0.28, 0.2, 0.17], HIDE, segs=6)
    n.ball(0.25, (0, 0.95, 1.35), HIDE, subdiv=1, scale=(0.75, 1.5, 0.75))
    n.ball(0.18, (0, 1.2, 1.28), BELLY, subdiv=1, scale=(0.8, 1.1, 0.7))
    for s in (1, -1):
        n.box((0.08, 0.12, 0.28), (s * 0.15, 0.8, 1.6), DARK, rot=(0, s * 0.4, 0))
        n.box((0.06, 0.06, 0.06), (s * 0.15, 1.2, 1.36), INK)
        limb(n, (s * 0.2, 1.15, 1.3), (s * 0.24, 0.35, 0.3), 0.025, 0.025, BLANKET, segs=3)       # reins
    n.box((0.3, 0.12, 0.3), (0, 0.4, 0.6), BRASS, rot=(0.5, 0, 0))                              # bell
    neck = n.build(body, loc=(0, 1.05, 0.15))
    osc(body, clip, "location", T, (2, 0.07, 2, 0.1), (0, 0.06, 1, 0.25))
    osc(body, clip, "rotation_euler", T, (1, 0.04, 1, 0.25))
    osc(neck, clip, "rotation_euler", T, (0, 0.1, 2, 0.0), (2, 0.06, 1, 0.0))


# --- Mirefall --------------------------------------------------------------------------------

def beetle():
    """A big swamp beetle: dark sheened shell with glowing spots, a rhino horn, six legs scuttling."""
    K, clip, T = "beetle", "beetle_crawl_idle", 0.8
    SHELL, SHEEN, PRONOT, LEG, GLOW, HORN = "#24384a", "#4a9a8a", "#1a2430", "#141a20", "#8aff8a", "#3a4a3a"
    root = group(K, kind=K)
    b = Model(f"{K}_body", seed=7)
    for s in (1, -1):  # the two wing cases, with a seam down the middle
        b.ball(0.85, (s * 0.44, -0.35, 0), SHELL, subdiv=2, scale=(0.6, 1.55, 0.62))
        b.ball(0.8, (s * 0.48, -0.25, 0.08), SHEEN, subdiv=1, scale=(0.22, 1.2, 0.55))
        for k, (dx, dy) in enumerate(((0.3, 0.2), (0.4, -0.55), (0.25, -1.1))):
            b.ball(0.15, (s * dx, -0.35 + dy, 0.48 - abs(dy) * 0.12), GLOW, subdiv=1, scale=(1, 1, 0.5), glow=True)
    b.ball(0.65, (0, 0.95, 0.0), PRONOT, subdiv=1, scale=(1.15, 0.72, 0.65))                       # pronotum
    b.ball(0.38, (0, 1.45, -0.05), PRONOT, subdiv=1, scale=(1.0, 0.8, 0.7))                         # head
    chain(b, [(0, 1.5, 0.15), (0, 2.05, 0.35), (0, 2.25, 0.85)], [0.17, 0.12, 0.03], HORN, segs=5)   # horn
    _eyes(b, 0.27, 1.62, 0.08, 0.13, GLOW, glow=True)
    for s in (1, -1):
        limb(b, (s * 0.2, 1.7, 0.0), (s * 0.55, 2.2, 0.0), 0.05, 0.03, LEG, segs=3)                  # antennae
        b.box((0.16, 0.16, 0.16), (s * 0.57, 2.24, 0.0), LEG)
    body = b.build(root, loc=(0, 0, 0.8))
    legs = []
    for k, (y, ph) in enumerate(((0.95, 0.0), (0.25, 0.5), (-0.5, 0.0))):
        for s in (1, -1):
            g = Model(f"{K}_leg_{k}{'l' if s < 0 else 'r'}")
            limb(g, (0, 0, 0), (s * 0.7, 0.15 * (1 - k), 0.25), 0.1, 0.08, LEG, segs=4)
            limb(g, (s * 0.7, 0.15 * (1 - k), 0.25), (s * 1.15, 0.35 * (1 - k), -0.78), 0.08, 0.04, LEG, segs=4)
            leg = g.build(body, loc=(s * 0.45, y, -0.25))
            p = ph if s > 0 else ph + 0.5
            sample(leg, clip, "rotation_euler", T,
                   lambda u, p=p, s=s: (0, s * -0.2 * max(0.0, math.sin(TAU * (u + p))), 0.3 * math.cos(TAU * (u + p))))
            legs.append(leg)
    osc(body, clip, "location", T, (2, 0.03, 2, 0), (0, 0.03, 1, 0.25))
    osc(body, clip, "rotation_euler", T, (1, 0.04, 1, 0), (2, 0.03, 1, 0.25))


def moth_swarm():
    """A handful of big glowing moths fluttering together, wings lit violet with dark eyespots."""
    K, clip, T = "moth_swarm", "moth_swarm_flutter_idle", 2.0
    WING, HIND, SPOT, BODY, TIP = "#c8a8ff", "#8ae8b0", "#3a2458", "#4a3a5a", "#d0ff8a"
    root = group(K, kind=K)
    spots = ((0, 0, 3.4), (1.3, 0.9, 2.8), (-1.2, 1.1, 3.9), (1.0, -1.1, 4.2), (-1.4, -0.7, 3.0), (0.2, 1.9, 4.5),
             (-0.1, -1.9, 3.6))
    for i, at in enumerate(spots):
        ph = i * 0.37 % 1
        b = Model(f"{K}_moth_{i}", seed=60 + i)
        b.ball(0.12, (0, 0, 0), BODY, subdiv=1, scale=(0.9, 2.2, 0.9))
        b.ball(0.07, (0, -0.25, 0), TIP, subdiv=0, glow=True)
        for s in (1, -1):
            limb(b, (s * 0.04, 0.22, 0.04), (s * 0.24, 0.48, 0.1), 0.03, 0.02, BODY, segs=3)
        moth = b.build(root, loc=at)
        for s in (1, -1):
            w = Model(f"{K}_moth_{i}_wing_{'l' if s < 0 else 'r'}")
            flat(w, [(0, 0.2), (0, -0.05), (s * 0.55, -0.1), (s * 0.62, 0.3), (s * 0.3, 0.32)][:: s], 0, 0.04, WING, glow=True)
            flat(w, [(0, 0.0), (0, -0.3), (s * 0.28, -0.42), (s * 0.4, -0.12)][:: s], -0.01, 0.04, HIND, glow=True)
            w.ball(0.1, (s * 0.38, 0.12, 0.02), SPOT, subdiv=0, scale=(1, 1, 0.4))
            wing = w.build(moth, loc=(s * 0.08, 0, 0.02))
            osc(wing, clip, "rotation_euler", T, (1, s * 0.75, 8, ph))
        osc(moth, clip, "location", T, (0, 0.35, 1, ph), (1, 0.3, 2, ph + 0.3), (2, 0.25, 3, ph))
        osc(moth, clip, "rotation_euler", T, (2, 0.35, 1, ph + 0.25), (0, 0.1, 8, ph + 0.25))


# --- Glacis ----------------------------------------------------------------------------------

def mammoth():
    """A woolly mammoth: shaggy dark-red coat, domed head, great curling tusks, trunk swinging."""
    K, clip, T = "mammoth", "mammoth_walk_idle", 2.4
    WOOL, DARK, LIGHT, TUSK, SKIN = "#7a4428", "#4a2818", "#a8683a", "#f2ead4", "#3a2a24"
    root = group(K, kind=K)
    RX, RY, RZ = 1.15, 1.45, 1.05
    b = Model(f"{K}_body", seed=8)
    b.ball(1.0, (0, 0, 0), WOOL, subdiv=2, scale=(RX, RY, RZ), jitter=0.05)
    b.ball(0.9, (0, 0.55, 0.45), LIGHT, subdiv=1, scale=(0.95, 0.9, 0.75), jitter=0.06)          # shoulder hump
    for k in range(9):  # tufts of lighter wool along the spine
        y = -1.1 + k * 0.27
        b.ball(0.22, (b.rng.uniform(-0.35, 0.35), y, _top(y, RY, RZ) + (0.25 if y > 0 else 0.0)), LIGHT, subdiv=0,
               scale=(1.4, 1, 0.6))
    for k in range(16):  # a shaggy skirt
        a = TAU * k / 16
        b.box((0.42, 0.42, 0.8), (math.cos(a) * RX * 0.92, math.sin(a) * RY * 0.9, -0.55), DARK, rot=(0, 0, a))
    limb(b, (0, -1.35, 0.1), (0, -1.7, -0.5), 0.12, 0.06, DARK, segs=4)
    body = b.build(root, loc=(0, 0, 2.05))
    for tag, x, y, ph in (("fl", 0.62, 0.8, 0.0), ("fr", -0.62, 0.8, 0.5), ("bl", 0.62, -0.8, 0.5), ("br", -0.62, -0.8, 0.0)):
        g = Model(f"{K}_leg_{tag}")
        limb(g, (0, 0, 0.2), (0, 0, -1.8), 0.42, 0.36, DARK, segs=6)
        g.cyl(0.4, 0.2, (0, 0.03, -1.82), "#c8b8a0", segs=6)
        leg = g.build(body, loc=(x, y, -0.25))
        osc(leg, clip, "rotation_euler", T, (0, 0.3, 1, ph))
    h = Model(f"{K}_head", seed=9)
    h.ball(0.62, (0, 0.35, 0.25), WOOL, subdiv=1, scale=(1.0, 1.0, 1.2), jitter=0.04)
    h.ball(0.45, (0, 0.25, 0.75), LIGHT, subdiv=1, scale=(1.0, 1.0, 0.8))                           # domed crown
    for s in (1, -1):
        h.box((0.18, 0.35, 0.4), (s * 0.6, 0.15, 0.3), DARK, rot=(0, 0, s * 0.3))                    # little ears
        h.box((0.12, 0.12, 0.12), (s * 0.4, 0.82, 0.38), INK)
        chain(h, [(s * 0.3, 0.75, -0.1), (s * 0.6, 1.3, -0.55), (s * 0.85, 1.95, -0.25), (s * 0.7, 2.25, 0.25),
                  (s * 0.35, 2.2, 0.5)], [0.15, 0.14, 0.12, 0.09, 0.04], TUSK, segs=6)
    head = h.build(body, loc=(0, 1.3, 0.35))
    tr = Model(f"{K}_trunk")
    chain(tr, [(0, 0, 0), (0, 0.2, -0.6), (0, 0.25, -1.2), (0, 0.45, -1.55)], [0.24, 0.19, 0.14, 0.11], WOOL, segs=6)
    trunk = tr.build(head, loc=(0, 0.85, 0.15))
    osc(body, clip, "location", T, (2, 0.06, 2, 0.1))
    osc(body, clip, "rotation_euler", T, (1, 0.035, 1, 0.25))
    osc(head, clip, "rotation_euler", T, (0, 0.06, 2, 0.0), (2, 0.06, 1, 0.1))
    osc(trunk, clip, "rotation_euler", T, (0, 0.2, 1, 0.3), (1, 0.15, 1, 0.0))


# --- Ashgrave ------------------------------------------------------------------------------

def crawler():
    """A scavenger walker: a rust hull on four spider legs, a glowing visor, a scrap bin on its back."""
    K, clip, T = "crawler", "crawler_walk_idle", 1.6
    HULL, PLATE, DARK, VISOR, HAZ, SCRAP, SCRAP2, LAMP = (
        "#9a6a42", "#c8a060", "#3a3230", "#ffaa2a", "#e8c040", "#6a7a6a", "#5a4a40", "#ff4a2a")
    root = group(K, kind=K)
    b = Model(f"{K}_body", seed=11)
    b.box((1.3, 1.8, 0.7), (0, 0, 0), HULL, taper=0.85)
    b.box((1.1, 0.7, 0.5), (0, 1.05, -0.05), DARK, taper=0.8)                                     # cab
    b.box((0.85, 0.2, 0.28), (0, 1.42, 0.0), VISOR, glow=True)
    b.box((1.36, 0.25, 0.16), (0, 0.6, 0.38), HAZ)
    for x in (-0.45, 0.45):
        b.box((0.2, 0.26, 0.18), (x, 0.6, 0.39), DARK)
    b.box((1.0, 1.0, 0.45), (0, -0.4, 0.55), PLATE)                                               # scrap bin
    b.box((0.5, 0.45, 0.4), (-0.2, -0.3, 0.9), SCRAP, rot=(0.2, 0.3, 0.4))
    b.box((0.35, 0.55, 0.25), (0.25, -0.55, 0.85), SCRAP2, rot=(-0.3, 0.1, -0.5))
    limb(b, (0.35, -0.75, 0.3), (0.45, -1.0, 1.25), 0.12, 0.1, DARK, segs=5)                      # exhaust stack
    b.cyl(0.13, 0.08, (0.45, -1.0, 1.25), "#ff7a2a", segs=5, glow=True)
    limb(b, (-0.5, -0.8, 0.3), (-0.55, -0.9, 1.4), 0.03, 0.03, DARK, segs=3)                      # antenna
    b.ball(0.12, (-0.55, -0.9, 1.45), LAMP, subdiv=0, glow=True)
    chain(b, [(0.5, 0.9, 0.2), (0.6, 1.5, 0.5), (0.55, 1.9, 0.0)], [0.09, 0.08, 0.07], PLATE, segs=4)  # grab arm
    b.box((0.3, 0.2, 0.3), (0.55, 1.95, -0.1), DARK)
    body = b.build(root, loc=(0, 0, 1.6))
    for k, (x, y, ph) in enumerate(((0.6, 0.65, 0.0), (-0.6, 0.65, 0.5), (0.6, -0.65, 0.5), (-0.6, -0.65, 0.0))):
        s = 1 if x > 0 else -1
        fy = 1 if y > 0 else -1
        g = Model(f"{K}_leg_{k}")
        limb(g, (0, 0, 0), (s * 0.9, fy * 0.45, 0.55), 0.13, 0.1, DARK, segs=5)
        g.ball(0.16, (s * 0.9, fy * 0.45, 0.55), HAZ, subdiv=0)
        limb(g, (s * 0.9, fy * 0.45, 0.55), (s * 1.4, fy * 0.7, -1.55), 0.09, 0.05, PLATE, segs=5)
        g.cyl(0.15, 0.1, (s * 1.4, fy * 0.7, -1.62), DARK, segs=5)
        leg = g.build(body, loc=(s * 0.55, y, -0.1))
        sample(leg, clip, "rotation_euler", T,
               lambda u, ph=ph, s=s: (0, -s * 0.2 * max(0.0, math.sin(TAU * (u + ph))), 0.28 * math.cos(TAU * (u + ph)) * s))
    osc(body, clip, "location", T, (2, 0.06, 2, 0), (0, 0.04, 1, 0.25))
    osc(body, clip, "rotation_euler", T, (1, 0.04, 1, 0.1), (0, 0.03, 2, 0))


# --- Vesh ------------------------------------------------------------------------------------

def sky_whale():
    """The showpiece: a drift-calf, an umora calf grazing the plankton haze at height 5
    (docs/npcs/the-umora.md). Three gas bladders, pale and veined, carry its first two shell
    chambers (glass-like, ringed with growth lines); an intake of grinding plates at the front, a
    fringe of feeding fronds trailing under it, and the little black vanes it will one day climb to
    orbit on, folded along its sides. It drifts, the bladders breathing and the fronds swaying."""
    K, clip, T = "sky_whale", "sky_whale_swim_idle", 6.0
    SHELL, CLEAR, RING, BLAD, BLAD2, VEIN = "#7aa4c4", "#c8e2ee", "#9cc0d8", "#d8c8e8", "#eee4f6", "#a07ab0"
    VANE, SHEEN, GLOW, FROND, FROND2 = "#1a1e2c", "#3e3866", "#8affff", "#ff7a9a", "#ffb0c0"
    root = group(K, kind=K)
    b = Model(f"{K}_body", seed=12)
    # the first two chambers, slung under the bladders: the front one bigger, the second just begun
    for y, rx, ry, rz in ((2.0, 1.25, 1.7, 0.95), (-0.3, 0.95, 1.1, 0.75)):
        b.ball(1.0, (0, y, -0.4), SHELL, subdiv=2, scale=(rx, ry, rz))
        b.ball(1.0, (0, y, -0.4 + rz * 0.8), RING, subdiv=1, scale=(rx * 0.68, ry * 0.7, 0.24))     # growth lines
        b.ball(1.0, (0, y, -0.4 + rz * 0.9), CLEAR, subdiv=1, scale=(rx * 0.38, ry * 0.42, 0.2))
    b.cyl(0.5, 0.5, (0, 0.8, -0.4), "#2a4a6a", segs=8, rot=(-math.pi / 2, 0, 0))   # the join
    # the intake at the front: a small ring of grinding plates round a dark opening
    b.cyl(0.62, 0.3, (0, 3.35, -0.4), SHELL, segs=8, r_top=0.7, rot=(-math.pi / 2, 0, 0))
    b.cyl(0.44, 0.1, (0, 3.62, -0.4), INK, segs=8, rot=(-math.pi / 2, 0, 0))
    for k in range(6):
        a = TAU * k / 6
        b.box((0.3, 0.22, 0.14), (math.cos(a) * 0.62, 3.6, -0.4 + math.sin(a) * 0.62), CLEAR, rot=(0, -a + math.pi / 2, 0))
    # the vent at the back
    b.cyl(0.3, 0.4, (0, -1.45, -0.45), SHELL, segs=6, r_top=0.4, rot=(math.pi / 2, 0, 0))
    # the bladders: one big behind the chambers, two smaller behind it, veined, lit from inside here and there
    rng = b.rng
    for x, y, z, r, sc in ((0, -2.3, 0.6, 1.0, (1.45, 1.7, 1.25)), (1.35, -3.7, 0.3, 1.0, (0.9, 1.1, 0.85)),
                           (-1.35, -3.7, 0.3, 1.0, (0.9, 1.1, 0.85))):
        b.ball(r, (x, y, z), BLAD, subdiv=2, scale=sc)
        b.ball(r, (x, y, z + sc[2] * 0.3), BLAD2, subdiv=1, scale=(sc[0] * 0.7, sc[1] * 0.75, sc[2] * 0.75))
        for k in range(4):                                                           # veins
            a = TAU * k / 4 + 0.4
            limb(b, (x, y, z + sc[2] * 0.98), (x + math.cos(a) * sc[0] * 0.85, y + math.sin(a) * sc[1] * 0.85, z + sc[2] * 0.4),
                 0.06, 0.04, VEIN, segs=4)
        for k in range(3):
            a = rng.uniform(0, TAU)
            b.ball(0.12, (x + math.cos(a) * sc[0] * 0.75, y + math.sin(a) * sc[1] * 0.75, z + sc[2] * 0.55), GLOW, subdiv=0, glow=True)
    for s in (1, -1):                                                                # tethers, bladder to shell
        limb(b, (s * 0.5, -0.6, -0.1), (s * 1.1, -3.2, 0.2), 0.1, 0.08, VEIN, segs=4)
    body = b.build(root, loc=(0, 0, 5.0))
    # the fronds, in two fringes that sway out of step
    fringes = []
    for side, y0 in ((0, 2.4), (1, 0.4)):
        f = Model(f"{K}_fronds_{side}")
        for k in range(7):
            a = TAU * (k + side * 0.5) / 7
            x, y = math.cos(a) * 0.9, math.sin(a) * 0.6
            tip = (x * 1.4, y - 0.9, -2.0 - 0.3 * (k % 3))
            chain(f, [(x, y, 0), (x * 1.2, y - 0.4, -1.0), tip], [0.12, 0.09, 0.05], FROND if k % 2 else FROND2, segs=4)
            f.ball(0.12, tip, GLOW, subdiv=0, glow=True)
        fringes.append(f.build(body, loc=(0, y0, -1.0)))
    # the first vanes, still stubs, folded tight along the shell: black membrane on a pale spine
    fins = []
    for s in (1, -1):
        f = Model(f"{K}_fin_{'l' if s < 0 else 'r'}")
        flat(f, [(0, 0.4), (0, -0.4), (s * 0.35, -2.4), (s * 0.7, -2.0), (s * 0.55, -0.2)][:: s], 0, 0.1, VANE)
        flat(f, [(s * 0.2, -0.6), (s * 0.4, -1.8), (s * 0.55, -1.5)][:: s], 0.06, 0.04, SHEEN)
        limb(f, (0, 0.3, 0.05), (s * 0.35, -2.4, 0.05), 0.11, 0.05, CLEAR, segs=4)
        f.ball(0.13, (0, 0.3, 0.05), CLEAR, subdiv=0)
        fin = f.build(body, loc=(s * 1.2, 2.2, -0.45))
        fins.append((fin, s))

    osc(body, clip, "location", T, (2, 0.3, 1, 0.0), (1, 0.1, 1, 0.25))
    osc(body, clip, "rotation_euler", T, (0, 0.04, 1, 0.25), (1, 0.03, 1, 0.0))
    for k, fr in enumerate(fringes):
        osc(fr, clip, "rotation_euler", T, (0, 0.22, 1, 0.5 * k), (1, 0.08, 2, 0.25 * k))
    for fin, s in fins:
        osc(fin, clip, "rotation_euler", T, (1, s * 0.12, 1, 0.1), (2, s * 0.08, 1, 0.35))


def build():
    sauropod()
    raptor_pack()
    plesiosaur()
    pterosaur_flock()
    jellyfish(0)
    jellyfish(1)
    sandworm()
    camel_strider()
    beetle()
    moth_swarm()
    mammoth()
    crawler()
    sky_whale()
    linearize()
