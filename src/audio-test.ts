/** Audition page for src/audio.ts (served by Vite at /audio-test.html). */
import { audio, type Loop, type Sfx, type Track } from './audio';

const SFX: Sfx[] = [
  'shot_rivet', 'shot_scatter', 'shot_rail', 'shot_arc', 'shot_missile', 'shot_flak', 'shot_mine', 'flak_burst',
  'hit', 'hit_armor', 'shot_land', 'reflect', 'skid', 'truck_rev', 'enemy_shot', 'explode_small', 'explode_big', 'explode_boss',
  'player_hit', 'player_down', 'shield_break', 'shield_up', 'dash', 'graze', 'overheat',
  'pickup_scrap', 'pickup_part', 'heal',
  'special_bomb', 'special_phase', 'special_emp', 'special_overdrive', 'special_ready',
  'laser_charge', 'laser_fire', 'lightning', 'geyser', 'crash', 'warp', 'boss_warning', 'level_clear',
  'ui_move', 'ui_select', 'ui_back', 'ui_error', 'ui_place', 'ui_buy',
  // boarding
  'foot_shot', 'foot_blast', 'foot_shell', 'foot_dry', 'step', 'slide', 'takedown', 'punch', 'body_fall', 'swing',
  'foot_hurt', 'crew_hit', 'plate_hit', 'plate_break', 'aim_tell', 'crew_shot', 'ricochet', 'door', 'alarm', 'lockdown',
  'breach', 'kelter_clamp', 'hook_fire', 'hook_snap', 'crack_tick', 'crate_open', 'strongbox_open', 'core_pull', 'airlock',
  'clock_tick', 'turret_up', 'charge', 'slam', 'canister', 'pickup_tin', 'heal_foot', 'alert', 'revive',
  // bosses
  'horn', 'shriek', 'wingbeat', 'toll', 'ice_crack', 'frost_breath', 'engine_wake',
  'istra_call', 'crew_ho', 'cannon', 'whale_dive', 'whale_breach', 'tide_turn', 'whale_breath',
  'notice', 'printer', 'claw', 'winch', 'plate_on', 'plate_tear', 'clang',
];
const TRACKS: Track[] = ['title', 'map', 'hangar', 'boss', 'boss_orutal', 'boss_glacis', 'boss_vesh', 'boss_cinder', 'orutal', 'halcyon', 'kessra', 'mirefall', 'glacis', 'ashgrave', 'vesh', 'cinder', 'board'];
const LOOPS: Loop[] = ['beam', 'flame', 'engine', 'wind', 'truck'];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const num = (id: string) => Number($<HTMLInputElement>(id).value);

function button(parent: HTMLElement, text: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', () => onClick(b));
  parent.appendChild(b);
  return b;
}

const unlock = () => {
  audio.unlock();
  $('status').textContent = audio.muted ? '(muted)' : '';
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

const play = (name: Sfx, extra: { pan?: number; pitch?: number; vol?: number } = {}) =>
  audio.play(name, { pan: num('pan'), pitch: num('pitch'), dist: num('dist'), ...extra });

for (const s of SFX) button($('sfx'), s, () => play(s));

const trackButtons: HTMLButtonElement[] = [];
for (const t of TRACKS) {
  trackButtons.push(
    button($('tracks'), t, (b) => {
      const on = !b.classList.contains('on');
      for (const x of trackButtons) x.classList.remove('on');
      if (on) b.classList.add('on');
      audio.music(on ? t : null);
    }),
  );
}
button($('tracks'), 'stop', () => {
  for (const x of trackButtons) x.classList.remove('on');
  audio.music(null);
});

for (const l of LOOPS) {
  const wrap = document.createElement('span');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '1';
  slider.step = '0.01';
  slider.value = '0.6';
  let on = false;
  const b = button(wrap, l, () => {
    on = !on;
    b.classList.toggle('on', on);
    audio.loop(l, 'p1', on, Number(slider.value));
  });
  slider.addEventListener('input', () => on && audio.loop(l, 'p1', true, Number(slider.value)));
  wrap.appendChild(slider);
  $('loops').appendChild(wrap);
}

const burst = (name: Sfx, perSec: number, seconds: number, extra: () => { pan?: number; pitch?: number } = () => ({})) => {
  let n = Math.round(perSec * seconds);
  const id = window.setInterval(() => {
    play(name, extra());
    if (--n <= 0) window.clearInterval(id);
  }, 1000 / perSec);
};
button($('stress'), 'rivet 20/s x2s', () => burst('shot_rivet', 20, 2));
button($('stress'), 'scrap combo (12)', () => burst('pickup_scrap', 9, 1.35));
button($('stress'), 'hits 30/s', () => burst('hit', 30, 1.5, () => ({ pan: Math.random() * 2 - 1 })));
button($('stress'), 'enemy bullets 25/s', () => burst('enemy_shot', 25, 2, () => ({ pan: Math.random() * 2 - 1 })));
button($('stress'), 'chain explosions', () => burst('explode_small', 12, 1.5, () => ({ pan: Math.random() * 2 - 1 })));
button($('stress'), 'big + duck', () => {
  play('explode_big');
  audio.duck(1);
});
button($('stress'), 'boss intro', () => {
  play('boss_warning');
  audio.duck(2);
});

const inten = $<HTMLInputElement>('inten');
inten.addEventListener('input', () => {
  audio.intensity(Number(inten.value));
  $('intenV').textContent = Number(inten.value).toFixed(2);
});
const vol = () => audio.volume(num('vMaster'), num('vMusic'), num('vSfx'));
for (const id of ['vMaster', 'vMusic', 'vSfx']) $(id).addEventListener('input', vol);
$('mute').addEventListener('click', () => {
  audio.toggleMute();
  $('mute').classList.toggle('on', audio.muted);
  $('status').textContent = audio.muted ? '(muted)' : '';
});
$('mute').classList.toggle('on', audio.muted);
$('duck').addEventListener('click', () => audio.duck(1.5));

// places: the ambience and reverb of every biome and menu
const placeButtons: HTMLButtonElement[] = [];
for (const p of audio.places) {
  placeButtons.push(
    button($('places'), p, (b) => {
      const on = !b.classList.contains('on');
      for (const x of placeButtons) x.classList.remove('on');
      if (on) b.classList.add('on');
      audio.ambience(on ? p : null);
    }),
  );
}

// mix states
const danger = $<HTMLInputElement>('danger');
danger.addEventListener('input', () => audio.danger(Number(danger.value)));
let muffled = false;
$('muffle').addEventListener('click', () => {
  muffled = !muffled;
  audio.muffle(muffled);
  $('muffle').classList.toggle('on', muffled);
});
button($('stress'), 'shell shock (player_down)', () => play('player_down'));

// levels: RMS and peak of the output, in dBFS, over the last second
const db = (x: number) => (x > 1e-6 ? (20 * Math.log10(x)).toFixed(1) : '-inf');
let sumSq = 0;
let n = 0;
let peak = 0;
let since = performance.now();
const meter = () => {
  const a = audio.meter();
  if (a) {
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    for (const x of buf) {
      sumSq += x * x;
      peak = Math.max(peak, Math.abs(x));
    }
    n += buf.length;
    if (performance.now() - since > 1000) {
      $('meter').textContent = `rms ${db(Math.sqrt(sumSq / n))} dBFS  peak ${db(peak)} dBFS`;
      sumSq = 0;
      n = 0;
      peak = 0;
      since = performance.now();
    }
  }
  requestAnimationFrame(meter);
};
requestAnimationFrame(meter);
