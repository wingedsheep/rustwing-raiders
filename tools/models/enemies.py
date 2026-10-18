"""Enemy craft and beasts, painted at runtime per planet through Skin slots: a = main body,
b = secondary, c = accent (glowing where it is an eye, a light or an engine). Every archetype comes
in two families, `enemy_<archetype>_mech` (smuggler-era junk-tech: fins, intakes, glowing
thrusters) and `enemy_<archetype>_beast` (wings, carapace, eyes that glow). All face +y, centred on
the origin (the runtime puts fliers at flight height); the turret stands on z = 0.

Each template plays one loop, `<kind>_<name>_idle` (see CLIPS). Parts the runtime needs to find
carry a `part` extra and are named `<kind>_<part>[_<n>]`:
    part=head     the turret's aiming head (rotate it about z; barrels point +y)
    part=muzzle   where shots leave (gun tips, maws, spouts)
    part=emitter  the lancer's beam origin
    part=bay      the carrier's launch bay
The serpent comes in three templates per family (head, body, tail), each `seg_length` long, joints
at y = ±seg_length / 2, for the runtime to chain.
"""
from __future__ import annotations

import math
import os

from kit import Model, Skin, group
from creatures_util import TAU, chain, flat, limb, linearize, osc, sample

# stand-in colours (the runtime repaints the slots): warm hull, slate trim, hot accent
A = Skin("a", "#d6b277")
B = Skin("b", "#3f4a63")
C = Skin("c", "#ff5a3a")
DARK = "#1b1a20"      # intakes, nozzles, gun bores, pupils
GLASS = "#24323e"     # canopies

CLIPS: dict[str, str] = {}


# --- helpers ---------------------------------------------------------------------------------

def _root(arch: str, fam: str, clip: str, **props):
    kind = f"enemy_{arch}_{fam}"
    CLIPS[kind] = f"{kind}_{clip}_idle"
    return kind, CLIPS[kind], group(kind, kind=kind, archetype=arch, family=fam, **props)


def hull(m: Model, outline, z0, z1, color, inset=0.7, glow=False):
    """A slab whose top is the outline shrunk towards its centre: chunky sloped sides."""
    cx = sum(p[0] for p in outline) / len(outline)
    cy = sum(p[1] for p in outline) / len(outline)
    top = [(cx + (x - cx) * inset, cy + (y - cy) * (0.5 + inset / 2)) for x, y in outline]
    return m.slab(outline, z0, z1, color, top=top, glow=glow)


def mirror(pts):
    """The -x twin of a +x outline (still counter-clockwise)."""
    return [(-x, y) for x, y in reversed(pts)]


def both(pts):
    return [pts, mirror(pts)]


def tube(m: Model, r, y0, y1, x, z, color, segs=8, r_end=None, glow=False):
    """A cylinder lying along y from y0 to y1."""
    if y1 >= y0:
        return m.cyl(r, y1 - y0, (x, y0, z), color, segs=segs, r_top=r_end, rot=(-math.pi / 2, 0, 0), glow=glow)
    return m.cyl(r, y0 - y1, (x, y0, z), color, segs=segs, r_top=r_end, rot=(math.pi / 2, 0, 0), glow=glow)


def fin(m: Model, pts_yz, x, thick, color, glow=False):
    """An upright fin: a profile in (y, z) given its thickness along x."""
    return m.prism(pts_yz, thick, (x, 0, 0), color, rot=(0, 0, math.pi / 2), glow=glow)


def marker(parent, kind, part, loc, n=None):
    name = f"{kind}_{part}" + ("" if n is None else f"_{n}")
    return group(name, loc, parent=parent, part=part)


def spin(obj, clip, T, turns, axis=2, phase=0.0):
    """Whole turns about one axis over the loop (sampled every frame so the slerp can't go astray)."""
    def f(u):
        v = [0.0, 0.0, 0.0]
        v[axis] = TAU * (turns * u + phase)
        return v
    sample(obj, clip, "rotation_euler", T, f, step=1)


def pulse(obj, clip, T, amp=0.25, harm=1, phase=0.0, axes=(0, 1, 2)):
    osc(obj, clip, "scale", T, *[(ax, amp, harm, phase) for ax in axes])


def flame(parent, name, loc, r, length, clip, T, phase=0.0, k=2):
    """A glowing exhaust cone pointing back (-y), flickering."""
    f = Model(name)
    f.cyl(r, length, (0, 0, 0), C, segs=6, r_top=0.0, rot=(math.pi / 2, 0, 0), glow=True)
    obj = f.build(parent, loc=loc)
    osc(obj, clip, "scale", T, (1, 0.3, k, phase), (0, 0.12, k + 1, phase + 0.2), (2, 0.12, k + 1, phase + 0.2))
    return obj


def rotor(parent, name, loc, r, blades, clip, T, turns, color=A, hub=B):
    m = Model(name)
    for k in range(blades):
        a = math.pi * 2 * k / blades
        m.box((r * 2 if blades == 2 else r, 0.14 + r * 0.08, 0.04),
              ((0 if blades == 2 else math.cos(a) * r / 2), (0 if blades == 2 else math.sin(a) * r / 2), 0),
              color, rot=(0.12, 0, a))
        if blades == 2:
            break
    m.cyl(0.1 + r * 0.08, 0.1, (0, 0, -0.03), hub, segs=6)
    obj = m.build(parent, loc=loc)
    spin(obj, clip, T, turns)
    return obj


def wing_pair(parent, name, at, outline, thick, color, clip, T, amp, harm=1, phase=0.0, dihedral=0.0,
              extra=None):
    """Two flat wings hinged at (±x, y, z), flapping about y. `outline` is the +x wing about its hinge."""
    out = []
    for s in (1, -1):
        w = Model(f"{name}_{'r' if s > 0 else 'l'}")
        flat(w, outline if s > 0 else mirror(outline), 0, thick, color)
        if extra:
            extra(w, s)
        obj = w.build(parent, loc=(s * at[0], at[1], at[2]))
        obj.rotation_euler[1] = -s * dihedral
        osc(obj, clip, "rotation_euler", T, (1, s * amp, harm, phase))
        out.append(obj)
    return out


def eyes(m: Model, x, y, z, r, color=C, pupil=True):
    for s in (1, -1):
        m.ball(r, (s * x, y, z), color, subdiv=1, glow=True)
        if pupil:
            m.box((r * 0.5, r * 0.4, r * 1.2), (s * x, y + r * 0.85, z), DARK)


# --- dart: quick fighter, ~2.2 ------------------------------------------------------------------

def dart_mech():
    kind, clip, root = _root("dart", "mech", "fly")
    T = 1.0
    b = Model(f"{kind}_body", seed=101)
    hull(b, [(0, 1.15), (-0.22, 0.45), (-0.3, -0.55), (-0.22, -0.95), (0.22, -0.95), (0.3, -0.55), (0.22, 0.45)],
         -0.12, 0.18, A, inset=0.6)
    b.box((0.36, 0.18, 0.06), (0, 0.62, 0.12), B, rot=(0.25, 0, 0))                    # nose stripe
    b.ball(0.17, (0, 0.12, 0.2), GLASS, subdiv=1, scale=(1, 2.0, 0.75))                 # canopy
    b.box((0.1, 0.32, 0.05), (0, 0.18, 0.33), C, glow=True)
    for pts in both([(0.22, 0.15), (0.26, -0.6), (1.0, -0.82), (1.02, -0.52)]):
        flat(b, pts, 0.0, 0.08, A)
    for pts in both([(0.55, -0.3), (0.58, -0.72), (0.8, -0.78), (0.8, -0.4)]):
        flat(b, pts, 0.05, 0.04, B)
    for s in (1, -1):  # wingtip nacelles with intakes, top fins and glowing nozzles
        tube(b, 0.15, -0.95, 0.2, s * 1.0, 0.02, B, segs=6, r_end=0.12)
        b.cyl(0.11, 0.06, (s * 1.0, 0.2, 0.02), DARK, segs=6, rot=(-math.pi / 2, 0, 0))
        b.cyl(0.12, 0.05, (s * 1.0, -0.96, 0.02), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
        fin(b, [(-0.4, 0.1), (-0.9, 0.1), (-0.95, 0.42), (-0.75, 0.42)], s * 1.0, 0.05, A)
        b.box((0.08, 0.14, 0.06), (s * 1.0, 0.25, 0.14), C, glow=True)                 # wingtip lights
    b.cyl(0.14, 0.05, (0, -0.96, 0.02), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    body = b.build(root)
    for k, x in enumerate((-1.0, 0.0, 1.0)):
        flame(body, f"{kind}_flame_{k}", (x, -0.98, 0.02), 0.11 if x else 0.12, 0.45, clip, T, phase=k * 0.3, k=4)
    marker(body, kind, "muzzle", (0, 1.2, 0.0))
    osc(body, clip, "location", T, (2, 0.04, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.04, 1, 0.25))


def dart_beast():
    kind, clip, root = _root("dart", "beast", "fly")
    T = 0.5
    b = Model(f"{kind}_body", seed=102)
    b.ball(0.25, (0, 0.25, 0), A, subdiv=1, scale=(1.0, 1.3, 0.9))                     # thorax
    for k, (y, r) in enumerate(((-0.2, 0.2), (-0.52, 0.17), (-0.8, 0.13), (-1.02, 0.09))):  # striped abdomen
        b.ball(r, (0, y, 0.0), A if k % 2 == 0 else B, subdiv=1, scale=(1, 1.25, 0.9))
    limb(b, (0, -1.08, 0), (0, -1.35, -0.05), 0.07, 0.0, C, segs=4, glow=True)        # stinger
    b.ball(0.2, (0, 0.7, 0.02), B, subdiv=1, scale=(1.1, 0.9, 0.85))                   # head
    eyes(b, 0.15, 0.77, 0.08, 0.13, pupil=False)
    for s in (1, -1):
        limb(b, (s * 0.08, 0.86, -0.05), (s * 0.02, 1.1, -0.06), 0.05, 0.01, DARK, segs=3)   # mandibles
    body = b.build(root, loc=(0, 0, 0))
    for k, (y, span, ph) in enumerate(((0.4, 1.15, 0.0), (0.1, 1.0, 0.5))):
        outline = [(0, 0.1), (0, -0.12), (span * 0.55, -0.24), (span, -0.12), (span * 1.02, 0.08), (span * 0.6, 0.16)]

        def spot(w, s, span=span):
            w.box((0.2, 0.16, 0.06), (s * span * 0.85, -0.02, 0.03), C, glow=True)
            limb(w, (0, 0.08, 0.03), (s * span, 0.04, 0.03), 0.04, 0.02, A, segs=3)
        wing_pair(body, f"{kind}_wing_{k}", (0.12, y, 0.12), outline, 0.04, B, clip, T, 0.5, harm=4, phase=ph,
                  dihedral=0.1, extra=spot)
    marker(body, kind, "muzzle", (0, 1.1, 0.0))
    osc(body, clip, "location", T, (2, 0.05, 1, 0))


# --- swarm: small, ~1.2 -----------------------------------------------------------------------

def swarm_mech():
    kind, clip, root = _root("swarm", "mech", "hover")
    T = 1.0
    b = Model(f"{kind}_body", seed=103)
    b.cyl(0.28, 0.22, (0, 0, -0.12), B, segs=8)
    b.ball(0.24, (0, 0.0, 0.1), A, subdiv=1, scale=(1, 1.1, 0.7))
    b.box((0.28, 0.14, 0.14), (0, 0.29, 0.04), C, glow=True)                           # eye
    b.box((0.38, 0.1, 0.08), (0, 0.24, -0.06), DARK)
    fin(b, [(-0.1, 0.05), (-0.42, 0.05), (-0.45, 0.32)], 0, 0.05, A)
    for s in (1, -1):
        b.box((0.32, 0.12, 0.08), (s * 0.3, -0.04, 0.0), B)                               # arm
        b.cyl(0.27, 0.14, (s * 0.52, -0.05, -0.08), A, segs=8)                             # duct
        b.cyl(0.21, 0.04, (s * 0.52, -0.05, 0.03), DARK, segs=8)
        b.box((0.1, 0.12, 0.08), (s * 0.8, -0.05, 0.0), C, glow=True)
    body = b.build(root)
    for k, s in enumerate((1, -1)):
        rotor(body, f"{kind}_rotor_{k}", (s * 0.52, -0.05, 0.1), 0.21, 2, clip, T, s * 4, color=A)
    marker(body, kind, "muzzle", (0, 0.35, 0.0))
    osc(body, clip, "location", T, (2, 0.06, 1, 0), (0, 0.03, 1, 0.25))
    osc(body, clip, "rotation_euler", T, (1, 0.08, 1, 0.25), (0, 0.05, 1, 0))


def swarm_beast():
    kind, clip, root = _root("swarm", "beast", "flap")
    T = 0.5
    b = Model(f"{kind}_body", seed=104)
    b.ball(0.2, (0, 0, 0), A, subdiv=1, scale=(0.9, 1.4, 0.85))
    b.ball(0.16, (0, 0.3, 0.06), A, subdiv=1, scale=(1, 1, 0.9))                       # head
    for s in (1, -1):
        limb(b, (s * 0.08, 0.32, 0.15), (s * 0.15, 0.2, 0.36), 0.06, 0.0, B, segs=4)    # ears
    eyes(b, 0.08, 0.42, 0.1, 0.07, pupil=False)
    limb(b, (0, -0.25, 0), (0, -0.55, 0.02), 0.06, 0.0, B, segs=4)                     # tail
    b.box((0.16, 0.12, 0.06), (0, -0.58, 0.02), C, glow=True)
    body = b.build(root)

    def bones(w, s):
        limb(w, (0, 0.1, 0.03), (s * 0.76, 0.16, 0.03), 0.05, 0.03, A, segs=3)
    wing_pair(body, f"{kind}_wing", (0.12, 0.02, 0.05),
              [(0, 0.16), (0, -0.2), (0.3, -0.14), (0.5, -0.36), (0.78, -0.18), (0.75, 0.18)], 0.04, B,
              clip, T, 0.7, extra=bones)
    marker(body, kind, "muzzle", (0, 0.5, 0.0))
    osc(body, clip, "location", T, (2, 0.08, 1, 0.5))


# --- gunship: chunky, gun mounts, ~4 -------------------------------------------------------------

def gunship_mech():
    kind, clip, root = _root("gunship", "mech", "hover")
    T = 2.0
    b = Model(f"{kind}_body", seed=105)
    hull(b, [(-0.55, 1.55), (-0.8, 0.9), (-0.85, -1.2), (-0.6, -1.7), (0.6, -1.7), (0.85, -1.2), (0.8, 0.9), (0.55, 1.55)],
         -0.35, 0.35, A, inset=0.75)
    b.box((0.9, 0.5, 0.25), (0, 1.2, 0.3), GLASS, rot=(0.35, 0, 0))                    # cockpit glass
    b.box((0.8, 0.1, 0.06), (0, 1.36, 0.42), C, glow=True, rot=(0.35, 0, 0))
    b.box((1.0, 1.2, 0.2), (0, -0.2, 0.42), B)                                          # dorsal deck
    b.box((0.55, 0.55, 0.2), (0.15, 0.1, 0.62), A)                                      # cargo crate (off-centre)
    b.box((0.3, 0.6, 0.12), (-0.25, -0.65, 0.58), DARK)                                 # vent
    for k in range(3):
        b.box((0.36, 0.07, 0.05), (-0.25, -0.45 - k * 0.18, 0.66), C, glow=True)
    for s in (1, -1):
        b.box((0.95, 0.9, 0.18), (s * 1.15, -0.1, 0.0), B)                              # stub wings
        b.cyl(0.72, 0.36, (s * 1.85, -0.1, -0.18), A, segs=10)                          # fan ducts
        b.cyl(0.58, 0.04, (s * 1.85, -0.1, 0.15), DARK, segs=10)
        b.box((0.16, 0.25, 0.1), (s * 2.55, -0.1, 0.1), C, glow=True)                   # nav lights
        b.box((0.45, 0.8, 0.4), (s * 0.85, 1.15, 0.05), B)                               # cannon mounts
        b.box((0.3, 0.3, 0.12), (s * 0.85, 1.0, 0.3), A)
        for d in (-0.1, 0.1):
            tube(b, 0.08, 1.5, 2.15, s * 0.85 + d, 0.08, DARK, segs=5)
        b.box((0.36, 0.1, 0.14), (s * 0.85, 2.15, 0.08), C, glow=True)
        fin(b, [(-1.0, 0.3), (-1.65, 0.3), (-1.75, 0.95), (-1.45, 0.95)], s * 0.55, 0.08, B)
        tube(b, 0.22, -1.4, -1.85, s * 0.42, -0.05, DARK, segs=6)
        b.cyl(0.18, 0.06, (s * 0.42, -1.86, -0.05), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    body = b.build(root)
    for k, s in enumerate((1, -1)):
        rotor(body, f"{kind}_fan_{k}", (s * 1.85, -0.1, 0.24), 0.58, 3, clip, T, s * 6, color=B, hub=C)
        flame(body, f"{kind}_flame_{k}", (s * 0.42, -1.88, -0.05), 0.17, 0.55, clip, T, phase=k * 0.4, k=4)
        marker(body, kind, "muzzle", (s * 0.85, 2.25, 0.08), k)
    osc(body, clip, "location", T, (2, 0.08, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.03, 1, 0.25), (0, 0.02, 1, 0))


def gunship_beast():
    kind, clip, root = _root("gunship", "beast", "flap")
    T = 1.0
    b = Model(f"{kind}_body", seed=106)
    b.ball(1.0, (0, -0.2, 0), A, subdiv=2, scale=(1.15, 1.6, 0.6))                      # carapace
    for k, y in enumerate((-1.1, -0.55, 0.0, 0.55)):  # overlapping plates
        c = math.sqrt(max(0.0, 1 - ((y + 0.2) / 1.6) ** 2))
        b.ball(1.0, (0, y, 0.06), B if k % 2 else A, subdiv=1, scale=(1.18 * c + 0.06, 0.32, 0.6 * c + 0.06))
    for y in (-0.9, -0.3, 0.3):  # a spine of horns
        limb(b, (0, y, 0.55), (0, y - 0.25, 0.95), 0.14, 0.0, B, segs=4)
    b.ball(0.5, (0, 1.35, -0.05), B, subdiv=1, scale=(1.2, 0.9, 0.7))                   # head
    eyes(b, 0.35, 1.6, 0.12, 0.15)
    for s in (1, -1):  # two spitting horns: the gun mounts
        limb(b, (s * 0.45, 1.4, -0.1), (s * 0.55, 2.15, 0.0), 0.2, 0.12, A, segs=6)
        b.ball(0.15, (s * 0.55, 2.15, 0.0), C, subdiv=1, glow=True)
        for k in range(3):  # glowing pores down the flanks
            b.ball(0.11, (s * (0.95 - k * 0.06), -0.6 + k * 0.45, 0.25), C, subdiv=0, glow=True)
    limb(b, (0, -1.75, 0), (0, -2.15, -0.05), 0.25, 0.05, B, segs=5)                   # tail spike
    body = b.build(root)

    def ribs(w, s):
        for k in range(3):
            limb(w, (0, 0.25, 0.04), (s * (1.1 + 0.25 * k), 0.2 - k * 0.5, 0.04), 0.1, 0.05, A, segs=4)
    wing_pair(body, f"{kind}_wing", (0.85, 0.2, 0.15),
              [(0, 0.4), (0, -0.45), (0.9, -1.2), (1.75, -1.1), (2.2, -0.25), (1.6, 0.4)], 0.08, B, clip, T, 0.4,
              extra=ribs)
    for k, s in enumerate((1, -1)):
        marker(body, kind, "muzzle", (s * 0.55, 2.25, 0.0), k)
    osc(body, clip, "location", T, (2, 0.1, 1, 0.5))


# --- turret: ground emplacement, ~2.5, aiming head -------------------------------------------------

def turret_mech():
    kind, clip, root = _root("turret", "mech", "scan")
    T = 3.0
    b = Model(f"{kind}_base", seed=107)
    oct8 = [(math.cos(TAU * (k + 0.5) / 8) * 1.25, math.sin(TAU * (k + 0.5) / 8) * 1.25) for k in range(8)]
    hull(b, oct8, 0, 0.55, B, inset=0.85)
    b.cyl(0.85, 0.12, (0, 0, 0.55), A, segs=8)
    for k in range(8):  # hazard blocks round the rim
        a = TAU * k / 8
        b.box((0.32, 0.22, 0.1), (math.cos(a) * 0.98, math.sin(a) * 0.98, 0.5), C if k % 2 else DARK, rot=(0, 0, a))
    for s in (1, -1):
        b.box((0.4, 0.4, 0.3), (s * 0.95, -0.75, 0.6), A)                                # ammo bins
        b.box((0.12, 0.12, 0.12), (s * 0.95, -0.75, 0.8), C, glow=True)
    base = b.build(root)
    mast = Model(f"{kind}_radar")
    mast.box((0.5, 0.08, 0.3), (0, 0, 0.15), A, rot=(0.3, 0, 0))
    mast.cyl(0.05, 0.1, (0, 0, -0.1), DARK, segs=4)
    radar = mast.build(base, loc=(-0.95, -0.75, 0.85))
    spin(radar, clip, T, 2)
    h = Model(f"{kind}_head", seed=108)
    hull(h, [(-0.5, 0.65), (-0.7, 0.2), (-0.65, -0.6), (0.65, -0.6), (0.7, 0.2), (0.5, 0.65)], 0, 0.6, A, inset=0.7)
    h.box((0.55, 0.3, 0.12), (0, -0.25, 0.62), B)
    for s in (1, -1):
        h.box((0.22, 0.85, 0.45), (s * 0.52, 0.0, 0.3), B)                                 # cheek armour
        tube(h, 0.13, 0.4, 1.55, s * 0.24, 0.3, DARK, segs=6)                               # barrels
        tube(h, 0.17, 0.4, 0.75, s * 0.24, 0.3, B, segs=6)
        h.cyl(0.15, 0.08, (s * 0.24, 1.5, 0.3), C, segs=6, rot=(-math.pi / 2, 0, 0), glow=True)
    head = h.build(base, loc=(0, 0, 0.67), part="head")
    head.name = f"{kind}_head"
    e = Model(f"{kind}_sensor")
    e.box((0.34, 0.14, 0.14), (0, 0, 0), C, glow=True)
    sensor = e.build(head, loc=(0, 0.52, 0.5))
    pulse(sensor, clip, T, 0.3, harm=3, axes=(0, 2))
    for k, s in enumerate((1, -1)):
        marker(head, kind, "muzzle", (s * 0.24, 1.6, 0.3), k)


def turret_beast():
    kind, clip, root = _root("turret", "beast", "breathe")
    T = 2.0
    b = Model(f"{kind}_base", seed=109)
    b.ball(0.9, (0, 0, 0.1), B, subdiv=1, scale=(1.2, 1.2, 0.45), jitter=0.05)          # root mound
    for k in range(7):  # gnarled roots
        a = TAU * k / 7 + 0.3
        limb(b, (math.cos(a) * 0.6, math.sin(a) * 0.6, 0.2), (math.cos(a) * 1.35, math.sin(a) * 1.35, 0.0), 0.16, 0.05, B, segs=4)
    limb(b, (0, 0, 0.3), (0, 0, 0.75), 0.4, 0.3, A, segs=7)                              # stalk
    base = b.build(root)
    fronds = []
    for k in range(5):
        a = TAU * k / 5 + 0.6
        f = Model(f"{kind}_frond_{k}")
        flat(f, [(0, -0.15), (0.6, -0.25), (1.1, -0.05), (0.65, 0.22), (0, 0.15)], 0, 0.06, A)
        flat(f, [(0.1, -0.04), (0.95, -0.03), (0.95, 0.03), (0.1, 0.04)], 0.04, 0.03, C, glow=True)
        obj = f.build(base, loc=(math.cos(a) * 0.4, math.sin(a) * 0.4, 0.4), rot_z=a)
        obj.rotation_euler[1] = -0.25
        osc(obj, clip, "rotation_euler", T, (1, 0.12, 1, k / 5))
        fronds.append(obj)
    h = Model(f"{kind}_head", seed=110)
    h.ball(0.55, (0, 0, 0.45), A, subdiv=1, scale=(1, 1.1, 0.95))                        # pod
    for k in range(4):  # armoured husk plates
        a = TAU * k / 4 + 0.785
        h.ball(0.4, (math.cos(a) * 0.32, math.sin(a) * 0.3 - 0.1, 0.55), B, subdiv=1, scale=(0.8, 1.1, 0.75))
    limb(h, (0, 0.3, 0.45), (0, 0.95, 0.5), 0.36, 0.26, A, segs=8)                       # spout
    h.cyl(0.3, 0.08, (0, 0.95, 0.5), B, segs=8, rot=(-math.pi / 2, 0, 0))
    h.cyl(0.2, 0.1, (0, 0.98, 0.5), C, segs=8, rot=(-math.pi / 2, 0, 0), glow=True)       # glowing maw
    for k in range(6):
        a = TAU * k / 6
        limb(h, (math.cos(a) * 0.3, 0.98, 0.5 + math.sin(a) * 0.3), (math.cos(a) * 0.42, 1.18, 0.5 + math.sin(a) * 0.42),
             0.07, 0.0, B, segs=3)
    for s in (1, -1):
        h.ball(0.13, (s * 0.3, 0.45, 0.75), C, subdiv=1, glow=True)                         # eyes
    head = h.build(base, loc=(0, 0, 0.7), part="head")
    head.name = f"{kind}_head"
    sac = Model(f"{kind}_sac")
    sac.ball(0.26, (0, 0, 0), C, subdiv=1, scale=(1, 1, 0.7), glow=True)
    sac_obj = sac.build(head, loc=(0, -0.35, 0.95))
    pulse(sac_obj, clip, T, 0.25)
    marker(head, kind, "muzzle", (0, 1.2, 0.5))


# --- bomber: slow and wide, ~4.5 ---------------------------------------------------------------

def bomber_mech():
    kind, clip, root = _root("bomber", "mech", "fly")
    T = 2.0
    b = Model(f"{kind}_body", seed=111)
    hull(b, [(0, 1.7), (-0.75, 1.1), (-0.85, -1.4), (-0.5, -1.9), (0.5, -1.9), (0.85, -1.4), (0.75, 1.1)], -0.35, 0.35, A, inset=0.7)
    b.box((0.7, 0.45, 0.2), (0, 1.15, 0.3), GLASS, rot=(0.3, 0, 0))
    b.box((0.6, 0.08, 0.06), (0, 1.3, 0.4), C, glow=True, rot=(0.3, 0, 0))
    b.cyl(0.32, 0.25, (0, -0.4, 0.3), B, segs=8)                                        # flak turret
    for s in (1, -1):
        tube(b, 0.06, -0.4, 0.3, s * 0.1, 0.48, DARK, segs=4)
    for pts in both([(0.7, 0.9), (0.8, -1.2), (2.5, -1.25), (2.85, -0.9), (2.7, -0.4)]):
        hull(b, pts, -0.12, 0.1, A, inset=0.92)
    for pts in both([(1.0, 0.45), (1.05, -1.0), (2.35, -1.05), (2.55, -0.55)]):
        flat(b, pts, 0.12, 0.04, B)
    for s in (1, -1):
        for x in (1.3, 2.05):  # engine nacelles with pusher props
            tube(b, 0.24, 0.6, -1.2, s * x, 0.05, B, segs=7, r_end=0.2)
            b.cyl(0.18, 0.06, (s * x, 0.62, 0.05), DARK, segs=7, rot=(-math.pi / 2, 0, 0))
        for k in range(2):  # mines slung under the wing: glowing caps
            b.ball(0.2, (s * (1.68), 0.2 - k * 0.6, -0.15), DARK, subdiv=1)
            b.ball(0.11, (s * 1.68, 0.2 - k * 0.6, 0.02), C, subdiv=0, glow=True)
        b.box((0.18, 0.3, 0.08), (s * 2.78, -0.75, 0.08), C, glow=True)                   # wingtip lights
        fin(b, [(-1.2, 0.3), (-1.9, 0.3), (-2.0, 0.85), (-1.65, 0.85)], s * 0.5, 0.08, B)
    body = b.build(root)
    k = 0
    for s in (1, -1):
        for x in (1.3, 2.05):
            p = Model(f"{kind}_prop_{k}")
            for j in range(3):
                a = TAU * j / 3
                p.box((0.13, 0.05, 0.5), (math.sin(a) * 0.25, 0, math.cos(a) * 0.25), A, rot=(0, a, 0))
            p.ball(0.1, (0, -0.05, 0), C, subdiv=0, glow=True)
            obj = p.build(body, loc=(s * x, -1.28, 0.05))
            spin(obj, clip, T, s * 6, axis=1)
            k += 1
    marker(body, kind, "muzzle", (0, 0, -0.4))
    osc(body, clip, "location", T, (2, 0.06, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.02, 1, 0.25))


def bomber_beast():
    kind, clip, root = _root("bomber", "beast", "glide")
    T = 2.0
    b = Model(f"{kind}_body", seed=112)
    b.ball(1.0, (0, 0, 0), A, subdiv=2, scale=(1.1, 1.7, 0.45))
    b.slab([(-1.0, 1.0), (-1.5, -0.6), (-0.7, -1.2), (0.7, -1.2), (1.5, -0.6), (1.0, 1.0)], -0.12, 0.08, A)
    for s in (1, -1):  # cephalic horns
        limb(b, (s * 0.55, 1.25, 0), (s * 0.5, 2.0, 0.05), 0.2, 0.06, B, segs=5)
        b.ball(0.15, (s * 0.72, 1.3, 0.22), C, subdiv=1, glow=True)                        # eyes
    for y in (0.6, 0.1, -0.4, -0.9):  # back ridge
        b.box((0.3, 0.3, 0.3), (0, y, 0.42), B, rot=(0.785, 0, 0))
    for (x, y) in ((0.55, 0.35), (-0.55, 0.35), (0.6, -0.45), (-0.6, -0.45), (0, -0.0)):  # glowing egg-bombs
        b.ball(0.2, (x, y, 0.3), C, subdiv=1, scale=(1, 1.2, 0.7), glow=True)
        b.cyl(0.25, 0.08, (x, y, 0.22), B, segs=6)
    body = b.build(root)
    t = Model(f"{kind}_tail")
    limb(t, (0, 0, 0), (0, -2.2, 0.05), 0.14, 0.02, B, segs=4)
    t.box((0.4, 0.3, 0.06), (0, -2.0, 0.05), C, glow=True, rot=(0, 0, 0.785))
    tail = t.build(body, loc=(0, -1.6, 0))
    osc(tail, clip, "rotation_euler", T, (2, 0.25, 1, 0.3))

    def stripe(w, s):
        flat(w, [(0.3, 0.3), (0.4, -0.5), (1.4, -0.4), (1.8, -0.15)] if s > 0 else
             mirror([(0.3, 0.3), (0.4, -0.5), (1.4, -0.4), (1.8, -0.15)]), 0.06, 0.04, B)
    wing_pair(body, f"{kind}_wing", (1.2, 0.0, 0.0),
              [(0, 0.95), (0, -1.0), (0.9, -0.85), (2.05, -0.25), (2.2, 0.0), (1.1, 0.75)], 0.12, A, clip, T, 0.35,
              extra=stripe)
    marker(body, kind, "muzzle", (0, 0, -0.3))
    osc(body, clip, "location", T, (2, 0.12, 1, 0.5))


# --- lancer: big beam emitter, ~3 --------------------------------------------------------------

def lancer_mech():
    kind, clip, root = _root("lancer", "mech", "charge")
    T = 1.0
    b = Model(f"{kind}_body", seed=113)
    hull(b, [(-0.3, 0.3), (-0.5, -0.5), (-0.4, -1.4), (0.4, -1.4), (0.5, -0.5), (0.3, 0.3)], -0.25, 0.28, A, inset=0.7)
    b.ball(0.2, (0, -0.25, 0.3), GLASS, subdiv=1, scale=(1, 1.6, 0.7))
    tube(b, 0.22, 0.2, 1.6, 0, 0.0, B, segs=8, r_end=0.15)                              # the lance barrel
    tube(b, 0.11, 1.6, 1.9, 0, 0.0, DARK, segs=6)
    for pts in both([(0.4, -0.2), (0.48, -0.9), (1.3, -1.55), (1.35, -1.25)]):            # swept capacitor fins
        flat(b, pts, 0.0, 0.08, A)
    for s in (1, -1):
        b.box((0.12, 0.55, 0.12), (s * 1.0, -1.05, 0.08), C, glow=True, rot=(0, 0, s * 0.7))
        tube(b, 0.16, -1.0, -1.5, s * 0.25, 0.0, DARK, segs=6)
        b.cyl(0.13, 0.05, (s * 0.25, -1.51, 0.0), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
        fin(b, [(-0.7, 0.25), (-1.35, 0.25), (-1.4, 0.65), (-1.15, 0.65)], s * 0.3, 0.06, B)
    body = b.build(root)
    coils = []
    for k, y in enumerate((0.55, 0.95, 1.35)):
        c = Model(f"{kind}_coil_{k}")
        r = 0.42 - k * 0.06
        for j in range(4):  # a ring of four glowing studs on a dark collar
            a = TAU * j / 4
            c.box((0.16, 0.14, 0.16), (math.cos(a) * r, 0, math.sin(a) * r), C, glow=True, rot=(0, -a, 0))
        c.cyl(r * 0.8, 0.12, (0, -0.06, 0), A, segs=8, rot=(-math.pi / 2, 0, 0))
        obj = c.build(body, loc=(0, y, 0.0))
        spin(obj, clip, T, 1 if k % 2 else -1, axis=1, phase=k * 0.1)
        coils.append(obj)
    tip = Model(f"{kind}_tip")
    tip.ball(0.2, (0, 0, 0), C, subdiv=1, scale=(1, 1.4, 1), glow=True)
    tip_obj = tip.build(body, loc=(0, 1.95, 0.0))
    pulse(tip_obj, clip, T, 0.3, harm=2)
    marker(body, kind, "emitter", (0, 2.15, 0.0))
    osc(body, clip, "location", T, (2, 0.04, 1, 0))


def lancer_beast():
    kind, clip, root = _root("lancer", "beast", "charge")
    T = 1.2
    b = Model(f"{kind}_body", seed=114)
    b.ball(0.45, (0, -0.2, 0), A, subdiv=1, scale=(1.3, 1.8, 0.8))
    b.ball(0.38, (0, -0.25, -0.12), B, subdiv=1, scale=(1.3, 1.7, 0.6))
    b.ball(0.36, (0, 0.55, 0.05), A, subdiv=1, scale=(0.95, 1.1, 0.85))                  # head
    for s in (1, -1):
        b.ball(0.11, (s * 0.25, 0.72, 0.2), C, subdiv=1, glow=True)
        limb(b, (s * 0.2, 0.5, 0.25), (s * 0.35, 0.05, 0.55), 0.09, 0.0, B, segs=4)      # swept-back crest
    chain(b, [(0, -0.95, 0), (0, -1.4, 0.05)], [0.22, 0.08], A, segs=6)
    fin(b, [(-1.25, 0.0), (-1.75, 0.5), (-1.55, 0.0), (-1.75, -0.4)], 0, 0.06, B)          # tail fin
    for k in range(3):  # spine of glowing nodes: the charge running up to the horn
        b.ball(0.1, (0, -0.8 + k * 0.4, 0.33 - abs(k - 1) * 0.04), C, subdiv=0, glow=True)
    body = b.build(root)
    h = Model(f"{kind}_horn")
    for k in range(5):  # a spiral horn, banded
        y0, y1 = k * 0.3, (k + 1) * 0.3
        tube(h, 0.22 - k * 0.04, y0, y1, 0, 0, C if k % 2 else B, segs=6, r_end=0.2 - k * 0.04, glow=bool(k % 2))
    limb(h, (0, 1.5, 0), (0, 1.75, 0), 0.06, 0.0, C, segs=5, glow=True)
    horn = h.build(body, loc=(0, 0.85, 0.05))
    pulse(horn, clip, T, 0.08, harm=2, axes=(0, 2))

    def membrane(w, s):
        limb(w, (0, 0.3, 0.04), (s * 1.45, -0.05, 0.04), 0.09, 0.03, A, segs=4)
        limb(w, (s * 0.7, 0.15, 0.04), (s * 0.85, -0.85, 0.04), 0.06, 0.02, A, segs=3)
        w.box((0.2, 0.2, 0.06), (s * 1.2, -0.45, 0.04), C, glow=True)
    wing_pair(body, f"{kind}_wing", (0.45, -0.05, 0.12),
              [(0, 0.35), (0, -0.6), (0.7, -1.0), (1.4, -0.75), (1.5, -0.05)], 0.05, B, clip, T, 0.5, extra=membrane)
    marker(horn, kind, "emitter", (0, 1.8, 0.0))
    osc(body, clip, "location", T, (2, 0.1, 1, 0.5))


# --- brute: heavily armoured, ~6 -----------------------------------------------------------------

def brute_mech():
    kind, clip, root = _root("brute", "mech", "hum")
    T = 2.0
    b = Model(f"{kind}_body", seed=115)
    hull(b, [(-0.9, 2.6), (-1.6, 1.6), (-1.75, -1.6), (-1.3, -2.7), (1.3, -2.7), (1.75, -1.6), (1.6, 1.6), (0.9, 2.6)],
         -0.6, 0.45, B, inset=0.85)
    hull(b, [(-0.7, 2.3), (-1.3, 1.3), (-1.35, -1.4), (-1.0, -2.3), (1.0, -2.3), (1.35, -1.4), (1.3, 1.3), (0.7, 2.3)],
         0.4, 0.85, A, inset=0.8)                                                        # upper armour deck
    for s in (1, -1):  # side armour plates, staggered
        for k, y in enumerate((1.2, 0.0, -1.2)):
            b.box((0.35, 1.05, 0.7), (s * 1.75, y, 0.1), A if k % 2 else B, rot=(0, s * 0.25, 0))
    b.box((1.2, 0.3, 0.2), (0, 2.25, 0.75), DARK)                                         # visor slit
    for x in (-0.4, 0.0, 0.4):
        b.box((0.26, 0.2, 0.12), (x, 2.3, 0.8), C, glow=True)
    b.box((1.5, 0.5, 0.35), (0, 2.75, -0.2), A, taper=0.7)                                # ram prow
    for s in (1, -1):
        limb(b, (s * 0.7, 2.7, -0.2), (s * 0.85, 3.25, -0.25), 0.2, 0.02, B, segs=4)     # ram spikes
    for s in (1, -1):  # twin-gun side turrets
        b.cyl(0.5, 0.35, (s * 0.95, 0.9, 0.8), B, segs=8)
        b.cyl(0.38, 0.1, (s * 0.95, 0.9, 1.15), A, segs=8)
        for d in (-0.12, 0.12):
            tube(b, 0.08, 1.1, 2.0, s * 0.95 + d, 1.0, DARK, segs=5)
        b.box((0.4, 0.08, 0.1), (s * 0.95, 2.02, 1.0), C, glow=True)
    b.box((1.3, 1.1, 0.2), (0, -0.7, 0.92), B)                                            # reactor housing
    for k in range(3):  # big engines
        x = (k - 1) * 0.95
        tube(b, 0.42, -2.3, -2.95, x, -0.05, DARK, segs=8)
        b.cyl(0.33, 0.06, (x, -2.96, -0.05), C, segs=8, rot=(math.pi / 2, 0, 0), glow=True)
    for s in (1, -1):  # exhaust stacks
        tube(b, 0.14, -1.5, -1.9, s * 1.05, 1.05, DARK, segs=5)
        b.box((0.32, 0.6, 0.6), (s * 1.05, -1.65, 0.9), B)
    body = b.build(root)
    r = Model(f"{kind}_reactor")
    r.cyl(0.42, 0.18, (0, 0, 0), C, segs=8, glow=True)
    for j in range(4):
        a = TAU * j / 4
        r.box((0.12, 0.85, 0.12), (0, 0, 0.18), DARK, rot=(0, 0, a))
    reactor = r.build(body, loc=(0, -0.7, 0.95))
    pulse(reactor, clip, T, 0.12, harm=2, axes=(0, 1))
    spin(reactor, clip, T, 1)
    for k in range(3):
        flame(body, f"{kind}_flame_{k}", ((k - 1) * 0.95, -2.98, -0.05), 0.3, 0.8, clip, T, phase=k * 0.33, k=6)
    n = 0
    for s in (1, -1):
        for d in (-0.12, 0.12):
            marker(body, kind, "muzzle", (s * 0.95 + d, 2.05, 1.0), n)
            n += 1
    osc(body, clip, "location", T, (2, 0.06, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.015, 1, 0.25))


def brute_beast():
    kind, clip, root = _root("brute", "beast", "flap")
    T = 1.6
    b = Model(f"{kind}_body", seed=116)
    RX, RY, RZ = 1.8, 2.3, 1.0
    b.ball(1.0, (0, -0.2, 0), B, subdiv=2, scale=(RX, RY, RZ))                            # body under the shell
    for k, (y, w) in enumerate(((1.1, 0.75), (0.25, 1.0), (-0.65, 1.0), (-1.5, 0.75))):  # four armour bands
        c = math.sqrt(max(0.0, 1 - ((y + 0.2) / RY) ** 2))
        b.ball(1.0, (0, y, 0.12), A, subdiv=1, scale=(RX * c + 0.12, 0.42, RZ * c + 0.05), jitter=0.03)
        for s in (1, -1):  # glowing seams between the bands
            b.box((0.25, 0.14, 0.12), (s * RX * c * 0.55, y - 0.48, RZ * c * 0.85 + 0.1), C, glow=True)
        for s in (-1, 0, 1):  # spikes along each band
            x = s * RX * c * 0.55
            z = RZ * c + 0.1 - abs(s) * 0.25
            limb(b, (x, y, z), (x * 1.15, y - 0.2, z + 0.55 - abs(s) * 0.15), 0.18, 0.0, B, segs=4)
    for s in (1, -1):  # spiked rim plates
        for k in range(4):
            y = 1.0 - k * 0.85
            limb(b, (s * 1.6, y, 0.0), (s * 2.25, y - 0.35, 0.0), 0.2, 0.0, A, segs=4)
    hd = (0, 2.3, -0.1)
    b.ball(0.75, hd, A, subdiv=1, scale=(1.25, 0.9, 0.75))                                 # head
    b.ball(0.6, (0, 2.55, 0.25), B, subdiv=1, scale=(1.3, 0.7, 0.5))                       # brow plate
    eyes(b, 0.55, 2.75, 0.12, 0.16)
    for s in (1, -1):  # tusks
        chain(b, [(s * 0.55, 2.7, -0.3), (s * 0.95, 3.3, -0.25), (s * 0.85, 3.75, 0.15)], [0.22, 0.15, 0.03], C, segs=5)
        limb(b, (s * 0.35, 2.4, 0.45), (s * 0.8, 1.9, 1.15), 0.16, 0.0, B, segs=4)         # horns
    for k, (y, r) in enumerate(((-2.55, 0.42), (-3.0, 0.32))):  # tail and club
        b.ball(r, (0, y, -0.1), A, subdiv=1)
    b.ball(0.45, (0, -3.45, -0.05), B, subdiv=1, jitter=0.06)
    for s in (1, -1):
        limb(b, (s * 0.25, -3.45, 0.0), (s * 0.7, -3.55, 0.1), 0.14, 0.0, A, segs=4)
    body = b.build(root)
    for k, (y, span) in enumerate(((0.6, 1.9), (-0.9, 1.5))):
        wing_pair(body, f"{kind}_wing_{k}", (1.4, y, -0.35),
                  [(0, 0.35), (0, -0.4), (span * 0.7, -0.6), (span, -0.25), (span * 0.8, 0.25)], 0.08, B,
                  clip, T, 0.35, phase=k * 0.15)
    for k, s in enumerate((1, -1)):
        marker(body, kind, "muzzle", (s * 0.55, 2.9, 0.12), k)
    osc(body, clip, "location", T, (2, 0.1, 1, 0.5))
    osc(body, clip, "rotation_euler", T, (1, 0.03, 1, 0))


# --- carrier: hangar bay, ~7 -------------------------------------------------------------------

def carrier_mech():
    kind, clip, root = _root("carrier", "mech", "patrol")
    T = 2.0
    b = Model(f"{kind}_body", seed=117)
    hull(b, [(-0.8, 3.4), (-1.6, 2.2), (-1.8, -2.6), (-1.4, -3.4), (1.4, -3.4), (1.8, -2.6), (1.6, 2.2), (0.8, 3.4)],
         -0.6, 0.4, A, inset=0.88)
    # the hangar: a sunken deck with walls, its floor dark, a docked drone, runway lights
    b.box((1.9, 3.2, 0.1), (-0.15, -0.6, 0.38), DARK)
    for s in (1, -1):
        b.box((0.22, 3.4, 0.4), (-0.15 + s * 1.05, -0.6, 0.55), B)
    b.box((2.3, 0.3, 0.45), (-0.15, 1.1, 0.6), B)
    b.box((1.2, 0.18, 0.1), (-0.15, 1.27, 0.66), C, glow=True)                           # bay header light
    b.cyl(0.32, 0.12, (-0.15, -1.2, 0.42), B, segs=8)                                     # parked drone
    b.ball(0.24, (-0.15, -1.2, 0.55), A, subdiv=1, scale=(1, 1.1, 0.6))
    b.box((0.2, 0.1, 0.08), (-0.15, -0.95, 0.52), C, glow=True)
    # command tower, off to starboard
    b.box((0.9, 1.6, 0.9), (1.35, 1.0, 0.85), B, taper=0.85)
    b.box((0.8, 0.3, 0.2), (1.35, 1.75, 1.1), GLASS)
    b.box((0.7, 0.08, 0.06), (1.35, 1.9, 1.15), C, glow=True)
    b.box((0.5, 0.6, 0.4), (1.35, 0.8, 1.45), A)
    # prow and front guns
    b.box((1.4, 0.8, 0.3), (0, 3.0, 0.35), B, taper=0.8)
    for s in (1, -1):
        tube(b, 0.09, 3.0, 3.8, s * 0.35, 0.35, DARK, segs=5)
        b.box((0.22, 0.1, 0.1), (s * 0.35, 3.8, 0.35), C, glow=True)
    # sponson pods, engines
    for s in (1, -1):
        tube(b, 0.45, 2.0, -2.9, s * 2.1, -0.1, B, segs=8, r_end=0.38)
        b.cyl(0.32, 0.06, (s * 2.1, 2.0, -0.1), DARK, segs=8, rot=(-math.pi / 2, 0, 0))
        b.box((0.6, 1.2, 0.2), (s * 1.75, 0.5, -0.05), A)
        b.box((0.16, 0.4, 0.1), (s * 2.55, -0.5, -0.05), C, glow=True)
        fin(b, [(-2.3, 0.3), (-3.3, 0.3), (-3.45, 1.0), (-3.0, 1.0)], s * 2.1, 0.08, A)
    for k in range(4):
        x = (k - 1.5) * 0.75
        tube(b, 0.28, -3.2, -3.6, x, -0.1, DARK, segs=7)
        b.cyl(0.22, 0.05, (x, -3.61, -0.1), C, segs=7, rot=(math.pi / 2, 0, 0), glow=True)
    body = b.build(root)
    for k in range(5):  # runway lights down each bay wall, chasing
        for s in (1, -1):
            l = Model(f"{kind}_light_{k}{'l' if s < 0 else 'r'}")
            l.box((0.14, 0.18, 0.1), (0, 0, 0), C, glow=True)
            obj = l.build(body, loc=(-0.15 + s * 1.05, 0.7 - k * 0.6, 0.77))
            sample(obj, clip, "scale", T, lambda u, k=k: (-0.6,) * 3 if ((u * 2 - k / 5) % 1.0) > 0.3 else (0.4,) * 3)
    r = Model(f"{kind}_radar")
    r.box((0.8, 0.12, 0.35), (0, 0, 0.2), A, rot=(0.35, 0, 0))
    r.cyl(0.06, 0.2, (0, 0, -0.1), DARK, segs=4)
    radar = r.build(body, loc=(1.35, 0.8, 1.7))
    spin(radar, clip, T, 1)
    for k in range(4):
        flame(body, f"{kind}_flame_{k}", ((k - 1.5) * 0.75, -3.63, -0.1), 0.23, 0.6, clip, T, phase=k * 0.25, k=6)
    marker(body, kind, "bay", (-0.15, -0.6, 0.5))
    for k, s in enumerate((1, -1)):
        marker(body, kind, "muzzle", (s * 0.35, 3.85, 0.35), k)
    osc(body, clip, "location", T, (2, 0.06, 1, 0))
    osc(body, clip, "rotation_euler", T, (1, 0.012, 1, 0.25))


def carrier_beast():
    kind, clip, root = _root("carrier", "beast", "breathe")
    T = 2.4
    b = Model(f"{kind}_body", seed=118)
    for k in range(6):  # a ribbed collar where the sac hangs from
        a = TAU * k / 6
        limb(b, (math.cos(a) * 0.5, 1.4 + math.sin(a) * 0.3, 0.2), (math.cos(a) * 1.1, 2.3, -0.1), 0.14, 0.04, B, segs=4)
    b.ball(0.7, (0, 2.1, 0.3), B, subdiv=1, scale=(1.15, 1.0, 0.8))                       # head
    eyes(b, 0.42, 2.55, 0.55, 0.17)
    eyes(b, 0.72, 2.2, 0.5, 0.11, pupil=False)
    for s in (1, -1):
        chain(b, [(s * 0.35, 2.6, 0.1), (s * 0.55, 3.1, 0.15), (s * 0.25, 3.45, 0.15)], [0.16, 0.11, 0.0], A, segs=4)  # mandibles
    body = b.build(root)
    s_ = Model(f"{kind}_sac", seed=119)
    s_.ball(1.0, (0, 0, 0), A, subdiv=2, scale=(2.2, 2.6, 1.3))
    for k in range(6):  # veins over the sac
        a = TAU * k / 6 + 0.3
        s_.ball(1.0, (0, 0, 0.02), B, subdiv=1, scale=(2.25 * abs(math.cos(a)) + 0.12, 2.25 * abs(math.sin(a)) + 0.12, 1.32))
    s_.ball(1.0, (0, -0.2, 0.15), A, subdiv=2, scale=(1.95, 2.35, 1.2))
    # the brood opening: a glowing pouch on its back, ringed with lips, eggs inside
    s_.cyl(0.95, 0.15, (0, -0.4, 1.12), B, segs=10)
    s_.cyl(0.75, 0.12, (0, -0.4, 1.18), C, segs=10, glow=True)
    for (x, y) in ((0.3, -0.2), (-0.3, -0.25), (0.0, -0.75), (0.05, 0.1)):
        s_.ball(0.22, (x, y - 0.1, 1.32), A, subdiv=1, scale=(1, 1.2, 0.8))
    for k in range(5):  # glowing spots
        a = TAU * k / 5
        s_.ball(0.15, (math.cos(a) * 1.7, math.sin(a) * 1.9, 0.55), C, subdiv=0, glow=True)
    sac = s_.build(body, loc=(0, -1.0, 0.0))
    pulse(sac, clip, T, 0.05, axes=(0, 1))
    osc(sac, clip, "scale", T, (2, 0.08, 1, 0.25))
    tents = []
    for k in range(6):
        a = TAU * (k + 0.5) / 6
        t = Model(f"{kind}_tentacle_{k}")
        chain(t, [(0, 0, 0), (0, -0.7, -0.5), (0, -1.5, -0.7), (0, -2.2, -0.6)], [0.22, 0.17, 0.12, 0.04], B, segs=5)
        t.ball(0.12, (0, -2.2, -0.6), C, subdiv=0, glow=True)
        x, y = math.cos(a) * 1.5, math.sin(a) * 1.8 - 0.9
        obj = t.build(sac, loc=(x * 0.8, y * 0.7, -0.7), rot_z=-x * 0.25)
        osc(obj, clip, "rotation_euler", T, (0, 0.2, 1, k / 6), (2, 0.15, 1, k / 6 + 0.25))
        tents.append(obj)
    wing_pair(body, f"{kind}_fin", (1.95, -0.5, 0.2),
              [(0, 0.5), (0, -0.6), (0.9, -0.4), (1.2, 0.1), (0.7, 0.45)], 0.08, B, clip, T, 0.3, harm=2)
    marker(sac, kind, "bay", (0, -0.4, 1.3))
    marker(body, kind, "muzzle", (0, 3.3, 0.2))
    osc(body, clip, "location", T, (2, 0.15, 1, 0))


# --- serpent: segments, ~2 each -----------------------------------------------------------------

SEG = 2.0


def serpent_mech():
    T = 1.2
    # head: a drill-jawed machine with one big eye
    kind, clip, root = _root("serpent_head", "mech", "bite", seg_length=SEG)
    h = Model(f"{kind}_body", seed=120)
    hull(h, [(-0.45, 0.9), (-0.75, 0.2), (-0.7, -1.0), (0.7, -1.0), (0.75, 0.2), (0.45, 0.9)], -0.4, 0.4, A, inset=0.7)
    h.box((0.7, 0.5, 0.15), (0, -0.4, 0.42), B)
    h.box((0.6, 0.25, 0.25), (0, 0.55, 0.3), DARK)
    h.box((0.46, 0.18, 0.18), (0, 0.62, 0.34), C, glow=True)                              # cyclops visor
    for s in (1, -1):
        fin(h, [(-0.2, 0.3), (-0.95, 0.3), (-1.05, 0.75), (-0.7, 0.75)], s * 0.45, 0.07, B)
        h.box((0.14, 0.3, 0.1), (s * 0.75, -0.3, 0.1), C, glow=True)
    head = h.build(root)
    for k, s in enumerate((1, -1)):
        j = Model(f"{kind}_mandible_{k}")
        chain(j, [(0, 0, 0), (s * 0.2, 0.55, 0), (s * 0.05, 1.05, 0)], [0.2, 0.15, 0.03], B, segs=5)
        for i in range(3):
            j.box((0.14, 0.12, 0.12), (s * (0.05 + 0.08 * i), 0.3 + 0.25 * i, 0.12), C, glow=True)
        obj = j.build(head, loc=(s * 0.35, 0.75, -0.05))
        osc(obj, clip, "rotation_euler", T, (2, s * 0.3, 1, 0))
    marker(head, kind, "muzzle", (0, 1.4, 0))
    # body: an armoured ring with side thrusters
    kind, clip, root = _root("serpent_body", "mech", "swim", seg_length=SEG)
    g = Model(f"{kind}_body", seed=121)
    tube(g, 0.5, -1.0, 1.0, 0, 0, B, segs=8)
    tube(g, 0.75, -0.75, 0.75, 0, 0, A, segs=8)
    g.box((0.5, 1.0, 0.2), (0, 0, 0.72), B)
    for k in range(3):
        g.box((0.36, 0.08, 0.06), (0, -0.3 + k * 0.3, 0.84), C, glow=True)
    body = g.build(root)
    for k, s in enumerate((1, -1)):
        f = Model(f"{kind}_fin_{k}")
        flat(f, [(0, 0.35), (0, -0.4), (0.7, -0.65), (0.75, -0.25)] if s > 0 else mirror([(0, 0.35), (0, -0.4), (0.7, -0.65), (0.75, -0.25)]),
             0, 0.08, A)
        f.box((0.14, 0.3, 0.1), (s * 0.6, -0.45, 0.04), C, glow=True)
        obj = f.build(body, loc=(s * 0.72, 0.1, 0.0))
        osc(obj, clip, "rotation_euler", T, (1, s * 0.3, 1, 0), (2, s * 0.15, 1, 0.25))
    # tail: tapering, stabiliser fins, a thruster
    kind, clip, root = _root("serpent_tail", "mech", "swim", seg_length=SEG)
    t = Model(f"{kind}_body", seed=122)
    tube(t, 0.55, 1.0, -0.9, 0, 0, A, segs=8, r_end=0.3)
    tube(t, 0.32, -0.9, -1.15, 0, 0, DARK, segs=6)
    t.cyl(0.26, 0.05, (0, -1.16, 0), C, segs=6, rot=(math.pi / 2, 0, 0), glow=True)
    t.box((0.4, 0.8, 0.15), (0, 0.3, 0.5), B)
    tail = t.build(root)
    f = Model(f"{kind}_fins")
    for pts in both([(0.2, 0.0), (0.25, -0.5), (1.1, -0.95), (1.15, -0.65)]):
        flat(f, pts, 0, 0.08, B)
    fin(f, [(0.1, 0.0), (-0.5, 0.0), (-0.75, 0.75), (-0.45, 0.75)], 0, 0.07, A)
    fins = f.build(tail, loc=(0, -0.4, 0.1))
    osc(fins, clip, "rotation_euler", T, (2, 0.2, 1, 0.25))
    flame(tail, f"{kind}_flame", (0, -1.18, 0), 0.24, 0.6, clip, T, k=4)


def serpent_beast():
    T = 1.2
    kind, clip, root = _root("serpent_head", "beast", "bite", seg_length=SEG)
    h = Model(f"{kind}_body", seed=123)
    h.ball(0.6, (0, -0.15, 0.05), A, subdiv=1, scale=(1.15, 1.2, 0.65))                    # broad skull
    h.ball(0.42, (0, 0.62, 0.02), A, subdiv=1, scale=(1.0, 1.45, 0.5))                     # snout
    h.box((0.6, 0.9, 0.06), (0, 0.55, -0.12), DARK)                                         # mouth roof
    for i in range(3):  # a ridge of plates down the head
        h.box((0.22, 0.22, 0.22), (0, 0.55 - i * 0.38, 0.28 + i * 0.07), B, rot=(0.785, 0, 0))
    for s in (1, -1):
        h.ball(0.17, (s * 0.36, 0.22, 0.3), C, subdiv=1, glow=True)                         # eyes on top
        h.box((0.05, 0.1, 0.2), (s * 0.4, 0.3, 0.38), DARK)
        h.box((0.3, 0.28, 0.12), (s * 0.4, -0.02, 0.4), B, rot=(0, s * 0.35, 0))           # brow behind the eye
        h.box((0.1, 0.1, 0.06), (s * 0.13, 1.12, 0.2), DARK)                                 # nostrils
        flat(h, [(s * 0.55, 0.1), (s * 0.6, -0.55), (s * 1.25, -0.9), (s * 1.05, -0.35), (s * 1.2, 0.0)][:: s], 0.05, 0.08, B)  # frills
        limb(h, (s * 0.3, -0.35, 0.35), (s * 0.7, -1.05, 0.65), 0.17, 0.02, B, segs=4)     # swept horns
        for i in range(4):
            h.cyl(0.05, 0.18, (s * (0.25 - i * 0.02), 0.25 + i * 0.22, -0.12), "#f2ead8", segs=4, r_top=0.0, rot=(math.pi, 0, 0))
    head = h.build(root)
    j = Model(f"{kind}_jaw")
    j.ball(0.32, (0, 0.5, -0.05), B, subdiv=1, scale=(1.05, 1.7, 0.45))
    j.box((0.5, 0.9, 0.05), (0, 0.5, 0.05), C, glow=True)                                  # glowing gullet
    jaw = j.build(head, loc=(0, 0.0, -0.18))
    osc(jaw, clip, "rotation_euler", T, (0, 0.18, 1, 0.0))
    marker(head, kind, "muzzle", (0, 1.25, 0))

    kind, clip, root = _root("serpent_body", "beast", "swim", seg_length=SEG)
    g = Model(f"{kind}_body", seed=124)
    g.ball(0.7, (0, 0, 0), A, subdiv=1, scale=(1.0, 1.45, 0.9))
    g.ball(0.62, (0, 0, -0.18), B, subdiv=1, scale=(1.0, 1.45, 0.75))
    for s in (1, -1):
        for i in range(2):
            g.ball(0.11, (s * 0.55, -0.35 + i * 0.6, 0.3), C, subdiv=0, glow=True)
    for i in range(3):  # plates along the back
        g.box((0.3, 0.3, 0.3), (0, 0.55 - i * 0.55, 0.6 - abs(i - 1) * 0.06), B, rot=(0.785, 0, 0))
    body = g.build(root)
    for k, s in enumerate((1, -1)):
        f = Model(f"{kind}_fin_{k}")
        pts = [(0, 0.3), (0, -0.35), (0.65, -0.7), (0.8, -0.3)]
        flat(f, pts if s > 0 else mirror(pts), 0, 0.07, B)
        obj = f.build(body, loc=(s * 0.62, 0.15, 0.0))
        osc(obj, clip, "rotation_euler", T, (1, s * 0.35, 1, 0), (2, s * 0.15, 1, 0.25))

    kind, clip, root = _root("serpent_tail", "beast", "swim", seg_length=SEG)
    t = Model(f"{kind}_body", seed=125)
    chain(t, [(0, 1.0, 0), (0, 0.0, 0), (0, -0.9, 0.05)], [0.6, 0.38, 0.14], A, segs=8)
    t.ball(0.32, (0, 0.2, -0.12), B, subdiv=1, scale=(1, 1.6, 0.6))
    t.ball(0.1, (0, 0.3, 0.38), C, subdiv=0, glow=True)
    tail = t.build(root)
    f = Model(f"{kind}_fin")
    fin(f, [(0.2, 0.0), (-1.1, 0.7), (-0.75, 0.0), (-1.1, -0.35)], 0, 0.07, B)
    for pts in both([(0, 0.15), (0, -0.25), (0.75, -0.75), (0.65, -0.3)]):
        flat(f, pts, 0, 0.06, B)
    f.box((0.08, 0.3, 0.12), (0, -0.85, 0.5), C, glow=True)
    fn = f.build(tail, loc=(0, -0.8, 0.05))
    osc(fn, clip, "rotation_euler", T, (2, 0.35, 1, 0.0))
    osc(tail, clip, "rotation_euler", T, (2, 0.12, 1, 0.25))


def build():
    for fn in (dart_mech, dart_beast, swarm_mech, swarm_beast, gunship_mech, gunship_beast, turret_mech, turret_beast,
               bomber_mech, bomber_beast, lancer_mech, lancer_beast, brute_mech, brute_beast, carrier_mech,
               carrier_beast, serpent_mech, serpent_beast):
        fn()
    linearize()
    lift = float(os.environ.get("ENEMY_PREVIEW_LIFT", "0"))
    if lift:  # previews only: raise the fliers off the preview's ground plane
        _lift(lift)


def _lift(dz):
    import bpy
    import kit
    for root in [o for o in bpy.data.objects if o.parent is None and "kind" in o]:
        if root["kind"].startswith("enemy_turret"):
            continue
        for ch in root.children:
            ch.location.z += dz
            for act in kit._CLIPS.values():
                for layer in act.layers:
                    for strip in layer.strips:
                        for bag in strip.channelbags:
                            if bag.slot and bag.slot.name_display == ch.name:
                                for fc in bag.fcurves:
                                    if fc.data_path == "location" and fc.array_index == 2:
                                        for kp in fc.keyframe_points:
                                            kp.co.y += dz
                                            kp.handle_left.y += dz
                                            kp.handle_right.y += dz
