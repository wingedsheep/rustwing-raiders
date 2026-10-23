"""Sprites for SHAKE THEM OFF: the Kestrel from above, banking and barrel-rolling; the hull
leeches (small, big and skitter), flapping in, clamping on, drinking, tumbling away and frying;
and the jump lane they hunt in: lantern buoys and drifting rock.

    just sprites shake
"""
from __future__ import annotations

import math

import ships
from kit import Model, animate, group

# the ship: nose right, straight down. `bank` is a still for each lean (-80..80 degrees, the
# frame picked by how far it's rolled); `flip` is a whole barrel roll, for a hard roll
SHIP = dict(kind="ship", view="top", width=104, edge=0.3)
LEECH_CLIPS = {"flap": 6, "clamp": 4, "drink": 6}
SPIN_CLIPS = {"tumble": 8, "fry": 6}

SPRITES = {
    "ship": dict(**SHIP, clips={"bank": 9, "flip": 16}),
    "small": dict(kind="leech_small", view="top", width=24, rotations=8, clips=LEECH_CLIPS, margin=1.4),
    "small_spin": dict(kind="leech_small", view="top", width=24, clips=SPIN_CLIPS, margin=1.6),
    "big": dict(kind="leech_big", view="top", width=40, rotations=8, clips=LEECH_CLIPS, margin=1.4),
    "big_spin": dict(kind="leech_big", view="top", width=40, clips=SPIN_CLIPS, margin=1.6),
    "skitter": dict(kind="leech_skitter", view="top", width=22, rotations=8, clips=LEECH_CLIPS, margin=1.4),
    "skitter_spin": dict(kind="leech_skitter", view="top", width=22, clips=SPIN_CLIPS, margin=1.6),
    "lantern": dict(kind="lantern", view={"el": 55}, height=64, clips={"rest": 1}),
    "lantern_far": dict(kind="lantern", view={"el": 55}, height=30, clips={"rest": 1}, edge=0),
    "rock": dict(kind="rock", view="top", width=22, rotations=8, edge=0),
    "rock_small": dict(kind="rock", variant=1, view="top", width=12, rotations=8, edge=0),
}

FPS = 24


def keys_each(n, fn):
    """A key on every sampled frame, so the sprite frames land exactly on the values."""
    return [(i / FPS, fn(i / max(1, n - 1))) for i in range(n)]


def ship():
    root = group("ship", kind="ship")
    body = group("ship_body", parent=root)
    ships.kestrel(body)
    for pid, c, r in [*ships.START["kestrel"], ("thruster", 1, 4), ("thruster", 3, 4)]:
        x, y = ships.sock(ships.FRAMES["kestrel"], c, r)
        s = group(f"ship_{pid}_{c}_{r}", loc=(x, y, ships.DECK), parent=body)
        ships.PARTS[pid](s, False)
    # bank: one still per 20 degrees of lean; flip: a full turn about the nose
    animate(body, "ship_bank", "rotation_euler", keys_each(9, lambda f: (0, math.radians(-80 + 160 * f), 0)))
    animate(body, "ship_flip", "rotation_euler", keys_each(16, lambda f: (0, 2 * math.pi * f * 15 / 16, 0)))


# ------------------------------------------------------------------------------------------------
# hull leeches: bat-winged, lamprey-mouthed. The mouth (+y) is the nose: right on screen.
# ------------------------------------------------------------------------------------------------

LOOKS = {
    # kind: (scale, back, belly, membrane, bones, eyes, spikes)
    "leech_small": (1.0, "#a8583a", "#e0a070", "#7a3a2c", "#4a2018", "#ffc24a", False),
    "leech_big": (1.0, "#a83c52", "#e09a80", "#7e3446", "#3a1420", "#ffd04a", True),
    "leech_skitter": (1.0, "#2e8a80", "#9ae0c8", "#24585a", "#123032", "#b8fff0", False),
}

SPREAD, FOLD = 0.0, 1.0


def leech(kind: str):
    _, back, belly, membrane, bones, eyes, spikes = LOOKS[kind]
    big = kind == "leech_big"
    skitter = kind == "leech_skitter"
    root = group(kind, kind=kind)
    pivot = group(f"{kind}_pivot", parent=root)
    # the body: a fat segmented grub, head forward, a tapering tail
    m = Model(f"{kind}_body", seed=7)
    segs = [(0.55, 0.42), (0.1, 0.5), (-0.4, 0.44), (-0.85, 0.32), (-1.2, 0.2)]
    if skitter:
        segs = [(0.55, 0.34), (0.12, 0.38), (-0.35, 0.32), (-0.78, 0.22), (-1.15, 0.14), (-1.45, 0.09)]
    for i, (y, r) in enumerate(segs):
        m.ball(r, (0, y, 0.0), back if i % 2 == 0 else _shade(back, 0.82), subdiv=1, scale=(1.0, 0.9, 0.75), jitter=0.04)
        m.ball(r * 0.8, (0, y, -0.12), belly, subdiv=1, scale=(1.0, 0.8, 0.5))
    # the mouth: a ring of flesh round a dark throat, teeth all round it
    m.cyl(0.36 if not skitter else 0.3, 0.22, (0, 0.92, 0), _shade(belly, 0.9), segs=8, rot=(math.pi / 2, 0, 0))
    m.cyl(0.24 if not skitter else 0.2, 0.24, (0, 0.96, 0), "#2a0e14", segs=8, rot=(math.pi / 2, 0, 0))
    for k in range(8):
        a = k / 8 * 2 * math.pi
        m.box((0.07, 0.12, 0.07), (math.cos(a) * 0.27, 1.04, math.sin(a) * 0.27), "#f4e8d0")
    # eyes: a pair of glowing beads up on the head
    for s in (1, -1):
        m.ball(0.09, (s * 0.2, 0.62, 0.3), eyes, subdiv=0, glow=True)
    # a ridge of spots down the back, or bony plates on the big ones
    for i, (y, r) in enumerate(segs[:-1]):
        if spikes:
            m.box((0.18, 0.22, 0.28), (0, y, r * 0.7), "#d8b080", taper=0.3)
        else:
            m.ball(r * 0.25, (0, y, r * 0.68), _shade(back, 1.3), subdiv=0)
    m.build(pivot)
    # wings: membranes on finger bones, hinged at the shoulders
    wings = []
    span = 1.9 if not skitter else 2.2
    for s in (1, -1):
        w = Model(f"{kind}_wing_{'r' if s > 0 else 'l'}", seed=3)
        tip = [(0, 0.15), (s * span * 0.55, 0.55), (s * span, 0.2), (s * span * 0.95, -0.35),
               (s * span * 0.62, -0.25), (s * span * 0.45, -0.7), (s * span * 0.2, -0.5), (0, -0.4)]
        pts = tip if s > 0 else tip[::-1]
        w.slab(pts, -0.03, 0.05, membrane)
        for bx, by in ((span * 0.55, 0.55), (span, 0.2), (span * 0.62, -0.25), (span * 0.45, -0.7)):
            ln = math.hypot(bx, by)
            w.box((0.07, ln, 0.08), (s * bx / 2, by / 2, 0.04), bones, rot=(0, 0, -math.atan2(s * bx, by)))
        wings.append((s, w.build(pivot, loc=(s * 0.32, 0.12, 0.12))))

    def wing_keys(clip, n, up, sweep):
        """Keys for both wings: `up` and `sweep` give, for f in 0..1, how far up (radians about
        the body's long axis) and how far folded back (0 spread .. 1 folded)."""
        for s, w in wings:
            animate(w, clip, "rotation_euler", keys_each(n, lambda f: (0, s * up(f), s * sweep(f) * 1.25)))
            animate(w, clip, "scale", keys_each(n, lambda f: (0, -0.45 * sweep(f), 0)))

    def body_keys(clip, n, rot, scale):
        animate(pivot, clip, "rotation_euler", keys_each(n, rot))
        animate(pivot, clip, "scale", keys_each(n, scale))

    still = lambda f: (0, 0, 0)  # noqa: E731
    one = lambda f: (0, 0, 0)  # noqa: E731
    n = LEECH_CLIPS
    # flap: a full beat, down hard, up slow
    wing_keys(f"{kind}_flap_idle", n["flap"] + 1, lambda f: 0.85 * math.cos(f * 2 * math.pi) - 0.05, lambda f: 0.0)
    body_keys(f"{kind}_flap_idle", n["flap"] + 1, still, lambda f: (0, 0, 0.06 * math.sin(f * 2 * math.pi)))
    # clamp: the wings sweep back and wrap round, the body squashes on as it bites
    wing_keys(f"{kind}_clamp", n["clamp"], lambda f: -0.5 * f, lambda f: f)
    body_keys(f"{kind}_clamp", n["clamp"], still, lambda f: (0.2 * math.sin(f * math.pi), -0.15 * math.sin(f * math.pi), 0))
    # drink: folded, swelling and easing with each gulp
    wing_keys(f"{kind}_drink_idle", n["drink"] + 1, lambda f: -0.5 + 0.1 * math.sin(f * 2 * math.pi), lambda f: 1.0)
    body_keys(f"{kind}_drink_idle", n["drink"] + 1, still,
              lambda f: (0.18 * (0.5 - 0.5 * math.cos(f * 2 * math.pi)), -0.06 * (0.5 - 0.5 * math.cos(f * 2 * math.pi)), 0.12 * (0.5 - 0.5 * math.cos(f * 2 * math.pi))))
    # tumble: flung, head over tail, wings flailing half open
    wing_keys(f"{kind}_tumble_idle", SPIN_CLIPS["tumble"] + 1, lambda f: 0.6 * math.sin(f * 4 * math.pi), lambda f: 0.35)
    body_keys(f"{kind}_tumble_idle", SPIN_CLIPS["tumble"] + 1, lambda f: (2 * math.pi * f, 0, 0.4 * math.sin(f * 2 * math.pi)), one)
    # fry: it convulses, curls up tight and shrivels
    wing_keys(f"{kind}_fry", SPIN_CLIPS["fry"], lambda f: 1.2 * f, lambda f: 0.6 * f)
    body_keys(f"{kind}_fry", SPIN_CLIPS["fry"], lambda f: (0.6 * f, 0, 0.5 * math.sin(f * 9)),
              lambda f: (0.15 * math.sin(f * 12) - 0.45 * f, -0.4 * f, -0.3 * f))


def _shade(hex_: str, k: float) -> str:
    h = hex_.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(c * k))) for c in (r, g, b))


# ------------------------------------------------------------------------------------------------
# the lane: lantern buoys (the lanes are strung with them, the leeches drop off at the next one)
# ------------------------------------------------------------------------------------------------

def lantern():
    root = group("lantern", kind="lantern")
    m = Model("lantern_body", seed=11)
    brass, dark, glass = "#b8823a", "#3a2a2a", "#ffd27a"
    m.cyl(0.9, 0.25, (0, 0, -1.6), brass, segs=8)                 # the foot ring
    m.cyl(0.5, 0.9, (0, 0, -1.1), dark, segs=6, r_top=0.7)
    m.cyl(0.72, 1.6, (0, 0, 0), glass, segs=6, glow=True)         # the light
    for k in range(6):                                            # the cage bars
        a = k / 6 * 2 * math.pi + math.pi / 6
        m.box((0.12, 0.12, 1.7), (math.cos(a) * 0.76, math.sin(a) * 0.76, 0), brass)
    m.cyl(0.95, 0.22, (0, 0, 0.9), brass, segs=8)                 # the cap
    m.cyl(0.6, 0.8, (0, 0, 1.4), dark, segs=6, r_top=0.15)
    m.box((0.08, 0.08, 1.2), (0, 0, 2.3), brass)                  # the spire
    m.ball(0.14, (0, 0, 2.95), "#ff7a4a", subdiv=0, glow=True)
    for s in (1, -1):                                             # vanes
        m.box((1.4, 0.12, 0.5), (s * 1.3, 0, -0.6), dark, taper=0.5)
        m.ball(0.1, (s * 1.95, 0, -0.6), "#8affe0", subdiv=0, glow=True)
    m.build(root)


def rock(variant: int):
    root = group(f"rock_{variant}", kind="rock", variant=variant)
    m = Model(f"rock_body_{variant}", seed=20 + variant)
    m.ball(1.0, (0, 0, 0), "#5a4a52", subdiv=1, scale=(1.2, 0.9, 0.8), jitter=0.22)
    m.ball(0.55, (0.5, 0.3, 0.3), "#7a6668", subdiv=0, jitter=0.15)
    m.ball(0.35, (-0.6, -0.2, 0.35), "#3e3240", subdiv=0, jitter=0.1)
    m.build(root)


def build():
    ship()
    for k in LOOKS:
        leech(k)
    lantern()
    rock(0)
    rock(1)
