/**
 * What the simulation shares with everything else. The sim is plain TypeScript: no three.js, no
 * DOM. It steps at a fixed 60 Hz and is driven only by Intents, so the game in the browser, the
 * autopilot in Node and a replay all play exactly the same.
 */

export const DT = 1 / 60;

/** You fly at this height. Scenery below it passes under you; anything taller is in the way. */
export const FLIGHT_Y = 10;
/** The camera leans back this far from straight down. */
export const TILT = (30 * Math.PI) / 180;
/** Half the playfield on the flight plane: across (widescreen), and along (screen up/down). */
export const HALF_W = 36;
export const HALF_H = 26;
/** How far across a ship can fly: out to a 16:9 screen's sides, past the field into the land round it. */
export const REACH_W = 42.5;

/** Where a thing at height `h` above (x, z) shows on the flight plane (the screen). */
export const toFlight = (z: number, h: number) => z + (FLIGHT_Y - h) * Math.tan(TILT);
/** And back: the ground z under a flight-plane spot, for a thing at height `h`. */
export const fromFlight = (zf: number, h: number) => zf - (FLIGHT_Y - h) * Math.tan(TILT);

/** What a player asks of their ship this frame. Exactly what a pad or keys can say. */
export interface Intent {
  /** -1..1 each: x to the right, y up the screen. */
  x: number;
  y: number;
  fire: boolean;
  /** Pressed this frame: one round from every heavy gun (see GunSpec.heavy). */
  heavy: boolean;
  /** Held, 0..1 (analog on a trigger): burn the Burn meter to push the whole level faster. */
  boost: number;
  /** Pressed this frame. */
  dash: boolean;
  special: boolean;
  /** Pressed this frame: the aux part (parry, tether, flare, siphon). */
  aux: boolean;
  /** Held: slow, precise movement, hitbox shown, and the guns pulled in to fire straight ahead. */
  focus: boolean;
}

export const NEUTRAL: Intent = { x: 0, y: 0, fire: false, heavy: false, boost: 0, dash: false, special: false, aux: false, focus: false };

export interface V2 {
  x: number;
  z: number;
}
