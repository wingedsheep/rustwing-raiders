/**
 * Parts on the forge's bench: new guns being tried out (see docs/parts-variety.md). They aren't in
 * PARTS, so no dealer, loot card or event offers them; the wave lab's forge, `&forge` in the URL
 * and the headless runs register them (with any parts made in the forge) for that session.
 *
 * Each has a personality: a pattern and a quirk nobody else has, and a pilot who'll love it.
 */

import { PARTS, type PartDef } from './parts';

export const LAB_PARTS: PartDef[] = [
  {
    id: 'wave', name: 'Wave Emitter', cls: 'gun', tags: ['energy'], rarity: 'rare', shape: [[0, 0], [1, 0]], mass: 1.8,
    gun: { rate: 2.4, damage: 9, speed: 17, count: 1, spread: 0, life: 1.7, shot: 'pellet', pierce: 99, heat: 0.05, edge: 'crowd', shove: 0.35, size: 3.2, tint: 0x7af0d0 },
    text: 'Slow rippling waves that pass through everything, shoving it back. Thrown into each other, enemies take a blow.',
  },
  {
    id: 'hive', name: 'Hive Darts', cls: 'gun', tags: ['tech'], rarity: 'common', shape: [[0, 0]], mass: 1,
    gun: { rate: 7, damage: 2.6, speed: 22, count: 2, spread: 0.9, life: 1.4, shot: 'pellet', heat: 0.03, edge: 'tell', homing: 2.2, tint: 0xffe070 },
    text: 'A buzz of slow little darts that find their own way. They never miss, and they hit soft.',
  },
  {
    id: 'needle', name: 'Phase Needle', cls: 'gun', tags: ['energy'], rarity: 'epic', shape: [[0, 0], [0, 1]], mass: 1.4,
    gun: { rate: 5, damage: 7, speed: 90, count: 1, spread: 0, life: 0.6, shot: 'slug', heat: 0.04, edge: 'far', phase: true, size: 0.6, tint: 0xff7ad8 },
    text: 'Needles that go through shields and plating to the hull. They never break plating, so nothing reels: it just dies.',
  },
  {
    id: 'bumper', name: 'Bumper Charge', cls: 'gun', tags: ['kinetic'], rarity: 'common', shape: [[0, 0]], mass: 1.6,
    gun: { rate: 0.9, damage: 14, speed: 40, count: 1, spread: 0, life: 0.8, shot: 'slug', heat: 0, edge: 'airborne', heavy: 3, shove: 1.2, size: 2.6, tint: 0xff9a4a },
    text: 'A fat, slow round that barely hurts, and hurls what it hits until it hits something: a blow on both.',
  },

  // --- the new kit: aux, skins, bombs (see sim/kit.ts) ---------------------------------------
  {
    id: 'bulwark', name: 'Bulwark', cls: 'defense', tags: ['energy', 'tech'], rarity: 'rare', shape: [[0, 0], [1, 0]], mass: 2, aux: 'bulwark',
    text: 'AUX (HOLD): a wall of light ahead that stops every bullet and beam. You crawl behind it, and it fills. Let go and it throws all it took up the screen as one blow.',
  },
  {
    id: 'beacon', name: 'Swap Beacon', cls: 'defense', tags: ['tech', 'drive'], rarity: 'rare', shape: [[0, 0]], mass: 0.8, aux: 'beacon',
    text: 'AUX: throw a beacon the way you’re going. Press again to change places with it. It’s left where you were, swallows what was coming for you, and bursts with it.',
  },
  {
    id: 'ablative', name: 'Ablative Skin', cls: 'defense', tags: ['kinetic'], rarity: 'rare', shape: [[0, 0], [1, 0]], mass: 1.6, passive: { skin: 'ablative' },
    text: 'Three thin layers over the hull. Each takes a hit and goes in a spray of shrapnel. They only grow back on takedowns: a shield you earn by killing.',
  },
  {
    id: 'static', name: 'Static Skin', cls: 'defense', tags: ['arc'], rarity: 'rare', shape: [[0, 0]], mass: 0.9, passive: { skin: 'static' },
    text: 'Every graze charges it. The next thing that touches you, or hits you, gets all of it as lightning.',
  },
  {
    id: 'carpet', name: 'Carpet Bomb', cls: 'special', tags: ['explosive'], rarity: 'common', shape: [[0, 0]], mass: 1.5, special: 'carpet',
    text: 'SPECIAL: bomblets rain behind you for 2 s. Fly the line you want bombed. They knock bullets out of the air as they go.',
  },
  {
    id: 'cryobomb', name: 'Cryo Bomb', cls: 'special', tags: ['energy'], rarity: 'rare', shape: [[0, 0]], mass: 1.2, special: 'cryo',
    text: 'SPECIAL: everything on screen freezes for 2 s, bullets too. Frozen bullets hang where they are, still deadly, then fall as snow.',
  },
  {
    id: 'gravity', name: 'Gravity Well', cls: 'special', tags: ['tech'], rarity: 'epic', shape: [[0, 0]], mass: 1.4, special: 'gravity',
    text: 'SPECIAL: a knot opens ahead and drags everything near into it, bullets too. Then it lets go: they fly apart into each other.',
  },
  {
    id: 'drones', name: 'Drone Wing', cls: 'special', tags: ['tech', 'drive'], rarity: 'epic', shape: [[0, 0]], mass: 1.3, special: 'drones',
    text: 'SPECIAL: four drones fly off your wings for 8 s, each firing a copy of your trigger gun, rolls and all.',
  },
];

/** Puts the bench's parts (and any made in the forge) where the game looks for parts. Safe to call twice. */
export function registerLabParts(extra: PartDef[] = []) {
  for (const d of [...LAB_PARTS, ...extra]) {
    const at = PARTS.findIndex((p) => p.id === d.id);
    if (at >= 0) PARTS[at] = d;
    else PARTS.push(d);
  }
}
