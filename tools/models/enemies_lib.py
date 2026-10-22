"""Shared pieces for the enemy models (enemies.py and its enemies_<group>.py modules): the skin
slots, stand-in colours, the root makers and the part helpers. See enemies.py for the contract the
runtime expects of an enemy template.
"""
from __future__ import annotations

import math
import os

from kit import Model, Skin, group
from creatures_util import TAU, chain, flat, limb, linearize, osc, sample

# stand-in colours (the runtime repaints the slots): warm hull, slate trim, hot accent
A = Skin("a", "#d6b277")
B = Skin("b", "#3f4a63")
C = Skin("c", "#ff5a3a")
DARK = "#1b1a20"      # intakes, nozzles, gun bores, pupils
GLASS = "#24323e"     # canopies

CLIPS: dict[str, str] = {}


# --- helpers ---------------------------------------------------------------------------------

def _root(arch: str, fam: str, clip: str, **props):
    kind = f"enemy_{arch}_{fam}"
    CLIPS[kind] = f"{kind}_{clip}_idle"
    return kind, CLIPS[kind], group(kind, kind=kind, archetype=arch, family=fam, **props)


def hull(m: Model, outline, z0, z1, color, inset=0.7, glow=False):
    """A slab whose top is the outline shrunk towards its centre: chunky sloped sides."""
    cx = sum(p[0] for p in outline) / len(outline)
    cy = sum(p[1] for p in outline) / len(outline)
    top = [(cx + (x - cx) * inset, cy + (y - cy) * (0.5 + inset / 2)) for x, y in outline]
    return m.slab(outline, z0, z1, color, top=top, glow=glow)


def mirror(pts):
    """The -x twin of a +x outline (still counter-clockwise)."""
    return [(-x, y) for x, y in reversed(pts)]


def both(pts):
    return [pts, mirror(pts)]


def tube(m: Model, r, y0, y1, x, z, color, segs=8, r_end=None, glow=False):
    """A cylinder lying along y from y0 to y1."""
    if y1 >= y0:
        return m.cyl(r, y1 - y0, (x, y0, z), color, segs=segs, r_top=r_end, rot=(-math.pi / 2, 0, 0), glow=glow)
    return m.cyl(r, y0 - y1, (x, y0, z), color, segs=segs, r_top=r_end, rot=(math.pi / 2, 0, 0), glow=glow)


def fin(m: Model, pts_yz, x, thick, color, glow=False):
    """An upright fin: a profile in (y, z) given its thickness along x."""
    return m.prism(pts_yz, thick, (x, 0, 0), color, rot=(0, 0, math.pi / 2), glow=glow)


def marker(parent, kind, part, loc, n=None):
    name = f"{kind}_{part}" + ("" if n is None else f"_{n}")
    return group(name, loc, parent=parent, part=part)


def spin(obj, clip, T, turns, axis=2, phase=0.0):
    """Whole turns about one axis over the loop (sampled every frame so the slerp can't go astray)."""
    def f(u):
        v = [0.0, 0.0, 0.0]
        v[axis] = TAU * (turns * u + phase)
        return v
    sample(obj, clip, "rotation_euler", T, f, step=1)


def pulse(obj, clip, T, amp=0.25, harm=1, phase=0.0, axes=(0, 1, 2)):
    osc(obj, clip, "scale", T, *[(ax, amp, harm, phase) for ax in axes])


def flame(parent, name, loc, r, length, clip, T, phase=0.0, k=2):
    """A glowing exhaust cone pointing back (-y), flickering."""
    f = Model(name)
    f.cyl(r, length, (0, 0, 0), C, segs=6, r_top=0.0, rot=(math.pi / 2, 0, 0), glow=True)
    obj = f.build(parent, loc=loc)
    osc(obj, clip, "scale", T, (1, 0.3, k, phase), (0, 0.12, k + 1, phase + 0.2), (2, 0.12, k + 1, phase + 0.2))
    return obj


def rotor(parent, name, loc, r, blades, clip, T, turns, color=A, hub=B):
    m = Model(name)
    for k in range(blades):
        a = math.pi * 2 * k / blades
        m.box((r * 2 if blades == 2 else r, 0.14 + r * 0.08, 0.04),
              ((0 if blades == 2 else math.cos(a) * r / 2), (0 if blades == 2 else math.sin(a) * r / 2), 0),
              color, rot=(0.12, 0, a))
        if blades == 2:
            break
    m.cyl(0.1 + r * 0.08, 0.1, (0, 0, -0.03), hub, segs=6)
    obj = m.build(parent, loc=loc)
    spin(obj, clip, T, turns)
    return obj


def wing_pair(parent, name, at, outline, thick, color, clip, T, amp, harm=1, phase=0.0, dihedral=0.0,
              extra=None):
    """Two flat wings hinged at (±x, y, z), flapping about y. `outline` is the +x wing about its hinge."""
    out = []
    for s in (1, -1):
        w = Model(f"{name}_{'r' if s > 0 else 'l'}")
        flat(w, outline if s > 0 else mirror(outline), 0, thick, color)
        if extra:
            extra(w, s)
        obj = w.build(parent, loc=(s * at[0], at[1], at[2]))
        obj.rotation_euler[1] = -s * dihedral
        osc(obj, clip, "rotation_euler", T, (1, s * amp, harm, phase))
        out.append(obj)
    return out


def eyes(m: Model, x, y, z, r, color=C, pupil=True):
    for s in (1, -1):
        m.ball(r, (s * x, y, z), color, subdiv=1, glow=True)
        if pupil:
            m.box((r * 0.5, r * 0.4, r * 1.2), (s * x, y + r * 0.85, z), DARK)


FOAM = "#eef4f2"


def mount(parent, kind, part, loc, n=None):
    """A marker that also lands in src/generated/enemies.json's mounts (type = part), for the sim."""
    obj = marker(parent, kind, part, loc, n)
    obj["mount"] = part
    return obj


def named(slug: str, arch: str, fam: str, clip: str, preview=None, **props):
    """The root of a named enemy's own model, `enemy_<slug>` (slug: its name in lower case, words
    joined by `_`, e.g. "Hesk Skiff" -> hesk_skiff; serpents add `_head`, `_body`, `_tail`). The
    runtime looks for it first and falls back on `enemy_<arch>_<fam>`. `preview` is the wearer's
    (a, b, c) colours, painted on in previews only (ENEMY_PREVIEW_PAINT=1)."""
    kind = f"enemy_{slug}"
    CLIPS[kind] = f"{kind}_{clip}_idle"
    root = group(kind, kind=kind, archetype=arch, family=fam, **props)
    if preview:
        _PREVIEW[kind] = preview
    return kind, CLIPS[kind], root


_PREVIEW: dict[str, tuple[str, str, str]] = {}


def paint_previews():
    """Previews only: each named root in its wearer's colours (as the runtime would paint it), so
    contrast can be judged. Optionally stands everything on a ground of ENEMY_PREVIEW_GROUND."""
    import bpy
    import kit
    for root in [o for o in bpy.data.objects if o.parent is None and o.get("kind") in _PREVIEW]:
        cols = _PREVIEW[root["kind"]]
        made = {}
        for o in [root, *root.children_recursive]:
            if o.type != "MESH":
                continue
            for i, m in enumerate(o.data.materials):
                hit = m and m.name.startswith("skin")
                if not hit:
                    continue
                if m.name not in made:
                    parts = m.name.split("_")            # skin[glow]_<slot>[_s<k>]
                    slot = parts[1]
                    k = int(parts[2][1:]) / 100 if len(parts) > 2 else 1.0
                    base = cols["abc".index(slot)].lstrip("#")
                    rgb = [min(255, round(int(base[j:j + 2], 16) * k)) for j in (0, 2, 4)]
                    hexc = "#" + "".join(f"{v:02x}" for v in rgb)
                    made[m.name] = kit.material(hexc, glow=m.name.startswith("skinglow"))
                o.data.materials[i] = made[m.name]
    ground = os.environ.get("ENEMY_PREVIEW_GROUND")
    if ground:
        bpy.ops.mesh.primitive_plane_add(size=2000, location=(0, 0, -0.005))
        bpy.context.object.data.materials.append(kit.material(ground))
