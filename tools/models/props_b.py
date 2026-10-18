"""Scenery props for the last four planets: Glacis, Ashgrave, Vesh and Cinder Orchard.

Each planet lives in its own module (props_b_glacis.py, props_b_ashgrave.py, props_b_vesh.py,
props_b_cinder.py); shared helpers (faceted painting, limbs, idle clips) are in props_b_kit.py.

Obstacles (top >= 13) carry `collider` markers: ice_spire, alien_pylon, giant_rib (one per foot,
none under the span), smokestack. Idle clips: alien_pylon_<v>_pulse_idle, machine_dome_<v>_pulse_idle,
bonfire_<v>_flicker_idle, smokestack_<v>_flare_idle, mangrove_<v>_sway_idle, mech_arm_0_twitch_idle.
"""
import importlib

PLANETS = ["props_b_glacis", "props_b_ashgrave", "props_b_vesh", "props_b_cinder"]


def build():
    for name in PLANETS:
        importlib.import_module(name).build()
