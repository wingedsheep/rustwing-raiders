"""A small low-poly modelling kit on top of bmesh.

    m = Model("library")
    m.box((8, 6, 4), (0, 0, 2), P.PLASTER)
    m.gable((8.6, 6.6, 2.5), (0, 0, 4), P.PLUM_ROOF)
    obj = m.build()

Every colour becomes a shared flat material, which the runtime swaps for a banded toon material
of the same colour. Materials named "glow_*" are emissive (engine glow, lava, neon). "skin_*" ones
(a Skin colour, slots a, b and c) are recoloured by the runtime: an enemy model is built once and
painted in each planet's colours (a = main, b = secondary, c = accent; "skinglow_c" glows).
Custom properties on objects are exported as glTF extras. Keyframes set with animate() become
named glTF animation clips.
"""
from __future__ import annotations

import math
import random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector


# --- materials ------------------------------------------------------------------

def _srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(hex_: str) -> tuple[float, float, float]:
    h = hex_.lstrip("#")
    return tuple(_srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


class Skin(str):
    """A colour in a named slot (a, b or c): it builds in its own colour (a stand-in for previews),
    and the runtime paints the slot in the colours of whoever is wearing the model. A shaded skin
    (`a.shade(0.8)`) is painted that much darker (or lighter, over 1): worn and patched plates."""

    def __new__(cls, slot: str, hex_: str, k: float = 1.0):
        s = super().__new__(cls, hex_)
        s.slot = slot
        s.k = k
        return s

    def shade(self, k: float) -> "Skin":
        return Skin(self.slot, str(self), round(self.k * k, 2))


_MATS: dict[str, bpy.types.Material] = {}


def material(hex_: str, glow: bool = False) -> bpy.types.Material:
    k = 1.0
    if isinstance(hex_, Skin):
        k = hex_.k
        key = f"skin{'glow' if glow else ''}_{hex_.slot}" + (f"_s{round(k * 100)}" if k != 1 else "")
    else:
        key = f"{'glow' if glow else 'c'}_{hex_.lstrip('#').lower()}"
    if key in _MATS:
        return _MATS[key]
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*(min(1.0, c * k) for c in rgb(hex_)), 1)
    bsdf.inputs["Roughness"].default_value = 1.0
    if glow:
        bsdf.inputs["Emission Color"].default_value = (*rgb(hex_), 1)
        bsdf.inputs["Emission Strength"].default_value = 1.0
    _MATS[key] = mat
    return mat


def reset():
    _MATS.clear()
    _CLIPS.clear()


# --- model builder ------------------------------------------------------------------

class Model:
    def __init__(self, name: str, seed: int = 0):
        self.name = name
        self.bm = bmesh.new()
        self.mats: list[bpy.types.Material] = []
        self.rng = random.Random(seed)
        self.eaves: list[tuple[Vector, float, float]] = []   # (midpoint, direction, length) for icicles

    # material slot for a colour
    def _slot(self, color: str, glow: bool) -> int:
        mat = material(color, glow)
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def _paint(self, verts, color: str, glow: bool = False):
        idx = self._slot(color, glow)
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            f.material_index = idx
        return faces

    @staticmethod
    def _matrix(loc, rot=(0, 0, 0), scale=(1, 1, 1)):
        return Matrix.LocRotScale(Vector(loc), Euler(rot), Vector(scale))

    # --- primitives -----------------------------------------------------------------
    def box(self, size, loc, color, rot=(0, 0, 0), glow=False, taper: float = 1.0):
        """Axis-aligned box centred on loc. taper < 1 shrinks the top face (for chimneys, posts)."""
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=self._matrix(loc, rot, size))
        if taper != 1.0:
            top = max(v.co.z for v in r["verts"])
            cx, cy = loc[0], loc[1]
            for v in r["verts"]:
                if abs(v.co.z - top) < 1e-4:
                    v.co.x = cx + (v.co.x - cx) * taper
                    v.co.y = cy + (v.co.y - cy) * taper
        return self._paint(r["verts"], color, glow)

    def cyl(self, r, h, loc, color, segs=8, r_top=None, rot=(0, 0, 0), glow=False):
        """Cylinder / cone standing on loc (loc is the centre of the base)."""
        r_top = r if r_top is None else r_top
        m = self._matrix(loc, rot) @ Matrix.Translation((0, 0, h / 2))
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs,
                                    radius1=r, radius2=r_top, depth=h, matrix=m)
        return self._paint(res["verts"], color, glow)

    def ball(self, r, loc, color, subdiv=1, scale=(1, 1, 1), jitter=0.0, glow=False, rot=(0, 0, 0)):
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=subdiv, radius=r,
                                         matrix=self._matrix(loc, rot, scale))
        if jitter:
            for v in res["verts"]:
                v.co += Vector((self.rng.uniform(-1, 1), self.rng.uniform(-1, 1), self.rng.uniform(-1, 1))) * jitter
        return self._paint(res["verts"], color, glow)

    def prism(self, points, depth, loc, color, rot=(0, 0, 0), glow=False):
        """Extrude a 2D polygon (in the XZ plane) along Y by `depth`, centred on loc."""
        verts_f = [self.bm.verts.new((x, -depth / 2, z)) for x, z in points]
        verts_b = [self.bm.verts.new((x, depth / 2, z)) for x, z in points]
        n = len(points)
        faces = [self.bm.faces.new(verts_f[::-1]), self.bm.faces.new(verts_b)]
        for i in range(n):
            j = (i + 1) % n
            faces.append(self.bm.faces.new((verts_f[i], verts_f[j], verts_b[j], verts_b[i])))
        m = self._matrix(loc, rot)
        for v in verts_f + verts_b:
            v.co = m @ v.co
        idx = self._slot(color, glow)
        for f in faces:
            f.material_index = idx
        return set(faces)

    def slab(self, points, z0, z1, color, top=None, glow=False):
        """Extrude a polygon in the XY plane (counter-clockwise) from z0 up to z1. `top`, a second
        outline with as many points, makes the sides slope (for a floating chunk of land)."""
        top = points if top is None else top
        lo = [self.bm.verts.new((x, y, z0)) for x, y in points]
        hi = [self.bm.verts.new((x, y, z1)) for x, y in top]
        faces = [self.bm.faces.new(hi), self.bm.faces.new(lo[::-1])]
        for i in range(len(points)):
            j = (i + 1) % len(points)
            faces.append(self.bm.faces.new((lo[i], lo[j], hi[j], hi[i])))
        idx = self._slot(color, glow)
        for f in faces:
            f.material_index = idx
        return set(faces)

    def gable(self, size, loc, color, overhang=0.0, rot=(0, 0, 0), thick=0.18, icicles=False):
        """Gable roof made of two slabs; the ridge runs along X.

        size = (length, width, height) of the roof volume, loc = centre of its base. The gable
        ends stay open so a wall triangle (see prism) can show through. icicles=True marks both
        eaves, for icicles to hang from on a freezing day (see frost.ts).
        """
        L, W, H = size
        angle = math.atan2(H, W / 2)
        run = W / 2 + overhang                     # horizontal reach of each slab
        slope = run / math.cos(angle)
        m = self._matrix(loc, rot)
        faces = set()
        for side in (-1, 1):
            centre = Vector((0, side * run / 2, H - run / 2 * math.tan(angle) + thick / 2))
            local = Matrix.LocRotScale(centre, Euler((-side * angle, 0, 0)), Vector((L, slope, thick)))
            r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m @ local)
            faces |= self._paint(r["verts"], color)
            if icicles:
                self.eaves.append((m @ Vector((0, side * run, H - run * math.tan(angle))), rot[2], L))
        return faces

    def plank_line(self, start, end, width, thick, color):
        """A beam from start to end (e.g. a railing, a paddle shaft)."""
        a, b = Vector(start), Vector(end)
        d = b - a
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler()
        return self.box((width, thick, d.length), (a + b) / 2, color, rot=rot)

    # --- output -----------------------------------------------------------------------
    def build(self, parent: bpy.types.Object | None = None, loc=(0, 0, 0), rot_z=0.0, **props) -> bpy.types.Object:
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for mat in self.mats:
            mesh.materials.append(mat)
        for poly in mesh.polygons:
            poly.use_smooth = False
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = loc
        obj.rotation_euler = (0, 0, rot_z)
        if parent:
            obj.parent = parent
        for k, v in props.items():
            obj[k] = v
        for at, turn, length in self.eaves:
            group("icicles", tuple(at), rot_z=turn, parent=obj, icicles=round(length, 3))
        return obj


def group(name: str, loc=(0, 0, 0), rot_z=0.0, parent=None, **props) -> bpy.types.Object:
    """An empty that holds a model's parts; custom props become glTF extras."""
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    e.rotation_euler = (0, 0, rot_z)
    e.empty_display_size = 0.5
    if parent:
        e.parent = parent
    for k, v in props.items():
        e[k] = v
    return e


def light(parent, loc, color: str, radius: float, intensity: float = 1.0, flicker: float = 0.0, day=False, halo=True):
    """Marker the runtime turns into a point light + glow halo (halo=False: just the light)."""
    return group("light", loc, parent=parent, light=1, color=color, radius=radius,
                 intensity=intensity, flicker=flicker, day=int(day), halo=int(halo))


def emitter(parent, loc, kind: str):
    """Marker for particles: smoke, embers, petals…"""
    return group(f"emit_{kind}", loc, parent=parent, emit=kind)


# --- animation ----------------------------------------------------------------------

FPS = 24
_CLIPS: dict[str, bpy.types.Action] = {}


def _slot(act: bpy.types.Action, obj: bpy.types.Object):
    return next((s for s in act.slots if s.name_display == obj.name), None)


def _bind(obj: bpy.types.Object, act: bpy.types.Action):
    ad = obj.animation_data or obj.animation_data_create()
    ad.action = act
    ad.action_slot = _slot(act, obj) or act.slots.new("OBJECT", obj.name)
    return ad


def animate(obj: bpy.types.Object, clip: str, path: str, keys, rest=None):
    """Keyframe one channel of a part for a named clip.

    keys = [(seconds, value), ...], where value is an offset from `rest` (the part's pose as
    built, e.g. obj.rotation_euler). A clip may span many objects; each clip becomes one glTF
    animation. Clips ending in "_idle" are the ones the runtime loops.
    """
    act = _CLIPS.get(clip) or _CLIPS.setdefault(clip, bpy.data.actions.new(clip))
    _bind(obj, act)
    base = Vector(getattr(obj, path)[:] if rest is None else rest)
    for i in range(len(base)):
        fc = act.fcurve_ensure_for_datablock(obj, path, index=i)
        for t, value in keys:
            v = value[i] if hasattr(value, "__len__") else value
            fc.keyframe_points.insert(round(t * FPS), base[i] + v, options={"FAST"})
        fc.update()


def stash_clips():
    """Before export: every part plays its *_idle clip, and its other clips wait on muted NLA
    tracks (the glTF exporter still writes each of them out as its own animation)."""
    for obj in bpy.data.objects:
        used = [a for a in _CLIPS.values() if _slot(a, obj)]
        if not used:
            continue
        ad = obj.animation_data
        for act in used:
            if act.name.endswith("_idle"):
                continue
            _bind(obj, act)
            track = ad.nla_tracks.new()
            track.mute = True
            strip = track.strips.new(act.name, int(act.frame_range[0]), act)
            strip.action_slot = _slot(act, obj)
        idle = next((a for a in used if a.name.endswith("_idle")), None)
        if idle:
            _bind(obj, idle)
        else:
            ad.action = None
    bpy.context.scene.frame_set(0)
