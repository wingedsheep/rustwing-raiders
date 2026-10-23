/**
 * How each place looks past its scattered props, by biome id: the set pieces that make a ship feel
 * small (spans you fly under, gates you thread, giants lying under the flight line), the haze that
 * drifts past the screen's edges high over you, faster than the land (parallax), and the pattern
 * painted into its ground.
 *
 * Set pieces are models in tools/models/set_<planet>.py; see ART.md for their shapes and sizes.
 */

/**
 * - span: reaches right across the field above the flight line (deck bottom 13 or more), its legs
 *   out at the sides (and now and then one in the middle): you fly under it.
 * - gate: a cluster of columns taller than you fly with narrow gaps between them, stood off to one
 *   side so the other is open: thread it close (and skim for Burn) or go round.
 * - giant: something enormous lying under the flight line (a carcass, a hull, a ruin): you fly
 *   over it. Any part reaching the flight line needs colliders.
 */
export type SetRole = 'span' | 'gate' | 'giant';

export interface SetPiece {
  kind: string;
  role: SetRole;
  w: number;
}

/**
 * Patterns painted into the ground, per pixel (see world-view.ts):
 * - cells: a network of polygons (salt pans, basalt column tops, dried mud)
 * - cracks: thin wandering fractures, sparse (ice, dry beds)
 * - veins: branching lines (crystal veins, lava rivulets, mycelium)
 * - tiles: square paving with joints, each slab its own shade (temples, concrete pads)
 * - ripples: wind- or water-combed lines running across
 * - rings: rings round scattered centres (chemical stains, fairy rings, coral)
 * - streaks: long smears along the wind (ash, glass, scorched ground)
 * - plates: big riveted panels (metal decks, machine city)
 */
export type GroundPattern = 'cells' | 'cracks' | 'veins' | 'tiles' | 'ripples' | 'rings' | 'streaks' | 'plates';

export const PATTERNS: GroundPattern[] = ['cells', 'cracks', 'veins', 'tiles', 'ripples', 'rings', 'streaks', 'plates'];

export interface Look {
  sets: SetPiece[];
  /** Chance a chunk (16 units) has a set piece. */
  setChance?: number;
  /**
   * The near layer: banks of cloud, smoke or spores drifting past the screen's edges high over
   * you (see view/near.ts): their colour, how thick (0..1, 0.4 if not said), lit from within
   * (spores, a glowing smog), and how often one comes by, per second, about (0.25 if not said).
   */
  haze?: { color: number; alpha?: number; glow?: boolean; rate?: number };
  /**
   * Painted into the ground: the pattern, its colour, its size (world units a cell), how strong
   * (0..1), glow (0..1+, lit from within), how much it comes and goes in big soft patches (0 even
   * … 1 in islands), and the height it keeps under (it fades out over the unit above: lava cracks
   * in the hollows, say).
   */
  pattern?: { kind: GroundPattern; color: number; scale: number; amount: number; glow?: number; patchy?: number; below?: number };
}

const NONE: Look = { sets: [] };

export const LOOKS: Record<string, Look> = {
  // ── ORU-TAL ────────────────────────────────────────────────────────────────────────────────
  fernwood: {
    sets: [
      { kind: 'orutal_fern_log', role: 'span', w: 3 },
      { kind: 'orutal_titan_ferns', role: 'gate', w: 2 },
      { kind: 'orutal_sauropod_bones', role: 'giant', w: 2 },
    ],
    setChance: 0.2,
    haze: { color: 0xd8f0d8 },
  },
  basalt: {
    sets: [
      { kind: 'orutal_basalt_arch', role: 'span', w: 3 },
      { kind: 'orutal_hex_gate', role: 'gate', w: 2 },
      { kind: 'orutal_caldera', role: 'giant', w: 2 },
    ],
    setChance: 0.2,
    haze: { color: 0x9a929a, alpha: 0.3, rate: 0.15 },
    pattern: { kind: 'streaks', color: 0x9a96a0, scale: 5, amount: 0.45, patchy: 0.6 },
  },
  prism: {
    sets: [
      { kind: 'orutal_crystal_bridge', role: 'span', w: 3 },
      { kind: 'orutal_geode', role: 'giant', w: 2 },
    ],
    setChance: 0.2,
    haze: { color: 0x9a7ad8, glow: true, alpha: 0.35, rate: 0.2 },
    pattern: { kind: 'veins', color: 0xf0c8ff, scale: 9, amount: 0.6, glow: 0.4 },
  },
  jade: {
    sets: [
      { kind: 'orutal_sea_arch', role: 'span', w: 3 },
      { kind: 'orutal_stack_gate', role: 'gate', w: 2 },
      { kind: 'orutal_ammonite', role: 'giant', w: 2 },
    ],
    setChance: 0.2,
    haze: { color: 0xd8f4ee, rate: 0.2 },
    pattern: { kind: 'ripples', color: 0xd8c890, scale: 2.4, amount: 0.3, patchy: 0.5, below: 2.6 },
  },
  // ── HALCYON ────────────────────────────────────────────────────────────────────────────────
  kelp: {
    sets: [
      { kind: 'halcyon_kelp_arch', role: 'span', w: 3 },
      { kind: 'halcyon_drowned_ark', role: 'giant', w: 2 },
    ],
    setChance: 0.2,
    haze: { color: 0xe0ecff },
    pattern: { kind: 'ripples', color: 0xd8b880, scale: 2.6, amount: 0.3, patchy: 0.6, below: 2.9 },
  },
  stiltport: {
    sets: [
      { kind: 'halcyon_gantry', role: 'span', w: 3 },
      { kind: 'halcyon_stilt_towers', role: 'gate', w: 2 },
      { kind: 'halcyon_barge', role: 'giant', w: 2 },
    ],
    setChance: 0.2,
    haze: { color: 0x4a3a6a, alpha: 0.3 },
    pattern: { kind: 'plates', color: 0x0e2232, scale: 4, amount: 0.35, patchy: 0.5 },
  },
  arkbones: {
    sets: [
      { kind: 'halcyon_ark_ribs', role: 'span', w: 3 },
      { kind: 'halcyon_ark_fins', role: 'gate', w: 2 },
      { kind: 'halcyon_ark_wreck', role: 'giant', w: 2 },
    ],
    setChance: 0.2,
    haze: { color: 0xb08a78, alpha: 0.4, rate: 0.2 },
    pattern: { kind: 'streaks', color: 0x7a4628, scale: 5, amount: 0.3, patchy: 0.7 },
  },
  stormwall: {
    sets: [
      { kind: 'halcyon_storm_pylons', role: 'span', w: 3 },
      { kind: 'halcyon_storm_towers', role: 'gate', w: 2 },
      { kind: 'halcyon_capsized_hulk', role: 'giant', w: 2 },
    ],
    setChance: 0.2,
    haze: { color: 0x5a6478, alpha: 0.45, rate: 0.3 },
    pattern: { kind: 'cracks', color: 0x2a3036, scale: 6, amount: 0.5 },
  },
  // ── KESSRA ─────────────────────────────────────────────────────────────────────────────────
  saltpans: {
    sets: [
      { kind: 'kessra_leviathan', role: 'giant', w: 2 },
      { kind: 'kessra_salt_arch', role: 'span', w: 2 },
    ],
    setChance: 0.2,
    pattern: { kind: 'cells', color: 0xa89aa0, scale: 4.5, amount: 0.55 },
  },
  mesarun: {
    sets: [
      { kind: 'kessra_rock_bridge', role: 'span', w: 2 },
      { kind: 'kessra_rope_bridge', role: 'span', w: 2 },
      { kind: 'kessra_race_gantry', role: 'span', w: 1 },
    ],
    setChance: 0.2,
    haze: { color: 0xe0a888, alpha: 0.4 },
    // (faint, in patches: the floor's the calm stage)
    pattern: { kind: 'ripples', color: 0x8a3a24, scale: 2.6, amount: 0.16, patchy: 0.6, below: 3 },
  },
  monoliths: {
    sets: [
      { kind: 'kessra_colossus', role: 'giant', w: 2 },
      { kind: 'kessra_henge', role: 'gate', w: 2 },
      { kind: 'kessra_obelisk_span', role: 'span', w: 1.5 },
    ],
    setChance: 0.2,
    haze: { color: 0xd8b0a0, alpha: 0.4, rate: 0.2 },
    pattern: { kind: 'ripples', color: 0xa85a38, scale: 3.4, amount: 0.3, patchy: 0.5 },
  },
  oasis: {
    sets: [
      { kind: 'kessra_sandcrawler', role: 'giant', w: 1.5 },
      { kind: 'kessra_sunsails', role: 'span', w: 2 },
      { kind: 'kessra_aqueduct', role: 'span', w: 1.5 },
    ],
    setChance: 0.2,
    haze: { color: 0xf4f0e8, rate: 0.2 },
    pattern: { kind: 'ripples', color: 0xb8885a, scale: 2.6, amount: 0.25, patchy: 0.7 },
  },
  // ── MIREFALL ───────────────────────────────────────────────────────────────────────────────
  glowcap: {
    sets: [
      { kind: 'mirefall_cap_gate', role: 'gate', w: 2 },
      { kind: 'mirefall_fallen_stalk', role: 'span', w: 2 },
    ],
    setChance: 0.2,
    haze: { color: 0x9a7ad0, glow: true, alpha: 0.35 },
    pattern: { kind: 'veins', color: 0x9aff6a, scale: 8, amount: 0.28, glow: 0.35, patchy: 0.55 },
  },
  peat: {
    sets: [
      { kind: 'mirefall_drowned_roots', role: 'span', w: 2 },
      { kind: 'mirefall_bog_beast', role: 'giant', w: 2 },
    ],
    setChance: 0.2,
    haze: { color: 0xb8c8a0, alpha: 0.5, rate: 0.3 },
    pattern: { kind: 'ripples', color: 0x8aa850, scale: 2.4, amount: 0.3, patchy: 0.7 },
  },
  temple: {
    sets: [
      { kind: 'mirefall_causeway', role: 'span', w: 2 },
      { kind: 'mirefall_ziggurat_ruin', role: 'giant', w: 2 },
      { kind: 'mirefall_pillar_gate', role: 'gate', w: 2 },
    ],
    setChance: 0.2,
    haze: { color: 0xc8dcd0, rate: 0.22 },
    pattern: { kind: 'tiles', color: 0x6a5a6a, scale: 3, amount: 0.4, patchy: 0.6 },
  },
  sporevents: {
    sets: [
      { kind: 'mirefall_spore_chimney', role: 'gate', w: 2 },
      { kind: 'mirefall_fungal_arch', role: 'span', w: 2 },
      { kind: 'mirefall_vent_crater', role: 'giant', w: 1 },
    ],
    setChance: 0.2,
    haze: { color: 0x9a60b8, glow: true, alpha: 0.4, rate: 0.3 },
    pattern: { kind: 'veins', color: 0x3a2040, scale: 5, amount: 0.25, patchy: 0.5 },
  },
  // ── GLACIS ─────────────────────────────────────────────────────────────────────────────────
  shelf: {
    sets: [{ kind: 'glacis_ice_bridge', role: 'span', w: 3 }, { kind: 'glacis_cable_car', role: 'span', w: 2 }, { kind: 'glacis_seracs', role: 'gate', w: 2 }, { kind: 'glacis_mammoth', role: 'giant', w: 2 }],
    setChance: 0.2,
    haze: { color: 0x7af0e8, glow: true, alpha: 0.3, rate: 0.3 },
    pattern: { kind: 'cracks', color: 0x1a3a90, scale: 7, amount: 0.95, patchy: 0.3 },
  },
  springs: {
    sets: [{ kind: 'glacis_travertine', role: 'giant', w: 3 }, { kind: 'glacis_ice_arch', role: 'span', w: 2 }],
    setChance: 0.2,
    haze: { color: 0xfff0f4, alpha: 0.55, rate: 0.3 },
    pattern: { kind: 'rings', color: 0xd87a8a, scale: 5, amount: 0.45, patchy: 0.6 },
  },
  tundra: {
    sets: [{ kind: 'glacis_frost_teeth', role: 'gate', w: 3 }, { kind: 'glacis_buried_engine', role: 'giant', w: 3 }],
    setChance: 0.2,
    haze: { color: 0xe0e8f4, alpha: 0.55, rate: 0.3 },
    pattern: { kind: 'ripples', color: 0x9aaac8, scale: 2.6, amount: 0.35, patchy: 0.5 },
  },
  enginecity: {
    sets: [{ kind: 'glacis_pipe_rack', role: 'span', w: 3 }, { kind: 'glacis_turbine', role: 'giant', w: 2 }],
    setChance: 0.18,
    haze: { color: 0xd8dce8, alpha: 0.45, rate: 0.3 },
    pattern: { kind: 'plates', color: 0x1e2430, scale: 5, amount: 0.6, glow: 0.15, below: 3 },
  },
  // ── ASHGRAVE ───────────────────────────────────────────────────────────────────────────────
  titans: {
    sets: [{ kind: 'ashgrave_fallen_titan', role: 'giant', w: 3 }, { kind: 'ashgrave_titan_spine', role: 'span', w: 3 }],
    setChance: 0.22,
    haze: { color: 0x6a6a64, alpha: 0.5 },
    pattern: { kind: 'streaks', color: 0x4a4038, scale: 7, amount: 0.35, patchy: 0.5 },
  },
  glass: {
    sets: [{ kind: 'ashgrave_fulgurite', role: 'gate', w: 3 }, { kind: 'ashgrave_glass_ship', role: 'giant', w: 3 }],
    setChance: 0.2,
    haze: { color: 0x4aa078, glow: true, alpha: 0.3, rate: 0.18 },
    pattern: { kind: 'veins', color: 0x6affa0, scale: 4, amount: 0.7, glow: 0.9, below: -0.2 },
  },
  scavcamp: {
    sets: [{ kind: 'ashgrave_scrap_gantry', role: 'span', w: 3 }, { kind: 'ashgrave_scrap_wall', role: 'gate', w: 2 }, { kind: 'ashgrave_crawler_town', role: 'giant', w: 2 }],
    setChance: 0.2,
    haze: { color: 0x4a3a30, alpha: 0.5, rate: 0.28 },
    pattern: { kind: 'streaks', color: 0x5a4430, scale: 5, amount: 0.35, patchy: 0.6 },
  },
  whitewood: {
    sets: [{ kind: 'ashgrave_white_canopy', role: 'span', w: 3 }, { kind: 'ashgrave_white_trunks', role: 'gate', w: 2 }, { kind: 'ashgrave_overgrown_mech', role: 'giant', w: 2 }],
    setChance: 0.2,
    haze: { color: 0xe4e0da, rate: 0.28 },
    pattern: { kind: 'streaks', color: 0x9e9890, scale: 8, amount: 0.4, patchy: 0.5 },
  },
  // ── VESH ───────────────────────────────────────────────────────────────────────────────────
  coralflats: {
    sets: [
      { kind: 'vesh_coral_arch', role: 'span', w: 3 },
      { kind: 'vesh_coral_pinnacles', role: 'gate', w: 2 },
      { kind: 'vesh_giant_clam', role: 'giant', w: 2 },
      { kind: 'vesh_starfish', role: 'giant', w: 1 },
    ],
    setChance: 0.2,
    haze: { color: 0xfff0f8 },
    pattern: { kind: 'rings', color: 0xffe0c0, scale: 6, amount: 0.4 },
  },
  whalelagoon: {
    sets: [
      { kind: 'vesh_blue_hole', role: 'giant', w: 3 },
      { kind: 'vesh_mangrove_span', role: 'span', w: 3 },
      { kind: 'vesh_sea_stacks', role: 'gate', w: 2 },
      { kind: 'vesh_pirate_cove', role: 'giant', w: 2 },
    ],
    setChance: 0.2,
    haze: { color: 0xf4fcff },
    pattern: { kind: 'ripples', color: 0xfff4d8, scale: 2.6, amount: 0.35, patchy: 0.5, below: 2.8 },
  },
  bonearch: {
    sets: [
      { kind: 'vesh_spine_span', role: 'span', w: 3 },
      { kind: 'vesh_skull_gate', role: 'gate', w: 3 },
      { kind: 'vesh_carcass', role: 'giant', w: 2 },
    ],
    setChance: 0.2,
    haze: { color: 0xe8eef8, rate: 0.2 },
    pattern: { kind: 'cracks', color: 0x8a8070, scale: 7, amount: 0.5 },
  },
  tidecaves: {
    sets: [
      { kind: 'vesh_cave_arch', role: 'span', w: 3 },
      { kind: 'vesh_grotto', role: 'giant', w: 2 },
    ],
    setChance: 0.2,
    haze: { color: 0xb898c8, alpha: 0.45, rate: 0.3 },
    pattern: { kind: 'veins', color: 0x5affe8, scale: 8, amount: 0.25, glow: 0.35, patchy: 0.6, below: 1.8 },
  },
  // ── CINDER ─────────────────────────────────────────────────────────────────────────────────
  orchards: {
    sets: [
      { kind: 'cinder_irrigator', role: 'span', w: 3 },
      { kind: 'cinder_grove_gate', role: 'gate', w: 2 },
      { kind: 'cinder_harvester', role: 'giant', w: 2 },
    ],
    setChance: 0.2,
    haze: { color: 0xf0e0c0, alpha: 0.4 },
    pattern: { kind: 'ripples', color: 0x4a5a2a, scale: 3.4, amount: 0.35, patchy: 0.4 },
  },
  refinery: {
    sets: [
      { kind: 'cinder_pipe_rack', role: 'span', w: 3 },
      { kind: 'cinder_columns', role: 'gate', w: 2 },
      { kind: 'cinder_tank_farm', role: 'giant', w: 2 },
    ],
    setChance: 0.2,
    haze: { color: 0x3a3238, alpha: 0.55, rate: 0.28 },
    pattern: { kind: 'tiles', color: 0x2a2624, scale: 6, amount: 0.45 },
  },
  pipeline: {
    sets: [
      { kind: 'cinder_trestle', role: 'span', w: 3 },
      { kind: 'cinder_split_pipe', role: 'giant', w: 2 },
      { kind: 'cinder_pump_station', role: 'giant', w: 1 },
    ],
    setChance: 0.2,
    haze: { color: 0x8a7060, alpha: 0.45, rate: 0.2 },
    pattern: { kind: 'streaks', color: 0x3a2418, scale: 5, amount: 0.5, patchy: 0.5 },
  },
  chemlake: {
    sets: [
      { kind: 'cinder_gantry', role: 'span', w: 3 },
      { kind: 'cinder_cooling_towers', role: 'gate', w: 2 },
      { kind: 'cinder_tanker', role: 'giant', w: 2 },
    ],
    setChance: 0.2,
    haze: { color: 0x8ac040, glow: true, alpha: 0.3, rate: 0.22 },
    pattern: { kind: 'cells', color: 0xd8d2b0, scale: 3.2, amount: 0.3, patchy: 0.7 },
  },
};

export const lookOf = (biome: string): Look => LOOKS[biome] ?? NONE;
