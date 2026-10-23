"""THREAD IT's sheet: the Kestrel side-on (cruising, climbing, diving, and each on the burn), every
mine with its tell (the plain one's eye, the chained one's eyelet, the magnet's reaching prongs, the
fuse mine arming), the blast, the broken girders that sweep a column, tumbling scrap, and the field
itself: rocks near and far, big mines hanging on chains in the deep, a cache glowing among them,
and the buoys that mark the way out.

    just sprites thread
"""
from __future__ import annotations

import math

import ships
from kit import Model, animate, group

TAU = math.pi * 2
ALONG = (-math.pi / 2, 0, 0)     # a cylinder (standing on z) turned to run along +y
ACROSS = (0, math.pi / 2, 0)     # ... along +x (towards / away from the camera)

STEEL = "#4a4458"
STEEL_L = "#6e6880"
STEEL_D = "#2a2436"
SPIKE = "#9a94a8"
EYE = "#ff3a4a"
EYE_OFF = "#3a1a24"
BLUE = "#6ab0ff"
BLUE_D = "#2a3a6a"
AMBER = "#ffb03a"
HAZARD = "#ffd04a"
RUST = "#8a4a2e"

SPRITES = {
    # the Kestrel: a still frame of each attitude, with her flames flickering; up/down pitch the
    # nose and roll her a little, burn stretches the flames
    **{
        f"kestrel{'_' + a if a else ''}": dict(kind="ship", view="three_quarter", width=40,
                                              clips={c: (f"ship_{a + '_' if a else ''}{c}_idle", 4) for c in ("fly", "burn")})
        for a in ("", "up", "down")
    },
    # mines: 0 at rest; each has its tell as a clip the game steps through by hand
    "mine": dict(kind="mine", variant=0, view="three_quarter", height=16, clips={"blink": ("mine_0_blink_idle", 2)}),
    "bob": dict(kind="mine", variant=1, view="three_quarter", height=18, clips={"blink": ("mine_1_blink_idle", 2)}),
    "magnet": dict(kind="mine", variant=2, view="three_quarter", height=17,
                   clips={"blink": ("mine_2_blink_idle", 2), "reach": ("mine_2_reach_idle", 4)}),
    "fuse": dict(kind="mine", variant=3, view="three_quarter", height=16,
                 clips={"blink": ("mine_3_blink_idle", 2), "arm": ("mine_3_arm", 5)}),
    # the blast: a white core, fire, smoke and shards (rest = its widest moment)
    "boom": dict(kind="boom", view="three_quarter", ppu=8, edge=0, outline=False, cover=0.3, clips={"go": ("boom_go", 8)}),
    # broken girders turning on their pivots (seen face-on, so the headings turn in the screen's
    # plane): one a reach
    **{f"girder_{n}": dict(kind="girder", variant=n, view="top", ppu=8, rotations=32, edge=0,
                           clips={"rest": 1}) for n in (56, 58)},
    # scrap that tumbles out of a blast or off the hull
    **{f"scrap_{v}": dict(kind="scrap", variant=v, view="three_quarter", height=h, edge=0, cover=0.35,
                          clips={"tumble": (f"scrap_{v}_tumble_idle", 8)}) for v, h in ((0, 6), (1, 5), (2, 7))},
    # the field: rocks at three depths, mines on chains far off, a cache, the buoys at the exit
    **{f"rock_{v}": dict(kind="rock", variant=v, view="three_quarter", height=h, clips={"tumble": (f"rock_{v}_tumble_idle", 8)})
       for v, h in ((0, 14), (1, 19), (2, 11))},
    **{f"rock_far_{v}": dict(kind="rock", variant=v, view="three_quarter", height=h, edge=0, outline=False,
                             clips={"tumble": (f"rock_{v}_tumble_idle", 8)}) for v, h in ((0, 6), (1, 8))},
    "rock_fg": dict(kind="rock", variant=3, view="three_quarter", height=44, edge=0, clips={"tumble": ("rock_3_tumble_idle", 12)}),
    "rock_fg_1": dict(kind="rock", variant=4, view="three_quarter", height=30, edge=0, clips={"tumble": ("rock_4_tumble_idle", 12)}),
    "chained": dict(kind="chained", view="three_quarter", height=64, edge=0, clips={"blink": ("chained_blink_idle", 4)}),
    "cache": dict(kind="cache", view="three_quarter", height=22, clips={"pulse": ("cache_pulse_idle", 4)}),
    "buoy": dict(kind="buoy", view="three_quarter", height=16, clips={"blink": ("buoy_blink_idle", 4)}),
}


# --- the Kestrel ---------------------------------------------------------------------------------

FLY = [(0, (0.3, 1.6, 0.3)), (0.05, (0.1, 3.0, 0.1)), (0.1, (0.4, 2.0, 0.4)), (0.15, (0.2, 3.4, 0.2)), (0.2, (0.3, 1.6, 0.3))]
BURN = [(0, (1.0, 5.0, 1.0)), (0.05, (0.7, 7.5, 0.7)), (0.1, (1.1, 5.5, 1.1)), (0.15, (0.8, 8.0, 0.8)), (0.2, (1.0, 5.0, 1.0))]
ATTITUDE = {"": (0, 0, 0), "up": (0.22, 0.14, 0), "down": (-0.22, 0.02, 0)}


def kestrel():
    root = group("ship", kind="ship")
    body = group("ship_body", parent=root)
    ships.kestrel(body)
    for pid, c, r in [*ships.START["kestrel"], ("thruster", 1, 4), ("thruster", 3, 4)]:
        x, y = ships.sock(ships.FRAMES["kestrel"], c, r)
        s = group(f"ship_{pid}_{c}_{r}", loc=(x, y, ships.DECK), parent=body)
        ships.PARTS[pid](s, False)
    flames = [o for o in body.children_recursive if o.name.startswith("thruster_flame")]
    for a, rot in ATTITUDE.items():
        for c, keys in (("fly", FLY), ("burn", BURN)):
            clip = f"ship_{a + '_' if a else ''}{c}_idle"
            animate(body, clip, "rotation_euler", [(0, rot), (0.2, rot)])
            for o in flames:
                animate(o, clip, "scale", keys)


# --- mines ---------------------------------------------------------------------------------------

def spikes(m: Model, r: float, n: int, length: float, color: str, tilt: float = 0.0, r0: float = 0.2):
    """Cones round the screen's plane (y right, z up), and a ring tilted towards the camera."""
    for k in range(n):
        a = k / n * TAU + tilt
        d = (0, math.cos(a), math.sin(a))
        # a cone along +z, turned about x to point along (cos a, sin a) in y/z
        m.cyl(r0, length, (0, d[1] * (r - 0.1), d[2] * (r - 0.1)), color, segs=5, r_top=0.03, rot=(a - math.pi / 2, 0, 0))
    for k in range(4):
        a = k / 4 * TAU + math.pi / 4
        for sx in (-1, 1):
            dx, dy, dz = sx * 0.7, math.cos(a) * 0.7, math.sin(a) * 0.7
            pitch = math.atan2(dz, math.hypot(dx, dy))
            yaw = math.atan2(dy, dx)
            m.cyl(r0 * 0.8, length * 0.75, (dx * r * 0.9, dy * r * 0.9, dz * r * 0.9), color, segs=5, r_top=0.03,
                  rot=(0, math.pi / 2 - pitch, yaw))


def eye(root_name: str, parent, loc, on: str, off: str, r: float, clip: str):
    """A lamp that blinks: a lit ball that shrinks away over a dark one (frame 0 lit, 1 dark)."""
    dark = Model(f"{root_name}_eye_off")
    dark.ball(r * 0.9, (0, 0, 0), off, subdiv=1)
    dark.build(parent, loc=loc)
    lit = Model(f"{root_name}_eye_on")
    lit.ball(r, (0, 0, 0), on, subdiv=1, glow=True)
    o = lit.build(parent, loc=loc)
    animate(o, clip, "scale", [(0, (0, 0, 0)), (0.24, (0, 0, 0)), (0.25, (-1, -1, -1)), (0.49, (-1, -1, -1)), (0.5, (0, 0, 0))])
    return o


def mine(v: int):
    root = group(f"mine_{v}", kind="mine", variant=v)
    m = Model(f"mine_{v}_body", seed=20 + v)
    R = 1.0
    blink = f"mine_{v}_blink_idle"
    if v in (0, 1):
        m.ball(R, (0, 0, 0), STEEL, subdiv=2)
        m.cyl(R * 1.04, 0.28, (0, 0, -0.14), STEEL_L, segs=12)                   # the seam round it
        m.ball(R * 0.55, (-0.25, -0.25, 0.45), STEEL_L, subdiv=1)                  # a lit shoulder
        spikes(m, R, 6, 0.75, SPIKE)
        if v == 1:
            # the eyelet on top and the end of its chain
            m.cyl(0.32, 0.3, (0, 0, R - 0.05), STEEL_D, segs=6)
            for k, z in enumerate((1.45, 1.95, 2.45)):
                m.box((0.12, 0.26, 0.5) if k % 2 == 0 else (0.26, 0.12, 0.5), (0, 0, z), SPIKE)
            m.box((0.5, 0.5, 0.12), (0, 0, R + 0.22), RUST)
        m.build(root)
        for sx in (-1, 1):
            eye(f"mine_{v}_{'l' if sx < 0 else 'r'}", root, (sx * 0.8, 0, 0.3), EYE, EYE_OFF, 0.42, blink)
        return
    if v == 2:
        # the magnet: a squat drum, two prongs that open out to reach for you, coils that light up
        m.cyl(0.95, 1.1, (0, 0, -0.55), BLUE_D, segs=10)
        m.cyl(1.02, 0.22, (0, 0, -0.1), STEEL_L, segs=10)
        m.cyl(0.6, 0.3, (0, 0, -0.85), STEEL_D, segs=8)
        spikes(m, 0.95, 4, 0.55, SPIKE, tilt=math.pi / 4)
        m.build(root)
        for s in (-1, 1):
            prong = Model(f"mine_2_prong_{'l' if s < 0 else 'r'}")
            prong.box((0.42, 0.34, 1.2), (0, 0, 0.6), STEEL_L)
            prong.box((0.46, 0.5, 0.3), (0, s * 0.1, 1.2), "#c83a3a" if s < 0 else STEEL_L)
            prong.box((0.5, 0.4, 0.18), (0, 0, 0.3), BLUE_D)
            p = prong.build(root, loc=(0, s * 0.45, 0.5))
            p.rotation_euler = (s * -0.15, 0, 0)
            animate(p, "mine_2_reach_idle", "rotation_euler",
                    [(0, (0, 0, 0)), (0.12, (s * -0.35, 0, 0)), (0.25, (s * -0.15, 0, 0)), (0.37, (s * -0.4, 0, 0)), (0.5, (0, 0, 0))])
            animate(p, "mine_2_blink_idle", "rotation_euler", [(0, (0, 0, 0)), (0.5, (0, 0, 0))])
        coil = Model("mine_2_coil")
        coil.cyl(1.0, 0.16, (0, 0, -0.38), BLUE, segs=10, glow=True)
        coil.cyl(0.62, 0.16, (0, 0, -0.75), BLUE, segs=8, glow=True)
        c = coil.build(root)
        animate(c, "mine_2_reach_idle", "scale", [(0, (0, 0, 0)), (0.12, (0.12, 0.12, 0.5)), (0.25, (0, 0, 0)), (0.37, (0.12, 0.12, 0.5)), (0.5, (0, 0, 0))])
        animate(c, "mine_2_blink_idle", "scale", [(0, (0, 0, 0)), (0.24, (0, 0, 0)), (0.25, (-0.9, -0.9, -0.9)), (0.49, (-0.9, -0.9, -0.9)), (0.5, (0, 0, 0))])
        for sx in (-1, 1):
            eye(f"mine_2_{'l' if sx < 0 else 'r'}", root, (sx * 0.95, 0, -0.55), BLUE, BLUE_D, 0.26, "mine_2_blink_idle")
        return
    # the fuse mine: a fat barrel with a hazard band and a crown of fuse lamps that light one by
    # one as it arms, and it swells before it goes
    body = group("mine_3_core", parent=root)
    m.cyl(0.95, 1.6, (0, 0, -0.8), RUST, segs=10)
    m.cyl(1.0, 0.3, (0, 0, -0.15), HAZARD, segs=10)
    m.cyl(1.0, 0.12, (0, 0, -0.15 + 0.3), STEEL_D, segs=10)
    m.cyl(1.0, 0.12, (0, 0, -0.27), STEEL_D, segs=10)
    m.cyl(0.7, 0.3, (0, 0, 0.8), STEEL, segs=8)
    m.cyl(0.7, 0.3, (0, 0, -1.1), STEEL, segs=8)
    spikes(m, 0.95, 4, 0.55, SPIKE)
    m.build(body)
    for sx in (-1, 1):
        eye(f"mine_3_{'l' if sx < 0 else 'r'}", body, (sx * 0.95, 0, -0.55), AMBER, EYE_OFF, 0.24, "mine_3_blink_idle")
    lamps = []
    for k in range(4):
        a = k / 4 * TAU + math.pi / 4
        lm = Model(f"mine_3_fuse_{k}")
        lm.ball(0.2, (0, 0, 0), "#fff4c0", subdiv=1, glow=True)
        o = lm.build(body, loc=(math.cos(a) * 0.55, math.sin(a) * 0.55, 1.05))
        lamps.append(o)
        # lamp k lights at frame k + 1 (of 5 over 0.4 s)
        tk = (k + 1) * 0.1
        animate(o, "mine_3_arm", "scale", [(0, (-1, -1, -1)), (max(0, tk - 0.01), (-1, -1, -1)), (tk, (0.3, 0.3, 0.3)), (0.4, (0, 0, 0))])
        animate(o, "mine_3_blink_idle", "scale", [(0, (-1, -1, -1)), (0.5, (-1, -1, -1))])
    animate(body, "mine_3_arm", "scale", [(0, (0, 0, 0)), (0.3, (0.08, 0.08, 0.06)), (0.35, (0.16, 0.16, 0.1)), (0.4, (0.22, 0.22, 0.16))])
    animate(body, "mine_3_blink_idle", "scale", [(0, (0, 0, 0)), (0.5, (0, 0, 0))])


def boom():
    root = group("boom", kind="boom")
    # rest is the widest: white core, a ring of fire, dark smoke; the clip grows them in and out
    parts = []
    for name, r, col, glow, at in (("core", 1.4, "#fff4d8", True, (0, 0, 0)),
                                   ("fire", 2.4, "#ffb03a", True, (0, 0, 0)),
                                   ("fire2", 1.6, "#ff6a2a", True, (0, 0.9, 0.8)),
                                   ("fire3", 1.5, "#ff6a2a", True, (0, -1.0, -0.6)),
                                   ("smoke", 1.4, "#4a3a4e", False, (0, 1.4, 1.5)),
                                   ("smoke2", 1.2, "#3a2e42", False, (0, -1.6, 1.1)),
                                   ("smoke3", 1.3, "#4a3a4e", False, (0, 0.6, -1.7))):
        m = Model(f"boom_{name}", seed=len(parts))
        m.ball(r, (0, 0, 0), col, subdiv=1, jitter=r * 0.12, glow=glow)
        parts.append((name, m.build(root, loc=at)))
    T = 0.7
    for name, o in parts:
        if name == "core":
            keys = [(0, (-0.4, -0.4, -0.4)), (0.08, (0.7, 0.7, 0.7)), (0.15, (0.3, 0.3, 0.3)), (0.25, (-0.5, -0.5, -0.5)), (0.35, (-1, -1, -1)), (T, (-1, -1, -1))]
        elif name.startswith("fire"):
            keys = [(0, (-0.9, -0.9, -0.9)), (0.1, (-0.35, -0.35, -0.35)), (0.25, (0, 0, 0)), (0.45, (-0.6, -0.6, -0.6)), (0.55, (-1, -1, -1)), (T, (-1, -1, -1))]
        else:
            keys = [(0, (-1, -1, -1)), (0.15, (-0.7, -0.7, -0.7)), (0.4, (-0.1, -0.1, -0.1)), (0.6, (-0.4, -0.4, -0.4)), (T, (-1, -1, -1))]
        animate(o, "boom_go", "scale", keys)
    # shards thrown out
    for k in range(7):
        a = k / 7 * TAU + 0.3
        m = Model(f"boom_shard_{k}", seed=50 + k)
        m.box((0.5, 0.35, 0.18), (0, 0, 0), SPIKE if k % 2 else "#ffd04a", rot=(k, k * 0.7, 0), glow=k % 2 == 0)
        far = (0, math.cos(a) * 3.0, math.sin(a) * 3.0)
        o = m.build(root, loc=far)
        animate(o, "boom_go", "location", [(0, (0, -far[1], -far[2])), (T, (0, 0.15 * far[1], 0.15 * far[2]))])
        animate(o, "boom_go", "scale", [(0, (0, 0, 0)), (0.5, (-0.3, -0.3, -0.3)), (T, (-1, -1, -1))])


def girder(n: int):
    """A broken truss lying flat (the top view looks down on it), its pivot at the origin and its
    reach n px (8 px a unit) along +y."""
    root = group(f"girder_{n}", kind="girder", variant=n)
    L = n / 8
    m = Model(f"girder_{n}_truss", seed=n)
    W = 0.32
    for s in (-1, 1):
        m.box((0.2, L - 0.6, 0.26), (s * W, (L + 0.4) / 2, 0), "#7a6a72")
        m.box((0.08, L - 0.6, 0.3), (s * W, (L + 0.4) / 2, 0.06), "#9a8a8a")
    k = 0
    y = 0.9
    while y < L - 0.5:
        m.box((W * 2, 0.12, 0.2), (0, y, 0), "#5a4e5a")
        m.box((0.1, 0.9, 0.18), (0, y + 0.45, 0), "#5a4e5a", rot=(0, 0, 0.6 if k % 2 else -0.6))
        if k % 3 == 1:
            m.box((W * 2 + 0.1, 0.22, 0.32), (0, y, 0.04), HAZARD)
        y += 0.9
        k += 1
    # the torn end: bent plates and a warning lamp
    m.box((0.5, 0.3, 0.3), (0.12, L - 0.25, 0), "#7a6a72", rot=(0, 0, 0.5))
    m.box((0.25, 0.4, 0.2), (-0.3, L - 0.1, 0), "#9a8a8a", rot=(0, 0, -0.7))
    m.ball(0.22, (0, L - 0.05, 0.2), "#ff5a3a", subdiv=1, glow=True)
    # the pivot: a hub with a red lamp
    m.cyl(0.75, 0.4, (0, 0, -0.2), STEEL_D, segs=10)
    m.cyl(0.55, 0.5, (0, 0, -0.2), STEEL_L, segs=8)
    m.cyl(0.22, 0.55, (0, 0, -0.2), "#ff5a3a", segs=6, glow=True)
    m.build(root)


# --- scrap and the field -------------------------------------------------------------------------

def scrap(v: int):
    root = group(f"scrap_{v}", kind="scrap", variant=v)
    m = Model(f"scrap_{v}_body", seed=60 + v)
    if v == 0:
        m.box((1.0, 0.7, 0.14), (0, 0, 0), "#d8c8a8")
        m.box((0.4, 0.7, 0.16), (0.2, 0, 0.02), "#c86a3a")
    elif v == 1:
        m.box((0.3, 1.0, 0.3), (0, 0, 0), SPIKE)
    else:
        m.box((1.1, 0.5, 0.12), (0, 0, 0), STEEL_L, rot=(0.3, 0.2, 0.4))
        m.box((0.5, 0.5, 0.14), (0.3, 0.3, 0.05), "#5a5466")
    body = m.build(root)
    animate(body, f"scrap_{v}_tumble_idle", "rotation_euler", [(0, (0, 0, 0)), (0.6, (TAU, TAU / 2, TAU / 4))])


ROCKS = [("#7a5e72", "#5a4256", 1.0), ("#8a6a5e", "#5e4640", 1.2), ("#6a5a7e", "#48405e", 0.85),
         ("#241c30", "#1a1424", 1.0), ("#2c2234", "#1e1826", 0.9)]


def rock(v: int):
    a, b, s = ROCKS[v]
    root = group(f"rock_{v}", kind="rock", variant=v)
    m = Model(f"rock_{v}_body", seed=40 + v)
    m.ball(1.0 * s, (0, 0, 0), a, subdiv=1, jitter=0.22, scale=(1.15, 1.0, 0.85))
    m.ball(0.5 * s, (0.5 * s, 0.4 * s, 0.35 * s), b, subdiv=0, jitter=0.08)
    m.ball(0.4 * s, (-0.45 * s, -0.55 * s, 0.2 * s), b, subdiv=0, jitter=0.06)
    if v < 3:
        m.ball(0.25 * s, (0.3 * s, -0.2 * s, 0.75 * s), "#a88a8a", subdiv=0)    # a lit crater rim
    body = m.build(root)
    spin = (TAU, TAU / 2, 0) if v % 2 else (TAU / 2, TAU, 0)
    animate(body, f"rock_{v}_tumble_idle", "rotation_euler", [(0, (0, 0, 0)), (1.0, spin)])


def chained():
    """A big old mine hung on a chain from a rock, far off in the field: its eye blinks."""
    root = group("chained", kind="chained")
    m = Model("chained_body", seed=9)
    m.ball(2.2, (0, 0, 7.0), "#3a2c40", subdiv=1, jitter=0.4, scale=(1.3, 1.4, 0.8))    # the anchor rock
    for k in range(9):
        z = 5.2 - k * 0.55
        m.box((0.16, 0.42, 0.6) if k % 2 == 0 else (0.42, 0.16, 0.6), (0, 0.05 * k, z), "#6a5e72")
    m.ball(1.2, (0, 0.5, 0), "#4a3c52", subdiv=2)
    m.cyl(1.24, 0.3, (0, 0.5, -0.15), "#6a5e72", segs=12)
    spikes_m = m
    for k in range(8):
        a = k / 8 * TAU
        spikes_m.cyl(0.22, 0.8, (0, 0.5 + math.cos(a) * 1.1, math.sin(a) * 1.1), "#7a6e82", segs=5, r_top=0.03, rot=(a - math.pi / 2, 0, 0))
    m.build(root)
    for sx in (-1, 1):
        e = Model(f"chained_eye_{sx}")
        e.ball(0.4, (0, 0, 0), EYE, subdiv=1, glow=True)
        o = e.build(root, loc=(sx * 1.15, 0.5, 0.1))
        animate(o, "chained_blink_idle", "scale", [(0, (0, 0, 0)), (0.5, (0, 0, 0)), (0.75, (-1, -1, -1)), (1.0, (0, 0, 0))])


def cache():
    """A drifting cargo pod among the mines, its seams glowing teal."""
    root = group("cache", kind="cache")
    m = Model("cache_body", seed=5)
    m.box((1.6, 2.6, 1.6), (0, 0, 0), "#5a4e5e")
    m.box((1.7, 0.3, 1.7), (0, -0.9, 0), "#3a3040")
    m.box((1.7, 0.3, 1.7), (0, 0.9, 0), "#3a3040")
    m.box((1.0, 1.2, 0.2), (0, 0, 0.85), "#7a6e7e")
    m.build(root)
    g = Model("cache_glow")
    g.box((1.66, 0.12, 1.66), (0, -0.4, 0), "#8affe0", glow=True)
    g.box((1.66, 0.12, 1.66), (0, 0.4, 0), "#8affe0", glow=True)
    g.ball(0.18, (0, 0, 1.0), "#8affe0", subdiv=1, glow=True)
    o = g.build(root)
    animate(o, "cache_pulse_idle", "scale", [(0, (0, 0, 0)), (0.5, (-0.04, -0.6, -0.04)), (1.0, (0, 0, 0))])


def buoy():
    """A marker buoy at the way out: a short post with a lamp that blinks green."""
    root = group("buoy", kind="buoy")
    m = Model("buoy_body", seed=3)
    m.cyl(0.7, 0.9, (0, 0, -0.8), STEEL, segs=8)
    m.cyl(0.74, 0.25, (0, 0, -0.45), HAZARD, segs=8)
    m.cyl(0.18, 1.2, (0, 0, 0.1), STEEL_L, segs=6)
    m.cyl(0.4, 0.12, (0, 0, 0.1), STEEL_D, segs=6)
    m.build(root)
    lamp = Model("buoy_lamp")
    lamp.ball(0.4, (0, 0, 0), "#8affb0", subdiv=1, glow=True)
    o = lamp.build(root, loc=(0, 0, 1.45))
    animate(o, "buoy_blink_idle", "scale", [(0, (0, 0, 0)), (0.24, (0, 0, 0)), (0.25, (-0.6, -0.6, -0.6)), (0.5, (-0.6, -0.6, -0.6))])


def build():
    kestrel()
    for v in range(4):
        mine(v)
    boom()
    for n in (56, 58):
        girder(n)
    for v in range(3):
        scrap(v)
    for v in range(5):
        rock(v)
    chained()
    cache()
    buoy()
