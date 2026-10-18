"""Shared helpers for props_b (Glacis, Ashgrave, Vesh, Cinder Orchard): faceted painting, limbs
between two points, transforming freshly built geometry, and the idle-animation shorthands."""
from __future__ import annotations

import math
import random

import bmesh

from mathutils import Euler, Matrix, Vector
from kit import Model, animate, group

# the direction facets are painted lit from (top, a little from the north-west), so a crystal or a
# metal hull reads as light and dark planes even under flat light
LDIR = Vector((-0.45, 0.35, 0.82)).normalized()


def root(kind: str, variant: int = 0, **props):
    return group(f"{kind}_{variant}", kind=kind, variant=variant, **props)


def collider(parent, x, y, r):
    return group("collider", (x, y, 0), parent=parent, collider=r)


# --- geometry bookkeeping -----------------------------------------------------------

def mark(m: Model):
    """Everything built so far; pass to new_faces()/xform() to act only on what comes after."""
    return set(m.bm.faces)


def new_faces(m: Model, before):
    return {f for f in m.bm.faces if f not in before}


def xform(m: Model, before, mat: Matrix):
    """Move/rotate/scale everything built since `before`."""
    faces = new_faces(m, before)
    for v in {v for f in faces for v in f.verts}:
        v.co = mat @ v.co
    return faces


def M(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    return Matrix.LocRotScale(Vector(loc), Euler(rot), Vector(scale))


def jitter(m: Model, faces, amt, z=True):
    for v in {v for f in faces for v in f.verts}:
        v.co += Vector((m.rng.uniform(-amt, amt), m.rng.uniform(-amt, amt), m.rng.uniform(-amt, amt) if z else 0))
    return faces


def _col(c):
    return (c, False) if isinstance(c, str) else c


def facet(m: Model, faces, cols, noise=0.12, bias=0.0, light=LDIR):
    """Paint faces dark..light by how much they face the light (cols from dark to light; a colour
    may be (hex, glow)). Gives ice, metal and bone their crisp planes."""
    idx = [m._slot(*_col(c)) for c in cols]
    n = len(cols)
    bmesh.ops.recalc_face_normals(m.bm, faces=list(faces))
    for f in faces:
        f.normal_update()
        d = f.normal.dot(light) + m.rng.uniform(-noise, noise) + bias
        t = (d + 1) / 2
        f.material_index = idx[max(0, min(n - 1, int(t * n)))]
    return faces


def paint(m: Model, faces, fn):
    """fn(face) -> colour (or (colour, glow)) per face."""
    for f in faces:
        f.normal_update()
        f.material_index = m._slot(*_col(fn(f)))
    return faces


def limb(m: Model, a, b, r0, r1, color, segs=6, glow=False, twist=0.0):
    """A tapered cylinder from point a to point b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    rot = (q.to_matrix().to_4x4() @ Matrix.Rotation(twist, 4, "Z")).to_euler()
    return m.cyl(r0, d.length, tuple(a), color, segs=segs, r_top=r1, rot=rot, glow=glow)


def crystal(m: Model, base, direction, r, length, tip, color, segs=6, twist=0.0, glow=False):
    """A prism shaft with a pointed tip, from `base` along `direction` (faceting painted later)."""
    d = Vector(direction).normalized()
    a = Vector(base)
    b = a + d * length
    f = limb(m, a, b, r, r * 0.92, color, segs, glow, twist)
    f |= limb(m, b, b + d * tip, r * 0.92, 0.02, color, segs, glow, twist)
    return f


def path_tube(m: Model, pts, radii, color, segs=6, glow=False):
    """A chain of limbs through points (bones, roots, ribs)."""
    faces = set()
    for i in range(len(pts) - 1):
        faces |= limb(m, pts[i], pts[i + 1], radii[i], radii[i + 1], color, segs, glow)
        if 0 < i:
            faces |= m.ball(radii[i] * 1.0, pts[i], color, subdiv=1)
    return faces


def ring(m: Model, r, thick, z, color, n=8, h=0.3, glow=False, loc=(0, 0)):
    """A flat ring made of n boxes (a collar, a halo)."""
    faces = set()
    seg = 2 * r * math.tan(math.pi / n) + 0.02
    for i in range(n):
        a = i / n * math.tau
        faces |= m.box((thick, seg, h), (loc[0] + math.cos(a) * r, loc[1] + math.sin(a) * r, z), color,
                       rot=(0, 0, a), glow=glow)
    return faces


# --- idle animation ------------------------------------------------------------------

def pulse(obj, clip, amp=0.15, period=2.0, axes=(1, 1, 1)):
    """A gentle breathing scale, seamless."""
    s = lambda k: tuple(a * k for a in axes)
    animate(obj, clip, "scale", [(0, s(0)), (period / 2, s(amp)), (period, s(0))])


def flicker(obj, clip, amp=0.2, seed=0, period=1.5):
    """A fire's irregular lick: scale jumps around, mostly upward."""
    rng = random.Random(seed)
    keys = [(0, (0, 0, 0))]
    n = 7
    for i in range(1, n):
        k = rng.uniform(-0.6, 1.0) * amp
        keys.append((period * i / n, (k * 0.4 + rng.uniform(-0.3, 0.3) * amp, k * 0.4 + rng.uniform(-0.3, 0.3) * amp, k)))
    keys.append((period, (0, 0, 0)))
    animate(obj, clip, "scale", keys)


def sway(obj, clip, amp=0.04, period=4.0, phase=0.0):
    keys = []
    for i in range(9):
        t = period * i / 8
        a = math.tau * i / 8 + phase
        keys.append((t, (math.sin(a) * amp, math.cos(a) * amp * 0.6, 0)))
    animate(obj, clip, "rotation_euler", keys)


def bob(obj, clip, amp=0.2, period=3.0, phase=0.0):
    keys = []
    for i in range(9):
        t = period * i / 8
        keys.append((t, (0, 0, math.sin(math.tau * i / 8 + phase) * amp)))
    animate(obj, clip, "location", keys)
