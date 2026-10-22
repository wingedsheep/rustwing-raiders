import type { Level, LevelEvent } from '../sim/level';
import { FLIGHT_Y, HALF_W } from '../sim/types';
import { BARKS, IMPRINTS, KNACKS, VEIN_COLOR, type KnackId } from '../game/core';
import { audio } from '../audio';
import type { Fx } from './fx';
import type { TraitHost } from './traits';

/**
 * The core in flight (see sim/mind.ts for what it does): a knack or a talisman firing says its name
 * in its vein's colour, now and then, not every time; an imprint shaken loose cracks off the ship;
 * the Waking Engine's call goes through the whole screen, and a sleeping core goes quiet under it
 * while a woken one shouts back. A woken core talks, in its own colour.
 */

const hexOf = (s: string) => parseInt(s.slice(1), 16);
const knackHex = (id: KnackId) => hexOf(VEIN_COLOR[KNACKS[id].vein]);
const ENGINE = 0x6a9aff;

export class CoreView {
  private time = 0;
  /** When each name was last called (they're named now and then, not every time). */
  private said = new Map<string, number>();
  private calledAt = -9;

  constructor(
    private readonly lv: Level,
    private readonly fx: Fx,
    private readonly host: TraitHost,
  ) {}

  update(dt: number) {
    this.time += dt;
  }

  /** Says a knack's name over the ship, if it hasn't lately. */
  private name(id: KnackId, x: number, z: number, gap = 6) {
    this.once(id, KNACKS[id].name, VEIN_COLOR[KNACKS[id].vein], x, z, gap);
  }

  private once(key: string, text: string, color: string, x: number, z: number, gap: number) {
    if (this.time - (this.said.get(key) ?? -99) < gap) return;
    this.said.set(key, this.time);
    this.host.pop(text, x, z - 3, color);
  }

  handle(e: LevelEvent): boolean {
    if (e.type !== 'core') return false;
    const p = this.lv.players[e.id];
    const pan = e.x / HALF_W;
    const y = FLIGHT_Y + 0.4;
    switch (e.what) {
      case 'luck': {
        const l = p?.ch.luck;
        if (l) this.host.pop(`MAMA'S LUCK: ${l.up} 200% · ${l.down} 50%`, e.x, e.z - 4, IMPRINTS.luck.color);
        audio.play('loot_epic', { pan, pitch: 1.2, vol: 0.6 });
        break;
      }
      case 'stillnerve':
        this.fx.ring(e.x, FLIGHT_Y, e.z, 2.4, 0.2, true, knackHex('stillnerve'));
        break;
      case 'coldblood':
        this.name('coldblood', e.x, e.z);
        this.fx.sparks(e.x, y, e.z, 8, knackHex('coldblood'), 14, 0.3, 0.2);
        audio.play('reload_perfect', { pan, pitch: 1.4, vol: 0.5 });
        break;
      case 'deadeye':
        this.name('deadeye', e.x, e.z, 4);
        this.fx.ring(e.x, FLIGHT_Y, e.z, 3.5, 0.3, true, knackHex('deadeye'));
        break;
      case 'longsecond':
        this.name('longsecond', e.x, e.z, 3);
        this.fx.ring(e.x, FLIGHT_Y, e.z, 9, 0.5, true, knackHex('longsecond'));
        this.host.juice({ flash: 0.12, flashColor: knackHex('longsecond') });
        audio.play('core_feed', { pan, pitch: 0.5, vol: 0.8 });
        break;
      case 'sight':
        this.host.pop(`SEFFA'S SIGHT ×${e.n}`, e.x, e.z - 3, IMPRINTS.sight.color);
        this.fx.ring(e.x, FLIGHT_Y, e.z, 3, 0.2, true, hexOf(IMPRINTS.sight.color));
        audio.play('ice_crack', { pan, pitch: 1.4, vol: 0.6 });
        break;
      case 'slipknot':
        this.name('slipknot', e.x, e.z);
        this.fx.sparks(e.x, y, e.z, 6, knackHex('slipknot'), 10, 0.25, 0.18);
        audio.play('aux_ready', { pan, pitch: 1.3, vol: 0.5 });
        break;
      case 'dance':
        this.fx.sparks(e.x, y, e.z, 12, 0xffc040, 22, 0.35, 0.22);
        this.once('dance', 'WELD DANCE', '#ffc040', e.x, e.z, 8);
        break;
      case 'thickskin':
        this.host.pop('THICK SKIN', e.x, e.z - 3, VEIN_COLOR.grease);
        this.fx.ring(e.x, FLIGHT_Y, e.z, 3.2, 0.3, true, knackHex('thickskin'));
        audio.play('block', { pan, pitch: 0.8 });
        this.host.juice({ hitstop: 3 });
        break;
      case 'shaken': {
        const def = e.imprint && IMPRINTS[e.imprint];
        if (def) this.host.pop(`${def.name} SHAKEN LOOSE`, e.x, e.z - 4, def.color, true);
        this.fx.sparks(e.x, y, e.z, 16, def ? hexOf(def.color) : 0xffffff, 20, 0.5, 0.25);
        audio.play('shaken', { pan });
        this.host.juice({ trauma: 0.2 });
        break;
      }
      case 'policy':
        this.host.pop("PIP'S POLICY PAYS OUT", e.x, e.z - 4, IMPRINTS.policy.color, true);
        this.fx.ring(e.x, FLIGHT_Y, e.z, 6, 0.5, true, hexOf(IMPRINTS.policy.color));
        this.host.juice({ hitstop: 8, flash: 0.35, flashColor: hexOf(IMPRINTS.policy.color) });
        audio.play('loot_legendary', { pan, pitch: 1.1 });
        break;
      case 'minute':
        this.host.pop('THE LAST MINUTE', e.x, e.z - 4, IMPRINTS.minute.color, true);
        this.fx.ring(e.x, FLIGHT_Y, e.z, 7, 0.4, true, hexOf(IMPRINTS.minute.color));
        this.host.juice({ hitstop: 5, flash: 0.25, flashColor: hexOf(IMPRINTS.minute.color) });
        audio.play('load_class', { pan, pitch: 0.8 });
        break;
      case 'follow':
        this.name('follow', e.x, e.z);
        audio.play('reload', { pan, pitch: 1.3, vol: 0.5 });
        break;
      case 'execution':
        this.name('execution', e.x, e.z, 3);
        this.fx.sparks(e.x, y, e.z, 14, knackHex('execution'), 24, 0.35, 0.25);
        this.host.juice({ hitstop: 3, trauma: 0.12 });
        break;
      case 'chain':
        this.host.pop(`CHAIN ×${e.n}`, e.x, e.z - 3, VEIN_COLOR.steel, e.n >= 3);
        this.fx.ring(e.x, FLIGHT_Y, e.z, 11, 0.35, true, knackHex('chain'));
        this.host.juice({ trauma: 0.1 + 0.04 * e.n, hitstop: 2 });
        audio.play('detonate', { pan, pitch: 1.2, vol: 0.7 });
        break;
      case 'splinter':
        this.name('splinter', e.x, e.z);
        this.fx.sparks(e.x, y, e.z, 12, knackHex('splinter'), 26, 0.3, 0.2);
        break;
      case 'spare':
        this.host.pop('SPARE TANK FULL', e.x, e.z - 3, VEIN_COLOR.grease);
        audio.play('aux_ready', { pan, pitch: 0.9 });
        break;
      case 'hotrivets':
        this.name('hotrivets', e.x, e.z);
        this.fx.ring(e.x, FLIGHT_Y, e.z, 5, 0.3, true, knackHex('hotrivets'));
        break;
      case 'answer':
        // the call: once through the whole screen, then each sleeping core goes quiet
        if (this.time - this.calledAt > 1) {
          this.calledAt = this.time;
          audio.play('engine_call');
          this.host.juice({ flash: 0.4, flashColor: ENGINE, trauma: 0.25 });
          this.host.pop('THE WAKING ENGINE CALLS', 0, e.z - 8, '#9ab8ff', true);
        }
        this.host.pop('YOUR CORE ANSWERS IT: QUIET', e.x, e.z - 3, '#6a9aff');
        this.fx.ring(e.x, FLIGHT_Y, e.z, 5, 0.6, true, ENGINE);
        break;
      case 'back':
        this.host.pop('THE CORE COMES BACK', e.x, e.z - 3, '#f4ecd8');
        audio.play('core_grow', { pan, pitch: 1.3, vol: 0.6 });
        break;
      case 'refuse': {
        const w = p?.ch.woke;
        const col = w ? VEIN_COLOR[w.temper] : '#ffffff';
        if (this.time - this.calledAt > 1) {
          this.calledAt = this.time;
          audio.play('engine_call', { vol: 0.7 });
          this.host.pop('THE WAKING ENGINE CALLS', 0, e.z - 8, '#9ab8ff', true);
        }
        audio.play('core_refuse', { pan });
        this.host.pop(`${w?.name ?? 'IT'} REFUSES`, e.x, e.z - 4, col, true);
        this.fx.ring(e.x, FLIGHT_Y, e.z, 10, 0.5, true, hexOf(col));
        this.fx.sparks(e.x, y, e.z, 24, hexOf(col), 30, 0.5, 0.25);
        this.host.juice({ flash: 0.45, flashColor: hexOf(col), hitstop: 6, trauma: 0.3 });
        break;
      }
      case 'bark': {
        const w = p?.ch.woke;
        if (!w || !e.say) break;
        const lines = BARKS[w.temper][e.say];
        const line = lines[Math.floor(Math.random() * lines.length)];
        this.host.unpop(`${w.name}: `);
        this.host.pop(`${w.name}: "${line}"`, e.x, e.z - 5, VEIN_COLOR[w.temper]);
        audio.play('core_bark', { pan, vol: 0.7 });
        break;
      }
    }
    return true;
  }
}
