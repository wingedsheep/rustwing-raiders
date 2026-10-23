"""KESSRA, the Monolith Field: the Tonkva's ledger-beacons, raised about 1,300 years ago and
waking (docs/lore/tonkva.md, docs/lore/history.md). Each beacon is a dark six-sided shaft banded
with the ledger's lines, crowned with a Tonkva face: a moth's broad head, two great compound
eyes that glow again like a hearth, a ruff of fur at the neck and two plumed antennae swept back.
The dunes have marched over the field since, so a beacon stands whole, or sunk to its ruff, or
lies where it fell. Between them the counts, in stones, and at the middle of each reading ring the
hearth the faces look at. Built into set_kessra (see its build())."""
from __future__ import annotations

import math
import random

import bmesh
from mathutils import Matrix, Vector

from kit import Model
from props_a_lib import collider, hull, lump, recolor, ribbon, root, tube

# the ledger-stone: dark and cool against the iron sand, its tops lit
LEDGER = ["#3c3850", "#46405c", "#34304a"]
LEDGER_TOP = "#b8aec8"
LEDGER_DARK = "#24202e"
# the carved lines of the count: pale grooves, never lit (only the eyes glow)
LINE = "#8a82a0"
# the face and its plumes: a paler stone, lilac grey, the fur picked out
MASK = ["#9a90ae", "#8a809e", "#a89ebc"]
MASK_TOP = "#d6cee2"
FUR = ["#7a6e8e", "#6a5e7e"]
FUR_TOP = "#b8acc8"
PLUME = ("#c4bad4", "#9a8eb0")
# the eyes, a hearth's amber; a dead one dark
EYE = "#e8a860"
EYE_HOT = "#f4cc96"
EYE_DEAD = "#3a2c34"
EMBER = "#ff8a3a"
SAND = ["#c87a4a", "#d08a58", "#d89a68"]
SAND_TOP = "#e8b07a"


def _shade(m, faces, top, shade=None, dot=0.7, sun=(-0.5, -0.4, 0.2), shade_dot=-0.35):
    L = Vector(sun).normalized()
    for f in faces:
        if f.is_valid:
            f.normal_update()

    def fn(f):
        if top and f.normal.z > dot:
            return top
        if shade and f.normal.dot(L) < shade_dot:
            return shade
        return None
    recolor(m, faces, fn)


def _move(m, faces, mat):
    """Moves the verts of `faces` by a matrix (a part built upright, then laid down)."""
    verts = {v for f in faces if f.is_valid for v in f.verts}
    bmesh.ops.transform(m.bm, matrix=mat, verts=list(verts))


def _drifts(m, rng, cx, cy, R, n=6, size=(1.8, 1.3, 0.6), lee=(0.0, 0.0)):
    """Sand heaped round a foot, piled higher on the lee side (`lee`: the way the wind goes)."""
    fs = []
    for k in range(n):
        a = k * math.tau / n + rng.uniform(-0.3, 0.3)
        dx, dy = math.cos(a), math.sin(a)
        heap = 1 + max(0.0, dx * lee[0] + dy * lee[1]) * 0.8
        fs += lump(m, rng, (cx + dx * R, cy + dy * R, 0), (size[0] * heap, size[1] * heap, size[2] * heap), SAND[k % 3], n=16, flat=0.6)
    _shade(m, fs, SAND_TOP, None, dot=0.6)
    return fs


def _hexshaft(m, z0, z1, r0, r1, color, rot=0.0, x=0.0, y=0.0):
    return list(m.cyl(r0, z1 - z0, (x, y, z0), color, segs=6, r_top=r1, rot=(0, 0, rot)))


def _bands(m, rng, z, r, n=6, x=0.0, y=0.0, rot=0.0):
    """A band of the count round a shaft at height z: a raised collar with notches cut in it."""
    fs = list(m.cyl(r * 1.08, 0.36, (x, y, z), LEDGER[1], segs=6, rot=(0, 0, rot)))
    for k in range(6):
        if rng.random() < 0.45:
            continue
        a = rot + (k + 0.5) * math.tau / 6
        d = r * 1.02 * math.cos(math.pi / 6)
        m.box((r * 0.42, 0.14, 0.5 + 0.5 * (k % 2)), (x + math.cos(a) * (d + 0.05), y + math.sin(a) * (d + 0.05), z - 0.6), LINE,
              rot=(0, 0, a + math.pi / 2))
    return fs


def _head(m, rng, s=1.0, lit=(True, True), plumes=(1.0, 1.0)):
    """A Tonkva face, built at the origin looking -y, its neck at z = 0: the ruff, the broad head,
    two compound eyes, the plumes swept back. `lit`: each eye's glow; `plumes`: how much of each
    antenna is left (0: broken off at the brow). Returns the faces."""
    fs = []
    # the ruff: chunky tufts round the neck, flaring out and down
    for k in range(9):
        a = k * math.tau / 9 + rng.uniform(-0.1, 0.1)
        dx, dy = math.cos(a), math.sin(a)
        c = (dx * 1.25 * s, dy * 1.15 * s, 0.35 * s)
        t = list(m.box((0.9 * s, 0.7 * s, 1.1 * s), c, FUR[k % 2], rot=(-dy * 0.55, dx * 0.55, a), taper=0.55))
        fs += t
        _shade(m, t, FUR_TOP, LEDGER_DARK, dot=0.55)
    # the head: broad across the eyes, a sloped brow, a blunt muzzle
    W, D, H = 1.65 * s, 1.15 * s, 2.5 * s
    pts = []
    for sx in (-1, 1):
        pts += [(sx * W * 0.62, -D * 0.55, 0.5 * s), (sx * W * 0.7, D * 0.6, 0.6 * s),
                (sx * W, -D * 0.2, 1.35 * s), (sx * W * 0.92, D * 0.7, 1.5 * s),
                (sx * W * 0.62, -D * 0.6, H * 0.88), (sx * W * 0.55, D * 0.55, H),
                (sx * W * 0.3, -D * 1.05, 0.95 * s)]
    pts += [(0, -D * 1.2, 1.2 * s), (0, -D * 0.75, H * 0.95), (0, D * 0.2, H * 1.05)]
    head = hull(m, pts, MASK[0])
    fs += head
    _shade(m, head, MASK_TOP, MASK[1], dot=0.6)
    # the brow ridge over the eyes, and a crest down the middle
    for sx in (-1, 1):
        t = list(m.box((1.1 * s, 0.5 * s, 0.32 * s), (sx * 0.95 * s, -0.55 * s, 1.95 * s), MASK[2], rot=(0.2, sx * 0.35, -sx * 0.35)))
        fs += t
        _shade(m, t, MASK_TOP, None)
    t = list(m.box((0.42 * s, 1.9 * s, 0.4 * s), (0, -0.1 * s, H * 0.98), MASK[2], rot=(0.25, 0, 0)))
    fs += t
    _shade(m, t, MASK_TOP, None)
    # the eyes: great faceted domes on the sides of the face, lit like a hearth (or dark)
    for k, sx in enumerate((-1, 1)):
        eye = m.ball(0.82 * s, (sx * 1.12 * s, -0.62 * s, 1.35 * s), EYE if lit[k] else EYE_DEAD, subdiv=1,
                     scale=(0.8, 0.95, 1.1), glow=lit[k], rot=(0, 0, -sx * 0.5))
        fs += list(eye)
        if lit[k]:
            # (a hotter facet on the top, where the glow pools)
            fs += m.ball(0.38 * s, (sx * 1.2 * s, -0.78 * s, 1.72 * s), EYE_HOT, subdiv=0, scale=(0.9, 0.7, 0.6), glow=True)
    # the plumes: from the brow up, then swept back and out over the shoulders, combed into barbs
    # both sides (a comb's edge: feather fans from above)
    for k, sx in enumerate((-1, 1)):
        keep = plumes[k]
        base = Vector((sx * 0.4 * s, -0.4 * s, H * 0.9))
        n = 12
        pts, ws = [], []
        for i in range(n + 1):
            t = i / n
            if t > keep + 1e-6:
                break
            x = sx * (2.0 * t - 0.2 * t * t) * s
            y = (-0.2 * t + 3.2 * t * t) * s
            z = (2.3 * t - 1.7 * t * t) * s
            pts.append(base + Vector((x, y, z)))
            # (a soft feather: broad, its barbs combed into a fine edge, not a saw)
            w = 0.2 if i == 0 else 1.05 * math.sin(math.pi * min(1.0, t * 0.85 + 0.12)) * (0.78 if i % 2 else 1.0)
            ws.append(max(0.14, w) * s)
        if len(pts) >= 2:
            fs += ribbon(m, pts, ws, PLUME[0], PLUME[1], fold=0.3, thick=0.12 * s)
            fs += tube(m, pts, [0.17 * s] * len(pts), MASK[1], segs=5)
            if keep < 1:
                # the break: a raw stump of the rib
                fs += m.ball(0.24 * s, tuple(pts[-1]), LEDGER_DARK, subdiv=0)
    return fs


def beacon(variants):
    """Obstacles: the great beacons, taller than you fly. A stepped hex plinth, a shaft banded with
    the count, the face on top looking out. Whole; leaning, a plume snapped off and lying at its foot;
    and shorter, one eye gone dark, sand up to its knees. Built looking -y (turned in the level)."""
    for i in range(variants):
        rng = random.Random(5100 + i)
        H = (12.0, 11.4, 10.2)[i]
        lean = (0.0, 0.07, 0.0)[i]
        r = root("kessra_beacon", i, height=H + 6, obstacle=1)
        m = Model(f"kessra_beacon_{i}", 5100 + i)
        fs = []
        # the plinth: three steps, each turned a twelfth so the edges catch the light
        for k, (R, h) in enumerate(((3.0, 0.5), (2.4, 0.45), (1.9, 0.4))):
            z0 = -0.3 + sum(hh for _, hh in ((3.0, 0.5), (2.4, 0.45), (1.9, 0.4))[:k])
            t = _hexshaft(m, z0, z0 + h, R, R * 0.96, LEDGER[k % 3], rot=k * math.pi / 6)
            fs += t
        z = 1.1
        # the shaft: drums, a little narrower each, the count in bands between them
        drums = 4
        for k in range(drums):
            z1 = z + (H - 1.1) / drums
            r0 = 1.45 - 0.12 * k
            fs += _hexshaft(m, z, z1, r0, r0 - 0.1, LEDGER[(k + i) % 3])
            if k:
                fs += _bands(m, rng, z, r0)
            z = z1
        # a capital under the face: a wider hex ring
        fs += _hexshaft(m, z - 0.1, z + 0.5, 1.5, 1.7, LEDGER[1], rot=math.pi / 6)
        _shade(m, fs, LEDGER_TOP, LEDGER_DARK, dot=0.75, shade_dot=-0.5)
        lit = (True, True) if i != 2 else (True, False)
        plumes = (1.0, 1.0) if i != 1 else (1.0, 0.25)
        head = _head(m, rng, 1.2, lit, plumes)
        _move(m, head, Matrix.Translation((0, 0, z + 0.4)))
        if i == 1:
            # its snapped plume, lying at the foot
            p = _head_plume(m, rng)
            _move(m, p, Matrix.Translation((2.6, 2.2, 0.15)) @ Matrix.Rotation(1.1, 4, "Z"))
            # the whole stone leaning a little
            allf = [f for f in m.bm.faces]
            _move(m, allf, Matrix.Rotation(lean, 4, "X"))
        _drifts(m, rng, 0, 0, 2.6, n=5, size=(1.6, 1.1, 0.35 if i != 2 else 0.9), lee=(0.6, 0.3))
        collider(r, 0, 0, 1.6)
        m.build(r)


def _head_plume(m, rng):
    """A plume broken off, lying flat: its rib and barbs."""
    pts = [Vector((t * 3.4, 0.4 * math.sin(t * 3), 0.1)) for t in (i / 6 for i in range(7))]
    ws = [0.2, 0.9, 0.6, 1.0, 0.6, 0.8, 0.2]
    return ribbon(m, pts, ws, PLUME[0], PLUME[1], fold=0.2, thick=0.12) + tube(m, pts, [0.16] * 7, MASK[1], segs=5)


def beacon_sunk(variants):
    """Scenery: a beacon the dunes came over, sunk to its ruff: the face and its plumes out of a
    heap of sand, looking out. Upright; tipped, one eye dark; down to the brow, the plumes lying
    on the sand, dark; and upright, dark (most of the sunk ones haven't opened their eyes). Under
    the flight line."""
    for i in range(variants):
        rng = random.Random(5150 + i)
        r = root("kessra_beacon_sunk", i)
        m = Model(f"kessra_beacon_sunk_{i}", 5150 + i)
        lit = ((True, True), (False, True), (False, False), (False, False))[i]
        head = _head(m, rng, 1.0, lit, (1.0, 1.0) if i != 1 else (0.6, 1.0))
        # the top of the shaft's capital, just out of the sand
        cap = _hexshaft(m, -1.2, 0.2, 1.5, 1.6, LEDGER[1], rot=math.pi / 6)
        _shade(m, cap, LEDGER_TOP, LEDGER_DARK)
        allf = head + cap
        if i == 1:
            _move(m, allf, Matrix.Rotation(0.32, 4, "Y") @ Matrix.Rotation(-0.15, 4, "X"))
        elif i == 2:
            _move(m, allf, Matrix.Translation((0, 0, -1.4)) @ Matrix.Rotation(-0.35, 4, "X"))
        # the dune it's in: a long heap, steeper on the lee
        _drifts(m, rng, 0, 0.4, 1.6, n=6, size=(1.7, 1.3, 0.6 if i != 2 else 0.9), lee=(0.0, 1.0))
        m.build(r)


def beacon_stump(variants):
    """Scenery: what's left where a beacon's head came off long ago, faceless: a broken drum of
    the shaft out of the sand, its top jagged; the capital alone, a ring of stone on a heap; and the
    plinth's top steps, scoured bare, a stub in the middle. Most of the field is these: the faces
    are the few. Under the flight line."""
    for i in range(variants):
        rng = random.Random(5180 + i)
        r = root("kessra_beacon_stump", i)
        m = Model(f"kessra_beacon_stump_{i}", 5180 + i)
        fs = []
        if i == 0:
            h = rng.uniform(2.6, 3.2)
            fs += _hexshaft(m, -0.6, h, 1.45, 1.38, LEDGER[0])
            fs += _bands(m, rng, h * 0.45, 1.42)
            # the break: shards of the drum standing round its top
            for k in range(6):
                a = k * math.tau / 6 + math.pi / 6
                fs += list(m.box((0.9, 0.55, rng.uniform(0.2, 0.9)), (math.cos(a) * 1.0, math.sin(a) * 1.0, h + 0.2), LEDGER[k % 3],
                                 rot=(0, 0, a + math.pi / 2)))
            allf = fs
            _move(m, allf, Matrix.Rotation(rng.uniform(0.08, 0.16), 4, "X"))
        elif i == 1:
            fs += _hexshaft(m, -0.8, 0.5, 1.5, 1.7, LEDGER[1], rot=math.pi / 6)
            fs += _hexshaft(m, 0.5, 0.75, 1.7, 1.6, LEDGER[2], rot=math.pi / 6)
            # (the socket the face stood in, dark)
            m.cyl(0.95, 0.1, (0, 0, 0.72), LEDGER_DARK, segs=6)
            _move(m, fs, Matrix.Rotation(0.25, 4, "Y"))
        else:
            for k, (R, hh) in enumerate(((3.0, 0.5), (2.4, 0.45), (1.9, 0.4))):
                z0 = -0.3 + (0.0, 0.5, 0.95)[k]
                fs += _hexshaft(m, z0, z0 + hh, R, R * 0.96, LEDGER[k % 3], rot=k * math.pi / 6)
            fs += _hexshaft(m, 1.35, 2.0, 1.45, 1.4, LEDGER[0])
        _shade(m, fs, LEDGER_TOP, LEDGER_DARK, dot=0.7, shade_dot=-0.5)
        _drifts(m, rng, 0, 0.3, 1.9 if i != 2 else 2.8, n=5, size=(1.6, 1.2, 0.55), lee=(0.0, 1.0))
        m.build(r, rot_z=rng.uniform(0, math.tau))


def beacon_fallen(variants):
    """Scenery: a great beacon that fell, long ago, broken where its bands were: the drums lying in
    a line, the last one with the face on it looking up at the sky, its plumes splayed on the
    sand, its eyes still lit. Under the flight line; about 17 long, lying along x."""
    for i in range(variants):
        rng = random.Random(5200 + i)
        r = root("kessra_beacon_fallen", i)
        m = Model(f"kessra_beacon_fallen_{i}", 5200 + i)
        x = -8.0
        n = 4 if i == 0 else 3
        for k in range(n):
            L = rng.uniform(2.6, 3.4)
            r0 = 1.45 - 0.12 * k
            # each drum lying on a flat of its hex, nudged off the line where it rolled
            d = _hexshaft(m, 0, L, r0, r0 - 0.1, LEDGER[(k + i) % 3])
            if k:
                d += _bands(m, rng, 0.0, r0)
            off = rng.uniform(-0.5, 0.5) + (0.0 if k < n - 1 or i == 0 else 1.2)
            _move(m, d, Matrix.Translation((x + L / 2, off, r0 * 0.82)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
                  @ Matrix.Rotation(rng.uniform(-0.15, 0.15), 4, "X") @ Matrix.Translation((0, 0, -L / 2)))
            _shade(m, d, LEDGER_TOP, LEDGER_DARK, dot=0.75, shade_dot=-0.5)
            # (the sand's come over some of it: a drift banked up one side and over the top)
            if rng.random() < 0.6:
                side = rng.choice((-1, 1))
                fs = lump(m, rng, (x + L * rng.uniform(0.3, 0.7), off + side * r0 * 0.5, 0.2), (L * 0.55, r0 * 1.3, r0 * 1.35), SAND[k % 3], n=16, flat=0.6)
                _shade(m, fs, SAND_TOP, None, dot=0.6)
            x += L + rng.uniform(0.3, 1.0) * (1 if i == 0 else 1.6)
        # the face, lying back: looking up out of the sand
        head = _head(m, rng, 1.05, (True, i == 0), (1.0, 0.7 if i else 1.0))
        cap = _hexshaft(m, -0.5, 0.5, 1.5, 1.7, LEDGER[1], rot=math.pi / 6)
        _shade(m, cap, LEDGER_TOP, LEDGER_DARK)
        _move(m, head + cap, Matrix.Translation((x + 0.4, 0.0, 1.45)) @ Matrix.Rotation(-math.pi / 2, 4, "X") @ Matrix.Rotation(math.pi / 2, 4, "Y"))
        # sand drifted against the line of it, and the plinth left standing where it stood
        for k in range(5):
            _drifts(m, rng, -8 + k * 4.2, rng.uniform(-1.6, -1.2), 0.6, n=2, size=(1.6, 0.9, 0.45))
        plinth = []
        for k, (R, h) in enumerate(((3.0, 0.5), (2.4, 0.45))):
            plinth += _hexshaft(m, -0.3 + k * 0.5, 0.2 + k * 0.45, R, R * 0.96, LEDGER[k], rot=k * math.pi / 6, x=-10.6, y=0)
        stump = _hexshaft(m, 0.6, 1.4, 1.45, 1.35, LEDGER[2], x=-10.6, y=0)
        for k in range(5):
            a = k * math.tau / 5
            stump += list(m.box((0.6, 0.5, rng.uniform(0.3, 0.9)), (-10.6 + math.cos(a) * 0.9, math.sin(a) * 0.9, 1.5), LEDGER[k % 3],
                                rot=(0, 0, a)))
        _shade(m, plinth + stump, LEDGER_TOP, LEDGER_DARK, dot=0.75, shade_dot=-0.5)
        m.build(r)


def count_stone(variants):
    """Scenery: the count, in stones: a squat hex post, its tally notched round it; set in rows
    between the beacons, so many to a row. Upright; leaning; and fallen on its side."""
    for i in range(variants):
        rng = random.Random(5250 + i)
        r = root("kessra_count_stone", i)
        m = Model(f"kessra_count_stone_{i}", 5250 + i)
        h = (2.2, 1.9, 1.6)[i]
        fs = _hexshaft(m, -0.2, h, 0.72, 0.6, MASK[i % 3])
        fs += _hexshaft(m, h, h + 0.4, 0.68, 0.36, MASK[1], rot=math.pi / 6)
        for k in range(3):
            m.box((0.6, 0.16, 0.14), (0, -0.66 + 0.04 * k, 0.5 + k * 0.42), LEDGER[0])
        _shade(m, fs, MASK_TOP, FUR[1], dot=0.7, shade_dot=-0.5)
        allf = list(m.bm.faces)
        if i == 1:
            _move(m, allf, Matrix.Rotation(0.3, 4, "Y"))
        elif i == 2:
            _move(m, allf, Matrix.Translation((0, 0, 0.45)) @ Matrix.Rotation(math.pi / 2 - 0.08, 4, "Y"))
        _drifts(m, rng, 0, 0, 0.75, n=4, size=(0.7, 0.55, 0.3))
        m.build(r, rot_z=rng.uniform(0, math.tau))


def reader(variants):
    """Scenery: the hearth a reading ring's faces look in at. A wide stepped hex dais, a ring of
    low fins round it like a crowd's antennae, and in the middle the hearth: a bowl of embers,
    banked and glowing again. Under the flight line; about 11 across."""
    for i in range(variants):
        rng = random.Random(5300 + i)
        r = root("kessra_reader", i)
        m = Model(f"kessra_reader_{i}", 5300 + i)
        fs = []
        for k, (R, h) in enumerate(((5.6, 0.5), (4.5, 0.5), (3.2, 0.5))):
            fs += _hexshaft(m, -0.3 + k * 0.5, 0.2 + k * 0.5, R, R * 0.97, LEDGER[k % 3], rot=k * math.pi / 6)
        # the fins: twelve, leaning in, so the dais reads as a ring of listeners from above
        for k in range(12):
            if i == 1 and k in (3, 4, 9):
                continue
            a = k * math.tau / 12
            dx, dy = math.cos(a), math.sin(a)
            fs += list(m.box((0.5, 1.3, 2.2), (dx * 4.9, dy * 4.9, 1.0), MASK[k % 3], rot=(-dy * 0.35, dx * 0.35, a), taper=0.4))
        # the hearth: a bowl, its rim, its embers
        fs += list(m.cyl(2.3, 0.6, (0, 0, 1.2), LEDGER[0], segs=6, r_top=2.6))
        m.cyl(2.1, 0.12, (0, 0, 1.72), EMBER, segs=6, glow=True)
        for k in range(7):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(0, 1.3)
            m.ball(rng.uniform(0.35, 0.6), (math.cos(a) * d, math.sin(a) * d, 1.8), EYE if k % 2 else EMBER, subdiv=0, glow=True,
                   scale=(1, 1, 0.6))
        _shade(m, fs, LEDGER_TOP, LEDGER_DARK, dot=0.7, shade_dot=-0.5)
        _drifts(m, rng, 0, 0, 5.8, n=6, size=(1.6, 1.1, 0.35), lee=(0.7, 0.2))
        m.build(r)


def build():
    beacon(3)
    beacon_sunk(4)
    beacon_stump(3)
    beacon_fallen(2)
    count_stone(3)
    reader(2)
