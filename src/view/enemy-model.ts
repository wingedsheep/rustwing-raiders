import type { EnemySkin } from '../world/planets';
import { library, type Instance } from '../render/assets';

/** A name as a model slug: "Armoured Thunderhide" → armoured_thunderhide. */
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/**
 * A copy of the model an enemy wears: its very own (`enemy_<its name>`, a serpent's with `_head`,
 * `_body` or `_tail`), else the archetype's (`enemy_<model>_<mech|beast>`), else the archetype's
 * machine. Painted in the skin's colours, with materials of its own (so it can flash).
 */
export function cloneEnemy(skin: EnemySkin, model: string, seg?: 'head' | 'body' | 'tail'): Instance | null {
  const own = `enemy_${slug(skin.name)}${seg ? `_${seg}` : ''}`;
  const arch = seg ? `enemy_${model}_${seg}` : `enemy_${model}`;
  for (const kind of [own, `${arch}_${skin.kind}`, `${arch}_mech`]) if (library.has(kind)) return library.clone(kind, 0, skin.colors, true);
  return null;
}
