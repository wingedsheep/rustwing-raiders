/**
 * Who remembers you, from run to run: how often you've met each of the cast, and the last few
 * things you did to them ("stiffed", "towed", "sold"). Squit charges double once you've stiffed
 * him; the head of the Vhossk Twins you didn't deal with sulks next time. Kept in the browser
 * (and nowhere at all outside one, for the autopilot).
 */

const KEY = 'rustwing.met';

interface Memory {
  times: number;
  deeds: string[];
}

let mem: Record<string, Memory> | null = null;

function load(): Record<string, Memory> {
  if (mem) return mem;
  try {
    mem = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') as Record<string, Memory>;
  } catch {
    mem = {};
  }
  return mem;
}

function save() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(mem ?? {}));
  } catch {
    // no storage: they forget, that's all
  }
}

const of = (who: string) => (load()[who] ??= { times: 0, deeds: [] });

/** Times you've met them before (this run's meetings included). */
export const timesMet = (who: string) => load()[who]?.times ?? 0;

export function meet(who: string) {
  of(who).times++;
  save();
}

/** Something you did to them, remembered. */
export function remember(who: string, deed: string) {
  const m = of(who);
  m.deeds = [...m.deeds.filter((d) => d !== deed), deed].slice(-6);
  save();
}

/** Whether you've ever done this to them. */
export const everDid = (who: string, deed: string) => load()[who]?.deeds.includes(deed) ?? false;

/** The last thing you did to them, of these. */
export function lastOf(who: string, deeds: string[]): string | null {
  const ds = load()[who]?.deeds ?? [];
  for (let k = ds.length - 1; k >= 0; k--) if (deeds.includes(ds[k])) return ds[k];
  return null;
}
