"""Mirefall's own enemies: the Hive, a bioluminescent swamp of insects and fungal rot. Everything
is dark-bodied (the swamp floors are dark violet and peat), so each one carries a big pale top
pattern in its B slot and lots of glowing C: glow is this moon's signature.

    glowmoth        swarm    a fat moth with broad pale wings and two glowing eyespots, lantern tail
    hive_needle     dart     a lance wasp: swept blade wings, green chevrons, a glowing proboscis needle
    spitter_pod     turret   a fungal gourd cluster on glowing mycelium; the head is a ribbed spitting bulb
    bog_shellback   brute    a rhino bog beetle, mossy striped elytra sprouting glowcaps, buzzing wings
    brood_sac       carrier  a bloated hive queen: banded egg-swollen abdomen, glowing brood, rear bay
    mire_eel        serpent  a lure-headed swamp eel: pale saddles, magenta photophores, ribbon fins
    channel_keeper  (eel)    the Mire Eel on the water: a Tonkva-grown dredger, ceramic back plates,
                             paddle vanes, the bloom's sacs on its back; rigged by src/view/eel-rig.ts
Seeds 4000-4999.
"""
from __future__ import annotations

import math

from kit import Model
from creatures_util import TAU, chain, flat, limb, osc, sample
from enemies_lib import A, B, C, DARK, both, eyes, fin, marker, mirror, named, pulse, tube, wing_pair

BONE = "#e8e0c8"


# --- Glowmoth: swarm, ~1.2 (wingspan 1.8) ------------------------------------------------------

def glowmoth():
    kind, clip, root = named("glowmoth", "swarm", "beast", "flap", preview=("#8a6ac0", "#d0c0ff", "#8aff8a"))
    T = 0.6
    b = Model(f"{kind}_body", seed=4001)
    b.ball(0.2, (0, 0.12, 0.02), A, subdiv=1, scale=(1.0, 1.15, 0.9))                       # thorax
    b.ball(0.2, (0, 0.27, 0.06), B, subdiv=1, scale=(1.15, 0.6, 0.8), jitter=0.02)          # pale fur ruff
    for k, (y, r) in enumerate(((-0.12, 0.17), (-0.3, 0.15), (-0.46, 0.12))):              # banded abdomen
        b.ball(r, (0, y, 0.0), A if k % 2 == 0 else B.shade(0.85), subdiv=1, scale=(1, 1.1, 0.9))
    b.ball(0.13, (0, 0.42, 0.05), A.shade(0.8), subdiv=1)                                   # head
    for s in (1, -1):
        b.ball(0.08, (s * 0.09, 0.48, 0.09), C, subdiv=1, glow=True)                        # eyes
        # feathery antennae: a stalk and a broad pale leaf
        limb(b, (s * 0.05, 0.5, 0.12), (s * 0.24, 0.8, 0.16), 0.025, 0.02, A.shade(0.7), segs=3)
        flat(b, [(s * 0.06, 0.55), (s * 0.18, 0.6), (s * 0.3, 0.84), (s * 0.2, 0.82)][::s], 0.15, 0.03, B)
    body = b.build(root)
    lantern = Model(f"{kind}_lantern")
    lantern.ball(0.14, (0, 0, 0), C, subdiv=1, scale=(1, 1.2, 0.9), glow=True)
    lamp = lantern.build(body, loc=(0, -0.6, 0.0))
    pulse(lamp, clip, T, 0.25)

    def fore(w, s):  # dark border, a big eyespot ringed dark, a pale vein
        flat(w, [(s * 0.62, 0.42), (s * 0.82, 0.32), (s * 0.92, 0.16), (s * 0.86, 0.12),
                 (s * 0.76, 0.27), (s * 0.58, 0.36)][::s], 0.025, 0.03, A.shade(0.75))
        w.cyl(0.2, 0.03, (s * 0.52, 0.12, 0.01), A.shade(0.7), segs=8)
        w.cyl(0.13, 0.04, (s * 0.52, 0.12, 0.02), C, segs=8, glow=True)
        limb(w, (0, 0.04, 0.03), (s * 0.3, 0.06, 0.03), 0.03, 0.02, A, segs=3)

    def hind(w, s):
        w.cyl(0.09, 0.04, (s * 0.42, -0.36, 0.02), C, segs=6, glow=True)
        flat(w, [(s * 0.5, -0.52), (s * 0.66, -0.36), (s * 0.6, -0.33), (s * 0.46, -0.46)][::s], 0.02, 0.03, A.shade(0.75))

    wings = wing_pair(body, f"{kind}_fore", (0.12, 0.16, 0.06),
              [(0, 0.14), (0, -0.06), (0.35, -0.14), (0.78, -0.04), (0.92, 0.16), (0.8, 0.36), (0.55, 0.44), (0.25, 0.3)],
              0.04, B, clip, T, 0.65, dihedral=0.1, extra=fore)
    wings += wing_pair(body, f"{kind}_hind", (0.1, -0.02, 0.03),
              [(0, 0.04), (0, -0.16), (0.2, -0.48), (0.48, -0.58), (0.68, -0.36), (0.5, -0.06)],
              0.04, B.shade(0.85), clip, T, 0.55, phase=0.06, dihedral=0.1, extra=hind)
    for w in wings:
        w.scale = (0.86, 0.86, 1.0)
    marker(body, kind, "muzzle", (0, 0.6, 0.0))
    osc(body, clip, "location", T, (2, 0.07, 1, 0.5), (0, 0.03, 1, 0.25))


# --- Hive Needle: dart, ~2.2 -------------------------------------------------------------------

def hive_needle():
    kind, clip, root = named("hive_needle", "dart", "beast", "fly", preview=("#d8a848", "#8aff8a", "#ff4aff"))
    T = 0.5
    b = Model(f"{kind}_body", seed=4002)
    # the needle: a long lance of a proboscis, glowing at the tip
    limb(b, (0, 0.62, 0.02), (0, 0.98, 0.02), 0.08, 0.05, B, segs=5)
    limb(b, (0, 0.98, 0.02), (0, 1.18, 0.02), 0.06, 0.0, C, segs=5, glow=True)
    b.ball(0.18, (0, 0.5, 0.04), A, subdiv=1, scale=(1.05, 0.95, 0.85))                     # head
    for s in (1, -1):
        b.ball(0.13, (s * 0.15, 0.53, 0.08), C, subdiv=1, scale=(0.8, 1.1, 1.0), glow=True)  # compound eyes
    b.ball(0.24, (0, 0.18, 0.04), A, subdiv=1, scale=(1.0, 1.35, 0.85))                     # thorax
    b.box((0.26, 0.46, 0.08), (0, 0.18, 0.24), B)                                           # green stripe
    for s in (1, -1):  # three pairs of thin dark legs tucked back
        for k, y in enumerate((0.3, 0.16, 0.02)):
            limb(b, (s * 0.15, y, -0.1), (s * (0.36 + k * 0.05), y - 0.25 - k * 0.1, -0.22), 0.04, 0.02, DARK, segs=3)
    limb(b, (0, -0.04, 0.02), (0, -0.16, 0.02), 0.07, 0.07, A.shade(0.6), segs=5)           # wasp waist
    # a long spindle abdomen, green chevrons on top
    chain(b, [(0, -0.15, 0.02), (0, -0.45, 0.05), (0, -0.8, 0.02), (0, -1.05, -0.02)], [0.16, 0.27, 0.2, 0.06], A, segs=7)
    for k, (y, w) in enumerate(((-0.34, 0.34), (-0.58, 0.38), (-0.82, 0.26))):
        z = 0.24 - k * 0.05
        for s in (1, -1):
            b.box((w * 0.7, 0.18, 0.07), (s * w * 0.28, y - w * 0.12, z + 0.03), B, rot=(0, 0, -s * 0.5))
    limb(b, (0, -1.02, -0.02), (0, -1.22, -0.04), 0.07, 0.0, C, segs=4, glow=True)          # stinger
    b.ball(0.1, (0, -0.95, 0.06), C, subdiv=0, glow=True)                                    # venom sac
    body = b.build(root)

    def vein(w, s):
        limb(w, (0, 0.0, 0.03), (s * 0.78, -0.88, 0.03), 0.03, 0.015, B, segs=3)
        w.box((0.12, 0.2, 0.05), (s * 0.74, -0.86, 0.03), C, rot=(0, 0, s * 0.7), glow=True)
    for k, (y, span, ph) in enumerate(((0.28, 1.0, 0.0), (0.1, 0.75, 0.5))):
        outline = [(0, 0.08), (0, -0.1), (span * 0.55, -span * 0.7), (span * 0.92, -span * 1.02),
                   (span * 0.98, -span * 0.86), (span * 0.35, -span * 0.12)]
        wing_pair(body, f"{kind}_wing_{k}", (0.12, y, 0.14), outline, 0.03, A.shade(1.35), clip, T, 0.3, harm=4,
                  phase=ph, dihedral=0.08, extra=vein if k == 0 else None)
    marker(body, kind, "muzzle", (0, 1.22, 0.02))
    osc(body, clip, "location", T, (2, 0.04, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.05, 1, 0.25))


# --- Spitter Pod: ground turret, ~2.5, aiming head -----------------------------------------------

def spitter_pod():
    kind, clip, root = named("spitter_pod", "turret", "beast", "spit", ground=1,
                             preview=("#5a4a6a", "#8aff8a", "#ffe04a"))
    T = 2.0
    b = Model(f"{kind}_base", seed=4003)
    b.ball(0.85, (0, 0, 0.05), A.shade(0.55), subdiv=1, scale=(1.3, 1.25, 0.4), jitter=0.06)  # rotted mound
    for k in range(6):  # mycelium roots, glowing threads along their backs
        a = TAU * k / 6 + 0.25
        x0, y0 = math.cos(a) * 0.6, math.sin(a) * 0.6
        x1, y1 = math.cos(a + 0.25) * 1.22, math.sin(a + 0.25) * 1.22
        limb(b, (x0, y0, 0.2), (x1, y1, 0.0), 0.17, 0.06, A.shade(0.7), segs=4)
        limb(b, (x0, y0, 0.34), (x1 * 0.95, y1 * 0.95, 0.08), 0.06, 0.03, C, segs=3, glow=True)
    for k, (a, r, d) in enumerate(((1.1, 0.34, 0.92), (2.75, 0.3, 0.95), (4.4, 0.38, 0.85))):  # young pods
        x, y = math.cos(a) * d, math.sin(a) * d
        b.ball(r, (x, y, r * 0.7), A, subdiv=1, scale=(1, 1, 0.85))
        b.cyl(r * 0.7, 0.1, (x, y, r * 1.2), B, segs=7)
        b.cyl(r * 0.4, 0.08, (x, y, r * 1.28), C, segs=7, glow=True)                        # glowing pore
    limb(b, (0, 0, 0.2), (0, 0, 0.7), 0.42, 0.34, A.shade(0.8), segs=7)                     # stalk
    base = b.build(root)

    h = Model(f"{kind}_head", seed=4004)
    h.ball(1.0, (0, -0.1, 0.45), A, subdiv=2, scale=(0.64, 0.7, 0.56))                      # the bulb
    for i in range(4):  # pale ribs over it, meeting at the crown
        h.ball(1.0, (0, -0.1, 0.45), B, subdiv=2, scale=(0.13, 0.72, 0.585), rot=(0, 0, TAU * i / 8 + TAU / 16))
    for i in range(4):
        h.ball(1.0, (0, -0.1, 0.45), B, subdiv=2, scale=(0.13, 0.72, 0.585), rot=(0, 0, -TAU * i / 8 - TAU / 16 + math.pi))
    limb(h, (0, 0.25, 0.45), (0, 0.85, 0.6), 0.32, 0.24, A.shade(0.9), segs=7)               # spout
    h.cyl(0.3, 0.12, (0, 0.85, 0.62), B, segs=7, rot=(-math.pi / 2 + 0.2, 0, 0))           # puckered lip
    h.cyl(0.2, 0.14, (0, 0.88, 0.62), C, segs=7, rot=(-math.pi / 2 + 0.2, 0, 0), glow=True)  # yellow throat
    for k in range(5):  # lip barbs
        a = TAU * k / 5 + 0.3
        limb(h, (math.cos(a) * 0.26, 0.9, 0.62 + math.sin(a) * 0.26),
             (math.cos(a) * 0.4, 1.08, 0.66 + math.sin(a) * 0.4), 0.06, 0.0, BONE, segs=3)
    for s in (1, -1):
        h.ball(0.12, (s * 0.32, 0.32, 0.82), C, subdiv=1, glow=True)                        # eyes
    head = h.build(base, loc=(0, 0, 0.72), part="head")
    head.name = f"{kind}_head"
    sac = Model(f"{kind}_sac")
    sac.ball(0.26, (0, 0, 0), C, subdiv=1, scale=(1, 1.1, 0.7), glow=True)
    sac.cyl(0.36, 0.1, (0, 0, -0.14), A.shade(0.7), segs=8)
    sac_obj = sac.build(head, loc=(0, -0.12, 0.98))
    # a slow fill, then a sharp squeeze (the spit)
    sample(sac_obj, clip, "scale", T, lambda u: (0.35 * u - 0.15 if u < 0.85 else 0.2 - 2.33 * (u - 0.85),) * 3)
    sample(head, clip, "location", T, lambda u: (0, -0.12 * max(0.0, 1 - abs(u - 0.9) / 0.1), 0))
    marker(head, kind, "muzzle", (0, 1.05, 0.66))


# --- Bog Shellback: brute, ~6 --------------------------------------------------------------------

def bog_shellback():
    kind, clip, root = named("bog_shellback", "brute", "beast", "buzz", preview=("#3a4a3a", "#7a8a5a", "#8aff8a"))
    T = 1.6
    b = Model(f"{kind}_body", seed=4005)
    b.ball(1.0, (0, -0.2, -0.2), A.shade(0.55), subdiv=2, scale=(1.75, 2.5, 0.75))          # dark underbody rim
    for s in (1, -1):  # six legs, reaching out like oars
        for k, (y, reach) in enumerate(((1.3, 0.9), (0.2, 1.1), (-1.0, 1.0))):
            x0 = s * 1.4
            chain(b, [(x0, y, -0.3), (s * (1.4 + reach * 0.6), y + 0.15 - k * 0.2, -0.15),
                      (s * (1.4 + reach), y - 0.35 - k * 0.15, -0.55)], [0.2, 0.15, 0.06], DARK, segs=5)
    b.ball(0.85, (0, 1.55, 0.15), A, subdiv=1, scale=(1.55, 0.95, 0.75))                    # pronotum
    b.ball(0.8, (0, 1.6, 0.34), B, subdiv=1, scale=(1.15, 0.72, 0.68))                      # mossy shield
    b.ball(0.5, (0, 2.35, 0.05), A.shade(0.8), subdiv=1, scale=(1.2, 0.8, 0.7))             # head
    eyes(b, 0.48, 2.5, 0.15, 0.17, pupil=False)
    chain(b, [(0, 2.45, 0.35), (0, 2.95, 0.6), (0, 3.15, 1.05)], [0.26, 0.18, 0.03], B.shade(1.2), segs=5)  # horn
    for s in (1, -1):
        chain(b, [(s * 0.3, 2.65, -0.05), (s * 0.55, 3.0, -0.05), (s * 0.25, 3.2, -0.05)], [0.13, 0.1, 0.02], BONE, segs=4)
        limb(b, (s * 0.65, 1.95, 0.55), (s * 1.0, 2.35, 0.7), 0.14, 0.0, B.shade(1.2), segs=4)  # shield prongs
    body = b.build(root)

    # hindwings first (under the shells), buzzing
    def veins(w, s):
        limb(w, (0, 0.1, 0.03), (s * 1.9, -1.0, 0.03), 0.06, 0.03, A, segs=3)
        limb(w, (s * 0.3, -0.1, 0.03), (s * 1.2, -1.6, 0.03), 0.05, 0.03, A, segs=3)
    wing_pair(body, f"{kind}_wing", (0.6, 0.85, 0.0),
              [(0, 0.3), (0, -0.2), (0.6, -1.4), (1.3, -1.9), (2.0, -1.3), (2.05, -0.8), (1.2, 0.0)],
              0.05, B.shade(1.35), clip, T, 0.28, harm=8, dihedral=0.05, extra=veins)
    for k, s in enumerate((1, -1)):  # the elytra: domed shells, mossy stripes, glowcaps sprouting
        e = Model(f"{kind}_elytron_{k}", seed=4006 + k)
        e.ball(1.0, (s * 0.85, -1.15, 0), B, subdiv=2, scale=(0.95, 2.35, 0.85), rot=(0, 0, -s * 0.06))
        for dx, w, ln in ((0.42, 0.13, 2.0), (1.25, 0.16, 1.9)):  # dark stripes over the moss, following the dome
            zt = math.sqrt(max(0.0, 1 - ((dx - 0.85) / 0.95) ** 2)) * 0.85
            e.ball(1.0, (s * dx, -1.15, 0), A, subdiv=2, scale=(w, ln, zt + 0.08), rot=(0, 0, -s * 0.06))
        e.ball(1.0, (s * 0.85, -2.6, 0), A, subdiv=1, scale=(0.6, 0.6, 0.5))                     # dark shell tip
        e.ball(1.0, (s * 1.55, -1.1, -0.05), A.shade(0.7), subdiv=1, scale=(0.3, 2.0, 0.5))      # dark outer lip
        e.box((0.1, 4.2, 0.1), (s * 0.04, -1.15, 0.72), DARK)                               # suture
        for (dx, dy, r) in ((0.95, -0.2, 0.32), (1.25, -0.5, 0.2), (0.85, -2.2, 0.28), (1.2, -1.85, 0.18))[k * 2:k * 2 + 2] + \
                ((0.6, -1.2 + k * 0.5, 0.22),):
            zt = math.sqrt(max(0.0, 1 - ((dx - 0.85) / 0.95) ** 2 - ((dy + 1.15) / 2.35) ** 2)) * 0.85
            e.cyl(0.06, 0.25, (s * dx, dy, zt), BONE, segs=4)
            e.cyl(r * 1.15, 0.06, (s * dx, dy, zt + 0.17), A.shade(0.6), segs=7)
            e.cyl(r, r * 0.6, (s * dx, dy, zt + 0.22), C, segs=7, r_top=r * 0.3, glow=True)
        el = e.build(body, loc=(0, 1.0, 0.1))
        osc(el, clip, "rotation_euler", T, (1, -s * 0.05, 2, 0.0))
    for k, s in enumerate((1, -1)):
        marker(body, kind, "muzzle", (s * 0.35, 3.2, 0.0), k)
    osc(body, clip, "location", T, (2, 0.1, 1, 0.5))
    osc(body, clip, "rotation_euler", T, (1, 0.03, 1, 0))


# --- Brood Sac: carrier, ~7 ---------------------------------------------------------------------

def brood_sac():
    kind, clip, root = named("brood_sac", "carrier", "beast", "breathe", preview=("#8a5a7a", "#e0b0c0", "#8aff8a"))
    T = 2.4
    b = Model(f"{kind}_body", seed=4008)
    b.ball(0.42, (0, 3.0, 0.15), A.shade(0.7), subdiv=1, scale=(1.15, 0.9, 0.8))            # small queen head
    eyes(b, 0.3, 3.15, 0.3, 0.13, pupil=False)
    for s in (1, -1):
        chain(b, [(s * 0.15, 3.3, 0.1), (s * 0.35, 3.55, 0.1), (s * 0.12, 3.75, 0.1)], [0.1, 0.07, 0.02], BONE, segs=4)
        chain(b, [(s * 0.2, 3.25, 0.4), (s * 0.6, 3.5, 0.55), (s * 0.95, 3.4, 0.5)], [0.05, 0.04, 0.03], A.shade(0.6), segs=3)
    b.ball(0.5, (0, 2.35, 0.2), A, subdiv=1, scale=(1.1, 1.0, 0.8))                         # thorax
    b.box((0.4, 0.5, 0.1), (0, 2.35, 0.6), B)
    for s in (1, -1):  # tiny legs, useless under that weight
        for k, y in enumerate((2.6, 2.35, 2.1)):
            chain(b, [(s * 0.4, y, 0.0), (s * 0.85, y + 0.1 - k * 0.15, 0.0), (s * 1.0, y - 0.15 - k * 0.15, -0.35)],
                  [0.09, 0.07, 0.03], DARK, segs=4)
    body = b.build(root)
    wing_pair(body, f"{kind}_wing", (0.35, 2.4, 0.5),
              [(0, 0.2), (0, -0.15), (0.5, -0.5), (1.3, -0.55), (1.5, -0.3), (0.9, 0.12)],
              0.04, B.shade(0.9), clip, T, 0.35, harm=6, dihedral=0.15)

    # the swollen abdomen: pale membrane, dark plates in bands, brood glowing between them
    a = Model(f"{kind}_abdomen", seed=4009)
    RX, RY, RZ = 2.0, 2.6, 1.2
    a.ball(1.0, (0, 0, 0), B, subdiv=2, scale=(RX, RY, RZ * 0.9))
    a.ball(1.0, (0, 0, -0.25), A.shade(0.6), subdiv=2, scale=(RX * 0.95, RY * 0.97, RZ * 0.8))  # dark belly rim
    for k, y in enumerate((1.8, 1.0, 0.2, -0.6, -1.4, -2.1)):  # tergite plates
        c = math.sqrt(max(0.0, 1 - (y / RY) ** 2))
        ex, ez = RX * c, RZ * 0.9 * c
        th = [0.72 + (math.pi - 1.44) * i / 6 for i in range(7)]
        arch = [(ex * 1.03 * math.cos(t), ez * 1.06 * math.sin(t) + 0.04) for t in th] + \
               [(ex * 0.85 * math.cos(t), ez * 0.85 * math.sin(t)) for t in reversed(th)]
        a.prism(arch, 0.44 * (0.6 + 0.4 * c), (0, y, 0), A, rot=(0, 0, 0.05 * ((k * 7) % 3 - 1)))
        if k < 5:  # glowing eggs showing through the membrane between plates
            yy = y - 0.42
            cc = math.sqrt(max(0.0, 1 - (yy / RY) ** 2))
            for i, x in enumerate((-0.75, 0.0, 0.75) if k % 2 == 0 else (-0.4, 0.4)):
                a.ball(0.17, (x * cc, yy, RZ * 0.9 * cc * math.sqrt(max(0.0, 1 - (x / RX) ** 2)) - 0.02), C,
                       subdiv=1, scale=(1, 0.9, 0.8), glow=True)
    a.cyl(0.42, 0.25, (0, -RY + 0.15, 0.1), A.shade(0.7), segs=8, rot=(math.pi / 2, 0, 0))   # rear lips
    a.cyl(0.3, 0.12, (0, -RY + 0.05, 0.1), C, segs=8, rot=(math.pi / 2, 0, 0), glow=True)    # glowing brood vent
    for s in (1, -1):  # pores along the flanks
        for k, y in enumerate((1.2, 0.0, -1.2)):
            c = math.sqrt(max(0.0, 1 - (y / RY) ** 2))
            a.ball(0.14, (s * RX * c * 0.93, y - 0.3, 0.25), C, subdiv=0, glow=True)
    ab = a.build(body, loc=(0, -0.9, 0.0))
    osc(ab, clip, "scale", T, (0, 0.05, 1, 0), (2, 0.07, 1, 0.1), (1, 0.03, 1, 0.2))
    for k in range(3):  # a wave of light running back through the brood
        g = Model(f"{kind}_glow_{k}")
        g.ball(0.24, (0, 0, 0), C, subdiv=1, scale=(1.2, 1, 0.6), glow=True)
        y = 1.38 - k * 1.6
        c = math.sqrt(max(0.0, 1 - (y / RY) ** 2))
        obj = g.build(ab, loc=(0, y, RZ * 0.9 * c + 0.02))
        pulse(obj, clip, T, 0.4, phase=-k / 3)
    marker(ab, kind, "bay", (0, -RY - 0.1, 0.1))
    marker(body, kind, "muzzle", (0, 3.75, 0.1))
    osc(body, clip, "location", T, (2, 0.14, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.025, 1, 0.25))


# --- Mire Eel: serpent, 2.0 per segment ----------------------------------------------------------

SEG = 2.0


def _ribbon(parent, name, s, y0, y1, width, clip, T, phase):
    """A rippling side fin along one flank."""
    f = Model(name)
    pts = [(0, y1), (0, y0), (width * 0.7, y0 + 0.1), (width, (y0 + y1) / 2), (width * 0.7, y1 - 0.1)]
    flat(f, pts if s > 0 else mirror(pts), 0, 0.06, A.shade(0.7))
    flat(f, [(width * 0.3, y1 - 0.2), (width * 0.3, y0 + 0.2), (width * 0.9, (y0 + y1) / 2)] if s > 0 else
         mirror([(width * 0.3, y1 - 0.2), (width * 0.3, y0 + 0.2), (width * 0.9, (y0 + y1) / 2)]), 0.03, 0.04, B)
    obj = f.build(parent, loc=(s * 0.5, 0, -0.05))
    osc(obj, clip, "rotation_euler", T, (1, s * 0.3, 1, phase))
    return obj


def mire_eel():
    T = 1.2
    pv = ("#4e6e66", "#c0dca0", "#ff4aff")

    # head: a broad flat moray head, a lure dangling over the jaws
    kind, clip, root = named("mire_eel_head", "serpent", "beast", "bite", seg_length=SEG, preview=pv)
    h = Model(f"{kind}_body", seed=4010)
    tube(h, 0.55, -1.0, -0.4, 0, 0, A, segs=8)
    h.ball(0.7, (0, -0.25, 0.02), A, subdiv=1, scale=(1.2, 1.2, 0.72))                       # skull
    h.ball(0.5, (0, 0.45, 0.0), A, subdiv=1, scale=(1.05, 1.3, 0.5))                         # snout
    h.ball(1.0, (0, -0.2, 0.0), B, subdiv=2, scale=(0.62, 0.75, 0.56))                       # pale crown
    h.ball(1.0, (0, 0.42, 0.0), B, subdiv=1, scale=(0.26, 0.6, 0.33))                        # snout blaze
    h.ball(1.0, (0, -0.8, 0.0), B, subdiv=1, scale=(0.44, 0.34, 0.58))                        # first saddle
    for s in (1, -1):
        h.ball(0.17, (s * 0.42, 0.25, 0.22), C, subdiv=1, glow=True)                          # eyes
        h.box((0.06, 0.12, 0.2), (s * 0.45, 0.33, 0.3), DARK)
        for i in range(3):  # glowing gill slits
            h.box((0.22, 0.07, 0.08), (s * 0.68, -0.35 - i * 0.16, 0.16), C, rot=(0, 0, s * 0.4), glow=True)
        for i in range(4):  # fangs
            h.cyl(0.05, 0.2, (s * (0.32 - i * 0.04), 0.35 + i * 0.2, -0.12), BONE, segs=4, r_top=0.0, rot=(math.pi, 0, 0))
    head = h.build(root)
    j = Model(f"{kind}_jaw")
    j.ball(0.4, (0, 0.45, -0.05), A.shade(0.75), subdiv=1, scale=(1.05, 1.45, 0.4))
    j.box((0.5, 0.8, 0.05), (0, 0.5, 0.06), C, glow=True)                                    # glowing gullet
    jaw = j.build(head, loc=(0, 0.0, -0.18))
    osc(jaw, clip, "rotation_euler", T, (0, 0.2, 1, 0.0))
    lure = Model(f"{kind}_lure")
    chain(lure, [(0, 0, 0), (0, 0.2, 0.45), (0, 0.65, 0.6), (0, 1.0, 0.45)], [0.07, 0.06, 0.05, 0.04], B.shade(0.8), segs=4)
    lure.ball(0.17, (0, 1.05, 0.35), C, subdiv=1, glow=True)
    lo = lure.build(head, loc=(0, 0.0, 0.42))
    osc(lo, clip, "rotation_euler", T, (2, 0.18, 1, 0.25), (0, 0.08, 2, 0))
    for k, s in enumerate((1, -1)):
        _ribbon(head, f"{kind}_fin_{k}", s, -1.0, -0.5, 0.42, clip, T, 0.0)
    marker(head, kind, "muzzle", (0, 1.15, 0))

    # body: tiling; a pale oval saddle with a magenta lamp, photophores down the flanks, ribbon fins
    kind, clip, root = named("mire_eel_body", "serpent", "beast", "swim", seg_length=SEG, preview=pv)
    g = Model(f"{kind}_body", seed=4011)
    tube(g, 0.52, -1.0, 1.0, 0, 0, A, segs=8)
    g.ball(1.0, (0, 0, 0), A, subdiv=2, scale=(0.72, 1.08, 0.58))
    g.ball(1.0, (0, 0, -0.12), A.shade(0.6), subdiv=1, scale=(0.7, 1.04, 0.5))              # dark belly
    g.ball(1.0, (0, 0.05, 0.0), B, subdiv=2, scale=(0.66, 0.95, 0.7))                       # pale saddle
    for y in (-0.82, 0.88):
        g.ball(1.0, (0, y, 0.0), B, subdiv=1, scale=(0.26, 0.2, 0.58))                      # small spots at the joints
    for s in (1, -1):
        for i, y in enumerate((-0.65, 0.0, 0.65)):
            g.ball(0.15, (s * 0.66, y, 0.14), C, subdiv=1, glow=True)                      # photophores
    body = g.build(root)
    for k, s in enumerate((1, -1)):
        _ribbon(body, f"{kind}_fin_{k}", s, -0.95, 0.95, 0.4, clip, T, 0.0)
    # the lamps breathe (the dorsal one as its own part)
    lm = Model(f"{kind}_lamp")
    lm.ball(0.17, (0, 0, 0), C, subdiv=1, glow=True)
    lamp_obj = lm.build(body, loc=(0, 0.05, 0.62))
    pulse(lamp_obj, clip, T, 0.3)

    # tail: tapering to a broad pale paddle with a glowing tip
    kind, clip, root = named("mire_eel_tail", "serpent", "beast", "swim", seg_length=SEG, preview=pv)
    t = Model(f"{kind}_body", seed=4012)
    chain(t, [(0, 1.0, 0), (0, 0.15, 0.0), (0, -0.55, 0.02)], [0.48, 0.34, 0.16], A, segs=8)
    t.ball(1.0, (0, 0.55, 0.0), A, subdiv=1, scale=(0.6, 0.6, 0.48))
    t.ball(1.0, (0, 0.5, 0.0), B, subdiv=1, scale=(0.46, 0.56, 0.6))                        # last saddle
    for s in (1, -1):
        t.ball(0.11, (s * 0.5, 0.45, 0.1), C, subdiv=0, glow=True)
    tail = t.build(root)
    f = Model(f"{kind}_fin")
    paddle = [(0, 0.45), (0.5, 0.0), (0.62, -0.45), (0.3, -0.85), (0, -0.95), (-0.3, -0.85), (-0.62, -0.45), (-0.5, 0.0)]
    flat(f, paddle[::-1], 0, 0.06, A.shade(0.75))
    flat(f, [(0, 0.2), (-0.38, -0.35), (0, -0.7), (0.38, -0.35)], 0.04, 0.04, B)
    f.ball(0.16, (0, -0.8, 0.06), C, subdiv=1, glow=True)
    fn = f.build(tail, loc=(0, -0.45, 0.02))
    osc(fn, clip, "rotation_euler", T, (2, 0.4, 1, 0.0))
    osc(tail, clip, "rotation_euler", T, (2, 0.1, 1, 0.25))


# --- The Mire Eel on the water: a channel-keeper, rigged at run time ------------------------------

CER = "#d8cec2"        # the Tonkva's ceramic, grown over its back
CER_DARK = "#8a8090"
GLAZE = "#7aa89a"      # its glazed band (a celadon stripe, dull: never a lit speck)


def channel_keeper():
    """The Tonkva grew these to keep the grow-beds' channels clear: a long low body that swims flat,
    a plate of their pale ceramic over each ring of it, a pair of paddle vanes at every ring to push
    the water, and a broad dredge-scoop for a head, combed like their own antennae. A thousand years
    with no ledger to tell it what to clear, and the bloom has grown over its back in sacs that it
    fires. Rigged by the runtime (src/view/eel-rig.ts), not clips: `_head`, `_seg_<n>` (head end
    toward +y, each built round its own middle) and `_sac_<n>` on some segments (swelling in the
    tell). Laid out flat here for the previews. ~2.4 across the head."""
    kind, clip, root = named("mire_eel", "serpent", "beast", "swim", preview=("#5a3a7a", "#d8c0ff", "#b0ff4a"))
    N = 10
    gap = 1.7
    for k in range(N):
        t = k / (N - 1)
        r = 0.85 + (0.42 - 0.85) * t
        sg = Model(f"{kind}_seg_{k}", seed=4300 + k)
        sg.ball(r, (0, 0, 0), A.shade(0.55), subdiv=1, scale=(1.05, 1.3, 0.55))                  # wet skin
        sg.ball(r, (0, -r * 0.1, r * 0.22), CER, subdiv=1, scale=(0.95, 1.05, 0.4))                # the ceramic plate
        sg.box((r * 1.5, r * 0.22, r * 0.12), (0, r * 0.15, r * 0.52), GLAZE)                    # its glazed band
        sg.ball(r, (0, -r * 0.55, r * 0.12), CER_DARK, subdiv=1, scale=(0.9, 0.3, 0.3))           # the lap under the next
        for sd in (1, -1):                                                                     # paddle vanes
            v = [(sd * r * 0.8, r * 0.35), (sd * r * 2.1, r * 0.1), (sd * r * 2.25, -r * 0.35), (sd * r * 0.8, -r * 0.45)]
            sg.slab(v[::-1] if sd > 0 else v, -0.05, 0.07, A.shade(0.75))
            # (its leading edge ceramic)
            e = [(sd * r * 0.8, r * 0.35), (sd * r * 2.1, r * 0.1), (sd * r * 2.1, -r * 0.05), (sd * r * 0.8, r * 0.18)]
            sg.slab(e[::-1] if sd > 0 else e, 0.07, 0.1, CER)
            sg.ball(r * 0.17, (sd * r * 0.85, 0, r * 0.15), C, subdiv=0, glow=True)               # a spore port at its root
        # the bloom over its back, more of it toward the tail: violet sponge, and on every other ring a swollen sac
        for j in range(1 + k // 3):
            sx = (-1) ** (j + k) * r * (0.3 + 0.15 * j)
            sg.ball(r * (0.5 - 0.06 * j), (sx, -r * 0.25 + j * r * 0.2, r * 0.5), A.shade(1.05 - 0.1 * j), subdiv=1, scale=(1.2, 1, 0.6), jitter=0.06)
        if k % 2 == 0 and k < N - 1:
            sc = Model(f"{kind}_sac_{k}", seed=4320 + k)
            sc.ball(r * 0.42, (0, 0, 0), B, subdiv=1, scale=(1, 1, 0.85))
            sc.ball(r * 0.18, (0, 0, r * 0.32), C, subdiv=0, glow=True)
        if k == N - 1:                                                                         # the tail fluke
            sg.slab([(0, -r * 0.4), (r * 1.6, -r * 2.6), (0, -r * 1.9), (-r * 1.6, -r * 2.6)][::-1], -0.04, 0.06, CER)
        seg = sg.build(root, loc=(0, -(k + 1) * gap, 0))
        if k % 2 == 0 and k < N - 1:
            sc.build(seg, loc=(-r * 0.2, r * 0.1, r * 0.62))

    hd = Model(f"{kind}_head", seed=4310)
    hd.ball(0.95, (0, -0.2, 0), A.shade(0.55), subdiv=2, scale=(1.05, 1.0, 0.5))                # the skull, low and wide
    hd.ball(0.95, (0, -0.3, 0.2), CER, subdiv=1, scale=(0.95, 0.85, 0.4))                     # its brow plate
    hd.box((1.5, 0.22, 0.12), (0, -0.1, 0.55), GLAZE)
    # the dredge-scoop: a broad flat lip of ceramic, its edge combed into teeth
    hd.slab([(-1.25, 0.3), (1.25, 0.3), (1.05, 1.15), (-1.05, 1.15)], -0.15, 0.05, CER)
    hd.slab([(-1.0, 0.45), (1.0, 0.45), (0.85, 1.0), (-0.85, 1.0)], 0.05, 0.08, DARK)           # the maw under the lip
    hd.box((1.4, 0.18, 0.06), (0, 0.75, 0.1), C, glow=True)                                    # glowing deep in it
    for i in range(9):
        x = -1.0 + i * 0.25
        hd.box((0.09, 0.4, 0.08), (x, 1.3, -0.05), CER)
    for sd in (1, -1):
        hd.ball(0.16, (sd * 0.55, 0.2, 0.42), C, subdiv=1, glow=True)                           # eyes, set in the brow
        # the combs: two feathered crests swept back off the brow, the Tonkva's own antennae
        for j in range(5):
            a = 0.35 + j * 0.16
            hd.box((0.13, 0.7 - j * 0.08, 0.07), (sd * (0.78 + j * 0.2), -0.55 - j * 0.3, 0.52 + j * 0.05), CER, rot=(0, 0, sd * a))
        hd.box((0.2, 1.9, 0.12), (sd * 1.0, -1.05, 0.5), CER_DARK, rot=(0.15, 0, sd * 0.45))
    head = hd.build(root, loc=(0, 0, 0))
    head.scale = (1.3, 1.3, 1.3)   # (the rig keeps it)
    marker(head, kind, "muzzle", (0, 1.3, 0))


def build():
    glowmoth()
    hive_needle()
    spitter_pod()
    bog_shellback()
    brood_sac()
    mire_eel()
    channel_keeper()
