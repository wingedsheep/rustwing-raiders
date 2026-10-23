"""TUNE IN's sheet: the Kestrel's valve receiver. The scope housing (the phosphor screen goes in
its window, the frequency dial under it), the control panel (signal meter, lock tube, speaker
grille, the tuning knob's dish and the phase slot), the big knob turning through its detents,
the pilot's glove on it, the valves that glow, and the slider's thumb.

    just sprites tune
"""
from __future__ import annotations

import math
import os

from creatures_util import limb
from kit import Model, animate, group

PI = math.pi
PPU = 40     # every piece of the set is drawn at this scale, front-on, so the game can line it up

SPRITES = {
    "scope": dict(kind="scope", view="side", ppu=PPU, edge=0.15, margin=1.0),
    "panel": dict(kind="panel", view="side", ppu=PPU, edge=0.15, margin=1.0),
    # the knob turns 30 degrees (one detent of its twelve) over the clip; the game picks the frame
    "knob": dict(kind="knob", view={"el": 8}, ppu=PPU, clips={"turn": 12}),
    "glove": dict(kind="glove", view={"el": 8}, ppu=PPU, clips={"turn": 12}, margin=1.2),
    "valve": dict(kind="valve", view={"el": 10}, ppu=PPU, edge=0.1),
    "thumb": dict(kind="thumb", view={"el": 10}, ppu=PPU),
}

if os.environ.get("SHEET_ONLY"):
    SPRITES = {k: v for k, v in SPRITES.items() if k in os.environ["SHEET_ONLY"].split(",")}

# --- palette: olive enamel and bakelite, brass trim, cream dials ---------------------------------
OLIVE = "#56603e"
OLIVE_D = "#3a4228"
OLIVE_L = "#76805a"
BAKE = "#4a2a1a"
BAKE_L = "#6e3e24"
BRASS = "#c8963a"
BRASS_D = "#8a5e22"
BRASS_L = "#f0c870"
CREAM = "#e8dcb0"
DARKS = "#12100c"
STEEL = "#7a7c84"
STEEL_D = "#4a4c54"
GLASS = "#b8ccc4"
AMBER = "#ffb04a"
JACKET = "#c8642a"
GLOVE = "#4a3426"
RED = "#c8302a"


def P(px):
    return px / PPU


def keys(n, dur, fn):
    return [(dur * i / (n - 1), fn(i / (n - 1))) for i in range(n)]


def screw(m, y, z, x=0.0, col=BRASS_D):
    m.cyl(P(2.5), P(3), (x, y, z), col, segs=6, rot=(0, PI / 2, 0))
    m.box((P(2), P(4.5), P(1)), (x + P(3), y, z), DARKS)


# --- the scope housing --------------------------------------------------------------------------
# Origin at the screen's centre. Screen 232 x 136; under it the dial window and the lamp row.
SCR_W, SCR_H = 226, 136


def scope():
    root = group("scope", kind="scope")
    m = Model("scope_box", seed=1)
    L, R, T, B = P(-123), P(123), P(80), P(-126)
    m.box((P(30), R - L, T - B), (0, 0, (T + B) / 2), OLIVE_D)
    m.box((P(32), R - L - P(6), T - B - P(6)), (P(1), 0, (T + B) / 2), OLIVE)
    # the CRT bezel: a deep chamfered frame of bakelite round the screen
    fw, fh = P(SCR_W / 2 + 8), P(SCR_H / 2 + 8)
    for s in (-1, 1):
        m.box((P(10), P(10), 2 * fh), (P(18), s * (fw - P(5)), 0), BAKE_L if s < 0 else BAKE)
        m.box((P(10), 2 * fw, P(10)), (P(18), 0, s * (fh - P(5))), BAKE_L if s > 0 else BAKE)
    for sy in (-1, 1):
        for sz in (-1, 1):
            m.box((P(11), P(16), P(16)), (P(18.5), sy * (fw - P(8)), sz * (fh - P(8))), BAKE, rot=(PI / 4, 0, 0))
    m.box((P(4), P(SCR_W + 2), P(SCR_H + 2)), (P(16), 0, 0), DARKS)
    # the dial window under the screen, with brass lips
    dz = P(-SCR_H / 2 - 26)
    m.box((P(6), P(SCR_W + 8), P(22)), (P(17), 0, dz), BRASS_D)
    m.box((P(4), P(SCR_W), P(16)), (P(19), 0, dz), DARKS)
    m.box((P(7), P(SCR_W + 8), P(2)), (P(18), 0, dz + P(10)), BRASS_L)
    # the lamp row: a recessed strip for the voices and the lock
    lz = P(-SCR_H / 2 - 46)
    m.box((P(4), P(SCR_W), P(14)), (P(16.5), 0, lz), "#262a1a")
    m.box((P(6), P(SCR_W + 4), P(2)), (P(17), 0, lz - P(8)), OLIVE_L)
    # a maker's plate and screws in the corners
    for y in (L + P(7), R - P(7)):
        for z in (T - P(7), B + P(7)):
            screw(m, y, z, P(17))
    # vents along the top
    for i in range(10):
        m.box((P(3), P(10), P(2.5)), (P(17), P(-30) + i * P(14), T - P(4)), DARKS)
    m.build(root)
    return root


# --- the control panel --------------------------------------------------------------------------
# Origin at its centre. Holes for the game to draw into: the meter face, the lock tube, the
# phase slot; and modelled: the grille, the knob dish, labels' plates.
METER = (-22, 58, 120, 50)        # centre x, centre y (up), w, h, in px from the origin
LOCK = (-22, 24, 120, 8)
SLOT = (76, -50, 8, 76)
KNOB = (-20, -36)


def panel():
    root = group("panel", kind="panel")
    m = Model("panel_box", seed=2)
    L, R, T, B = P(-105), P(105), P(102), P(-102)
    m.box((P(30), R - L, T - B), (0, 0, 0), OLIVE_D)
    m.box((P(32), R - L - P(6), T - B - P(6)), (P(1), 0, 0), OLIVE)
    # the signal meter: a brass ring round a recessed face
    cx, cz, w, h = (P(v) for v in METER)
    m.box((P(6), w + P(10), h + P(10)), (P(17), cx, cz), BRASS_D)
    m.box((P(7), w + P(10), P(2)), (P(18), cx, cz + h / 2 + P(4)), BRASS_L)
    m.box((P(4), w, h), (P(19), cx, cz), DARKS)
    # the lock tube's window
    cx, cz, w, h = (P(v) for v in LOCK)
    m.box((P(6), w + P(6), h + P(6)), (P(17), cx, cz), BAKE)
    m.box((P(4), w, h), (P(19), cx, cz), DARKS)
    # the speaker grille: a bakelite plate with slots, top right
    gy, gz = P(78), P(55)
    m.box((P(6), P(46), P(84)), (P(17), gy, gz), BAKE)
    m.box((P(7), P(46), P(2)), (P(18), gy, gz + P(41)), BAKE_L)
    for i in range(9):
        m.box((P(3), P(34), P(3)), (P(20), gy, gz - P(34) + i * P(8.5)), DARKS)
    # the knob's dish: a dark ring with twelve detent ticks round it
    ky, kz = (P(v) for v in KNOB)
    m.cyl(P(34), P(4), (P(16), ky, kz), STEEL_D, segs=16, rot=(0, PI / 2, 0))
    m.cyl(P(30), P(5), (P(16), ky, kz), DARKS, segs=16, rot=(0, PI / 2, 0))
    for i in range(12):
        a = i * PI / 6
        m.box((P(3), P(2), P(5)), (P(20), ky + math.cos(a) * P(32), kz + math.sin(a) * P(32)), CREAM, rot=(-a + PI / 2, 0, 0))
    # the phase slot, a long brass-lipped groove
    cx, cz, w, h = (P(v) for v in SLOT)
    m.box((P(6), w + P(8), h + P(8)), (P(17), cx, cz), BRASS_D)
    m.box((P(4), w, h), (P(19), cx, cz), DARKS)
    # label plates: TUNE under the knob, PHASE over the slot, SIGNAL over the meter
    for y, z, wd in ((ky, kz - P(42), 34), (cx, cz + h / 2 + P(10), 34), (P(-22), P(91), 40)):
        m.box((P(3), P(wd), P(9)), (P(17), y, z), CREAM)
    # sockets on top for the valves, and screws
    for i in range(4):
        m.cyl(P(8), P(5), (0, P(-70) + i * P(24), T), DARKS, segs=8)
    for y in (L + P(7), R - P(7)):
        for z in (T - P(7), B + P(7)):
            screw(m, y, z, P(17))
    # a cable down the side
    limb(m, (P(14), R - P(2), P(-40)), (P(14), R + P(2), B - P(6)), P(3), P(3), "#2a2018", segs=5)
    m.build(root)
    return root


# --- the knob, and the glove on it --------------------------------------------------------------

def knob():
    root = group("knob", kind="knob")
    spin = group("knob_spin", parent=root)
    m = Model("knob_body")
    m.cyl(P(24), P(10), (0, 0, 0), BAKE, segs=12, rot=(0, PI / 2, 0))
    m.cyl(P(21), P(6), (P(10), 0, 0), BAKE_L, segs=12, rot=(0, PI / 2, 0))
    # fluted grip: twelve ridges, one a detent
    for i in range(12):
        a = i * PI / 6
        m.box((P(12), P(5), P(6)), (P(5), math.cos(a) * P(23), math.sin(a) * P(23)), BAKE, rot=(-a, 0, 0))
    m.cyl(P(9), P(4), (P(16), 0, 0), BRASS, segs=8, rot=(0, PI / 2, 0))
    # the pointer: a cream line to the rim
    m.box((P(3), P(4), P(16)), (P(17), 0, P(12)), CREAM)
    m.build(spin)
    animate(spin, "knob_turn_idle", "rotation_euler", keys(13, 0.5, lambda f: (-PI / 6 * f, 0, 0)))
    return root


def glove():
    """The pilot's hand, from the bottom right: a jacket sleeve, a glove gripping the knob's rim."""
    root = group("glove", kind="glove")
    arm = Model("glove_arm")
    limb(arm, (P(14), P(46), P(-76)), (P(18), P(32), P(-20)), P(10), P(8), JACKET, segs=7)
    arm.cyl(P(11), P(7), (P(16), P(42), P(-60)), "#a04a20", segs=7, rot=(0.25, 0, 0))   # the cuff
    arm.build(root)
    grip = group("glove_grip", parent=root)
    g = Model("glove_hand")
    g.box((P(12), P(13), P(22)), (P(20), P(29), P(-6)), GLOVE, rot=(0.15, 0, 0))     # the palm, on the rim
    for i in range(3):                                                              # fingers over the top
        g.box((P(9), P(14), P(6)), (P(24), P(20), P(12) - i * P(7)), "#5e4430" if i == 0 else GLOVE, rot=(0.25, 0, 0))
    g.box((P(9), P(12), P(7)), (P(24), P(20), P(-20)), "#5e4430", rot=(-0.4, 0, 0))   # the thumb, under
    g.box((P(4), P(14), P(3)), (P(26), P(30), P(-14)), "#33261f")                     # a strap
    g.build(grip)
    animate(grip, "glove_turn_idle", "rotation_euler", keys(13, 0.5, lambda f: (-PI / 6 * f, 0, 0)))
    return root


def valve():
    """A glass valve standing in its socket: the filament glows (the game brightens it)."""
    root = group("valve", kind="valve")
    m = Model("valve_body")
    m.cyl(P(7), P(5), (0, 0, 0), DARKS, segs=8)
    m.cyl(P(6), P(22), (0, 0, P(5)), GLASS, segs=8, r_top=P(5))
    m.ball(P(5), (0, 0, P(27)), GLASS, subdiv=1)
    m.box((P(7), P(2), P(14)), (P(1), 0, P(13)), STEEL)
    m.box((P(5), P(3), P(8)), (P(4), 0, P(14)), AMBER, glow=True)
    m.cyl(P(1), P(4), (0, 0, P(31)), GLASS, segs=4)
    m.build(root)
    return root


def thumb():
    root = group("thumb", kind="thumb")
    m = Model("thumb_body")
    m.box((P(8), P(16), P(10)), (P(4), 0, 0), BAKE_L)
    m.box((P(8), P(16), P(2)), (P(6), 0, 0), CREAM)
    m.build(root)
    return root


def build():
    scope()
    panel()
    knob()
    glove()
    valve()
    thumb()
