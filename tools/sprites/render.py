"""Render pre-baked, animated sprite sheets for the minigames from low-poly Blender models.

    blender -b --factory-startup -P tools/sprites/render.py -- --only demo [--preview /tmp/demo.png]
    blender -b --factory-startup -P tools/sprites/render.py              (every sheet)

A sheet is a module next to this file, tools/sprites/<sheet>.py, with a `build()` that makes
templates with tools/models/kit.py (roots with `kind` and maybe `variant`, clips via kit.animate),
and a `SPRITES` dict saying what to render (see README.md):

    SPRITES = {
        "ship_side": dict(kind="ship", view="side", width=24, clips={"fly": 4}),
        "ship_top": dict(kind="ship", view="top", height=22, rotations=16),
    }

Each pose is rendered with an orthographic camera at 4x the final size, flat-shaded in the game's
toon bands (an emission shader works out the light, so there are no lamps and no noise), and with
a second pass for depth. Then numpy shrinks it to whole pixels (each pixel takes the commonest
colour under it), draws dark lines where the depth jumps (as the game's outline pass does) and a
1-px dark border round the silhouette. Every frame of every sprite goes into one atlas:

    public/art/minigames/<sheet>.png
    src/generated/sprites_<sheet>.json   (frame rects, pivots, clips; the runtime imports these)
"""
from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import math
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path

import bpy
import numpy as np
from mathutils import Euler, Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE.parent / "models"))
sys.path.insert(0, str(HERE))

import kit  # noqa: E402

OUT_PNG = ROOT / "public" / "art" / "minigames"
OUT_JSON = ROOT / "src" / "generated"
_KEPT = 0
SS = 4  # supersampling: rendered at 4x, then shrunk to whole pixels

# camera elevation above the horizon (degrees); the nose (+y) always points right on screen
VIEWS = {"side": 0.0, "three_quarter": 30.0, "top": 90.0}

# where the key light comes from, in screen space: (right, up, towards the camera). Top-down is the
# game's own sun as the game's camera sees it (from the left, a little from below, mostly
# overhead); for the other views it comes from the upper left, as in the painted event art.
LIGHT_TOP = (-30.0, -25.0, 60.0)
LIGHT_SIDE = (-35.0, 55.0, 45.0)

# toon bands, from three's MeshToonMaterial with the game's gradient (src/render/toon.ts): the
# light term n.l * 0.5 + 0.5 picks a band. Then colour = base * (AMBIENT + KEY * band).
BANDS = [(0.0, 0.26), (0.22, 0.47), (0.42, 0.69), (0.62, 0.88), (0.8, 1.0)]
AMBIENT, KEY = 0.16, 1.0
SUN = (1.0, 0.96, 0.88)     # warm light, cool shade: the painter's split tone of the pixel pass
SHADE = (0.86, 0.9, 1.08)
GLOW = 1.1                   # glow parts light themselves

OUTLINE = (0x12, 0x0C, 0x18)                         # the UI's DARK, round the silhouette
INK = np.array((0x1A, 0x14, 0x24)) / 255 * 2.4       # the game's uOutline * 2.4, for inner lines
INK_STRENGTH = 0.8


def fail(msg: str):
    print(f"sprites error: {msg}", flush=True)
    sys.exit(1)


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="one sheet (tools/sprites/<sheet>.py)")
    ap.add_argument("--preview", help="also write a zoomed contact sheet of every frame here")
    ap.add_argument("--zoom", type=int, default=4, help="with --preview: how much to zoom it")
    return ap.parse_args(argv)


def sheets():
    return sorted(p.stem for p in HERE.glob("*.py") if p.stem != "render" and not p.stem.startswith("_"))


# --- scene -------------------------------------------------------------------------------------

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit.reset()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in _engines() else "BLENDER_EEVEE_NEXT"
    scene.eevee.taa_render_samples = 1
    scene.render.filter_size = 0.0
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.resolution_percentage = 100
    scene.render.fps = kit.FPS
    cam = bpy.data.objects.new("sprite_cam", bpy.data.cameras.new("sprite_cam"))
    cam.data.type = "ORTHO"
    cam.data.clip_start = 0.1
    cam.data.clip_end = 500
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def _engines():
    return {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}


def roots():
    return [o for o in bpy.data.objects if o.parent is None and "kind" in o]


def toon_materials():
    """Swap every kit material for a flat emission shader that works out the toon bands itself.
    Returns the nodes holding the light direction, to point per sprite."""
    lights = []
    for mat in list(bpy.data.materials):
        if not mat.node_tree:
            continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        base = tuple(bsdf.inputs["Base Color"].default_value)[:3]
        glow = mat.name.startswith("glow") or mat.name.startswith("skinglow")
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        emit = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(emit.outputs[0], out.inputs["Surface"])
        if glow:
            emit.inputs["Color"].default_value = (*(min(1.0, c * GLOW) for c in base), 1)
            continue
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        dot = nt.nodes.new("ShaderNodeVectorMath")
        dot.operation = "DOT_PRODUCT"
        nt.links.new(geo.outputs["Normal"], dot.inputs[0])
        lights.append(dot.inputs[1])
        half = nt.nodes.new("ShaderNodeMath")
        half.operation = "MULTIPLY_ADD"
        half.inputs[1].default_value = 0.5
        half.inputs[2].default_value = 0.5
        nt.links.new(dot.outputs["Value"], half.inputs[0])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.interpolation = "CONSTANT"
        els = ramp.color_ramp.elements
        while len(els) < len(BANDS):
            els.new(0.5)
        for el, (pos, v) in zip(els, BANDS):
            el.position = pos
            el.color = (v, v, v, 1)
        nt.links.new(half.outputs[0], ramp.inputs["Fac"])
        # base * (SHADE * AMBIENT + SUN * KEY * band)
        key = nt.nodes.new("ShaderNodeVectorMath")
        key.operation = "MULTIPLY_ADD"
        key.inputs[1].default_value = tuple(s * KEY for s in SUN)
        key.inputs[2].default_value = tuple(s * AMBIENT for s in SHADE)
        nt.links.new(ramp.outputs["Color"], key.inputs[0])
        tint = nt.nodes.new("ShaderNodeVectorMath")
        tint.operation = "MULTIPLY"
        tint.inputs[1].default_value = base
        nt.links.new(key.outputs[0], tint.inputs[0])
        nt.links.new(tint.outputs[0], emit.inputs["Color"])
    return lights


def depth_material():
    """Emits the distance from the camera plane, for the inner outlines."""
    mat = bpy.data.materials.new("sprite_depth")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    cam = nt.nodes.new("ShaderNodeCameraData")
    nt.links.new(cam.outputs["View Z Depth"], emit.inputs["Color"])
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    return mat


# --- posing ------------------------------------------------------------------------------------

class Poser:
    """Remembers every object's rest pose, so each frame starts clean and plays one clip."""

    def __init__(self):
        self.rest = {o.name: (o.location.copy(), o.rotation_euler.copy(), o.scale.copy())
                     for o in bpy.data.objects if o.type != "CAMERA"}

    def pose(self, root, clip: bpy.types.Action | None, frame: float, turn: float):
        for o in bpy.data.objects:
            if o.animation_data:
                o.animation_data.action = None
            if o.name in self.rest:
                loc, rot, scale = self.rest[o.name]
                o.location, o.rotation_euler, o.scale = loc, rot, scale
        if clip is not None:
            for o in bpy.data.objects:
                if kit._slot(clip, o):
                    kit._bind(o, clip)
        whole = math.floor(frame)
        bpy.context.scene.frame_set(whole, subframe=frame - whole)
        r = self.rest[root.name][1]
        root.rotation_euler = (r.x, r.y, r.z + turn)
        bpy.context.view_layer.update()


def find_clip(kind: str, name: str, given):
    """A sprite clip names a kit clip: `<kind>_<name>`, `<kind>_<name>_idle`, or exactly `given`."""
    if name == "rest" and given is None:
        return None
    for key in ([given] if given else [f"{kind}_{name}", f"{kind}_{name}_idle", name]):
        if key in kit._CLIPS:
            return kit._CLIPS[key]
    fail(f"sprite clip '{name}': no kit clip named {given or f'{kind}_{name}[_idle]'}"
                     f" (have: {', '.join(sorted(kit._CLIPS)) or 'none'})")


def samples(act, n: int):
    """Frame numbers to sample a clip at, and its fps. Looping (_idle) clips skip the last key,
    which repeats the first; one-shots keep both ends."""
    if act is None:
        return [0.0], 0.0, True
    a, b = act.frame_range
    loop = act.name.endswith("_idle")
    dur = max(1e-6, (b - a) / kit.FPS)
    if loop or n == 1:
        times = [a + (b - a) * i / n for i in range(n)]
        fps = n / dur
    else:
        times = [a + (b - a) * i / (n - 1) for i in range(n)]
        fps = (n - 1) / dur
    return times, round(fps, 3), loop


def meshes(root):
    return [o for o in [root, *root.children_recursive] if o.type == "MESH"]


def corners(root):
    return [o.matrix_world @ Vector(c) for o in meshes(root) for c in o.bound_box]


def camera_basis(view, yaw=0.0):
    if isinstance(view, dict):
        el, yaw = float(view.get("el", 0)), float(view.get("yaw", 0))
    else:
        el = VIEWS[view]
    rot = Euler((math.radians(90 - el), 0, math.radians(90 + yaw)))
    m = rot.to_matrix()
    return rot, m.col[0], m.col[1], m.col[2]   # right, up, back (towards the camera)


# --- rendering ---------------------------------------------------------------------------------

def render_pass(path: Path, fmt: str):
    scene = bpy.context.scene
    scene.render.image_settings.file_format = fmt
    if fmt == "PNG":
        scene.render.image_settings.color_mode = "RGBA"
        scene.render.image_settings.color_depth = "8"
    else:
        scene.render.image_settings.color_mode = "RGB"
        scene.render.image_settings.color_depth = "32"
        scene.render.image_settings.exr_codec = "NONE"
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    if os.environ.get("SPRITE_KEEP"):   # debugging: keep every raw 4x render in this folder
        global _KEPT
        _KEPT += 1
        shutil.copy(path, Path(os.environ["SPRITE_KEEP"]) / f"{_KEPT:03d}{path.suffix}")
    img = bpy.data.images.load(str(path))
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[::-1]   # top row first


def shrink(col, depth, cover=0.45):
    """SSxSS blocks to one pixel: opaque if enough of it is, in the commonest colour under it,
    at the nearest depth under it."""
    H, W = col.shape[0] // SS, col.shape[1] // SS
    c8 = np.round(col * 255).astype(np.int64)
    blocks = c8.reshape(H, SS, W, SS, 4).transpose(0, 2, 1, 3, 4).reshape(H, W, SS * SS, 4)
    solid = blocks[..., 3] > 127
    key = np.where(solid, (blocks[..., 0] << 16) | (blocks[..., 1] << 8) | blocks[..., 2], -1)
    same = (key[..., :, None] == key[..., None, :]) & solid[..., None, :]
    best = np.argmax(same.sum(-1) * solid, axis=-1)
    pick = np.take_along_axis(key, best[..., None], -1)[..., 0]
    keep = solid.mean(-1) >= cover
    rgb = np.stack([(pick >> 16) & 255, (pick >> 8) & 255, pick & 255], -1).astype(np.float64)
    d = depth[..., 0].reshape(H, SS, W, SS).transpose(0, 2, 1, 3).reshape(H, W, SS * SS)
    near = np.where(solid, d, np.inf).min(-1)
    return rgb, keep, np.where(keep, near, np.inf)


def neighbours(a, fill):
    """a's four neighbours, stacked: up, down, left, right."""
    p = np.pad(a, 1, constant_values=fill)
    return np.stack([p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]])


def ink(rgb, keep, depth, edge, outline):
    """Inner lines where the depth jumps (the far side darkens), then a dark border round it all."""
    out = np.zeros((*keep.shape, 4), dtype=np.uint8)
    if edge:
        # a neighbour nearer by more than `edge`, beyond what the slope on the far side explains
        # (a surface seen at a glancing angle steps in depth every pixel; that isn't an edge)
        d = np.where(keep, depth, np.nan)
        nb = neighbours(d, np.nan)
        jump = d[None] - nb                      # up, down, left, right
        other = nb[[1, 0, 3, 2]] - d[None]       # the step on the opposite side
        crease = jump - np.nan_to_num(np.maximum(other, 0), nan=0.0)
        nearer = (np.nan_to_num(crease, nan=0.0) > edge).any(0) & keep
        rgb = np.where(nearer[..., None], rgb * (1 - INK_STRENGTH) + rgb * INK * INK_STRENGTH, rgb)
    out[..., :3] = np.clip(np.round(rgb), 0, 255)
    out[..., 3] = np.where(keep, 255, 0)
    if outline:
        rim = neighbours(keep, False).any(0) & ~keep
        out[rim] = (*OUTLINE, 255)
    return out


def render_sprite(name, spec, cam, poser, lights, depth_mat, tmp: Path):
    kind = spec.get("kind", name)
    variant = spec.get("variant")
    root = next((o for o in roots() if o["kind"] == kind and (variant is None or o.get("variant", 0) == variant)), None)
    if root is None:
        fail(f"sprite '{name}': no template with kind={kind}" + (f" variant={variant}" if variant is not None else ""))
    view = spec.get("view", "side")
    rot, right, up, back = camera_basis(view)
    light = Vector(spec.get("light") or (LIGHT_TOP if view == "top" else LIGHT_SIDE)).normalized()
    lw = right * light.x + up * light.y + back * light.z
    for sock in lights:
        sock.default_value = tuple(lw)
    turns = int(spec.get("rotations", 1))

    # only this template shows
    mine = {o.name for o in [root, *root.children_recursive]}
    for o in bpy.data.objects:
        if o.type in ("MESH", "EMPTY"):
            o.hide_render = o.name not in mine

    # scale: pixels a unit, from the rest pose facing right
    poser.pose(root, None, 0, 0)
    pts = corners(root)
    o = root.matrix_world.translation
    w = max(p.dot(right) for p in pts) - min(p.dot(right) for p in pts)
    h = max(p.dot(up) for p in pts) - min(p.dot(up) for p in pts)
    if "ppu" in spec:
        ppu = float(spec["ppu"])
    elif "width" in spec:
        ppu = spec["width"] / w
    else:
        ppu = spec.get("height", 24) / h
    reach = max((p - o).length for p in pts) * float(spec.get("margin", 1.3))
    cells = 2 * math.ceil(reach * ppu) + 4

    scene = bpy.context.scene
    scene.render.resolution_x = scene.render.resolution_y = cells * SS
    cam.data.ortho_scale = cells / ppu
    cam.rotation_euler = rot
    cam.location = o + back * 200

    clips = spec.get("clips") or {"rest": 1}
    frames = []   # (clip, angle, i, rgba)
    clip_meta = {}
    for cname, cval in clips.items():
        given, n = (cval if isinstance(cval, (tuple, list)) else (None, cval))
        act = find_clip(kind, cname, given)
        times, fps, loop = samples(act, int(n))
        clip_meta[cname] = {"fps": fps, "loop": loop, "n": len(times)}
        for a in range(turns):
            for i, f in enumerate(times):
                poser.pose(root, act, f, -2 * math.pi * a / turns)
                scene.view_layers[0].material_override = None
                col = render_pass(tmp / "c.png", "PNG")
                if spec.get("edge", 0.3):
                    scene.view_layers[0].material_override = depth_mat
                    dep = render_pass(tmp / "d.exr", "OPEN_EXR")
                    scene.view_layers[0].material_override = None
                else:
                    dep = np.zeros_like(col)
                rgb, keep, near = shrink(col, dep, spec.get("cover", 0.45))
                frames.append((cname, a, i, ink(rgb, keep, near, spec.get("edge", 0.3), spec.get("outline", True))))

    # crop every frame to the same box: the union of what's drawn
    any_px = np.zeros((cells, cells), bool)
    for *_, img in frames:
        any_px |= img[..., 3] > 0
    ys, xs = np.nonzero(any_px)
    if not len(xs):
        fail(f"sprite '{name}': nothing rendered (is the template empty, or off camera?)")
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    frames = [(c, a, i, img[y0:y1, x0:x1]) for c, a, i, img in frames]
    meta = {
        "w": int(x1 - x0), "h": int(y1 - y0),
        "px": int(cells // 2 - x0), "py": int(cells // 2 - y0),
        "angles": turns, "ppu": round(ppu, 3), "view": view if isinstance(view, str) else "custom",
        "clips": clip_meta,
    }
    return meta, frames


def pack(images):
    """Shelf-pack images (each [h, w, 4]) with a 1-px gap; identical frames share a rect."""
    uniq, index = [], {}
    slots = []
    for img in images:
        key = hashlib.sha1(img.tobytes() + str(img.shape[:2]).encode()).hexdigest()
        if key not in index:
            index[key] = len(uniq)
            uniq.append(img)
        slots.append(index[key])
    area = sum((im.shape[0] + 1) * (im.shape[1] + 1) for im in uniq)
    width = max(max(im.shape[1] for im in uniq) + 1, min(1024, math.ceil(math.sqrt(area * 1.25))))
    order = sorted(range(len(uniq)), key=lambda k: -uniq[k].shape[0])
    rects = [None] * len(uniq)
    x = y = shelf = 0
    for k in order:
        h, w = uniq[k].shape[:2]
        if x + w > width:
            x, y, shelf = 0, y + shelf + 1, 0
        rects[k] = (x, y)
        x += w + 1
        shelf = max(shelf, h)
    height = y + shelf
    atlas = np.zeros((height, width, 4), np.uint8)
    for k, (x, y) in enumerate(rects):
        h, w = uniq[k].shape[:2]
        atlas[y:y + h, x:x + w] = uniq[k]
    return atlas, [rects[s] for s in slots]


def save_png(arr, path: Path):
    h, w = arr.shape[:2]
    img = bpy.data.images.new("out", w, h, alpha=True)
    img.pixels.foreach_set((arr[::-1].astype(np.float32) / 255).ravel())
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save()
    bpy.data.images.remove(img)


def preview(atlas, path: Path, zoom: int):
    """The atlas at 1x and zoomed, over the minigames' dusky background."""
    h, w = atlas.shape[:2]
    bg = np.array((0x2A, 0x22, 0x38, 255), np.uint8)
    big = atlas.repeat(zoom, 0).repeat(zoom, 1)
    out = np.empty((h + 8 + h * zoom + 8, max(w, w * zoom) + 8, 4), np.uint8)
    out[:] = bg
    for img, y in ((atlas, 4), (big, h + 8)):
        ih, iw = img.shape[:2]
        a = img[..., 3:4] / 255
        region = out[y:y + ih, 4:4 + iw]
        region[..., :3] = (img[..., :3] * a + region[..., :3] * (1 - a)).astype(np.uint8)
    save_png(out, path)


def run(sheet: str, preview_to: str | None, zoom: int):
    t0 = time.time()
    cam = reset_scene()
    mod = importlib.import_module(sheet)
    mod.build()
    specs = getattr(mod, "SPRITES", None)
    if not specs:
        fail(f"{sheet}.py has no SPRITES")
    poser = Poser()
    lights = toon_materials()
    depth_mat = depth_material()
    out, images, where = {}, [], []
    with tempfile.TemporaryDirectory() as tmp:
        for name, spec in specs.items():
            meta, frames = render_sprite(name, spec, cam, poser, lights, depth_mat, Path(tmp))
            out[name] = meta
            for c, a, i, img in frames:
                where.append((name, c, a, i))
                images.append(img)
    atlas, rects = pack(images)
    for (name, c, a, i), (x, y) in zip(where, rects):
        clip = out[name]["clips"][c]
        clip.setdefault("frames", [None] * (clip["n"] * out[name]["angles"]))[a * clip["n"] + i] = [x, y]
    for meta in out.values():
        for clip in meta["clips"].values():
            del clip["n"]
    save_png(atlas, OUT_PNG / f"{sheet}.png")
    OUT_JSON.mkdir(parents=True, exist_ok=True)
    doc = {"image": f"art/minigames/{sheet}.png", "w": int(atlas.shape[1]), "h": int(atlas.shape[0]), "sprites": out}
    (OUT_JSON / f"sprites_{sheet}.json").write_text(json.dumps(doc, separators=(",", ":")))
    if preview_to:
        preview(atlas, Path(preview_to), zoom)
    print(f"sprites {sheet}: {len(out)} sprites, {len(images)} frames, atlas {atlas.shape[1]}x{atlas.shape[0]}, "
          f"{time.time() - t0:.1f}s")


def main():
    a = args()
    for sheet in [a.only] if a.only else sheets():
        run(sheet, a.preview if a.only else None, a.zoom)


main()
