/**
 * Each biome's layout on the level generator (see sim/layout.ts), by biome id. The rest are still
 * scattered.
 */

import type { Layout } from '../layout';
import { glowcap } from './glowcap';
import { mesarun } from './mesarun';
import { oasis } from './oasis';
import { saltpans } from './saltpans';

export const LAYOUTS: Record<string, Layout> = { glowcap, mesarun, oasis, saltpans };
