import type { Bullet } from './level';

/** Only small, discrete shots meet the guard. Heavy, explosive and persistent attacks bypass it. */
export function canParryProjectile(b: Pick<Bullet, 'kind' | 'r' | 'split' | 'hp' | 'dead'>): boolean {
  return !b.dead && (b.kind === 'orb' || b.kind === 'needle' || b.kind === 'spore')
    && b.r > 0 && b.r <= 0.6 && b.split === 0 && b.hp === 0;
}
