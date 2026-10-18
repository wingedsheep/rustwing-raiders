"""Preview helper for ships.py / bosses.py: a contact sheet of chosen kinds in a grid, rendered big.

    blender -b --factory-startup -P tools/models/ships_sheet.py -- <module> <out.png> <kind,kind,...> [cols] [top] [res] [frame]
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import kit  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
mod, out, kinds = argv[0], argv[1], argv[2].split(",")
cols = int(argv[3]) if len(argv) > 3 else 4
top = len(argv) > 4 and argv[4] == "top"
res = int(argv[5]) if len(argv) > 5 else 1000
frame = float(argv[6]) if len(argv) > 6 else 0.0

bpy.ops.wm.read_factory_settings(use_empty=True)
kit.reset()
sys.argv.append("--preview")
__import__(mod).build()
roots = {o["kind"] + str(o.get("variant", "")): o for o in bpy.data.objects if o.parent is None and "kind" in o}
keep = [roots[k] for k in kinds]
for o in [o for o in roots.values() if o not in keep]:
    for c in [o, *o.children_recursive]:
        bpy.data.objects.remove(c, do_unlink=True)


def footprint(obj):
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    for o in [obj, *obj.children_recursive]:
        if o.type == "MESH":
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, w))
                hi = Vector(map(max, hi, w))
    return lo, hi


import os
if os.environ.get("SHOW_MOUNTS"):
    for o in list(bpy.data.objects):
        if "mount" in o:
            mm = kit.Model("dbg")
            mm.ball(0.35, (0, 0, 0), "#ff00ff" if o["mount"] == "gun" else "#00ff00", subdiv=0, glow=True)
            mm.build(o)
bpy.context.scene.frame_set(round(frame * kit.FPS))
bpy.context.view_layer.update()
cell = max(max((footprint(o)[1] - footprint(o)[0])[:2]) for o in keep) * 1.15
for i, o in enumerate(keep):
    o.location = (0, 0, 0)
    bpy.context.view_layer.update()
    lo, hi = footprint(o)
    c = (lo + hi) / 2
    o.location = ((i % cols) * cell - c.x, -(i // cols) * cell - c.y, 0)
bpy.context.view_layer.update()
rows = math.ceil(len(keep) / cols)
ncols = min(cols, len(keep))
mid = Vector(((ncols - 1) * cell / 2, -(rows - 1) * cell / 2, 0))
w, h = ncols * cell, rows * cell * (1.0 if top else 1.0)

scene = bpy.context.scene
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(cam)
cam.data.type = "ORTHO"
cam.data.ortho_scale = max(w, h)
cam.data.clip_end = 1000
tilt = 0 if top else math.radians(30)
d = 200
cam.location = (mid.x, mid.y - math.sin(tilt) * d, 1 + math.cos(tilt) * d)
cam.rotation_euler = (tilt, 0, 0)
scene.camera = cam
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(35), math.radians(-25), math.radians(-30))
sun.data.energy = 4.0
world = bpy.data.worlds.new("w")
scene.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (0.3, 0.33, 0.4, 1)
bpy.ops.mesh.primitive_plane_add(size=2000, location=(0, 0, -3))
bpy.context.object.data.materials.append(kit.material("#3a4a3a"))
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        scene.render.engine = eng
        break
    except TypeError:
        pass
scene.render.resolution_x = res if w >= h else round(res * w / h)
scene.render.resolution_y = res if h > w else round(res * h / w)
scene.view_settings.view_transform = "Standard"
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
