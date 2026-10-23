import * as THREE from 'three';
import { JUMP_REACH, JUMP_TIME, JUMP_WAIT, jumpHelper, type Level } from '../sim/level';
import { FLIGHT_Y, HALF_W, fromFlight } from '../sim/types';
import { audio } from '../audio';
import type { Fx } from './fx';
import type { TraitHost } from './traits';

/**
 * A co-op down, on the field (see updateJumpstarts in sim/level.ts): the reach drawn round the down
 * ship, pulsing red and calling with a ping that quickens as its time runs out; a partner inside
 * it lights it green, current arcs across between the two ships, a disc fills to the rim and a hum
 * climbs. Drawn in the view's overlay, so it reads over anything. The jolt itself is level-view's.
 */

const Y = FLIGHT_Y + 1.5;
const DISC = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
const RIM = new THREE.RingGeometry(0.93, 1, 56).rotateX(-Math.PI / 2);
/** The time left, as the rim itself: drawn only so far round (see setDrawRange), from the top. */
const ARC_SEGS = 64;
const arcGeo = () => new THREE.RingGeometry(0.9, 1.04, ARC_SEGS, 1, Math.PI / 2, Math.PI * 2).rotateX(-Math.PI / 2);
const RED = new THREE.Color(0xff5a4a);
const GREEN = new THREE.Color(0x8affb0);
const WHITE = new THREE.Color(0xffffff);

interface Marks {
  /** The reach, faint; the time left, bright round it. */
  rim: THREE.Mesh;
  clock: THREE.Mesh;
  fill: THREE.Mesh;
  /** A ring sent out from the ship to the rim, now and then: come here. */
  sonar: THREE.Mesh;
  /** The time to the next ping and the next arc. */
  ping: number;
  arc: number;
}

const mesh = (geo: THREE.BufferGeometry, order: number) => {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  m.renderOrder = order;
  m.frustumCulled = false;
  m.visible = false;
  return m;
};

export class JumpView {
  readonly group = new THREE.Group();
  private marks: Marks[];
  private time = 0;
  private c = new THREE.Color();

  constructor(
    private readonly lv: Level,
    private readonly fx: Fx,
    private readonly host: TraitHost,
  ) {
    this.marks = lv.players.map(() => {
      const m = { rim: mesh(RIM, 42), clock: mesh(arcGeo(), 43), fill: mesh(DISC, 41), sonar: mesh(RIM, 42), ping: 0, arc: 0 };
      this.group.add(m.fill, m.rim, m.clock, m.sonar);
      return m;
    });
  }

  update(dt: number) {
    this.time += dt;
    const lv = this.lv;
    const coop = lv.players.length > 1 && lv.state !== 'clear' && lv.state !== 'failed';
    lv.players.forEach((p, i) => {
      const m = this.marks[i];
      const on = coop && p.down && !p.out;
      m.rim.visible = m.clock.visible = m.fill.visible = m.sonar.visible = on;
      if (!on) {
        audio.loop('jumpstart', `p${i}`, false);
        m.ping = 0;
        return;
      }
      const helper = jumpHelper(lv.players, p);
      const k = Math.min(1, p.jump / JUMP_TIME);
      const left = JUMP_WAIT - p.downT;
      const urgent = left < 5;
      // (drawn where the flight plane is under the tilted eye, so the reach is where it looks)
      const z = fromFlight(p.z, Y);
      // the rim: the reach, faint, and over it the time left draining round from the top; red and
      // breathing while it waits (faster, and flicking white, near the end), green and steady with
      // a partner inside it
      const beat = Math.sin(this.time * (urgent ? 16 : 6));
      const col = helper ? this.c.copy(GREEN).lerp(WHITE, k * 0.5) : urgent && beat > 0.6 ? WHITE : RED;
      const r = JUMP_REACH * (helper ? 1 + k * 0.06 : 1 + beat * 0.03);
      m.rim.position.set(p.x, Y - 0.005, z);
      m.rim.scale.setScalar(r);
      const rm = m.rim.material as THREE.MeshBasicMaterial;
      rm.color.copy(col);
      rm.opacity = helper ? 0.5 : 0.22;
      m.clock.position.set(p.x, Y, z);
      m.clock.scale.setScalar(r);
      m.clock.geometry.setDrawRange(0, 6 * Math.ceil(ARC_SEGS * Math.max(0, left / JUMP_WAIT)));
      const cm = m.clock.material as THREE.MeshBasicMaterial;
      cm.color.copy(col);
      cm.opacity = helper ? 0.85 + k * 0.15 : 0.7 + beat * 0.2;
      // the fill: how far the jumpstart's got, a green disc growing out to the rim
      m.fill.position.set(p.x, Y - 0.01, z);
      m.fill.scale.setScalar(JUMP_REACH * Math.max(0.02, k));
      const fm = m.fill.material as THREE.MeshBasicMaterial;
      fm.color.copy(GREEN);
      fm.opacity = k > 0 ? 0.18 + k * 0.22 : 0;
      // the sonar: a ring running out to the rim while nobody's there
      const sp = (this.time * (urgent ? 1.6 : 0.8)) % 1;
      m.sonar.visible = !helper;
      m.sonar.position.set(p.x, Y, z);
      m.sonar.scale.setScalar(JUMP_REACH * (0.25 + sp * 0.75));
      const sm = m.sonar.material as THREE.MeshBasicMaterial;
      sm.color.copy(RED);
      sm.opacity = 0.55 * (1 - sp);
      // charging: current snapping across between the two ships, sparks off both, the hum
      audio.loop('jumpstart', `p${i}`, !!helper, k);
      if (helper) {
        if ((m.arc -= dt) <= 0) {
          m.arc = 0.07 - k * 0.035;
          this.host.bolt([helper.x, helper.z, p.x, p.z], Math.random() < 0.25 + k * 0.4 ? 0xffffff : 0x8affb0);
          this.fx.sparks(p.x, FLIGHT_Y + 0.5, p.z, 2 + Math.round(k * 3), 0x8affb0, 8 + k * 8, 0.25, 0.18);
          this.fx.sparks(helper.x, FLIGHT_Y + 0.5, helper.z, 1, 0xd0ffe0, 6, 0.2, 0.15);
        }
        m.ping = 0;
        return;
      }
      // alone: it calls, once a second and quicker as its time goes, higher at the last
      if ((m.ping -= dt) <= 0) {
        m.ping = left > 10 ? 1 : left > 5 ? 0.5 : 0.25;
        audio.play('down_ping', { pan: p.x / HALF_W, pitch: left > 5 ? 1 : 1.19, vol: left > 10 ? 0.5 : 0.75 });
      }
    });
  }

  dispose() {
    for (let i = 0; i < this.marks.length; i++) audio.loop('jumpstart', `p${i}`, false);
    for (const m of this.marks) {
      m.clock.geometry.dispose();
      for (const o of [m.rim, m.clock, m.fill, m.sonar]) (o.material as THREE.Material).dispose();
    }
  }
}
