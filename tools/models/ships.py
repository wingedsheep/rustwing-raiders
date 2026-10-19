"""The player ships: five frames (hull + cockpit) and the parts that bolt onto their socket grids,
plus the two pickups.

Conventions (shared with src/game/parts.ts and the runtime):
- `frame_<id>`: root empty at the origin; the socket grid is centred on it. CELL = 0.8, row 0 at
  the front (+y). Socket (c, r) centre: x = (c - (cols-1)/2) * 0.8, y = ((rows-1)/2 - r) * 0.8.
  Every '#' socket has a deck plate whose top is z = 0.3 (where parts sit). The cockpit never
  sits on a socket.
- `part_<id>`: root empty at the centre of its cell [0,0], standing on z = 0. Extra cells go +x
  (column offset) and -y (row offset). Guns point +y, engines blow towards -y.
- Liveries: Skin a = hull paint, b = trim, c = accent glow. Metal and rubber are fixed colours.
- `pickup_part` (salvage crate) and `pickup_scrap` (a chunky gear).
- `demo_<frame>`: an assembled ship with its start parts, for previews only (built when the
  command line has --preview, or SHIPS_DEMO=1).
"""
from __future__ import annotations

import math
import os
import sys

from kit import Model, Skin, animate, group

TAU = math.pi * 2
CELL = 0.8
DECK = 0.3

A = Skin("a", "#c8642a")      # hull paint (P1 rust orange)
B = Skin("b", "#ecdcb8")      # trim (cream)
C = Skin("c", "#ffc24a")      # accent glow

METAL = "#8a9098"
STEEL = "#5c626c"
DARK = "#363a42"
DECKC = "#2c2f36"
DECKP = "#6e747e"
RUBBER = "#1e1f24"
GLASS = "#3a9cc0"             # canopy (glows faintly)
HAZARD = "#f0c020"
RED = "#e03a2a"

FWD = (-math.pi / 2, 0, 0)    # cylinder axis along +y
BACK = (math.pi / 2, 0, 0)    # cylinder axis along -y


# --- helpers -----------------------------------------------------------------------------------

def ring(m: Model, r, z, thick, color, n=8, w=0.08, glow=False, cx=0.0, cy=0.0, axis="z", h=None):
    """A faceted ring of n boxes (no torus in the kit). axis z: lies flat; axis y: faces +y."""
    h = w if h is None else h
    seg = 2 * r * math.tan(math.pi / n) * 1.08
    for i in range(n):
        a = TAU * i / n
        if axis == "z":
            m.box((seg, w, h), (cx + math.cos(a) * r, cy + math.sin(a) * r, z), color,
                  rot=(0, 0, a + math.pi / 2), glow=glow)
        else:
            m.box((seg, thick, w), (cx + math.cos(a) * r, cy, z + math.sin(a) * r), color,
                  rot=(0, -a + math.pi / 2, 0), glow=glow)


def base(m: Model, size=0.66, h=0.08, color=DARK):
    """A bolted mount plate every part sits on."""
    m.box((size, size, h), (0, 0, h / 2), color)


def spin(obj, clip, period, axis=2, turns=1.0):
    v0 = [0, 0, 0]
    v1 = [0, 0, 0]
    v1[axis] = TAU * turns
    animate(obj, clip, "rotation_euler", [(0, tuple(v0)), (period, tuple(v1))])


def pulse(obj, clip, period, amt=0.18):
    animate(obj, clip, "scale", [(0, (0, 0, 0)), (period / 2, (amt, amt, amt)), (period, (0, 0, 0))])


def bob(obj, clip, period, dz=0.06):
    animate(obj, clip, "location", [(0, (0, 0, 0)), (period / 2, (0, 0, dz)), (period, (0, 0, 0))])


# --- parts ---------------------------------------------------------------------------------------
# Each builder makes its meshes under `P` (the part's root or, in a demo, a socket empty).
# anim=False skips the clips (the demos share the parts' meshes but not their clip names).

PARTS: dict = {}


def part(fn):
    PARTS[fn.__name__] = fn
    return fn


@part
def rivet(P, anim):
    m = Model("rivet")
    base(m)
    m.box((0.5, 0.56, 0.24), (0, -0.04, 0.2), A, taper=0.85)            # receiver
    m.box((0.18, 0.4, 0.06), (0, -0.06, 0.34), B)                        # top stripe
    m.cyl(0.15, 0.24, (0.33, -0.1, 0.12), STEEL, segs=6)                 # ammo drum
    m.cyl(0.1, 0.06, (0.33, -0.1, 0.36), B, segs=6)
    m.cyl(0.11, 0.62, (0, 0.18, 0.22), METAL, segs=6, rot=FWD)          # fat barrel
    m.cyl(0.14, 0.12, (0, 0.62, 0.22), DARK, segs=6, rot=FWD)           # muzzle brake
    m.cyl(0.07, 0.02, (0, 0.74, 0.22), C, segs=6, rot=FWD, glow=True)
    m.build(P)


@part
def scatter(P, anim):
    m = Model("scatter")
    base(m)
    m.box((0.6, 0.46, 0.24), (0, -0.1, 0.2), A, taper=0.85)
    m.box((0.6, 0.08, 0.26), (0, -0.33, 0.2), B)
    for i, dx in enumerate((-0.2, 0, 0.2)):
        a = -dx * 0.9
        m.cyl(0.085, 0.5, (dx * 0.8, 0.1, 0.2 + (0.04 if i == 1 else 0)), METAL, segs=6, rot=(-math.pi / 2, 0, a))
    m.box((0.68, 0.14, 0.22), (0, 0.58, 0.22), DARK, taper=0.8)          # flared muzzle
    m.box((0.5, 0.04, 0.08), (0, 0.66, 0.22), C, glow=True)
    m.build(P)


@part
def ion(P, anim):
    m = Model("ion")
    m.box((0.62, 1.4, 0.1), (0, -0.4, 0.05), DARK)
    m.box((0.5, 1.2, 0.26), (0, -0.5, 0.2), A, taper=0.8)                # long housing
    m.box((0.16, 1.1, 0.05), (0, -0.5, 0.34), B)
    m.box((0.6, 0.3, 0.3), (0, -0.95, 0.2), STEEL)                        # power pack
    m.cyl(0.1, 0.06, (-0.18, -0.95, 0.35), "#7ae8ff", segs=6, glow=True)
    m.cyl(0.1, 0.06, (0.18, -0.95, 0.35), "#7ae8ff", segs=6, glow=True)
    m.cyl(0.09, 0.9, (0, -0.1, 0.36), METAL, segs=6, rot=FWD)            # lance
    for y in (0.0, 0.22, 0.44):
        m.cyl(0.15, 0.08, (0, y, 0.36), "#7ae8ff", segs=6, rot=FWD, glow=True)
    m.ball(0.13, (0, 0.82, 0.36), "#bff6ff", subdiv=0, scale=(1, 1.6, 1), glow=True)
    m.build(P)


@part
def rail(P, anim):
    m = Model("rail")
    m.box((0.66, 1.42, 0.1), (0, -0.4, 0.05), DARK)
    m.box((0.6, 0.6, 0.3), (0, -0.85, 0.22), A, taper=0.85)              # capacitor block
    m.box((0.6, 0.1, 0.32), (0, -0.6, 0.22), B)
    for s in (-1, 1):
        m.box((0.14, 1.5, 0.22), (s * 0.15, -0.05, 0.26), METAL)          # the two rails
        m.box((0.1, 0.12, 0.3), (s * 0.15, 0.68, 0.26), DARK)
    m.box((0.08, 1.3, 0.06), (0, -0.05, 0.3), "#7ae8ff", glow=True)       # charge between them
    for y in (-0.4, 0.1):
        m.box((0.5, 0.1, 0.1), (0, y, 0.4), STEEL)                        # clamps
    m.build(P)


@part
def arc(P, anim):
    m = Model("arc")
    base(m)
    m.cyl(0.3, 0.12, (0, 0, 0.08), A, segs=6)
    m.cyl(0.2, 0.08, (0, 0, 0.2), B, segs=6)
    m.cyl(0.1, 0.3, (0, 0, 0.28), STEEL, segs=6)
    for z in (0.32, 0.44):
        m.cyl(0.22, 0.05, (0, 0, z), "#2a6a8a", segs=6)                   # coil windings
    m.box((0.06, 0.4, 0.06), (0, 0.24, 0.24), METAL)                      # forward prong
    m.build(P)
    k = Model("arc_ball")
    k.ball(0.16, (0, 0, 0), "#c8f4ff", subdiv=0, glow=True)
    k.box((0.04, 0.5, 0.04), (0, 0, 0), "#7ae8ff", rot=(0, 0.6, 0.4), glow=True)
    k.box((0.04, 0.44, 0.04), (0, 0, 0), "#7ae8ff", rot=(0.7, 0, -0.9), glow=True)
    o = k.build(P, loc=(0, 0, 0.66))
    if anim:
        spin(o, "part_arc_crackle_idle", 0.75)


@part
def seeker(P, anim):
    m = Model("seeker")
    base(m)
    m.box((0.64, 0.6, 0.2), (0, -0.04, 0.16), A, taper=0.9)             # launch rack
    m.box((0.66, 0.12, 0.22), (0, -0.26, 0.17), B)
    m.box((0.08, 0.56, 0.2), (0, -0.02, 0.34), STEEL)                    # centre rail
    for dx in (-0.17, 0.17):                                              # two missiles lying ready
        m.cyl(0.11, 0.52, (dx, -0.28, 0.36), "#e8e0d0", segs=6, rot=FWD)
        m.cyl(0.11, 0.18, (dx, 0.24, 0.36), RED, segs=6, r_top=0.02, rot=FWD)
        m.box((0.3, 0.1, 0.04), (dx, -0.24, 0.36), STEEL)               # tail fins
        m.box((0.04, 0.1, 0.3), (dx, -0.24, 0.36), STEEL)
        m.cyl(0.06, 0.03, (dx, -0.31, 0.36), C, segs=6, rot=BACK, glow=True)
    m.build(P)


@part
def flak(P, anim):
    m = Model("flak")
    m.box((1.42, 0.66, 0.1), (0.4, 0, 0.05), DARK)
    m.cyl(0.4, 0.18, (0.4, -0.05, 0.08), STEEL, segs=8)                  # turret ring
    m.cyl(0.36, 0.22, (0.4, -0.05, 0.24), A, segs=8, r_top=0.3)
    m.box((0.5, 0.3, 0.1), (0.4, -0.1, 0.5), B)
    for dx in (0.24, 0.56):
        m.cyl(0.11, 0.66, (dx, 0.08, 0.36), METAL, segs=6, rot=FWD)
        m.cyl(0.15, 0.14, (dx, 0.6, 0.36), DARK, segs=6, rot=FWD)
        m.cyl(0.08, 0.02, (dx, 0.74, 0.36), C, segs=6, rot=FWD, glow=True)
    for dx in (-0.2, 1.0):                                                # shell racks on the wings
        m.box((0.3, 0.5, 0.18), (dx, -0.05, 0.18), A)
        for dy in (-0.15, 0.0, 0.15):
            m.cyl(0.06, 0.08, (dx, dy - 0.05, 0.27), "#c89a40", segs=5)
    m.build(P)


@part
def torch(P, anim):
    m = Model("torch")
    base(m)
    m.cyl(0.2, 0.42, (0, -0.32, 0.26), B, segs=7, rot=FWD)               # fuel tank (on its side)
    m.box((0.3, 0.1, 0.42), (0, -0.25, 0.25), A)
    m.box((0.32, 0.4, 0.22), (0, 0.04, 0.18), A, taper=0.8)
    m.cyl(0.08, 0.3, (0, 0.1, 0.26), METAL, segs=6, rot=FWD)
    m.cyl(0.08, 0.26, (0, 0.38, 0.26), STEEL, segs=6, r_top=0.18, rot=FWD)  # flared nozzle
    m.cyl(0.12, 0.04, (0, 0.62, 0.26), "#ffa040", segs=6, rot=FWD, glow=True)
    m.build(P)
    f = Model("torch_flame")
    f.cyl(0.1, 0.22, (0, 0, 0), "#ffe08a", segs=5, r_top=0.0, rot=FWD, glow=True)
    o = f.build(P, loc=(0, 0.64, 0.26))
    if anim:
        animate(o, "part_torch_pilot_idle", "scale", [(0, (0, 0, 0)), (0.2, (0.15, 0.4, 0.15)), (0.4, (0, 0, 0))])


@part
def mine(P, anim):
    m = Model("mine")
    base(m)
    m.box((0.6, 0.6, 0.2), (0, 0, 0.16), A, taper=0.9)                   # hopper
    m.box((0.62, 0.12, 0.22), (0, 0.24, 0.17), B)
    m.box((0.42, 0.16, 0.16), (0, -0.36, 0.14), DARK)                    # chute mouth (rear)
    for i, dx in enumerate((-0.15, 0.15)):
        m.box((0.1, 0.24, 0.04), (dx * 1.6, -0.12, 0.28), HAZARD)
    m.build(P)
    k = Model("mine_ball")
    k.ball(0.17, (0, 0, 0), "#3a3a40", subdiv=0)
    for rot in ((0, 0, 0), (math.pi / 2, 0, 0), (0, math.pi / 2, 0)):
        k.box((0.06, 0.06, 0.5), (0, 0, 0), STEEL, rot=rot)               # spikes
    k.ball(0.07, (0, 0, 0.16), RED, subdiv=0, glow=True)
    o = k.build(P, loc=(0, 0.02, 0.42))
    if anim:
        spin(o, "part_mine_roll_idle", 4.0)


@part
def thruster(P, anim):
    m = Model("thruster")
    base(m, 0.6)
    m.box((0.2, 0.3, 0.16), (0, 0.05, 0.14), STEEL)                      # pylon
    m.cyl(0.27, 0.58, (0, 0.3, 0.32), A, segs=8, r_top=0.24, rot=BACK)  # nacelle
    m.cyl(0.29, 0.1, (0, 0.34, 0.32), B, segs=8, rot=BACK)               # intake ring
    m.cyl(0.18, 0.04, (0, 0.36, 0.32), RUBBER, segs=8, rot=FWD)
    m.cyl(0.25, 0.14, (0, -0.24, 0.32), DARK, segs=8, r_top=0.28, rot=BACK)  # bell
    m.cyl(0.21, 0.03, (0, -0.36, 0.32), C, segs=8, rot=BACK, glow=True)
    m.build(P)
    f = Model("thruster_flame")
    f.cyl(0.17, 0.32, (0, 0, 0), C, segs=6, r_top=0.02, rot=BACK, glow=True)
    o = f.build(P, loc=(0, -0.38, 0.32))
    if anim:
        animate(o, "part_thruster_flame_idle", "scale",
                [(0, (0, 0, 0)), (0.1, (-0.1, 0.3, -0.1)), (0.2, (0, 0, 0))])


@part
def burner(P, anim):
    m = Model("burner")
    m.box((0.66, 1.4, 0.1), (0, -0.4, 0.05), DARK)
    m.box((0.24, 1.0, 0.2), (0, -0.4, 0.16), STEEL)
    m.cyl(0.32, 1.1, (0, 0.2, 0.36), A, segs=8, r_top=0.3, rot=BACK)
    m.cyl(0.34, 0.12, (0, 0.24, 0.36), B, segs=8, rot=BACK)
    m.cyl(0.22, 0.04, (0, 0.26, 0.36), RUBBER, segs=8, rot=FWD)
    m.cyl(0.35, 0.1, (0, -0.4, 0.36), B, segs=8, rot=BACK)                # stripe
    for s in (-1, 1):                                                      # heat fins
        m.box((0.24, 0.5, 0.06), (s * 0.4, -0.75, 0.36), METAL, rot=(0, s * 0.3, 0))
    m.box((0.06, 0.5, 0.24), (0, -0.75, 0.66), METAL)
    m.cyl(0.3, 0.2, (0, -0.9, 0.36), DARK, segs=8, r_top=0.36, rot=BACK)
    m.cyl(0.3, 0.03, (0, -1.1, 0.36), "#ff7a2a", segs=8, rot=BACK, glow=True)
    m.build(P)
    f = Model("burner_flame")
    f.cyl(0.24, 0.5, (0, 0, 0), "#ffb04a", segs=6, r_top=0.02, rot=BACK, glow=True)
    f.cyl(0.12, 0.62, (0, 0, 0), "#fff0b0", segs=5, r_top=0.02, rot=BACK, glow=True)
    o = f.build(P, loc=(0, -1.12, 0.36))
    if anim:
        animate(o, "part_burner_flame_idle", "scale",
                [(0, (0, 0, 0)), (0.08, (-0.08, 0.35, -0.08)), (0.16, (0, 0, 0))])


@part
def vector(P, anim):
    m = Model("vector")
    base(m, 0.6)
    m.box((0.3, 0.56, 0.24), (0, 0, 0.18), A, taper=0.8)
    m.box((0.12, 0.4, 0.04), (0, 0.02, 0.31), B)
    m.cyl(0.12, 0.04, (0, -0.28, 0.2), C, segs=6, rot=BACK, glow=True)
    m.build(P)
    for i, dx in enumerate((-0.27, 0.27)):
        v = Model(f"vector_vane_{i}")
        v.box((0.12, 0.66, 0.44), (0, -0.05, 0.18), B, taper=0.55)
        v.box((0.13, 0.18, 0.46), (0, -0.3, 0.18), STEEL, taper=0.55)
        v.box((0.06, 0.06, 0.06), (0, 0.2, 0.42), C, glow=True)
        o = v.build(P, loc=(dx, 0, 0.12))
        if anim:
            s = 1 if i else -1
            animate(o, "part_vector_swivel_idle", "rotation_euler",
                    [(0, (0, 0, 0)), (0.6, (0, 0, s * 0.35)), (1.2, (0, 0, 0)), (1.8, (0, 0, -s * 0.35)), (2.4, (0, 0, 0))])


@part
def reactor(P, anim):
    m = Model("reactor")
    base(m, 0.7)
    m.cyl(0.34, 0.14, (0, 0, 0.08), A, segs=8)
    m.cyl(0.3, 0.06, (0, 0, 0.22), B, segs=8)
    for i in range(4):                                                      # cage posts, open top
        a = TAU * i / 4 + math.pi / 4
        m.box((0.1, 0.1, 0.46), (math.cos(a) * 0.27, math.sin(a) * 0.27, 0.42), A)
        m.box((0.12, 0.12, 0.06), (math.cos(a) * 0.27, math.sin(a) * 0.27, 0.66), B)
    for i in range(4):
        a = TAU * i / 4
        m.box((0.08, 0.32, 0.06), (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.56), STEEL, rot=(0, 0, a + math.pi / 2))
    m.build(P)
    k = Model("reactor_core")
    k.cyl(0.17, 0.46, (0, 0, -0.2), C, segs=6, glow=True)
    k.cyl(0.11, 0.08, (0, 0, 0.26), "#fff0c0", segs=6, glow=True)
    o = k.build(P, loc=(0, 0, 0.42))
    if anim:
        pulse(o, "part_reactor_pulse_idle", 1.2, 0.15)


@part
def capacitor(P, anim):
    m = Model("capacitor")
    base(m, 0.7)
    m.box((0.66, 0.66, 0.1), (0, 0, 0.12), B)
    for x, y in ((-0.17, 0.17), (0.17, 0.17), (-0.17, -0.17), (0.17, -0.17)):
        m.cyl(0.14, 0.36, (x, y, 0.16), A, segs=6)
        m.cyl(0.1, 0.06, (x, y, 0.52), "#8ae8ff", segs=6, glow=True)
    m.box((0.5, 0.06, 0.06), (0, 0, 0.5), METAL)
    m.box((0.06, 0.5, 0.06), (0, 0, 0.5), METAL)
    m.build(P)


@part
def plate(P, anim):
    m = Model("plate")
    m.slab([(-0.42, -0.4), (0.42, -0.4), (0.42, 0.32), (0.3, 0.44), (-0.3, 0.44), (-0.42, 0.32)], 0.0, 0.38, A,
           top=[(-0.34, -0.32), (0.34, -0.32), (0.34, 0.26), (0.25, 0.36), (-0.25, 0.36), (-0.34, 0.26)])
    m.box((0.5, 0.12, 0.04), (0, 0.06, 0.39), B)                          # chevron stripe
    m.box((0.5, 0.12, 0.04), (0, -0.14, 0.39), B)
    for x, y in ((-0.25, 0.24), (0.25, 0.24), (-0.25, -0.24), (0.25, -0.24)):
        m.cyl(0.05, 0.05, (x, y, 0.37), METAL, segs=5)                    # rivets
    m.build(P)


@part
def shield(P, anim):
    m = Model("shield")
    base(m)
    m.cyl(0.24, 0.12, (0, 0, 0.08), A, segs=6)
    m.cyl(0.08, 0.24, (0, 0, 0.2), STEEL, segs=6)
    m.build(P)
    d = Model("shield_dish")
    d.cyl(0.36, 0.12, (0, 0, 0), B, segs=8, r_top=0.4)                    # dish, open to the sky
    d.cyl(0.3, 0.02, (0, 0, 0.11), "#2a4a6a", segs=8)
    for i in range(3):                                                     # emitter tripod
        a = TAU * i / 3
        d.plank_line((math.cos(a) * 0.3, math.sin(a) * 0.3, 0.12), (0, 0, 0.36), 0.05, 0.05, METAL)
    d.ball(0.1, (0, 0, 0.38), "#8ae8ff", subdiv=0, glow=True)
    ring(d, 0.33, 0.13, 0, "#8ae8ff", n=8, w=0.05, h=0.03, glow=True)
    o = d.build(P, loc=(0, 0, 0.42))
    if anim:
        spin(o, "part_shield_turn_idle", 6.0)


@part
def amp(P, anim):
    m = Model("amp")
    base(m)
    m.box((0.58, 0.58, 0.16), (0, 0, 0.14), A, taper=0.75)
    for a in range(4):                                                     # corner fins
        ang = TAU * a / 4 + math.pi / 4
        m.box((0.1, 0.24, 0.3), (math.cos(ang) * 0.27, math.sin(ang) * 0.27, 0.3), B, rot=(0, 0, ang + math.pi / 2), taper=0.5)
    m.build(P)
    k = Model("amp_crystal")
    k.cyl(0.17, 0.2, (0, 0, 0), "#ff6ad0", segs=4, r_top=0.12, glow=True)
    k.cyl(0.12, 0.18, (0, 0, 0.2), "#ffb0ea", segs=4, r_top=0.0, glow=True)
    k.cyl(0.17, 0.12, (0, 0, 0), "#ff6ad0", segs=4, r_top=0.17, rot=(math.pi, 0, 0), glow=True)
    o = k.build(P, loc=(0, 0, 0.36))
    if anim:
        spin(o, "part_amp_turn_idle", 3.0)


@part
def sink(P, anim):
    m = Model("sink")
    base(m, 0.7)
    m.box((0.62, 0.62, 0.1), (0, 0, 0.12), STEEL)
    for i, x in enumerate((-0.24, -0.08, 0.08, 0.24)):                    # radiator fins
        m.box((0.08, 0.62, 0.38 + (0.06 if i in (1, 2) else 0)), (x, 0, 0.36), METAL if i % 2 else B)
    m.box((0.66, 0.12, 0.12), (0, 0, 0.2), "#ff5a2a", glow=True)          # hot core under the fins
    m.box((0.66, 0.08, 0.08), (0, 0.27, 0.6), A)
    m.box((0.66, 0.08, 0.08), (0, -0.27, 0.6), A)
    m.build(P)


@part
def targeter(P, anim):
    m = Model("targeter")
    base(m)
    m.cyl(0.26, 0.12, (0, 0, 0.08), A, segs=6)
    m.cyl(0.06, 0.3, (0, 0, 0.2), STEEL, segs=5)
    m.ball(0.07, (0.24, 0.2, 0.22), RED, subdiv=0, glow=True)             # laser lens
    m.build(P)
    d = Model("targeter_radar")
    d.box((0.7, 0.14, 0.26), (0, 0, 0.1), B, rot=(0.35, 0, 0), taper=0.8)  # flat radar paddle
    d.box((0.6, 0.06, 0.18), (0, 0.06, 0.12), A, rot=(0.35, 0, 0))
    d.box((0.08, 0.08, 0.08), (0, 0.12, 0.14), "#ff4a3a", glow=True)
    d.box((0.08, 0.3, 0.06), (0, 0.16, 0.04), METAL)
    o = d.build(P, loc=(0, 0, 0.48))
    if anim:
        spin(o, "part_targeter_spin_idle", 2.0)


@part
def magnet(P, anim):
    m = Model("magnet")
    base(m)
    m.cyl(0.18, 0.18, (0, 0, 0.08), STEEL, segs=6)
    m.build(P)
    k = Model("magnet_horseshoe")
    k.box((0.6, 0.18, 0.2), (0, -0.14, 0.1), A)                           # the U, opening forward
    for s in (-1, 1):
        k.box((0.18, 0.44, 0.2), (s * 0.21, 0.08, 0.1), A)
        k.box((0.19, 0.12, 0.21), (s * 0.21, 0.3, 0.1), B)
        k.box((0.14, 0.04, 0.14), (s * 0.21, 0.37, 0.1), "#b0ff6a", glow=True)
    k.box((0.3, 0.04, 0.04), (0, 0.37, 0.1), "#b0ff6a", glow=True)        # field arc
    o = k.build(P, loc=(0, 0, 0.26))
    if anim:
        spin(o, "part_magnet_turn_idle", 4.0)


@part
def drone(P, anim):
    m = Model("drone")
    base(m, 0.72)
    m.box((0.68, 0.68, 0.22), (0, 0, 0.18), A, taper=0.85)               # hangar
    m.box((0.5, 0.5, 0.04), (0, 0, 0.3), DARK)                            # landing pad
    for x, y in ((-0.22, 0.22), (0.22, 0.22), (-0.22, -0.22), (0.22, -0.22)):
        m.box((0.08, 0.08, 0.04), (x, y, 0.33), C, glow=True)              # pad lights
    m.box((0.7, 0.1, 0.2), (0, -0.3, 0.2), B)
    m.build(P)
    d = Model("drone_bot")
    d.ball(0.16, (0, 0, 0), B, subdiv=0, scale=(1, 1.2, 0.6))
    for x, y in ((-0.2, 0.18), (0.2, 0.18), (-0.2, -0.18), (0.2, -0.18)):
        d.plank_line((0, 0, 0), (x, y, 0.02), 0.05, 0.05, STEEL)
        d.cyl(0.1, 0.02, (x, y, 0.04), "#9ae8ff", segs=6, glow=True)      # rotor discs
    d.ball(0.06, (0, 0.16, 0.0), "#ff4a6a", subdiv=0, glow=True)          # eye
    o = d.build(P, loc=(0, 0, 0.5))
    if anim:
        animate(o, "part_drone_hover_idle", "location",
                [(0, (0, 0, 0)), (0.8, (0, 0, 0.12)), (1.6, (0, 0, 0))])


@part
def grazer(P, anim):
    m = Model("grazer")
    base(m)
    m.cyl(0.14, 0.5, (0, 0, 0.06), STEEL, segs=6)
    m.cyl(0.22, 0.08, (0, 0, 0.08), A, segs=6)
    m.ball(0.12, (0, 0, 0.6), "#c8a0ff", subdiv=0, glow=True)
    m.build(P)
    for i, (z, r) in enumerate(((0.26, 0.34), (0.44, 0.27))):
        k = Model(f"grazer_ring_{i}")
        ring(k, r, 0, 0, B if i == 0 else A, n=8, w=0.07, h=0.07)
        for j in range(4):
            a = TAU * j / 4
            k.box((0.07, 0.07, 0.09), (math.cos(a) * r, math.sin(a) * r, 0), "#c8a0ff", glow=True)
        o = k.build(P, loc=(0, 0, z))
        if anim:
            spin(o, "part_grazer_spin_idle", 2.0, turns=1 if i else -1)


@part
def bombbay(P, anim):
    m = Model("bombbay")
    base(m, 0.72)
    for s in (-1, 1):                                                      # cradle
        m.box((0.12, 0.66, 0.26), (s * 0.29, 0, 0.2), A)
        m.box((0.13, 0.2, 0.27), (s * 0.29, 0, 0.2), B)
    m.build(P)
    k = Model("bombbay_bomb")
    k.ball(0.22, (0, 0, 0), "#3a3e34", subdiv=1, scale=(1, 1.45, 1))
    k.box((0.46, 0.08, 0.32), (0, 0.06, 0), HAZARD)                         # stripe
    k.box((0.04, 0.2, 0.36), (0, -0.36, 0), STEEL)                         # tail fins
    k.box((0.36, 0.2, 0.04), (0, -0.36, 0), STEEL)
    k.ball(0.06, (0, 0.32, 0.02), RED, subdiv=0, glow=True)
    k.build(P, loc=(0, 0, 0.32))


@part
def phasedrive(P, anim):
    m = Model("phasedrive")
    base(m)
    m.cyl(0.3, 0.1, (0, 0, 0.08), A, segs=6)
    for i in range(3):                                                      # three claws
        a = TAU * i / 3 + math.pi / 2
        m.plank_line((math.cos(a) * 0.26, math.sin(a) * 0.26, 0.16), (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.6), 0.08, 0.08, B)
    m.build(P)
    k = Model("phasedrive_crystal")
    k.cyl(0.18, 0.2, (0, 0, 0), "#b07aff", segs=4, r_top=0.0, glow=True)
    k.cyl(0.18, 0.2, (0, 0, 0), "#e0c8ff", segs=4, r_top=0.0, rot=(math.pi, 0, 0), glow=True)
    o = k.build(P, loc=(0, 0, 0.42))
    if anim:
        spin(o, "part_phasedrive_float_idle", 2.4)
        bob(o, "part_phasedrive_float_idle", 2.4, 0.08)


@part
def emp(P, anim):
    m = Model("emp")
    base(m)
    m.cyl(0.3, 0.14, (0, 0, 0.08), A, segs=6, r_top=0.24)
    m.cyl(0.14, 0.62, (0, 0, 0.2), STEEL, segs=6, r_top=0.02)              # the spike
    m.box((0.66, 0.08, 0.08), (0, 0, 0.16), B)
    m.box((0.08, 0.66, 0.08), (0, 0, 0.16), B)
    m.build(P)
    k = Model("emp_rings")
    for z, r in ((0.0, 0.2), (0.18, 0.13)):
        k.cyl(r, 0.06, (0, 0, z), "#6affd8", segs=6, glow=True)
    k.ball(0.06, (0, 0, 0.42), "#d0fff0", subdiv=0, glow=True)
    o = k.build(P, loc=(0, 0, 0.36))
    if anim:
        pulse(o, "part_emp_hum_idle", 0.8, 0.2)


@part
def overdrive(P, anim):
    m = Model("overdrive")
    base(m, 0.72)
    m.box((0.64, 0.64, 0.24), (0, 0, 0.18), A, taper=0.9)
    m.box((0.66, 0.12, 0.26), (0, 0.18, 0.18), B)
    m.cyl(0.25, 0.08, (0, 0.04, 0.3), DARK, segs=8)                        # fan housing
    for s in (-1, 1):                                                      # twin exhaust stacks
        m.cyl(0.08, 0.3, (s * 0.24, -0.24, 0.3), METAL, segs=6)
        m.cyl(0.07, 0.04, (s * 0.24, -0.24, 0.6), "#ff4a2a", segs=6, glow=True)
    m.build(P)
    f = Model("overdrive_fan")
    for i in range(3):
        f.box((0.42, 0.08, 0.03), (0, 0, 0), C, rot=(0, 0, TAU * i / 6), glow=True)
    f.cyl(0.07, 0.06, (0, 0, -0.01), B, segs=6)
    o = f.build(P, loc=(0, 0.04, 0.4))
    if anim:
        spin(o, "part_overdrive_fan_idle", 0.5)


# --- the builds parts: dash mods, aux, passives, duos -------------------------------------------
# Each one's look says what it does, and a lamp in its verb's colour says which button it's on:
# blue for a dash mod, amber for an aux, violet for a passive (as on the loot cards).

DASHG = "#6ad0ff"
AUXG = "#ffd04a"
PASSG = "#d08aff"
CYAN = "#7ae8ff"
VOID = "#1c1430"
HOT = "#ff6a2a"
MOLTEN = "#ffb03a"
COPPER = "#c87a3a"
CHROME = "#b8c0c6"


def lamp(m: Model, x, y, z, color, r=0.07):
    """A little verb lamp in a dark bezel."""
    m.cyl(r + 0.03, 0.04, (x, y, z), DARK, segs=6)
    m.cyl(r, 0.05, (x, y, z + 0.02), color, segs=6, glow=True)


def helix(m: Model, r, z0, z1, turns, color, w=0.07, n=10):
    """A coil spring: boxes round a rising helix."""
    steps = int(turns * n)
    seg = 2 * r * math.tan(math.pi / n) * 1.25
    for i in range(steps + 1):
        a = TAU * i / n
        z = z0 + (z1 - z0) * i / steps
        m.box((seg, w, w), (math.cos(a) * r, math.sin(a) * r, z), color, rot=(0.12, 0, a + math.pi / 2))


@part
def sentry(P, anim):
    m = Model("sentry")
    base(m)
    m.cyl(0.32, 0.14, (0, 0, 0.06), A, segs=8, r_top=0.28)                # armoured ring
    m.cyl(0.24, 0.06, (0, 0, 0.2), B, segs=8)
    m.box((0.12, 0.2, 0.1), (0.3, -0.18, 0.1), STEEL)                     # ammo feed
    m.build(P)
    h = Model("sentry_head")
    h.box((0.36, 0.34, 0.2), (0, -0.02, 0.1), STEEL, taper=0.8)           # the head
    h.box((0.38, 0.1, 0.18), (0, -0.16, 0.1), B)
    for s in (-1, 1):                                                      # twin short barrels
        h.cyl(0.06, 0.4, (s * 0.09, 0.12, 0.12), METAL, segs=6, rot=FWD)
        h.cyl(0.08, 0.06, (s * 0.09, 0.48, 0.12), DARK, segs=6, rot=FWD)
    h.box((0.14, 0.1, 0.1), (0, 0.13, 0.24), DARK)                         # sensor eye, picking targets
    h.ball(0.06, (0, 0.18, 0.25), RED, subdiv=0, glow=True)
    o = h.build(P, loc=(0, 0, 0.24))
    if anim:
        animate(o, "part_sentry_scan_idle", "rotation_euler",
                [(0, (0, 0, 0)), (0.7, (0, 0, 0.55)), (1.2, (0, 0, 0.55)), (2.1, (0, 0, -0.55)), (2.6, (0, 0, -0.55)), (3.2, (0, 0, 0))])


@part
def lance(P, anim):
    m = Model("lance")
    m.box((0.6, 2.24, 0.1), (0, -0.8, 0.05), DARK)                        # sled over three cells
    m.box((0.46, 1.9, 0.22), (0, -0.98, 0.18), A, taper=0.82)             # the body
    m.box((0.14, 1.7, 0.05), (0, -1.02, 0.31), B)                         # speed stripe
    for s in (-1, 1):                                                      # swept tail fins
        m.box((0.2, 0.4, 0.06), (s * 0.28, -1.74, 0.2), B, rot=(0, 0, s * 0.45), taper=0.6)
        m.box((0.1, 1.2, 0.12), (s * 0.27, -0.7, 0.16), STEEL)            # side rails
    m.box((0.06, 0.42, 0.34), (0, -1.74, 0.36), A, taper=0.5)              # tail fin
    m.cyl(0.18, 0.28, (0, -2.0, 0.22), DARK, segs=6, r_top=0.22, rot=BACK)  # drive bell
    m.cyl(0.16, 0.03, (0, -2.26, 0.22), C, segs=6, rot=BACK, glow=True)
    m.cyl(0.15, 1.5, (0, -0.4, 0.3), CHROME, segs=6, r_top=0.0, rot=FWD)  # the spike
    m.cyl(0.07, 0.6, (0, 0.5, 0.3), "#e8f4ff", segs=5, r_top=0.0, rot=FWD)
    m.build(P)
    k = Model("lance_rings")
    for i, y in enumerate((-1.3, -0.9, -0.5)):                             # accelerator rings
        k.cyl(0.22 - i * 0.02, 0.08, (0, y, 0), CYAN, segs=6, rot=FWD, glow=True)
        k.cyl(0.25 - i * 0.02, 0.05, (0, y - 0.06, 0), DARK, segs=6, rot=FWD)
    o = k.build(P, loc=(0, 0, 0.3))
    if anim:
        pulse(o, "part_lance_charge_idle", 0.6, 0.12)


@part
def ram(P, anim):
    m = Model("ram")
    prow = [(-0.38, -0.36), (0.38, -0.36), (0.38, 0.06), (0.0, 0.5), (-0.38, 0.06)]
    m.slab(prow, 0.0, 0.32, STEEL, top=[(-0.3, -0.3), (0.3, -0.3), (0.3, 0.04), (0.0, 0.38), (-0.3, 0.04)])
    m.slab([(-0.3, -0.3), (0.3, -0.3), (0.3, 0.04), (0.0, 0.38), (-0.3, 0.04)], 0.32, 0.36, A)
    for s in (-1, 1):                                                      # hazard chevrons on the wedge
        for i in range(2):
            m.box((0.07, 0.3, 0.03), (s * (0.08 + i * 0.13), 0.06 - i * 0.12, 0.37), HAZARD, rot=(0, 0, s * 0.85))
    for dx, dy in ((0.0, 0.52), (-0.24, 0.28), (0.24, 0.28)):              # ramming spikes
        m.cyl(0.07, 0.24, (dx, dy - 0.04, 0.18), CHROME, segs=5, r_top=0.0, rot=FWD)
    m.box((0.5, 0.12, 0.14), (0, -0.3, 0.42), DARK)
    lamp(m, 0, -0.3, 0.46, DASHG)
    m.build(P)


@part
def blink(P, anim):
    m = Model("blink")
    base(m)
    m.cyl(0.3, 0.12, (0, 0, 0.08), A, segs=6)
    for i in range(3):                                                      # gimbal posts
        a = TAU * i / 3 + math.pi / 6
        m.box((0.08, 0.08, 0.34), (math.cos(a) * 0.27, math.sin(a) * 0.27, 0.32), B)
    m.build(P)
    k = Model("blink_core")
    k.ball(0.15, (0, 0, 0), VOID, subdiv=1)                                 # a hole in space
    k.ball(0.1, (0, 0, 0), "#9a7aff", subdiv=0, scale=(1, 1, 1.4), glow=True)
    o = k.build(P, loc=(0, 0, 0.46))
    for i, tilt in enumerate((0.0, 1.2)):
        g = Model(f"blink_ring_{i}")
        ring(g, 0.24 - i * 0.04, 0, 0, DASHG, n=8, w=0.05, h=0.05, glow=True, axis="z")
        r = g.build(P, loc=(0, 0, 0.46))
        r.rotation_euler = (tilt, 0, 0)
        if anim:
            animate(r, "part_blink_gyre_idle", "rotation_euler",
                    [(0, (0, 0, 0)), (1.5, (0, 0, TAU * (1 if i else -1)))], rest=(tilt, 0, 0))
    if anim:
        animate(o, "part_blink_gyre_idle", "scale",
                [(0, (0, 0, 0)), (0.75, (0.25, 0.25, 0.25)), (1.5, (0, 0, 0))])


@part
def wake(P, anim):
    m = Model("wake")
    base(m)
    for s in (-1, 1):                                                       # cradle rails
        m.box((0.1, 0.62, 0.2), (s * 0.27, 0, 0.16), A)
    m.box((0.62, 0.14, 0.24), (0, 0.24, 0.2), B)
    m.box((0.44, 0.12, 0.2), (0, -0.33, 0.12), DARK)                       # the chute, out the back
    m.box((0.36, 0.04, 0.12), (0, -0.4, 0.12), "#ff7a3a", glow=True)
    for i, y in enumerate((0.1, -0.1)):                                     # a string of charges
        m.cyl(0.12, 0.34, (-0.17, y, 0.34), "#3a3e34", segs=6, rot=(0, math.pi / 2, 0))
        m.box((0.08, 0.25, 0.25), (0, y, 0.34), HAZARD)
        m.ball(0.04, (0, y, 0.47), RED, subdiv=0, glow=True)
    lamp(m, 0, 0.24, 0.32, DASHG, r=0.06)
    m.build(P)


@part
def spring(P, anim):
    m = Model("spring")
    base(m)
    m.cyl(0.3, 0.08, (0, 0, 0.08), A, segs=8)
    m.cyl(0.08, 0.36, (0, 0, 0.1), STEEL, segs=6)                           # guide rod
    m.build(P)
    k = Model("spring_coil")
    helix(k, 0.2, 0.0, 0.3, 3, HAZARD, w=0.07)
    c = k.build(P, loc=(0, 0, 0.16))
    t = Model("spring_plate")
    t.cyl(0.13, 0.08, (0, 0, 0), B, segs=6)                                  # kick plate
    t.box((0.34, 0.07, 0.05), (0, 0, 0.06), STEEL)
    t.cyl(0.07, 0.05, (0, 0, 0.08), DASHG, segs=6, glow=True)
    p = t.build(P, loc=(0, 0, 0.5))
    if anim:
        # a slow squeeze and a sharp kick
        animate(c, "part_spring_kick_idle", "scale", [(0, (0, 0, 0)), (1.2, (0, 0, -0.45)), (1.3, (0, 0, 0.12)), (1.45, (0, 0, 0)), (2.0, (0, 0, 0))])
        animate(p, "part_spring_kick_idle", "location", [(0, (0, 0, 0)), (1.2, (0, 0, -0.14)), (1.3, (0, 0, 0.04)), (1.45, (0, 0, 0)), (2.0, (0, 0, 0))])


@part
def ghost(P, anim):
    m = Model("ghost")
    base(m)
    m.cyl(0.26, 0.1, (0, 0, 0.08), STEEL, segs=6)
    m.cyl(0.2, 0.06, (0, 0, 0.18), DARK, segs=6)
    for i in range(4):                                                       # lantern cage
        a = TAU * i / 4 + math.pi / 4
        m.box((0.06, 0.06, 0.42), (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.42), B)
    ring(m, 0.22, 0.62, 0, A, n=6, w=0.07, h=0.06)                            # open crown, the flame shows
    m.build(P)
    k = Model("ghost_flame")
    k.ball(0.15, (0, 0, 0), "#d8fbff", subdiv=0, scale=(1, 1, 1.2), glow=True)
    k.cyl(0.12, 0.24, (0, 0, 0.06), DASHG, segs=5, r_top=0.0, glow=True)
    k.ball(0.18, (0, 0, -0.04), "#4ab0e0", subdiv=0, scale=(1, 1, 0.6), glow=True)
    o = k.build(P, loc=(0, 0, 0.38))
    if anim:
        bob(o, "part_ghost_flicker_idle", 1.6, 0.05)
        animate(o, "part_ghost_flicker_idle", "scale",
                [(0, (0, 0, 0)), (0.4, (0.12, 0.12, -0.08)), (0.8, (-0.06, -0.06, 0.14)), (1.2, (0.08, 0.08, 0)), (1.6, (0, 0, 0))])


@part
def parry(P, anim):
    m = Model("parry")
    m.box((0.62, 1.42, 0.1), (0, -0.4, 0.05), DARK)
    m.box((0.54, 0.62, 0.3), (0, -0.84, 0.2), A, taper=0.85)               # generator, back cell
    m.box((0.56, 0.1, 0.32), (0, -0.62, 0.2), B)
    for s in (-1, 1):
        m.cyl(0.1, 0.3, (s * 0.15, -0.95, 0.36), STEEL, segs=6)            # coils
        m.cyl(0.07, 0.04, (s * 0.15, -0.95, 0.66), AUXG, segs=6, glow=True)
    m.box((0.12, 0.6, 0.12), (0, -0.3, 0.22), STEEL)                        # feed to the emitter
    m.cyl(0.18, 0.2, (0, -0.02, 0.1), STEEL, segs=6)
    m.build(P)
    k = Model("parry_blade")
    # the crescent guard, curved round the front
    n = 7
    for i in range(n):
        a = math.radians(25 + 130 * i / (n - 1))
        r = 0.42
        k.box((0.16, 0.08, 0.3), (math.cos(a) * r, math.sin(a) * r - 0.18, 0.0), B, rot=(0, 0, a + math.pi / 2))
        k.box((0.13, 0.04, 0.32), (math.cos(a) * (r + 0.05), math.sin(a) * (r + 0.05) - 0.18, 0.0), AUXG, rot=(0, 0, a + math.pi / 2), glow=True)
    k.ball(0.1, (0, 0.0, 0.02), "#fff0b0", subdiv=0, glow=True)
    o = k.build(P, loc=(0, 0, 0.28))
    if anim:
        pulse(o, "part_parry_hum_idle", 1.0, 0.06)


@part
def tether(P, anim):
    m = Model("tether")
    # launcher on the first cell, winch behind it, motor on the corner cell (+x)
    m.box((0.62, 1.42, 0.1), (0, -0.4, 0.05), DARK)
    m.box((0.82, 0.62, 0.1), (0.4, -0.8, 0.05), DARK)
    m.box((0.34, 0.5, 0.24), (0, 0.02, 0.18), A, taper=0.85)               # launcher
    m.cyl(0.11, 0.4, (0, 0.06, 0.3), METAL, segs=6, rot=FWD)
    m.cyl(0.15, 0.1, (0, 0.42, 0.3), DARK, segs=6, rot=FWD)
    m.cyl(0.05, 0.24, (0, 0.5, 0.3), CHROME, segs=5, rot=FWD)              # the harpoon
    m.cyl(0.1, 0.18, (0, 0.72, 0.3), CHROME, segs=4, r_top=0.0, rot=FWD)
    for s in (-1, 1):                                                       # its barbs
        m.box((0.05, 0.18, 0.05), (s * 0.1, 0.66, 0.3), HAZARD, rot=(0, 0, s * 0.7))
    m.box((0.04, 0.5, 0.04), (0, -0.3, 0.38), RUBBER)                       # cable back to the winch
    for s in (-1, 1):                                                       # winch cheeks
        m.box((0.08, 0.5, 0.5), (s * 0.24, -0.8, 0.3), B)
    m.box((0.5, 0.38, 0.32), (0.8, -0.8, 0.2), A, taper=0.85)              # motor
    m.box((0.52, 0.08, 0.34), (0.8, -0.66, 0.2), B)
    m.cyl(0.08, 0.36, (0.48, -0.8, 0.3), STEEL, segs=6, rot=(0, math.pi / 2, 0))  # drive shaft
    lamp(m, 0.8, -0.86, 0.36, AUXG)
    m.build(P)
    k = Model("tether_drum")
    k.cyl(0.2, 0.36, (-0.18, 0, 0), "#7a5a3a", segs=8, rot=(0, math.pi / 2, 0))   # the drum, cable wound
    for x in (-0.12, 0.0, 0.12):
        k.cyl(0.21, 0.04, (x, 0, 0), RUBBER, segs=8, rot=(0, math.pi / 2, 0))
    k.box((0.38, 0.06, 0.06), (0, 0, 0.2), STEEL)
    o = k.build(P, loc=(0, -0.8, 0.32))
    if anim:
        spin(o, "part_tether_wind_idle", 2.0, axis=0)


@part
def flare(P, anim):
    m = Model("flare")
    base(m)
    m.box((0.6, 0.6, 0.16), (0, 0, 0.14), A, taper=0.85)
    m.cyl(0.14, 0.44, (0, 0.04, 0.2), STEEL, segs=6, rot=(-0.55, 0, 0))     # mortar tube, raised
    m.cyl(0.11, 0.04, (0, 0.24, 0.57), HOT, segs=6, rot=(-0.55, 0, 0), glow=True)
    for i, a in enumerate((-0.9, -0.3, 0.3, 0.9)):                           # bandolier of cartridges
        x = math.sin(a) * 0.26
        y = -math.cos(a) * 0.22 - 0.02
        m.cyl(0.055, 0.22, (x, y, 0.22), RED, segs=5)
        m.cyl(0.056, 0.05, (x, y, 0.42), "#ffd8a0", segs=5)
    lamp(m, 0.24, 0.22, 0.22, AUXG, r=0.05)
    m.build(P)
    f = Model("flare_spark")
    f.ball(0.07, (0, 0, 0), "#fff0a0", subdiv=0, glow=True)
    o = f.build(P, loc=(0, 0.26, 0.6))
    if anim:
        animate(o, "part_flare_spark_idle", "scale", [(0, (0, 0, 0)), (0.15, (0.6, 0.6, 0.6)), (0.3, (0, 0, 0)), (0.9, (0, 0, 0))])


@part
def siphon(P, anim):
    m = Model("siphon")
    m.box((0.62, 1.42, 0.1), (0, -0.4, 0.05), DARK)
    m.cyl(0.36, 0.3, (0, 0.0, 0.08), A, segs=8, r_top=0.4)                  # the intake funnel
    m.cyl(0.33, 0.02, (0, 0.0, 0.38), VOID, segs=8)
    ring(m, 0.38, 0.39, 0, B, n=8, w=0.07, h=0.06)
    m.cyl(0.1, 0.06, (0, 0, 0.36), "#d8b0ff", segs=6, glow=True)            # the eye of it
    m.box((0.14, 0.4, 0.14), (0, -0.46, 0.22), STEEL)                       # throat
    m.cyl(0.24, 0.44, (0, -0.86, 0.1), B, segs=8)                            # the tank
    m.cyl(0.18, 0.3, (0, -0.86, 0.18), "#9a6aff", segs=6, glow=True)         # what it drank
    m.cyl(0.26, 0.06, (0, -0.86, 0.54), A, segs=8)
    for i in range(3):                                                        # tank bands
        a = TAU * i / 3 + 0.4
        m.box((0.06, 0.06, 0.44), (math.cos(a) * 0.25, -0.86 + math.sin(a) * 0.25, 0.32), STEEL)
    lamp(m, 0, -0.86, 0.58, AUXG, r=0.06)
    m.build(P)
    k = Model("siphon_vanes")
    for i in range(5):                                                        # a spiral of vanes
        a = TAU * i / 5
        k.box((0.28, 0.05, 0.04), (math.cos(a) * 0.17, math.sin(a) * 0.17, 0), "#b07aff", rot=(0, 0, a + 1.1), glow=True)
    o = k.build(P, loc=(0, 0, 0.36))
    if anim:
        spin(o, "part_siphon_drink_idle", 0.9, turns=-1)


@part
def trigger(P, anim):
    m = Model("trigger")
    base(m)
    m.box((0.56, 0.56, 0.2), (0, 0, 0.16), A, taper=0.85)
    m.box((0.58, 0.1, 0.22), (0, -0.2, 0.17), B)
    m.cyl(0.16, 0.06, (0, 0.04, 0.3), DARK, segs=8)
    m.cyl(0.12, 0.1, (0, 0.04, 0.32), "#ff3a4a", segs=8, glow=True)          # the button
    m.box((0.34, 0.06, 0.3), (0, -0.16, 0.42), HAZARD, rot=(-0.5, 0, 0))      # safety cover, flipped up
    m.box((0.36, 0.04, 0.06), (0, -0.12, 0.3), DARK)
    ring(m, 0.26, 0.28, 0, PASSG, n=8, w=0.04, h=0.03, glow=True, cy=0.04)   # crit reticle
    for a in range(4):
        ang = TAU * a / 4
        m.box((0.04, 0.1, 0.03), (math.cos(ang) * 0.3, 0.04 + math.sin(ang) * 0.3, 0.3), PASSG, rot=(0, 0, ang + math.pi / 2), glow=True)
    m.build(P)


@part
def skin(P, anim):
    m = Model("skin")
    m.box((0.7, 0.7, 0.06), (0, 0, 0.03), DARK)
    m.box((0.64, 0.64, 0.04), (0, 0, 0.08), "#2a2a40")
    for i in range(4):                                                         # a mesh of copper wire
        u = -0.24 + i * 0.16
        m.box((0.04, 0.64, 0.05), (u, 0, 0.12), COPPER)
        m.box((0.64, 0.04, 0.05), (0, u, 0.12), COPPER)
    m.build(P)
    k = Model("skin_nodes")
    for i, j in ((0, 0), (1, 2), (2, 1), (3, 3), (0, 3), (3, 0), (2, 3), (1, 0)):
        k.box((0.07, 0.07, 0.07), (-0.24 + i * 0.16, -0.24 + j * 0.16, 0), "#e0d0ff", glow=True)
    k.box((0.04, 0.2, 0.04), (-0.16, -0.08, 0.02), PASSG, rot=(0, 0, 0.8), glow=True)    # sparks jumping
    k.box((0.04, 0.2, 0.04), (0.16, 0.16, 0.02), PASSG, rot=(0, 0, -0.6), glow=True)
    o = k.build(P, loc=(0, 0, 0.16))
    if anim:
        animate(o, "part_skin_crackle_idle", "scale", [(0, (0, 0, 0)), (0.1, (0.1, 0.1, 0.8)), (0.2, (0, 0, 0)), (0.7, (0, 0, 0)), (0.8, (-0.1, -0.1, 0.6)), (0.9, (0, 0, 0)), (1.4, (0, 0, 0))])


@part
def throttle(P, anim):
    m = Model("throttle")
    base(m)
    m.box((0.56, 0.6, 0.18), (0, 0, 0.13), A, taper=0.85)
    m.box((0.14, 0.5, 0.06), (0, 0.0, 0.25), DARK)                           # the slot
    for s in (-1, 1):
        m.box((0.06, 0.52, 0.12), (s * 0.12, 0, 0.26), B)
    m.cyl(0.13, 0.12, (0.26, -0.18, 0.12), STEEL, segs=8)                     # linkage gear
    m.box((0.06, 0.4, 0.06), (0.26, 0.04, 0.2), METAL)                        # push rod
    for i, y in enumerate((-0.16, 0.0, 0.16)):                                 # notches
        m.box((0.22, 0.03, 0.03), (0, y, 0.33), PASSG if i == 2 else METAL, glow=i == 2)
    m.build(P)
    k = Model("throttle_lever")
    k.box((0.07, 0.07, 0.36), (0, 0, 0.18), CHROME)
    k.ball(0.09, (0, 0, 0.4), RED, subdiv=0, scale=(1.2, 1, 1))
    o = k.build(P, loc=(0, 0, 0.26))
    o.rotation_euler = (-0.5, 0, 0)
    if anim:
        animate(o, "part_throttle_push_idle", "rotation_euler",
                [(0, (0, 0, 0)), (0.5, (1.0, 0, 0)), (1.4, (1.0, 0, 0)), (1.9, (0, 0, 0)), (2.4, (0, 0, 0))], rest=(-0.5, 0, 0))


@part
def gambler(P, anim):
    m = Model("gambler")
    base(m, 0.72)
    m.cyl(0.34, 0.3, (0, -0.02, 0.06), A, segs=8, r_top=0.3)                 # the furnace
    m.cyl(0.31, 0.05, (0, -0.02, 0.36), B, segs=8)
    m.box((0.36, 0.08, 0.16), (0, 0.27, 0.2), "#ff4a1a", glow=True)          # fire door
    for x in (-0.1, 0.0, 0.1):
        m.box((0.03, 0.09, 0.18), (x, 0.3, 0.2), DARK)
    m.cyl(0.18, 0.06, (-0.04, -0.08, 0.4), "#f0e4c8", segs=8)                  # the Burn gauge
    for k in range(5):                                                          # its ticks, cold to hot
        a = math.radians(200 - k * 55)
        col = PASSG if k < 4 else "#ff4a2a"
        m.box((0.03, 0.06, 0.02), (-0.04 + math.cos(a) * 0.13, -0.08 + math.sin(a) * 0.13, 0.46), col, rot=(0, 0, a + math.pi / 2), glow=True)
    m.cyl(0.06, 0.34, (0.24, -0.22, 0.36), STEEL, segs=6)                       # stack
    m.cyl(0.05, 0.04, (0.24, -0.22, 0.7), "#ff7a2a", segs=6, glow=True)
    m.build(P)
    k = Model("gambler_needle")
    k.box((0.03, 0.15, 0.02), (0, 0.07, 0), RED)
    k.cyl(0.03, 0.03, (0, 0, -0.01), DARK, segs=6)
    o = k.build(P, loc=(-0.04, -0.08, 0.47))
    if anim:
        # creeps up, trembles at the top, falls back
        animate(o, "part_gambler_needle_idle", "rotation_euler",
                [(0, (0, 0, 1.3)), (1.8, (0, 0, -1.0)), (1.9, (0, 0, -0.85)), (2.0, (0, 0, -1.05)), (2.1, (0, 0, -0.9)), (2.3, (0, 0, 1.3)), (3.0, (0, 0, 1.3))])


@part
def salvage(P, anim):
    m = Model("salvage")
    base(m)
    m.box((0.6, 0.6, 0.22), (0, 0, 0.16), "#5a5240", taper=0.92)             # the crate
    m.box((0.62, 0.1, 0.24), (0, 0.12, 0.17), HAZARD)
    m.box((0.62, 0.1, 0.24), (0, -0.12, 0.17), HAZARD)
    for x, y in ((-0.15, 0.15), (0.15, -0.14), (-0.13, -0.16)):               # limpet charges on top
        m.cyl(0.12, 0.08, (x, y, 0.28), "#3a3e34", segs=6, r_top=0.08)
        m.cyl(0.04, 0.04, (x, y, 0.36), RED, segs=5, glow=True)
    m.box((0.06, 0.06, 0.3), (0.2, 0.18, 0.4), STEEL)                          # scrap hook
    m.box((0.18, 0.06, 0.06), (0.25, 0.18, 0.26), STEEL)
    m.box((0.06, 0.06, 0.12), (0.32, 0.18, 0.3), STEEL)
    lamp(m, 0.18, 0.04, 0.27, PASSG, r=0.05)
    m.build(P)


@part
def exchanger(P, anim):
    m = Model("exchanger")
    base(m, 0.7)
    m.box((0.64, 0.64, 0.1), (0, 0, 0.12), STEEL)
    for s, col in ((-1, HOT), (1, CYAN)):                                       # a hot leg and a cold one
        m.box((0.12, 0.56, 0.12), (s * 0.2, 0, 0.28), col, glow=True)
        m.box((0.16, 0.1, 0.32), (s * 0.2, 0.24, 0.24), METAL)
        m.box((0.16, 0.1, 0.32), (s * 0.2, -0.24, 0.24), METAL)
    m.box((0.52, 0.12, 0.12), (0, 0.24, 0.42), METAL)                            # the U-bend over the top
    m.box((0.18, 0.13, 0.13), (-0.08, 0.24, 0.42), "#ff9a5a", glow=True)
    m.box((0.18, 0.13, 0.13), (0.08, 0.24, 0.42), "#aef0ff", glow=True)
    for y in (-0.1, 0.04):                                                       # fins between
        m.box((0.22, 0.04, 0.22), (0, y, 0.28), B)
    lamp(m, 0, -0.24, 0.17, PASSG, r=0.05)
    m.build(P)


@part
def echo(P, anim):
    m = Model("echo")
    base(m)
    m.cyl(0.28, 0.12, (0, 0, 0.08), A, segs=6, r_top=0.22)
    m.cyl(0.05, 0.6, (0, 0, 0.2), CHROME, segs=5)                               # the mast
    m.ball(0.08, (0, 0, 0.82), "#f0e0ff", subdiv=0, glow=True)
    for s in (-1, 1):
        m.box((0.3, 0.05, 0.05), (s * 0.12, 0, 0.3), METAL, rot=(0, s * 0.5, 0))   # stays
    m.build(P)
    for i, (z, r) in enumerate(((0.36, 0.26), (0.52, 0.19), (0.66, 0.12))):    # the rings it echoes
        k = Model(f"echo_ring_{i}")
        ring(k, r, 0, 0, PASSG, n=6, w=0.04, h=0.03, glow=True)
        o = k.build(P, loc=(0, 0, z))
        if anim:
            d = 0.25 * i
            animate(o, "part_echo_ping_idle", "scale",
                    [(0, (0, 0, 0)), (0.25 + d, (0, 0, 0)), (0.4 + d, (0.35, 0.35, 0)), (0.6 + d, (0, 0, 0)), (1.6, (0, 0, 0))])


@part
def mirror(P, anim):
    m = Model("mirror")
    m.slab([(-0.4, -0.4), (0.4, -0.4), (0.4, 0.4), (-0.4, 0.4)], 0.0, 0.18, A,
           top=[(-0.36, -0.36), (0.36, -0.36), (0.36, 0.36), (-0.36, 0.36)])
    m.cyl(0.46, 0.24, (0, 0, 0.18), CHROME, segs=4, r_top=0.0, rot=(0, 0, math.pi / 4))   # mirrored pyramid
    for i in range(4):                                                            # glass facets
        a = TAU * i / 4
        m.box((0.4, 0.2, 0.03), (math.cos(a) * 0.16, math.sin(a) * 0.16, 0.28), "#bfe8ff",
              rot=(0, 0, a + math.pi / 2), glow=False)
    for i in range(4):                                                            # bright edges
        a = TAU * i / 4 + math.pi / 4
        m.plank_line((math.cos(a) * 0.42, math.sin(a) * 0.42, 0.19), (0, 0, 0.42), 0.03, 0.03, "#e8fbff")
    m.ball(0.05, (0, 0, 0.43), "#ffffff", subdiv=0, glow=True)
    lamp(m, 0.3, -0.3, 0.17, PASSG, r=0.05)
    m.build(P)


# --- the marks parts: boosters that make touching guns leave a mark, and what plays on marks ------
# Each glows in its mark's colour, as in the flight view and on the cards.

BURNG = "#ff7a2a"
SHOCKG = "#b48aff"
CRACKG = "#ffd04a"


@part
def incend(P, anim):
    m = Model("incend")
    base(m)
    m.cyl(0.26, 0.3, (0, -0.06, 0.08), "#4a3a32", segs=8, r_top=0.22)        # the slag hopper
    m.cyl(0.23, 0.04, (0, -0.06, 0.38), BURNG, segs=8, glow=True)           # embers in it
    m.cyl(0.1, 0.05, (0.05, -0.02, 0.4), MOLTEN, segs=6, glow=True)
    ring(m, 0.27, 0.36, 0, A, n=8, w=0.06, h=0.06)
    for s in (-1, 1):                                                        # feed pipes out to the guns
        m.box((0.1, 0.08, 0.08), (s * 0.29, 0.06, 0.2), COPPER)
        m.box((0.08, 0.16, 0.08), (s * 0.3, 0.18, 0.2), COPPER)
        m.box((0.06, 0.04, 0.06), (s * 0.3, 0.27, 0.2), HOT, glow=True)
    m.box((0.12, 0.24, 0.08), (0, 0.24, 0.12), COPPER)
    m.build(P)
    k = Model("incend_flame")
    k.cyl(0.08, 0.18, (0, 0, 0), BURNG, segs=5, r_top=0.0, glow=True)
    k.cyl(0.05, 0.12, (0.06, 0.03, 0.0), MOLTEN, segs=5, r_top=0.0, glow=True)
    o = k.build(P, loc=(0, -0.06, 0.4))
    if anim:
        animate(o, "part_incend_flicker_idle", "scale",
                [(0, (0, 0, 0)), (0.3, (0.1, 0.1, 0.35)), (0.55, (-0.05, -0.05, -0.15)), (0.9, (0, 0, 0))])


@part
def tesla(P, anim):
    m = Model("tesla")
    base(m)
    m.cyl(0.24, 0.1, (0, 0, 0.08), A, segs=6)
    m.cyl(0.1, 0.34, (0, 0, 0.18), "#e8e0d0", segs=8)                        # the insulator stack
    for i in range(3):
        m.cyl(0.16 - i * 0.02, 0.04, (0, 0, 0.22 + i * 0.1), B, segs=8)
    for s in (-1, 1):                                                        # side couplers to the guns
        m.box((0.16, 0.12, 0.14), (s * 0.26, 0, 0.16), STEEL)
        m.box((0.04, 0.1, 0.1), (s * 0.35, 0, 0.16), SHOCKG, glow=True)
    m.build(P)
    k = Model("tesla_ball")
    k.ball(0.13, (0, 0, 0), CHROME, subdiv=1)                                # the dome
    ring(k, 0.15, 0, 0, SHOCKG, n=6, w=0.03, h=0.03, glow=True)
    for i in range(3):                                                       # sparks crawling it
        a = TAU * i / 3
        k.box((0.03, 0.16, 0.03), (math.cos(a) * 0.16, math.sin(a) * 0.16, 0.06), "#e0d0ff",
              rot=(0, 0.5, a), glow=True)
    o = k.build(P, loc=(0, 0, 0.6))
    if anim:
        spin(o, "part_tesla_crawl_idle", 1.2)


@part
def breach(P, anim):
    m = Model("breach")
    base(m)
    m.box((0.6, 0.5, 0.14), (0, -0.04, 0.12), STEEL)                         # the rack
    for s in (-1, 1):
        m.box((0.08, 0.5, 0.26), (s * 0.28, -0.04, 0.24), A)
    for i, x in enumerate((-0.15, 0, 0.15)):                                 # shaped charges, noses forward
        m.cyl(0.06, 0.3, (x, -0.2, 0.3), "#3a3e34", segs=6, rot=FWD)
        m.cyl(0.06, 0.1, (x, 0.1, 0.3), CRACKG, segs=6, r_top=0.0, rot=FWD, glow=i == 1)
        m.box((0.13, 0.04, 0.13), (x, -0.06, 0.3), HAZARD)
    m.box((0.6, 0.06, 0.06), (0, 0.22, 0.14), HAZARD)
    lamp(m, 0.2, -0.24, 0.19, CRACKG, r=0.05)
    m.build(P)


@part
def flaw(P, anim):
    m = Model("flaw")
    base(m)
    m.cyl(0.24, 0.12, (0, 0, 0.08), A, segs=6)
    m.cyl(0.06, 0.2, (0, 0, 0.2), STEEL, segs=6)
    m.build(P)
    k = Model("flaw_scope")
    k.cyl(0.11, 0.42, (0, -0.16, 0), DARK, segs=8, rot=FWD)                  # the scope
    k.cyl(0.13, 0.08, (0, 0.24, 0), B, segs=8, rot=FWD)
    k.cyl(0.09, 0.03, (0, 0.29, 0), "#ffe8a0", segs=8, rot=FWD, glow=True)    # its lens
    for a in range(4):                                                       # reticle ticks on it
        ang = TAU * a / 4
        k.box((0.02, 0.02, 0.05), (math.cos(ang) * 0.05, 0.31, math.sin(ang) * 0.05), CRACKG, glow=True)
    k.box((0.04, 0.22, 0.12), (0, -0.08, 0.13), METAL)
    lamp(k, 0, -0.1, 0.19, PASSG, r=0.04)
    o = k.build(P, loc=(0, 0, 0.44))
    if anim:
        animate(o, "part_flaw_scan_idle", "rotation_euler",
                [(0, (0, 0, -0.4)), (1.4, (0, 0, 0.4)), (2.8, (0, 0, -0.4))])


@part
def catalyst(P, anim):
    m = Model("catalyst")
    base(m)
    m.cyl(0.28, 0.1, (0, 0, 0.08), STEEL, segs=6)
    for i in range(3):                                                       # three mark vials round it
        a = TAU * i / 3 + math.pi / 2
        x, y = math.cos(a) * 0.22, math.sin(a) * 0.22
        m.cyl(0.07, 0.3, (x, y, 0.16), "#d8e8f0", segs=6)
        m.cyl(0.055, 0.22, (x, y, 0.18), (BURNG, SHOCKG, CRACKG)[i], segs=6, glow=True)
        m.cyl(0.08, 0.04, (x, y, 0.46), DARK, segs=6)
    lamp(m, 0, -0.04, 0.18, DASHG, r=0.06)
    m.build(P)
    k = Model("catalyst_core")
    k.ball(0.1, (0, 0, 0), "#fff4e0", subdiv=0, glow=True)                   # where they meet
    ring(k, 0.15, 0, 0, DASHG, n=6, w=0.03, h=0.03, glow=True)
    o = k.build(P, loc=(0, 0, 0.42))
    if anim:
        pulse(o, "part_catalyst_mix_idle", 0.9, 0.25)
        spin(o, "part_catalyst_mix_idle", 0.9, turns=0.33)


def conduit_run(m: Model, a, b, z=0.14):
    """A pipe from a to b (in the deck plane), with a glowing line along its top."""
    ax, ay = a
    bx, by = b
    L = math.hypot(bx - ax, by - ay)
    rot = (0, 0, math.atan2(by - ay, bx - ax) - math.pi / 2)
    mid = ((ax + bx) / 2, (ay + by) / 2)
    m.box((0.2, L, 0.16), (mid[0], mid[1], z), STEEL, rot=rot)
    m.box((0.08, L, 0.04), (mid[0], mid[1], z + 0.09), "#c8b0ff", rot=rot, glow=True)


@part
def conduit(P, anim):
    m = Model("conduit")
    m.box((0.5, 0.5, 0.06), (0, 0, 0.03), DARK)
    conduit_run(m, (-0.4, 0), (0.4, 0))                                          # out to every side
    conduit_run(m, (0, -0.4), (0, 0.4))
    m.box((0.3, 0.3, 0.24), (0, 0, 0.16), "#4a4060", taper=0.8)                  # junction
    m.cyl(0.08, 0.04, (0, 0, 0.28), "#e0d0ff", segs=6, glow=True)
    m.build(P)


@part
def elbow(P, anim):
    m = Model("elbow")
    for x, y in ((0, 0), (0, -0.8), (0.8, -0.8)):
        m.box((0.5, 0.5, 0.06), (x, y, 0.03), DARK)
    conduit_run(m, (0, 0.4), (0, -0.8))
    conduit_run(m, (0, -0.8), (1.2, -0.8))
    conduit_run(m, (-0.4, 0), (0.4, 0))
    m.box((0.3, 0.3, 0.24), (0, 0, 0.16), "#4a4060", taper=0.8)
    m.box((0.32, 0.32, 0.26), (0, -0.8, 0.16), "#4a4060", taper=0.8)             # the corner
    m.box((0.3, 0.3, 0.24), (0.8, -0.8, 0.16), "#4a4060", taper=0.8)
    for x, y in ((0, 0), (0, -0.8), (0.8, -0.8)):
        m.cyl(0.07, 0.04, (x, y, 0.28), "#e0d0ff", segs=6, glow=True)
    m.build(P)


@part
def stormlens(P, anim):
    m = Model("stormlens")
    base(m)
    m.cyl(0.26, 0.12, (0, 0, 0.08), A, segs=6)
    for s in (-1, 1):                                                              # the fork
        m.box((0.08, 0.1, 0.42), (s * 0.3, 0, 0.36), B)
    m.build(P)
    k = Model("stormlens_lens")
    k.cyl(0.27, 0.05, (0, 0, -0.025), "#9ae8ff", segs=8, glow=True)               # the glass
    k.cyl(0.14, 0.07, (0, 0, -0.035), "#e8fbff", segs=8, glow=True)
    ring(k, 0.29, 0, 0, STEEL, n=8, w=0.07, h=0.09)
    for i in range(3):                                                              # bolts of lightning off it
        a = TAU * i / 3
        for j in range(3):
            r = 0.34 + j * 0.08
            k.box((0.04, 0.12, 0.04), (math.cos(a + j * 0.25) * r, math.sin(a + j * 0.25) * r, 0.02),
                  PASSG if j % 2 else "#e0d0ff", rot=(0, 0, a + (0.9 if j % 2 else -0.9)), glow=True)
    o = k.build(P, loc=(0, 0, 0.58))
    o.rotation_euler = (0.45, 0, 0)
    if anim:
        animate(o, "part_stormlens_turn_idle", "rotation_euler", [(0, (0, 0, 0)), (2.0, (0, 0, TAU))], rest=(0.45, 0, 0))


@part
def slag(P, anim):
    m = Model("slag")
    m.box((1.42, 0.66, 0.1), (0.4, 0, 0.05), DARK)
    m.box((1.3, 0.56, 0.26), (0.4, 0, 0.18), "#4a3a32", taper=0.9)                  # the furnace
    m.box((1.32, 0.1, 0.28), (0.4, -0.2, 0.18), HAZARD)
    m.cyl(0.3, 0.2, (0.3, 0.04, 0.3), A, segs=8, r_top=0.34)                         # crucible
    m.cyl(0.27, 0.04, (0.3, 0.04, 0.47), "#ff5a1a", segs=8, glow=True)               # molten slag
    m.cyl(0.13, 0.05, (0.26, 0.08, 0.48), "#ffd04a", segs=6, glow=True)
    m.box((0.2, 0.1, 0.08), (0.3, 0.38, 0.38), A, rot=(-0.4, 0, 0))                 # pouring lip
    m.cyl(0.12, 0.6, (0.92, -0.08, 0.2), STEEL, segs=6)                              # stack
    m.cyl(0.14, 0.08, (0.92, -0.08, 0.78), DARK, segs=6)
    m.cyl(0.09, 0.04, (0.92, -0.08, 0.84), "#ff7a2a", segs=6, glow=True)
    for x in (0.7, 1.1):
        m.box((0.06, 0.4, 0.06), (x, 0.12, 0.33), METAL)
    lamp(m, 0.92, 0.18, 0.31, PASSG, r=0.05)
    m.build(P)
    k = Model("slag_blob")
    k.ball(0.09, (0, 0, 0), MOLTEN, subdiv=0, scale=(1, 1, 0.7), glow=True)
    o = k.build(P, loc=(0.36, 0.0, 0.5))
    if anim:
        animate(o, "part_slag_boil_idle", "location", [(0, (0, 0, -0.05)), (0.5, (0, 0, 0.04)), (0.7, (0, 0, -0.05)), (1.4, (0, 0, -0.05))])
        animate(o, "part_slag_boil_idle", "scale", [(0, (-0.4, -0.4, -0.4)), (0.5, (0.2, 0.2, 0.2)), (0.7, (-0.4, -0.4, -0.4)), (1.4, (-0.4, -0.4, -0.4))])


@part
def recoil(P, anim):
    m = Model("recoil")
    base(m)
    m.box((0.6, 0.26, 0.26), (0, -0.2, 0.2), A, taper=0.9)                          # breech block
    m.box((0.62, 0.08, 0.28), (0, -0.1, 0.2), B)
    for s in (-1, 1):                                                                 # two shock absorbers
        m.cyl(0.1, 0.42, (s * 0.18, -0.3, 0.3), STEEL, segs=6, rot=FWD)
        for y in (-0.42, -0.3, -0.18):
            m.cyl(0.12, 0.04, (s * 0.18, y, 0.3), HAZARD, segs=6, rot=FWD)    # their springs
    m.box((0.3, 0.14, 0.12), (0, -0.33, 0.38), DARK)
    lamp(m, 0, -0.33, 0.4, DASHG, r=0.05)
    m.build(P)
    k = Model("recoil_rams")
    for s in (-1, 1):
        k.cyl(0.06, 0.34, (s * 0.18, 0, 0), CHROME, segs=6, rot=FWD)               # piston rods
        k.cyl(0.11, 0.06, (s * 0.18, 0.32, 0), DARK, segs=6, rot=FWD)
    k.box((0.48, 0.08, 0.16), (0, 0.36, 0), "#c89a40")                              # the strike plate
    k.box((0.36, 0.04, 0.06), (0, 0.41, 0.0), "#ffb04a", glow=True)
    o = k.build(P, loc=(0, 0.0, 0.3))
    if anim:
        animate(o, "part_recoil_kick_idle", "location", [(0, (0, 0, 0)), (1.0, (0, -0.14, 0)), (1.08, (0, 0.06, 0)), (1.3, (0, 0, 0)), (1.8, (0, 0, 0))])


# --- frames ---------------------------------------------------------------------------------------
# Used-future ships, like the ones on the title art: worn plating in slightly different shades,
# chipped paint, soot, greebles, faded stripes. Each frame keeps a character of its own: the
# Kestrel an off-white racer with livery stripes, the Mule a grey-olive work hauler, the Wasp a
# podracer with two big intakes, the Hammerhead a gunmetal gunship, the Lattice a rusty scaffold.
# The livery (Skin a, b, c) goes on as paint, bands and lights, so two players on the same frame
# still tell their ships apart.

FRAMES = {
    "kestrel": ['.#.', '###', '###', '#.#'],
    "mule": ['#####', '#####', '.###.'],
    "wasp": ['#.#', '#.#', '###', '###'],
    "hammer": ['####', '####', '.##.', '.##.'],
    "lattice": ['#.#.#', '#.#.#', '#####', '.#.#.'],
}

START = {
    "kestrel": [('rivet', 1, 0), ('thruster', 0, 3), ('thruster', 2, 3), ('reactor', 1, 2)],
    "mule": [('rivet', 1, 0), ('rivet', 3, 0), ('thruster', 2, 2), ('plate', 2, 1)],
    "wasp": [('rivet', 0, 0), ('rivet', 2, 0), ('thruster', 1, 3), ('reactor', 1, 2)],
    "hammer": [('scatter', 1, 0), ('scatter', 2, 0), ('thruster', 1, 3), ('thruster', 2, 3)],
    "lattice": [('rivet', 0, 0), ('rivet', 4, 0), ('reactor', 2, 2), ('thruster', 1, 3), ('thruster', 3, 3)],
}

SOOT = "#2a2522"
INK = "#24262c"
CHROME = "#b8c0c6"


def sock(grid, c, r):
    cols, rows = len(grid[0]), len(grid)
    return (c - (cols - 1) / 2) * CELL, ((rows - 1) / 2 - r) * CELL


def tone(col, k):
    """A colour a shade darker (k < 1) or lighter: a skin stays a skin."""
    if isinstance(col, Skin):
        return col.shade(k)
    h = col.lstrip('#')
    return '#' + ''.join(f"{min(255, round(int(h[i:i + 2], 16) * k)):02x}" for i in (0, 2, 4))


def inside(pts, x, y):
    hit = False
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            hit = not hit
    return hit


def plating(m: Model, pts, z, col, size=0.55, gap=0.07, chips=METAL, skip=()):
    """Worn plating over an outline: plates in slightly different shades with seams between them,
    a few chips of bare metal. Plates under a socket in `skip` (centres) are left out."""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    nx = max(1, round((max(xs) - min(xs)) / size))
    ny = max(1, round((max(ys) - min(ys)) / size))
    w = (max(xs) - min(xs)) / nx
    d = (max(ys) - min(ys)) / ny
    for i in range(nx):
        for j in range(ny):
            cx = min(xs) + (i + 0.5) * w
            cy = min(ys) + (j + 0.5) * d
            hw, hd = (w - gap) / 2, (d - gap) / 2
            if not all(inside(pts, cx + a * hw, cy + b * hd) for a in (-1, 1) for b in (-1, 1)):
                continue
            if any(abs(cx - sx) < 0.4 + hw and abs(cy - sy) < 0.4 + hd for sx, sy in skip):
                continue
            m.box((w - gap, d - gap, 0.03), (cx, cy, z + 0.015), tone(col, m.rng.choice((1.0, 1.0, 0.86, 1.1, 0.76))))
            if m.rng.random() < 0.3:
                m.box((m.rng.uniform(0.08, 0.2), m.rng.uniform(0.06, 0.14), 0.01),
                      (cx + m.rng.uniform(-hw, hw) * 0.6, cy + m.rng.uniform(-hd, hd) * 0.6, z + 0.035), chips)


def sockets(grid):
    return [sock(grid, c, r) for r, row in enumerate(grid) for c, ch in enumerate(row) if ch == '#']


def decks(m: Model, grid, plate=DECKP, hatch=DARK, bolt=B, top=DECK, h=0.08):
    """A worn deck plate under every socket (top at z = 0.3), with a mount hatch and corner bolts."""
    for x, y in sockets(grid):
        m.box((0.72, 0.72, h), (x, y, top - h / 2), tone(plate, m.rng.choice((1.0, 0.88, 1.1, 0.8))), taper=0.92)
        m.box((0.26, 0.26, 0.02), (x, y, top), hatch)
        for dx, dy in ((-0.27, -0.27), (0.27, -0.27), (-0.27, 0.27), (0.27, 0.27)):
            m.box((0.06, 0.06, 0.02), (x + dx, y + dy, top), bolt)
        if m.rng.random() < 0.5:                                                           # a chip or a scorch
            m.box((m.rng.uniform(0.1, 0.22), m.rng.uniform(0.06, 0.14), 0.01),
                  (x + m.rng.choice((-0.2, 0.2)), y + m.rng.uniform(-0.25, 0.25), top + 0.005), m.rng.choice((METAL, SOOT)))


def canopy(m: Model, loc, size, color=GLASS, bar=B, ribs=2):
    """A faceted canopy that glows faintly, in a heavy frame: a spine and cross ribs."""
    x, y, z = loc
    sx, sy, sz = size
    m.ball(1.0, (x, y, z), color, subdiv=1, scale=(sx, sy, sz), glow=True)
    m.box((0.07, sy * 1.7, 0.07), (x, y, z + sz * 0.9), bar)
    for i in range(ribs):
        t = (i + 1) / (ribs + 1) * 2 - 1
        m.box((sx * 1.8 * math.sqrt(1 - t * t * 0.8), 0.06, 0.06), (x, y + t * sy * 0.8, z + sz * 0.75), bar)


def poly(m: Model, pts, z0, z1, color, inset=1.0, glow=False):
    """A flat plate from an outline (either winding), its top shrunk by `inset` about its middle."""
    area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]))
    if area < 0:
        pts = pts[::-1]
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    top = [(cx + (x - cx) * inset, cy + (y - cy) * inset) for x, y in pts]
    m.slab(pts, z0, z1, color, top=top, glow=glow)
    return top


def strip(m: Model, a, b, w, z, h, color, glow=False):
    """A flat bar from (x, y) a to b, lying at height z."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    return m.box((w, math.hypot(dx, dy), h), ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z), color,
                 rot=(0, 0, -math.atan2(dx, dy)), glow=glow)


def soot(m: Model, x, y, z, w, length):
    """A scorch streak blown back from (x, y)."""
    poly(m, [(x - w / 2, y), (x + w / 2, y), (x + w * 0.2, y - length), (x - w * 0.2, y - length)], z, z + 0.01, SOOT)


def pipe(m: Model, a, b, z, r=0.05, color=STEEL):
    """A pipe run along the hull from (x, y) a to b, with a collar at each end."""
    m.plank_line((a[0], a[1], z), (b[0], b[1], z), r * 2, r * 2, color)
    for x, y in (a, b):
        m.box((r * 3, r * 3, r * 3), (x, y, z), DARK)


def vent(m: Model, x, y, z, w=0.4, d=0.3, n=3, rot=0.0):
    """A grille: a dark recess with slats across it."""
    m.box((w, d, 0.02), (x, y, z + 0.01), INK, rot=(0, 0, rot))
    for i in range(n):
        t = (i + 0.5) / n - 0.5
        m.box((w * 0.9, 0.04, 0.03), (x - math.sin(rot) * t * d, y + math.cos(rot) * t * d, z + 0.02), STEEL, rot=(0, 0, rot))


def blink(obj, clip, period, off=0.12):
    """A light that goes dark for a moment every period."""
    animate(obj, clip, "scale", [(0, (0, 0, 0)), (period - off - 0.01, (0, 0, 0)),
                                 (period - off, (-1, -1, -1)), (period - 0.01, (-1, -1, -1)), (period, (0, 0, 0))])


# The Kestrel: a worn off-white racer with stripes in the livery down its nose and wings, an
# intake under each cheek, twin canted tail fins and a cockpit set far back between the engines.
BONE = "#d2cab6"
BONE_D = "#a49c88"


def kestrel(root):
    g = FRAMES["kestrel"]
    m = Model("kestrel_hull", seed=3)
    skip = sockets(g)
    fus = [(0, 3.15), (-0.16, 2.6), (-0.4, 1.7), (-0.5, 0.9), (-0.5, -0.9), (-0.4, -1.9), (-0.2, -2.35),
           (0.2, -2.35), (0.4, -1.9), (0.5, -0.9), (0.5, 0.9), (0.4, 1.7), (0.16, 2.6)]
    top = poly(m, fus, 0.0, 0.24, BONE, inset=0.86)
    plating(m, top, 0.24, BONE, size=0.42, skip=skip)
    poly(m, [(x * 0.62, y * 0.94) for x, y in fus], -0.16, 0.0, INK)
    for s in (1, -1):
        wing = [(0.45, 1.25), (1.0, 0.85), (1.5, -0.1), (2.05, -1.35), (2.1, -1.8), (1.65, -1.62), (1.15, -1.68), (0.45, -1.55)]
        wing = [(s * x, y) for x, y in wing]
        top = poly(m, wing, 0.04, 0.2, BONE, inset=0.97)
        plating(m, top, 0.2, BONE, size=0.42, skip=skip)
        poly(m, [(x, y - 0.04) for x, y in wing], -0.04, 0.04, BONE_D)                       # underside lip
        # the livery stripe down the leading edge, and a second, faded, inboard of it
        for a, b in (((0.45, 1.3), (1.02, 0.9)), ((1.02, 0.9), (1.53, -0.08)), ((1.53, -0.08), (2.08, -1.33))):
            strip(m, (s * a[0], a[1]), (s * b[0], b[1]), 0.18, 0.23, 0.04, A)
        strip(m, (s * 1.3, -0.15), (s * 1.75, -1.25), 0.12, 0.23, 0.03, A.shade(0.8))
        m.box((0.1, 0.5, 0.34), (s * 2.1, -1.55, 0.1), A, taper=0.6)                        # wingtip fin
        m.box((0.08, 0.18, 0.08), (s * 2.12, -1.3, 0.3), C, glow=True)                       # nav light
        # canted twin tail fins, striped, with a dark leading edge
        fin = Model(f"kestrel_fin_{'r' if s > 0 else 'l'}")
        fin.prism([(0, 0), (0.8, 0), (1.0, 0.7), (0.66, 0.74)], 0.09, (0, 0, 0), BONE, rot=(0, 0, -math.pi / 2))
        fin.box((0.1, 0.32, 0.12), (0, -0.85, 0.66), A)
        fin.box((0.1, 0.14, 0.5), (0, -0.05, 0.25), INK, rot=(-0.3, 0, 0))
        fin.build(root, loc=(s * 1.25, -1.4, 0.16)).rotation_euler = (0, s * 0.35, 0)
        # cheek intakes, greebles and a pipe run down the flanks
        m.box((0.16, 0.5, 0.18), (s * 0.48, 1.75, 0.14), STEEL, taper=0.75)
        m.box((0.12, 0.06, 0.12), (s * 0.5, 2.0, 0.14), INK)
        pipe(m, (s * 0.52, 1.3), (s * 0.52, -1.7), 0.12, 0.04)
        soot(m, s * 0.8, -1.62, 0.21, 0.4, 0.2)
        # a faded roundel out past the sockets
        m.cyl(0.22, 0.03, (s * 1.62, -1.02, 0.23), tone(BONE, 0.7), segs=10)
        m.cyl(0.12, 0.03, (s * 1.62, -1.02, 0.24), A.shade(0.85), segs=10)
    # racing stripes up the nose, and a dark anti-glare panel ahead of them
    for s in (1, -1):
        strip(m, (s * 0.13, 1.62), (s * 0.05, 3.0), 0.1, 0.27, 0.03, A)
    m.box((0.22, 0.4, 0.02), (0, 2.75, 0.24), INK, taper=0.5)
    m.cyl(0.03, 0.6, (0, 3.0, 0.12), CHROME, segs=4, rot=FWD)                              # pitot needle
    vent(m, 0, 1.75, 0.25, 0.3, 0.2, 2)
    # cockpit in the gap between the engines, faired into a tail cone
    x, y = sock(g, 1, 3)
    m.box((0.62, 1.1, 0.3), (x, y - 0.1, 0.15), BONE, taper=0.8)
    canopy(m, (x, y + 0.02, 0.34), (0.24, 0.44, 0.24), bar=INK)
    m.box((0.46, 0.5, 0.22), (x, y - 0.7, 0.3), tone(BONE, 0.9), taper=0.6)                 # headrest fairing
    m.box((0.5, 0.06, 0.04), (x, y - 0.95, 0.26), A)
    decks(m, g, plate=BONE, hatch=tone(BONE, 0.55), bolt=BONE_D)
    m.build(root)
    n = Model("kestrel_nose")
    n.ball(0.07, (0, 0, 0), C, subdiv=0, glow=True)
    blink(n.build(root, loc=(0, 3.32, 0.12)), "frame_kestrel_blink_idle", 1.2)


# The Mule: a grey-olive work hauler. Ribbed flanks, cargo pods slung along the sides, rubber
# bumpers with hazard chevrons, a cab up front in the livery with a radar turning on its roof,
# exhaust stacks at the back corners, rust streaks and soot.
OLIVE = "#6a6c58"
OLIVE_D = "#4a4c3e"
OLIVE_L = "#888a72"
RUST = "#7e4426"


def mule(root):
    g = FRAMES["mule"]
    m = Model("mule_hull", seed=5)
    skip = sockets(g)
    hull = [(-2.1, -1.32), (2.1, -1.32), (2.2, 1.1), (2.0, 1.32), (-2.0, 1.32), (-2.2, 1.1)]
    top = poly(m, hull, -0.1, 0.24, OLIVE, inset=0.97)
    plating(m, top, 0.24, OLIVE, size=0.45, chips=RUST, skip=skip)
    poly(m, [(x * 0.9, y * 0.88) for x, y in hull], -0.34, -0.1, DARK)
    for s in (1, -1):
        # ribbed flank, a livery band with a cargo pod slung under it, rust streaks
        for i in range(9):
            m.box((0.1, 0.12, 0.34), (s * 2.2, -1.05 + i * 0.26, 0.07), OLIVE_D)
        m.box((0.12, 2.5, 0.08), (s * 2.24, 0.0, 0.2), A)
        m.box((0.36, 1.3, 0.3), (s * 2.42, 0.1, -0.02), A.shade(0.82))
        m.box((0.38, 0.1, 0.32), (s * 2.42, 0.3, -0.02), STEEL)
        m.box((0.38, 0.1, 0.32), (s * 2.42, -0.2, -0.02), STEEL)
        m.box((0.3, 0.3, 0.02), (s * 2.42, 0.6, 0.14), HAZARD)
        m.box((0.14, 0.34, 0.24), (s * 2.18, 0.42, 0.0), RUST)
        m.box((0.14, 0.2, 0.18), (s * 2.18, -0.72, 0.02), RUST)
        # exhaust stacks in the bare rear corners, sooty at the top
        x, y = sock(g, 0 if s < 0 else 4, 2)
        m.box((0.62, 0.62, 0.1), (x, y, 0.2), OLIVE_D)
        vent(m, x - s * 0.12, y + 0.12, 0.25, 0.3, 0.26, 3)
        m.cyl(0.13, 0.95, (x + s * 0.12, y - 0.04, 0.2), STEEL, segs=6)
        m.cyl(0.16, 0.06, (x + s * 0.12, y - 0.04, 0.6), METAL, segs=6)
        m.cyl(0.15, 0.12, (x + s * 0.12, y - 0.04, 1.1), SOOT, segs=6, r_top=0.17)
        m.box((0.3, 0.08, 0.1), (x, y - 0.38, 0.14), RED, glow=True)                       # tail light
        pipe(m, (x - s * 0.2, y - 0.25), (x - s * 0.2, y + 0.3), 0.32, 0.05)
    # rubber bumpers, front and back, with hazard chevrons
    for y0 in (1.42, -1.42):
        m.box((3.9, 0.2, 0.28), (0, y0, 0.04), RUBBER)
        for i in range(-3, 4):
            if i:
                m.box((0.16, 0.06, 0.22), (i * 0.5, y0 + (0.1 if y0 > 0 else -0.1), 0.05), HAZARD, rot=(0, 0, 0.5))
    soot(m, 0, -1.2, 0.27, 0.5, 0.12)
    # the cab, up front in the livery, worn
    x, y = sock(g, 2, 0)
    cy = y + 0.98
    m.box((1.5, 0.82, 0.42), (x, cy, 0.22), A, taper=0.88)
    for i, k in enumerate((1.0, 0.84, 1.1)):
        m.box((0.42, 0.5, 0.03), (x - 0.46 + i * 0.46, cy + 0.02, 0.44), A.shade(k))
    m.box((1.52, 0.14, 0.44), (x, cy - 0.38, 0.23), B)
    canopy(m, (x, cy + 0.32, 0.36), (0.6, 0.12, 0.16), bar=OLIVE_D, ribs=1)
    m.box((1.0, 0.08, 0.16), (x, cy + 0.43, 0.08), INK)                                    # grille
    for i in range(-2, 3):
        m.box((0.04, 0.09, 0.14), (x + i * 0.18, cy + 0.45, 0.08), CHROME)
    for s in (1, -1):
        m.box((0.18, 0.06, 0.12), (s * 0.6, cy + 0.42, 0.16), "#fff0c0", glow=True)        # headlights
        m.box((0.08, 0.08, 0.22), (s * 0.7, cy - 0.1, 0.5), C, glow=True)                  # roof beacons
    m.box((0.24, 0.24, 0.12), (x, cy - 0.12, 0.48), STEEL)                                # radar mount
    decks(m, g, plate=OLIVE, hatch=OLIVE_D, bolt=HAZARD)
    m.build(root)
    r = Model("mule_radar")
    r.cyl(0.04, 0.2, (0, 0, 0), METAL, segs=4)
    r.box((0.62, 0.08, 0.2), (0, 0.06, 0.24), B, taper=0.7)
    r.box((0.08, 0.08, 0.08), (0, 0.14, 0.26), C, glow=True)
    spin(r.build(root, loc=(x, cy - 0.12, 0.54)), "frame_mule_radar_idle", 3.0)


# The Wasp: a podracer. Two big engine intakes out on the prongs with a crackling binder between
# them, the cockpit pod slung in the middle, a gunmetal body banded in the livery tapering back to
# a tail spike, air-brake vanes on the booms.
GUNM = "#4a4844"
GUNM_D = "#302f2d"


def wasp(root):
    g = FRAMES["wasp"]
    m = Model("wasp_hull", seed=7)
    skip = sockets(g)
    body = [(-1.25, -1.62), (1.25, -1.62), (1.32, -0.2), (1.0, 0.12), (-1.0, 0.12), (-1.32, -0.2)]
    top = poly(m, body, -0.04, 0.24, GUNM, inset=0.94)
    plating(m, top, 0.24, GUNM, skip=skip)
    poly(m, [(x * 0.8, y * 0.85) for x, y in body], -0.24, -0.04, INK)
    # the tail: plated bands, livery and gunmetal, narrowing to a spike
    segs = [(-1.6, -1.98, 1.0, A), (-1.98, -2.34, 0.86, GUNM), (-2.34, -2.68, 0.68, A.shade(0.85)), (-2.68, -2.98, 0.46, GUNM)]
    for y0, y1, w, col in segs:
        poly(m, [(-w, y0), (w, y0), (w * 0.86, y1), (-w * 0.86, y1)], -0.12, 0.2 - (y0 + 1.6) * 0.06, col, inset=0.8)
        m.box((w * 1.3, 0.05, 0.03), (0, y1 + 0.03, 0.2 - (y0 + 1.6) * 0.06), INK)
    vent(m, 0, -2.15, 0.13, 0.6, 0.18, 2)
    m.cyl(0.14, 0.55, (0, -2.96, 0.06), STEEL, segs=5, r_top=0.0, rot=BACK)               # tail spike
    m.ball(0.06, (0, -3.5, 0.06), C, subdiv=0, glow=True)
    for s in (1, -1):
        x = s * 0.8
        # the boom under the prong's sockets
        m.cyl(0.3, 2.0, (x, -0.2, -0.08), INK, segs=8, r_top=0.28, rot=FWD)
        top = poly(m, [(x - 0.42, -0.1), (x + 0.42, -0.1), (x + 0.42, 1.65), (x - 0.42, 1.65)], 0.06, 0.22, GUNM, inset=0.94)
        m.box((0.88, 0.14, 0.04), (x, -0.02, 0.23), A)
        # the intake: a big cowl in the livery, a dark throat, a fan and a glowing ring
        m.cyl(0.46, 0.8, (x, 1.55, 0.02), GUNM, segs=10, r_top=0.48, rot=FWD)
        m.cyl(0.52, 0.32, (x, 2.3, 0.02), A, segs=10, r_top=0.5, rot=FWD)
        m.cyl(0.53, 0.06, (x, 2.1, 0.02), tone(B, 0.9), segs=10, rot=FWD)
        m.cyl(0.38, 0.04, (x, 2.62, 0.02), INK, segs=10, rot=FWD)
        ring(m, 0.36, 0.02, 0.06, C, n=10, w=0.06, glow=True, cx=x, cy=2.6, axis="y")
        for i in range(6):                                                                 # fan blades
            a = TAU * i / 6
            m.box((0.07, 0.04, 0.34), (x + math.cos(a) * 0.15, 2.58, 0.02 + math.sin(a) * 0.15), STEEL, rot=(0, -a + math.pi / 2, 0))
        m.cyl(0.1, 0.12, (x, 2.56, 0.02), CHROME, segs=6, r_top=0.03, rot=FWD)
        # air-brake vanes on the boom's outer flank
        m.box((0.08, 0.7, 0.5), (x + s * 0.5, 0.75, 0.2), A.shade(0.9), taper=0.5)
        m.box((0.09, 0.08, 0.5), (x + s * 0.5, 1.08, 0.2), INK, taper=0.5)
        # the binder posts over each intake
        m.box((0.14, 0.14, 0.4), (x - s * 0.32, 2.3, 0.5), STEEL)
        m.box((0.12, 0.12, 0.08), (x - s * 0.32, 2.3, 0.72), C, glow=True)
        pipe(m, (x + s * 0.3, 1.3), (x + s * 0.3, -0.1), 0.3, 0.04)
        soot(m, s * 0.65, -1.62, 0.25, 0.3, 0.25)
    m.box((0.92, 0.07, 0.06), (0, 2.3, 0.7), C, glow=True)                                 # binder
    # the cockpit pod slung between the booms
    poly(m, [(-0.3, 0.0), (0.3, 0.0), (0.32, 0.9), (0.14, 1.5), (-0.14, 1.5), (-0.32, 0.9)], -0.02, 0.24, A.shade(0.9), inset=0.75)
    canopy(m, (0, 0.66, 0.3), (0.2, 0.4, 0.2), bar=GUNM_D)
    for s in (1, -1):
        m.box((0.56, 0.12, 0.08), (s * 0.5, 0.3, 0.12), STEEL)                             # struts
        m.box((0.5, 0.08, 0.06), (s * 0.5, 1.2, 0.1), STEEL)
    decks(m, g, plate=GUNM, hatch=GUNM_D, bolt=A)
    m.build(root)


# The Hammerhead: a gunmetal gunship. A wide armoured head, red-eyed sensor pods at its ends,
# riveted plating, gill vents down the tail, a dorsal fin and tail flukes with faded stripes, an
# armoured cockpit pod off one shoulder and a sensor mast off the other.
GUN = "#525a66"
GUN_D = "#343a46"
GUN_L = "#6c7686"
EYE = "#ff3a2a"


def hammer(root):
    g = FRAMES["hammer"]
    m = Model("hammer_hull", seed=11)
    skip = sockets(g)
    head = [(-2.0, -0.12), (2.0, -0.12), (2.5, 0.3), (2.55, 1.15), (2.1, 1.6), (1.0, 1.9), (-1.0, 1.9), (-2.1, 1.6), (-2.55, 1.15), (-2.5, 0.3)]
    top = poly(m, head, -0.06, 0.24, GUN, inset=0.97)
    plating(m, top, 0.24, GUN, size=0.4, skip=skip)
    poly(m, [(x * 0.85, y * 0.9) for x, y in head], -0.3, -0.06, GUN_D)
    # armour lip along the front: thick riveted plates, the outer ones in the livery
    for i, x in enumerate((-1.6, -0.55, 0.55, 1.6)):
        m.box((1.0, 0.34, 0.36), (x, 1.8 - abs(x) * 0.1, 0.12), A.shade(0.9) if i in (0, 3) else GUN_L,
              rot=(0, 0, -0.12 * (x / abs(x)) * (abs(x) > 1)), taper=0.8)
        for dx in (-0.3, 0.3):
            m.box((0.07, 0.07, 0.04), (x + dx, 1.82 - abs(x) * 0.1, 0.31), GUN_D)
    for s in (1, -1):
        # the eyes: armoured pods at the ends of the head, red slits under a brow
        m.cyl(0.36, 0.44, (s * 2.25, 0.72, -0.08), GUN_L, segs=6)
        m.cyl(0.38, 0.08, (s * 2.25, 0.72, 0.08), A, segs=6)
        m.cyl(0.3, 0.04, (s * 2.25, 0.72, 0.36), GUN_D, segs=6)
        m.box((0.22, 0.5, 0.08), (s * 2.32, 0.74, 0.42), EYE, glow=True)
        m.box((0.12, 0.62, 0.16), (s * 2.1, 0.74, 0.44), GUN_D, rot=(0, s * 0.3, 0))     # brow
        strip(m, (s * 1.75, 1.45), (s * 2.25, 1.05), 0.14, 0.27, 0.03, A.shade(0.85))   # faded stripe
        vent(m, s * 1.95, 0.05, 0.25, 0.4, 0.2, 2)
    # the slim tail, with gill vents down its flanks
    tail = [(-0.88, -1.9), (0.88, -1.9), (0.92, -0.05), (-0.92, -0.05)]
    poly(m, tail, -0.02, 0.24, GUN, inset=0.95)
    poly(m, [(x * 0.7, y * 0.95) for x, y in tail], -0.24, -0.02, GUN_D)
    for s in (1, -1):
        for i in range(3):
            m.box((0.06, 0.08, 0.24), (s * 0.93, -0.55 - i * 0.22, 0.1), INK, rot=(0, 0, s * 0.3))
        soot(m, s * 0.4, -1.6, 0.25, 0.4, 0.3)
    # dorsal fin and tail flukes behind the last sockets
    m.prism([(0, 0), (0.9, 0), (0.25, 0.95), (0.05, 0.9)], 0.12, (0, -2.6, 0.18), GUN_L, rot=(0, 0, math.pi / 2))
    m.prism([(0.05, 0.62), (0.4, 0.62), (0.28, 0.8), (0.12, 0.8)], 0.13, (0, -2.6, 0.18), A, rot=(0, 0, math.pi / 2))
    for s in (1, -1):
        top = poly(m, [(s * 0.2, -1.9), (s * 0.55, -1.95), (s * 1.35, -2.75), (s * 1.15, -2.9), (s * 0.15, -2.45)], -0.02, 0.14, GUN, inset=0.9)
        strip(m, (s * 0.55, -1.98), (s * 1.3, -2.76), 0.1, 0.15, 0.03, A.shade(0.85))
    m.cyl(0.24, 0.5, (0, -1.9, 0.08), GUN_D, segs=6, r_top=0.1, rot=BACK)
    # cockpit pod off the tail's right shoulder, with a visor slit
    x, y = sock(g, 3, 2)
    m.box((0.55, 0.18, 0.14), (x - 0.4, y + 0.05, 0.14), STEEL)                           # access tube
    m.cyl(0.38, 0.32, (x + 0.05, y - 0.05, 0.0), GUN_L, segs=7)
    m.cyl(0.34, 0.06, (x + 0.05, y - 0.05, 0.32), A, segs=7)
    m.cyl(0.26, 0.12, (x + 0.05, y - 0.05, 0.36), GUN_D, segs=7, r_top=0.2)
    m.box((0.36, 0.1, 0.06), (x + 0.05, y + 0.08, 0.46), GLASS, glow=True)
    # the left shoulder carries a sensor mast and a pectoral fin
    x, y = sock(g, 0, 2)
    m.cyl(0.22, 0.24, (x + 0.1, y, 0.0), STEEL, segs=6)
    m.cyl(0.05, 0.5, (x + 0.1, y, 0.24), METAL, segs=4)
    m.box((0.5, 0.14, 0.08), (x - 0.25, y + 0.05, 0.14), STEEL)
    poly(m, [(-0.9, -0.9), (-1.65, -1.6), (-1.5, -1.8), (-0.9, -1.5)], -0.02, 0.14, GUN, inset=0.9)
    decks(m, g, plate=GUN, hatch=GUN_D, bolt=GUN_L)
    m.build(root)
    n = Model("hammer_lamp")
    n.ball(0.08, (0, 0, 0), EYE, subdiv=0, glow=True)
    blink(n.build(root, loc=(x + 0.1, y, 0.8)), "frame_hammer_blink_idle", 0.9, 0.3)


# The Lattice: no hull at all, a rusty scaffold of girders between socket pads, conduit run along
# it, work lamps out on the spars' tips, hazard-striped crossbars, and the cockpit pod hung in a
# roll cage in the gap at the back.
IRON = "#6e4630"
IRON_D = "#43301f"
PAD = "#5a5c60"
LAMP = "#ffb04a"


def lattice(root):
    g = FRAMES["lattice"]
    m = Model("lattice_hull", seed=13)
    cells = [(c, r) for r, row in enumerate(g) for c, ch in enumerate(row) if ch == '#']
    z = 0.12
    # a pad under every socket, its collar in the livery
    for c, r in cells:
        x, y = sock(g, c, r)
        m.cyl(0.36, 0.14, (x, y, 0.08), tone(PAD, m.rng.choice((1.0, 0.88, 1.1))), segs=8, r_top=0.32)
        m.cyl(0.37, 0.04, (x, y, 0.1), A.shade(m.rng.choice((1.0, 0.85))), segs=8)
        m.cyl(0.12, 0.3, (x, y, -0.22), IRON_D, segs=6)                                    # hanging strut
    # girders between neighbouring sockets, with conduit along them
    for c, r in cells:
        x0, y0 = sock(g, c, r)
        for dc, dr in ((1, 0), (0, 1)):
            if (c + dc, r + dr) in cells:
                x1, y1 = sock(g, c + dc, r + dr)
                for k in (-1, 1):
                    off = (k * 0.12 * dr, k * 0.12 * dc)
                    strip(m, (x0 + off[0], y0 + off[1]), (x1 + off[0], y1 + off[1]), 0.09, z, 0.12, tone(IRON, m.rng.choice((1.0, 0.85, 1.15))))
                strip(m, (x0, y0), (x1, y1), 0.05, z + 0.02, 0.04, C, glow=True)
    # the open bays: cross-braced, a rivet plate where the braces cross
    for c, r in ((1, 0), (3, 0), (1, 1), (3, 1)):
        x, y = sock(g, c, r)
        for k in (-1, 1):
            strip(m, (x - 0.8, y + k * 0.4), (x + 0.8, y - k * 0.4), 0.07, z - 0.04, 0.08, IRON_D)
        m.box((0.2, 0.2, 0.06), (x, y, z - 0.02), STEEL, rot=(0, 0, math.pi / 4))
    # a hazard-striped front crossbar, and the spars running on past it to work lamps
    fy = sock(g, 0, 0)[1] + 0.55
    strip(m, (-1.75, fy), (1.75, fy), 0.14, z, 0.12, HAZARD)
    for i in range(-8, 9):
        m.box((0.08, 0.15, 0.13), (i * 0.2, fy, z), INK, rot=(0, 0, 0.6))
    for c in (0, 2, 4):
        x, y = sock(g, c, 0)
        strip(m, (x, y), (x, y + 0.95), 0.12, z, 0.12, IRON)
        m.box((0.26, 0.2, 0.18), (x, y + 1.0, z + 0.04), STEEL)
        m.box((0.2, 0.06, 0.12), (x, y + 1.11, z + 0.04), LAMP, glow=True)
    # rear vanes in the bare back corners, in the livery, with a pipe to each
    for s in (1, -1):
        x, y = sock(g, 0 if s < 0 else 4, 3)
        poly(m, [(x - 0.3 * s, y + 0.35), (x + 0.25 * s, y + 0.2), (x + 0.35 * s, y - 0.4), (x - 0.05 * s, y - 0.25)], 0.04, 0.16, A, inset=0.85)
        m.box((0.3, 0.08, 0.02), (x + 0.02 * s, y - 0.05, 0.17), tone(B, 0.85), rot=(0, 0, -0.4 * s))
        strip(m, (x - 0.3 * s, y + 0.35), (x - 0.75 * s, y + 0.4), 0.08, z, 0.08, IRON)
        pipe(m, (s * 1.6, -0.75), (s * 1.6, 0.85), z - 0.1, 0.05)
    # the cockpit pod, hung in a roll cage in the gap at the back
    x, y = sock(g, 2, 3)
    m.cyl(0.32, 0.14, (x, y, -0.08), PAD, segs=8)
    strip(m, (x - 0.8, y), (x + 0.8, y), 0.08, z - 0.06, 0.08, IRON_D)
    canopy(m, (x, y, 0.34), (0.26, 0.28, 0.24), bar=IRON_D)
    for dx, dy in ((-0.3, -0.3), (0.3, -0.3), (-0.3, 0.3), (0.3, 0.3)):
        m.box((0.06, 0.06, 0.62), (x + dx, y + dy, 0.31), STEEL)
    ring(m, 0.42, 0.62, 0.06, STEEL, n=8, w=0.06, cx=x, cy=y)
    m.box((0.08, 0.08, 0.08), (x, y + 0.42, 0.68), LAMP, glow=True)
    m.build(root)


FRAME_BUILDERS = {"kestrel": kestrel, "mule": mule, "wasp": wasp, "hammer": hammer, "lattice": lattice}


# --- pickups ---------------------------------------------------------------------------------------

def pickup_part():
    root = group("pickup_part", kind="pickup_part")
    m = Model("crate")
    m.box((1.2, 0.9, 0.7), (0, 0, 0.35), "#6a7078")
    m.box((1.24, 0.94, 0.12), (0, 0, 0.06), DARK)
    m.box((1.24, 0.94, 0.08), (0, 0, 0.66), "#8a9098")
    m.box((0.5, 0.4, 0.04), (-0.2, 0.05, 0.71), HAZARD)                      # salvage label
    m.box((0.2, 0.4, 0.04), (0.35, 0.05, 0.71), "#2a2c30")
    for x in (-0.35, 0.35):                                                    # glowing straps
        m.box((0.12, 0.96, 0.74), (x, 0, 0.36), "#6affb0", glow=True)
    m.box((1.26, 0.12, 0.74), (0, 0, 0.36), "#6affb0", glow=True)
    for x, y in ((-0.55, -0.4), (0.55, -0.4), (-0.55, 0.4), (0.55, 0.4)):
        m.box((0.16, 0.16, 0.76), (x, y, 0.36), STEEL)
    m.build(root)


def pickup_scrap():
    root = group("pickup_scrap", kind="pickup_scrap")
    m = Model("gear")
    m.cyl(0.15, 0.1, (0, 0, 0.0), "#b0b4ba", segs=8)
    for i in range(6):
        a = TAU * i / 6
        m.box((0.1, 0.1, 0.1), (math.cos(a) * 0.17, math.sin(a) * 0.17, 0.05), "#b0b4ba", rot=(0, 0, a))
    m.cyl(0.06, 0.12, (0, 0, 0.0), "#ffc24a", segs=6, glow=True)
    m.cyl(0.05, 0.22, (0.0, 0.0, 0.08), "#7a7e86", segs=6, rot=(0.5, 0.3, 0))   # bolt through it
    m.cyl(0.08, 0.06, (0.0, 0.0, 0.08), "#7a7e86", segs=6, rot=(0.5, 0.3, 0))
    m.build(root)


# --- the convoy's haulers --------------------------------------------------------------------------
# `hauler` (variants 0..2): the slow freighters an escort mission flies cover for, ~7 long. Skin a =
# hull paint, b = bridge and trim, c = engine and window glow (painted per hauler at runtime). What
# they carry is in fixed colours, so a convoy reads as a string of different loads: 0 stacked
# containers, 1 twin tanks, 2 an open hopper of glowing ore. Each loops `hauler_<v>_cruise_idle`.

CRATES = ["#b8502e", "#2f8a8a", "#d8a43a", "#e8dcc0", "#4f74b0", "#7a8a3a"]
NAV_GREEN = "#3ae070"


def hauler(variant: int):
    root = group(f"hauler_{variant}", kind="hauler", variant=variant)
    clip = f"hauler_{variant}_cruise_idle"
    T = 2.0
    m = Model(f"hauler_{variant}_hull", seed=300 + variant)
    # the hull: long and blunt, sloped sides, a tug's bow
    out = [(-0.95, 3.5), (-1.4, 2.8), (-1.5, -2.6), (-1.25, -3.35), (1.25, -3.35), (1.5, -2.6), (1.4, 2.8), (0.95, 3.5)]
    m.slab(out, -0.6, 0.25, A, top=[(x * 0.9, y * 0.97) for x, y in out])
    m.box((2.45, 5.6, 0.08), (0, -0.05, 0.27), DECKC)
    for s in (1, -1):
        m.box((0.14, 5.9, 0.2), (s * 1.38, -0.1, 0.22), B)                          # gunwale
        for k in range(4):
            m.box((0.12, 0.16, 0.12), (s * 1.38, 2.2 - k * 1.5, 0.36), STEEL)         # bollards
    # bow: a bumper with hazard stripes, nav lights, a searchlight
    m.box((1.7, 0.4, 0.42), (0, 3.4, 0.05), STEEL, taper=0.85)
    for k in range(4):
        m.box((0.22, 0.08, 0.3), (-0.6 + k * 0.4, 3.62, 0.1), HAZARD if k % 2 else RUBBER)
    m.box((0.2, 0.32, 0.16), (-1.36, 2.65, 0.4), RED, glow=True)
    m.box((0.2, 0.32, 0.16), (1.36, 2.65, 0.4), NAV_GREEN, glow=True)
    m.cyl(0.16, 0.18, (0, 3.1, 0.34), DARK, segs=6)
    m.box((0.22, 0.1, 0.14), (0, 3.25, 0.5), "#fff4c8", glow=True)
    # the bridge at the stern: a cab with a band of lit windows, a stack and a mast
    m.box((2.0, 1.15, 0.8), (0, -2.6, 0.66), B, taper=0.9)
    m.box((1.8, 0.14, 0.2), (0, -2.0, 0.86), C, glow=True)
    m.box((1.25, 0.85, 0.16), (0, -2.7, 1.12), A)
    m.box((0.7, 0.4, 0.1), (0.15, -2.6, 1.24), STEEL)
    m.cyl(0.2, 0.55, (-0.6, -2.95, 1.05), DARK, segs=6)
    m.cyl(0.24, 0.08, (-0.6, -2.95, 1.6), RUBBER, segs=6)
    m.cyl(0.05, 0.9, (0.62, -2.95, 1.1), STEEL, segs=5)
    m.box((0.5, 0.06, 0.06), (0.62, -2.95, 1.75), STEEL)
    # engines: two fat nacelles on pylons at the stern, intakes dark, nozzles glowing
    for s in (1, -1):
        m.box((0.45, 1.0, 0.24), (s * 1.25, -2.5, 0.0), A)
        m.cyl(0.46, 1.9, (s * 1.55, -1.5, -0.1), STEEL, segs=8, rot=BACK)
        m.cyl(0.5, 0.2, (s * 1.55, -1.7, -0.1), A, segs=8, rot=BACK)
        m.cyl(0.36, 0.06, (s * 1.55, -1.48, -0.1), DARK, segs=8, rot=FWD)
        m.cyl(0.34, 0.08, (s * 1.55, -3.38, -0.1), C, segs=8, rot=BACK, glow=True)
        m.box((0.5, 1.3, 0.12), (s * 1.75, 0.9, -0.1), B, taper=0.8)                 # side thruster pods
        m.box((0.2, 0.3, 0.1), (s * 1.95, 0.4, -0.08), C, glow=True)
    # what it carries
    if variant == 0:
        # containers, two across and three along, a fourth stacked up top
        rng_cols = [CRATES[(i * 7 + 3) % len(CRATES)] for i in range(7)]
        k = 0
        for row, y in enumerate((1.95, 0.45, -1.05)):
            for s in (1, -1):
                col = rng_cols[k]
                k += 1
                m.box((1.0, 1.36, 0.72), (s * 0.54, y, 0.67), col)
                for j in range(3):                                                   # ribs on the lid
                    m.box((0.9, 0.08, 0.04), (s * 0.54, y - 0.42 + j * 0.42, 1.05), DARK)
                m.box((0.06, 1.38, 0.74), (s * 0.04 + s * 0.02, y, 0.67), RUBBER)
        m.box((1.0, 1.36, 0.72), (0.54, 0.45, 1.4), rng_cols[6])
        for j in range(3):
            m.box((0.9, 0.08, 0.04), (0.54, 0.03 + j * 0.42, 1.78), DARK)
        m.box((0.2, 4.4, 0.06), (-1.12, 0.45, 0.72), HAZARD)                          # lashing strap
    elif variant == 1:
        # twin tanks with bands, a catwalk between, a warning placard on each
        for s in (1, -1):
            m.cyl(0.62, 4.3, (s * 0.66, 2.35, 0.95), "#d8d2c4", segs=10, rot=BACK)
            m.ball(0.62, (s * 0.66, 2.35, 0.95), "#d8d2c4", subdiv=1, scale=(1, 0.5, 1))
            m.ball(0.62, (s * 0.66, -1.95, 0.95), "#d8d2c4", subdiv=1, scale=(1, 0.5, 1))
            for j in range(4):
                m.cyl(0.65, 0.14, (s * 0.66, 1.75 - j * 1.15, 0.95), B, segs=10, rot=BACK)
            m.box((0.5, 0.5, 0.06), (s * 0.66, 0.6, 1.6), HAZARD, rot=(0, 0, math.pi / 4))
            m.box((0.24, 0.24, 0.07), (s * 0.66, 0.6, 1.62), RUBBER, rot=(0, 0, math.pi / 4))
        m.box((0.3, 4.6, 0.08), (0, 0.2, 1.55), DECKP)
        for j in range(6):
            m.box((0.04, 0.04, 0.3), (0.16, 2.2 - j * 0.85, 1.7), STEEL)
        m.cyl(0.12, 0.5, (0, 2.6, 0.3), STEEL, segs=6)                                # filler pipe
    else:
        # an open hopper heaped with ore that glows, and a crane to load it
        m.box((2.3, 4.2, 0.12), (0, 0.4, 0.35), DARK)
        for s in (1, -1):
            m.box((0.16, 4.3, 0.8), (s * 1.1, 0.4, 0.7), A.shade(0.8))
        for y in (2.5, -1.7):
            m.box((2.36, 0.16, 0.8), (0, y, 0.7), A.shade(0.8))
        ore = ["#5a4a6a", "#6a5a7a", "#4a3e58"]
        for j in range(22):
            x = m.rng.uniform(-0.85, 0.85)
            y = m.rng.uniform(-1.4, 2.2)
            m.ball(m.rng.uniform(0.25, 0.42), (x, y, 0.7 + m.rng.uniform(0, 0.3)), ore[j % 3], subdiv=0, jitter=0.06)
        for j in range(7):
            x = m.rng.uniform(-0.75, 0.75)
            y = m.rng.uniform(-1.2, 2.0)
            m.box((0.16, 0.16, 0.6), (x, y, 1.05), "#7af0ff", rot=(m.rng.uniform(-0.5, 0.5), m.rng.uniform(-0.5, 0.5), 0), glow=True)
        m.box((0.24, 0.24, 1.1), (1.2, -1.95, 0.9), HAZARD)
        m.box((0.16, 2.4, 0.16), (1.0, -0.8, 1.45), HAZARD, rot=(-0.25, 0, 0.25))
        m.box((0.05, 0.05, 0.7), (0.72, 0.35, 1.25), STEEL)
    body = m.build(root)
    # the engines' flames, flickering; a beacon turning on the bridge roof
    for s in (1, -1):
        f = Model(f"hauler_{variant}_flame_{'r' if s > 0 else 'l'}")
        f.cyl(0.3, 1.2, (0, 0, 0), C, segs=6, r_top=0.0, rot=BACK, glow=True)
        obj = f.build(body, loc=(s * 1.55, -3.42, -0.1))
        keys = [(t * T / 16, (0, (0.35 if (t + (s > 0)) % 2 else -0.15), 0)) for t in range(17)]
        keys[-1] = (T, keys[0][1])
        animate(obj, clip, "scale", keys)
    b = Model(f"hauler_{variant}_beacon")
    b.box((0.34, 0.12, 0.14), (0.12, 0, 0), "#ffb03a", glow=True)
    b.cyl(0.1, 0.16, (0, 0, -0.08), DARK, segs=6)
    beacon = b.build(body, loc=(0.15, -2.6, 1.38))
    spin(beacon, clip, T, turns=2)
    # a slow roll on the swell of the air
    animate(body, clip, "rotation_euler", [(0, (0, 0, 0)), (T / 4, (0, 0.025, 0)), (T * 3 / 4, (0, -0.025, 0)), (T, (0, 0, 0))])
    animate(body, clip, "location", [(0, (0, 0, 0)), (T / 2, (0, 0, 0.06)), (T, (0, 0, 0))])


# --- build ----------------------------------------------------------------------------------------

def build():
    for pid, fn in PARTS.items():
        root = group(f"part_{pid}", kind=f"part_{pid}")
        fn(root, True)
    for fid, fn in FRAME_BUILDERS.items():
        root = group(f"frame_{fid}", kind=f"frame_{fid}")
        fn(root)
    pickup_part()
    pickup_scrap()
    for v in range(3):
        hauler(v)
    if "--preview" in sys.argv or os.environ.get("SHIPS_DEMO"):
        for fid, fn in FRAME_BUILDERS.items():
            root = group(f"demo_{fid}", kind=f"demo_{fid}")
            fn(root)
            parts = START[fid]
            extra = os.environ.get("SHIPS_DEMO_FULL")
            if extra:
                parts = {"builds": BUILDS, "marks": MARKS}.get(extra, FULL).get(fid, parts)
            for pid, c, r in parts:
                x, y = sock(FRAMES[fid], c, r)
                s = group(f"demo_{fid}_{pid}", loc=(x, y, DECK), parent=root)
                PARTS[pid](s, False)


# fuller loadouts, for previews of a ship covered in parts (SHIPS_DEMO_FULL=1)
FULL = {
    "kestrel": [('rail', 1, 0), ('arc', 0, 1), ('seeker', 2, 1), ('amp', 0, 2), ('reactor', 1, 2),
                ('shield', 2, 2), ('thruster', 0, 3), ('thruster', 2, 3)],
    "mule": [('rivet', 0, 0), ('flak', 1, 0), ('scatter', 3, 0), ('torch', 4, 0), ('targeter', 0, 1),
             ('plate', 1, 1), ('reactor', 2, 1), ('capacitor', 3, 1), ('magnet', 4, 1),
             ('vector', 1, 2), ('thruster', 2, 2), ('mine', 3, 2)],
    "wasp": [('ion', 0, 0), ('rivet', 2, 0), ('sink', 2, 1), ('drone', 0, 2), ('reactor', 1, 2),
             ('grazer', 2, 2), ('thruster', 0, 3), ('thruster', 1, 3), ('thruster', 2, 3)],
    "hammer": [('scatter', 0, 0), ('scatter', 1, 0), ('scatter', 2, 0), ('scatter', 3, 0),
               ('plate', 0, 1), ('bombbay', 1, 1), ('overdrive', 2, 1), ('plate', 3, 1),
               ('phasedrive', 2, 3), ('emp', 2, 2), ('burner', 1, 2)],
    "lattice": [('rail', 0, 0), ('rivet', 2, 0), ('rail', 4, 0), ('capacitor', 0, 1), ('amp', 2, 1),
                ('sink', 4, 1), ('reactor', 2, 2), ('thruster', 1, 3), ('thruster', 3, 3)],
}


# the builds parts (dash mods, aux, passives, duos) on every frame (SHIPS_DEMO_FULL=builds)
BUILDS = {
    "kestrel": [('sentry', 1, 0), ('parry', 0, 1), ('ghost', 1, 1), ('trigger', 2, 1), ('spring', 1, 2),
                ('recoil', 2, 2), ('thruster', 0, 3), ('wake', 2, 3)],
    "mule": [('ram', 0, 0), ('lance', 1, 0), ('sentry', 2, 0), ('stormlens', 3, 0), ('rivet', 4, 0),
             ('flare', 0, 1), ('tether', 2, 1), ('echo', 3, 1), ('mirror', 4, 1)],
    "wasp": [('rivet', 0, 0), ('rivet', 2, 0), ('flare', 0, 1), ('blink', 2, 1), ('throttle', 0, 2),
             ('reactor', 1, 2), ('ghost', 2, 2), ('thruster', 0, 3), ('thruster', 1, 3), ('thruster', 2, 3)],
    "hammer": [('scatter', 0, 0), ('ram', 1, 0), ('ram', 2, 0), ('scatter', 3, 0), ('slag', 0, 1),
               ('exchanger', 2, 1), ('salvage', 3, 1), ('siphon', 1, 2), ('gambler', 2, 2), ('blink', 2, 3)],
    "lattice": [('rail', 0, 0), ('sentry', 2, 0), ('rail', 4, 0), ('elbow', 0, 1), ('skin', 2, 1),
                ('throttle', 4, 1), ('reactor', 2, 2), ('shield', 3, 2), ('conduit', 4, 2), ('thruster', 1, 3),
                ('thruster', 3, 3)],
}


# the marks parts: the boosters that mark, and what plays on marks (SHIPS_DEMO_FULL=marks)
MARKS = {
    "kestrel": [('breach', 1, 0), ('torch', 0, 1), ('flaw', 1, 1), ('arc', 2, 1), ('incend', 0, 2),
                ('catalyst', 1, 2), ('tesla', 2, 2), ('thruster', 0, 3), ('thruster', 2, 3)],
}
