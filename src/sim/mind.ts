/**
 * The ship's core in flight (see game/core.ts for what it is). The level calls in here as things
 * happen: a perfect (dashed or parried), a graze, a takedown, plating broken, a hit taken, a weld begun and
 * finished, scrap caught. It keeps the fight's tally of what each vein was fed, and it answers the
 * Engine when it calls.
 *
 * Leaning: a hit that lands shakes the newest imprint loose for the rest of the level (the core
 * takes it back up after: it's only been shaken, not forgotten).
 *
 * The Engine's call: at a Warden's gate from the second sector on, as the Warden turns to its
 * next phase, the Engine calls every core in the Reach. A sleeping core answers it, and goes
 * quiet (its knacks and imprints with it) for a while. A woken one refuses, and comes back
 * angry: the Weld, the special and the heavies full, and a few seconds where everything is a blow.
 */

import type { Enemy, Level, LevelEvent, PerfectHow, Player } from './level';
import { DT } from './types';
import { FEED, IMPRINTS, agreementsOf, weightOf, type AgreementId, type CoreKit, type Fed, type ImprintId, type KnackId, type Nemva, type Vein } from '../game/core';
import type { Hardpoint } from '../game/parts';

/** SEFFA'S SIGHT: how near the dash's line counts as passed. */
const SIGHT_R = 3.2;
/** THE LONG SECOND: how long, and how slow the bullets go in it. */
export const LONG_SECOND = 1;
export const LONG_SLOW = 0.18;
/** DEADEYE: how long everything's a blow. */
export const DEADEYE_TIME = 1.5;
/** SLIPKNOT: one dash back a this long at most. */
const SLIP_GAP = 1;
/** NELL'S LAUGH: what a graze is worth to the Weld. */
const LAUGH_WELD = 1 / 45;
/** THE PRICE ON YOU: what a takedown fills of the Weld; how much harder the fight comes. */
const PRICE_WELD = 0.5;
export const PRICE_HARDER = 0.25;
/** SCAVENGER: a piece of scrap's worth to the Weld. */
const SCAVENGE_WELD = 1 / 140;
/** CHAIN BREAKER: the shock's reach. */
export const CHAIN_R = 11;
/** SPLINTERS: shards, their punch. */
const SPLINTER_N = 7;
const SPLINTER_DMG = 10;
/** FERRULE'S CREED: the weld's time with it. */
export const CREED_TIME = 0.6;
/** THE LAST MINUTE: what share of the hull sets it off. */
const MINUTE_AT = 0.25;
/** WELD DANCE: the sparks off a graze in a weld. */
const DANCE_R = 4;
const DANCE_DMG = 14;
/** THE CHOIR'S HUM: clouds in its ring. */
const HUM_N = 6;
/** KASPAR'S CODE: what an elite's scrap is multiplied by. */
export const CODE_SCRAP = 3;
/** The Engine's call: how long a sleeping core goes quiet (by how hard it calls), and a woken one's anger. */
export const CALL_QUIET = [0, 5, 8];
export const REFUSE_TIME = 4;
/** A woken core says something now and then, not every time. */
const BARK_GAP = 6;

/** A pilot's core as it stands in this level. */
export interface MindState {
  /** Held, in the order taken up (the newest is shaken loose first). */
  held: ImprintId[];
  /** Shaken loose this level. */
  shaken: ImprintId[];
  room: number;
  knacks: Set<KnackId>;
  agreements: Set<AgreementId>;
  woke: Nemva | null;
  /** Gone for good (PIP'S POLICY, paid out). */
  spent: ImprintId[];
  /** Seconds until SLIPKNOT gives another dash; of DEADEYE left (a refusal's anger too). */
  slipT: number;
  deadeyeT: number;
  /** THICK SKIN and THE LAST MINUTE, used this level. */
  thick: boolean;
  minute: boolean;
  /** SPARE TANK: the second charge, 0..1 (it fills once the first is full). */
  weld2: number;
  /** MAMA'S LUCK: the hardpoint at 200% and the one at 50% this level. */
  luck: { up: Hardpoint; down: Hardpoint } | null;
  /** The Engine's call: seconds the core is still quiet (it answered), and calls heard. */
  quiet: number;
  /** The fight's tally: takedowns, the big ones, CLEAN phases, jumpstarts, scrap caught. */
  takedowns: number;
  big: number;
  clean: number;
  jumpstarts: number;
  scrap: number;
  /** Seconds since the core last jolted (a hit), swung (a dash) and barked. */
  jolt: number;
  swing: number;
  barkT: number;
}

export const newMindState = (kit?: CoreKit): MindState => ({
  held: [...(kit?.held ?? [])],
  shaken: [],
  room: kit?.room ?? 3,
  knacks: new Set(kit?.knacks ?? []),
  agreements: new Set(agreementsOf(kit?.held ?? []).map((p) => p.id)),
  woke: kit?.woke ?? null,
  spent: [],
  slipT: 0,
  deadeyeT: 0,
  thick: false,
  minute: false,
  weld2: 0,
  luck: null,
  quiet: 0,
  takedowns: 0,
  big: 0,
  clean: 0,
  jumpstarts: 0,
  scrap: 0,
  jolt: 9,
  swing: 9,
  barkT: BARK_GAP,
});

export class Mind {
  /** How hard the Engine calls in this fight (0: it doesn't; see CALL_QUIET), and whether it has. */
  call = 0;
  private called = 0;

  constructor(private readonly lv: Level) {}

  /** Holds an imprint, and is awake to hear it (not gone quiet for the Engine). */
  has(p: Player, id: ImprintId) {
    return p.ch.quiet <= 0 && p.ch.held.includes(id);
  }

  knows(p: Player, id: KnackId) {
    return p.ch.quiet <= 0 && p.ch.knacks.has(id);
  }

  agrees(p: Player, id: AgreementId) {
    return p.ch.quiet <= 0 && p.ch.agreements.has(id);
  }

  /** The level's start: what the core changes about the ship for it. */
  start(p: Player) {
    const s = p.stats;
    if (this.has(p, 'sleeve')) for (let k = 0; k < s.guns.length; k++) if (s.guns[k].heavy) p.rounds[k] = ++s.guns[k].heavy;
    if (this.has(p, 'brisk') && s.special) p.charge = 1;
    if (this.has(p, 'luck')) {
      // one of the hardpoints the ship has filled up, another down
      const have: Hardpoint[] = [];
      if (s.guns.some((g) => !g.heavy)) have.push('T');
      if (s.guns.some((g) => g.heavy)) have.push('H');
      if (s.aux) have.push('A');
      if (s.special) have.push('S');
      if (have.length >= 2) {
        const r = this.lv.rand;
        const up = this.agrees(p, 'double') && have.includes('H') ? 'H' : have[Math.floor(r() * have.length)];
        const rest = have.filter((h) => h !== up);
        const down = rest[Math.floor(r() * rest.length)];
        p.ch.luck = { up, down };
        if (up === 'S') s.specialRate *= 2;
        if (down === 'S') s.specialRate *= 0.5;
        this.emit(p, 'luck');
      }
    }
  }

  /** What a hardpoint runs at this level (MAMA'S LUCK). */
  luckMul(p: Player, h: Hardpoint) {
    const d = p.ch.luck;
    return !d ? 1 : d.up === h ? 2 : d.down === h ? 0.5 : 1;
  }

  tick(p: Player) {
    const c = p.ch;
    c.slipT = Math.max(0, c.slipT - DT);
    c.deadeyeT = Math.max(0, c.deadeyeT - DT);
    c.jolt += DT;
    c.swing += DT;
    c.barkT += DT;
    if (c.quiet > 0 && (c.quiet -= DT) <= 0) this.emit(p, 'back');
  }

  /** What the level said: the fight's tally, and the Engine's call. */
  heard(e: LevelEvent) {
    const lv = this.lv;
    if (e.type === 'phaseClean') for (const p of lv.players) if (!p.down) p.ch.clean++;
    if (e.type === 'jumpstart') for (const p of lv.players) if (p.id !== e.id && !p.down) p.ch.jumpstarts++;
    if (e.type === 'bossPhase' && this.call && e.phase >= 1 && this.called < (this.call > 1 ? 2 : 1)) {
      this.called++;
      for (const p of lv.players) if (!p.down) this.answer(p);
    }
  }

  /** The Engine calls: a sleeping core answers it and goes quiet; a woken one refuses. */
  private answer(p: Player) {
    if (!p.ch.woke) {
      p.ch.quiet = CALL_QUIET[this.call];
      p.weldT = 0;
      this.emit(p, 'answer');
      return;
    }
    p.weld = 1;
    if (p.stats.special) p.charge = 1;
    p.stats.guns.forEach((g, k) => g.heavy && (p.rounds[k] = g.heavy));
    p.ch.deadeyeT = REFUSE_TIME;
    this.emit(p, 'refuse');
    this.bark(p, 'call', true);
  }

  /** A woken core says something (now and then, unless it must). */
  bark(p: Player, what: 'perfect' | 'takedown' | 'weld' | 'hurt' | 'call', must = false) {
    const c = p.ch;
    if (!c.woke || (!must && (c.barkT < BARK_GAP || this.lv.rand() < 0.5))) return;
    c.barkT = 0;
    this.lv.emit({ type: 'core', id: p.id, what: 'bark', x: p.x, z: p.z, n: 0, say: what });
  }

  /** A dash begun: STILL NERVE widens the perfect window when it's focused. */
  dash(p: Player, focus: boolean) {
    p.ch.swing = 0;
    if (focus && this.knows(p, 'stillnerve')) {
      p.slip *= 2;
      this.emit(p, 'stillnerve');
    }
  }

  /** A perfect, dashed or parried (SEFFA'S SIGHT cuts along a dash, so only a dash's). */
  perfect(p: Player, how: PerfectHow) {
    const lv = this.lv;
    this.bark(p, 'perfect');
    if (this.knows(p, 'coldblood')) {
      p.burn = 1;
      this.emit(p, 'coldblood');
    }
    if (this.knows(p, 'deadeye')) {
      p.ch.deadeyeT = Math.max(p.ch.deadeyeT, DEADEYE_TIME);
      this.emit(p, 'deadeye');
    }
    if (this.knows(p, 'longsecond')) {
      lv.slowBullets = LONG_SECOND;
      this.emit(p, 'longsecond');
    }
    if (how === 'dash' && this.has(p, 'sight')) {
      // along the dash: from where it began to a dash's length on
      const x0 = p.slipX;
      const z0 = lv.scroll + p.slipZ;
      const x1 = p.x + p.dashX * 9;
      const z1 = p.z + p.dashZ * 9;
      let n = 0;
      for (const e of lv.enemies) {
        if (e.dead || e.armour <= 0 || !lv.seen(e) || e.boss) continue;
        if (segDist(e.x, e.z, x0, z0, x1, z1) < SIGHT_R + e.r) {
          lv.breakPlating(e, p.id);
          n++;
        }
      }
      if (n) this.emit(p, 'sight', p.x, p.z, n);
    }
  }

  graze(p: Player) {
    if (this.has(p, 'laugh')) this.lv.feedWeld(p, LAUGH_WELD);
    if (this.knows(p, 'slipknot') && p.ch.slipT <= 0 && p.dashes < p.stats.dashes) {
      p.dashes++;
      p.ch.slipT = SLIP_GAP;
      this.emit(p, 'slipknot');
    }
    if (this.agrees(p, 'dance') && p.weldT > 0) {
      this.lv.blast(p.x, p.z, DANCE_R, DANCE_DMG, p.id, { quiet: true });
      this.emit(p, 'dance');
    }
  }

  /** THICK SKIN: the level's first hit only grazes. */
  tier<T extends string>(p: Player, tier: T): T | 'graze' {
    if (p.ch.thick || !this.knows(p, 'thickskin')) return tier;
    p.ch.thick = true;
    this.emit(p, 'thickskin');
    return 'graze';
  }

  /** A hit landed: the core jolts, and leaning, the newest imprint is shaken loose. */
  hit(p: Player) {
    const c = p.ch;
    c.jolt = 0;
    if (weightOf(c.held) > c.room && c.held.length) {
      const id = c.held.pop()!;
      c.shaken.push(id);
      this.letGo(p, id);
      this.emit(p, 'shaken', p.x, p.z, 0, id);
    }
  }

  /** The hit would down you: PIP'S POLICY pays out instead. Returns whether it did. */
  saved(p: Player) {
    if (!this.has(p, 'policy')) return false;
    p.ch.held = p.ch.held.filter((id) => id !== 'policy');
    p.ch.spent.push('policy');
    this.letGo(p, 'policy');
    p.hp = 1;
    p.inv = 2.5;
    for (const b of this.lv.bullets) if ((b.x - p.x) ** 2 + (b.z - p.z) ** 2 < 14 * 14) this.lv.cancel(b);
    this.emit(p, 'policy', p.x, p.z, 0, 'policy');
    return true;
  }

  /** After a hit on the hull: THE LAST MINUTE, once the hull's low. */
  hurt(p: Player) {
    if (p.down) return;
    this.bark(p, 'hurt');
    if (p.ch.minute || !this.has(p, 'minute') || p.hp > p.stats.hp * MINUTE_AT) return;
    p.ch.minute = true;
    p.stats.guns.forEach((g, k) => g.heavy && (p.rounds[k] = g.heavy));
    if (p.stats.special) p.charge = 1;
    this.emit(p, 'minute');
  }

  /** What an imprint takes with it as it goes mid-level. */
  private letGo(p: Player, id: ImprintId) {
    const c = p.ch;
    c.agreements = new Set(agreementsOf(c.held).map((q) => q.id));
    if (id === 'unbending') {
      p.stats.hp -= 20;
      p.hp = Math.min(p.hp, p.stats.hp);
    }
    if (IMPRINTS[id].faction) this.lv.rebond(p);
  }

  takedown(p: Player, e: Enemy, big: boolean) {
    const lv = this.lv;
    p.ch.takedowns++;
    if (big) p.ch.big++;
    this.bark(p, 'takedown');
    if (this.knows(p, 'follow')) {
      p.stats.guns.forEach((g, k) => g.heavy && (p.rounds[k] = Math.min(g.heavy, p.rounds[k] + 1)));
      this.emit(p, 'follow');
    }
    if (this.has(p, 'price')) lv.feedWeld(p, PRICE_WELD);
    if (this.agrees(p, 'plague')) lv.grafting.sporeRing(p, e.x, e.z, 5);
  }

  /** EXECUTION: what a takedown takes. */
  takedownDmg(p: Player, e: Enemy, dmg: number) {
    if (!this.knows(p, 'execution')) return dmg;
    if (e.boss) return dmg * 2;
    if (e.hp < e.max * 0.5) {
      this.emit(p, 'execution', e.x, e.z);
      return Math.max(dmg, e.hp + e.armour + 1);
    }
    return dmg;
  }

  /** A takedown that killed: CHAIN BREAKER's shock. */
  takedownKill(p: Player, e: Enemy) {
    if (!this.knows(p, 'chain')) return;
    const lv = this.lv;
    let n = 0;
    for (const o of lv.enemies) {
      if (o === e || o.dead || o.boss || o.armour <= 0 || !lv.seen(o)) continue;
      if ((o.x - e.x) ** 2 + (o.z - e.z) ** 2 < CHAIN_R * CHAIN_R) {
        lv.breakPlating(o, p.id);
        n++;
      }
    }
    this.emit(p, 'chain', e.x, e.z, n);
  }

  /** Plating broken: SPLINTERS fly. */
  broke(p: Player | undefined, e: Enemy) {
    if (!p || !this.knows(p, 'splinter')) return;
    const a0 = this.lv.rand() * Math.PI * 2;
    for (let k = 0; k < SPLINTER_N; k++) {
      const s = this.lv.addShot(p.id, 'slug', e.x, e.z, a0 + (k / SPLINTER_N) * Math.PI * 2, 46, SPLINTER_DMG, 0.32, 0, 0);
      s.hit.push(e.id);
      s.blow = true;
    }
    this.emit(p, 'splinter', e.x, e.z);
  }

  /** How long a stagger lasts (BRACE: twice). */
  stagger(p: Player | undefined, t: number) {
    return p && this.knows(p, 'brace') ? t * 2 : t;
  }

  /** The weld's time. */
  weldTime(p: Player, t: number) {
    return this.has(p, 'creed') ? CREED_TIME : t;
  }

  /** FIELD WELD: you weld on the move, guns going. */
  fieldWeld(p: Player) {
    return this.knows(p, 'fieldweld');
  }

  /** The Weld can charge (not while the core's answering the Engine). */
  charging(p: Player) {
    return p.ch.quiet <= 0;
  }

  /** The Weld charging past full: SPARE TANK holds a second. */
  spare(p: Player, k: number) {
    if (!this.knows(p, 'sparetank') || p.ch.weld2 >= 1) return;
    const was = p.ch.weld2;
    p.ch.weld2 = Math.min(1, was + k);
    if (was < 1 && p.ch.weld2 >= 1) this.emit(p, 'spare');
  }

  welded(p: Player) {
    this.bark(p, 'weld');
    if (this.has(p, 'hum')) this.lv.grafting.sporeRing(p, p.x, p.z, HUM_N);
    if (this.knows(p, 'hotrivets')) {
      p.stats.guns.forEach((g, k) => g.heavy && (p.rounds[k] = g.heavy));
      p.auxCd = 0;
      this.emit(p, 'hotrivets');
    }
    // the second charge drops into the first
    if (p.ch.weld2 > 0) {
      p.weld = p.ch.weld2;
      p.ch.weld2 = 0;
    }
  }

  /** Scrap caught. */
  scrap(p: Player, n: number) {
    p.ch.scrap += n;
    if (this.knows(p, 'scavenger')) this.lv.feedWeld(p, SCAVENGE_WELD * n);
  }

  /** SCOOP THE TIN: scrap comes from anywhere on the screen. */
  magnet(p: Player) {
    return this.has(p, 'tin');
  }

  /** KASPAR'S CODE: an elite's scrap, tripled. */
  scrapMul(p: Player | undefined, e: Enemy) {
    return p && e.elite && !e.boss && this.has(p, 'code') ? CODE_SCRAP : 1;
  }

  /** DEADEYE (or a refusal's anger): everything's a blow. */
  blows(p: Player | undefined) {
    return !!p && p.ch.deadeyeT > 0;
  }

  /** What the fight fed each of a pilot's veins. */
  fed(p: Player): Fed {
    const lv = this.lv;
    const c = p.ch;
    const lines: Fed['lines'] = [];
    const add = (vein: Vein, text: string, n: number) => n > 0 && lines.push({ vein, text, n });
    add('nerve', `${p.perfects} PERFECT${p.perfects === 1 ? '' : 'S'}`, Math.floor(p.perfects / FEED.perfects));
    add('nerve', `${p.grazes} GRAZES`, Math.floor(p.grazes / FEED.grazes));
    add('nerve', `${c.clean} CLEAN PHASE${c.clean === 1 ? '' : 'S'}`, c.clean * FEED.clean);
    if (p.hits === 0 && lv.state === 'clear') add('nerve', 'NOT A SCRATCH', FEED.flawless);
    const small = c.takedowns - c.big;
    add('steel', `${small} TAKEDOWN${small === 1 ? '' : 'S'}`, small * FEED.takedown);
    add('steel', `${c.big} BIG TAKEDOWN${c.big === 1 ? '' : 'S'}`, c.big * FEED.bigTakedown);
    const edges = Object.values(p.edges).reduce((a, n) => a + (n ?? 0), 0);
    // (a boss's long fight crits hundreds of times: a few points at most)
    add('steel', `${edges} EDGE CRITS`, Math.min(4, Math.floor(edges / FEED.edges)));
    if (lv.fullClear) add('steel', 'FULL CLEAR', FEED.fullClear);
    add('grease', `${p.welds} WELD${p.welds === 1 ? '' : 'S'}`, p.welds * FEED.weld);
    add('grease', `${c.jumpstarts} JUMPSTART${c.jumpstarts === 1 ? '' : 'S'}`, c.jumpstarts * FEED.jumpstart);
    add('grease', `${c.scrap} SCRAP SCOOPED`, Math.floor(c.scrap / FEED.scrap));
    const vein = { nerve: 0, steel: 0, grease: 0 };
    for (const l of lines) vein[l.vein] += l.n;
    return { vein, lines };
  }

  private emit(p: Player, what: MindWhat, x = p.x, z = p.z, n = 0, imprint?: ImprintId) {
    this.lv.emit({ type: 'core', id: p.id, what, x, z, n, imprint });
  }
}

/** What the core did, for the view to make something of. */
export type MindWhat =
  | 'luck'
  | 'stillnerve'
  | 'coldblood'
  | 'deadeye'
  | 'longsecond'
  | 'sight'
  | 'slipknot'
  | 'dance'
  | 'thickskin'
  | 'shaken'
  | 'policy'
  | 'minute'
  | 'follow'
  | 'execution'
  | 'chain'
  | 'splinter'
  | 'spare'
  | 'hotrivets'
  | 'answer'
  | 'back'
  | 'refuse'
  | 'bark';

/** How far (x, z) is from the segment (x0, z0)-(x1, z1). */
function segDist(x: number, z: number, x0: number, z0: number, x1: number, z1: number) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2));
  return Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t));
}
