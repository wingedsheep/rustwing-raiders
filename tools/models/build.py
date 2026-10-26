"""Build the game's models and export them for the web.

    blender -b --factory-startup -P tools/models/build.py -- --only props_a
    blender -b --factory-startup -P tools/models/build.py -- --only props_a --preview /tmp/a.png [--kind tree_fern] [--top]
    blender -b --factory-startup -P tools/models/build.py              (everything)

Each module (props_a.py, props_b.py, creatures.py, enemies.py, ships.py, bosses.py, and a
set_<planet>.py per planet for its set pieces) has a
`build()` that makes templates: root objects (kit.group or a Model's build()) carrying a custom
property `kind=<name>` (and `variant=<n>` when a kind has several looks). The runtime clones a
template wherever it wants one, so where the roots stand doesn't matter; for previews they're
laid out in rows.

Axes: Blender's (x, y, z) is the game's (x, z = -y, y). Flight is towards Blender +y (up the
screen). One unit is one game unit: ships fly at height 10, a ship is about 3 long, and the
pixel renderer draws about 8 texels a unit, so details under ~0.25 vanish.

Outputs public/models/<module>.glb, and src/generated/<module>.json: for every template its
bounds, collider columns (`collider` empties) and mounts (`mount` empties), in game axes, so the
simulation knows what it can hit without loading a single model.
"""
from __future__ import annotations

import argparse
import importlib
import math
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import kit  # noqa: E402
from mathutils import Vector  # noqa: E402

OUT = HERE.parent.parent / "public" / "models"
META = HERE.parent.parent / "src" / "generated"
PLANETS = ["orutal", "halcyon", "kessra", "mirefall", "glacis", "ashgrave", "vesh", "cinder"]
# set pieces, a module a planet: set_<planet>.py
MODULES = ["props_a", "props_b", "creatures", "enemies", "ships", "bosses", "boarding", *(f"set_{p}" for p in PLANETS)]


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=MODULES)
    ap.add_argument("--preview", help="render a preview PNG here (with --only)")
    ap.add_argument("--kind", help="with --preview: just this kind (comma-separated for several)")
    ap.add_argument("--top", action="store_true", help="with --preview: straight down, as in the game")
    ap.add_argument("--frame", type=float, default=0.0, help="with --preview: the animation time (s) to pose at")
    return ap.parse_args(argv)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit.reset()


def roots():
    return [o for o in bpy.data.objects if o.parent is None and "kind" in o]


def footprint(obj):
    """World-space bounds of a template and everything under it: (min, max) vectors."""
    from mathutils import Vector
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    stack = [obj]
    while stack:
        o = stack.pop()
        stack.extend(o.children)
        if o.type == "MESH":
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, w))
                hi = Vector(map(max, hi, w))
    if lo.x > hi.x:
        lo = hi = obj.location.copy()
    return lo, hi


def lay_out(objs, gap=1.5, row_width=60.0):
    """Rows of templates, for looking at."""
    bpy.context.view_layer.update()
    x = y = 0.0
    row_depth = 0.0
    for o in objs:
        o.location = (0, 0, 0)
        bpy.context.view_layer.update()
        lo, hi = footprint(o)
        w, d = hi.x - lo.x, hi.y - lo.y
        if x > 0 and x + w > row_width:
            x = 0.0
            y -= row_depth + gap
            row_depth = 0.0
        o.location = (x - lo.x, y - hi.y, 0)
        x += w + gap
        row_depth = max(row_depth, d)
    bpy.context.view_layer.update()


def export(name: str):
    OUT.mkdir(parents=True, exist_ok=True)
    kit.stash_clips()
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / f"{name}.glb"),
        export_format="GLB",
        export_extras=True,
        export_yup=True,
        export_apply=True,
        export_lights=False,
        export_cameras=False,
        export_animation_mode="ACTIONS",
        export_merge_animation="ACTION",
    )


def game(v):
    """Blender (x, y, z) to the game's (x, y, z): up is y, forward is -z."""
    return [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]


def write_meta(name: str, objs):
    import json
    bpy.context.view_layer.update()
    out = {}
    for o in objs:
        # measured where it stands at the origin
        o.location = (0, 0, 0)
    bpy.context.view_layer.update()
    for o in objs:
        lo, hi = footprint(o)
        cols, mounts = [], []
        for c in o.children_recursive:
            p = o.matrix_world.inverted() @ c.matrix_world.translation
            if "collider" in c:
                col = {"x": round(p.x, 3), "z": round(-p.y, 3), "r": round(float(c["collider"]), 3)}
                # (a leaning part's: the height its (x, z) is at, its lean per unit up, its top)
                if "lean" in c:
                    col.update(y=round(p.z, 3), lean=[round(float(c["lean"][0]), 4), round(-float(c["lean"][1]), 4)])
                if "top" in c:
                    col["top"] = round(float(c["top"]), 3)
                if "over" in c:
                    col.update(y=round(p.z, 3), over=True)
                cols.append(col)
            if "mount" in c:
                mounts.append({"type": str(c["mount"]), "p": game(p)})
        key = f"{o['kind']}" + (f"#{o['variant']}" if "variant" in o else "")
        out[key] = {
            "kind": o["kind"],
            "variant": int(o.get("variant", 0)),
            "min": game(Vector((lo.x, hi.y, lo.z))),
            "max": game(Vector((hi.x, lo.y, hi.z))),
            "colliders": cols,
            "mounts": mounts,
        }
    META.mkdir(parents=True, exist_ok=True)
    (META / f"{name}.json").write_text(json.dumps(out, indent=1, sort_keys=True))


def preview(path: str, top: bool, frame: float):
    """A rough Eevee render from the game's camera (or straight down), for eyeballing models."""
    from mathutils import Vector
    scene = bpy.context.scene
    scene.frame_set(round(frame * kit.FPS))
    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in roots():
        a, b = footprint(o)
        lo = Vector(map(min, lo, a))
        hi = Vector(map(max, hi, b))
    mid = (lo + hi) / 2
    span = max(hi.x - lo.x, (hi.y - lo.y) * 1.2, hi.z - lo.z, 4) * 1.15

    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = span
    cam.data.clip_end = 1000
    tilt = 0 if top else math.radians(30)  # the game looks down, leaning back a little
    d = 200
    cam.location = (mid.x, mid.y - math.sin(tilt) * d, mid.z + math.cos(tilt) * d)
    cam.rotation_euler = (tilt, 0, 0)
    scene.camera = cam

    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(35), math.radians(-25), math.radians(-30))
    sun.data.energy = 4.0
    sun.data.color = (1.0, 0.95, 0.85)

    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.3, 0.33, 0.4, 1)
    bg.inputs["Strength"].default_value = 1.0

    bpy.ops.mesh.primitive_plane_add(size=2000, location=(0, 0, -0.01))
    bpy.context.object.data.materials.append(kit.material("#4a4a52"))

    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            pass
    aspect = (hi.y - lo.y) * 1.2 / max(hi.x - lo.x, 1e-3)
    scene.render.resolution_x = 640
    scene.render.resolution_y = max(160, min(960, round(640 * aspect)))
    scene.render.filter_size = 0.0
    scene.view_settings.view_transform = "Standard"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    a = args()
    for name in [a.only] if a.only else MODULES:
        reset_scene()
        mod = importlib.import_module(name)
        mod.build()
        objs = roots()
        if a.kind:
            keep = set(a.kind.split(","))
            for o in [o for o in objs if o["kind"] not in keep]:
                for c in [o, *o.children_recursive]:
                    bpy.data.objects.remove(c, do_unlink=True)
            objs = roots()
        lay_out(sorted(objs, key=lambda o: (o["kind"], o.get("variant", 0))))
        print(f"{name}: {len(objs)} templates: {', '.join(sorted({o['kind'] for o in objs}))}")
        if a.preview:
            # posed as the game first sees it: each part in its idle
            kit.stash_clips()
            preview(a.preview, a.top, a.frame)
        else:
            export(name)
            write_meta(name, roots())


main()
