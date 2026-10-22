"""HALCYON's set pieces and the scenery that goes with them: lantern kelp grown into
arches over the evening sea, the drowned colony arks it grows on, gantries and stilt towers of the
port strung with neon and cable, the bones of the arks out in the marsh, and the pylons and broken
towers of the Stormwall."""
from __future__ import annotations

import math
import random

from mathutils import Vector

from kit import Model, light
from props_a_lib import bend, bob, collider, hull, lump, pulse, recolor, ribbon, root, sway, tube, arc
from props_a_halcyon import (BARREL, CONCRETE, CONTAINER, CRANE, CRANE_DARK, DARK, DECK, IRON, KELP, KELP_LEAF, LANTERN,
                             LANTERN_HOT, NEON_CYAN, NEON_GREEN, NEON_PINK, NEON_YELLOW, PAINT, ROOF, RUST, SIGN_BACK,
                             STILT, STILT_WET, STRIPE, WALL, WARN, WINDOW, container, deck, shack, stilts)

BLADDER = ["#ffb84a", "#ffc860", "#ff9a3a"]
DOME = "#7ad8e0"
SEAWEED = ["#4a6a3a", "#3e5a32", "#5a7a3a"]
BARNACLE = ["#8a8a7a", "#a8a090", "#6a6a60"]
STORM_ROD = "#c8f0ff"
STORM_HOT = "#f0ffff"
STORM_CONCRETE = ["#6a6e74", "#7a7e84", "#5a5e64"]
STORM_TOP = "#9aa0a6"
REBAR = "#5a3a2a"
CABLE = "#1e1a20"


def smooth(points, k=3):
    """A Catmull-Rom curve through the points, `k` steps between each pair."""
    pts = [Vector(p) for p in points]
    out = []
    for i in range(len(pts) - 1):
        p0 = pts[max(i - 1, 0)]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[min(i + 2, len(pts) - 1)]
        for j in range(k):
            t = j / k
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return out


def squash(m, k):
    """Press a model down to k of its height (giants keep low, so they're never shrunk to fit)."""
    for v in m.bm.verts:
        v.co.z *= k


def glowing(m, faces, color):
    recolor(m, faces, lambda f: (color, True))


def faces_up(m, faces, top, side=None, under=None, dot=0.55):
    for f in faces:
        f.normal_update()
    recolor(m, faces, lambda f: top if f.normal.z > dot else (under if under and f.normal.z < -0.45 else side))


def cable(m, a, b, sag, r=0.12, color=CABLE, n=8):
    """A cable slung from a to b, sagging by `sag` in the middle. Returns its points."""
    a, b = Vector(a), Vector(b)
    pts = []
    for k in range(n + 1):
        t = k / n
        p = a.lerp(b, t)
        p.z -= sag * 4 * t * (1 - t)
        pts.append(p)
    tube(m, pts, [r] * len(pts), color, segs=4)
    return pts


def lattice(m, x, y, z0, z1, w, color, dark, steps=None, rot=0.0):
    """A square lattice tower, `w` across, zig-zag braced on every face."""
    c, s = math.cos(rot), math.sin(rot)
    h = w / 2

    def at(px, py, z):
        return (x + px * c - py * s, y + px * s + py * c, z)
    corners = [(-h, -h), (h, -h), (h, h), (-h, h)]
    for px, py in corners:
        m.plank_line(at(px, py, z0), at(px, py, z1), 0.3, 0.3, color)
    steps = steps or max(3, int((z1 - z0) / 2.2))
    for k in range(steps):
        za = z0 + (z1 - z0) * k / steps
        zb = z0 + (z1 - z0) * (k + 1) / steps
        for j in range(4):
            (ax, ay), (bx, by) = corners[j], corners[(j + 1) % 4]
            if k % 2:
                ax, ay, bx, by = bx, by, ax, ay
            m.plank_line(at(ax, ay, za), at(bx, by, zb), 0.14, 0.14, dark)
        m.box((w + 0.2, w + 0.2, 0.16), at(0, 0, zb), dark, rot=(0, 0, rot))


# --- lantern kelp -----------------------------------------------------------------------------

def _blades(m, rng, pts, every=2, reach=(6.0, 10.0), floor=13.4, width=(1.4, 2.2)):
    """Broad blades streaming off a stalk to both sides, drooping, never below `floor`."""
    for k in range(1, len(pts) - 1, every):
        p = pts[k]
        for s in (-1, 1):
            if rng.random() < 0.2:
                continue
            yaw = s * math.pi / 2 + rng.uniform(-0.6, 0.6)
            L = rng.uniform(*reach)
            bl = arc((p.x, p.y, p.z), yaw, L, 0.1, 0.45, n=5)
            for q in bl:
                q.z = max(q.z, floor)
            w = rng.uniform(*width)
            c1, c2 = KELP_LEAF[(k + (s > 0)) % 3]
            ribbon(m, bl, [w * 0.3, w, w * 1.1, w * 0.9, w * 0.6, w * 0.15], c1, c2, fold=0.25, thick=0.08)


def _bladders(m, rng, pts, every=2, r=(0.8, 1.3), hang=1.2, floor=13.4):
    """Gold lantern bladders hanging under a stalk, a hot heart in each."""
    for k in range(1, len(pts) - 1, every):
        p = pts[k]
        rr = rng.uniform(*r)
        c = Vector((p.x + rng.uniform(-0.4, 0.4), p.y + rng.uniform(-0.8, 0.8), max(floor + rr, p.z - hang)))
        m.ball(rr, tuple(c), BLADDER[k % 3], subdiv=1, scale=(1, 1, 1.25), glow=True)
        m.ball(rr * 0.45, tuple(c + Vector((0, 0, -rr * 0.5))), LANTERN_HOT, subdiv=0, glow=True)


def _stalk(m, rng, ctrl, r0, r1, color, k=4):
    pts = smooth(ctrl, k)
    n = len(pts)
    tube(m, pts, [r0 + (r1 - r0) * j / (n - 1) for j in range(n)], color, segs=6,
         colors=[KELP[(j // 2) % 3] for j in range(n - 1)])
    return pts


def _surface_mat(m, rng, x, y, R, n=10, lanterns=5):
    """Blades lying out over the water round a stalk's foot, bladders floating among them."""
    for k in range(n):
        a = rng.uniform(0, math.tau)
        L = rng.uniform(R * 0.6, R)
        b = a + rng.uniform(-0.5, 0.5)
        pts = [Vector((x + math.cos(a) * 1.0 + math.cos(b) * L * t, y + math.sin(a) * 1.0 + math.sin(b) * L * t, 0.05)) for t in (0, 0.35, 0.7, 1)]
        ribbon(m, pts, [0.3, 0.9, 0.75, 0.15], *KELP_LEAF[k % 3], fold=0.15, thick=0.06)
    for k in range(lanterns):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(1.5, R * 0.8)
        m.ball(rng.uniform(0.4, 0.8), (x + math.cos(a) * d, y + math.sin(a) * d, 0.1), BLADDER[k % 3], subdiv=1, scale=(1, 1, 0.6),
               glow=True)


def kelp_arch(variants):
    """Span: lantern kelp grown taller than the rest, out of the sea on both sides, arching over
    to meet in the middle, blades streaming and bladders glowing under it. v1 is one colossal stalk
    bowed right across, its head floating on the far side, a second stalk wound up round it."""
    for i in range(2):
        r = root("halcyon_kelp_arch", i)
        rng = random.Random(5000 + i)
        m = Model(f"halcyon_kelp_arch_{i}", 5000 + i)
        if i == 0:
            for s in (-1, 1):
                for j in range(3):                                         # a bundle of stalks, braided
                    off = (j - 1) * 1.1
                    ctrl = [(s * (45 + off * 0.5), off, -3), (s * (42.5 + off * 0.3), off * 0.8, 8), (s * 38, off * 0.6, 16.0),
                            (s * 25, off * 0.4 + s * 0.8, 20.2 - j * 0.3), (s * 10, off * 0.3, 21.0 - j * 0.4),
                            (-s * (3 + j * 2), off * 0.3 - s * 0.6, 19.5 - j * 0.5)]
                    pts = _stalk(m, rng, ctrl, 1.15 - j * 0.15, 0.4, KELP[j])
                    over = [p for p in pts if p.z > 14.5]
                    _blades(m, rng, over, every=2 if j == 0 else 3)
                    _bladders(m, rng, over, every=2 + j)
                tip = Vector((-s * 4, 0, 19.5))
                m.ball(1.4, tuple(tip + Vector((0, 0, 0.6))), BLADDER[0], subdiv=1, scale=(1.2, 1, 0.9), glow=True)
                _surface_mat(m, rng, s * 44, 0, 7)
                collider(r, s * 44.5, 0, 2.8)
        else:
            ctrl = [(-45, 0, -3), (-42, 0.5, 8), (-36, 1.0, 16.5), (-18, 0.5, 21.0), (2, -0.5, 21.5), (20, -1, 19.5),
                    (33, -0.5, 16.5), (40, 0, 9), (44, 0.5, 2.6)]
            pts = _stalk(m, rng, ctrl, 1.8, 0.9, KELP[0], k=5)
            over = [p for p in pts if p.z > 14.5]
            _blades(m, rng, over, every=1, reach=(7.0, 11.0), width=(1.6, 2.6))
            _bladders(m, rng, over, every=2, r=(0.9, 1.5))
            # its head: a raft of great bladders on the water
            for k in range(7):
                a = k * math.tau / 7
                m.ball(1.6 if k else 2.4, (45 + math.cos(a) * 2.4 * (k > 0), math.sin(a) * 2.4 * (k > 0), 2.0), BLADDER[k % 3], subdiv=1,
                       scale=(1, 1, 0.8), glow=True)
            m.ball(1.2, (45, 0, 3.6), LANTERN_HOT, subdiv=1, glow=True)
            collider(r, 45, 0, 3.6)
            # the second stalk, wound up round the first from the middle of the sea
            base = Vector((6, 1.0, -3))
            wind = [base, Vector((6.4, 1.4, 6)), Vector((5.0, 2.2, 13)), Vector((3.0, 1.6, 18.5))]
            for k in range(10):
                a = k * 0.9
                p = pts[0].lerp(pts[-1], 0.5)
                wind.append(Vector((2 - k * 2.2, -0.5 + math.cos(a) * 2.0, 21.5 + math.sin(a) * 1.6 - k * 0.1)))
            sp = smooth(wind, 3)
            tube(m, sp, [0.9 - 0.6 * j / len(sp) for j in range(len(sp))], KELP[1], segs=5)
            _blades(m, rng, sp[4:], every=2, reach=(4.0, 7.0))
            collider(r, 6.2, 1.2, 1.4)
            _surface_mat(m, rng, -44, 0, 7)
            _surface_mat(m, rng, 6, 1, 5, n=7, lanterns=3)
        m.build(r)


def _hull_section(m, rng, x0, x1, R, top, color, yaw=0.0, cx=0.0, cy=0.0, ribs=True):
    """A length of an ark's hull lying along x: a squashed many-sided barrel, with ribs round it."""
    c, s = math.cos(yaw), math.sin(yaw)

    def at(x, y, z):
        return (cx + x * c - y * s, cy + x * s + y * c, z)
    pts = []
    for x in (x0, x1):
        for k in range(10):
            a = k * math.tau / 10
            pts.append(at(x, math.cos(a) * R, -2.5 + (math.sin(a) + 1) * (top + 2.5) / 2))
    fs = hull(m, pts, color)
    if ribs:                                                               # the seams between its hull rings
        for k in range(int((x1 - x0) / 6) + 1):
            x = x0 + 3 + k * 6
            if x > x1 - 1:
                break
            m.box((0.6, R * 1.6, 0.3), at(x, 0, top + 0.05), RUST[1], rot=(0, 0, yaw))
    return fs


def drowned_ark(variants):
    """Giant: v0 a colony ark sunk in the shallows, only its back above water, the kelp grown all
    over it and a few of its lights still burning; v1 its habitat ring, fallen flat and broken, a
    kelp forest growing up through the middle."""
    for i in range(2):
        r = root("halcyon_drowned_ark", i)
        rng = random.Random(5100 + i)
        m = Model(f"halcyon_drowned_ark_{i}", 5100 + i)
        if i == 0:
            fs = _hull_section(m, rng, -26, 8, 8.0, 4.2, PAINT[0])
            fs += _hull_section(m, rng, 9, 28, 7.6, 3.6, PAINT[1], yaw=0.16, cx=0.5, cy=0.6)
            faces_up(m, fs, PAINT[0], STRIPE, dot=0.8)
            # the bow, tapering
            pts = [(-26, math.cos(a) * 8, -2.5 + (math.sin(a) + 1) * 3.35) for a in [k * math.tau / 10 for k in range(10)]]
            pts += [(-33, math.cos(a) * 3, -2.0 + (math.sin(a) + 1) * 1.8) for a in [k * math.tau / 8 for k in range(8)]]
            bow = hull(m, pts, PAINT[1])
            faces_up(m, bow, PAINT[0], RUST[1], dot=0.8)
            # the spine: a walkway, a row of observation domes, some still lit
            m.box((50, 2.6, 0.5), (-1, 0, 4.4), "#8a8a84")
            for k in range(6):
                x = -22 + k * 8
                lit = k in (1, 4)
                m.ball(2.2, (x, 4.0 * (1 if k % 2 else -1), 4.6), DOME if lit else "#3a5a6a", subdiv=1, scale=(1, 1, 0.55), glow=lit)
                m.cyl(2.3, 0.4, (x, 4.0 * (1 if k % 2 else -1), 4.1), RUST[k % 3], segs=8)
            for k in range(14):                                            # window rows down its flanks
                x = -24 + k * 3.6
                for sd in (-1, 1):
                    m.box((1.6, 0.3, 0.6), (x, sd * 7.3, 2.0), WINDOW if rng.random() < 0.3 else DARK, rot=(sd * -0.8, 0, 0),
                          glow=rng.random() < 0.3)
            # rust where the paint has gone, a stripe, a broken bridge tower at the stern
            for k in range(8):
                m.box((rng.uniform(3, 7), rng.uniform(2, 5), 0.3), (rng.uniform(-24, 24), rng.uniform(-5, 5), 4.3), RUST[k % 4],
                      rot=(0, 0, rng.uniform(-0.3, 0.3)))
            m.box((8, 3.2, 0.32), (12, -4.5, 3.9), STRIPE, rot=(0.25, 0, 0.16))
            m.box((6, 6, 3.0), (22, 2, 5.0), PAINT[1], rot=(0, 0, 0.16))
            m.box((6.2, 0.3, 0.8), (22.4, -1.2, 5.8), WINDOW, rot=(0, 0, 0.16), glow=True)
            m.plank_line((23, 3, 6.5), (24, 4, 8.3), 0.25, 0.25, IRON)
            m.ball(0.3, (24, 4, 8.4), WARN, subdiv=1, glow=True)
            # kelp grown over it, mats and stalks with their lanterns
            for k in range(8):
                x = rng.uniform(-28, 26)
                y = rng.choice((-1, 1)) * rng.uniform(5, 9)
                _surface_mat(m, rng, x, y, 4.5, n=5, lanterns=2)
            for k in range(5):
                x, y = rng.uniform(-24, 24), rng.uniform(-6, 6)
                pts = bend((x, y, 4.0), (x, y, 7.5), (rng.uniform(-1, 1), rng.uniform(-1, 1)), n=4)
                tube(m, pts, [0.3, 0.26, 0.22, 0.18, 0.1], KELP[k % 3], segs=5)
                m.ball(0.5, tuple(pts[-1]), LANTERN, subdiv=1, glow=True)
                for q in pts[1:]:
                    yaw = rng.uniform(0, math.tau)
                    bl = arc((q.x, q.y, q.z), yaw, 1.6, 0.2, 0.9, n=3)
                    ribbon(m, bl, [0.1, 0.4, 0.35, 0.1], *KELP_LEAF[k % 3], fold=0.2, thick=0.05)
        else:
            R = 19.0
            n = 30
            gaps = {7, 8, 19, 20}
            for k in range(n):
                if k in gaps:
                    continue
                a0, a1 = k * math.tau / n, (k + 1) * math.tau / n
                pts = []
                for a in (a0, a1):
                    for j in range(8):
                        b = j * math.tau / 8
                        rr = R + math.cos(b) * 3.0
                        pts.append((math.cos(a) * rr, math.sin(a) * rr, -1.5 + math.sin(b) * 3.0 + 1.5 + (0.3 if k % 5 == 0 else 0)))
                fs = hull(m, pts, PAINT[k % 2])
                faces_up(m, fs, PAINT[k % 2] if k % 4 else RUST[k % 3], RUST[1], dot=0.75)
                if k % 2 == 0:                                             # windows round its inner face, a few lit
                    a = (a0 + a1) / 2
                    lit = rng.random() < 0.35
                    m.box((1.2, 2.0, 0.6), (math.cos(a) * (R - 2.6), math.sin(a) * (R - 2.6), 2.4), WINDOW if lit else DARK,
                          rot=(0, 0.7, a), glow=lit)
                if k % 3 == 0:                                             # spokes, broken off
                    a = (a0 + a1) / 2
                    L = rng.uniform(4, 9)
                    m.plank_line((math.cos(a) * (R - 2.5), math.sin(a) * (R - 2.5), 1.5),
                                 (math.cos(a) * (R - 2.5 - L), math.sin(a) * (R - 2.5 - L), 0.4), 1.0, 0.8, RUST[k % 4])
            # the hub, sunk in the middle, and kelp grown up all round it
            m.cyl(4.0, 3.0, (0, 0, -1.5), RUST[0], segs=10, r_top=3.4)
            m.cyl(2.0, 0.4, (0, 0, 1.5), DOME, segs=10, glow=True)
            for k in range(9):
                a = rng.uniform(0, math.tau)
                d = rng.uniform(6, 13)
                x, y = math.cos(a) * d, math.sin(a) * d
                h = rng.uniform(4.5, 7.5)
                pts = bend((x, y, -1), (x, y, h), (rng.uniform(-1, 1), rng.uniform(-1, 1)), n=5)
                tube(m, pts, [0.32, 0.3, 0.26, 0.22, 0.18, 0.1], KELP[k % 3], segs=5)
                for q in pts[2:]:
                    yaw = rng.uniform(0, math.tau)
                    bl = arc((q.x, q.y, q.z), yaw, 1.8, 0.2, 0.9, n=3)
                    ribbon(m, bl, [0.1, 0.45, 0.4, 0.1], *KELP_LEAF[k % 3], fold=0.2, thick=0.05)
                m.ball(0.55, tuple(pts[-1]), LANTERN, subdiv=1, glow=True)
            _surface_mat(m, rng, 0, 0, 12, n=14, lanterns=8)
        squash(m, 0.7)
        m.build(r)


def lantern_kelp(variants):
    """Hero kelp: a fat old stalk crowned with a cluster of great lantern bladders (in the water)."""
    for i in range(3):
        H = (6.8, 5.6, 7.2)[i]
        r = root("halcyon_lantern_kelp", i, height=H + 0.6)
        rng = random.Random(5300 + i)
        m = Model(f"halcyon_lantern_kelp_{i}", 5300 + i)
        _surface_mat(m, rng, 0, 0, 3.2, n=8, lanterns=3)
        m.build(r)
        s = Model(f"halcyon_lantern_kelp_{i}_stalk", 5310 + i)
        heads = []
        n = (1, 2, 3)[i]
        for k in range(n):
            a = k * math.tau / max(n, 1) + rng.uniform(-0.4, 0.4)
            lean = (math.cos(a) * rng.uniform(0.6, 1.6), math.sin(a) * rng.uniform(0.6, 1.6)) if n > 1 else (0.6, 0.3)
            h = H * (1.0 if k == 0 else rng.uniform(0.65, 0.85))
            pts = bend((0, 0, -1.0), (0, 0, h), lean, n=6)
            tube(s, pts, [0.42, 0.38, 0.34, 0.3, 0.27, 0.24, 0.2], KELP[k % 3], segs=6, colors=[KELP[j % 3] for j in range(6)])
            for j in range(2, 7):
                p = pts[j]
                yaw = rng.uniform(0, math.tau)
                bl = arc((p.x, p.y, p.z), yaw, rng.uniform(1.4, 2.2), 0.25, 1.0, n=4)
                ribbon(s, bl, [0.1, 0.4, 0.45, 0.3, 0.06], *KELP_LEAF[(j + k) % 3], fold=0.2, thick=0.05)
            heads.append(pts[-1])
        for k, tp in enumerate(heads):                                     # the crown of bladders
            for j in range(5):
                a = j * math.tau / 5 + k
                s.ball(0.42, (tp.x + math.cos(a) * 0.55, tp.y + math.sin(a) * 0.55, tp.z - 0.1), BLADDER[j % 3], subdiv=1,
                       scale=(1, 1, 1.3), glow=True)
            s.ball(0.55, (tp.x, tp.y, tp.z + 0.35), LANTERN_HOT, subdiv=1, glow=True)
        obj = s.build(r)
        sway(obj, f"halcyon_lantern_kelp_{i}_sway_idle", amp=(0.04, 0.035), period=4.4 + i * 0.6, phase=i)


# --- stiltport --------------------------------------------------------------------------------

PAPER = ["#ff5a3a", "#ffb43a", "#ff7ac0"]
LAUNDRY = ["#e8e0d0", "#3a8ab0", "#c83a3a", "#d0a030", "#6a8a3a"]
PIPE = ["#4a7a78", "#a8483a", "#7a7a80"]


def _neon(m, a, b, color, w=0.22):
    glowing(m, m.plank_line(a, b, w, w, color), color)


def _lanterns_on(m, rng, pts, every=1, drop=0.6, floor=13.3, colors=PAPER):
    """Paper lanterns hanging off a line of points."""
    for k, p in enumerate(pts[1:-1]):
        if k % every:
            continue
        z = max(floor + 0.4, p.z - drop)
        m.plank_line((p.x, p.y, p.z), (p.x, p.y, z + 0.3), 0.05, 0.05, CABLE)
        m.ball(0.38, (p.x, p.y, z), colors[k % len(colors)], subdiv=1, scale=(1, 1, 1.3), glow=True)


def _laundry(m, rng, pts, floor=13.3):
    for k, p in enumerate(pts[1:-1]):
        if rng.random() < 0.35:
            continue
        h = rng.uniform(0.8, 1.4)
        z = max(floor + h / 2, p.z - h / 2 - 0.1)
        m.box((rng.uniform(0.7, 1.2), 0.08, h), (p.x, p.y, z), LAUNDRY[k % len(LAUNDRY)], rot=(0.5, 0, rng.uniform(-0.2, 0.2)))


def _tower_house(m, rng, x, y, z0, floors, w, neon=None, tank=True, sign=None, rot=0.0):
    """A tower of shacks stacked on stilts, each floor turned a little, a water tank on top.
    Returns the height of its roof."""
    stilts(m, rng, x, y, w, w, z0, rot=rot)
    deck(m, x, y, w + 0.4, w + 0.4, z0, rot=rot)
    z = z0 + 0.08
    for k in range(floors):
        fw = w - 0.3 * k + rng.uniform(-0.2, 0.2)
        h = rng.uniform(1.8, 2.4)
        turn = rot + rng.uniform(-0.25, 0.25)
        shack(m, rng, x + rng.uniform(-0.3, 0.3), y + rng.uniform(-0.3, 0.3), z, fw, fw * 0.9, h, WALL[(k + int(x)) % 5],
              ROOF[(k + int(y * 3)) % 4], neon=neon if k == floors - 1 else None, rot=turn, door=False)
        z += h + 0.3
    if tank:
        m.cyl(0.9, 1.6, (x - w * 0.2, y + w * 0.15, z), "#5a7a8a", segs=8)
        m.cyl(0.95, 0.15, (x - w * 0.2, y + w * 0.15, z + 1.6), "#3a4a5a", segs=8)
    if sign:
        back = m.box((w * 0.9, 0.2, 1.4), (x, y - w * 0.55, z - 1.2), SIGN_BACK, rot=(0.6, 0, rot))
        glowing(m, m.box((w * 0.7, 0.24, 0.3), (x, y - w * 0.6, z - 1.0), sign, rot=(0.6, 0, rot)), sign)
        glowing(m, m.box((w * 0.5, 0.24, 0.3), (x, y - w * 0.66, z - 1.5), NEON_YELLOW, rot=(0.6, 0, rot)), NEON_YELLOW)
    m.plank_line((x + w * 0.3, y - w * 0.3, z), (x + w * 0.3, y - w * 0.3, z + 2.4), 0.08, 0.08, IRON)
    m.ball(0.2, (x + w * 0.3, y - w * 0.3, z + 2.5), WARN, subdiv=1, glow=True)
    return z


def gantry(variants):
    """Span: v0 a pipe gantry right across the port, lattice towers at each end, a walkway along
    its top with a toll booth, pipes and neon down its sides, lanterns under it; v1 a street of
    cables slung between stilt towers, strung with lanterns and washing, a tower in the middle."""
    for i in range(2):
        r = root("halcyon_gantry", i)
        rng = random.Random(6000 + i)
        m = Model(f"halcyon_gantry_{i}", 6000 + i)
        if i == 0:
            for s in (-1, 1):
                lattice(m, s * 43, 0, -3, 19.5, 3.6, CRANE, CRANE_DARK)
                m.box((4.4, 4.4, 1.0), (s * 43, 0, -1.0), CONCRETE[0])
                m.ball(0.3, (s * 43, 0, 19.9), WARN, subdiv=1, glow=True)
                collider(r, s * 43, 0, 2.7)
            L = 86
            for y in (-1.6, 1.6):                                          # the truss: chords, posts, lacing
                for z in (13.8, 17.0):
                    m.box((L, 0.32, 0.32), (0, y, z), CRANE)
                for k in range(29):
                    x = -42 + k * 3
                    m.box((0.2, 0.2, 3.2), (x, y, 15.4), CRANE_DARK)
                    if k < 28:
                        m.plank_line((x, y, 13.8 if k % 2 else 17.0), (x + 3, y, 17.0 if k % 2 else 13.8), 0.14, 0.14, CRANE_DARK)
            for k in range(43):                                            # the walkway: grating on top
                m.box((1.9, 3.4, 0.14), (-42 + k * 2, 0, 17.2), ("#4a4448", "#3e3a3e")[k % 2])
            for y in (-1.7, 1.7):
                m.box((L, 0.1, 0.1), (0, y, 18.2), IRON)
            for k, (y, z, rr) in enumerate(((2.4, 15.0, 0.55), (2.5, 16.3, 0.4), (-2.4, 14.6, 0.45))):   # pipes along its sides
                tube(m, [Vector((-44, y, z)), Vector((44, y, z))], [rr, rr], PIPE[k], segs=6)
                for j in range(12):
                    m.cyl(rr + 0.12, 0.3, (-40 + j * 7.3, y, z), PIPE[k], segs=6, rot=(0, math.pi / 2, 0))
            _neon(m, (-40, -1.95, 13.9), (40, -1.95, 13.9), NEON_PINK)
            _neon(m, (-40, 1.95, 17.0), (40, 1.95, 17.0), NEON_CYAN)
            # the toll booth on the walkway, and a sign over it
            shack(m, rng, -9, 0, 17.3, 3.2, 2.6, 1.8, WALL[1], ROOF[1], neon=NEON_YELLOW, door=False)
            m.box((5.0, 0.3, 1.6), (-9, -1.4, 20.6), SIGN_BACK, rot=(0.7, 0, 0))
            glowing(m, m.box((4.0, 0.34, 0.4), (-9, -1.5, 20.8), NEON_YELLOW, rot=(0.7, 0, 0)), NEON_YELLOW)
            # lanterns strung along under it
            line = [Vector((-36 + k * 3, rng.choice((-1.6, 1.6)), 13.7)) for k in range(25)]
            _lanterns_on(m, rng, line, every=2, drop=0.2)
            for k in range(3):                                             # crates and drums up on the walkway
                x = rng.uniform(5, 35)
                m.box((1.4, 1.4, 1.2), (x, rng.uniform(-0.6, 0.6), 17.9), CONTAINER[k], rot=(0, 0, rng.uniform(-0.4, 0.4)))
        else:
            tops = []
            for x in (-43, 4, 43):
                mid = x == 4
                w = 3.6 if mid else 4.2
                z = _tower_house(m, rng, x, rng.uniform(-0.5, 0.5), 6.0 if mid else 4.5, 4 if mid else 4, w,
                                 neon=NEON_PINK if mid else NEON_CYAN, sign=NEON_CYAN if mid else None)
                collider(r, x, 0, w * 0.75)
                tops.append((x, z))
            # cables slung between them, lanterns on some, washing on others
            for a, b in zip(tops, tops[1:]):
                for k, (dy, dz, sag) in enumerate(((-1.4, -1.2, 2.4), (1.4, -1.6, 2.8), (0.0, -0.4, 2.0), (-0.6, -2.4, 1.6))):
                    za, zb = a[1] + dz, b[1] + dz
                    sag = min(sag, min(za, zb) - 14.0)
                    pts = cable(m, (a[0] + 2, dy, za), (b[0] - 2, dy, zb), sag, r=0.08, n=12)
                    if k == 0 or k == 2:
                        _lanterns_on(m, rng, pts, every=1, drop=0.4)
                    elif k == 1:
                        _laundry(m, rng, pts)
            m.box((3, 0.3, 0.8), (4, -2.2, 12.0), SIGN_BACK)
        m.build(r)


def stilt_towers(variants):
    """Gate: tower houses on long stilts, stacked four and five shacks high, neon on their roofs,
    walkways slung between them up above the flight line."""
    shapes = [
        [(-17.5, 0.5, 4, 4.0), (-5.5, -0.6, 3, 3.6), (6.5, 0.4, 5, 4.2), (18.5, -0.4, 3, 3.4)],
        [(-13.5, -0.4, 4, 4.4), (0, 0.6, 5, 4.6), (13.5, -0.3, 3, 4.0)],
    ]
    for i, towers in enumerate(shapes):
        r = root("halcyon_stilt_towers", i)
        rng = random.Random(6100 + i)
        m = Model(f"halcyon_stilt_towers_{i}", 6100 + i)
        tops = []
        for k, (x, y, floors, w) in enumerate(towers):
            z = _tower_house(m, rng, x, y, 7.5, floors, w, neon=(NEON_PINK, NEON_CYAN, NEON_GREEN)[k % 3],
                             sign=(NEON_PINK, NEON_CYAN)[k % 2] if k % 2 == 0 else None, rot=rng.uniform(-0.15, 0.15))
            collider(r, x, y, w * 0.72)
            tops.append((x, y, z))
        for a, b in zip(tops, tops[1:]):                                   # walkways between, high
            z = min(a[2], b[2]) - rng.uniform(1.0, 2.5)
            z = max(z, 14.5)
            xa, xb = a[0] + 2.0, b[0] - 2.0
            n = int((xb - xa) / 0.8)
            for j in range(n):
                x = xa + (j + 0.5) * (xb - xa) / n
                m.box((0.7, 1.4, 0.14), (x, (a[1] + b[1]) / 2, z), DECK[j % 3])
            for dy in (-0.7, 0.7):
                m.box((xb - xa, 0.08, 0.08), ((xa + xb) / 2, (a[1] + b[1]) / 2 + dy, z + 0.9), IRON)
            pts = cable(m, (xa, (a[1] + b[1]) / 2 - 0.2, z + 2.6), (xb, (a[1] + b[1]) / 2 - 0.2, z + 2.6), 0.8, r=0.06, n=8)
            _lanterns_on(m, rng, pts, every=1, drop=0.3)
        m.build(r)


def barge(variants):
    """Giant: v0 a container barge as long as a street, moored, its stacks in faded colours, the
    bridge lit; v1 the floating market: boats lashed round a raft of stalls under awnings."""
    for i in range(2):
        r = root("halcyon_barge", i)
        rng = random.Random(6200 + i)
        m = Model(f"halcyon_barge_{i}", 6200 + i)
        if i == 0:
            L, W = 50.0, 14.0
            pts = [(-L / 2 + 4, -W / 2, -1.5), (L / 2, -W / 2, -1.5), (L / 2, W / 2, -1.5), (-L / 2 + 4, W / 2, -1.5),
                   (-L / 2 - 3, 0, -1.5), (-L / 2 + 4, -W / 2 - 0.3, 2.2), (L / 2, -W / 2 - 0.3, 2.2), (L / 2, W / 2 + 0.3, 2.2),
                   (-L / 2 + 4, W / 2 + 0.3, 2.2), (-L / 2 - 4, 0, 2.6)]
            fs = hull(m, pts, "#2a3a4a")
            faces_up(m, fs, "#4a4448", "#2a3a4a", dot=0.8)
            m.box((L - 1, W * 1.02, 0.5), (0.5, 0, 1.0), "#a8402e")                  # a red band at the waterline
            for x in range(-18, 16, 4):                                      # container rows, three high at most
                for y in (-4.2, -1.4, 1.4, 4.2):
                    h = rng.choice((0, 1, 2, 2, 3, 3))
                    for lvl in range(h):
                        container(m, x, y, 2.2 + lvl * 1.22, CONTAINER[rng.randrange(6)], rot=math.pi / 2, L=3.6, W=2.6, H=1.2)
            m.box((6, 12, 3.6), (21, 0, 4.0), "#d8d0c0")                     # the bridge
            m.box((6.2, 12.2, 0.3), (21, 0, 5.9), "#7a7a80")
            m.box((0.2, 10, 0.8), (17.9, 0, 4.8), WINDOW, glow=True)
            m.box((3, 4, 1.2), (21.5, 0, 6.6), "#d8d0c0")
            m.plank_line((22, 0, 7.2), (22, 0, 8.3), 0.2, 0.2, IRON)
            m.ball(0.25, (22, 0, 8.4), WARN, subdiv=1, glow=True)
            for y in (-5, 5):                                                # bollards and mooring lines
                m.cyl(0.4, 0.6, (-20, y, 2.2), IRON, segs=6)
        else:
            m.box((16, 12, 0.5), (0, 0, 0.4), DECK[0])
            for k in range(4):                                               # stalls under striped awnings
                x, y = -5 + (k % 2) * 10, -3 + (k // 2) * 6
                m.box((5, 3.6, 1.6), (x, y, 1.5), WALL[k % 5])
                for j in range(6):
                    m.box((0.95, 4.6, 0.12), (x - 2.4 + j * 0.95, y, 3.0 + (0.15 if j % 2 else 0)), (PAPER[k % 3], "#e8e0d0")[j % 2],
                          rot=(0.12, 0, 0))
            for k in range(14):                                              # the boats round it
                a = k * math.tau / 14 + rng.uniform(-0.1, 0.1)
                d = 11.5 + rng.uniform(-0.5, 1.5)
                x, y = math.cos(a) * d * 1.25, math.sin(a) * d
                _sampan(m, rng, x, y, a + math.pi / 2 + rng.uniform(-0.3, 0.3), k)
            ring = [Vector((math.cos(a) * 9.5, math.sin(a) * 7.5, 4.2)) for a in [k * math.tau / 16 for k in range(17)]]
            tube(m, ring, [0.06] * len(ring), CABLE, segs=4)
            for k, p in enumerate(ring[:-1]):
                m.ball(0.4, (p.x, p.y, p.z - 0.4), PAPER[k % 3], subdiv=1, scale=(1, 1, 1.3), glow=True)
            for k in range(4):
                a = k * math.tau / 4 + 0.4
                m.plank_line((math.cos(a) * 9.5, math.sin(a) * 7.5, 0.5), (math.cos(a) * 9.5, math.sin(a) * 7.5, 4.6), 0.2, 0.2, STILT)
        squash(m, 0.75)
        m.build(r)


def _sampan(m, rng, x, y, yaw, k, L=None):
    """A little boat: a long hull, a hooped canvas cover, a lantern on a pole."""
    L = L or rng.uniform(4.0, 5.5)
    c, s = math.cos(yaw), math.sin(yaw)

    def at(u, v, z):
        return (x + u * c - v * s, y + u * s + v * c, z)
    pts = [at(-L / 2, 0, 0.9), at(L / 2, 0, 1.0), at(-L / 2 + 0.8, -0.8, 0.8), at(-L / 2 + 0.8, 0.8, 0.8), at(L / 2 - 0.8, -0.8, 0.8),
           at(L / 2 - 0.8, 0.8, 0.8), at(-L / 2 + 0.8, 0, -0.3), at(L / 2 - 0.8, 0, -0.3)]
    fs = hull(m, pts, DECK[k % 3])
    faces_up(m, fs, DECK[(k + 1) % 3], "#4a3424", dot=0.8)
    m.box((L * 0.4, 1.5, 0.5), at(0, 0, 1.15), ("#8a6a42", "#3a6a7a", "#a8483a")[k % 3], rot=(0, 0, yaw))
    m.ball(0.75, at(0, 0, 1.2), ("#c8b890", "#a8a090", "#6a7a5a")[k % 3], subdiv=1, scale=(L * 0.22, 1.0, 0.55), rot=(0, 0, yaw))
    m.plank_line(at(L / 2 - 0.6, 0, 1.0), at(L / 2 - 0.6, 0, 2.6), 0.08, 0.08, STILT)
    m.ball(0.25, at(L / 2 - 0.6, 0, 2.6), PAPER[k % 3], subdiv=1, scale=(1, 1, 1.3), glow=True)


def sampan(variants):
    """Boats tied up in the shallows (in the water)."""
    for i in range(3):
        r = root("halcyon_sampan", i, height=2.8)
        rng = random.Random(6300 + i)
        m = Model(f"halcyon_sampan_{i}", 6300 + i)
        if i == 2:
            for k in range(3):                                               # three rafted together
                _sampan(m, rng, 0, -1.8 + k * 1.8, rng.uniform(-0.15, 0.15), k, L=4.6)
        else:
            _sampan(m, rng, 0, 0, 0, i, L=(5.0, 4.2)[i])
        bob(m.build(r), f"halcyon_sampan_{i}_bob_idle", amp=0.08, period=2.8 + i * 0.4, tilt=0.04)


def tank_tower(variants):
    """A water tower on stilts, a ladder and a lamp, rust down its side."""
    for i in range(2):
        r = root("halcyon_tank_tower", i, height=6.5)
        rng = random.Random(6400 + i)
        m = Model(f"halcyon_tank_tower_{i}", 6400 + i)
        H = (4.2, 3.4)[i]
        for a in range(4):
            b = a * math.tau / 4 + math.pi / 4
            m.plank_line((math.cos(b) * 1.6, math.sin(b) * 1.6, -0.3), (math.cos(b) * 1.1, math.sin(b) * 1.1, H), 0.2, 0.2, STILT)
        m.box((2.8, 2.8, 0.2), (0, 0, H), DECK[1])
        col = ("#5a7a8a", "#a8483a")[i]
        m.cyl(1.4, 1.9, (0, 0, H + 0.1), col, segs=8)
        m.cyl(1.5, 0.5, (0, 0, H + 2.0), "#3a4a5a", segs=8, r_top=0.3)
        m.box((0.6, 0.1, 1.6), (0.6, -1.38, H + 1.0), RUST[2])
        m.ball(0.2, (0, 0, H + 2.6), WARN, subdiv=1, glow=True)
        if i == 1:
            shack(m, rng, 2.4, 0.4, 0, 2.2, 2.0, 1.6, WALL[3], ROOF[2], neon=NEON_PINK, door=True)
        m.build(r, rot_z=rng.uniform(0, math.tau))


def cargo_pile(variants):
    """Cargo on the quay: crates and drums under a net, a pallet or two, a lamp post."""
    for i in range(2):
        r = root("halcyon_cargo_pile", i, height=3.0)
        rng = random.Random(6500 + i)
        m = Model(f"halcyon_cargo_pile_{i}", 6500 + i)
        for k in range(6 + i * 3):
            x, y = rng.uniform(-2.2, 2.2), rng.uniform(-1.6, 1.6)
            if k % 3 == 0:
                m.cyl(0.42, 0.9, (x, y, 0), BARREL[k % 3], segs=7)
                m.cyl(0.43, 0.06, (x, y, 0.85), IRON, segs=7)
            else:
                sz = rng.uniform(0.8, 1.3)
                m.box((sz, sz, sz), (x, y, sz / 2 + (0.9 if k > 5 else 0)), ("#8a6a42", "#a87a4a", "#6a5a3a")[k % 3],
                      rot=(0, 0, rng.uniform(-0.5, 0.5)))
        m.ball(1.8, (0, 0, 0.6), "#3a4a3a", subdiv=1, scale=(1.4, 1.1, 0.5))          # a net slung over
        m.plank_line((2.8, 1.6, 0), (2.8, 1.6, 3.0), 0.12, 0.12, IRON)
        m.ball(0.25, (2.8, 1.6, 3.0), WINDOW, subdiv=1, glow=True)
        m.build(r, rot_z=rng.uniform(0, math.tau))


# --- colony bones -----------------------------------------------------------------------------

def _rib_curve(x_half, top, n=16, p=3.0):
    """A rib's arc across the field: legs down at +-x_half, flat-topped (a superellipse)."""
    out = []
    for k in range(n + 1):
        t = -1 + 2 * k / n
        x = t * x_half
        z = top * max(0.0, 1 - abs(t) ** p) ** (1 / p)
        out.append(Vector((x, 0, z - 3.0 * (1 - z / top) ** 4)))
    return out


def _girder(m, pts, w, h, color, flange=None, y=0.0):
    """An I-beam through `pts` (all at the same y): a web and two flanges, segment by segment."""
    for a, b in zip(pts, pts[1:]):
        d = b - a
        L = d.length
        mid = (a + b) / 2 + Vector((0, y, 0))
        ang = math.atan2(d.z, d.x)
        m.box((L + 0.1, 0.25, h), tuple(mid), color, rot=(0, -ang, 0))
        for s in (-1, 1):
            nz = Vector((-math.sin(ang), 0, math.cos(ang))) * (h / 2) * s
            m.box((L + 0.1, w, 0.25), tuple(mid + nz), flange or color, rot=(0, -ang, 0))


def ark_ribs(variants):
    """Span: the frames of a colony ark's hull, still standing out of the marsh after the plating
    was stripped. v0 three great ribs and the stringers between, a few plates left on top; v1 a
    broken keel lying across two ribs and a bulkhead standing in the middle."""
    for i in range(2):
        r = root("halcyon_ark_ribs", i)
        rng = random.Random(7000 + i)
        m = Model(f"halcyon_ark_ribs_{i}", 7000 + i)
        ys = (-5.0, 0.0, 5.0) if i == 0 else (-4.0, 4.0)
        for j, y in enumerate(ys):
            top = 21.0 - abs(j - (len(ys) - 1) / 2) * 1.2
            pts = _rib_curve(44.0, top)
            if i == 0 and j == 2:                                          # one has lost its top
                pts = pts[:6] + [pts[6] + Vector((1.5, 0, -1.0))]
                _girder(m, pts, 1.4, 1.8, RUST[0], RUST[2], y=y)
                tail = _rib_curve(44.0, top)[11:]
                _girder(m, tail, 1.4, 1.8, RUST[0], RUST[2], y=y)
            else:
                _girder(m, pts, 1.4, 1.8, RUST[j % 2], RUST[2], y=y)
            for s in (-1, 1):
                m.box((3.0, 3.0, 2.4), (s * 43, y, -1.6), RUST[3])
                collider(r, s * 43.0, y, 1.8)
        # stringers between the ribs, and the last of the plating up on top
        crown = _rib_curve(44.0, 21.0)
        for k in range(3, 14, 2):
            p = crown[k]
            if p.z < 14.5:
                continue
            m.box((0.5, abs(ys[-1] - ys[0]) + 1.2, 0.5), (p.x, 0, p.z - 0.4), RUST[3])
        for k in range(5):
            idx = rng.randrange(4, 12)
            p = crown[idx]
            w = rng.uniform(4, 9)
            fs = m.box((w, rng.uniform(4, 8), 0.3), (p.x + rng.uniform(-2, 2), rng.uniform(-2, 2), p.z + 0.9), PAINT[k % 2] if k % 3 else RUST[2],
                       rot=(rng.uniform(-0.1, 0.1), -math.atan2(crown[idx + 1].z - crown[idx - 1].z, crown[idx + 1].x - crown[idx - 1].x), 0))
        m.box((10, 3.4, 0.34), (-12, 1, 21.3), STRIPE, rot=(0.05, 0.05, 0))
        for k in range(10):                                                # cables hanging off it
            x = rng.uniform(-30, 30)
            p = min(crown, key=lambda q: abs(q.x - x))
            y = rng.choice(ys)
            tube(m, [Vector((x, y, p.z - 0.8)), Vector((x + 0.3, y + 0.2, max(13.2, p.z - 3.5)))], [0.1, 0.1], CABLE, segs=4)
        if i == 1:
            # the keel: a box girder lying right across the ribs' tops, and a bulkhead holding it up
            for k in range(3):
                x0 = -46 + k * 31
                m.box((30, 2.6, 2.2), (x0 + 15, 0, 22.0 - k * 0.6 + (0.6 if k == 1 else 0)), RUST[k % 3], rot=(0, (k - 1) * 0.03, 0.03 * (k - 1)))
            m.box((6, 4, 21), (5, 0, 8.5), RUST[1])
            m.box((6.2, 4.2, 1.0), (5, 0, 19.0), RUST[3])
            for k in range(3):
                m.box((1.2, 0.2, 1.4), (3.5 + k * 1.5, -2.05, 10 + k * 3), DARK)
            m.ball(0.35, (5, -2, 20), "#ff5a3a", subdiv=1, glow=True)
            collider(r, 5, 0, 3.4)
        m.build(r)


def ark_fins(variants):
    """Gate: the radiator fins of an ark's reactor, stood on end in the marsh, rusted through, a
    cable web strung between their heads."""
    shapes = [
        [(-17, 0.4, 23, 3.4), (-5.5, -0.6, 18, 3.0), (6, 0.5, 25, 3.6), (17.5, -0.3, 16, 2.6)],
        [(-14, -0.3, 20, 3.6), (0, 0.6, 26, 3.8), (14, -0.4, 18, 3.2)],
    ]
    for i, fins in enumerate(shapes):
        r = root("halcyon_ark_fins", i)
        rng = random.Random(7100 + i)
        m = Model(f"halcyon_ark_fins_{i}", 7100 + i)
        heads = []
        for k, (x, y, H, w) in enumerate(fins):
            lean = rng.uniform(-0.08, 0.08)
            m.box((w, 2.0, H + 3), (x, y, (H - 3) / 2), RUST[k % 3], rot=(lean, 0, rng.uniform(-0.2, 0.2)))
            for j in range(int(H / 2.4)):                                  # cooling ribs across it
                m.box((w + 0.4, 2.3, 0.35), (x, y, 1.0 + j * 2.4), (RUST[3], PAINT[1])[j % 4 == 0], rot=(lean, 0, 0))
            m.box((w * 0.5, 2.1, 2.4), (x, y, H - 2.0), STRIPE)
            m.box((1.2, 2.1, 1.0), (x + w * 0.25, y, H * 0.45), DARK)          # rusted through
            m.ball(0.35, (x, y, H + 0.2), "#ff5a3a", subdiv=1, glow=True)
            collider(r, x, y, max(w, 2.0) * 0.6)
            heads.append(Vector((x, y, H - 1.0)))
            for j in range(3):
                lump(m, rng, (x + rng.uniform(-3, 3), y + rng.uniform(-2.5, 2.5), 0.1), (1.2, 1.0, 0.6), RUST[j], n=8, flat=0.5)
        for a, b in zip(heads, heads[1:]):
            za = min(a.z, b.z)
            cable(m, (a.x, a.y, za), (b.x, b.y, za - 0.5), 1.4, r=0.14, n=8)
            cable(m, (a.x, a.y + 0.6, za - 2.5), (b.x, b.y + 0.6, za - 3.0), 1.2, r=0.1, n=8)
        m.build(r)


def ark_wreck(variants):
    """Giant: v0 a colony ark broken in two on the marsh, its ribs showing at the break, the last
    of its white paint and the founders' stripe; v1 its engine section, three great bells on their
    sides and the reactor housing split open."""
    for i in range(2):
        r = root("halcyon_ark_wreck", i)
        rng = random.Random(7200 + i)
        m = Model(f"halcyon_ark_wreck_{i}", 7200 + i)
        if i == 0:
            fs = _hull_section(m, rng, -30, -3, 7.5, 6.5, RUST[0], yaw=0.06)
            fs += _hull_section(m, rng, 2, 26, 7.0, 5.2, RUST[2], yaw=-0.2, cx=1, cy=-2)
            faces_up(m, fs, PAINT[0], RUST[1], dot=0.8)
            for k in range(8):                                             # paint gone to rust in patches
                m.box((rng.uniform(3, 6), rng.uniform(3, 6), 0.3), (rng.uniform(-28, 22), rng.uniform(-4, 3), 6.0 if k % 2 else 5.2),
                      RUST[k % 4], rot=(0, 0, rng.uniform(-0.3, 0.3)))
            m.box((18, 3, 0.32), (-14, -4.5, 5.8), STRIPE, rot=(0.35, 0, 0.06))
            pts = [(-37, math.cos(a) * 2.5, -1.5 + (math.sin(a) + 1) * 2.0) for a in [k * math.tau / 8 for k in range(8)]]
            pts += [(-30, math.cos(a) * 7.5, -2.5 + (math.sin(a) + 1) * 4.5) for a in [k * math.tau / 10 for k in range(10)]]
            faces_up(m, hull(m, pts, PAINT[1]), PAINT[0], RUST[1], dot=0.8)
            for k in range(6):                                             # the ribs at the break
                x = -2.5 + k * 1.0
                pts = [Vector((x, math.cos(a) * 7.2, -1 + math.sin(a) * 6.5)) for a in [math.pi * j / 8 for j in range(9)]]
                tube(m, pts, [0.3] * 9, RUST[3], segs=4)
            for k in range(7):                                             # dead windows, one or two lit
                lit = k in (2, 5)
                m.box((2.0, 0.3, 0.9), (-26 + k * 3.4, 6.8, 3.0), WINDOW if lit else DARK, rot=(-0.7, 0, 0.06), glow=lit)
            m.box((7, 6, 2.0), (16, -1, 6.0), PAINT[1], rot=(0, 0, -0.2))
            m.plank_line((16, -1, 7), (17.5, -0.5, 8.3), 0.3, 0.3, RUST[3])
        else:
            m.box((16, 14, 6.5), (6, 0, 2.0), RUST[1])
            m.box((16.4, 14.4, 0.4), (6, 0, 5.4), PAINT[1])
            m.box((5, 14.6, 0.5), (1, 0, 5.5), STRIPE)
            m.box((6, 6, 1.2), (8, 2, 5.6), DARK)                          # split open, lit inside
            m.box((3, 2, 0.3), (8.5, 2.5, 5.8), "#4af0c0", glow=True)
            for k, y in enumerate((-4.8, 0, 4.8)):
                m.cyl(3.0, 13, (-2, y, 2.4), RUST[k % 3], segs=8, r_top=1.4, rot=(0, -math.pi / 2, 0))
                m.cyl(2.5, 11.5, (-2.6, y, 2.4), DARK, segs=8, r_top=1.0, rot=(0, -math.pi / 2, 0))
                m.cyl(3.2, 0.8, (-2.0, y, 2.4), RUST[3], segs=8, rot=(0, -math.pi / 2, 0))
            for k in range(5):                                             # radiator fins on its back, fallen flat
                m.box((2.4, 10, 0.4), (16 + k * 3.0, rng.uniform(-1, 1), 0.8 + k * 0.05), RUST[k % 3], rot=(0.1, 0, rng.uniform(-0.1, 0.1)))
            for k in range(6):
                lump(m, rng, (rng.uniform(-10, 28), rng.uniform(-9, 9), 0.1), (1.4, 1.2, 0.8), RUST[k % 4], n=8, flat=0.5)
        squash(m, 0.85)
        m.build(r, rot_z=0)


def cargo_pod(variants):
    """Cargo and sleeper pods thrown from the arks, half sunk in the marsh."""
    for i in range(3):
        r = root("halcyon_cargo_pod", i, height=2.4)
        rng = random.Random(7400 + i)
        m = Model(f"halcyon_cargo_pod_{i}", 7400 + i)
        n = (1, 2, 3)[i]
        for k in range(n):
            yaw = rng.uniform(0, math.tau)
            x, y = (k - (n - 1) / 2) * 2.4, rng.uniform(-0.8, 0.8)
            L = rng.uniform(3.2, 4.2)
            c, s = math.cos(yaw), math.sin(yaw)
            m.cyl(1.0, L, (x - c * L / 2, y - s * L / 2, 0.5), (PAINT[0], RUST[0], PAINT[1])[k % 3], segs=8,
                  rot=(0, math.pi / 2, yaw), r_top=0.95)
            m.ball(1.0, (x + c * L / 2, y + s * L / 2, 0.5), (RUST[2], PAINT[0])[k % 2], subdiv=1, scale=(0.6, 1, 1), rot=(0, 0, yaw))
            m.box((1.0, 0.8, 0.3), (x, y, 1.55), "#6af4ff" if rng.random() < 0.4 else DARK, rot=(0, 0, yaw), glow=rng.random() < 0.4)
            m.box((0.5, 2.1, 2.1), (x + c * L * 0.25, y + s * L * 0.25, 0.5), STRIPE, rot=(0, 0, yaw))
        m.build(r)


def hull_plate(variants):
    """Bent sheets of hull plating sticking up out of the marsh, a rib still bolted to one."""
    for i in range(2):
        r = root("halcyon_hull_plate", i, height=3.5)
        rng = random.Random(7500 + i)
        m = Model(f"halcyon_hull_plate_{i}", 7500 + i)
        for k in range(2 + i):
            yaw = rng.uniform(0, math.tau)
            m.box((rng.uniform(2.6, 4.2), 0.25, rng.uniform(2.0, 3.4)), (rng.uniform(-1.5, 1.5), rng.uniform(-1, 1), 1.0),
                  (PAINT[0], RUST[0], RUST[2])[k % 3], rot=(rng.uniform(0.4, 0.9), 0, yaw))
        pts = [Vector((-1.5, 0.5, -0.3)), Vector((-0.5, 0.8, 2.0)), Vector((1.0, 1.0, 3.2))]
        tube(m, pts, [0.25] * 3, RUST[3], segs=4)
        m.build(r)


# --- the stormwall ----------------------------------------------------------------------------

def _rod_tip(m, x, y, z, h=3.0):
    """A lightning rod's tip: a mast with a ring of spikes and a glowing ball, always lit."""
    m.plank_line((x, y, z), (x, y, z + h), 0.3, 0.3, IRON)
    for k in range(4):
        a = k * math.tau / 4
        m.plank_line((x, y, z + h * 0.7), (x + math.cos(a) * 1.0, y + math.sin(a) * 1.0, z + h * 1.05), 0.1, 0.1, IRON)
    m.ball(0.55, (x, y, z + h + 0.2), STORM_ROD, subdiv=1, glow=True)
    m.ball(0.3, (x, y, z + h + 0.75), STORM_HOT, subdiv=0, glow=True)


def storm_pylons(variants):
    """Span: v0 two lightning pylons, one either side, carrying heavy cables strung with
    insulators and warning lamps; v1 a span of the old storm-breaker, a concrete arch with a broken
    pier in the middle and rods all along its back."""
    for i in range(2):
        r = root("halcyon_storm_pylons", i)
        rng = random.Random(8000 + i)
        m = Model(f"halcyon_storm_pylons_{i}", 8000 + i)
        if i == 0:
            for s in (-1, 1):
                x = s * 43
                lattice(m, x, 0, -3, 22, 4.0, "#4a4e56", "#3a3e46", steps=9)
                m.box((3.0, 12, 0.6), (x, 0, 20.0), "#4a4e56")                    # the cross arm
                for y in (-5, 0, 5):
                    m.cyl(0.35, 1.4, (x, y, 18.6), "#c8d0d8", segs=6, r_top=0.25)  # insulators
                _rod_tip(m, x, 0, 22, h=3.5)
                m.box((5, 5, 1.5), (x, 0, -1.5), STORM_CONCRETE[0])
                collider(r, x, 0, 2.8)
            for y in (-5, 0, 5):
                pts = cable(m, (-43, y, 18.5), (43, y, 18.5), 4.0, r=0.3, n=16)
                for k in range(2, 15, 2):                                  # marker balls, red and white
                    m.ball(0.85, tuple(pts[k]), ("#d83a2a", "#e8e8e0")[(k // 2) % 2], subdiv=1)
            # a maintenance trolley run out along the middle cable, its lamp lit
            p = pts[5] + Vector((0, -5, 0))
            m.box((2.4, 1.6, 1.4), tuple(p + Vector((0, 0, -0.8))), "#c87a2a")
            m.box((2.5, 1.7, 0.25), tuple(p + Vector((0, 0, 0.0))), "#5a5e66")
            m.ball(0.35, tuple(p + Vector((1.3, 0, -0.8))), WINDOW, subdiv=1, glow=True)
        else:
            def zc(x):
                return 17.5 + 1.0 * math.cos(x / 44 * math.pi)
            for x in range(-44, 45, 4):                                    # the deck: blocks with a ragged parapet
                if abs(x - 14) < 3:
                    continue                                               # a span fallen out of it
                top = zc(x)
                fs = m.box((4.1, 6.0, 2.6), (x, 0, top - 1.3), STORM_CONCRETE[(x // 4) % 3])
                fs2 = m.box((3.8, 0.9, rng.uniform(0.6, 1.4)), (x, rng.choice((-2.6, 2.6)), top + 0.4), STORM_CONCRETE[2])
                faces_up(m, list(fs) + list(fs2), STORM_TOP, None, dot=0.8)
                if (x + 44) % 12 == 0:
                    _rod_tip(m, x, 0, top, h=2.4)
                if rng.random() < 0.3:
                    m.box((0.2, 0.2, 2.0), (x + 1.5, 3.1, top - 2.5), REBAR, rot=(0.4, 0, 0))
            for x in (-43, -5, 43):                                        # piers, one in the middle
                w = 5.0 if abs(x) > 40 else 4.0
                top = zc(x) - 2.6
                fs = m.box((w, w + 1, top + 3), (x, 0, (top - 3) / 2), STORM_CONCRETE[1], taper=0.85)
                faces_up(m, fs, STORM_TOP, None)
                collider(r, x, 0, w * 0.6)
            for x in (13, 15):                                             # rebar hanging at the gap
                for k in range(3):
                    m.plank_line((x + (x - 14) * 0.3, -2 + k * 2, zc(x) - 1.5), (x + (x - 14) * 0.9, -2 + k * 2, zc(x) - 3.2), 0.15, 0.15, REBAR)
        m.build(r)


def storm_towers(variants):
    """Gate: the broken towers of the old storm-breaker, rods on their heads still drawing
    lightning, cables strung between them."""
    shapes = [
        [(-17.5, 0.4, 24, 3.0), (-5.5, -0.5, 17, 2.6), (6.5, 0.5, 27, 3.2), (18.5, -0.3, 15.5, 2.4)],
        [(-14, -0.3, 22, 3.4), (0, 0.5, 26, 3.4), (14, -0.4, 17, 2.8)],
    ]
    for i, towers in enumerate(shapes):
        r = root("halcyon_storm_towers", i)
        rng = random.Random(8100 + i)
        m = Model(f"halcyon_storm_towers_{i}", 8100 + i)
        heads = []
        for k, (x, y, H, R) in enumerate(towers):
            fs = m.cyl(R, H + 3, (x, y, -3), STORM_CONCRETE[k % 3], segs=8, r_top=R * 0.85)
            for j in range(int(H / 4)):                                    # bands and window slits
                m.cyl(R * 1.04, 0.5, (x, y, 2 + j * 4), STORM_CONCRETE[2] if j % 2 else "#b8702a", segs=8)
                m.box((0.5, 0.3, 1.2), (x, y - R * 0.95, 3.5 + j * 4), WINDOW if j % 3 == 1 else DARK, glow=j % 3 == 1)
            broken = k % 2 == 1
            if broken:                                                     # snapped off, rebar sticking out of it
                for j in range(6):
                    a = j * math.tau / 6
                    m.plank_line((x + math.cos(a) * R * 0.7, y + math.sin(a) * R * 0.7, H - 0.2),
                                 (x + math.cos(a) * R * 0.9, y + math.sin(a) * R * 0.9, H + rng.uniform(0.8, 2.0)), 0.15, 0.15, REBAR)
                m.cyl(R * 0.86, 0.3, (x, y, H), STORM_TOP, segs=8)
            else:
                m.cyl(R * 1.15, 0.8, (x, y, H), STORM_CONCRETE[0], segs=8)
                m.cyl(R * 0.9, 0.2, (x, y, H + 0.8), STORM_TOP, segs=8)
                _rod_tip(m, x, y, H + 0.8, h=3.0)
            collider(r, x, y, R)
            heads.append(Vector((x, y, H - 1.5)))
            for j in range(3):
                lump(m, rng, (x + rng.uniform(-R * 2, R * 2), y + rng.uniform(-R * 2, R * 2), 0.2), (1.3, 1.1, 0.8), STORM_CONCRETE[j], n=8, flat=0.5)
        for a, b in zip(heads, heads[1:]):
            za = min(a.z, b.z) - 1.0
            pts = cable(m, (a.x, a.y, za), (b.x, b.y, za), 1.6, r=0.15, n=8)
            m.ball(0.35, tuple(pts[4] + Vector((0, 0, -0.35))), "#ff3a3a", subdiv=1, glow=True)
        m.build(r)


def capsized_hulk(variants):
    """Giant: v0 a ship turned turtle in the storm, keel to the sky, barnacled and weeded, its
    screw still on; v1 a storm tower fallen full length into the sea, broken in three."""
    for i in range(2):
        r = root("halcyon_capsized_hulk", i)
        rng = random.Random(8200 + i)
        m = Model(f"halcyon_capsized_hulk_{i}", 8200 + i)
        if i == 0:
            L, W = 46.0, 13.0
            pts = []
            for k in range(9):
                x = -L / 2 + L * k / 8
                t = 1 - (2 * k / 8 - 1) ** 2
                w = W / 2 * (0.35 + 0.65 * t ** 0.5)
                for a in [j * math.pi / 6 for j in range(7)]:
                    pts.append((x, math.cos(a) * w, -1.5 + math.sin(a) * (5.5 * (0.5 + 0.5 * t ** 0.4))))
            fs = hull(m, pts, RUST[1])
            for f in fs:
                f.normal_update()
            # its bottom to the sky: red antifouling, scabbed with rust; black topsides at the waterline
            recolor(m, fs, lambda f: ("#9a3a2a" if f.calc_center_median().y * 0.3 + f.calc_center_median().x * 0.1 % 1 > 0 else "#8a3424")
                    if f.calc_center_median().z > 0.8 else "#2a2a30")
            m.box((L * 0.9, 0.8, 1.2), (0, 0, 4.4), RUST[3])                   # the keel
            for sd in (-1, 1):                                             # bilge keels
                m.box((L * 0.5, 0.4, 0.5), (0, sd * 3.6, 3.3), RUST[3], rot=(sd * 0.5, 0, 0))
            for k in range(7):                                             # rust streaks and scabs
                m.box((rng.uniform(2, 5), rng.uniform(1.2, 2.4), 0.2), (rng.uniform(-L / 2 + 5, L / 2 - 5), rng.uniform(-3, 3), 4.0 - 0.2 * k % 2),
                      RUST[k % 4], rot=(0, 0, rng.uniform(-0.3, 0.3)))
            for sd in (-1, 1):                                             # foam where the sea breaks on it
                for k in range(6):
                    x = -L / 2 + 4 + k * (L - 8) / 5
                    m.box((rng.uniform(4, 7), 0.9, 0.2), (x, sd * (W / 2 * 0.92), 0.25), "#c8d4dc", rot=(0, 0, rng.uniform(-0.15, 0.15)))
            for k in range(30):                                            # barnacles and weed
                x = rng.uniform(-L / 2 + 4, L / 2 - 4)
                y = rng.uniform(-W / 2 + 1, W / 2 - 1)
                m.ball(rng.uniform(0.35, 0.8), (x, y, 3.4 - abs(y) * 0.35), (BARNACLE + SEAWEED)[k % 6], subdiv=0, scale=(1.4, 1.2, 0.5))
            for k in range(4):                                             # the screw and its rudder
                a = k * math.tau / 4 + 0.4
                m.box((0.4, 2.4, 0.9), (L / 2 + 1.2, math.cos(a) * 1.3, 1.8 + math.sin(a) * 1.3), "#a88a4a", rot=(a, 0, 0))
            m.cyl(0.5, 2.0, (L / 2 - 1, 0, 1.8), IRON, segs=6, rot=(0, math.pi / 2, 0))
            m.box((3.0, 0.4, 3.0), (L / 2 + 3, 0, 2.4), RUST[2])
            for k in range(6):                                             # flotsam round it
                m.box((rng.uniform(1, 2.5), rng.uniform(0.6, 1.5), 0.3), (rng.uniform(-L / 2, L / 2), rng.choice((-1, 1)) * rng.uniform(8, 12), 0.1),
                      DECK[k % 3], rot=(0, 0, rng.uniform(0, 3)))
        else:
            R = 3.2
            for k in range(3):
                x0 = -30 + k * 20
                yaw = rng.uniform(-0.12, 0.12)
                m.cyl(R, 18, (x0, k * 1.2, 0.4), STORM_CONCRETE[k], segs=8, rot=(0, math.pi / 2, yaw))
                for j in range(4):
                    m.cyl(R * 1.05, 0.5, (x0 + 2 + j * 4.5, k * 1.2 + yaw * (2 + j * 4.5), 0.4), STORM_CONCRETE[2], segs=8, rot=(0, math.pi / 2, yaw))
                for j in range(5):
                    m.plank_line((x0 + 18, k * 1.2 + rng.uniform(-2, 2), 0.4 + rng.uniform(-1, 2)), (x0 + 19.5, k * 1.2 + rng.uniform(-2, 2), rng.uniform(0, 3)), 0.15, 0.15, REBAR)
            m.cyl(R * 1.2, 1.0, (30, 2.4, 0.4), STORM_CONCRETE[0], segs=8, rot=(0, math.pi / 2, 0))
            _rod_tip(m, 31.5, 2.4, 0.6, h=0.1)
            m.plank_line((31, 2.4, 0.6), (37, 2.4, 1.2), 0.3, 0.3, IRON)
            m.ball(0.55, (37.3, 2.4, 1.3), STORM_ROD, subdiv=1, glow=True)
            for k in range(8):
                lump(m, rng, (rng.uniform(-30, 30), rng.choice((-1, 1)) * rng.uniform(4, 7), 0.3), (1.6, 1.3, 1.0), STORM_CONCRETE[k % 3], n=8, flat=0.5)
        m.build(r)


def lightning_rod(variants):
    """Lightning rods on the rocks: masts with a glowing ball, the ground scorched round them."""
    for i in range(3):
        H = (5.0, 3.6, 6.6)[i]
        r = root("halcyon_lightning_rod", i, height=H + 1.2)
        rng = random.Random(8300 + i)
        m = Model(f"halcyon_lightning_rod_{i}", 8300 + i)
        m.cyl(0.9, 0.6, (0, 0, -0.1), STORM_CONCRETE[0], segs=6, r_top=0.7)
        for a in range(3):
            b = a * math.tau / 3
            m.plank_line((math.cos(b) * 0.6, math.sin(b) * 0.6, 0.4), (math.cos(b) * 2.4, math.sin(b) * 2.4, -0.1), 0.06, 0.06, IRON)
        _rod_tip(m, 0, 0, 0.4, h=H)
        if i == 1:
            m.box((1.4, 1.0, 1.2), (1.1, 0.4, 0.5), "#3a4a5a")
            m.box((0.2, 0.6, 0.3), (1.81, 0.4, 0.7), "#ff3a3a", glow=True)
        fs = m.cyl(2.4, 0.06, (0, 0, -0.02), "#2a2a30", segs=8)
        m.build(r)


def build():
    kelp_arch(2)
    drowned_ark(2)
    lantern_kelp(3)
    gantry(2)
    stilt_towers(2)
    barge(2)
    sampan(3)
    tank_tower(2)
    cargo_pile(2)
    ark_ribs(2)
    ark_fins(2)
    ark_wreck(2)
    cargo_pod(3)
    hull_plate(2)
    storm_pylons(2)
    storm_towers(2)
    capsized_hulk(2)
    lightning_rod(3)
