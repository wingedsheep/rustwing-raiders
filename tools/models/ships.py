"""The player ships: three frames (hull + cockpit) and the parts that bolt onto their socket grids,
plus the pickups.

Conventions (shared with src/game/parts.ts and the runtime):
- `frame_<id>`: root empty at the origin; the socket grid is centred on it. CELL = 0.8, row 0 at
  the front (+y). Socket (c, r) centre: x = (c - (cols-1)/2) * 0.8, y = ((rows-1)/2 - r) * 0.8.
  Every '#' socket has a deck plate whose top is z = 0.3 (where parts sit). The cockpit never
  sits on a socket.
- `part_<id>`: root empty at the centre of its cell [0,0], standing on z = 0. Extra cells go +x
  (column offset) and -y (row offset). Guns point +y, engines blow towards -y.
- Liveries: Skin a = hull paint, b = trim, c = accent glow. Metal and rubber are fixed colours.
- `pickup_part` (salvage crate), `pickup_scrap` (a bent tin coin), `pickup_scrap_big` (two wired
  together) and `pickup_repair` (a riveted patch).
- `demo_<frame>`: an assembled ship with its start parts, for previews only (built when the
  command line has --preview, or SHIPS_DEMO=1).
"""
from __future__ import annotations

import math
import os
import sys

import bpy

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
    # the Catch Coil: a gold-lined catcher's crescent, wound in copper, opening forward
    m = Model("magnet")
    base(m)
    m.cyl(0.24, 0.1, (0, 0, 0.08), A, segs=8, r_top=0.2)
    m.cyl(0.08, 0.2, (0, 0, 0.16), STEEL, segs=6)
    m.build(P)
    k = Model("magnet_crescent")
    n, r, step = 9, 0.27, 0.48
    for i in range(n):                                                      # the crescent, open to +y
        a = math.pi * 1.5 + (i - (n - 1) / 2) * step
        x, y = math.cos(a) * r, math.sin(a) * r + 0.04
        end = i in (0, n - 1)
        k.box((0.14, 0.15, 0.18 if end else 0.16), (x, y, 0.0), B if end else A, rot=(0, 0, a + math.pi / 2))
        k.box((0.04, 0.16, 0.05), (math.cos(a) * (r - 0.075), math.sin(a) * (r - 0.075) + 0.04, 0.05), "#ffd060",
              rot=(0, 0, a + math.pi / 2), glow=True)                       # its gold lining
    for i in (2, 4, 6):                                                     # copper windings
        a = math.pi * 1.5 + (i - (n - 1) / 2) * step
        k.box((0.18, 0.06, 0.2), (math.cos(a) * r, math.sin(a) * r + 0.04, 0.0), COPPER, rot=(0, 0, a + math.pi / 2))
    k.ball(0.08, (0, 0.06, 0.06), "#ffe890", subdiv=0, glow=True)          # a caught shot in its mouth
    o = k.build(P, loc=(0, 0, 0.34))
    if anim:
        animate(o, "part_magnet_turn_idle", "rotation_euler",
                [(0, (0, 0, 0)), (1.0, (0, 0, 0.35)), (2.0, (0, 0, 0)), (3.0, (0, 0, -0.35)), (4.0, (0, 0, 0))])


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
    # Graze Fins: thin swept blades fanned out to either side, their leading edges lit for near-misses
    m = Model("grazer")
    base(m)
    m.box((0.26, 0.56, 0.2), (0, -0.02, 0.16), A, taper=0.7)               # the spine
    m.box((0.08, 0.5, 0.06), (0, -0.02, 0.27), B)
    m.cyl(0.07, 0.14, (0, 0.26, 0.2), STEEL, segs=6, r_top=0.02, rot=FWD)
    lamp(m, 0, -0.2, 0.26, DASHG, r=0.045)
    m.build(P)
    for s in (-1, 1):
        k = Model(f"grazer_fins_{'l' if s < 0 else 'r'}")
        for i, y in enumerate((0.22, 0.04, -0.14)):
            z = 0.06 - i * 0.04
            root, tip = (0, y), (s * 0.3, y - 0.2 - i * 0.02)
            strip(k, root, tip, 0.1, z, 0.03, CHROME if i != 1 else B)
            lead = (s * 0.32, y - 0.15 - i * 0.02)
            strip(k, (0, y + 0.05), lead, 0.03, z + 0.02, 0.025, DASHG, glow=True)
        k.box((0.08, 0.5, 0.1), (s * 0.02, 0.02, 0.0), STEEL)                 # their hinge
        o = k.build(P, loc=(s * 0.14, 0, 0.24))
        if anim:
            animate(o, "part_grazer_flick_idle", "rotation_euler",
                    [(0, (0, 0, 0)), (0.12, (0, s * 0.2, s * 0.14)), (0.3, (0, 0, 0)), (0.42, (0, s * 0.1, s * 0.06)),
                     (0.6, (0, 0, 0)), (1.8, (0, 0, 0))])


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
    # the Echo Coil: a brass bell, mouth up, on a coiled stem, ringing out rings
    m = Model("echo")
    base(m)
    m.cyl(0.29, 0.12, (0, 0, 0.08), A, segs=8, r_top=0.24)
    m.cyl(0.07, 0.2, (0, 0, 0.18), STEEL, segs=6)
    helix(m, 0.12, 0.22, 0.32, 1.5, COPPER, w=0.06, n=8)                       # the coil round its neck
    m.cyl(0.08, 0.26, (0, 0, 0.3), BRASS, segs=8, r_top=0.29)                # the bell, flaring up
    m.cyl(0.3, 0.05, (0, 0, 0.55), "#e8c070", segs=8)                         # its lip
    m.cyl(0.23, 0.02, (0, 0, 0.585), DARK, segs=8)                            # the throat
    m.cyl(0.09, 0.03, (0, 0, 0.59), PASSG, segs=6, glow=True)                 # the tone in it
    for s in (-1, 1):
        m.box((0.08, 0.1, 0.28), (s * 0.27, 0, 0.24), B, rot=(0, s * 0.35, 0))   # struts
    m.build(P)
    for i, (z, r) in enumerate(((0.64, 0.3), (0.72, 0.36), (0.8, 0.42))):    # the rings it echoes
        k = Model(f"echo_ring_{i}")
        ring(k, r, 0, 0, PASSG if i != 1 else "#f0e0ff", n=8, w=0.04, h=0.03, glow=True)
        o = k.build(P, loc=(0, 0, z))
        if anim:
            d = 0.22 * i
            animate(o, "part_echo_ping_idle", "scale",
                    [(0, (-0.9, -0.9, 0)), (0.2 + d, (-0.9, -0.9, 0)), (0.5 + d, (0, 0, 0)), (0.62 + d, (-0.9, -0.9, 0)), (1.6, (-0.9, -0.9, 0))])


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
    # the Spark Gap: two electrodes on insulator stacks with an arc jumping between, coupled to every side
    m = Model("conduit")
    base(m)
    conduit_run(m, (-0.4, 0), (0.4, 0))                                         # out to every side
    for s in (-1, 1):
        m.box((0.18, 0.24, 0.12), (0, s * 0.28, 0.1), STEEL)
    m.box((0.56, 0.36, 0.14), (0, 0, 0.14), "#4a4060", taper=0.85)             # the insulating block
    m.box((0.2, 0.37, 0.02), (0, 0, 0.215), DARK)
    for s in (-1, 1):
        x = s * 0.27
        m.cyl(0.07, 0.3, (x, 0, 0.18), "#e8e0d0", segs=8)                        # insulator post
        for i in range(3):
            m.cyl(0.14 - i * 0.02, 0.04, (x, 0, 0.22 + i * 0.08), A if i == 0 else B, segs=8)   # its sheds
        m.cyl(0.04, 0.12, (x, 0, 0.5), CHROME, segs=6, rot=(0, -s * math.pi / 2, 0))   # the rod in
        m.ball(0.09, (s * 0.16, 0, 0.5), CHROME, subdiv=1)                       # the electrode
        m.ball(0.05, (s * 0.1, 0, 0.5), "#e0d0ff", subdiv=0, glow=True)         # hot spot
    m.build(P)
    k = Model("conduit_arc")
    pts = [(-0.1, 0.0), (-0.06, 0.1), (-0.01, -0.07), (0.05, 0.09), (0.1, 0.0)]
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        L = math.hypot(x1 - x0, z1 - z0)
        a = math.atan2(z1 - z0, x1 - x0)
        k.box((L + 0.03, 0.05, 0.05), ((x0 + x1) / 2, 0, (z0 + z1) / 2), "#f8f0ff", rot=(0, -a, 0), glow=True)
        k.box((L + 0.02, 0.11, 0.03), ((x0 + x1) / 2, 0, (z0 + z1) / 2 - 0.02), SHOCKG, rot=(0, -a, 0), glow=True)
    k.ball(0.06, (0, 0, 0), "#ffffff", subdiv=0, glow=True)
    o = k.build(P, loc=(0, 0, 0.5))
    if anim:
        f = 1 / 24
        animate(o, "part_conduit_arc_idle", "scale",
                [(0, (0, 0, 0)), (2 * f, (0, 0, -2)), (3 * f, (0, 0, -1.6)), (5 * f, (0, 0, 0.4)), (6 * f, (-0.9, -0.9, -0.9)),
                 (8 * f, (-0.9, -0.9, -0.9)), (9 * f, (0, 0, -2.2)), (11 * f, (0, 0, 0.2)), (12 * f, (0, 0, -1.8)),
                 (14 * f, (0, 0, 0))])


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
    # Ram Spurs: a wedge of a mount with three spurs jutting forward, braced on shock springs
    m = Model("recoil")
    base(m)
    m.slab([(-0.32, -0.32), (0.32, -0.32), (0.32, 0.06), (0.0, 0.24), (-0.32, 0.06)], 0.08, 0.3, A,
           top=[(-0.26, -0.28), (0.26, -0.28), (0.26, 0.04), (0.0, 0.18), (-0.26, 0.04)])
    for s in (-1, 1):                                                                 # a hazard chevron on it
        strip(m, (0, 0.14), (s * 0.22, 0.0), 0.07, 0.31, 0.02, HAZARD)
        m.cyl(0.08, 0.3, (s * 0.2, -0.36, 0.2), STEEL, segs=6, rot=FWD)            # shock absorbers behind
        for y in (-0.3, -0.18):
            m.cyl(0.1, 0.04, (s * 0.2, y, 0.2), HAZARD, segs=6, rot=FWD)
    lamp(m, 0, -0.16, 0.3, "#ff9a4a", r=0.05)
    m.build(P)
    k = Model("recoil_spurs")
    k.box((0.56, 0.12, 0.16), (0, 0, 0), DARK)                                        # the spur bar
    k.cyl(0.1, 0.5, (0, 0.04, 0), CHROME, segs=6, r_top=0.0, rot=FWD)                # the long middle spur
    k.cyl(0.11, 0.06, (0, 0.05, 0), "#ff9a4a", segs=6, rot=FWD, glow=True)
    for s in (-1, 1):
        k.cyl(0.08, 0.34, (s * 0.22, 0.04, 0), METAL, segs=6, r_top=0.0, rot=(-math.pi / 2, 0, -s * 0.22))
        k.cyl(0.09, 0.05, (s * 0.22, 0.05, 0), "#ff9a4a", segs=6, rot=FWD, glow=True)
    o = k.build(P, loc=(0, 0.2, 0.22))
    if anim:
        animate(o, "part_recoil_kick_idle", "location",
                [(0, (0, 0, 0)), (1.0, (0, -0.08, 0)), (1.06, (0, 0.1, 0)), (1.3, (0, 0, 0)), (1.8, (0, 0, 0))])


# --- the edges parts: a grinding wheel that sharpens guns' crits, jets that make the dash an attack --

EDGEG = "#ffa8d8"


@part
def hone(P, anim):
    m = Model("hone")
    base(m)
    m.cyl(0.3, 0.12, (0, 0, 0.1), A, segs=8)                                       # the drive housing
    for s in (-1, 1):                                                                # spark guards, open to the guns
        m.box((0.08, 0.36, 0.18), (s * 0.3, -0.04, 0.24), DARK, taper=0.7)
    m.box((0.2, 0.12, 0.1), (0, -0.28, 0.2), STEEL)
    lamp(m, 0, -0.3, 0.26, PASSG, r=0.05)
    m.build(P)
    k = Model("hone_wheel")
    k.cyl(0.27, 0.1, (0, 0, 0), "#a8968a", segs=12)                                 # the stone, lying flat
    k.cyl(0.2, 0.02, (0, 0, 0.06), "#8a7a70", segs=12)
    k.cyl(0.07, 0.08, (0, 0, 0.06), CHROME, segs=8)                                 # its hub
    for i in range(8):                                                               # gritted rim, glinting pink
        a = TAU * i / 8
        k.box((0.1, 0.08, 0.08), (math.cos(a) * 0.27, math.sin(a) * 0.27, 0.04), EDGEG, rot=(0, 0, a), glow=True)
    for i in range(3):                                                               # spokes, to see it turn
        a = TAU * i / 3
        k.box((0.3, 0.035, 0.02), (math.cos(a) * 0.1, math.sin(a) * 0.1, 0.075), DARK, rot=(0, 0, a))
    o = k.build(P, loc=(0, 0.02, 0.2))
    if anim:
        spin(o, "part_hone_grind_idle", 0.8)


@part
def lunge(P, anim):
    m = Model("lunge")
    base(m)
    m.box((0.56, 0.4, 0.14), (0, -0.06, 0.12), A, taper=0.8)
    m.box((0.2, 0.5, 0.1), (0, 0.0, 0.22), B, taper=0.6)                             # a spine along it
    lamp(m, 0, -0.22, 0.28, DASHG, r=0.05)
    m.build(P)
    for s in (-1, 1):                                                                # two jets, swept forward
        k = Model(f"lunge_jet{'l' if s < 0 else 'r'}")
        k.cyl(0.1, 0.42, (0, 0, 0), STEEL, segs=8, rot=FWD, r_top=0.07)
        k.cyl(0.12, 0.08, (0, -0.2, 0), DARK, segs=8, rot=FWD)
        k.cyl(0.07, 0.06, (0, 0.21, 0), EDGEG, segs=8, rot=FWD, glow=True)         # hot at the mouth
        k.box((0.05, 0.2, 0.12), (s * -0.08, -0.06, 0.06), A)
        o = k.build(P, loc=(s * 0.2, 0.04, 0.3))
        o.rotation_euler = (0, 0, -s * 0.18)
        if anim:
            animate(o, "part_lunge_kick_idle", "location",
                    [(0, (0, 0, 0)), (0.9, (0, -0.1, 0)), (0.98, (0, 0.06, 0)), (1.2, (0, 0, 0)), (1.6, (0, 0, 0))])


# --- the loadout parts: a drum that feeds the heavy guns, a keel that carries the load -------------

BRASS = "#c89a48"
GRAVG = "#8affe0"


@part
def autoloader(P, anim):
    m = Model("autoloader")
    base(m)
    m.box((0.5, 0.2, 0.3), (0, -0.2, 0.2), A, taper=0.85)                          # the feed housing
    m.box((0.52, 0.06, 0.32), (0, -0.1, 0.2), B)
    m.box((0.14, 0.34, 0.1), (0.2, 0.1, 0.32), STEEL)                               # feed chute, out to the guns
    m.box((0.1, 0.06, 0.12), (0.2, 0.28, 0.32), HAZARD)
    lamp(m, -0.18, -0.24, 0.38, PASSG, r=0.05)
    m.build(P)
    k = Model("autoloader_drum")
    k.cyl(0.24, 0.3, (0, 0, 0), DARK, segs=10, rot=FWD)                            # the drum, lying along the ship
    k.cyl(0.25, 0.04, (0, 0.13, 0), METAL, segs=10, rot=FWD)
    k.cyl(0.25, 0.04, (0, -0.13, 0), METAL, segs=10, rot=FWD)
    for i in range(6):                                                               # shells in their chambers
        a = TAU * i / 6
        x, z = math.cos(a) * 0.17, math.sin(a) * 0.17
        k.cyl(0.055, 0.26, (x, 0.02, z), BRASS, segs=6, rot=FWD)
        k.cyl(0.045, 0.05, (x, 0.17, z), "#ffd88a", segs=6, rot=FWD, glow=True)     # bright tips
    o = k.build(P, loc=(-0.08, 0.06, 0.34))
    if anim:
        # it turns a chamber at a time: a click round, a rest
        keys = []
        for i in range(6):
            keys += [(i * 0.5, (0, i * TAU / 6, 0)), (i * 0.5 + 0.38, (0, i * TAU / 6, 0))]
        animate(o, "part_autoloader_feed_idle", "rotation_euler", keys + [(3.0, (0, TAU, 0))])


@part
def keel(P, anim):
    m = Model("keel")
    base(m)
    m.box((0.14, 0.6, 0.42), (0, 0, 0.26), STEEL, taper=0.55)                       # the keel blade, fore and aft
    m.box((0.16, 0.5, 0.06), (0, 0, 0.48), B)
    for y in (-0.2, 0.2):                                                            # stays to the mount
        for s in (-1, 1):
            m.box((0.04, 0.04, 0.3), (s * 0.16, y, 0.18), DARK, rot=(0, s * 0.5, 0))
    lamp(m, 0, -0.28, 0.5, PASSG, r=0.05)
    m.build(P)
    for i, (y, ph) in enumerate(((-0.14, 0.0), (0.14, 0.6))):                       # two lift rings, bobbing
        k = Model(f"keel_ring{i}")
        k.cyl(0.26, 0.04, (0, 0, 0), GRAVG, segs=12, glow=True)
        k.cyl(0.2, 0.05, (0, 0, 0), DARK, segs=12)
        o = k.build(P, loc=(0, y, 0.3))
        if anim:
            animate(o, "part_keel_lift_idle", "location",
                    [(0, (0, 0, 0)), (0.6 + ph, (0, 0, 0.08)), (1.2 + ph, (0, 0, 0)), (2.4, (0, 0, 0))])


# --- the new guns: cold, blades, a charged heavy, a harpoon; and the coolant feed -------------------

ICE = "#9ae8ff"
FROSTC = "#e4f6ff"     # frosted white
RIME = "#b4d8e8"
CHARGEG = "#d0a0ff"
SAWC = "#d8e0e8"
PINC = "#d8c0a0"


def rime(m: Model, pts, z, s=0.07):
    """Little chunks of frost, set at odd angles."""
    for i, (x, y) in enumerate(pts):
        m.box((s, s * 1.3, s * 0.7), (x, y, z), FROSTC, rot=(0.3 * i, 0.4, 0.9 * i + 0.3))


@part
def frost(P, anim):
    m = Model("frost")
    base(m)
    m.box((0.52, 0.4, 0.24), (0, -0.14, 0.18), A, taper=0.85)                      # pump housing
    m.box((0.54, 0.07, 0.26), (0, -0.02, 0.18), B)
    for x in (-0.17, 0.17):                                                           # two frosted coolant bottles
        m.cyl(0.11, 0.3, (x, -0.24, 0.3), FROSTC, segs=7)
        m.cyl(0.115, 0.05, (x, -0.24, 0.42), A, segs=7)
        m.cyl(0.07, 0.04, (x, -0.24, 0.6), ICE, segs=6, glow=True)
    m.cyl(0.085, 0.42, (0, 0.0, 0.28), METAL, segs=6, rot=FWD)                      # the barrel
    for i, y in enumerate((0.1, 0.24)):                                              # frosted cooling fins
        w = 0.42 - i * 0.06
        m.box((w, 0.06, w * 0.75), (0, y, 0.28), RIME)
        m.box((w * 0.92, 0.07, 0.05), (0, y, 0.28 + w * 0.375), FROSTC)
    m.slab([(-0.08, 0.32), (0.08, 0.32), (0.34, 0.6), (-0.34, 0.6)], 0.2, 0.36, STEEL,       # the wide fan nozzle
           top=[(-0.07, 0.33), (0.07, 0.33), (0.3, 0.58), (-0.3, 0.58)])
    m.slab([(-0.03, 0.36), (0.03, 0.36), (0.22, 0.58), (-0.22, 0.58)], 0.36, 0.38, ICE, glow=True)   # cold in its throat
    for s in (-1, 1):
        strip(m, (s * 0.07, 0.34), (s * 0.31, 0.58), 0.05, 0.37, 0.04, FROSTC)          # rimed edges
    m.box((0.7, 0.07, 0.2), (0, 0.62, 0.28), DARK)
    m.box((0.6, 0.04, 0.09), (0, 0.66, 0.28), ICE, glow=True)                        # the spray slit
    rime(m, [(-0.24, 0.02), (0.22, -0.06), (0.05, 0.46)], 0.33)
    m.build(P)
    k = Model("frost_mist")
    for x, y, r in ((-0.22, 0.0, 0.05), (0.0, 0.04, 0.06), (0.22, 0.0, 0.05)):
        k.ball(r, (x, y, 0), ICE, subdiv=0, scale=(1.4, 1, 0.6), glow=True)
    o = k.build(P, loc=(0, 0.7, 0.26))
    if anim:
        animate(o, "part_frost_mist_idle", "scale",
                [(0, (-0.3, -0.3, -0.3)), (0.5, (0.25, 0.4, 0.1)), (1.0, (-0.3, -0.3, -0.3))])
        animate(o, "part_frost_mist_idle", "location",
                [(0, (0, 0, 0)), (0.5, (0, 0.06, 0)), (1.0, (0, 0, 0))])


@part
def saw(P, anim):
    m = Model("saw")
    base(m)
    m.box((0.5, 0.3, 0.2), (0, -0.2, 0.16), A, taper=0.85)                           # the launcher breech
    m.box((0.52, 0.07, 0.22), (0, -0.3, 0.17), B)
    for s in (-1, 1):                                                                  # launch rails
        m.box((0.07, 0.62, 0.08), (s * 0.22, 0.1, 0.26), METAL)
        m.box((0.09, 0.09, 0.12), (s * 0.22, 0.42, 0.27), DARK)
        m.box((0.05, 0.05, 0.05), (s * 0.22, 0.47, 0.34), C, glow=True)
    for i in range(3):                                                                 # spare blades in the magazine
        m.cyl(0.16, 0.035, (0.0, -0.22, 0.27 + i * 0.05), SAWC if i % 2 == 0 else STEEL, segs=8)
    m.box((0.1, 0.42, 0.08), (0, 0.02, 0.36), STEEL)                                   # the arm
    m.cyl(0.07, 0.1, (0, 0.22, 0.3), DARK, segs=6)                                     # its spindle
    m.build(P)
    k = Model("saw_blade")
    k.cyl(0.29, 0.04, (0, 0, -0.02), SAWC, segs=12)
    for i in range(10):                                                                # hooked teeth
        a = TAU * i / 10
        k.box((0.11, 0.07, 0.035), (math.cos(a) * 0.3, math.sin(a) * 0.3, 0), SAWC, rot=(0, 0, a + 1.1))
    k.cyl(0.17, 0.045, (0, 0, -0.022), CHROME, segs=12)
    for i in range(3):                                                                 # cut-outs, to see it turn
        a = TAU * i / 3
        k.box((0.06, 0.15, 0.05), (math.cos(a) * 0.2, math.sin(a) * 0.2, 0), DARK, rot=(0, 0, a))
    k.box((0.1, 0.12, 0.05), (math.cos(0.5) * 0.12, math.sin(0.5) * 0.12, 0.01), HAZARD, rot=(0, 0, 0.5))
    k.cyl(0.07, 0.06, (0, 0, -0.01), DARK, segs=6)                                     # the hub
    k.cyl(0.04, 0.07, (0, 0, -0.01), C, segs=6, glow=True)
    o = k.build(P, loc=(0, 0.24, 0.44))
    if anim:
        spin(o, "part_saw_spin_idle", 0.5)


@part
def charge(P, anim):
    m = Model("charge")
    m.box((0.64, 1.42, 0.1), (0, -0.4, 0.05), DARK)
    m.box((0.58, 0.46, 0.32), (0, -0.92, 0.22), A, taper=0.85)                       # the breech block
    m.box((0.6, 0.1, 0.34), (0, -0.72, 0.22), B)
    m.box((0.18, 0.3, 0.05), (0, -0.98, 0.39), B)
    for s in (-1, 1):                                                                  # capacitor cans
        m.cyl(0.1, 0.34, (s * 0.25, -1.04, 0.1), STEEL, segs=6)
        m.cyl(0.07, 0.04, (s * 0.25, -1.04, 0.44), CHARGEG, segs=6, glow=True)
        m.box((0.07, 0.72, 0.07), (s * 0.19, -0.33, 0.4), STEEL)                     # the chamber cage
        m.box((0.07, 0.72, 0.07), (s * 0.19, -0.33, 0.16), DARK)
    m.box((0.46, 0.7, 0.08), (0, -0.33, 0.12), STEEL)
    for y in (-0.68, 0.02):
        m.cyl(0.2, 0.09, (0, y, 0.28), METAL, segs=8, rot=FWD)                       # chamber end rings
    for y in (-0.5, -0.33, -0.16):
        ring(m, 0.17, 0.28, 0.06, COPPER, n=8, w=0.05, axis="y", cy=y)              # the coils
    m.cyl(0.1, 0.76, (0, 0.1, 0.28), METAL, segs=8, rot=FWD)                         # the barrel
    m.cyl(0.13, 0.08, (0, 0.34, 0.28), DARK, segs=8, rot=FWD)
    m.cyl(0.15, 0.14, (0, 0.72, 0.28), DARK, segs=8, rot=FWD)                         # muzzle
    m.cyl(0.08, 0.02, (0, 0.86, 0.28), CHARGEG, segs=8, rot=FWD, glow=True)
    m.build(P)
    k = Model("charge_core")
    k.cyl(0.11, 0.6, (0, -0.3, 0), CHARGEG, segs=6, rot=FWD, glow=True)               # the round, charging
    k.ball(0.1, (0, 0.32, 0), "#f4e8ff", subdiv=0, scale=(1, 1.3, 1), glow=True)
    o = k.build(P, loc=(0, -0.33, 0.28))
    if anim:
        animate(o, "part_charge_hum_idle", "scale",
                [(0, (-0.35, 0, -0.35)), (2.4, (0.45, 0.04, 0.45)), (2.6, (0.55, 0.06, 0.55)), (2.75, (-0.35, 0, -0.35)),
                 (3.0, (-0.35, 0, -0.35))])


@part
def anchor(P, anim):
    m = Model("anchor")
    m.box((0.64, 1.42, 0.1), (0, -0.4, 0.05), DARK)
    for s in (-1, 1):                                                                  # the reel's cheeks
        m.box((0.08, 0.5, 0.42), (s * 0.29, -0.88, 0.26), A)
        m.cyl(0.08, 0.04, (s * 0.33, -0.88, 0.3), B, segs=6, rot=(0, s * math.pi / 2, 0))
    m.box((0.62, 0.12, 0.12), (0, -1.12, 0.14), B)
    m.box((0.36, 0.86, 0.2), (0, -0.18, 0.16), STEEL, taper=0.9)                     # the cradle
    m.cyl(0.13, 0.9, (0, -0.42, 0.36), A, segs=8, rot=FWD)                            # the launch tube
    m.cyl(0.15, 0.1, (0, 0.44, 0.36), DARK, segs=8, rot=FWD)                          # its muzzle collar
    for y in (-0.2, 0.12):
        m.cyl(0.14, 0.06, (0, y, 0.36), HAZARD, segs=8, rot=FWD)
    m.cyl(0.05, 0.24, (0, 0.5, 0.36), CHROME, segs=6, rot=FWD)                        # the spike's shaft
    m.cyl(0.13, 0.32, (0, 0.62, 0.36), PINC, segs=6, r_top=0.0, rot=FWD)              # its head
    for s in (-1, 1):
        m.box((0.05, 0.24, 0.06), (s * 0.12, 0.62, 0.36), CHROME, rot=(0, 0, s * 0.6))   # barbs, swept back
    for i in range(14):                                                               # the chain, reel to spike
        y = -0.7 + i * 0.085
        m.box((0.07 if i % 2 else 0.035, 0.11, 0.035 if i % 2 else 0.07), (0, y, 0.51), METAL if i % 2 else STEEL)
    m.build(P)
    k = Model("anchor_reel")
    k.cyl(0.19, 0.48, (-0.24, 0, 0), DARK, segs=8, rot=(0, math.pi / 2, 0))          # the drum
    for x in (-0.22, 0.18):
        k.cyl(0.26, 0.04, (x, 0, 0), B, segs=8, rot=(0, math.pi / 2, 0))             # its flanges
    for j, x in enumerate((-0.11, 0.0, 0.11)):                                       # chain wound round it
        for i in range(8):
            a = TAU * i / 8 + j * 0.39
            k.box((0.1, 0.13, 0.06) if i % 2 else (0.05, 0.13, 0.09), (x, math.cos(a) * 0.2, math.sin(a) * 0.2),
                  METAL if j % 2 == 0 else CHROME, rot=(a, 0, 0))
    k.box((0.04, 0.18, 0.06), (0.21, 0.0, 0.2), HAZARD)                              # a mark on the flange
    o = k.build(P, loc=(0, -0.88, 0.32))
    if anim:
        keys = []
        for i in range(4):
            keys += [(i * 0.6, (-i * TAU / 8, 0, 0)), (i * 0.6 + 0.25, (-(i + 1) * TAU / 8, 0, 0))]
        animate(o, "part_anchor_reel_idle", "rotation_euler", keys + [(2.4, (-TAU / 2, 0, 0))])


@part
def cryofeed(P, anim):
    m = Model("cryofeed")
    base(m)
    m.cyl(0.28, 0.1, (0, 0, 0.08), A, segs=8, r_top=0.25)                            # the collar
    m.cyl(0.19, 0.4, (0, 0, 0.16), "#c8ecfa", segs=8)                                 # the canister
    for z in (0.22, 0.44):
        m.cyl(0.205, 0.05, (0, 0, z), A, segs=8)
    m.box((0.1, 0.05, 0.22), (0, -0.19, 0.34), ICE, glow=True)                        # coolant level window
    m.cyl(0.14, 0.06, (0, 0, 0.56), STEEL, segs=8)                                    # its cap
    for s in (-1, 1):                                                                  # feed lines out to the guns
        m.box((0.12, 0.08, 0.08), (s * 0.24, 0.08, 0.18), STEEL)
        m.box((0.08, 0.2, 0.08), (s * 0.31, 0.18, 0.18), STEEL)
        m.box((0.07, 0.05, 0.07), (s * 0.31, 0.3, 0.18), ICE, glow=True)
    m.box((0.1, 0.26, 0.08), (0, 0.27, 0.12), STEEL)
    m.box((0.07, 0.05, 0.07), (0, 0.4, 0.12), ICE, glow=True)
    rime(m, [(-0.22, -0.2), (0.24, -0.16), (0.12, 0.2), (-0.14, 0.18)], 0.16, s=0.08)
    rime(m, [(0.12, -0.1), (-0.1, 0.1)], 0.58, s=0.06)
    m.build(P)
    k = Model("cryofeed_valve")
    ring(k, 0.13, 0, 0, B, n=6, w=0.045, h=0.045)                                     # the valve wheel
    k.box((0.26, 0.04, 0.04), (0, 0, 0), B)
    k.box((0.04, 0.26, 0.04), (0, 0, 0), B)
    k.cyl(0.05, 0.05, (0, 0, -0.01), ICE, segs=6, glow=True)
    o = k.build(P, loc=(0, 0, 0.64))
    if anim:
        animate(o, "part_cryofeed_valve_idle", "rotation_euler",
                [(0, (0, 0, 0)), (0.3, (0, 0, 0.8)), (1.6, (0, 0, 0.8)), (1.9, (0, 0, 0)), (3.2, (0, 0, 0))])


# --- frames ---------------------------------------------------------------------------------------
# Used-future ships, like the ones on the title art: worn plating in slightly different shades,
# chipped paint, soot, greebles, faded stripes. Each frame keeps a character of its own: the
# Kestrel an off-white racer with livery stripes, the Hammerhead a gunmetal gunship, the Magpie a
# slate catcher's crescent on a split tail.
# The livery (Skin a, b, c) goes on as paint, bands and lights, so two players on the same frame
# still tell their ships apart.

# (the same grids as FRAMES in src/game/parts.ts)
FRAMES = {
    "kestrel": ['..#..', '.###.', '.###.', '#####', '.#.#.'],
    "hammer": ['######', '######', '..##..', '..##..'],
    "magpie": ['#...#', '##.##', '#####', '.###.', '.#.#.'],
}

# what each frame starts with (the same as `start` in src/game/parts.ts)
START = {
    "kestrel": [('rivet', 1, 1), ('rivet', 3, 1), ('thruster', 1, 4), ('thruster', 3, 4)],
    "hammer": [('scatter', 2, 0), ('scatter', 3, 0), ('thruster', 2, 3), ('thruster', 3, 3)],
    "magpie": [('rivet', 1, 1), ('rivet', 3, 1), ('parry', 2, 2), ('thruster', 1, 4), ('thruster', 3, 4)],
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


# --- frame shaping -------------------------------------------------------------------------------
# Seen from above at ~8 texels a unit, a frame lives on its silhouette and a few big fields of
# colour. Hulls are chamfered slabs (the bevel catches the light as a rim), the livery goes on in
# big confident shapes (two players on one frame still tell their ships apart), and a socket is a
# mount set into the hull rather than a tile: a ship flies with most of its sockets empty.

def ccw(pts):
    area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]))
    return pts if area > 0 else pts[::-1]


def offset(pts, d):
    """The outline moved d inwards, with mitred corners."""
    pts = ccw(pts)
    out = []
    for i in range(len(pts)):
        (x0, y0), (x1, y1), (x2, y2) = pts[i - 1], pts[i], pts[(i + 1) % len(pts)]
        l1 = math.hypot(x1 - x0, y1 - y0) or 1
        l2 = math.hypot(x2 - x1, y2 - y1) or 1
        n1 = (-(y1 - y0) / l1, (x1 - x0) / l1)
        n2 = (-(y2 - y1) / l2, (x2 - x1) / l2)
        k = d / max(0.4, 1 + n1[0] * n2[0] + n1[1] * n2[1])
        out.append((x1 + (n1[0] + n2[0]) * k, y1 + (n1[1] + n2[1]) * k))
    return out


def hull(m: Model, pts, z0, z1, col, bevel=0.1, rim=None):
    """A hull plate with chamfered edges: straight sides up to z1 - bevel, then sloping in to the
    top. Returns the top outline."""
    pts = ccw(pts)
    top = offset(pts, bevel)
    m.slab(pts, z0, z1 - bevel, col)
    m.slab(pts, z1 - bevel, z1, col if rim is None else rim, top=top)
    if rim is not None:
        m.slab(top, z1 - 0.01, z1, col)
    return top


def sym(pts):
    """A half outline (right side, nose to tail) closed with its mirror image."""
    return pts + [(-x, y) for x, y in reversed(pts) if abs(x) > 1e-6]


def paint(m: Model, pts, z, col, h=0.02, glow=False):
    """A flat field of paint lying on a surface at z."""
    m.slab(ccw(pts), z, z + h, col, glow=glow)


def hatch(m: Model, x, y, z=DECK, mid=INK, bolt=None):
    """A socket's mount, on a hull whose top is at z: a dark boss with a bolt at each corner. Parts
    cover it; an empty one leaves the paint showing."""
    m.cyl(0.13, 0.02, (x, y, z), mid, segs=6)
    m.cyl(0.06, 0.02, (x, y, z + 0.015), tone(mid, 1.6) if not isinstance(mid, Skin) else mid, segs=6)
    if bolt is not None:
        for dx in (-1, 1):
            for dy in (-1, 1):
                m.box((0.08, 0.08, 0.02), (x + dx * 0.24, y + dy * 0.24, z + 0.005), bolt)


def nozzle(m: Model, x, y, z, r, col, glow, segs=8, length=0.4):
    """An exhaust bell facing -y, with a glowing throat."""
    m.cyl(r, length, (x, y, z), col, segs=segs, r_top=r * 0.82, rot=FWD)
    m.cyl(r * 1.08, 0.08, (x, y - 0.02, z), DARK, segs=segs, rot=FWD)
    m.cyl(r * 0.7, 0.04, (x, y - 0.05, z), glow, segs=segs, rot=FWD, glow=True)


# The Kestrel: a racer made of tinfoil. A long needle nose, canards, wide swept wings ending in
# drooped tip fins, twin canted tails and a teardrop canopy set far back. Off-white, worn, with
# the livery in a big chevron across the wings and a painted nose cone.
BONE = "#dcd4c0"
BONE_D = "#a8a08c"
BONE_S = "#bdb5a0"


def kestrel(root):
    g = FRAMES["kestrel"]
    m = Model("kestrel_hull", seed=3)
    # the wings, one piece under the fuselage: swept, a notch in the trailing edge
    wing = sym([(0.0, 1.75), (0.5, 1.55), (1.5, 0.45), (2.45, -0.55), (2.5, -1.3), (2.05, -1.25),
                   (1.35, -1.55), (0.95, -2.15), (0.0, -2.1)])
    m.slab(ccw([(x * 0.94, y - 0.06) for x, y in wing]), -0.12, 0.0, BONE_D)              # underside
    top = hull(m, wing, 0.0, 0.26, BONE, bevel=0.1)
    # the livery chevron down both leading edges, and a thin trim line behind it
    for s in (1, -1):
        band = [(0.5, 1.55), (1.5, 0.45), (2.45, -0.55), (2.47, -0.95), (1.45, 0.02), (0.55, 1.05)]
        paint(m, [(s * x, y) for x, y in band], 0.26, A)
        trim = [(0.58, 0.9), (1.42, -0.12), (2.47, -1.1), (2.47, -1.22), (1.4, -0.28), (0.6, 0.72)]
        paint(m, [(s * x, y) for x, y in trim], 0.26, B)
        # a dark seam across the wing and a scorched panel by the root
        strip(m, (s * 1.25, -0.5), (s * 2.3, -1.2), 0.07, 0.27, 0.02, BONE_D)
        paint(m, [(s * 0.62, -1.2), (s * 1.2, -1.2), (s * 1.12, -1.95), (s * 0.62, -2.0)], 0.26, BONE_S)
        # drooped tip fin, livery tip, nav light
        m.prism([(0, -0.5), (0.14, -0.5), (0.1, 0.32), (0.02, 0.32)], 0.75, (s * 2.52, -0.95, 0.0), A, rot=(0, 0, 0))
        m.box((0.12, 0.2, 0.1), (s * 2.53, -0.5, 0.26), C, glow=True)
        # canted twin tail fins, a livery cap, a dark leading edge
        fin = Model(f"kestrel_fin_{'r' if s > 0 else 'l'}")
        fin.prism([(0, 0), (0.95, 0), (1.15, 0.78), (0.82, 0.8)], 0.1, (0, 0, 0), BONE, rot=(0, 0, -math.pi / 2))
        fin.prism([(0.88, 0.6), (1.12, 0.6), (1.15, 0.78), (0.82, 0.8)], 0.12, (0, 0, 0), A, rot=(0, 0, -math.pi / 2))
        fin.box((0.12, 0.14, 0.42), (0, -0.06, 0.2), INK, rot=(-0.35, 0, 0))
        fin.build(root, loc=(s * 0.98, -1.95, 0.16)).rotation_euler = (0, s * 0.42, 0)
        # canards up the nose
        cn = [(0.28, 2.55), (0.95, 2.05), (1.0, 1.85), (0.3, 2.05)]
        hull(m, [(s * x, y) for x, y in cn], 0.06, 0.2, BONE, bevel=0.04)
        paint(m, [(s * 0.8, 2.13), (s * 0.95, 2.05), (s * 1.0, 1.85), (s * 0.82, 1.9)], 0.2, A)
        # intakes under the cheeks, a pipe along the flank
        m.box((0.22, 0.6, 0.2), (s * 0.55, 1.5, 0.16), STEEL, taper=0.8)
        m.box((0.16, 0.06, 0.14), (s * 0.55, 1.82, 0.17), INK)
        soot(m, s * 0.78, -2.08, 0.19, 0.3, 0.22)
    # the fuselage: a raised spine from the needle nose back to the canopy
    fus = sym([(0.0, 3.55), (0.14, 3.1), (0.34, 2.5), (0.5, 1.7), (0.52, 0.4), (0.42, -1.1),
                  (0.46, -2.0), (0.3, -2.55), (0.0, -2.7)])
    hull(m, fus, 0.0, 0.3, BONE, bevel=0.1)
    paint(m, [(0.0, 3.5), (0.13, 3.08), (0.25, 2.7), (-0.25, 2.7), (-0.13, 3.08)], 0.3, A)  # nose cone
    paint(m, [(0.25, 2.62), (0.29, 2.5), (-0.29, 2.5), (-0.25, 2.62)], 0.3, B)
    m.box((0.2, 0.36, 0.02), (0, 2.25, 0.31), INK, taper=0.6)                              # anti-glare
    m.cyl(0.03, 0.5, (0, 3.5, 0.13), CHROME, segs=4, rot=FWD)                              # pitot needle
    for s in (1, -1):
        strip(m, (s * 0.2, 2.05), (s * 0.2, 1.25), 0.1, 0.31, 0.02, A)                     # racing stripes
    # the canopy, long and low, faired back into a tail cone with a little exhaust
    x, y = sock(g, 2, 4)
    hull(m, [(-0.36, y + 0.55), (0.36, y + 0.55), (0.4, y - 0.4), (0.22, y - 1.05), (-0.22, y - 1.05), (-0.4, y - 0.4)],
         0.1, 0.42, BONE, bevel=0.08)
    canopy(m, (x, y + 0.08, 0.44), (0.24, 0.5, 0.2), bar=INK, ribs=1)
    paint(m, [(-0.2, y - 0.62), (0.2, y - 0.62), (0.14, y - 0.98), (-0.14, y - 0.98)], 0.42, A)
    nozzle(m, x, y - 1.04, 0.24, 0.13, STEEL, C, segs=6, length=0.2)
    # the sockets: panels in the skin
    for sx, sy in sockets(g):
        hatch(m, sx, sy, 0.3 if abs(sx) < 0.4 else 0.26, mid=BONE_D)
    m.build(root)
    n = Model("kestrel_nose")
    n.ball(0.07, (0, 0, 0), C, subdiv=0, glow=True)
    blink(n.build(root, loc=(0, 3.62, 0.13)), "frame_kestrel_blink_idle", 1.2)


# The Hammerhead: a gunship built to ram. A wide armoured head behind a massive ram plough with a
# scraped steel edge and heavy ribs, engine nacelles out at the head's ends, a slim tail with
# stabilisers and twin nozzles, sponsons that carry the cockpit on one side and a sensor mast on
# the other.
GUN = "#56606c"
GUN_D = "#363e4a"
GUN_L = "#76808e"
EYE = "#ff3a2a"


def hammer(root):
    g = FRAMES["hammer"]
    m = Model("hammer_hull", seed=11)
    body = sym([(0.0, 1.8), (2.35, 1.8), (2.7, 1.5), (2.7, 0.2), (2.35, -0.08), (1.0, -0.12),
                (0.75, -0.32), (0.75, -1.8), (0.55, -2.15), (0.0, -2.15)])
    m.slab(ccw([(x * 0.9, y * 0.93) for x, y in body]), -0.36, -0.06, GUN_D)
    hull(m, body, -0.06, 0.3, GUN, bevel=0.12, rim=GUN_D)
    # the ram: a heavy plough across the front, standing proud of the deck, its edge scraped bare
    ram = sym([(0.0, 3.05), (1.3, 2.73), (2.6, 2.15), (2.88, 1.83), (2.7, 1.66), (0.0, 1.66)])
    m.slab(ccw([(x * 0.96, y - 0.06) for x, y in ram]), -0.32, -0.04, GUN_D)
    hull(m, ram, -0.04, 0.46, GUN_D, bevel=0.16, rim=STEEL)
    edge = [(0.0, 2.85), (1.24, 2.55), (2.48, 2.01), (2.62, 1.81), (2.38, 1.85), (1.18, 2.35), (0.0, 2.63)]
    for s in (1, -1):
        paint(m, [(s * x, y) for x, y in edge], 0.46, CHROME)
    paint(m, [(-2.6, 1.96), (2.6, 1.96), (2.6, 1.74), (-2.6, 1.74)], 0.46, INK)              # hazard band
    for i in range(-6, 7):
        m.box((0.2, 0.28, 0.03), (i * 0.4, 1.85, 0.47), HAZARD, rot=(0, 0, 0.6))
    for x in (-1.75, -0.9, 0.0, 0.9, 1.75):                                                 # ribs
        front = 2.67 - abs(x) * 0.36
        m.box((0.2, front - 2.0, 0.12), (x, (front + 2.0) / 2, 0.5), STEEL, taper=0.8)
        m.box((0.26, 0.2, 0.16), (x, front, 0.48), METAL)
    for x, y, w in ((-1.3, 2.35, 0.3), (0.5, 2.55, 0.22), (1.9, 2.0, 0.26)):               # gouges
        strip(m, (x, y), (x - 0.06, y - 0.32), w * 0.3, 0.465, 0.01, SOOT)
    for s in (1, -1):
        # livery: a broad band across each shoulder of the head
        paint(m, [(s * 2.68, 1.2), (s * 2.68, 0.55), (s * 1.62, 0.55), (s * 1.62, 1.2)], 0.3, A)
        paint(m, [(s * 1.62, 1.12), (s * 1.62, 0.63), (s * 1.5, 0.63), (s * 1.5, 1.12)], 0.3, B)
        # engine nacelles at the head's ends, a red running light up front, a glowing nozzle behind
        x = s * 2.95
        m.cyl(0.36, 1.7, (x, 1.55, 0.08), GUN_L, segs=8, rot=BACK)
        m.cyl(0.39, 0.3, (x, 1.25, 0.08), A, segs=8, rot=BACK)
        m.cyl(0.3, 0.2, (x, 1.65, 0.08), GUN_D, segs=8, r_top=0.18, rot=FWD)
        m.box((0.2, 0.14, 0.12), (x, 1.88, 0.14), EYE, glow=True)
        m.box((0.1, 1.0, 0.1), (x, 0.65, 0.44), GUN_D)
        nozzle(m, x, -0.15, 0.08, 0.32, STEEL, C, segs=8, length=0.3)
        # vents down the tail
        vent(m, s * 0.45, -0.95, 0.3, 0.3, 0.7, 4)
        # sponsons, square and armoured
        hull(m, [(s * 0.7, -0.3), (s * 1.75, -0.4), (s * 1.85, -1.35), (s * 0.7, -1.35)], -0.12, 0.16, GUN, bevel=0.06)
        # stabilisers off the tail, livery tips
        fin = [(0.7, -1.4), (1.45, -1.95), (1.5, -2.45), (0.7, -2.1)]
        hull(m, [(s * x, y) for x, y in fin], -0.1, 0.16, GUN, bevel=0.05)
        paint(m, [(s * 1.25, -1.8), (s * 1.45, -1.95), (s * 1.5, -2.45), (s * 1.28, -2.36)], 0.16, A)
        # twin main nozzles
        nozzle(m, s * 0.32, -2.15, 0.1, 0.24, STEEL, C, segs=8, length=0.3)
        soot(m, s * 2.2, -0.1, 0.3, 0.4, 0.25)
    paint(m, [(-1.5, 1.5), (1.5, 1.5), (1.5, 0.12), (-1.5, 0.12)], 0.3, tone(GUN, 1.12), h=0.008)
    strip(m, (-2.5, 0.8), (2.5, 0.8), 0.06, 0.31, 0.01, GUN_D)
    for x in (-0.8, 0.8):
        strip(m, (x, 1.6), (x, 0.05), 0.06, 0.31, 0.01, GUN_D)
    paint(m, [(-0.18, -0.12), (0.18, -0.12), (0.18, -2.0), (-0.18, -2.0)], 0.3, A)        # spine stripe
    # the cockpit pod on the right sponson, the sensor mast on the left
    x, y = 1.28, -0.88
    m.cyl(0.42, 0.34, (x, y, 0.06), GUN_L, segs=8)
    m.cyl(0.38, 0.06, (x, y, 0.38), A, segs=8)
    m.cyl(0.3, 0.14, (x, y, 0.42), GUN_D, segs=8, r_top=0.22)
    m.box((0.4, 0.14, 0.08), (x, y + 0.16, 0.54), GLASS, glow=True)
    x, y = -1.28, -0.88
    m.cyl(0.26, 0.26, (x, y, 0.06), STEEL, segs=6)
    m.cyl(0.05, 0.6, (x, y, 0.32), METAL, segs=4)
    m.box((0.4, 0.06, 0.06), (x, y, 0.76), METAL)
    for sx, sy in sockets(g):
        hatch(m, sx, sy, mid=GUN_D, bolt=GUN_L)
    m.build(root)
    n = Model("hammer_lamp")
    n.ball(0.08, (0, 0, 0), EYE, subdiv=0, glow=True)
    blink(n.build(root, loc=(x, y, 0.96)), "frame_hammer_blink_idle", 0.9, 0.3)


# The Magpie: a catcher's crescent on a split tail. A slate dish with its horns open at the nose and
# a pale ceramic catch face round the mouth, ringed with a gold lip where the parry takes the shots
# (GUARD gold, fixed: the livery stays on the horns and tails). Emitter prongs at the horn tips, the
# cockpit tucked in where the twin tail booms split, a nozzle at the end of each boom.
MAG = "#58617a"
MAG_D = "#2e333e"
MAG_L = "#6e788a"
CERAM = "#d6d3c6"
CERAM_D = "#a9a596"
GUARD = "#ffd060"

# the crescent's half outline: the mouth's floor, its inner edge up to the horn, then the outer edge
# round the shoulder and down a tail boom to the split
MAG_MOUTH = [(0.0, 0.5), (0.22, 0.55), (0.38, 0.75), (0.44, 1.05), (0.62, 1.28), (0.98, 1.42),
             (1.18, 1.65), (1.2, 2.0), (1.08, 2.32)]
MAG_OUTER = [(1.16, 2.62), (1.55, 2.52), (1.9, 2.18), (2.08, 1.7), (2.15, 1.1), (2.12, 0.3), (1.9, -0.35), (1.42, -0.85),
             (1.24, -1.2), (1.24, -2.55), (1.12, -2.98), (0.56, -2.98), (0.42, -2.6), (0.4, -1.45), (0.0, -1.3)]


def _away(pts, i, c):
    """The unit normal at pts[i] of a polyline, on the side away from point c."""
    a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L, dx / L
    px, py = pts[i]
    if (px - c[0]) * nx + (py - c[1]) * ny < 0:
        nx, ny = -nx, -ny
    return nx, ny


def _band(pts, c, d0, d1):
    """A band along a polyline, from d0 to d1 away from c."""
    ns = [_away(pts, i, c) for i in range(len(pts))]
    near = [(x + nx * d0, y + ny * d0) for (x, y), (nx, ny) in zip(pts, ns)]
    far = [(x + nx * d1, y + ny * d1) for (x, y), (nx, ny) in zip(pts, ns)]
    return near + far[::-1]


def magpie(root):
    g = FRAMES["magpie"]
    m = Model("magpie_hull", seed=17)
    half = MAG_MOUTH + MAG_OUTER
    body = sym(half)
    m.slab(ccw([(x * 0.92, y * 0.95) for x, y in body]), -0.3, -0.04, MAG_D)              # underside
    top = hull(m, body, -0.04, 0.3, MAG, bevel=0.1, rim=MAG_D)
    mouth_c = (0.0, 1.5)
    for s in (1, -1):
        f = lambda pts: [(s * x, y) for x, y in pts]
        # the catch face: pale ceramic round the mouth, worn darker at the floor
        paint(m, f(_band(MAG_MOUTH, mouth_c, 0.1, 0.46)), 0.3, CERAM)
        paint(m, f(_band(MAG_MOUTH[:4], mouth_c, 0.1, 0.46)), 0.32, CERAM_D, h=0.01)
        # livery: a broad crescent down the outside of each horn, a trim line inside it
        horn = MAG_OUTER[1:7]
        paint(m, f(_band(horn, (0.0, 0.6), -0.14, -0.55)), 0.31, A)
        paint(m, f(_band(horn, (0.0, 0.6), -0.6, -0.68)), 0.31, B)
        # the horn tip: an emitter prong pointing into the mouth, a nav light on the outer point
        m.box((0.16, 0.46, 0.14), (s * 1.2, 2.3, 0.36), CHROME, rot=(0, 0, s * 0.9), taper=0.7)
        m.box((0.14, 0.14, 0.1), (s * 1.62, 2.42, 0.32), C, glow=True)
        # shoulder vents and a pipe run down to the tail
        vent(m, s * 1.62, -0.52, 0.3, 0.36, 0.3, 3, rot=s * 0.6)
        pipe(m, (s * 1.5, -0.2), (s * 1.12, -1.05), 0.33, 0.05)
        # the tail boom: a livery cap, a dark seam, a canted fin, a nozzle and its soot
        paint(m, f([(0.48, -2.3), (1.18, -2.3), (1.18, -2.5), (0.48, -2.5)]), 0.3, A)
        paint(m, f([(0.5, -2.55), (1.18, -2.55), (1.08, -2.9), (0.6, -2.9)]), 0.3, MAG_L)
        strip(m, (s * 0.45, -2.0), (s * 1.2, -2.0), 0.06, 0.31, 0.01, MAG_D)
        paint(m, f([(1.02, -1.2), (1.14, -1.2), (1.14, -2.25), (1.02, -2.25)]), 0.31, B)
        paint(m, f([(0.5, -1.2), (0.98, -1.2), (0.98, -1.95), (0.5, -1.95)]), 0.3, tone(MAG, 1.12), h=0.008)
        nozzle(m, s * 0.84, -2.95, 0.12, 0.24, STEEL, C, segs=8, length=0.3)
        soot(m, s * 0.84, -2.68, 0.3, 0.34, 0.2)
    # a lighter chest plate behind the mouth, and the spine: a dark keel back to the cockpit
    paint(m, [(-1.2, 0.42), (1.2, 0.42), (1.2, -0.75), (0.55, -1.15), (-0.55, -1.15), (-1.2, -0.75)], 0.3, tone(MAG, 1.18), h=0.008)
    paint(m, [(-0.16, 0.42), (0.16, 0.42), (0.16, -1.2), (-0.16, -1.2)], 0.31, MAG_D, h=0.01)
    strip(m, (-1.2, -0.4), (1.2, -0.4), 0.06, 0.315, 0.01, MAG_D)
    for sx in (-1.2, 1.2):
        strip(m, (sx, 0.42), (sx, -0.42), 0.06, 0.31, 0.01, MAG_D)
    # the cockpit, tucked in where the tail splits
    pod = sym([(0.0, -1.0), (0.3, -1.12), (0.36, -1.5), (0.24, -2.0), (0.0, -2.08)])
    hull(m, pod, 0.0, 0.42, MAG_L, bevel=0.08)
    canopy(m, (0, -1.48, 0.44), (0.2, 0.34, 0.17), bar=MAG_D, ribs=1)
    paint(m, [(-0.18, -1.86), (0.18, -1.86), (0.12, -2.02), (-0.12, -2.02)], 0.42, A)
    nozzle(m, 0, -2.06, 0.22, 0.1, STEEL, C, segs=6, length=0.16)
    for sx, sy in sockets(g):
        hatch(m, sx, sy, 0.335, mid=MAG_D)
    m.build(root)
    # the gold lip round the mouth, breathing: the parry's catcher
    lx, ly = mouth_c
    lip = Model("magpie_lip")
    for s in (1, -1):
        pts = [(s * x - lx, y - ly) for x, y in _band(MAG_MOUTH, mouth_c, 0.0, 0.0)[:len(MAG_MOUTH)]]
        for a, b in zip(pts, pts[1:]):
            strip(lip, a, b, 0.13, 0.0, 0.08, GUARD, glow=True)
        for a, b in zip(pts[1::2], pts[2::2]):
            mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
            lip.box((0.12, 0.12, 0.1), (mx, my, -0.02), CHROME)
    lip.ball(0.09, (0, 0.5 - ly - 0.02, 0.02), "#fff0b0", subdiv=0, glow=True)
    pulse(lip.build(root, loc=(lx, ly, 0.36)), "frame_magpie_lip_idle", 1.4, 0.05)
    for s in (1, -1):
        n = Model(f"magpie_lamp_{'r' if s > 0 else 'l'}")
        n.ball(0.07, (0, 0, 0), GUARD, subdiv=0, glow=True)
        blink(n.build(root, loc=(s * 1.06, 2.42, 0.46)), "frame_magpie_blink_idle", 1.1, 0.14)


FRAME_BUILDERS = {"kestrel": kestrel, "hammer": hammer, "magpie": magpie}


# --- pickups ---------------------------------------------------------------------------------------

def pickup_part():
    root = group("pickup_part", kind="pickup_part")
    m = Model("crate")
    m.box((1.2, 0.9, 0.7), (0, 0, 0.35), "#6a7078")
    m.box((1.24, 0.94, 0.12), (0, 0, 0.06), DARK)
    m.box((1.24, 0.94, 0.08), (0, 0, 0.66), "#8a9098")
    m.box((0.5, 0.4, 0.04), (-0.2, 0.05, 0.71), HAZARD)                      # salvage label
    m.box((0.2, 0.4, 0.04), (0.35, 0.05, 0.71), "#2a2c30")
    for x in (-0.35, 0.35):                                                    # chalk-white straps (what you take is white)
        m.box((0.12, 0.96, 0.74), (x, 0, 0.36), CHALK)
    m.box((1.26, 0.12, 0.74), (0, 0, 0.36), CHALK)
    for x, y in ((-0.55, -0.4), (0.55, -0.4), (-0.55, 0.4), (0.55, 0.4)):
        m.box((0.16, 0.16, 0.76), (x, y, 0.36), STEEL)
    m.build(root)


# Pickups are salvage you can sell (docs/art-direction/pickups/README.md): bare blued steel with a
# bright bevel, copper windings, chips of old hazard paint. Matte, angular and inked round, nothing round
# but small and lit from within: their bright steel and copper glow, so they shine like loot.
CHALK = "#ece6d8"
STEEL_B = "#8fabc4"           # blued steel, cool against warm grounds
STEEL_HI = "#cfdbe4"          # its worn bevels
COPPER = "#e07a3e"
COPPER_LO = "#8a3e22"
PAINT = "#f2b81e"             # old hazard paint (with black stripes: salvage, plain on any ground)
PATCH = "#2c3a36"             # a repair patch's dark tin
HEAL = "#3ef06a"              # the green +
HEAL_HI = "#c8ffd4"
HOLE = "#1a161c"


def cog(m: Model, z: float, r: float = 0.24, teeth: int = 8, turn: float = 0.0, cx: float = 0.0, cy: float = 0.0):
    """A stripped cog: blued steel, its teeth worn bright, a copper bush, a dark axle hole."""
    m.cyl(r, 0.08, (cx, cy, z), STEEL_B, segs=teeth, glow=True)
    m.cyl(r * 0.78, 0.02, (cx, cy, z + 0.08), STEEL_HI, segs=teeth, glow=True)    # the worn face
    for i in range(teeth):
        a = TAU * i / teeth + turn
        m.box((0.1, 0.11, 0.08), (cx + math.cos(a) * (r + 0.04), cy + math.sin(a) * (r + 0.04), z + 0.04),
              STEEL_HI if i % 3 else STEEL_B, rot=(0, 0, a), glow=True)
    m.cyl(r * 0.42, 0.04, (cx, cy, z + 0.08), COPPER, segs=6, glow=True)          # the bush
    m.cyl(r * 0.2, 0.03, (cx, cy, z + 0.11), HOLE, segs=6)
    m.box((0.06, r * 0.9, 0.02), (cx + r * 0.5, cy, z + 0.09), PAINT, rot=(0, 0, 0.6))  # a fleck of old paint


def nut(m: Model, z: float = 0.0, cx: float = 0.0, cy: float = 0.0):
    """A big hex nut, worn bright on its face, a dark threaded hole, a copper washer under it."""
    m.cyl(0.28, 0.035, (cx, cy, z), COPPER, segs=10, glow=True)
    m.cyl(0.25, 0.1, (cx, cy, z + 0.035), STEEL_B, segs=6, glow=True)
    m.cyl(0.21, 0.02, (cx, cy, z + 0.135), STEEL_HI, segs=6, glow=True)           # the worn face
    m.cyl(0.11, 0.03, (cx, cy, z + 0.135), HOLE, segs=8)                          # the hole
    m.box((0.06, 0.12, 0.06), (cx + 0.23, cy, z + 0.08), PAINT)                   # paint caught on a flat


def offcut(m: Model, z: float):
    """A torn offcut of hull plate in old paint, a strip of bare steel along the tear, two
    rivets, a coil of copper wire on it."""
    pts = [(-0.3, -0.18), (0.12, -0.26), (0.3, -0.08), (0.24, 0.2), (-0.08, 0.26), (-0.28, 0.1)]
    m.slab(pts, z, z + 0.05, PAINT)
    m.slab([(x * 0.95, y * 0.95) for x, y in pts], z - 0.03, z, STEEL_B)
    m.box((0.46, 0.06, 0.02), (0.05, -0.2, z + 0.05), STEEL_HI, rot=(0, 0, 0.2), glow=True)  # the tear
    for k in (-1, 1):                                                             # its hazard stripes
        m.box((0.08, 0.36, 0.012), (0.13 * k + 0.02, 0.04, z + 0.052), HOLE, rot=(0, 0, 0.7))
    for x, y in ((-0.2, 0.0), (0.18, 0.12)):
        m.cyl(0.04, 0.03, (x, y, z + 0.05), STEEL_HI, segs=6)
    for k in range(4):                                                            # the coil
        m.cyl(0.1, 0.022, (-0.02, 0.02, z + 0.05 + k * 0.028), COPPER if k % 2 else COPPER_LO, segs=8, glow=k % 2 == 1)
    m.cyl(0.05, 0.03, (-0.02, 0.02, z + 0.16), HOLE, segs=6)


def pickup_scrap():
    """Three small pieces of salvage (variants): a cog, a nut on its bolt, an offcut with a coil."""
    for v, make in enumerate((lambda m: cog(m, 0.0), lambda m: nut(m), lambda m: offcut(m, 0.0))):
        root = group("pickup_scrap", kind="pickup_scrap", variant=v)
        m = Model(f"scrap_{v}")
        make(m)
        m.build(root)


def pickup_scrap_big():
    """A bundle: a cog and a nut lashed to an offcut with a band of copper wire."""
    root = group("pickup_scrap_big", kind="pickup_scrap_big")
    m = Model("bundle")
    pts = [(-0.42, -0.22), (0.3, -0.3), (0.44, -0.02), (0.36, 0.26), (-0.18, 0.3), (-0.42, 0.08)]
    m.slab(pts, 0.0, 0.05, PAINT)
    m.slab([(x * 0.95, y * 0.95) for x, y in pts], -0.03, 0.0, STEEL_B)
    m.box((0.6, 0.06, 0.02), (0.05, -0.24, 0.05), STEEL_HI, rot=(0, 0, 0.12), glow=True)   # the tear
    for k in range(4):                                                            # hazard stripes
        m.box((0.07, 0.4, 0.012), (-0.36 + k * 0.24, 0.0, 0.052), HOLE, rot=(0, 0, 0.7))
    cog(m, 0.05, r=0.18, teeth=7, turn=0.3, cx=0.17)
    nut(m, 0.05, cx=-0.2, cy=0.03)
    m.box((0.05, 0.64, 0.24), (-0.03, 0.0, 0.1), COPPER_LO)                       # the band of wire
    m.box((0.07, 0.07, 0.05), (-0.03, 0.0, 0.24), COPPER, glow=True)              # its twist
    m.build(root)


def pickup_repair():
    """A riveted repair patch: a dark square of tin, a rivet at each corner, and a big green + on
    it, lit from within: what heals is green, and plain at a glance."""
    root = group("pickup_repair", kind="pickup_repair")
    m = Model("patch")
    m.box((0.66, 0.66, 0.07), (0, 0, 0.035), PATCH)
    m.box((0.62, 0.62, 0.03), (0, 0, -0.01), HOLE)
    for x, y in ((-0.25, -0.25), (0.25, -0.25), (-0.25, 0.25), (0.25, 0.25)):
        m.cyl(0.06, 0.06, (x, y, 0.08), STEEL_HI, segs=6)
    m.box((0.48, 0.16, 0.03), (0, 0, 0.08), HEAL, glow=True)                      # the +
    m.box((0.16, 0.48, 0.03), (0, 0, 0.08), HEAL, glow=True)
    m.box((0.3, 0.06, 0.012), (0, 0, 0.1), HEAL_HI, glow=True)                    # its hot core
    m.box((0.06, 0.3, 0.012), (0, 0, 0.1), HEAL_HI, glow=True)
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


# --- the heist's runner ----------------------------------------------------------------------------
# A heist chases a loaded freighter that's making a run for a jump point: `runner` is its hull,
# ~16 long, armoured, in its owner's colours (Skin a = plating, b = spine and trim, c = window and
# drive glow). What can be shot off it are separate templates, placed by the runtime where the hull
# has a cradle or a mount for them (RUNNER in src/sim/heist.ts must match these):
#   `runner_pod`     a strongbox (gold, so it reads as loot): three ride it, two on outriggers at
#                    (±5.1, 0.4) and one in a deck cradle at (0, -2.4). A child `runner_pod_chute`
#                    (hidden in game until it's loose) is its drogue.
#   `runner_engine`  a nacelle at (±2.35, -6.5), flame towards -y (`runner_engine_burn_idle`).
#   `runner_turret`  a twin gun on a ring at (±1.9, 2.3), barrels +y (the runtime turns it).

GOLD = "#d8a43a"
GOLD_DARK = "#9a6a22"
POD_TEAL = "#2f8a8a"


def runner():
    root = group("runner", kind="runner")
    clip = "runner_cruise_idle"
    T = 3.0
    m = Model("runner_hull", seed=410)
    # the hull: a long armoured wedge, its prow a ram, sloped flanks, a square stern
    out = [(0, 8.6), (-1.3, 7.2), (-2.4, 4.6), (-2.85, 1.6), (-2.85, -4.4), (-2.6, -6.2), (-1.6, -7.0),
           (1.6, -7.0), (2.6, -6.2), (2.85, -4.4), (2.85, 1.6), (2.4, 4.6), (1.3, 7.2)]
    m.slab(out, -0.9, 0.4, A.shade(0.75), top=[(x * 0.86, y * 0.96) for x, y in out])
    # armour bands across the back, darker between, and a lighter spine down the middle
    for k, y in enumerate((5.4, 3.0, 0.6, -1.8, -4.2)):
        w = 4.6 if y < 4 else 3.4
        m.box((w, 1.9, 0.16), (0, y, 0.46), A if k % 2 else A.shade(1.12), taper=0.92)
        m.box((w * 0.98, 0.12, 0.1), (0, y - 1.0, 0.5), DARK)
    # (the spine runs either side of the deck cradle)
    m.box((0.9, 6.6, 0.3), (0, 3.0, 0.62), B, taper=0.8)
    m.box((0.9, 2.2, 0.3), (0, -5.2, 0.62), B, taper=0.8)
    for k in range(5):
        m.box((0.5, 0.18, 0.06), (0, 5.6 - k * 1.3, 0.79), STEEL)                       # spine treads
    # a ram on the prow with hazard teeth
    m.box((1.4, 1.4, 0.5), (0, 7.6, 0.15), STEEL, taper=0.7)
    for k in range(4):
        m.box((0.24, 0.12, 0.34), (-0.45 + k * 0.3, 8.25, 0.12), HAZARD if k % 2 else RUBBER)
    # the bridge (its core): a raised cab with a band of lit windows, a sensor dish, an aerial
    m.box((2.6, 2.0, 0.9), (0, 4.4, 0.95), B, taper=0.86)
    m.box((2.2, 0.16, 0.24), (0, 5.35, 1.1), C, glow=True)
    for s in (1, -1):
        m.box((0.16, 1.2, 0.2), (s * 1.18, 4.5, 1.1), C, glow=True)
    m.box((1.8, 1.4, 0.2), (0, 4.2, 1.5), A.shade(0.9))
    m.cyl(0.42, 0.12, (0.5, 3.9, 1.6), STEEL, segs=8)
    m.cyl(0.3, 0.1, (0.5, 3.9, 1.72), DARK, segs=8)
    m.cyl(0.05, 1.1, (-0.6, 3.8, 1.6), STEEL, segs=5)
    m.box((0.5, 0.06, 0.06), (-0.6, 3.8, 2.4), STEEL)
    m.box((0.14, 0.14, 0.14), (-0.6, 3.8, 2.72), RED, glow=True)
    # outriggers for the side pods: a strut from each flank to a cradle of claws
    for s in (1, -1):
        m.box((2.6, 0.7, 0.3), (s * 3.9, 0.4, 0.05), STEEL)
        m.box((2.6, 0.2, 0.12), (s * 3.9, 0.85, 0.24), HAZARD)
        m.box((0.5, 3.6, 0.3), (s * 5.1, 0.4, -0.35), DARK)
        for y in (-0.8, 1.6):
            m.box((1.9, 0.36, 0.2), (s * 5.1, y + 0.4, -0.28), DARK)
            for cs in (1, -1):
                m.box((0.22, 0.36, 0.7), (s * 5.1 + cs * 0.92, y + 0.4, 0.1), STEEL, rot=(0, -cs * 0.35, 0))
        m.box((0.18, 0.18, 0.14), (s * 5.1 + s * 1.1, 2.4, -0.1), RED if s < 0 else NAV_GREEN, glow=True)
    # the deck cradle for the spine pod: a sunken bed with claws
    m.box((2.1, 3.5, 0.12), (0, -2.4, 0.66), DECKC)
    for y in (-3.6, -1.2):
        for cs in (1, -1):
            m.box((0.24, 0.4, 0.8), (cs * 1.0, y, 0.9), STEEL, rot=(0, -cs * 0.3, 0))
    # turret rings on the shoulders
    for s in (1, -1):
        m.cyl(0.85, 0.2, (s * 1.9, 2.3, 0.5), DARK, segs=8)
        m.cyl(0.95, 0.08, (s * 1.9, 2.3, 0.5), STEEL, segs=8)
    # engine pylons at the stern, and between them the bay: hazard-striped doors it drops mines
    # and launches fighters from
    for s in (1, -1):
        m.box((1.2, 1.4, 0.5), (s * 2.3, -6.1, -0.2), A.shade(0.8))
    m.box((2.0, 1.6, 0.1), (0, -5.9, 0.5), DARK)
    for k in range(5):
        m.box((0.28, 1.5, 0.04), (-0.8 + k * 0.4, -5.9, 0.56), HAZARD if k % 2 else RUBBER)
    m.box((0.3, 0.2, 0.16), (-1.2, -6.85, 0.3), "#ffb03a", glow=True)
    m.box((0.3, 0.2, 0.16), (1.2, -6.85, 0.3), "#ffb03a", glow=True)
    # jump vanes along the flanks: dark fins with drive-glow seams (they light up as it spools)
    for s in (1, -1):
        m.box((0.3, 4.4, 0.7), (s * 2.95, -2.4, 0.0), DARK, taper=0.7)
        m.box((0.12, 3.8, 0.12), (s * 3.08, -2.4, 0.3), C, glow=True)
        for k in range(3):
            m.box((0.5, 0.24, 0.5), (s * 3.05, -3.9 + k * 1.5, -0.1), A.shade(0.7))
    # vents and soot behind the bridge
    for s in (1, -1):
        for k in range(3):
            m.box((0.5, 0.12, 0.06), (s * 1.6, 3.4 - k * 0.24, 0.56), RUBBER)
    body = m.build(root)
    b = Model("runner_beacon")
    b.box((0.4, 0.14, 0.14), (0.16, 0, 0), "#ffb03a", glow=True)
    b.cyl(0.12, 0.18, (0, 0, -0.1), DARK, segs=6)
    beacon = b.build(body, loc=(0, 1.6, 0.92))
    spin(beacon, clip, T, turns=3)
    animate(body, clip, "rotation_euler", [(0, (0, 0, 0)), (T / 4, (0, 0.018, 0)), (T * 3 / 4, (0, -0.018, 0)), (T, (0, 0, 0))])


def runner_parts(demo):
    """For previews: the hull with its pods, engines and turrets where the runtime puts them."""
    hull = group("demo_runner_hull", parent=demo)
    _graft(runner, hull)
    for x, y, z in ((-5.1, 0.4, 0.45), (5.1, 0.4, 0.45), (0, -2.4, 1.3)):
        _graft(runner_pod, group("demo_runner_pod", loc=(x, y, z), parent=demo))
    for s in (1, -1):
        _graft(runner_engine, group("demo_runner_engine", loc=(s * 2.35, -6.5, -0.1), parent=demo))
        _graft(runner_turret, group("demo_runner_turret", loc=(s * 1.9, 2.3, 0.6), parent=demo))


def _graft(fn, at):
    """Build a template and hang it (stripped of its kind) under `at`."""
    before = set(bpy.data.objects)
    fn()
    for o in set(bpy.data.objects) - before:
        if o.parent is None:
            o.parent = at
            for k in ("kind", "variant"):
                if k in o:
                    del o[k]


def runner_pod():
    root = group("runner_pod", kind="runner_pod")
    m = Model("runner_pod_body", seed=420)
    # a hexagonal strongbox lying along y: gold, with dark banded ends and a lock plate
    m.cyl(0.78, 2.8, (0, 1.4, 0), GOLD, segs=6, rot=BACK)
    for y in (1.25, -1.25):
        m.cyl(0.84, 0.36, (0, y + 0.18, 0), DARK, segs=6, rot=BACK)
    for y in (0.5, -0.5):
        m.cyl(0.81, 0.12, (0, y + 0.06, 0), GOLD_DARK, segs=6, rot=BACK)
    m.box((0.7, 0.9, 0.2), (0, 0, 0.72), STEEL)
    m.box((0.26, 0.26, 0.1), (0, 0, 0.84), RED, glow=True)
    m.box((0.08, 2.0, 0.08), (0.5, 0, 0.6), HAZARD)
    m.box((0.08, 2.0, 0.08), (-0.5, 0, 0.6), HAZARD)
    # caps: a hatch and a lamp on each end
    for s in (1, -1):
        m.cyl(0.4, 0.12, (0, s * 1.46, 0), STEEL, segs=6, rot=FWD if s > 0 else BACK)
        m.box((0.18, 0.1, 0.18), (0, s * 1.6, 0.4), "#ffd060", glow=True)
    body = m.build(root)
    # the drogue: a ring canopy on four lines, trailing behind (+y: it falls tail-first)
    c = Model("runner_pod_chute")
    c.cyl(1.5, 0.7, (0, 0, 0), "#e8dcc0", segs=8, r_top=0.6, rot=FWD)
    c.cyl(1.2, 0.72, (0, -0.01, 0), "#d03a2a", segs=8, r_top=0.48, rot=FWD)
    for k in range(4):
        a = TAU * (k + 0.5) / 4
        m2 = (math.cos(a) * 0.5, -1.6, math.sin(a) * 0.5)
        c.plank_line((math.cos(a) * 1.3, 0, math.sin(a) * 1.3), m2, 0.05, 0.05, STEEL)
    chute = c.build(body, loc=(0, 3.4, 0.2))
    animate(chute, "runner_pod_flutter_idle", "rotation_euler", [(0, (0, 0, 0)), (0.3, (0.06, 0.4, 0.04)), (0.6, (-0.05, 0.8, -0.03)), (0.9, (0, 1.2, 0)), (1.2, (0, 1.6, 0))])


def runner_engine():
    root = group("runner_engine", kind="runner_engine")
    clip = "runner_engine_burn_idle"
    m = Model("runner_engine_body", seed=430)
    # a fat nacelle along y: armoured cowl, a dark intake up front, the nozzle glowing at the back
    m.cyl(1.1, 3.2, (0, 1.6, 0), STEEL, segs=8, rot=BACK)
    m.cyl(1.2, 1.6, (0, 1.2, 0.02), A, segs=8, rot=BACK)
    m.cyl(1.24, 0.16, (0, 0.0, 0.02), B, segs=8, rot=BACK)
    m.cyl(0.8, 0.08, (0, 1.62, 0), DARK, segs=8, rot=FWD)
    m.cyl(0.4, 0.3, (0, 1.4, 0), RUBBER, segs=6, rot=FWD)
    m.cyl(0.95, 0.4, (0, -1.6, 0), DARK, segs=8, rot=BACK, r_top=1.05)
    m.cyl(0.82, 0.1, (0, -2.0, 0), C, segs=8, rot=BACK, glow=True)
    for s in (1, -1):
        m.box((0.16, 2.2, 0.16), (s * 0.9, 0.0, 0.85), B)
        m.box((0.3, 0.6, 0.12), (s * 0.7, -0.9, 1.05), RUBBER)
    m.box((0.5, 0.5, 0.12), (0, 0.4, 1.22), HAZARD)
    body = m.build(root)
    f = Model("runner_engine_flame")
    f.cyl(0.7, 2.4, (0, 0, 0), C, segs=7, r_top=0.0, rot=BACK, glow=True)
    f.cyl(0.38, 1.6, (0, -0.05, 0), "#fff4d8", segs=6, r_top=0.0, rot=BACK, glow=True)
    obj = f.build(body, loc=(0, -2.05, 0))
    keys = [(t * 0.6 / 12, (0, (0.3 if t % 2 else -0.1), 0)) for t in range(13)]
    keys[-1] = (0.6, keys[0][1])
    animate(obj, clip, "scale", keys)


def runner_turret():
    root = group("runner_turret", kind="runner_turret")
    m = Model("runner_turret_body", seed=440)
    # a squat armoured head with twin barrels forward (+y) and a sight
    m.cyl(0.8, 0.3, (0, 0, 0), DARK, segs=8)
    m.box((1.3, 1.3, 0.6), (0, -0.1, 0.55), A, taper=0.8)
    m.box((1.1, 0.5, 0.2), (0, -0.55, 0.9), B)
    for s in (1, -1):
        m.cyl(0.14, 1.5, (s * 0.3, 0.5, 0.6), STEEL, segs=6, rot=FWD)
        m.cyl(0.18, 0.2, (s * 0.3, 1.9, 0.6), DARK, segs=6, rot=FWD)
    m.box((0.3, 0.3, 0.2), (0, 0.45, 0.92), C, glow=True)
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
    pickup_scrap_big()
    pickup_repair()
    for v in range(3):
        hauler(v)
    runner()
    runner_pod()
    runner_engine()
    runner_turret()
    if "--preview" in sys.argv or os.environ.get("SHIPS_DEMO"):
        # the runner with everything on it
        demo = group("demo_runner", kind="demo_runner")
        runner_parts(demo)
        for fid, fn in FRAME_BUILDERS.items():
            root = group(f"demo_{fid}", kind=f"demo_{fid}")
            fn(root)
            parts = START[fid]
            extra = os.environ.get("SHIPS_DEMO_FULL")
            if extra:
                parts = {"builds": BUILDS, "marks": MARKS, "edges": EDGE_PARTS, "cold": COLD}.get(extra, FULL).get(fid, parts)
            for pid, c, r in parts:
                x, y = sock(FRAMES[fid], c, r)
                s = group(f"demo_{fid}_{pid}", loc=(x, y, DECK), parent=root)
                PARTS[pid](s, False)


# fuller loadouts, for previews of a ship covered in parts (SHIPS_DEMO_FULL=1)
FULL = {
    "kestrel": [('rail', 2, 0), ('rivet', 1, 1), ('amp', 2, 1), ('rivet', 3, 1), ('incend', 1, 2), ('parry', 2, 2),
                ('shield', 3, 2), ('arc', 0, 3), ('vector', 1, 3), ('arc', 4, 3), ('thruster', 1, 4), ('thruster', 3, 4)],
    "hammer": [('plate', 0, 0), ('scatter', 1, 0), ('scatter', 2, 0), ('scatter', 3, 0), ('scatter', 4, 0), ('plate', 5, 0),
               ('shield', 0, 1), ('amp', 1, 1), ('bombbay', 2, 1), ('flare', 3, 1), ('amp', 4, 1), ('mirror', 5, 1),
               ('ram', 2, 2), ('vector', 3, 2), ('thruster', 2, 3), ('thruster', 3, 3)],
    "magpie": [('rail', 0, 0), ('rail', 4, 0), ('rivet', 1, 1), ('rivet', 3, 1), ('shield', 0, 2), ('incend', 1, 2),
               ('parry', 2, 2), ('flare', 3, 2), ('plate', 4, 2), ('vector', 1, 3), ('mirror', 3, 3),
               ('thruster', 1, 4), ('thruster', 3, 4)],
}


# the builds parts (dash mods, aux, passives, duos) on every frame (SHIPS_DEMO_FULL=builds)
BUILDS = {
    "kestrel": [('sentry', 1, 0), ('parry', 0, 1), ('ghost', 1, 1), ('trigger', 2, 1), ('spring', 1, 2),
                ('recoil', 2, 2), ('thruster', 0, 3), ('wake', 2, 3)],
    "hammer": [('scatter', 0, 0), ('ram', 1, 0), ('ram', 2, 0), ('scatter', 3, 0), ('slag', 0, 1),
               ('exchanger', 2, 1), ('salvage', 3, 1), ('siphon', 1, 2), ('gambler', 2, 2), ('blink', 2, 3)],
    "magpie": [('sentry', 0, 0), ('sentry', 4, 0), ('ghost', 0, 1), ('rivet', 1, 1), ('rivet', 3, 1), ('flare', 4, 1),
               ('wake', 0, 2), ('parry', 2, 2), ('mirror', 4, 2), ('vector', 1, 3), ('thruster', 1, 4), ('thruster', 3, 4)],
}


# the marks parts: the boosters that mark, and what plays on marks (SHIPS_DEMO_FULL=marks)
MARKS = {
    "kestrel": [('breach', 1, 0), ('torch', 0, 1), ('flaw', 1, 1), ('arc', 2, 1), ('incend', 0, 2),
                ('catalyst', 1, 2), ('tesla', 2, 2), ('thruster', 0, 3), ('thruster', 2, 3)],
}


# the edges parts: the Edge Hone between guns, Lunge Jets at the back (SHIPS_DEMO_FULL=edges)
EDGE_PARTS = {
    "kestrel": [('rivet', 1, 0), ('scatter', 0, 1), ('hone', 1, 1), ('seeker', 2, 1), ('reactor', 1, 2),
                ('lunge', 0, 3), ('thruster', 2, 3)],
    "magpie": [('rivet', 1, 1), ('hone', 0, 1), ('rivet', 3, 1), ('parry', 2, 2), ('lunge', 1, 4), ('thruster', 3, 4)],
}


# the cold and new guns and the relays (SHIPS_DEMO_FULL=cold)
COLD = {
    "kestrel": [('recoil', 2, 0), ('frost', 1, 1), ('conduit', 2, 1), ('saw', 3, 1), ('cryofeed', 1, 2), ('echo', 2, 2),
                ('magnet', 3, 2), ('grazer', 0, 3), ('grazer', 4, 3), ('thruster', 1, 4), ('thruster', 3, 4)],
    "hammer": [('frost', 0, 0), ('saw', 1, 0), ('charge', 2, 0), ('anchor', 3, 0), ('saw', 4, 0), ('frost', 5, 0),
               ('cryofeed', 0, 1), ('conduit', 1, 1), ('magnet', 4, 1), ('echo', 5, 1), ('thruster', 2, 3), ('thruster', 3, 3)],
    "magpie": [('charge', 0, 0), ('anchor', 4, 0), ('frost', 1, 1), ('saw', 3, 1), ('cryofeed', 1, 2), ('conduit', 2, 2),
               ('magnet', 3, 2), ('echo', 2, 3), ('thruster', 1, 4), ('thruster', 3, 4)],
}
