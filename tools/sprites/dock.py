"""MATCH AND DOCK's sheet: the station's docking ring seen head-on (a frosted, greebled face with a
bronze port ring, its lamps, a stepped throat lit teal, and four clamp housings), in three sizes
for the approach; a clamp jaw that slams shut; and a bracket of your own docking collar.

The game turns the face with the port and scales it with the range, so it's rendered straight on
(view "top": the face looks at the camera). The port's mouth is 4 units across the radius, so a
sprite's mouth in pixels is 4 * ppu.

    just sprites dock
"""
from __future__ import annotations

import math
import random

from kit import Model, animate, group

TAU = math.pi * 2
MOUTH = 4.0
OUTER = MOUTH * 2.4

SPRITES = {
    # three sizes, so the game never scales one far from 1:1 as the port swells
    # (a frame must stay under 256 px, so the two biggest are a quarter of the face)
    "face_0": dict(kind="face", view="top", ppu=5.5, outline=False, edge=0, light=(-0.5, 0.6, 0.65)),
    "face_1": dict(kind="face", view="top", ppu=8, outline=False, light=(-0.5, 0.6, 0.65)),
    "face_2": dict(kind="face", view="top", ppu=12, outline=False, light=(-0.5, 0.6, 0.65)),
    "face_3": dict(kind="faceq", view="top", ppu=17, outline=False, light=(-0.5, 0.6, 0.65)),
    "face_4": dict(kind="faceq", view="top", ppu=23.5, outline=False, light=(-0.5, 0.6, 0.65)),
    # a clamp jaw at full size (the port's mouth 100 px across the radius): rest is open
    "jaw": dict(kind="jaw", view="top", ppu=25, clips={"rest": 1, "shut": ("jaw_shut", 6)}, margin=1.6),
    # a bracket of your collar, pointing out along +y
    "bracket": dict(kind="bracket", view="top", ppu=10),
}

STEEL = "#3e3e52"
STEEL_L = "#52566e"
STEEL_D = "#2a2a3a"
BRONZE = "#b07a40"
BRONZE_D = "#7a4e2a"
FROST = "#dce8f4"
FROST_B = "#a8c0dc"
AMBER = "#ffb04a"
GREEN = "#6aff9a"
TEAL = "#4ae0d0"


def sector(m: Model, r0: float, r1: float, a0: float, a1: float, z0: float, z1: float, color: str, glow=False, steps=4):
    """A ring segment from r0 to r1, angles a0..a1 (radians, from +y toward +x... any way round)."""
    outer = [(r1 * math.sin(a0 + (a1 - a0) * i / steps), r1 * math.cos(a0 + (a1 - a0) * i / steps)) for i in range(steps + 1)]
    inner = [(r0 * math.sin(a0 + (a1 - a0) * i / steps), r0 * math.cos(a0 + (a1 - a0) * i / steps)) for i in range(steps, -1, -1)]
    pts = outer + inner
    # counter-clockwise seen from above
    area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    if area < 0:
        pts = pts[::-1]
    m.slab(pts, z0, z1, color, glow=glow)


def at(r: float, a: float) -> tuple[float, float]:
    """A point at radius r and angle a: angle 0 is +y (screen right), turning toward +x."""
    return (r * math.sin(a), r * math.cos(a))


def face(quarter: bool):
    """The face, made of four identical quarters (so a quarter can stand in for it: the biggest
    sizes are quarters, drawn four times, turned)."""
    kind = "faceq" if quarter else "face"
    root = group(kind, kind=kind)
    m = Model(f"{kind}_body", seed=5)
    for q in range(1 if quarter else 4):
        quadrant(m, q * TAU / 4)
    # the clamp housings sit on the quarters' seams: a quarter carries both of its own
    for k in range(2 if quarter else 4):
        a = k * TAU / 4
        hx, hy = at(MOUTH * 1.2, a)
        m.box((1.5, 1.6, 1.2), (hx, hy, 0.6), "#5e5870", rot=(0, 0, -a))
        hx, hy = at(MOUTH * 1.48, a)
        m.box((1.0, 0.6, 0.9), (hx, hy, 0.5), STEEL_D, rot=(0, 0, -a))
        hx, hy = at(MOUTH * 1.2, a)
        m.box((0.5, 0.5, 0.2), (hx, hy, 1.25), "#8a8aa0", rot=(0, 0, -a))
    m.build(root)


def quadrant(m: Model, base: float):
    rnd = random.Random(9)
    Q = TAU / 4
    # the back plate
    sector(m, MOUTH * 0.9, OUTER, base, base + Q, -0.9, -0.3, STEEL_D, steps=8)
    # the outer rim: heavy segments with gaps for the rim lights
    for k in range(6):
        a0 = base + k / 24 * TAU + 0.02
        a1 = base + (k + 1) / 24 * TAU - 0.02
        sector(m, OUTER * 0.86, OUTER * 0.98, a0, a1, -0.2, 0.35 + (0.12 if k % 3 == 0 else 0), STEEL_L if k % 2 else STEEL, steps=2)
    # the plating: three panels a quarter, a little proud of each other, ribbed between
    for k in range(3):
        a0 = base + k / 12 * TAU + 0.025
        a1 = base + (k + 1) / 12 * TAU - 0.025
        sector(m, MOUTH * 1.38, OUTER * 0.85, a0, a1, -0.2, 0.12 + 0.08 * (k % 2), "#4a4e66" if k % 2 else "#44465c", steps=4)
        sector(m, OUTER * 0.62, OUTER * 0.7, a0 + 0.05, a1 - 0.05, 0.1, 0.32, "#363a50", steps=3)
        if k:
            x, y = at(MOUTH * 1.38, a0 - 0.025)
            x2, y2 = at(OUTER * 0.85, a0 - 0.025)
            m.box((0.3, OUTER * 0.85 - MOUTH * 1.38, 0.5), ((x + x2) / 2, (y + y2) / 2, 0.1), STEEL_D, rot=(0, 0, -(a0 - 0.025)))
        # greebles: vents, pipes, a lit window or two
        for _ in range(3):
            a = a0 + rnd.uniform(0.12, 0.88) * (a1 - a0)
            r = rnd.uniform(MOUTH * 1.55, OUTER * 0.8)
            gx, gy = at(r, a)
            kind = rnd.random()
            if kind < 0.35:
                m.box((rnd.uniform(0.4, 0.8), rnd.uniform(0.6, 1.2), 0.35), (gx, gy, 0.3), "#5e6278", rot=(0, 0, -a))
            elif kind < 0.6:
                m.cyl(rnd.uniform(0.2, 0.35), 0.4, (gx, gy, 0.2), "#2e3042", segs=6)
            elif kind < 0.85:
                m.box((0.35, 0.6, 0.2), (gx, gy, 0.3), AMBER if rnd.random() < 0.6 else GREEN, rot=(0, 0, -a), glow=True)
            else:
                m.box((0.25, 1.4, 0.25), (gx, gy, 0.35), "#6a6e84", rot=(0, 0, -a + 0.3))
    # frost: drifts packed on the plating and the rim, kept off the seams
    for _ in range(7):
        a = base + rnd.uniform(0.12, Q - 0.12)
        r = rnd.uniform(MOUTH * 1.5, OUTER * 0.95)
        fx, fy = at(r, a)
        m.ball(rnd.uniform(0.2, 0.42), (fx, fy, 0.3), FROST if rnd.random() < 0.4 else FROST_B, subdiv=0, jitter=0.06, scale=(1.8, 1.1, 0.3), rot=(0, 0, -a))
    # the bronze port ring: two segments a quarter, lamps between, a lip on top
    for k in range(2):
        a0 = base + k / 8 * TAU + 0.05
        a1 = base + (k + 1) / 8 * TAU - 0.05
        sector(m, MOUTH * 1.02, MOUTH * 1.34, a0, a1, -0.1, 0.9, BRONZE if k % 2 else "#a06c38", steps=4)
        sector(m, MOUTH * 1.1, MOUTH * 1.26, a0 + 0.05, a1 - 0.05, 0.9, 1.0, BRONZE_D, steps=3)
        if k:
            lx, ly = at(MOUTH * 1.18, a0 - 0.05)
            m.box((0.4, 0.4, 0.3), (lx, ly, 0.85), AMBER, glow=True)
    # the throat: steps down into the dark, a teal ring of light at the bottom
    sector(m, MOUTH * 0.82, MOUTH * 1.02, base, base + Q, -0.9, -0.3, "#2a2e44", steps=6)
    sector(m, MOUTH * 0.64, MOUTH * 0.82, base, base + Q, -1.8, -1.2, "#20243a", steps=6)
    sector(m, MOUTH * 0.56, MOUTH * 0.64, base, base + Q, -2.1, -1.9, TEAL, glow=True, steps=6)
    sector(m, 0.0001, MOUTH * 0.56, base, base + Q, -2.6, -2.3, "#0c1020", steps=6)
    # a leaf of the inner door, faintly lit along its seam
    sx, sy = at(MOUTH * 0.3, base + Q / 2)
    m.box((0.12, MOUTH * 0.5, 0.1), (sx, sy, -2.25), "#2a6a70", rot=(0, 0, -(base + Q / 2)), glow=True)


def jaw():
    """A clamp jaw: a block on the station's ring, its arm hinged at the block's inner edge. The
    arm points in toward the port's middle (-y); at rest it stands up open, and `shut` slams it down."""
    root = group("jaw", kind="jaw")
    base = Model("jaw_base")
    base.box((1.2, 0.7, 0.6), (0, 0.25, 0.3), "#5e5870")
    base.box((1.3, 0.2, 0.7), (0, -0.05, 0.35), STEEL_D)
    for x in (-0.45, 0.45):
        base.box((0.18, 0.18, 0.18), (x, 0.4, 0.62), AMBER, glow=True)
    base.build(root)
    arm = group("jaw_arm", loc=(0, 0, 0.55), parent=root)
    a = Model("jaw_arm_body")
    # the arm: a striped bar with a hooked tip
    for i in range(4):
        a.box((0.75, 0.32, 0.36), (0, -0.2 - i * 0.32, 0), "#ffb04a" if i % 2 == 0 else "#2a2236")
    a.box((0.95, 0.35, 0.6), (0, -1.5, -0.15), "#8a8aa0")
    a.box((0.95, 0.2, 0.25), (0, -1.6, -0.45), "#5e5870")
    a.build(arm)
    arm.rotation_euler = (-1.35, 0, 0)
    animate(arm, "jaw_shut", "rotation_euler", [(0, (0, 0, 0)), (0.1, (1.35, 0, 0)), (0.16, (1.2, 0, 0)), (0.22, (1.35, 0, 0)), (0.3, (1.35, 0, 0))], rest=(-1.35, 0, 0))


def bracket():
    root = group("bracket", kind="bracket")
    m = Model("bracket_body")
    # an arm along the radius, a crossbar at its inner end, a jet at the tip
    m.box((0.55, 2.1, 0.4), (0, 0, 0), "#6a6e84")
    m.box((0.3, 1.9, 0.12), (0, 0.05, 0.25), "#9aa0b8")
    m.box((1.4, 0.35, 0.45), (0, -1.05, 0.05), "#52566e")
    m.cyl(0.32, 0.4, (0, 1.15, 0), "#2a2a3a", segs=8, rot=(-math.pi / 2, 0, 0))
    m.box((0.2, 0.2, 0.2), (0.0, -1.05, 0.35), TEAL, glow=True)
    m.build(root)


def build():
    face(False)
    face(True)
    jaw()
    bracket()
