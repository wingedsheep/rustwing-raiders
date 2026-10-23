/**
 * Each biome's layout on the level generator (see sim/layout.ts), by biome id. The rest are still
 * scattered. (saltpans.ts is a rough sketch of the Salt Pans' layout, kept to show the toolkit fits
 * open flats: it goes live with the open flats' push, docs/readability.md.)
 */

import type { Layout } from '../layout';
import { mesarun } from './mesarun';

export const LAYOUTS: Record<string, Layout> = { mesarun };
