/**
 * Plans a level: when which waves come, where the turrets stand, the hazards of each biome, the elites of a hunt and the boss at the end of a boss level. Everything
 * is planned up front from the seed (by distance flown), so a seed is the same level every time.
 */

import type { Archetype, EnemySkin } from '../world/planets';
import type { Enemy, HazardKind, Level } from './level';
import { HALF_H, HALF_W, toFlight } from './types';
import { LOOT } from './build';
import { bossHull, makeBoss } from './boss';
import { lerp, pick, rng, type Rng, weighted } from '../util';
import { BOUNTIES, FOES, ROSTER, factionOf, factionsIn, foeSkin, isFoe, type Foe } from './factions';
import { strike } from './strikes';
import { CHAIN } from './combat';
import { afloat } from './foes';
import { boarderSkin } from './convoy';

/** How much of a wave roll goes to the planet's old roster (the rest to the factions' foes). */
const OLD_SHARE = 0.55;
/** Hot crates turn up from this difficulty on (not on the first stops). */
const HOT_FROM = 0.15;
/** Bounties: how long each stays before it gets away. */
const BOUNTY_LIFE: Partial<Record<Foe, number>> = { runner: 9, vault: 10, cache: 12, ace: 14 };

interface Beat {
  /** Distance flown when it happens. */
  at: number;
  run: () => void;
  /** The level's own business (a boss, an escort's boarders): kept when the lab scripts the waves. */
  keep?: boolean;
}

/** A wave as the wave lab writes it: a kind (an archetype or a foe), at a distance flown, `n` groups of it at once. */
export interface ScriptWave {
  kind: Archetype | Foe;
  elite: boolean;
  at: number;
  n: number;
}

/** `[elite:]kind[@at][xN]`, comma-separated (as &waves= in the browser): `ramjack@40,elite:warden@90x2`. */
export function parseWaves(s: string): ScriptWave[] {
  return s
    .split(',')
    .filter(Boolean)
    .map((w, k) => {
      const m = /^(elite:)?([a-z]+)(?:@(\d+(?:\.\d+)?))?(?:x(\d+))?$/.exec(w.trim());
      if (!m) return null;
      return { kind: m[2] as Archetype | Foe, elite: !!m[1], at: m[3] ? Number(m[3]) : 25 + k * 40, n: m[4] ? Math.max(1, Number(m[4])) : 1 };
    })
    .filter((w): w is ScriptWave => !!w);
}

export const formatWaves = (ws: ScriptWave[]) => ws.map((w) => `${w.elite ? 'elite:' : ''}${w.kind}@${Math.round(w.at)}${w.n > 1 ? `x${w.n}` : ''}`).join(',');

export class Director {
  private beats: Beat[] = [];
  /** What it planned, as waves (for the wave lab to start from): the waves and elites, not bounties or convoys. */
  readonly planned: ScriptWave[] = [];
  private r: Rng;
  private hazardT = 4;
  bossSpawned = false;

  constructor(private lv: Level) {
    this.r = rng(lv.spec.seed * 31 + 7);
    this.plan();
  }

  skinFor(a: Archetype): EnemySkin | undefined {
    return this.lv.spec.planet.enemies.find((s) => s.archetype === a);
  }

  /** A part from the loot table, rarer ones more likely later in the run. */
  loot(): string {
    const d = this.lv.spec.difficulty;
    const rarity = weighted(this.r, [
      ['common', 70 - d * 25],
      ['rare', 25 + d * 15],
      ['epic', 5 + d * 10],
    ] as const);
    return pick(this.r, LOOT[rarity]).id;
  }

  private get length() {
    return -this.lv.terrain.end - 60;
  }

  private plan() {
    const lv = this.lv;
    const mode = lv.spec.mode;
    const d = lv.spec.difficulty;
    const L = this.length;
    const r = this.r;
    const roster = lv.spec.planet.enemies;
    // gaps between waves shrink as the run goes on (the field is wide: it takes a lot to fill)
    // (an escort leaves room for the boarders)
    // (a heist leaves room for the runner: its own fire and fighters are the fight)
    const gap = lerp(54, 35, Math.min(d, 1.2)) * (mode === 'escort' ? 1.15 : mode === 'heist' ? 1.45 : 1);
    const end = mode === 'boss' ? L - 40 : L - 70;
    let at = 70;
    let n = 0;
    const seen = new Set<string>();
    while (at < end) {
      // a breather as each new biome comes in, so it can be looked at
      const bz = -at;
      const b = lv.terrain.blend(bz - HALF_H);
      if (b.a !== b.b && Math.abs(b.t - 0.5) < 0.3) {
        at += 40;
        continue;
      }
      const t = at / L;
      const weights: [Archetype | Foe, number][] = roster.map((s) => [s.archetype, WEIGHT[s.archetype](t, d) * OLD_SHARE]);
      // the factions of the biome coming in
      const biome = lv.terrain.biome(bz - HALF_H);
      for (const f of factionsIn(lv.spec.planet, biome))
        for (const [foe, w, from] of ROSTER[f]) if (t >= from) weights.push([foe, w]);
      // (no boats where there's no water)
      const wet = biome.water !== null;
      const can = weights.filter(([a, w]) => w > 0 && (wet || !(isFoe(a) && FOES[a].water)));
      const first = weighted(r, can);
      const fresh = !seen.has(first);
      seen.add(first);
      this.wave(at, first);
      // a kind is met alone the first time; after that it comes with others. A squad is a pair
      // that works together (a role that pins you, one that punishes it, see SQUADS); else a pair
      // of any two that have been met
      const have = (a: string) => can.some(([b]) => b === a);
      const squads = SQUADS.filter((q) => q.from <= t && q.kinds.includes(first) && q.kinds.every((k) => have(k) && (seen.has(k) || k === first)));
      if (!fresh && squads.length && r() < 0.3 + t * 0.35 + d * 0.2) {
        const q = pick(r, squads);
        let k = 0;
        for (const kind of q.kinds) if (kind !== first) this.wave(at + q.gap * ++k, kind);
      } else if (!fresh && r() < 0.15 + t * 0.3 + d * 0.2) {
        // later on, waves come in pairs
        const solo = ['brute', 'carrier', 'ace', 'gatekeeper', 'hookjaw', 'rigger', 'blimp'];
        const met = can.filter(([a]) => !solo.includes(a) && a !== first && seen.has(a));
        if (met.length) this.wave(at + 8, weighted(r, met));
      }
      at += gap * (0.75 + r() * 0.5);
      n++;
    }
    // a supply drop in every level: an elite carrying a part
    const elites = mode === 'hunt' ? [0.3, 0.55, 0.8] : mode === 'heist' ? [] : [0.45 + r() * 0.2];
    for (const f of elites) {
      // a champion of the faction (or of the planet's old guard), with a fight to learn: armour
      // to break, and attacks it chains (see combat.ts CHAIN)
      const own = factionOf(lv.spec.planet);
      const foes = ROSTER[own].filter(([foe, , from]) => CHAIN[foe] && from <= f).map(([foe]) => foe);
      const archs = roster.map((s) => s.archetype).filter((a) => a === 'gunship' || a === 'brute' || a === 'lancer');
      const who = pick(r, [...foes, ...foes, ...archs]);
      if (!who) continue;
      this.planned.push({ kind: who, elite: true, at: f * L, n: 1 });
      this.beats.push({ at: f * L, run: () => (isFoe(who) ? this.spawnFoe(who, true) : this.spawnArch(who, true)) });
    }
    // bounties: something worth chasing, briefly, before it gets away
    const bounties = mode === 'hunt' ? 3 : mode === 'raid' ? 2 : mode === 'escort' ? 1 : 0;
    for (let k = 0; k < bounties; k++) {
      const f = (k + 0.3 + r() * 0.5) / bounties;
      const zf = -(f * L);
      const fac = factionsIn(lv.spec.planet, lv.terrain.biome(zf - HALF_H))[0];
      const foe = pick(r, BOUNTIES[fac]);
      const part = r() < 0.3 + d * 0.15;
      this.beats.push({ at: f * L, run: () => this.spawnFoe(foe, false, { reward: Math.round(20 + 15 * d + (foe === 'ace' ? 10 : 0)), part, life: BOUNTY_LIFE[foe] ?? 10 }) });
    }
    // a hot crate, now and then once the run's under way: a great part, if you'll fly for it
    if ((mode === 'raid' || mode === 'hunt') && d >= HOT_FROM && r() < (mode === 'hunt' ? 0.6 : 0.4)) this.beats.push({ at: (0.15 + r() * 0.25) * L, run: () => lv.hotCrate() });
    if (mode === 'boss') this.beats.push({ at: L - 20, run: () => this.spawnBoss(), keep: true });
    // an escort: raiders come to board the haulers, more of them as it goes on
    if (mode === 'escort') {
      const runs = 5 + (d > 0.8 ? 1 : 0);
      for (let k = 0; k < runs; k++) {
        const f = 0.1 + (k / runs) * 0.82 + r() * 0.04;
        const n = 2 + (r() < 0.2 + d * 0.3 + f * 0.3 ? 1 : 0);
        this.beats.push({ at: f * L, run: () => lv.convoy?.board(boarderSkin(lv), n), keep: true });
      }
    }
    this.beats.sort((a, b) => a.at - b.at);
    void n;
  }

  /** Dev (`&foes=gunboat,elite:ramjack`): every wave of the level one of these, in turn, early and often. */
  only(kinds: string[]) {
    const lv = this.lv;
    this.beats = this.beats.filter((b) => b.at >= -lv.terrain.end - 60 - 25);
    for (let k = 0, at = 25; at < this.length - 80; k++, at += 40) {
      const [a, b] = kinds[k % kinds.length].split(':');
      const elite = a === 'elite';
      const kind = (elite ? b : a) as Archetype | Foe;
      this.beats.push({ at, run: () => (isFoe(kind) ? this.spawnFoe(kind, elite) : this.spawnArch(kind as Archetype, elite)) });
    }
    this.beats.sort((a, b) => a.at - b.at);
  }

  /**
   * The wave lab (`&waves=`): these waves and nothing else of the level's own (no waves, elites,
   * bounties or crates; an escort's boarders and a boss still come). Each is one wave for the tally.
   */
  script(waves: ScriptWave[]) {
    this.beats = this.beats.filter((b) => b.keep);
    for (const w of waves) {
      const spawn = () => (isFoe(w.kind) ? this.spawnFoe(w.kind, w.elite) : this.spawnArch(w.kind, w.elite));
      this.beats.push({ at: w.at, run: () => { for (let k = 0; k < w.n; k++) spawn(); } });
    }
    this.beats.sort((a, b) => a.at - b.at);
  }

  private wave(at: number, arch: Archetype | Foe) {
    this.planned.push({ kind: arch, elite: false, at, n: 1 });
    this.beats.push({ at, run: () => (isFoe(arch) ? this.spawnFoe(arch, false) : this.spawnArch(arch, false)) });
  }

  /** A faction foe (or a group of them), as one wave. */
  spawnFoe(foe: Foe, elite: boolean, bounty?: Enemy['bounty']) {
    const lv = this.lv;
    const r = this.r;
    const skin = foeSkin(lv.spec.planet, foe);
    const opts: Partial<Enemy> = { ...(elite ? { elite: true } : {}), ...(bounty ? { bounty } : {}) };
    const top = lv.top - 4;
    const d = lv.spec.difficulty;
    const p = lv.nearest(0, lv.bottom);
    const rx = (m = 8) => lerp(-HALF_W + m, HALF_W - m, r());
    switch (foe) {
      case 'ramjack': {
        const n = elite || bounty ? 1 : 2 + (r() < d * 0.3 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const hx = n === 1 ? rx(12) : lerp(-HALF_W + 10, HALF_W - 10, (k + 0.5) / n);
          lv.spawn(foe, skin, hx, top, { hx, hz: -15 + (k % 2) * 3, x0: hx }, { ...opts, t: -k * 0.9 });
        }
        break;
      }
      case 'rattler': {
        const n = 1 + (r() < 0.3 + d * 0.3 ? 1 : 0);
        for (let k = 0; k < n; k++) lv.spawn(foe, skin, (p?.x ?? 0) + (k ? (r() < 0.5 ? -10 : 10) : 0), lv.bottom + 5, {}, { ...opts, t: -k * 1.5 });
        break;
      }
      case 'hookjaw': {
        const dir = r() < 0.5 ? -1 : 1;
        lv.spawn(foe, skin, dir * (HALF_W + 5), lv.scroll - 6, { dir, hz: lerp(-12, 2, r()) }, opts);
        break;
      }
      case 'rigger': {
        const n = elite ? 1 : 1 + (r() < d * 0.25 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const hx = n === 1 ? rx(16) : (k === 0 ? -1 : 1) * lerp(12, 20, r());
          lv.spawn(foe, skin, hx, top, { hx, x0: hx * 0.6, hz: lerp(-18, -14, r()) }, { ...opts, t: -k * 1.4 });
        }
        break;
      }
      case 'rook': {
        const n = elite ? 1 : 1 + (r() < d * 0.3 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const hx = n === 1 ? rx(14) : (k === 0 ? -1 : 1) * lerp(10, 18, r());
          lv.spawn(foe, skin, hx, top, { hx, x0: hx * 0.5, hz: lerp(-19, -15, r()) }, { ...opts, t: -k * 1.6 });
        }
        break;
      }
      case 'ace': {
        const dir = r() < 0.5 ? -1 : 1;
        lv.spawn(foe, skin, (p?.x ?? 0) + dir * 7, lv.bottom + 4, { dir }, opts);
        break;
      }
      case 'flakker':
      case 'spitter': {
        const n = elite ? 1 : 2 + (r() < 0.5 ? 1 : 0);
        this.ground(foe, skin, n, opts);
        break;
      }
      case 'swooper': {
        const n = elite ? 1 : 2 + (r() < 0.3 + d * 0.3 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const hx = lerp(-HALF_W + 10, HALF_W - 10, (k + 0.5) / n);
          lv.spawn(foe, skin, hx, top, { hx, x0: hx, phase: k * 1.1 }, { ...opts, t: -k * 0.5 });
        }
        break;
      }
      case 'burrower':
        lv.spawn(foe, skin, rx(10), top + 6, {}, opts);
        break;
      case 'warden': {
        const n = elite ? 1 : 1 + (r() < 0.5 + d * 0.2 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const hx = n === 1 ? rx(14) : (k === 0 ? -1 : 1) * lerp(10, 20, r());
          lv.spawn(foe, skin, hx, top, { hx, hz: lerp(-15, -10, r()), x0: hx * 0.5, stay: elite ? 40 : 11 + r() * 3 }, { ...opts, t: -k * 0.4 });
        }
        // an elite warden comes with a heartpod-like escort: a prism behind it
        if (elite) lv.spawn('prism', foeSkin(lv.spec.planet, 'prism'), 0, top, { hx: -HALF_W * 0.4, hz: -19 }, {});
        break;
      }
      case 'prism': {
        const n = elite ? 1 : 1 + (r() < 0.25 + d * 0.25 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const hx = n === 1 ? rx(14) : (k === 0 ? -1 : 1) * lerp(12, 22, r());
          lv.spawn(foe, skin, hx, top, { hx, hz: lerp(-17, -12, r()), x0: hx, stay: elite ? 40 : 13 + r() * 3 }, { ...opts, t: -k * 1.2 });
        }
        break;
      }
      case 'gatekeeper':
        this.gate(skin, opts);
        break;
      case 'heartpod': {
        // with friends to bind: a couple of swoopers or ramjacks
        const hx = rx(14);
        lv.spawn(foe, skin, hx, top, { hx, hz: -18 }, opts);
        const friend: Foe = lv.spec.planet.id === 'mirefall' ? 'swooper' : factionOf(lv.spec.planet) === 'lattice' ? 'warden' : 'ramjack';
        this.spawnFoe(friend, false);
        break;
      }
      case 'puffball': {
        const n = 6 + Math.floor(r() * 4 + d * 3);
        for (let k = 0; k < n; k++) lv.spawn(foe, skin, lerp(-HALF_W + 4, HALF_W - 4, (k + r() * 0.8) / n), top - r() * 10, {}, opts);
        break;
      }
      case 'gunboat': {
        // on water ahead, with room to patrol; with none, a gun truck comes instead
        if (!this.water(skin, opts)) this.spawnFoe('technical', elite, bounty);
        break;
      }
      case 'technical': {
        const n = elite ? 1 : 2 + (r() < 0.3 + d * 0.3 ? 1 : 0);
        const dir = r() < 0.5 ? -1 : 1;
        for (let k = 0; k < n; k++) {
          const zg = lv.top - 6 - k * 7 - r() * 4;
          const x = -dir * (HALF_W + 3 + k * 6);
          const y = Math.max(lv.terrain.height(x, zg), lv.terrain.water(zg));
          lv.spawn(foe, skin, x, toFlight(zg, y), { dir, tz: zg }, { ...opts, y, heading: (dir * Math.PI) / 2 });
        }
        break;
      }
      case 'blimp': {
        const hx = rx(16);
        lv.spawn(foe, skin, hx, top - 4, { hx, x0: hx * 0.4, hz: lerp(-17, -12, r()), stay: elite ? 45 : 22 + r() * 4 }, opts);
        break;
      }
      case 'spindle':
        this.ground(foe, skin, elite ? 1 : 1 + (r() < 0.3 + d * 0.3 ? 1 : 0), opts);
        break;
      case 'halo': {
        const n = elite ? 1 : 1 + (r() < 0.35 + d * 0.3 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const hx = n === 1 ? rx(14) : (k === 0 ? -1 : 1) * lerp(12, 22, r());
          lv.spawn(foe, skin, hx, top, { hx, x0: hx, hz: lerp(-17, -11, r()), stay: elite ? 40 : 12 + r() * 4 }, { ...opts, t: -k * 0.8 });
        }
        break;
      }
      case 'manta': {
        const dir = r() < 0.5 ? -1 : 1;
        lv.spawn(foe, skin, -dir * (HALF_W + 7), lv.scroll - 15, { dir, hz: lerp(-17, -10, r()), phase: r() * 6 }, { ...opts, heading: (dir * Math.PI) / 2 });
        break;
      }
      case 'runner':
        lv.spawn(foe, skin, rx(10), top, { x0: rx(10) }, opts);
        break;
      case 'vault':
        lv.spawn(foe, skin, 0, top, { hx: rx(16) }, opts);
        break;
      case 'cache':
        lv.spawn(foe, skin, rx(10), top, {}, opts);
        break;
    }
  }

  /** Ground foes on solid, dry land just ahead. */
  private ground(foe: Foe, skin: EnemySkin, count: number, opts: Partial<Enemy>) {
    const lv = this.lv;
    const r = this.r;
    let placed = 0;
    for (let tries = 0; tries < 30 && placed < count; tries++) {
      const x = lerp(-HALF_W + 4, HALF_W - 4, r());
      const zg = lv.top - 14 - r() * 10;
      const h = lv.terrain.height(x, zg);
      if (h < lv.terrain.water(zg) + 0.2 || h > 7 || lv.terrain.occupied(x, zg, 1.6)) continue;
      const zf = toFlight(zg, h);
      if (lv.enemies.some((e) => e.ground && Math.abs(e.x - x) < 5 && Math.abs(e.z - zf) < 5)) continue;
      lv.spawn(foe, skin, x, zf, {}, { ...opts, y: h });
      placed++;
    }
  }

  /** A gunboat on open water just ahead (false if there's none). */
  private water(skin: EnemySkin, opts: Partial<Enemy>) {
    const lv = this.lv;
    const r = this.r;
    for (let tries = 0; tries < 30; tries++) {
      const x = lerp(-HALF_W + 8, HALF_W - 8, r());
      const zg = lv.top - 12 - r() * 14;
      if (!afloat(lv, x, zg) || !afloat(lv, x - 5, zg) || !afloat(lv, x + 5, zg)) continue;
      const y = lv.terrain.water(zg);
      const dir = r() < 0.5 ? -1 : 1;
      lv.spawn('gunboat', skin, x, toFlight(zg, y), { dir, tz: zg }, { ...opts, y, heading: (dir * Math.PI) / 2 });
      return true;
    }
    return false;
  }

  /** A gate across the way: two pylons at the edges, the beam between them closing as it comes. */
  private gate(skin: EnemySkin, opts: Partial<Enemy>) {
    const lv = this.lv;
    const r = this.r;
    const zg = lv.top - 12;
    const ends = [-1, 1].map((side) => {
      const x = side * (HALF_W - 4);
      return { x, ...lv.groundToFlight(x, zg) };
    });
    const z = (ends[0].z + ends[1].z) / 2;
    const a = lv.spawn('gatekeeper', skin, ends[0].x, z, {}, { ...opts, y: ends[0].y });
    const b = lv.spawn('gatekeeper', skin, ends[1].x, z, {}, { ...opts, y: ends[1].y });
    // the gap: on the racing line in a canyon, else anywhere it can be reached
    const canyon = lv.terrain.biome(zg).shape === 'canyon';
    const gx = canyon ? lv.terrain.lineX(z) : lerp(-HALF_W + 10, HALF_W - 10, r());
    // it closes about when it would reach you at the level's own pace: arrive early and it's wide
    const reach = (lv.bottom - 8 - z) / Math.max(lv.speed, 1);
    strike(lv, 'gate', -HALF_W, z, { gx, gap0: 16, gap1: 3.6, active: reach * 0.9, owner: a.id, owner2: b.id, color: skin.colors[2] });
    lv.emit({ type: 'windup', enemy: a.id, kind: 'gate', tele: { shape: 'gate', x: -HALF_W, x2: HALF_W, z, gx, gap: 16 }, dur: reach, faction: 'lattice', style: 'draw' });
  }

  spawnArch(arch: Archetype, elite: boolean) {
    const lv = this.lv;
    const skin = this.skinFor(arch);
    if (!skin) return;
    const r = this.r;
    const top = -HALF_H - 3;
    const opts: Partial<Enemy> = elite ? { elite: true } : {};
    switch (arch) {
      case 'dart': {
        const path = pick(r, ['swoop', 'swoop', 'dive', 'cross', 'loop'] as const);
        const count = path === 'dive' ? 4 + Math.floor(r() * 4) : 5 + Math.floor(r() * 5);
        const x0 = lerp(-HALF_W + 8, HALF_W - 8, r());
        const dir = r() < 0.5 ? -1 : 1;
        const sz0 = lerp(-HALF_H + 6, -6, r());
        for (let k = 0; k < count; k++) {
          const x = path === 'dive' ? lerp(-HALF_W + 4, HALF_W - 4, (k + 0.5) / count) : x0;
          lv.spawn('dart', skin, x, lv.top - 6, { path, x0: x, dir, sz0, phase: k * 0.5, amp: 6 + r() * 7 }, { ...opts, t: -k * (path === 'dive' ? 0.18 : 0.32) });
        }
        break;
      }
      case 'swarm': {
        const count = 10 + Math.floor(r() * 8);
        const side = r() < 0.6 ? 0 : r() < 0.5 ? -1 : 1;
        for (let k = 0; k < count; k++) {
          const x = side === 0 ? lerp(-HALF_W + 3, HALF_W - 3, r()) : side * (HALF_W + 2);
          const z = side === 0 ? lv.top - 2 - r() * 6 : lv.scroll + lerp(-HALF_H, 0, r());
          const e = lv.spawn('swarm', skin, x, z, {}, { ...opts, t: -k * 0.07 });
          e.vx = side === 0 ? 0 : -side * 14;
          e.vz = side === 0 ? 10 : 0;
          e.d.x0 = x;
        }
        break;
      }
      case 'gunship': {
        const count = elite ? 1 : 1 + (r() < 0.5 ? 1 : 0);
        for (let k = 0; k < count; k++) {
          const hx = count === 1 ? lerp(-20, 20, r()) : (k === 0 ? -1 : 1) * lerp(12, 22, r());
          lv.spawn('gunship', skin, hx, top, { hx, hz: lerp(-16, -9, r()), stay: elite ? 30 : 5 + r() * 3, x0: hx * 0.5 }, opts);
        }
        break;
      }
      case 'turret': {
        // on the ground ahead, somewhere solid and dry
        const count = 3 + Math.floor(r() * 4);
        let placed = 0;
        for (let tries = 0; tries < 30 && placed < count; tries++) {
          const x = lerp(-HALF_W + 3, HALF_W - 3, r());
          const zg = lv.top - 14 - r() * 10;
          const h = lv.terrain.height(x, zg);
          if (h < lv.terrain.water(zg) + 0.2 || h > 7 || lv.terrain.occupied(x, zg, 1.4)) continue;
          const zf = toFlight(zg, h);
          if (lv.enemies.some((e) => e.ground && Math.abs(e.x - x) < 4 && Math.abs(e.z - zf) < 4)) continue;
          lv.spawn('turret', skin, x, zf, {}, { ...opts, y: h });
          placed++;
        }
        break;
      }
      case 'bomber': {
        const dir = r() < 0.5 ? -1 : 1;
        lv.spawn('bomber', skin, -dir * (HALF_W + 5), lv.scroll - 14, { dir, sz0: lerp(-HALF_H + 6, -10, r()) }, opts);
        break;
      }
      case 'lancer': {
        const count = 1 + (r() < 0.4 + this.lv.spec.difficulty * 0.3 ? 1 : 0);
        for (let k = 0; k < count; k++) {
          const hx = count === 1 ? lerp(-22, 22, r()) : (k === 0 ? -1 : 1) * lerp(14, 24, r());
          lv.spawn('lancer', skin, hx, top, { hx, hz: lerp(-18, -12, r()) }, { ...opts, t: -k * 0.6 });
        }
        break;
      }
      case 'brute':
        lv.spawn('brute', skin, 0, top, { hx: lerp(-14, 14, r()) }, opts);
        break;
      case 'serpent': {
        const x0 = lerp(-12, 12, r());
        const phase = r() * 6;
        const head = lv.spawn('serpent', skin, x0, top, { x0, phase, amp: 12 + r() * 9 }, opts);
        const len = 7 + Math.floor(this.lv.spec.difficulty * 3);
        for (let k = 1; k <= len; k++) lv.spawn('serpent', skin, x0, lv.top - 5, { leader: head.id, index: k, x0 }, { hp: 18, max: 18 } as Partial<Enemy>);
        break;
      }
      case 'carrier':
        lv.spawn('carrier', skin, 0, top, { hx: lerp(-12, 12, r()) }, opts);
        break;
    }
  }

  private spawnBoss() {
    const lv = this.lv;
    const p = lv.spec.planet;
    this.bossSpawned = true;
    lv.state = 'boss';
    // the fight is the boss's own: nothing more comes (what's left of the level's beats), what's
    // waiting goes, and what's still about clears off (only what the boss calls joins in)
    this.beats.length = 0;
    for (const e of lv.enemies) if (e.t < 0) e.dead = true;
    for (const e of lv.enemies) if (!e.dead) e.d.flee = 1e-3;
    lv.emit({ type: 'bossWarning', name: p.boss.name, title: p.boss.title });
    const skin: EnemySkin = { archetype: 'brute', name: p.boss.name, kind: p.boss.kind, colors: p.boss.colors };
    const hp = 2400 * bossHull(p.id) * (1 + lv.spec.difficulty * 0.8) * (lv.players.length > 1 ? 1.5 : 1);
    lv.spawn('boss', skin, 0, lv.top - 20, {}, { boss: makeBoss(p.id), hp, max: hp, t: -2.5 });
  }

  bossDown(e: Enemy) {
    for (const x of this.lv.enemies) if (x !== e) this.lv.kill(x, 0);
    for (const b of this.lv.bullets) this.lv.cancel(b);
    this.lv.lasers.length = 0;
    this.lv.finish();
  }

  update() {
    const lv = this.lv;
    const flown = -lv.scroll;
    // each beat is a wave: what it spawns is counted for a full clear
    while (this.beats.length && this.beats[0].at <= flown) {
      lv.openWave();
      this.beats.shift()!.run();
      lv.closeWave();
    }
    if (lv.state !== 'flying') return;
    // the biome's own dangers
    const biome = lv.terrain.biome(lv.top);
    if (!biome.hazards.length) return;
    this.hazardT -= 1 / 60;
    if (this.hazardT > 0) return;
    const kind = pick(this.r, biome.hazards) as HazardKind;
    this.hazardT = HAZARD_GAP[kind] * lerp(0.95, 0.55, Math.min(lv.spec.difficulty, 1)) * (0.7 + this.r() * 0.6);
    this.spawnHazard(kind);
  }

  private spawnHazard(kind: HazardKind) {
    const lv = this.lv;
    const r = this.r;
    const x = lerp(-HALF_W + 3, HALF_W - 3, r());
    switch (kind) {
      case 'geyser':
      case 'flare': {
        // on the ground ahead: it comes towards you as the land scrolls
        const zg = lv.top + 4 + r() * 12;
        const h = Math.max(lv.terrain.height(x, zg), lv.terrain.water(zg));
        lv.hazard(kind, x, toFlight(zg, h), { r: 1.9, warn: 1.4, active: 1.4 });
        break;
      }
      case 'falling_rocks': {
        // near where someone is, so it has to be dodged
        const target = pick(r, lv.living());
        if (!target) return;
        lv.hazard(kind, target.x + (r() - 0.5) * 6, target.z - 4 - r() * 4, { r: 1.7, warn: 1.1, active: 0.25, air: true });
        break;
      }
      case 'lightning': {
        const target = pick(r, lv.living());
        if (!target) return;
        lv.hazard(kind, target.x + (r() - 0.5) * 8, target.z + (r() - 0.5) * 8, { r: 2.2, warn: 1.0, active: 0.3, air: true });
        break;
      }
      case 'spore_cloud':
        lv.hazard(kind, x, lv.top - 2, { r: 3.5, warn: 0.6, active: 14 });
        break;
      case 'laser_gate':
        lv.hazard(kind, 0, lv.top - 2, { r: HALF_W, warn: 0, active: 30, period: 2.2 });
        break;
    }
  }
}

const HAZARD_GAP: Record<HazardKind, number> = {
  geyser: 3.5,
  flare: 4,
  falling_rocks: 3,
  lightning: 3.2,
  spore_cloud: 5,
  laser_gate: 7,
};

/**
 * Squads: kinds that make each other worse, as Doom Eternal pairs its demons. One pins you or
 * fences you in, the other punishes you for it: shells that move you on while ramjacks dive,
 * wardens shielding a prism that opens to sweep, a spindle's spinning arms and a halo's rings.
 * `gap`: how far behind each other they come (distance flown).
 */
const SQUADS: { kinds: (Archetype | Foe)[]; from: number; gap: number }[] = [
  // scrappers
  { kinds: ['flakker', 'ramjack'], from: 0.1, gap: 6 },
  { kinds: ['rattler', 'ramjack'], from: 0.2, gap: 5 },
  { kinds: ['gunboat', 'technical'], from: 0.15, gap: 6 },
  { kinds: ['technical', 'flakker'], from: 0.1, gap: 5 },
  { kinds: ['blimp', 'ramjack'], from: 0.4, gap: 10 },
  { kinds: ['hookjaw', 'flakker'], from: 0.3, gap: 6 },
  // the lattice
  { kinds: ['warden', 'prism'], from: 0.15, gap: 4 },
  { kinds: ['spindle', 'halo'], from: 0.15, gap: 6 },
  { kinds: ['gatekeeper', 'halo'], from: 0.25, gap: 3 },
  { kinds: ['warden', 'spindle'], from: 0.2, gap: 6 },
  // the rook's darts herd you; the halo's rings or the gate close on where they herd you to
  { kinds: ['rook', 'halo'], from: 0.25, gap: 5 },
  { kinds: ['rook', 'gatekeeper'], from: 0.3, gap: 4 },
  // the wilds and the bloom
  { kinds: ['swooper', 'spitter'], from: 0.05, gap: 5 },
  { kinds: ['manta', 'swooper'], from: 0.25, gap: 8 },
  { kinds: ['burrower', 'spitter'], from: 0.25, gap: 4 },
  { kinds: ['manta', 'puffball'], from: 0.25, gap: 6 },
  { kinds: ['heartpod', 'spitter'], from: 0.2, gap: 6 },
  // the planets' old guard
  { kinds: ['lancer', 'dart'], from: 0.15, gap: 5 },
  { kinds: ['turret', 'swarm'], from: 0.1, gap: 6 },
  { kinds: ['gunship', 'dart'], from: 0.2, gap: 6 },
  { kinds: ['bomber', 'swarm'], from: 0.3, gap: 6 },
];

/** How likely each archetype is (t: how far through the level, d: difficulty). */
const WEIGHT: Record<Archetype, (t: number, d: number) => number> = {
  dart: () => 4,
  swarm: () => 3,
  gunship: (t) => 2 + t * 2,
  turret: () => 2.5,
  bomber: (t, d) => (t > 0.2 ? 1.2 + d : 0),
  lancer: (t, d) => (t > 0.15 ? 1.4 + d : 0.3),
  brute: (t, d) => (t > 0.45 ? 0.6 + d * 0.8 : 0),
  serpent: (t) => (t > 0.25 ? 1.3 : 0),
  carrier: (t, d) => (t > 0.6 ? 0.3 + d * 0.6 : 0),
};
