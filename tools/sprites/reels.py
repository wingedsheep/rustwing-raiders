"""SPOKE'S REELS' sheet: Spoke himself behind his counter (idle, leaning in on a tease, reaching
his tin arm over, getting slapped, laughing at a loss, groaning at a win, struck dumb by a
jackpot and counting it out), his tin hand on the reel, the brass cabinet and its lever, coins
that spin, the counter's coin stacks, and the den's lanterns.

    just sprites reels
"""
from __future__ import annotations

import math
import os

from creatures_util import limb
from kit import Model, animate, group

PI = math.pi
FPS = 24

# the cabinet is drawn front-on at exactly this many pixels a unit, so the game can put the reels
# in its window: the window is centred on the cabinet's origin
CAB_PPU = 40
WIN_W, WIN_H = 236, 116          # the window's opening, in pixels

SPRITES = {
    "spoke": dict(kind="spoke", view={"el": 6, "yaw": -25}, height=150, margin=1.25,
                  clips={"idle": 6, "lean": 4, "reach": 5, "ouch": 6, "laugh": 4, "groan": 5, "shock": 5, "count": 4}),
    "hand": dict(kind="hand", view={"el": 20, "yaw": 0}, height=40, clips={"rest": 1, "grab": 4, "slapped": 5}),
    "cabinet": dict(kind="cabinet", view="side", ppu=CAB_PPU, edge=0.15, margin=1.0),
    "pillar": dict(kind="pillar", view="side", ppu=CAB_PPU, edge=0.15, margin=1.0),
    "lever": dict(kind="lever", view={"el": 12, "yaw": -8}, ppu=CAB_PPU, clips={"rest": 1, "pull": 7}, margin=1.4),
    "coin": dict(kind="coin", view={"el": 20}, height=9, clips={"spin": 8}, edge=0, outline=True),
    "stack": dict(kind="stack", view={"el": 25, "yaw": -10}, height=22, edge=0.1),
    "stack_b": dict(kind="stack", variant=1, view={"el": 25, "yaw": 10}, height=18, edge=0.1),
    "lantern": dict(kind="lantern", view={"el": 10}, height=40, clips={"sway": 8}, margin=1.3),
}

# while iterating: SHEET_ONLY=spoke,hand renders just those
if os.environ.get("SHEET_ONLY"):
    SPRITES = {k: v for k, v in SPRITES.items() if k in os.environ["SHEET_ONLY"].split(",")}

# --- palette ------------------------------------------------------------------------------------
SKIN = "#c8885a"
SKIN_D = "#9a5e3a"
STUBBLE = "#5a3a2a"
BANDANA = "#b8302a"
BANDANA_D = "#7a1e1a"
VEST = "#5a3a26"
VEST_D = "#3a2418"
SHIRT = "#d8c8a0"
STRAP = "#2e2018"
TIN = "#9a98a8"
TIN_D = "#62606e"
TIN_L = "#c8c8d4"
BRASS = "#c8963a"
BRASS_D = "#8a5e22"
BRASS_L = "#f0c870"
GOLD = "#ffd04a"
EMBER = "#ff6a2a"
EYE = "#ff4a3a"
TEETH = "#f4ecd8"
MOUTH = "#3a1410"
DARKS = "#1e1612"
WOOD = "#6a3e22"
WOOD_D = "#42261a"
WOOD_L = "#8a5430"
CREAM = "#f0e2c0"
RED = "#d82a2a"
WARM = "#ffd27a"


def keys(n, dur, fn):
    """n keys spread over dur seconds, each fn(f) with f running 0..1."""
    return [(dur * i / (n - 1), fn(i / (n - 1))) for i in range(n)]


def wave(f, k=1.0):
    return math.sin(f * 2 * PI) * k


# --- Spoke --------------------------------------------------------------------------------------
# He faces the camera (+x), his left (+y) toward the cabinet on screen right. Waist at z = 0; the
# counter hides everything below about z = 0.3.

def spoke():
    root = group("spoke", kind="spoke")
    hips = group("spoke_hips", parent=root)
    # the torso: a wiry chest in a striped undershirt under an open leather vest (no sleeves:
    # he hasn't got arms to put in them), a coin bandolier across it
    t = Model("spoke_torso", seed=3)
    t.box((0.42, 0.5, 0.5), (0, 0, 0.25), SHIRT, taper=1.3)
    for i in range(4):
        t.box((0.43, 0.52 + i * 0.05, 0.045), (0, 0, 0.1 + i * 0.14), "#a89870")
    t.box((0.44, 0.7, 0.18), (0, 0, 0.58), SHIRT)                            # the shoulders
    for s in (-1, 1):
        # vest panels down each side, a lighter stitched edge, a lapel turned back
        t.box((0.46, 0.2, 0.62), (0.01, s * 0.26, 0.32), VEST, taper=1.1)
        t.box((0.05, 0.04, 0.6), (0.24, s * 0.16, 0.32), "#8a6040")
        t.box((0.14, 0.2, 0.26), (0.2, s * 0.2, 0.56), VEST_D, rot=(s * 0.45, 0.2, 0))
        t.box((0.48, 0.24, 0.14), (0, s * 0.28, 0.64), VEST)                 # over the shoulder
    t.box((0.05, 0.1, 0.1), (0.25, -0.27, 0.22), VEST_D)                     # a pocket
    t.box((0.03, 0.03, 0.16), (0.26, -0.22, 0.18), BRASS_L)                  # its watch chain
    # the bandolier: a strap with coins strung on it, shoulder to hip
    limb(t, (0.25, 0.3, 0.66), (0.25, -0.25, 0.02), 0.045, 0.045, STRAP, segs=5)
    for i in range(4):
        f = (i + 0.6) / 4.4
        t.cyl(0.055, 0.03, (0.28, 0.3 - 0.55 * f, 0.66 - 0.64 * f), GOLD, segs=6, rot=(0, PI / 2, 0))
    t.cyl(0.1, 0.16, (0.02, 0, 0.66), SKIN_D, segs=6)                         # the neck
    torso = t.build(hips, loc=(0, 0, 0.25))

    # the head: a long jaw, a hooked nose, stubble, an eyepatch, a red goggle-eye, a bandana.
    # Big on purpose: at 150 px he has to read from across the den
    h = Model("spoke_head", seed=5)
    h.ball(0.2, (0, 0, 0.25), SKIN, subdiv=1, scale=(0.95, 0.88, 1.0))          # cranium
    h.box((0.28, 0.32, 0.12), (0.04, 0, 0.13), SKIN, taper=1.1)              # cheeks
    for s in (-1, 1):
        h.box((0.14, 0.1, 0.1), (0.13, s * 0.12, 0.15), "#d8986a")           # cheekbones
        h.box((0.08, 0.05, 0.12), (-0.02, s * 0.19, 0.24), SKIN_D)            # ears
    h.box((0.1, 0.38, 0.06), (0.17, 0, 0.36), SKIN_D)                        # the brow ridge
    # the nose: a big hook
    h.box((0.13, 0.1, 0.18), (0.21, 0.0, 0.22), SKIN, rot=(0, 0.35, 0))
    h.box((0.1, 0.11, 0.08), (0.27, 0.0, 0.14), "#b8704a", rot=(0, 0.2, 0))
    h.cyl(0.035, 0.025, (0.0, -0.21, 0.16), GOLD, segs=6, rot=(PI / 2, 0, 0))   # earring
    # the eyepatch (his right, screen left) on a strap, the good eye behind a red brass lens
    h.box((0.05, 0.13, 0.11), (0.19, -0.09, 0.27), DARKS)
    h.box((0.38, 0.38, 0.03), (0.0, 0, 0.32), DARKS, rot=(0.0, -0.4, 0))
    h.cyl(0.07, 0.05, (0.18, 0.1, 0.27), BRASS, segs=7, rot=(0, PI / 2, 0))
    h.cyl(0.05, 0.03, (0.22, 0.1, 0.27), EYE, segs=7, rot=(0, PI / 2, 0), glow=True)
    # the bandana: a red cap knotted at the back, two tails flying
    h.ball(0.22, (-0.01, 0, 0.4), BANDANA, subdiv=1, scale=(1.05, 1.0, 0.6))
    h.box((0.3, 0.4, 0.06), (0.02, 0, 0.37), BANDANA_D)
    h.ball(0.07, (-0.21, -0.1, 0.36), BANDANA_D, subdiv=0)
    h.box((0.05, 0.1, 0.24), (-0.25, -0.15, 0.24), BANDANA, rot=(0.5, 0.3, 0))
    h.box((0.05, 0.08, 0.2), (-0.25, -0.05, 0.24), BANDANA_D, rot=(-0.3, 0.2, 0))
    head = h.build(torso, loc=(0.03, 0, 0.72))
    head.scale = (1.45, 1.45, 1.45)

    # the jaw: a long stubbled chin and a wide grin of big teeth; it drops to laugh or gape
    j = Model("spoke_jaw", seed=6)
    j.box((0.3, 0.32, 0.14), (0.04, 0, -0.04), SKIN, taper=0.8)
    j.box((0.22, 0.2, 0.12), (0.07, 0, -0.12), STUBBLE, taper=0.7)           # the chin
    j.box((0.05, 0.3, 0.09), (0.18, 0, -0.005), TEETH)                       # the grin
    for i in range(3):
        j.box((0.052, 0.012, 0.075), (0.182, -0.07 + i * 0.07, 0.0), "#b8a888")
    j.box((0.04, 0.26, 0.025), (0.17, 0, -0.045), MOUTH)
    jaw = j.build(head, loc=(0.02, 0, 0.1))
    mo = Model("spoke_tache")
    for s in (-1, 1):
        mo.box((0.07, 0.15, 0.05), (0.22, s * 0.08, 0.08), STUBBLE, rot=(s * 0.35, 0, 0))
    mo.build(head)
    # the brow over the good eye: it lifts in surprise and knits on a groan
    b = Model("spoke_brow")
    b.box((0.05, 0.14, 0.04), (0, 0, 0), STUBBLE, rot=(-0.2, 0, 0))
    brow = b.build(head, loc=(0.2, 0.1, 0.35))
    # the cigar, its ember glowing
    c = Model("spoke_cigar")
    limb(c, (0, 0, 0), (0.17, 0.05, -0.03), 0.028, 0.024, "#6a3a1e", segs=5)
    c.box((0.035, 0.04, 0.04), (0.185, 0.055, -0.035), EMBER, glow=True)
    cigar = c.build(jaw, loc=(0.18, -0.09, 0.0))

    # the arms: tin, riveted, brass at the joints. The left (screen right) is the one that reaches
    arms = {}
    for side, s in (("r", -1), ("l", 1)):
        sh = Model(f"spoke_arm_{side}")
        sh.ball(0.12, (0, 0, 0), BRASS, subdiv=1)
        sh.box((0.2, 0.2, 0.06), (0, s * 0.03, 0.08), BRASS_D)                # a pauldron
        limb(sh, (0, 0, -0.05), (0, 0, -0.42), 0.075, 0.065, TIN, segs=7)
        sh.cyl(0.085, 0.04, (0, 0, -0.2), TIN_D, segs=7)
        sh.box((0.025, 0.025, 0.26), (0.07, 0, -0.24), TIN_L)               # a lit seam
        arm = sh.build(torso, loc=(0.0, s * 0.42, 0.58))
        fo = Model(f"spoke_fore_{side}")
        fo.ball(0.08, (0, 0, 0), BRASS_D, subdiv=1)
        limb(fo, (0, 0, 0), (0, 0, -0.36), 0.065, 0.06, TIN, segs=7)
        fo.cyl(0.08, 0.05, (0, 0, -0.32), BRASS, segs=7)
        fore = fo.build(arm, loc=(0, 0, -0.44))
        ha = Model(f"spoke_paw_{side}")
        ha.box((0.17, 0.15, 0.15), (0.02, 0, -0.07), TIN_L)
        for i in range(4):
            ha.box((0.045, 0.12, 0.11), (0.08 - i * 0.045, 0.01, -0.19), TIN)
        ha.box((0.06, 0.05, 0.11), (0.08, -s * 0.09, -0.07), TIN)          # thumb
        paw = ha.build(fore, loc=(0, 0, -0.36))
        arms[side] = (arm, fore, paw)
    # rest pose: elbows out, tin hands spread on the counter in front of him
    ar, fr, pr = arms["r"]
    al, fl, pl = arms["l"]
    ar.rotation_euler = (0.35, -0.35, 0)
    fr.rotation_euler = (0, -1.25, 0)
    al.rotation_euler = (-0.35, -0.35, 0)
    fl.rotation_euler = (0, -1.25, 0)

    # --- clips ---
    # idle: he breathes, rolls the cigar, his eye glances; a slow loop
    animate(torso, "spoke_idle_idle", "rotation_euler", keys(9, 1.6, lambda f: (wave(f, 0.02), wave(f, 0.03), 0)))
    animate(torso, "spoke_idle_idle", "scale", keys(9, 1.6, lambda f: (0, wave(f, 0.015), wave(f, 0.02))))
    animate(head, "spoke_idle_idle", "rotation_euler", keys(9, 1.6, lambda f: (wave(f + 0.2, 0.04), 0, wave(f, 0.08))))
    animate(cigar, "spoke_idle_idle", "rotation_euler", keys(9, 1.6, lambda f: (0, wave(f, 0.15), wave(f * 2, 0.1))))
    # lean: he leans in toward the reels, eye wide, cigar clamped, a nervous bob
    animate(torso, "spoke_lean_idle", "rotation_euler", keys(7, 0.5, lambda f: (-0.18 + wave(f, 0.02), 0.22, 0)))
    animate(head, "spoke_lean_idle", "rotation_euler", keys(7, 0.5, lambda f: (-0.12, 0.08 + wave(f, 0.03), 0.35)))
    animate(brow, "spoke_lean_idle", "location", keys(7, 0.5, lambda f: (0, 0, 0.04)))
    animate(cigar, "spoke_lean_idle", "rotation_euler", keys(7, 0.5, lambda f: (0, -0.35, 0)))
    # reach: the left arm swings up and over toward the cabinet
    def reach(f):
        e = 1 - (1 - f) ** 2
        return e
    animate(al, "spoke_reach", "rotation_euler", keys(5, 0.3, lambda f: (-0.35 + 3.3 * reach(f), 0.2 * reach(f), 0)), rest=(-0.35, -0.35, 0))
    animate(fl, "spoke_reach", "rotation_euler", keys(5, 0.3, lambda f: (0, 1.25 * reach(f), 0)), rest=(0, -1.25, 0))
    animate(torso, "spoke_reach", "rotation_euler", keys(5, 0.3, lambda f: (-0.15 * reach(f), 0.06 * reach(f), 0)))
    animate(head, "spoke_reach", "rotation_euler", keys(5, 0.3, lambda f: (0, 0, 0.3 * reach(f))))
    animate(jaw, "spoke_reach", "rotation_euler", keys(5, 0.3, lambda f: (0, 0, 0)))
    # ouch: the slapped arm whips back, he shakes it out and winces
    def ouch(f):
        return (1 - f) ** 1.5
    animate(al, "spoke_ouch", "rotation_euler", keys(7, 0.55, lambda f: (-0.35 + 1.6 * ouch(f) + wave(f * 3, 0.25) * (1 - f), -0.5 * ouch(f), 0)), rest=(-0.35, -0.35, 0))
    animate(fl, "spoke_ouch", "rotation_euler", keys(7, 0.55, lambda f: (wave(f * 3, 0.4) * (1 - f), 0.6 * ouch(f), 0)), rest=(0, -1.25, 0))
    animate(torso, "spoke_ouch", "rotation_euler", keys(7, 0.55, lambda f: (0.1 * ouch(f), -0.12 * ouch(f), 0)))
    animate(head, "spoke_ouch", "rotation_euler", keys(7, 0.55, lambda f: (0.15 * ouch(f), -0.1 * ouch(f), -0.2 * ouch(f))))
    animate(brow, "spoke_ouch", "location", keys(7, 0.55, lambda f: (0, 0, -0.04 * ouch(f))))
    animate(jaw, "spoke_ouch", "rotation_euler", keys(7, 0.55, lambda f: (0, -0.25 * ouch(f), 0)))
    # laugh: head thrown back, jaw going, shoulders shaking
    animate(torso, "spoke_laugh_idle", "rotation_euler", keys(5, 0.36, lambda f: (0, -0.12 + wave(f, 0.05), 0)))
    animate(head, "spoke_laugh_idle", "rotation_euler", keys(5, 0.36, lambda f: (0, -0.3 + wave(f, 0.08), 0.1)))
    animate(jaw, "spoke_laugh_idle", "rotation_euler", keys(5, 0.36, lambda f: (0, -0.35 - wave(f, 0.15), 0)))
    animate(brow, "spoke_laugh_idle", "location", keys(5, 0.36, lambda f: (0, 0, 0.03)))
    animate(ar, "spoke_laugh_idle", "rotation_euler", keys(5, 0.36, lambda f: (0, wave(f, 0.1), 0)))
    animate(al, "spoke_laugh_idle", "rotation_euler", keys(5, 0.36, lambda f: (0, -wave(f, 0.1), 0)))
    animate(cigar, "spoke_laugh_idle", "rotation_euler", keys(5, 0.36, lambda f: (0, 0.3, wave(f, 0.2))))
    # groan: a hand slaps over his face (a win for you, a loss for him)
    def gr(f):
        return min(1, f * 2.5)
    animate(ar, "spoke_groan", "rotation_euler", keys(6, 0.6, lambda f: (-0.5 * gr(f), -1.15 * gr(f), 0)), rest=(0.35, -0.35, 0))
    animate(fr, "spoke_groan", "rotation_euler", keys(6, 0.6, lambda f: (0, -0.9 * gr(f), 0)), rest=(0, -1.25, 0))
    animate(torso, "spoke_groan", "rotation_euler", keys(6, 0.6, lambda f: (0, 0.12 * gr(f), 0)))
    animate(head, "spoke_groan", "rotation_euler", keys(6, 0.6, lambda f: (0, 0.3 * gr(f) + 0.04 * wave(f * 2), -0.15 * gr(f))))
    animate(brow, "spoke_groan", "location", keys(6, 0.6, lambda f: (0, 0, -0.04 * gr(f))))
    # shock: three cogs. He rocks back, jaw on the counter, cigar drooping, arms up
    def sh(f):
        return min(1, f * 3) if f < 0.35 else 1 - 0.15 * (f - 0.35)
    animate(torso, "spoke_shock", "rotation_euler", keys(6, 0.5, lambda f: (0, -0.25 * sh(f), 0)))
    animate(head, "spoke_shock", "rotation_euler", keys(6, 0.5, lambda f: (0, -0.1 * sh(f), 0)))
    animate(head, "spoke_shock", "location", keys(6, 0.5, lambda f: (0, 0, 0.06 * sh(f))))
    animate(jaw, "spoke_shock", "rotation_euler", keys(6, 0.5, lambda f: (0, -0.12 * sh(f), 0)))
    animate(jaw, "spoke_shock", "location", keys(6, 0.5, lambda f: (0, 0, -0.14 * sh(f))))
    animate(brow, "spoke_shock", "location", keys(6, 0.5, lambda f: (0, 0, 0.08 * sh(f))))
    animate(cigar, "spoke_shock", "rotation_euler", keys(6, 0.5, lambda f: (0, 0.9 * sh(f), 0)))
    animate(ar, "spoke_shock", "rotation_euler", keys(6, 0.5, lambda f: (1.2 * sh(f), -1.2 * sh(f), 0)), rest=(0.35, -0.35, 0))
    animate(al, "spoke_shock", "rotation_euler", keys(6, 0.5, lambda f: (-1.2 * sh(f), -1.2 * sh(f), 0)), rest=(-0.35, -0.35, 0))
    animate(fr, "spoke_shock", "rotation_euler", keys(6, 0.5, lambda f: (0, 0.6 * sh(f), 0)), rest=(0, -1.25, 0))
    animate(fl, "spoke_shock", "rotation_euler", keys(6, 0.5, lambda f: (0, 0.6 * sh(f), 0)), rest=(0, -1.25, 0))
    # count: he pays out, very slowly, a coin at a time from each hand, every piece twice
    animate(torso, "spoke_count_idle", "rotation_euler", keys(7, 1.2, lambda f: (0, 0.2, wave(f, 0.05))))
    animate(head, "spoke_count_idle", "rotation_euler", keys(7, 1.2, lambda f: (0, 0.35, wave(f, 0.1))))
    animate(brow, "spoke_count_idle", "location", keys(7, 1.2, lambda f: (0, 0, -0.03)))
    animate(fr, "spoke_count_idle", "rotation_euler", keys(7, 1.2, lambda f: (0, max(0, wave(f)) * 0.5, 0)))
    animate(fl, "spoke_count_idle", "rotation_euler", keys(7, 1.2, lambda f: (0, max(0, -wave(f)) * 0.5, 0)))
    animate(cigar, "spoke_count_idle", "rotation_euler", keys(7, 1.2, lambda f: (0, 0.5, 0)))
    return root


# --- the hand on the reel -----------------------------------------------------------------------
# Hanging down over a reel from his arm above: wrist up (+z), fingers down. `grab` hooks the
# fingers on the drum and tugs; `slapped` flattens and jerks up.

def hand():
    root = group("hand", kind="hand")
    wr = group("hand_wrist", parent=root)
    m = Model("hand_palm")
    m.cyl(0.16, 0.4, (0, 0, 0.1), TIN, segs=7)
    m.cyl(0.19, 0.1, (0, 0, 0.12), BRASS, segs=7)
    m.box((0.3, 0.42, 0.34), (0, 0, -0.12), TIN_L)
    for i in range(4):
        m.ball(0.035, (0.16, -0.15 + i * 0.1, -0.02), BRASS_L, subdiv=0)   # knuckle rivets
    m.box((0.14, 0.1, 0.24), (0.06, -0.26, -0.12), TIN, rot=(0.4, 0, 0))   # thumb
    palm = m.build(wr)
    fingers = []
    for i in range(4):
        f = Model(f"hand_finger_{i}")
        f.box((0.12, 0.08, 0.28), (0, 0, -0.14), TIN)
        f.box((0.13, 0.09, 0.05), (0, 0, -0.02), TIN_D)
        f.box((0.1, 0.07, 0.12), (0.04, 0, -0.32), TIN_L, rot=(0, 0.5, 0))
        fingers.append(f.build(palm, loc=(0.04, -0.15 + i * 0.1, -0.28)))
    for i, fo in enumerate(fingers):
        animate(fo, "hand_grab_idle", "rotation_euler", keys(5, 0.25, lambda f, i=i: (0, 0.5 + wave(f + i * 0.15, 0.25), 0)))
        animate(fo, "hand_slapped", "rotation_euler", keys(5, 0.25, lambda f: (0, -0.5 * (1 - f), 0)))
    animate(wr, "hand_grab_idle", "location", keys(5, 0.25, lambda f: (0, wave(f, 0.03), -0.04 + wave(f, 0.04))))
    animate(wr, "hand_slapped", "rotation_euler", keys(5, 0.25, lambda f: (0.5 * (1 - f) * wave(f * 1.5), -0.3 * (1 - f), 0)))
    animate(wr, "hand_slapped", "scale", keys(5, 0.25, lambda f: (0, 0.2 * (1 - f), -0.25 * (1 - f))))
    return root


# --- the cabinet --------------------------------------------------------------------------------
# Front-on (the front faces +x), origin at the window's centre. Brass front, dark wood flanks,
# a crown with bulb sockets, a recessed window, and below it the plates the game writes on.

def P(px):
    """Game pixels to units, at the cabinet's scale."""
    return px / CAB_PPU


def cabinet():
    root = group("cabinet", kind="cabinet")
    m = Model("cabinet_body", seed=9)
    W2 = P(124)                      # half the width (the atlas packer wants frames under 256 px)
    top, bot = P(66), P(-132)        # z of the crown's foot and the base (below the counter)
    # the brass face, its edges turned back
    m.box((P(24), 2 * W2, top - bot), (0, 0, (top + bot) / 2), BRASS_D)
    m.box((P(26), 2 * W2 - P(8), top - bot - P(6)), (P(1), 0, (top + bot) / 2), BRASS)
    # the window's frame: a thick bevelled brass bezel, and a black recess behind
    fw, fh = P(WIN_W / 2 + 5), P(WIN_H / 2 + 6)
    for s in (-1, 1):
        m.box((P(8), P(6), 2 * fh), (P(15), s * (fw - P(3)), 0), BRASS_L if s < 0 else BRASS_D)
        m.box((P(8), 2 * fw, P(7)), (P(15), 0, s * (fh - P(3.5))), BRASS_L if s > 0 else BRASS_D)
    m.box((P(4), P(WIN_W + 2), P(WIN_H + 2)), (P(13.5), 0, 0), DARKS)
    # rivets round the bezel
    for i in range(9):
        y = -fw + P(4) + i * (2 * fw - P(8)) / 8
        for z in (fh - P(3.5), -fh + P(3.5)):
            m.box((P(3), P(3), P(3)), (P(20), y, z), BRASS_D if z > 0 else BRASS_L)
    # the lamp ledge under the reels and the plates below: prompt, paytable, tray
    m.box((P(10), P(WIN_W + 6), P(8)), (P(15), 0, -fh - P(5)), WOOD_D)
    m.box((P(4), P(WIN_W - 4), P(19)), (P(14), 0, P(-90)), DARKS)                   # the prompt slot
    m.box((P(8), P(WIN_W + 4), P(3)), (P(16), 0, P(-79)), BRASS_L)
    m.box((P(8), P(WIN_W + 4), P(3)), (P(16), 0, P(-101)), BRASS_D)
    m.box((P(6), P(WIN_W - 6), P(14)), (P(15), 0, P(-113)), "#2a1a10")            # the paytable plate
    # the coin tray: a scoop sticking out at the foot
    m.box((P(30), P(84), P(10)), (P(26), 0, P(-134)), BRASS_D)
    m.box((P(26), P(78), P(4)), (P(30), 0, P(-128)), DARKS)
    m.box((P(30), P(86), P(3)), (P(27), 0, P(-126)), BRASS_L)
    # the crown: a stepped arch with a marquee plate, bulb sockets and a finial
    m.box((P(28), 2 * W2 + P(2), P(7)), (P(2), 0, top + P(2)), BRASS_L)
    m.box((P(22), 2 * W2 - P(14), P(24)), (0, 0, top + P(16)), WOOD)
    m.box((P(24), P(130), P(15)), (P(2), 0, top + P(16)), DARKS)                  # the marquee
    m.box((P(26), P(136), P(3)), (P(3), 0, top + P(25)), BRASS_L)
    m.box((P(26), P(136), P(3)), (P(3), 0, top + P(8)), BRASS_D)
    m.box((P(18), 2 * W2 - P(70), P(8)), (0, 0, top + P(31)), WOOD_D)
    m.ball(P(10), (0, 0, top + P(36)), BRASS, subdiv=1, scale=(0.6, 1, 0.7))
    m.ball(P(4), (P(5), 0, top + P(37)), GOLD, subdiv=0, glow=True)
    for i in range(BULBS):
        m.cyl(P(3.5), P(4), (P(13), bulb_y(i), top + P(2)), BRASS_D, segs=6, rot=(0, PI / 2, 0))
    m.build(root)
    return root


def bulb_y(i):
    return P(-112 + i * 224 / (BULBS - 1))


def pillar():
    """A dark wood flank pillar with brass bands and a finial, stood either side of the face."""
    root = group("pillar", kind="pillar")
    m = Model("pillar_body", seed=12)
    top, bot = P(80), P(-132)
    m.box((P(34), P(20), top - bot), (0, 0, (top + bot) / 2), WOOD)
    m.box((P(36), P(8), top - bot), (P(2), P(-5), (top + bot) / 2), WOOD_L)
    m.box((P(36), P(5), top - bot), (P(2), P(7), (top + bot) / 2), WOOD_D)
    for z in (P(60), P(-6), P(-80)):
        m.box((P(38), P(23), P(5)), (P(1), 0, z), BRASS)
        m.box((P(39), P(23), P(1.5)), (P(2), 0, z + P(2)), BRASS_L)
    m.box((P(38), P(26), P(8)), (0, 0, top), BRASS_D)
    m.cyl(P(9), P(12), (0, 0, top + P(4)), BRASS, segs=7, r_top=P(4))
    m.ball(P(5), (0, 0, top + P(19)), BRASS_L, subdiv=1)
    m.build(root)
    return root


BULBS = 14


# --- the lever ----------------------------------------------------------------------------------
# On the cabinet's right flank: a brass hub, a chrome shaft, a red ball. Origin at the hub.
# `pull` takes it from up to all the way down.

def lever():
    root = group("lever", kind="lever")
    m = Model("lever_hub")
    m.cyl(P(9), P(10), (0, 0, 0), BRASS, segs=8, rot=(PI / 2, 0, 0))
    m.cyl(P(5), P(12), (0, 0, 0), BRASS_L, segs=6, rot=(PI / 2, 0, 0))
    m.box((P(14), P(6), P(30)), (0, P(-4), P(-12)), BRASS_D)
    m.build(root)
    arm = group("lever_arm", parent=root, loc=(0, P(8), 0))
    s = Model("lever_shaft")
    s.cyl(P(2.5), P(62), (0, 0, 0), TIN_L, segs=6)
    s.ball(P(10), (0, 0, P(66)), RED, subdiv=1)
    s.ball(P(4), (P(5), P(-3), P(70)), "#ff9a8a", subdiv=0)
    s.build(arm)
    animate(arm, "lever_pull", "rotation_euler", keys(7, 0.3, lambda f: (0, 0.15 + 2.75 * f, 0)), rest=(0, 0, 0))
    arm.rotation_euler = (0, 0.15, 0)
    return root


# --- coins, stacks, lanterns --------------------------------------------------------------------

def coin():
    root = group("coin", kind="coin")
    c = Model("coin_disc")
    c.cyl(0.5, 0.12, (0, 0, -0.06), GOLD, segs=10, rot=(0, PI / 2, 0))
    c.cyl(0.34, 0.14, (0, 0, -0.07), BRASS, segs=8, rot=(0, PI / 2, 0))
    c.box((0.16, 0.16, 0.36), (0.08, 0, 0), BRASS_L)
    disc = c.build(root)
    animate(disc, "coin_spin_idle", "rotation_euler", keys(9, 0.4, lambda f: (0, 0, PI * 2 * f)))
    return root


def stack(v):
    root = group(f"stack_{v}", kind="stack", variant=v)
    m = Model(f"stack_{v}_coins", seed=20 + v)
    piles = [(0, 0, 9), (0.0, 1.1, 6), (0.9, 0.5, 4)] if v == 0 else [(0, 0, 5), (0.4, 1.0, 3)]
    for x, y, n in piles:
        for i in range(n):
            jx, jy = m.rng.uniform(-0.06, 0.06), m.rng.uniform(-0.06, 0.06)
            m.cyl(0.5, 0.18, (x + jx, y + jy, i * 0.2), GOLD if i % 2 else BRASS, segs=9)
    m.cyl(0.5, 0.05, (0.3, -0.8, 0), BRASS_D, segs=9, rot=(0.15, 0, 0))
    m.build(root)
    return root


def lantern():
    root = group("lantern", kind="lantern")
    sw = group("lantern_swing", parent=root)
    m = Model("lantern_body")
    m.box((0.04, 0.04, 1.2), (0, 0, -0.6), DARKS)                             # the chain
    m.cyl(0.32, 0.12, (0, 0, -1.32), BRASS_D, segs=6, r_top=0.12)
    m.cyl(0.36, 0.08, (0, 0, -1.4), BRASS, segs=6)
    m.cyl(0.28, 0.6, (0, 0, -2.0), WARM, segs=6, glow=True)
    for i in range(6):
        a = i * PI / 3
        m.box((0.05, 0.05, 0.62), (math.cos(a) * 0.3, math.sin(a) * 0.3, -1.7), BRASS_D)
    m.cyl(0.36, 0.1, (0, 0, -2.1), BRASS, segs=6)
    m.cyl(0.14, 0.2, (0, 0, -2.3), BRASS_D, segs=6, r_top=0.3)
    m.build(sw)
    animate(sw, "lantern_sway_idle", "rotation_euler", keys(9, 2.4, lambda f: (wave(f, 0.07), wave(f + 0.25, 0.03), 0)))
    return root


def build():
    spoke()
    hand()
    cabinet()
    pillar()
    lever()
    coin()
    stack(0)
    stack(1)
    lantern()
