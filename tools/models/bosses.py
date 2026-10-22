"""The eight planet bosses, one `boss_<planetid>` each.

Conventions:
- Root empty at the origin, everything parented under it. Bosses FACE -y (towards the player, who
  is below them on screen). About 12-18 units wide. Fixed colours from each boss's `colors` in
  src/world/planets.ts (main, secondary, accent), no Skins.
- Markers (empties parented to the root, in the root's space, glTF extras):
    `mount` with mount="gun"  : where bullets come from (4-8 per boss), roughly facing -y.
    `mount` with mount="weak" : 1-3 glowing weak points.
- Idle clips `boss_<id>_<name>_idle` loop (wings, legs, cranes, a beating heart...).
"""
from __future__ import annotations

import math

from mathutils import Vector

from kit import Model, animate, group

TAU = math.pi * 2
FWD = (math.pi / 2, 0, 0)      # cylinder axis along -y (towards the player)
UPY = (-math.pi / 2, 0, 0)     # cylinder axis along +y

STEEL = "#5c626c"
DARK = "#2a2c32"
METAL = "#8a9098"


def limb(m: Model, a, b, r0, r1, color, segs=6, glow=False):
    """A tapered round limb from a (radius r0) to b (radius r1)."""
    d = Vector(b) - Vector(a)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler()
    m.cyl(r0, d.length, a, color, segs=segs, r_top=r1, rot=tuple(rot), glow=glow)


def mount(root, loc, kind):
    return group("mount", loc=loc, parent=root, mount=kind)


def loop(obj, clip, path, period, offsets):
    """Evenly spaced keys over one period; the first is repeated at the end so the loop is seamless."""
    n = len(offsets)
    keys = [(period * i / n, v) for i, v in enumerate(offsets)] + [(period, offsets[0])]
    animate(obj, clip, path, keys)


def hexc(c: int) -> str:
    return f"#{c:06x}"


# --- ORU-TAL: GREAT MOTHER VASK, a caged queen pterosaur armoured by the Hesk ---------------------
#
# A pteranodon from above: a long crest behind a long beak, long narrow wings on a long fourth
# finger, a short tail. Her parts hinge where she moves (neck, jaw, inner and outer wing, legs,
# tail) for her poses (see VASK_POSES). The Hesk brass is in pieces of its own with `shed`: the
# phase it breaks away in (the cage's front and her shoulder turrets in the second, the rest of
# the cage, her wing guns and her muzzle in the third, when she's free).

def ccw(pts):
    """The outline counter-clockwise (as slab wants it)."""
    area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]))
    return pts if area > 0 else pts[::-1]


def boss_orutal():
    RED, BRASS, GLOW = hexc(0xb8503a), hexc(0xc8a040), hexc(0xff6a1a)
    MEMB, MEMB_LT, BONE, BELLY, BEAK, CREST = "#7e2e24", "#a2463a", "#ecd4a0", "#d88a5a", "#c8a070", "#f08a30"
    root = group("boss_orutal", kind="boss_orutal")
    body = group("vask_body", loc=(0, 0, 2.0), parent=root)

    # the body, and the Hesk harness strapped round it (her reactor: the weak point on her back)
    t = Model("vask_torso")
    t.ball(1.45, (0, 0.1, 0), RED, subdiv=1, scale=(1.0, 1.65, 0.75))
    t.ball(1.15, (0, 0.0, -0.4), BELLY, subdiv=1, scale=(0.9, 1.5, 0.55))
    for y in (-0.9, 0.0, 0.9, 1.8):                                              # a ridge of bony knobs
        t.ball(0.22, (0, y, 1.05 - abs(y - 0.4) * 0.12), BONE, subdiv=0)
    for y in (-0.3, 1.5):                                                        # straps
        t.plank_line((-1.45, y, -0.2), (0, y, 1.1), 0.24, 0.14, DARK)
        t.plank_line((0, y, 1.1), (1.45, y, -0.2), 0.24, 0.14, DARK)
    t.cyl(0.62, 0.32, (0, 0.6, 0.8), DARK, segs=8)
    t.ball(0.46, (0, 0.6, 1.2), GLOW, subdiv=1, glow=True)
    for s in (1, -1):
        t.plank_line((s * 0.3, 0.6, 1.0), (s * 1.2, 1.6, 0.3), 0.14, 0.14, STEEL)  # feed pipes
    t.build(body)

    # neck and head, pivoting at the shoulders: beak forward, crest swept back over the neck
    n = Model("vask_neck")
    limb(n, (0, 0, 0), (0, -1.7, 0.3), 0.55, 0.36, RED)
    n.ball(0.68, (0, -2.25, 0.45), RED, subdiv=1, scale=(0.8, 1.3, 0.7))
    n.cyl(0.4, 3.3, (0, -2.75, 0.42), BONE, segs=6, r_top=0.03, rot=FWD)          # upper beak
    # the crest: a blade swept up and back off her skull, sunset orange (what the flock follows)
    n.slab(ccw([(-0.3, -2.75), (0.3, -2.75), (0.5, -0.6), (0.2, 0.9), (-0.2, 0.9), (-0.5, -0.6)]), 0.75, 1.0, CREST,
           top=ccw([(-0.22, -2.65), (0.22, -2.65), (0.42, -0.6), (0.16, 0.8), (-0.16, 0.8), (-0.42, -0.6)]))
    n.slab(ccw([(-0.36, -0.9), (0.36, -0.9), (0.18, 0.92), (-0.18, 0.92)]), 1.0, 1.08, BONE)  # a pale stripe
    for s in (1, -1):
        n.ball(0.15, (s * 0.42, -2.5, 0.62), GLOW, subdiv=0, glow=True)
    neck = n.build(body, loc=(0, -1.6, 0.35))
    j = Model("vask_jaw")
    j.cyl(0.3, 2.9, (0, 0, 0), BEAK, segs=6, r_top=0.03, rot=FWD)
    jaw = j.build(neck, loc=(0, -2.55, 0.22))
    # the Hesk muzzle: rings round her beak and a plate on her head (gone when she's free)
    mz = Model("vask_muzzle")
    for y in (-3.5, -4.3):
        mz.box((0.95, 0.18, 0.9), (0, y, 0.3), BRASS)
        mz.box((0.62, 0.2, 0.58), (0, y, 0.3), RED)
    mz.box((1.0, 1.0, 0.24), (0, -2.15, 0.88), BRASS, taper=0.7)
    for s in (1, -1):
        mz.box((0.12, 0.12, 0.36), (s * 0.3, -2.0, 1.1), STEEL)
    mz.build(neck, shed=2)

    # wings: the inner wing from the shoulder to the wrist, the long outer wing on its finger
    wings = {}
    for s in (1, -1):
        side = "r" if s > 0 else "l"
        wi = Model(f"vask_wing_in_{side}")
        inner = [(0, -0.4), (3.6, -1.0), (3.6, 0.45), (2.3, 1.5), (0.5, 2.0), (0, 1.3)]
        wi.slab(ccw([(s * x, y) for x, y in inner]), -0.07, 0.07, MEMB)
        wi.slab(ccw([(s * x, y) for x, y in [(0.3, 0.2), (3.2, -0.3), (3.2, 0.35), (2.2, 1.2), (0.6, 1.5)]]), 0.07, 0.1, MEMB_LT)
        wi.plank_line((0, -0.4, 0.08), (s * 3.6, -1.0, 0.1), 0.3, 0.3, BONE)        # arm bone
        w_in = wi.build(body, loc=(s * 1.0, -0.55, 0.35))
        wo = Model(f"vask_wing_out_{side}")
        outer = [(0, -0.15), (2.8, -0.3), (5.4, 0.55), (3.9, 1.05), (1.9, 1.35), (0, 1.45)]
        wo.slab(ccw([(s * x, y) for x, y in outer]), -0.06, 0.06, MEMB)
        wo.slab(ccw([(s * x, y) for x, y in [(0.3, 0.2), (2.6, 0.05), (4.4, 0.6), (3.4, 0.9), (0.4, 1.15)]]), 0.06, 0.09, MEMB_LT)
        wo.plank_line((0, -0.15, 0.08), (s * 2.8, -0.3, 0.08), 0.26, 0.26, BONE)    # the long finger
        wo.plank_line((s * 2.8, -0.3, 0.08), (s * 5.4, 0.55, 0.06), 0.2, 0.2, BONE)
        wo.cyl(0.13, 0.7, (0, -0.2, 0.1), BONE, segs=4, r_top=0.02, rot=FWD)          # wrist claw
        w_out = wo.build(w_in, loc=(s * 3.6, -0.85, 0.02))
        # the Hesk gun pod and armour on her arm (gone when she's free)
        g = Model(f"vask_wing_gun_{side}")
        g.box((1.5, 1.0, 0.22), (s * 1.7, 0.1, 0.16), BRASS, taper=0.85)
        g.cyl(0.3, 0.38, (s * 1.8, -0.5, 0.2), STEEL, segs=6)
        g.cyl(0.12, 1.0, (s * 1.8, -0.6, 0.4), DARK, segs=5, rot=FWD)
        g.box((0.18, 0.18, 0.18), (s * 1.4, 0.45, 0.32), GLOW, glow=True)
        g.build(w_in, shed=2)
        # legs tucked under, talons clutching
        lg = Model(f"vask_leg_{side}")
        limb(lg, (0, 0, 0), (s * 0.15, 1.1, -0.3), 0.26, 0.17, RED, segs=5)
        for k in (-1, 0, 1):
            limb(lg, (s * 0.15, 1.1, -0.3), (s * (0.15 + k * 0.22), 1.5, -0.45), 0.08, 0.03, BONE, segs=4)
        leg = lg.build(body, loc=(s * 0.6, 1.5, -0.4))
        wings[s] = (w_in, w_out, leg)

    tl = Model("vask_tail")
    limb(tl, (0, 0, 0), (0, 2.3, 0.15), 0.38, 0.1, RED, segs=5)
    tl.slab(ccw([(0, 1.9), (0.55, 2.4), (0, 3.0), (-0.55, 2.4)]), 0.1, 0.25, BONE)             # tail vane
    tail = tl.build(body, loc=(0, 2.2, 0.05))

    # the Hesk cage: its front hoop and the shoulder turrets break off first, then the rest
    def hoop(m, y):
        pts = [(-1.6, y, -0.3), (-1.3, y, 0.7), (0, y, 1.4), (1.3, y, 0.7), (1.6, y, -0.3)]
        for p0, p1 in zip(pts, pts[1:]):
            m.plank_line(p0, p1, 0.22, 0.22, BRASS)
    cf = Model("vask_cage_front")
    hoop(cf, -0.9)
    for s in (1, -1):
        cf.cyl(0.42, 0.3, (s * 1.55, -0.6, 0.55), STEEL, segs=6)
        cf.box((0.66, 0.66, 0.34), (s * 1.55, -0.6, 0.95), BRASS, taper=0.8)
        for dx in (-0.14, 0.14):
            cf.cyl(0.1, 0.9, (s * 1.55 + dx, -0.8, 0.95), DARK, segs=5, rot=FWD)
    cf.build(body, shed=1)
    cb = Model("vask_cage")
    for y in (0.4, 1.6):
        hoop(cb, y)
    for x in (-1.3, 0, 1.3):
        z = 1.4 if x == 0 else 0.7
        cb.plank_line((x, -0.95, z), (x, 1.65, z), 0.18, 0.18, BRASS)
    cb.build(body, shed=2)

    vask_poses(body, neck, jaw, tail, wings)

    for x, y, z in ((0, -7.4, 2.7), (-1.55, -1.5, 2.95), (1.55, -1.5, 2.95), (-2.8, -1.3, 2.55), (2.8, -1.3, 2.55)):
        mount(root, (x, y, z), "gun")
    mount(root, (0, 0.6, 3.3), "weak")
    mount(root, (0, -3.85, 2.9), "weak")


BEAT = 60 / 140  # her theme's beat (boss_orutal in src/audio.ts)


def vask_poses(body, neck, jaw, tail, wings):
    """Her idle soar and a pose for each of her moves (boss_orutal_<move>_<state>, see
    src/view/boss-pose.ts). Windups go into their pose and hold; the rest loop. Rotations are
    offsets: the body's x is pitch (- nose up), y is roll; a wing's y is up (-s) or down (+s), its
    z sweeps it back (+s); the jaw's x opens it; a leg's x swings it forward (-)."""
    R = "rotation_euler"

    def hold(clip, parts, t=0.4):
        for obj, path, v in parts:
            animate(obj, clip, path, [(0, (0, 0, 0)), (t, v)])

    def cycle(clip, period, parts):
        for obj, path, vs in parts:
            loop(obj, clip, path, period, vs)

    def each_wing(f):
        out = []
        for s, (w_in, w_out, leg) in wings.items():
            out += f(s, w_in, w_out, leg)
        return out

    # idle: a slow soar, the outer wing lagging the inner, the body lifting on the downstroke
    cycle("boss_orutal_flap_idle", 2.4, [
        (body, "location", [(0, 0, 0), (0, 0, 0.05), (0, 0, 0.22), (0, 0, -0.1)]),
        (neck, R, [(0, 0, 0.08), (0.06, 0, 0), (0, 0, -0.08), (-0.06, 0, 0)]),
        (jaw, R, [(0, 0, 0), (0.06, 0, 0), (0, 0, 0), (0, 0, 0)]),
        (tail, R, [(0, 0, -0.15), (0, 0, 0), (0, 0, 0.15), (0, 0, 0)]),
    ] + each_wing(lambda s, wi, wo, lg: [
        (wi, R, [(0, -s * 0.28, 0), (0, -s * 0.05, 0), (0, s * 0.26, 0), (0, -s * 0.05, 0)]),
        (wo, R, [(0, s * 0.1, 0), (0, -s * 0.25, 0), (0, -s * 0.1, 0), (0, s * 0.22, 0)]),
    ]))

    # RAKE: rears back, wings high, talons forward; then swept back, talons out
    hold("boss_orutal_rake_windup", [
        (body, R, (-0.35, 0, 0)), (neck, R, (-0.3, 0, 0)), (jaw, R, (0.25, 0, 0)), (tail, R, (0.3, 0, 0)),
    ] + each_wing(lambda s, wi, wo, lg: [(wi, R, (0, -s * 0.75, s * 0.15)), (wo, R, (0, -s * 0.4, 0)), (lg, R, (-1.9, 0, 0))]))
    cycle("boss_orutal_rake_attack", 0.3, [
        (body, R, [(0.15, 0, 0), (0.12, 0, 0)]), (neck, R, [(0.2, 0, 0), (0.24, 0, 0)]),
        (jaw, R, [(0.35, 0, 0), (0.3, 0, 0)]), (tail, R, [(-0.1, 0, 0.05), (-0.1, 0, -0.05)]),
    ] + each_wing(lambda s, wi, wo, lg: [
        (wi, R, [(0, -s * 0.15, s * 0.45), (0, -s * 0.2, s * 0.42)]),
        (wo, R, [(0, -s * 0.1, s * 0.6), (0, -s * 0.12, s * 0.65)]),
        (lg, R, [(-2.1, 0, 0), (-2.0, 0, 0)]),
    ]))

    # SKY DIVE: wings half folded as she lines up, then tucked tight
    hold("boss_orutal_skydive_windup", [
        (body, R, (-0.1, 0, 0)), (neck, R, (0.1, 0, 0)),
    ] + each_wing(lambda s, wi, wo, lg: [(wi, R, (0, -s * 0.3, s * 0.3)), (wo, R, (0, 0, s * 0.5)), (lg, R, (-0.4, 0, 0))]))
    cycle("boss_orutal_skydive_attack", 0.25, [
        (neck, R, [(0.15, 0, 0), (0.18, 0, 0)]), (tail, R, [(0, 0, 0), (0.05, 0, 0)]),
    ] + each_wing(lambda s, wi, wo, lg: [
        (wi, R, [(0, -s * 0.05, s * 0.55), (0, -s * 0.1, s * 0.55)]),
        (wo, R, [(0, 0, s * 0.8), (0, 0, s * 0.75)]),
        (lg, R, [(0.2, 0, 0), (0.25, 0, 0)]),
    ]))

    # SCREECH: head thrown back, beak open, wings spread; then a snap of the head on every beat
    hold("boss_orutal_screech_windup", [
        (body, R, (-0.2, 0, 0)), (neck, R, (-0.55, 0, 0)), (jaw, R, (0.55, 0, 0)),
    ] + each_wing(lambda s, wi, wo, lg: [(wi, R, (0, -s * 0.1, -s * 0.1)), (wo, R, (0, s * 0.05, 0)), (lg, R, (-0.6, 0, 0))]), t=0.45)
    cycle("boss_orutal_screech_attack", BEAT, [
        (body, R, [(0.05, 0, 0), (-0.1, 0, 0), (-0.2, 0, 0), (-0.15, 0, 0)]),
        (neck, R, [(-0.1, 0, 0), (-0.35, 0, 0), (-0.5, 0, 0), (-0.45, 0, 0)]),
        (jaw, R, [(0.75, 0, 0), (0.6, 0, 0), (0.45, 0, 0), (0.55, 0, 0)]),
    ] + each_wing(lambda s, wi, wo, lg: [
        (wi, R, [(0, s * 0.1, 0), (0, -s * 0.05, 0), (0, -s * 0.1, 0), (0, -s * 0.05, 0)]),
        (lg, R, [(-0.6, 0, 0)] * 4),
    ]))

    # WING GUST: wings raised high; then a hard downstroke every two beats, the body lifting
    hold("boss_orutal_gust_windup", [
        (body, R, (-0.45, 0, 0)), (neck, R, (-0.2, 0, 0)), (tail, R, (0.3, 0, 0)),
    ] + each_wing(lambda s, wi, wo, lg: [(wi, R, (0, -s * 1.0, -s * 0.1)), (wo, R, (0, -s * 0.6, 0)), (lg, R, (-1.0, 0, 0))]), t=0.5)
    g = 2 * BEAT
    animate(body, "boss_orutal_gust_attack", "location", [(0, (0, 0, 0)), (0.2 * g, (0, 0, 0.6)), (g, (0, 0, 0))])
    animate(body, "boss_orutal_gust_attack", R, [(0, (-0.45, 0, 0)), (0.2 * g, (-0.25, 0, 0)), (g, (-0.45, 0, 0))])
    animate(neck, "boss_orutal_gust_attack", R, [(0, (-0.2, 0, 0)), (0.2 * g, (0.1, 0, 0)), (g, (-0.2, 0, 0))])
    for s, (w_in, w_out, leg) in wings.items():
        animate(w_in, "boss_orutal_gust_attack", R, [(0, (0, -s * 1.0, -s * 0.1)), (0.2 * g, (0, s * 0.45, 0)), (0.6 * g, (0, -s * 0.4, 0)), (g, (0, -s * 1.0, -s * 0.1))])
        animate(w_out, "boss_orutal_gust_attack", R, [(0, (0, -s * 0.6, 0)), (0.2 * g, (0, -s * 0.1, 0)), (0.35 * g, (0, s * 0.5, 0)), (0.7 * g, (0, -s * 0.2, 0)), (g, (0, -s * 0.6, 0))])
        animate(leg, "boss_orutal_gust_attack", R, [(0, (-1.0, 0, 0)), (g, (-1.0, 0, 0))])

    # BROOD CALL: head up, crying out, wings beckoning
    cycle("boss_orutal_summon", 1.0, [
        (body, R, [(-0.2, 0, 0), (-0.25, 0, 0)]),
        (neck, R, [(-0.5, 0, 0), (-0.3, 0, 0)]),
        (jaw, R, [(0.6, 0, 0), (0.2, 0, 0)]),
    ] + each_wing(lambda s, wi, wo, lg: [(wi, R, [(0, -s * 0.4, 0), (0, -s * 0.1, 0)]), (wo, R, [(0, -s * 0.2, 0), (0, s * 0.1, 0)])]))

    # open after a move: panting, wings drooped, head low
    cycle("boss_orutal_recover", 1.3, [
        (body, "location", [(0, 0, 0), (0, 0, -0.25)]),
        (body, R, [(0.1, 0, 0), (0.15, 0, 0)]),
        (neck, R, [(0.3, 0, 0), (0.42, 0, 0)]),
        (jaw, R, [(0.15, 0, 0), (0.35, 0, 0)]),
        (tail, R, [(-0.2, 0, 0), (-0.25, 0, 0)]),
    ] + each_wing(lambda s, wi, wo, lg: [
        (wi, R, [(0, s * 0.25, s * 0.1), (0, s * 0.35, s * 0.1)]),
        (wo, R, [(0, s * 0.3, 0), (0, s * 0.42, 0)]),
        (lg, R, [(-0.8, 0, 0), (-0.8, 0, 0)]),
    ]))

    # staggered: reeling, head hanging, wings slumped, rocking side to side
    cycle("boss_orutal_stagger", 0.9, [
        (body, "location", [(0, 0, -0.4)] * 4),
        (body, R, [(0.1, 0.18, 0), (0.1, 0, 0), (0.1, -0.18, 0), (0.1, 0, 0)]),
        (neck, R, [(0.6, 0, 0.2), (0.7, 0, 0), (0.6, 0, -0.2), (0.7, 0, 0)]),
        (jaw, R, [(0.4, 0, 0)] * 4),
        (tail, R, [(-0.3, 0, 0.2), (-0.3, 0, 0), (-0.3, 0, -0.2), (-0.3, 0, 0)]),
    ] + each_wing(lambda s, wi, wo, lg: [
        (wi, R, [(0, s * 0.5, 0), (0, s * 0.45, 0), (0, s * 0.55, 0), (0, s * 0.45, 0)]),
        (wo, R, [(0, s * 0.6, s * 0.2)] * 4),
        (lg, R, [(-1.0, 0, 0)] * 4),
    ]))


# --- HALCYON: HARBOURMASTER OKO, a crane-armed fortress barge -------------------------------------

def boss_halcyon():
    HULL, NAVY, AMBER = hexc(0xd0c8b0), hexc(0x2a4a7a), hexc(0xffd04a)
    DECKC, RUST = "#8a8474", "#a8503a"
    root = group("boss_halcyon", kind="boss_halcyon")
    m = Model("oko_hull")
    hull = [(-6.0, 4.6), (-6.6, -2.4), (-4.6, -5.4), (4.6, -5.4), (6.6, -2.4), (6.0, 4.6)]
    m.slab(hull, -1.4, 0.0, NAVY, top=[(x * 1.03, y * 1.02) for x, y in hull])
    m.slab([(x * 1.03, y * 1.02) for x, y in hull], 0.0, 0.8, HULL, top=[(x * 1.0, y * 1.0) for x, y in hull])
    m.slab([(x * 0.94, y * 0.94) for x, y in hull], 0.8, 0.9, DECKC)
    for i in range(-5, 6):                                                        # deck planks
        m.box((0.08, 8.8, 0.04), (i * 1.0, -0.2, 0.92), "#7a7464")
    for s in (1, -1):                                                             # bow fenders
        m.box((0.4, 1.4, 0.6), (s * 5.7, -3.9, 0.3), "#2a2a2a", rot=(0, 0, s * 0.85))
    m.box((3.2, 0.5, 0.5), (0, -5.5, 0.4), "#2a2a2a")
    # cargo stacks amidships
    cols = [RUST, "#3a8a8a", NAVY, "#c88a2a", RUST, "#5a7a3a"]
    k = 0
    for x in (-1.6, 0.0, 1.6):
        for y in (-1.6, 0.0):
            for z in range(1 + (k % 3 == 0)):
                m.box((1.4, 1.5, 0.9), (x, y, 1.35 + z * 0.9), cols[k % len(cols)])
                m.box((1.42, 0.1, 0.92), (x, y - 0.5, 1.35 + z * 0.9), "#e8e0d0")
            k += 1
    # bridge tower at the stern with glowing windows (weak point)
    m.box((5.0, 2.6, 1.6), (0, 3.0, 1.7), HULL)
    m.box((4.0, 2.0, 1.2), (0, 3.1, 3.1), HULL)
    m.box((4.1, 0.2, 0.4), (0, 2.05, 3.2), AMBER, glow=True)                       # bridge windows
    m.box((5.1, 2.7, 0.2), (0, 3.0, 2.55), NAVY)
    m.box((4.4, 2.4, 0.2), (0, 3.1, 3.8), NAVY)
    for s in (1, -1):                                                             # smokestacks
        m.cyl(0.5, 1.8, (s * 1.4, 4.0, 3.8), NAVY, segs=7)
        m.cyl(0.52, 0.3, (s * 1.4, 4.0, 5.0), AMBER, segs=7)
        m.cyl(0.36, 0.06, (s * 1.4, 4.0, 5.6), "#1a1a1a", segs=7)
    # deck turrets: twin guns facing -y
    for x, y in ((-4.6, -3.3), (4.6, -3.3), (-2.0, -4.4), (2.0, -4.4)):
        m.cyl(0.65, 0.4, (x, y, 0.9), STEEL, segs=7)
        m.box((1.1, 1.0, 0.55), (x, y + 0.1, 1.55), NAVY, taper=0.8)
        for dx in (-0.22, 0.22):
            m.cyl(0.13, 1.1, (x + dx, y - 0.2, 1.55), DARK, segs=5, rot=FWD)
        m.box((0.3, 0.3, 0.1), (x, y + 0.3, 1.86), AMBER, glow=True)
    for s in (1, -1):                                                             # mooring lights
        m.ball(0.2, (s * 6.0, 4.4, 1.0), AMBER, subdiv=0, glow=True)
    m.build(root)

    # radar
    r = Model("oko_radar")
    r.box((2.0, 0.3, 0.6), (0, 0, 0.3), "#e8e0d0", rot=(0.3, 0, 0))
    r.box((0.2, 0.2, 0.6), (0, 0, -0.2), STEEL)
    radar = r.build(root, loc=(0, 3.4, 4.3))
    loop(radar, "boss_halcyon_cranes_idle", "rotation_euler", 4.0, [(0, 0, 0), (0, 0, math.pi / 2), (0, 0, math.pi), (0, 0, 3 * math.pi / 2)])

    # cranes: a turntable, a mast and a long jib reaching forward and out, a hook with a container
    for s in (1, -1):
        c = Model(f"oko_crane_{'r' if s > 0 else 'l'}")
        c.cyl(1.0, 0.5, (0, 0, 0), NAVY, segs=8)
        c.box((1.2, 1.2, 1.0), (0, 0.3, 1.0), AMBER)
        c.box((0.9, 0.2, 0.4), (0, -0.3, 1.2), "#1a1a1a")
        limb(c, (0, 0, 1.4), (0, 0.2, 3.4), 0.35, 0.25, AMBER, segs=4)
        jib_end = (s * 2.4, -5.0, 3.6)
        for dx in (-0.25, 0.25):
            c.plank_line((dx, 0.2, 3.3), (jib_end[0] + dx, jib_end[1], jib_end[2]), 0.18, 0.18, AMBER)
        for t in (0.25, 0.5, 0.75):                                               # lattice struts
            p = (jib_end[0] * t, 0.2 + (jib_end[1] - 0.2) * t, 3.3 + 0.3 * t)
            c.box((0.7, 0.14, 0.14), p, NAVY, rot=(0, 0, math.atan2(jib_end[0], -jib_end[1])))
        c.plank_line((0, 0.2, 3.4), (0, 2.0, 2.0), 0.5, 0.5, STEEL)                # counterweight arm
        c.box((1.2, 1.0, 1.0), (0, 2.1, 1.9), "#3a3a3a")
        c.plank_line((jib_end[0], jib_end[1], jib_end[2]), (jib_end[0], jib_end[1], 1.6), 0.08, 0.08, "#1a1a1a")
        c.box((1.5, 1.0, 0.9), (jib_end[0], jib_end[1], 1.15), RUST if s > 0 else "#3a8a8a")  # swinging cargo
        c.box((1.52, 0.12, 0.92), (jib_end[0], jib_end[1], 1.15), "#e8e0d0")
        c.box((0.3, 0.3, 0.3), (jib_end[0], jib_end[1], 1.75), AMBER, glow=True)
        crane = c.build(root, loc=(s * 4.2, 0.6, 0.9))
        loop(crane, "boss_halcyon_cranes_idle", "rotation_euler", 4.0,
             [(0, 0, s * 0.25), (0, 0, 0), (0, 0, -s * 0.2), (0, 0, 0)])

    for x, y, z in ((-4.6, -4.5, 1.6), (4.6, -4.5, 1.6), (-2.0, -5.6, 1.6), (2.0, -5.6, 1.6), (-6.6, -4.4, 1.2), (6.6, -4.4, 1.2)):
        mount(root, (x, y, z), "gun")
    mount(root, (0, 2.0, 3.2), "weak")
    mount(root, (0, 3.2, 4.4), "weak")


# --- KESSRA: THE SANDKING, a walking cartel fortress on six legs ----------------------------------

def boss_kessra():
    SAND, BROWN, RED = hexc(0xd0a060), hexc(0x5a2a1a), hexc(0xff3a2a)
    SAND2 = "#b8884a"
    root = group("boss_kessra", kind="boss_kessra")
    body = group("sandking_body", loc=(0, 0, 2.0), parent=root)
    m = Model("sandking_fort")
    R = 4.6
    hexp = [(R * math.cos(TAU * i / 6 + math.pi / 6), R * math.sin(TAU * i / 6 + math.pi / 6)) for i in range(6)]
    m.slab([(x * 0.8, y * 0.8) for x, y in hexp], -1.2, 0.0, BROWN, top=hexp)
    m.slab(hexp, 0.0, 1.4, SAND, top=[(x * 0.96, y * 0.96) for x, y in hexp])
    m.slab([(x * 0.86, y * 0.86) for x, y in hexp], 1.4, 1.5, SAND2)
    # crenellated walls
    for i in range(6):
        (x0, y0), (x1, y1) = hexp[i], hexp[(i + 1) % 6]
        ang = math.atan2(y1 - y0, x1 - x0)
        for t in (0.25, 0.42, 0.58, 0.75):
            m.box((0.5, 0.4, 0.5), (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 1.65), SAND, rot=(0, 0, ang))
        m.box((R * 0.95, 0.12, 0.14), ((x0 + x1) / 2 * 1.005, (y0 + y1) / 2 * 1.005, 0.9), BROWN, rot=(0, 0, ang))
    # corner towers with cannons
    towers = []
    for i in range(6):
        x, y = hexp[i]
        m.cyl(0.9, 2.4, (x, y, 0.0), SAND, segs=6)
        m.cyl(1.05, 0.3, (x, y, 2.4), BROWN, segs=6)
        if y < 0:
            m.box((0.8, 0.8, 0.12), (x, y, 2.75), RED, glow=True)
        towers.append((x, y))
        if y < 0 or abs(y) < 1:
            m.cyl(0.18, 1.3, (x, y - 0.2, 2.2), DARK, segs=5, rot=FWD)
    # central keep with the red eye looking at you
    m.box((3.0, 3.0, 2.6), (0, 0.4, 2.8), SAND, taper=0.82)
    m.box((3.1, 3.1, 0.3), (0, 0.4, 2.0), BROWN)
    m.cyl(1.3, 1.2, (0, 0.4, 4.1), SAND2, segs=6, r_top=0.4)
    m.box((1.6, 0.3, 0.45), (0, -1.0, 3.2), DARK)
    m.box((1.2, 0.32, 0.25), (0, -1.06, 3.2), RED, glow=True)                       # the eye slit
    for s in (1, -1):                                                             # keep cannons
        m.box((0.7, 0.9, 0.6), (s * 1.0, -0.9, 2.3), BROWN)
        m.cyl(0.22, 1.4, (s * 1.0, -1.2, 2.3), DARK, segs=6, rot=FWD)
    # cartel banners
    for s in (1, -1):
        m.plank_line((s * 1.5, 1.8, 1.5), (s * 1.5, 1.8, 5.2), 0.12, 0.12, BROWN)
        m.box((1.0, 0.08, 1.4), (s * 2.0, 1.8, 4.4), RED)
        m.box((0.4, 0.09, 0.4), (s * 2.0, 1.8, 4.4), SAND)
    m.build(body)
    loop(body, "boss_kessra_walk_idle", "location", 1.6,
         [(0, 0, 0), (0, 0, 0.18), (0, 0, 0), (0, 0, 0.18)])

    # six legs, tripod gait: hip on the hull, a knee high up, a foot spread wide
    for i in range(6):
        a = TAU * i / 6
        hip = (R * 0.82 * math.cos(a), R * 0.82 * math.sin(a), 1.4)
        g = Model(f"sandking_leg_{i}")
        g.cyl(0.6, 0.5, (0, 0, -0.25), BROWN, segs=6)
        limb(g, (0, 0, 0), (2.9, 0, 1.6), 0.5, 0.4, SAND2, segs=5)
        g.ball(0.55, (2.9, 0, 1.6), BROWN, subdiv=0)
        limb(g, (2.9, 0, 1.6), (4.6, 0, -2.4), 0.42, 0.22, SAND, segs=5)
        g.box((1.0, 0.8, 0.3), (4.6, 0, -2.5), BROWN)
        g.box((0.3, 0.3, 0.6), (3.6, 0, 0.0), BROWN)                              # piston
        leg = g.build(root, loc=hip, rot_z=a)
        p = 0 if i % 2 == 0 else 1
        A = [(0, 0, 0.22), (0, 0, 0), (0, 0, -0.22), (0, -0.2, 0)]
        keys = A[p * 2:] + A[:p * 2]
        loop(leg, "boss_kessra_walk_idle", "rotation_euler", 1.6, keys)

    # leg hips rise with the body: legs are on the root so feet stay planted while the body bobs
    for x, y in towers:
        if y < 0:
            mount(root, (x, y - 1.4, 4.2), "gun")
    for s in (1, -1):
        mount(root, (s * 1.0, -2.0, 4.3), "gun")
    for i in (0, 2):                                                              # side towers (y > 0)
        x, y = hexp[i]
        mount(root, (x, y - 1.2, 4.2), "gun")
    mount(root, (0, -1.2, 5.2), "weak")


# --- MIREFALL: THE MOTHER-OF-SPORES, a floating mycelium heart ------------------------------------

def boss_mirefall():
    PURP, GREEN, MAG = hexc(0x6a3a8a), hexc(0x8aff8a), hexc(0xff4aff)
    DEEP, PALE = "#4a2a66", "#b08ad0"
    root = group("boss_mirefall", kind="boss_mirefall")
    m = Model("spores_heart", seed=3)
    m.ball(3.0, (0, 0, 0), PURP, subdiv=2, scale=(1.15, 1.0, 0.95), jitter=0.25)
    for x, y, z, r in ((-1.8, 0.8, 1.4, 1.7), (1.9, 0.6, 1.3, 1.6), (0.2, 1.6, 1.8, 1.5), (-0.4, -1.4, 1.2, 1.3)):
        m.ball(r, (x, y, z), DEEP if x < 0 else PURP, subdiv=1, jitter=0.2)          # lobes
    # glowing veins over the top
    veins = [((0, -2.8, 0.6), (0.6, -1.2, 2.4), (1.6, 0.6, 2.6), (3.0, 1.0, 1.2)),
             ((0, -2.8, 0.6), (-1.0, -1.0, 2.6), (-2.2, 0.8, 2.4), (-3.2, 0.6, 0.6)),
             ((0.6, -1.2, 2.4), (0.2, 1.0, 3.0), (0.4, 2.8, 1.6))]
    for v in veins:
        for p0, p1 in zip(v, v[1:]):
            m.plank_line(p0, p1, 0.18, 0.18, GREEN)
    for p0 in ((0, -2.8, 0.6), (0.6, -1.2, 2.4), (-1.0, -1.0, 2.6), (1.6, 0.6, 2.6), (-2.2, 0.8, 2.4), (0.2, 1.0, 3.0)):
        m.ball(0.22, p0, GREEN, subdiv=0, glow=True)
    # mushroom caps sprouting from the top
    for x, y, z, r in ((-1.5, 0.6, 2.6, 1.0), (1.2, 1.4, 2.8, 0.8), (0.0, 0.2, 3.3, 1.2), (2.2, -0.6, 2.0, 0.6), (-2.4, -0.6, 1.8, 0.65)):
        m.cyl(r * 0.25, r * 0.9, (x, y, z - 0.3), PALE, segs=5)
        m.cyl(r, r * 0.5, (x, y, z + r * 0.55), "#d84ad8", segs=7, r_top=r * 0.3)
        m.cyl(r * 0.85, 0.06, (x, y, z + r * 0.52), GREEN, segs=7, glow=True)     # gills
        m.ball(r * 0.14, (x + r * 0.4, y, z + r * 0.85), "#ffd0ff", subdiv=0)
    # three glowing cores on the face (weak points) in fleshy rims
    cores = [(-1.4, -3.0, 0.7), (1.4, -3.0, 0.7), (0.0, -3.1, -0.7)]
    for c in cores:
        m.ball(1.0, (c[0], c[1] + 0.35, c[2]), DEEP, subdiv=1)
        m.ball(0.75, c, GREEN, subdiv=1, glow=True)
    # spore pods round the equator (guns), each a glowing magenta mouth
    pods = []
    for i in range(6):
        a = -math.pi / 2 + (i - 2.5) * 0.5
        x, y = math.cos(a) * 3.5, math.sin(a) * 3.1
        m.ball(0.6, (x, y, -0.2), PALE, subdiv=1, scale=(1, 1, 1.2))
        m.ball(0.32, (x * 1.08, y * 1.08, -0.1), MAG, subdiv=0, glow=True)
        pods.append((x * 1.15, y * 1.15, -0.1))
    heart = m.build(root, loc=(0, 0, 3.0))
    beat = [(0, 0, 0), (0.07, 0.07, 0.07), (0, 0, 0), (0.04, 0.04, 0.04), (0, 0, 0), (0, 0, 0)]
    loop(heart, "boss_mirefall_beat_idle", "scale", 2.4, beat + beat)          # lub-dub, twice a loop
    loop(heart, "boss_mirefall_beat_idle", "location", 2.4,
         [(0, 0, 0), (0, 0, 0.3), (0, 0, 0), (0, 0, -0.3)])

    # mycelium tendrils trailing outwards, swaying
    for i in range(10):
        a = TAU * i / 10 + 0.3
        t = Model(f"spores_tendril_{i}", seed=i)
        pts = [(0, 0, 0)]
        L = 3.4 + (i % 3) * 1.0
        for j in range(1, 5):
            f = j / 4
            pts.append((L * f, math.sin(f * 3 + i) * 0.5, -1.4 * f * f))
        for k, (p0, p1) in enumerate(zip(pts, pts[1:])):
            limb(t, p0, p1, 0.4 * (1 - k * 0.22), 0.4 * (1 - (k + 1) * 0.22), PURP if k % 2 else DEEP, segs=5)
        t.ball(0.22, pts[-1], GREEN, subdiv=0, glow=True)
        o = t.build(root, loc=(math.cos(a) * 2.6, math.sin(a) * 2.3, 2.4), rot_z=a)
        ph = i % 4
        sw = [(0, 0.1, 0.18), (0, -0.05, 0), (0, 0.1, -0.18), (0, 0.2, 0)]
        loop(o, "boss_mirefall_beat_idle", "rotation_euler", 2.4, sw[ph:] + sw[:ph])

    for p in pods:
        mount(root, (p[0], p[1], p[2] + 3.0), "gun")
    for c in cores:
        mount(root, (c[0], c[1] - 0.4, c[2] + 3.0), "weak")


# --- GLACIS: THE WAKING ENGINE, an ancient machine half out of the ice ----------------------------

def boss_glacis():
    GREY, DARKC, ORANGE = hexc(0x6a7a8a), hexc(0x2a3040), hexc(0xff6a1a)
    ICE, ICE2, SNOW = "#bfe0f0", "#8ab8d8", "#eef6fa"
    root = group("boss_glacis", kind="boss_glacis")
    ice = Model("engine_ice", seed=7)
    # the glacier holding its back half: jagged ice blocks
    for x, y, z, r, sc in ((-5.5, 2.5, 0.5, 2.6, (1.2, 1.0, 0.8)), (5.6, 2.2, 0.4, 2.5, (1.1, 1.0, 0.9)),
                           (-2.5, 4.0, 0.8, 2.8, (1.3, 0.8, 0.8)), (2.4, 4.2, 0.9, 2.9, (1.2, 0.8, 0.8)),
                           (0, 5.0, 0.3, 2.6, (1.8, 0.7, 0.6)), (-7.4, 0.2, 0.0, 1.6, (1, 1, 0.8)), (7.5, 0.0, 0.0, 1.5, (1, 1, 0.9))):
        ice.ball(r, (x, y, z), ICE, subdiv=1, scale=sc, jitter=0.35)
        ice.ball(r * 0.6, (x + 0.4, y - 0.2, z + r * 0.55), SNOW, subdiv=0, scale=sc, jitter=0.2)
    for x, y, h, rot in ((-6.0, 0.8, 2.6, 0.35), (6.2, 1.0, 3.0, -0.3), (-3.6, 2.4, 2.2, 0.2), (3.9, 2.6, 2.4, -0.25)):
        ice.cyl(0.7, h, (x, y, 0.5), ICE2, segs=4, r_top=0.05, rot=(rot * 0.6, rot, 0))  # shards
    ice.build(root)

    m = Model("engine_body")
    # the great dome of the machine, front half free of the ice
    m.cyl(4.6, 1.6, (0, 0.6, -0.4), DARKC, segs=10, r_top=4.3)
    m.cyl(4.2, 1.4, (0, 0.6, 1.2), GREY, segs=10, r_top=3.2)
    m.cyl(3.0, 0.6, (0, 0.6, 2.6), DARKC, segs=10, r_top=2.6)
    # radial heat vents glowing orange, front half only
    for i in range(7):
        a = -math.pi / 2 + (i - 3) * 0.32
        x, y = math.cos(a) * 3.8, 0.6 + math.sin(a) * 3.8
        m.box((0.55, 1.1, 0.4), (x, y, 1.6), DARKC, rot=(0, 0, a + math.pi / 2))
        m.box((0.3, 0.8, 0.42), (x, y, 1.62), ORANGE, rot=(0, 0, a + math.pi / 2), glow=True)
    # armoured brow over the eye
    m.box((4.6, 1.2, 0.8), (0, -2.6, 2.0), GREY, rot=(0.35, 0, 0), taper=0.8)
    for s in (1, -1):
        m.box((1.2, 2.4, 1.6), (s * 3.2, -1.6, 0.8), GREY, rot=(0, 0, s * 0.5), taper=0.75)
        m.cyl(0.35, 1.6, (s * 3.0, -2.8, 0.8), DARKC, segs=6, rot=FWD)              # cheek cannons
        m.cyl(0.24, 0.1, (s * 3.0, -4.42, 0.8), ORANGE, segs=6, rot=FWD, glow=True)
    # the eye (main weak point): a ring with a burning core, set into the front
    m.cyl(1.4, 0.6, (0, -3.0, 1.1), DARKC, segs=8, rot=FWD)
    m.cyl(1.0, 0.3, (0, -3.5, 1.1), ORANGE, segs=8, rot=FWD, glow=True)
    m.ball(0.65, (0, -3.55, 1.1), "#ffd0a0", subdiv=1, glow=True)
    # frost still clinging to its top
    m.ball(1.2, (-1.8, 1.8, 2.6), SNOW, subdiv=0, scale=(1.4, 1, 0.4), jitter=0.15)
    m.ball(0.9, (2.0, 2.2, 2.5), SNOW, subdiv=0, scale=(1.4, 1, 0.4), jitter=0.15)
    m.build(root)

    # turbine crown spinning on top
    t = Model("engine_crown")
    t.cyl(1.6, 0.4, (0, 0, 0), GREY, segs=8)
    for i in range(8):
        a = TAU * i / 8
        t.box((0.4, 1.3, 0.5), (math.cos(a) * 1.6, math.sin(a) * 1.6, 0.35), DARKC, rot=(0.4, 0, a))
    t.cyl(0.6, 0.5, (0, 0, 0.3), ORANGE, segs=6, glow=True)
    crown = t.build(root, loc=(0, 0.8, 3.2))
    animate(crown, "boss_glacis_wake_idle", "rotation_euler",
            [(0, (0, 0, 0)), (1.0, (0, 0, TAU / 3)), (2.0, (0, 0, 2 * TAU / 3)), (3.0, (0, 0, TAU))])

    # two huge arms dragging themselves out of the ice
    for s in (1, -1):
        a = Model(f"engine_arm_{'r' if s > 0 else 'l'}")
        limb(a, (0, 0, 0), (s * 2.4, -2.2, 0.4), 0.8, 0.6, GREY, segs=6)
        a.ball(0.75, (s * 2.4, -2.2, 0.4), DARKC, subdiv=0)
        limb(a, (s * 2.4, -2.2, 0.4), (s * 1.8, -5.4, 0.0), 0.6, 0.45, GREY, segs=6)
        a.box((0.9, 1.6, 0.3), (s * 2.2, -3.6, 0.8), ORANGE, glow=True, rot=(0, 0, s * 0.18))  # piston glow
        for k in (-1, 0, 1):                                                       # claw fingers
            limb(a, (s * 1.8, -5.4, 0.0), (s * (1.8 + k * 0.7), -6.5, -0.3), 0.28, 0.1, DARKC, segs=4)
        arm = a.build(root, loc=(s * 4.0, 1.0, 1.0))
        loop(arm, "boss_glacis_wake_idle", "rotation_euler", 3.0,
             [(0, 0, 0), (0.1, 0, s * 0.12), (0, 0, 0)])
        mount(root, (s * 5.8, -5.6, 1.2), "gun")
    for s in (1, -1):
        mount(root, (s * 3.0, -4.6, 1.8), "gun")
        mount(root, (s * 1.9, -1.0, 3.4), "gun")
    mount(root, (0, -4.0, 2.1), "weak")
    mount(root, (0, 0.8, 4.0), "weak")


# --- ASHGRAVE: WARLORD KHET, riding a re-wired titan head -----------------------------------------

def boss_ashgrave():
    MECH, RUST, GREEN = hexc(0x6a7a6a), hexc(0x9a6a4a), hexc(0x4aff8a)
    MECH2, CLOTH = "#4a5650", "#c84a2a"
    root = group("boss_ashgrave", kind="boss_ashgrave")
    head = group("khet_head", loc=(0, 0, 2.0), parent=root)
    m = Model("khet_skull")
    # the titan's helmet: a wide armoured skull, faceplate towards -y
    skull = [(-5.0, 3.0), (-6.0, 0.0), (-4.6, -3.2), (4.6, -3.2), (6.0, 0.0), (5.0, 3.0)]
    m.slab(skull, -1.6, 1.6, MECH, top=[(x * 0.8, y * 0.85) for x, y in skull])
    m.slab([(x * 0.8, y * 0.85) for x, y in skull], 1.6, 2.0, MECH2, top=[(x * 0.62, y * 0.7) for x, y in skull])
    m.box((1.0, 5.6, 0.4), (0, 0.0, 2.1), MECH)                                   # crest ridge
    for s in (1, -1):                                                             # ear vents and a broken horn
        m.box((1.0, 2.0, 2.4), (s * 6.0, 0.3, 0.2), MECH2, taper=0.7)
        for z in (-0.4, 0.2, 0.8):
            m.box((1.04, 1.6, 0.16), (s * 6.0, 0.3, z), DARK)
    limb(m, (5.2, 1.0, 1.4), (7.0, 2.4, 3.6), 0.6, 0.25, MECH2, segs=5)
    limb(m, (-5.2, 1.0, 1.4), (-6.0, 1.6, 2.4), 0.6, 0.45, MECH2, segs=5)        # snapped off
    m.cyl(0.46, 0.1, (-6.0, 1.6, 2.4), RUST, segs=5, rot=(0.5, -0.6, 0))
    # visor: a dark band with two green eyes (weak points)
    m.box((7.4, 0.6, 1.0), (0, -3.2, 0.6), DARK, rot=(-0.3, 0, 0))
    for s in (1, -1):
        m.box((1.8, 0.5, 0.7), (s * 2.0, -3.4, 0.6), GREEN, rot=(-0.3, 0, s * 0.12), glow=True)
    # scrap patches and rust
    for x, y, w, d in ((-3.0, 1.0, 1.6, 1.2), (3.4, -1.0, 1.2, 1.4), (1.8, 2.2, 1.4, 0.9)):
        m.box((w, d, 0.2), (x, y, 1.5 if abs(x) < 3 else 1.1), RUST, rot=(0, 0, 0.2))
    # the scrap platform on its crown: deck, throne, generator (weak), banners, guns
    m.box((5.0, 3.6, 0.3), (0, 0.8, 2.4), RUST)
    for x in (-2.2, -1.1, 0, 1.1, 2.2):
        m.box((0.12, 3.6, 0.32), (x, 0.8, 2.42), "#6a4a34")
    m.box((1.4, 1.0, 1.6), (0, 1.8, 3.3), "#5a3a2a")                              # throne back
    m.box((1.4, 1.2, 0.4), (0, 1.3, 2.7), "#5a3a2a")
    m.cyl(0.32, 0.8, (0, 1.2, 2.9), CLOTH, segs=5)                                 # the warlord
    m.ball(0.28, (0, 1.15, 3.9), "#d0b090", subdiv=0)
    m.box((0.9, 0.3, 0.2), (0, 1.15, 4.1), RUST)                                   # war helm crest
    m.box((1.2, 0.4, 0.6), (0, 1.2, 3.3), CLOTH, taper=0.6)                        # shoulders and cloak
    m.cyl(0.55, 0.8, (2.0, 2.2, 2.5), STEEL, segs=6)                               # generator
    m.ball(0.42, (2.0, 2.2, 3.5), GREEN, subdiv=1, glow=True)
    m.plank_line((2.0, 2.2, 3.0), (0.4, 1.6, 2.7), 0.12, 0.12, "#1a1a1a")          # cables
    m.plank_line((2.0, 2.0, 2.6), (3.6, -1.8, 1.4), 0.12, 0.12, "#1a1a1a")
    for s in (1, -1):                                                             # scrap cannons
        m.box((0.9, 0.9, 0.6), (s * 2.2, -0.6, 2.8), STEEL)
        m.cyl(0.18, 1.6, (s * 2.2, -0.8, 2.9), DARK, segs=5, rot=FWD)
    # the jaw-cannon housing
    m.box((4.6, 1.2, 1.0), (0, -3.4, -1.1), MECH2, taper=0.9)
    m.build(head)
    loop(head, "boss_ashgrave_ride_idle", "location", 2.4, [(0, 0, 0), (0.15, 0, 0.25), (0, 0, 0), (-0.15, 0, 0.25)])
    loop(head, "boss_ashgrave_ride_idle", "rotation_euler", 2.4, [(0, 0, 0), (0, 0.03, 0), (0, 0, 0), (0, -0.03, 0)])

    j = Model("khet_jaw")
    j.box((4.0, 1.6, 0.7), (0, -0.8, 0), MECH, taper=0.85)
    for x in (-1.4, -0.7, 0, 0.7, 1.4):
        j.box((0.4, 0.3, 0.5), (x, -1.55, 0.4), "#d8d0b8")                           # teeth
    j.cyl(0.4, 0.8, (0, -1.4, -0.1), DARK, segs=6, rot=FWD)                          # mouth cannon
    j.cyl(0.26, 0.06, (0, -2.22, -0.1), GREEN, segs=6, rot=FWD, glow=True)
    jaw = j.build(head, loc=(0, -2.6, -1.4))
    loop(jaw, "boss_ashgrave_ride_idle", "rotation_euler", 2.4, [(0, 0, 0), (0.25, 0, 0), (0, 0, 0), (0.05, 0, 0)])

    # jury-rigged thrusters slung under the sides
    for s in (1, -1):
        t = Model(f"khet_thruster_{'r' if s > 0 else 'l'}")
        t.cyl(0.8, 2.6, (0, 1.2, 0), RUST, segs=7, rot=UPY)
        t.cyl(0.85, 0.3, (0, 2.0, 0), "#1a1a1a", segs=7, rot=UPY)
        t.cyl(0.65, 0.1, (0, 3.85, 0), GREEN, segs=7, rot=UPY, glow=True)
        t.box((0.4, 0.4, 1.4), (-s * 0.6, 1.2, 0.8), STEEL)
        t.build(head, loc=(s * 4.2, 0.0, -1.0))
    # banners on poles, flapping
    for s in (1, -1):
        b = Model(f"khet_banner_{'r' if s > 0 else 'l'}")
        b.plank_line((0, 0, 0), (0, 0, 3.0), 0.14, 0.14, "#3a2a20")
        b.box((0.08, 1.4, 1.4), (0, 0.75, 2.2), CLOTH)
        b.box((0.09, 0.5, 0.5), (0, 0.8, 2.2), "#e8e0c0")
        o = b.build(head, loc=(s * 2.4, 2.4, 2.5))
        loop(o, "boss_ashgrave_ride_idle", "rotation_euler", 2.4, [(0, 0, s * 0.3), (0, 0, -s * 0.1)] * 2)

    for x, y, z in ((-2.2, -1.8, 4.9), (2.2, -1.8, 4.9), (0, -5.5, 0.4), (-3.0, -4.4, 2.6), (3.0, -4.4, 2.6), (-6.0, -1.0, 2.2), (6.0, -1.0, 2.2)):
        mount(root, (x, y, z), "gun")
    mount(root, (-2.0, -3.6, 2.6), "weak")
    mount(root, (2.0, -3.6, 2.6), "weak")
    mount(root, (2.0, 2.2, 5.5), "weak")


# --- VESH: QUEEN ISTRA, a pirate queen in a hollowed sky-whale ------------------------------------

def boss_vesh():
    BLUE, BONE, PINK = hexc(0x5a8ab0), hexc(0xf0e8d8), hexc(0xff4a6a)
    BLUE2, WOOD, BELLY = "#3a6a94", "#8a5a3a", "#c8d8e0"
    root = group("boss_vesh", kind="boss_vesh")
    whale = group("istra_whale", loc=(0, 0, 2.5), parent=root)
    m = Model("istra_body", seed=2)
    m.ball(3.0, (0, 0, 0), BLUE, subdiv=2, scale=(1.05, 2.5, 0.85))
    m.ball(2.7, (0, -0.4, -0.6), BELLY, subdiv=1, scale=(1.05, 2.4, 0.6))
    m.ball(2.2, (0, -5.0, 0.3), BLUE2, subdiv=1, scale=(1.15, 1.0, 0.8))              # the great head
    for i in range(-3, 4):                                                        # barnacle patches
        m.ball(0.25, (i * 0.7, -5.6 + abs(i) * 0.4, 1.8 - abs(i) * 0.2), BONE, subdiv=0)
    m.box((4.2, 0.2, 0.2), (0, -7.3, -0.3), "#1a2a3a", rot=(0, 0, 0))               # mouth line
    for s in (1, -1):
        m.ball(0.3, (s * 2.4, -5.6, 0.2), "#1a1a2a", subdiv=0)                       # eyes
        m.ball(0.14, (s * 2.55, -5.75, 0.3), PINK, subdiv=0, glow=True)
    # hollowed back: a deck inside the ribcage
    m.slab([(-1.8, -2.8), (1.8, -2.8), (2.0, 3.6), (-2.0, 3.6)], 1.6, 2.1, WOOD)
    for y in (-2.4, -1.0, 0.4, 1.8, 3.2):                                          # ribs arching over
        pts = [(-2.5, y, 1.4), (-2.3, y, 2.9), (-1.0, y, 3.7)]
        for p0, p1 in zip(pts, pts[1:]):
            m.plank_line(p0, p1, 0.32, 0.32, BONE)
            m.plank_line((-p0[0], y, p0[2]), (-p1[0], y, p1[2]), 0.32, 0.32, BONE)
    m.cyl(0.65, 0.5, (0, 0.4, 1.8), "#5a1a2a", segs=6)                             # the whale's heart (weak)
    m.ball(0.55, (0, 0.4, 2.5), PINK, subdiv=1, glow=True)
    # the queen's cabin at the stern with a lantern
    m.box((2.6, 1.8, 1.4), (0, 3.4, 2.7), WOOD)
    m.gable((2.8, 2.0, 0.8), (0, 3.4, 3.4), "#6a2a3a", rot=(0, 0, math.pi / 2))
    m.box((1.6, 0.1, 0.5), (0, 2.45, 2.9), PINK, glow=True)                        # cabin windows
    m.plank_line((1.2, 2.4, 3.4), (1.2, 2.4, 4.6), 0.1, 0.1, "#2a1a1a")
    m.ball(0.3, (1.2, 2.4, 4.7), PINK, subdiv=0, glow=True)                         # lantern
    # mast and a patched sail
    m.plank_line((0, -1.6, 2.0), (0, -1.6, 7.0), 0.28, 0.28, WOOD)
    m.box((5.2, 2.6, 0.14), (0, -0.4, 5.2), BONE, rot=(-0.3, 0, 0))          # sail, bellied back
    m.box((1.4, 1.2, 0.16), (0.9, -0.2, 5.3), PINK, rot=(-0.3, 0, 0))
    m.box((0.8, 0.8, 0.16), (-1.4, -0.9, 5.45), "#c8b898", rot=(-0.3, 0, 0))
    m.box((5.6, 0.24, 0.24), (0, -1.6, 6.3), WOOD)
    m.box((0.5, 0.5, 0.4), (0, -1.6, 7.1), "#2a1a1a")                          # crow's nest
    m.box((1.0, 0.06, 0.6), (0.5, -1.6, 7.6), "#1a1a1a")                        # black flag
    # gun ports along the flanks, cannons poking out forward
    for s in (1, -1):
        for y in (-2.6, -0.6):
            m.box((0.6, 1.0, 0.8), (s * 3.0, y, 0.6), "#2a1a1a")
            m.cyl(0.22, 1.4, (s * 3.2, y, 0.6), STEEL, segs=6, rot=FWD)
        m.cyl(0.3, 1.6, (s * 0.9, -2.5, 2.1), STEEL, segs=6, rot=FWD)              # bow chasers on deck
    m.build(whale)
    loop(whale, "boss_vesh_swim_idle", "location", 3.0, [(0, 0, 0), (0, 0, 0.3), (0, 0, 0), (0, 0, -0.2)])
    loop(whale, "boss_vesh_swim_idle", "rotation_euler", 3.0, [(0, 0, 0), (0.03, 0, 0.02), (0, 0, 0), (-0.03, 0, -0.02)])

    for s in (1, -1):
        f = Model(f"istra_flipper_{'r' if s > 0 else 'l'}")
        pts = [(0, 1.0), (0, -1.0), (2.4, -2.4), (4.8, -2.4), (5.4, -1.8), (3.0, 0.2)]
        pts = [(s * x, y) for x, y in pts]
        if s < 0:
            pts = pts[::-1]
        f.slab(pts, -0.2, 0.2, BLUE2, top=[(x * 0.98, y * 0.98) for x, y in pts])
        for k in range(3):
            f.ball(0.2, (s * (1.6 + k * 1.2), -1.2 - k * 0.3, 0.2), BONE, subdiv=0)
        o = f.build(whale, loc=(s * 2.7, -2.6, -0.6))
        loop(o, "boss_vesh_swim_idle", "rotation_euler", 3.0, [(0, -s * 0.3, 0), (0, 0, 0), (0, s * 0.3, 0), (0, 0, 0)])

    t = Model("istra_tail")
    limb(t, (0, 0, 0), (0, 3.4, 0.3), 1.4, 0.6, BLUE, segs=7)
    t.slab([(-3.6, 4.6), (-0.4, 2.8), (0.4, 2.8), (3.6, 4.6), (2.8, 5.4), (0, 4.2), (-2.8, 5.4)][::-1], 0.1, 0.5, BLUE2)
    tail = t.build(whale, loc=(0, 6.6, 0.0))
    loop(tail, "boss_vesh_swim_idle", "rotation_euler", 3.0, [(0.25, 0, 0), (0, 0, 0.1), (-0.25, 0, 0), (0, 0, -0.1)])

    for x, y, z in ((-3.3, -4.0, 3.1), (3.3, -4.0, 3.1), (-3.3, -2.0, 3.1), (3.3, -2.0, 3.1), (-0.9, -4.2, 4.6), (0.9, -4.2, 4.6), (0, -7.6, 2.2)):
        mount(root, (x, y, z), "gun")
    mount(root, (0, 0.4, 5.0), "weak")
    mount(root, (1.2, 2.4, 7.2), "weak")


# --- CINDER ORCHARD: ASSET RECOVERY UNIT 0, Vantorr's debt collector ------------------------------

def boss_cinder():
    WHITE, COPPER, RED = hexc(0xe8e8e0), hexc(0xd08a3a), hexc(0xff3a3a)
    GREYW = "#b8b8b0"
    root = group("boss_cinder", kind="boss_cinder")
    K = 1.3                                                                    # built small, scaled up
    body = group("aru_body", loc=(0, 0, 2.5), parent=root)
    body.scale = (K, K, K)

    def at(x, y, z):                                                           # body space -> root space
        return (x * K, y * K, 2.5 + (z - 2.5) * K)
    m = Model("aru_torso")
    # hover skirt
    m.cyl(2.4, 1.0, (0, 0.6, -2.2), DARK, segs=8, r_top=2.8)
    for i in range(8):
        a = TAU * i / 8
        m.cyl(0.42, 0.2, (math.cos(a) * 2.1, 0.6 + math.sin(a) * 2.1, -2.4), RED, segs=6, glow=True)
    # torso: clean corporate plates, a copper chest panel with the company mark
    m.box((4.6, 3.6, 2.6), (0, 0.4, 0), WHITE, taper=0.85)
    m.box((4.8, 3.8, 0.4), (0, 0.4, -1.2), GREYW)
    m.box((3.0, 0.3, 1.8), (0, -1.45, 0.1), COPPER, rot=(-0.12, 0, 0))
    m.box((0.35, 0.32, 1.2), (-0.35, -1.6, 0.1), WHITE, rot=(-0.12, 0, 0.4))           # the V
    m.box((0.35, 0.32, 1.2), (0.35, -1.6, 0.1), WHITE, rot=(-0.12, 0, -0.4))
    m.cyl(0.55, 0.3, (0, -1.2, -0.85), RED, segs=8, rot=FWD, glow=True)               # chest core (weak)
    m.box((4.0, 3.0, 0.3), (0, 0.4, 1.35), COPPER)
    # head with a scanning visor
    m.box((1.8, 1.6, 1.1), (0, -0.4, 2.0), WHITE, taper=0.8)
    m.box((1.9, 0.3, 0.35), (0, -1.2, 2.0), "#1a1a1a")
    m.box((1.5, 0.32, 0.18), (0, -1.24, 2.0), RED, glow=True)
    m.box((0.12, 0.6, 1.0), (0, -0.3, 2.8), COPPER)                                   # head crest
    # backpack: twin thrusters and a recovery hold
    m.box((3.6, 1.6, 2.4), (0, 2.6, 0.4), GREYW)
    for s in (1, -1):
        m.cyl(0.6, 1.2, (s * 1.0, 3.0, 0.4), DARK, segs=7, rot=UPY)
        m.cyl(0.45, 0.1, (s * 1.0, 4.25, 0.4), RED, segs=7, rot=UPY, glow=True)
    m.box((3.0, 0.2, 0.3), (0, 2.6, 1.7), "#ffd040")                                   # hazard band
    # shoulder pauldrons with missile racks
    for s in (1, -1):
        m.box((2.2, 2.6, 1.2), (s * 3.2, 0.4, 1.1), COPPER, taper=0.8)
        m.box((2.3, 0.4, 1.25), (s * 3.2, -0.5, 1.1), WHITE)
        m.box((1.4, 1.0, 0.5), (s * 3.2, 0.6, 1.9), WHITE)
        for dx in (-0.35, 0.35):
            m.cyl(0.18, 0.1, (s * 3.2 + dx, 0.6, 2.15), RED, segs=6, glow=True)
    m.build(body)
    loop(body, "boss_cinder_collect_idle", "location", 2.0, [(0, 0, 0), (0, 0, 0.3), (0, 0, 0), (0, 0, -0.1)])

    # right arm: the repossession claw
    ra = Model("aru_arm_r")
    limb(ra, (0, 0, 0), (0.6, -1.6, -0.6), 0.7, 0.6, GREYW, segs=6)
    ra.ball(0.7, (0.6, -1.6, -0.6), DARK, subdiv=0)
    limb(ra, (0.6, -1.6, -0.6), (0.6, -3.8, -0.6), 0.75, 0.65, WHITE, segs=6)
    ra.box((1.8, 1.2, 1.4), (0.6, -4.2, -0.6), COPPER)
    arm_r = ra.build(body, loc=(4.0, 0.2, 0.4))
    loop(arm_r, "boss_cinder_collect_idle", "rotation_euler", 2.0, [(0, 0, 0), (-0.1, 0, 0.12), (0, 0, 0), (0.06, 0, -0.06)])
    for k, (dx, a0) in enumerate(((-0.8, 0.0), (0.8, 0.0))):
        c = Model(f"aru_claw_{k}")
        s = -1 if dx < 0 else 1
        limb(c, (0, 0, 0), (s * 0.6, -1.4, 0), 0.28, 0.22, WHITE, segs=5)
        limb(c, (s * 0.6, -1.4, 0), (0, -2.4, 0), 0.22, 0.08, COPPER, segs=5)
        o = c.build(arm_r, loc=(0.6 + dx * 0.8, -4.7, -0.6))
        loop(o, "boss_cinder_collect_idle", "rotation_euler", 2.0, [(0, 0, s * 0.35), (0, 0, s * 0.35), (0, 0, -s * 0.05), (0, 0, s * 0.1)])

    # left arm: the cannon
    la = Model("aru_arm_l")
    limb(la, (0, 0, 0), (-0.6, -1.6, -0.6), 0.7, 0.6, GREYW, segs=6)
    la.ball(0.7, (-0.6, -1.6, -0.6), DARK, subdiv=0)
    la.box((1.6, 2.6, 1.4), (-0.6, -2.8, -0.6), WHITE, taper=0.9)
    la.box((1.7, 0.4, 1.45), (-0.6, -2.2, -0.6), COPPER)
    la.cyl(0.45, 2.2, (-0.6, -3.8, -0.6), DARK, segs=7, rot=FWD)
    la.cyl(0.6, 0.4, (-0.6, -5.7, -0.6), STEEL, segs=7, rot=FWD)
    la.cyl(0.3, 0.06, (-0.6, -6.1, -0.6), RED, segs=7, rot=FWD, glow=True)
    arm_l = la.build(body, loc=(-4.0, 0.2, 0.4))
    loop(arm_l, "boss_cinder_collect_idle", "rotation_euler", 2.0, [(0, 0, 0), (0.06, 0, 0.08), (0, 0, 0), (-0.1, 0, -0.1)])

    for x, y, z in ((-4.6, -6.4, 2.3), (-3.55, 0.1, 4.8), (-2.85, 0.1, 4.8), (2.85, 0.1, 4.8), (3.55, 0.1, 4.8), (4.6, -6.6, 2.3), (0, -2.0, 2.5)):
        mount(root, at(x, y, z), "gun")
    mount(root, at(0, -1.5, 1.65), "weak")
    mount(root, at(0, -1.4, 4.5), "weak")


def build():
    for fn in (boss_orutal, boss_halcyon, boss_kessra, boss_mirefall, boss_glacis, boss_ashgrave, boss_vesh, boss_cinder):
        fn()
