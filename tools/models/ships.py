"""The player ships: four frames (hull + cockpit) and the parts that bolt onto their socket grids,
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


# --- frames ---------------------------------------------------------------------------------------

FRAMES = {
    "kestrel": ['.#.', '###', '###', '#.#'],
    "mule": ['#####', '#####', '.###.'],
    "wasp": ['#.#', '#.#', '###', '###'],
    "hammer": ['####', '####', '.##.', '.##.'],
}

START = {
    "kestrel": [('rivet', 1, 0), ('thruster', 0, 3), ('thruster', 2, 3), ('reactor', 1, 2)],
    "mule": [('rivet', 1, 0), ('rivet', 3, 0), ('thruster', 2, 2), ('plate', 2, 1)],
    "wasp": [('rivet', 0, 0), ('rivet', 2, 0), ('thruster', 1, 3), ('reactor', 1, 2)],
    "hammer": [('scatter', 1, 0), ('scatter', 2, 0), ('thruster', 1, 3), ('thruster', 2, 3)],
}


def sock(grid, c, r):
    cols, rows = len(grid[0]), len(grid)
    return (c - (cols - 1) / 2) * CELL, ((rows - 1) / 2 - r) * CELL


def decks(m: Model, grid, top=DECK, h=0.08):
    """A painted deck plate under every socket (top at z = 0.3), with a dark mount hatch and bolts."""
    for r, row in enumerate(grid):
        for c, ch in enumerate(row):
            if ch != '#':
                continue
            x, y = sock(grid, c, r)
            m.box((0.74, 0.74, h), (x, y, top - h / 2), DECKP, taper=0.94)
            m.box((0.36, 0.36, 0.02), (x, y, top), STEEL)
            m.box((0.22, 0.22, 0.03), (x, y, top + 0.005), DARK)
            for dx, dy in ((-0.28, -0.28), (0.28, -0.28), (-0.28, 0.28), (0.28, 0.28)):
                m.box((0.07, 0.07, 0.02), (x + dx, y + dy, top), B)    # corner bolts


def canopy(m: Model, loc, size, color=GLASS):
    """A faceted bubble canopy that glows faintly, with a cream frame bar."""
    x, y, z = loc
    sx, sy, sz = size
    m.ball(1.0, (x, y, z), color, subdiv=1, scale=(sx, sy, sz), glow=True)
    m.box((0.07, sy * 1.6, 0.06), (x, y, z + sz * 0.92), B)


def kestrel(root):
    g = FRAMES["kestrel"]
    m = Model("kestrel_hull")
    # needle fuselage: from a long nose to a tail spike, under the centre column
    fus = [(0, 2.7), (-0.2, 2.2), (-0.42, 1.4), (-0.46, -1.0), (-0.32, -2.1), (0.32, -2.1), (0.46, -1.0), (0.42, 1.4), (0.2, 2.2)]
    m.slab(fus[::-1], 0.0, 0.24, A, top=[(x * 0.8, y * 0.97) for x, y in fus[::-1]])
    m.slab([(x * 0.6, y * 0.95) for x, y in fus[::-1]], -0.16, 0.0, DARK)
    # thin swept wings under the side sockets (rows 1-2) and the engine booms (row 3)
    for s in (1, -1):
        wing = [(0.4, 1.3), (1.28, 0.84), (1.5, -0.6), (1.66, -1.95), (1.24, -1.7), (0.42, -1.4)]
        wing = [(s * x, y) for x, y in wing]
        if s < 0:
            wing = wing[::-1]
        m.slab(wing, 0.06, 0.22, A)
        m.box((0.12, 1.6, 0.06), (s * 1.38, 0.0, 0.2), B, rot=(0, 0, s * 0.05))   # wing-edge stripe
        m.box((0.12, 0.7, 0.36), (s * 1.42, -0.35, 0.36), B, taper=0.5)          # wingtip fin
        m.box((0.06, 0.2, 0.06), (s * 1.42, 0.0, 0.5), C, glow=True)             # nav light
    # racing stripes down the nose
    for s in (1, -1):
        m.box((0.08, 1.0, 0.03), (s * 0.12, 2.0, 0.22), B, rot=(0, 0, s * 0.18))
    m.cyl(0.03, 0.6, (0, 2.6, 0.12), METAL, segs=4, rot=FWD)                  # pitot needle
    m.ball(0.05, (0, 3.2, 0.12), C, subdiv=0, glow=True)
    # cockpit: in the gap between the two engines at the back
    x, y = sock(g, 1, 3)
    m.box((0.62, 1.0, 0.3), (x, y - 0.1, 0.15), A, taper=0.85)
    canopy(m, (x, y - 0.05, 0.32), (0.24, 0.42, 0.24))
    m.box((0.5, 0.1, 0.16), (x, y - 0.6, 0.3), B)                            # headrest
    decks(m, g)
    m.build(root)


def mule(root):
    g = FRAMES["mule"]
    m = Model("mule_hull")
    hull = [(-2.04, -1.2), (2.04, -1.2), (2.12, 1.1), (1.9, 1.32), (-1.9, 1.32), (-2.12, 1.1)]
    m.slab(hull, -0.1, 0.24, A, top=[(x * 0.98, y * 0.98) for x, y in hull])
    m.slab([(x * 0.9, y * 0.88) for x, y in hull], -0.34, -0.1, DARK)
    # side rails / bumpers and a cargo stripe along each side
    for s in (1, -1):
        m.box((0.14, 2.3, 0.3), (s * 2.12, 0.05, 0.1), B)
        for y in (0.7, -0.1, -0.9):
            m.box((0.16, 0.12, 0.32), (s * 2.14, y, 0.1), HAZARD if y == -0.1 else STEEL)
    # front bumper with hazard chevrons
    m.box((3.6, 0.2, 0.26), (0, 1.38, 0.06), STEEL)
    for i in range(-3, 4):
        if i:
            m.box((0.18, 0.06, 0.2), (i * 0.48, 1.49, 0.07), HAZARD, rot=(0, 0, 0.5))
    # truck cab cockpit in front of the middle of row 0 (between its sockets' front edges)
    x, y = sock(g, 2, 0)
    m.box((1.1, 0.7, 0.36), (x, y + 0.86, 0.18), A, taper=0.85)
    m.box((1.12, 0.16, 0.38), (x, y + 0.58, 0.2), B)
    canopy(m, (x, y + 0.98, 0.38), (0.42, 0.28, 0.18))
    for s in (1, -1):                                                         # headlights
        m.box((0.14, 0.06, 0.1), (s * 0.42, y + 1.22, 0.2), "#fff0c0", glow=True)
    # rear corners: fixed fuel tanks and tail lights (no sockets there)
    for s in (1, -1):
        x, y = sock(g, 0 if s < 0 else 4, 2)
        m.cyl(0.24, 0.66, (x, y + 0.3, 0.3), B, segs=6, rot=BACK)
        m.cyl(0.25, 0.08, (x, y + 0.1, 0.3), STEEL, segs=6, rot=BACK)
        m.cyl(0.25, 0.08, (x, y - 0.18, 0.3), STEEL, segs=6, rot=BACK)
        m.box((0.3, 0.08, 0.1), (x, y - 0.42, 0.12), RED, glow=True)
    decks(m, g)
    m.build(root)


def wasp(root):
    g = FRAMES["wasp"]
    m = Model("wasp_hull")
    # the body: rows 2 and 3, all three columns
    body = [(-1.26, -1.68), (1.26, -1.68), (1.3, 0.0), (1.0, 0.2), (-1.0, 0.2), (-1.3, 0.0)]
    m.slab(body, -0.04, 0.24, A, top=[(x * 0.96, y * 0.96) for x, y in body])
    m.slab([(x * 0.8, y * 0.85) for x, y in body], -0.24, -0.04, DARK)
    m.box((2.4, 0.14, 0.04), (0, -1.0, 0.25), B)
    # two long booms under the prongs (columns 0 and 2), with intakes at the front
    for s in (1, -1):
        x = s * 0.8
        m.cyl(0.34, 2.2, (x, -0.3, -0.1), DARK, segs=8, r_top=0.3, rot=FWD)
        m.box((0.8, 1.9, 0.12), (x, 0.8, 0.18), A)                         # flat boom deck
        m.cyl(0.37, 0.14, (x, 1.5, 0.0), B, segs=8, rot=FWD)              # stripe
        m.cyl(0.33, 0.4, (x, 1.9, -0.06), DARK, segs=8, r_top=0.42, rot=FWD)  # big intake
        ring(m, 0.36, -0.06, 0.08, C, n=8, w=0.08, glow=True, cx=x, cy=2.3, axis="y")
        m.cyl(0.3, 0.03, (x, 2.24, -0.06), "#202024", segs=8, rot=FWD)
        m.cyl(0.12, 0.2, (x, 2.1, -0.06), STEEL, segs=6, r_top=0.02, rot=FWD)   # intake cone
        m.box((0.08, 0.5, 0.5), (x + s * 0.36, 1.1, 0.2), B, taper=0.5)   # outer fins
        m.box((0.16, 0.16, 0.36), (x - s * 0.3, 1.84, 0.3), STEEL)        # binder posts
        m.box((0.12, 0.12, 0.08), (x - s * 0.3, 1.84, 0.5), C, glow=True)
    # the energy binder between the prong tips, podracer style
    m.box((0.98, 0.07, 0.06), (0, 1.84, 0.48), C, glow=True)
    # cockpit pod in the open middle, between the prongs
    m.slab([(-0.3, 0.0), (0.3, 0.0), (0.32, 0.9), (0.14, 1.46), (-0.14, 1.46), (-0.32, 0.9)], -0.02, 0.24, A,
           top=[(-0.22, 0.04), (0.22, 0.04), (0.24, 0.9), (0.1, 1.4), (-0.1, 1.4), (-0.24, 0.9)])
    m.box((0.08, 1.2, 0.04), (0, 0.8, 0.26), B)
    canopy(m, (0, 0.62, 0.3), (0.2, 0.38, 0.2))
    for s in (1, -1):                                                         # struts to the booms
        m.box((0.6, 0.12, 0.08), (s * 0.5, 0.3, 0.12), STEEL)
    decks(m, g)
    m.build(root)


def hammer(root):
    g = FRAMES["hammer"]
    m = Model("hammer_hull")
    # the wide armoured head (rows 0-1) flaring into eye pods
    head = [(-2.1, 0.0), (-1.7, -0.12), (1.7, -0.12), (2.1, 0.0), (2.2, 1.0), (1.8, 1.7), (-1.8, 1.7), (-2.2, 1.0)]
    m.slab(head, -0.06, 0.24, A, top=[(x * 0.97, y * 0.97 + 0.02) for x, y in head])
    m.slab([(x * 0.85, y * 0.9) for x, y in head], -0.3, -0.06, DARK)
    # armour lip along the front: thick angled plates
    for i, x in enumerate((-1.45, -0.5, 0.5, 1.45)):
        w = 0.9 if abs(x) < 1 else 0.95
        m.box((w, 0.3, 0.34), (x, 1.72, 0.1), B if i in (0, 3) else STEEL, rot=(0.0, 0, (-0.08 if x < 0 else 0.08) * (abs(x) > 1)), taper=0.8)
    # eye pods at the ends of the head
    for s in (1, -1):
        m.cyl(0.3, 0.42, (s * 2.05, 0.6, -0.06), B, segs=6)
        m.ball(0.16, (s * 2.1, 0.68, 0.36), C, subdiv=0, glow=True)
        m.box((0.2, 0.9, 0.12), (s * 1.95, 0.6, 0.28), A)
    # slim tail (rows 2-3, columns 1-2)
    tail = [(-0.86, -1.92), (0.86, -1.92), (0.92, -0.05), (-0.92, -0.05)]
    m.slab(tail, -0.02, 0.24, A, top=[(x * 0.95, y) for x, y in tail])
    m.slab([(x * 0.7, y * 0.95) for x, y in tail], -0.24, -0.02, DARK)
    for s in (1, -1):
        m.box((0.08, 1.4, 0.4), (s * 0.9, -1.0, 0.25), B, taper=0.5)        # tail spine fins
    # side cockpit pod off the tail's right shoulder (a smuggler's offset cockpit)
    x, y = sock(g, 3, 2)
    m.box((0.55, 0.16, 0.12), (x - 0.4, y + 0.05, 0.14), STEEL)            # access tube
    m.cyl(0.36, 0.3, (x + 0.05, y - 0.05, 0.0), A, segs=7)
    m.cyl(0.32, 0.06, (x + 0.05, y - 0.05, 0.3), B, segs=7)
    canopy(m, (x + 0.05, y + 0.02, 0.34), (0.22, 0.26, 0.18))
    # the left shoulder carries a fixed sensor mast (balance the cockpit)
    x, y = sock(g, 0, 2)
    m.cyl(0.22, 0.24, (x + 0.1, y, 0.0), STEEL, segs=6)
    m.cyl(0.05, 0.4, (x + 0.1, y, 0.24), METAL, segs=4)
    m.ball(0.07, (x + 0.1, y, 0.66), RED, subdiv=0, glow=True)
    m.box((0.5, 0.14, 0.08), (x - 0.25, y + 0.05, 0.14), STEEL)
    decks(m, g)
    m.build(root)


FRAME_BUILDERS = {"kestrel": kestrel, "mule": mule, "wasp": wasp, "hammer": hammer}


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
    if "--preview" in sys.argv or os.environ.get("SHIPS_DEMO"):
        for fid, fn in FRAME_BUILDERS.items():
            root = group(f"demo_{fid}", kind=f"demo_{fid}")
            fn(root)
            parts = START[fid]
            extra = os.environ.get("SHIPS_DEMO_FULL")
            if extra:
                parts = FULL.get(fid, parts)
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
}
