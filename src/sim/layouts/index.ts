/** Each biome's layout on the level generator (see sim/layout.ts), by biome id. The rest are still scattered. */

import type { Layout } from '../layout';
import { mesarun } from './mesarun';

export const LAYOUTS: Record<string, Layout> = { mesarun };
