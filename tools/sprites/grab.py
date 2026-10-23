"""GRAB AND GO's sheet: the dark hold of a derelict seen from above. The drone with its four rotors,
crates (plain and gold), the cargo the stacks are built from (each in rows, with a lit lid and a
dark front), the walls with their pipes and red emergency beacons, junk on the deck, the hatch's
two doors, and the beasts: the red-eyed stalker and the pale, blind listener, each in sleep,
idle, prowl, crouch, lunge, hurt and stun.

    just sprites grab
"""
from __future__ import annotations

import math

from kit import Model, animate, group

TAU = math.pi * 2
PPU = 8
TILT = {"el": 60, "yaw": 0}        # cargo, crates, walls: seen from high up, so they have a front

# the hold
DECK = "#2a2432"
STEEL = "#4a4458"
STEEL_L = "#6e6880"
STEEL_D = "#241e2c"
RUST = "#8a4a2e"
RUST_L = "#b06a3a"
TEAL = "#2e5e62"
TEAL_L = "#4a8a86"
OLIVE = "#5a5e36"
OLIVE_L = "#7e844a"
BONE = "#a89a7a"
HAZARD = "#ffd04a"
RED = "#ff3a3a"
CARGO = [(RUST, RUST_L), (TEAL, TEAL_L), (OLIVE, OLIVE_L)]
WIDTHS = (16, 20, 24, 28, 32)

# the beasts
STALK = "#3a0e24"
STALK_L = "#6a1e3a"
STALK_D = "#1a0610"
BONE_D = "#8a6a6a"
EYE = "#ff3a5a"
PALE = "#7a7088"
PALE_L = "#a49ab0"
PALE_D = "#3a3448"
VEIN = "#c8b0ff"

BEAST_CLIPS = {"sleep": 1, "idle": 3, "prowl": 4, "crouch": 3, "lunge": 2, "hurt": 1, "stun": 2}


def beast_clips(k):
    out = {}
    for c, n in BEAST_CLIPS.items():
        loop = c in ("sleep", "idle", "prowl", "stun")
        out[c] = (f"beast_{k}_{c}{'_idle' if loop else ''}", n)
    return out


SPRITES = {
    # the drone, straight down, 16 headings, rotors spinning
    "drone": dict(kind="drone", view="top", ppu=5.5, rotations=16, clips={"spin": ("drone_spin_idle", 3)}),
    "crate": dict(kind="crate", variant=0, view=TILT, ppu=PPU),
    "crate_gold": dict(kind="crate", variant=1, view=TILT, ppu=PPU, clips={"shine": ("crate_1_shine_idle", 4)}),
    # a row of cargo for the stacks: the game lays rows to fill each stack, widest that fits
    **{f"cargo_{w}_{v}": dict(kind="cargo", variant=f"{w}_{v}", view=TILT, ppu=PPU, cover=0.4) for w in WIDTHS for v in range(4)},
    # the north wall's face, a tile of it at a time, and its beacon turning
    **{f"wall_{v}": dict(kind="wall", variant=v, view=TILT, ppu=PPU, edge=0.2) for v in range(3)},
    "beacon": dict(kind="beacon", view=TILT, ppu=PPU, clips={"spin": ("beacon_spin_idle", 4)}),
    # the hatch wall (left) and its doors, seen from straight above
    "wall_w": dict(kind="wallw", view="top", ppu=PPU),
    "door_a": dict(kind="door", variant=0, view="top", ppu=PPU, clips={"blink": ("door_0_blink_idle", 2)}),
    "door_b": dict(kind="door", variant=1, view="top", ppu=PPU, clips={"blink": ("door_1_blink_idle", 2)}),
    # junk on the deck
    **{f"junk_{v}": dict(kind="junk", variant=v, view=TILT, ppu=PPU, cover=0.35) for v in range(6)},
    # the beasts, straight down, 16 headings
    "stalker": dict(kind="beast", variant="stalker", view="top", ppu=7, rotations=10, margin=1.1, clips=beast_clips("stalker")),
    "listener": dict(kind="beast", variant="listener", view="top", ppu=7, rotations=10, margin=1.1, clips=beast_clips("listener")),
}


# --- the drone and the crates -------------------------------------------------------------------

def drone():
    root = group("drone", kind="drone")
    m = Model("drone_body", seed=1)
    # a stubby hull with its lamp forward (+y) and the hook underneath
    m.box((1.1, 1.3, 0.5), (0, 0, 0), "#5aa8a0")
    m.box((0.8, 0.9, 0.3), (0, -0.1, 0.35), "#8affe0")
    m.box((0.5, 0.4, 0.2), (0, 0.75, 0.05), STEEL_D)
    m.ball(0.2, (0, 0.92, 0.1), "#e8fff8", subdiv=1, glow=True)
    m.box((0.5, 0.25, 0.25), (0, -0.75, 0), "#2a6a5a")
    for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        m.plank_line((sx * 0.35, sy * 0.35, 0.1), (sx * 1.05, sy * 1.05, 0.2), 0.2, 0.15, STEEL)
        m.cyl(0.42, 0.12, (sx * 1.05, sy * 1.05, 0.1), STEEL_D, segs=8)
        m.cyl(0.12, 0.3, (sx * 1.05, sy * 1.05, 0.1), STEEL_L, segs=6)
    m.ball(0.1, (0.5, 0.55, 0.3), "#8aff8a", subdiv=0, glow=True)
    m.ball(0.1, (-0.5, 0.55, 0.3), "#ff5a5a", subdiv=0, glow=True)
    m.build(root)
    for k, (sx, sy) in enumerate(((1, 1), (-1, 1), (1, -1), (-1, -1))):
        r = Model(f"drone_rotor_{k}")
        r.box((0.12, 1.1, 0.04), (0, 0, 0), "#c8f0ff")
        r.box((1.1, 0.12, 0.04), (0, 0, 0), "#8aa8b8")
        o = r.build(root, loc=(sx * 1.05, sy * 1.05, 0.45))
        d = 1 if k % 3 == 0 else -1
        animate(o, "drone_spin_idle", "rotation_euler", [(0, (0, 0, 0)), (0.125, (0, 0, d * math.pi / 2))])


def crate(v: int):
    root = group(f"crate_{v}", kind="crate", variant=v)
    m = Model(f"crate_{v}_body", seed=v)
    if v == 0:
        m.box((1.3, 1.3, 1.0), (0, 0, 0.5), "#c88a3a")
        m.box((1.36, 0.22, 1.04), (0, 0, 0.5), "#8a5a2a")
        m.box((0.22, 1.36, 1.04), (0, 0, 0.5), "#8a5a2a")
        m.box((1.0, 1.0, 0.06), (0, 0, 1.0), "#e8aa5a")
        m.build(root)
        return
    m.box((1.4, 1.4, 1.1), (0, 0, 0.55), "#d8a82a")
    m.box((1.46, 1.46, 0.18), (0, 0, 0.12), "#8a6a1a")
    m.box((1.46, 1.46, 0.18), (0, 0, 1.0), "#8a6a1a")
    m.box((0.3, 0.3, 0.2), (0, 0, 1.15), "#5a4a18")
    m.box((1.0, 0.5, 0.06), (0, 0, 1.12), "#fff0a0")
    m.build(root)
    s = Model("crate_1_shine")
    s.box((0.18, 1.5, 0.08), (0, 0, 1.13), "#ffffff", glow=True, rot=(0, 0, 0.7))
    o = s.build(root)
    animate(o, "crate_1_shine_idle", "scale", [(0, (-1, -1, -1)), (0.3, (-1, -1, -1)), (0.4, (0, 0, 0)), (0.5, (-1, -1, -1)), (1.0, (-1, -1, -1))])


def cargo(w: int, v: int):
    """A row of cargo w px across, 1.1 units deep, standing 1.1 high: crates, or barrels (v 3)."""
    root = group(f"cargo_{w}_{v}", kind="cargo", variant=f"{w}_{v}")
    m = Model(f"cargo_{w}_{v}_body", seed=w * 7 + v)
    W = w / PPU
    D = 1.1
    H = 1.1
    if v == 3:
        n = max(2, round(W / 0.95))
        r = W / n / 2
        for k in range(n):
            y = -W / 2 + r + k * r * 2
            col = (RUST, TEAL, OLIVE, BONE)[(k * 3 + w) % 4]
            m.cyl(r * 0.92, H, (0, y, 0), col, segs=8)
            m.cyl(r * 0.94, 0.12, (0, y, H * 0.3), STEEL_D, segs=8)
            m.cyl(r * 0.5, 0.06, (0, y, H), STEEL_L, segs=6)
        m.build(root)
        return
    a, b = CARGO[v]
    # one long container or two crates, with ribs and a stencilled lid
    split = W > 2.6 and (w + v) % 2 == 0
    parts = [(-W / 4, W / 2), (W / 4, W / 2)] if split else [(0, W)]
    for k, (y, ww) in enumerate(parts):
        col, lid = (a, b) if k == 0 else CARGO[(v + 1) % 3]
        m.box((D, ww - 0.08, H), (0, y, H / 2), col)
        m.box((D - 0.2, ww - 0.3, 0.06), (0, y, H), lid)
        n = max(2, int(ww / 0.5))
        for i in range(1, n):
            m.box((D + 0.04, 0.08, H - 0.1), (0, y - ww / 2 + i * ww / n, H / 2), STEEL_D)
        m.box((0.3, ww * 0.4, 0.07), (0, y + ww * 0.1, H + 0.02), BONE if k == 0 else HAZARD)
    m.build(root)


# --- walls and the hatch ------------------------------------------------------------------------

def wall(v: int):
    """A 32-px stretch of the north wall: plates, ribs and pipes, its face towards the camera.
    The origin is the foot of the wall, so its face rises from there (up the screen)."""
    root = group(f"wall_{v}", kind="wall", variant=v)
    m = Model(f"wall_{v}_body", seed=v)
    W = 32 / PPU
    m.box((0.6, W, 2.6), (-0.3, 0, 1.3), STEEL)
    m.box((0.2, W, 0.3), (0.0, 0, 2.45), STEEL_L)
    for y in (-W / 2 + 0.15, W / 2 - 0.15):
        m.box((0.3, 0.3, 2.6), (0.05, y, 1.3), STEEL_D)
    if v == 0:
        m.cyl(0.22, W, (0.25, -W / 2, 1.6), RUST_L, segs=6, rot=(-math.pi / 2, 0, 0))
        m.cyl(0.15, W, (0.22, -W / 2, 0.9), TEAL_L, segs=6, rot=(-math.pi / 2, 0, 0))
        m.box((0.25, 0.3, 0.6), (0.3, 0.6, 1.6), STEEL_D)
    elif v == 1:
        m.box((0.1, 2.0, 1.4), (0.02, 0, 1.3), STEEL_D)
        for z in (0.8, 1.1, 1.4, 1.7):
            m.box((0.12, 1.8, 0.1), (0.06, 0, z), STEEL_L)
        m.cyl(0.18, W, (0.25, -W / 2, 0.35), RUST, segs=6, rot=(-math.pi / 2, 0, 0))
    else:
        m.cyl(0.22, W, (0.25, -W / 2, 1.6), RUST_L, segs=6, rot=(-math.pi / 2, 0, 0))
        m.cyl(0.4, 0.3, (0.3, 0.3, 1.6), STEEL_D, segs=8, rot=(0, math.pi / 2, 0))
        m.cyl(0.32, 0.12, (0.55, 0.3, 1.6), RED, segs=8, rot=(0, math.pi / 2, 0))
        m.box((0.1, 0.8, 0.5), (0.02, -1.0, 0.8), HAZARD)
    m.build(root)


def beacon():
    root = group("beacon", kind="beacon")
    m = Model("beacon_base")
    m.box((0.5, 0.8, 0.5), (0, 0, 0), STEEL_D)
    m.cyl(0.32, 0.5, (0.1, 0, -0.05), "#5a1a24", segs=8, rot=(0, math.pi / 2, 0))
    m.build(root)
    lamp = Model("beacon_lamp")
    lamp.box((0.25, 0.6, 0.28), (0, 0, 0), RED, glow=True)
    lamp.box((0.27, 0.2, 0.3), (0, 0.15, 0), "#ffd8c8", glow=True)
    o = lamp.build(root, loc=(0.55, 0, 0.2))
    animate(o, "beacon_spin_idle", "rotation_euler", [(0, (0, 0, 0)), (0.5, (TAU, 0, 0))])


def wallw():
    """A 16-px tile of the hatch wall, seen from above: the top of a thick bulkhead."""
    root = group("wallw", kind="wallw")
    m = Model("wallw_body")
    m.box((2.0, 1.1, 1.0), (0, 0, 0), STEEL)
    m.box((2.0, 0.2, 1.1), (0, 0.45, 0), STEEL_L)
    m.box((0.2, 1.1, 1.05), (0.9, 0, 0), STEEL_D)
    m.ball(0.1, (0, -0.2, 0.55), "#8a8098", subdiv=0)
    m.build(root)


def door(v: int):
    """One leaf of the hatch: a heavy slab with a striped edge and a lamp. The origin sits on its
    leading edge (the one that meets the other leaf), and the leaf runs away from it."""
    root = group(f"door_{v}", kind="door", variant=v)
    m = Model(f"door_{v}_body", seed=v)
    s = -1 if v == 0 else 1          # which way up the screen the leaf runs (top view: +x is down)
    L = 4.0
    m.box((L, 1.0, 1.2), (s * L / 2, 0, 0), "#5a5466")
    m.box((L - 0.3, 0.6, 0.15), (s * L / 2, 0, 0.62), "#6e6880")
    for k in range(4):
        m.box((0.25, 1.04, 1.24), (s * (0.15 + k * 0.5), 0, 0), HAZARD if k % 2 == 0 else STEEL_D)
    for k in range(3):
        m.box((0.12, 0.8, 0.1), (s * (2.2 + k * 0.5), 0, 0.68), STEEL_D)
    m.build(root)
    lamp = Model(f"door_{v}_lamp")
    lamp.ball(0.22, (0, 0, 0), "#ffb03a", subdiv=1, glow=True)
    o = lamp.build(root, loc=(s * 2.0, 0.25, 0.75))
    animate(o, f"door_{v}_blink_idle", "scale", [(0, (0, 0, 0)), (0.24, (0, 0, 0)), (0.25, (-1, -1, -1)), (0.5, (-1, -1, -1))])


def junk(v: int):
    root = group(f"junk_{v}", kind="junk", variant=v)
    m = Model(f"junk_{v}_body", seed=80 + v)
    if v == 0:     # a bent deck plate
        m.box((1.4, 1.8, 0.12), (0, 0, 0.06), STEEL_L, rot=(0.15, 0, 0.4))
        m.box((0.6, 0.6, 0.1), (0.3, 0.5, 0.1), RUST, rot=(0, 0, 0.4))
    elif v == 1:   # a coil of cable
        for k in range(10):
            a = k / 10 * TAU
            m.box((0.22, 0.4, 0.14), (math.cos(a) * 0.6, math.sin(a) * 0.6, 0.07), "#3a3448", rot=(0, 0, a))
        m.plank_line((0.6, 0, 0.07), (1.2, 1.2, 0.07), 0.16, 0.12, "#3a3448")
    elif v == 2:   # a smashed crate
        for k, (x, y, r) in enumerate(((0, 0, 0.3), (0.5, 0.6, 1.1), (-0.6, 0.3, -0.5), (0.2, -0.7, 2.0))):
            m.box((0.25, 1.1, 0.12), (x, y, 0.06 + k * 0.05), "#8a5a2a" if k % 2 else "#c88a3a", rot=(0, 0, r))
    elif v == 3:   # what's left of the last drone: a cracked shell and a bent rotor arm
        m.box((1.1, 1.3, 0.45), (0, 0, 0.2), "#3a6a64", rot=(0.2, 0.3, 0.5))
        m.box((0.6, 0.5, 0.3), (0.2, 0.1, 0.4), STEEL_D, rot=(0, 0, 0.5))
        m.plank_line((0.3, 0.4, 0.2), (1.3, 1.2, 0.05), 0.18, 0.12, STEEL)
        m.box((0.12, 1.1, 0.04), (1.3, 1.2, 0.06), "#8aa8b8", rot=(0, 0, 0.9))
    elif v == 4:   # gouges in the deck: three claw marks
        for k in range(3):
            m.box((0.12, 2.0, 0.03), (k * 0.35 - 0.35, 0, 0.015), "#120a16", rot=(0, 0, 0.35))
            m.box((0.06, 1.8, 0.04), (k * 0.35 - 0.3, 0.05, 0.02), "#4a3a4e", rot=(0, 0, 0.35))
    else:          # bones: something that didn't get out
        m.box((0.18, 1.6, 0.15), (0, 0, 0.08), "#c8bca0", rot=(0, 0, 0.3))
        for k in range(4):
            m.box((0.9, 0.1, 0.12), (0.1, -0.5 + k * 0.32, 0.1), "#a89a7a", rot=(0, 0, 0.35 + k * 0.05))
        m.ball(0.32, (0.25, 1.0, 0.2), "#d8ccb0", subdiv=1, scale=(1, 1.3, 0.8))
        m.ball(0.08, (0.4, 1.15, 0.38), "#120a16", subdiv=0)
    m.build(root)


# --- the beasts -----------------------------------------------------------------------------------

def leg(name, parent, hip, yaw, l1, l2, w, col, tip):
    """A jointed leg from its hip: the thigh rises outward to a knee, the shin drops to a claw.
    Swinging the hip about z walks it; turning it about y lifts it (curling it in)."""
    g = group(name, loc=hip, rot_z=yaw, parent=parent)
    m = Model(f"{name}_mesh")
    m.plank_line((0, 0, 0), (l1, 0, 0.7), w, w, col)
    m.ball(w * 0.8, (l1, 0, 0.7), col, subdiv=0)
    m.plank_line((l1, 0, 0.7), (l1 + l2, 0, -0.35), w * 0.8, w * 0.8, col)
    m.cyl(w * 0.5, 0.3, (l1 + l2, 0, -0.45), tip, segs=4, r_top=0.02, rot=(0, 2.6, 0))
    m.build(g)
    return g


def beast(k: str):
    pale = k == "listener"
    body_c, top_c, dark_c = (PALE, PALE_L, PALE_D) if pale else (STALK, STALK_L, STALK_D)
    root = group(f"beast_{k}", kind="beast", variant=k)
    body = group(f"beast_{k}_body", parent=root)
    m = Model(f"beast_{k}_torso", seed=3 if pale else 7)
    if pale:
        # bloated and ribbed, a fat sac behind, a round mouth ringed with teeth in front
        m.ball(1.25, (0, -1.0, 0.5), body_c, subdiv=2, scale=(1.0, 1.15, 0.7), jitter=0.05)
        m.ball(0.95, (0, 0.5, 0.6), top_c, subdiv=1, scale=(1.0, 1.0, 0.7))
        for i in range(4):
            m.box((1.9 - i * 0.2, 0.14, 0.2), (0, -1.6 + i * 0.5, 1.2 - abs(i - 1.5) * 0.08), dark_c)
        m.cyl(0.55, 0.4, (0, 1.35, 0.5), dark_c, segs=10, rot=(-math.pi / 2, 0, 0))
        m.cyl(0.36, 0.42, (0, 1.37, 0.5), VEIN, segs=8, rot=(-math.pi / 2, 0, 0), glow=True)
        for i in range(8):
            a = i / 8 * TAU
            m.cyl(0.09, 0.3, (math.cos(a) * 0.42, 1.65, 0.5 + math.sin(a) * 0.42), "#e8dcc8", segs=4, r_top=0.01,
                  rot=(-math.pi / 2, 0, 0))
    else:
        # a lean crimson body: plated abdomen with a row of bone spines, a narrow waist, a wedge head
        m.ball(1.15, (0, -1.15, 0.55), body_c, subdiv=2, scale=(0.95, 1.25, 0.65))
        m.ball(0.85, (0, 0.35, 0.6), top_c, subdiv=1, scale=(0.95, 1.0, 0.7))
        for i in range(5):
            m.cyl(0.13, 0.6, (0, -2.0 + i * 0.42, 1.05 - abs(i - 2) * 0.1), BONE_D, segs=4, r_top=0.02)
            m.box((1.3 - abs(i - 2) * 0.2, 0.1, 0.15), (0, -2.0 + i * 0.42, 0.95 - abs(i - 2) * 0.1), dark_c)
        m.prism([(-0.55, 0), (0.55, 0), (0.25, 0.9), (-0.25, 0.9)], 0.5, (0, 1.05, 0.55), body_c, rot=(-math.pi / 2, 0, 0))
    m.build(body)

    # legs: four a side, splayed forward and back
    legs = []
    n = 3 if pale else 4
    for s in (-1, 1):
        for i in range(n):
            hy = 0.8 - i * (0.75 if pale else 0.55)
            # the leg points along +x before its yaw: aim it out to the side, raked forward or back
            spread = math.radians(50 - i * (45 if pale else 33))
            yaw = spread if s > 0 else math.pi - spread
            g = leg(f"beast_{k}_leg_{'r' if s > 0 else 'l'}{i}", body, (s * 0.5, hy, 0.6), yaw,
                    0.95 if pale else 0.85, 1.15 if pale else 1.05, 0.36 if pale else 0.3, STALK_L if not pale else body_c,
                    "#e8dcc8" if pale else BONE_D)
            legs.append((g, s, i))

    # the face: eyes (stalker) or feelers (listener), and jaws
    head = group(f"beast_{k}_head", loc=(0, 1.35 if not pale else 1.4, 0.6), parent=body)
    jaws = []
    for s in (-1, 1):
        j = group(f"beast_{k}_jaw_{s}", loc=(s * 0.28, 0.2, 0), parent=head)
        jm = Model(f"beast_{k}_jaw_{s}_mesh")
        jm.plank_line((0, 0, 0), (s * 0.2, 0.75, -0.05), 0.24, 0.2, BONE_D if not pale else "#e8dcc8")
        jm.plank_line((s * 0.2, 0.75, -0.05), (-s * 0.15, 1.15, -0.1), 0.18, 0.14, "#e8dcc8")
        jm.build(j)
        jaws.append((j, s))
    feelers = []
    if pale:
        for s in (-1, 1):
            f = group(f"beast_{k}_feeler_{s}", loc=(s * 0.4, 0.1, 0.25), rot_z=-s * 0.35, parent=head)
            fm = Model(f"beast_{k}_feeler_{s}_mesh")
            fm.plank_line((0, 0, 0), (0, 0.9, 0.3), 0.16, 0.16, PALE_L)
            fm.plank_line((0, 0.9, 0.3), (s * 0.35, 1.6, 0.1), 0.13, 0.13, VEIN)
            fm.ball(0.14, (s * 0.35, 1.6, 0.1), VEIN, subdiv=0, glow=True)
            fm.build(f)
            feelers.append((f, s))
        # pale veins glowing faintly along its back
        v = Model(f"beast_{k}_veins")
        for i in range(3):
            v.box((0.08, 1.2, 0.05), ((i - 1) * 0.45, -1.0, 1.3 - abs(i - 1) * 0.15), VEIN, glow=True, rot=(0, 0, (i - 1) * 0.15))
        veins = v.build(body)
    else:
        e = Model(f"beast_{k}_eyes")
        for x, y, r in ((-0.24, 0.3, 0.2), (0.24, 0.3, 0.2), (-0.45, 0.02, 0.15), (0.45, 0.02, 0.15), (-0.12, 0.6, 0.12), (0.12, 0.6, 0.12)):
            e.ball(r, (x, y, 0.3), EYE, subdiv=1, glow=True)
        eyes = e.build(head)

    # --- clips (each sets every moving part, so frames don't inherit another clip's pose)
    def legs_keys(clip, fn, times):
        for g, s, i in legs:
            animate(g, clip, "rotation_euler", [(t, fn(t, s, i)) for t in times])

    def still(clip, objs, path, dur):
        for o in objs:
            animate(o, clip, path, [(0, (0, 0, 0)), (dur, (0, 0, 0))])

    jaw_objs = [j for j, _ in jaws]
    feel_objs = [f for f, _ in feelers]

    def pose(clip, dur, body_rot=None, body_loc=None, body_scale=None, head_scale=None, jaw=None, feel=None, legf=None, times=None):
        ts = times or [0, dur]
        animate(body, clip, "rotation_euler", [(t, body_rot(t) if body_rot else (0, 0, 0)) for t in ts])
        animate(body, clip, "location", [(t, body_loc(t) if body_loc else (0, 0, 0)) for t in ts])
        animate(body, clip, "scale", [(t, body_scale(t) if body_scale else (0, 0, 0)) for t in ts])
        for j, s in jaws:
            animate(j, clip, "rotation_euler", [(t, (0, 0, s * jaw(t)) if jaw else (0, 0, 0)) for t in ts])
        for f, s in feelers:
            animate(f, clip, "rotation_euler", [(t, (0, 0, s * feel(t)) if feel else (0, 0, 0)) for t in ts])
        legs_keys(clip, legf or (lambda t, s, i: (0, 0, 0)), ts)

    L = f"beast_{k}"
    # sleep: legs folded in under it, a slow breath
    pose(f"{L}_sleep_idle", 2.0, times=[0, 1.0, 2.0],
         body_scale=lambda t: (0.04, 0.03, 0.08) if t == 1.0 else (0, 0, 0),
         body_loc=lambda t: (0, 0, -0.25),
         jaw=lambda t: -0.15,
         feel=lambda t: 0.5,
         legf=lambda t, s, i: (0, -0.9, s * 0.25 * (1 if i < 2 else -1)))
    # idle: awake, legs shifting, jaws working
    pose(f"{L}_idle_idle", 1.0, times=[0, 0.25, 0.5, 0.75, 1.0],
         body_scale=lambda t: (0.03, 0.02, 0.05) if t in (0.25, 0.75) else (0, 0, 0),
         jaw=lambda t: 0.25 * math.sin(t * TAU * 2) ** 2,
         feel=lambda t: 0.25 * math.sin(t * TAU),
         legf=lambda t, s, i: (0, -0.12 * max(0, math.sin(t * TAU + i * 1.7 + s)), 0.08 * math.sin(t * TAU + i * 1.7 + s)))
    # prowl: an alternating gait, the body rocking
    walk = [i / 6 * 0.6 for i in range(7)]
    pose(f"{L}_prowl_idle", 0.6, times=walk,
         body_rot=lambda t: (0, 0.06 * math.sin(t / 0.6 * TAU), 0.05 * math.sin(t / 0.6 * TAU)),
         jaw=lambda t: 0.1,
         feel=lambda t: 0.3 * math.sin(t / 0.6 * TAU * 2),
         legf=lambda t, s, i: (0, -0.35 * max(0, math.sin(t / 0.6 * TAU + ((i + (s > 0)) % 2) * math.pi)),
                               0.45 * s * math.cos(t / 0.6 * TAU + ((i + (s > 0)) % 2) * math.pi)))
    # crouch: it flattens, spreads its legs wide, rears its back end and opens its jaws wide
    cr = [0, 0.15, 0.3, 0.45]
    pose(f"{L}_crouch", 0.45, times=cr,
         body_loc=lambda t: (0, -0.5 * t / 0.45, -0.3 * t / 0.45),
         body_scale=lambda t: (0.2 * t / 0.45, -0.12 * t / 0.45, -0.25 * t / 0.45),
         body_rot=lambda t: (-0.12 * t / 0.45 + (0.03 if t == 0.3 else 0), 0, 0),
         jaw=lambda t: 0.75 * t / 0.45,
         feel=lambda t: -0.3 * t / 0.45,
         legf=lambda t, s, i: (0, 0.15 * t / 0.45, -s * 0.25 * t / 0.45 * (1 if i < 2 else -1)))
    # lunge: stretched out, legs swept back, jaws thrown open
    pose(f"{L}_lunge", 0.2, times=[0, 0.1, 0.2],
         body_loc=lambda t: (0, 0.3, 0.15),
         body_scale=lambda t: (-0.1, 0.15, 0.05),
         jaw=lambda t: 0.9 if t < 0.2 else 0.3,
         feel=lambda t: 0.5,
         legf=lambda t, s, i: (0, -0.2, -s * (0.6 if t > 0 else 0.4)))
    # hurt: thrown back, legs flailing
    pose(f"{L}_hurt", 0.3, times=[0, 0.1, 0.2, 0.3],
         body_loc=lambda t: (0, -0.4 if t < 0.3 else -0.1, 0),
         body_rot=lambda t: (0.2 if t == 0.1 else -0.1 if t == 0.2 else 0, 0.25 if t == 0.1 else -0.2 if t == 0.2 else 0, 0),
         body_scale=lambda t: (0.12, -0.12, 0) if t == 0.1 else (0, 0, 0),
         jaw=lambda t: 0.6,
         feel=lambda t: 0.8 if t == 0.1 else 0,
         legf=lambda t, s, i: (0, -0.5 * (t > 0 and t < 0.3), s * 0.4 * math.sin(t * 30 + i)))
    # stun: on its back half, legs curled in and twitching
    pose(f"{L}_stun_idle", 0.6, times=[0, 0.15, 0.3, 0.45, 0.6],
         body_rot=lambda t: (0, 0.35 + 0.05 * math.sin(t / 0.6 * TAU * 2), 0.08 * math.sin(t / 0.6 * TAU)),
         body_loc=lambda t: (0, 0, -0.2),
         jaw=lambda t: -0.1,
         feel=lambda t: 0.9 + 0.2 * math.sin(t / 0.6 * TAU * 2),
         legf=lambda t, s, i: (0, -1.1 - 0.25 * max(0, math.sin(t / 0.6 * TAU * 2 + i)), s * 0.2))
    # the stalker's eyes dim when it sleeps, flare when it crouches
    if not pale:
        eyes_keys = {"sleep_idle": (-0.6, 2.0), "idle_idle": (0, 1.0), "prowl_idle": (0, 0.6), "crouch": (0.35, 0.45),
                     "lunge": (0.3, 0.2), "hurt": (-0.3, 0.3), "stun_idle": (-0.7, 0.6)}
        for c, (sc, dur) in eyes_keys.items():
            animate(eyes, f"{L}_{c}", "scale", [(0, (sc, sc, sc)), (dur, (sc, sc, sc))])
    else:
        vk = {"sleep_idle": (-0.5, 2.0), "idle_idle": (0, 1.0), "prowl_idle": (0, 0.6), "crouch": (0.2, 0.45),
              "lunge": (0.2, 0.2), "hurt": (0, 0.3), "stun_idle": (-0.6, 0.6)}
        for c, (sc, dur) in vk.items():
            animate(veins, f"{L}_{c}", "scale", [(0, (0, 0, sc)), (dur, (0, 0, sc))])
    _ = still, jaw_objs, feel_objs


def build():
    drone()
    for v in range(2):
        crate(v)
    for w in WIDTHS:
        for v in range(4):
            cargo(w, v)
    for v in range(3):
        wall(v)
    beacon()
    wallw()
    for v in range(2):
        door(v)
    for v in range(6):
        junk(v)
    beast("stalker")
    beast("listener")
