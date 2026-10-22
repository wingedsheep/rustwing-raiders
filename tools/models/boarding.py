"""Boarding: the on-foot raid inside a cargo freighter (top-down twin-stick, closer camera).

Characters are rigid-part rigs the game animates in code (no clips). Every character is
    <kind>                 root empty at the feet
      <kind>__hips           pelvis/belt, joint (0, 0, 0.95*s)
        <kind>__thigh_l/_r     hip (-/+0.13*w, 0, -0.02*s), hangs down -z, 0.45*s
          <kind>__shin_l/_r    knee (0, 0, -0.45*s), down to the floor, boot points +y
        <kind>__torso          lower spine (0, 0, 0.08*s), chest up to 0.6*s
          <kind>__head           neck (0, 0, 0.6*s)
          <kind>__arm_l/_r       shoulder (-/+0.27*w, 0, 0.5*s), hangs down -z, 0.3*s
            <kind>__fore_l/_r    elbow (0, 0, -0.3*s), forearm + hand
              <kind>__gun          (right only) hand (0, 0, -0.28*s), weapon pointing DOWN -z
                <kind>__muzzle     empty at the muzzle tip
(s, w = 1, 1 for a human; the bruiser is 1.25, 1.4 and has <kind>__shield on the torso.)
Each part object also carries a custom prop `part=<part>` (glTF extras -> userData.part).

Props are `deck_*` kinds; their moving parts are `<kind>__<part>` (Blender adds ".001" to the
second variant's part names, so match on userData.part or strip the suffix). Wall props (alarm,
medkit, sconce, pipes) have their back on y = 0 and stand out towards +y.

Liveries: characters Skin a/b/c (c glows); hull-ish props use Skin a = owner's hull paint,
Skin c = owner's accent glow. Loot glows (gold, teal locks) are fixed.
"""
from __future__ import annotations

import math
import os
import sys

import bpy

import kit
from kit import Model, Skin, group
from creatures_util import limb

TAU = math.tau
PI = math.pi

# --- shared colours ---------------------------------------------------------------------------
STEEL = "#7c828a"
IRON = "#4c4f56"
DARK = "#2b2c31"
BLACK = "#18181c"
HAZ = "#e8b42a"
GOLD = "#ffd04a"
BRASS = "#b08a3e"
TEAL = "#5ae0c0"
REDGLOW = "#ff3a2a"
AMBER = "#ffb040"
EMBER = "#ff7a2a"
WARM = "#ffd890"
CYAN = "#6ae8ff"
RUSTP = "#8a4c2e"        # rust patches on props (not the player's orange)
SKINT = "#b98262"        # bare forearms, faces

HA = Skin("a", "#5f7480")    # freighter owner's hull paint
HC = Skin("c", "#5ae0c0")    # owner's accent glow


def ring(m, r, z, color, n=8, w=0.08, h=0.08, glow=False, cx=0.0, cy=0.0, axis="z", jitter=0.0, rng=None):
    """A faceted ring of n boxes. axis z: lies flat; axis y: stands facing +y; axis x: faces +x."""
    seg = 2 * r * math.tan(PI / n) * 1.1
    for i in range(n):
        a = TAU * i / n
        j = (rng.uniform(-jitter, jitter) if rng else 0.0)
        if axis == "z":
            m.box((seg, w, h), (cx + math.cos(a) * r, cy + math.sin(a) * r, z + j), color,
                  rot=(0, 0, a + PI / 2), glow=glow)
        elif axis == "y":
            m.box((seg, h, w), (cx + math.cos(a) * r, cy, z + math.sin(a) * r), color,
                  rot=(0, -a - PI / 2, 0), glow=glow)
        else:
            m.box((h, seg, w), (cx, cy + math.cos(a) * r, z + math.sin(a) * r), color,
                  rot=(a + PI / 2, 0, 0), glow=glow)


def stripes(m, size, loc, n, axis="z", c1=HAZ, c2=BLACK):
    """A hazard strip of n alternating blocks along one axis (size = whole strip)."""
    ax = "xyz".index(axis)
    for i in range(n):
        s = list(size)
        s[ax] = size[ax] / n
        p = list(loc)
        p[ax] = loc[ax] - size[ax] / 2 + (i + 0.5) * size[ax] / n
        m.box(tuple(s), tuple(p), c1 if i % 2 == 0 else c2)


def part(kind, name, m: Model, parent, loc):
    return m.build(parent=parent, loc=loc, part=name)


_PREVIEW: dict[str, tuple[str, str, str]] = {}
HULL_PREVIEW = ("#5f7480", "#c9c2b0", "#5ae0c0")


def root(kind, variant=None, preview=HULL_PREVIEW):
    _PREVIEW[kind] = preview
    props = {"kind": kind}
    if variant is not None:
        props["variant"] = variant
    return group(kind, **props)


# ==============================================================================================
# Characters
# ==============================================================================================

PARTS = ["hips", "thigh_l", "thigh_r", "shin_l", "shin_r", "torso", "head",
         "arm_l", "arm_r", "fore_l", "fore_r", "gun"]


class Rig:
    """Models for every part of one character, base body included; dress, then finish()."""

    def __init__(self, kind, s=1.0, w=1.0, *, legs, top, sleeve, fore, boot, glove, belt, seed=0):
        self.kind, self.s, self.w = kind, s, w
        self.m = {p: Model(f"{kind}__{p}", seed=seed + i) for i, p in enumerate(PARTS)}
        self.extra = {}
        self.muzzle = None
        S, W = s, w
        m = self.m
        # hips: pelvis + belt + ball joints
        m["hips"].box((0.38 * W * S, 0.25 * S, 0.2 * S), (0, 0, -0.03 * S), legs, taper=1.08)
        m["hips"].box((0.43 * W * S, 0.29 * S, 0.07 * S), (0, 0, 0.06 * S), belt)
        for sx in (-1, 1):
            m["hips"].ball(0.112 * S, (sx * 0.13 * W * S, 0, -0.02 * S), legs, subdiv=1)
        # legs
        for side in ("l", "r"):
            th, sh = m[f"thigh_{side}"], m[f"shin_{side}"]
            limb(th, (0, 0, 0.02 * S), (0, 0, -0.45 * S), 0.11 * S, 0.088 * S, legs, segs=7)
            sh.ball(0.09 * S, (0, 0, 0), legs, subdiv=1)
            limb(sh, (0, 0, 0), (0, 0, -0.3 * S), 0.086 * S, 0.075 * S, legs, segs=7)
            # boot: shaft, cuff, foot, toe cap, sole
            sh.cyl(0.1 * S, 0.2 * S, (0, 0, -0.44 * S), boot, segs=7)
            sh.cyl(0.112 * S, 0.05 * S, (0, 0, -0.27 * S), boot, segs=7)
            sh.box((0.17 * S, 0.3 * S, 0.11 * S), (0, 0.05 * S, -0.425 * S), boot)
            sh.box((0.18 * S, 0.1 * S, 0.1 * S), (0, 0.19 * S, -0.43 * S), boot, taper=0.8)
            sh.box((0.19 * S, 0.34 * S, 0.035 * S), (0, 0.06 * S, -0.4625 * S), BLACK)
        # torso: waist, chest, shoulder yoke, neck
        t = m["torso"]
        t.box((0.34 * W * S, 0.22 * S, 0.26 * S), (0, 0, 0.12 * S), top, taper=1.2)
        t.box((0.48 * W * S, 0.29 * S, 0.3 * S), (0, 0, 0.38 * S), top, taper=0.92)
        t.box((0.56 * W * S, 0.25 * S, 0.1 * S), (0, 0, 0.52 * S), top)
        t.cyl(0.075 * S, 0.12 * S, (0, 0, 0.52 * S), DARK, segs=6)
        # arms
        for side in ("l", "r"):
            a, f = m[f"arm_{side}"], m[f"fore_{side}"]
            a.ball(0.108 * S, (0, 0, 0), sleeve, subdiv=1)
            limb(a, (0, 0, 0), (0, 0, -0.3 * S), 0.09 * S, 0.076 * S, sleeve, segs=7)
            f.ball(0.077 * S, (0, 0, 0), fore, subdiv=1)
            limb(f, (0, 0, 0), (0, 0, -0.21 * S), 0.074 * S, 0.064 * S, fore, segs=7)
            f.cyl(0.086 * S, 0.065 * S, (0, 0, -0.235 * S), glove, segs=7)
            f.box((0.12 * S, 0.14 * S, 0.14 * S), (0, 0.005 * S, -0.29 * S), glove)
            f.box((0.05 * S, 0.06 * S, 0.08 * S), (0, 0.075 * S, -0.25 * S), glove)   # thumb

    def finish(self, preview):
        S, W, m, kind = self.s, self.w, self.m, self.kind
        r = root(kind, preview=preview)
        o = {}
        o["hips"] = part(kind, "hips", m["hips"], r, (0, 0, 0.95 * S))
        for sd, sx in (("l", -1), ("r", 1)):
            o[f"thigh_{sd}"] = part(kind, f"thigh_{sd}", m[f"thigh_{sd}"], o["hips"], (sx * 0.13 * W * S, 0, -0.02 * S))
            o[f"shin_{sd}"] = part(kind, f"shin_{sd}", m[f"shin_{sd}"], o[f"thigh_{sd}"], (0, 0, -0.45 * S))
        o["torso"] = part(kind, "torso", m["torso"], o["hips"], (0, 0, 0.08 * S))
        o["head"] = part(kind, "head", m["head"], o["torso"], (0, 0, 0.6 * S))
        for sd, sx in (("l", -1), ("r", 1)):
            o[f"arm_{sd}"] = part(kind, f"arm_{sd}", m[f"arm_{sd}"], o["torso"], (sx * 0.27 * W * S, 0, 0.5 * S))
            o[f"fore_{sd}"] = part(kind, f"fore_{sd}", m[f"fore_{sd}"], o[f"arm_{sd}"], (0, 0, -0.3 * S))
        o["gun"] = part(kind, "gun", m["gun"], o["fore_r"], (0, 0, -0.28 * S))
        group(f"{kind}__muzzle", loc=self.muzzle, parent=o["gun"], part="muzzle")
        for name, (model, parent, loc) in self.extra.items():
            o[name] = part(kind, name, model, o[parent], loc)
        return r, o


# --- pilot: the player ------------------------------------------------------------------------

def pilot():
    A = Skin("a", "#c8642a")       # flight jacket
    B = Skin("b", "#ecdcb8")       # cream
    C = Skin("c", "#ffc24a")       # visor / accent glow
    BOOT, GLOVE, BELT = "#33261f", "#4a3426", "#3e2c22"
    HELM, HELM2 = "#8f8a7c", "#5e5a52"
    TANK, BRASSY = "#5a5e66", "#a8843c"
    rg = Rig("pilot", legs=B, top=A, sleeve=A, fore=A, boot=BOOT, glove=GLOVE, belt=BELT, seed=100)
    m = rg.m
    # trousers: knee patches, cargo pocket
    for sd, sx in (("l", -1), ("r", 1)):
        m[f"thigh_{sd}"].box((0.07, 0.15, 0.13), (sx * 0.095, 0.0, -0.22), B.shade(0.85))
        m[f"shin_{sd}"].box((0.13, 0.06, 0.12), (0, 0.07, -0.04), B.shade(0.8))
    m["hips"].box((0.08, 0.04, 0.06), (0, 0.15, 0.06), BRASSY)                       # buckle
    m["hips"].box((0.1, 0.1, 0.13), (-0.2, 0.02, -0.02), BELT)                       # holster pouch
    # jacket: hem over the belt, cream front zip panel, collar flaps, pocket
    t = m["torso"]
    t.box((0.4, 0.3, 0.09), (0, 0, 0.0), A.shade(0.85))
    t.box((0.07, 0.03, 0.4), (0.03, 0.148, 0.28), B)
    t.box((0.12, 0.03, 0.08), (-0.13, 0.15, 0.36), A.shade(0.8))                     # chest pocket
    for sx in (-1, 1):                                                               # collar flaps
        t.box((0.13, 0.05, 0.12), (sx * 0.09, 0.12, 0.56), A.shade(0.8), rot=(0.5, 0, sx * -0.4))
    # scarf: a wrap at the neck, a tail blowing down the back
    SCARF = "#3e7a86"
    ring(t, 0.1, 0.56, SCARF, n=6, w=0.07, h=0.08)
    t.box((0.09, 0.04, 0.26), (0.1, -0.17, 0.42), SCARF, rot=(-0.25, 0.15, 0.1))
    t.box((0.08, 0.035, 0.12), (0.13, -0.2, 0.25), SCARF, rot=(-0.4, 0.3, 0.2))
    # cutter-tank backpack: frame, two tanks, brass caps, a tiny ember glow
    t.box((0.32, 0.08, 0.32), (0, -0.18, 0.33), DARK)
    for sx in (-1, 1):
        t.cyl(0.07, 0.34, (sx * 0.085, -0.25, 0.15), TANK, segs=7)
        t.cyl(0.05, 0.04, (sx * 0.085, -0.25, 0.49), BRASSY, segs=6)
    t.box((0.08, 0.05, 0.06), (0, -0.3, 0.42), EMBER, glow=True)
    limb(t, (0.085, -0.25, 0.15), (0.22, -0.1, 0.06), 0.022, 0.022, BLACK, segs=4)   # hose
    # shoulders: strong, with cream piping
    for sd, sx in (("l", -1), ("r", 1)):
        a = m[f"arm_{sd}"]
        a.box((0.17, 0.24, 0.09), (sx * 0.02, 0, 0.06), A.shade(0.9), taper=0.8)
        a.box((0.04, 0.24, 0.04), (sx * 0.1, 0, 0.04), B)
        m[f"fore_{sd}"].cyl(0.08, 0.04, (0, 0, -0.18), A.shade(0.8), segs=7)          # cuff
    # helmet: scuffed shell, cream-free crest in jacket colour, ear cups, glowing visor
    h = m["head"]
    h.ball(0.165, (0, 0, 0.15), HELM, subdiv=1, scale=(0.95, 1.05, 1.05))
    h.box((0.06, 0.24, 0.04), (0, -0.01, 0.3), A)
    for sx in (-1, 1):
        h.cyl(0.06, 0.05, (sx * 0.145, 0, 0.13), HELM2, segs=6, rot=(0, PI / 2, 0))
    h.box((0.25, 0.08, 0.08), (0, 0.12, 0.15), DARK)
    h.box((0.21, 0.06, 0.055), (0, 0.15, 0.155), C, glow=True)
    h.box((0.14, 0.06, 0.06), (0, 0.11, 0.05), HELM2)                                # chin guard
    # rivet pistol: rust-brown receiver, dark barrel and shroud, ember power cell
    g = m["gun"]
    RB = "#7a4a2e"
    g.box((0.07, 0.08, 0.13), (0, -0.01, -0.02), DARK)                               # grip in the fist
    g.box((0.1, 0.15, 0.22), (0, 0.06, -0.15), RB)
    g.box((0.11, 0.06, 0.12), (0, 0.13, -0.08), "#5e3a24")              # hammer block
    limb(g, (0, 0.07, -0.24), (0, 0.07, -0.5), 0.032, 0.032, DARK, segs=6)
    g.cyl(0.055, 0.14, (0, 0.07, -0.38), "#4a4850", segs=6, rot=(0, 0, 0))
    g.box((0.12, 0.05, 0.03), (0, 0.07, -0.3), DARK)                                 # cooling fin
    g.box((0.12, 0.05, 0.03), (0, 0.07, -0.36), DARK)
    g.cyl(0.05, 0.03, (0, 0.07, -0.5), BRASSY, segs=6)
    g.box((0.05, 0.08, 0.13), (0.07, 0.05, -0.15), EMBER, glow=True)                 # power cell
    g.box((0.05, 0.08, 0.13), (-0.07, 0.05, -0.15), EMBER, glow=True)
    rg.muzzle = (0, 0.07, -0.5)
    rg.finish((A, B, C))


# --- deckhand: melee crew ---------------------------------------------------------------------

def deckhand():
    A = Skin("a", "#4f6f80")       # overalls
    B = Skin("b", "#b8a27a")       # shirt / sleeves
    C = Skin("c", "#7af0ff")       # goggles lens glow
    BOOT, GLOVE, BELT = "#2e2a26", "#8a6a3a", "#4a3a2a"
    rg = Rig("deckhand", legs=A, top=B, sleeve=B, fore=SKINT, boot=BOOT, glove=GLOVE, belt=BELT, seed=200)
    m = rg.m
    # overall bib, back panel, straps, pocket; rolled-up trouser cuffs
    t = m["torso"]
    t.box((0.36, 0.3, 0.42), (0, 0, 0.2), A, taper=0.95)
    t.box((0.16, 0.03, 0.1), (0, 0.155, 0.3), A.shade(0.8))
    for sx in (-1, 1):
        t.box((0.07, 0.31, 0.06), (sx * 0.15, 0, 0.48), A)
        t.box((0.05, 0.03, 0.05), (sx * 0.14, 0.16, 0.4), BRASS)
    t.box((0.14, 0.08, 0.22), (0.17, -0.17, 0.18), "#6a5a44")                       # rag in back pocket
    for sd in ("l", "r"):
        m[f"shin_{sd}"].cyl(0.098, 0.06, (0, 0, -0.27), A.shade(0.8), segs=7)
    # tool belt: pouches, a hammer, a coil of wire
    hp = m["hips"]
    hp.box((0.12, 0.1, 0.14), (-0.22, 0.04, -0.01), BELT)
    hp.box((0.1, 0.12, 0.12), (0.22, -0.04, -0.01), BELT)
    hp.box((0.03, 0.03, 0.2), (0.24, 0.07, -0.08), "#6a4a2a")
    hp.box((0.1, 0.05, 0.05), (0.24, 0.07, 0.01), STEEL)
    hp.box((0.07, 0.04, 0.06), (0, 0.15, 0.06), BRASS)
    # rolled sleeves: a fat cuff above the elbow
    for sd in ("l", "r"):
        m[f"arm_{sd}"].cyl(0.098, 0.08, (0, 0, -0.27), B.shade(0.85), segs=7)
    # head: face, stubbled jaw, beanie with a fold, goggles on the brow
    h = m["head"]
    h.ball(0.135, (0, 0.01, 0.13), SKINT, subdiv=1, scale=(0.95, 1.0, 1.1))
    h.box((0.2, 0.1, 0.08), (0, 0.07, 0.05), "#5a4232")                              # beard
    h.ball(0.145, (0, -0.01, 0.2), "#5e4a3c", subdiv=1, scale=(1.0, 1.05, 0.85))     # beanie
    ring(h, 0.14, 0.19, "#4e3c30", n=7, w=0.06, h=0.07)
    h.box((0.07, 0.07, 0.07), (0, -0.01, 0.32), "#4e3c30")
    h.box((0.27, 0.05, 0.04), (0, 0.06, 0.22), DARK)                                 # goggle strap
    for sx in (-1, 1):
        h.cyl(0.05, 0.05, (sx * 0.06, 0.13, 0.22), DARK, segs=6, rot=(-PI / 2, 0, 0))
        h.cyl(0.038, 0.02, (sx * 0.06, 0.175, 0.22), C, segs=6, rot=(-PI / 2, 0, 0), glow=True)
    # chest lamp on the bib strap
    t.box((0.06, 0.04, 0.05), (-0.14, 0.17, 0.46), C, glow=True)
    # the big wrench
    g = m["gun"]
    limb(g, (0, 0, 0.06), (0, 0, -0.46), 0.035, 0.032, STEEL, segs=6)
    g.box((0.08, 0.075, 0.18), (0, 0, -0.02), "#7a3a2a")                              # grip tape
    g.box((0.24, 0.09, 0.12), (0, 0, -0.52), "#8a9098")
    for sx in (-1, 1):
        g.box((0.07, 0.085, 0.12), (sx * 0.085, 0, -0.63), "#8a9098", taper=0.8)
    g.box((0.06, 0.1, 0.04), (0, 0, -0.47), DARK)                                    # adjuster
    rg.muzzle = (0, 0, -0.66)
    rg.finish((A, B, C))


# --- gunner: armoured guard -------------------------------------------------------------------

def gunner():
    A = Skin("a", "#6e7444")       # vest + shoulder plates
    B = Skin("b", "#3e4450")       # under-suit
    C = Skin("c", "#ff5a3a")       # visor strip glow
    BOOT, GLOVE, BELT = "#26272c", "#2e2f34", "#2e2f34"
    rg = Rig("gunner", legs=B, top=B, sleeve=B, fore=B, boot=BOOT, glove=GLOVE, belt=BELT, seed=300)
    m = rg.m
    t = m["torso"]
    # the vest: front and back plates, a high collar, mag pouches
    t.box((0.5, 0.34, 0.36), (0, 0, 0.34), A, taper=0.95)
    t.box((0.44, 0.04, 0.12), (0, 0.17, 0.25), A.shade(0.8))
    t.box((0.44, 0.04, 0.03), (0, 0.18, 0.4), A.shade(0.7))
    t.box((0.4, 0.3, 0.1), (0, 0, 0.55), A.shade(0.9))
    for x in (-0.12, 0, 0.12):
        t.box((0.09, 0.06, 0.1), (x, 0.19, 0.14), "#3a3d2a")
    t.box((0.3, 0.06, 0.26), (0, -0.19, 0.34), A.shade(0.85))                      # back plate
    t.box((0.06, 0.05, 0.05), (-0.16, 0.2, 0.48), C, glow=True)                     # radio light
    # thick pauldrons: two stacked plates per shoulder (on the arm, so they move with it)
    for sd, sx in (("l", -1), ("r", 1)):
        a = m[f"arm_{sd}"]
        a.box((0.24, 0.3, 0.12), (sx * 0.03, 0, 0.07), A, taper=0.75, rot=(0, sx * 0.25, 0))
        a.box((0.22, 0.28, 0.1), (sx * 0.06, 0, -0.04), A.shade(0.85), rot=(0, sx * 0.35, 0))
        a.box((0.04, 0.04, 0.04), (sx * 0.1, 0.12, 0.1), STEEL)
        m[f"fore_{sd}"].box((0.12, 0.14, 0.14), (0, 0.02, -0.12), A.shade(0.9))      # vambrace
        m[f"shin_{sd}"].box((0.13, 0.08, 0.14), (0, 0.07, -0.03), A)                 # knee pad
    m["hips"].box((0.14, 0.11, 0.12), (0.2, 0.03, -0.02), "#3a3d2a")
    m["hips"].box((0.14, 0.11, 0.12), (-0.2, 0.03, -0.02), "#3a3d2a")
    # helmet: dome, brim, cheek guards, glowing visor strip
    h = m["head"]
    h.ball(0.15, (0, 0, 0.14), "#c49a78", subdiv=1, scale=(0.9, 0.95, 1.0))          # face under it
    h.ball(0.165, (0, -0.01, 0.18), "#33373e", subdiv=1, scale=(1.0, 1.08, 0.9))
    h.box((0.32, 0.36, 0.04), (0, 0, 0.16), "#33373e", taper=0.9)
    for sx in (-1, 1):
        h.box((0.05, 0.16, 0.14), (sx * 0.13, 0.04, 0.08), "#33373e")
    h.box((0.24, 0.05, 0.06), (0, 0.15, 0.11), DARK)
    h.box((0.22, 0.04, 0.035), (0, 0.17, 0.115), C, glow=True)
    ring(h, 0.15, 0.2, A, n=8, w=0.04, h=0.05, cy=-0.01)                            # helmet band
    # carbine
    g = m["gun"]
    GM, OL = "#3a3c42", "#55584a"
    g.box((0.06, 0.08, 0.14), (0, -0.01, -0.02), GM)                                 # grip
    g.box((0.06, 0.1, 0.16), (0, 0.04, 0.12), OL)                                    # stock stub
    g.box((0.09, 0.15, 0.32), (0, 0.06, -0.16), OL)
    g.box((0.07, 0.12, 0.1), (0, -0.06, -0.2), GM)                                   # magazine
    limb(g, (0, 0.08, -0.3), (0, 0.08, -0.75), 0.028, 0.028, GM, segs=6)
    g.box((0.08, 0.08, 0.24), (0, 0.08, -0.43), GM)                                  # handguard
    g.box((0.04, 0.05, 0.1), (0, 0.15, -0.12), GM)                                   # sight
    g.box((0.03, 0.02, 0.06), (0, 0.18, -0.12), C, glow=True)
    g.cyl(0.04, 0.05, (0, 0.08, -0.75), GM, segs=6)
    rg.muzzle = (0, 0.08, -0.75)
    rg.finish((A, B, C))


# --- bruiser: big armoured crewman with a door-slab shield ------------------------------------

def bruiser():
    A = Skin("a", "#7a6e5e")       # heavy plate
    B = Skin("b", "#3a3a46")       # suit
    C = Skin("c", "#ff8a2a")       # visor slit glow
    S, W = 1.25, 1.4
    BOOT, GLOVE, BELT = "#24252a", "#34353a", "#2a2b30"
    rg = Rig("bruiser", S, W, legs=B, top=B, sleeve=B, fore=B, boot=BOOT, glove=GLOVE, belt=BELT, seed=400)
    m = rg.m
    t = m["torso"]
    # breastplate, belly plates, back plate, gorget
    t.box((0.78, 0.44, 0.44), (0, 0.01, 0.46), A, taper=0.9)
    t.box((0.6, 0.38, 0.14), (0, 0.01, 0.2), A.shade(0.85))
    t.box((0.52, 0.34, 0.12), (0, 0.01, 0.08), A.shade(0.75))
    t.box((0.64, 0.05, 0.05), (0, 0.235, 0.36), A.shade(0.7))
    t.box((0.5, 0.08, 0.34), (0, -0.25, 0.45), A.shade(0.9))
    t.box((0.4, 0.34, 0.12), (0, 0, 0.72), A.shade(0.8))
    for sx in (-1, 1):
        for z in (0.56, 0.36):
            t.box((0.05, 0.04, 0.05), (sx * 0.28, 0.235, z), STEEL)
    # huge pauldrons, gauntlets, knee plates, plated thighs
    for sd, sx in (("l", -1), ("r", 1)):
        a = m[f"arm_{sd}"]
        a.box((0.36, 0.42, 0.16), (sx * 0.04, 0, 0.1), A, taper=0.7, rot=(0, sx * 0.25, 0))
        a.box((0.32, 0.38, 0.13), (sx * 0.09, 0, -0.04), A.shade(0.85), rot=(0, sx * 0.4, 0))
        a.box((0.06, 0.06, 0.06), (sx * 0.15, 0.15, 0.15), STEEL)
        f = m[f"fore_{sd}"]
        f.box((0.19, 0.2, 0.22), (0, 0.01, -0.17), A.shade(0.9), taper=1.1)
        f.box((0.18, 0.2, 0.18), (0, 0.01, -0.37), GLOVE)                            # bigger fists
        m[f"shin_{sd}"].box((0.18, 0.1, 0.2), (0, 0.1, -0.05), A)
        m[f"shin_{sd}"].box((0.17, 0.08, 0.26), (0, 0.11, -0.3), A.shade(0.85))
        m[f"thigh_{sd}"].box((0.2, 0.1, 0.3), (0, 0.1, -0.22), A.shade(0.8))
    m["hips"].box((0.6, 0.4, 0.1), (0, 0, -0.06), A.shade(0.75))
    m["hips"].box((0.3, 0.06, 0.22), (0, 0.2, -0.16), A.shade(0.7))                  # codpiece plate
    # helm: a bucket with a glowing slit, sunk between the shoulders
    h = m["head"]
    h.box((0.34, 0.36, 0.34), (0, 0.0, 0.14), A.shade(0.95), taper=0.82)
    h.box((0.36, 0.38, 0.06), (0, 0.0, 0.0), A.shade(0.75))
    h.box((0.26, 0.04, 0.05), (0, 0.18, 0.17), C, glow=True)
    h.box((0.04, 0.05, 0.22), (0, 0.18, 0.06), A.shade(0.7))
    h.box((0.06, 0.3, 0.06), (0, -0.01, 0.33), A.shade(0.7))
    # shock baton: a heavy club with glowing rings
    g = m["gun"]
    limb(g, (0, 0, 0.1), (0, 0, -0.35), 0.045, 0.045, DARK, segs=6)
    g.box((0.12, 0.12, 0.05), (0, 0, -0.1), STEEL)                                   # guard
    limb(g, (0, 0, -0.35), (0, 0, -0.78), 0.085, 0.1, "#45484f", segs=7)
    for z in (-0.45, -0.58, -0.71):
        g.cyl(0.108, 0.035, (0, 0, z), C, segs=7, glow=True)
    g.cyl(0.075, 0.06, (0, 0, -0.84), STEEL, segs=7)
    rg.muzzle = (0, 0, -0.84)
    # the shield: a slab of cargo door, held at the front-left of the chest
    sh = Model("bruiser__shield", seed=401)
    SW, SH, T = 1.1, 1.3, 0.12
    zc = -0.33                                     # slab centre below the grip
    sh.box((SW, T, SH), (0, 0.06, zc), A.shade(0.9))
    sh.box((SW - 0.12, 0.04, SH - 0.12), (0, 0.13, zc), A)                          # face plate
    for sx in (-1, 1):
        sh.box((0.08, 0.08, SH), (sx * (SW / 2 - 0.02), 0.11, zc), A.shade(0.65))   # edge ribs
    stripes(sh, (SW - 0.12, 0.05, 0.1), (0, 0.15, zc + SH / 2 - 0.12), 7)
    sh.box((SW - 0.16, 0.05, 0.07), (0, 0.16, zc - 0.1), C, glow=True)              # glowing stripe
    sh.box((0.34, 0.05, 0.07), (0.12, 0.16, zc + 0.3), DARK)                         # view slot
    for x in (-0.42, -0.14, 0.14, 0.42):
        for z in (zc + 0.5, zc - 0.55):
            sh.box((0.05, 0.04, 0.05), (x, 0.165, z), STEEL)
    sh.box((0.2, 0.05, 0.14), (-0.28, 0.16, zc + 0.12), A.shade(0.7), rot=(0, 0.4, 0))  # dents
    sh.box((0.16, 0.05, 0.1), (0.3, 0.16, zc - 0.32), A.shade(0.7), rot=(0, -0.3, 0))
    sh.box((0.16, 0.12, 0.1), (0, -0.04, 0.0), DARK)                                 # grip bracket
    rg.extra["shield"] = (sh, "torso", (-0.15, 0.35, 0.25))
    rg.finish((A, B, C))


# --- kelter: the Kelterage's bounty hunters ---------------------------------------------------

def kelter():
    COAT, COAT2 = "#5a5e66", "#464a52"
    SASH, RED = "#7e1f22", "#b8262a"
    EYE = "#ff2a2a"
    PANTS, BOOT, GLOVE, BELT = "#2c2e34", "#222328", "#2a2b30", "#1e1e22"
    CABLE = "#3a3434"
    rg = Rig("kelter", legs=PANTS, top=COAT, sleeve=COAT, fore=COAT, boot=BOOT, glove=GLOVE, belt=BELT, seed=500)
    m = rg.m
    hp, t, h = m["hips"], m["torso"], m["head"]
    # long coat: skirts hang from the hips (back and sides, open front), a red sash at the waist
    hp.box((0.46, 0.06, 0.62), (0, -0.155, -0.3), COAT2, taper=0.82)
    for sx in (-1, 1):
        hp.box((0.06, 0.26, 0.58), (sx * 0.235, -0.02, -0.28), COAT2, taper=0.85)
        hp.box((0.12, 0.05, 0.5), (sx * 0.17, 0.13, -0.25), COAT2)
    hp.box((0.47, 0.32, 0.1), (0, 0, 0.05), SASH)
    hp.box((0.08, 0.04, 0.3), (-0.12, 0.165, -0.12), SASH, rot=(0, 0.15, 0))      # sash tail
    # cable reel on the right hip with a hook clipped to it
    hp.cyl(0.15, 0.1, (0.24, -0.02, -0.04), IRON, segs=8, rot=(0, PI / 2, 0))
    hp.cyl(0.11, 0.12, (0.23, -0.02, -0.04), CABLE, segs=8, rot=(0, PI / 2, 0))
    hp.cyl(0.04, 0.14, (0.25, -0.02, -0.04), RED, segs=6, rot=(0, PI / 2, 0))
    # coat body: lapels, a diagonal red sash, a high collar
    t.box((0.5, 0.32, 0.12), (0, 0, 0.02), COAT2)
    t.box((0.06, 0.32, 0.5), (0, 0, 0.3), SASH, rot=(0, 0.75, 0))
    for sx in (-1, 1):
        t.box((0.1, 0.04, 0.32), (sx * 0.08, 0.15, 0.36), COAT2, rot=(0, sx * 0.25, 0))
    ring(t, 0.13, 0.6, COAT2, n=7, w=0.06, h=0.16)
    t.box((0.26, 0.06, 0.14), (0, 0.12, 0.6), COAT2)                                # mask-collar front
    # a bigger reel on the back: the collector's winch, red hub, cable coil
    t.cyl(0.19, 0.12, (0, -0.16, 0.36), IRON, segs=8, rot=(PI / 2, 0, 0))
    t.cyl(0.15, 0.14, (0, -0.17, 0.36), CABLE, segs=8, rot=(PI / 2, 0, 0))
    t.cyl(0.06, 0.16, (0, -0.18, 0.36), RED, segs=6, rot=(PI / 2, 0, 0))
    # the sign on the left shoulder: iron ring + hook on red
    for sd, sx in (("l", -1), ("r", 1)):
        a = m[f"arm_{sd}"]
        a.box((0.2, 0.28, 0.1), (sx * 0.03, 0, 0.07), IRON, taper=0.75, rot=(0, sx * 0.25, 0))
        a.box((0.03, 0.29, 0.03), (sx * 0.1, 0, 0.04), RED)
        m[f"fore_{sd}"].cyl(0.09, 0.08, (0, 0, -0.16), COAT2, segs=7)               # coat cuffs
    a = m["arm_l"]
    a.box((0.04, 0.16, 0.16), (-0.1, 0, -0.1), RED)
    ring(a, 0.045, -0.08, IRON, n=6, w=0.025, h=0.02, cx=-0.125, axis="x")
    a.box((0.015, 0.02, 0.1), (-0.125, 0.0, -0.13), IRON)
    a.box((0.015, 0.05, 0.02), (-0.125, 0.025, -0.17), IRON)
    # head: hood, iron mask, one red lamp eye
    h.ball(0.17, (0, -0.03, 0.17), COAT2, subdiv=1, scale=(1.0, 1.15, 1.05))      # hood
    h.box((0.08, 0.12, 0.1), (0, -0.17, 0.22), COAT2, rot=(-0.6, 0, 0))            # hood peak
    h.box((0.05, 0.36, 0.04), (0, -0.03, 0.33), RED, taper=0.7)                     # red seam
    h.ball(0.13, (0, 0.05, 0.14), IRON, subdiv=1, scale=(0.95, 0.9, 1.1))          # mask
    h.box((0.2, 0.06, 0.04), (0, 0.15, 0.08), DARK)                                 # breather slit
    for x in (-0.05, 0.0, 0.05):
        h.box((0.02, 0.07, 0.06), (x, 0.15, 0.06), "#6a6e76")
    h.cyl(0.05, 0.05, (0.05, 0.14, 0.17), DARK, segs=6, rot=(-PI / 2, 0, 0))
    h.cyl(0.04, 0.03, (0.05, 0.19, 0.17), EYE, segs=6, rot=(-PI / 2, 0, 0), glow=True)
    h.box((0.06, 0.04, 0.03), (-0.05, 0.15, 0.17), DARK)                           # dead eye
    # hook launcher: iron body, cable spool, harpoon with a barbed hook head
    g = m["gun"]
    g.box((0.07, 0.08, 0.14), (0, -0.01, -0.02), DARK)
    g.box((0.11, 0.17, 0.36), (0, 0.06, -0.18), IRON)
    g.box((0.12, 0.04, 0.3), (0, 0.15, -0.18), RED)
    g.cyl(0.08, 0.13, (0, -0.06, -0.24), CABLE, segs=7, rot=(0, PI / 2, 0))
    g.cyl(0.08, 0.13, (-0.065, -0.06, -0.24), CABLE, segs=7, rot=(0, PI / 2, 0))
    limb(g, (0, 0.06, -0.34), (0, 0.06, -0.62), 0.045, 0.045, DARK, segs=6)
    g.cyl(0.06, 0.04, (0, 0.06, -0.62), RED, segs=6)
    limb(g, (0, 0.06, -0.62), (0, 0.06, -0.72), 0.02, 0.02, STEEL, segs=4)
    # the hook head: a point and three barbs swept back
    limb(g, (0, 0.06, -0.68), (0, 0.06, -0.82), 0.035, 0.0, STEEL, segs=5)
    for k in range(3):
        a_ = TAU * k / 3
        dx, dy = math.cos(a_) * 0.09, math.sin(a_) * 0.09
        limb(g, (0, 0.06, -0.73), (dx, 0.06 + dy, -0.66), 0.018, 0.008, STEEL, segs=4)
    rg.muzzle = (0, 0.06, -0.82)
    rg.finish(HULL_PREVIEW)


# ==============================================================================================
# Props
# ==============================================================================================

def deck_crate(v):
    kind = "deck_crate"
    r = root(kind, v)
    m = Model(f"{kind}_body_{v}", seed=1000 + v)
    W, D, H, LID = 1.5, 1.0, 0.9, 0.18
    hb = H - LID
    if v == 0:
        # ribbed hull-paint crate: dark corner posts, vertical ribs, a stencil band
        m.box((W, D, hb), (0, 0, hb / 2), HA)
        for x in (-0.45, -0.15, 0.15, 0.45):
            for y in (-1, 1):
                m.box((0.07, 0.06, hb - 0.04), (x, y * (D / 2 + 0.02), hb / 2), HA.shade(0.75))
        for x in (-1, 1):
            for y in (-0.25, 0.25):
                m.box((0.06, 0.07, hb - 0.04), (x * (W / 2 + 0.02), y, hb / 2), HA.shade(0.75))
        for x in (-1, 1):
            for y in (-1, 1):
                m.box((0.12, 0.12, hb + 0.02), (x * (W / 2 - 0.03), y * (D / 2 - 0.03), hb / 2), IRON)
        m.box((W + 0.02, D + 0.02, 0.06), (0, 0, 0.04), DARK)
        m.box((0.34, 0.02, 0.1), (-0.48, D / 2 + 0.05, 0.56), "#d8d2c0")             # stencil
    else:
        # a framed crate: steel frame, X-braced sides, hazard band
        m.box((W - 0.1, D - 0.1, hb - 0.04), (0, 0, hb / 2), HA.shade(0.9))
        for x in (-1, 1):
            for y in (-1, 1):
                m.box((0.1, 0.1, hb), (x * (W / 2 - 0.05), y * (D / 2 - 0.05), hb / 2), STEEL)
        for z in (0.05, hb - 0.05):
            for y in (-1, 1):
                m.box((W, 0.1, 0.1), (0, y * (D / 2 - 0.05), z), STEEL)
            for x in (-1, 1):
                m.box((0.1, D, 0.1), (x * (W / 2 - 0.05), 0, z), STEEL)
        for x in (-1, 1):
            for s in (-1, 1):
                m.box((0.05, 0.06, 0.95), (x * (W / 2 - 0.03), 0, hb / 2), STEEL, rot=(s * 0.62, 0, 0))
        stripes(m, (W - 0.3, 0.03, 0.1), (0.05, -(D / 2 - 0.02), 0.5), 8)
    m.build(parent=r)
    # lid, hinged along its back edge
    lid = Model(f"{kind}__lid", seed=1010 + v)
    if v == 0:
        lid.box((W + 0.04, D + 0.04, LID), (0, D / 2, LID / 2), HA.shade(0.9))
        lid.box((W - 0.3, D - 0.3, 0.05), (0, D / 2, LID + 0.02), HA)
        for x in (-0.5, 0.5):
            lid.box((0.08, D + 0.06, 0.06), (x, D / 2, LID + 0.01), IRON)
        lid.box((0.3, 0.06, 0.08), (0, D + 0.04, LID - 0.04), IRON)                  # hasp
    else:
        lid.box((W, D, LID * 0.8), (0, D / 2, LID * 0.4), HA.shade(0.8))
        lid.box((W - 0.2, D - 0.2, 0.06), (0, D / 2, LID * 0.8 + 0.02), HA)
        stripes(lid, (W - 0.2, 0.12, 0.04), (0, D / 2, LID * 0.8 + 0.06), 9, axis="x")
        for x in (-1, 1):
            lid.box((0.12, 0.08, 0.06), (x * 0.5, -0.02, 0.06), DARK)               # hinges
    part(kind, "lid", lid, r, (0, -D / 2, hb))
    # lock panel on the front face
    lk = Model(f"{kind}__lock", seed=1020 + v)
    lk.box((0.3, 0.06, 0.26), (0, 0.03, 0), DARK)
    lk.box((0.2, 0.04, 0.12), (0, 0.07, 0.03), TEAL, glow=True)
    lk.box((0.06, 0.04, 0.05), (0, 0.07, -0.08), TEAL, glow=True)
    part(kind, "lock", lk, r, (0.0 if v == 0 else -0.2, D / 2 + 0.02, 0.48 if v == 0 else 0.4))
    kit.light(r, (0, D / 2 + 0.3, 0.5), TEAL, 1.5, 0.5)


def deck_strongbox():
    kind = "deck_strongbox"
    r = root(kind)
    m = Model(f"{kind}_body", seed=1100)
    W, D, H, LID = 1.1, 0.8, 0.75, 0.22
    hb = H - LID
    IR = "#3c3d46"
    m.box((W, D, hb), (0, 0, hb / 2), IR)
    m.box((W + 0.06, D + 0.06, 0.08), (0, 0, 0.04), DARK)
    for x in (-0.36, 0.36):
        m.box((0.1, D + 0.04, hb), (x, 0, hb / 2), GOLD)
    m.box((W + 0.03, D + 0.03, 0.06), (0, 0, hb - 0.03), GOLD)
    for x in (-1, 1):                                                               # carry handles
        m.box((0.05, 0.3, 0.06), (x * (W / 2 + 0.05), 0, hb - 0.16), IRON)
    m.cyl(0.11, 0.05, (0, D / 2, 0.27), DARK, segs=8, rot=(-PI / 2, 0, 0))
    m.cyl(0.08, 0.04, (0, D / 2 + 0.03, 0.27), GOLD, segs=8, rot=(-PI / 2, 0, 0), glow=True)
    m.box((0.02, 0.03, 0.08), (0, D / 2 + 0.08, 0.3), DARK)
    for x in (-0.2, 0.2):
        m.box((0.05, 0.03, 0.05), (x, D / 2 + 0.01, 0.4), GOLD)
    m.build(parent=r)
    lid = Model(f"{kind}__lid", seed=1101)
    lid.box((W + 0.03, D + 0.03, LID * 0.6), (0, D / 2, LID * 0.3), IR)
    lid.box((W - 0.04, D - 0.12, LID * 0.5), (0, D / 2, LID * 0.6 + LID * 0.2), IR, taper=0.8)
    for x in (-0.36, 0.36):
        lid.box((0.1, D + 0.05, LID * 0.6 + 0.02), (x, D / 2, LID * 0.3), GOLD)
        lid.box((0.1, D - 0.1, 0.06), (x, D / 2, LID * 1.04), GOLD)
    lid.box((0.16, 0.06, 0.12), (0, D + 0.02, LID * 0.25), GOLD)                     # latch
    lid.box((0.3, 0.1, 0.05), (0, D / 2, LID + 0.02), "#2a2b30")                     # top handle
    part(kind, "lid", lid, r, (0, -D / 2, hb))
    kit.light(r, (0, D / 2 + 0.2, 0.4), GOLD, 1.4, 0.5)


def deck_core():
    kind = "deck_core"
    r = root(kind)
    m = Model(f"{kind}_cradle", seed=1200)
    # base: an octagon plinth with a glowing ring channel
    oct8 = [(math.cos(TAU * (i + 0.5) / 8) * 0.95, math.sin(TAU * (i + 0.5) / 8) * 0.95) for i in range(8)]
    oct7 = [(x * 0.8, y * 0.8) for x, y in oct8]
    m.slab(oct8, 0, 0.18, IRON, top=[(x * 0.96, y * 0.96) for x, y in oct8])
    m.slab(oct7, 0.18, 0.32, DARK, top=[(x * 0.9, y * 0.9) for x, y in oct7])
    ring(m, 0.5, 0.33, "#bff8ea", n=10, w=0.06, h=0.04, glow=True)
    m.cyl(0.32, 0.2, (0, 0, 0.32), STEEL, segs=8, r_top=0.24)                         # cup
    m.cyl(0.26, 0.06, (0, 0, 0.52), DARK, segs=8)
    # four clamp arms curling up and in around the heart
    for k in range(4):
        a = TAU * (k + 0.5) / 4
        c, s = math.cos(a), math.sin(a)
        p0 = (c * 0.72, s * 0.72, 0.3)
        p1 = (c * 0.84, s * 0.84, 0.8)
        p2 = (c * 0.5, s * 0.5, 1.22)
        limb(m, p0, p1, 0.11, 0.09, HA, segs=6)
        m.ball(0.11, p1, IRON, subdiv=1)
        limb(m, p1, p2, 0.09, 0.07, HA, segs=6)
        m.box((0.22, 0.14, 0.14), (c * 0.44, s * 0.44, 1.24), IRON, rot=(0, 0, a))     # clamp jaw
        m.box((0.24, 0.24, 0.3), (c * 0.72, s * 0.72, 0.3), IRON, rot=(0, 0, a))      # hydraulic foot
        # cables trailing across the floor
        pts = [(c * 0.85, s * 0.85, 0.12), (c * 1.1 + s * 0.12, s * 1.1 - c * 0.12, 0.05),
               (c * 1.2 + s * 0.4, s * 1.2 - c * 0.4, 0.05)]
        for p0, p1 in zip(pts, pts[1:]):
            limb(m, p0, p1, 0.05, 0.05, BLACK, segs=5)
            m.ball(0.052, p1, BLACK, subdiv=0)
    # a hazard collar on the front, a gauge
    stripes(m, (0.9, 0.04, 0.08), (0, -0.86, 0.12), 7, axis="x")
    m.box((0.2, 0.08, 0.14), (0.5, 0.75, 0.25), DARK)
    m.box((0.12, 0.04, 0.08), (0.5, 0.8, 0.27), HC, glow=True)
    m.build(parent=r)
    # the heart: a pale, lumpy, glowing mould core
    h = Model(f"{kind}__heart", seed=1201)
    PALE, MINT, SEA = "#dafff2", "#6ee6c6", "#24806e"
    h.ball(0.32, (0, 0, 0), PALE, subdiv=1, jitter=0.04, glow=True, scale=(1.0, 0.92, 1.05))
    rng = h.rng
    for i in range(9):
        a = TAU * i / 9 + rng.uniform(-0.3, 0.3)
        el = rng.uniform(-0.7, 0.9)
        rr = 0.27
        p = (math.cos(a) * math.cos(el) * rr, math.sin(a) * math.cos(el) * rr, math.sin(el) * rr)
        h.ball(rng.uniform(0.09, 0.15), p, MINT if i % 3 else PALE, subdiv=1, jitter=0.02, glow=True)
    for i in range(7):                                                               # darker veins
        a = TAU * i / 7 + 0.4
        p0 = (math.cos(a) * 0.22, math.sin(a) * 0.22, -0.18)
        p1 = (math.cos(a + 0.5) * 0.3, math.sin(a + 0.5) * 0.3, 0.12)
        limb(h, p0, p1, 0.045, 0.03, SEA, segs=4)
    for i in range(4):                                                               # root tendrils
        a = TAU * i / 4 + 0.2
        limb(h, (math.cos(a) * 0.12, math.sin(a) * 0.12, -0.2),
             (math.cos(a) * 0.26, math.sin(a) * 0.26, -0.42), 0.05, 0.015, MINT, segs=4)
    hobj = part(kind, "heart", h, r, (0, 0, 1.0))
    kit.light(hobj, (0, 0, 0), "#c8fff0", 4.0, 1.2, flicker=0.15)


def deck_console(v):
    kind = "deck_console"
    r = root(kind, v)
    m = Model(f"{kind}_{v}", seed=1300 + v)
    if v == 0:
        # a desk with a slanted keyboard deck and an upright screen
        m.box((1.2, 0.6, 0.75), (0, 0, 0.375), HA.shade(0.8))
        m.box((1.24, 0.64, 0.05), (0, 0, 0.04), DARK)
        m.box((1.0, 0.04, 0.45), (0, 0.31, 0.35), HA.shade(0.6))
        m.box((1.2, 0.5, 0.08), (0, 0.06, 0.82), HA, rot=(0.35, 0, 0))
        for i in range(6):
            m.box((0.12, 0.08, 0.04), (-0.4 + i * 0.16, 0.14, 0.86), DARK if i % 2 else STEEL, rot=(0.35, 0, 0))
        m.box((0.1, 0.06, 0.04), (0.45, 0.0, 0.92), HC, rot=(0.35, 0, 0), glow=True)
        m.box((0.9, 0.12, 0.55), (0, -0.2, 1.15), IRON)
        m.box((0.78, 0.04, 0.42), (0, -0.13, 1.17), CYAN, glow=True)
        m.box((0.6, 0.05, 0.04), (0, -0.1, 1.24), "#2a6a80")                         # scan lines
        m.box((0.4, 0.05, 0.04), (-0.1, -0.1, 1.08), "#2a6a80")
        m.box((0.08, 0.08, 0.3), (0, -0.24, 0.85), DARK)
    else:
        # a round radar pedestal with a hood
        m.cyl(0.4, 0.1, (0, 0, 0), DARK, segs=8)
        m.cyl(0.25, 0.65, (0, 0, 0.1), HA.shade(0.8), segs=8, r_top=0.2)
        m.cyl(0.6, 0.16, (0, 0, 0.75), HA, segs=10)
        m.cyl(0.52, 0.04, (0, 0, 0.91), "#2a2414", segs=10)
        for rr in (0.2, 0.4):
            ring(m, rr, 0.94, "#8a6a2a", n=10, w=0.025, h=0.02)
        for i in range(2):
            m.box((0.95, 0.025, 0.02), (0, 0, 0.94), "#8a6a2a", rot=(0, 0, i * PI / 2))
        m.box((0.48, 0.07, 0.03), (0.2, 0.1, 0.95), AMBER, rot=(0, 0, 0.45), glow=True)   # sweep
        m.cyl(0.05, 0.03, (-0.22, 0.2, 0.94), "#fff0c0", segs=6, glow=True)               # blips
        m.cyl(0.04, 0.03, (0.15, -0.28, 0.94), "#fff0c0", segs=6, glow=True)
        m.box((1.2, 0.18, 0.1), (0, 0.55, 0.85), HA.shade(0.7))
        for x in (-0.4, -0.15, 0.15, 0.4):
            m.box((0.12, 0.1, 0.06), (x, 0.55, 0.92), DARK if x < 0 else STEEL)
            m.box((0.06, 0.04, 0.03), (x, 0.6, 0.96), HC, glow=True)
        m.box((0.12, 0.12, 0.75), (-0.55, 0.55, 0.375), DARK)
        m.box((0.12, 0.12, 0.75), (0.55, 0.55, 0.375), DARK)
    m.build(parent=r)


def deck_alarm():
    kind = "deck_alarm"
    r = root(kind)
    m = Model(f"{kind}_body", seed=1400)
    m.box((0.6, 0.06, 1.4), (0, 0.03, 0.7), DARK)                                     # wall plate
    m.box((0.5, 0.22, 0.9), (0, 0.13, 0.75), HA.shade(0.85))
    m.box((0.44, 0.04, 0.4), (0, 0.25, 0.95), IRON)
    stripes(m, (0.5, 0.04, 0.1), (0, 0.25, 0.32), 5, axis="x")
    m.cyl(0.13, 0.06, (0, 0.24, 0.62), BLACK, segs=8, rot=(-PI / 2, 0, 0))
    m.cyl(0.11, 0.1, (0, 0.27, 0.62), REDGLOW, segs=8, rot=(-PI / 2, 0, 0), glow=True)  # big button
    m.box((0.06, 0.06, 0.06), (0.15, 0.27, 1.05), STEEL)                             # lever pivot
    limb(m, (0.15, 0.27, 1.05), (0.15, 0.4, 0.86), 0.025, 0.025, STEEL, segs=4)
    m.ball(0.05, (0.15, 0.41, 0.84), REDGLOW, subdiv=0, glow=True)
    m.box((0.18, 0.04, 0.12), (-0.08, 0.26, 1.02), "#d8d2c0")                        # label
    m.box((0.24, 0.16, 0.06), (0, 0.1, 1.24), IRON)
    m.build(parent=r)
    lamp = Model(f"{kind}__lamp", seed=1401)
    lamp.cyl(0.11, 0.05, (0, 0, 0), IRON, segs=8)
    lamp.cyl(0.09, 0.16, (0, 0, 0.05), REDGLOW, segs=8, r_top=0.06, glow=True)
    for k in range(4):
        lamp.box((0.02, 0.2, 0.02), (0, 0, 0.12), IRON, rot=(0, 0, k * PI / 4))
    lo = part(kind, "lamp", lamp, r, (0, 0.12, 1.27))
    kit.light(lo, (0, 0, 0.1), "#ff3a2a", 3.0, 1.0)


def deck_locker():
    kind = "deck_locker"
    r = root(kind)
    m = Model(kind, seed=1500)
    W, D, H = 1.6, 0.5, 1.9
    m.box((W, D, H), (0, 0, H / 2), HA.shade(0.75))
    m.box((W + 0.04, D + 0.04, 0.06), (0, 0, H + 0.02), DARK)
    m.box((W + 0.04, D + 0.04, 0.08), (0, 0, 0.04), DARK)
    dw = W / 3
    for i in range(3):
        x = -W / 2 + dw * (i + 0.5)
        if i == 2:
            # ajar: the door swung out, dark inside, a jacket hanging
            m.box((dw - 0.06, 0.02, H - 0.2), (x, D / 2 - 0.02, H / 2), BLACK)
            m.box((0.2, 0.08, 0.5), (x - 0.02, D / 2 - 0.1, 1.25), "#5a5040")
            m.box((0.03, dw - 0.06, H - 0.24), (x + dw / 2 - 0.02, D / 2 + (dw - 0.06) / 2 * 0.95, H / 2),
                  HA.shade(0.95), rot=(0, 0, -0.35))
            continue
        m.box((dw - 0.06, 0.03, H - 0.2), (x, D / 2 + 0.01, H / 2), HA.shade(0.95))
        for z in (1.55, 1.48, 1.41):                                                 # vents
            m.box((dw - 0.2, 0.04, 0.03), (x, D / 2 + 0.03, z), DARK)
        m.box((0.04, 0.04, 0.16), (x + dw / 2 - 0.1, D / 2 + 0.04, 1.0), STEEL)     # handle
        m.box((0.1, 0.03, 0.06), (x, D / 2 + 0.03, 1.72), "#d8d2c0")                 # name tag
    m.box((0.2, 0.04, 0.24), (-0.32, D / 2 + 0.03, 0.5), HA.shade(0.65), rot=(0, 0.3, 0))  # dent
    m.box((0.16, 0.04, 0.16), (0.08, D / 2 + 0.03, 1.2), HA.shade(0.65), rot=(0, -0.4, 0))
    m.box((0.4, 0.3, 0.12), (-0.4, 0, H + 0.11), "#6a5a44", rot=(0, 0, 0.2))        # stuff on top
    m.build(parent=r)


def deck_bunk():
    kind = "deck_bunk"
    r = root(kind)
    m = Model(kind, seed=1600)
    W, D = 2.0, 0.9
    for x in (-1, 1):
        for y in (-1, 1):
            m.box((0.08, 0.08, 1.7), (x * (W / 2 - 0.04), y * (D / 2 - 0.04), 0.85), STEEL)
    for z, blanket, fold in ((0.3, "#5a6a58", "#7a8a70"), (1.15, "#6a4e5a", "#8a6a74")):
        m.box((W, D, 0.08), (0, 0, z), IRON)
        m.box((W - 0.16, D - 0.12, 0.12), (0, 0, z + 0.1), "#c8c0aa")               # mattress
        m.box((1.25, D - 0.08, 0.1), (0.3, 0, z + 0.16), blanket)
        m.box((0.3, D - 0.06, 0.12), (-0.25, 0, z + 0.18), fold, rot=(0, 0.1, 0))
        m.box((0.32, 0.5, 0.1), (-0.72, 0, z + 0.2), "#e2dccb")                      # pillow
    for z in (0.5, 0.75):                                                            # ladder
        m.box((0.4, 0.04, 0.04), (0.7, D / 2 + 0.02, z), STEEL)
    m.box((0.04, 0.04, 1.2), (0.52, D / 2 + 0.02, 0.6), STEEL)
    m.box((0.04, 0.04, 1.2), (0.88, D / 2 + 0.02, 0.6), STEEL)
    m.box((W, 0.06, 0.18), (0, -(D / 2 - 0.03), 1.42), STEEL)                       # rail
    m.box((0.3, 0.2, 0.25), (0.6, 0.0, 0.12), "#6a5a44")                             # bag under it
    m.build(parent=r)


def deck_table():
    kind = "deck_table"
    r = root(kind)
    m = Model(kind, seed=1700)
    W, D = 2.2, 1.0
    m.box((W, D, 0.08), (0, 0, 0.76), "#7a6650")
    m.box((W + 0.04, D + 0.04, 0.04), (0, 0, 0.71), IRON)
    for x in (-0.85, 0.85):
        m.box((0.12, 0.6, 0.7), (x, 0, 0.36), IRON, taper=0.6)
        m.box((0.16, 0.8, 0.05), (x, 0, 0.03), DARK)
    for y in (-1, 1):                                                                # benches
        m.box((W - 0.1, 0.32, 0.07), (0, y * 0.78, 0.45), "#6a5644")
        for x in (-0.8, 0.8):
            m.box((0.08, 0.2, 0.42), (x, y * 0.78, 0.21), IRON)
    # mugs, plates, a bottle, a deck of cards
    for x, y in ((-0.6, 0.25), (0.35, -0.25), (0.75, 0.2)):
        m.cyl(0.07, 0.13, (x, y, 0.8), "#c8c0aa", segs=6)
        m.cyl(0.055, 0.02, (x, y, 0.92), "#3a2a20", segs=6)
    for x, y in ((-0.2, 0.25), (0.1, -0.22), (-0.75, -0.22)):
        m.cyl(0.16, 0.025, (x, y, 0.8), "#d8d4c8", segs=8)
        m.ball(0.06, (x + 0.02, y, 0.84), "#9a7a4a", subdiv=0)
    m.cyl(0.05, 0.22, (0.5, -0.05, 0.8), "#4a7a5a", segs=6, r_top=0.03)
    m.box((0.12, 0.16, 0.03), (-0.35, -0.05, 0.815), "#e8e0c8", rot=(0, 0, 0.3))
    m.build(parent=r)


def deck_canister():
    kind = "deck_canister"
    r = root(kind)
    m = Model(kind, seed=1800)
    R, H = 0.55, 1.1
    RED_, RED2 = "#c8281e", "#9a1e18"
    m.cyl(R, H - 0.1, (0, 0, 0.05), RED_, segs=10)
    m.cyl(R * 0.95, 0.05, (0, 0, 0), DARK, segs=10)
    m.cyl(R * 0.85, 0.1, (0, 0, H - 0.05), RED2, segs=10, r_top=R * 0.6)             # shoulder
    # two hazard bands: yellow with black chevron blocks
    for z in (0.22, 0.72):
        m.cyl(R + 0.02, 0.16, (0, 0, z), HAZ, segs=10)
        for k in range(10):
            a = TAU * (k + 0.5) / 10
            if k % 2:
                m.box((0.16, 0.05, 0.17), (math.cos(a) * (R + 0.025), math.sin(a) * (R + 0.025), z + 0.08), BLACK,
                      rot=(0, 0, a + PI / 2))
    # a flame stencil on the front, valve wheel on top, amber pressure lamp
    m.box((0.22, 0.04, 0.2), (0, R + 0.01, 0.52), HAZ, rot=(0, PI / 4, 0))
    m.box((0.1, 0.05, 0.1), (0, R + 0.03, 0.52), BLACK, rot=(0, PI / 4, 0))
    m.cyl(0.1, 0.16, (0, 0, H), STEEL, segs=6)
    ring(m, 0.17, H + 0.18, DARK, n=6, w=0.04, h=0.04)
    for k in range(3):
        m.box((0.34, 0.03, 0.03), (0, 0, H + 0.18), DARK, rot=(0, 0, k * PI / 3))
    m.cyl(0.07, 0.08, (0.32, 0.12, H - 0.06), DARK, segs=6)
    m.ball(0.06, (0.32, 0.12, H + 0.04), AMBER, subdiv=1, glow=True)
    m.build(parent=r)
    kit.light(r, (0.32, 0.12, H + 0.1), AMBER, 1.5, 0.6, flicker=0.3)


def deck_barrel(v):
    kind = "deck_barrel"
    r = root(kind, v)
    m = Model(f"{kind}_{v}", seed=1900 + v)
    if v == 0:
        # a single olive drum, dented, lid with a bung
        C0, C1 = "#5e6a48", "#4a5438"
        m.cyl(0.38, 1.0, (0, 0, 0), C0, segs=8)
        for z in (0.0, 0.32, 0.64, 0.96):
            m.cyl(0.4, 0.05, (0, 0, z), C1, segs=8)
        m.cyl(0.3, 0.02, (0, 0, 1.0), C1, segs=8)
        m.cyl(0.06, 0.04, (0.15, 0.1, 1.0), DARK, segs=6)
        m.box((0.24, 0.04, 0.2), (0.0, 0.38, 0.5), "#d8d2c0")                        # stencil
        m.box((0.18, 0.06, 0.16), (-0.3, -0.24, 0.45), RUSTP, rot=(0, 0, 0.6))
    else:
        # two blue-grey drums, one tipped on its side
        C0, C1 = "#4a5e72", "#384858"
        m.cyl(0.33, 0.9, (-0.3, 0.1, 0), C0, segs=8)
        for z in (0.0, 0.44, 0.86):
            m.cyl(0.35, 0.05, (-0.3, 0.1, z), C1, segs=8)
        m.cyl(0.33, 0.9, (0.1, -0.4, 0.33), C0, segs=8, rot=(0, PI / 2, 0.4))
        m.cyl(0.35, 0.05, (0.1, -0.4, 0.33), C1, segs=8, rot=(0, PI / 2, 0.4))
        m.cyl(0.35, 0.05, (0.53, -0.22, 0.33), C1, segs=8, rot=(0, PI / 2, 0.4))
        m.box((0.6, 0.4, 0.03), (0.6, 0.0, 0.015), "#2a2a24", rot=(0, 0, 0.3))       # spill
    m.build(parent=r)


def deck_cargo(v):
    kind = "deck_cargo"
    r = root(kind, v)
    m = Model(f"{kind}_{v}", seed=2000 + v)
    WOOD, WOOD2, SACK, SACK2 = "#8a6e4a", "#6e5638", "#b8a47a", "#9a8862"
    if v == 0:
        # stacked boxes, strapped
        m.box((0.6, 0.5, 0.45), (-0.28, 0.0, 0.225), WOOD)
        m.box((0.5, 0.5, 0.4), (0.32, 0.05, 0.2), "#7a8288")
        m.box((0.55, 0.45, 0.38), (-0.2, 0.05, 0.64), WOOD2, rot=(0, 0, 0.15))
        m.box((0.32, 0.3, 0.26), (0.32, -0.02, 0.53), WOOD)
        m.box((0.62, 0.04, 0.47), (-0.28, 0.25, 0.225), "#3e3a30")
        m.box((0.04, 0.52, 0.86), (-0.15, 0, 0.42), "#c88a2a")                       # strap
        m.box((0.3, 0.3, 0.2), (0.15, 0.45, 0.1), WOOD2, rot=(0, 0, 0.5))
    else:
        # sacks heaped against a box
        m.box((0.5, 0.5, 0.5), (0.35, -0.15, 0.25), WOOD)
        m.box((0.52, 0.04, 0.06), (0.35, 0.11, 0.4), WOOD2)
        for x, y, z, rot in ((-0.3, 0.1, 0.18, 0.2), (-0.1, -0.25, 0.18, -0.4), (-0.25, -0.05, 0.45, 0.9),
                             (0.1, 0.3, 0.16, 1.2)):
            m.ball(0.26, (x, y, z), SACK if rot > 0 else SACK2, subdiv=1, scale=(1.3, 0.9, 0.7), jitter=0.03,
                   rot=(0, 0, rot))
            m.box((0.08, 0.1, 0.08), (x + math.cos(rot) * 0.33, y + math.sin(rot) * 0.33, z + 0.02), "#6a5a3a",
                  rot=(0, 0, rot))
        m.box((0.2, 0.04, 0.18), (0.35, 0.11, 0.2), "#d8d2c0")
    m.build(parent=r)


def deck_engine():
    kind = "deck_engine"
    r = root(kind)
    m = Model(kind, seed=2100)
    HOT, HOT2 = "#ff8a2a", "#ffc860"
    # plinth with a hazard border
    m.box((4.5, 3.0, 0.25), (0, 0, 0.125), DARK)
    for y in (-1, 1):
        stripes(m, (4.3, 0.12, 0.04), (0, y * 1.38, 0.26), 17, axis="x")
    # two cradles holding the big drum along x
    for x in (-1.2, 1.2):
        m.box((0.5, 2.2, 0.8), (x, 0, 0.6), IRON, taper=0.8)
    m.cyl(0.95, 3.2, (-1.6, 0, 1.15), IRON, segs=10, rot=(0, PI / 2, 0))
    for x in (-1.5, -0.55, 0.55, 1.5):
        m.cyl(1.0, 0.14, (x - 0.07, 0, 1.15), STEEL, segs=10, rot=(0, PI / 2, 0))
    # glowing vents across the top of the drum: grilles over a hot core
    for x in (-1.0, 0.0, 1.0):
        m.box((0.7, 0.9, 0.12), (x, 0, 2.06), HOT, glow=True)
        for k in range(4):
            m.box((0.06, 0.96, 0.1), (x - 0.27 + k * 0.18, 0, 2.12), DARK)
    m.box((3.0, 0.12, 0.08), (0, 0.5, 2.0), DARK)
    m.box((3.0, 0.12, 0.08), (0, -0.5, 2.0), DARK)
    # end caps: flywheel housings with a glowing eye
    for sx in (-1, 1):
        m.cyl(1.05, 0.25, (sx * 1.6, 0, 1.15), HA.shade(0.85), segs=10, rot=(0, sx * PI / 2, 0))
        m.cyl(0.45, 0.12, (sx * 1.85, 0, 1.15), DARK, segs=8, rot=(0, sx * PI / 2, 0))
        m.cyl(0.32, 0.08, (sx * 1.95, 0, 1.15), HOT2, segs=8, rot=(0, sx * PI / 2, 0), glow=True)
        for k in range(6):
            a = TAU * k / 6
            m.box((0.08, 0.08, 0.08), (sx * 1.86, math.cos(a) * 0.82, 1.15 + math.sin(a) * 0.82), STEEL)
    # front: a core window and a control strip
    m.box((1.4, 0.4, 0.9), (0, 1.0, 0.75), HA.shade(0.75))
    m.box((1.0, 0.06, 0.4), (0, 1.21, 0.85), HOT, glow=True)
    for k in range(5):
        m.box((0.04, 0.08, 0.42), (-0.4 + k * 0.2, 1.23, 0.85), DARK)
    for x in (-0.5, -0.3, 0.3, 0.5):
        m.box((0.1, 0.06, 0.08), (x, 1.22, 0.45), HC if x > 0 else REDGLOW, glow=True)
    # back: two exhaust stacks and fat pipes arching to the floor
    for sx in (-1, 1):
        m.cyl(0.28, 2.2, (sx * 0.7, -1.1, 0.25), IRON, segs=8)
        m.cyl(0.32, 0.12, (sx * 0.7, -1.1, 2.3), STEEL, segs=8)
        m.cyl(0.22, 0.04, (sx * 0.7, -1.1, 2.42), HOT, segs=8, glow=True)
        for y, rr, col in ((0.95, 0.13, BRASS), (-0.75, 0.11, "#7a4a30")):
            pts = [(sx * 1.0, y, 1.75), (sx * 1.0, y, 2.3), (sx * 1.85, y, 2.3), (sx * 2.05, y, 1.9),
                   (sx * 2.05, y, 0.25)]
            for p0, p1 in zip(pts, pts[1:]):
                limb(m, p0, p1, rr, rr, col, segs=6)
            for p in pts[1:4]:
                m.ball(rr * 1.05, p, col, subdiv=1)
            m.cyl(rr + 0.04, 0.08, (sx * 2.05, y, 1.2), DARK, segs=6)
            m.box((0.3, 0.3, 0.1), (sx * 2.05, y, 0.3), IRON)
    m.box((0.6, 0.5, 0.5), (1.7, -1.1, 0.5), IRON)
    m.cyl(0.18, 0.06, (1.7, -0.85, 0.6), DARK, segs=8, rot=(-PI / 2, 0, 0))
    m.box((0.02, 0.03, 0.14), (1.7, -0.81, 0.62), REDGLOW, rot=(0, 0.6, 0), glow=True)  # gauge needle
    m.build(parent=r)
    kit.light(r, (0, 0, 2.6), "#ff9a3a", 6.0, 1.4, flicker=0.25)
    kit.emitter(r, (0.7, -1.1, 2.45), "smoke")
    kit.emitter(r, (-0.7, -1.1, 2.45), "smoke")


def deck_pipes(v):
    kind = "deck_pipes"
    r = root(kind, v)
    m = Model(f"{kind}_{v}", seed=2200 + v)
    if v == 0:
        # three horizontal runs on brackets, a big valve wheel
        for x in (-0.9, 0.9):
            m.box((0.1, 0.12, 1.5), (x, 0.06, 0.75), IRON)
        for z, y, rr, col in ((0.35, 0.3, 0.13, "#7a4a30"), (0.8, 0.2, 0.09, STEEL), (1.25, 0.24, 0.14, BRASS)):
            limb(m, (-1.0, y, z), (1.0, y, z), rr, rr, col, segs=7)
            m.box((0.1, y, 0.06), (-0.9, y / 2, z - rr - 0.02), IRON)
            m.box((0.1, y, 0.06), (0.9, y / 2, z - rr - 0.02), IRON)
            for x in (-0.9, 0.9):
                m.cyl(rr + 0.03, 0.06, (x - 0.03, y, z), DARK, segs=7, rot=(0, PI / 2, 0))
        m.box((0.24, 0.24, 0.24), (0.3, 0.2, 0.8), IRON)
        limb(m, (0.3, 0.2, 0.92), (0.3, 0.2, 1.05), 0.03, 0.03, DARK, segs=4)
        ring(m, 0.16, 0.8, "#c8281e", n=7, w=0.04, h=0.04, cx=0.3, cy=0.42, axis="y")
        m.box((0.32, 0.04, 0.03), (0.3, 0.42, 0.8), "#c8281e")
        m.box((0.03, 0.04, 0.32), (0.3, 0.42, 0.8), "#c8281e")
        m.box((0.12, 0.08, 0.1), (-0.5, 0.33, 1.25), DARK)
        m.box((0.06, 0.04, 0.05), (-0.5, 0.38, 1.25), AMBER, glow=True)
    else:
        # vertical pipes dropping from above into a manifold box with gauges
        for x, rr, col in ((-0.8, 0.1, STEEL), (-0.5, 0.13, "#7a4a30"), (0.6, 0.11, BRASS), (0.85, 0.08, STEEL)):
            limb(m, (x, 0.18, 0.4), (x, 0.18, 1.55), rr, rr, col, segs=7)
            m.cyl(rr + 0.03, 0.06, (x, 0.18, 1.1), DARK, segs=7)
        m.box((1.0, 0.45, 0.5), (0.05, 0.24, 0.25), IRON)
        m.box((1.04, 0.47, 0.06), (0.05, 0.24, 0.52), DARK)
        for x in (-0.2, 0.25):
            m.cyl(0.11, 0.05, (x, 0.47, 0.3), "#d8d2c0", segs=7, rot=(-PI / 2, 0, 0))
            m.box((0.02, 0.03, 0.09), (x, 0.52, 0.32), REDGLOW, rot=(0, 0.5, 0))
        limb(m, (-0.5, 0.18, 0.5), (-0.5, 0.7, 0.12), 0.1, 0.1, "#7a4a30", segs=6)     # elbow to the floor
        m.ball(0.12, (-0.5, 0.18, 0.5), "#7a4a30", subdiv=1)
        stripes(m, (0.9, 0.04, 0.08), (0.05, 0.48, 0.1), 7, axis="x")
        m.box((0.08, 0.06, 0.08), (0.4, 0.48, 0.45), HC, glow=True)
    m.build(parent=r)


def deck_door():
    kind = "deck_door"
    r = root(kind)
    j = Model(f"{kind}_jambs", seed=2300)
    for sx in (-1, 1):
        j.box((0.1, 0.36, 2.4), (sx * 1.05, 0, 1.2), IRON)
        j.box((0.14, 0.4, 0.08), (sx * 1.05, 0, 2.38), DARK)
    j.build(parent=r)
    for sd, sx in (("l", -1), ("r", 1)):
        lf = Model(f"{kind}__leaf_{sd}", seed=2301 + (sx > 0))
        inner = -sx * 0.5                     # the edge that meets the other leaf at x = 0
        lf.box((1.0, 0.25, 2.3), (0, 0, 1.15), HA.shade(0.8))
        lf.box((0.8, 0.29, 0.9), (sx * 0.05, 0, 0.6), HA)
        lf.box((0.8, 0.29, 0.7), (sx * 0.05, 0, 1.65), HA)
        lf.box((0.34, 0.3, 0.2), (sx * 0.12, 0, 1.6), "#22303a")                     # porthole slot
        stripes(lf, (0.1, 0.27, 2.2), (inner - sx * 0.05, 0, 1.15), 11, axis="z")
        lf.box((0.08, 0.27, 0.08), (sx * 0.35, 0, 1.12), DARK)                       # handle
        lf.box((0.1, 0.28, 0.08), (inner - sx * 0.18, 0, 2.1), "#6aff8a", glow=True)  # status light
        part(kind, f"leaf_{sd}", lf, r, (sx * 0.5, 0, 0))


def deck_breach():
    kind = "deck_breach"
    r = root(kind, preview=("#c8642a", "#ecdcb8", "#ffc24a"))
    A = Skin("a", "#c8642a")
    m = Model(kind, seed=2400)
    rng = m.rng
    HOLE, HOT, HOT2, SLAG = "#0c0a0e", "#ff6a1a", "#ffc24a", "#3a2620"
    # the hole: a dark pit
    n = 12
    m.slab([(math.cos(TAU * i / n) * 0.8, math.sin(TAU * i / n) * 0.8) for i in range(n)], 0.0, 0.02, HOLE)
    # ragged molten rim: cooling slag outside, white-hot lip inside
    for i in range(20):
        a = TAU * i / 20 + rng.uniform(-0.08, 0.08)
        rr = rng.uniform(1.12, 1.28)
        m.box((rng.uniform(0.25, 0.42), rng.uniform(0.16, 0.3), 0.06),
              (math.cos(a) * rr, math.sin(a) * rr, 0.03), HOT, rot=(0, 0, a + PI / 2), glow=True)
        if i % 2:
            m.box((0.18, 0.12, 0.05), (math.cos(a) * 1.36, math.sin(a) * 1.36, 0.02), SLAG, rot=(0, 0, a))
    ring(m, 1.06, 0.035, SLAG, n=16, w=0.16, h=0.07)
    ring(m, 1.15, 0.05, HOT2, n=16, w=0.06, h=0.06, glow=True)
    for i in range(7):                                                               # drips of slag
        a = TAU * i / 7 + 0.3
        m.ball(0.07, (math.cos(a) * 1.4, math.sin(a) * 1.4, 0.03), HOT, subdiv=0, glow=True, scale=(1.3, 1, 0.5))
    # the clamp collar: 8 livery-painted clamp blocks with dark teeth biting into the rim
    for i in range(8):
        a = TAU * (i + 0.5) / 8
        c, s = math.cos(a), math.sin(a)
        m.box((0.42, 0.24, 0.24), (c * 0.92, s * 0.92, 0.14), A, rot=(0, 0, a + PI / 2), taper=0.8)
        m.box((0.12, 0.3, 0.1), (c * 1.02, s * 1.02, 0.3), DARK, rot=(0, 0, a))
        m.box((0.06, 0.06, 0.06), (c * 0.92, s * 0.92, 0.28), "#ecdcb8")
    ring(m, 0.82, 0.12, DARK, n=16, w=0.08, h=0.2)
    m.build(parent=r)
    kit.light(r, (0, 0, 0.4), "#ff8a3a", 3.5, 1.2, flicker=0.4)


def deck_hookpod():
    kind = "deck_hookpod"
    r = root(kind)
    m = Model(kind, seed=2500)
    IRN, IRN2, RED, RD = "#4c5058", "#3a3d44", "#a82024", "#ff2a2a"
    rng = m.rng
    # torn floor plates bent up around the breach
    for i in range(9):
        a = TAU * i / 9 + rng.uniform(-0.1, 0.1)
        c, s = math.cos(a), math.sin(a)
        m.box((0.42, 0.36, 0.06), (c * 1.08, s * 1.08, 0.12), "#5a5e64", rot=(0, -0.5, a), taper=0.8)
        if i % 2:
            m.box((0.3, 0.3, 0.05), (c * 1.2, s * 1.2, 0.1), "#4a4e54", rot=(0.4, 0, a + PI / 2))
    # the pod's iron wedge-cone: an 6-sided pyramid, flattened top
    m.cyl(1.0, 1.1, (0, 0, 0), IRN, segs=6, r_top=0.55)
    m.cyl(0.6, 0.18, (0, 0, 1.1), IRN2, segs=6, r_top=0.5)
    for k in range(6):                                                               # ribs
        a = TAU * (k + 0.5) / 6
        limb(m, (math.cos(a) * 1.0, math.sin(a) * 1.0, 0.05), (math.cos(a) * 0.57, math.sin(a) * 0.57, 1.12),
             0.07, 0.06, IRN2, segs=4)
        m.box((0.16, 0.08, 0.1), (math.cos(a) * 0.86, math.sin(a) * 0.86, 0.38), RD, rot=(0, 0, a + PI / 2),
              glow=True)
    # grapple claws gripping the floor
    for k in range(3):
        a = TAU * k / 3 + 0.5
        c, s = math.cos(a), math.sin(a)
        limb(m, (c * 0.8, s * 0.8, 0.5), (c * 1.35, s * 1.35, 0.4), 0.08, 0.07, IRN2, segs=5)
        limb(m, (c * 1.35, s * 1.35, 0.4), (c * 1.4, s * 1.4, 0.0), 0.07, 0.02, IRN2, segs=5)
        m.ball(0.09, (c * 1.35, s * 1.35, 0.4), IRN, subdiv=0)
    # the sign on top: iron ring, a hook through it, on a red disc
    m.cyl(0.5, 0.05, (0, 0, 1.28), RED, segs=8)
    HK = "#9a9ea6"
    ring(m, 0.17, 1.36, "#24262a", n=10, w=0.07, h=0.06, cx=-0.02, cy=-0.12)        # the ring
    m.box((0.07, 0.5, 0.06), (0.12, 0.05, 1.39), HK)                                 # hook shank
    m.box((0.3, 0.07, 0.06), (0.0, -0.2, 1.39), HK)                                  # hook bend
    m.box((0.07, 0.2, 0.06), (-0.12, -0.13, 1.39), HK)                               # hook point
    m.box((0.1, 0.05, 0.06), (-0.09, -0.05, 1.39), HK, rot=(0, 0, -0.7))            # barb
    ring(m, 0.06, 1.39, HK, n=6, w=0.04, h=0.06, cx=0.12, cy=0.34)                  # eye
    for k in range(3):                                                               # top lamps
        a = TAU * k / 3 + 1.2
        m.cyl(0.05, 0.08, (math.cos(a) * 0.52, math.sin(a) * 0.52, 1.28), RD, segs=6, glow=True)
    m.build(parent=r)
    kit.light(r, (0, 0, 1.6), "#ff3030", 4.0, 1.0, flicker=0.2)


def deck_medkit():
    kind = "deck_medkit"
    r = root(kind)
    m = Model(kind, seed=2600)
    WH, GR = "#e8e6de", "#4aff7a"
    m.box((0.5, 0.06, 0.5), (0, 0.03, 1.2), DARK)
    m.box((0.46, 0.2, 0.44), (0, 0.13, 1.2), WH)
    m.box((0.48, 0.22, 0.05), (0, 0.13, 1.4), "#c8c6be")
    m.box((0.08, 0.04, 0.28), (0, 0.245, 1.19), GR, glow=True)
    m.box((0.28, 0.04, 0.08), (0, 0.245, 1.19), GR, glow=True)
    m.box((0.04, 0.04, 0.1), (0.2, 0.25, 1.2), STEEL)                                # latch
    m.build(parent=r)
    kit.light(r, (0, 0.4, 1.2), GR, 1.5, 0.5)


def deck_turret():
    kind = "deck_turret"
    r = root(kind)
    m = Model(f"{kind}_base", seed=2700)
    m.cyl(0.45, 0.12, (0, 0, 0), DARK, segs=8)
    m.cyl(0.36, 0.28, (0, 0, 0.12), HA.shade(0.8), segs=8, r_top=0.28)
    stripes(m, (0.6, 0.04, 0.06), (0, 0.4, 0.06), 5, axis="x")
    m.build(parent=r)
    h = Model(f"{kind}__head", seed=2701)
    h.cyl(0.3, 0.08, (0, 0, 0), DARK, segs=8)
    h.box((0.5, 0.5, 0.26), (0, 0.0, 0.2), HA, taper=0.8)
    h.box((0.36, 0.1, 0.2), (0, 0.24, 0.18), HA.shade(0.8))
    stripes(h, (0.5, 0.04, 0.05), (0, -0.25, 0.12), 5, axis="x")
    for sx in (-1, 1):
        limb(h, (sx * 0.1, 0.2, 0.18), (sx * 0.1, 0.65, 0.18), 0.05, 0.045, DARK, segs=6)
        h.cyl(0.06, 0.06, (sx * 0.1, 0.62, 0.18), STEEL, segs=6, rot=(-PI / 2, 0, 0))
    h.box((0.14, 0.08, 0.1), (0, 0.27, 0.3), DARK)
    h.box((0.1, 0.06, 0.06), (0, 0.31, 0.31), REDGLOW, glow=True)
    h.box((0.14, 0.2, 0.08), (0, -0.25, 0.22), DARK)                                 # ammo box
    hobj = part(kind, "head", h, r, (0, 0, 0.4))
    group(f"{kind}__muzzle", loc=(0, 0.66, 0.18), parent=hobj, part="muzzle")


def deck_sconce():
    kind = "deck_sconce"
    r = root(kind)
    m = Model(kind, seed=2800)
    m.box((0.4, 0.05, 0.3), (0, 0.025, 1.8), DARK)
    m.box((0.3, 0.16, 0.06), (0, 0.1, 1.68), BRASS)
    m.cyl(0.11, 0.2, (0, 0.17, 1.7), WARM, segs=6, r_top=0.08, glow=True)
    for sx in (-1, 1):
        m.box((0.03, 0.03, 0.22), (sx * 0.1, 0.17, 1.8), BRASS)
    m.box((0.28, 0.2, 0.04), (0, 0.15, 1.92), BRASS, taper=0.6)
    m.build(parent=r)
    kit.light(r, (0, 0.3, 1.8), "#ffc870", 4.0, 1.0, flicker=0.1)


def deck_tin():
    kind = "deck_tin"
    r = root(kind)
    m = Model(kind, seed=2900)
    m.cyl(0.13, 0.16, (-0.04, 0, 0), "#9a5a34", segs=7)
    m.cyl(0.14, 0.03, (-0.04, 0, 0.16), "#7a4428", segs=7)
    m.box((0.1, 0.03, 0.06), (-0.04, 0.12, 0.08), "#c89a5a")                         # label
    for k in range(4):
        m.cyl(0.07, 0.025, (0.11, -0.04, k * 0.028), "#c8a048", segs=7)
    m.cyl(0.07, 0.025, (0.08, 0.1, 0), "#c8a048", segs=7, rot=(0.3, 0, 0))
    m.box((0.05, 0.05, 0.05), (0.1, -0.04, 0.12), GOLD, glow=True, rot=(0.6, 0.6, 0))   # glint
    m.box((0.03, 0.03, 0.03), (-0.1, 0.06, 0.2), GOLD, glow=True, rot=(0.6, 0.6, 0))
    m.build(parent=r)


def _paint_previews():
    """Previews only: each root in its own Skin colours (the kit shares one material per slot, so
    otherwise everything would wear the first model's). BOARDING_FRONT=1 turns them to face the camera."""
    made = {}
    for root_ in [o for o in bpy.data.objects if o.parent is None and o.get("kind") in _PREVIEW]:
        cols = _PREVIEW[root_["kind"]]
        if os.environ.get("BOARDING_FRONT"):
            root_.rotation_euler.z = PI
        for o in [root_, *root_.children_recursive]:
            if o.type != "MESH":
                continue
            for i, mat in enumerate(o.data.materials):
                if not (mat and mat.name.startswith("skin")):
                    continue
                bits = mat.name.split("_")
                k = int(bits[2][1:]) / 100 if len(bits) > 2 else 1.0
                base = cols["abc".index(bits[1])].lstrip("#")
                rgb_ = [min(255, round(int(base[j:j + 2], 16) * k)) for j in (0, 2, 4)]
                hexc = "#" + "".join(f"{v:02x}" for v in rgb_)
                key = (hexc, mat.name.startswith("skinglow"))
                if key not in made:
                    made[key] = kit.material(hexc, glow=key[1])
                o.data.materials[i] = made[key]


def build():
    pilot()
    deckhand()
    gunner()
    bruiser()
    kelter()
    for v in (0, 1):
        deck_crate(v)
        deck_console(v)
        deck_barrel(v)
        deck_cargo(v)
        deck_pipes(v)
    deck_strongbox()
    deck_core()
    deck_alarm()
    deck_locker()
    deck_bunk()
    deck_table()
    deck_canister()
    deck_engine()
    deck_door()
    deck_breach()
    deck_hookpod()
    deck_medkit()
    deck_turret()
    deck_sconce()
    deck_tin()
    if "--preview" in sys.argv:
        _paint_previews()
