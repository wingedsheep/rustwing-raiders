"""Shared helpers for creatures.py and enemies.py: tapered limbs, and loop animation sampled from
functions (so every *_idle clip is seamless: the samples run from phase 0 to phase 1)."""
from __future__ import annotations

import math

from mathutils import Vector

import kit
from kit import Model, animate

TAU = math.tau


def limb(m: Model, a, b, r0, r1, color, segs=6, glow=False):
    """A tapered round limb from a (radius r0) to b (radius r1)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler()
    return m.cyl(r0, d.length, tuple(a), color, segs=segs, r_top=r1, rot=tuple(rot), glow=glow)


def chain(m: Model, pts, radii, color, segs=6, joints=True):
    """A bent tube through pts, radius radii[i] at pts[i]; balls at the joints hide the creases."""
    for i in range(len(pts) - 1):
        limb(m, pts[i], pts[i + 1], radii[i], radii[i + 1], color, segs=segs)
        if joints and 0 < i + 1 < len(pts) - 1:
            m.ball(radii[i + 1] * 1.02, pts[i + 1], color, subdiv=1)


def flat(m: Model, pts, z, thick, color, glow=False):
    """A flat plate from an XY outline (counter-clockwise), centred on height z."""
    return m.slab(pts, z - thick / 2, z + thick / 2, color, glow=glow)


def sample(obj, clip: str, path: str, T: float, f, step: int = 2):
    """Keyframe obj.path for a loop of T seconds from f(u) -> 3-vector offset, u in [0, 1]."""
    F = round(T * kit.FPS)
    frames = list(range(0, F, step)) + [F]
    animate(obj, clip, path, [(fr / kit.FPS, tuple(f(fr / F))) for fr in frames])


def osc(obj, clip: str, path: str, T: float, *terms, step: int = 2):
    """Sum of sines: terms are (axis, amplitude, harmonic, phase) with phase in cycles."""
    def f(u):
        v = [0.0, 0.0, 0.0]
        for ax, amp, h, ph in terms:
            v[ax] += amp * math.sin(TAU * (h * u + ph))
        return v
    sample(obj, clip, path, T, f, step)


def smooth_keys(points):
    """Piecewise smoothstep through [(u, (x, y, z)), ...] (u in [0, 1]) as a function of u."""
    def f(u):
        for (u0, a), (u1, b) in zip(points, points[1:]):
            if u0 <= u <= u1:
                k = 0 if u1 == u0 else (u - u0) / (u1 - u0)
                k = k * k * (3 - 2 * k)
                return [a[i] + (b[i] - a[i]) * k for i in range(3)]
        return list(points[-1][1])
    return f


def linearize():
    """Every key linear: the samples are dense, and Bezier easing would hitch at the loop seam."""
    for act in kit._CLIPS.values():
        curves = []
        if hasattr(act, "layers"):
            for layer in act.layers:
                for strip in layer.strips:
                    for bag in getattr(strip, "channelbags", []):
                        curves.extend(bag.fcurves)
        if not curves and hasattr(act, "fcurves"):
            curves = list(act.fcurves)
        for fc in curves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
