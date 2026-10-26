"""MIREFALL, the Peat Marsh (docs/level-design.md, its layout row). Morang's lowland bog: a raised
mire of rust-red and ochre moss over black water, fog lying in it. Three hands on it:

- the mire's own: its pools and strings, its hummocks of moss, the wood that drowned standing when
  the water came back (silver-grey snags, hollow, their limbs broken off), the trunks it threw down;
- the Compact's, from the two years in 169 L when settlers drained it to farm: the poplars they
  planted along their drains, drowned standing in their rows, the pump-house and its wind-pump, the
  prefab cabins, a tractor, fence lines walking into the water;
- the Rang's, who come out from the temple to cut peat for its hearth-lamps: turves stacked to dry,
  plank trackways out to the banks, way-poles with a lamp, turf huts, barrows and spades.

Built into set_mirefall (see its build())."""
from __future__ import annotations

import math
import random

from mathutils import Vector

from kit import Model, animate, light
from props_a_lib import collider, recolor, root, sway, tube
from set_mirefall_temple import (BLOOM, BLOOM_TOP, CLOTH, LAMP, SAC, SAC_TOP, SOOT, THATCH, THATCH_TOP, WOOD,
                                 WOOD_TOP, _blooms, _shade)

# drowned wood, silvered: grey with a cool cast, paler where the sun has had it
SNAG = ["#aaa296", "#9a9288", "#b4ac9e"]
SNAG_TOP = "#ddd4c4"
SNAG_DARK = "#5c5652"
# the tide mark: the trunk dark and wet where the water stands, a pale dry band above it
WET = "#3e3834"
DRY = "#c4bcac"
HOLLOW = "#231c1a"
# what grows on the dead wood: brackets of rust and ochre, a beard of grey lichen
BRACKET = ["#b07a42", "#9a6036", "#c08e4e"]
BRACKET_TOP = "#dcae6a"
LICHEN = "#a6ac98"
# the Compact's poplars: a warmer grey, the bark still peeling off in dark strips
POPLAR = ["#a89e90", "#9a9082", "#b2a898"]
POPLAR_TOP = "#d8cebe"
BARK = "#4a3e36"
# the moss: rust-red, ochre, olive; lit tops paler
MOSS = ["#74483a", "#8a5638", "#94804a", "#666842", "#74443e"]
MOSS_TOP = ["#94664e", "#b07850", "#b8a266", "#8a8c5a", "#96605a"]
HEATHER = ["#6a4458", "#5a3a4a"]
COTTON = "#bdb6a8"
SEDGE = ["#7a7244", "#6a6438", "#8a8050"]
# peat: the cut face banded, the turves dark, their tops dried paler
PEAT = ["#3a2a22", "#46342a", "#523e30"]
PEAT_TOP = "#6e5644"
PEAT_DRY = "#7a6250"
MUD = "#2e2420"
# old planks, grey-brown, worn pale on top
PLANK = ["#6e6050", "#7a6a58", "#62564a"]
PLANK_TOP = "#a8987e"
# the Compact's prefab: faded cream panels, a teal band, corrugated roofs gone grey, rust
PANEL = ["#c6bea6", "#b8b098", "#cfc7ae"]
PANEL_TOP = "#e2dcc8"
TEAL = "#4c7c84"
ROOF = ["#7e8884", "#6c7672"]
ROOF_TOP = "#a8b2ac"
RUST = ["#8a4c30", "#7a4028", "#9a5a36"]
RUST_TOP = "#b8784a"
IRON = "#3c3a3a"
GLASS = "#2a3436"
# the tractor's paint, what's left of it
PAINT = ["#a8643a", "#94562e"]
# the Rang's peat-lamps: warmer, lower than the Tonkva's hearths
PEAT_LAMP = "#ffb070"


def _ring(n, R, z, rng, wob=0.0, x=0.0, y=0.0):
    return [(x + math.cos(k * math.tau / n) * R * (1 + rng.uniform(-wob, wob)), y + math.sin(k * math.tau / n) * R * (1 + rng.uniform(-wob, wob)), z)
            for k in range(n)]


def _splinters(m, rng, p, R, n, color, h=0.6):
    """A snapped end: jagged teeth of wood standing round its rim."""
    fs = []
    for k in range(n):
        a = k * math.tau / n + rng.uniform(-0.3, 0.3)
        hh = rng.uniform(0.25, 1.0) * h
        fs += list(m.box((R * 0.55, R * 0.4, hh), (p.x + math.cos(a) * R * 0.62, p.y + math.sin(a) * R * 0.62, p.z + hh / 2 - 0.05), color,
                         rot=(rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), a), taper=0.25))
    return fs


def _bracket(m, rng, p, a, R):
    """A shelf of bracket fungus on a trunk, facing out at angle a: two or three stacked half-discs."""
    fs = []
    for k in range(rng.randint(2, 3)):
        r = R * (1 - 0.22 * k)
        c = Vector((p.x + math.cos(a) * r * 0.5, p.y + math.sin(a) * r * 0.5, p.z - k * r * 0.55))
        fs += list(m.cyl(r, r * 0.22, c, BRACKET[k % 3], segs=7, r_top=r * 0.8))
    _shade(m, fs, BRACKET_TOP, None, dot=0.6)


def _beard(m, rng, p, n=3, L=1.0):
    """Lichen hanging off a limb in grey strands."""
    for k in range(n):
        dx, dy = rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25)
        ln = L * rng.uniform(0.6, 1.1)
        m.box((0.12, 0.12, ln), (p.x + dx, p.y + dy, p.z - ln / 2), LICHEN, taper=0.3)


def _limb(m, rng, base, a, up, L, r, color, snapped=True, twig=True):
    """A dead limb from `base`, out at angle a, rising `up` (radians): bending as it goes, snapped
    off short or tapering to a point; a twig off it now and then."""
    pts = []
    d = Vector((math.cos(a) * math.cos(up), math.sin(a) * math.cos(up), math.sin(up)))
    p = Vector(base)
    for k in range(4):
        pts.append(p.copy())
        d = (d + Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), rng.uniform(-0.15, 0.1)))).normalized()
        p = p + d * (L / 3)
    radii = [r, r * 0.8, r * 0.6, r * (0.45 if snapped else 0.0)]
    fs = tube(m, pts, radii, color, segs=5)
    if snapped:
        fs += _splinters(m, rng, pts[-1], radii[-1] * 1.2, 3, color, h=0.35)
    if twig and L > 1.6:
        for q, f in ((pts[1], 0.45), (pts[2], 0.38)):
            if f == 0.45 and rng.random() < 0.5:
                continue
            b = a + rng.choice((-1, 1)) * rng.uniform(0.5, 1.0)
            fs += tube(m, [q, q + Vector((math.cos(b) * L * f, math.sin(b) * L * f, L * 0.2))], [r * 0.5, 0.0], color, segs=4)
    return fs, pts[-1]


def _snag(m, rng, H, R, nlimbs, hollow=True, lean=0.0, low=0.0, limb_len=(2.2, 3.8), sink=1.3, beard=True, brackets=2):
    """A tree that drowned standing: its trunk silvered, flared at the foot where its roots go down
    into the water, a dark wet band at the waterline and a pale one above; its crown gone, the limbs
    left broken short; hollow at the top, or snapped to teeth."""
    la = rng.uniform(0, math.tau)
    pts, radii, cols = [], [], []
    n = 6
    for k in range(n + 1):
        t = k / n
        z = -sink + (H + sink) * t
        kink = 0.25 * math.sin(t * 5 + rng.uniform(0, 3)) * t
        pts.append(Vector((math.cos(la) * lean * t * t * H + kink, math.sin(la) * lean * t * t * H, z)))
        radii.append(R * (1.5 - 0.5 * min(1, t * 4)) * (1 - 0.38 * t))
    wood = SNAG
    for k in range(n):
        z = pts[k].z
        cols.append(WET if z < 0.6 else DRY if z < 1.5 else SNAG[k % 3])
    fs = tube(m, pts, radii, wood[0], segs=7, colors=cols)
    # the root flare: buttresses spreading down into the water
    for k in range(5):
        a = k * math.tau / 5 + rng.uniform(-0.3, 0.3)
        p0 = Vector((0, 0, 0.9))
        p1 = Vector((math.cos(a) * R * 1.9, math.sin(a) * R * 1.9, -0.1))
        p2 = Vector((math.cos(a) * R * 2.6, math.sin(a) * R * 2.6, -0.8))
        tube(m, [p0, p1, p2], [R * 0.55, R * 0.35, 0.05], WET, segs=4)
    top = pts[-1]
    rt = radii[-1]
    if hollow:
        # a rim of teeth round a dark well: from above, a ring and its hole
        fs += _splinters(m, rng, top, rt, 5, wood[2], h=0.8)
        m.cyl(rt * 0.72, 0.1, (top.x, top.y, top.z - 0.02), HOLLOW, segs=7)
    else:
        fs += _splinters(m, rng, top, rt, 4, wood[1], h=1.2)
    tips = []
    for k in range(nlimbs):
        t = rng.uniform(max(low, 0.45), 0.92)
        i = min(n - 1, int(t * n))
        base = pts[i].lerp(pts[i + 1], t * n - i)
        a = la + k * math.tau / nlimbs + rng.uniform(-0.5, 0.5)
        L = rng.uniform(*limb_len) * (1.1 - 0.4 * t)
        lf, tip = _limb(m, rng, base, a, rng.uniform(0.25, 0.65), L, radii[i] * 0.5, wood[k % 3], snapped=rng.random() < 0.6)
        fs += lf
        tips.append((tip, a, base))
    _shade(m, fs, SNAG_TOP, SNAG_DARK, dot=0.6)
    if beard:
        for tip, a, base in tips[:2]:
            _beard(m, rng, base.lerp(tip, 0.6), n=rng.randint(2, 4), L=rng.uniform(0.6, 1.2))
    for k in range(brackets):
        z = rng.uniform(1.6, H * 0.6)
        t = (z + sink) / (H + sink)
        i = min(n - 1, int(t * n))
        p = pts[i].lerp(pts[i + 1], t * n - i)
        _bracket(m, rng, p, rng.uniform(0, math.tau), min(0.7, radii[i] * 0.75))
    return pts, radii


def snag(variants):
    """Trees that drowned standing, when the bog's water came back over the ground the Compact had
    drained: silver-grey and hollow, their crowns gone to broken limbs; brackets and lichen on them.
    0–3 standing trees of different builds, 4 a broken hollow trunk, 5 a stump (and, bared by the
    hags' gullies, a bog oak four thousand years drowned). All under the flight line (the stand's
    tall ones are the elders)."""
    builds = [
        dict(H=6.6, R=0.62, nlimbs=5),
        dict(H=5.6, R=0.55, nlimbs=4, lean=0.06),
        dict(H=7.0, R=0.7, nlimbs=6, hollow=False),
        dict(H=4.8, R=0.5, nlimbs=3, lean=0.1, limb_len=(1.6, 2.6)),
        dict(H=3.0, R=0.72, nlimbs=1, limb_len=(0.8, 1.4), brackets=3),
        dict(H=1.4, R=0.66, nlimbs=0, beard=False, brackets=1),
    ]
    for i in range(variants):
        rng = random.Random(8000 + i)
        r = root("mirefall_peat_snag", i)
        m = Model(f"mirefall_peat_snag_{i}", 8000 + i)
        _snag(m, rng, **builds[i % len(builds)])
        m.build(r)


def elder(variants):
    """The drowned wood's eldest, taller than you fly: a vast silver trunk, its broken limbs held out
    over you. Two stand either side of the way in; a few more in the stand. Colliders on the trunk."""
    for i in range(variants):
        rng = random.Random(8050 + i)
        r = root("mirefall_peat_elder", i)
        m = Model(f"mirefall_peat_elder_{i}", 8050 + i)
        pts, radii = _snag(m, rng, H=17.5 - i * 1.5, R=1.25, nlimbs=0, hollow=i == 0, sink=1.6, beard=False, brackets=4)
        # the great limbs, high, reaching out over the flight line
        fs = []
        for k in range(4 + i):
            t = rng.uniform(0.62, 0.92)
            n = len(pts) - 1
            j = min(n - 1, int(t * n))
            base = pts[j].lerp(pts[j + 1], t * n - j)
            a = k * math.tau / (4 + i) + rng.uniform(-0.4, 0.4)
            lf, tip = _limb(m, rng, base, a, rng.uniform(0.15, 0.45), rng.uniform(4.0, 6.5), radii[j] * 0.45, SNAG[k % 3])
            fs += lf
            _beard(m, rng, base.lerp(tip, 0.5), n=4, L=1.6)
        _shade(m, fs, SNAG_TOP, SNAG_DARK, dot=0.6)
        m.build(r)
        collider(r, 0, 0, 1.5)


def poplar(variants):
    """The Compact's poplars, planted in rows along their drains to break the wind, drowned standing
    when the pumps stopped: straight and narrow, whorls of short dead shoots up them, bark peeling in
    dark strips. 0 whole, 1 snapped at half its height, 2 leaning, 3 young."""
    for i in range(variants):
        rng = random.Random(8100 + i)
        r = root("mirefall_peat_poplar", i)
        m = Model(f"mirefall_peat_poplar_{i}", 8100 + i)
        H = [7.2, 3.6, 6.8, 4.6][i % 4]
        R = [0.36, 0.38, 0.34, 0.24][i % 4]
        lean = (0.12 if i % 4 == 2 else 0.0)
        pts = [Vector((lean * (k / 6) ** 2 * H, 0, -1.0 + (H + 1.0) * k / 6)) for k in range(7)]
        radii = [R * (1.35 - 0.95 * (k / 6) ** 1.4) for k in range(7)]
        cols = [WET if p.z < 0.5 else POPLAR[k % 3] for k, p in enumerate(pts[:-1])]
        if i % 4 == 1:
            radii[-1] = R * 0.75
        else:
            radii[-1] = 0.0
        fs = tube(m, pts, radii, POPLAR[0], segs=6, colors=cols)
        if i % 4 == 1:
            fs += _splinters(m, rng, pts[-1], R * 0.8, 4, POPLAR[2], h=0.9)
            # its top, lying in the water beside it
            fs += tube(m, [Vector((0.6, 0.4, 0.15)), Vector((2.4, 2.2, 0.0)), Vector((3.8, 3.9, -0.1))], [R * 0.7, R * 0.5, 0.0], POPLAR[1], segs=5)
        # whorls of short dead shoots, angled up: from above, a bristling narrow crown
        zs = [z for z in [1.8 + 0.75 * k for k in range(10)] if z < H - 0.4]
        for k, z in enumerate(zs):
            t = (z + 1.0) / (H + 1.0)
            j = min(5, int(t * 6))
            c = pts[j].lerp(pts[j + 1], t * 6 - j)
            ln = (2.2 - 1.4 * t) * (0.7 if i % 4 == 3 else 1.0)
            for q in range(3):
                a = k * 1.1 + q * math.tau / 3 + rng.uniform(-0.3, 0.3)
                tip = c + Vector((math.cos(a) * ln * 0.6, math.sin(a) * ln * 0.6, ln * 0.8))
                fs += tube(m, [c, tip], [max(0.1, R * 0.4), 0.0], POPLAR[(k + q) % 3], segs=4)
        _shade(m, fs, POPLAR_TOP, SNAG_DARK, dot=0.6)
        for k in range(4):                                                  # the bark coming off
            z = rng.uniform(0.8, H * 0.7)
            a = rng.uniform(0, math.tau)
            t = (z + 1.0) / (H + 1.0)
            rr = R * (1.35 - 0.95 * t ** 1.4)
            m.box((0.16, 0.1, rng.uniform(0.6, 1.4)), (math.cos(a) * rr + lean * t * t * H, math.sin(a) * rr, z), BARK, rot=(0, 0, a))
        m.build(r)


def log(variants):
    """A drowned tree the wind threw down, lying half sunk along +x: its root plate torn up on end at
    -x (a wall of roots and peat), its limbs broken off to stubs, moss along its back."""
    for i in range(variants):
        rng = random.Random(8150 + i)
        r = root("mirefall_peat_log", i)
        m = Model(f"mirefall_peat_log_{i}", 8150 + i)
        L = [9.0, 7.0, 11.0][i % 3]
        R = [0.62, 0.52, 0.75][i % 3]
        x0 = -L / 2
        pts = [Vector((x0 + L * k / 5, 0.35 * math.sin(k * 1.3 + i), 0.15 + 0.12 * math.sin(k * 0.9))) for k in range(6)]
        radii = [R * (1.1 - 0.5 * k / 5) for k in range(6)]
        fs = tube(m, pts, radii, SNAG[0], segs=7, colors=[SNAG[k % 3] for k in range(5)])
        fs += _splinters(m, rng, pts[-1] + Vector((0.1, 0, 0)), radii[-1], 4, SNAG[2], h=0.4)
        # the root plate, on end: a ragged disc of peat with roots out round it
        pr = R * 2.8
        disc = m.cyl(pr, 0.6, (x0 - 0.2, 0, 0.6), PEAT[1], segs=9, rot=(0, math.pi / 2, 0))
        for k in range(9):
            a = k * math.tau / 9 + rng.uniform(-0.2, 0.2)
            c = Vector((x0 - 0.3, math.cos(a) * pr * 0.8, 0.6 + math.sin(a) * pr * 0.8))
            tip = c + Vector((rng.uniform(-0.8, -0.2), math.cos(a) * rng.uniform(0.8, 1.6), math.sin(a) * rng.uniform(0.8, 1.6)))
            if tip.z < -0.5:
                tip.z = -0.5
            tube(m, [c, tip], [0.16, 0.0], WET, segs=4)
        _shade(m, disc, PEAT_TOP, MUD, dot=0.5)
        m.ball(pr * 0.55, (x0 - 0.6, 0, 0.2), MUD, subdiv=1, scale=(1.0, 1.6, 0.35), jitter=0.06)
        for k in range(3 + i % 2):                                          # the limbs, broken to stubs, up and out
            t = rng.uniform(0.3, 0.9)
            j = min(4, int(t * 5))
            c = pts[j].lerp(pts[j + 1], t * 5 - j)
            a = rng.choice((-1, 1)) * rng.uniform(0.6, 1.6)
            lf, _ = _limb(m, rng, c, a, rng.uniform(0.4, 1.0), rng.uniform(0.8, 1.8), radii[j] * 0.4, SNAG[k % 3], twig=False)
            fs += lf
        _shade(m, fs, SNAG_TOP, SNAG_DARK, dot=0.6)
        for k in range(4):                                                  # moss along its back
            t = rng.uniform(0.1, 0.8)
            j = min(4, int(t * 5))
            c = pts[j].lerp(pts[j + 1], t * 5 - j)
            mf = m.ball(radii[j] * 0.9, (c.x, c.y, c.z + radii[j] * 0.75), MOSS[3], subdiv=1, scale=(1.6, 0.9, 0.35), jitter=0.04)
            _shade(m, mf, MOSS_TOP[3], None, dot=0.8)
        if i == 2:
            _bracket(m, rng, pts[2] + Vector((0, radii[2] * 0.6, 0.3)), math.pi / 2, 0.6)
        m.build(r)


# --- the moss ---------------------------------------------------------------------------------

def cushion(variants):
    """A hummock of bog moss, the mire's own small form: low lumpy cushions, rust-red, ochre or olive
    (each mostly one, the way the mosses keep to their own heights), the dry ones a crown of heather.
    0 red, 1 ochre, 2 olive, 3 a big mixed one."""
    for i in range(variants):
        rng = random.Random(8200 + i)
        r = root("mirefall_peat_cushion", i)
        m = Model(f"mirefall_peat_cushion_{i}", 8200 + i)
        main = [0, 2, 3, 1][i % 4]
        n = [5, 5, 6, 9][i % 4]
        spread = [0.9, 0.9, 1.0, 1.6][i % 4]
        for k in range(n):
            a = rng.uniform(0, math.tau)
            d = spread * math.sqrt(rng.random()) if k else 0
            c = main if rng.random() < 0.75 else rng.choice((1, 4) if main == 0 else (2, 3))   # (the red keeps to itself)
            R = rng.uniform(0.45, 0.75) * (1.2 if k == 0 else 1)
            fs = m.ball(R, (math.cos(a) * d, math.sin(a) * d, R * 0.12), MOSS[c], subdiv=1, scale=(1.1, 1.0, 0.55), jitter=0.05)
            _shade(m, fs, MOSS_TOP[c], None, dot=0.8)
        if i % 4 in (1, 3):
            for k in range(1 + i // 3):                                     # heather on its crown
                a = rng.uniform(0, math.tau)
                d = rng.uniform(0.0, spread * 0.4)
                hf = m.ball(0.55, (math.cos(a) * d, math.sin(a) * d, 0.45), HEATHER[k % 2], subdiv=1, scale=(1.2, 1, 0.6), jitter=0.06)
                _shade(m, hf, "#7a5868", None, dot=0.7)
        m.build(r)


def cotton(variants):
    """Cotton-grass in the wet hollows: a tuft of sedge, its heads a soft pale wool. Grouped thick, so
    a stand of it reads as one pale drift, never as specks."""
    for i in range(variants):
        rng = random.Random(8250 + i)
        r = root("mirefall_peat_cotton", i)
        m = Model(f"mirefall_peat_cotton_{i}", 8250 + i)
        n = [14, 20, 10][i % 3]
        spread = [0.6, 0.9, 0.45][i % 3]
        heads = []
        for k in range(n):
            a = rng.uniform(0, math.tau)
            d = spread * math.sqrt(rng.random())
            x, y = math.cos(a) * d, math.sin(a) * d
            h = rng.uniform(0.6, 1.1)
            tx, ty = x + math.cos(a) * 0.25, y + math.sin(a) * 0.25
            m.plank_line((x, y, 0), (tx, ty, h), 0.07, 0.05, SEDGE[k % 3])
            if k % 2 == 0:
                heads.append((tx, ty, h))
        for k, (x, y, h) in enumerate(heads):
            m.ball(rng.uniform(0.17, 0.22), (x, y, h + 0.08), COTTON, subdiv=1, scale=(1, 1, 0.8), jitter=0.03)
        m.ball(spread * 0.9, (0, 0, 0.05), SEDGE[1], subdiv=1, scale=(1.1, 1.0, 0.25), jitter=0.04)
        m.build(r)


# --- the Rang's cutting -----------------------------------------------------------------------

def _turf(m, rng, x, y, z, rot=(0, 0, 0), dry=0.5):
    """One cut turf: a dark brick of peat, its top dried paler."""
    fs = list(m.box((0.62, 0.3, 0.2), (x, y, z), PEAT[rng.randrange(3)], rot=rot))
    _shade(m, fs, PEAT_DRY if rng.random() < dry else PEAT_TOP, MUD, dot=0.6)
    return fs


def turves(variants):
    """The Rang's peat, drying: 0 a row of stooks (turves leaned together in little tents), 1 a clamp
    (the dried turves built into a long stack, a turf roof on it), 2 a fresh spread laid flat in rows
    where they were cut. Rows along x."""
    for i in range(variants):
        rng = random.Random(8300 + i)
        r = root("mirefall_peat_turves", i)
        m = Model(f"mirefall_peat_turves_{i}", 8300 + i)
        if i == 0:
            for k in range(5):
                cx = -2.0 + k * 1.0 + rng.uniform(-0.1, 0.1)
                cy = rng.uniform(-0.15, 0.15)
                for q in range(4):
                    a = q * math.tau / 4 + rng.uniform(-0.2, 0.2)
                    _turf(m, rng, cx + math.cos(a) * 0.2, cy + math.sin(a) * 0.2, 0.3, rot=(math.sin(a) * 1.1, -math.cos(a) * 1.1, a + math.pi / 2), dry=0.7)
                _turf(m, rng, cx, cy, 0.62, rot=(0, 0, rng.uniform(0, 3)), dry=1)
        elif i == 1:
            for c in range(4):                                              # courses, staggered
                w = 1.4 - c * 0.22
                for k in range(int(3.4 / 0.64)):
                    x = -1.6 + k * 0.64 + (0.3 if c % 2 else 0)
                    if abs(x) > 1.75 - c * 0.15:
                        continue
                    for s in (-1, 1):
                        _turf(m, rng, x, s * w * 0.3, 0.1 + c * 0.21, rot=(0, 0, rng.uniform(-0.05, 0.05)), dry=0.6)
            roof = m.ball(1.0, (0, 0, 0.85), PEAT[2], subdiv=1, scale=(1.9, 0.75, 0.38), jitter=0.04)
            _shade(m, roof, PEAT_DRY, MUD, dot=0.7)
            for k in range(3):                                              # a sod of moss on its top to keep the rain off
                mf = m.ball(0.4, (-0.9 + k * 0.9, rng.uniform(-0.1, 0.1), 1.15), MOSS[3], subdiv=1, scale=(1.4, 1, 0.3), jitter=0.03)
                _shade(m, mf, MOSS_TOP[3], None, dot=0.8)
        else:
            for row in range(3):
                for k in range(6):
                    _turf(m, rng, -1.8 + k * 0.72 + rng.uniform(-0.05, 0.05), -0.6 + row * 0.6 + rng.uniform(-0.05, 0.05), 0.08,
                          rot=(0, 0, rng.uniform(-0.12, 0.12)), dry=0.25)
        m.build(r)


def track(variants):
    """The Rang's plank trackway over the soft ground, 6 long along y: planks laid across two runners
    on short piles. 0 whole, 1 broken (planks gone, one end sagged into the water)."""
    for i in range(variants):
        rng = random.Random(8350 + i)
        r = root("mirefall_peat_track", i)
        m = Model(f"mirefall_peat_track_{i}", 8350 + i)
        fs = []
        n = 17
        for s in (-1, 1):                                                   # the runners
            m.box((0.22, 6.0, 0.2), (s * 0.68, 0, 0.18), PLANK[2])
            for k in range(4):
                m.cyl(0.1, 1.2, (s * 0.8, -2.6 + k * 1.75, -0.9), PLANK[k % 3], segs=4)
        for k in range(n):
            y = -3.0 + 0.18 + k * 0.354
            if i == 1 and (k in (4, 5, 9, 12, 13, 14) or (k > 6 and rng.random() < 0.2)):
                continue
            sag = -0.35 * max(0, (y - 1.0) / 2.0) if i == 1 else 0.0
            fs += list(m.box((1.8 + rng.uniform(-0.15, 0.15), 0.3, 0.1), (rng.uniform(-0.06, 0.06), y, 0.33 + sag),
                             PLANK[k % 3], rot=(0, 0, rng.uniform(-0.06, 0.06))))
        _shade(m, fs, PLANK_TOP, None, dot=0.8)
        m.build(r)


def pole(variants):
    """A Rang way-pole, set along the trackways out to the banks: a tall pole, a crossbar hung with
    strips of cloth dyed with bloom-rust, a peat-lamp at its end. 0 lit, 1 dark and leaning."""
    for i in range(variants):
        rng = random.Random(8400 + i)
        r = root("mirefall_peat_pole", i)
        m = Model(f"mirefall_peat_pole_{i}", 8400 + i)
        lean = 0.0 if i == 0 else 0.16
        top = Vector((lean * 4.6, 0, 4.6))
        fs = tube(m, [Vector((0, 0, -0.6)), top * 0.5, top], [0.16, 0.13, 0.1], WOOD[0], segs=5)
        for k in range(5):                                                  # turves heaped round its foot
            a = k * math.tau / 5
            _turf(m, rng, math.cos(a) * 0.45, math.sin(a) * 0.45, 0.12, rot=(0, 0, a + 1.57))
        bar = top - Vector((lean * 0.6, 0, 0.6))
        m.plank_line(bar - Vector((0.8, 0, 0)), bar + Vector((0.8, 0, 0)), 0.12, 0.12, WOOD[2])
        rm = Model(f"mirefall_peat_pole_rags_{i}", 8410 + i)
        for k in range(4):
            x = -0.6 + k * 0.4
            ln = rng.uniform(0.7, 1.3)
            rm.box((0.22, 0.05, ln), (x, 0, -ln / 2), CLOTH[k % 3] if i == 0 else "#7a6a62", rot=(0, 0, rng.uniform(-0.2, 0.2)))
        ro = rm.build(r, loc=(bar.x, bar.y, bar.z))
        sway(ro, f"mirefall_peat_pole_{i}_rags_idle", amp=(0.12, 0.05), period=2.6 + i * 0.4, phase=i)
        if i == 0:
            p = bar + Vector((0.8, 0, -0.1))
            m.plank_line(p, p - Vector((0, 0, 0.45)), 0.05, 0.05, IRON)
            m.box((0.38, 0.38, 0.42), (p.x, p.y, p.z - 0.7), WOOD[2])
            m.box((0.28, 0.4, 0.3), (p.x, p.y, p.z - 0.7), PEAT_LAMP, glow=True)
            light(r, (p.x, p.y, p.z - 0.6), PEAT_LAMP, radius=4.0, intensity=0.7, flicker=0.2)
        _shade(m, fs, WOOD_TOP, None, dot=0.8)
        m.build(r)


def turf_hut(variants):
    """Where the cutters sleep out on the bog: a low hut walled with turves in courses, a reed roof
    held down with ropes weighted with stones, a smoke hole, a lamp at the door. Door to -y. 0 with a
    clamp of peat beside it, 1 with a drying rack."""
    for i in range(variants):
        rng = random.Random(8450 + i)
        r = root("mirefall_peat_turf_hut", i)
        m = Model(f"mirefall_peat_turf_hut_{i}", 8450 + i)
        L, W, h = 3.4, 2.4, 1.2
        wall = []
        for c in range(5):                                                  # turf walls, staggered courses
            z = 0.1 + c * 0.22
            for s in (-1, 1):
                for k in range(6):
                    x = -L / 2 + 0.3 + k * 0.58 + (0.29 if c % 2 else 0)
                    if x > L / 2 - 0.2:
                        continue
                    wall += list(m.box((0.56, 0.32, 0.21), (x, s * (W / 2 - 0.16), z), PEAT[(k + c) % 3]))
                for k in range(4):
                    y = -W / 2 + 0.35 + k * 0.58 + (0.29 if c % 2 else 0)
                    if y > W / 2 - 0.2:
                        continue
                    if s < 0 and c < 4 and abs(y) < 0.4:
                        continue
                    wall += list(m.box((0.32, 0.56, 0.21), (s * (L / 2 - 0.16), y, z), PEAT[(k + c + 1) % 3]))
        _shade(m, wall, PEAT_TOP, MUD, dot=0.6)
        m.box((0.6, 0.12, 0.9), (-L / 2 + 0.05, 0, 0.5), SOOT, rot=(0, 0, math.pi / 2))
        roof = m.gable((L + 0.3, W + 0.2, 1.3), (0, 0, h), THATCH[0], overhang=0.3, thick=0.25)
        sun = Vector((-0.4, -0.5, 0.3)).normalized()
        for f in roof:
            f.normal_update()
        recolor(m, roof, lambda f: (THATCH_TOP if f.normal.dot(sun) > 0.2 else "#8a7650") if f.normal.z > 0.3 else None)
        for e in (-1, 1):                                                   # hipped ends of reed
            m.prism([(-W / 2 - 0.3, 0), (W / 2 + 0.3, 0), (0, 1.3)], 0.3, (e * (L / 2 + 0.05), 0, h), THATCH[1], rot=(0, 0, math.pi / 2))
        for k in range(3):                                                  # ropes over the roof, stones on their ends
            x = -L / 2 + 0.7 + k * (L - 1.4) / 2
            for s in (-1, 1):
                m.plank_line((x, 0, h + 1.32), (x, s * (W / 2 + 0.4), h + 0.2), 0.06, 0.06, WOOD[2])
                m.ball(0.17, (x, s * (W / 2 + 0.45), h - 0.05), "#6a6460", subdiv=0)
        m.box((0.5, 0.5, 0.2), (0.6, 0, h + 1.25), SOOT)
        m.cyl(0.06, 1.3, (-L / 2 - 0.4, -0.7, 0), WOOD[2], segs=4)
        m.ball(0.2, (-L / 2 - 0.4, -0.7, 1.4), PEAT_LAMP, subdiv=0, glow=True)
        light(r, (-L / 2 - 0.4, -0.7, 1.6), PEAT_LAMP, radius=3.5, intensity=0.6, flicker=0.2)
        if i == 0:
            for k in range(6):                                              # a little clamp at its side
                _turf(m, rng, L / 2 + 0.7, -0.9 + k * 0.36, 0.1 + (k % 2) * 0.21, rot=(0, 0, math.pi / 2))
                _turf(m, rng, L / 2 + 0.7, -0.75 + k * 0.3, 0.52, rot=(0, 0, math.pi / 2), dry=1)
        else:
            for s in (-1, 1):
                m.cyl(0.08, 1.6, (L / 2 + 0.9, s * 1.0, 0), WOOD[1], segs=4)
            m.box((0.1, 2.2, 0.1), (L / 2 + 0.9, 0, 1.6), WOOD[2])
            for k in range(4):
                m.box((0.3, 0.14, 0.8), (L / 2 + 0.9, -0.75 + k * 0.5, 1.15), (CLOTH[k % 3], BLOOM[k % 3])[k % 2])
        m.build(r)


def tools(variants):
    """The cutters' things, left at the bank: 0 a barrow heaped with turves, 1 a slane (the peat
    spade) stood in the face and a pile of fresh turves, 2 a sledge for hauling them over the moss."""
    for i in range(variants):
        rng = random.Random(8500 + i)
        r = root("mirefall_peat_tools", i)
        m = Model(f"mirefall_peat_tools_{i}", 8500 + i)
        fs = []
        if i == 0:
            fs += list(m.box((1.0, 1.4, 0.4), (0, 0, 0.55), WOOD[0], taper=1.15))
            m.cyl(0.32, 0.12, (0, 0.85, 0.32), WOOD[2], segs=8, rot=(0, math.pi / 2, 0))
            for s in (-1, 1):
                m.plank_line((s * 0.35, -0.6, 0.6), (s * 0.4, -1.5, 0.75), 0.08, 0.08, WOOD[1])
                m.plank_line((s * 0.35, -0.5, 0.4), (s * 0.35, -0.6, 0.0), 0.08, 0.08, WOOD[1])
            for k in range(6):
                _turf(m, rng, rng.uniform(-0.25, 0.25), rng.uniform(-0.45, 0.45), 0.85 + (k // 3) * 0.2, rot=(0, 0, rng.uniform(0, 3)), dry=0.3)
        elif i == 1:
            for k in range(7):
                _turf(m, rng, rng.uniform(-0.5, 0.5), rng.uniform(-0.4, 0.4), 0.1 + (k // 4) * 0.2, rot=(0, 0, rng.uniform(0, 3)), dry=0.2)
            m.plank_line((0.9, 0.2, 0.0), (1.0, 0.25, 1.4), 0.08, 0.08, WOOD[1])
            m.box((0.3, 0.06, 0.4), (0.88, 0.2, 0.1), IRON)
            m.box((0.3, 0.08, 0.08), (1.0, 0.25, 1.45), WOOD[2])
        else:
            for s in (-1, 1):
                fs += list(m.box((0.14, 2.4, 0.16), (s * 0.55, 0, 0.1), WOOD[2]))
            for k in range(5):
                fs += list(m.box((1.3, 0.22, 0.08), (0, -0.9 + k * 0.45, 0.22), PLANK[k % 3]))
            for k in range(8):
                _turf(m, rng, (k % 2 - 0.5) * 0.6, -0.8 + (k // 2) * 0.5, 0.36 + (k % 3 == 0) * 0.2, dry=0.6)
        _shade(m, fs, WOOD_TOP, None, dot=0.8)
        m.build(r)


# --- the Compact's farm -----------------------------------------------------------------------

def _corrugated(m, size, loc, cols, top, ridge_x=True, rot=0.0):
    """A roof of corrugated sheet: stripes running down its fall, light and dark."""
    L, W, H = size
    fs = list(m.gable((L, W, H), loc, cols[0], overhang=0.2, rot=(0, 0, rot), thick=0.12))
    sun = Vector((-0.4, -0.5, 0.3)).normalized()
    for f in fs:
        f.normal_update()
    recolor(m, fs, lambda f: (top if f.normal.dot(sun) > 0.15 else cols[1]) if f.normal.z > 0.3 else None)
    c, s = math.cos(rot), math.sin(rot)
    n = int(L / 0.45)
    for k in range(n):
        u = -L / 2 + 0.22 + k * 0.45
        if k % 2:
            continue
        for side in (-1, 1):
            v = side * (W / 4 + 0.05)
            m.box((0.12, W / 2 + 0.2, 0.05), (loc[0] + u * c - v * s, loc[1] + u * s + v * c, loc[2] + H / 2 + 0.1), cols[1],
                  rot=(-side * math.atan2(H, W / 2), 0, rot))
    return fs


def _cabin(m, rng, x, y, z, L, W, h, rot=0.0, caved=False):
    """A Compact prefab cabin: cream panels with a teal band, dark windows, a shallow corrugated roof
    (caved in: a hole full of the bloom)."""
    c, s = math.cos(rot), math.sin(rot)
    at = lambda u, v: (x + u * c - v * s, y + u * s + v * c)              # noqa: E731
    fs = list(m.box((L, W, h), (*at(0, 0), z + h / 2), PANEL[0], rot=(0, 0, rot)))
    m.box((L + 0.04, W + 0.04, 0.22), (*at(0, 0), z + h * 0.62), TEAL, rot=(0, 0, rot))
    m.box((L + 0.06, W + 0.06, 0.3), (*at(0, 0), z + 0.15), RUST[1], rot=(0, 0, rot))
    for k in range(3):
        u = -L / 2 + L * (k + 0.5) / 3
        m.box((0.6, 0.06, 0.45), (*at(u, -W / 2 - 0.02), z + h * 0.42), GLASS, rot=(0, 0, rot))
    m.box((0.7, 0.06, h * 0.75), (*at(L / 2 - 0.6, -W / 2 - 0.03), z + h * 0.38), RUST[0], rot=(0, 0, rot))
    if caved:
        for side in (-1, 1):
            rf = list(m.box((L * 0.45, W * 0.55, 0.1), (*at(side * L * 0.27, side * 0.12), z + h + 0.15), ROOF[0],
                            rot=(side * 0.25, side * 0.12, rot)))
            _shade(m, rf, ROOF_TOP, None, dot=0.6)
        m.box((L * 0.3, W * 0.9, 0.1), (*at(0, 0), z + h * 0.55), SOOT, rot=(0, 0, rot))
        _blooms(m, rng, *at(0, 0), z + h * 0.5, n=5, spread=0.7)
    else:
        _corrugated(m, (L + 0.3, W + 0.4, 0.45), (*at(0, 0), z + h), ROOF, ROOF_TOP, rot=rot)
    _shade(m, fs, PANEL_TOP, None, dot=0.8)


def cabin(variants):
    """The settlers' cabins, from the two years they farmed here: 0 standing, a water tank on legs
    beside it; 1 its roof caved in, the bloom grown up inside; 2 sunk to its windows and listing,
    moss on its roof. Doors to -y."""
    for i in range(variants):
        rng = random.Random(8550 + i)
        r = root("mirefall_peat_cabin", i)
        m = Model(f"mirefall_peat_cabin_{i}", 8550 + i)
        if i == 0:
            _cabin(m, rng, 0, 0, 0, 4.2, 2.6, 2.0)
            for k in range(4):                                              # the tank on its legs
                a = k * math.tau / 4 + 0.78
                m.cyl(0.08, 1.6, (2.9 + math.cos(a) * 0.55, 0.6 + math.sin(a) * 0.55, 0), IRON, segs=4)
            tf = m.cyl(0.8, 1.2, (2.9, 0.6, 1.6), RUST[2], segs=8, r_top=0.8)
            _shade(m, tf, RUST_TOP, None, dot=0.8)
            m.cyl(0.5, 0.06, (2.9, 0.6, 2.81), RUST[1], segs=8)
        elif i == 1:
            _cabin(m, rng, 0, 0, 0, 4.4, 2.8, 2.0, caved=True)
        else:
            _cabin(m, rng, 0, 0, -0.9, 4.0, 2.6, 2.0, rot=0.08)
            for k in range(3):
                mf = m.ball(0.6, (-1.2 + k * 1.2, rng.uniform(-0.4, 0.4), 1.45), MOSS[(k + 2) % 5], subdiv=1, scale=(1.4, 1.1, 0.35), jitter=0.04)
                _shade(m, mf, MOSS_TOP[(k + 2) % 5], None, dot=0.8)
        m.build(r)


def pumphouse(variants):
    """The Compact's pump-house at the main drain's outfall, that kept this ground dry for two years:
    a brick-and-panel engine house, its roof half fallen in, the outfall pipe out of its front (-y)
    with a rusted flap; and beside it the wind-pump on its lattice tower, its wheel still turning
    when the wind gets up, pumping nothing."""
    for i in range(variants):
        rng = random.Random(8600 + i)
        r = root("mirefall_peat_pumphouse", i)
        m = Model(f"mirefall_peat_pumphouse_{i}", 8600 + i)
        L, W, h = 5.0, 3.8, 2.8
        fs = list(m.box((L + 0.6, W + 0.6, 0.7), (0, 0, 0.15), "#6a5e54"))          # its plinth
        fs += list(m.box((L, W, h), (0, 0, 0.5 + h / 2), PANEL[1]))
        m.box((L + 0.04, W + 0.04, 0.3), (0, 0, 0.5 + h * 0.7), TEAL)
        m.box((L + 0.06, W + 0.06, 0.5), (0, 0, 0.75), RUST[0])
        for k in range(2):
            m.box((0.7, 0.06, 0.8), (-1.2 + k * 2.4, -W / 2 - 0.02, 0.5 + h * 0.5), GLASS)
        # half the roof fallen in: the near half standing, the far a dark hole with beams across it
        half = list(m.box((L + 0.3, W / 2 + 0.3, 0.14), (0, -W / 4, 0.5 + h + 0.2), ROOF[0], rot=(-0.08, 0, 0)))
        _shade(m, half, ROOF_TOP, None, dot=0.6)
        for k in range(int((L + 0.3) / 0.45)):
            if k % 2 == 0:
                m.box((0.12, W / 2 + 0.3, 0.05), (-L / 2 - 0.05 + 0.22 + k * 0.45, -W / 4, 0.5 + h + 0.29), ROOF[1], rot=(-0.08, 0, 0))
        m.box((L - 0.3, W / 2 - 0.2, 0.1), (0, W / 4, 0.5 + h * 0.4), SOOT)
        for k in range(3):
            m.box((0.18, W / 2, 0.18), (-L / 2 + 1.0 + k * 1.5, W / 4, 0.5 + h + 0.05), RUST[1], rot=(0.2 * (k - 1), 0, 0))
        _blooms(m, rng, 0.8, W / 4, 0.5 + h * 0.45, n=4, spread=0.9)
        # the engine's stack
        sf = m.cyl(0.32, 2.2, (-L / 2 + 0.8, W / 4, 0.5 + h), RUST[2], segs=6)
        _shade(m, sf, RUST_TOP, None)
        # the outfall: a big pipe out of the front into the drain, its flap hanging
        pf = m.cyl(0.55, 2.4, (0.6, -W / 2, 0.6), IRON, segs=8, rot=(math.pi / 2, 0, 0))
        _shade(m, pf, "#6a6866", None, dot=0.5)
        m.cyl(0.62, 0.12, (0.6, -W / 2 - 2.4, 0.6), RUST[1], segs=8, rot=(math.pi / 2 + 0.3, 0, 0))
        # the wind-pump beside it: four legs tapering to a head, braced
        tx, ty = L / 2 + 2.2, 0.8
        H = 7.0
        for k in range(4):
            a = k * math.tau / 4 + math.pi / 4
            m.plank_line((tx + math.cos(a) * 1.1, ty + math.sin(a) * 1.1, 0), (tx + math.cos(a) * 0.3, ty + math.sin(a) * 0.3, H), 0.12, 0.12, IRON)
        for z in (1.8, 3.6, 5.3):
            w = 1.1 - 0.8 * z / H
            for k in range(4):
                a0 = k * math.tau / 4 + math.pi / 4
                a1 = a0 + math.tau / 4
                m.plank_line((tx + math.cos(a0) * w, ty + math.sin(a0) * w, z), (tx + math.cos(a1) * w, ty + math.sin(a1) * w, z), 0.07, 0.07, IRON)
        m.box((0.6, 1.2, 0.4), (tx, ty + 0.2, H + 0.1), RUST[0])
        m.box((0.06, 1.6, 0.9), (tx, ty + 1.4, H + 0.3), RUST[2])                 # the tail vane
        wheel = Model(f"mirefall_peat_pumphouse_wheel_{i}", 8610 + i)
        for k in range(14):
            a = k * math.tau / 14
            wheel.box((0.08, 0.32, 1.6), (math.cos(a) * 1.1, 0, math.sin(a) * 1.1), PANEL[k % 3] if k % 3 else RUST[1],
                      rot=(0, -a + math.pi / 2, 0))
        wheel.cyl(0.4, 0.2, (0, 0.1, 0), IRON, segs=8, rot=(math.pi / 2, 0, 0))
        wo = wheel.build(r, loc=(tx, ty - 0.5, H + 0.25))
        wo.rotation_euler = (-0.5, 0, 0)
        animate(wo, f"mirefall_peat_pumphouse_{i}_wheel_idle", "rotation_euler",
                [(0, (-0.5, 0, 0)), (4, (-0.5, math.pi, 0)), (8, (-0.5, math.tau, 0))])
        _shade(m, fs, PANEL_TOP, None, dot=0.8)
        m.build(r)


def silo(variants):
    """The farm's tanks: 0 a feed silo still standing, rust running down it, the bloom climbing; 1 a
    water tank fallen on its side, half sunk."""
    for i in range(variants):
        rng = random.Random(8650 + i)
        r = root("mirefall_peat_silo", i)
        m = Model(f"mirefall_peat_silo_{i}", 8650 + i)
        if i == 0:
            fs = []
            for k in range(4):
                fs += m.cyl(1.4, 1.3, (0, 0, k * 1.3), (PANEL[k % 3], RUST[0], PANEL[1], RUST[2])[k], segs=10)
            fs += m.cyl(1.5, 1.1, (0, 0, 5.2), ROOF[0], segs=10, r_top=0.25)
            _shade(m, fs, ROOF_TOP, None, dot=0.5)
            for k in range(3):
                _blooms(m, rng, 1.1, -0.6 + k * 0.3, 0.6 + k * 1.3, n=3, spread=0.4, sacs=k == 0)
            m.plank_line((-1.45, 0, 0), (-1.45, 0, 5.2), 0.12, 0.3, IRON)
        else:
            fs = m.cyl(1.3, 5.5, (-2.75, 0, 0.2), RUST[2], segs=10, rot=(0, math.pi / 2, 0))
            _shade(m, fs, RUST_TOP, RUST[1], dot=0.7)
            for k in range(3):
                m.cyl(1.36, 0.25, (-2.0 + k * 1.8, 0, 0.2), RUST[1], segs=10, rot=(0, math.pi / 2, 0))
            m.cyl(0.9, 0.1, (2.8, 0, 0.2), SOOT, segs=10, rot=(0, math.pi / 2, 0))
            mf = m.ball(0.7, (-1.0, 0.2, 1.4), MOSS[3], subdiv=1, scale=(1.6, 0.9, 0.3), jitter=0.04)
            _shade(m, mf, MOSS_TOP[3], None, dot=0.8)
        m.build(r)


def tractor(variants):
    """The settlers' tractor, sunk to its axles where it was left in the second spring: its paint
    gone to rust in patches, its cab frame empty, moss on its seat."""
    for i in range(variants):
        rng = random.Random(8700 + i)
        r = root("mirefall_peat_tractor", i)
        m = Model(f"mirefall_peat_tractor_{i}", 8700 + i)
        z0 = -0.5
        fs = list(m.box((1.1, 2.6, 0.9), (0, 0.5, z0 + 1.05), PAINT[0], taper=0.9))
        fs += list(m.box((1.3, 1.2, 0.7), (0, -0.9, z0 + 1.1), PAINT[1]))
        m.box((0.9, 0.3, 0.6), (0, 1.85, z0 + 1.0), IRON)
        for s in (-1, 1):
            wf = m.cyl(1.0, 0.55, (s * 0.95, -0.9, z0 + 1.0), "#2e2a28", segs=10, rot=(0, math.pi / 2, 0))
            m.cyl(0.55, 0.6, (s * 0.95, -0.9, z0 + 1.0), RUST[1], segs=8, rot=(0, math.pi / 2, 0))
            m.cyl(0.55, 0.35, (s * 0.75, 1.3, z0 + 0.55), "#2e2a28", segs=8, rot=(0, math.pi / 2, 0))
            m.plank_line((s * 0.6, -1.4, z0 + 1.4), (s * 0.6, -1.4, z0 + 2.9), 0.1, 0.1, IRON)
            m.plank_line((s * 0.6, -0.3, z0 + 1.4), (s * 0.6, -0.3, z0 + 2.9), 0.1, 0.1, IRON)
            _shade(m, wf, "#4a4642", None, dot=0.5)
        rf = list(m.box((1.4, 1.4, 0.1), (0, -0.85, z0 + 2.95), ROOF[0]))
        _shade(m, rf, ROOF_TOP, None, dot=0.7)
        m.cyl(0.1, 1.2, (0.3, 1.2, z0 + 1.5), IRON, segs=5)
        for k in range(4):
            m.box((rng.uniform(0.3, 0.6), rng.uniform(0.3, 0.6), 0.05), (rng.uniform(-0.4, 0.4), rng.uniform(-0.2, 1.4), z0 + 1.51), RUST[k % 3])
        mf = m.ball(0.35, (0, -0.8, z0 + 1.55), MOSS[3], subdiv=1, scale=(1.2, 1, 0.5))
        _shade(m, mf, MOSS_TOP[3], None, dot=0.8)
        _shade(m, fs, "#c8804e", None, dot=0.8)
        m.build(r)


def fence(variants):
    """A fence line of the settlers' fields, 7 long along x, walking off into the water: posts with
    the wire sagging between; 0 standing, 1 its posts leaning and the wire down."""
    for i in range(variants):
        rng = random.Random(8750 + i)
        r = root("mirefall_peat_fence", i)
        m = Model(f"mirefall_peat_fence_{i}", 8750 + i)
        tops = []
        for k in range(6):
            x = -3.5 + k * 1.4
            lean = rng.uniform(-0.08, 0.08) + (rng.uniform(-0.5, 0.5) if i == 1 else 0)
            h = rng.uniform(1.1, 1.35) * (0.6 if i == 1 and k % 3 == 2 else 1)
            top = (x + math.sin(lean) * h, 0, h * math.cos(lean) - 0.4)
            m.plank_line((x, 0, -0.4), top, 0.16, 0.16, PLANK[k % 3])
            tops.append(top)
        for row in (0.85, 0.45):
            for a, b in zip(tops, tops[1:]):
                za, zb = a[2] * row, b[2] * row
                mid = ((a[0] + b[0]) / 2, 0, (za + zb) / 2 - (0.15 if i == 0 else 0.35))
                m.plank_line((a[0], 0, za), mid, 0.04, 0.04, IRON)
                m.plank_line(mid, (b[0], 0, zb), 0.04, 0.04, IRON)
        m.build(r)


def build():
    snag(6)
    elder(2)
    poplar(4)
    log(3)
    cushion(4)
    cotton(3)
    turves(3)
    track(2)
    pole(2)
    turf_hut(2)
    tools(3)
    cabin(3)
    pumphouse(1)
    silo(2)
    tractor(1)
    fence(2)
