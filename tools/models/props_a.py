"""Scenery props for the first four planets: ORU-TAL, HALCYON, KESSRA and MIREFALL.

Each planet's kinds live in their own module (props_a_<planet>.py), with shared helpers in
props_a_lib.py. Every template is a root with kind=<name> and variant=<n>; obstacles (top >= 13)
carry obstacle=1 and collider markers.
"""
import props_a_orutal
import props_a_halcyon
import props_a_kessra
import props_a_mirefall


def build():
    props_a_orutal.build()
    props_a_halcyon.build()
    props_a_kessra.build()
    props_a_mirefall.build()
