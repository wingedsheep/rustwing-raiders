"""Shared helpers for props_a: roots, colliders, ribbons (fronds and leaves), bent tubes (stalks,
trunks), faceted hulls (rock), crystals, recolouring by facing, and the idle loops."""
from __future__ import annotations

import math
import random

import bmesh
from mathutils import Matrix, Vector

from kit import Model, animate, group

UP = Vector((0, 0, 1))


# --- templates -------------------------------------------------------------------------------

def root(kind: str, variant: int = 0, **extras):
    return group(f"{kind}_{variant}", (0, 0, 0), kind=kind, variant=variant, **extras)


def collider(parent, x, y, r, z=0.0, lean=None, top=None, over=False):
    """A collider column at (x, y), its radius r. One on a leaning part says where it crosses height z,
    which way it leans (the shift in x and y per unit up) and how high it reaches, so the game can find
    where it crosses the flight line wherever it stands (raised on a terrace, grown bigger or smaller).
    One `over` the flight line (a cap you'd fly under) is at height z, and hits where it's seen: the
    game slides it down the line of sight to the flight line."""
    props = {"collider": round(r, 3)}
    if over:
        props["over"] = 1
    if lean is not None:
        props["lean"] = [round(lean[0], 4), round(lean[1], 4)]
    if top is not None:
        props["top"] = round(top, 3)
    return group("collider", (x, y, z), parent=parent, **props)


def _finish(m: Model, faces, color, glow=False):
    faces = [f for f in faces if f.is_valid]
    bmesh.ops.recalc_face_normals(m.bm, faces=faces)
    idx = m._slot(color, glow)
    for f in faces:
        f.material_index = idx
    return faces


# --- ribbons: fronds, leaves, blades -----------------------------------------------------------

def ribbon(m: Model, centers, widths, color, color2=None, fold=0.3, thick=0.05, side=None, glow=False):
    """A strip through `centers` (Vectors), `widths` half-widths at each. Its cross-section is a
    shallow V (`fold` x width up in the middle) so its two halves catch the light differently;
    `color2` paints the second half. `side` fixes the width direction (default: horizontal)."""
    bm = m.bm
    n = len(centers)
    rows = []
    for i, c in enumerate(centers):
        c = Vector(c)
        t = (Vector(centers[min(i + 1, n - 1)]) - Vector(centers[max(i - 1, 0)])).normalized()
        s = Vector(side) if side is not None else t.cross(UP)
        if s.length < 1e-4:
            s = Vector((1, 0, 0))
        s.normalize()
        nrm = s.cross(t).normalized()
        if nrm.z < 0:
            nrm = -nrm
        w = widths[i]
        pts = [c - s * w, c + nrm * fold * w, c + s * w]
        rows.append([bm.verts.new(p) for p in pts] + [bm.verts.new(p - nrm * thick) for p in pts])
    fa, fb = [], []
    for i in range(n - 1):
        a, b = rows[i], rows[i + 1]
        fa.append(bm.faces.new((a[0], a[1], b[1], b[0])))
        fb.append(bm.faces.new((a[1], a[2], b[2], b[1])))
        fa.append(bm.faces.new((a[3], b[3], b[4], a[4])))
        fb.append(bm.faces.new((a[4], b[4], b[5], a[5])))
        fa.append(bm.faces.new((a[0], b[0], b[3], a[3])))
        fb.append(bm.faces.new((a[2], a[5], b[5], b[2])))
    for r in (rows[0], rows[-1]):
        fa.append(bm.faces.new((r[0], r[1], r[4], r[3])))
        fb.append(bm.faces.new((r[1], r[2], r[5], r[4])))
    bmesh.ops.recalc_face_normals(bm, faces=fa + fb)
    i1 = m._slot(color, glow)
    i2 = m._slot(color2 or color, glow)
    for f in fa:
        f.material_index = i1
    for f in fb:
        f.material_index = i2
    return fa + fb


def arc(base, yaw, length, rise, droop, n=7, tip_curl=0.0):
    """Points along an arching frond: out along `yaw`, up at slope `rise`, sagging by `droop`."""
    bx, by, bz = base
    dx, dy = math.cos(yaw), math.sin(yaw)
    pts = []
    for i in range(n + 1):
        t = i / n
        d = length * t
        z = bz + length * (rise * t - droop * t * t) - tip_curl * length * t ** 6
        pts.append(Vector((bx + dx * d, by + dy * d, z)))
    return pts


def frond(m: Model, base, yaw, length, width, color, color2=None, rise=0.6, droop=0.9, n=7,
          serrate=0.35, fold=0.35, thick=0.05, tip=0.15):
    """A fern frond: an arching ribbon, widest past the middle, its edge zig-zagged into leaflets."""
    pts = arc(base, yaw, length, rise, droop, n)
    ws = []
    for i in range(n + 1):
        t = i / n
        w = width * max(tip, math.sin(math.pi * min(1.0, t * 0.85 + 0.08)))
        if serrate and 0 < i < n:
            w *= (1 - serrate) if i % 2 else 1.0
        ws.append(w if i else width * 0.25)
    ws[-1] = width * 0.08
    return ribbon(m, pts, ws, color, color2, fold=fold, thick=thick)


# --- tubes: stalks, trunks ---------------------------------------------------------------------

def tube(m: Model, pts, radii, color, segs=6, twist=0.0, colors=None, glow=False, cap=True):
    """A bent cylinder through `pts`. A radius of 0 at either end closes it to a point. `colors`
    (one per segment) bands it."""
    bm = m.bm
    pts = [Vector(p) for p in pts]
    n = len(pts)
    rings = []
    prev_x = None
    for i, (p, r) in enumerate(zip(pts, radii)):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        if prev_x is None:
            ref = Vector((1, 0, 0)) if abs(t.x) < 0.9 else Vector((0, 1, 0))
            x = (ref - t * ref.dot(t)).normalized()
        else:
            x = (prev_x - t * prev_x.dot(t)).normalized()
        prev_x = x
        y = t.cross(x)
        if r <= 1e-6:
            rings.append([bm.verts.new(p)])
            continue
        ring = []
        for k in range(segs):
            a = k * math.tau / segs + twist * i
            ring.append(bm.verts.new(p + (x * math.cos(a) + y * math.sin(a)) * r))
        rings.append(ring)
    faces_by_seg = []
    for i in range(n - 1):
        a, b = rings[i], rings[i + 1]
        fs = []
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for k in range(segs):
                fs.append(bm.faces.new((a[0], b[k], b[(k + 1) % segs])))
        elif len(b) == 1:
            for k in range(segs):
                fs.append(bm.faces.new((a[k], b[0], a[(k + 1) % segs])))
        else:
            for k in range(segs):
                k2 = (k + 1) % segs
                fs.append(bm.faces.new((a[k], b[k], b[k2], a[k2])))
        faces_by_seg.append(fs)
    caps = []
    if cap:
        if len(rings[0]) > 2:
            caps.append(bm.faces.new(rings[0][::-1]))
        if len(rings[-1]) > 2:
            caps.append(bm.faces.new(rings[-1]))
    allf = [f for fs in faces_by_seg for f in fs] + caps
    bmesh.ops.recalc_face_normals(bm, faces=allf)
    for j, fs in enumerate(faces_by_seg):
        c = colors[j % len(colors)] if colors else color
        idx = m._slot(c, glow)
        for f in fs:
            f.material_index = idx
    idx = m._slot(colors[-1] if colors else color, glow)
    for f in caps:
        f.material_index = idx
    return allf


def bend(base, top, sway=(0.0, 0.0), n=5):
    """Points from base to top that lean by `sway` (x, y) at the top, curving gently."""
    b, t = Vector(base), Vector(top)
    pts = []
    for i in range(n + 1):
        u = i / n
        p = b.lerp(t, u)
        p.x += sway[0] * u * u
        p.y += sway[1] * u * u
        pts.append(p)
    return pts


# --- rock -------------------------------------------------------------------------------------

def hull(m: Model, points, color, glow=False):
    """A faceted lump: the convex hull of `points`."""
    verts = [m.bm.verts.new(p) for p in points]
    res = bmesh.ops.convex_hull(m.bm, input=verts)
    loose = {v for v in res["geom_interior"] + res["geom_unused"] if isinstance(v, bmesh.types.BMVert)}
    bmesh.ops.delete(m.bm, geom=list(loose), context="VERTS")
    faces = [g for g in res["geom"] if isinstance(g, bmesh.types.BMFace) and g.is_valid]
    return _finish(m, faces, color, glow)


def lump(m: Model, rng, center, size, color, n=14, flat=0.0):
    """A random faceted rock: hull of points on a squashed sphere; `flat` cuts the bottom."""
    cx, cy, cz = center
    sx, sy, sz = size
    pts = []
    for _ in range(n):
        u = rng.uniform(-1, 1)
        a = rng.uniform(0, math.tau)
        r = math.sqrt(1 - u * u)
        k = rng.uniform(0.8, 1.05)
        z = cz + u * sz * k
        pts.append((cx + math.cos(a) * r * sx * k, cy + math.sin(a) * r * sy * k, max(z, cz - sz * (1 - flat))))
    return hull(m, pts, color)


def splinter(m: Model, rng, base, r, h, lean, color, sides=5, top=0.16, glow=False):
    """A splinter of rock or crystal: an uneven foot, narrowing to a short ridge, leaning over."""
    x0, y0, z0 = base
    pts = []
    for k in range(sides):
        a = k * math.tau / sides + rng.uniform(-0.3, 0.3)
        d = r * rng.uniform(0.75, 1.05)
        pts.append((x0 + math.cos(a) * d, y0 + math.sin(a) * d, z0))
    for k in range(3):
        a = rng.uniform(0, math.tau)
        d = r * rng.uniform(0.4, 0.65)
        t = rng.uniform(0.35, 0.6)
        pts.append((x0 + math.cos(a) * d + lean[0] * t, y0 + math.sin(a) * d + lean[1] * t, z0 + h * t))
    a = rng.uniform(0, math.tau)
    for s in (-1, 1):
        pts.append((x0 + lean[0] + math.cos(a) * r * top * s, y0 + lean[1] + math.sin(a) * r * top * s,
                    z0 + h * rng.uniform(0.9, 1.0)))
    return hull(m, pts, color, glow)


def crystal(m: Model, base, direction, r, length, color, sides=6, tip=0.3, tip_color=None, glow=False,
            tip_glow=None, spin=0.0):
    """A crystal: a prism along `direction` ending in a pyramid point."""
    d = Vector(direction).normalized()
    b = Vector(base)
    mid = b + d * length * (1 - tip)
    end = b + d * length
    body = tube(m, [b, mid], [r, r], color, segs=sides, twist=spin, glow=glow, cap=True)
    pt = tube(m, [mid, end], [r, 0], tip_color or color, segs=sides, twist=spin,
              glow=glow if tip_glow is None else tip_glow, cap=False)
    return body + pt


# --- colouring --------------------------------------------------------------------------------

def recolor(m: Model, faces, fn):
    """fn(face) -> (colour, glow) or colour or None (leave it)."""
    for f in faces:
        if not f.is_valid:
            continue
        c = fn(f)
        if c is None:
            continue
        if isinstance(c, tuple):
            f.material_index = m._slot(c[0], c[1])
        else:
            f.material_index = m._slot(c, False)


def bands(m: Model, faces, levels, top=None, top_dot=0.75):
    """Colour faces by height: levels = [(z_below, colour), ...] ascending; faces facing up past
    top_dot get `top` (if given)."""
    def fn(f):
        c = f.calc_center_median()
        if top and f.normal.z > top_dot:
            return top
        for z, col in levels:
            if c.z < z:
                return col
        return levels[-1][1]
    for f in faces:
        f.normal_update()
    recolor(m, faces, fn)


def slice_z(m: Model, zs):
    """Cut everything in the model at these heights, so bands have clean edges."""
    for z in zs:
        bm = m.bm
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                               plane_co=(0, 0, z), plane_no=(0, 0, 1))
    m.bm.normal_update()


# --- idle loops -------------------------------------------------------------------------------

def sway(obj, clip, amp=(0.05, 0.04), period=3.0, phase=0.0):
    """A gentle seamless rock round the object's pivot."""
    ax, ay = amp
    T = period
    keys = []
    for k in range(9):
        t = T * k / 8
        a = math.tau * k / 8 + phase
        keys.append((t, (ax * math.sin(a), ay * math.sin(a + 1.3), 0)))
    keys[-1] = (T, keys[0][1])
    animate(obj, clip, "rotation_euler", keys)


def pulse(obj, clip, amp=0.12, period=1.6, axes=(1, 1, 1)):
    keys = []
    for k in range(9):
        t = period * k / 8
        s = amp * (0.5 - 0.5 * math.cos(math.tau * k / 8))
        keys.append((t, tuple(s * a for a in axes)))
    keys[-1] = (period, keys[0][1])
    animate(obj, clip, "scale", keys)


def bob(obj, clip, amp=0.08, period=2.4, tilt=0.05):
    keys_z = []
    for k in range(9):
        t = period * k / 8
        a = math.tau * k / 8
        keys_z.append((t, (0, 0, amp * math.sin(a))))
    keys_z[-1] = (period, keys_z[0][1])
    animate(obj, clip, "location", keys_z)
    keys_r = []
    for k in range(9):
        t = period * k / 8
        a = math.tau * k / 8
        keys_r.append((t, (tilt * math.sin(a + 1.0), tilt * math.cos(a), 0)))
    keys_r[-1] = (period, keys_r[0][1])
    animate(obj, clip, "rotation_euler", keys_r)


def spin(obj, clip, period=12.0, swing=None):
    """A slow turn: a full revolution, or with `swing` a back-and-forth of that many radians."""
    if swing is None:
        animate(obj, clip, "rotation_euler", [(0, (0, 0, 0)), (period / 2, (0, 0, math.pi)), (period, (0, 0, math.tau))])
        return
    keys = []
    for k in range(9):
        t = period * k / 8
        keys.append((t, (0, 0, swing * math.sin(math.tau * k / 8))))
    keys[-1] = (period, keys[0][1])
    animate(obj, clip, "rotation_euler", keys)


def rng_for(seed):
    return random.Random(seed)


__all__ = ["Model", "root", "collider", "ribbon", "arc", "frond", "tube", "bend", "hull", "lump", "splinter",
           "crystal", "recolor", "bands", "slice_z", "sway", "pulse", "bob", "spin", "rng_for", "Matrix"]
