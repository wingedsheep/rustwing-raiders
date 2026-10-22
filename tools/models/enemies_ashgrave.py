"""Ashgrave's own enemies (the Scav Clans): rusty, patched, hazard-striped junk-tech flying over a
graveyard of fallen titans, glass craters and grey ash. The hulls are ash-grey in the planet's
colours, so every model leans on strong value: light-shaded decks (A.shade(1.3+)), dark rims and
undersides, fixed hazard yellow and bone-white clan paint, and big glowing accents.
Seeds 6000-6999.
"""
from __future__ import annotations

import math

from kit import Model
from creatures_util import TAU, chain, flat, limb, osc, sample
from enemies_lib import A, B, C, DARK, GLASS, flame, hull, marker, mirror, named, pulse, rotor, spin, tube

HAZ = "#f0c030"      # hazard yellow, never repainted
BONE = "#e6dcc8"     # clan paint: skulls, roundels, tally marks
RUST = "#8a4a2a"     # bare rusted patches
TYRE = "#232124"


def _hazard(m: Model, x0, x1, y, z, w, n, rot=0.0, thick=0.05):
    """A run of n alternating yellow/dark blocks from x0 to x1 (in the part's frame, turned by rot)."""
    step = (x1 - x0) / n
    c, s = math.cos(rot), math.sin(rot)
    for k in range(n):
        lx = x0 + step * (k + 0.5)
        m.box((abs(step) * 1.01, w, thick), (lx * c - y * s, lx * s + y * c, z), HAZ if k % 2 == 0 else DARK,
              rot=(0, 0, rot))


def _skull(m: Model, x, y, z, r, color=BONE):
    """A chunky clan skull painted flat on a deck: cranium, two dark eye holes, a jaw."""
    m.cyl(r, 0.04, (x, y + r * 0.15, z), color, segs=7)
    m.box((r * 1.1, r * 0.6, 0.04), (x, y - r * 0.75, z), color)
    for s in (1, -1):
        m.box((r * 0.42, r * 0.42, 0.03), (x + s * r * 0.42, y + r * 0.05, z + 0.03), DARK)
    m.box((r * 0.18, r * 0.5, 0.03), (x, y - r * 0.85, z + 0.03), DARK)


# --- Scav Kite: dart, ~2.2 -------------------------------------------------------------------------

def scav_kite():
    """A patchwork delta kite stretched over a scrap spar frame, a pusher prop on a keel pod and two
    pipe guns slung under the nose: cheap, light, everywhere."""
    kind, clip, root = named("scav_kite", "dart", "mech", "fly", preview=("#8a7a6a", "#3a3030", "#ffaa2a"))
    T = 1.0
    b = Model(f"{kind}_body", seed=6001)
    hull(b, [(0, 0.95), (-0.24, 0.5), (-0.26, -0.55), (-0.15, -0.85), (0.15, -0.85), (0.26, -0.55), (0.24, 0.5)],
         -0.3, -0.02, B, inset=0.65)                                                    # keel pod, dark
    b.box((0.3, 0.6, 0.08), (0, -0.25, 0.0), A.shade(0.8))                             # pod deck
    b.ball(0.16, (0, 0.38, 0.02), GLASS, subdiv=1, scale=(1, 1.5, 0.8))                # pilot bubble
    b.box((0.12, 0.2, 0.06), (0, 0.42, 0.16), C, glow=True)
    for s in (1, -1):                                                                  # nose guns: pipes
        tube(b, 0.08, 0.4, 1.28, s * 0.22, -0.2, DARK, segs=5)
        b.box((0.2, 0.16, 0.16), (s * 0.22, 1.26, -0.2), C, glow=True)
    tube(b, 0.16, -0.8, -1.0, 0, -0.16, DARK, segs=6)                                 # engine can
    b.cyl(0.13, 0.05, (0, -1.0, -0.16), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    b.box((0.06, 2.0, 0.06), (0, 0.05, 0.1), DARK)                                     # keel spar
    b.box((2.2, 0.07, 0.06), (0, -0.48, 0.02), DARK, rot=(0, 0, 0))                   # cross spar
    body = b.build(root)

    # the two sail halves, each a patchwork of skins, fluttering about the keel
    for s in (1, -1):
        w = Model(f"{kind}_sail_{'r' if s > 0 else 'l'}", seed=6002 + (s > 0))
        out = [(0.03, -0.42), (1.15, -0.8), (0.03, 1.05)]
        flat(w, out if s > 0 else mirror(out), 0.0, 0.05, A.shade(1.45))
        patch = [(0.35, -0.3), (0.75, -0.48), (0.55, 0.05), (0.32, 0.12)]
        flat(w, patch if s > 0 else mirror(patch), 0.035, 0.03, A.shade(0.75) if s > 0 else RUST)
        limb(w, (s * 0.04, 1.05, 0.04), (s * 1.15, -0.8, 0.04), 0.05, 0.04, DARK, segs=4)   # leading edge
        # hazard band near the tip, along the trailing edge
        for k in range(4):
            t = 0.45 + k * 0.13
            x, y = 0.03 + 1.12 * t, -0.42 - 0.38 * t
            w.box((0.13, 0.22, 0.03), (s * x, y + 0.1, 0.045), HAZ if k % 2 == 0 else DARK, rot=(0, 0, -s * 0.33))
        w.cyl(0.2, 0.03, (s * 0.38, 0.38, 0.04), BONE, segs=7)                          # clan roundel
        w.cyl(0.1, 0.03, (s * 0.38, 0.38, 0.06), C, segs=6, glow=True)
        w.box((0.16, 0.22, 0.08), (s * 1.08, -0.74, 0.03), C, glow=True)                # wingtip lamp
        obj = w.build(body, loc=(0, 0, 0.1))
        obj.rotation_euler[1] = -s * 0.12
        osc(obj, clip, "rotation_euler", T, (1, s * 0.07, 2, 0.0 if s > 0 else 0.25))
    p = Model(f"{kind}_prop")
    for j in range(2):
        p.box((0.11, 0.04, 0.85), (0, 0, 0), A.shade(1.2) if j else B, rot=(0, j * math.pi / 2 + 0.3, 0))
    p.ball(0.07, (0, -0.03, 0), C, subdiv=0, glow=True)
    prop = p.build(body, loc=(0, -1.05, -0.16))
    spin(prop, clip, T, 5, axis=1)
    flame(body, f"{kind}_flame", (0, -1.1, -0.16), 0.1, 0.35, clip, T, k=4)
    # a kite's tail: bow-tie rags on a line, snaking behind
    tl = Model(f"{kind}_tail", seed=6004)
    tl.box((0.04, 0.8, 0.03), (0, -0.4, 0), DARK)
    for k, y in enumerate((-0.32, -0.7)):
        w = 0.36 - k * 0.05
        for bow in ([(-w, y + 0.12), (-w, y - 0.12), (0, y)], [(0, y), (w, y - 0.12), (w, y + 0.12)]):
            tl.slab(bow, -0.02, 0.02, HAZ if k % 2 == 0 else BONE)
    tail = tl.build(body, loc=(0, -0.45, 0.08))
    osc(tail, clip, "rotation_euler", T, (2, 0.3, 1, 0), (0, 0.08, 2, 0))
    for k, s in enumerate((1, -1)):
        marker(body, kind, "muzzle", (s * 0.22, 1.36, -0.2), k)
    osc(body, clip, "location", T, (2, 0.06, 1, 0), (0, 0.03, 1, 0.25))
    osc(body, clip, "rotation_euler", T, (1, 0.08, 1, 0.25))


# --- Junk Flak: turret, ~2.5, aiming head ----------------------------------------------------------

def junk_flak():
    """A quad flak gun of mismatched pipes behind a hazard-striped shield plate, on a nest of tyres,
    barrels and ammo crates; a hubcap searchlight sweeps for targets."""
    kind, clip, root = named("junk_flak", "turret", "mech", "scan", ground=1,
                             preview=("#b07040", "#2a2a2a", "#ff5a2a"))
    T = 3.0
    b = Model(f"{kind}_base", seed=6010)
    ring = [(math.cos(TAU * (k + 0.5) / 9) * (1.18 + 0.06 * (k % 2)), math.sin(TAU * (k + 0.5) / 9) * 1.2)
            for k in range(9)]
    hull(b, ring, 0, 0.35, B, inset=0.88)                                              # dark footing
    b.cyl(0.88, 0.1, (0, 0, 0.35), A.shade(1.3), segs=9)                                # deck plate
    b.box((0.5, 0.5, 0.04), (0.35, -0.3, 0.46), A.shade(0.8), rot=(0, 0, 0.3))          # patch
    for k in range(9):                                                                 # hazard rim
        a = TAU * (k + 0.5) / 9
        b.box((0.34, 0.2, 0.08), (math.cos(a) * 1.0, math.sin(a) * 1.0, 0.36), HAZ if k % 2 else DARK,
              rot=(0, 0, a + math.pi / 2))
    for x, y in ((-1.05, 0.55), (-0.95, 0.85), (1.1, 0.4)):                            # tyre stacks
        for j in range(2):
            b.cyl(0.3, 0.16, (x, y, 0.05 + j * 0.17), TYRE, segs=8)
        b.cyl(0.15, 0.03, (x, y, 0.39), DARK, segs=6)
    for x, y, c in ((0.95, -0.75, A.shade(0.85)), (0.65, -1.0, RUST)):                 # oil drums
        b.cyl(0.24, 0.5, (x, y, 0.0), c, segs=7)
        b.cyl(0.25, 0.08, (x, y, 0.38), HAZ, segs=7)
    for x in (-0.85, -0.45):                                                           # ammo crates, hot shells
        b.box((0.36, 0.5, 0.3), (x, -0.95, 0.3), B.shade(1.3))
        b.box((0.24, 0.3, 0.08), (x, -0.95, 0.47), C, glow=True)
    base = b.build(root)
    lamp = Model(f"{kind}_lamp", seed=6011)
    lamp.cyl(0.05, 0.4, (0, 0, -0.4), DARK, segs=4)
    lamp.cyl(0.24, 0.12, (0, 0.05, 0.0), A.shade(1.4), segs=7, rot=(-1.2, 0, 0))       # hubcap dish
    lamp.cyl(0.17, 0.06, (0, 0.16, 0.04), C, segs=7, rot=(-1.2, 0, 0), glow=True)
    radar = lamp.build(base, loc=(1.1, 0.4, 0.75))
    sample(radar, clip, "rotation_euler", T, lambda u: (0, 0, 1.3 * math.sin(TAU * u)))

    h = Model(f"{kind}_head", seed=6012)
    h.cyl(0.55, 0.25, (0, 0, 0), RUST, segs=8)                                         # turning drum
    hull(h, [(-0.55, 0.3), (-0.6, -0.4), (-0.35, -0.7), (0.35, -0.7), (0.6, -0.4), (0.55, 0.3)],
         0.2, 0.5, A.shade(1.15), inset=0.8)                                           # gun cradle
    h.box((0.5, 0.36, 0.3), (-0.05, -0.55, 0.62), A.shade(0.8))                         # gunner seat / breech
    h.box((0.14, 0.14, 0.12), (0.18, -0.68, 0.8), C, glow=True)
    for s in (1, -1):                                                                  # ammo feed drums
        h.cyl(0.24, 0.3, (s * 0.72, -0.3, 0.28), RUST if s > 0 else B.shade(1.4), segs=7, rot=(0, math.pi / 2, 0))
    # the shield: a wide plate laid back like a plough, the barrels through it, hazard stripes across
    SR = (-1.0, 0, 0)
    sy, sz = math.cos(1.0), math.sin(1.0)

    def on_shield(x, zl, lift=0.0):  # a point on the shield's upper face (zl up the slope)
        yl = -0.07 - lift
        return (x, 0.42 + yl * sy + zl * sz, 0.25 - yl * sz + zl * sy)
    h.prism([(-1.0, 0.0), (1.0, 0.0), (0.88, 0.8), (-0.88, 0.8)], 0.12, (0, 0.42, 0.25), A.shade(1.4), rot=SR)
    h.prism([(-1.05, -0.06), (1.05, -0.06), (1.0, 0.1), (-1.0, 0.1)], 0.18, (0, 0.42, 0.25), B, rot=SR)
    for k in range(7):
        x = -0.78 + k * 0.26
        if abs(x) < 0.2:
            continue
        h.box((0.13, 0.03, 0.55), on_shield(x, 0.42), HAZ if k % 2 == 0 else DARK, rot=SR)
    _skull(h, -0.05, -0.55, 0.78, 0.17)
    head = h.build(base, loc=(0, 0, 0.45), part="head")
    head.name = f"{kind}_head"
    # four pipe barrels of different bores and lengths, each kicking back in turn
    n = 0
    for k, (x, z, r, L) in enumerate(((-0.42, 0.5, 0.1, 1.35), (-0.15, 0.62, 0.12, 1.55), (0.15, 0.62, 0.11, 1.5),
                                      (0.42, 0.5, 0.09, 1.25))):
        g = Model(f"{kind}_barrel_{k}", seed=6013 + k)
        tube(g, r + 0.03, -0.2, L, 0, 0, A.shade(1.25), segs=6)                       # bare pipe, pale against the ash
        tube(g, r + 0.07, 0.1, 0.3, 0, 0, B, segs=6)                                    # band clamp
        g.cyl(r + 0.02, 0.08, (0, L, 0), C, segs=6, rot=(-math.pi / 2, 0, 0), glow=True)
        obj = g.build(head, loc=(x, 0.3, z))
        sample(obj, clip, "location", T,
               lambda u, k=k: (0, -0.16 * max(0.0, 1 - ((u * 4 - k * 0.37) % 1) * 5), 0), step=1)
        marker(head, kind, "muzzle", (x, 0.3 + L + 0.1, z), n)
        n += 1


# --- Clan Rig: gunship, ~4 -------------------------------------------------------------------------

def clan_rig():
    """A plank deck hauled up by four mismatched fans: a shack amidships, a sandbagged twin gun at
    the bow, fuel drums, lanterns, and the clan's banner flying off a mast."""
    kind, clip, root = named("clan_rig", "gunship", "mech", "hover", preview=("#9a6a4a", "#2a2a2a", "#ffaa2a"))
    T = 2.0
    b = Model(f"{kind}_body", seed=6020)
    hull(b, [(-1.0, 1.45), (-1.2, 1.1), (-1.2, -1.25), (-0.95, -1.5), (0.95, -1.5), (1.2, -1.25), (1.2, 1.1),
             (1.0, 1.45)], -0.45, -0.05, B, inset=0.85)                                # dark under-frame
    for k in range(7):                                                                 # deck planks
        y = -1.3 + k * 0.42
        b.box((2.3 - 0.08 * (k % 3), 0.38, 0.1), (0.04 * (k % 2), y, 0.0),
              A.shade(1.15) if k % 2 == 0 else A.shade(0.9))
    b.box((0.7, 0.42, 0.05), (-0.65, -0.46, 0.07), RUST)                               # patched plank
    for s in (1, -1):                                                                  # fan outriggers
        b.box((0.9, 0.24, 0.16), (s * 1.45, 1.05, -0.1), B)
        b.box((0.9, 0.24, 0.16), (s * 1.45, -0.95, -0.1), B)
        b.cyl(0.6, 0.26, (s * 1.7, 1.08, -0.25), A.shade(0.9), segs=9)              # front ducts
        b.cyl(0.49, 0.04, (s * 1.7, 1.08, 0.0), DARK, segs=9)
        b.cyl(0.54, 0.3, (s * 1.62, -1.0, -0.28), B.shade(1.6), segs=7)              # back ducts, odd ones
        b.cyl(0.43, 0.04, (s * 1.62, -1.0, 0.0), DARK, segs=7)
        b.cyl(0.05, 0.35, (s * 1.15, 1.35, 0.0), DARK, segs=4)                         # lanterns on posts
        b.ball(0.17, (s * 1.15, 1.35, 0.42), C, subdiv=0, glow=True)
    for k in range(5):                                                                 # hazard edge at the stern
        b.box((0.42, 0.18, 0.06), (-0.84 + k * 0.42, -1.55, 0.02), HAZ if k % 2 == 0 else DARK)
    # the shack: rough walls, a lighter tin roof with dark seams
    b.box((1.0, 0.9, 0.5), (0.1, -0.35, 0.3), B.shade(1.5))
    b.box((1.2, 1.1, 0.12), (0.1, -0.35, 0.62), A.shade(1.7), rot=(0.12, 0, 0))
    for x in (-0.2, 0.15, 0.5):
        b.box((0.07, 1.1, 0.05), (x, -0.35, 0.7), DARK, rot=(0.12, 0, 0))
    b.box((0.36, 0.08, 0.18), (0.1, 0.12, 0.35), C, glow=True)                         # lit window
    _skull(b, 0.1, -0.4, 0.73, 0.2)
    b.cyl(0.1, 0.35, (0.5, -0.65, 0.6), DARK, segs=5)                                   # stove pipe
    for x, y in ((-0.85, -1.0), (-0.65, -1.15), (0.8, -1.1)):                          # fuel drums
        b.cyl(0.18, 0.4, (x, y, 0.05), RUST if x > 0 else A.shade(0.8), segs=7)
        b.cyl(0.19, 0.06, (x, y, 0.4), HAZ, segs=7)
    # the bow gun nest
    b.cyl(0.55, 0.22, (0, 0.95, 0.05), "#a08c70", segs=8)                              # sandbag ring
    b.cyl(0.44, 0.1, (0, 0.95, 0.2), DARK, segs=8)
    b.box((0.5, 0.5, 0.25), (0, 1.0, 0.4), B)
    for s in (1, -1):
        tube(b, 0.09, 1.1, 2.0, s * 0.13, 0.42, DARK, segs=5)
        b.box((0.18, 0.12, 0.14), (s * 0.13, 2.0, 0.42), C, glow=True)
    b.box((0.6, 0.12, 0.3), (0, 1.3, 0.5), A.shade(1.3), rot=(-0.4, 0, 0))             # gun shield
    for s in (1, -1):                                                                  # exhausts
        tube(b, 0.15, -1.45, -1.75, s * 0.55, -0.25, DARK, segs=6)
        b.cyl(0.12, 0.05, (s * 0.55, -1.76, -0.25), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    b.cyl(0.05, 1.2, (-0.85, 0.2, 0.0), DARK, segs=4)                                  # mast
    body = b.build(root)
    for k, (x, y, r, bl, turns) in enumerate(((1.7, 1.08, 0.49, 3, 6), (-1.7, 1.08, 0.49, 3, -6),
                                               (1.62, -1.0, 0.43, 2, -7), (-1.62, -1.0, 0.43, 4, 5))):
        rotor(body, f"{kind}_fan_{k}", (x, y, 0.08), r, bl, clip, T, turns, color=A.shade(1.3), hub=C)
    for k, s in enumerate((1, -1)):
        flame(body, f"{kind}_flame_{k}", (s * 0.55, -1.78, -0.25), 0.12, 0.4, clip, T, phase=k * 0.4, k=4)
    f = Model(f"{kind}_banner", seed=6021)
    flat(f, [(0, 0.0), (0, -0.55), (-0.85, -0.45), (-0.65, -0.28), (-0.9, -0.1)], 0, 0.04, C)
    f.box((0.3, 0.2, 0.05), (-0.35, -0.27, 0.03), BONE)
    banner = f.build(body, loc=(-0.85, 0.2, 1.15))
    banner.rotation_euler[2] = 0.4
    osc(banner, clip, "rotation_euler", T, (2, 0.3, 2, 0), (1, 0.15, 3, 0.2))
    for k, s in enumerate((1, -1)):
        marker(body, kind, "muzzle", (s * 0.13, 2.1, 0.42), k)
    osc(body, clip, "location", T, (2, 0.09, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.04, 1, 0.25), (0, 0.03, 1, 0))


# --- Revived Titan Torso: brute, ~6 ----------------------------------------------------------------

def revived_titan_torso():
    """The chest and shoulders of a fallen war titan, dragged into the air by scav rockets bolted
    to its back: a cracked cyclops head, a green core glaring out of a torn chest plate, one arm a
    cannon, the other ripped off with cables trailing, and its broken spine dragging behind."""
    kind, clip, root = named("revived_titan_torso", "brute", "mech", "hum",
                             preview=("#6a7a6a", "#3a3a3a", "#4aff8a"))
    T = 4.0
    b = Model(f"{kind}_body", seed=6030)
    chest = [(-0.9, 1.6), (-1.6, 1.25), (-1.75, 0.2), (-1.3, -1.1), (-0.6, -1.5), (0.6, -1.5), (1.3, -1.1),
             (1.75, 0.2), (1.6, 1.25), (0.9, 1.6)]
    hull(b, chest, -0.8, 0.3, B, inset=0.9)                                            # dark chassis
    hull(b, [(x * 0.92, y * 0.92 + 0.05) for x, y in chest], 0.25, 0.85, A.shade(1.5), inset=0.82)  # chest plate
    # the torn hole in the chest plate (left of centre) and the core inside it
    b.slab([(-0.95, 0.6), (-1.15, 0.05), (-0.7, -0.45), (-0.15, -0.3), (-0.05, 0.25), (-0.4, 0.75)],
           0.6, 0.9, DARK)
    b.ball(0.42, (-0.6, 0.12, 0.85), C, subdiv=1, scale=(1, 1, 0.6), glow=True)
    for a in (0.3, 1.5, 2.6, 3.9, 5.0):                                                # jagged lips round the hole
        x, y = -0.6 + math.cos(a) * 0.55, 0.12 + math.sin(a) * 0.5
        limb(b, (x, y, 0.85), (x + math.cos(a) * 0.12, y + math.sin(a) * 0.12, 1.15), 0.12, 0.0, A.shade(1.1), segs=4)
    # right side of the chest: armour ribs, a weathered plate and clan graffiti
    for k in range(3):
        b.box((0.95, 0.18, 0.12), (0.7, 0.55 - k * 0.42, 0.88), B.shade(1.2), rot=(0, 0, 0.1))
    b.box((0.9, 0.7, 0.06), (0.55, -0.95, 0.85), A.shade(0.75), rot=(0, 0, -0.2))
    for k in range(4):                                                                 # tally marks
        b.box((0.08, 0.42, 0.04), (0.25 + k * 0.17, -0.95, 0.9), BONE, rot=(0, 0, 0.2 if k < 3 else 1.2))
    for k in range(5):                                                                 # hazard band on the collar
        b.box((0.36, 0.2, 0.05), (-0.72 + k * 0.36, 1.4, 0.82), HAZ if k % 2 == 0 else DARK)
    # shoulders: great domed pauldrons, the left one torn
    for s in (1, -1):
        b.ball(0.95, (s * 2.05, 0.55, 0.2), A.shade(1.55) if s > 0 else A.shade(1.3), subdiv=1,
               scale=(1.0, 1.15, 0.7))
        b.ball(0.95, (s * 2.05, 0.5, -0.05), B, subdiv=1, scale=(1.08, 1.22, 0.55))   # dark rim under it
        for k in range(3):
            b.box((1.2, 0.16, 0.1), (s * 2.05, 0.95 - k * 0.42, 0.85 - abs(k - 1) * 0.08), B.shade(1.3))
    b.box((0.5, 0.5, 0.06), (2.05, 0.1, 0.8), HAZ)
    b.box((0.25, 0.25, 0.04), (2.05, 0.1, 0.83), DARK)
    # torn left arm socket: a dark stump and sparking cable ends
    b.cyl(0.55, 0.5, (-2.55, 0.35, -0.1), DARK, segs=7, rot=(0, -math.pi / 2, 0))
    for k, (dy, dz) in enumerate(((0.25, 0.05), (-0.15, 0.2), (0.0, -0.2))):
        chain(b, [(-2.9, 0.35 + dy, dz), (-3.1, 0.0 + dy, dz - 0.1), (-3.0, -0.5 + dy * 2, dz - 0.2)],
              [0.09, 0.08, 0.07], DARK, segs=5, joints=False)
        b.ball(0.13, (-3.0, -0.5 + dy * 2, dz - 0.2), C, subdiv=0, glow=True)
    # scav rockets bolted to the back, lashed with hazard straps
    for s in (1, -1):
        tube(b, 0.36, -0.6, -2.1, s * 0.8, 0.1, B.shade(1.4), segs=7)
        tube(b, 0.28, -2.1, -2.35, s * 0.8, 0.1, DARK, segs=7)
        b.cyl(0.25, 0.05, (s * 0.8, -2.36, 0.1), C, segs=7, rot=(math.pi / 2, 0, 0), glow=True)
        b.box((0.82, 0.18, 0.08), (s * 0.8, -1.2, 0.47), HAZ)
        b.box((0.82, 0.18, 0.08), (s * 0.8, -1.65, 0.47), DARK)
    # the cannon arm (right): upper arm, elbow, and a long gun barrel forearm
    b.ball(0.5, (2.55, 0.55, -0.2), B, subdiv=1)
    chain(b, [(2.6, 0.6, -0.25), (2.75, 1.4, -0.3)], [0.42, 0.38], A.shade(1.1), segs=7)
    b.ball(0.42, (2.75, 1.45, -0.3), B, subdiv=1)
    tube(b, 0.45, 1.5, 2.4, 2.75, -0.3, A.shade(1.3), segs=7, r_end=0.38)
    b.box((0.55, 0.6, 0.12), (2.75, 1.95, 0.12), B.shade(1.3))
    for d in (-0.15, 0.15):
        tube(b, 0.12, 2.4, 3.05, 2.75 + d, -0.3, DARK, segs=6)
        b.cyl(0.13, 0.08, (2.75 + d, 3.0, -0.3), C, segs=6, rot=(-math.pi / 2, 0, 0), glow=True)
    body = b.build(root)

    # cyclops head: a dented helm, one glaring visor, twitching
    hd = Model(f"{kind}_head", seed=6031)
    hd.ball(0.75, (0, 0, 0.2), A.shade(1.45), subdiv=1, scale=(1.05, 0.95, 0.75))
    hd.box((1.35, 0.6, 0.4), (0, 0.2, -0.05), B)                                       # jaw
    hd.box((1.0, 0.3, 0.3), (0, 0.55, 0.3), DARK, rot=(0.5, 0, 0))                     # brow slot
    hd.box((0.8, 0.26, 0.24), (0.05, 0.62, 0.36), C, glow=True, rot=(0.5, 0, 0))        # cyclops visor
    hd.box((0.14, 0.75, 0.06), (-0.25, -0.05, 0.78), DARK, rot=(0, 0, 0.5))             # crack
    hd.box((0.24, 0.75, 0.1), (0.3, -0.15, 0.74), BONE)                                 # clan paint stripe
    head = hd.build(body, loc=(0, 1.55, 0.75))
    sample(head, clip, "rotation_euler", T, lambda u: (
        0, 0.08 * math.sin(TAU * u),
        0.25 * math.sin(TAU * u) + (0.18 if 0.55 < u < 0.62 else 0.0) * math.sin(TAU * 7 * u)), step=1)
    core = Model(f"{kind}_core")
    core.ball(0.28, (0, 0, 0), C, subdiv=1, glow=True)
    core_obj = core.build(body, loc=(-0.6, 0.12, 1.0))
    pulse(core_obj, clip, T, 0.3, harm=4)
    # the broken spine dragging behind, swaying
    sp = Model(f"{kind}_spine", seed=6032)
    for k in range(4):
        y = -k * 0.46
        r = 0.36 - k * 0.05
        sp.box((r * 2.2, 0.32, r * 1.2), (0, y, 0), A.shade(1.2) if k % 2 == 0 else B.shade(1.3))
        sp.box((r * 0.9, 0.2, 0.25), (0, y, r * 0.65), DARK)
    for s in (1, -1):
        chain(sp, [(s * 0.2, 0.0, -0.1), (s * 0.4, -0.7, -0.2), (s * 0.3, -1.4, -0.25), (s * 0.5, -1.95, -0.3)],
              [0.08, 0.08, 0.07, 0.06], DARK, segs=5, joints=False)
    sp.ball(0.16, (0, -1.7, 0.05), C, subdiv=0, glow=True)
    spine = sp.build(body, loc=(0, -1.35, -0.1))
    osc(spine, clip, "rotation_euler", T, (2, 0.18, 1, 0.1), (0, 0.06, 2, 0))
    for k in range(2):
        flame(body, f"{kind}_flame_{k}", ((1 - 2 * k) * 0.8, -2.4, 0.1), 0.26, 0.8, clip, T, phase=k * 0.35, k=8)
    for k, d in enumerate((-0.15, 0.15)):
        marker(body, kind, "muzzle", (2.75 + d, 3.15, -0.3), k)
    osc(body, clip, "location", T, (2, 0.1, 1, 0), (0, 0.05, 1, 0.25))
    osc(body, clip, "rotation_euler", T, (1, 0.05, 1, 0.25), (0, 0.025, 2, 0))


# --- Scrap Hauler: bomber, ~4.5 wide ---------------------------------------------------------------

def scrap_hauler():
    """A fat, patched cargo barge with an open bin heaped with junk, mismatched wings (a plank on
    one side, a salvaged swept wing on the other) and a crane magnet swinging under its tail: it
    bombs you with its cargo."""
    kind, clip, root = named("scrap_hauler", "bomber", "mech", "fly", preview=("#7a6a5a", "#3a3030", "#ff5a2a"))
    T = 2.0
    b = Model(f"{kind}_body", seed=6040)
    hull(b, [(-0.55, 1.75), (-0.9, 1.3), (-0.95, -1.5), (-0.7, -1.8), (0.7, -1.8), (0.95, -1.5), (0.9, 1.3),
             (0.55, 1.75)], -0.5, 0.15, B, inset=0.9)                                  # dark belly
    # the cab up front
    hull(b, [(-0.5, 1.75), (-0.8, 1.35), (-0.8, 0.85), (0.8, 0.85), (0.8, 1.35), (0.5, 1.75)], 0.1, 0.5,
         A.shade(1.35), inset=0.8)
    b.box((0.85, 0.3, 0.2), (0, 1.48, 0.48), GLASS, rot=(0.4, 0, 0))
    b.box((0.7, 0.08, 0.06), (0, 1.62, 0.55), C, glow=True, rot=(0.4, 0, 0))
    for k in range(4):                                                                 # hazard bumper
        b.box((0.36, 0.2, 0.18), (-0.54 + k * 0.36, 1.82, -0.05), HAZ if k % 2 == 0 else DARK)
    # the cargo bin: dark walls round a heap of junk
    for s in (1, -1):
        b.box((0.16, 2.2, 0.55), (s * 0.85, -0.45, 0.4), A.shade(0.95))
        b.box((0.2, 2.2, 0.06), (s * 0.85, -0.45, 0.69), A.shade(1.45))               # light wall caps
    b.box((1.86, 0.16, 0.55), (0, 0.65, 0.4), A.shade(0.95))
    b.box((1.86, 0.16, 0.55), (0, -1.55, 0.4), A.shade(0.95))
    b.box((1.55, 2.0, 0.1), (0, -0.45, 0.2), DARK)
    b.box((0.85, 0.6, 0.3), (-0.35, 0.25, 0.45), A.shade(1.3), rot=(0.1, 0.15, 0.3))    # car body
    b.box((0.6, 0.35, 0.18), (-0.35, 0.2, 0.68), GLASS, rot=(0.1, 0.15, 0.3))
    b.cyl(0.24, 0.55, (0.35, -0.2, 0.25), RUST, segs=7)                                # drums
    b.cyl(0.25, 0.07, (0.35, -0.2, 0.8), HAZ, segs=7)
    b.cyl(0.22, 0.5, (0.45, 0.35, 0.22), B.shade(1.6), segs=7, rot=(1.3, 0, 0.4))
    tube(b, 0.12, -1.4, 0.3, -0.5, 0.6, DARK, segs=5)                                  # a pipe sticking out
    b.box((0.55, 0.55, 0.35), (-0.25, -0.75, 0.5), A.shade(1.1), rot=(0, 0, 0.25))     # crate
    b.box((0.3, 0.3, 0.06), (-0.25, -0.75, 0.69), BONE, rot=(0, 0, 0.25))
    b.ball(0.3, (0.3, -1.05, 0.5), A.shade(0.7), subdiv=0, jitter=0.06)                 # scrap lump
    b.box((0.4, 0.3, 0.12), (0.4, -0.6, 0.55), C, glow=True, rot=(0.3, 0.2, 0.5))       # hot reactor bit
    # wings: right a straight plank wing, left a salvaged swept one
    hull(b, [(0.9, 0.35), (0.9, -0.55), (2.35, -0.6), (2.4, 0.3)], -0.15, 0.05, A.shade(1.3), inset=0.95)
    b.box((1.4, 0.14, 0.04), (1.65, -0.15, 0.06), DARK)
    hull(b, [(-0.9, 0.6), (-2.2, -0.35), (-2.35, -0.8), (-0.9, -0.5)], -0.15, 0.05, A.shade(1.15), inset=0.95)
    b.box((0.6, 0.45, 0.04), (-1.4, -0.3, 0.07), RUST, rot=(0, 0, 0.6))                # patch
    for x, y, r in ((2.05, -0.15, 0.0), (-2.0, -0.55, 0.6)):                           # hazard wing tips
        for k in range(3):
            b.box((0.14, 0.7, 0.05), (x + (k - 1) * 0.14, y, 0.07), HAZ if k % 2 == 0 else DARK, rot=(0, 0, r))
    # engines: one big drum on the right, two small cans on the left
    tube(b, 0.42, 0.75, -0.95, 1.55, -0.42, B.shade(1.3), segs=8)
    b.cyl(0.33, 0.06, (1.55, 0.76, -0.42), DARK, segs=8, rot=(-math.pi / 2, 0, 0))
    b.cyl(0.33, 0.06, (1.55, -0.96, -0.42), C, segs=8, rot=(math.pi / 2, 0, 0), glow=True)
    for x in (-1.35, -2.0):
        tube(b, 0.24, 0.3 + (x + 1.35) * 0.6, -0.95 + (x + 1.35) * 0.4, x, -0.15, B.shade(1.5), segs=6)
        yb = -0.95 + (x + 1.35) * 0.4
        b.cyl(0.18, 0.05, (x, yb - 0.01, -0.15), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    for s in (1, -1):
        b.box((0.16, 0.25, 0.1), (s * 2.3, -0.2 if s > 0 else -0.75, 0.08), C, glow=True)  # wingtip lamps
    # crane boom off the stern
    b.box((0.22, 0.9, 0.18), (0, -2.05, 0.6), DARK, rot=(0.35, 0, 0))
    body = b.build(root)
    flame(body, f"{kind}_flame_0", (1.55, -1.0, -0.42), 0.3, 0.7, clip, T, k=4)
    for k, x in enumerate((-1.35, -2.0)):
        flame(body, f"{kind}_flame_{k + 1}", (x, -0.98 + (x + 1.35) * 0.4, -0.15), 0.17, 0.45, clip, T,
              phase=0.3 + k * 0.3, k=4)
    mg = Model(f"{kind}_magnet", seed=6041)
    mg.cyl(0.03, 0.55, (0, 0, -0.55), DARK, segs=4)
    mg.cyl(0.42, 0.18, (0, 0, -0.75), HAZ, segs=8)
    for k in range(4):
        a = TAU * k / 8
        mg.box((0.86, 0.12, 0.2), (0, 0, -0.66), DARK, rot=(0, 0, a * 2))
    mg.cyl(0.26, 0.06, (0, 0, -0.8), C, segs=8, glow=True)
    magnet = mg.build(body, loc=(0, -2.45, 0.75))
    osc(magnet, clip, "rotation_euler", T, (0, 0.25, 1, 0), (1, 0.12, 1, 0.25))
    marker(body, kind, "muzzle", (0, -0.45, -0.55))
    osc(body, clip, "location", T, (2, 0.07, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.035, 1, 0.25), (0, 0.015, 1, 0))


# --- Glass Sniper: lancer, ~3 ----------------------------------------------------------------------

def glass_sniper():
    """A long sniper rig hiding under a ragged ash-grey cloak, its barrel tipped with a lens of green
    crater glass, shards of the same glass clamped down the barrel and glowing as it charges."""
    kind, clip, root = named("glass_sniper", "lancer", "mech", "charge", preview=("#5a6a5a", "#2a2a2a", "#4aff8a"))
    T = 1.5
    b = Model(f"{kind}_body", seed=6050)
    hull(b, [(-0.3, 0.35), (-0.45, -0.3), (-0.35, -1.2), (0.35, -1.2), (0.45, -0.3), (0.3, 0.35)], -0.3, 0.05, B,
         inset=0.7)                                                                    # dark frame
    tube(b, 0.24, 0.2, 1.3, 0, 0.0, A.shade(1.3), segs=7)                              # barrel shroud (pale, so it reads)
    tube(b, 0.18, 1.3, 1.62, 0, 0.0, B.shade(1.6), segs=6)                             # the long barrel
    for y in (0.4, 0.85):                                                              # clamps
        tube(b, 0.27, y, y + 0.14, 0, 0.0, HAZ, segs=6)
    # the lens's mount: a heavy cup on the muzzle and four prongs gripping the glass
    tube(b, 0.4, 1.5, 1.72, 0, 0.0, B.shade(1.8), segs=8)
    tube(b, 0.42, 1.52, 1.58, 0, 0.0, HAZ, segs=8)
    for j in range(4):
        a = TAU * j / 4 + math.pi / 4
        limb(b, (math.cos(a) * 0.34, 1.65, math.sin(a) * 0.34), (math.cos(a) * 0.3, 2.05, math.sin(a) * 0.3), 0.1, 0.06,
             A.shade(1.3), segs=4)
    tube(b, 0.11, -0.3, 0.75, 0.32, 0.32, DARK, segs=6)                                # scope, off to one side
    b.cyl(0.13, 0.06, (0.32, 0.76, 0.32), C, segs=6, rot=(-math.pi / 2, 0, 0), glow=True)
    for s in (1, -1):                                                                  # long outrigger skids
        limb(b, (s * 0.3, 0.0, -0.1), (s * 0.75, 0.25, -0.2), 0.07, 0.06, DARK, segs=4)
        tube(b, 0.09, -0.85, 0.85, s * 0.78, -0.2, A.shade(1.3), segs=5, r_end=0.05)
        b.box((0.16, 0.24, 0.08), (s * 0.78, 0.8, -0.15), C, glow=True)
        b.box((0.16, 0.3, 0.06), (s * 0.78, -0.4, -0.08), HAZ)
        tube(b, 0.13, -1.0, -1.2, s * 0.2, -0.1, DARK, segs=6)
        b.cyl(0.11, 0.05, (s * 0.2, -1.21, -0.1), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    # the cloak: a ragged pale sheet draped over the rear, with the clan's painted eye
    cl = [(0, 0.35), (-0.55, 0.15), (-0.7, -0.5), (-0.55, -1.2), (-0.35, -1.0), (-0.2, -1.4), (0.05, -1.1),
          (0.3, -1.45), (0.45, -1.05), (0.65, -1.2), (0.7, -0.45), (0.55, 0.15)]
    cl = [(x, y * 0.8) for x, y in cl]
    b.slab(cl, 0.08, 0.2, A.shade(0.8), top=[(x * 0.8, y * 0.9 - 0.05) for x, y in cl])
    hull(b, [(0, 0.25), (-0.45, 0.05), (-0.5, -0.6), (0.0, -0.95), (0.5, -0.6), (0.45, 0.05)], 0.2, 0.42,
         A.shade(1.65), inset=0.7)
    for k in range(4):                                                                 # hazard hem
        b.box((0.2, 0.18, 0.05), (-0.3 + k * 0.2, -0.85 + abs(k - 1.5) * 0.12, 0.3), HAZ if k % 2 == 0 else DARK)
    b.cyl(0.22, 0.04, (0, -0.35, 0.42), BONE, segs=7)
    b.cyl(0.1, 0.04, (0, -0.35, 0.45), C, segs=6, glow=True)
    body = b.build(root)
    # glass shards clamped along the barrel, glowing and turning as it charges
    for k, y in enumerate((0.65, 1.07)):
        sh = Model(f"{kind}_shards_{k}", seed=6051 + k)
        for j in range(3):
            a = TAU * j / 3 + k * 0.5
            limb(sh, (math.cos(a) * 0.18, 0, math.sin(a) * 0.18), (math.cos(a) * 0.42, 0.12, math.sin(a) * 0.42),
                 0.08, 0.0, C, segs=4, glow=True)
        obj = sh.build(body, loc=(0, y, 0.0))
        spin(obj, clip, T, 1 if k else -1, axis=1, phase=k * 0.15)
    # the lens: a cluster of green glass at the muzzle, swelling as it charges
    ln = Model(f"{kind}_lens", seed=6053)
    ln.ball(0.36, (0, 0, 0), C, subdiv=0, scale=(1, 1.4, 1), glow=True)
    for j in range(4):
        a = TAU * j / 4 + 0.4
        limb(ln, (0, -0.1, 0), (math.cos(a) * 0.32, 0.35, math.sin(a) * 0.32), 0.12, 0.0, C, segs=4, glow=True)
    ln.cyl(0.26, 0.1, (0, -0.35, 0), DARK, segs=6, rot=(-math.pi / 2, 0, 0))
    lens = ln.build(body, loc=(0, 1.8, 0.0))
    sample(lens, clip, "scale", T, lambda u: [0.25 * (u if u < 0.85 else (1 - u) / 0.15 * 0.85)] * 3, step=1)
    osc(lens, clip, "rotation_euler", T, (1, 0.4, 1, 0))
    marker(body, kind, "emitter", (0, 2.2, 0.0))
    osc(body, clip, "location", T, (2, 0.05, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.03, 1, 0.25))


def build():
    scav_kite()
    junk_flak()
    clan_rig()
    revived_titan_torso()
    scrap_hauler()
    glass_sniper()
