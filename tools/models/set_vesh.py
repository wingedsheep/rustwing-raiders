"""VESH's set pieces: the reef seen at the scale of the thing that built it. Coral
arches over the flats, a clam the size of a harbour, blue holes in the lagoon, a skull standing on
its own fangs, spines bridging the islands, and sea-cave roofs dripping light.

Spans have their deck's underside at 13+ over the field and their legs out at |x| 38–46; gates
are columns with 6–9 unit gaps; giants lie under 8.5 (water props: z = 0 at the waterline)."""
from __future__ import annotations

import math
import random

from mathutils import Vector
from kit import Model, light
from props_a_lib import hull, lump, tube
from props_b_kit import M, collider, facet, jitter, limb, mark, new_faces, paint, root, sway, xform
from props_b_vesh import MANG, PROPAGULE
from props_b_vesh import (BARNACLE, BIOLUM, BONE, BONE_DARK, C_GOLD, C_MAGENTA, C_ORANGE, C_TEAL, C_VIOLET, LEAF,
                          MANGROVE_BARK, REEF_ROCK, SAND, TIDE_POOL, WEED, _fan)

V = Vector
PEARL = "#fff4f8"
CAVE = ["#4a2a3e", "#6a3a52", "#8a4e66", "#b06a80", "#d8909a"]
ROPE = "#c8a870"
LANTERN = "#ffb84a"


# --- shared pieces -----------------------------------------------------------------------

def strand(m, pts, radii, cols, segs=6, noise=0.12):
    """A thick bent limb (a coral branch, a root, a bone) faceted light to dark."""
    st = mark(m)
    tube(m, [V(p) for p in pts], radii, cols[1], segs=segs)
    facet(m, new_faces(m, st), cols, noise=noise)


def curve(a, b, n, lift=0.0, sag=0.0, wob=(0.0, 0.0), rng=None):
    """Points from a to b, bowed up by `lift` (or down by `sag`) in the middle, wobbling a little."""
    a, b = V(a), V(b)
    out = []
    for i in range(n + 1):
        t = i / n
        p = a.lerp(b, t)
        k = 4 * t * (1 - t)
        p.z += (lift - sag) * k
        if rng and 0 < i < n:
            p.x += rng.uniform(-wob[0], wob[0])
            p.y += rng.uniform(-wob[1], wob[1])
        out.append(p)
    return out


def reef_leg(m, r, rng, x, y, top, rad, cols=REEF_ROCK, crust=True):
    """A column of reef rock from the sea floor (-3) to `top`, in uneven layers, crusted at the
    waterline; a collider at flight height."""
    z = -3.0
    n = max(3, int((top + 3) / 3.2))
    h = (top + 3) / n
    for i in range(n):
        r0 = rad * (1.2 - 0.35 * i / n) * rng.uniform(0.92, 1.08)
        r1 = rad * (1.2 - 0.35 * (i + 1) / n) * rng.uniform(0.9, 1.05)
        st = mark(m)
        m.cyl(r0, h + 0.25, (x + rng.uniform(-0.3, 0.3), y + rng.uniform(-0.3, 0.3), z), cols[1], segs=7, r_top=r1,
              rot=(0, 0, rng.uniform(0, 1)))
        jitter(m, new_faces(m, st), 0.2 * rad / 3)
        facet(m, new_faces(m, st), cols if i % 2 else cols[1:], noise=0.12)
        z += h
    if crust:
        for k in range(10):
            a = rng.uniform(0, math.tau)
            d = rad * 1.25 * rng.uniform(0.95, 1.1)
            m.ball(rng.uniform(0.45, 0.8), (x + math.cos(a) * d, y + math.sin(a) * d, rng.uniform(-0.3, 1.0)),
                   rng.choice((BARNACLE, "#ff7a90", WEED[0], WEED[1], C_ORANGE[2])), subdiv=0)
    if r is not None:
        collider(r, round(x, 2), round(y, 2), round(rad * 1.05, 2))


def polyp(m, p, s=0.45, col=BIOLUM):
    m.ball(s, tuple(p), col, subdiv=0, glow=True)


def staghorn(m, rng, base, d, L, rad, depth, cols, tip=BIOLUM, up=0.35):
    """Branching antler coral from `base` along `d`; glowing tips."""
    b = V(base) + V(d) * L
    limb(m, base, b, rad, rad * 0.75, cols[2], segs=5)
    if depth == 0:
        polyp(m, b, rad * 1.3, tip)
        return
    for k in range(2):
        yaw = rng.uniform(0, math.tau)
        nd = (V(d) + V((math.cos(yaw), math.sin(yaw), 0)) * rng.uniform(0.5, 0.9))
        nd.z = max(nd.z, up)
        staghorn(m, rng, b, nd.normalized(), L * 0.72, rad * 0.72, depth - 1, cols, tip, up)


def fan(m, rng, base, yaw, tilt, w, h, cols, s=1.0):
    """props_b_vesh's sea fan, scaled."""
    st = mark(m)
    _fan(m, rng, (0, 0, 0), yaw, tilt, w, h, cols)
    xform(m, st, M(base, scale=(s, s, s)))


def tube_sponges(m, rng, at, n, cols, inner, spread, hr, rad=(0.5, 0.8)):
    x0, y0, z0 = at
    for k in range(n):
        a = k / n * math.tau + rng.uniform(-0.3, 0.3)
        d = spread * (rng.uniform(0.3, 1.0) if k else 0)
        rr = rng.uniform(*rad)
        h = rng.uniform(*hr)
        st = mark(m)
        m.cyl(rr, h, (0, 0, -0.2), cols[1], segs=7, r_top=rr * 1.3)
        facet(m, new_faces(m, st), cols, noise=0.1, bias=-0.3)
        m.cyl(rr * 1.35, 0.2, (0, 0, h - 0.2), cols[3], segs=7)
        m.cyl(rr * 1.0, 0.1, (0, 0, h - 0.04), inner, segs=7, glow=True)
        xform(m, st, M((x0 + math.cos(a) * d, y0 + math.sin(a) * d, z0), (rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), 0)))


def crust(m, rng, pts, n, cols, size=(0.3, 0.6)):
    """Barnacles, polyps and weed scattered over points."""
    for _ in range(n):
        p = V(rng.choice(pts))
        m.ball(rng.uniform(*size), tuple(p + V((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.3, 0.5)))),
               rng.choice(cols), subdiv=0)


# --- the Coral Flats ---------------------------------------------------------------------

def coral_arch(v):
    """SPAN: v0, two braided branches of coral, orange and violet, arching across the flats from
    reef-rock feet, staghorn on top and glowing polyps dripping under. v1, a shelf of violet plate
    coral on three feet (one in the field, to slip past), brain domes on its back."""
    r = root("vesh_coral_arch", v)
    rng = random.Random(9000 + v)
    m = Model(f"vesh_coral_arch_{v}", 9000 + v)
    if v == 0:
        for s in (-1, 1):
            reef_leg(m, r, rng, s * 41, rng.uniform(-1, 1), 15.5, 3.2)
        a = curve((-41, -1.5, 15.0), (41, 1.5, 15.0), 14, lift=4.2, wob=(0.4, 1.2), rng=rng)
        ra = [3.0, 2.4, 2.2, 2.0, 1.9, 1.9, 1.8, 1.8, 1.9, 1.9, 2.0, 2.2, 2.4, 2.8, 3.0]
        strand(m, a, ra, C_ORANGE, segs=7)
        # brain domes and knots of coral grown over the branch
        for i in range(1, 14, 2):
            p = a[i]
            st = mark(m)
            cols = (C_GOLD, C_MAGENTA, C_ORANGE)[i % 3]
            m.ball(rng.uniform(1.8, 2.6), tuple(p + V((rng.uniform(-1, 1), rng.uniform(-0.8, 0.8), ra[i] * 0.6))), cols[1],
                   subdiv=1, scale=(1.2, 1.0, 0.6), jitter=0.15)
            facet(m, new_faces(m, st), cols[:3], noise=0.15)
        b = curve((-40, 3.5, 14.8), (40, -3.5, 14.8), 12, lift=2.6, wob=(0.4, 1.6), rng=rng)
        for p in b:
            p.y += 3.2 * math.sin(p.x / 40 * math.pi) * -1
        strand(m, b, [2.2] + [1.5] * 11 + [2.2], C_VIOLET, segs=6)
        # staghorn thickets up off both strands, glowing at the tips
        for i in range(2, 13, 2):
            p = a[i]
            for k in range(2):
                yaw = rng.uniform(0, math.tau)
                staghorn(m, rng, p + V((0, 0, 1.0)), V((math.cos(yaw) * 0.6, math.sin(yaw) * 0.6, 1)).normalized(),
                         2.6, 0.55, 2, C_ORANGE if k else C_GOLD, tip=BIOLUM)
        for i in range(2, 11, 3):
            p = b[i]
            fan(m, rng, tuple(p + V((0, 0, 0.8))), rng.uniform(0, math.tau), rng.uniform(0.4, 0.7), 1.8, 2.6, C_MAGENTA, 1.6)
        # under the deck: drips of coral with glowing polyps (all above 13)
        for strand_pts, rad in ((a, 1.9), (b, 1.5)):
            for i in range(1, len(strand_pts) - 1):
                p = strand_pts[i]
                if p.z - rad - 1.5 < 13.2 or rng.random() < 0.35:
                    continue
                low = max(13.4, p.z - rad - rng.uniform(1.0, 2.4))
                limb(m, p - V((0, 0, rad * 0.6)), (p.x + rng.uniform(-0.4, 0.4), p.y, low), 0.45, 0.2, C_VIOLET[1], segs=5)
                polyp(m, (p.x, p.y, low - 0.1), 0.42)
        light(r, (0, 0, 17), BIOLUM, radius=14, intensity=0.6, halo=False)
    else:
        legs = [(-42, 0, 3.4), (40, 1, 3.4), (7, -1, 2.6)]
        for x, y, rad in legs:
            reef_leg(m, r, rng, x, y, 15.0, rad, cols=[C_VIOLET[0], C_VIOLET[1], REEF_ROCK[2], REEF_ROCK[3]])
        # plate coral: overlapping tiers of flat lobed shelves, a few gaps between them
        x = -46.0
        while x < 46:
            w = rng.uniform(9, 14)
            if rng.random() < 0.18 and -30 < x < 30:
                x += rng.uniform(2.5, 4)                # a gap to see down through
                continue
            cx, cy = x + w / 2, rng.uniform(-1.5, 1.5)
            z = 15.0 + rng.uniform(0, 1.4)
            # two or three lobed tiers, each smaller and higher, like a stack of fungus brackets
            for tier in range(rng.choice((2, 2, 3))):
                s = 1 - 0.3 * tier
                tz = z + tier * 0.9
                tx, ty = cx + rng.uniform(-1.5, 1.5) * tier, cy + rng.uniform(-1.5, 1.5) * tier
                pts = []
                n = 13
                for k in range(n):
                    a = k / n * math.tau
                    rr = (0.75 + 0.3 * abs(math.sin(a * 2.5 + cx))) * rng.uniform(0.85, 1.05)
                    pts.append((tx + math.cos(a) * w * 0.58 * rr * s, ty + math.sin(a) * 5.6 * rr * s))
                top = [(tx + (px - tx) * 0.9, ty + (py - ty) * 0.9) for px, py in pts]
                st = mark(m)
                m.slab(pts, tz - 0.9, tz, C_VIOLET[1], top=top)
                jitter(m, new_faces(m, st), 0.25)
                tones = [C_VIOLET[1], C_VIOLET[2], "#a860c0", C_VIOLET[3]] if tier % 2 == 0 else ["#8a2e6a", C_MAGENTA[1], C_MAGENTA[2], C_MAGENTA[3]]
                facet(m, new_faces(m, st), tones, noise=0.25)
                for f in new_faces(m, st):
                    if f.normal.z < -0.5:
                        f.material_index = m._slot(C_VIOLET[0], False)
                # growth rings on its back, and the rim glowing where the plate thins
                for k in range(0, n, 3):
                    px, py = pts[k]
                    polyp(m, (px, py, tz - 0.35), 0.38, "#ff9aff" if k % 2 else BIOLUM)
                for k in range(n):
                    px, py = top[k]
                    qx, qy = top[(k + 1) % n]
                    if k % 2 == 0:
                        limb(m, (tx + (px - tx) * 0.6, ty + (py - ty) * 0.6, tz + 0.02), (tx + (qx - tx) * 0.6, ty + (qy - ty) * 0.6, tz + 0.02),
                             0.22, 0.22, tones[3], segs=4)
            # on its back: polyp thickets and tubes
            if rng.random() < 0.5:
                for k in range(2):
                    yaw = rng.uniform(0, math.tau)
                    staghorn(m, rng, (cx + rng.uniform(-3, 3), cy + rng.uniform(-2, 2), z + 0.5),
                             V((math.cos(yaw) * 0.5, math.sin(yaw) * 0.5, 1)).normalized(), 2.0, 0.5, 2, C_ORANGE, tip="#ffe070")
            else:
                tube_sponges(m, rng, (cx + rng.uniform(-2, 2), cy, z + 0.2), 4, C_ORANGE, "#ffe070", 1.6, (1.2, 2.4))
            # under: a hanging fringe
            for k in range(3):
                px = cx + rng.uniform(-w * 0.4, w * 0.4)
                py = cy + rng.uniform(-3, 3)
                low = z - 1.1 - rng.uniform(0.6, 1.6)
                limb(m, (px, py, z - 1.0), (px, py, max(13.3, low)), 0.35, 0.12, C_MAGENTA[1], segs=4)
                polyp(m, (px, py, max(13.3, low)), 0.3, "#ff9aff")
            x += w * rng.uniform(0.7, 0.9)
        light(r, (0, 0, 16), "#ff9aff", radius=14, intensity=0.5, halo=False)
    m.build(r)
    return r


def coral_pinnacles(v):
    """GATE: v0, four pinnacles of layered reef rock crowned with coral, two of them joined high up
    by a staghorn bridge. v1, three giant tube sponges, chimneys glowing at their throats, a web of
    sea fan strung between two of them."""
    r = root("vesh_coral_pinnacles", v)
    rng = random.Random(9020 + v)
    m = Model(f"vesh_coral_pinnacles_{v}", 9020 + v)
    if v == 0:
        cols = [(-19.5, 0.5, 3.0, 21), (-6.5, -1.5, 2.7, 17), (6.5, 1.0, 3.1, 24), (19.5, -0.5, 2.8, 16)]
        for x, y, rad, top in cols:
            reef_leg(m, r, rng, x, y, top, rad, cols=REEF_ROCK + ["#e0b0a0"])
            # crowned with coral
            k = rng.random()
            if k < 0.4:
                for j in range(3):
                    yaw = rng.uniform(0, math.tau)
                    staghorn(m, rng, (x, y, top), V((math.cos(yaw) * 0.6, math.sin(yaw) * 0.6, 1)).normalized(), 2.4, 0.6, 2,
                             C_VIOLET, tip=BIOLUM)
            elif k < 0.7:
                for j in range(3):
                    fan(m, rng, (x, y, top), j * 2.1, rng.uniform(0.5, 0.8), 1.8, 2.6, C_MAGENTA if j % 2 else C_ORANGE, 1.5)
            else:
                tube_sponges(m, rng, (x, y, top), 5, C_GOLD, "#ff6a9a", 1.6, (1.0, 2.6))
            # bands of coral on the column's flanks
            for j in range(5):
                a = rng.uniform(0, math.tau)
                z = rng.uniform(3, top - 2)
                m.ball(rng.uniform(0.8, 1.3), (x + math.cos(a) * rad * 1.05, y + math.sin(a) * rad * 1.05, z),
                       rng.choice((C_ORANGE[2], C_GOLD[2], C_MAGENTA[2], C_TEAL[2])), subdiv=0, scale=(1, 1, 0.6))
        # a staghorn bridge between the two tallest, high over the gap
        a = curve((-19.5, 0.5, 18.5), (6.5, 1.0, 19.5), 6, lift=1.2)
        strand(m, a, [1.1, 0.9, 0.8, 0.8, 0.8, 0.9, 1.1], C_ORANGE)
        for p in a[1:-1]:
            low = 14.5 + rng.uniform(0, 1.5)
            limb(m, p, (p.x, p.y, low), 0.3, 0.12, C_VIOLET[2], segs=4)
            polyp(m, (p.x, p.y, low), 0.35)
        light(r, (0, 0, 18), BIOLUM, radius=12, intensity=0.5, halo=False)
    else:
        spec = [(-15.5, 0, 3.0, 22, C_VIOLET, BIOLUM), (-1.5, 1.5, 2.6, 17, C_ORANGE, "#ffe070"), (13, -1, 3.2, 20, C_GOLD, "#ff6a9a")]
        for x, y, rad, top, cols, inner in spec:
            # a reef boss at the foot
            st = mark(m)
            m.ball(rad * 1.9, (x, y, -1.5), REEF_ROCK[1], subdiv=1, scale=(1, 1, 0.6), jitter=0.3)
            facet(m, new_faces(m, st), REEF_ROCK, noise=0.1)
            st = mark(m)
            m.cyl(rad, top + 2, (0, 0, -2), cols[1], segs=8, r_top=rad * 1.3)
            jitter(m, new_faces(m, st), 0.15)
            facet(m, new_faces(m, st), cols, noise=0.1, bias=-0.2)
            # a couple of ragged growth rings, and knobs budding off the wall
            for z in (top * 0.35, top * 0.7):
                k = z / (top + 2)
                m.cyl(rad * (1 + 0.3 * k) + 0.3, 0.7, (0, 0, z - 2), cols[0], segs=8, r_top=rad * (1 + 0.3 * k) + 0.05)
            for j in range(6):
                a = rng.uniform(0, math.tau)
                z = rng.uniform(1, top - 2)
                k = z / (top + 2)
                m.ball(rng.uniform(0.6, 1.0), (math.cos(a) * rad * (1 + 0.3 * k), math.sin(a) * rad * (1 + 0.3 * k), z - 2), cols[2],
                       subdiv=0)
            m.cyl(rad * 1.3 + 0.35, 0.6, (0, 0, top - 0.4), cols[3], segs=8)
            m.cyl(rad * 1.15, 0.2, (0, 0, top + 0.05), inner, segs=8, glow=True)
            xform(m, st, M((x, y, 0), (rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), 0)))
            # small tubes budding off the base
            tube_sponges(m, rng, (x, y, 0), 4, cols, inner, rad * 1.6, (2, 5), rad=(0.6, 1.0))
            collider(r, x, y, round(rad * 1.25, 2))
            light(r, (x, y, top + 1), inner, radius=6, intensity=0.6, halo=False)
        # a sea fan strung between the first two, over the gap
        st = mark(m)
        pts = [(-15, 15.0), (-1.5, 14.6), (-1.5, 16.5), (-5, 19), (-10, 19.5), (-15, 18)]
        m.prism([(x, z) for x, z in pts], 0.3, (0, 0.8, 0), C_MAGENTA[1])
        paint(m, new_faces(m, st), lambda f: C_MAGENTA[2] if abs(f.normal.y) > 0.7 else C_MAGENTA[0])
        for i in range(6):
            t = i / 5
            limb(m, (-14 + t * 12.5, 0.8, 15.0 - t * 0.4), (-12 + t * 8, 0.8, 19.2), 0.15, 0.1, C_MAGENTA[3], segs=4)
    m.build(r)
    return r


def giant_clam(v):
    """GIANT: a clam as wide as a harbour, gaping open on the flats: two fluted valves, the mantle's
    lips glowing turquoise and the pearl in the middle."""
    r = root("vesh_giant_clam", v)
    rng = random.Random(9040 + v)
    m = Model(f"vesh_giant_clam_{v}", 9040 + v)
    R = 15.0 if v == 0 else 12.5
    shell = ([C_VIOLET[0], C_VIOLET[1], "#b070c0", "#e0b0e8"] if v == 0
             else ["#8a5a3a", "#c08a5a", "#e8c090", "#fff0d0"])
    lip = BIOLUM if v == 0 else "#ff6ab0"
    open_a = 0.95 if v == 0 else 0.45                  # v1 barely gapes: the upper valve is a dome
    for side in (-1, 1):
        # a valve: a half-dish of radial flutes; the hinge on the x axis
        st = mark(m)
        n = 9
        for i in range(n):
            a0 = math.pi * i / n
            a1 = math.pi * (i + 1) / n
            am = (a0 + a1) / 2
            rr = R * (0.92 + 0.08 * math.sin(am * 3))
            # each flute: a wedge, ridged high in its middle
            pts = [(0, 0, 0.6), (math.cos(a0) * rr, math.sin(a0) * rr, 0.0), (math.cos(am) * rr * 1.06, math.sin(am) * rr * 1.06, 1.6),
                   (math.cos(a1) * rr, math.sin(a1) * rr, 0.0), (math.cos(am) * rr * 0.5, math.sin(am) * rr * 0.5, 2.6),
                   (math.cos(am) * rr * 0.98, math.sin(am) * rr * 0.98, -0.8), (0, 0, -0.4)]
            hull(m, [V(p) for p in pts], shell[1])
        facet(m, new_faces(m, st), shell, noise=0.08)
        # growth bands across the flutes
        for k, f in enumerate((0.45, 0.7, 0.9)):
            for i in range(10):
                a = math.pi * (i + 0.5) / 10
                m.box((0.5, R * f * 0.33, 0.4), (math.cos(a) * R * f, math.sin(a) * R * f, 1.6 + 0.9 * (1 - f)), shell[3 - k % 2],
                      rot=(0, 0, a + math.pi / 2))
        if side > 0:
            xform(m, st, M((0, 0.8, 0.4), (-(math.pi - open_a) if v == 1 else -open_a * 0.15, 0, 0)))
        else:
            xform(m, st, M((0, -0.8, 0.4), (open_a * 0.15, 0, math.pi)))
    # the soft insides and the mantle's glowing lips along the gape
    st = mark(m)
    for i in range(12):
        x = -R * 0.85 + i * R * 1.7 / 11
        w = math.sqrt(max(0.0, 1 - (x / R) ** 2))
        m.ball(2.0 * w + 0.6, (x, 0, 1.6), "#e08aa0", subdiv=1, scale=(1.0, 0.9, 0.5), jitter=0.15)
    facet(m, new_faces(m, st), ["#a04a6a", "#d0708a", "#f0a0b0"], noise=0.15)
    for s in (-1, 1):
        for i in range(14):
            x = -R * 0.9 + i * R * 1.8 / 13
            w = math.sqrt(max(0.0, 1 - (x / R) ** 2))
            m.ball(0.55 + 0.35 * w, (x, s * (1.6 + 1.6 * w), 2.4), lip, subdiv=0, glow=True, scale=(1.3, 0.7, 0.6))
    if v == 0:
        m.ball(2.4, (1.5, 0, 3.4), PEARL, subdiv=2)
        m.ball(1.0, (0.8, -0.5, 4.5), "#ffffff", subdiv=1, glow=True)
        light(r, (1.5, 0, 6), BIOLUM, radius=18, intensity=1.0)
    else:
        light(r, (0, 0, 5), lip, radius=14, intensity=0.8, halo=False)
    # it sits in a bed of smaller coral and sand
    st = mark(m)
    m.cyl(R * 1.05, 0.6, (0, 0, -0.5), SAND[0], segs=12, r_top=R * 0.95)
    jitter(m, new_faces(m, st), 0.4)
    xform(m, st, M(scale=(1.05, 0.9, 1)))
    facet(m, new_faces(m, st), [REEF_ROCK[2], SAND[0], SAND[1]], noise=0.1)
    ring_pts = [V((math.cos(a) * R * 1.02, math.sin(a) * R * 0.88, 0)) for a in [k / 24 * math.tau for k in range(24)]]
    crust(m, rng, ring_pts, 26, (BARNACLE, "#ff7a90", WEED[1], C_GOLD[2], C_ORANGE[2]), size=(0.5, 1.0))
    m.build(r)
    return r


def starfish(v):
    """GIANT: a starfish forty units across, sunning itself on the reef: knobbly orange arms, a
    violet centre, its tube feet glowing where an arm curls up."""
    r = root("vesh_starfish", v)
    rng = random.Random(9060 + v)
    m = Model(f"vesh_starfish_{v}", 9060 + v)
    arms = 5 if v == 0 else 7
    L = 19.0 if v == 0 else 16.0
    cols = C_ORANGE if v == 0 else ["#6a1e2a", "#a8304a", "#e05a6a", "#ffa0a0"]
    knob = C_GOLD[3] if v == 0 else "#ffe0e8"
    st = mark(m)
    m.ball(5.0 if v == 0 else 4.4, (0, 0, 0.6), cols[1], subdiv=1, scale=(1, 1, 0.5), jitter=0.2)
    for k in range(arms):
        a = k / arms * math.tau + rng.uniform(-0.15, 0.15)
        curl = rng.uniform(-0.3, 0.3)
        lift = 3.5 if k == 1 else 0.0
        pts, radii = [], []
        for i in range(8):
            t = i / 7
            aa = a + curl * t * t
            d = L * t * rng.uniform(0.95, 1.05)
            pts.append(V((math.cos(aa) * d, math.sin(aa) * d, 1.0 + lift * t ** 3)))
            radii.append(3.2 * (1 - t) + 0.5)
        tube(m, pts, radii, cols[1], segs=6)
        xform_pts = pts
        for i in range(1, 7):
            p = xform_pts[i]
            rr = radii[i]
            m.ball(rr * 0.35, tuple(p + V((0, 0, rr * 0.65))), knob, subdiv=0)
            for s in (-1, 1):
                q = V((-math.sin(a), math.cos(a), 0)) * rr * 0.6 * s
                m.ball(rr * 0.22, tuple(p + q + V((0, 0, rr * 0.45))), cols[3], subdiv=0)
        if lift:
            for i in range(4, 8):
                p = xform_pts[i]
                m.ball(0.5, tuple(p - V((0, 0, radii[i] * 0.7))), BIOLUM, subdiv=0, glow=True)
    facet(m, {f for f in new_faces(m, st) if f.material_index == m._slot(cols[1], False)}, cols[:3], noise=0.12)
    m.ball(2.2, (0, 0, 3.0), C_VIOLET[2], subdiv=1, scale=(1, 1, 0.4))
    m.ball(0.8, (0, 0, 3.8), "#ff9aff", subdiv=0, glow=True)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def anemone(v):
    """Scenery: a bed of fat anemones, tentacles tipped with light."""
    r = root("vesh_anemone", v)
    rng = random.Random(9100 + v)
    m = Model(f"vesh_anemone_{v}", 9100 + v)
    spec = {0: [((0, 0), 1.0, C_MAGENTA, BIOLUM)],
            1: [((-0.9, 0), 0.8, C_TEAL, "#ffe070"), ((1.0, 0.4), 0.7, C_TEAL, "#ffe070"), ((0, -1.1), 0.6, C_ORANGE, BIOLUM)],
            2: [((0, 0), 1.3, C_VIOLET, "#ff9aff")]}[v]
    for (x, y), s, cols, tip in spec:
        st = mark(m)
        m.cyl(0.8 * s, 0.9 * s, (x, y, -0.1), cols[0], segs=7, r_top=0.95 * s)
        facet(m, new_faces(m, st), cols[:2], noise=0.1)
        m.cyl(0.6 * s, 0.1, (x, y, 0.8 * s), cols[0], segs=7)
        n = 10
        for k in range(n):
            a = k / n * math.tau + rng.uniform(-0.1, 0.1)
            out = V((math.cos(a), math.sin(a), 0))
            b = V((x, y, 0.8 * s)) + out * 0.6 * s
            c = b + out * 0.9 * s + V((0, 0, 0.7 * s))
            d = c + out * 0.5 * s + V((0, 0, -0.1 * s))
            tube(m, [b, c, d], [0.2 * s, 0.17 * s, 0.1 * s], cols[2], segs=4)
            m.ball(0.17 * s, tuple(d), tip, subdiv=0, glow=True)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    light(r, (0, 0, 1.5), spec[0][3], radius=3, intensity=0.4, halo=False)
    return r


def pillar_coral(v):
    """Scenery: pillar coral, a clump of fat golden fingers standing up off the flats (4-6 tall)."""
    r = root("vesh_pillar_coral", v)
    rng = random.Random(9120 + v)
    m = Model(f"vesh_pillar_coral_{v}", 9120 + v)
    cols = (C_GOLD, ["#3a6a5a", "#4a9a80", "#7ac8a8", "#c0f0d0"], C_ORANGE)[v]
    n = (7, 5, 9)[v]
    st = mark(m)
    for k in range(n):
        a = k / n * math.tau + rng.uniform(-0.3, 0.3)
        d = 0 if k == 0 else rng.uniform(0.8, 1.8)
        h = rng.uniform(3.0, 5.6) * (1.1 if k == 0 else 1)
        rad = rng.uniform(0.38, 0.55)
        x, y = math.cos(a) * d, math.sin(a) * d
        tube(m, [V((x, y, -0.2)), V((x * 1.1, y * 1.1, h * 0.5)), V((x * 1.2, y * 1.2, h))], [rad * 1.2, rad, rad * 0.9], cols[1], segs=6)
        m.ball(rad * 0.95, (x * 1.2, y * 1.2, h), cols[3], subdiv=0)
    facet(m, new_faces(m, st), cols[:3], noise=0.15)
    st = mark(m)
    m.ball(2.0, (0, 0, -0.4), REEF_ROCK[1], subdiv=1, scale=(1.1, 1, 0.35), jitter=0.15)
    facet(m, new_faces(m, st), REEF_ROCK[:3], noise=0.1)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


# --- the Bone Archipelago ----------------------------------------------------------------

def bone_crust(m, rng, at, rad, n=10):
    """Weed, barnacles and pink coral where bone meets the sea, and the reef it stands in."""
    x, y = at[0], at[1]
    for k in range(n):
        a = rng.uniform(0, math.tau)
        d = rad * rng.uniform(1.0, 1.5)
        m.ball(rng.uniform(0.4, 0.8), (x + math.cos(a) * d, y + math.sin(a) * d, rng.uniform(-0.4, 0.8)),
               rng.choice((WEED[0], WEED[1], BARNACLE, "#ff7a90", BONE[1])), subdiv=0)
    st = mark(m)
    m.cyl(rad * 1.7, 1.2, (x, y, -1.6), REEF_ROCK[1], segs=8, r_top=rad * 1.2)
    jitter(m, new_faces(m, st), 0.3)
    facet(m, new_faces(m, st), REEF_ROCK, noise=0.1)


def bone(m, pts, radii, segs=7, cols=BONE, noise=0.1):
    strand(m, pts, radii, cols, segs=segs, noise=noise)


def vertebra(m, rng, at, s, axis=0.0, ribs=0.0, crest=1.0, cols=BONE):
    """One vertebra lying along `axis` (yaw): a spool of a centrum, a crest up, wings out, and
    (ribs > 0) ribs hanging that far down and out."""
    x, y, z = at
    st = mark(m)
    m.cyl(1.0 * s, 1.5 * s, (-0.75 * s, 0, 0), cols[2], segs=8, rot=(0, math.pi / 2, 0))
    m.cyl(1.12 * s, 0.25 * s, (-0.85 * s, 0, 0), cols[3], segs=8, rot=(0, math.pi / 2, 0))
    m.cyl(1.12 * s, 0.25 * s, (0.6 * s, 0, 0), cols[3], segs=8, rot=(0, math.pi / 2, 0))
    m.prism([(-0.5 * s, 0.6 * s), (0.5 * s, 0.6 * s), (0.9 * s, (0.6 + 2.4 * crest) * s), (0.1 * s, (0.7 + 2.6 * crest) * s)],
            0.5 * s, (0, 0, 0), cols[2])                                                     # the crest
    for side in (-1, 1):
        m.prism([(-0.4 * s, 0), (0.4 * s, 0), (0.25 * s, 0.4 * s), (-0.3 * s, 0.5 * s)], 0.4 * s, (0, 0, 0), cols[2],
                rot=(0, 0, 0))
        limb(m, (0, side * 0.7 * s, 0.3 * s), (0.2 * s, side * 2.4 * s, 0.6 * s), 0.38 * s, 0.22 * s, cols[2], segs=5)
        m.ball(0.3 * s, (0.2 * s, side * 2.4 * s, 0.6 * s), cols[3], subdiv=0)
        if ribs:
            pts = [V((0.2 * s, side * 2.2 * s, 0.4 * s)), V((0.5 * s, side * (2.2 * s + ribs * 0.55), -ribs * 0.35)),
                   V((0.9 * s, side * (2.2 * s + ribs * 0.75), -ribs * 0.8)), V((1.2 * s, side * (2.2 * s + ribs * 0.7), -ribs))]
            tube(m, pts, [0.4 * s, 0.36 * s, 0.3 * s, 0.12 * s], cols[1], segs=5)
    facet(m, new_faces(m, st), cols, noise=0.1)
    m.cyl(0.5 * s, 0.1, (-0.86 * s, 0, 0), BONE_DARK, segs=6, rot=(0, math.pi / 2, 0))    # the marrow hole
    xform(m, st, M((x, y, z), (0, 0, axis)))


def spine_span(v):
    """SPAN: v0, a backbone lying across two thigh bones that stand in the sea: crests up, ribs
    hanging under it. v1, two ribs of something even bigger, one right across the field and one
    plunging into it (a foot to slip past)."""
    r = root("vesh_spine_span", v)
    rng = random.Random(9200 + v)
    m = Model(f"vesh_spine_span_{v}", 9200 + v)
    if v == 0:
        for s in (-1, 1):
            x = s * 42
            bone(m, [V((x, 0, -3)), V((x + s * 0.4, 0.3, 6)), V((x, 0, 14))], [2.4, 2.0, 2.6], segs=8)
            for k in (-1, 1):
                st = mark(m)
                m.ball(2.4, (x, k * 1.6, 15.2), BONE[2], subdiv=1, jitter=0.12)       # the knuckles
                facet(m, new_faces(m, st), BONE, noise=0.1)
            bone_crust(m, rng, (x, 0), 2.4)
            collider(r, x, 0, 2.5)
        n = 19
        cord = [V((-42 + 84 * i / 12, 0, 17.0 + 1.3 * 4 * (i / 12) * (1 - i / 12))) for i in range(13)]
        bone(m, cord, [1.6] * 13, segs=7, cols=[BONE[0], BONE[1], BONE[1], BONE[2]])
        for i in range(n):
            t = i / (n - 1)
            x = -42 + 84 * t
            z = 17.0 + 1.3 * 4 * t * (1 - t) + rng.uniform(-0.15, 0.15)
            hang = 0.0 if abs(x) > 34 else rng.uniform(1.6, 2.8)
            if i % 3 == 1:
                hang = 0.0
            vertebra(m, rng, (x - 1.2, rng.uniform(-0.2, 0.2), z), 2.3 - 0.5 * abs(t - 0.5), axis=rng.uniform(-0.05, 0.05),
                     ribs=hang, crest=rng.uniform(0.7, 1.2))
        # weed draped over it, glowing barnacles in the sockets
        for i in range(12):
            x = rng.uniform(-38, 38)
            for side in (-1, 1):
                if rng.random() < 0.5:
                    limb(m, (x, side * 1.5, 16.6), (x + rng.uniform(-0.3, 0.3), side * 1.8, 14.2 + rng.uniform(0, 1)), 0.35, 0.15,
                         WEED[rng.randrange(2)], segs=4)
        for i in range(8):
            m.ball(0.45, (rng.uniform(-38, 38), rng.choice((-1, 1)) * 1.1, 18.6), BIOLUM, subdiv=0, glow=True)
    else:
        def rib(xa, xb, H, p, rad, y0, bend):
            pts, radii = [], []
            n = 18
            for i in range(n + 1):
                u = -1 + 2 * i / n
                x = (xa + xb) / 2 + u * (xb - xa) / 2
                z = -2.5 + H * (1 - abs(u) ** p) ** (1 / p)
                pts.append(V((x, y0 + bend * (1 - u * u), z)))
                radii.append(rad * (1.25 - 0.35 * (i / n)))
            bone(m, pts, radii, segs=8)
            st = mark(m)
            m.ball(rad * 1.9, tuple(pts[-1] + V((0, 0, 1.2))), BONE[2], subdiv=1, scale=(1.0, 1.2, 1.4), jitter=0.2)   # the head
            facet(m, new_faces(m, st), BONE, noise=0.1)
            for i in range(1, n, 2):                                    # growth bands
                d = (pts[i + 1] - pts[i - 1]).normalized()
                m.cyl(radii[i] * 1.08, 0.6, tuple(pts[i]), BONE[1] if i % 4 == 1 else BONE[3], segs=8,
                      rot=V((0, 0, 1)).rotation_difference(d).to_euler())
            # a worn groove along the top, a couple of cracks
            for i in range(2, n - 1, 3):
                a, b = pts[i], pts[i + 1]
                m.box((0.5, 0.5, (b - a).length * 0.8), tuple((a + b) / 2 + V((0, 0, radii[i] * 0.85))), BONE[1],
                      rot=(0, -math.atan2(b.z - a.z, b.x - a.x) + math.pi / 2, 0))
            for foot in (pts[0], pts[-1]):
                bone_crust(m, rng, foot, rad * 1.2)
            # where each leg crosses flight height (sampled finely: the legs are steep), a collider
            for lo, hi in ((-1.0, 0.0), (0.0, 1.0)):
                tall = []
                for k in range(201):
                    u = lo + (hi - lo) * k / 200
                    z = -2.5 + H * max(0.0, 1 - abs(u) ** p) ** (1 / p)
                    if 7.0 < z < 13.0:
                        tall.append(V(((xa + xb) / 2 + u * (xb - xa) / 2, y0 + bend * (1 - u * u), 0)))
                if not tall:
                    continue
                mid = sum(tall, V((0, 0, 0))) / len(tall)
                rr = max((q - mid).length for q in tall) + rad * 1.3
                collider(r, round(mid.x, 2), round(mid.y, 2), round(rr, 2))
            return pts
        a = rib(-44, 44, 21.5, 4.0, 2.3, -3.0, 1.5)
        b = rib(-8, 44, 21.0, 3.0, 2.0, 4.0, -2.0)
        # barnacle crusts and weed hanging off the high parts
        for pts in (a, b):
            for q in pts[3:-3]:
                if rng.random() < 0.5 and q.z > 16:
                    limb(m, q, (q.x, q.y, max(13.3, q.z - rng.uniform(2, 3.4))), 0.4, 0.15, WEED[rng.randrange(2)], segs=4)
                if rng.random() < 0.4:
                    m.ball(rng.uniform(0.4, 0.6), tuple(q + V((0, 0, 1.6))), BARNACLE, subdiv=0)
    m.build(r)
    return r


def skull_gate(v):
    """GATE: v0, a skull bigger than a fort, standing on its own fangs in the shallows: fly between
    the teeth, under the jaw. v1, four great tusks curving up out of the sea, a reef pirates' crow's
    nest lashed to the tallest."""
    r = root("vesh_skull_gate", v)
    rng = random.Random(9220 + v)
    m = Model(f"vesh_skull_gate_{v}", 9220 + v)
    if v == 0:
        fangs = [(-16.8, -5, 13.5), (-5.6, -6.2, 14.2), (5.6, -6.2, 14.2), (16.8, -5, 13.5)]
        for x, y, top in fangs:
            st = mark(m)
            m.cyl(0.8, top + 2.5, (x, y, -2.5), BONE[3], segs=7, r_top=2.6)
            facet(m, new_faces(m, st), BONE[1:], noise=0.08)
            bone_crust(m, rng, (x, y), 1.4, 8)
            collider(r, x, y, 2.1)
        for x in (-19.5, 19.5):                                     # the jaw hinges behind
            bone(m, [V((x, 9, -3)), V((x * 1.02, 9.5, 8)), V((x * 0.95, 9, 16))], [2.8, 2.2, 3.0], segs=8)
            bone_crust(m, rng, (x, 9), 2.6)
            collider(r, x, 9, 2.6)
        # the upper jaw: a long ridge of bone with the fangs' sockets, smaller teeth between
        st = mark(m)
        jaw = [(-20, -3), (-17, -7), (-8, -8.6), (0, -9), (8, -8.6), (17, -7), (20, -3), (20, 8), (-20, 8)]
        m.slab(jaw, 14.0, 17.0, BONE[2], top=[(x * 0.95, y * 0.95 + 0.3) for x, y in jaw])
        jitter(m, new_faces(m, st), 0.25)
        facet(m, new_faces(m, st), BONE, noise=0.08)
        for k in range(10):
            x = -13 + k * 2.9
            if min(abs(x - f[0]) for f in fangs) < 2.5:
                continue
            m.cyl(0.45, 1.0, (x, -8.2 + abs(x) * 0.05, 13.2), BONE[3], segs=5, r_top=0.9)
        # the cranium: a great dome over the back of the jaw, eye sockets, brow and nose
        st = mark(m)
        m.ball(13.5, (0, 4.5, 17.5), BONE[2], subdiv=2, scale=(1.35, 1.0, 0.62), jitter=0.25)
        for side in (-1, 1):
            m.ball(4.2, (side * 9.0, 2.5, 22.6), BONE[2], subdiv=1, scale=(1.1, 0.8, 0.5), jitter=0.2)    # brows
            m.ball(4.5, (side * 15.5, 2.0, 18.5), BONE[2], subdiv=1, scale=(0.8, 1.4, 0.6), jitter=0.2)    # cheekbones
        facet(m, new_faces(m, st), BONE, noise=0.1)
        for f in new_faces(m, st):                                    # nothing under 14 but the teeth
            for vv in f.verts:
                vv.co.z = max(vv.co.z, 14.2)
        # the eye sockets on the front of the dome, where you see down into them: deep, glowing
        for side in (-1, 1):
            m.ball(4.6, (side * 7.6, -3.0, 22.6), BONE_DARK, subdiv=1, scale=(1.0, 0.95, 0.5))
            m.ball(3.4, (side * 7.6, -3.2, 22.4), "#1a1a2a", subdiv=1, scale=(1.0, 0.9, 0.55))
            m.ball(1.8, (side * 7.4, -3.8, 24.7), BIOLUM, subdiv=1, glow=True, scale=(1.0, 0.9, 0.4))
            light(r, (side * 7.6, -4, 25), BIOLUM, radius=10, intensity=0.8)
        m.ball(2.6, (0, -9.0, 19.6), BONE_DARK, subdiv=1, scale=(0.75, 0.9, 0.6))                         # the nose
        for k in range(3):                                                                                 # cracks
            a = k * 1.4 + 0.6
            m.box((0.45, 6, 0.3), (math.cos(a) * 5, 10 + math.sin(a) * 3, 25.2 - abs(math.cos(a)) * 1.2), BONE[1],
                  rot=(0.1, 0, a))
        # the reef has taken the top of its head: thin creeping mats of salt turf and pink crust
        # hugging the dome, and three screw pines rooted in the cracks
        for k in range(16):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.5, 7.5)
            st = mark(m)
            cols = MANG[1] if k % 3 else ["#3e5a4a", "#5e806a", "#86a88a", "#b4ccaa"]
            m.ball(rng.uniform(1.1, 1.8), (math.cos(a) * d * 1.3, 8 + math.sin(a) * d * 0.8, 25.5 - d * 0.36), cols[1],
                   subdiv=1, scale=(1.4, 1.1, 0.16), jitter=0.12, rot=(0, 0, a))
            facet(m, new_faces(m, st), cols, noise=0.2, bias=0.1)
        for k in range(10):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(1, 8)
            m.ball(rng.uniform(0.5, 0.8), (math.cos(a) * d * 1.3, 8 + math.sin(a) * d * 0.8, 25.6 - d * 0.36),
                   rng.choice((C_MAGENTA[2], C_ORANGE[2], BARNACLE)), subdiv=0, scale=(1.2, 1, 0.5))
        for (px, py) in ((-2.5, 9.5), (3.0, 7.0), (0.5, 12.5)):
            d = math.hypot(px, (py - 8) / 0.8) / 1.3
            z = 25.5 - d * 0.36
            tube(m, [V((px, py, z - 0.3)), V((px + 0.3, py, z + 0.9))], [0.35, 0.25], SCREW_BARK[2], segs=5)
            screw_head(m, rng, (px + 0.3, py, z + 0.9), 9, 2.2, fruit=True, droop=1.0)
    else:
        tusks = [(-18.5, 0, 18, 0.5), (-6, -2, 24, -0.3), (6.5, 1, 20, 0.3), (19, -1, 16, -0.5)]
        tops = []
        for x, y, top, lean in tusks:
            pts, radii = [], []
            for i in range(9):
                t = i / 8
                pts.append(V((x + lean * 4 * t * t, y + 5 * t * t - 1.5 * t, -3 + (top + 3) * math.sin(t * math.pi / 2))))
                radii.append(2.7 * (1 - t) + 0.25)
            bone(m, pts, radii, segs=8, cols=["#9a8a6a", "#c8b890", "#e8dcc0", "#fff6e0"])
            for i in range(1, 7, 2):                                  # growth rings
                m.cyl(radii[i] + 0.15, 0.4, tuple(pts[i]), "#a89870", segs=8,
                      rot=V((0, 0, 1)).rotation_difference((pts[i + 1] - pts[i]).normalized()).to_euler())
            bone_crust(m, rng, (x, y), 2.6)
            # its collider where it passes flight height
            at = min(pts, key=lambda q: abs(q.z - 10))
            collider(r, round(at.x, 2), round(at.y, 2), 2.4)
            tops.append(pts[-1])
        # a crow's nest on the tallest: planks, a rail, a lantern, a rag of a flag
        t = tusks[1]
        cz = 19.5
        cx, cy = t[0] - 1.0, t[1] + 2.5
        m.cyl(3.0, 0.5, (cx, cy, cz), "#6a4a30", segs=8)
        for k in range(8):
            a = k / 8 * math.tau
            m.box((0.3, 0.3, 1.2), (cx + math.cos(a) * 2.8, cy + math.sin(a) * 2.8, cz + 1.0), "#4a3020")
        m.cyl(3.0, 0.25, (cx, cy, cz + 1.6), "#8a6a40", segs=8)
        m.ball(0.6, (cx + 1.6, cy - 1.6, cz + 2.1), LANTERN, subdiv=0, glow=True)
        light(r, (cx + 1.6, cy - 1.6, cz + 2.4), LANTERN, radius=8, intensity=0.9, flicker=0.2)
        m.prism([(0, 0), (4.2, -0.6), (3.6, -2.0), (0, -2.4)], 0.15, (cx, cy, cz + 7.0), "#c83a4a")
        limb(m, (cx, cy, cz), (cx, cy, cz + 7.2), 0.15, 0.12, "#4a3020", segs=4)
        # ropes strung tusk to tusk, rags hanging
        for i in range(3):
            a, b = tops[i], tops[i + 1]
            lo = min(a.z, b.z) - 1.0
            if lo < 15:
                continue
            mid = (a + b) / 2
            mid.z = lo - 1.0
            limb(m, a, mid, 0.14, 0.14, ROPE, segs=4)
            limb(m, mid, b, 0.14, 0.14, ROPE, segs=4)
        lo = 16.5
        mid = V((-12, 0, lo))
        limb(m, (-18, 2.0, 17.0), mid, 0.14, 0.14, ROPE, segs=4)
        limb(m, mid, (-6, 1.5, 21.0), 0.14, 0.14, ROPE, segs=4)
        for k in range(3):
            m.box((1.0, 0.1, 1.4), (-14.5 + k * 2.4, 0.8, 16.0 - k * 0.1 + (k == 1) * 0.2), ("#c83a4a", "#f0e0c0", "#2a7aa0")[k])
    m.build(r)
    return r


def carcass(v):
    """GIANT: v0, the shell a crab the size of a hill cast off and left on the reef, bleached: a
    domed back ridged with spines, legs splayed, one claw still raised over its head, and the tide
    pooled in the split it climbed out of. v1, the top of a skull so big its eyes are tide pools."""
    r = root("vesh_carcass", v)
    rng = random.Random(9240 + v)
    m = Model(f"vesh_carcass_{v}", 9240 + v)
    if v == 0:
        SHELL = ["#a89a88", "#c8baa4", "#e4d8c4", "#f8f0e0"]
        RIM = "#c8705a"
        # the carapace: a wide low dome, broader than long, its front edge toothed
        st = mark(m)
        m.ball(14, (0, 0, -6.0), SHELL[2], subdiv=2, scale=(1.25, 0.9, 0.9), jitter=0.25)
        for f in new_faces(m, st):
            for vv in f.verts:
                vv.co.z = max(vv.co.z, -0.6)
        facet(m, new_faces(m, st), SHELL, noise=0.1)
        top = lambda x, y: math.sqrt(max(0.0, 14 ** 2 - (x / 1.25) ** 2 - (y / 0.9) ** 2)) * 0.9 - 6.0
        # the split down its back it climbed out of, the tide pooled in it
        st = mark(m)
        m.box((2.6, 15, 0.4), (0, -1.0, top(0, 0) - 0.2), "#5a5048")
        m.box((1.6, 13, 0.2), (0, -1.0, top(0, 0) - 0.05), TIDE_POOL, glow=True)
        for side in (-1, 1):
            for k in range(5):
                y = -7 + k * 3.0
                m.box((1.2, 2.4, 0.9), (side * 1.6, y, top(1.6, y) - 0.1), SHELL[3], rot=(0, 0, side * rng.uniform(-0.3, 0.3)))
        # ridges of spines and the coloured rim, as crabs have
        for k in range(14):
            a = k / 14 * math.tau
            x, y = math.cos(a) * 15.5, math.sin(a) * 11.2
            m.cyl(0.9, 1.6, (x, y, 0.6), RIM, segs=5, r_top=0.15, rot=(math.sin(a) * -0.8, math.cos(a) * 0.8, 0))
        for k in range(10):
            x, y = rng.uniform(-9, 9), rng.uniform(-6, 7)
            if abs(x) < 3:
                continue
            m.cyl(0.6, 1.4, (x, y, top(x, y) - 0.3), SHELL[1], segs=5, r_top=0.1)
        # eye stalks at the front, empty
        for side in (-1, 1):
            limb(m, V((side * 3.0, 9.0, top(3, 9))), V((side * 3.6, 11.5, top(3, 9) + 1.6)), 0.6, 0.45, SHELL[1], segs=5)
            m.ball(0.8, (side * 3.6, 11.5, top(3, 9) + 1.9), "#3a3438", subdiv=0)
        # legs: four a side, jointed, splayed out over the reef
        for side in (-1, 1):
            for k in range(4):
                a = (-0.55 + k * 0.33) * (1 if side > 0 else -1) + (0 if side > 0 else math.pi)
                b = V((math.cos(a) * 13, math.sin(a) * 9.5, 1.0))
                knee = V((math.cos(a) * 20, math.sin(a) * 15, 4.5 - k * 0.4))
                foot = V((math.cos(a + side * 0.25) * 26, math.sin(a + side * 0.25) * 19, -0.3))
                st = mark(m)
                tube(m, [b, knee], [2.0, 1.6], SHELL[1], segs=6)
                tube(m, [knee, foot], [1.6, 0.6], SHELL[1], segs=6)
                facet(m, new_faces(m, st), SHELL, noise=0.1)
                m.ball(1.8, tuple(knee), RIM, subdiv=0, scale=(1, 1, 0.7))
        # the claws: one lying open on the reef, one still raised over its head (low: under 8.5)
        for side, raised in ((-1, False), (1, True)):
            sh = V((side * 8, 10, 1.5))
            el = V((side * 13, 18, 5.5 if raised else 2.0))
            st = mark(m)
            tube(m, [sh, el], [1.8, 1.6], SHELL[1], segs=6)
            # the pincer: a fat palm and two fingers
            palm_c = el + V((side * -2.0, 5.0, 1.5 if raised else 0.2))
            m.ball(3.2, tuple(palm_c), SHELL[2], subdiv=1, scale=(1.0, 1.6, 0.8), jitter=0.15)
            tip = palm_c + V((side * -1.5, 6.5, 0.8 if raised else 0))
            tube(m, [palm_c + V((side * 1.0, 3, 0.4)), tip], [1.4, 0.3], SHELL[2], segs=5)
            tube(m, [palm_c + V((side * -1.2, 3, 0)), tip + V((side * -2.4, -0.6, -0.6))], [1.1, 0.3], SHELL[2], segs=5)
            facet(m, new_faces(m, st), SHELL, noise=0.1)
            m.ball(1.4, tuple(palm_c + V((0, 0, 1.6))), RIM, subdiv=0, scale=(1, 1.6, 0.6))
        # barnacles, weed and pink coral where it lies, and the reef under it
        rim_pts = [V((math.cos(a) * 15, math.sin(a) * 11, 0.2)) for a in [k / 18 * math.tau for k in range(18)]]
        crust(m, rng, rim_pts, 28, (WEED[0], WEED[1], BARNACLE, "#ff7a90"), size=(0.5, 1.0))
        for k in range(5):
            x, y = rng.uniform(-8, 8), rng.uniform(-6, 5)
            m.ball(rng.uniform(0.5, 0.8), (x, y, top(x, y) + 0.1), BARNACLE, subdiv=0)
        light(r, (0, -1, top(0, 0) + 2.5), BIOLUM, radius=10, intensity=0.6, halo=False)
        st = mark(m)
        m.cyl(24, 0.8, (0, 0, -0.9), SAND[0], segs=14, r_top=22)
        xform(m, st, M(scale=(1.0, 0.85, 1)))
        jitter(m, new_faces(m, st), 0.4)
        facet(m, new_faces(m, st), [SAND[0], SAND[1], SAND[2]], noise=0.1)
    else:
        st = mark(m)
        m.ball(17, (0, 0, -9.5), BONE[2], subdiv=2, scale=(1.0, 1.2, 0.95), jitter=0.3)
        facet(m, new_faces(m, st), BONE, noise=0.1)
        for f in new_faces(m, st):
            for vv in f.verts:
                vv.co.z = max(vv.co.z, -1.0)
        for side in (-1, 1):
            # the eyes, a ring of bone round a pool that glows
            st = mark(m)
            m.cyl(5.2, 1.2, (side * 6.5, -12, 2.6), BONE[3], segs=9, r_top=4.4)
            facet(m, new_faces(m, st), BONE[1:], noise=0.1)
            m.cyl(4.0, 0.2, (side * 6.5, -12, 3.75), TIDE_POOL, segs=9, glow=True)
            m.ball(1.0, (side * 6.0, -12.5, 3.9), "#ffffff", subdiv=0, glow=True)
            light(r, (side * 6.5, -12, 5.5), BIOLUM, radius=10, intensity=0.8)
        for k in range(6):                                                     # sutures and cracks
            a = k / 6 * math.tau + rng.uniform(-0.2, 0.2)
            pts = [V((math.cos(a) * d, math.sin(a) * d * 1.2, 0)) for d in (2, 7, 12)]
            for q in pts:
                q.z = math.sqrt(max(0.0, 17 ** 2 - (q.x ** 2 + (q.y / 1.2) ** 2))) * 0.95 - 9.4
            tube(m, pts, [0.4, 0.35, 0.25], BONE[0], segs=4)
        for k in range(9):                                                     # the reef took the crown
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0, 8)
            z = math.sqrt(max(0.0, 17 ** 2 - d * d)) * 0.95 - 9.4
            if rng.random() < 0.5:
                st = mark(m)
                m.ball(rng.uniform(1.4, 2.2), (math.cos(a) * d, 4 + math.sin(a) * d, z), MANG[1][1], subdiv=1, scale=(1.2, 1, 0.4), jitter=0.25)
                facet(m, new_faces(m, st), MANG[1], noise=0.18)
            else:
                m.ball(rng.uniform(0.8, 1.4), (math.cos(a) * d, 4 + math.sin(a) * d, z), rng.choice((C_ORANGE[2], C_MAGENTA[2], BARNACLE)),
                       subdiv=0)
        st = mark(m)
        m.cyl(19, 0.8, (0, 0, -0.9), SAND[0], segs=14, r_top=17.5)
        xform(m, st, M(scale=(1.0, 1.2, 1)))
        jitter(m, new_faces(m, st), 0.4)
        facet(m, new_faces(m, st), [SAND[0], SAND[1], SAND[2]], noise=0.1)
    m.build(r)
    return r


def bone_scatter(v):
    """Scenery: bones the tide left on the islands: v0 a vertebra, v1 two half sunk, v2 one with
    a mangrove sprouting through it."""
    r = root("vesh_vertebra", v)
    rng = random.Random(9280 + v)
    m = Model(f"vesh_vertebra_{v}", 9280 + v)
    if v == 0:
        vertebra(m, rng, (0, 0, 0.6), 1.2, axis=rng.uniform(0, 3), crest=0.9)
    elif v == 1:
        vertebra(m, rng, (-1.4, 0, 0.3), 1.0, axis=0.4, crest=0.7)
        vertebra(m, rng, (1.6, 0.8, 0.0), 0.9, axis=0.9, crest=0.6)
    else:
        vertebra(m, rng, (0, 0, 0.5), 1.3, axis=0.2, crest=0.5)
        # a young screw pine has rooted in the marrow hole and pushed up through it
        tube(m, [V((0, 0, 0.6)), V((0.2, 0.1, 1.6)), V((0.3, 0.2, 2.5))], [0.2, 0.17, 0.15], SCREW_BARK[2], segs=5)
        screw_head(m, rng, (0.3, 0.2, 2.5), 9, 1.2, fruit=False)
    st = mark(m)
    m.cyl(2.2, 0.3, (0, 0, -0.25), SAND[1], segs=7, r_top=1.8)
    jitter(m, new_faces(m, st), 0.12)
    for k in range(5):
        a = rng.uniform(0, math.tau)
        m.ball(rng.uniform(0.2, 0.35), (math.cos(a) * 2, math.sin(a) * 2, 0), rng.choice((BARNACLE, WEED[1])), subdiv=0)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def bone_spike(v):
    """Scenery: a tusk or a rib tip standing up out of the sand, leaning (4-6 tall)."""
    r = root("vesh_bone_spike", v)
    rng = random.Random(9300 + v)
    m = Model(f"vesh_bone_spike_{v}", 9300 + v)
    n = (1, 3)[v]
    for k in range(n):
        x, y = (0, 0) if k == 0 else (rng.uniform(-1.8, 1.8), rng.uniform(-1.8, 1.8))
        h = rng.uniform(4.0, 5.8) * (1 if k == 0 else 0.6)
        lean = V((rng.uniform(-1.5, 1.5), rng.uniform(-1.5, 1.5), 0))
        pts = [V((x, y, -0.3)), V((x, y, 0)) + lean * 0.3 + V((0, 0, h * 0.5)), V((x, y, 0)) + lean + V((0, 0, h))]
        bone(m, pts, [0.7 if k == 0 else 0.45, 0.5 if k == 0 else 0.32, 0.08], segs=6)
        for j in range(3):
            m.ball(0.25, (x + rng.uniform(-0.6, 0.6), y + rng.uniform(-0.6, 0.6), 0.2), rng.choice((BARNACLE, WEED[0], "#ff7a90")), subdiv=0)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


# --- the Sky-Whale Lagoon ----------------------------------------------------------------

def leaf_mass(m, rng, at, rad, n=5, cols=MANG[0], flowers=3, squash=0.42):
    """A mangrove crown: a flat ragged mat of overlapping faceted clumps, the rim lobes dropping
    lower, a few pale propagules on top."""
    x, y, z = at
    st = mark(m)
    m.ball(rad * 0.85, (x, y, z), cols[1], subdiv=1, scale=(1.1, 1.0, squash), jitter=0.12 * rad)
    n *= 2                                                   # many smaller lobes: a ragged edge at any scale
    for k in range(n):
        a = k / n * math.tau + rng.uniform(-0.25, 0.25)
        d = rad * rng.uniform(0.6, 1.1)
        m.ball(rad * rng.uniform(0.35, 0.5), (x + math.cos(a) * d, y + math.sin(a) * d, z - rng.uniform(-0.2, 0.6) * rad * squash),
               cols[1], subdiv=1, scale=(1, 1, squash + 0.05), jitter=0.1 * rad)
    facet(m, new_faces(m, st), cols, noise=0.18, bias=0.05)
    for k in range(flowers):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.2, 0.9) * rad
        m.ball(0.3 + 0.05 * rad, (x + math.cos(a) * d, y + math.sin(a) * d, z + rad * squash * 0.95), PROPAGULE, subdiv=0,
               scale=(1.2, 1, 0.5))


def mangrove_trunk(m, r, rng, x, y, top, rad):
    """A giant mangrove's trunk on a cage of stilt roots, from the lagoon floor to `top`."""
    st = mark(m)
    tube(m, [V((x, y, 1.0)), V((x + rng.uniform(-0.6, 0.6), y, top * 0.5)), V((x, y + rng.uniform(-0.6, 0.6), top))],
         [rad, rad * 0.85, rad * 0.8], MANGROVE_BARK[1], segs=7)
    for k in range(8):
        a = k / 8 * math.tau + rng.uniform(-0.2, 0.2)
        out = rad * rng.uniform(2.2, 3.0)
        tube(m, [V((x, y, 3.0 + rng.uniform(0, 2))), V((x + math.cos(a) * out * 0.5, y + math.sin(a) * out * 0.5, 3.5)),
                 V((x + math.cos(a) * out, y + math.sin(a) * out, -2.5))], [rad * 0.3, rad * 0.26, rad * 0.22], MANGROVE_BARK[1], segs=5)
    facet(m, new_faces(m, st), MANGROVE_BARK, noise=0.12)
    st = mark(m)
    m.cyl(rad * 3.2, 0.6, (x, y, -0.7), SAND[0], segs=9, r_top=rad * 2.4)
    jitter(m, new_faces(m, st), 0.3)
    facet(m, new_faces(m, st), ["#8a7a5a", SAND[0], SAND[1]], noise=0.1)
    if r is not None:
        collider(r, round(x, 2), round(y, 2), round(rad * 1.1, 2))


def mangrove_span(v):
    """SPAN: v0, two giant mangroves whose boughs meet over the lagoon, aerial roots hanging under
    the canopy. v1, the reef pirates' rope bridge strung between two of them: planks, lanterns,
    pennants and a basket hut hung halfway."""
    r = root("vesh_mangrove_span", v)
    rng = random.Random(9400 + v)
    m = Model(f"vesh_mangrove_span_{v}", 9400 + v)
    if v == 0:
        for s in (-1, 1):
            x = s * 41
            mangrove_trunk(m, r, rng, x, 0, 15, 3.0)
            # boughs reaching in, meeting in the middle
            for k, dy in enumerate((-3.5, 0.5, 4.0)):
                b = curve((x, dy * 0.3, 14.5), (s * rng.uniform(2, 8), dy, 17 + rng.uniform(-0.5, 1)), 5, lift=2.5)
                strand(m, b, [1.4, 1.2, 1.0, 0.8, 0.6, 0.45], MANGROVE_BARK)
        # the canopy: a ragged ribbon of crowns with gaps
        x = -46.0
        while x < 46:
            y = rng.uniform(-3.5, 3.5)
            rad = rng.uniform(3.2, 4.4)
            leaf_mass(m, rng, (x, y, 17.6 + rng.uniform(0, 1.2)), rad, n=4, flowers=3)
            x += rad * rng.uniform(1.3, 1.9)
        # aerial roots hanging down, the odd one glowing where the plankton haze clings
        for k in range(26):
            x = rng.uniform(-36, 36)
            y = rng.uniform(-4.5, 4.5)
            low = rng.uniform(13.3, 14.6)
            limb(m, (x, y, 16.6), (x + rng.uniform(-0.3, 0.3), y, low), 0.22, 0.12, MANGROVE_BARK[0], segs=4)
            if k % 3 == 0:
                polyp(m, (x, y, low), 0.3, BIOLUM)
    else:
        for s in (-1, 1):
            x = s * 42
            mangrove_trunk(m, r, rng, x, 0, 17, 2.6)
            leaf_mass(m, rng, (x, 0, 19), 5.0, n=6, flowers=5)
            # the platform round the trunk the bridge hangs from
            m.cyl(4.2, 0.5, (x, 0, 15.2), "#6a4a30", segs=8)
            for k in range(8):
                a = k / 8 * math.tau
                m.box((0.3, 0.3, 1.2), (x + math.cos(a) * 4.0, math.sin(a) * 4.0, 16.0), "#4a3020")
        # the bridge: planks on two ropes, sagging to the middle
        n = 34
        prev = {}
        for i in range(n + 1):
            t = i / n
            x = -38 + 76 * t
            z = 15.2 - 1.4 * 4 * t * (1 - t)
            if i < n:
                col = ("#8a6a40", "#a8804a", "#6a4a30")[rng.randrange(3)] if rng.random() > 0.05 else None
                if col:
                    m.box((1.8, 2.8, 0.25), (x + 1.1, rng.uniform(-0.1, 0.1), z - 0.08), col, rot=(0, 0, rng.uniform(-0.08, 0.08)))
            for side in (-1, 1):
                p = V((x, side * 1.5, z + 1.2))
                if side in prev:
                    limb(m, prev[side], p, 0.1, 0.1, ROPE, segs=4)
                if i % 4 == 0:
                    limb(m, (x, side * 1.5, z), p, 0.08, 0.08, ROPE, segs=4)
                prev[side] = p
            if i % 5 == 2:
                limb(m, (x, 1.5, z + 1.2), (x, 1.9, max(13.6, z - 0.6)), 0.06, 0.06, ROPE, segs=3)
                m.box((0.5, 0.5, 0.6), (x, 1.9, max(13.6, z - 0.6)), LANTERN, glow=True)
        light(r, (-14, 2, 14), LANTERN, radius=10, intensity=0.8, flicker=0.15)
        light(r, (16, 2, 14), LANTERN, radius=10, intensity=0.8, flicker=0.15)
        # pennants strung tree to tree above it
        for i in range(24):
            t = (i + 0.5) / 24
            x = -40 + 80 * t
            z = 20.5 - 2.5 * 4 * t * (1 - t)
            m.prism([(-0.9, 0), (0.9, 0), (0, -1.4)], 0.08, (x, -2.6, z), ("#c83a4a", "#f0e0c0", "#2a9ab0", "#f0c040")[i % 4])
        limb(m, (-40, -2.6, 20.5), (0, -2.6, 18.0), 0.06, 0.06, ROPE, segs=3)
        limb(m, (0, -2.6, 18.0), (40, -2.6, 20.5), 0.06, 0.06, ROPE, segs=3)
        # a basket hut hung off the bridge, a third of the way across
        hx = 12.0
        st = mark(m)
        m.cyl(2.6, 2.2, (hx, -4.2, 13.4), "#a8804a", segs=8, r_top=2.9)
        facet(m, new_faces(m, st), ["#6a4a30", "#8a6a40", "#a8804a", "#c8a060"], noise=0.15)
        m.cyl(3.3, 1.8, (hx, -4.2, 15.6), "#c83a4a", segs=8, r_top=0.4)
        m.cyl(0.8, 0.2, (hx + 1.2, -6.9, 14.6), LANTERN, segs=6, glow=True, rot=(1.3, 0, 0))
        limb(m, (hx, -4.2, 17.4), (hx, -1.5, 15.0), 0.1, 0.1, ROPE, segs=3)
    m.build(r)
    return r


def sea_stacks(v):
    """GATE: v0, sea stacks of banded reef rock, mangroves on their heads, a pirate rope strung
    between two with rags flying. v1, two stacks joined high up by an arch the sea wore through."""
    r = root("vesh_sea_stacks", v)
    rng = random.Random(9420 + v)
    m = Model(f"vesh_sea_stacks_{v}", 9420 + v)
    if v == 0:
        cols = [(-18.5, 0.5, 2.8, 19), (-5.5, -1.0, 2.5, 16), (7.5, 1.0, 2.9, 22), (20.0, 0, 2.6, 17)]
    else:
        cols = [(-14.5, 0, 3.4, 20), (0, 1, 2.6, 16.5), (14.5, -0.5, 3.4, 20)]
    for x, y, rad, top in cols:
        reef_leg(m, r, rng, x, y, top, rad, cols=REEF_ROCK + ["#e0b0a0"])
        # weed and pink crust in bands up the flanks
        for j in range(6):
            a = rng.uniform(0, math.tau)
            z = rng.uniform(1, top - 3)
            m.ball(rng.uniform(0.7, 1.1), (x + math.cos(a) * rad * 1.1, y + math.sin(a) * rad * 1.1, z),
                   rng.choice((BARNACLE, "#ff7a90", WEED[1], C_TEAL[1])), subdiv=0, scale=(1, 1, 0.6))
        leaf_mass(m, rng, (x, y, top + 1.0), rad * 1.15, n=4, flowers=2)
        m.cyl(rad * 0.6, 0.12, (x + rad * 0.4, y - rad * 0.4, top + 0.2), TIDE_POOL, segs=6, glow=True)
    if v == 0:
        a, b = V((-18.5, 0.5, 18.0)), V((7.5, 1.0, 20.0))
        mid = (a + b) / 2
        mid.z = 15.2
        limb(m, a, mid, 0.12, 0.12, ROPE, segs=3)
        limb(m, mid, b, 0.12, 0.12, ROPE, segs=3)
        for k in range(5):
            t = (k + 1) / 6
            p = a.lerp(mid, t * 2) if t < 0.5 else mid.lerp(b, t * 2 - 1)
            m.box((0.9, 0.08, 1.2), tuple(p - V((0, 0, 0.7))), ("#c83a4a", "#f0e0c0", "#2a9ab0")[k % 3])
        m.ball(0.5, tuple(mid - V((0, 0, 0.5))), LANTERN, subdiv=0, glow=True)
    else:
        # the arch: rock lumps bridging the two outer stacks, over the middle one
        pts = curve((-14.5, 0, 18.5), (14.5, -0.5, 18.5), 7, lift=3.0)
        for p in pts:
            st = mark(m)
            m.ball(3.0, tuple(p), REEF_ROCK[1], subdiv=1, scale=(1.2, 1.1, 0.7), jitter=0.3)
            facet(m, new_faces(m, st), REEF_ROCK, noise=0.12)
            for vv in {vv for f in new_faces(m, st) for vv in f.verts}:
                vv.co.z = max(vv.co.z, 16.5 if abs(vv.co.x) > 3 else 19.2)
        for x in (-7, 6.5):
            limb(m, (x, 0, 19.5), (x, 0.2, 17.0), 0.6, 0.2, WEED[0], segs=4)
        leaf_mass(m, rng, (0, 0, 22.4), 3.4, n=4, flowers=3)
    m.build(r)
    return r


def blue_hole(v):
    """GIANT: v0, a blue hole in the lagoon: a ring of reef and pale sand round water that drops
    away to ink, glowing far down, palms leaning out over it and a pirate buoy moored at the lip.
    v1, a broken ring, the sea pouring in through the gap in a slick of foam."""
    r = root("vesh_blue_hole", v)
    rng = random.Random(9440 + v)
    m = Model(f"vesh_blue_hole_{v}", 9440 + v)
    R = 17.0 if v == 0 else 15.0
    gap = None if v == 0 else (0.4, 1.0)              # (start, end) angle of the break in the ring
    def broken(a):
        if gap is None:
            return False
        a = a % math.tau
        return gap[0] <= a <= gap[1]
    # the water, shelving from turquoise at the lip to ink, a glow far down
    for k, (rad, col) in enumerate(((R * 0.98, "#3ad0e0"), (R * 0.8, "#1a8ab8"), (R * 0.6, "#14508a"), (R * 0.4, "#0e2a5a"),
                                    (R * 0.22, "#0a1838"))):
        m.cyl(rad, 0.1, (0.15 * k, -0.12 * k, 0.05 + 0.04 * k), col, segs=14, r_top=rad)
    m.cyl(R * 0.1, 0.1, (0.8, -0.6, 0.3), "#5affe8", segs=8, glow=True)
    light(r, (0.8, -0.6, 2.5), BIOLUM, radius=14, intensity=0.7, halo=False)
    # the ring: lumps of reef rock and sand banks all round
    n = 26
    ring = []
    for k in range(n):
        a = k / n * math.tau + rng.uniform(-0.05, 0.05)
        if broken(a):
            continue
        d = R + rng.uniform(0.5, 2.5)
        q = V((math.cos(a) * d, math.sin(a) * d, 0))
        ring.append(q)
        st = mark(m)
        m.ball(rng.uniform(2.6, 3.8), tuple(q + V((0, 0, -0.6))), REEF_ROCK[2], subdiv=1, scale=(1.4, 1.0, 0.55), jitter=0.25,
               rot=(0, 0, a + math.pi / 2))
        facet(m, new_faces(m, st), REEF_ROCK, noise=0.12)
        if rng.random() < 0.6:
            st = mark(m)
            m.ball(rng.uniform(2.2, 3.2), tuple(q + V((math.cos(a) * 2.2, math.sin(a) * 2.2, -0.9))), SAND[1], subdiv=1,
                   scale=(1.5, 1.2, 0.4), jitter=0.2, rot=(0, 0, a))
            facet(m, new_faces(m, st), SAND, noise=0.08)
    crust(m, rng, ring, 34, (C_ORANGE[2], C_MAGENTA[2], C_GOLD[2], BARNACLE, WEED[1]), size=(0.5, 1.0))
    # palms leaning out over the drop
    from props_a_lib import frond
    for k in range(5 if v == 0 else 4):
        q = ring[(k * len(ring)) // (5 if v == 0 else 4) + 1]
        inward = -q.normalized()
        h = rng.uniform(4.5, 6.5)
        top = q + inward * rng.uniform(2.0, 3.5) + V((0, 0, h))
        pts = [q + V((0, 0, 0.3)), q.lerp(top, 0.5) + V((0, 0, -0.4)), top]
        tube(m, pts, [0.4, 0.32, 0.26], "#8a6a50", segs=6, colors=["#6a5040", "#a88a60"])
        for j in range(7):
            yaw = j / 7 * math.tau + rng.uniform(-0.2, 0.2)
            frond(m, tuple(top), yaw, rng.uniform(2.8, 3.6), 0.6, C_TEAL[1] if j % 2 else C_TEAL[2], C_GOLD[1] if j % 3 == 0 else C_TEAL[0],
                  rise=0.35, droop=0.9)
        m.ball(0.3, tuple(top + V((0, 0, -0.4))), "#ff9aff", subdiv=0, glow=True)
    if v == 0:
        # a pirate buoy moored at the lip: a striped drum, a lamp, a rag flag
        b = V((R * 0.7, -R * 0.45, 0))
        m.cyl(1.3, 1.6, tuple(b + V((0, 0, -0.4))), "#c83a3a", segs=7)
        m.cyl(1.32, 0.5, tuple(b + V((0, 0, 0.3))), "#f0e8d8", segs=7)
        m.box((0.2, 0.2, 2.2), tuple(b + V((0, 0, 2.0))), "#3a2a20")
        m.ball(0.45, tuple(b + V((0, 0, 3.2))), LANTERN, subdiv=0, glow=True)
        m.box((1.2, 0.08, 0.7), tuple(b + V((0.65, 0, 2.6))), "#e05a3a")
        tube(m, [b + V((0, 0, 0.2)), b.lerp(ring[3], 0.5) + V((0, 0, -0.2)), ring[3] + V((0, 0, 0.6))], [0.12, 0.12, 0.12], ROPE, segs=4)
    else:
        # the sea pouring in through the break, foaming
        for k in range(14):
            t = k / 13
            a = gap[0] + (gap[1] - gap[0]) * rng.uniform(0.15, 0.85)
            d = R * (1.25 - t * 0.55)
            m.ball(rng.uniform(0.6, 1.2), (math.cos(a) * d, math.sin(a) * d, -0.05), "#e8fcff", subdiv=0, scale=(1.4, 1.0, 0.25))
        for side in (0, 1):
            a = gap[side]
            q = V((math.cos(a) * (R + 1), math.sin(a) * (R + 1), 0))
            st = mark(m)
            m.ball(3.6, tuple(q + V((0, 0, -0.2))), REEF_ROCK[1], subdiv=1, scale=(1.2, 1.2, 0.8), jitter=0.3)
            facet(m, new_faces(m, st), REEF_ROCK, noise=0.12)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def shack(v):
    """Scenery: a reef pirates' stilt shack on the beach: a patched roof, a lantern, a red rag of a
    flag, barrels; v1 two of them with a plank walk between."""
    r = root("vesh_shack", v)
    rng = random.Random(9500 + v)
    m = Model(f"vesh_shack_{v}", 9500 + v)
    huts = [(0, 0, 0)] if v == 0 else [(-2.4, 0, 0.3), (2.6, 0.6, -0.4)]
    for hx, hy, yaw in huts:
        st = mark(m)
        for sx in (-1, 1):
            for sy in (-1, 1):
                m.box((0.22, 0.22, 1.6), (sx * 1.1, sy * 0.9, 0.6), MANGROVE_BARK[0])
        m.box((2.8, 2.4, 0.2), (0, 0, 1.4), "#8a6a40")
        m.box((2.2, 1.8, 1.4), (0, 0, 2.2), ("#a8804a", "#6a8a8a")[rng.randrange(2)])
        m.gable((2.8, 2.6, 1.0), (0, 0, 2.9), ("#c83a4a", "#2a7aa0", "#d8b060")[rng.randrange(3)], overhang=0.2)
        m.box((0.6, 0.1, 0.5), (0.5, -0.92, 2.3), LANTERN, glow=True)
        m.cyl(0.35, 0.6, (1.6, 1.0, 1.5), "#6a4a30", segs=6)
        xform(m, st, M((hx, hy, 0), (0, 0, yaw)))
    if v == 1:
        m.box((2.4, 0.8, 0.12), (0, 0.3, 1.45), "#a8804a", rot=(0, 0, 0.1))
    limb(m, (-1.3, 1.0, 1.4), (-1.3, 1.0, 4.6), 0.07, 0.06, MANGROVE_BARK[0], segs=3)
    m.prism([(0, 0), (1.2, -0.2), (1.0, -0.7), (0, -0.8)], 0.06, (-1.3, 1.0, 4.6), "#c83a4a")
    light(r, (0.5, -1.4, 2.4), LANTERN, radius=4, intensity=0.6, flicker=0.15)
    m.build(r)
    return r


def _hut(m, rng, at, yaw, s=1.0):
    """A stilt hut: posts, a deck, plank walls, a patched gable roof, a lantern in the door."""
    st = mark(m)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((0.3, 0.3, 2.0), (sx * 1.4, sy * 1.1, 0.6), MANGROVE_BARK[0])
    m.box((3.6, 3.0, 0.25), (0, 0, 1.7), "#8a6a40")
    m.box((2.8, 2.2, 1.7), (0, 0, 2.65), ("#a8804a", "#6a8a8a", "#c8a870")[rng.randrange(3)])
    m.gable((3.6, 3.2, 1.3), (0, 0, 3.5), ("#c83a4a", "#2a7aa0", "#d8b060", "#8a3a6a")[rng.randrange(4)], overhang=0.3)
    m.box((0.7, 0.1, 0.6), (0.6, -1.12, 2.7), LANTERN, glow=True)
    xform(m, st, M(at, (0, 0, yaw), (s, s, s)))


def pirate_cove(v):
    """GIANT: the reef pirates' cove on a sandbar: stilt huts round a plank jetty, a junk drawn up
    on the beach with its battened sails furled, lanterns and rag flags."""
    r = root("vesh_pirate_cove", v)
    rng = random.Random(9520 + v)
    m = Model(f"vesh_pirate_cove_{v}", 9520 + v)
    # the sandbar
    st = mark(m)
    pts = []
    for k in range(14):
        a = k / 14 * math.tau
        rr = rng.uniform(0.85, 1.1)
        pts.append((math.cos(a) * 15 * rr, math.sin(a) * 10 * rr))
    m.slab(pts, -1.2, 1.1, SAND[1], top=[(x * 0.92, y * 0.9) for x, y in pts])
    jitter(m, new_faces(m, st), 0.25)
    facet(m, new_faces(m, st), [SAND[0], SAND[1], SAND[2]], noise=0.1)
    # huts round its edge, facing in
    spots = [(-10, 4, 0.3), (-6, 7, 0.0), (-1, 7.5, -0.1), (5, 6.5, 0.2), (10, 3.5, 0.6), (-11.5, -1.5, 1.4), (-8, -5.5, 2.4)]
    for x, y, yaw in spots:
        _hut(m, rng, (x, y, 0.9), yaw + math.pi, rng.uniform(0.95, 1.2))
    # the jetty: planks out over the water to the south, posts, a lantern at its end
    for k in range(12):
        y = -4 - k * 1.1
        m.box((2.4, 0.95, 0.2), (-2.5 + rng.uniform(-0.1, 0.1), y, 1.2), ("#8a6a40", "#a8804a", "#6a4a30")[rng.randrange(3)],
              rot=(0, 0, rng.uniform(-0.05, 0.05)))
        if k % 3 == 0:
            for sx in (-1, 1):
                m.box((0.3, 0.3, 2.6), (-2.5 + sx * 1.3, y, 0.0), MANGROVE_BARK[0])
    m.box((0.5, 0.5, 0.7), (-1.2, -16.6, 2.0), LANTERN, glow=True)
    limb(m, (-1.2, -16.6, 1.2), (-1.2, -16.6, 1.7), 0.08, 0.08, MANGROVE_BARK[0], segs=3)
    # the junk, beached on the east side, listing a little
    st = mark(m)
    hull_pts = [(-2.4, -8), (2.4, -8), (3.0, -2), (2.6, 5), (0, 8.5), (-2.6, 5), (-3.0, -2)]
    m.slab(hull_pts, 0.0, 2.2, "#6a4a30", top=[(x * 1.15, y * 1.05) for x, y in hull_pts])
    facet(m, new_faces(m, st), ["#3a2a20", "#5a3a28", "#7a5a3a", "#9a7a50"], noise=0.1)
    m.slab([(x * 1.0, y * 0.98) for x, y in hull_pts], 2.2, 2.35, "#a8804a")
    m.box((4.2, 3.0, 1.4), (0, -6.0, 3.0), "#8a6a40")                  # the stern house
    m.box((4.4, 3.2, 0.25), (0, -6.0, 3.8), "#c83a4a")
    m.box((0.6, 0.1, 0.5), (1.2, -7.55, 3.0), LANTERN, glow=True)
    for y, h in ((-1.5, 6.5), (3.5, 5.0)):                              # masts and furled battened sails
        limb(m, (0, y, 2.3), (0, y, 2.3 + h), 0.18, 0.15, MANGROVE_BARK[0], segs=4)
        for k in range(4):
            m.box((4.6 - k * 0.5, 0.35, 0.3), (0, y + 0.1, 2.3 + h * (0.45 + k * 0.14)), "#c84a3a" if k % 2 else "#e8d0a0")
        m.prism([(0, 0), (1.6, -0.3), (1.3, -1.0), (0, -1.0)], 0.06, (0, y, 2.3 + h), "#c83a4a")
    xform(m, st, M((17, -5, 0.0), (0.0, 0.12, 0.6)))
    # palms leaning over the huts, the sand stained darker where the tide reaches
    from props_a_lib import frond
    for x, y in ((-4, 3.5), (7.5, 0.5), (-13, 2.5), (2, -6)):
        top = V((x + rng.uniform(-1.2, 1.2), y + rng.uniform(-1.2, 1.2), rng.uniform(5.2, 6.4)))
        tube(m, [V((x, y, 0.2)), V((x, y, 0.2)).lerp(top, 0.5) + V((0.4, 0, 0)), top], [0.35, 0.3, 0.24], "#8a6a50", segs=6)
        for k in range(7):
            frond(m, tuple(top), k / 7 * math.tau + rng.uniform(-0.2, 0.2), rng.uniform(2.6, 3.4), 0.6,
                  C_TEAL[1] if k % 2 else C_TEAL[2], C_GOLD[1] if k % 3 == 0 else C_TEAL[0], rise=0.35, droop=0.9)
    for k in range(10):
        a = k / 10 * math.tau
        m.ball(rng.uniform(1.4, 2.2), (math.cos(a) * 13.5, math.sin(a) * 9, -0.4), SAND[0], subdiv=0, scale=(1.4, 1.4, 0.3))
    # two skiffs tied at the jetty
    for x in (-5.2, 0.2):
        st = mark(m)
        m.slab([(-0.7, -2.2), (0.7, -2.2), (0.8, 1.0), (0, 2.4), (-0.8, 1.0)], 0.0, 0.7, "#5a3a28")
        m.box((1.2, 0.4, 0.15), (0, 0, 0.6), "#a8804a")
        xform(m, st, M((x, -11 + (x > 0) * 3, 0.1), (0, 0, rng.uniform(-0.2, 0.2))))
    # barrels and nets on the sand, a fire pit glowing in the middle
    for k in range(10):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(2, 8)
        m.cyl(0.5, 0.9, (math.cos(a) * d, math.sin(a) * d * 0.6, 0.2), ("#6a4a30", "#8a5a3a")[k % 2], segs=6)
    st = mark(m)
    m.cyl(1.4, 0.3, (0, 0.5, 0.2), "#4a4a4a", segs=7)
    m.ball(0.8, (0, 0.5, 0.7), "#ff8a3a", subdiv=0, glow=True)
    light(r, (0, 0.5, 2.5), "#ff8a3a", radius=10, intensity=0.8, flicker=0.3)
    for k in range(5):
        x, y, _ = spots[k]
        limb(m, (x * 0.85, y * 0.85, 0.3), (x * 0.85, y * 0.85, 6.5), 0.08, 0.07, MANGROVE_BARK[0], segs=3)
        m.prism([(0, 0), (1.4, -0.2), (1.2, -0.8), (0, -0.9)], 0.06, (x * 0.85, y * 0.85, 6.5),
                ("#c83a4a", "#f0e0c0", "#2a9ab0", "#f0c040", "#c83a4a")[k])
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


# --- the Tide Caves -------------------------------------------------------------------------

def stalactite(m, rng, at, length, rad, cols=CAVE, drip=True):
    """A rock icicle hanging from `at` down by `length`, a bead of glowing water at its tip."""
    x, y, z = at
    st = mark(m)
    m.cyl(rad, length, (x, y, z - length), cols[2], segs=6, r_top=rad)
    for vv in {vv for f in new_faces(m, st) for vv in f.verts}:
        k = (z - vv.co.z) / length                          # 0 at the root, 1 at the tip
        s = max(0.08, 1 - k)
        vv.co.x = x + (vv.co.x - x) * s + rng.uniform(-0.1, 0.1)
        vv.co.y = y + (vv.co.y - y) * s + rng.uniform(-0.1, 0.1)
    facet(m, new_faces(m, st), cols[1:], noise=0.12)
    if drip:
        polyp(m, (x, y, z - length - 0.2), 0.32, BIOLUM)


def cave_arch(v):
    """SPAN: v0, a roof of sea-cave rock left bridging the gorge, stalactites dripping light under
    it, coral and weed on its back. v1, a deeper, heavier one, a curtain of glowing weed hanging
    across its middle (no foot in the field: the gorge has pillars of its own)."""
    r = root("vesh_cave_arch", v)
    rng = random.Random(9600 + v)
    m = Model(f"vesh_cave_arch_{v}", 9600 + v)
    for s in (-1, 1):
        reef_leg(m, r, rng, s * 41, rng.uniform(-2, 2), 17, 3.8, cols=CAVE, crust=False)
    x = -46.0
    lumps = []
    while x < 46:
        w = rng.uniform(5, 8)
        y = rng.uniform(-2, 2)
        depth = rng.uniform(4.5, 6.5) * (1.3 if v else 1)
        z = 17.2 + rng.uniform(0, 1.2)
        if v == 0 and -28 < x < 28 and rng.random() < 0.15:
            x += 3                                  # a hole to see the water through
            continue
        lumps.append((x, y, z, w, depth))
        x += w * 0.8
    for x, y, z, w, depth in lumps:
        pts = []
        for k in range(12):
            u, vv = rng.uniform(-1, 1), rng.uniform(-1, 1)
            pts.append(V((x + u * w * 0.7, y + vv * depth, z + rng.uniform(-1.6, 1.6))))
        hull(m, pts, CAVE[2])
    faces = {f for f in m.bm.faces if f.material_index == m._slot(CAVE[2], False)}
    facet(m, faces, CAVE[:4], noise=0.12, bias=-0.1)
    # nothing under 14.2 but the stalactites
    for f in faces:
        for vv in f.verts:
            if abs(vv.co.x) < 37:
                vv.co.z = max(vv.co.z, 14.4)
    # its back: pink crust, coral, a glowing pool or two
    for x, y, z, w, depth in lumps:
        if rng.random() < 0.5:
            m.ball(rng.uniform(1.2, 2.0), (x + rng.uniform(-2, 2), y, z + 1.4), rng.choice((C_ORANGE[2], C_MAGENTA[2], C_GOLD[2], "#ff9aa8")),
                   subdiv=1, scale=(1.2, 1, 0.5), jitter=0.1)
        else:
            for k in range(3):
                m.ball(rng.uniform(0.7, 1.2), (x + rng.uniform(-2, 2), y + rng.uniform(-2, 2), z + 1.3), WEED[rng.randrange(2)], subdiv=0,
                       scale=(1, 1, 0.6))
        # weed curtains hanging off its front and back edges, where the tilt shows them
        for side in (-1, 1):
            for k in range(2):
                wx = x + rng.uniform(-w * 0.4, w * 0.4)
                wy = y + side * depth * 0.85
                limb(m, (wx, wy, z), (wx, wy + side * 0.4, 14.6), 0.5, 0.2, WEED[rng.randrange(2)], segs=4)
    # stalactites, each tip above 13.3
    for k in range(30 if v == 0 else 38):
        x = rng.uniform(-37, 37)
        y = rng.uniform(-4, 4) * (1.3 if v else 1)
        L = rng.uniform(0.8, 1.0) * (14.4 - 13.4)
        stalactite(m, rng, (x, y, 15.0), 1.4 + L, rng.uniform(0.5, 0.9))
    if v == 1:
        # a curtain of glowing weed hung right across its middle, high enough to fly under
        for k in range(22):
            x = -20 + k * 1.9 + rng.uniform(-0.4, 0.4)
            limb(m, (x, 0, 15.5), (x, rng.uniform(-0.3, 0.3), 13.6 + rng.uniform(0, 0.6)), 0.3, 0.12, WEED[k % 2], segs=4)
            if k % 3 == 0:
                polyp(m, (x, 0, 13.7), 0.3, BIOLUM)
    light(r, (0, 0, 13.5), BIOLUM, radius=16, intensity=0.6, halo=False)
    m.build(r)
    return r


def grotto(v):
    """GIANT: v0, a drowned grotto, a ring of cave rock round a pool that glows, anemones in its
    shallows. v1, a stalactite that fell: a great broken spike of rock lying across the floor,
    coral already on it."""
    r = root("vesh_grotto", v)
    rng = random.Random(9620 + v)
    m = Model(f"vesh_grotto_{v}", 9620 + v)
    if v == 0:
        R = 15.0
        # the ring: worn, rounded shelves of cave rock in two or three tiers, high on one side and
        # broken low on the other where the tide gets in, not a crown of spikes
        st = mark(m)
        k = 0
        a = 0.0
        while a < math.tau - 0.2:
            high = 0.5 + 0.5 * math.sin(a + 1.2)
            w = rng.uniform(3.2, 5.0)
            rr = R * rng.uniform(0.95, 1.08)
            cx, cy = math.cos(a) * rr, math.sin(a) * rr
            h = 1.2 + 3.2 * high * rng.uniform(0.7, 1.0)
            lump(m, rng, (cx, cy, 0.0), (w, w * 0.8, h), CAVE[2], n=12, flat=0.55)
            if high > 0.5 and rng.random() < 0.7:            # a second, smaller tier sitting back on it
                lump(m, rng, (cx * 1.06, cy * 1.06, h * 0.5), (w * 0.55, w * 0.5, h * 0.7), CAVE[2], n=10, flat=0.5)
            a += w / rr * rng.uniform(0.75, 1.0)
            k += 1
        facet(m, new_faces(m, st), CAVE, noise=0.12, bias=0.05)
        # crust along its top: coral heads, weed, a few urchins' worth of glow
        for j in range(18):
            a = rng.uniform(0, math.tau)
            rr = R * rng.uniform(0.9, 1.05)
            m.ball(rng.uniform(0.6, 1.1), (math.cos(a) * rr, math.sin(a) * rr, 1.5 + 2.5 * (0.5 + 0.5 * math.sin(a + 1.2))),
                   rng.choice((C_ORANGE[2], C_MAGENTA[2], WEED[0], WEED[1], CALCITE[3])), subdiv=0, scale=(1.2, 1, 0.6))
        m.cyl(R * 0.95, 0.3, (0, 0, -0.3), "#1a6a80", segs=14)
        m.cyl(R * 0.6, 0.1, (0, 0, 0.0), "#2aa8b8", segs=12)
        m.cyl(R * 0.25, 0.1, (0.5, -0.5, 0.06), TIDE_POOL, segs=9, glow=True)
        for k in range(14):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.3, 0.8) * R
            st = mark(m)
            anem = Model("tmp")
            m.ball(rng.uniform(0.6, 1.0), (math.cos(a) * d, math.sin(a) * d, 0.3), rng.choice((C_MAGENTA[2], C_ORANGE[2], C_VIOLET[2])),
                   subdiv=0)
            anem.bm.free()
        for k in range(5):
            a = rng.uniform(0, math.tau)
            stalactite(m, rng, (math.cos(a) * R * 0.8, math.sin(a) * R * 0.8, 0), -rng.uniform(2.0, 3.5), 0.8, cols=CALCITE, drip=False)
        light(r, (0, 0, 4), BIOLUM, radius=16, intensity=0.6)
    else:
        L = 38.0
        st = mark(m)
        m.cyl(7.0, L, (0, -L / 2, 2.5), CAVE[2], segs=7, r_top=0.4, rot=(-math.pi / 2, 0, 0))
        jitter(m, new_faces(m, st), 0.5)
        facet(m, new_faces(m, st), CAVE, noise=0.12)
        for vv in {vv for f in new_faces(m, st) for vv in f.verts}:
            vv.co.z = max(vv.co.z, -1.0)
        # the broken root end, jagged
        for k in range(8):
            a = k / 8 * math.tau
            pts = [V((math.cos(a) * 5.5, -L / 2 + rng.uniform(-0.5, 0.5), 2.5 + math.sin(a) * 5.5))]
            pts += [pts[0] + V((rng.uniform(-1.5, 1.5), rng.uniform(-3, -1), rng.uniform(-1.5, 1.5))) for _ in range(3)]
            hull(m, pts, CAVE[3])
        m.cyl(4.6, 0.2, (0, -L / 2 - 0.4, 2.5), CAVE[0], segs=7, rot=(math.pi / 2, 0, 0))
        # rubble round it, crust and glowing beads where water runs off it
        for k in range(14):
            y = rng.uniform(-L / 2, L / 2 - 4)
            s = 5.5 * (1 - (y + L / 2) / L)
            side = rng.choice((-1, 1))
            m.ball(rng.uniform(0.5, 1.4), (side * (s + rng.uniform(0, 2.5)), y, rng.uniform(-0.3, 0.6)), rng.choice(CAVE[1:4]), subdiv=0)
            m.ball(rng.uniform(0.5, 0.9), (rng.uniform(-0.4, 0.4) * s, y, 2.5 + s * 0.95), rng.choice((C_ORANGE[2], C_MAGENTA[2], BARNACLE)), subdiv=0)
        for k in range(10):
            y = rng.uniform(-L / 2, L / 2 - 6)
            s = 5.5 * (1 - (y + L / 2) / L)
            polyp(m, (rng.choice((-1, 1)) * s * 0.9, y, 1.0), 0.4, BIOLUM)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


# --- scenery, layered: ground cover, mid plants, a few heroes per biome ---------------------------

SCREW_BARK = ["#5a4a3e", "#7a6652", "#9a8468", "#b8a080"]
SCREW_LEAF = ("#2a5a5a", "#3e7f78", "#9ac8a8")        # dark, mid, the pale keel
SCREW_FRUIT = ["#c8401e", "#f06a2a", "#ffa040"]
CALCITE = ["#7a4a54", "#a06a70", "#c89090", "#ecc4b4", "#fae4d8"]
SHELL = ["#c8a890", "#e8d4bc", "#fff0e0"]


def screw_head(m, rng, at, n, L, cols=SCREW_LEAF, fruit=True, droop=0.75):
    """A pandanus head: a spiral rosette of stiff strap leaves, the inner ones standing up, the
    outer ones bowing over; a fat segmented fruit hung under it."""
    from props_a_lib import frond
    x, y, z = at
    a0 = rng.uniform(0, math.tau)
    for k in range(n):
        a = a0 + k * 2.4                                    # the golden angle: a screw of leaves
        outer = k < n * 0.6
        frond(m, (x, y, z), a, L * rng.uniform(0.85, 1.1) * (1 if outer else 0.75), rng.uniform(0.2, 0.25),
              cols[1] if k % 2 else cols[0], cols[2], rise=0.9 if outer else 2.2, droop=droop if outer else 0.6,
              n=3, serrate=0, fold=0.5, thick=0.04, tip=0.25)
    if fruit:
        st = mark(m)
        a = rng.uniform(0, math.tau)
        p = V((x + math.cos(a) * 0.35, y + math.sin(a) * 0.35, z - 0.45))
        m.ball(0.42, tuple(p), SCREW_FRUIT[1], subdiv=1, scale=(0.9, 0.9, 1.1), jitter=0.04)
        facet(m, new_faces(m, st), SCREW_FRUIT, noise=0.3)


def screwpine(v):
    """Scenery: a screw pine of the sandbars: a ringed trunk standing on a cone of stilt roots,
    forking into a few stiff rosettes of sea-green leaves, an orange fruit under one. Small and
    awkward and salt-proof, not a palm (2.5-5 tall). v0 forked, v1 tall and leaning, three heads,
    v2 a young one, a single rosette on its roots."""
    r = root("vesh_screwpine", v)
    rng = random.Random(9480 + v)
    m = Model(f"vesh_screwpine_{v}", 9480 + v)
    spec = {0: (2.6, (0.3, 0.1), [(-1.1, 0.4, 0.9), (1.2, -0.3, 0.6), (0.1, 1.2, 1.3)], 1.1),
            1: (3.4, (0.8, 0.3), [(-0.8, 0.9, 1.1), (1.3, 0.3, 0.6), (0.3, -1.2, 0.4), (0.9, 1.1, 1.5)], 1.0),
            2: (1.5, (0.1, 0.0), [], 1.4)}[v]
    h, lean, forks, L = spec
    st = mark(m)
    top = V((lean[0], lean[1], h))
    tube(m, [V((0, 0, 0.9)), V((lean[0] * 0.4, lean[1] * 0.4, h * 0.55)), top], [0.3, 0.26, 0.22], SCREW_BARK[1], segs=6,
         colors=[SCREW_BARK[1], SCREW_BARK[2]])
    nroots = 6 if v != 2 else 5
    for k in range(nroots):                                 # straight stilt roots, splayed like a tent
        a = k / nroots * math.tau + rng.uniform(-0.3, 0.3)
        o = rng.uniform(0.8, 1.1) * (1.15 if v == 1 else 1)
        tube(m, [V((0, 0, rng.uniform(1.0, 1.5))), V((math.cos(a) * o, math.sin(a) * o, -0.2))], [0.12, 0.15], SCREW_BARK[3], segs=4)
    heads = []
    if forks:
        for fx, fy, up in forks:
            end = top + V((fx, fy, up))
            tube(m, [top, top.lerp(end, 0.5) + V((0, 0, 0.25)), end], [0.18, 0.15, 0.13], SCREW_BARK[2], segs=5)
            heads.append(end)
    else:
        heads.append(top)
    facet(m, new_faces(m, st), SCREW_BARK, noise=0.1)
    for i, hd in enumerate(heads):
        screw_head(m, rng, tuple(hd), 8 if v != 2 else 11, L * rng.uniform(0.9, 1.05), fruit=(i == 0), droop=0.9)
    # a skirt of fallen leaves and sand round its roots
    st = mark(m)
    for k in range(3):
        a = rng.uniform(0, math.tau)
        m.box((0.9, 0.3, 0.08), (math.cos(a) * 1.0, math.sin(a) * 1.0, 0.06), "#b0905a", rot=(0, 0, a + rng.uniform(-0.6, 0.6)))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def seagrass(v):
    """Ground cover: tufts of turtle grass on the sand and the sandbars, a few shells, now and then
    a pink spike of sea lavender (under 1.2 tall)."""
    from props_a_lib import frond
    r = root("vesh_seagrass", v)
    rng = random.Random(9700 + v)
    m = Model(f"vesh_seagrass_{v}", 9700 + v)
    cols = (("#1a5e6e", "#3a9aa0"), ("#8a7428", "#d4b84e"), ("#7a2e26", "#c8603a"))[v]   # teal, straw, rust: they read on grass and sand
    tufts = {0: [(0, 0, 1.0), (1.3, 0.5, 0.8), (-0.9, 1.0, 0.7)],
             1: [(0, 0, 0.9), (-1.2, -0.4, 0.75), (0.9, -1.0, 0.7), (0.4, 1.2, 0.6)],
             2: [(0, 0, 1.1), (1.2, -0.6, 0.8)]}[v]
    for tx, ty, s in tufts:
        n = 7
        a0 = rng.uniform(0, math.tau)
        for k in range(n):
            a = a0 + k / n * math.tau + rng.uniform(-0.3, 0.3)
            frond(m, (tx, ty, -0.05), a, rng.uniform(0.9, 1.3) * s, 0.13 * s + 0.03, cols[k % 2], cols[1],
                  rise=rng.uniform(0.9, 1.4), droop=1.1, n=3, serrate=0, fold=0.3, thick=0.03, tip=0.35)
    if v == 1:
        for k in range(3):                                   # sea lavender
            a = rng.uniform(0, math.tau)
            p = V((math.cos(a) * 0.8, math.sin(a) * 0.8, 0))
            limb(m, p, p + V((0, 0, 1.0)), 0.07, 0.05, "#6a8a3a", segs=3)
            m.ball(0.22, tuple(p + V((0, 0, 1.05))), "#e070c0", subdiv=0, scale=(1, 1, 1.5))
    for k in range(2 + v % 2):                               # shells
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.9, 1.6)
        m.ball(0.22, (math.cos(a) * d, math.sin(a) * d, 0.05), rng.choice(SHELL[1:] + ["#ffb090"]), subdiv=0, scale=(1.3, 1, 0.5))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def _spiral_shell(m, rng, at, L, yaw, cols=SHELL, lip="#ffa890"):
    """A conch lying on its side: a knobbed spire tapering one way, a flared pink lip the other."""
    x, y, z = at
    st = mark(m)
    pts, radii = [], []
    for i in range(6):
        t = i / 5
        pts.append(V((-L * 0.5 + L * t, 0.08 * math.sin(t * 9), z + 0.15 + (0.45 - 0.3 * t) * L * 0.4)))
        radii.append(L * (0.08 + 0.3 * math.sin(math.pi * min(1, t * 1.25 + 0.05))) if i < 5 else 0.02)
    tube(m, pts, radii, cols[1], segs=6, colors=[cols[1], cols[0], cols[1], cols[0], cols[1]])
    for i in range(1, 4):                                    # the knobs of the whorls
        p = pts[i] + V((0, 0, radii[i] * 0.9))
        m.cyl(0.13 * L, 0.22 * L, tuple(p), cols[2], segs=4, r_top=0.02)
    facet(m, new_faces(m, st), cols, noise=0.15)
    m.prism([(-0.1 * L, 0), (0.3 * L, 0), (0.15 * L, 0.42 * L), (-0.25 * L, 0.3 * L)], 0.1 * L, (-0.05 * L, -0.28 * L, z + 0.05),
            lip, rot=(0.35, 0, 0))
    xform(m, st, M((x, y, 0), (0, 0, yaw)))


def conch(v):
    """Clutter on the sandbars: shells the size of a crate. v0 a great conch, v1 a spill of cowries
    round a fan of scallop, v2 a small giant clam, its mantle glowing between the lips."""
    r = root("vesh_conch", v)
    rng = random.Random(9720 + v)
    m = Model(f"vesh_conch_{v}", 9720 + v)
    if v == 0:
        _spiral_shell(m, rng, (0, 0, 0), 2.4, rng.uniform(0, math.tau))
        _spiral_shell(m, rng, (1.5, 1.0, 0), 1.2, rng.uniform(0, math.tau), cols=["#a07a68", "#d0a890", "#f0d8c0"])
    elif v == 1:
        st = mark(m)
        for k in range(7):                                   # a scallop: ribbed fan
            a = math.pi * (0.15 + 0.7 * k / 6)
            limb(m, (0, 0, 0.1), (math.cos(a) * 1.3, math.sin(a) * 1.3, 0.35), 0.16, 0.24, "#f08a5a" if k % 2 else "#ffb070", segs=4)
        facet(m, new_faces(m, st), ["#c85a3a", "#f08a5a", "#ffc090"], noise=0.15)
        for k in range(6):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0.7, 1.7)
            st = mark(m)
            m.ball(0.32, (math.cos(a) * d, math.sin(a) * d - 0.5, 0.05), "#e8c8a0", subdiv=1, scale=(1.4, 1, 0.65))
            facet(m, new_faces(m, st), ["#8a5a3a", "#d8b088", "#fff0d8"], noise=0.3)
    else:
        st = mark(m)
        for s in (-1, 1):                                    # two wavy valves, open a crack
            pts = [(-1.3, 0), (-1.2, 0.5), (-0.7, 0.9), (0, 1.05), (0.7, 0.9), (1.2, 0.5), (1.3, 0)]
            m.prism(pts, 0.35, (0, s * 0.35, 0), "#d8c8b8", rot=(s * 0.35, 0, 0))
        facet(m, new_faces(m, st), ["#a09088", "#c8b8a8", "#f0e4d8"], noise=0.1)
        m.box((2.2, 0.35, 0.3), (0, 0, 0.75), "#3a6ad8")
        m.box((1.6, 0.2, 0.12), (0, 0, 0.92), "#7ae8ff", glow=True)
        light(r, (0, 0, 1.4), "#7ae8ff", radius=3, intensity=0.4, halo=False)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def saltbush(v):
    """Ground cover on the bone islands: mats of fat salt succulent creeping over the sand, grey-green
    fingers with magenta flowers; v2 one the sun has turned rust-red (under 1 tall)."""
    r = root("vesh_saltbush", v)
    rng = random.Random(9740 + v)
    m = Model(f"vesh_saltbush_{v}", 9740 + v)
    cols = (["#3e5a4a", "#5e806a", "#86a88a", "#b4ccaa"], ["#3a5a52", "#587e72", "#7aa294", "#a8c8b8"],
            ["#6a2a22", "#9a4a2a", "#c8743a", "#e8a85a"])[v]
    flower = ("#ff5ab0", "#ffe070", "#fff0d0")[v]
    mats = {0: [(0, 0, 1.3), (1.4, 0.6, 0.9), (-1.1, 0.9, 0.8)],
            1: [(-1.6, 0, 0.9), (-0.4, 0.3, 1.1), (0.9, -0.1, 1.0), (2.0, 0.4, 0.7)],
            2: [(0, 0, 1.1), (1.0, -0.9, 0.8)]}[v]
    st = mark(m)
    for x, y, s in mats:
        m.ball(s, (x, y, 0.05), cols[1], subdiv=1, scale=(1.1, 1, 0.32), jitter=0.12 * s)
        for k in range(int(5 * s)):                          # fat finger leaves standing out of the mat
            a = rng.uniform(0, math.tau)
            d = s * rng.uniform(0.1, 0.75)
            b = V((x + math.cos(a) * d, y + math.sin(a) * d, 0.2))
            m.cyl(0.17, rng.uniform(0.45, 0.75), tuple(b), cols[2], segs=4, r_top=0.08,
                  rot=(rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), 0))
    facet(m, new_faces(m, st), cols, noise=0.2, bias=0.1)
    for k in range(4 + v):
        x, y, s = rng.choice(mats)
        a = rng.uniform(0, math.tau)
        d = s * rng.uniform(0.2, 0.7)
        m.cyl(0.24, 0.06, (x + math.cos(a) * d, y + math.sin(a) * d, 0.33 * s + 0.12), flower, segs=5)
        m.ball(0.1, (x + math.cos(a) * d, y + math.sin(a) * d, 0.33 * s + 0.2), "#ffe070", subdiv=0)
    if v == 1:                                               # a small bone it is creeping over
        tube(m, [V((-1.6, -0.9, 0.1)), V((0, -0.8, 0.35)), V((1.4, -1.0, 0.15))], [0.3, 0.22, 0.32], BONE[2], segs=5)
        m.ball(0.4, (-1.7, -0.9, 0.15), BONE[3], subdiv=0)
        m.ball(0.42, (1.5, -1.0, 0.18), BONE[3], subdiv=0)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def jawbone(v):
    """Scenery: the jaw of something huge, half sunk in the sand, its teeth still up. v0 the whole
    U of it, v1 one half rearing out of the shallows (2-3 tall)."""
    r = root("vesh_jawbone", v)
    rng = random.Random(9760 + v)
    m = Model(f"vesh_jawbone_{v}", 9760 + v)
    if v == 0:
        pts = []
        for i in range(9):
            t = i / 8
            a = math.pi * (0.1 + 0.8 * t)
            pts.append(V((math.cos(a) * 2.6, math.sin(a) * 3.2 - 1.2, 0.35 + 0.25 * math.sin(math.pi * t))))
        radii = [0.5, 0.45, 0.42, 0.4, 0.42, 0.4, 0.42, 0.45, 0.5]
    else:
        pts = [V((-2.4, -0.6, -0.2)), V((-1.4, -0.2, 0.7)), V((-0.2, 0.1, 1.4)), V((1.0, 0.3, 1.8)), V((2.0, 0.6, 1.5)),
               V((2.6, 0.7, 2.4))]
        radii = [0.55, 0.5, 0.46, 0.42, 0.5, 0.35]
    bone(m, pts, radii, segs=6)
    for i in range(1, len(pts) - 1):                         # the teeth, bigger towards the back
        p = pts[i]
        h = 0.55 + 0.25 * (i % 3) + (0.2 if v == 0 and i in (2, 6) else 0)
        st = mark(m)
        m.cyl(0.24, h, (p.x, p.y, p.z + radii[i] * 0.7), BONE[3], segs=4, r_top=0.05, rot=(rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), 0))
        facet(m, new_faces(m, st), BONE[1:], noise=0.1)
    if v == 0:
        st = mark(m)
        m.ball(0.75, tuple(pts[0] + V((0, -0.3, 0.2))), BONE[2], subdiv=0, scale=(1, 1.4, 0.8))
        m.ball(0.75, tuple(pts[-1] + V((0, -0.3, 0.2))), BONE[2], subdiv=0, scale=(1, 1.4, 0.8))
        facet(m, new_faces(m, st), BONE, noise=0.1)
    for k in range(6):                                       # weed and barnacles where it meets the sand
        p = rng.choice(pts)
        m.ball(rng.uniform(0.25, 0.4), (p.x + rng.uniform(-0.6, 0.6), p.y + rng.uniform(-0.6, 0.6), 0.05),
               rng.choice((WEED[0], WEED[1], BARNACLE)), subdiv=0, scale=(1.2, 1, 0.6))
    st = mark(m)
    m.cyl(2.6 if v == 0 else 1.5, 0.3, (0, 0.6, -0.25) if v == 0 else (-1.8, -0.5, -0.25), SAND[1], segs=8, r_top=2.0 if v == 0 else 1.1)
    jitter(m, new_faces(m, st), 0.15, z=False)
    xform(m, st, M(scale=(1.25, 0.9, 1)))
    facet(m, new_faces(m, st), SAND, noise=0.1)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def _plate(m, rng, at, rad, cols, rim=None, z_th=0.22):
    """A table coral's plate: a wide thin disc, its rim scalloped and a little raised, the middle
    darker where it's oldest."""
    x, y, z = at
    n = 11
    outer, inner = [], []
    for i in range(n):
        a = i / n * math.tau
        rr = rad * rng.uniform(0.8, 1.08)
        outer.append((x + math.cos(a) * rr, y + math.sin(a) * rr))
        inner.append((x + math.cos(a) * rr * 0.55, y + math.sin(a) * rr * 0.55))
    st = mark(m)
    m.slab(outer, z, z + z_th, cols[2], top=[(px + (px - x) * 0.04, py + (py - y) * 0.04) for px, py in outer])
    facet(m, new_faces(m, st), cols[1:], noise=0.1, bias=0.2)
    m.slab(inner, z + z_th, z + z_th + 0.06, cols[1])
    for i in range(1, n, 2):                                     # pale growth tips standing up round the middle
        px, py = outer[i]
        m.ball(0.2, (x + (px - x) * 0.72, y + (py - y) * 0.72, z + z_th + 0.08), cols[3], subdiv=0, scale=(1, 1, 0.7))
    if rim:
        for i in range(0, n, 2):
            px, py = outer[i]
            m.ball(0.2, (px, py, z + z_th), rim, subdiv=0, glow=True)


def table_coral(v):
    """Hero of the flats: table coral, flat plates held up on stout stalks and tiered over each
    other, so from above it is a stack of overlapping discs. v0 teal, v1 gold and amber, v2 violet
    with a rim of glowing polyps (2-3 tall, 4-5 across)."""
    r = root("vesh_table_coral", v)
    rng = random.Random(9780 + v)
    m = Model(f"vesh_table_coral_{v}", 9780 + v)
    cols = (["#155a68", "#1f7a84", "#3aa8a8", "#7ad0c0"], C_GOLD, C_VIOLET)[v]
    rim = (None, None, BIOLUM)[v]
    plates = {0: [((0, 0), 1.8, 2.2), ((2.3, 1.2), 1.1, 1.4), ((-1.9, 1.6), 0.8, 0.9)],
              1: [((0, 0), 1.4, 2.6), ((-1.5, -1.4), 1.2, 1.6), ((1.9, -0.6), 0.9, 1.0), ((0.5, 2.1), 0.7, 0.7)],
              2: [((0, 0), 2.0, 1.8), ((2.1, -1.8), 0.9, 1.1), ((-1.6, -1.9), 0.6, 0.6)]}[v]
    for (x, y), rad, h in plates:
        st = mark(m)
        tube(m, [V((x * 0.6, y * 0.6, -0.2)), V((x, y, h))], [0.45 * rad / 2 + 0.2, 0.3], cols[1], segs=5)
        facet(m, new_faces(m, st), cols[:3], noise=0.1)
        _plate(m, rng, (x, y, h), rad, cols, rim)
    if v == 1:                                               # a gold one has fish-bitten holes: dark notches
        for k in range(3):
            a = rng.uniform(0, math.tau)
            m.cyl(0.3, 0.05, (math.cos(a) * 0.9, math.sin(a) * 0.9, 2.6 + 0.29), C_GOLD[0], segs=5)
    st = mark(m)
    m.ball(1.6, (0, 0, -0.4), REEF_ROCK[1], subdiv=1, scale=(1.3, 1.1, 0.35), jitter=0.15)
    facet(m, new_faces(m, st), REEF_ROCK[:3], noise=0.1)
    if rim:
        light(r, (0, 0, 2.4), BIOLUM, radius=4, intensity=0.4, halo=False)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def _starlet(m, rng, at, s, col, col2):
    """A small starfish, flat on the ground."""
    x, y, z = at
    a0 = rng.uniform(0, math.tau)
    for k in range(5):
        a = a0 + k / 5 * math.tau
        limb(m, (x, y, z + 0.08), (x + math.cos(a) * s, y + math.sin(a) * s, z + 0.05), 0.2 * s + 0.06, 0.06, col, segs=4)
    m.ball(0.2 * s + 0.08, (x, y, z + 0.1), col2, subdiv=0, scale=(1, 1, 0.6))


def coral_rubble(v):
    """Ground cover on the flats: what the tide breaks off: bleached branches, little domes of new
    coral, a starfish or two, the odd shell (under 0.8 tall)."""
    r = root("vesh_coral_rubble", v)
    rng = random.Random(9800 + v)
    m = Model(f"vesh_coral_rubble_{v}", 9800 + v)
    st = mark(m)
    for k in range((6, 4, 7)[v]):                            # bleached broken branches
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.2, 1.8)
        p = V((math.cos(a) * d, math.sin(a) * d, 0.1))
        yaw = rng.uniform(0, math.tau)
        q = p + V((math.cos(yaw) * 0.9, math.sin(yaw) * 0.9, rng.uniform(0.0, 0.3)))
        limb(m, p, q, 0.17, 0.12, "#f4ece0", segs=4)
        if k % 2:
            limb(m, p.lerp(q, 0.5), p.lerp(q, 0.5) + V((-math.sin(yaw) * 0.5, math.cos(yaw) * 0.5, 0.3)), 0.12, 0.09, "#f4ece0", segs=4)
    facet(m, new_faces(m, st), ["#c8b8a8", "#e8dccc", "#fff8f0"], noise=0.15)
    domes = ((C_ORANGE, C_GOLD), (C_MAGENTA, C_VIOLET), (C_GOLD, C_TEAL))[v]
    for k in range((3, 5, 3)[v]):                            # young brain and button corals
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.6, 2.0)
        cols = domes[k % 2]
        st = mark(m)
        s = rng.uniform(0.35, 0.6)
        m.ball(s, (math.cos(a) * d, math.sin(a) * d, 0.0), cols[2], subdiv=1, scale=(1, 1, 0.6), jitter=0.04)
        facet(m, new_faces(m, st), cols[1:], noise=0.2)
    for k in range((1, 2, 1)[v]):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.8, 1.8)
        sc = rng.choice(((C_ORANGE[2], C_ORANGE[3]), ("#e03a4a", "#ff8a7a"), (C_VIOLET[2], C_VIOLET[3])))
        _starlet(m, rng, (math.cos(a) * d, math.sin(a) * d, 0), rng.uniform(0.55, 0.75), *sc)
    if v == 2:
        _spiral_shell(m, rng, (-1.0, 0.8, 0), 1.0, rng.uniform(0, math.tau))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def _urchin(m, rng, at, s, body, spine, tip=None, n=9, fat=False):
    x, y, z = at
    st = mark(m)
    m.ball(s, (x, y, z + s * 0.5), body, subdiv=1 if s > 0.45 else 0, scale=(1, 1, 0.75))
    facet(m, new_faces(m, st), [body, spine], noise=0.2, bias=-0.3)
    for k in range(n):
        a = k / n * math.tau + rng.uniform(-0.2, 0.2)
        up = rng.uniform(0.2, 1.0) if k else 1.4
        d = V((math.cos(a), math.sin(a), up)).normalized()
        b = V((x, y, z + s * 0.5)) + d * s * 0.7
        e = b + d * s * (0.9 if fat else 1.3)
        limb(m, b, e, 0.15 * s + (0.12 if fat else 0.04), 0.06 if fat else 0.02, spine, segs=4)
        if tip:
            m.ball(0.11 + 0.05 * s, tuple(e), tip, subdiv=0, glow=True)


def urchin(v):
    """Clutter on the reef floor: sea urchins. v0 a herd of black-violet ones with glowing spine tips
    (caves), v1 red pencil urchins with fat blunt spines, v2 one great flower urchin, its spines
    tipped with pink."""
    r = root("vesh_urchin", v)
    rng = random.Random(9820 + v)
    m = Model(f"vesh_urchin_{v}", 9820 + v)
    if v == 0:
        for k, (x, y, s) in enumerate(((0, 0, 0.55), (1.1, 0.4, 0.4), (-0.8, 0.9, 0.45), (0.4, -1.0, 0.35), (-1.2, -0.5, 0.3))):
            _urchin(m, rng, (x, y, 0), s, "#2a1438", "#4a2a6a", tip="#ff7ae8" if k % 2 else BIOLUM)
        light(r, (0, 0, 1.0), "#ff7ae8", radius=3, intensity=0.35, halo=False)
    elif v == 1:
        for k, (x, y, s) in enumerate(((0, 0, 0.5), (1.0, -0.6, 0.42), (-0.7, 0.8, 0.38))):
            _urchin(m, rng, (x, y, 0), s, "#5a1a1a", "#d8402a", n=7, fat=True)
    else:
        _urchin(m, rng, (0, 0, 0), 0.75, "#3a5a8a", "#e8e0f0", tip="#ff8ac8", n=12)
        for k in range(10):                                  # a ring of little flowers over its back
            a = k / 10 * math.tau
            m.ball(0.14, (math.cos(a) * 0.45, math.sin(a) * 0.45, 0.85), "#ffc0e0", subdiv=0)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def rimstone(v):
    """Hero of the caves: rimstone pools, terraces of calcite the dripping water built, each lip
    holding a step of glowing water, stepping down. From above: nested scalloped rings of cream
    round pools of light (under 1.5 tall)."""
    r = root("vesh_rimstone", v)
    rng = random.Random(9840 + v)
    m = Model(f"vesh_rimstone_{v}", 9840 + v)
    steps = {0: [((0, 0), 2.1, 0.7), ((0.5, 0.35), 1.4, 0.95), ((0.75, 0.6), 0.75, 1.15)],
             1: [((-2.1, 0), 1.3, 0.35), ((-0.5, 0.2), 1.5, 0.6), ((1.3, -0.1), 1.35, 0.85), ((2.6, 0.3), 0.9, 1.05)]}[v]
    water = ["#1a5a78", "#1f8a9a", TIDE_POOL]
    for i, ((x, y), rad, z) in enumerate(steps):
        n = 10
        outer = []
        for k in range(n):
            a = k / n * math.tau
            rr = rad * (1 + 0.12 * math.sin(a * 3 + i) + rng.uniform(-0.06, 0.06))
            outer.append((x + math.cos(a) * rr, y + math.sin(a) * rr))
        st = mark(m)
        foot = [(x + (px - x) * 1.15, y + (py - y) * 1.15) for px, py in outer]
        m.slab(foot, -0.2, z, CALCITE[2], top=outer)
        facet(m, new_faces(m, st), CALCITE[1:], noise=0.1)
        inner = [(x + (px - x) * 0.8, y + (py - y) * 0.8) for px, py in outer]
        m.slab(inner, z, z + 0.04, water[min(i, 2)] if i < len(steps) - 1 else TIDE_POOL, glow=(i == len(steps) - 1))
        for k in range(0, n, 3):                             # flowstone drapes over the lip
            px, py = outer[k]
            m.cyl(0.24, z * 0.8, ((px - x) * 1.05 + x, (py - y) * 1.05 + y, 0), CALCITE[3], segs=4, r_top=0.32)
    # the stub of a stalagmite that feeds it, dripping light
    x, y = steps[-1][0]
    z = steps[-1][2]
    m.cyl(0.45, 0.9, (x + 0.2, y + 0.1, z - 0.2), CALCITE[3], segs=5, r_top=0.15)
    m.ball(0.18, (x + 0.2, y + 0.1, z + 0.75), BIOLUM, subdiv=0, glow=True)
    light(r, (x, y, z + 1.2), BIOLUM, radius=4, intensity=0.45, halo=False)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def mussel_bed(v):
    """Ground cover in the caves: a rock crusted with mussels, blue-black and shining, red tube
    worms fanning out of the cracks (under 1 tall)."""
    r = root("vesh_mussel_bed", v)
    rng = random.Random(9860 + v)
    m = Model(f"vesh_mussel_bed_{v}", 9860 + v)
    st = mark(m)
    lump(m, rng, (0, 0, 0.0), (1.4 + 0.4 * v, 1.1, 0.55), CAVE[2], n=12, flat=0.6)
    if v == 1:
        lump(m, rng, (1.9, 0.6, 0.0), (0.9, 0.8, 0.4), CAVE[2], n=10, flat=0.6)
    facet(m, new_faces(m, st), CAVE[1:4], noise=0.12)
    for k in range(16 + 6 * v):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.7, 1.5 + 0.4 * v)
        x, y = math.cos(a) * d + (0.6 if v and k % 2 else 0), math.sin(a) * d * 0.8
        st = mark(m)
        m.ball(0.3, (x, y, 0.15), "#22304a", subdiv=0, scale=(1.5, 0.75, 0.6), rot=(0, rng.uniform(-0.4, 0.4), a + 1.4))
        paint(m, new_faces(m, st), lambda f: "#5a7aa8" if f.normal.z > 0.6 else ("#22304a" if f.normal.z > 0 else "#141a2a"))
    for k in range(3 + v):                                   # tube worms: a red feather fan at the top of a white tube
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.2, 0.9)
        p = V((math.cos(a) * d, math.sin(a) * d, 0.3))
        m.cyl(0.13, 0.5, tuple(p), "#f0e4d8", segs=4)
        m.cyl(0.16, 0.18, tuple(p + V((0, 0, 0.5))), "#ff4a3a", segs=5, r_top=0.36, glow=bool(k % 2))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def stalagmite(v):
    """Scenery: stalagmites of banded calcite, each standing in a skirt of flowstone, a glint of
    water on its tip (1.5-3.5 tall). v0 one tall column, v1 a pair grown together, v2 a stump the
    roof dropped a rock on: broken off, a pool in its top, two young ones beside it."""
    r = root("vesh_stalagmite", v)
    rng = random.Random(9660 + v)
    m = Model(f"vesh_stalagmite_{v}", 9660 + v)

    def column(x, y, h, rad, broken=False):
        st = mark(m)
        n = 4
        z = -0.2
        for i in range(n):                                   # stacked drums, each a little narrower and off-centre
            r0 = rad * (1 - 0.7 * i / n)
            r1 = rad * (1 - 0.7 * (i + 1) / n) if (i < n - 1 or broken) else 0.06
            hh = h / n
            m.cyl(r0, hh + 0.02, (x + rng.uniform(-0.08, 0.08), y + rng.uniform(-0.08, 0.08), z), CALCITE[2], segs=6, r_top=r1,
                  rot=(0, 0, rng.uniform(0, 1)))
            z += hh
        faces = new_faces(m, st)
        jitter(m, faces, 0.06)
        facet(m, faces, CALCITE[1:] if not broken else CALCITE[:4], noise=0.12)
        for f in faces:                                      # bands: alternate drums a shade warmer
            if int((f.calc_center_median().z + 0.2) / (h / n)) % 2 and f.normal.z < 0.7:
                f.material_index = m._slot(CAVE[2], False)
        if broken:
            m.cyl(rad * 0.25, 0.06, (x, y, z), TIDE_POOL, segs=6, glow=True)
        else:
            m.ball(0.14, (x, y, z + 0.02), BIOLUM, subdiv=0, glow=True)
        return z

    if v == 0:
        column(0, 0, 3.8, 1.0)
        skirt = [(0, 0, 1.7)]
    elif v == 1:
        column(-0.45, 0, 3.2, 0.85)
        column(0.6, 0.25, 2.2, 0.75)
        skirt = [(0, 0.1, 1.9)]
    else:
        column(0, 0, 1.3, 1.1, broken=True)
        column(1.4, 0.6, 1.4, 0.45)
        column(-1.0, 1.1, 0.9, 0.35)
        skirt = [(0.1, 0.3, 2.0)]
    for x, y, rad in skirt:                                  # a skirt of flowstone, terraced, a crescent of water in it
        st = mark(m)
        m.cyl(rad * 0.8, 0.35, (x, y, -0.25), CALCITE[2], segs=7, r_top=rad * 0.5)
        jitter(m, new_faces(m, st), 0.12, z=False)
        facet(m, new_faces(m, st), CALCITE[1:4], noise=0.1)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r



# --- round 2: life in the shallows, bones in clusters, shrubs on the islands ----------------------

KELP = ["#3a3a1a", "#5a5a22", "#7a7430", "#b0a048"]


def reef_head(v):
    """Water: a coral head breaking the surface at low tide, its crown dry, a skirt of paler coral
    under the water round it. v0 a brain dome with fans, v1 a stand of tube sponges, v2 staghorn
    with glowing tips (top under 1.5 above the water)."""
    r = root("vesh_reef_head", v)
    rng = random.Random(9900 + v)
    m = Model(f"vesh_reef_head_{v}", 9900 + v)
    st = mark(m)
    lump(m, rng, (0, 0, -0.5), (2.0, 1.7, 1.2), REEF_ROCK[1], n=12, flat=0.4)
    facet(m, new_faces(m, st), REEF_ROCK, noise=0.12)
    st = mark(m)                                                 # the drowned skirt: a pale ring just under the surface
    m.cyl(2.9, 0.2, (0, 0, -0.35), "#7ad0c8", segs=9, r_top=2.5)
    jitter(m, new_faces(m, st), 0.25, z=False)
    if v == 0:
        st = mark(m)
        m.ball(1.3, (0.2, 0, 0.35), C_ORANGE[2], subdiv=1, scale=(1.1, 1, 0.6), jitter=0.05)
        facet(m, new_faces(m, st), C_ORANGE[1:], noise=0.15)
        fan(m, rng, (-1.0, 0.8, 0.0), 2.0, 0.5, 1.0, 1.4, C_MAGENTA, s=0.8)
        fan(m, rng, (1.2, -0.9, 0.0), 4.2, 0.6, 0.9, 1.2, C_VIOLET, s=0.7)
    elif v == 1:
        tube_sponges(m, rng, (0, 0, 0.3), 6, C_GOLD, "#ff6a9a", 0.9, (0.8, 1.6), rad=(0.35, 0.5))
    else:
        for k in range(4):
            a = k / 4 * math.tau + rng.uniform(-0.3, 0.3)
            staghorn(m, rng, V((0, 0, 0.4)), V((math.cos(a) * 0.8, math.sin(a) * 0.8, 0.6)).normalized(), 1.0, 0.26, 1, C_VIOLET)
        light(r, (0, 0, 1.0), BIOLUM, radius=3, intensity=0.4, halo=False)
    for k in range(5):
        a = rng.uniform(0, math.tau)
        m.ball(rng.uniform(0.25, 0.4), (math.cos(a) * 1.8, math.sin(a) * 1.5, -0.1), rng.choice((BARNACLE, WEED[1], "#ff7a90")), subdiv=0)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def kelp_mat(v):
    """Water: a raft of bladder weed afloat on the lagoon, gold-brown and lumpy with floats, a
    seabird's worth of white on it. Flat: it reads as a shape on the water (under 0.4)."""
    r = root("vesh_kelp_mat", v)
    rng = random.Random(9920 + v)
    m = Model(f"vesh_kelp_mat_{v}", 9920 + v)
    blobs = {0: 5, 1: 8, 2: 4}[v]
    pts = []
    x = y = 0.0
    for k in range(blobs):                                       # a wandering chain of weed
        pts.append((x, y))
        a = rng.uniform(-0.8, 0.8) + (0 if v != 1 else k * 0.4)
        x += math.cos(a) * 1.2
        y += math.sin(a) * 1.2
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    for px, py in pts:
        px -= cx
        py -= cy
        st = mark(m)
        m.ball(rng.uniform(0.8, 1.2), (px, py, -0.05), KELP[1], subdiv=1, scale=(1.3, 1, 0.14), jitter=0.12, rot=(0, 0, rng.uniform(0, 3)))
        facet(m, new_faces(m, st), KELP, noise=0.25, bias=0.1)
        for j in range(2):
            m.ball(0.2, (px + rng.uniform(-0.6, 0.6), py + rng.uniform(-0.6, 0.6), 0.1), KELP[3], subdiv=0)
    if v == 2:                                                   # something's nest on it
        m.ball(0.45, (0.2, 0.1, 0.15), "#f0ece0", subdiv=0, scale=(1, 1, 0.5))
        m.ball(0.18, (0.2, 0.1, 0.3), "#a0d8e0", subdiv=0)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def bone_tip(v):
    """Water: the tips of drowned bones breaking the surface: v0 three rib tips in a curving row,
    v1 a vertebra's crest with barnacles, v2 one great tusk (top under 3)."""
    r = root("vesh_bone_tip", v)
    rng = random.Random(9940 + v)
    m = Model(f"vesh_bone_tip_{v}", 9940 + v)
    if v == 0:
        for k in range(3):
            x = (k - 1) * 1.8
            y = 0.4 * (k - 1) ** 2
            h = 2.2 - 0.4 * abs(k - 1)
            bone(m, [V((x, y, -0.8)), V((x + 0.3, y, h * 0.6)), V((x + 0.9, y + 0.1, h))], [0.45, 0.38, 0.1], segs=6)
    elif v == 1:
        vertebra(m, rng, (0, 0, -0.9), 1.1, axis=rng.uniform(0, 3), crest=0.8)
    else:
        bone(m, [V((0, 0, -0.8)), V((0.6, 0.2, 1.2)), V((1.6, 0.3, 2.4)), V((2.6, 0.1, 2.6))], [0.7, 0.55, 0.32, 0.06], segs=7)
    for k in range(8):                                           # barnacles and weed at the waterline, a foam ring
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.6, 1.6)
        m.ball(rng.uniform(0.2, 0.35), (math.cos(a) * d, math.sin(a) * d, 0.05), rng.choice((BARNACLE, WEED[0], WEED[1], "#f4f8f8")),
               subdiv=0, scale=(1.2, 1, 0.5))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def skiff(v):
    """Water: a reef pirates' skiff, moored to a stake: a patched hull, a battened rag of a sail
    furled on its boom, a lantern; v1 with a float-net strung out behind it."""
    r = root("vesh_skiff", v)
    rng = random.Random(9960 + v)
    m = Model(f"vesh_skiff_{v}", 9960 + v)
    hull_col = ("#8a5a3a", "#5a6a6a")[v]
    m.prism([(-0.75, 0.45), (0.75, 0.45), (0.55, -0.3), (-0.55, -0.3)], 3.4, (0, 0, 0.1), hull_col, rot=(0, 0, 0))
    m.prism([(-0.75, 0.45), (0.75, 0.45), (0, -0.3)], 1.0, (0, 2.1, 0.1), hull_col)            # the bow, a wedge
    m.box((1.3, 3.2, 0.12), (0, 0, 0.5), "#c8a870")                                          # the deck boards
    m.box((1.3, 0.4, 0.08), (0, -0.6, 0.58), "#a8804a")
    m.box((0.2, 0.2, 2.2), (0, 0.6, 0.5), MANGROVE_BARK[0])                                  # the mast
    sail = ("#c83a4a", "#d8b060")[v]
    m.box((0.5, 2.6, 0.35), (0.05, -0.2, 1.5), sail, rot=(0, 0, 0.05))                     # the furled sail
    for k in range(3):
        m.box((0.55, 0.12, 0.4), (0.05, -1.2 + k * 1.0, 1.5), "#3a2a2a")
    m.box((0.35, 0.35, 0.35), (0.4, -1.4, 0.75), LANTERN, glow=True)
    m.cyl(0.18, 2.0, (0.2, 3.4, -0.6), MANGROVE_BARK[0], segs=5)                             # the mooring stake
    limb(m, (0, 2.5, 0.6), (0.2, 3.4, 1.1), 0.06, 0.06, ROPE, segs=3)
    if v == 1:
        for k in range(5):
            m.ball(0.22, (-0.4 + k * 0.1, -2.3 - k * 0.9, 0.05), ("#ff6a3a", "#f0e0c0")[k % 2], subdiv=0)
    light(r, (0.4, -1.4, 1.3), LANTERN, radius=4, intensity=0.5, flicker=0.15)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def ribcage(v):
    """Scenery: the chest of something huge, half buried: a spine of vertebrae trailing off across
    the sand, ribs arching up out of it on both sides, saltbush in its shade (top under 4)."""
    r = root("vesh_ribcage", v)
    rng = random.Random(9980 + v)
    m = Model(f"vesh_ribcage_{v}", 9980 + v)
    n = (5, 4)[v]
    bend = (0.08, -0.12)[v]
    spine = []
    for k in range(n + 2):                                       # the spine, sinking towards its tail
        a = k * bend
        x = sum(math.cos(j * bend) for j in range(k)) * 1.7 - 4
        y = sum(math.sin(j * bend) for j in range(k)) * 1.7
        s = 0.8 * (1 - 0.1 * k)
        spine.append((x, y, a, s))
        vertebra(m, rng, (x, y, 0.3 - 0.1 * k), s, axis=a, crest=0.6)
    for k in range(min(n, 4)):                                   # ribs up out of the sand, both sides, the far ones broken
        x, y, a, s = spine[k]
        for side in (-1, 1):
            if v == 1 and side == 1 and k > 1:
                continue
            nx, ny = -math.sin(a) * side, math.cos(a) * side
            L = 3.4 - 0.4 * k
            pts = [V((x, y, 0.4)), V((x + nx * L * 0.45, y + ny * L * 0.45, L * 0.75)), V((x + nx * L * 0.85, y + ny * L * 0.85, L * 0.75)),
                   V((x + nx * L * 1.05 + 0.3, y + ny * L * 1.05, L * (0.25 if k % 2 else 0.05)))]
            bone(m, pts, [0.32, 0.28, 0.24, 0.12], segs=5)
    for k in range(5):
        x, y, a, s = rng.choice(spine)
        m.ball(rng.uniform(0.3, 0.5), (x + rng.uniform(-1.5, 1.5), y + rng.uniform(-1.5, 1.5), 0.05), rng.choice((WEED[0], "#5e806a", BARNACLE)),
               subdiv=0, scale=(1.3, 1, 0.5))
    st = mark(m)
    m.cyl(4.0, 0.3, (0, 0, -0.25), SAND[1], segs=9, r_top=3.4)
    jitter(m, new_faces(m, st), 0.3, z=False)
    xform(m, st, M(scale=(1.3, 0.85, 1)))
    facet(m, new_faces(m, st), SAND, noise=0.1)
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def tide_pool(v):
    """Scenery: rock pools left on the islands by the tide: a rim of worn pink rock round still
    water, a starfish, anemones, weed (under 0.8 tall)."""
    r = root("vesh_tide_pool", v)
    rng = random.Random(10000 + v)
    m = Model(f"vesh_tide_pool_{v}", 10000 + v)
    pools = {0: [((0, 0), 1.6)], 1: [((-1.2, 0.2), 1.2), ((1.0, -0.4), 1.0), ((0.2, 1.4), 0.7)], 2: [((0, 0), 2.1)]}[v]
    for (x, y), R in pools:
        st = mark(m)
        k = 0
        a = 0.0
        while a < math.tau - 0.3:
            w = rng.uniform(0.5, 0.8) * R ** 0.5
            lump(m, rng, (x + math.cos(a) * R, y + math.sin(a) * R, 0.0), (w, w * 0.8, rng.uniform(0.3, 0.55)), REEF_ROCK[1], n=8, flat=0.6)
            a += w / R * 1.4
        facet(m, new_faces(m, st), REEF_ROCK, noise=0.12)
        m.cyl(R * 0.95, 0.1, (x, y, 0.0), ("#1f7a8a", "#2a90a0", "#1a6a88")[v], segs=9)
        m.cyl(R * 0.5, 0.1, (x + 0.2, y + 0.1, 0.02), "#3ab8c0", segs=7)
        m.ball(0.3, (x - R * 0.4, y + R * 0.3, 0.1), rng.choice((C_MAGENTA[2], "#ff7a90", C_TEAL[2])), subdiv=0)
    x, y = pools[0][0]
    _starlet(m, rng, (x + 0.3, y - 0.3, 0.02), 0.55, *rng.choice(((C_ORANGE[2], C_ORANGE[3]), ("#e03a4a", "#ff8a7a"))))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def sea_grape(v):
    """Scenery: sea grape bushes on the lagoon islands: mounds of big round leathery leaves held
    flat to the sun, each a coin of light, some flushed red, bunches of purple grapes (1-2 tall)."""
    r = root("vesh_sea_grape", v)
    rng = random.Random(10020 + v)
    m = Model(f"vesh_sea_grape_{v}", 10020 + v)
    cols = (["#1e4a2a", "#2e6a3a", "#4a8a48", "#7aae5a"], ["#24503a", "#356e4a", "#5a9a5a", "#9ac870"],
            ["#3a4a24", "#5a6a2e", "#8a8a3a", "#c0b050"])[v]
    mounds = {0: [((0, 0), 1.3, 1.4)], 1: [((-0.9, 0), 1.0, 1.1), ((0.9, 0.4), 1.1, 1.6)], 2: [((0, 0), 1.0, 0.9), ((1.3, -0.6), 0.7, 0.7)]}[v]
    for (x, y), R, h in mounds:
        st = mark(m)
        m.ball(R, (x, y, h * 0.5), cols[0], subdiv=1, scale=(1.1, 1, h / R * 0.55), jitter=0.1)
        facet(m, new_faces(m, st), cols[:2], noise=0.1)
        n = int(9 * R)
        for k in range(n):                                       # the leaves: round plates laid over the mound
            a = rng.uniform(0, math.tau)
            d = R * rng.uniform(0.0, 0.95)
            z = h * 0.5 + h * 0.5 * math.sqrt(max(0.0, 1 - (d / R) ** 2)) + 0.05
            red = rng.random() < 0.1
            col = "#b8402a" if red else rng.choice(cols[1:])
            m.cyl(rng.uniform(0.38, 0.5), 0.08, (x + math.cos(a) * d, y + math.sin(a) * d, z), col, segs=6,
                  rot=(rng.uniform(-0.35, 0.35) + math.sin(a) * d / R * 0.5, -math.cos(a) * d / R * 0.5, rng.uniform(0, 1)))
        for k in range(2):
            a = rng.uniform(0, math.tau)
            m.ball(0.22, (x + math.cos(a) * R * 0.8, y + math.sin(a) * R * 0.8, h * 0.6), "#6a2a7a", subdiv=0, scale=(1, 1, 1.4))
    m.build(r, rot_z=rng.uniform(0, math.tau))
    return r


def build():
    for v in range(2):
        coral_arch(v)
        coral_pinnacles(v)
        giant_clam(v)
        starfish(v)
        spine_span(v)
        skull_gate(v)
        carcass(v)
        bone_spike(v)
        mangrove_span(v)
        sea_stacks(v)
        blue_hole(v)
        shack(v)
        cave_arch(v)
        grotto(v)
    pirate_cove(0)
    for v in range(3):
        anemone(v)
        pillar_coral(v)
        bone_scatter(v)
        stalagmite(v)
        screwpine(v)
        seagrass(v)
        conch(v)
        saltbush(v)
        table_coral(v)
        coral_rubble(v)
        urchin(v)
    for v in range(3):
        reef_head(v)
        kelp_mat(v)
        bone_tip(v)
        tide_pool(v)
        sea_grape(v)
    for v in range(2):
        skiff(v)
        ribcage(v)
        jawbone(v)
        rimstone(v)
        mussel_bed(v)
